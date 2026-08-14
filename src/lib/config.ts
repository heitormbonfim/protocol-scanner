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
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** `GET {LOOKUP_URL}?numprotocol=<num>` → resolves a number to its id. */
export const LOOKUP_URL = import.meta.env.VITE_LOOKUP_URL ?? '/api/protocols'

/** `GET {PROTOCOL_URL}/<id>` → the ordinary protocol submission. */
export const PROTOCOL_URL = import.meta.env.VITE_PROTOCOL_URL ?? '/api/protocols'

/**
 * `GET {PROTOCOL_AS_URL}/<id>` → the AS submission.
 *
 * A separate service from the ordinary one, and never valid on its own: see
 * `runProtocolQueue` for the ordering rule that enforces it.
 */
export const PROTOCOL_AS_URL =
  import.meta.env.VITE_PROTOCOL_AS_URL ?? '/api/protocols-as'

export const REQUEST_TIMEOUT_MS = Number(
  import.meta.env.VITE_REQUEST_TIMEOUT_MS ?? 15_000,
)
