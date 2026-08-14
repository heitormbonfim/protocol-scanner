import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/*
 * No mock bootstrapping happens here.
 *
 * Mocking is served by the dev server itself (see plugins/mock-api.ts), not by
 * a service worker in the page, because a service worker cannot be registered
 * on an origin with a certificate error — which is exactly what a phone gets
 * when it reaches the LAN dev server over self-signed HTTPS. Nothing to start,
 * so nothing to fail.
 */

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
