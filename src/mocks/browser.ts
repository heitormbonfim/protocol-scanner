import { setupWorker } from 'msw/browser'
import { handlers, setMockDelay } from './handlers'

/**
 * Browser-side mocking, started from `main.tsx` when `VITE_USE_MOCK` is on.
 *
 * Relies on `public/mockServiceWorker.js`, installed by `pnpm msw:init`. If
 * that file is missing the worker fails to register and every request falls
 * through to the network, so `main.tsx` treats a registration failure as fatal
 * rather than letting real submissions escape unnoticed.
 */
export const worker = setupWorker(...handlers)

export async function startMockWorker(): Promise<void> {
  // Enough latency for the confirm-sheet spinner and the progress bar to be
  // visible and honest about what a real run feels like.
  setMockDelay(450)

  await worker.start({
    // Let anything we have not written a handler for through untouched —
    // notably the Tesseract WASM core and model downloads from the CDN.
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
}
