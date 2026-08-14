import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupProtocolId, protocolAsById, protocolById, readId } from './api'
import { LOOKUP_URL, PROTOCOL_AS_URL, PROTOCOL_URL } from './config'
import { server } from '../mocks/server'

const NUM = '202601300217719'

/**
 * The absolute URL a configured endpoint resolves to, built exactly as
 * `resolveUrl` in `api.ts` builds it.
 *
 * Endpoints come from the environment and may be relative (`/api/protocols`)
 * or absolute (a real service). Comparing resolved URLs rather than bare
 * pathnames keeps these assertions true under either.
 */
function endpoint(path: string): string {
  return new URL(path, location.origin).href
}

describe('readId', () => {
  it.each([
    ['lowercase id', { id: 'abc' }],
    ['PascalCase Id', { Id: 'abc' }],
    ['uppercase ID', { ID: 'abc' }],
    ['protocolId', { protocolId: 'abc' }],
    ['idProtocolo', { idProtocolo: 'abc' }],
    ['bare string body', 'abc'],
  ])('accepts %s', (_label, body) => {
    expect(readId(body)).toBe('abc')
  })

  it('coerces a numeric id to a string', () => {
    expect(readId({ id: 42 })).toBe('42')
    expect(readId(42)).toBe('42')
  })

  it.each([
    ['null', null],
    ['empty object', {}],
    ['blank string', '   '],
    ['empty id', { id: '' }],
  ])('rejects %s', (_label, body) => {
    expect(readId(body)).toBeNull()
  })
})

describe('lookupProtocolId', () => {
  it('sends the number as ?protocoloId and returns the id', async () => {
    let seen: string | null = null
    server.use(
      http.all(LOOKUP_URL, ({ request }) => {
        seen = new URL(request.url).searchParams.get('protocoloId')
        return HttpResponse.json({ id: 'PRT-1' })
      }),
    )

    const result = await lookupProtocolId(NUM)
    expect(seen).toBe(NUM)
    expect(result).toEqual({ ok: true, id: 'PRT-1' })
  })

  it('reports an HTTP failure with its status', async () => {
    server.use(
      http.all(LOOKUP_URL, () => HttpResponse.json({}, { status: 503 })),
    )
    const result = await lookupProtocolId(NUM)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.httpStatus).toBe(503)
  })

  it('treats a 200 with no id as a failure rather than a success', async () => {
    server.use(http.all(LOOKUP_URL, () => HttpResponse.json({ nada: true })))
    const result = await lookupProtocolId(NUM)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/sem id/i)
  })

  it('reports a network error instead of throwing', async () => {
    server.use(http.all(LOOKUP_URL, () => HttpResponse.error()))
    const result = await lookupProtocolId(NUM)
    expect(result.ok).toBe(false)
  })

  it('reports a caller abort instead of throwing', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await lookupProtocolId(NUM, controller.signal)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('Cancelado')
  })
})

