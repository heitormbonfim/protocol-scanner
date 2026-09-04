import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthGate } from './components/AuthGate.tsx'

/*
 * `AuthGate` rather than `App` directly: the app is behind a login now, and
 * gating from out here means none of App's state, camera or stored history
 * comes up until someone is actually logged in. See components/AuthGate.tsx.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)

/*
 * The service worker, which is what makes this installable and usable offline.
 *
 * Production builds only: a browser refuses to register one on an origin with a
 * certificate error, and the self-signed LAN dev server is exactly that until
 * the CA is installed. Registering in dev would only ever produce a console
 * error, and a worker caching the dev server's output would fight Vite's own
 * reloads.
 *
 * Registration waits for `load` so it never competes with the first render or
 * with the camera coming up. See `public/sw.js` for the caching rules — the
 * important one being that API traffic is never cached.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // Not fatal: the app works exactly as before, just without offline use.
      console.warn('Service worker registration failed:', error)
    })
  })
}
