/**
 * Runtime configuration, all of it overridable from a `.env` file.
 *
 * See `.env.example` for the full list. Vite only exposes variables prefixed
 * with `VITE_`, and inlines them at build time — so a production build carries
 * whatever was set when it was built, not when it runs.
 *
 * There is **one** URL here, not three: every call goes to the same service.
 * What differs between them is the path and the method, and those live in
 * `endpoints.ts` as code.
 */

/**
 * Whether the mock answers every request instead of the real service.
 *
 * Defaults to **on**: a fresh clone should run against mocks rather than
 * firing real submissions at a live service because someone forgot to create
 * a `.env`. Set `VITE_USE_MOCK=false` to talk to the real endpoints.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

/**
 * The API's base URL — scheme and host, no trailing slash, no path.
 *
 * While mocking this is forced to `''`, which makes every call resolve against
 * the app's own origin. That is where the mock is listening: the dev server
 * itself in the browser, MSW under test.
 *
 * The forcing is a safety property, not a convenience. A mock can only
 * intercept a request that actually reaches it. Point the app at the real
 * service, leave mocking on, and the browser would send genuine submissions to
 * a live government service while the developer believes nothing is going out —
 * and a submission cannot be taken back. Deriving the base from `USE_MOCK`
 * makes that state unreachable instead of merely discouraged.
 */
export const API_URL = USE_MOCK
  ? ""
  : (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

/** Per-request timeout. Applied to every call by `request` in `api.ts`. */
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
