import { AlertTriangle, Camera, Check, Flashlight, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SCAN_ROI } from '@/lib/preprocess'
import { cn } from '@/lib/utils'
import type { CameraStatus } from '@/hooks/useCamera'
import type { MatchSource } from '@/lib/protocol'

type ScannerViewProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  cameraStatus: CameraStatus
  cameraError: string | null
  torchOn: boolean
  torchSupported: boolean
  onStart: () => void
  onToggleTorch: () => void
  ocrReady: boolean
  scannerError: string | null
  agreement: number
  required: number
  source: MatchSource | null
  paused: boolean
  scannedThisSession: number
  onClose: () => void
}

const SOURCE_LABEL: Record<MatchSource, string> = {
  anchored: 'achou o campo "Protocolo"',
  dated: 'número com data válida',
  loose: 'número sem data válida',
  salvaged: 'número recuperado',
}

export function ScannerView({
  videoRef,
  cameraStatus,
  cameraError,
  torchOn,
  torchSupported,
  onStart,
  onToggleTorch,
  ocrReady,
  scannerError,
  agreement,
  required,
  source,
  paused,
  scannedThisSession,
  onClose,
}: ScannerViewProps) {
  const active = cameraStatus === 'active'

  return (
    <div className="fixed inset-0 bg-black">
      {/* Always mounted so the ref is stable when `start` attaches the stream. */}
      <video
        ref={videoRef}
        className="size-full object-cover"
        playsInline
        muted
        autoPlay
        aria-label="Visualização da câmera"
      />

      {active && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {/* The document guide. Deliberately large: filling a small box means
              holding the phone inside its minimum focus distance, which blurs
              every frame. Hold it back and get the whole slip in view. */}
          <div
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
                    'absolute size-7 border-primary',
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
              Enquadre a folha inteira, sem aproximar demais. O app procura o
              campo <strong className="text-foreground">Protocolo Nº</strong>{' '}
              sozinho.
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

          <div className="pb-safe absolute inset-x-0 bottom-0 flex items-center gap-3 bg-linear-to-t from-black/85 to-transparent p-4">
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
            <Button onClick={onClose}>Concluir</Button>
          </div>
        </>
      )}
    </div>
  )
}
