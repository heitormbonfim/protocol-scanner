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

/** `GET {LOOKUP_URL}?protocoloId=<num>` → resolves a number to its id. */
export const LOOKUP_URL = import.meta.env.VITE_LOOKUP_URL ?? "/api/protocols";

/** `PUT {PROTOCOL_URL}/<id>` → the ordinary protocol submission. */
export const PROTOCOL_URL = import.meta.env.VITE_PROTOCOL_URL ?? "/api/protocols";

/**
 * `PUT {PROTOCOL_AS_URL}/<id>` → the AS submission.
 *
 * A separate service from the ordinary one, and never valid on its own: see
 * `runProtocolQueue` for the ordering rule that enforces it.
 */
export const PROTOCOL_AS_URL =
  import.meta.env.VITE_PROTOCOL_AS_URL ?? "/api/protocols-as";

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
