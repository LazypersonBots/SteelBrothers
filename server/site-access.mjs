import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'sb_show_access';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;

const htmlEscape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value) || value.length > 2000 ||
      value.startsWith('/__site-access')) return '/';
  try {
    const parsed = new URL(value, 'https://steelbrothers.cz');
    return parsed.pathname + parsed.search;
  } catch { return '/'; }
}

function page(next, message = '') {
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noimageindex"><title>Steel Brothers | Přístup / Access</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 0%,#352019,#101112 65%);color:#f7f3ee}
main{width:min(100%,420px);padding:clamp(24px,5vw,40px);border:1px solid #534038;border-radius:16px;background:#1a1919;box-shadow:0 20px 75px #0008}
.brand{color:#fb7645;font-size:.82rem;font-weight:800;letter-spacing:.24em}h1{margin:15px 0 10px;font-size:clamp(1.5rem,5vw,2rem);line-height:1.12}p{color:#c5bbb6;line-height:1.5;margin:0 0 23px}
label{display:block;font-weight:700;font-size:.92rem;margin-bottom:9px}input{display:block;width:100%;padding:13px 14px;background:#101112;border:1px solid #756057;border-radius:9px;font:inherit;color:#fff;outline-offset:3px}
input:focus{outline:2px solid #fb7645}button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:9px;background:#f47441;color:#21110b;font:inherit;font-weight:800;cursor:pointer}button:hover{background:#ff9365}
.error{border-left:3px solid #fa775e;padding:10px 12px;margin-bottom:16px;background:#49251f;color:#ffe7df;font-size:.94rem}
small{display:block;margin-top:20px;color:#a69b94;text-align:center}
</style></head><body><main><div class="brand">STEEL BROTHERS</div>
<h1>Soukromý přístup<br>Private access</h1>
<p>Pro zobrazení webu zadej přístupový kód.<br>Enter the access code to view this website.</p>
${message ? `<div class="error" role="alert">${htmlEscape(message)}</div>` : ''}
<form action="/__site-access" method="post"><input type="hidden" name="next" value="${htmlEscape(next)}">
<label for="password">Přístupový kód / Access code</label><input id="password" name="password" type="password" maxlength="256" autocomplete="off" required autofocus>
<button type="submit">Odemknout / Unlock</button></form><small>Přístup pouze s kódem · Code required</small>
</main></body></html>`;
}

export function createSiteAccess({ password, now = Date.now, rateLimit, allowedOrigins = [], signingSecret = '' } = {}) {
  const configured = typeof password === 'string' && password.trim().length > 0;
  const digest = configured ? createHash('sha256').update(password).digest() : null;
  // Bind sessions to SHOW_PASSWORD so changing the code revokes existing access.
  const key = configured ? createHash('sha256').update('steel-brothers-site-access-v1\0')
    .update(password).update('\0').update(signingSecret).digest() : null;
  const mac = value => createHmac('sha256', key).update(value).digest('hex');
  const write = (res, status, body, type = 'text/html; charset=utf-8', headers = {}, head = false) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'private, no-store',
      'X-Frame-Options': 'DENY',
      ...headers
    });
    res.end(head ? undefined : body);
  };
  const redirect = (res, target, headers = {}) => write(res, 303, '', 'text/plain; charset=utf-8', {
    Location: target,
    ...headers
  });
  const cookie = req => {
    const match = /(?:^|;\s*)sb_show_access=([A-Za-z0-9._-]+)(?:;|$)/.exec(req.headers.cookie || '');
    return match?.[1] || '';
  };
  const authorized = req => {
    if (!configured) return false;
    const match = /^(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(cookie(req));
    if (!match) return false;
    const expires = Number(match[1]);
    if (!Number.isSafeInteger(expires) || expires <= now() || expires > now() + SESSION_MS) return false;
    const payload = `${match[1]}.${match[2]}`;
    return timingSafeEqual(Buffer.from(match[3], 'hex'), Buffer.from(mac(payload), 'hex'));
  };
  const issueCookie = () => {
    const value = `${now() + SESSION_MS}.${randomBytes(16).toString('hex')}`;
    return `${COOKIE}=${value}.${mac(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
  };
  const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

  async function intercept(req, res, url) {
    // /health is handled by the Render server before calling this function.
    const pathname = url.pathname;
    const next = safeNext(url.searchParams.get('next') || '/');
    if (!configured) {
      write(res, 503, 'Site access is not configured. Set SHOW_PASSWORD on Render.', 'text/plain; charset=utf-8');
      return true;
    }
    if (pathname === '/__site-access/logout') {
      if (req.method !== 'POST') {
        write(res, 405, 'Method not allowed', 'text/plain; charset=utf-8', {Allow:'POST'});
      } else {
        redirect(res, '/__site-access', {'Set-Cookie':clearCookie});
      }
      return true;
    }
    if (pathname === '/__site-access') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (authorized(req)) redirect(res, next);
        else write(res, 200, page(next), 'text/html; charset=utf-8', {}, req.method === 'HEAD');
        return true;
      }
      if (req.method !== 'POST') {
        write(res, 405, 'Method not allowed', 'text/plain; charset=utf-8', {Allow:'GET, HEAD, POST'});
        return true;
      }
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        write(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
        return true;
      }
      if (!/^application\/x-www-form-urlencoded(?:\s*;|\s*$)/i.test(req.headers['content-type'] || '')) {
        write(res, 415, 'Unsupported media type', 'text/plain; charset=utf-8');
        return true;
      }
      let form;
      try {
        const parts = [];
        let length = 0;
        for await (const part of req) {
          length += part.length;
          if (length > MAX_BODY_BYTES) throw new Error('Too large');
          parts.push(part);
        }
        form = new URLSearchParams(Buffer.concat(parts).toString('utf8'));
      } catch {
        write(res, 413, 'Request too large', 'text/plain; charset=utf-8');
        return true;
      }
      const returnTo = safeNext(form.get('next') || '/');
      const submitted = form.get('password') || '';
      const correct = submitted.length <= 256 && timingSafeEqual(
        createHash('sha256').update(submitted).digest(), digest
      );
      const address = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
        .toString().split(',')[0].trim().slice(0, 70);
      // Limit attempts before granting access, including attempts with a valid code.
      if (rateLimit?.('show-password:' + address, 8, 15 * 60_000)) {
        write(res, 429, page(returnTo, 'Příliš mnoho pokusů. Zkus to za 15 minut. / Too many attempts.'), 'text/html; charset=utf-8', {'Retry-After':'900'});
      } else if (!correct) {
        write(res, 403, page(returnTo, 'Nesprávný kód. / Incorrect code.'));
      } else {
        redirect(res, returnTo, {'Set-Cookie':issueCookie()});
      }
      return true;
    }
    if (authorized(req)) {
      // Prevent shared or browser caches from retaining protected resources.
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Cookie');
      return false;
    }
    if (pathname.startsWith('/api/')) {
      write(res, 401, JSON.stringify({error:'Access code required'}), 'application/json; charset=utf-8');
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      redirect(res, '/__site-access?next=' + encodeURIComponent(safeNext(url.pathname + url.search)));
    } else {
      write(res, 401, 'Access code required', 'text/plain; charset=utf-8');
    }
    return true;
  }
  return { intercept, authorized, configured };
}
