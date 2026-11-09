import type { MatchSource } from './lib/protocol'

/** State of one submission step (the ordinary protocol, or the AS protocol). */
export type StepState = {
  status: 'idle' | 'running' | 'success' | 'failed' | 'skipped'
  /** Populated for success, failure and skip alike, so the report can explain. */
  reason?: string
  at?: number
}

/** A protocol as stored in the array, once the user has confirmed the scan. */
export type ProtocolRecord = {
  /** The 15-digit number read off the paper. Unique within the history. */
  num: string
  /** Resolved by the confirm-time lookup. `null` when that request failed. */
  id: string | null
  scannedAt: number
  /** Set when the user corrected the number by hand, so the row can say so. */
  editedAt?: number
  /** How the scanner found this number, or 'manual' if it was typed/corrected. */
  source: MatchSource | 'manual'
  nomecompleto?: string
  /** Date the upstream record was opened; distinct from submission timestamps. */
  data?: string
  /** Independent actions. Missing withProtocol means true for older records. */
  withProtocol?: boolean
  withAs: boolean
  /** Legacy whole-record selection, migrated when loading local history. */
  selected?: boolean
  lookup: {
    /**
     * 'pending' while the confirm-time GET is in flight. The record is stored
     * before that call resolves so scanning never waits on the network.
     */
    status: 'pending' | 'ok' | 'failed'
    /** Why the id lookup failed. Only set when status is 'failed'. */
    reason?: string
  }
  /** The ordinary protocol submission. */
  protocol: StepState
  /** The independent AS submission. */
  as: StepState
  /**
   * This protocol has been filed. Sticky, and the authority on whether to send.
   *
   * `protocol.status` cannot carry this on its own because it is display state
   * and gets overwritten: a record whose protocol already succeeded but whose
   * AS is still pending is put back in the queue, marked `running` for the AS
   * leg, and never re-settled — losing the `success` and causing the next run
   * to file the protocol a second time. A submission has no undo, so the fact
   * that it happened is kept in a field nothing but a new number clears.
   *
   * Only ever cleared by `handleSaveEdit`, where a corrected number invalidates
   * the id and makes this a different submission.
   */
  protocoled?: boolean
  /** The same, for the AS submission. */
  asProtocoled?: boolean
}

/** Result of `GET {lookup}?protocoloId=<num>` — resolves a number to an id. */
export type LookupResult =
  | { ok: true; id: string; nomecompleto: string; data: string }
  | { ok: false; reason: string; httpStatus?: number }

/** Result of a submission — the same shape for both the ordinary and AS calls. */
export type ProtocolResult =
  | { ok: true; reason: string }
  | { ok: false; reason: string; httpStatus?: number }

/** Which of the two submissions an outcome refers to. */
export type OutcomeKind = 'protocol' | 'as'

/** One row of the final report. Carries id, number and reason either way. */
export type ProtocolOutcome = {
  num: string
  id: string | null
  kind: OutcomeKind
  nomecompleto?: string
  at?: number
  ok: boolean
  reason: string
  httpStatus?: number
}

/** A detection awaiting the user's confirm tap. */
export type ScanCandidate = {
  num: string
  /** data: URL of the captured frame, so the user can eyeball the read. */
  thumbnail: string
  source: MatchSource
}

/** Which screen the app is showing. The scanner is a modal over the dashboard. */
export type View = 'dashboard' | 'results'
