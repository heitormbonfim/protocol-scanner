import { callUpstream, type UpstreamResult } from "../shared/upstream.ts";

/**
 * The three upstream calls the protocol module makes.
 *
 * These paths are the **Mais Cidadão** service's, not ours — our own routes
 * live in `src/lib/endpoints.ts`. The translation between the two happens here
 * and nowhere else, which is why the client can be given clean names
 * (`/protocolar`) without anyone having to remember what they map to.
 *
 * Every one forwards the operator's own token, so the upstream service records
 * who filed what.
 */

/** `GET /protocolo?protocoloId=<15 digits>` — answers with a **list**. */
export function buscarProtocolo(num: string, token?: string): Promise<UpstreamResult> {
  return callUpstream({
    method: "GET",
    path: "/protocolo",
    query: { protocoloId: num },
    token,
  });
}

/** `PUT /protocolo/protocolaragendamento/<id>` — the ordinary submission. */
export function protocolar(id: string, token?: string): Promise<UpstreamResult> {
  return callUpstream({
    method: "PUT",
    path: `/protocolo/protocolaragendamento/${encodeURIComponent(id)}`,
    token,
  });
}

/**
 * `PUT /protocolo/protocolaragendamentoas/<id>` — the AS submission.
 *
 * Never valid on its own. The client's `runProtocolQueue` is what enforces
 * that, and it only reaches here after the ordinary protocol succeeded for the
 * same id.
 */
export function protocolarAs(id: string, token?: string): Promise<UpstreamResult> {
  return callUpstream({
    method: "PUT",
    path: `/protocolo/protocolaragendamentoas/${encodeURIComponent(id)}`,
    token,
  });
}
