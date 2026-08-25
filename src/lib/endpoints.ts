/**
 * Every call this app makes, in one table.
 *
 * The **base URL** is configuration: it differs between the real service and a
 * local proxy, so it lives in `.env` as `VITE_API_URL` and is read by
 * `config.ts`. The **path and method** are not configuration — they are the
 * shape of the service's contract. Keeping them here means they are typed,
 * greppable, and changed through a reviewable diff rather than an unversioned
 * edit on one developer's machine.
 *
 * All three consumers import this table, so they cannot disagree about where a
 * call goes:
 *
 *   src/lib/api.ts           the real client
 *   plugins/mock-api.ts      the dev-server mock
 *   src/mocks/handlers.ts    the test mock
 *
 * Deliberately free of `import.meta.env`: `vite.config.ts` pulls this in from
 * Node, where that does not exist.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Endpoint = {
  method: HttpMethod;
  /** Rooted at the API base, with a leading slash and no trailing one. */
  path: string;
};

export const ENDPOINTS = {
  /** `GET /protocolo?protocoloId=<15 digits>` → `{ id }`. */
  lookup: { method: "GET", path: "/protocolo" },

  /** `PUT /protocolo/protocolaragendamento/<id>` — the ordinary submission. */
  protocol: { method: "PUT", path: "/protocolo/protocolaragendamento" },

  /**
   * `PUT /protocolo/protocolaragendamentoas/<id>` — the AS submission.
   *
   * Never valid on its own: `runProtocolQueue` only reaches it after the
   * ordinary protocol above has succeeded for the same id.
   */
  protocolAs: { method: "PUT", path: "/protocolo/protocolaragendamentoas" },
} as const satisfies Record<string, Endpoint>;
