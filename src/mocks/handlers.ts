import { HttpResponse, http } from 'msw'
import { LOOKUP_URL, PROTOCOL_AS_URL, PROTOCOL_URL } from '../lib/config'
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

export const handlers = [
  // GET {LOOKUP_URL}?numprotocol=<num> → { id }
  http.get(LOOKUP_URL, ({ request }) =>
    toResponse(
      lookupReply(new URL(request.url).searchParams.get('numprotocol')),
    ),
  ),

  // GET {PROTOCOL_URL}/<id>
  http.get(`${PROTOCOL_URL}/:id`, ({ params }) =>
    toResponse(protocolReply(String(params.id))),
  ),

  // GET {PROTOCOL_AS_URL}/<id>
  http.get(`${PROTOCOL_AS_URL}/:id`, ({ params }) =>
    toResponse(protocolAsReply(String(params.id))),
  ),
]

export { mockIdFor } from './scenario'
