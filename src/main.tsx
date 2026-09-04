import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthGate } from './components/AuthGate.tsx'

/*
 * No mock bootstrapping happens here.
 *
 * Mocking is served by the dev server itself (see plugins/mock-api.ts), not by
 * a service worker in the page, because a service worker cannot be registered
 * on an origin with a certificate error — which is exactly what a phone gets
 * when it reaches the LAN dev server over self-signed HTTPS. Nothing to start,
 * so nothing to fail.
 */

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
 * Production builds only, for the same reason the mocks are not a worker: a
 * browser refuses to register one on an origin with a certificate error, and
 * the self-signed LAN dev server is exactly that. Registering in dev would
 * only ever produce a console error, and a worker caching the dev server's
 * output would fight Vite's own reloads.
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
