import type { LookupResult, ProtocolResult } from "../types";
import {
  API_URL,
  AUTH_TOKEN,
  REQUEST_TIMEOUT_MS,
  USE_MOCK,
} from "./config";
import { ENDPOINTS, type Endpoint } from "./endpoints";

/**
 * The three backend calls.
 *
 * 1. `lookupProtocolId` runs the moment the user confirms a scan, turning the
 *    15-digit number into the id the other two calls need.
 * 2. `protocolById` submits the ordinary protocol.
 * 3. `protocolAsById` submits the AS protocol.
 *
 * Each is three lines, because all the work is in `request` below — the only
 * place in the app that touches `fetch`. It builds the URL, attaches the bearer
 * token, applies the timeout, and turns every failure — HTTP status, network,
 * timeout, abort — into a returned value instead of a thrown error. Nothing
 * above this module ever writes a try/catch.
 *
 * Where each call goes is `endpoints.ts`; the host it goes to is `API_URL` in
 * `config.ts`. Nothing in this file knows a URL.
 *
 * There is no mock branch here: when mocking is enabled the dev server answers
 * these routes itself, so this module behaves identically whether it is talking
 * to a mock or to production. That is the point — the code under test is the
 * code that ships.
 */

type CallOptions = {
  /** Appended as a single encoded path segment: `{path}/{id}`. */
  id?: string;
  /** Merged into the query string. */
  query?: Record<string, string>;
  /**
   * Serialised as JSON, with the matching Content-Type. Dropped on GET, which
   * cannot carry a body — `fetch` throws outright rather than ignoring it.
   */
  body?: unknown;
  signal?: AbortSignal;
  /** Used in the error message when the response explains nothing itself. */
  failure?: string;
};

/** What `request` gives back. Never throws, so callers always get one of these. */
type RequestOutcome =
  | { ok: true; status: number; body: unknown }
  | { ok: false; reason: string; httpStatus?: number };

/**
 * The app's own origin, which is also where the mock listens.
 *
 * `fetch` outside a browser (jsdom under test, for one) rejects relative URLs
 * outright, so every URL has to be made absolute before the call.
 */
function appOrigin(): string {
  return globalThis.location?.origin ?? "http://localhost";
}

/** `{API_URL}{path}[/{id}][?query]`, absolute. */
function buildUrl(
  { path }: Endpoint,
  { id, query }: Pick<CallOptions, "id" | "query">,
): URL {
  const segment = id === undefined ? "" : `/${encodeURIComponent(id)}`;
  const url = new URL(`${API_URL}${path}${segment}`, appOrigin());

  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

/**
 * A timeout signal, without requiring `AbortSignal.timeout`.
 *
 * That static is Safari 16+. The fallback aborts with a `TimeoutError`, which
 * is the name `describeError` matches on — get it wrong and a timeout on an
 * older phone reports itself as a generic failure.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  setTimeout(() => {
    controller.abort(new DOMException("Tempo esgotado", "TimeoutError"));
  }, ms);
  return controller.signal;
}

/**
 * The first of several signals to abort, without requiring `AbortSignal.any`.
 *
 * The caller's reason is forwarded rather than replaced, so a user cancel still
 * arrives as an `AbortError` and a timeout as a `TimeoutError`.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    // `once` so the listener releases as soon as it fires. A caller signal that
    // outlives the request — the queue reuses one across a whole run — holds at
    // most one listener per request until the run ends.
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }

  return controller.signal;
}

/**
 * Combine the caller's abort signal with a timeout.
 *
 * `AbortSignal.any` is Safari 17.4+ (iOS 17.4, March 2024) and
 * `AbortSignal.timeout` is Safari 16+, both newer than plenty of the phones
 * this runs on. Without the fallbacks every request throws a `TypeError`
 * outright on an older iPhone — the app loads and then nothing submits.
 */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = timeoutSignal(REQUEST_TIMEOUT_MS);
  if (!signal) return timeout;

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeout]);
  }
  return anySignal([signal, timeout]);
}

/**
 * The bearer token, on every request.
 *
 * Omitted entirely when no token is configured, rather than sent empty: a bare
 * `Authorization: Bearer` reads as a malformed credential, and services tend to
 * answer that with a 400 instead of the 401 that would actually tell you the
 * token is missing.
 */
function authHeaders(): Record<string, string> {
  return AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
}

function describeError(error: unknown): string {
  // Checked by `name` rather than `instanceof DOMException`: the abort errors
  // come from the fetch implementation's own realm, so an instanceof test
  // against the page's DOMException fails and the real reason gets swallowed.
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "TimeoutError") return "Tempo esgotado — servidor não respondeu";
  if (name === "AbortError") return "Cancelado";
  if (error instanceof Error) return error.message;
  return "Erro desconhecido";
}

