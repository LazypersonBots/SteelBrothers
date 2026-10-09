import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeEmailVerification, normalizeEmail, readyForVerification, readEmailPayload,
  EMAIL_CODE_TTL_MS, MAX_CODE_ATTEMPTS
} from '../server/verification.mjs';
import { renderVerificationEmail } from '../server/email-template.mjs';

function fakeStore() {
  const values = new Map();
  let version = 0;
  return {
    values,
    async getWithMetadata(key) {
      const entry = values.get(key);
      return entry ? { data: { ...entry.data }, etag: entry.etag } : null;
    },
    async setJSON(key, data, options = {}) {
      const previous = values.get(key);
      if (options.onlyIfNew && previous) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== previous?.etag) {
        return { modified: false };
      }
      const etag = '"' + ++version + '"';
      values.set(key, { data: { ...data }, etag });
      return { modified: true, etag };
    }
  };
}

function setup() {
  const store = fakeStore();
  const sent = [];
  let clock = 1_000_000;
  let shouldFail = false;
  const service = makeEmailVerification({
    store,
    secret: 'test-secret-at-least-thirty-two-characters-xyz',
    now: () => clock,
    generateCode: () => '482719',
    generateId: () => 'random-unique-id',
    sendEmail: async ({ email, code }) => {
      if (shouldFail) throw new Error('provider unavailable');
      sent.push({ email, code });
    }
  });
  return { store, sent, service, tick: ms => { clock += ms; }, fail: () => { shouldFail = true; } };
}

test('email normalization, validation and production readiness are strict', () => {
  assert.equal(normalizeEmail(' HELLO+Club@Example.COM '), 'hello+club@example.com');
  assert.equal(normalizeEmail('x@@example.com'), null);
  assert.equal(normalizeEmail(''), null);
  assert.equal(readyForVerification({ CONTEXT:'deploy-preview', RESEND_API_KEY:'re_test', STEELBROTHERS_VERIFICATION_SECRET:'x'.repeat(32) }), false);
  assert.equal(readyForVerification({ CONTEXT:'production', RESEND_API_KEY:'re_test', STEELBROTHERS_VERIFICATION_SECRET:'x'.repeat(32) }), true);
  assert.equal(readyForVerification({ CONTEXT:'production', RESEND_API_KEY:'re_test', STEELBROTHERS_VERIFICATION_SECRET:'short' }), false);
});

test('send stores a hash, sends actual code once and enforces cooldown', async () => {
  const { service, store, sent, tick } = setup();
  assert.equal((await service.send('rider@example.com')).status, 200);
  assert.deepEqual(sent, [{ email:'rider@example.com', code:'482719' }]);
  const record = [...store.values.values()][0].data;
  assert.equal(record.codeHash.length, 64);
  assert.doesNotMatch(JSON.stringify(record), /482719|rider@example\.com/);
  assert.equal((await service.send('rider@example.com')).status, 429);
  assert.equal(sent.length, 1);
  tick(60_000);
  assert.equal((await service.send('rider@example.com')).status, 200);
  assert.equal(sent.length, 2);
});

test('wrong codes are rejected, correct code verifies once', async () => {
  const { service } = setup();
  await service.send('rider@example.com');
  const invalid = await service.verify('rider@example.com', '000000');
  assert.equal(invalid.status, 400);
  const correct = await service.verify('rider@example.com', '482719');
  assert.deepEqual(correct, { status:200, verified:true, message:'E-mail byl úspěšně ověřen.' });
  const replay = await service.verify('rider@example.com', '482719');
  assert.equal(replay.status, 400);
});

test('codes expire in ten minutes', async () => {
  const { service, tick } = setup();
  await service.send('rider@example.com');
  tick(EMAIL_CODE_TTL_MS + 1);
  assert.equal((await service.verify('rider@example.com','482719')).status,400);
});

test('only five failed guesses per issued code are permitted', async () => {
  const { service } = setup();
  await service.send('rider@example.com');
  for(let i=0;i<MAX_CODE_ATTEMPTS;i++){
    assert.equal((await service.verify('rider@example.com','000000')).status,400);
  }
  assert.equal((await service.verify('rider@example.com','482719')).status,429);
});

test('a failed Resend request invalidates the code, never fakes sending', async () => {
  const { service, fail, store } = setup();
  fail();
  const sent = await service.send('rider@example.com');
  assert.equal(sent.status,502);
  const state = [...store.values.values()][0].data;
  assert.equal(state.used,true);
  assert.equal((await service.verify('rider@example.com','482719')).status,400);
});

test('requests require same-origin POST JSON and reject oversized payloads', async () => {
  const req = (body, origin = 'https://steelbrothers.cz', type = 'application/json') =>
    new Request('https://steelbrothers.cz/api/email/send',
      {method:'POST', headers:{'origin':origin,'content-type':type},body});
  const good = await readEmailPayload(req('{"email":"rider@example.com"}'), ['email']);
  assert.equal(good.data.email, 'rider@example.com');
  const external = await readEmailPayload(req('{"email":"x@example.com"}','https://evil.example'), ['email']);
  assert.equal(external.error.status,403);
  const wrongType = await readEmailPayload(req('{}','https://steelbrothers.cz','text/plain'), ['email']);
  assert.equal(wrongType.error.status,415);
  const oversized = await readEmailPayload(req(JSON.stringify({email:'a'.repeat(2200)})),['email']);
  assert.equal(oversized.error.status,413);
  const extra = await readEmailPayload(req('{"email":"a@b.cz","role":"admin"}'),['email']);
  assert.equal(extra.error.status,400);
});

test('existing decorated email template is used with code and text fallback', () => {
  const { html, text } = renderVerificationEmail('482719');
  assert.match(html, /Steel Brothers/i);
  assert.match(html, /482719/);
  assert.match(text, /482719/);
  assert.match(html, /PLATNOST: 10 MINUT/);
  assert.doesNotMatch(html, /VERIFICATION_CODE/);
  assert.throws(() => renderVerificationEmail('<script>'), /six-digit/);
});
