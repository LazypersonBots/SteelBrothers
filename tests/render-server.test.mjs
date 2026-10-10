import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSteelBrothersServer } from '../server/render-app.mjs';
import { createVerificationMemoryStore } from '../server/render-memory-store.mjs';

const SECRET = 'the-steel-brothers-test-verification-secret-key-12345';
const env = {
  RENDER:'true',
  IS_PULL_REQUEST:'false',
  RENDER_EXTERNAL_URL:'https://steelbrothers.onrender.com',
  RESEND_API_KEY:'re_TEST_KEY_NOT_FOR_PRODUCTION',
  STEELBROTHERS_VERIFICATION_SECRET:SECRET
};
const ORIGIN = 'https://steelbrothers.onrender.com';

async function withServer(options, fn) {
  const server = createSteelBrothersServer(options);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    return await fn(url);
  } finally {
    await new Promise((resolve,reject) => server.close(error=>error?reject(error):resolve()));
  }
}

async function post(url, path, body, origin=ORIGIN) {
  return fetch(url+path,{
    method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
}

test('Render page, favicon and gallery assets serve from built static directory',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'sb-render-'));
  try {
    await mkdir(join(folder,'gallery'));
    await mkdir(join(folder,'photos'));
    await writeFile(join(folder,'index.html'),'<h1>Steel Brothers</h1>');
    await writeFile(join(folder,'gallery','index.html'),'REAL PHOTOS');
    await writeFile(join(folder,'favicon.png'),'PNG');
    await writeFile(join(folder,'photos','sample.webp'),'WEBP');
    await withServer({env:{},staticRoot:folder},async url=>{
      assert.equal((await fetch(url+'/')).status,200);
      assert.match(await (await fetch(url+'/')).text(),/Steel Brothers/);
      assert.equal((await fetch(url+'/gallery/')).status,200);
      assert.equal((await fetch(url+'/gallery')).status,200);
      assert.equal((await fetch(url+'/favicon.png')).headers.get('content-type'),'image/png');
      assert.equal((await fetch(url+'/photos/sample.webp')).status,200);
      assert.equal((await fetch(url+'/health')).status,200);
      assert.equal((await fetch(url+'/missing-file')).status,404);
      assert.equal((await fetch(url+'/api/email/send')).status,200);
      assert.equal((await fetch(url+'/api/email/send')).json instanceof Function,true);
      assert.equal((await (await fetch(url+'/api/email/send')).json()).available,false);
      assert.equal((await fetch(url+'/%2e%2e/server/verification.mjs')).status,404);
    });
  } finally {
    await rm(folder,{recursive:true,force:true});
  }
});

test('Render sends and verifies real email codes with the existing branded HTML',async()=>{
  const outgoing=[];
  const fetchEmail=async(_endpoint,opts)=>{
    outgoing.push(JSON.parse(opts.body));
    assert.match(opts.headers.Authorization,/^Bearer re_TEST/);
    return {ok:true};
  };
  await withServer({env,fetchEmail},async url=>{
    const available=await (await fetch(url+'/api/email/send')).json();
    assert.equal(available.available,true);
    assert.equal(available.accountCreation,false);
    const sent=await post(url,'/api/email/send',{email:'rider@example.com'});
    assert.equal(sent.status,200);
    assert.equal(outgoing.length,1);
    assert.equal(outgoing[0].from,'Steel Brothers <verification@steelbrothers.cz>');
    assert.match(outgoing[0].html,/PLATNOST: 10 MINUT/);
    const match=/Tvůj ověřovací kód: (\d{6})/.exec(outgoing[0].text);
    assert.ok(match);
    const code=match[1];
    assert.equal((await post(url,'/api/email/verify',{email:'rider@example.com',code:'000000'})).status,400);
    const verified=await post(url,'/api/email/verify',{email:'rider@example.com',code});
    assert.equal(verified.status,200);
    assert.equal((await verified.json()).verified,true);
    assert.equal((await post(url,'/api/email/verify',{email:'rider@example.com',code})).status,400);
    assert.equal((await post(url,'/api/email/send',{email:'rider@example.com'})).status,429);
    assert.equal(outgoing.length,1);
  });
});

test('Render rejects foreign origins and never sends if secrets are absent',async()=>{
  const sent=[];
  await withServer({env,fetchEmail:async()=>{sent.push(1);return {ok:true};}},async url=>{
    const foreign=await post(url,'/api/email/send',{email:'rider@example.com'},'https://evil.example');
    assert.equal(foreign.status,403);
    const allowed=await post(url,'/api/email/send',{email:'rider@example.com'},'https://steelbrothers.cz');
    assert.equal(allowed.status,200);
    assert.equal(sent.length,1);
  });
  await withServer({env:{...env,IS_PULL_REQUEST:'true'},fetchEmail:async()=>{throw Error('Should not send');}},async url=>{
    assert.equal((await (await fetch(url+'/api/email/send')).json()).available,false);
    assert.equal((await post(url,'/api/email/send',{email:'rider@example.com'})).status,503);
  });
  await withServer({env:{...env,RESEND_API_KEY:''}},async url=>{
    assert.equal((await (await fetch(url+'/api/email/send')).json()).available,false);
    assert.equal((await post(url,'/api/email/send',{email:'rider@example.com'})).status,503);
  });
});

test('in-memory store provides atomic ETag checks and bounded entries',async()=>{
  const store=createVerificationMemoryStore({maxEntries:2});
  const a=await store.setJSON('a',{expiresAt:1}, {onlyIfNew:true});
  assert.equal(a.modified,true);
  assert.equal((await store.setJSON('a',{expiresAt:2},{onlyIfNew:true})).modified,false);
  assert.equal((await store.setJSON('a',{expiresAt:2},{onlyIfMatch:'bad'})).modified,false);
  assert.equal((await store.setJSON('a',{expiresAt:2},{onlyIfMatch:a.etag})).modified,true);
  assert.equal((await store.getWithMetadata('a')).data.expiresAt,2);
  await store.setJSON('b',{expiresAt:Date.now()+100_000},{onlyIfNew:true});
  await store.setJSON('c',{expiresAt:Date.now()+100_000},{onlyIfNew:true});
  assert.equal((await store.getWithMetadata('c')).data.expiresAt>Date.now(),true);
});
