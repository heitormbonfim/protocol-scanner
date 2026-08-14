import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Rear-camera access.
 *
 * Deliberately gated behind an explicit user gesture: several mobile browsers
 * refuse `getUserMedia` outside of one, and asking for the camera permission
 * the instant the page loads is a good way to get it permanently denied.
 */

export type CameraStatus = 'idle' | 'starting' | 'active' | 'error'

/** `torch` is a well-supported non-standard extension, absent from lib.dom. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean }
type TorchConstraint = { torch: boolean }

/**
 * Focus control comes from the Image Capture spec, which lib.dom does not
 * cover. Chrome on Android implements it; WebKit implements none of it, so on
 * iOS `focusMode` is simply absent from the capabilities and everything below
 * degrades to the camera's own continuous autofocus.
 */
type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] }
type FocusConstraint = {
  focusMode?: string
  /** Normalised to the *captured frame*, not the element. See `pointToSourceFraction`. */
  pointsOfInterest?: { x: number; y: number }[]
}

function focusModesOf(track: MediaStreamTrack | undefined): string[] {
  const capabilities = track?.getCapabilities?.() as FocusCapabilities | undefined
  return capabilities?.focusMode ?? []
}

/** Advanced constraints are best-effort, so a rejection is informative, not fatal. */
async function tryConstraints(
  track: MediaStreamTrack,
  constraint: FocusConstraint,
): Promise<boolean> {
  try {
    await track.applyConstraints({
      advanced: [constraint],
    } as MediaTrackConstraints)
    return true
  } catch {
    return false
  }
}

function explainCameraError(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : 'Falha ao abrir a câmera'
  }
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permissão negada. Autorize o acesso à câmera nas configurações do navegador.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhuma câmera encontrada neste dispositivo.'
    case 'NotReadableError':
      return 'A câmera já está sendo usada por outro aplicativo.'
    default:
      return error.message || 'Falha ao abrir a câmera'
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [focusSupported, setFocusSupported] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
    setTorchOn(false)
    setTorchSupported(false)
    setFocusSupported(false)
  }, [])

  const start = useCallback(async () => {
    // `mediaDevices` is undefined outside a secure context, which is exactly
    // what happens when the dev server is opened over plain http from a phone.
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError(
        window.isSecureContext
          ? 'Este navegador não suporta acesso à câmera.'
          : 'A câmera exige HTTPS. Abra o app pelo endereço https:// e aceite o certificado.',
      )
      return
    }

    setStatus('starting')
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // Ask for as much detail as the device will give. The number is a
          // thin strip of a full page, so resolution here sets how many pixels
          // each digit gets — and OCR accuracy tracks that closely. `ideal`
          // rather than `min` so a lower-resolution camera still opens.
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      })

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }

      const [track] = stream.getVideoTracks()
      const capabilities = track?.getCapabilities?.() as TorchCapabilities | undefined
      setTorchSupported(Boolean(capabilities?.torch))

      // Ask for continuous autofocus explicitly. Some Android cameras come up
      // in a fixed-focus mode — particularly when a high resolution is
      // requested, as it is above — and then never sharpen no matter how the
      // phone is held, which is precisely the symptom this addresses.
      const modes = focusModesOf(track)
      if (track && modes.includes('continuous')) {
        await tryConstraints(track, { focusMode: 'continuous' })
      }
      // Any focus mode at all means the camera will take direction from a tap.
      // WebKit reports none, so on iOS the affordance is dropped rather than
      // shown doing nothing.
      setFocusSupported(modes.length > 0)

      setStatus('active')
    } catch (caught) {
      stop()
      setStatus('error')
      setError(explainCameraError(caught))
    }
  }, [stop])

  const toggleTorch = useCallback(async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? []
    if (!track) return

    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as TorchConstraint],
      } as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      // Some devices advertise torch then reject the constraint. Drop the
      // control rather than leaving a button that does nothing.
      setTorchSupported(false)
    }
  }, [torchOn])

  /**
   * Aim the autofocus at a point the user tapped.
   *
   * `point` is normalised to the **captured frame** — map the tap through
   * `pointToSourceFraction` first, or the aim lands wherever `object-fit: cover`
   * cropped to.
   *
   * A tap means "focus here, now", so it asks for `single-shot`: one sweep,
   * then held. That is what a native camera app does, and it is the mode that
   * actually helps with a sheet of paper, since continuous autofocus on a flat
   * white page tends to hunt. Tapping again re-runs it.
   *
   * Returns false when the camera would not take direction, so the caller can
   * tell the user rather than leaving a tap that appears to do nothing.
   */
  const focusAt = useCallback(async (point: { x: number; y: number }) => {
    const [track] = streamRef.current?.getVideoTracks() ?? []
    if (!track) return false

    const modes = focusModesOf(track)
    if (modes.length === 0) return false

    const mode = modes.includes('single-shot')
      ? 'single-shot'
      : modes.includes('continuous')
        ? 'continuous'
        : modes[0]

    // Point and mode together first; some devices advertise a mode but reject
    // the point, and a fresh sweep without a region is still better than none.
    return (
      (await tryConstraints(track, { focusMode: mode, pointsOfInterest: [point] })) ||
      (await tryConstraints(track, { focusMode: mode }))
    )
  }, [])

  // Release the camera on unmount — a live track keeps the phone's camera
  // indicator on and drains battery.
  useEffect(() => stop, [stop])

  return {
    videoRef,
    status,
    error,
    torchOn,
    torchSupported,
    focusSupported,
    start,
    stop,
    toggleTorch,
    focusAt,
  }
}
