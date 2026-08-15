import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Check,
  Flashlight,
  Move,
  Send,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SCAN_ROI, clampRoiInside, pointToSourceFraction } from '@/lib/preprocess'
import { cn } from '@/lib/utils'
import type { CameraStatus } from '@/hooks/useCamera'
import type { Roi } from '@/lib/preprocess'
import type { MatchSource } from '@/lib/protocol'

type ScannerViewProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  cameraStatus: CameraStatus
  cameraError: string | null
  torchOn: boolean
  torchSupported: boolean
  /** False on iOS, where WebKit exposes no focus control at all. */
  focusSupported: boolean
  /** The box the user drags onto the `Protocolo Nº` field. */
  fieldRoi: Roi
  onStart: () => void
  onToggleTorch: () => void
  /** Point normalised to the captured frame — see `pointToSourceFraction`. */
  onFocusAt: (point: { x: number; y: number }) => void
  onFieldRoiChange: (roi: Roi) => void
  ocrReady: boolean
  scannerError: string | null
  agreement: number
  required: number
  source: MatchSource | null
  paused: boolean
  /** Slips confirmed since the camera was opened — the stack you just worked. */
  scannedThisSession: number
  /** How many records a run would actually send, for the submit button. */
  pendingCount: number
  /**
   * Finish scanning and start the run.
   *
   * Closes the camera on the way, so submissions never go out behind an opaque
   * overlay where their progress cannot be seen or stopped.
   */
  onProtocol: () => void
  onClose: () => void
}

const SOURCE_LABEL: Record<MatchSource, string> = {
  anchored: 'achou o campo "Protocolo"',
  dated: 'número com data válida',
  loose: 'número sem data válida',
  salvaged: 'número recuperado',
}

/** How long the focus ring stays on screen after a tap. */
const FOCUS_RING_MS = 900

/** Movement under this many pixels is a tap, not a drag. */
const TAP_SLOP_PX = 6

/** How far one arrow key nudges the box, as a fraction of the screen. */
const NUDGE = 0.02

