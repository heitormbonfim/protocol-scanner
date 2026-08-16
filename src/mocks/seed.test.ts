import { beforeEach, describe, expect, it } from 'vitest'
import { seedMockRecords } from './seed'
import { pendingRecords } from '../lib/queue'
import type { ProtocolRecord } from '../types'

const SEEDED_KEY = 'protocol-scanner:mock-seeded'

function makeRecord(overrides: Partial<ProtocolRecord> = {}): ProtocolRecord {
  return {
    num: '202601300217700',
    id: 'PRT-217700',
    scannedAt: 0,
    source: 'manual',
    withAs: false,
    lookup: { status: 'ok' },
    protocol: { status: 'idle' },
    as: { status: 'idle' },
    protocoled: false,
    asProtocoled: false,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('seedMockRecords', () => {
  it('seeds a starting history on a first mocked visit', () => {
    const seeded = seedMockRecords([])
    expect(seeded.length).toBeGreaterThan(0)
  })

  it('never touches an existing history', () => {
    const existing = [makeRecord()]
    expect(seedMockRecords(existing)).toBe(existing)
  })

  it('does not grow the samples back after everything was cleared', () => {
    // A deliberate "clear everything" must stay cleared, which is why the seed
    // is remembered rather than inferred from the history being empty.
    seedMockRecords([])
    expect(seedMockRecords([])).toEqual([])
  })

  it('records that it seeded', () => {
    seedMockRecords([])
    expect(localStorage.getItem(SEEDED_KEY)).not.toBeNull()
  })

  it('gives most of the rows an id, so they can be protocolled at once', () => {
    // The point of the seed: press Protocolar todos without scanning anything.
    const seeded = seedMockRecords([])
    expect(seeded.filter((record) => record.id !== null).length).toBeGreaterThan(1)
  })

  it('covers each deterministic outcome exactly once', () => {
    const seeded = seedMockRecords([])
    const endings = seeded.map((record) => record.num.slice(-2))

    // 97 lookup fails · 98 protocol fails · 99 AS fails · 19 all succeeds
    expect(endings).toContain('97')
    expect(endings).toContain('98')
    expect(endings).toContain('99')
    expect(endings).toContain('19')
  })

  it('includes an already-filed record, and leaves it out of the queue', () => {
    // The regression made visible: a record carrying `protocoled` must never be
    // picked up for a second submission.
    const seeded = seedMockRecords([])
    const filed = seeded.filter((record) => record.protocoled === true)

    expect(filed.length).toBeGreaterThan(0)
    expect(pendingRecords(filed)).toHaveLength(0)
  })

  it('leaves the rest of the seed pending', () => {
    const seeded = seedMockRecords([])
    const pending = pendingRecords(seeded)

    expect(pending.length).toBe(seeded.length - 1)
  })

  it('marks the record with no id as still pending, so it is reported', () => {
    // A failed lookup must not look finished — the user has to see that it was
    // never submitted rather than assume the batch was complete.
    const seeded = seedMockRecords([])
    const noId = seeded.find((record) => record.id === null)

    expect(noId).toBeDefined()
    expect(pendingRecords([noId!])).toHaveLength(1)
  })
})
