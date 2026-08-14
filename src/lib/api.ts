import type { LookupResult, ProtocolResult } from "../types";
import {
  AUTH_TOKEN,
  LOOKUP_URL,
  PROTOCOL_AS_URL,
  PROTOCOL_URL,
  REQUEST_TIMEOUT_MS,
} from "./config";

/**
 * The three backend calls.
 *
 * 1. `lookupProtocolId` runs the moment the user confirms a scan, turning the
 *    15-digit number into the id the other two calls need.
 * 2. `protocolById` submits the ordinary protocol.
 * 3. `protocolAsById` submits the AS protocol, against a different service.
 *
 * All three go through `request` below, which is the only place in the app that
 * touches `fetch`. It attaches the bearer token, applies the timeout, and turns
 * every failure — HTTP status, network, timeout, abort — into a returned value
 * instead of a thrown error. Nothing above this module ever writes a try/catch.
 *
 * There is no mock branch here: when mocking is enabled the dev server answers
 * these routes itself, so this module behaves identically whether it is talking
 * to a mock or to production. That is the point — the code under test is the
 * code that ships.
 *
 * All three URLs and the token come from `config.ts`, and are set in `.env`.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The method each call uses.
 *
 * All three are GET today because that is what the service was specified with,
 * but the submissions in particular are the kind of thing that turns out to
 * want POST. Switching one is a one-word edit here, plus a `body` at the call
 * site if the service wants a payload — `request` handles the serialisation,
 * the Content-Type, and the token, and both mock transports already answer any
 * method, so nothing else needs touching.
 */
const LOOKUP_METHOD: HttpMethod = "GET";
const PROTOCOL_METHOD: HttpMethod = "PUT";
const PROTOCOL_AS_METHOD: HttpMethod = "PUT";

export type RequestOptions = {
  method?: HttpMethod;
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
 * Resolve a configured URL against the app's origin.
 *
 * Absolute URLs pass through untouched; relative ones become absolute. `fetch`
 * outside a browser (jsdom under test, for one) rejects relative URLs outright,
 * so this must happen before every call, not just where it is convenient.
 */
function resolveUrl(path: string): URL {
  return new URL(path, globalThis.location?.origin ?? "http://localhost");
}

/** Combine the caller's abort signal with a timeout. */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
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
  path: string,
  { method = "GET", query, body, signal, failure }: RequestOptions = {},
): Promise<RequestOutcome> {
  try {
    const url = resolveUrl(path);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    const sendsBody = body !== undefined && method !== "GET";

    const response = await fetch(url, {
      method,
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
  const result = await request(LOOKUP_URL, {
    method: LOOKUP_METHOD,
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
  baseUrl: string,
  method: HttpMethod,
  id: string,
  label: string,
  signal?: AbortSignal,
): Promise<ProtocolResult> {
  const path = `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(id)}`;

  const result = await request(path, {
    method,
    // A POST or PUT here would add something like `body: { id }`; `request`
    // serialises it and sets the Content-Type.
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
  return submit(PROTOCOL_URL, PROTOCOL_METHOD, id, "Protocolo", signal);
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
  return submit(PROTOCOL_AS_URL, PROTOCOL_AS_METHOD, id, "AS", signal);
}
