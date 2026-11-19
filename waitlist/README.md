# Waitlist site (lahorecoffeeclub.com)

```
index.html            the passport scroll + waitlist form
js/join.js            scroll story, number, "I'm a…" picker, slide-the-brick, sending to the sheet
js/scene.js           the WebGL scene (the slider moves the 16th brick toward the gap)
js/passport.js        the realistic passport (leather, foil, deboss, page block) and its contact shadow
lab/passport.html     passport lab: the passport alone, with the landing's moves on buttons (noindex)
vendor/three/         three.js r170, self-hosted (no CDN, so no third party sees visitors)
privacy/  terms/      legal pages (css/page.css, js/page.js, fonts/)
404.html              "Not on the map."
vercel.json           security headers, strict CSP, clean URLs, caching
robots.txt  sitemap.xml  .well-known/security.txt
google-apps-script.js the sheet script (not deployed; see .vercelignore)
```

## Preview locally
Modules don't run from file://, so serve the folder:
```
cd waitlist && python3 -m http.server 8000
```
Open http://localhost:8000 (the sheet still receives real entries; use a test number and delete the row).

## Ship order
1. Deploy this folder (same Vercel project as before).
2. Then update the Apps Script (steps at the top of google-apps-script.js) and add the
   Role and Consent headings. Doing it in this order means no sign-up is ever rejected.

## Rules that keep it tight
- No inline `<script>` blocks. The CSP only allows scripts from this site, so inline JS is blocked.
  Put JS in `js/`.
- New outside service (analytics, a font CDN, a form tool)? Add it to the CSP in vercel.json
  AND to "Who else touches it" on /privacy before it goes live.
- Changed what you collect or why? Update /privacy, change its date, and change CONSENT in js/join.js.
- The waitlist is deleted 12 months after launch at the latest. Delete a row within 7 days of a request.
