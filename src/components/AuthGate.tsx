import { useCallback, useEffect, useState } from 'react'
import App from '@/App'
import { LoginScreen } from '@/components/LoginScreen'
import { clearAuthToken, onUnauthorized, setAuthToken } from '@/lib/api'
import {
  clearSession,
  isSessionUsable,
  loadSession,
  saveSession,
  type Session,
} from '@/lib/session'

/**
 * Login screen or app, and nothing else.
 *
 * ## Why this wraps `App` rather than living inside it
 *
 * `App` owns twenty-odd hooks, opens the camera, and reads the history out of
 * localStorage on its first render. Gating from outside means none of that runs
 * while nobody is logged in — and it means `App` can take the session as a
 * required prop, so nothing downstream needs a "logged out" branch it would
 * only ever reach by mistake.
 *
 * ## Why the session is trusted without asking the server
 *
 * A stored, unexpired token gets you straight in, with no round trip. The app
 * is usable offline by design — scan the stack now, file it when there is
 * signal — and a gate that waited on the network would turn "no signal" into a
 * login screen that cannot be passed. The cached shell guarantees the page
 * *loads*, so the result would be a dead app rather than an honest error.
 *
 * The server's 401 is the authority, and it arrives on the first real call.
 * That is what `onUnauthorized` below is for. A network failure or a timeout is
 * never treated as a dead session.
 */
export function AuthGate() {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = loadSession()
    if (!stored) return null

    // An expired token is dropped here rather than being allowed to fail on
    // the first scan, which would lose the scan along with the session.
    if (!isSessionUsable(stored)) {
      clearSession()
      return null
    }

    setAuthToken(stored.token)
    return stored
  })

  const handleLogout = useCallback(() => {
    clearAuthToken()
    // Only the session. The history — and the sticky `protocoled` flags in it —
    // survives on purpose; see `clearSession`.
    clearSession()
    setSession(null)
  }, [])

  /*
   * A 401 from any call means the session died mid-use.
   *
   * `api.ts` also stops going to the network once it has seen one, so the rest
   * of a running batch fails instantly rather than collecting a hundred
   * identical 401s. This half is what puts the login screen back up.
   */
  useEffect(() => {
    onUnauthorized(handleLogout)
    return () => onUnauthorized(null)
  }, [handleLogout])

  const handleSuccess = useCallback((next: Session) => {
    // `login` in api.ts has already installed the token; this only persists it.
    saveSession(next)
    setSession(next)
  }, [])

  if (!session) return <LoginScreen onSuccess={handleSuccess} />

  return <App session={session} onLogout={handleLogout} />
}
