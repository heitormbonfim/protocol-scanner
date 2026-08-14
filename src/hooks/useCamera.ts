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

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
    setTorchOn(false)
    setTorchSupported(false)
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

  // Release the camera on unmount — a live track keeps the phone's camera
  // indicator on and drains battery.
  useEffect(() => stop, [stop])

  return {
    videoRef,
    status,
    error,
    torchOn,
    torchSupported,
    start,
    stop,
    toggleTorch,
  }
}
