# Steel Brothers — real email-code verification with Resend

This directory contains the decorated email used by the production Netlify Functions.
The server-only bundled template copy lives in server/email-template.mjs.

## One-time setup in Netlify

1. Confirm Resend lists steelbrothers.cz as VERIFIED under Domains.
2. In the SteelBrothers Netlify project: Project configuration > Environment variables > Add variable.
   Make both variables available to Functions:
   - RESEND_API_KEY = sending key from the separate SteelBrothers Resend account.
   - STEELBROTHERS_VERIFICATION_SECRET = a randomly generated secret, at least 32 characters.
     Generate locally with Node (do not paste the output into chat):
     node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
3. Redeploy after saving secrets.
4. Open https://steelbrothers.cz/signin/, enter an email, click POSLAT KÓD,
   enter the 6-digit code received, then click OVĚŘIT.
5. Troubleshoot in Resend > Logs and Netlify Functions logs. Never share secrets.

## What works, what does not

- This enables real transactional Resend email-code sending and validation.
- The sender is Steel Brothers <verification@steelbrothers.cz>.
- Six-digit crypto-random codes, 10-minute expiry, one-time use.
- Maximum five guesses, 60-second resend cooldown, IP rate limits.
- Same-origin JSON-only calls, server-side Resend key.
- Only HMAC-protected codes and hashed email identifiers are stored in
  SteelBrothers' own Netlify Blobs storage; no passwords are sent.
- Deploy previews cannot send real emails; production only.
- No personal Supabase account is used or touched.

IMPORTANT: Email verification works independently, but REGISTER and LOGIN
are still explicitly demo-only. Successful verification is not account
creation or authentication. Do not treat it as a persistent member record.

Netlify functions: /api/email/send and /api/email/verify

Run tests: node --test
Netlify build: node --test && node scripts/build-gallery.mjs
