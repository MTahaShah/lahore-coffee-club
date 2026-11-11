// Lahore Coffee Club service worker: makes the prototype installable and
// keeps a copy for offline use. Network first, so online you always get
// the latest build; the cache is only used when the network fails.
// Bump CACHE_VERSION to drop every older cache on the next visit.
const CACHE_VERSION = "lcc-v3";
const PRECACHE = ["./", "./index.html", "./cafe.html", "./manifest.json", "./manifest-cafe.json", "./icons/app-icon-192.png", "./icons/app-icon-512.png"];

// Install: save the page and icons so the app opens offline from the start
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// Activate: delete caches from older versions, then take over open pages
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: our own files go to the network first and refresh the cache;
// offline, use the cached copy (cafe.html has its own; other pages fall back to index.html).
// CDN scripts (QR, Supabase) are left to the browser.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
