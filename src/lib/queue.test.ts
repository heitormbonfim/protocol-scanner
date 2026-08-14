import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROTOCOL_AS_URL, PROTOCOL_URL } from './config'
import { pendingRecords, recordOutcomes, runProtocolQueue } from './queue'
import { server } from '../mocks/server'
import type { ProtocolRecord } from '../types'

/** Records every request the queue makes, in order, as absolute URLs. */
function trackRequests() {
  const calls: string[] = []
  server.events.on('request:start', ({ request }) => {
    calls.push(request.url)
  })
  return calls
}

/**
 * The absolute URL a configured endpoint resolves to, built exactly as
 * `resolveUrl` in `api.ts` builds it.
 *
 * Endpoints may be relative or absolute depending on the environment, so these
 * assertions compare resolved URLs rather than bare pathnames. Exact matches
 * rather than `startsWith`, too: the AS endpoint's path routinely begins with
 * the ordinary one's (`…/protocols` and `…/protocols-as`), so a prefix test
 * cannot tell the two apart.
 */
function endpoint(path: string): string {
  return new URL(path, location.origin).href
}

function makeRecord(overrides: Partial<ProtocolRecord> = {}): ProtocolRecord {
  return {
    num: '202601300217719',
    id: 'PRT-217719',
    scannedAt: 0,
    source: 'anchored',
    withAs: false,
    lookup: { status: 'ok' },
    protocol: { status: 'idle' },
    as: { status: 'idle' },
    ...overrides,
  }
}

beforeEach(() => {
  server.events.removeAllListeners()
})

describe('pendingRecords', () => {
  it('skips a record with nothing left to do', () => {
    const done = makeRecord({ protocol: { status: 'success' } })
    expect(pendingRecords([done])).toHaveLength(0)
  })

  it('keeps a record whose protocol succeeded but whose AS has not run', () => {
    const partial = makeRecord({ withAs: true, protocol: { status: 'success' } })
    expect(pendingRecords([partial])).toHaveLength(1)
  })

  it('keeps a fully settled AS record out of the queue', () => {
    const done = makeRecord({
      withAs: true,
      protocol: { status: 'success' },
      as: { status: 'success' },
    })
    expect(pendingRecords([done])).toHaveLength(0)
  })
})

describe('runProtocolQueue — the AS rule', () => {
  it('never calls the AS endpoint when AS was not requested', async () => {
    const calls = trackRequests()
    await runProtocolQueue([makeRecord({ withAs: false })])

    expect(calls).toEqual([endpoint(`${PROTOCOL_URL}/PRT-217719`)])
  })

  it('calls the ordinary protocol BEFORE AS, never the other way round', async () => {
    const calls = trackRequests()
    await runProtocolQueue([makeRecord({ withAs: true })])

    const protocolAt = calls.indexOf(endpoint(`${PROTOCOL_URL}/PRT-217719`))
    const asAt = calls.indexOf(endpoint(`${PROTOCOL_AS_URL}/PRT-217719`))
    expect(protocolAt).toBeGreaterThanOrEqual(0)
    expect(asAt).toBeGreaterThan(protocolAt)
  })

  it('does NOT send AS when the ordinary protocol fails', async () => {
    // The core invariant: AS is an add-on, never valid on its own.
    server.use(
      http.all(`${PROTOCOL_URL}/:id`, () =>
        HttpResponse.text('falhou', { status: 500 }),
      ),
    )
    const calls = trackRequests()
    const outcomes = await runProtocolQueue([makeRecord({ withAs: true })])

    expect(calls).not.toContain(endpoint(`${PROTOCOL_AS_URL}/PRT-217719`))

    const as = outcomes.find((outcome) => outcome.kind === 'as')
    expect(as?.ok).toBe(false)
    expect(as?.reason).toMatch(/protocolo comum falhou/i)
  })

  it('does NOT send AS when the record never got an id', async () => {
    const calls = trackRequests()
    const outcomes = await runProtocolQueue([
      makeRecord({
        withAs: true,
        id: null,
        lookup: { status: 'failed', reason: 'HTTP 503' },
      }),
    ])

    expect(calls).toHaveLength(0)
    expect(outcomes).toHaveLength(2)
    expect(outcomes.every((outcome) => !outcome.ok)).toBe(true)
    // Reported rather than skipped: the user must not think it was submitted.
    expect(outcomes[0].reason).toMatch(/sem id/i)
  })

  it('reports an AS failure without disturbing the successful protocol', async () => {
    // Mock routes ids ending in 99 to an AS failure.
    const outcomes = await runProtocolQueue([
      makeRecord({ withAs: true, num: '202601300217799', id: 'PRT-217799' }),
    ])

    expect(outcomes.find((o) => o.kind === 'protocol')?.ok).toBe(true)
    expect(outcomes.find((o) => o.kind === 'as')?.ok).toBe(false)
    expect(outcomes.find((o) => o.kind === 'as')?.httpStatus).toBe(422)
  })

  it('skips a protocol that already succeeded but still sends its AS', async () => {
    const calls = trackRequests()
    await runProtocolQueue([
      makeRecord({ withAs: true, protocol: { status: 'success' } }),
    ])

    expect(calls).toEqual([endpoint(`${PROTOCOL_AS_URL}/PRT-217719`)])
  })
})

