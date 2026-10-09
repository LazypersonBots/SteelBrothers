# Steel Brothers verification email (design only)

This is a branded, responsive HTML email template for a future account
verification system. It is **not connected to Resend or the /signin demo**.

## Resend setup (after DNS verification)

1. Go to Resend > Templates and create a template or import HTML.
2. Import `verification.html`.
3. Define a string template variable named `VERIFICATION_CODE`, matching
   `{{{VERIFICATION_CODE}}}` in the HTML, and publish the template.
4. Suggested sender: `Steel Brothers <verification@steelbrothers.cz>`
   (only after Resend confirms domain verification).
5. Suggested subject: `Steel Brothers — Ověřovací kód`.
6. When server-side authentication is implemented, generate a fresh random
   six-digit code per verification request, enforce a **real** 10-minute TTL,
   limit attempts and resends, store a secure code hash only, and call the
   Resend API **from a trusted server**, never in frontend JavaScript.

The email says it expires in ten minutes. This is a design assumption
until the backend enforces it.

Use the real code in the `VERIFICATION_CODE` variable. Do **not** hardcode
`482719` or any example code in production.

Do not place Resend API keys in Git, public HTML, or client-side JavaScript.
The existing site is static; no real account verification exists yet.
