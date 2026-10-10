# Steel Brothers

Static website for the Steel Brothers motorcycle club.

Production domain: https://steelbrothers.cz/

The website is plain HTML, CSS and JavaScript. Netlify builds the static output
using Node.js (no npm dependencies) and publishes the dist/ directory.

## Photo gallery

Put real club photos inside the [photos/](photos/) folder. Details and filename
examples are in [photos/README.md](photos/README.md).

**Important:** Prefix image filenames with the photo's date: YYYY-MM-DD-description.jpg
(or YYYY-MM-DD-HHMM-description.jpg for more precise ordering). The date in the
filename determines which photos are newest; Git filesystem modification dates
are not reliable indicators of upload order. Undated photos appear last.

Supported formats: JPG, JPEG, PNG, WebP, AVIF, GIF. You can also upload one
ZIP of photos directly into photos/ — the build safely extracts the pictures.

During every Netlify build, scripts/build-gallery.mjs finds all images in photos/,
sorts them newest-first, generates dist/gallery-data.json and copies the site
and photographs into dist/. No separate database, external image host or
public upload form is required.

* Homepage: three newest photos in the gallery section.
* The **Zobrazit více fotografií** button always opens /gallery/, even if no photos have been added yet.
* /gallery/ displays every photo and includes a prominent back-to-home link.
* Zero photos: both pages show a truthful empty message instead of stock images.
* Photos open in a new tab at their original resolution.

To add pictures yourself: open GitHub → SteelBrothers → photos → Add file →
Upload files → commit to main. Netlify's GitHub continuous deployment should
then rebuild the gallery, provided automatic deployment is enabled.

Or send real photos to ChatGPT, which can prepare date-stamped filenames,
optimize their size, and commit them to the repository on request.

## Local preview

Requires Node.js 18+:

- Run tests: node --test
- Build: node scripts/build-gallery.mjs
- Preview: node preview.mjs, then open http://127.0.0.1:4173/
- Gallery preview: http://127.0.0.1:4173/gallery/

The official Steel Brothers logo is included as steel-brothers-logo.avif.

## Search visibility — NEVER INDEX THIS SITE

The owner requires **all SteelBrothers pages and media to remain absent from
Google and other search engines**. Do not remove this policy unless the owner
explicitly requests it.

- Every HTML page includes both `robots` and `googlebot` meta directives:
  `noindex, nofollow, noimageindex`.
- Render and the local preview serve `X-Robots-Tag:
  noindex, nofollow, noimageindex, nosnippet` on all responses including
  pages, images, assets and API endpoints.
- Netlify's root `_headers` applies the same `X-Robots-Tag` to `/*`.
- `robots.txt` blocks `Googlebot-Image` from image crawling, but **allows**
  normal Googlebot to crawl pages. This is intentional: Google must be able
  to read `noindex` to remove pages from results; setting
  `User-agent: * / Disallow: /` instead may result in URL-only listings.
- No sitemap is published. CI checks that the policy remains present in
  the deployed static build.

`noindex` affects search results, not direct access: anyone who has the
URL can still visit this public site. If results have already been indexed,
the verified site owner can use Google Search Console's **Removals** tool
to hide them faster while Google processes the permanent `noindex` rules.



## Activities

The homepage displays the first three newest entries from activity-data.json.
The complete /activity/ page shows all activities, with a back-to-home button.
Current entries are clearly marked as placeholders with no confirmed dates.
Replace them with real club events when dates and details are available.
If a real entry has a valid publishedAt ISO date, it sorts ahead of undated placeholders.

## Sign-in demo

/signin/ includes registration and sign-in tabs styled after the supplied design
reference, with the real Steel Brothers logo and CSS orbital animation.

* Nickname (registration only), required email, password (minimum eight characters)
  and confirmation (registration only).
* Email verification is shown as TBA: no verification email is sent.
* Client-side demo validates fields and clearly confirms no account was created.
* No login/auth backend, no credential submission, and no password storage.
* Respect reduced-motion settings.

This page is UI-only. Do not treat it as a real login until a secure server-side
identity provider, email verification service, and privacy notices are configured.

## Hosting on Render (Node web service)

Use this project's connected GitHub repository and branch `main`.

- Runtime: Node.
- Region: Frankfurt, EU Central (recommended for Czechia).
- Root directory: blank.
- Build command: `npm install && npm run build`.
- Start command: `npm start`.
- Health check path: `/health`.
- Choose Render Free if offered. **Do not select a paid plan by accident.**

