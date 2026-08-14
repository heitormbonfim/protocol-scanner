import { describe, expect, it } from 'vitest'
import {
  PROTOCOL_LENGTH,
  extractProtocol,
  formatProtocol,
  hasPlausibleDatePrefix,
  isWellFormed,
  matchProtocol,
} from './protocol'

/** The number on the reference photo in public/. */
const REAL = '202601300217719'

/**
 * Verbatim OCR output from the reference photo, captured while tuning the
 * pipeline. Keeping the real text — mangled "Nº" and all — means these tests
 * exercise what Tesseract actually emits rather than an idealised version.
 */
const REAL_PAGE_TEXT =
  'Protocolo N®  202601300217719\n\nBENEDITA EDMARINA GOMES DE SOU\nMaes i\n\n' +
  'RAIMUNDA RODRIGUES GOMES\n\nEnd 0:\n\nRUA RAIMUNDO PEREIRA DE OLIVEIRA\n' +
  'Outras Informagées:\n\nPROXIMO A LANCHONETE BERTCUCK\n' +
  'Informacgées do Protocolo: *\n\nData de Agendamento: Horario:\n' +
  'sexta-feira, 14/08/2026 07:00:0\nServigo:\n\nEXAMES - LABORATORIAIS\n'

describe('isWellFormed', () => {
  it('accepts exactly 15 digits', () => {
    expect(isWellFormed(REAL)).toBe(true)
  })

  it.each([
    ['too short', '20260130021771'],
    ['too long', '2026013002177199'],
    ['contains a letter', '20260130021771O'],
    ['contains a space', '20260130 217719'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isWellFormed(value)).toBe(false)
  })
})

describe('hasPlausibleDatePrefix', () => {
  it('accepts the reference number (2026-01-30)', () => {
    expect(hasPlausibleDatePrefix(REAL)).toBe(true)
  })

  it('rejects an impossible day', () => {
    // 20260190 -> day 90. This is the single most useful rejection: a misread
    // digit in the date position produces exactly this.
    expect(hasPlausibleDatePrefix('202601900217719')).toBe(false)
  })

  it('rejects an impossible month', () => {
    expect(hasPlausibleDatePrefix('202699300217719')).toBe(false)
  })

  it('rejects a year before 2000', () => {
    expect(hasPlausibleDatePrefix('199901300217719')).toBe(false)
  })

  it('rejects a date more than a year out', () => {
    const farFuture = String(new Date().getFullYear() + 3)
    expect(hasPlausibleDatePrefix(`${farFuture}01300217719`)).toBe(false)
  })

  it('rejects 30 February even though the digits look sane', () => {
    expect(hasPlausibleDatePrefix('202602300217719')).toBe(false)
  })

  it('is false for anything not well formed', () => {
    expect(hasPlausibleDatePrefix('2026013002177')).toBe(false)
  })
})

describe('matchProtocol — label anchoring', () => {
  it('reads the number out of real OCR output from the reference photo', () => {
    const match = matchProtocol(REAL_PAGE_TEXT)
    expect(match).toEqual({ num: REAL, source: 'anchored', trusted: true })
  })

  it.each([
    ['N®', 'Protocolo N®  202601300217719'],
    ['Nº', 'Protocolo Nº: 202601300217719'],
    ['N°', 'Protocolo N°: 202601300217719'],
    ['No', 'Protocolo No 202601300217719'],
    ['NP', 'Protocolo NP. 202601300217719'],
    ['nothing', 'Protocolo 202601300217719'],
  ])('survives "Nº" coming back as %s', (_label, text) => {
    expect(matchProtocol(text)?.num).toBe(REAL)
  })

  it('picks the labelled number over other long numbers on the page', () => {
    // The decisive case for anchoring: a bare "first 15-digit run" search would
    // return the unrelated number, which is a wrong submission.
    const text = `Cartao 202512310000001 Protocolo Nº: ${REAL} Data 14/08/2026`
    const match = matchProtocol(text)
    expect(match?.num).toBe(REAL)
    expect(match?.source).toBe('anchored')
  })

  it('tolerates digits split by spaces after the label', () => {
    expect(matchProtocol('Protocolo Nº: 20260130 0217719')?.num).toBe(REAL)
  })

  it('marks an anchored read with an impossible date as untrusted', () => {
    // Still returned — the date convention comes from one sample — but held to
    // a higher agreement bar by the consensus buffer.
    const match = matchProtocol('Protocolo Nº: 202601900217719')
    expect(match?.num).toBe('202601900217719')
    expect(match?.trusted).toBe(false)
  })
})

describe('extractProtocol', () => {
  it('pulls the number out of a clean read', () => {
    expect(extractProtocol(REAL)).toBe(REAL)
  })

  it('ignores the short garbage runs around the number', () => {
    expect(extractProtocol(`0 11 ${REAL}`)).toBe(REAL)
  })

  it('prefers a candidate whose date prefix parses', () => {
    // Ordering matters: the date-valid one is second, so a naive "first match"
    // implementation would return the wrong number here.
    expect(extractProtocol(`202601900217719 ${REAL}`)).toBe(REAL)
  })

  it('reports how it found the number', () => {
    expect(matchProtocol(REAL)?.source).toBe('dated')
    expect(matchProtocol('202601900217719')?.source).toBe('loose')
    expect(matchProtocol(`0${REAL}`)?.source).toBe('salvaged')
  })

  it('falls back to a 15-digit run when none has a valid date', () => {
    // Held to a higher agreement bar downstream rather than dropped outright,
    // because the date convention comes from a single sample.
    expect(extractProtocol('202601900217719')).toBe('202601900217719')
  })

  it('salvages a leading digit smeared in from the label', () => {
    // The colon in "Nº:" regularly reads as an extra leading 0.
    expect(extractProtocol(`0${REAL}`)).toBe(REAL)
  })

  it('salvages a trailing smear', () => {
    expect(extractProtocol(`${REAL}0`)).toBe(REAL)
  })

  it('only salvages when the resulting window has a valid date', () => {
    // 16 digits with no date-valid window inside: refuse rather than guess.
    expect(extractProtocol('9999999999999999')).toBeNull()
  })

  it('refuses runs far longer than salvageable', () => {
    expect(extractProtocol('9'.repeat(30))).toBeNull()
  })

  it('returns null for text with no long digit run', () => {
    expect(extractProtocol('Protocolo 12 34')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(extractProtocol('')).toBeNull()
  })
})

describe('formatProtocol', () => {
  it('splits the date prefix from the sequence', () => {
    expect(formatProtocol(REAL)).toBe('20260130 0217719')
  })

  it('leaves malformed input untouched rather than mangling it', () => {
    expect(formatProtocol('123')).toBe('123')
  })
})

it('PROTOCOL_LENGTH matches the observed format', () => {
  expect(PROTOCOL_LENGTH).toBe(15)
  expect(REAL).toHaveLength(PROTOCOL_LENGTH)
})
