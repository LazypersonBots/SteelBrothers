import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('branded Steel Brothers code template uses Resend variable and email-safe markup', async () => {
  const html = await readFile(new URL('../emails/verification.html', import.meta.url), 'utf8');
  assert.match(html, /STEEL<br>BROTHERS/);
  assert.match(html, /{{{VERIFICATION_CODE}}}/);
  assert.match(html, /10 MINUT/);
  assert.match(html, /background-color:#f46b35/);
  assert.match(html, /role="presentation"/);
  assert.doesNotMatch(html, /<script|<form|onerror=|onclick=/i);
  assert.doesNotMatch(html, /482\s*719/);
});
