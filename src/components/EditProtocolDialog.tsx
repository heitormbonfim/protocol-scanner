import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PROTOCOL_LENGTH,
  formatProtocol,
  hasPlausibleDatePrefix,
  isWellFormed,
} from '@/lib/protocol'
import type { ProtocolRecord } from '@/types'

type EditProtocolDialogProps = {
  record: ProtocolRecord | null
  /** Every other number in the history, to reject collisions. */
  takenNumbers: string[]
  onSave: (originalNum: string, nextNum: string) => void
  onClose: () => void
}

export function EditProtocolDialog({
  record,
  takenNumbers,
  onSave,
  onClose,
}: EditProtocolDialogProps) {
  const [draft, setDraft] = useState('')

  // Re-seed the field whenever a different record is opened.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (record && seededFor !== record.num) {
    setSeededFor(record.num)
    setDraft(record.num)
  }

  if (!record) return null

  const valid = isWellFormed(draft)
  const changed = draft !== record.num
  const collides = changed && takenNumbers.includes(draft)
  const suspiciousDate = valid && !hasPlausibleDatePrefix(draft)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir protocolo</DialogTitle>
          <DialogDescription>
            Salvar com um número diferente descarta o ID atual e busca outro,
            já que o ID pertence ao número antigo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="edit-num">Número ({PROTOCOL_LENGTH} dígitos)</Label>
          <Input
            id="edit-num"
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
          <p className="text-xs text-muted-foreground">
            {draft.length} / {PROTOCOL_LENGTH} · original{' '}
            <span className="font-mono">{formatProtocol(record.num)}</span>
          </p>
        </div>

        {collides && (
          <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            Já existe outro protocolo com esse número no histórico.
          </p>
        )}

        {suspiciousDate && !collides && (
          <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            Os 8 primeiros dígitos não formam uma data válida.
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            disabled={!valid || !changed || collides}
            onClick={() => onSave(record.num, draft)}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
