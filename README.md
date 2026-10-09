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

## Search visibility

The site keeps existing noindex directives while unfinished. Only remove them
when the owner explicitly approves search-engine indexing.


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
