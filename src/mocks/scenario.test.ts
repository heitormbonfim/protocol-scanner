import { describe, expect, it } from 'vitest'
import {
  lookupReply,
  mockIdFor,
  protocolAsReply,
  protocolReply,
} from './scenario'

/**
 * The scenario is shared by two transports — the Vite middleware the browser
 * talks to, and the MSW handlers the tests use — so its behaviour is pinned
 * here rather than being re-asserted through each transport.
 */

const OK = '202601300217719'
const LOOKUP_FAILS = '202601300217797'
const PROTOCOL_FAILS = '202601300217798'
const AS_FAILS = '202601300217799'

describe('lookupReply', () => {
  it('returns an id for a well-formed number', () => {
    const reply = lookupReply(OK)
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ id: mockIdFor(OK) })
  })

  it.each([
    ['missing', null],
    ['too short', '2026013002177'],
    ['non-numeric', 'abcdefghijklmno'],
  ])('rejects a %s number with 400', (_label, num) => {
    expect(lookupReply(num).status).toBe(400)
  })

  it('fails with 503 for numbers ending in 97', () => {
    expect(lookupReply(LOOKUP_FAILS).status).toBe(503)
  })

  it('is deterministic — the same number always behaves the same', () => {
    // Randomised failures would make manual testing and the suite flaky.
    expect(lookupReply(OK)).toEqual(lookupReply(OK))
    expect(lookupReply(LOOKUP_FAILS)).toEqual(lookupReply(LOOKUP_FAILS))
  })
})

describe('protocolReply', () => {
  it('succeeds for an ordinary id', () => {
    expect(protocolReply(mockIdFor(OK)).status).toBe(200)
  })

  it('fails for ids ending in 98', () => {
    const reply = protocolReply(mockIdFor(PROTOCOL_FAILS))
    expect(reply.status).not.toBe(200)
    expect(reply.type).toBe('text')
  })

  it('picks a stable failure reason per id', () => {
    const first = protocolReply(mockIdFor(PROTOCOL_FAILS))
    const second = protocolReply(mockIdFor(PROTOCOL_FAILS))
    expect(first).toEqual(second)
  })
})

describe('protocolAsReply', () => {
  it('succeeds for an ordinary id', () => {
    expect(protocolAsReply(mockIdFor(OK)).status).toBe(200)
  })

  it('fails with 422 for ids ending in 99', () => {
    expect(protocolAsReply(mockIdFor(AS_FAILS)).status).toBe(422)
  })

  it('succeeds where the ordinary protocol fails, and vice versa', () => {
    // The two failure triggers must stay independent, otherwise the "AS is
    // skipped when the protocol fails" path cannot be exercised separately
    // from the "AS itself fails" path.
    expect(protocolReply(mockIdFor(AS_FAILS)).status).toBe(200)
    expect(protocolAsReply(mockIdFor(PROTOCOL_FAILS)).status).toBe(200)
  })
})

describe('mockIdFor', () => {
  it('keeps the last two digits so failure routing survives the lookup', () => {
    // The middleware and handlers key failures off the id's suffix, so the id
    // scheme has to preserve it.
    expect(mockIdFor(PROTOCOL_FAILS).endsWith('98')).toBe(true)
    expect(mockIdFor(AS_FAILS).endsWith('99')).toBe(true)
  })
})
