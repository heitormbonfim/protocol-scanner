import { describe, expect, it } from 'vitest'
import {
  ConsensusBuffer,
  REQUIRED_AGREEMENT,
  REQUIRED_AGREEMENT_UNTRUSTED,
} from './consensus'

const A = '202601300217719'
const B = '202601200217719'

/** Push a value n times, returning whatever the buffer emitted along the way. */
function pushMany(buffer: ConsensusBuffer, num: string, times: number, trusted = true) {
  const emissions: (string | null)[] = []
  for (let i = 0; i < times; i += 1) emissions.push(buffer.push(num, trusted))
  return emissions
}

describe('ConsensusBuffer', () => {
  it('does not emit before the threshold is reached', () => {
    const buffer = new ConsensusBuffer()
    const emissions = pushMany(buffer, A, REQUIRED_AGREEMENT - 1)
    expect(emissions.every((e) => e === null)).toBe(true)
  })

  it('emits once a trusted read repeats enough times', () => {
    const buffer = new ConsensusBuffer()
    const emissions = pushMany(buffer, A, REQUIRED_AGREEMENT)
    expect(emissions.at(-1)).toBe(A)
  })

  it('holds an untrusted read to a higher bar', () => {
    const buffer = new ConsensusBuffer()
    // Enough for a trusted read, deliberately not enough for an untrusted one.
    const early = pushMany(buffer, A, REQUIRED_AGREEMENT, false)
    expect(early.every((e) => e === null)).toBe(true)

    const rest = pushMany(
      buffer,
      A,
      REQUIRED_AGREEMENT_UNTRUSTED - REQUIRED_AGREEMENT,
      false,
    )
    expect(rest.at(-1)).toBe(A)
  })

  it('never emits a value that keeps changing', () => {
    // The core defence. Reads that disagree every frame are exactly what a
    // blurred or badly-lit stream produces, and none of them may reach the bar.
    const buffer = new ConsensusBuffer()
    for (let i = 0; i < 20; i += 1) {
      const varying = `20260130021771${i % 10}`
      expect(buffer.push(varying, true)).toBeNull()
    }
  })

  it('counts occurrences within the window, not consecutive runs', () => {
    // Two candidates alternating: A genuinely appears `required` times among
    // the recent reads, which is real evidence for A even though B sits
    // between them. Documenting the semantics, since "3 in a row" would be a
    // reasonable but wrong reading of the threshold.
    const buffer = new ConsensusBuffer()
    expect(buffer.push(A, true)).toBeNull()
    expect(buffer.push(B, true)).toBeNull()
    expect(buffer.push(A, true)).toBeNull()
    expect(buffer.push(B, true)).toBeNull()
    expect(buffer.push(A, true)).toBe(A)
  })

  it('emits the value that actually reached agreement, not the loudest', () => {
    const buffer = new ConsensusBuffer()
    buffer.push(B, true)
    buffer.push(B, true)
    for (let i = 0; i < REQUIRED_AGREEMENT - 1; i += 1) {
      expect(buffer.push(A, true)).toBeNull()
    }
    expect(buffer.push(A, true)).toBe(A)
  })

  it('clears itself after emitting so the next page starts fresh', () => {
    const buffer = new ConsensusBuffer()
    pushMany(buffer, A, REQUIRED_AGREEMENT)
    expect(buffer.agreement).toBe(0)
    // The very next read must not immediately re-emit the previous number.
    expect(buffer.push(A, true)).toBeNull()
  })

  it('forgets readings that fall out of the window', () => {
    const buffer = new ConsensusBuffer(4)
    buffer.push(A, true)
    // Four unrelated reads push A out of a 4-slot window.
    pushMany(buffer, B, 4)
    expect(buffer.push(A, true)).toBeNull()
  })

  it('reports agreement progress for the status line', () => {
    const buffer = new ConsensusBuffer()
    expect(buffer.agreement).toBe(0)
    buffer.push(A, true)
    expect(buffer.agreement).toBe(1)
    buffer.push(A, true)
    expect(buffer.agreement).toBe(2)
  })

  it('reports the bar the current read has to clear', () => {
    const buffer = new ConsensusBuffer()
    buffer.push(A, true)
    expect(buffer.required).toBe(REQUIRED_AGREEMENT)
    buffer.push(A, false)
    expect(buffer.required).toBe(REQUIRED_AGREEMENT_UNTRUSTED)
  })

  it('resets on demand', () => {
    const buffer = new ConsensusBuffer()
    pushMany(buffer, A, REQUIRED_AGREEMENT - 1)
    buffer.reset()
    expect(buffer.agreement).toBe(0)
    expect(buffer.required).toBe(REQUIRED_AGREEMENT)
  })

  it('requires strictly more evidence for untrusted than trusted reads', () => {
    expect(REQUIRED_AGREEMENT_UNTRUSTED).toBeGreaterThan(REQUIRED_AGREEMENT)
  })
})
