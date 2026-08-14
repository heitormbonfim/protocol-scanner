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
  /**
   * Whether the AS box starts checked. Carries over from the previous confirm,
   * so a run of AS slips does not need the box ticked one page at a time.
   */
  defaultWithAs: boolean
  onConfirm: (num: string, withAs: boolean, edited: boolean) => void
  onDiscard: () => void
}

export function ConfirmSheet({
  candidate,
  duplicate,
  defaultWithAs,
  onConfirm,
  onDiscard,
}: ConfirmSheetProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(candidate.num)
  const [withAs, setWithAs] = useState(defaultWithAs)

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
                  event.target.value.replace(/\D/g, '').slice(0, PROTOCOL_LENGTH),
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
            <span className="block font-mono text-3xl font-bold tracking-wide break-all">
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

        {/* AS is an add-on to the ordinary protocol, so this is one checkbox
            rather than a choice between two — "AS only" is never valid. */}
        <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/10">
          <Checkbox
            checked={withAs}
            onCheckedChange={(checked) => setWithAs(checked === true)}
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">
              Protocolar também AS
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              Envia o protocolo comum e, se ele der certo, o AS.
            </span>
          </span>
        </Label>

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
            disabled={!valid || duplicate}
            onClick={() => onConfirm(value, withAs, edited)}
          >
            Confirmar
          </Button>
        </div>
      </DialogSheet>
    </Dialog>
  )
}
