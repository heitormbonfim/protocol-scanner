import type { ProtocolRecord } from '../types'

/**
 * History persistence.
 *
 * The history represents physical paper that has already been walked through.
 * Losing it to an accidental refresh, a backgrounded tab, or a phone that
 * decided to reload the page would mean rescanning the whole stack, so it is
 * written to localStorage on every change.
 */

const RECORDS_KEY = 'protocol-scanner:records'

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
