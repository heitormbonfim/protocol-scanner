import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite'
import {
  MOCK_DELAY_MS,
  MOCK_TOKEN,
  loginReply,
  lookupReply,
  protocolAsReply,
  protocolReply,
  type MockReply,
} from '../src/mocks/scenario.ts'
import { ENDPOINTS } from '../src/lib/endpoints.ts'

/**
 * Serves the mock API from the dev server itself, instead of from a service
 * worker in the browser.
 *
 * ## Why not a service worker
 *
 * The dev server runs over HTTPS with a self-signed certificate whose SAN
 * covers only `localhost` and `127.0.0.1`. A phone reaching it on the LAN IP
 * therefore hits a certificate error, and while you can click through the
 * interstitial — the page loads and the camera works — browsers **refuse to
 * register a service worker on an origin with a certificate error**, bypassed
 * or not. A service worker is persistent code, so that refusal is deliberate
 * and not something the page can opt out of.
 *
 * That made a browser worker unusable on the one device this app is for.
 * Handling the routes here works over any origin, with or without a valid
 * certificate, and needs nothing installed on the phone.
 *
 * ## Which mock is which
 *
 * There are two, and they answer different questions:
 *
 *   this file                  the browser talking to our API. Used by
 *                              `pnpm dev`, when VITE_USE_MOCK is on.
 *   server/shared/mock-upstream.ts
 *                              our API talking to Mais Cidadão. On by default,
 *                              everywhere but the deployment machine.
 *
 * They share the failure-digit convention — the constants are exported from
 * `scenario.ts` and imported by both — so a number that reproduces something
 * here reproduces it there too.
 */

export type MockApiOptions = {
  enabled: boolean
  /** Artificial latency, so spinners and progress bars behave realistically. */
  delayMs?: number
}

type Res = Parameters<Connect.NextHandleFunction>[1]
type Req = Parameters<Connect.NextHandleFunction>[0]

/**
 * The app is same-origin with this server, so these are not strictly needed —
 * but they cost nothing and keep things working if the page is opened through a
 * tunnel. `Authorization` has to be listed explicitly: a bearer token makes any
 * cross-origin request preflighted.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
}

function send(res: Res, reply: MockReply) {
  const payload =
    reply.type === 'json' ? JSON.stringify(reply.body) : String(reply.body)
  res.statusCode = reply.status
  res.setHeader(
    'Content-Type',
    reply.type === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
  )
  for (const [header, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(header, value)
  }
  res.setHeader('Cache-Control', 'no-store')
  res.end(payload)
}

/**
 * Read a JSON request body, for the methods that carry one.
 *
 * Only ever called once a route has already matched — consuming the stream for
 * a request we then hand to `next()` would leave the real handler with nothing
 * to read.
 */
async function readJsonBody(req: Req): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'HEAD') return {}

  req.setEncoding('utf8')
  let text = ''
  for await (const chunk of req) text += chunk
  if (!text.trim()) return {}

  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * Trailing-slash-insensitive prefix, so `…/protocolaragendamentoas` never
 * matches `…/protocolaragendamento`.
 */
function segmentAfter(pathname: string, base: string): string | null {
  const prefix = base.endsWith('/') ? base : `${base}/`
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/') ? decodeURIComponent(rest) : null
}

/*
 * The paths come from `src/lib/endpoints.ts`, the same table the client builds
 * its URLs from, so the two cannot drift. They are bare paths, which is exactly
 * what this middleware compares against `req.url`. Every call the app makes is
 * a same-origin relative path now, so they all land here rather than on a real
 * host — and with mocking on, `API_URL` in src/lib/config.ts is additionally
 * pinned to '' so that cannot be configured away.
 */

export function mockApi(options: MockApiOptions): Plugin {
  const { enabled } = options
  const loginUrl = ENDPOINTS.login.path
  const lookupUrl = ENDPOINTS.lookup.path
  const protocolUrl = ENDPOINTS.protocol.path
  const protocolAsUrl = ENDPOINTS.protocolAs.path
  const delayMs = options.delayMs ?? MOCK_DELAY_MS

  // Deliberately method-agnostic: `endpoints.ts` picks a method per call, and
  // the mock should keep answering when one of them changes to POST.
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const { pathname } = url

    // AS is checked first: its path shares a prefix with the ordinary one, and
    // matching in the other order would shadow it.
    const asId = segmentAfter(pathname, protocolAsUrl)
    const protocolId = segmentAfter(pathname, protocolUrl)
    const isLookup = pathname === lookupUrl
    const isLogin = pathname === loginUrl

    if (asId === null && protocolId === null && !isLookup && !isLogin) {
      return next()
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      for (const [header, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(header, value)
      }
      return res.end()
    }

    /*
     * Every route but login demands the token this mock itself issued.
     *
     * It used to compare against `VITE_AUTH_TOKEN`, a build-time value that no
     * longer exists. Validating its own token is strictly better: it proves the
     * client actually stored what it got from `/auth/login` and put it back on
     * the wire, so a broken session wiring fails here, in dev, rather than
     * against the real service.
     *
     * Login is exempt for the obvious reason — you cannot present a token in
     * order to obtain one.
     */
    if (!isLogin && req.headers.authorization !== `Bearer ${MOCK_TOKEN}`) {
      return send(res, {
        status: 401,
        type: 'json',
        body: {
          message:
            'Mock: Authorization ausente ou diferente do token emitido no ' +
            'login. Confira o header enviado em src/lib/api.ts.',
        },
      })
    }

    const respond = async () => {
      let reply: MockReply
      if (asId !== null) reply = protocolAsReply(asId)
      else if (protocolId !== null) reply = protocolReply(protocolId)
      else if (isLogin) {
        const body = await readJsonBody(req)
        const text = (value: unknown) => (typeof value === 'string' ? value : null)
        reply = loginReply(text(body.email), text(body.senha))
      } else {
        // The number arrives in the query string on a GET and in the body on
        // anything else, so a lookup switched to POST still resolves.
        const body = await readJsonBody(req)
        const fromBody = body.protocoloId ?? body.num
        reply = lookupReply(
          url.searchParams.get('protocoloId') ??
            (typeof fromBody === 'string' ? fromBody : null),
        )
      }
      setTimeout(() => send(res, reply), delayMs)
    }

    void respond()
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
