import {
  LOOKUP_URL,
  PROTOCOL_AS_URL,
  PROTOCOL_URL,
  REQUEST_TIMEOUT_MS,
} from './config'
import type { LookupResult, ProtocolResult } from '../types'

/**
 * The three backend calls.
 *
 * 1. `lookupProtocolId` runs the moment the user confirms a scan, turning the
 *    15-digit number into the id the other two calls need.
 * 2. `protocolById` submits the ordinary protocol.
 * 3. `protocolAsById` submits the AS protocol, against a different service.
 *
 * Every call here is a real `fetch`. There is no mock branch: when mocking is
 * enabled, Mock Service Worker intercepts at the network layer, so this module
 * behaves identically whether it is talking to a mock or to production. That
 * is the point — the code under test is the code that ships.
 *
 * All three URLs come from `config.ts` and are set in `.env`.
 */

/**
 * Resolve a configured URL against the app's origin.
 *
 * Absolute URLs pass through untouched; relative ones become absolute. `fetch`
 * outside a browser (jsdom under test, for one) rejects relative URLs outright,
 * so this must happen before every call, not just where it is convenient.
 */
function resolveUrl(path: string): URL {
  return new URL(path, globalThis.location?.origin ?? 'http://localhost')
}

/** Combine the caller's abort signal with a timeout. */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function describeError(error: unknown): string {
  // Checked by `name` rather than `instanceof DOMException`: the abort errors
  // come from the fetch implementation's own realm, so an instanceof test
  // against the page's DOMException fails and the real reason gets swallowed.
  const name = (error as { name?: unknown } | null)?.name
  if (name === 'TimeoutError') return 'Tempo esgotado — servidor não respondeu'
  if (name === 'AbortError') return 'Cancelado'
  if (error instanceof Error) return error.message
  return 'Erro desconhecido'
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
  if (typeof body === 'string' && body.trim()) return body.trim()
  if (typeof body === 'number') return String(body)
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const candidate =
      record.id ?? record.Id ?? record.ID ?? record.protocolId ?? record.idProtocolo
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    if (typeof candidate === 'number') return String(candidate)
  }
  return null
}

export async function lookupProtocolId(
  num: string,
  signal?: AbortSignal,
): Promise<LookupResult> {
  try {
    const url = resolveUrl(LOOKUP_URL)
    url.searchParams.set('numprotocol', num)

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: withTimeout(signal),
    })

    if (!response.ok) {
      return {
        ok: false,
        reason: `HTTP ${response.status} — ${response.statusText || 'falha na busca'}`,
        httpStatus: response.status,
      }
    }

    const id = readId(await response.json())
    if (!id) {
      return { ok: false, reason: 'Resposta sem id', httpStatus: response.status }
    }
    return { ok: true, id }
  } catch (error) {
    return { ok: false, reason: describeError(error) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. The two submissions
// ─────────────────────────────────────────────────────────────────────────────

async function submit(
  baseUrl: string,
  id: string,
  label: string,
  signal?: AbortSignal,
): Promise<ProtocolResult> {
  try {
    const url = resolveUrl(`${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(id)}`)
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: withTimeout(signal),
    })

    if (!response.ok) {
      // Surface the body when there is one — a government service's own error
      // text is far more actionable than a bare status code.
      const body = await response.text().catch(() => '')
      const detail = body.slice(0, 140).trim()
      return {
        ok: false,
        reason: detail
          ? `HTTP ${response.status} — ${detail}`
          : `HTTP ${response.status} — ${response.statusText || 'falha ao protocolar'}`,
        httpStatus: response.status,
      }
    }

    return { ok: true, reason: `${label} protocolado (HTTP ${response.status})` }
  } catch (error) {
    return { ok: false, reason: describeError(error) }
  }
}

/** The ordinary protocol. */
export function protocolById(
  id: string,
  signal?: AbortSignal,
): Promise<ProtocolResult> {
  return submit(PROTOCOL_URL, id, 'Protocolo', signal)
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
  return submit(PROTOCOL_AS_URL, id, 'AS', signal)
}
