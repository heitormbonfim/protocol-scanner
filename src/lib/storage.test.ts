import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRecords, loadRecords, saveRecords } from './storage'
import type { ProtocolRecord } from '../types'

const KEY = 'protocol-scanner:records'

function makeRecord(overrides: Partial<ProtocolRecord> = {}): ProtocolRecord {
  return {
    num: '202601300217719',
    id: 'PRT-217719',
    scannedAt: 1_700_000_000_000,
    source: 'anchored',
    withAs: false,
    lookup: { status: 'ok' },
    protocol: { status: 'idle' },
    as: { status: 'idle' },
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('saveRecords / loadRecords', () => {
  it('round-trips a record', () => {
    const record = makeRecord({ withAs: true, editedAt: 123 })
    saveRecords([record])
    expect(loadRecords()).toEqual([record])
  })

  it('returns an empty history when nothing is stored', () => {
    expect(loadRecords()).toEqual([])
  })

  it('survives corrupt JSON rather than throwing', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadRecords()).toEqual([])
  })

  it('survives a non-array payload', () => {
    localStorage.setItem(KEY, '{"nope":true}')
    expect(loadRecords()).toEqual([])
  })

  it('drops only the corrupt entries, keeping the rest of the history', () => {
    // Losing a good record means walking back to that piece of paper, so one
    // bad entry must not take the batch down with it.
    localStorage.setItem(
      KEY,
      JSON.stringify([makeRecord(), null, { num: 123 }, makeRecord({ num: '2' })]),
    )
    const loaded = loadRecords()
    expect(loaded).toHaveLength(2)
  })

  it('does not throw when localStorage refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveRecords([makeRecord()])).not.toThrow()
  })
})

describe('loadRecords — migration from older shapes', () => {
  it('fills in withAs and as for records written before the AS feature', () => {
    // Pre-AS shape: no `withAs`, no `as`, no `source`.
    localStorage.setItem(
      KEY,
      JSON.stringify([
        {
          num: '202601300217719',
          id: 'PRT-217719',
          scannedAt: 1,
          lookup: { status: 'ok' },
          protocol: { status: 'success', reason: 'ok' },
        },
      ]),
    )

    const [record] = loadRecords()
    expect(record.withAs).toBe(false)
    expect(record.as).toEqual({ status: 'idle' })
    expect(record.source).toBe('manual')
    // The parts that mattered are preserved.
    expect(record.num).toBe('202601300217719')
    expect(record.protocol.status).toBe('success')
  })

  it('keeps a record whose id lookup had failed', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        {
          num: '202601300217719',
          id: null,
          scannedAt: 1,
          lookup: { status: 'failed', reason: 'HTTP 503' },
          protocol: { status: 'idle' },
        },
      ]),
    )
    expect(loadRecords()).toHaveLength(1)
  })
})

describe('clearRecords', () => {
  it('empties the history', () => {
    saveRecords([makeRecord()])
    clearRecords()
    expect(loadRecords()).toEqual([])
  })
})
