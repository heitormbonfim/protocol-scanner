import { UPSTREAM_TIMEOUT_MS, config } from "../config.ts";
import { readDetail } from "./message.ts";

/**
 * The only place in this server that talks to the Mais Cidadão service.
 *
 * Everything else — controllers, DTOs — works on the result this returns. That
 * is deliberate: one function to audit for what leaves the building, one place
 * where the timeout is applied, one place where an upstream status becomes one
 * of ours.
 *
 * ⚠ **Never log `text` or `result.body`.**
 *
 * The upstream response carries the citizen's CPF, SUS card, mobile number and
 * full address. The DTOs exist to keep those out of the browser — and a
 * `console.log(body)` added while debugging puts the identical payload into a
 * terminal scrollback or a log file, which is the same leak by a different
 * route. Log the method, the path, the status and the duration. Never the body,
 * never the `Authorization` header. See "The DTO boundary" in the README.
 */

export type UpstreamResult =
  /** `body` is the raw upstream payload — run it through a DTO before replying. */
  | { ok: true; body: unknown }
  /** `status` is already **our** status code, and `message` is safe to forward. */
  | { ok: false; status: number; message: string };

type CallOptions = {
  method: "GET" | "POST" | "PUT";
  /** Rooted at the upstream base, with a leading slash. */
  path: string;
  /** The caller's bearer token, forwarded verbatim. Omitted when absent. */
  token?: string;
  query?: Record<string, string>;
  body?: unknown;
};

/**
 * Turn an upstream status into ours.
 *
 * The one distinction that matters: **401 alone means the session is dead.** A
 * 403 is per-resource ("you may not touch this protocol") and is passed
 * straight through, because folding it into a 401 would log the operator out
 * mid-batch over a single bad slip.
 *
 * Every 5xx becomes a 502. The phone cannot act on the difference between the
 * service being down and the service throwing, and "HTTP 500" arriving from our
 * own API would read as *our* bug.
 */
function mapStatus(status: number, detail: string): { status: number; message: string } {
  if (status === 401) {
    return { status: 401, message: "Sessão expirada — entre novamente" };
  }
  if (status === 403) {
    return { status: 403, message: detail || "Sem permissão para esta operação" };
  }
  if (status >= 500) {
    return { status: 502, message: detail || `Serviço remoto respondeu HTTP ${status}` };
  }
  return { status, message: detail || `Serviço remoto respondeu HTTP ${status}` };
}

export async function callUpstream({
  method,
  path,
  token,
  query,
  body,
}: CallOptions): Promise<UpstreamResult> {
  const url = new URL(`${config.upstream}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  const sendsBody = body !== undefined && method !== "GET";

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(sendsBody ? { "Content-Type": "application/json" } : {}),
        // Omitted entirely when absent rather than sent empty: a bare
        // `Authorization: Bearer` reads as a malformed credential, and services
        // answer that with a 400 instead of the 401 that would say what is
        // actually wrong.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: sendsBody ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // Read the body either way — on a failure it usually holds the reason.
    const text = await response.text().catch(() => "");

    if (!response.ok) {
      return { ok: false, ...mapStatus(response.status, readDetail(text)) };
    }

    return { ok: true, body: text.trim() ? JSON.parse(text) : null };
  } catch (error) {
    // Checked by `name`: the abort error comes from undici's realm, so an
    // `instanceof` test against this realm's DOMException misses it.
    if ((error as { name?: unknown } | null)?.name === "TimeoutError") {
      return {
        ok: false,
        status: 504,
        message: "Tempo esgotado — serviço remoto não respondeu",
      };
    }
    // A malformed JSON body lands here too, which is the right answer: a 200
    // we cannot parse is not a success we can act on.
    return {
      ok: false,
      status: 502,
      message: "Falha ao contatar o serviço remoto",
    };
  }
}
