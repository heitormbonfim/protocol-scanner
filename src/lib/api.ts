import type { LookupResult, ProtocolResult } from "../types";
import type { Session } from "./session";
import { ENDPOINTS, type Endpoint } from "./endpoints";

/**
 * The four backend calls.
 *
 * 1. `login` exchanges a username and password for a session.
 * 2. `lookupProtocolId` runs the moment the user confirms a scan, turning the
 *    15-digit number into the id the other two calls need.
 * 3. `protocolById` submits the ordinary protocol.
 * 4. `protocolAsById` submits the AS protocol.
 *
 * Each is a handful of lines, because all the work is in `request` below — the
 * only place in the app that touches `fetch`. It builds the URL, attaches the
 * bearer token, applies the timeout, and turns every failure — HTTP status,
 * network, timeout, abort — into a returned value instead of a thrown error.
 * Nothing above this module ever writes a try/catch.
 *
 * Where each call goes is `endpoints.ts`. They are all same-origin relative
 * paths answered by the Express server in `server/`, which also serves this
 * build — so nothing here knows a host, and there is no CORS to dodge.
 */

/**
 * Per-request timeout.
 *
 * Generous, because it covers the whole chain — phone → Express → Mais Cidadão
 * — rather than a single hop. Deliberately **longer** than the server's own
 * `UPSTREAM_TIMEOUT_MS` (20s), so the server is always the one to give up first
 * and the phone gets a definite answer instead of never learning whether a
 * submission landed. A constant rather than a setting: the ordering between the
 * two is the point, and two env vars could be set inconsistently.
 */
const REQUEST_TIMEOUT_MS = 25_000;

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
 * The app's own origin, which is also where the API lives — one Express process
 * serves both.
 *
 * `fetch` rejects relative URLs outside a browser, and the guard in `request`
 * needs an origin to compare, so every URL is made absolute before the call.
 */
function appOrigin(): string {
  return globalThis.location?.origin ?? "http://localhost";
}

/** `{path}[/{id}][?query]`, resolved against this app's own origin. */
function buildUrl(
  { path }: Endpoint,
  { id, query }: Pick<CallOptions, "id" | "query">,
): URL {
  const segment = id === undefined ? "" : `/${encodeURIComponent(id)}`;
  const url = new URL(`${path}${segment}`, appOrigin());

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

// ─────────────────────────────────────────────────────────────────────────────
// The session token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bearer token for every request, held in the module rather than passed in.
 *
 * That placement is deliberate. Threading a token through
 * `protocolById(id, token, signal)` would push it through `runProtocolQueue`
 * and every one of its callers, for a value that never varies within a run.
 * Keeping it here leaves `queue.ts` — and its tests — untouched by the whole
 * move from a build-time token to a login.
 */
let authToken: string | null = null;

/**
 * Set once the session is dead, so the rest of a batch fails without a round
 * trip. Cleared by `setAuthToken`, which is the only way back in.
 */
let sessionExpired = false;

let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string): void {
  authToken = token;
  sessionExpired = false;
}

export function clearAuthToken(): void {
  authToken = null;
  sessionExpired = false;
}

/**
 * Called the first time a request comes back 401.
 *
 * `App` uses it to abort the run in flight and drop to the login screen. One
 * handler, replaced rather than accumulated, because there is only ever one
 * app.
 */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** The message a request refused before it was sent comes back with. */
const EXPIRED = "Sessão expirada — entre novamente";

/**
 * The bearer token, on every request.
 *
 * Omitted entirely when there is none, rather than sent empty: a bare
 * `Authorization: Bearer` reads as a malformed credential, and services tend to
 * answer that with a 400 instead of the 401 that would actually tell you the
 * token is missing.
 */