describe('protocolById / protocolAsById', () => {
  it('appends the id as a path segment on the ordinary endpoint', async () => {
    let url: string | null = null
    server.use(
      http.all(`${PROTOCOL_URL}/:id`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    const result = await protocolById('PRT-1')
    expect(url).toBe(endpoint(`${PROTOCOL_URL}/PRT-1`))
    expect(result.ok).toBe(true)
  })

  it('uses the separate AS endpoint, not the ordinary one', async () => {
    let url: string | null = null
    server.use(
      http.all(`${PROTOCOL_AS_URL}/:id`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    await protocolAsById('PRT-1')
    expect(url).toBe(endpoint(`${PROTOCOL_AS_URL}/PRT-1`))
    expect(PROTOCOL_AS_URL).not.toBe(PROTOCOL_URL)
  })

  it('percent-encodes an id with awkward characters', async () => {
    let url: string | null = null
    server.use(
      http.all(`${PROTOCOL_URL}/:id`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    await protocolById('a/b c')
    expect(url).toBe(endpoint(`${PROTOCOL_URL}/a%2Fb%20c`))
  })

  it("surfaces the service's own error text, which is more useful than a code", async () => {
    server.use(
      http.all(`${PROTOCOL_URL}/:id`, () =>
        HttpResponse.text('Protocolo já processado', { status: 409 }),
      ),
    )

    const result = await protocolById('PRT-1')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Protocolo já processado')
    if (!result.ok) expect(result.httpStatus).toBe(409)
  })

  it('digs the message out of a JSON error envelope', async () => {
    server.use(
      http.all(`${PROTOCOL_URL}/:id`, () =>
        HttpResponse.json({ message: 'Protocolo bloqueado' }, { status: 403 }),
      ),
    )

    const result = await protocolById('PRT-1')
    expect(result.reason).toContain('Protocolo bloqueado')
  })

  it('does not show the user a fragment of an HTML error page', async () => {
    // What a proxy or gateway returns when the real service is unreachable.
    server.use(
      http.all(`${PROTOCOL_URL}/:id`, () =>
        HttpResponse.text('<!doctype html><title>502 Bad Gateway</title>', {
          status: 502,
        }),
      ),
    )

    const result = await protocolById('PRT-1')
    expect(result.reason).not.toContain('<')
    if (!result.ok) expect(result.httpStatus).toBe(502)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HTTP methods
// ─────────────────────────────────────────────────────────────────────────────

describe('HTTP methods', () => {
  /**
   * The verb for each call is a constant at the top of `api.ts`. Production
   * answers the lookup on GET and both submissions on PUT, so that is pinned
   * here: every other handler in this file is `http.all` and would happily
   * answer the wrong verb, which is how a change to those constants could
   * otherwise reach production without a single test going red.
   */
  it('sends GET for the lookup and PUT for both submissions', async () => {
    const seen: Record<string, string> = {}
    server.use(
      http.all(LOOKUP_URL, ({ request }) => {
        seen.lookup = request.method
        return HttpResponse.json({ id: 'PRT-1' })
      }),
      http.all(`${PROTOCOL_URL}/:id`, ({ request }) => {
        seen.protocol = request.method
        return HttpResponse.json({ ok: true })
      }),
      http.all(`${PROTOCOL_AS_URL}/:id`, ({ request }) => {
        seen.as = request.method
        return HttpResponse.json({ ok: true })
      }),
    )

    await lookupProtocolId(NUM)
    await protocolById('PRT-1')
    await protocolAsById('PRT-1')

    expect(seen).toEqual({ lookup: 'GET', protocol: 'PUT', as: 'PUT' })
  })

  it('sends no request body on a GET, which cannot carry one', async () => {
    let hadBody: boolean | null = null
    server.use(
      http.all(LOOKUP_URL, ({ request }) => {
        hadBody = request.body !== null
        return HttpResponse.json({ id: 'PRT-1' })
      }),
    )

    await lookupProtocolId(NUM)
    expect(hadBody).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

describe('bearer token', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /**
   * `AUTH_TOKEN` is read once, when `config.ts` is first evaluated, so changing
   * it means re-importing the module graph rather than reassigning a value.
   */
  async function apiWith(token: string) {
    vi.stubEnv('VITE_AUTH_TOKEN', token)
    vi.resetModules()
    return import('./api')
  }

  /** The Authorization header seen by each of the three endpoints, in order. */
  async function authHeadersSeen(api: typeof import('./api')) {
    const seen: (string | null)[] = []
    const record = ({ request }: { request: Request }) => {
      seen.push(request.headers.get('authorization'))
      return HttpResponse.json({ id: 'PRT-1' })
    }
    server.use(
      http.all(LOOKUP_URL, record),
      http.all(`${PROTOCOL_URL}/:id`, record),
      http.all(`${PROTOCOL_AS_URL}/:id`, record),
    )

    await api.lookupProtocolId(NUM)
    await api.protocolById('PRT-1')
    await api.protocolAsById('PRT-1')
    return seen
  }

  it('rides on every request, not just the submissions', async () => {
    const api = await apiWith('s3cr3t')
    expect(await authHeadersSeen(api)).toEqual([
      'Bearer s3cr3t',
      'Bearer s3cr3t',
      'Bearer s3cr3t',
    ])
  })

  it('is omitted entirely when no token is configured', async () => {
    // A bare `Bearer ` reads as a malformed credential and tends to draw a 400
    // rather than the 401 that would say the token is missing.
    const api = await apiWith('')
    expect(await authHeadersSeen(api)).toEqual([null, null, null])
  })

  it('tolerates whitespace around the value in .env', async () => {
    const api = await apiWith('  s3cr3t\n')
    expect(await authHeadersSeen(api)).toEqual([
      'Bearer s3cr3t',
      'Bearer s3cr3t',
      'Bearer s3cr3t',
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The mock transport
// ─────────────────────────────────────────────────────────────────────────────

describe('mock handlers', () => {
  /**
   * The method for each call is a constant in `api.ts` that is expected to
   * change once the real service is pinned down. These guard the claim that
   * changing it is all you have to do: the mocks must not be GET-only.
   */
  it('answers a lookup sent as a POST with a body', async () => {
    const response = await fetch(new URL(LOOKUP_URL, location.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocoloId: NUM }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: `PRT-${NUM.slice(-6)}` })
  })

  it('answers a submission sent as a POST', async () => {
    const response = await fetch(
      new URL(`${PROTOCOL_URL}/PRT-217719`, location.origin),
      { method: 'POST' },
    )
    expect(response.status).toBe(200)
  })
})
