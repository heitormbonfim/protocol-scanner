/**
 * Every call this app makes, in one table.
 *
 * All of them are **same-origin, relative paths**. The app no longer talks to
 * the Mais Cidadão service directly: it talks to the Express API in `server/`,
 * which serves this very build from the same port. That is what makes the base
 * URL a non-issue — a phone on `https://192.168.2.183:4173` resolves
 * `/api/protocolos` against its own origin, on any network, with no
 * configuration and no CORS.
 *
 * The path and method are not configuration — they are the shape of our own
 * API's contract. Keeping them here means they are typed, greppable, and
 * changed through a reviewable diff.
 *
 * Two consumers import this table, so they cannot disagree about where a call
 * goes:
 *
 *   src/lib/api.ts           the client
 *   server/api.routes.ts     the Express API that answers it
 *
 * The server is the one that polices the HTTP method, so changing a verb here
 * means changing it there too.
 *
 * Deliberately free of `import.meta.env`: `vite.config.ts` and the server pull
 * this in from Node, where that does not exist.
 *
 * ## The id is always the last segment
 *
 * `/protocolar/<id>`, never `/protocolos/<id>/protocolar`. The two submission
 * paths below are deliberately siblings rather than prefixes of one another
 * (`protocolar-as` does not start with `protocolar/`, because `-` is not `/`),
 * so neither can shadow the other however they are matched.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Endpoint = {
  method: HttpMethod;
  /** Rooted at the app's own origin, with a leading slash and no trailing one. */
  path: string;
};

export const ENDPOINTS = {
  /** `POST /api/auth/login` — `{ email, senha }` → `{ token, usuario }`. */
  login: { method: "POST", path: "/api/auth/login" },

  /** `GET /api/protocolos?protocoloId=<15 digits>` → the protocol DTO. */
  lookup: { method: "GET", path: "/api/protocolos" },

  /** `PUT /api/protocolos/protocolar/<id>` — the ordinary submission. */
  protocol: { method: "PUT", path: "/api/protocolos/protocolar" },

  /**
   * `PUT /api/protocolos/protocolar-as/<id>` — the AS submission.
   *
   * Never valid on its own: `runProtocolQueue` only reaches it after the
   * ordinary protocol above has succeeded for the same id.
   */
  protocolAs: { method: "PUT", path: "/api/protocolos/protocolar-as" },

  /**
   * `GET /api/health` — is the server up, and what is it pointed at.
   *
   * Not called by the app. It exists so `docs/IPHONE.md` can open with a single
   * `curl` that answers "is it even running" before anyone starts installing
   * certificates.
   */
  health: { method: "GET", path: "/api/health" },
} as const satisfies Record<string, Endpoint>;
