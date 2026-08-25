import { HttpResponse, http } from 'msw'
import { ENDPOINTS } from '../lib/endpoints'
import {
  lookupReply,
  protocolAsReply,
  protocolReply,
  type MockReply,
} from './scenario'

/**
 * MSW handlers for the test suite.
 *
 * The browser does **not** use these: it talks to the Vite middleware in
 * `plugins/mock-api.ts` instead, because a service worker cannot register on
 * the self-signed-certificate origin the phone connects to. Both transports
 * drive the same `scenario.ts`, so what the tests exercise and what the app
 * receives cannot drift apart.
 *
 * No artificial delay here — tests should not pay for it.
 */

function toResponse(reply: MockReply): Response {
  return reply.type === 'json'
    ? HttpResponse.json(reply.body, { status: reply.status })
    : HttpResponse.text(reply.body, { status: reply.status })
}

/**
 * The number rides in the query string on a GET and in the body on anything
 * else, matching `plugins/mock-api.ts`, so a lookup switched to POST resolves
 * under test too.
 */
async function protocoloIdOf(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get('protocoloId')
  if (fromQuery) return fromQuery
  if (request.method === 'GET' || request.method === 'HEAD') return null

  const text = await request.text().catch(() => '')
  if (!text.trim()) return null
  try {
    const body: unknown = JSON.parse(text)
    const value = (body as Record<string, unknown>)?.protocoloId
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

// `http.all` rather than `http.get` throughout: the method for each call lives
// in `src/lib/endpoints.ts` and is expected to change, and the mock's job is to
// answer the route, not to police the verb.
export const handlers = [
  // {lookup.path}?protocoloId=<num> → { id }
  http.all(ENDPOINTS.lookup.path, async ({ request }) =>
    toResponse(lookupReply(await protocoloIdOf(request))),
  ),

  // {protocol.path}/<id>
  http.all(`${ENDPOINTS.protocol.path}/:id`, ({ params }) =>
    toResponse(protocolReply(String(params.id))),
  ),

  // {protocolAs.path}/<id>
  http.all(`${ENDPOINTS.protocolAs.path}/:id`, ({ params }) =>
    toResponse(protocolAsReply(String(params.id))),
  ),
]

export { mockIdFor } from './scenario'
