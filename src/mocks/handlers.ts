import { HttpResponse, delay, http } from 'msw'
import { LOOKUP_URL, PROTOCOL_AS_URL, PROTOCOL_URL } from '../lib/config'

/**
 * Mock backend, shared by the browser worker and the Node test server.
 *
 * These handlers intercept at the network layer, so `src/lib/api.ts` runs its
 * real `fetch` calls unchanged — the code exercised against mocks is exactly
 * the code that ships.
 *
 * Failures are injected deterministically from the protocol number rather than
 * at random, so a given slip behaves the same way on every run. Randomness
 * here would make both manual testing and the test suite flaky.
 *
 * A number's **last two digits** decide its behaviour:
 *
 * | ends in | behaviour                                            |
 * | ------- | ---------------------------------------------------- |
 * | `97`    | id lookup fails (503) — record is kept without an id  |
 * | `98`    | ordinary protocol fails — AS must then be skipped     |
 * | `99`    | ordinary protocol succeeds, AS fails (422)           |
 * | other   | everything succeeds                                  |
 */

let mockDelayMs = 0

/**
 * Emulate network latency. The browser worker sets a few hundred ms so the
 * spinners and progress bar behave realistically; tests leave it at 0.
 */
export function setMockDelay(ms: number): void {
  mockDelayMs = ms
}

/** Numbers ending in these digits fail at each stage. See the table above. */
const LOOKUP_FAILS_ON = '97'
const PROTOCOL_FAILS_ON = '98'
const AS_FAILS_ON = '99'

/** Cheap stable hash, so the failure reason is reproducible per id. */
function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const PROTOCOL_FAILURES = [
  { reason: 'Protocolo já processado', status: 409 },
  { reason: 'Erro interno do servidor', status: 500 },
  { reason: 'Protocolo não encontrado', status: 404 },
]

/** The mock's id scheme. Keeps the last two digits so failures stay routable. */
export function mockIdFor(num: string): string {
  return `PRT-${num.slice(-6)}`
}

export const handlers = [
  // GET {LOOKUP_URL}?numprotocol=<num> → { id }
  http.get(LOOKUP_URL, async ({ request }) => {
    await delay(mockDelayMs)
    const num = new URL(request.url).searchParams.get('numprotocol')

    if (!num || !/^\d{15}$/.test(num)) {
      return HttpResponse.json({ message: 'numprotocol inválido' }, { status: 400 })
    }
    if (num.endsWith(LOOKUP_FAILS_ON)) {
      return HttpResponse.json({ message: 'Serviço indisponível' }, { status: 503 })
    }
    return HttpResponse.json({ id: mockIdFor(num) })
  }),

  // GET {PROTOCOL_URL}/<id>
  http.get(`${PROTOCOL_URL}/:id`, async ({ params }) => {
    await delay(mockDelayMs)
    const id = String(params.id)

    if (id.endsWith(PROTOCOL_FAILS_ON)) {
      const failure = PROTOCOL_FAILURES[hash(id) % PROTOCOL_FAILURES.length]
      return HttpResponse.text(failure.reason, { status: failure.status })
    }
    return HttpResponse.json({ id, situacao: 'protocolado' })
  }),

  // GET {PROTOCOL_AS_URL}/<id>
  http.get(`${PROTOCOL_AS_URL}/:id`, async ({ params }) => {
    await delay(mockDelayMs)
    const id = String(params.id)

    if (id.endsWith(AS_FAILS_ON)) {
      return HttpResponse.text('AS recusado pelo serviço', { status: 422 })
    }
    return HttpResponse.json({ id, situacao: 'as-protocolado' })
  }),
]
