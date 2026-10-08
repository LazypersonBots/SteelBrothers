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

Supported formats: JPG, JPEG, PNG, WebP, AVIF, GIF.

During every Netlify build, scripts/build-gallery.mjs finds all images in photos/,
sorts them newest-first, generates dist/gallery-data.json and copies the site
and photographs into dist/. No separate database, external image host or
public upload form is required.

* Homepage: three newest photos in the gallery section.
* If more than three photos exist, **Zobrazit více fotografií** opens /gallery/.
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
