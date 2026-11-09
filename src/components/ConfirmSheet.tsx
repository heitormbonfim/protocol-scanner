import { useState } from 'react'
import { AlertTriangle, Pencil, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogSheet, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PROTOCOL_LENGTH,
  formatProtocol,
  hasPlausibleDatePrefix,
  isWellFormed,
} from '@/lib/protocol'
import type { ScanCandidate } from '@/types'

type ConfirmSheetProps = {
  candidate: ScanCandidate
  /** True when this number is already in the history. */
  duplicate: boolean
  onConfirm: (
    num: string,
    withAs: boolean,
    edited: boolean,
    withProtocol: boolean,
  ) => void
  onDiscard: () => void
}

export function ConfirmSheet({
  candidate,
  duplicate,
  onConfirm,
  onDiscard,
}: ConfirmSheetProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(candidate.num)
  const [withProtocol, setWithProtocol] = useState(true)
  const [withAs, setWithAs] = useState(true)

  const value = editing ? draft : candidate.num
  const valid = isWellFormed(value)
  const suspiciousDate = valid && !hasPlausibleDatePrefix(value)
  const edited = value !== candidate.num

  return (
    <Dialog open onOpenChange={(open) => !open && onDiscard()}>
      <DialogSheet aria-describedby={undefined}>
        <DialogTitle className="sr-only">Confirmar protocolo</DialogTitle>

        {/* The frame the OCR actually read, so a misread is obvious at a glance.
            This comparison is the real correctness guarantee, not the OCR. */}
        <img
          className="max-h-40 w-full rounded-lg border border-border bg-white object-contain"
          src={candidate.thumbnail}
          alt="Foto capturada da folha"
        />

        {editing ? (
          <div className="space-y-1.5">
            <Label htmlFor="protocol-edit">
              Corrigir número ({PROTOCOL_LENGTH} dígitos)
            </Label>
            <Input
              id="protocol-edit"
              value={draft}
              onChange={(event) =>
                setDraft(
                  event.target.value
                    .replace(/\D/g, '')
                    .slice(0, PROTOCOL_LENGTH),
                )
              }
              inputMode="numeric"
              autoComplete="off"
              className="text-center font-mono text-xl tracking-wider"
            />
            <p
              className={
                valid ? 'text-xs text-muted-foreground' : 'text-xs text-warning'
              }
            >
              {value.length} / {PROTOCOL_LENGTH} dígitos
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group rounded-lg py-1 text-center transition-colors hover:bg-accent"
          >
            <span className="block font-mono text-2xl font-bold tracking-tight break-all">
              {formatProtocol(value)}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Pencil className="size-3" />
              toque para corrigir
            </span>
          </button>
        )}

        {candidate.source === 'anchored' && !editing && (
          <Badge variant="success" className="self-center">
            <Sparkles /> encontrado no campo &quot;Protocolo&quot;
          </Badge>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Label className="flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <Checkbox
              checked={withProtocol}
              onCheckedChange={(value) => setWithProtocol(value === true)}
            />
            Protocolar
          </Label>
          <Label className="flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <Checkbox
              checked={withAs}
              onCheckedChange={(value) => setWithAs(value === true)}
            />
            Protocolar AS
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Escolha uma ou as duas ações. Você pode revisar antes de enviar.
        </p>

        {duplicate && (
          <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            Este protocolo já está no histórico.
          </p>
        )}

        {suspiciousDate && !duplicate && (
          <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            Os 8 primeiros dígitos não formam uma data válida — confira se algum
            dígito saiu errado.
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDiscard}>
            Descartar
          </Button>
          <Button
            className="flex-[1.6]"
            disabled={!valid || duplicate || (!withProtocol && !withAs)}
            onClick={() => onConfirm(value, withAs, edited, withProtocol)}
          >
            Confirmar
          </Button>
        </div>
      </DialogSheet>
    </Dialog>
  )
}
