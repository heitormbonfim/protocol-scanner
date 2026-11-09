import { protocolAsById, protocolById } from './api'
import type { ProtocolOutcome, ProtocolRecord } from '../types'

/** Sequential requests; ordinary and AS submissions are independent. */
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

/**
 * Has the ordinary protocol been filed?
 *
 * `protocoled` first: it is sticky, while `protocol.status` is display state
 * that a later run can overwrite. Falling back to the status keeps records
 * written before the flag existed working.
 */
export function isProtocoled(record: ProtocolRecord): boolean {
  return record.protocoled === true || record.protocol.status === 'success'
}

/** The same, for AS. */
export function isAsProtocoled(record: ProtocolRecord): boolean {
  return record.asProtocoled === true || record.as.status === 'success'
}

export function wantsProtocol(record: ProtocolRecord): boolean {
  return record.withProtocol !== false
}

export function isSelected(record: ProtocolRecord): boolean {
  return wantsProtocol(record) || record.withAs
}

export function isComplete(record: ProtocolRecord): boolean {
  return (
    isSelected(record) &&
    (!wantsProtocol(record) || isProtocoled(record)) &&
    (!record.withAs || isAsProtocoled(record))
  )
}

export function pendingRecords(records: ProtocolRecord[]): ProtocolRecord[] {
  return records.filter(
    (record) =>
      (wantsProtocol(record) && !isProtocoled(record)) ||
      (record.withAs && !isAsProtocoled(record)),
  )
}

/** Flatten a record's settled steps into report rows. */
export function recordOutcomes(record: ProtocolRecord): ProtocolOutcome[] {
  const rows: ProtocolOutcome[] = []
  if (
    record.protocol.status === 'success' ||
    record.protocol.status === 'failed'
  ) {
    rows.push({
      num: record.num,
      id: record.id,
      kind: 'protocol',
      nomecompleto: record.nomecompleto,
      at: record.protocol.at,
      ok: record.protocol.status === 'success',
      reason: record.protocol.reason ?? '',
    })
  }
  // A skipped AS is reported as a failure: the user asked for it and it did
  // not happen, which they need to see.
  if (record.as.status !== 'idle' && record.as.status !== 'running') {
    rows.push({
      num: record.num,
      id: record.id,
      kind: 'as',
      nomecompleto: record.nomecompleto,
      at: record.as.at,
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
  const { num, id, nomecompleto } = record
  const steps = [
    {
      kind: 'protocol' as const,
      enabled: wantsProtocol(record),
      done: isProtocoled(record),
      send: protocolById,
    },
    {
      kind: 'as' as const,
      enabled: record.withAs,
      done: isAsProtocoled(record),
      send: protocolAsById,
    },
  ]
  for (const step of steps) {
    if (signal?.aborted) break
    if (!step.enabled || step.done) continue
    const result = id
      ? await step.send(id, signal)
      : {
          ok: false as const,
          reason: record.lookup.reason
            ? `Sem ID — ${record.lookup.reason}`
            : 'Sem ID — busca não concluída',
          httpStatus: undefined,
        }
    emit({
      num,
      id,
      nomecompleto,
      kind: step.kind,
      at: Date.now(),
      ok: result.ok,
      reason: result.reason,
      httpStatus: result.ok ? undefined : result.httpStatus,
    })
  }
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
