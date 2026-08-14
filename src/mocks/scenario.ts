/**
 * What the mock backend does, described independently of how it is delivered.
 *
 * Two transports use these functions, and they must stay in lockstep:
 *
 *  - the Vite dev/preview middleware (`plugins/mock-api.ts`), which is what the
 *    browser actually talks to;
 *  - the MSW handlers (`handlers.ts`), used by the test suite.
 *
 * Keeping the behaviour here rather than inside either transport means the
 * tests and the running app cannot drift apart.
 *
 * Failures are injected deterministically from the protocol number rather than
 * at random, so a given slip behaves the same way on every run. Randomness
 * would make both manual testing and the test suite flaky.
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

/** Anything that survives `JSON.stringify` — matches MSW's `JsonBodyType`. */
export type JsonBody =
  | string
  | number
  | boolean
  | null
  | JsonBody[]
  | { [key: string]: JsonBody }

export type MockReply =
  | { status: number; type: 'json'; body: JsonBody }
  | { status: number; type: 'text'; body: string }

/** Latency the browser-facing transport applies, so spinners behave honestly. */
export const MOCK_DELAY_MS = 450

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

/** `GET {LOOKUP_URL}?protocoloId=<num>` */
export function lookupReply(num: string | null): MockReply {
  if (!num || !/^\d{15}$/.test(num)) {
    return { status: 400, type: 'json', body: { message: 'protocoloId inválido' } }
  }
  if (num.endsWith(LOOKUP_FAILS_ON)) {
    return { status: 503, type: 'json', body: { message: 'Serviço indisponível' } }
  }
  return { status: 200, type: 'json', body: { id: mockIdFor(num) } }
}

/** `GET {PROTOCOL_URL}/<id>` */
export function protocolReply(id: string): MockReply {
  if (id.endsWith(PROTOCOL_FAILS_ON)) {
    const failure = PROTOCOL_FAILURES[hash(id) % PROTOCOL_FAILURES.length]
    return { status: failure.status, type: 'text', body: failure.reason }
  }
  return { status: 200, type: 'json', body: { id, situacao: 'protocolado' } }
}

/** `GET {PROTOCOL_AS_URL}/<id>` */
export function protocolAsReply(id: string): MockReply {
  if (id.endsWith(AS_FAILS_ON)) {
    return { status: 422, type: 'text', body: 'AS recusado pelo serviço' }
  }
  return { status: 200, type: 'json', body: { id, situacao: 'as-protocolado' } }
}