/** Parse a body as JSON, falling back to the raw text when it is not JSON. */
function parseBody(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The most human-readable explanation an error body offers.
 *
 * A government service's own wording is far more actionable than a status code,
 * so it is worth digging one level into a JSON envelope for it. Returns '' when
 * the body says nothing useful — `{}` and an HTML error page alike — so the
 * caller can fall back rather than show the user a fragment of markup.
 */
function readDetail(text: string): string {
  const body = parseBody(text);
  if (typeof body === "string") {
    // Anything with markup in it is a proxy's error page, not a message.
    return body.includes("<") ? "" : body.slice(0, 140).trim();
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message =
      record.message ??
      record.Message ??
      record.mensagem ??
      record.error ??
      record.erro ??
      record.detail;
    if (typeof message === "string") return message.slice(0, 140).trim();
  }
  return "";
}

/**
 * Every request in the app.
 *
 * Kept deliberately small: the interesting behaviour is that it always returns,
 * always carries the token, and always applies the timeout.
 */
async function request(
  endpoint: Endpoint,
  { id, query, body, signal, failure }: CallOptions = {},
): Promise<RequestOutcome> {
  try {
    const url = buildUrl(endpoint, { id, query });

    /*
     * While mocking, nothing may leave this origin.
     *
     * `API_URL` is already forced to '' when mocking, so this should be
     * unreachable — but the failure it guards against is a real, irreversible
     * submission to a live government service, and "should be unreachable" is
     * not good enough for that. Refused before `fetch`, so nothing goes out,
     * and returned rather than thrown so it surfaces in the report.
     */
    if (USE_MOCK && url.origin !== appOrigin()) {
      return {
        ok: false,
        reason:
          `Bloqueado: VITE_USE_MOCK está ligado, mas ${url.origin} não é a ` +
          `origem do app. Nada foi enviado.`,
      };
    }

    const sendsBody = body !== undefined && endpoint.method !== "GET";

    const response = await fetch(url, {
      method: endpoint.method,
      headers: {
        Accept: "application/json",
        ...(sendsBody ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
      },
      body: sendsBody ? JSON.stringify(body) : undefined,
      signal: withTimeout(signal),
    });

    // Read the body either way — on a failure it usually holds the reason.
    const text = await response.text().catch(() => "");

    if (!response.ok) {
      const detail = readDetail(text);
      return {
        ok: false,
        reason: `HTTP ${response.status} — ${
          detail || response.statusText || failure || "falha na requisição"
        }`,
        httpStatus: response.status,
      };
    }

    return { ok: true, status: response.status, body: parseBody(text) };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Confirm-time lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The exact response shape is not yet confirmed, so we accept the id under any
 * of the casings a .NET or PHP backend is likely to emit, and treat a bare
 * string/number body as the id itself. Narrow this once the real shape is known.
 */
export function readId(body: unknown): string | null {
  // if it's an array, extract the first found element
  if (Array.isArray(body)) {
    body = body[0];
  }

  if (typeof body === "string" && body.trim()) return body.trim();
  if (typeof body === "number") return String(body);

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const candidate =
      record.id ??
      record.Id ??
      record.ID ??
      record.protocolId ??
      record.idProtocolo;

    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }

  return null;
}

export async function lookupProtocolId(
  num: string,
  signal?: AbortSignal,
): Promise<LookupResult> {
  const result = await request(ENDPOINTS.lookup, {
    // If the service turns out to want a POST, this moves from `query` to
    // `body` — the mock reads the number from either.
    query: { protocoloId: num },
    signal,
    failure: "falha na busca",
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason, httpStatus: result.httpStatus };
  }

  const id = readId(result.body);
  if (!id) {
    return { ok: false, reason: "Resposta sem id", httpStatus: result.status };
  }
  return { ok: true, id };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. The two submissions
// ─────────────────────────────────────────────────────────────────────────────

async function submit(
  endpoint: Endpoint,
  id: string,
  label: string,
  signal?: AbortSignal,
): Promise<ProtocolResult> {
  const result = await request(endpoint, {
    id,
    // A payload would go here as `body: { … }`; `request` serialises it and
    // sets the Content-Type.
    signal,
    failure: "falha ao protocolar",
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason, httpStatus: result.httpStatus };
  }
  return { ok: true, reason: `${label} protocolado (HTTP ${result.status})` };
}

/** The ordinary protocol. */
export function protocolById(
  id: string,
  signal?: AbortSignal,
): Promise<ProtocolResult> {
  return submit(ENDPOINTS.protocol, id, "Protocolo", signal);
}

/**
 * The AS protocol.
 *
 * Never call this without a successful `protocolById` for the same id first —
 * `runProtocolQueue` is what enforces that, and it is the only caller.
 */
export function protocolAsById(
  id: string,
  signal?: AbortSignal,
): Promise<ProtocolResult> {
  return submit(ENDPOINTS.protocolAs, id, "AS", signal);
}
