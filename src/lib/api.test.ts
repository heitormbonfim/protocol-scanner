import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { lookupProtocolId, protocolAsById, protocolById, readId } from './api'
import { LOOKUP_URL, PROTOCOL_AS_URL, PROTOCOL_URL } from './config'
import { server } from '../mocks/server'

const NUM = '202601300217719'

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
  it('sends the number as ?numprotocol and returns the id', async () => {
    let seen: string | null = null
    server.use(
      http.get(LOOKUP_URL, ({ request }) => {
        seen = new URL(request.url).searchParams.get('numprotocol')
        return HttpResponse.json({ id: 'PRT-1' })
      }),
    )

    const result = await lookupProtocolId(NUM)
    expect(seen).toBe(NUM)
    expect(result).toEqual({ ok: true, id: 'PRT-1' })
  })

  it('reports an HTTP failure with its status', async () => {
    server.use(
      http.get(LOOKUP_URL, () => HttpResponse.json({}, { status: 503 })),
    )
    const result = await lookupProtocolId(NUM)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.httpStatus).toBe(503)
  })

  it('treats a 200 with no id as a failure rather than a success', async () => {
    server.use(http.get(LOOKUP_URL, () => HttpResponse.json({ nada: true })))
    const result = await lookupProtocolId(NUM)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/sem id/i)
  })

  it('reports a network error instead of throwing', async () => {
    server.use(http.get(LOOKUP_URL, () => HttpResponse.error()))
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
    let path: string | null = null
    server.use(
      http.get(`${PROTOCOL_URL}/:id`, ({ request }) => {
        path = new URL(request.url).pathname
        return HttpResponse.json({ ok: true })
      }),
    )

    const result = await protocolById('PRT-1')
    expect(path).toBe(`${PROTOCOL_URL}/PRT-1`)
    expect(result.ok).toBe(true)
  })

  it('uses the separate AS endpoint, not the ordinary one', async () => {
    let path: string | null = null
    server.use(
      http.get(`${PROTOCOL_AS_URL}/:id`, ({ request }) => {
        path = new URL(request.url).pathname
        return HttpResponse.json({ ok: true })
      }),
    )

    await protocolAsById('PRT-1')
    expect(path).toBe(`${PROTOCOL_AS_URL}/PRT-1`)
    expect(PROTOCOL_AS_URL).not.toBe(PROTOCOL_URL)
  })

  it('percent-encodes an id with awkward characters', async () => {
    let path: string | null = null
    server.use(
      http.get(`${PROTOCOL_URL}/:id`, ({ request }) => {
        path = new URL(request.url).pathname
        return HttpResponse.json({ ok: true })
      }),
    )

    await protocolById('a/b c')
    expect(path).toBe(`${PROTOCOL_URL}/a%2Fb%20c`)
  })

  it("surfaces the service's own error text, which is more useful than a code", async () => {
    server.use(
      http.get(`${PROTOCOL_URL}/:id`, () =>
        HttpResponse.text('Protocolo já processado', { status: 409 }),
      ),
    )

    const result = await protocolById('PRT-1')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Protocolo já processado')
    if (!result.ok) expect(result.httpStatus).toBe(409)
  })
})
