import { DEFAULT_FIELD_ROI, clampRoiInside, type Roi } from './preprocess'
import type { ProtocolRecord } from '../types'

/**
 * History persistence.
 *
 * The history represents physical paper that has already been walked through.
 * Losing it to an accidental refresh, a backgrounded tab, or a phone that
 * decided to reload the page would mean rescanning the whole stack, so it is
 * written to localStorage on every change.
 *
 * The aim box lives here too, for a smaller reason: it is lined up with a form
 * once, and having to redo that on every visit would be tedious.
 */

const RECORDS_KEY = 'protocol-scanner:records'
const FIELD_ROI_KEY = 'protocol-scanner:field-roi'

/**
 * Accept anything carrying the fields we cannot reconstruct, and fill in the
 * rest. Records written by an earlier version have no `withAs`, `as`, or
 * `source`, and dropping them would mean rescanning paper — so they are
 * migrated to the current shape instead.
 */
function normalize(value: unknown): ProtocolRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ProtocolRecord>

  if (typeof record.num !== 'string') return null
  if (typeof record.id !== 'string' && record.id !== null) return null
  if (!record.lookup || typeof record.lookup !== 'object') return null
  if (!record.protocol || typeof record.protocol !== 'object') return null

  return {
    num: record.num,
    id: record.id,
    scannedAt: typeof record.scannedAt === 'number' ? record.scannedAt : Date.now(),
    editedAt: typeof record.editedAt === 'number' ? record.editedAt : undefined,
    source: record.source ?? 'manual',
    withAs: record.withAs === true,
    lookup: record.lookup,
    protocol: record.protocol,
    as: record.as && typeof record.as === 'object' ? record.as : { status: 'idle' },
  }
}

export function loadRecords(): ProtocolRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Filter rather than reject wholesale: one corrupt entry should not cost
    // the user the rest of the history.
    return parsed
      .map(normalize)
      .filter((record): record is ProtocolRecord => record !== null)
  } catch {
    return []
  }
}

export function saveRecords(records: ProtocolRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
  } catch {
    // Private browsing or a full quota. Not worth interrupting a scan over.
  }
}

export function clearRecords(): void {
  try {
    localStorage.removeItem(RECORDS_KEY)
  } catch {
    // As above.
  }
}

/**
 * The aim box, as the user last positioned it.
 *
 * Always clamped back inside the guide on the way out, so a box saved by an
 * older version — or a hand-edited one — cannot leave the scanner reading
 * pixels outside the frame the user is aiming with.
 */
export function loadFieldRoi(): Roi {
  try {
    const raw = localStorage.getItem(FIELD_ROI_KEY)
    if (!raw) return DEFAULT_FIELD_ROI

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_FIELD_ROI

    const roi = parsed as Partial<Roi>
    const finite = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value)
    if (!finite(roi.x) || !finite(roi.y) || !finite(roi.w) || !finite(roi.h)) {
      return DEFAULT_FIELD_ROI
    }
    // A zero-area box would read nothing and look like a broken scanner.
    if (roi.w <= 0 || roi.h <= 0) return DEFAULT_FIELD_ROI

    return clampRoiInside({ x: roi.x, y: roi.y, w: roi.w, h: roi.h })
  } catch {
    return DEFAULT_FIELD_ROI
  }
}

export function saveFieldRoi(roi: Roi): void {
  try {
    localStorage.setItem(FIELD_ROI_KEY, JSON.stringify(roi))
  } catch {
    // Private browsing or a full quota — the box just resets next visit.
  }
}
