/**
 * Multi-frame voting — the main defence against a silent misread.
 *
 * A single OCR pass on a hand-held frame is not trustworthy, and the errors it
 * makes are plausible-looking single-digit substitutions rather than obvious
 * garbage. Requiring the same digits across several frames suppresses that,
 * because the error a frame makes depends on how it happened to blur: vary the
 * framing slightly and the error changes, while the truth does not.
 *
 * Measured on the reference photo with the full-page pipeline, per-frame
 * accuracy is ~85% and emitting after **2** agreeing frames already gets
 * 14/15 batches right. The thresholds below sit one frame above that measured
 * minimum: a frame costs about a second, and a wrong number costs a bad
 * submission to a government service, so the trade is worth making.
 */

/** Agreements required for a trusted read (label-anchored or date-valid). */
export const REQUIRED_AGREEMENT = 3

/**
 * Agreements required for an untrusted read — a bare 15-digit run with no
 * label anchor and no parseable date prefix.
 *
 * A raised bar rather than a hard block on purpose: the date pattern is
 * inferred from a single sample, and a hard block would leave the scanner
 * silently refusing to fire on slips that simply do not follow it.
 */
export const REQUIRED_AGREEMENT_UNTRUSTED = 5

/** How many recent reads stay in play. Larger tolerates the odd bad frame. */
const WINDOW = 8

export class ConsensusBuffer {
  #readings: string[] = []
  #required = REQUIRED_AGREEMENT
  // A plain field rather than a constructor parameter property: the project
  // builds with `erasableSyntaxOnly`, which disallows the shorthand.
  readonly #window: number

  constructor(window = WINDOW) {
    this.#window = window
  }

  /**
   * Record one reading. `trusted` comes from `matchProtocol` — true when the
   * label anchored the match or the date prefix parses. Returns the number
   * once it clears the bar, otherwise `null`.
   *
   * The threshold counts how many times the value occurs *within the window*,
   * not how many times it repeats consecutively. Two candidates alternating
   * will therefore emit the one that reaches the count first, which is the
   * intended behaviour: a value seen three times in five reads is genuinely
   * better supported than the one seen twice.
   */
  push(num: string, trusted: boolean): string | null {
    this.#readings.push(num)
    if (this.#readings.length > this.#window) this.#readings.shift()

    this.#required = trusted ? REQUIRED_AGREEMENT : REQUIRED_AGREEMENT_UNTRUSTED

    const matches = this.#readings.filter((r) => r === num).length
    if (matches >= this.#required) {
      this.reset()
      return num
    }
    return null
  }

  /** How many times the most recent reading currently agrees. For the UI. */
  get agreement(): number {
    const latest = this.#readings.at(-1)
    if (!latest) return 0
    return this.#readings.filter((r) => r === latest).length
  }

  /** The bar the current reading has to clear, so the UI can show `2 de 3`. */
  get required(): number {
    return this.#required
  }

  /**
   * Only successful reads are ever pushed; frames that read nothing are simply
   * ignored rather than decaying the buffer, which would drain the window
   * faster than hits refill it.
   *
   * Stale readings are not a risk: the buffer is reset on every emit and
   * whenever scanning is paused, which happens after each confirmed page.
   */
  reset(): void {
    this.#readings = []
    this.#required = REQUIRED_AGREEMENT
  }
}
