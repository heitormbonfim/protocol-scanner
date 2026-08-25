import { describe, expect, it } from 'vitest'
// `?raw` rather than reading the file: this keeps the test inside the app's
// tsconfig, which has no Node types, and Vite resolves the path at transform
// time so a rename cannot leave the test silently pointing at nothing.
import swSource from '../../public/sw.js?raw'
import { ENDPOINTS } from '../lib/endpoints'

/**
 * The service worker's caching rules.
 *
 * `public/sw.js` is not part of the module graph — the browser loads it as a
 * worker — so it is read off disk and run here against stand-in globals. That
 * is worth the small amount of scaffolding: the worker sits in front of every
 * request the app makes, including the two that submit a protocol to a live
 * government service, and a cached or replayed submission would be a silent
 * real-world error. These tests pin the allowlist that prevents it.
 */

const ORIGIN = 'https://protocolos.example'

type FetchEvent = {
  request: { url: string; method: string; mode: string }
  respondWith: (response: unknown) => void
}

function loadServiceWorker() {
  const listeners = new Map<string, (event: FetchEvent) => void>()
  /** Every URL the worker wrote to a cache, by cache name. */
  const written = new Map<string, Set<string>>()

  const self = {
    addEventListener(type: string, fn: (event: FetchEvent) => void) {
      listeners.set(type, fn)
    },
    location: { origin: ORIGIN },
    clients: { claim: async () => {} },
  }

  const caches = {
    open: async (name: string) => ({
      match: async () => undefined,
      addAll: async () => {},
      put: async (request: { url: string } | string) => {
        const url = typeof request === 'string' ? request : request.url
        if (!written.has(name)) written.set(name, new Set())
        written.get(name)!.add(url)
      },
    }),
    keys: async () => [],
    delete: async () => true,
    match: async () => ({ shell: true }),
  }

  const fetchStub = async () => ({
    status: 200,
    type: 'basic',
    clone: () => ({}),
  })

  const ResponseStub = { error: () => ({ type: 'error' }) }

  new Function('self', 'caches', 'fetch', 'Response', swSource)(
    self,
    caches,
    fetchStub,
    ResponseStub,
  )

  return { listeners, written }
}

/** Fire a request at the worker; resolves to whether it took the request over. */
async function send(
  worker: ReturnType<typeof loadServiceWorker>,
  url: string,
  { method = 'GET', mode = 'cors' } = {},
) {
  let responded: Promise<unknown> | null = null
  const event: FetchEvent = {
    request: { url, method, mode },
    respondWith: (response) => {
      responded = Promise.resolve(response)
    },
  }

  worker.listeners.get('fetch')!(event)
  if (responded) await responded
  return responded !== null
}

/** Every URL the worker cached, across all caches. */
function allWritten(worker: ReturnType<typeof loadServiceWorker>) {
  return [...worker.written.values()].flatMap((urls) => [...urls])
}

describe('service worker — what it refuses to cache', () => {
  it('ignores a protocol submission, which is a PUT', async () => {
    const worker = loadServiceWorker()
    const handled = await send(
      worker,
      `${ORIGIN}${ENDPOINTS.protocol.path}/PRT-1`,
      { method: 'PUT' },
    )

    expect(handled).toBe(false)
    expect(allWritten(worker)).toEqual([])
  })

  it('ignores the AS submission too', async () => {
    const worker = loadServiceWorker()
    const handled = await send(
      worker,
      `${ORIGIN}${ENDPOINTS.protocolAs.path}/PRT-1`,
      { method: 'PUT' },
    )

    expect(handled).toBe(false)
    expect(allWritten(worker)).toEqual([])
  })

  it('ignores the ID lookup, even though it is a GET', async () => {
    // The one API call the method check alone would not exclude.
    const worker = loadServiceWorker()
    const handled = await send(
      worker,
      `${ORIGIN}${ENDPOINTS.lookup.path}?protocoloId=202601300217719`,
    )

    expect(handled).toBe(false)
    expect(allWritten(worker)).toEqual([])
  })

  it('ignores an API hosted on another origin', async () => {
    // What production actually uses: absolute URLs to a separate service.
    const worker = loadServiceWorker()
    const handled = await send(
      worker,
      'https://service.example.gov.br/protocolo?protocoloId=202601300217719',
    )

    expect(handled).toBe(false)
    expect(allWritten(worker)).toEqual([])
  })
})

describe('service worker — what it does cache', () => {
  it('caches hashed build output', async () => {
    const worker = loadServiceWorker()
    const handled = await send(worker, `${ORIGIN}/assets/index-C0ud4Ue3.js`)

    expect(handled).toBe(true)
    expect(allWritten(worker)).toContain(`${ORIGIN}/assets/index-C0ud4Ue3.js`)
  })

  it('caches the Tesseract runtime from the CDN', async () => {
    // ~3 MB of WASM and model data — the difference between the scanner
    // working offline and not working at all.
    const worker = loadServiceWorker()
    const handled = await send(
      worker,
      'https://cdn.jsdelivr.net/npm/tesseract.js-core/tesseract-core.wasm',
    )

    expect(handled).toBe(true)
  })

  it('serves the cached shell when a navigation has no network', async () => {
    const worker = loadServiceWorker()
    const handled = await send(worker, `${ORIGIN}/`, { mode: 'navigate' })

    expect(handled).toBe(true)
  })
})
