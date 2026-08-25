import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupProtocolId, protocolAsById, protocolById, readId } from './api'
import { ENDPOINTS } from './endpoints'
import { server } from '../mocks/server'

const NUM = '202601300217719'

/**
 * The absolute URL a configured endpoint resolves to, built exactly as
 * `resolveUrl` in `api.ts` builds it.
 *
 * The base URL is empty while mocking and absolute when it is off, so paths
 * resolve differently depending on configuration. Comparing resolved URLs
 * rather than bare pathnames keeps these assertions true under either.
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
      http.all(ENDPOINTS.lookup.path, ({ request }) => {
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
      http.all(ENDPOINTS.lookup.path, () => HttpResponse.json({}, { status: 503 })),
    )
    const result = await lookupProtocolId(NUM)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.httpStatus).toBe(503)
  })

  it('treats a 200 with no id as a failure rather than a success', async () => {
    server.use(http.all(ENDPOINTS.lookup.path, () => HttpResponse.json({ nada: true })))
    const result = await lookupProtocolId(NUM)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/sem id/i)
  })

  it('reports a network error instead of throwing', async () => {
    server.use(http.all(ENDPOINTS.lookup.path, () => HttpResponse.error()))
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
      http.all(`${ENDPOINTS.protocol.path}/:id`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    const result = await protocolById('PRT-1')
    expect(url).toBe(endpoint(`${ENDPOINTS.protocol.path}/PRT-1`))
    expect(result.ok).toBe(true)
  })

  it('uses the separate AS endpoint, not the ordinary one', async () => {
    let url: string | null = null
    server.use(
      http.all(`${ENDPOINTS.protocolAs.path}/:id`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    await protocolAsById('PRT-1')
    expect(url).toBe(endpoint(`${ENDPOINTS.protocolAs.path}/PRT-1`))
    expect(ENDPOINTS.protocolAs.path).not.toBe(ENDPOINTS.protocol.path)
  })

  it('percent-encodes an id with awkward characters', async () => {
    let url: string | null = null
    server.use(
      http.all(`${ENDPOINTS.protocol.path}/:id`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    await protocolById('a/b c')
    expect(url).toBe(endpoint(`${ENDPOINTS.protocol.path}/a%2Fb%20c`))
  })

  it("surfaces the service's own error text, which is more useful than a code", async () => {
    server.use(
      http.all(`${ENDPOINTS.protocol.path}/:id`, () =>
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
      http.all(`${ENDPOINTS.protocol.path}/:id`, () =>
        HttpResponse.json({ message: 'Protocolo bloqueado' }, { status: 403 }),
      ),
    )

    const result = await protocolById('PRT-1')
    expect(result.reason).toContain('Protocolo bloqueado')
  })

  it('does not show the user a fragment of an HTML error page', async () => {
    // What a proxy or gateway returns when the real service is unreachable.
    server.use(
      http.all(`${ENDPOINTS.protocol.path}/:id`, () =>
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
   * The verb for each call lives in `endpoints.ts`. Production
   * answers the lookup on GET and both submissions on PUT, so that is pinned
   * here: every other handler in this file is `http.all` and would happily
   * answer the wrong verb, which is how a change to those constants could
   * otherwise reach production without a single test going red.
   */
  it('sends GET for the lookup and PUT for both submissions', async () => {
    const seen: Record<string, string> = {}
    server.use(
      http.all(ENDPOINTS.lookup.path, ({ request }) => {
        seen.lookup = request.method
        return HttpResponse.json({ id: 'PRT-1' })
      }),
      http.all(`${ENDPOINTS.protocol.path}/:id`, ({ request }) => {
        seen.protocol = request.method
        return HttpResponse.json({ ok: true })
      }),
      http.all(`${ENDPOINTS.protocolAs.path}/:id`, ({ request }) => {
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
      http.all(ENDPOINTS.lookup.path, ({ request }) => {
        hadBody = request.body !== null
        return HttpResponse.json({ id: 'PRT-1' })
      }),
    )

    await lookupProtocolId(NUM)
    expect(hadBody).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Older Safari
// ─────────────────────────────────────────────────────────────────────────────

describe('without AbortSignal.any / AbortSignal.timeout', () => {
  /**
   * `AbortSignal.any` is Safari 17.4+ and `AbortSignal.timeout` is Safari 16+.
   * On an older iPhone their absence made every single request throw a
   * `TypeError` before it left the app — the page loaded and nothing submitted.
   * These remove the statics to prove the fallbacks carry the same behaviour.
   */
  function withoutStatics(names: ('any' | 'timeout')[]) {
    const saved = { any: AbortSignal.any, timeout: AbortSignal.timeout }

    for (const name of names) {
      // Deleting a non-optional static is exactly what an older engine looks
      // like from the code's point of view, which is the whole point here.
      delete (AbortSignal as Partial<typeof AbortSignal>)[name]
    }

    return () => {
      // Restored one branch at a time: assigning through a union of the two
      // signatures loses the correlation between name and value.
      for (const name of names) {
        if (name === 'any') AbortSignal.any = saved.any
        else AbortSignal.timeout = saved.timeout
      }
    }
  }

  it('still reports a caller abort that happened before the call', async () => {
    const restore = withoutStatics(['any', 'timeout'])
    try {
      const controller = new AbortController()
      controller.abort()

      const result = await lookupProtocolId(NUM, controller.signal)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('Cancelado')
    } finally {
      restore()
    }
  })

  it('still reports a caller abort raised mid-request', async () => {
    const restore = withoutStatics(['any', 'timeout'])
    try {
      const controller = new AbortController()
      server.use(
        http.all(ENDPOINTS.lookup.path, async () => {
          controller.abort()
          await new Promise((resolve) => setTimeout(resolve, 10))
          return HttpResponse.json({ id: 'PRT-1' })
        }),
      )

      const result = await lookupProtocolId(NUM, controller.signal)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('Cancelado')
    } finally {
      restore()
    }
  })

  it('still succeeds when nothing aborts', async () => {
    const restore = withoutStatics(['any', 'timeout'])
    try {
      server.use(http.all(ENDPOINTS.lookup.path, () => HttpResponse.json({ id: 'PRT-1' })))

      const controller = new AbortController()
      const result = await lookupProtocolId(NUM, controller.signal)
      expect(result).toEqual({ ok: true, id: 'PRT-1' })
    } finally {
      restore()
    }
  })

  it('keeps a timeout distinguishable from a cancel when both are combined', async () => {
    // With a caller signal present the timeout arrives *through* the combiner,
    // which has to forward the original reason. Drop it and every timeout
    // reports as "Cancelado" — the user is told they cancelled something they
    // did not.
    const restore = withoutStatics(['any', 'timeout'])
    try {
      vi.stubEnv('VITE_REQUEST_TIMEOUT_MS', '10')
      vi.resetModules()
      const api = await import('./api')

      server.use(
        http.all(ENDPOINTS.lookup.path, async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return HttpResponse.json({ id: 'PRT-1' })
        }),
      )

      // Never aborted — it is only here to force the combiner path.
      const controller = new AbortController()
      const result = await api.lookupProtocolId(NUM, controller.signal)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/tempo esgotado/i)
    } finally {
      restore()
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('reports a timeout as a timeout, not as a generic failure', async () => {
    // The fallback has to abort with a `TimeoutError`, since that is the name
    // `describeError` matches to produce the "Tempo esgotado" message.
    const restore = withoutStatics(['timeout'])
    try {
      vi.stubEnv('VITE_REQUEST_TIMEOUT_MS', '10')
      vi.resetModules()
      const api = await import('./api')

      server.use(
        http.all(ENDPOINTS.lookup.path, async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return HttpResponse.json({ id: 'PRT-1' })
        }),
      )

      const result = await api.lookupProtocolId(NUM)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/tempo esgotado/i)
    } finally {
      restore()
      vi.unstubAllEnvs()
      vi.resetModules()
    }
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
      http.all(ENDPOINTS.lookup.path, record),
      http.all(`${ENDPOINTS.protocol.path}/:id`, record),
      http.all(`${ENDPOINTS.protocolAs.path}/:id`, record),
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
// Mock safety — nothing real goes out while mocking is on
// ─────────────────────────────────────────────────────────────────────────────

describe('mock safety', () => {
  /**
   * The trap this guards against.
   *
   * The mock is served by the dev server, so it can only intercept requests
   * that reach the dev server. Point the app at the real service and turn
   * mocking on, and the browser goes straight past the dev server to the real
   * host: mocking appears to be on, and every submission is a real protocol
   * filed against a live government service. There is no undo.
   *
   * So there are two independent defences, and both are asserted here.
   *
   *   1. `API_URL` is *derived* from `USE_MOCK` rather than merely defaulted —
   *      while mocking it is '', so no value of VITE_API_URL can point a call
   *      off-origin. That makes the dangerous state unreachable by
   *      configuration, which is where it used to come from.
   *   2. `request` still refuses anything that would leave this origin, which
   *      now covers the remaining route in: a bad path in `endpoints.ts`.
   */
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('./endpoints')
    vi.resetModules()
  })

  async function configuredWith(env: Record<string, string>) {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    vi.resetModules()
    return { api: await import('./api'), config: await import('./config') }
  }

  const REAL = 'https://real-service.example'

  it('ignores the configured base entirely while mocking', async () => {
    const { config } = await configuredWith({
      VITE_USE_MOCK: 'true',
      VITE_API_URL: REAL,
    })

    expect(config.API_URL).toBe('')
  })

  it('uses the configured base when mocking is off', async () => {
    // The whole point of turning mocking off — this must keep working.
    const { config } = await configuredWith({
      VITE_USE_MOCK: 'false',
      VITE_API_URL: REAL,
    })

    expect(config.API_URL).toBe(REAL)
  })

  it('strips a trailing slash so the path is never doubled', async () => {
    const { config } = await configuredWith({
      VITE_USE_MOCK: 'false',
      VITE_API_URL: `${REAL}/`,
    })

    expect(config.API_URL).toBe(REAL)
  })

  it('does send the real cross-origin request when mocking is off', async () => {
    // The counterpart to the guard: turning mocking off must still reach the
    // real service, or the safety net has quietly broken production.
    const { api } = await configuredWith({
      VITE_USE_MOCK: 'false',
      VITE_API_URL: REAL,
    })

    let seen: string | null = null
    server.use(
      http.all(`${REAL}${ENDPOINTS.protocol.path}/:id`, ({ request }) => {
        seen = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    const result = await api.protocolById('PRT-1')

    expect(result.ok).toBe(true)
    expect(seen).toBe(`${REAL}${ENDPOINTS.protocol.path}/PRT-1`)
  })

  it('submits to this origin rather than the real host while mocking', async () => {
    const { api } = await configuredWith({
      VITE_USE_MOCK: 'true',
      VITE_API_URL: REAL,
    })

    let seen: string | null = null
    server.use(
      http.all(`${ENDPOINTS.protocol.path}/:id`, ({ request }) => {
        seen = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    const result = await api.protocolById('PRT-1')

    expect(result.ok).toBe(true)
    expect(seen).toBe(endpoint(`${ENDPOINTS.protocol.path}/PRT-1`))
    expect(seen).not.toContain('real-service.example')
  })

  /**
   * Force a bad path into the endpoint table.
   *
   * Now that the base is derived from `USE_MOCK`, configuration can no longer
   * send a call off-origin — so the only remaining way in is a mistake in
   * `endpoints.ts` itself. A protocol-relative path is the realistic slip: it
   * looks like a path, but `new URL` resolves it against the page's scheme and
   * lands on another host.
   */
  async function withEndpointPath(path: string) {
    vi.stubEnv('VITE_USE_MOCK', 'true')
    vi.resetModules()
    vi.doMock('./endpoints', () => ({
      ENDPOINTS: {
        lookup: { method: 'GET', path },
        protocol: { method: 'PUT', path },
        protocolAs: { method: 'PUT', path },
      },
    }))
    return await import('./api')
  }

  it('refuses a request that would still leave this origin, and sends nothing', async () => {
    const api = await withEndpointPath('//real-service.example/protocolo')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await api.protocolById('PRT-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/bloqueado/i)
    // The assertion that matters: it was refused *before* anything was sent.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still refuses the AS submission, which is the one with no undo', async () => {
    const api = await withEndpointPath('//real-service.example/protocolo-as')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await api.protocolAsById('PRT-1')

    expect(result.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The mock transport
// ─────────────────────────────────────────────────────────────────────────────

describe('mock handlers', () => {
  /**
   * The method for each call lives in `endpoints.ts` and is expected to
   * change once the real service is pinned down. These guard the claim that
   * changing it is all you have to do: the mocks must not be GET-only.
   */
  it('answers a lookup sent as a POST with a body', async () => {
    const response = await fetch(new URL(ENDPOINTS.lookup.path, location.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocoloId: NUM }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: `PRT-${NUM.slice(-6)}` })
  })

  it('answers a submission sent as a POST', async () => {
    const response = await fetch(
      new URL(`${ENDPOINTS.protocol.path}/PRT-217719`, location.origin),
      { method: 'POST' },
    )
    expect(response.status).toBe(200)
  })
})
