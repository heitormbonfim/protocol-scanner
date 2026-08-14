/**
 * Offline shell for the scanner.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 * This app submits protocols to a live government service. A cached or replayed
 * submission would be a real-world error nobody could see, so the worker caches
 * by **allowlist**, never by blocklist: a request is cached only if it is a GET
 * for the app's own build output, a static file, or the Tesseract runtime from
 * the CDN. Everything else — every API call, whatever it is configured to —
 * falls straight through to the network untouched.
 *
 * Both submissions are PUT, so they are excluded by the method check alone; the
 * ID lookup is a GET, and it is excluded because it matches no static pattern.
 * That is two independent reasons, which is the intent: a future endpoint that
 * happened to end in `.json` still would not be cached, because the check is
 * against the app's own asset paths rather than against a list of API routes.
 *
 * ── Registration ────────────────────────────────────────────────────────────
 * Registered from src/main.tsx in production builds only. A browser refuses to
 * register a worker on an origin with a certificate error, which is exactly what
 * the self-signed LAN dev server is — the same constraint that keeps the mock
 * API in the dev server rather than in a worker. See README, "Testing the PWA".
 *
 * Bump VERSION to retire every previous cache on the next activation.
 */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const VENDOR_CACHE = `vendor-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, VENDOR_CACHE]);

/** Enough to open the app with no network at all. */
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

/** Where tesseract.js fetches its WASM core and language model from. */
const VENDOR_HOSTS = new Set(["cdn.jsdelivr.net", "unpkg.com"]);

/**
 * Same-origin requests that are safe to cache.
 *
 * `/assets/` is Vite's build output, whose filenames carry a content hash, so
 * a cache hit can never be stale. The extension list covers what lives in
 * `public/`.
 */
function isStaticAsset(url) {
  if (url.pathname.startsWith("/assets/")) return true;
  return /\.(?:js|mjs|css|png|jpe?g|svg|webp|ico|woff2?|wasm|traineddata(?:\.gz)?)$/.test(
    url.pathname,
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !KEEP.has(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Cache-first, and only ever store a plain 200.
 *
 * An opaque response (a cross-origin fetch made without CORS) has status 0 and
 * an unreadable body; caching one means serving that back forever, so those are
 * fetched fresh every time instead.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.status === 200 && response.type !== "opaque") {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Both protocol submissions are PUT. Nothing but GET is ever considered.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The page itself: network first, so a new build is picked up as soon as
  // there is a connection, with the cached shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match("/", { ignoreSearch: true });
        return shell ?? Response.error();
      }),
    );
    return;
  }

  if (VENDOR_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request, VENDOR_CACHE));
    return;
  }

  if (url.origin === self.location.origin && isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }

  // Anything else, the API included, is left entirely alone.
});
