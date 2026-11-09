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
import {
  isAsProtocoled,
  isProtocoled,
  isSelected,
  wantsProtocol,
} from '@/lib/queue'
import type { ProtocolRecord } from '@/types'

type ProtocolRowProps = {
  record: ProtocolRecord
  busy: boolean
  onEdit: (num: string) => void
  onToggleAs: (num: string) => void
  onToggleSelected: (num: string) => void
  onRetryLookup: (num: string) => void
  onDelete: (num: string) => void
}

type BadgeSpec = {
  variant: 'secondary' | 'success' | 'destructive' | 'warning'
  icon: typeof CircleCheck
  text: string
  spin?: boolean
}

/**
 * What the ordinary protocol's badge says.
 *
 * Driven by `isProtocoled` rather than the raw step status, so a record that
 * was filed reads **Protocolado** even when a later run left its step state
 * mid-flight. The flag is the truth about what was sent; the status is not.
 */
function protocolBadge(record: ProtocolRecord): BadgeSpec | null {
  if (isProtocoled(record)) {
    return { variant: 'success', icon: CircleCheck, text: 'Protocolado' }
  }
  switch (record.protocol.status) {
    case 'running':
      return {
        variant: 'secondary',
        icon: Loader2,
        text: 'Protocolando…',
        spin: true,
      }
    case 'failed':
      return {
        variant: 'destructive',
        icon: CircleAlert,
        text: 'Falha ao protocolar',
      }
    default:
      return null
  }
}

function asBadge(record: ProtocolRecord): BadgeSpec | null {
  if (isAsProtocoled(record)) {
    return { variant: 'success', icon: CircleCheck, text: 'AS protocolada' }
  }
  switch (record.as.status) {
    case 'running':
      return {
        variant: 'secondary',
        icon: Loader2,
        text: 'Protocolando AS…',
        spin: true,
      }
    case 'failed':
      return { variant: 'destructive', icon: CircleAlert, text: 'Falha na AS' }
    case 'skipped':
      return { variant: 'warning', icon: CircleDashed, text: 'AS não enviada' }
    default:
      return null
  }
}

function StepBadge({ spec }: { spec: BadgeSpec | null }) {
  if (!spec) return null
  const Icon = spec.icon
  return (
    <Badge variant={spec.variant}>
      <Icon className={spec.spin ? 'animate-spin' : undefined} />
      {spec.text}
    </Badge>
  )
}

export function ProtocolRow({
  record,
  busy,
  onEdit,
  onToggleAs,
  onToggleSelected,
  onRetryLookup,
  onDelete,
}: ProtocolRowProps) {
  const lookupFailed = record.lookup.status === 'failed'
  const selected = isSelected(record)
  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${selected ? 'border-border' : 'border-dashed border-border'}`}
    >
      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            PROTOCOLO
          </p>
          <p className="mt-1 break-all font-mono text-base font-semibold tracking-tight">
            {formatProtocol(record.num)}
          </p>
          <h3 className="mt-2 break-words text-base font-semibold leading-snug">
            {record.nomecompleto ||
              (record.lookup.status === 'pending'
                ? 'Buscando cliente…'
                : 'Nome não disponível')}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {record.id && <Badge variant="outline">ID {record.id}</Badge>}
          {record.editedAt && (
            <Badge variant="outline">
              <Pencil /> corrigido
            </Badge>
          )}
          {record.lookup.status === 'pending' && (
            <Badge variant="secondary">
              <Loader2 className="animate-spin" /> buscando dados
            </Badge>
          )}
          {lookupFailed && (
            <Badge variant="warning">
              <CircleAlert /> consulta pendente
            </Badge>
          )}
          <StepBadge spec={protocolBadge(record)} />
          <StepBadge spec={asBadge(record)} />
          {!selected && <Badge variant="outline">Fora do envio</Badge>}
        </div>
        {[
          lookupFailed ? record.lookup.reason : null,
          record.protocol.status === 'failed' ? record.protocol.reason : null,
          record.as.status === 'failed' ? record.as.reason : null,
        ]
          .filter(Boolean)
          .map((reason, index) => (
            <p
              key={index}
              className="break-words text-xs leading-relaxed text-destructive"
            >
              {reason}
            </p>
          ))}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5">
            <Checkbox
              checked={wantsProtocol(record)}
              disabled={busy || isProtocoled(record)}
              onCheckedChange={() => onToggleSelected(record.num)}
            />
            Protocolar
          </label>
          <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5">
            <Checkbox
              checked={record.withAs}
              disabled={busy || isAsProtocoled(record)}
              onCheckedChange={() => onToggleAs(record.num)}
            />
            Protocolar AS
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border/60 bg-muted/40 px-2 py-1">
        {(lookupFailed || !record.nomecompleto) && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onRetryLookup(record.num)}
            aria-label={`Consultar dados de ${record.num}`}
          >
            <RefreshCw /> Consultar
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={busy || isProtocoled(record) || isAsProtocoled(record)}
          onClick={() => onEdit(record.num)}
          aria-label={`Corrigir ${record.num}`}
        >
          <Pencil /> Corrigir
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={() => onDelete(record.num)}
          aria-label={`Remover ${record.num}`}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}
