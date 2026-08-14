import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRecords,
  loadFieldRoi,
  loadRecords,
  saveFieldRoi,
  saveRecords,
} from './storage'
import { DEFAULT_FIELD_ROI, SCAN_ROI } from './preprocess'
import type { ProtocolRecord } from '../types'

const KEY = 'protocol-scanner:records'
const ROI_KEY = 'protocol-scanner:field-roi'

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

  it('leaves the aim box alone — it belongs to the form, not the batch', () => {
    const roi = { ...DEFAULT_FIELD_ROI, y: 0.5 }
    saveFieldRoi(roi)
    clearRecords()
    expect(loadFieldRoi()).toEqual(roi)
  })
})

describe('saveFieldRoi / loadFieldRoi', () => {
  it('round-trips a box the user dragged', () => {
    const roi = { x: 0.2, y: 0.5, w: 0.6, h: 0.14 }
    saveFieldRoi(roi)
    expect(loadFieldRoi()).toEqual(roi)
  })

  it('starts at the default when nothing is stored', () => {
    expect(loadFieldRoi()).toEqual(DEFAULT_FIELD_ROI)
  })

  it.each([
    ['corrupt JSON', '{not json'],
    ['a non-object payload', '42'],
    ['a missing field', '{"x":0.1,"y":0.2,"w":0.5}'],
    ['a non-numeric field', '{"x":"0.1","y":0.2,"w":0.5,"h":0.1}'],
    ['NaN', '{"x":null,"y":0.2,"w":0.5,"h":0.1}'],
    // A zero-area box reads nothing, and would look like a broken scanner
    // rather than a bad setting.
    ['a zero-area box', '{"x":0.1,"y":0.2,"w":0,"h":0}'],
  ])('falls back to the default on %s', (_label, stored) => {
    localStorage.setItem(ROI_KEY, stored)
    expect(loadFieldRoi()).toEqual(DEFAULT_FIELD_ROI)
  })

  it('clamps a stored box back inside the guide', () => {
    // However it got there — an older default, a hand-edited value — a box
    // outside the guide reads pixels the user is not framing.
    localStorage.setItem(ROI_KEY, JSON.stringify({ x: 0.9, y: 0.9, w: 0.8, h: 0.2 }))
    const roi = loadFieldRoi()
    expect(roi.x).toBeGreaterThanOrEqual(SCAN_ROI.x)
    expect(roi.y).toBeGreaterThanOrEqual(SCAN_ROI.y)
    expect(roi.x + roi.w).toBeLessThanOrEqual(SCAN_ROI.x + SCAN_ROI.w + 1e-9)
    expect(roi.y + roi.h).toBeLessThanOrEqual(SCAN_ROI.y + SCAN_ROI.h + 1e-9)
  })
})
