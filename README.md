# Steel Brothers demo

Static Czech club website. Open index.html directly, or run `node preview.mjs` and visit http://127.0.0.1:4173.

Only index.html and styles.css are website files. There are no dependencies, external fonts, photographs, tracking scripts, registration handlers, hosting configurations, or deployment workflows. All four picture slots are deliberately empty. Both sign-up buttons are disabled. Club copy and ride ideas are illustrative.

No production URL or subdomain is hardcoded. Connect the intended repository and custom domain before publishing. Hosting providers may assign their own default hostname automatically.

## Keep the demo out of search

Retain the robots/googlebot noindex meta tags in index.html and publish _headers alongside index.html so Netlify also sends X-Robots-Tag for all paths. The local preview sends the same header. Keep these directives throughout the demo stage until the owner explicitly requests indexing. Do not add a robots.txt Disallow rule: Google must be able to read the noindex instruction. This is search exclusion, not access control.