The build copies all site pages and gallery photos into `dist/`. The Node
server serves static pages and handles `/api/email/send` and
`/api/email/verify` using the existing Resend templates.

Render service environment variables (create under Environment):

- `RESEND_API_KEY`: SteelBrothers Resend account sending key.
- `STEELBROTHERS_VERIFICATION_SECRET`: at least 32 random characters,
  generated privately with crypto-random bytes.

These variables are secrets, **never put them in the repository or chat**.
The `RENDER` and `RENDER_EXTERNAL_URL` variables are supplied by Render.
Email verification is unavailable until the secrets are configured.

### Temporary email-code storage limitation

To avoid connecting personal Supabase or buying an extra database just for
short-lived six-digit codes, Render currently uses a bounded in-memory store.
Codes expire in 10 minutes, have five attempts and a 60-second resend cooldown.
**Any restart, deployment or sleeping instance clears pending codes.**
Use a persistent independent store before scaling past one instance or
requiring guaranteed cross-deployment continuity. This does NOT create real
member accounts; signup and login remain demos.

Do not switch the steelbrothers.cz DNS until the Render URL, photos, page
navigation and actual Resend delivery are verified. Existing Netlify deployment
can stay online during migration.

## Steel Brothers member accounts and club announcements (Neon)

These features use the **dedicated SteelBrothers Club Neon project**, not Supabase.
Neon project ID: `cold-sky-16736637`; existing default branch: `production`.
The site and server still run on Render; Neon CLI deployment is not required
for this plain Node + PostgreSQL website. A separate private DB connection
string is needed so that the Render service can use the existing Neon project.

### Activate on Render

1. Open https://console.neon.tech and select SteelBrothers Club / production.
2. Click **Connect** and copy a **pooled PostgreSQL connection string**.
3. In the **SteelBrothers Render web service**, choose Environment > Add:
   `STEELBROTHERS_DATABASE_URL` = that full Neon connection string.
4. Keep the existing `RESEND_API_KEY` and
   `STEELBROTHERS_VERIFICATION_SECRET` unchanged.
5. Redeploy the Render service. The server creates dedicated `sb_*` tables
   on first successful startup; it logs `Steel Brothers persistent member database: READY`.
6. Check `/api/account/status` returns `{ "available": true }` and test
   a real registration and club email using a mailbox you control.

**Never paste the connection string into chat or commit it to GitHub.**
Do not connect any personal Supabase project. When this variable is missing
or invalid, registration and announcing are disabled rather than saved in RAM.

### Rules

- Every email may successfully verify once. The two allowlisted owner emails
  `gamedriverstudio@gmail.com` and `steel.brothersmed@gmail.com` may
  successfully verify up to 30 times each. This is a verification limit, not
  permission to create 30 accounts (one account per address).
- Registration requires server-side verification proof; passwords use scrypt
  with individual salts. Sessions are HttpOnly, Secure, and SameSite=Lax.
- Only signed-in, verified owner emails can post announcements and optionally
  email club subscribers. The bell is a popup on all four pages.
- New verified member accounts receive club email notices by default; this is
  disclosed on the registration page. Existing members keep their saved preference.
  Members can disable notices under Profile → Settings without losing membership.
- The email delivery queue is saved in Neon and retried after restarts. Free
  Render sleep can delay notifications; emails can still require monitoring.
- Emails go through the existing SteelBrothers Resend domain.

## Profile menu and password-protected admin console

After successful registration or login, the browser returns to the home page.
The header shows the signed-in nickname and an avatar (initials by default);
profile settings allow uploading a 128×128 WebP avatar stored in the dedicated
Neon member record, disabling/re-enabling club emails, or logging out.

The bell is a read-only popup for visitors and members. Only the two verified
admin email accounts get an Admin tab in their profile popup, and **the tab
cannot publish without a second, separate admin password**.

To enable admin publishing add a Render Environment variable:

- `STEELBROTHERS_ADMIN_PASSWORD`: a **different** strong password (at least
  12 characters; 20+ recommended) chosen and saved privately by the owner.

Do not place the admin password in source control, send it in chat, reuse a user
account password, or expose it client-side. Saving it will trigger Render
deployment. Without it, the Admin tab safely remains locked. After entering the
password, a signed, 20-minute, login-session-bound admin cookie grants publishing
access; passwords have five attempts per IP per 15 minutes.

Creating an announcement publishes it in the bell and queues Resend notification
emails for members whose club email setting is **on**. Newly registered members
start with that setting on, and can opt out immediately after registering.
