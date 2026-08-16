import { mockIdFor } from './scenario'
import type { ProtocolRecord } from '../types'

/**
 * A starting history, so a mocked app has something to protocol immediately.
 *
 * Scanning needs a camera and a piece of paper. With mocking on you usually
 * want neither — you want to press **Protocolar todos** and watch the queue,
 * the AS rule and the report behave. These records give you that on first load.
 *
 * Every number is chosen against the deterministic rules in `scenario.ts`, so
 * the run exercises each outcome exactly once rather than five identical
 * successes:
 *
 * | ends in | what it demonstrates                                  |
 * | ------- | ----------------------------------------------------- |
 * | `19`    | the ordinary path — protocol and AS both succeed       |
 * | `99`    | protocol succeeds, AS fails (422) — one row of each    |
 * | `98`    | protocol fails, so AS must be reported as *not sent*   |
 * | `97`    | the id lookup failed, so neither call may go out       |
 * | `01`    | already filed — must be skipped, never sent again      |
 *
 * The last one is the interesting one. It carries `protocoled: true` with an
 * unsettled step state, which is exactly the shape that used to cause a second
 * submission of an already-filed protocol; pressing Protocolar todos should
 * leave it alone.
 *
 * Only ever reached when `USE_MOCK` is on — see `App.tsx`.
 */

const SEEDED_KEY = 'protocol-scanner:mock-seeded'

function record(
  num: string,
  overrides: Partial<ProtocolRecord> = {},
): ProtocolRecord {
  return {
    num,
    id: mockIdFor(num),
    scannedAt: Date.now(),
    source: 'anchored',
    withAs: true,
    lookup: { status: 'ok' },
    protocol: { status: 'idle' },
    as: { status: 'idle' },
    protocoled: false,
    asProtocoled: false,
    ...overrides,
  }
}

function seed(): ProtocolRecord[] {
  const minute = 60_000
  const now = Date.now()

  return [
    record('202601300217719', { scannedAt: now - minute }),
    record('202601300217799', { scannedAt: now - 2 * minute }),
    record('202601300217798', { scannedAt: now - 3 * minute }),
    record('202601300217797', {
      scannedAt: now - 4 * minute,
      id: null,
      lookup: { status: 'failed', reason: 'HTTP 503 — Serviço indisponível' },
    }),
    record('202601300217701', {
      scannedAt: now - 5 * minute,
      withAs: false,
      protocoled: true,
      protocol: { status: 'success', reason: 'Protocolo protocolado (HTTP 200)' },
    }),
  ]
}

/**
 * The history to start from, seeded on a first mocked visit.
 *
 * Left alone when there is already a history, and remembered once seeded, so
 * clearing everything stays cleared rather than growing the sample rows back on
 * the next reload.
 */
export function seedMockRecords(existing: ProtocolRecord[]): ProtocolRecord[] {
  if (existing.length > 0) return existing

  try {
    if (localStorage.getItem(SEEDED_KEY) !== null) return existing
    localStorage.setItem(SEEDED_KEY, String(Date.now()))
  } catch {
    // Private browsing or a full quota. Seeding anyway is the friendlier
    // failure: the sample rows simply reappear on the next reload.
  }

  return seed()
}
