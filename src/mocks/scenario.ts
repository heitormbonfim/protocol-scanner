/**
 * What the mock backend does, described independently of how it is delivered.
 *
 * The Vite dev/preview middleware (`plugins/mock-api.ts`) is what the browser
 * actually talks to; this file is the behaviour behind it, kept separate so the
 * transport stays about HTTP and this stays about what the answers are.
 *
 * The server has a mock of its own — `server/shared/mock-upstream.ts`, standing
 * in for Mais Cidadão rather than for us. It imports the failure digits below,
 * so a number that reproduces something against this mock reproduces it against
 * that one too. The shapes differ on purpose: this answers as our API, that one
 * answers as the government service and still goes through the DTOs.
 *
 * Failures are injected deterministically from the protocol number rather than
 * at random, so a given slip behaves the same way on every run. Randomness
 * would make it impossible to reproduce a report on demand.
 *
 * A number's **last two digits** decide its behaviour:
 *
 * | ends in | behaviour                                            |
 * | ------- | ---------------------------------------------------- |
 * | `97`    | id lookup fails (503) — record is kept without an id  |
 * | `98`    | ordinary protocol fails — AS must then be skipped     |
 * | `99`    | ordinary protocol succeeds, AS fails (422)           |
 * | other   | everything succeeds                                  |
 *
 * Login is separate, since it has no protocol number to key off: see
 * `loginReply` at the bottom. Any non-empty credentials are accepted, and the
 * token it hands back is what the transports then demand on every other route
 * — so a request that forgets the header fails here, in dev, rather than
 * against the real service.
 */

/** Anything that survives `JSON.stringify`. */
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

/**
 * The token the mock issues at login, and demands on every other route.
 *
 * Hard-coded rather than computed: this file is imported both from Node (the
 * Vite middleware) and from jsdom (the tests), and base64 encoding differs
 * enough between the two to not be worth the risk for a constant.
 *
 * The payload is real base64url — `{"id_usuario":36,"iat":1700000000,
 * "exp":4102444800}` — so the client's `jwtExpiry()` parses it and finds an
 * expiry in 2100. Anything unparseable would make the mock look like an
 * expired session on every reload.
 *
 * The signature is not a signature. Nothing verifies it; the mock compares the
 * whole string.
 */
export const MOCK_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpZF91c3VhcmlvIjozNiwicGVzc29hX2lkIjpudWxsLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMH0.' +
  'mock-signature-nao-verificada'

/** Who you are while mocking. Matches the DTO in `server/auth/auth.dto.ts`. */
export const MOCK_USER = {
  nome: 'Heitor',
  nivel_permissao: 'Atendente',
  podeProtocolar: true,
}

/*
 * Exported so the server's own mock (`server/shared/mock-upstream.ts`) keys off
 * the same digits. The two return different *shapes* on purpose — this file
 * answers as our API, that one answers as Mais Cidadão, so the server's DTOs
 * still run — but a slip ending in 98 must fail in both, or a number that
 * reproduces a bug in the browser stops reproducing it against the server.
 */
export const LOOKUP_FAILS_ON = '97'
export const PROTOCOL_FAILS_ON = '98'
export const AS_FAILS_ON = '99'

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

/**
 * `ENDPOINTS.lookup` — `?protocoloId=<num>`
 *
 * Answers with the same three-field DTO the real server does
 * (`server/protocolo/protocolo.dto.ts`), so what the client parses under mock
 * is the shape it parses in production.
 */
export function lookupReply(num: string | null): MockReply {
  if (!num || !/^\d{15}$/.test(num)) {
    return { status: 400, type: 'json', body: { message: 'protocoloId deve ter 15 dígitos' } }
  }
  if (num.endsWith(LOOKUP_FAILS_ON)) {
    return { status: 503, type: 'json', body: { message: 'Serviço indisponível' } }
  }
  return {
    status: 200,
    type: 'json',
    body: { id: mockIdFor(num), numprotocolo: num, data: '2026-08-26' },
  }
}

/** `ENDPOINTS.protocol` — `/<id>` */
export function protocolReply(id: string): MockReply {
  if (id.endsWith(PROTOCOL_FAILS_ON)) {
    const failure = PROTOCOL_FAILURES[hash(id) % PROTOCOL_FAILURES.length]
    return { status: failure.status, type: 'text', body: failure.reason }
  }
  return { status: 200, type: 'json', body: { id, situacao: 'protocolado' } }
}

/** `ENDPOINTS.protocolAs` — `/<id>` */
export function protocolAsReply(id: string): MockReply {
  if (id.endsWith(AS_FAILS_ON)) {
    return { status: 422, type: 'text', body: 'AS recusado pelo serviço' }
  }
  return { status: 200, type: 'json', body: { id, situacao: 'as-protocolado' } }
}

/**
 * `ENDPOINTS.login` — `{ email, senha }`
 *
 * Any non-empty pair is accepted: the mock is here to exercise the app's own
 * flow, not to be an authentication system. Two cases are worth failing on
 * anyway, because both are real bugs the app should survive.
 *
 * | credentials      | behaviour                                    |
 * | ---------------- | -------------------------------------------- |
 * | empty            | 400 — the client sent a blank field           |
 * | senha `errado`   | 401 — so the login screen's error path is testable |
 * | anything else    | 200 with MOCK_TOKEN and MOCK_USER             |
 */
export function loginReply(email: string | null, senha: string | null): MockReply {
  if (!email || !senha) {
    return { status: 400, type: 'json', body: { message: 'Informe usuário e senha' } }
  }
  if (senha === 'errado') {
    return { status: 401, type: 'json', body: { message: 'Usuário ou senha inválidos' } }
  }
  return {
    status: 200,
    type: 'json',
    body: { token: MOCK_TOKEN, usuario: { ...MOCK_USER } },
  }
}
