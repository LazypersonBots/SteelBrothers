import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
const MIN_SECRET_LENGTH = 32;

export function normalizeEmail(input) {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 ||
      !/^[a-z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) {
    return null;
  }
  return email;
}

export function readyForVerification(env = process.env) {
  return env.CONTEXT === 'production' &&
    typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.startsWith('re_') &&
    typeof env.STEELBROTHERS_VERIFICATION_SECRET === 'string' &&
    env.STEELBROTHERS_VERIFICATION_SECRET.length >= MIN_SECRET_LENGTH;
}

export function makeEmailVerification({ store, secret, sendEmail, now = Date.now, generateCode = () => String(randomInt(1_000_000)).padStart(6, '0'), generateId = randomUUID }) {
  if (!secret || secret.length < MIN_SECRET_LENGTH) throw new Error('Missing strong verification secret');
  const hmac = (message) => createHmac('sha256', secret).update(message).digest('hex');
  const keyFor = email => 'email/' + createHash('sha256').update(hmac('address:' + email)).digest('hex');
  const digest = (email, id, code) => hmac('code:' + email + ':' + id + ':' + code);

  async function send(emailInput) {
    const email = normalizeEmail(emailInput);
    if (!email) return { status: 400, message: 'Zadej platnou e-mailovou adresu.' };
    const key = keyFor(email);
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const stamp = now();
    if (current?.data?.sentAt && stamp - current.data.sentAt < EMAIL_RESEND_COOLDOWN_MS) {
      return { status: 429, message: 'Počkej alespoň 60 sekund před odesláním dalšího kódu.' };
    }
    const code = generateCode();
    if (!/^\d{6}$/.test(code)) throw new Error('Code generator must return six digits');
    const id = generateId();
    const payload = {
      codeHash: digest(email, id, code),
      id, sentAt: stamp, expiresAt: stamp + EMAIL_CODE_TTL_MS,
      attempts: 0, used: false
    };
    const updated = await store.setJSON(key, payload, current?.etag
      ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (!updated?.modified) return { status: 429, message: 'Zkus to znovu za chvíli.' };
    try {
      await sendEmail({ email, code, id });
    } catch (error) {
      // Invalidate a challenge whose email was not accepted; never expose API failures or the code.
      try {
        await store.setJSON(key, { ...payload, used: true, expiresAt: 0 },
          { onlyIfMatch: updated.etag });
      } catch { /* a concurrent replacement has already invalidated this code */ }
      return { status: 502, message: 'Odeslání e-mailu se nepovedlo. Zkus to za chvíli.' };
    }
    return { status: 200, message: 'Ověřovací kód jsme odeslali. Platí 10 minut.' };
  }

  async function verify(emailInput, code) {
    const email = normalizeEmail(emailInput);
    if (!email || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return { status: 400, message: 'Zadej platný e-mail a šestimístný kód.' };
    }
    const key = keyFor(email);
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const data = current?.data;
    if (!data || data.used || !data.expiresAt || data.expiresAt <= now()) {
      return { status: 400, message: 'Kód vypršel nebo není platný. Vyžádej si nový.' };
    }
    if (data.attempts >= MAX_CODE_ATTEMPTS) {
      return { status: 429, message: 'Příliš mnoho pokusů. Vyžádej si nový kód.' };
    }
    const found = Buffer.from(digest(email, data.id, code), 'hex');
    const expected = Buffer.from(data.codeHash, 'hex');
    const matched = found.length === expected.length && timingSafeEqual(found, expected);
    const updated = await store.setJSON(key,
      { ...data, attempts: data.attempts + 1, used: matched },
      { onlyIfMatch: current.etag });
    if (!updated?.modified) {
      return { status: 409, message: 'Požadavek se změnil. Zkus to znovu.' };
    }
    if (!matched) {
      return { status: 400, message: 'Nesprávný kód. Zkontroluj e-mail.' };
    }
    return { status: 200, verified: true, message: 'E-mail byl úspěšně ověřen.' };
  }

  return { send, verify };
}

export function apiResponse(status, data) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

export async function readEmailPayload(request, fields, allowedOrigins = ['https://steelbrothers.cz', 'https://www.steelbrothers.cz'], maxLength = 2048) {
  if (request.method !== 'POST') return { error: apiResponse(405, { error: 'Method not allowed' }) };
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { error: apiResponse(415, { error: 'Expected application/json' }) };
  }
  const origin = request.headers.get('origin');
  if (!allowedOrigins.includes(origin)) {
    return { error: apiResponse(403, { error: 'Origin not allowed' }) };
  }
  try {
    const source = await request.text();
    if (source.length > maxLength) return { error: apiResponse(413, { error: 'Request too large' }) };
    const json = JSON.parse(source);
    if (!json || Array.isArray(json) || typeof json !== 'object' ||
        Object.keys(json).some(k => !fields.includes(k))) {
      return { error: apiResponse(400, { error: 'Invalid input' }) };
    }
    return { data: json };
  } catch {
    return { error: apiResponse(400, { error: 'Invalid JSON' }) };
  }
}
