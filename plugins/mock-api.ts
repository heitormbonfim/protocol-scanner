import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite'
import {
  MOCK_DELAY_MS,
  lookupReply,
  protocolAsReply,
  protocolReply,
  type MockReply,
} from '../src/mocks/scenario.ts'

/**
 * Serves the mock API from the dev server itself, instead of from a service
 * worker in the browser.
 *
 * ## Why not MSW's browser worker
 *
 * The dev server runs over HTTPS with a self-signed certificate whose SAN
 * covers only `localhost` and `127.0.0.1`. A phone reaching it on the LAN IP
 * therefore hits a certificate error, and while you can click through the
 * interstitial — the page loads and the camera works — browsers **refuse to
 * register a service worker on an origin with a certificate error**, bypassed
 * or not. A service worker is persistent code, so that refusal is deliberate
 * and not something the page can opt out of.
 *
 * That made MSW's browser worker unusable on the one device this app is for.
 * Handling the routes here works over any origin, with or without a valid
 * certificate, and needs nothing installed on the phone.
 *
 * MSW is still the mocking layer for the test suite, driving the same
 * `scenario.ts` behaviour, so the two cannot drift apart.
 */

export type MockApiOptions = {
  enabled: boolean
  lookupUrl: string
  protocolUrl: string
  protocolAsUrl: string
  /** Artificial latency, so spinners and progress bars behave realistically. */
  delayMs?: number
}

function send(res: Parameters<Connect.NextHandleFunction>[1], reply: MockReply) {
  const payload =
    reply.type === 'json' ? JSON.stringify(reply.body) : String(reply.body)
  res.statusCode = reply.status
  res.setHeader(
    'Content-Type',
    reply.type === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
  )
  // The app is same-origin with this server, but a permissive header costs
  // nothing and keeps things working if the page is opened through a tunnel.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.end(payload)
}

/** Trailing-slash-insensitive prefix, so `/api/protocols-as` never matches `/api/protocols`. */
function segmentAfter(pathname: string, base: string): string | null {
  const prefix = base.endsWith('/') ? base : `${base}/`
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/') ? decodeURIComponent(rest) : null
}

export function mockApi(options: MockApiOptions): Plugin {
  const { enabled, lookupUrl, protocolUrl, protocolAsUrl } = options
  const delayMs = options.delayMs ?? MOCK_DELAY_MS

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== 'GET') return next()

    const url = new URL(req.url ?? '/', 'http://localhost')
    const { pathname } = url

    // AS is checked first: its path shares a prefix with the ordinary one, and
    // matching in the other order would shadow it.
    const asId = segmentAfter(pathname, protocolAsUrl)
    const protocolId = segmentAfter(pathname, protocolUrl)
    const isLookup = pathname === lookupUrl && url.searchParams.has('numprotocol')

    let reply: MockReply | null = null
    if (asId !== null) reply = protocolAsReply(asId)
    else if (protocolId !== null) reply = protocolReply(protocolId)
    else if (isLookup) reply = lookupReply(url.searchParams.get('numprotocol'))

    if (!reply) return next()

    const resolved = reply
    setTimeout(() => send(res, resolved), delayMs)
  }

  return {
    name: 'protocol-scanner:mock-api',
    apply: () => enabled,
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware)
    },
    // `vite preview` serves the production build; mocking should behave the
    // same there, otherwise a preview silently talks to nothing.
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(middleware)
    },
  }
}