describe('runProtocolQueue — sequencing', () => {
  it('sends one request at a time, never in parallel', async () => {
    let inFlight = 0
    let maxInFlight = 0
    server.use(
      http.all(`${PROTOCOL_URL}/:id`, async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return HttpResponse.json({ ok: true })
      }),
    )

    await runProtocolQueue([
      makeRecord({ num: '202601300217701', id: 'PRT-217701' }),
      makeRecord({ num: '202601300217702', id: 'PRT-217702' }),
      makeRecord({ num: '202601300217703', id: 'PRT-217703' }),
    ])

    expect(maxInFlight).toBe(1)
  })

  it('reports progress for every record', async () => {
    const onProgress = vi.fn()
    await runProtocolQueue(
      [
        makeRecord({ num: '202601300217701', id: 'PRT-217701' }),
        makeRecord({ num: '202601300217702', id: 'PRT-217702' }),
      ],
      { onProgress },
    )

    const last = onProgress.mock.lastCall?.[0]
    expect(last).toEqual({ done: 2, total: 2, current: null })
  })

  it('stops early when aborted', async () => {
    const controller = new AbortController()
    const calls = trackRequests()

    server.use(
      http.all(`${PROTOCOL_URL}/:id`, () => {
        controller.abort()
        return HttpResponse.json({ ok: true })
      }),
    )

    await runProtocolQueue(
      [
        makeRecord({ num: '202601300217701', id: 'PRT-217701' }),
        makeRecord({ num: '202601300217702', id: 'PRT-217702' }),
        makeRecord({ num: '202601300217703', id: 'PRT-217703' }),
      ],
      { signal: controller.signal },
    )

    expect(calls.length).toBeLessThan(3)
  })
})

describe('recordOutcomes', () => {
  it('emits nothing for an untouched record', () => {
    expect(recordOutcomes(makeRecord())).toHaveLength(0)
  })

  it('emits one row for a protocol-only record', () => {
    const rows = recordOutcomes(
      makeRecord({ protocol: { status: 'success', reason: 'ok' } }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('protocol')
  })

  it('emits both rows for an AS record, carrying id, number and reason', () => {
    const rows = recordOutcomes(
      makeRecord({
        withAs: true,
        protocol: { status: 'success', reason: 'Protocolo protocolado' },
        as: { status: 'failed', reason: 'AS recusado' },
      }),
    )
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.kind)).toEqual(['protocol', 'as'])
    for (const row of rows) {
      expect(row.num).toBe('202601300217719')
      expect(row.id).toBe('PRT-217719')
      expect(row.reason).not.toBe('')
    }
  })

  it('reports a skipped AS as a failure so it cannot be mistaken for done', () => {
    const rows = recordOutcomes(
      makeRecord({
        withAs: true,
        protocol: { status: 'failed', reason: 'HTTP 500' },
        as: { status: 'skipped', reason: 'AS não enviado' },
      }),
    )
    expect(rows.find((row) => row.kind === 'as')?.ok).toBe(false)
  })

  it('ignores the AS step when AS was not requested', () => {
    const rows = recordOutcomes(
      makeRecord({
        withAs: false,
        protocol: { status: 'success', reason: 'ok' },
        as: { status: 'failed', reason: 'stale' },
      }),
    )
    expect(rows).toHaveLength(1)
  })
})
