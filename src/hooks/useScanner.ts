import { useEffect, useRef, useState } from 'react'
import { ConsensusBuffer, REQUIRED_AGREEMENT } from '../lib/consensus'
import { initOcr, recognizeCanvas } from '../lib/ocr'
import { preprocessFrame, type Roi } from '../lib/preprocess'
import { isWellFormed, matchProtocol } from '../lib/protocol'
import type { MatchSource } from '../lib/protocol'
import type { ScanCandidate } from '../types'

/**
 * Breathing room between passes so the main thread can still paint.
 *
 * Full-page recognition takes roughly a second, so this gap is a small share
 * of the loop — the value only needs to be non-zero.
 */
const FRAME_GAP_MS = 120

/** Give up on the loop after this many consecutive OCR throws. */
const MAX_CONSECUTIVE_ERRORS = 5

type ScannerOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  roi: Roi
  /** The loop only runs while true — false pauses it (sheet open, cooldown). */
  enabled: boolean
  onCandidate: (candidate: ScanCandidate) => void
}

export function useScanner({ videoRef, roi, enabled, onCandidate }: ScannerOptions) {
  const [ready, setReady] = useState(false)
  const [agreement, setAgreement] = useState(0)
  const [required, setRequired] = useState(REQUIRED_AGREEMENT)
  const [source, setSource] = useState<MatchSource | null>(null)
  const [error, setError] = useState<string | null>(null)

  const consensusRef = useRef(new ConsensusBuffer())

  // Latest-value refs: the loop must not be torn down and rebuilt every time
  // the parent re-renders with a new callback identity.
  const onCandidateRef = useRef(onCandidate)
  const roiRef = useRef(roi)
  useEffect(() => {
    onCandidateRef.current = onCandidate
    roiRef.current = roi
  })

  // Warm up the Tesseract worker as soon as the app mounts, so the first scan
  // is not waiting on a several-megabyte model download.
  useEffect(() => {
    let cancelled = false
    initOcr().then(
      () => {
        if (!cancelled) setReady(true)
      },
      (caught: unknown) => {
        if (cancelled) return
        setError(
          caught instanceof Error
            ? `Falha ao carregar o OCR: ${caught.message}`
            : 'Falha ao carregar o OCR',
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!enabled || !ready) return

    let stopped = false
    let timer: number | undefined
    let consecutiveErrors = 0

    const consensus = consensusRef.current
    consensus.reset()

    const tick = async () => {
      if (stopped) return

      const video = videoRef.current
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        timer = window.setTimeout(tick, FRAME_GAP_MS)
        return
      }

      try {
        const frame = preprocessFrame(video, roiRef.current)
        if (frame) {
          const text = await recognizeCanvas(frame)
          if (stopped) return

          const match = matchProtocol(text)
          if (match && isWellFormed(match.num)) {
            const confirmed = consensus.push(match.num, match.trusted)
            setAgreement(consensus.agreement)
            setRequired(consensus.required)
            setSource(match.source)

            if (confirmed) {
              // Serialise the frame only now — this is the one the user will
              // actually look at, and toDataURL is too costly to run per frame.
              onCandidateRef.current({
                num: confirmed,
                thumbnail: frame.toDataURL('image/jpeg', 0.8),
                source: match.source,
              })
              setAgreement(0)
              setSource(null)
              // Stop here. The parent pauses us by flipping `enabled`, and the
              // effect restarts clean once the candidate is resolved.
              return
            }
          }
        }
        consecutiveErrors = 0
      } catch (caught) {
        consecutiveErrors += 1
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          setError(
            caught instanceof Error
              ? `Leitura interrompida: ${caught.message}`
              : 'Leitura interrompida',
          )
          return
        }
      }

      timer = window.setTimeout(tick, FRAME_GAP_MS)
    }

    void tick()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      consensus.reset()
      setAgreement(0)
      setRequired(REQUIRED_AGREEMENT)
      setSource(null)
    }
  }, [enabled, ready, videoRef])

  return { ready, agreement, required, source, error }
}
