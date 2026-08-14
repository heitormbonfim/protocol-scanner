import type { MatchSource } from './lib/protocol'

/** State of one submission step (the ordinary protocol, or the AS protocol). */
export type StepState = {
  /**
   * `skipped` means the step was deliberately not attempted — either AS was
   * not requested for this record, or the ordinary protocol failed and AS is
   * not allowed to run on its own.
   */
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
  /**
   * Whether this slip also needs the AS protocol submitted.
   *
   * There is deliberately no way to express "AS only" — AS is an add-on to the
   * ordinary protocol, never a substitute for it.
   */
  withAs: boolean
  lookup: {
    /**
     * 'pending' while the confirm-time GET is in flight. The record is stored
     * before that call resolves so scanning never waits on the network.
     */
    status: 'pending' | 'ok' | 'failed'
    /** Why the id lookup failed. Only set when status is 'failed'. */
    reason?: string
  }
  /** The ordinary protocol submission. Always attempted. */
  protocol: StepState
  /** The AS submission. Only attempted when `withAs` and `protocol` succeeded. */
  as: StepState
}

/** Result of `GET {LOOKUP_URL}?numprotocol=<num>` — resolves a number to an id. */
export type LookupResult =
  | { ok: true; id: string }
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