export function ScannerView({
  videoRef,
  cameraStatus,
  cameraError,
  torchOn,
  torchSupported,
  focusSupported,
  fieldRoi,
  onStart,
  onToggleTorch,
  onFocusAt,
  onFieldRoiChange,
  ocrReady,
  scannerError,
  agreement,
  required,
  source,
  paused,
  scannedThisSession,
  pendingCount,
  onProtocol,
  onClose,
}: ScannerViewProps) {
  const active = cameraStatus === 'active'

  /** Where the ring is drawn: element coordinates, unlike what the camera gets. */
  const [ring, setRing] = useState<{ x: number; y: number; at: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  /** The overlay's box, which every fraction on this screen is relative to. */
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    if (!ring) return
    const timer = setTimeout(() => setRing(null), FOCUS_RING_MS)
    return () => clearTimeout(timer)
  }, [ring])

  /** Fractions of the overlay box, which is what both the ROI and focus use. */
  function toFraction(clientX: number, clientY: number) {
    const bounds = overlayRef.current?.getBoundingClientRect()
    if (!bounds || !bounds.width || !bounds.height) return null
    return {
      x: (clientX - bounds.left) / bounds.width,
      y: (clientY - bounds.top) / bounds.height,
    }
  }

  function focusAt(point: { x: number; y: number }) {
    const video = videoRef.current
    if (!video || !focusSupported) return

    setRing({ ...point, at: Date.now() })
    const framePoint = pointToSourceFraction(video, point)
    if (framePoint) onFocusAt(framePoint)
  }

  function handleFocusTap(event: React.MouseEvent<HTMLButtonElement>) {
    // `detail === 0` is a keyboard activation, which carries no coordinates —
    // aim at the middle of the guide, which is where the paper should be.
    const point =
      event.detail === 0
        ? { x: 0.5, y: 0.5 }
        : toFraction(event.clientX, event.clientY)
    if (point) focusAt(point)
  }

  // ── Dragging the aim box ──────────────────────────────────────────────────
  function handleBoxPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: fieldRoi.x,
      originY: fieldRoi.y,
      moved: false,
    }
  }

  function handleBoxPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const bounds = overlayRef.current?.getBoundingClientRect()
    if (!drag || !bounds) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) {
      return
    }
    if (!drag.moved) {
      drag.moved = true
      setDragging(true)
    }

    onFieldRoiChange(
      clampRoiInside({
        ...fieldRoi,
        x: drag.originX + dx / bounds.width,
        y: drag.originY + dy / bounds.height,
      }),
    )
  }

  function handleBoxPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)

    // A press on the box that never moved is a tap on the paper, and the paper
    // is exactly what the user wants focused.
    if (drag && !drag.moved) {
      const point = toFraction(event.clientX, event.clientY)
      if (point) focusAt(point)
    }
  }

  function handleBoxKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, [number, number]> = {
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
    }
    const move = step[event.key]
    if (!move) return

    event.preventDefault()
    onFieldRoiChange(
      clampRoiInside({
        ...fieldRoi,
        x: fieldRoi.x + move[0],
        y: fieldRoi.y + move[1],
      }),
    )
  }

  return (
    /*
     * `z-40` is load-bearing, not decoration.
     *
     * The dashboard's header and bottom dock are `sticky z-20`. A positioned
     * element with a z-index paints above a `fixed` one with `z-index: auto`,
     * so without this the Escanear and Protocolar buttons sat on top of the
     * camera — visible and clickable while scanning. Kept below the dialog
     * layer (z-50) so the confirm sheet still comes out in front.
     */
    <div className="fixed inset-0 z-40 bg-black">
      {/* Always mounted so the ref is stable when `start` attaches the stream. */}
      <video
        ref={videoRef}
        className="size-full object-cover"
        playsInline
        muted
        autoPlay
        aria-label="Visualização da câmera"
      />

      {/* Tap-to-focus. A flat white page gives continuous autofocus very little
          to lock onto, so being able to say "focus here" is the difference
          between a readable frame and a blurred one. Sits above the video and
          below the controls, which are later siblings and keep their own taps. */}
      {active && focusSupported && (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer"
          onClick={handleFocusTap}
          aria-label="Tocar para focar"
        />
      )}

      {ring && (
        <span
          key={ring.at}
          className="pointer-events-none absolute z-10 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/90 duration-200 animate-in fade-in-0 zoom-in-50"
          style={{ left: `${ring.x * 100}%`, top: `${ring.y * 100}%` }}
          aria-hidden
        />
      )}

      {active && (
        <div ref={overlayRef} className="pointer-events-none absolute inset-0">
          {/* The document guide. Deliberately large: filling a small box means
              holding the phone inside its minimum focus distance, which blurs
              every frame. Hold it back and get the whole slip in view. */}
          <div
            aria-hidden
            className="absolute rounded-xl outline-2 outline-white/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]"
            style={{
              left: `${SCAN_ROI.x * 100}%`,
              top: `${SCAN_ROI.y * 100}%`,
              width: `${SCAN_ROI.w * 100}%`,
              height: `${SCAN_ROI.h * 100}%`,
            }}
          >
            {(['-top-px -left-px', '-top-px -right-px', '-bottom-px -left-px', '-bottom-px -right-px'] as const).map(
              (pos, i) => (
                <span
                  key={pos}
                  className={cn(
                    // White, not primary: the aim box below is now the thing to
                    // look at, and two accent-coloured frames compete.
                    'absolute size-7 border-white/80',
                    i === 0 && 'rounded-tl-xl border-l-4 border-t-4',
                    i === 1 && 'rounded-tr-xl border-r-4 border-t-4',
                    i === 2 && 'rounded-bl-xl border-b-4 border-l-4',
                    i === 3 && 'rounded-br-xl border-b-4 border-r-4',
                    pos,
                  )}
                />
              ),
            )}
          </div>

          {/* The aim box: the only part of the slip that is read.
              A page carries several "Protocolo" labels and the text alone
              cannot say which is the one — position can, so the user puts this
              on the right field once and it is remembered. `touch-none` is
              required, or the browser scrolls instead of dragging. */}
          <div
            role="application"
            tabIndex={0}
            aria-label="Área de leitura do número — arraste sobre o campo Protocolo Nº, ou use as setas"
            onPointerDown={handleBoxPointerDown}
            onPointerMove={handleBoxPointerMove}
            onPointerUp={handleBoxPointerUp}
            onPointerCancel={handleBoxPointerUp}
            onKeyDown={handleBoxKeyDown}
            className={cn(
              'pointer-events-auto absolute touch-none rounded-lg border-2 border-primary bg-primary/10 outline-none',
              'focus-visible:ring-2 focus-visible:ring-white',
              dragging ? 'cursor-grabbing bg-primary/20' : 'cursor-grab',
            )}
            style={{
              left: `${fieldRoi.x * 100}%`,
              top: `${fieldRoi.y * 100}%`,
              width: `${fieldRoi.w * 100}%`,
              height: `${fieldRoi.h * 100}%`,
            }}
          >
            <span className="absolute -top-6 left-0 flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
              <Move className="size-3" />
              Protocolo Nº
            </span>
          </div>
        </div>
      )}

      {/* ── Idle: permission gate ─────────────────────────────────────────── */}
      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background p-6 text-center">
          <div className="rounded-2xl bg-primary/15 p-5">
            <Camera className="size-9 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Abrir a câmera</h2>
            <p className="text-sm text-muted-foreground">
              Enquadre a folha inteira, sem aproximar demais. Depois arraste a
              caixa sobre o campo{' '}
              <strong className="text-foreground">Protocolo Nº</strong> — só ela
              é lida.
            </p>
          </div>

          {cameraError && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {cameraError}
            </p>
          )}

          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button size="lg" onClick={onStart} disabled={cameraStatus === 'starting'}>
              {cameraStatus === 'starting' ? 'Abrindo…' : 'Iniciar câmera'}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {/* ── Active: status + controls ─────────────────────────────────────── */}
      {active && (
        <>
          <div className="pt-safe absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <div className="flex flex-col items-start gap-1.5">
              <span className="flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs text-white backdrop-blur">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    paused || !ocrReady
                      ? 'bg-muted-foreground'
                      : 'animate-pulse bg-success',
                  )}
                />
                {!ocrReady
                  ? 'Carregando OCR…'
                  : paused
                    ? 'Pausado'
                    : agreement > 0
                      ? `Confirmando… ${agreement} de ${required}`
                      : 'Procurando o protocolo…'}
              </span>
              {source && !paused && (
                <span className="rounded-full bg-black/65 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
                  {SOURCE_LABEL[source]}
                </span>
              )}
              {focusSupported && !paused && (
                <span className="rounded-full bg-black/65 px-3 py-1 text-[11px] text-white/70 backdrop-blur">
                  toque na folha para focar
                </span>
              )}
            </div>

            <Button
              size="icon"
              variant="secondary"
              onClick={onClose}
              aria-label="Fechar câmera"
            >
              <X />
            </Button>
          </div>

          {scannerError && (
            <p className="absolute inset-x-4 top-24 rounded-lg border border-destructive/40 bg-destructive/15 p-3 text-sm text-destructive backdrop-blur">
              {scannerError}
            </p>
          )}

          {/*
            Controls sit at the bottom, within thumb reach — the phone is held
            one handed with paper in the other. Two ways out: `Concluir` just
            closes the camera, `Protocolar` closes it *and* starts the run, so
            finishing a stack does not mean hunting for a second button on
            another screen.
          */}
          <div className="pb-safe absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent p-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1.5 py-1.5 text-sm">
                <Check className="size-3.5" />
                {scannedThisSession} nesta sessão
              </Badge>
              <div className="flex-1" />
              {torchSupported && (
                <Button
                  size="icon"
                  variant={torchOn ? 'default' : 'secondary'}
                  onClick={onToggleTorch}
                  aria-pressed={torchOn}
                  aria-label="Lanterna"
                >
                  <Flashlight />
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Concluir
              </Button>
            </div>

            {pendingCount > 0 && (
              <Button
                size="lg"
                className="mt-3 w-full"
                onClick={onProtocol}
              >
                <Send /> Protocolar {pendingCount}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
