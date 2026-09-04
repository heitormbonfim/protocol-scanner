/**
 * The logged-in session, kept across reloads.
 *
 * Follows the same shape as `storage.ts`: one key per thing, its own try/catch
 * around every access, and a `normalize` that rejects anything that does not
 * look right rather than trusting what came out of localStorage.
 *
 * ## Why the token lives in the browser at all
 *
 * It replaces `VITE_AUTH_TOKEN`, which was baked into the bundle at build time
 * — identical for every user, readable by anyone with the app, and impossible
 * to attribute to a person. A per-user token in localStorage is strictly
 * better on all three counts, and it survives a restart of the API, so a
 * half-finished stack of paper does not need logging in again.
 *
 * It is not personal data: the payload is `{ id_usuario, pessoa_id, iat, exp }`.
 * Everything it can reach still goes through the server's DTOs first — see
 * "The DTO boundary" in the README.
 */

const SESSION_KEY = 'protocol-scanner:session'

/** Exactly what `toSessionDto` in `server/auth/auth.dto.ts` returns. */
export type Usuario = {
  nome: string
  nivel_permissao: string
  podeProtocolar: boolean
}

export type Session = {
  token: string
  usuario: Usuario
}

/**
 * Accept only a session we could actually use.
 *
 * A stored blob missing its token would put the app past the login screen and
 * then fail every request with no way back, which looks like a broken app
 * rather than an expired login.
 */
function normalize(value: unknown): Session | null {
  if (!value || typeof value !== 'object') return null
  const stored = value as Partial<Session>

  if (typeof stored.token !== 'string' || !stored.token) return null
  if (!stored.usuario || typeof stored.usuario !== 'object') return null

  const usuario = stored.usuario as Partial<Usuario>
  if (typeof usuario.nome !== 'string') return null

  return {
    token: stored.token,
    usuario: {
      nome: usuario.nome,
      nivel_permissao:
        typeof usuario.nivel_permissao === 'string' ? usuario.nivel_permissao : '',
      // Defaults to **false**. A session written by a version that did not
      // record this should hide the submit button rather than offer a batch
      // that would come back as 403s.
      podeProtocolar: usuario.podeProtocolar === true,
    },
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return normalize(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Private browsing or a full quota. The session still works for this tab;
    // it just will not survive a reload.
  }
}

/**
 * Forget the session — and **only** the session.
 *
 * Deliberately does not touch `protocol-scanner:records`. Those carry the
 * sticky `protocoled` flags, which are facts about the paper rather than about
 * whoever is logged in: clearing them would make a half-finished stack file
 * every slip a second time, and a submission has no undo. "Logging out clears
 * everything" is the reflex this comment exists to stop.
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // As above.
  }
}

/**
 * The `exp` claim of a JWT, in milliseconds, or null when unreadable.
 *
 * Decoded, not verified — the browser has no key and no business having one.
 * This exists for exactly one purpose: deciding whether to show a stored
 * session or the login screen without a network round trip, so the app still
 * opens on a phone with no signal.
 *
 * Anything unparseable returns null and is treated as "no expiry known", which
 * the caller resolves in favour of letting the user in: a real 401 from the
 * server is authoritative, a guess made here is not.
 */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null

    // base64url → base64, then pad: atob rejects both differences.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')

    const claims: unknown = JSON.parse(atob(padded))
    const exp = (claims as { exp?: unknown } | null)?.exp

    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * Whether a stored session is worth showing the app for.
 *
 * `null` expiry — an unreadable token — counts as valid on purpose. See
 * `jwtExpiry`: the server's 401 is the authority, and refusing entry on a
 * guess would lock someone out of an app that would have worked.
 */
export function isSessionUsable(session: Session): boolean {
  const expiry = jwtExpiry(session.token)
  return expiry === null || expiry > Date.now()
}
