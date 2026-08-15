/**
 * Runtime configuration, all of it overridable from a `.env` file.
 *
 * See `.env.example` for the full list. Vite only exposes variables prefixed
 * with `VITE_`, and inlines them at build time — so a production build carries
 * whatever was set when it was built, not when it runs.
 */

/**
 * Whether to intercept every request with Mock Service Worker.
 *
 * Defaults to **on**: a fresh clone should run against mocks rather than
 * firing real submissions at a live service because someone forgot to create
 * a `.env`. Set `VITE_USE_MOCK=false` to talk to the real endpoints.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

/**
 * An endpoint as the app should actually call it.
 *
 * While mocking, an **absolute** URL is reduced to its path so it resolves
 * against the app's own origin, where the dev server answers it.
 *
 * This exists because of a genuinely dangerous trap. The mock is served by the
 * dev server, not by anything inside the page, so it can only ever intercept
 * requests that reach the dev server. Point the app at
 * `https://real-service.example/protocolo` and turn mocking on, and the browser
 * sends that request straight past the dev server to the real host — mocking
 * silently does nothing and every submission is real. Switching
 * `VITE_USE_MOCK` back to `true` without also swapping the three URLs looks
 * exactly like it worked.
 *
 * Reducing to the path removes the trap: with mocking on, every call lands on
 * this origin. `request` in `api.ts` then refuses anything that still would
 * not, so a URL this cannot rewrite cannot escape either.
 */
function endpoint(configured: string): string {
  if (!USE_MOCK) return configured;
  try {
    // Throws for a relative path, which is already what we want.
    const absolute = new URL(configured);
    return `${absolute.pathname}${absolute.search}`;
  } catch {
    return configured;
  }
}

/** `GET {LOOKUP_URL}?protocoloId=<num>` → resolves a number to its id. */
export const LOOKUP_URL = endpoint(
  import.meta.env.VITE_LOOKUP_URL ?? "/api/protocols",
);

/** `PUT {PROTOCOL_URL}/<id>` → the ordinary protocol submission. */
export const PROTOCOL_URL = endpoint(
  import.meta.env.VITE_PROTOCOL_URL ?? "/api/protocols",
);

/**
 * `PUT {PROTOCOL_AS_URL}/<id>` → the AS submission.
 *
 * A separate service from the ordinary one, and never valid on its own: see
 * `runProtocolQueue` for the ordering rule that enforces it.
 */
export const PROTOCOL_AS_URL = endpoint(
  import.meta.env.VITE_PROTOCOL_AS_URL ?? "/api/protocols-as",
);

export const REQUEST_TIMEOUT_MS = Number(
  import.meta.env.VITE_REQUEST_TIMEOUT_MS ?? 5_000,
);

/**
 * Bearer token, sent as `Authorization: Bearer <token>` on every request.
 *
 * Empty by default, and when it is empty no `Authorization` header is sent at
 * all — see `authHeaders` in `api.ts`.
 *
 * Note this is **not** a secret once built: Vite inlines it into the bundle, so
 * anyone with the app can read it. That is acceptable for a token issued to
 * this app on a controlled device. If the token must not leave the server,
 * attach it in the dev proxy (`vite.config.ts`) or whatever fronts the app in
 * production, and leave this unset.
 */
export const AUTH_TOKEN = (import.meta.env.VITE_AUTH_TOKEN ?? "").trim();
