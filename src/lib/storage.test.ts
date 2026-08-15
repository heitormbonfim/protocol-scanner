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
    protocoled: false,
    asProtocoled: false,
    selected: true,
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

describe('loadRecords — the protocoled flags', () => {
  /**
   * A history written before `protocoled` existed carries the fact only in its
   * step status. Losing it on the way in would re-file every already-filed
   * protocol in that history exactly once — the worst kind of migration bug,
   * since the far end has no undo.
   */
  const base = {
    num: '202601300217719',
    id: 'PRT-217719',
    scannedAt: 1,
    source: 'anchored',
    withAs: false,
    lookup: { status: 'ok' },
  }

  const store = (records: unknown[]) =>
    localStorage.setItem(KEY, JSON.stringify(records))

  it('recovers the flag from an older record that had succeeded', () => {
    store([{ ...base, protocol: { status: 'success' } }])
    expect(loadRecords()[0].protocoled).toBe(true)
  })

  it('recovers the AS flag the same way', () => {
    store([
      { ...base, withAs: true, protocol: { status: 'success' }, as: { status: 'success' } },
    ])
    expect(loadRecords()[0].asProtocoled).toBe(true)
  })

  it('does not invent a flag for a record that never succeeded', () => {
    store([{ ...base, protocol: { status: 'failed', reason: 'HTTP 500' } }])
    const [record] = loadRecords()
    expect(record.protocoled).toBe(false)
    expect(record.asProtocoled).toBe(false)
  })

  it('keeps an explicit flag when the step state was overwritten mid-run', () => {
    // The clobber case, surviving a reload: status says `running`, but the
    // protocol was filed and must never be filed again.
    store([{ ...base, protocoled: true, protocol: { status: 'running' } }])
    expect(loadRecords()[0].protocoled).toBe(true)
  })

  it('round-trips the flags through save and load', () => {
    store([{ ...base, protocol: { status: 'success' } }])
    saveRecords(loadRecords())
    expect(loadRecords()[0].protocoled).toBe(true)
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
    const roi = { ...DEFAULT_FIELD_ROI, x: 0.2, y: 0.5 }
    saveFieldRoi(roi)
    expect(loadFieldRoi()).toEqual(roi)
  })

  it('resizes a box saved at an older size, keeping where it was aimed', () => {
    /*
     * Nothing resizes the box by hand, so a stored size is only ever a previous
     * default. Honouring it would mean a tuned default never reaching anyone
     * who had already lined the box up — which is everyone using the app.
     */
    const old = { x: 0.08, y: 0.28, w: 0.84, h: 0.16 }
    saveFieldRoi(old)

    const loaded = loadFieldRoi()
    expect(loaded.w).toBeCloseTo(DEFAULT_FIELD_ROI.w, 9)
    expect(loaded.h).toBeCloseTo(DEFAULT_FIELD_ROI.h, 9)

    // Shrunk about its own centre, so the field it pointed at is still covered.
    expect(loaded.x + loaded.w / 2).toBeCloseTo(old.x + old.w / 2, 9)
    expect(loaded.y + loaded.h / 2).toBeCloseTo(old.y + old.h / 2, 9)
  })

  it('is smaller than it used to be — less of the page, less noise', () => {
    const old = { x: 0.08, y: 0.28, w: 0.84, h: 0.16 }
    expect(DEFAULT_FIELD_ROI.w).toBeLessThan(old.w)
    expect(DEFAULT_FIELD_ROI.h).toBeLessThan(old.h)
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
