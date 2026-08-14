import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { formatProtocol } from '@/lib/protocol'
import type { ProtocolRecord, StepState } from '@/types'

type ProtocolRowProps = {
  record: ProtocolRecord
  busy: boolean
  onEdit: (num: string) => void
  onToggleAs: (num: string) => void
  onRetryLookup: (num: string) => void
  onDelete: (num: string) => void
}

function StepBadge({ label, step }: { label: string; step: StepState }) {
  switch (step.status) {
    case 'running':
      return (
        <Badge variant="secondary">
          <Loader2 className="animate-spin" /> {label}
        </Badge>
      )
    case 'success':
      return (
        <Badge variant="success">
          <CircleCheck /> {label}
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="destructive">
          <CircleAlert /> {label}
        </Badge>
      )
    case 'skipped':
      return (
        <Badge variant="warning">
          <CircleDashed /> {label} não enviado
        </Badge>
      )
    default:
      return null
  }
}

export function ProtocolRow({
  record,
  busy,
  onEdit,
  onToggleAs,
  onRetryLookup,
  onDelete,
}: ProtocolRowProps) {
  const lookupFailed = record.lookup.status === 'failed'

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-base font-semibold break-all">
              {formatProtocol(record.num)}
            </span>
            {record.editedAt && (
              <Badge variant="outline">
                <Pencil /> corrigido
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {record.lookup.status === 'pending' && (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" /> buscando ID
              </Badge>
            )}
            {record.lookup.status === 'ok' && (
              <Badge variant="outline">ID {record.id}</Badge>
            )}
            {lookupFailed && (
              <Badge variant="warning">
                <CircleAlert /> sem ID
              </Badge>
            )}
            <StepBadge label="Protocolo" step={record.protocol} />
            {record.withAs && <StepBadge label="AS" step={record.as} />}
          </div>

          {lookupFailed && record.lookup.reason && (
            <p className="text-xs text-muted-foreground">{record.lookup.reason}</p>
          )}
          {record.protocol.status === 'failed' && record.protocol.reason && (
            <p className="text-xs text-muted-foreground">{record.protocol.reason}</p>
          )}
          {record.withAs &&
            record.as.status !== 'success' &&
            record.as.status !== 'idle' &&
            record.as.reason && (
              <p className="text-xs text-muted-foreground">{record.as.reason}</p>
            )}

          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              className="size-4"
              checked={record.withAs}
              disabled={busy}
              onCheckedChange={() => onToggleAs(record.num)}
            />
            Protocolar também AS
          </label>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            disabled={busy}
            onClick={() => onEdit(record.num)}
            aria-label={`Corrigir ${record.num}`}
          >
            <Pencil />
          </Button>
          {lookupFailed && (
            <Button
              size="icon"
              variant="ghost"
              className="size-9"
              disabled={busy}
              onClick={() => onRetryLookup(record.num)}
              aria-label={`Buscar ID de ${record.num}`}
            >
              <RefreshCw />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-9 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onDelete(record.num)}
            aria-label={`Remover ${record.num}`}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  )
}
