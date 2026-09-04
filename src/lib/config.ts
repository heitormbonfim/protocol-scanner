/**
 * Runtime configuration, all of it overridable from a `.env` file.
 *
 * See `.env.example` for the full list. Vite only exposes variables prefixed
 * with `VITE_`, and inlines them at build time — so a production build carries
 * whatever was set when it was built, not when it runs. That prefix is also the
 * boundary: the server's own settings (`UPSTREAM_URL` above all) deliberately
 * carry no prefix and never reach this file.
 *
 * There is **no** URL here any more. Every call is a same-origin relative path
 * answered by the Express server in `server/`, which serves this very build —
 * see `endpoints.ts`. And there is no token: it comes from a login now, and
 * lives in `session.ts`.
 */

/**
 * Whether the mock answers every request instead of the real service.
 *
 * Defaults to **on**: a fresh clone should run against mocks rather than
 * firing real submissions at a live service because someone forgot to create
 * a `.env`. Set `VITE_USE_MOCK=false` to talk to the Express server, which
 * talks to the real endpoints.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

/**
 * The API's base URL — empty, always, and kept as a tripwire.
 *
 * Every call resolves against the app's own origin, because the server in
 * `server/` serves the app and the API from one port. That is what removed
 * CORS and mixed content from the problem, and it is why there is nothing to
 * configure per machine.
 *
 * It stays here rather than being deleted because `request` in `api.ts` still
 * refuses any cross-origin URL while mocking. That guard used to be what made
 * "mocking is all-or-nothing" true; now it is a backstop, and the real
 * safeguard has moved to the server, which refuses to boot without an explicit
 * `UPSTREAM_URL` and prints what it is pointed at on every start. Removing both
 * would be the tempting cleanup that leaves nothing at all.
 */
export const API_URL = "";

/**
 * Per-request timeout. Applied to every call by `request` in `api.ts`.
 *
 * Generous, because it now covers the whole chain — phone → Express → Mais
 * Cidadão — rather than a single hop. Deliberately **longer** than the
 * server's own `UPSTREAM_TIMEOUT_MS`, so the server is always the one to give
 * up first and the phone gets a definite answer instead of never learning
 * whether a submission landed.
 */
export const REQUEST_TIMEOUT_MS = Number(
  import.meta.env.VITE_REQUEST_TIMEOUT_MS ?? 25_000,
);
