import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEmailVerification, readyForVerification, readEmailPayload, apiResponse } from './verification.mjs';
import { renderVerificationEmail } from './email-template.mjs';
import { createVerificationMemoryStore } from './render-memory-store.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const routes = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/gallery', 'gallery/index.html'], ['/gallery/', 'gallery/index.html'],
  ['/gallery/index.html', 'gallery/index.html'],
  ['/activity', 'activity/index.html'], ['/activity/', 'activity/index.html'],
  ['/activity/index.html', 'activity/index.html'],
  ['/signin', 'signin/index.html'], ['/signin/', 'signin/index.html'],
  ['/signin/index.html', 'signin/index.html'],
  ['/gallery-data.json', 'gallery-data.json'],
  ['/activity-data.json', 'activity-data.json'],
  ['/gallery.js', 'gallery.js'], ['/activity.js', 'activity.js'],
  ['/signin.js', 'signin.js'], ['/email-verification.js', 'email-verification.js'],
  ['/styles.css', 'styles.css'], ['/auth.css', 'auth.css'],
  ['/steel-brothers-logo.avif', 'steel-brothers-logo.avif'],
  ['/favicon.png', 'favicon.png']
]);
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.gif', 'image/gif']
]);

function makeRateLimiter(now = Date.now) {
  const records = new Map();
  return (key, limit, intervalMs) => {
    const stamp = now();
    const entry = records.get(key);
    if (records.size > 5000) {
      for (const [id, previous] of records) {
        if (stamp >= previous.reset) records.delete(id);
      }
      if (records.size > 5000) records.delete(records.keys().next().value);
    }
    if (!entry || stamp >= entry.reset) {
      records.set(key, { n:1, reset:stamp + intervalMs });
      return false;
    }
    entry.n += 1;
    return entry.n > limit;
  };
}

async function toWebRequest(req, url) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 2048) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new Request(url, {
    method:req.method,
    headers:req.headers,
    body:Buffer.concat(chunks)
  });
}

async function sendHttpResponse(res, webResponse) {
  res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  res.end(Buffer.from(await webResponse.arrayBuffer()));
}

export function createSteelBrothersServer({
  env = process.env,
  fetchEmail = fetch,
  store = createVerificationMemoryStore(),
  staticRoot = dist,
  now = Date.now,
  log = console
} = {}) {
  const siteRoot = resolve(staticRoot);
  const isRender = env.RENDER === 'true' && env.IS_PULL_REQUEST !== 'true';
  const allowedOrigins = ['https://steelbrothers.cz', 'https://www.steelbrothers.cz'];
  if (isRender && typeof env.RENDER_EXTERNAL_URL === 'string' &&
      /^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(env.RENDER_EXTERNAL_URL)) {
    allowedOrigins.push(env.RENDER_EXTERNAL_URL);
  }
  const ready = () => isRender &&
    readyForVerification({ ...env, CONTEXT:'production' });
  const rateLimit = makeRateLimiter(now);
  const sendEmail = async ({ email, code, id }) => {
    const rendered = renderVerificationEmail(code);
    const response = await fetchEmail('https://api.resend.com/emails', {
      method:'POST',
      headers: {
        Authorization:'Bearer ' + env.RESEND_API_KEY,
        'Content-Type':'application/json',
        'Idempotency-Key':'steelbrothers-otp-' + id
      },
      body:JSON.stringify({
        from:'Steel Brothers <verification@steelbrothers.cz>',
        to:[email],
        subject:'Steel Brothers — Ověřovací kód',
        html:rendered.html,
        text:rendered.text
      }),
      signal:AbortSignal.timeout(12_000)
    });
    if (!response.ok) {
      log.error('Verification provider rejected request', response.status);
      throw new Error('Email provider declined request');
    }
  };

  const codeService = ready()
    ? makeEmailVerification({
        store, secret:env.STEELBROTHERS_VERIFICATION_SECRET, sendEmail, now
      })
    : null;

  return createServer(async (req, res) => {
    res.setHeader('X-Robots-Tag','noindex, nofollow, noimageindex');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      res.writeHead(400);res.end('Invalid URL');return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'});
      res.end('ok');return;
    }

    if (url.pathname === '/api/email/send' || url.pathname === '/api/email/verify') {
      const isSend = url.pathname === '/api/email/send';
      if (isSend && req.method === 'GET') {
        await sendHttpResponse(res, apiResponse(200, { available:!!codeService, accountCreation:false }));
        return;
      }
      if (req.method !== 'POST') {
        await sendHttpResponse(res, apiResponse(405, { error:'Method not allowed' }));
        return;
      }
      if (!codeService) {
        await sendHttpResponse(res, apiResponse(503, { error:'Ověřování e-mailů není nakonfigurováno.' }));
        return;
      }
      // Render supplies x-forwarded-for. Use first IP only as a coarse abuse-control,
      // without placing PII into log files.
      const address = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
        .toString().split(',')[0].trim().slice(0,70);
      const limit = isSend ? 6 : 20;
      if (rateLimit((isSend?'send:':'verify:') + address, limit, 60_000)) {
        await sendHttpResponse(res, apiResponse(429, { error:'Příliš mnoho požadavků. Zkus to později.' }));
        return;
      }
      try {
        const request = await toWebRequest(req, 'https://steelbrothers.cz' + url.pathname);
        const { data, error } = await readEmailPayload(request, isSend ? ['email'] : ['email','code'], allowedOrigins);
        if (error) { await sendHttpResponse(res,error);return; }
        const result = isSend
          ? await codeService.send(data.email)
          : await codeService.verify(data.email,data.code);
        await sendHttpResponse(res, apiResponse(result.status, result.status === 200
          ? { message:result.message, ...(result.verified ? { verified:true } : {}) }
          : { error:result.message }));
      } catch (err) {
        log.error('Email verification endpoint error:', err?.name || 'unknown');
        await sendHttpResponse(res, apiResponse(err?.status === 413 ? 413 : 503, {
          error:err?.status === 413 ? 'Request too large' : 'Ověřování je dočasně nedostupné.'
        }));
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);res.end('Method not allowed');return;
    }
    let pathname;
    try {pathname = decodeURIComponent(url.pathname);} catch {
      res.writeHead(400);res.end('Invalid URL');return;
    }
    const file = routes.get(pathname) ||
      (pathname.startsWith('/photos/') && MIME.has(extname(pathname).toLowerCase())
        ? pathname.slice(1) : null);
    if (!file) {res.writeHead(404);res.end('Not found');return;}
    const target = resolve(siteRoot, file);
    const within = relative(siteRoot, target);
    if (!within || within === '..' || within.startsWith('..' + sep) || within.startsWith(sep)) {
      res.writeHead(403);res.end('Forbidden');return;
    }
    try {
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type':MIME.get(extname(target).toLowerCase()) || 'application/octet-stream',
        'Cache-Control':'no-cache'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404);res.end('Not found');
    }
  });
}