function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
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
  /*
   * Once the session is gone, stop going to the network.
   *
   * A run works through the stack one slip at a time. Expire at slip 87 of 200
   * and, without this, the remaining 113 each make a full round trip to collect
   * an identical 401 — a minute of waiting and 113 junk rows in the report, for
   * a fact known at slip 87. `App` also aborts the run from `onUnauthorized`;
   * this is the belt to that braces, and it is what makes the behaviour true
   * for any caller rather than just the one that wired the callback up.
   */
  if (sessionExpired) {
    return { ok: false, reason: EXPIRED, httpStatus: 401 };
  }

  try {
    const url = buildUrl(endpoint, { id, query });

    /*
     * Nothing may leave this origin, ever.
     *
     * Every path in `endpoints.ts` is relative, so this should be unreachable —
     * but the failure it guards against is a real, irreversible submission to a
     * live government service, and "should be unreachable" is not good enough
     * for that. The realistic slip is a protocol-relative path: `//host/x`
     * looks like a path and resolves to another host.
     *
     * Refused before `fetch`, so nothing goes out, and returned rather than
     * thrown so it surfaces in the report instead of vanishing.
     */
    if (url.origin !== appOrigin()) {
      return {
        ok: false,
        reason:
          `Bloqueado: ${url.origin} não é a origem do app. Nada foi enviado. ` +
          `Confira o caminho em endpoints.ts.`,
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
      /*
       * 401 is the one status that means the session itself is over.
       *
       * Not 403: that is per-resource ("you may not touch this protocol"), and
       * treating it as a dead session would log the operator out mid-batch over
       * a single bad slip. The server keeps the two apart deliberately — see
       * `mapStatus` in server/shared/upstream.ts.
       */
      if (response.status === 401 && !sessionExpired) {
        sessionExpired = true;
        unauthorizedHandler?.();
      }

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
// 1. Login
// ─────────────────────────────────────────────────────────────────────────────

/** Exactly what `toSessionDto` in `server/auth/auth.dto.ts` returns. */
export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; reason: string };

/**
 * Read a session out of the login response.
 *
 * Validated rather than cast: a 200 that is not a session — a proxy's HTML, a
 * renamed field — would otherwise put the app past the login screen and then
 * fail every request, which looks like a broken app rather than a failed login.
 */
function readSession(body: unknown): Session | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as { token?: unknown; usuario?: unknown };

  if (typeof payload.token !== "string" || !payload.token) return null;
  if (!payload.usuario || typeof payload.usuario !== "object") return null;

  const usuario = payload.usuario as Record<string, unknown>;
  if (typeof usuario.nome !== "string") return null;

  return {
    token: payload.token,
    usuario: {
      nome: usuario.nome,
      nivel_permissao:
        typeof usuario.nivel_permissao === "string" ? usuario.nivel_permissao : "",
      podeProtocolar: usuario.podeProtocolar === true,
    },
  };
}

/**
 * Exchange a username and password for a session.
 *
 * The only call that does not carry a token, and the only one that produces
 * one. On success the token is installed here, so the caller never has to
 * remember to — forgetting would mean a login that appears to work and then
 * 401s on the first scan.
 */
export async function login(
  email: string,
  senha: string,
  signal?: AbortSignal,
): Promise<LoginResult> {
  // A previous session's expiry must not refuse the very request that would
  // replace it.
  sessionExpired = false;

  const result = await request(ENDPOINTS.login, {
    body: { email, senha },
    signal,
    failure: "falha no login",
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  const session = readSession(result.body);
  if (!session) return { ok: false, reason: "Resposta de login inválida" };

  setAuthToken(session.token);
  return { ok: true, session };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Confirm-time lookup
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
    // If the API turns out to want a POST, this moves from `query` to `body`;
    // `request` serialises either.
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
// 3 & 4. The two submissions
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

  /*
   * A 2xx is not enough on its own.
   *
   * The API and the app are served from one origin now, so anything under
   * `/api` that does not match a route would otherwise fall through to the SPA
   * fallback and come back as **200 with index.html** — which this function
   * would report as a filed protocol that never left the machine. The server's
   * terminal 404 (`server/api.routes.ts`) is what prevents that; this is the
   * second, independent check, on the side that would do the lying.
   */
  if (!result.body || typeof result.body !== "object") {
    return {
      ok: false,
      reason: `${label}: resposta inesperada do servidor (HTTP ${result.status})`,
      httpStatus: result.status,
    };
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
