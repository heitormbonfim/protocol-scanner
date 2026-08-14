import { protocolAsById, protocolById } from './api'
import type { ProtocolOutcome, ProtocolRecord } from '../types'

/**
 * The protocolling run, strictly one request at a time.
 *
 * Sequential by design rather than for simplicity — these are real submissions
 * against a government service, and firing them in parallel risks both rate
 * limiting and an unclear picture of which ones actually landed.
 *
 * ## The AS rule
 *
 * A record can be submitted as the ordinary protocol alone, or as the ordinary
 * protocol *followed by* AS. AS on its own is never valid. That is enforced in
 * one place — `runRecord` below — and holds structurally:
 *
 *   - AS is attempted only after the ordinary protocol returns success.
 *   - If the ordinary protocol fails, AS is recorded as `skipped`, not failed,
 *     and no request is sent.
 *   - There is no code path, and no UI state, that reaches `protocolAsById`
 *     without a successful `protocolById` for the same id in the same run.
 *
 * A record whose ordinary protocol already succeeded in an earlier run is not
 * re-submitted; its pending AS call still goes out.
 */

export type QueueProgress = {
  done: number
  total: number
  /** The number currently in flight, for the status line. */
  current: string | null
}

export type RunOptions = {
  signal?: AbortSignal
  onProgress?: (progress: QueueProgress) => void
  /** Fires after each individual submission settles, so the list updates live. */
  onOutcome?: (outcome: ProtocolOutcome) => void
}

/** Records that still have work left — fully-settled ones are skipped. */
export function pendingRecords(records: ProtocolRecord[]): ProtocolRecord[] {
  return records.filter((record) => {
    const protocolDone = record.protocol.status === 'success'
    const asDone = !record.withAs || record.as.status === 'success'
    return !protocolDone || !asDone
  })
}

/** Flatten a record's settled steps into report rows. */
export function recordOutcomes(record: ProtocolRecord): ProtocolOutcome[] {
  const rows: ProtocolOutcome[] = []
  if (record.protocol.status === 'success' || record.protocol.status === 'failed') {
    rows.push({
      num: record.num,
      id: record.id,
      kind: 'protocol',
      ok: record.protocol.status === 'success',
      reason: record.protocol.reason ?? '',
    })
  }
  // A skipped AS is reported as a failure: the user asked for it and it did
  // not happen, which they need to see.
  if (record.withAs && record.as.status !== 'idle' && record.as.status !== 'running') {
    rows.push({
      num: record.num,
      id: record.id,
      kind: 'as',
      ok: record.as.status === 'success',
      reason: record.as.reason ?? '',
    })
  }
  return rows
}

async function runRecord(
  record: ProtocolRecord,
  signal: AbortSignal | undefined,
  emit: (outcome: ProtocolOutcome) => void,
): Promise<void> {
  const { num, id } = record

  if (!id) {
    // Surfaced as a failure rather than skipped: a record whose id lookup never
    // succeeded has *not* been protocolled, and silently dropping it would
    // leave the user believing the batch was complete.
    const reason = record.lookup.reason
      ? `Sem ID — ${record.lookup.reason}`
      : 'Sem ID — busca não concluída'
    emit({ num, id: null, kind: 'protocol', ok: false, reason })
    if (record.withAs) {
      emit({ num, id: null, kind: 'as', ok: false, reason: 'Sem ID — AS não enviado' })
    }
    return
  }

  // ── Step 1: the ordinary protocol ───────────────────────────────────────
  let protocolOk = record.protocol.status === 'success'

  if (!protocolOk) {
    const result = await protocolById(id, signal)
    protocolOk = result.ok
    emit({
      num,
      id,
      kind: 'protocol',
      ok: result.ok,
      reason: result.reason,
      httpStatus: result.ok ? undefined : result.httpStatus,
    })
  }

  if (!record.withAs) return

  // ── Step 2: AS, and only on the back of a successful step 1 ─────────────
  if (!protocolOk) {
    emit({
      num,
      id,
      kind: 'as',
      ok: false,
      reason: 'AS não enviado — o protocolo comum falhou',
    })
    return
  }

  if (signal?.aborted) return

  const asResult = await protocolAsById(id, signal)
  emit({
    num,
    id,
    kind: 'as',
    ok: asResult.ok,
    reason: asResult.reason,
    httpStatus: asResult.ok ? undefined : asResult.httpStatus,
  })
}

export async function runProtocolQueue(
  records: ProtocolRecord[],
  { signal, onProgress, onOutcome }: RunOptions = {},
): Promise<ProtocolOutcome[]> {
  const queue = pendingRecords(records)
  const outcomes: ProtocolOutcome[] = []

  onProgress?.({ done: 0, total: queue.length, current: null })

  for (const [index, record] of queue.entries()) {
    if (signal?.aborted) break

    onProgress?.({ done: index, total: queue.length, current: record.num })

    await runRecord(record, signal, (outcome) => {
      outcomes.push(outcome)
      onOutcome?.(outcome)
    })

    onProgress?.({ done: index + 1, total: queue.length, current: null })
  }

  return outcomes
}
