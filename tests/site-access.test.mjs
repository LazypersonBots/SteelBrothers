import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createSiteAccess } from '../server/site-access.mjs';

const ACCESS_CODE = 'long-private-website-code-for-tests';

async function withGate(options, fn) {
  const records = new Map();
  const rateLimit = (key, limit, interval) => {
    const item = records.get(key);
    const current = options.now?.() || Date.now();
    if (!item || current >= item.until) { records.set(key, {count:1, until:current+interval}); return false; }
    return ++item.count > limit;
  };
  const gate = createSiteAccess({rateLimit, ...options});
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
    if (await gate.intercept(req, res, url)) return;
    res.writeHead(200, {'Content-Type':'text/plain'});
    res.end('PRIVATE '+url.pathname);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await fn(base); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function unlock(base, code = ACCESS_CODE, next='/', opts={}) {
  return fetch(base+'/__site-access', {
    method:'POST', redirect:'manual',
    headers:{'Content-Type':'application/x-www-form-urlencoded', ...(opts.headers || {})},
    body:new URLSearchParams({password:code,next})
  });
}

const noRedirect = {redirect:'manual'};

test('all pages, photographs, assets and API requests require a code', async () => {
  await withGate({password:ACCESS_CODE}, async base => {
    for (const pathname of ['/', '/history/', '/gallery/?photo=2', '/signin/', '/photos/a.webp', '/favicon.png','/styles.css','/notfound']) {
      const response = await fetch(base+pathname,noRedirect);
      assert.equal(response.status,303, pathname);
      assert.match(response.headers.get('location'),/^\/__site-access\?next=/);
      assert.equal(response.headers.get('cache-control'),'private, no-store');
    }
    assert.equal((await fetch(base+'/api/account/me')).status,401);
    assert.equal((await fetch(base+'/api/announcements', {method:'POST'})).status,401);
    assert.equal((await fetch(base+'/health')).status,200);
    const page = await fetch(base+'/__site-access');
    assert.equal(page.status,200);
    assert.match(await page.text(),/Přístupový kód \/ Access code/);
  });
});

test('valid code unlocks the intended URL using a secure, HttpOnly, expiring session cookie', async () => {
  await withGate({password:ACCESS_CODE}, async base => {
    const bad = await unlock(base, 'incorrect');
    assert.equal(bad.status,403);
    assert.equal(bad.headers.has('set-cookie'),false);
    const result = await unlock(base,ACCESS_CODE,'/gallery/?photo=1');
    assert.equal(result.status,303);
    assert.equal(result.headers.get('location'),'/gallery/?photo=1');
    assert.match(result.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax; Max-Age=43200/);
    const cookie = result.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await fetch(base+'/gallery/',{headers:{Cookie:cookie}})).text()),'PRIVATE /gallery/');
    assert.equal((await (await fetch(base+'/api/account/me',{headers:{Cookie:cookie}})).text()),'PRIVATE /api/account/me');
    assert.equal((await fetch(base+'/',{headers:{Cookie:cookie}})).headers.get('vary'),'Cookie');
    const tampered = cookie.replace(/.$/,'z');
    assert.equal((await fetch(base+'/',{headers:{Cookie:tampered},...noRedirect})).status,303);
    const logout = await fetch(base+'/__site-access/logout',{method:'POST',redirect:'manual',headers:{Cookie:cookie}});
    assert.equal(logout.status,303);
    assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  });
});

test('missing code fails closed, changed code and expiration revoke previous cookies', async () => {
  await withGate({password:undefined}, async base => {
    assert.equal((await fetch(base+'/')).status,503);
    assert.equal((await fetch(base+'/__site-access')).status,503);
    assert.equal((await fetch(base+'/health')).status,200);
  });
  let time=1700000000000;
  let issued;
  await withGate({password:ACCESS_CODE, now:()=>time}, async base => {
    issued = (await unlock(base)).headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base+'/',{headers:{Cookie:issued},...noRedirect})).status,200);
    time += 12*60*60*1000+1;
    assert.equal((await fetch(base+'/',{headers:{Cookie:issued},...noRedirect})).status,303);
  });
  await withGate({password:'changed-code'}, async base => {
    assert.equal((await fetch(base+'/',{headers:{Cookie:issued},...noRedirect})).status,303);
  });
});

test('prevents open redirects, reflected HTML, cross-origin submissions and brute force', async () => {
  await withGate({password:ACCESS_CODE,allowedOrigins:['https://steelbrothers.cz']}, async base => {
    assert.equal((await unlock(base,ACCESS_CODE,'//attacker.example')).headers.get('location'),'/');
    assert.equal((await unlock(base,ACCESS_CODE,'/\\attacker.example')).headers.get('location'),'/');
    const page = await (await fetch(base+'/__site-access?next=%22%3E%3Cscript%3E')).text();
    assert.doesNotMatch(page,/<script>/);
    assert.equal((await unlock(base,ACCESS_CODE,'/',{headers:{Origin:'https://attacker.example'}})).status,403);
    for(let i=0;i<6;i++) await unlock(base,'bad');
    const limited=await unlock(base,'bad');
    assert.equal(limited.status,429);
    assert.equal(limited.headers.get('retry-after'),'900');
  });
});

test('unlocks directly from HTTPS custom domains even if a proxy rewrites Host or Origin', async () => {
  await withGate({password:ACCESS_CODE, allowedOrigins:['https://steelbrothers.cz']}, async base => {
    const submit = (host, origin, fetchSite) => new Promise((resolve, reject) => {
      const destination = new URL(base);
      const form = new URLSearchParams({password:ACCESS_CODE, next:'/gallery/' }).toString();
      const headers = {
        Host:host, Origin:origin,
        'Content-Type':'application/x-www-form-urlencoded',
        ...(fetchSite ? {'Sec-Fetch-Site':fetchSite} : {})
      };
      const req = httpRequest({
        hostname:destination.hostname, port:destination.port, path:'/__site-access', method:'POST',
        headers
      }, response => {
        response.resume();
        response.on('end', () => resolve({
          status:response.statusCode, location:response.headers.location,
          cookie:response.headers['set-cookie']
        }));
      });
      req.on('error',reject);
      req.end(form);
    });
    const preview='steelbrothers-preview.onrender.com';
    const direct = await submit(preview,'https://'+preview,'same-origin');
    assert.equal(direct.status,303);
    assert.equal(direct.location,'/gallery/');
    assert.ok(direct.cookie?.[0]?.includes('sb_show_access='));

    const proxied = await submit('internal-render.example', 'https://steelbrothers.cz', 'same-origin');
    assert.equal(proxied.status,303);
    assert.equal(proxied.location,'/gallery/');

    const alternate = await submit('unlisted-custom-domain.example','https://unlisted-custom-domain.example');
    assert.equal(alternate.status,303);

    const originNull = await submit('internal-render.example','null','same-origin');
    assert.equal(originNull.status,303);

    const blocked = await submit(preview,'https://attacker.example','cross-site');
    assert.equal(blocked.status,403);
    assert.equal(blocked.cookie,undefined);
  });
});
