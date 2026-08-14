/**
 * Parsing and validation for the `Protocolo Nº:` field.
 *
 * Sample from a real slip: `Protocolo Nº: 202601300217719`
 *   - exactly 15 digits
 *   - the first 8 read as a YYYYMMDD issue date (20260130)
 *
 * The length rule is hard. The date rule is only a confidence signal — it is
 * inferred from a single sample, so it must never reject a real number.
 */

export const PROTOCOL_LENGTH = 15

/** Earliest year we would believe in a protocol date prefix. */
const MIN_YEAR = 2000

/** Runs this much longer than the real number are still worth salvaging. */
const MAX_SALVAGEABLE_LENGTH = PROTOCOL_LENGTH + 2

/** How the number was found. Surfaced in the UI so the user can weigh it. */
export type MatchSource = 'anchored' | 'dated' | 'loose' | 'salvaged'

export type ProtocolMatch = {
  num: string
  source: MatchSource
  /**
   * Whether this read is trusted enough for the lower agreement threshold.
   * True when the label anchored it *and* the date parses, or when a bare
   * 15-digit run has a valid date.
   */
  trusted: boolean
}

/**
 * Anchors on the label. The OCR rarely gets "Nº" right — it comes back as
 * `N®`, `N°`, `NP`, `No`, sometimes just noise — so we allow any run of
 * non-digits between the word and the number rather than trying to match it.
 */
const ANCHORED = /protocolo[^0-9]{0,15}([0-9][0-9 .-]{13,30})/i

/** The hard rule: exactly 15 digits, nothing else. */
export function isWellFormed(num: string): boolean {
  return new RegExp(`^\\d{${PROTOCOL_LENGTH}}$`).test(num)
}

/**
 * Soft signal: do the first 8 digits parse as a sane YYYYMMDD date?
 *
 * A number failing this is still accepted — it just needs more corroborating
 * frames, and the confirm sheet flags it, since a misread digit usually breaks
 * the date first.
 */
export function hasPlausibleDatePrefix(num: string): boolean {
  if (!isWellFormed(num)) return false

  const year = Number(num.slice(0, 4))
  const month = Number(num.slice(4, 6))
  const day = Number(num.slice(6, 8))

  const date = new Date(year, month - 1, day)
  const roundTrips =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  if (!roundTrips) return false

  const oneYearAhead = new Date()
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1)

  return year >= MIN_YEAR && date <= oneYearAhead
}

/**
 * Find the protocol number in a page of OCR text.
 *
 * Strategies in descending order of confidence:
 *
 *  1. **Anchored** — digits immediately following the "Protocolo" label. This
 *     is the only strategy that knows *which* number it found, so it stays
 *     correct even on a slip carrying several long numbers.
 *  2. **Dated** — any bare 15-digit run whose date prefix parses.
 *  3. **Loose** — any bare 15-digit run. Held to a higher agreement bar.
 *  4. **Salvaged** — a 16-17 digit run containing a date-valid 15-digit
 *     window. The label's colon and the "Nº" superscript regularly smear into
 *     an extra leading digit, and requiring a valid date keeps the trim honest.
 */
export function matchProtocol(text: string): ProtocolMatch | null {
  const flat = text.replace(/\s+/g, ' ')

  // 1. Anchored on the label.
  const anchored = flat.match(ANCHORED)
  if (anchored) {
    const digits = anchored[1].replace(/\D/g, '')
    if (digits.length >= PROTOCOL_LENGTH) {
      const num = digits.slice(0, PROTOCOL_LENGTH)
      return { num, source: 'anchored', trusted: hasPlausibleDatePrefix(num) }
    }
  }

  const runs = flat.match(/\d+/g) ?? []

  // 2 & 3. Bare 15-digit runs, preferring one with a sane date.
  const exact = runs.filter((run) => run.length === PROTOCOL_LENGTH)
  const dated = exact.find(hasPlausibleDatePrefix)
  if (dated) return { num: dated, source: 'dated', trusted: true }
  if (exact.length > 0) {
    return { num: exact[0], source: 'loose', trusted: false }
  }

  // 4. Salvage a smeared over-long run.
  for (const run of runs) {
    if (run.length <= PROTOCOL_LENGTH || run.length > MAX_SALVAGEABLE_LENGTH) {
      continue
    }
    for (let start = 0; start + PROTOCOL_LENGTH <= run.length; start += 1) {
      const window = run.slice(start, start + PROTOCOL_LENGTH)
      if (hasPlausibleDatePrefix(window)) {
        return { num: window, source: 'salvaged', trusted: true }
      }
    }
  }

  return null
}

/** Convenience wrapper for callers that only want the digits. */
export function extractProtocol(text: string): string | null {
  return matchProtocol(text)?.num ?? null
}

/**
 * Group the digits for display: `20260130 0217719`.
 * Splitting off the date prefix makes a misread far easier to spot by eye.
 */
export function formatProtocol(num: string): string {
  if (!isWellFormed(num)) return num
  return `${num.slice(0, 8)} ${num.slice(8)}`
}
