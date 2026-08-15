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
import { isAsProtocoled, isProtocoled, isSelected } from '@/lib/queue'
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
      return { variant: 'destructive', icon: CircleAlert, text: 'Falha ao protocolar' }
    default:
      return null
  }
}

function asBadge(record: ProtocolRecord): BadgeSpec | null {
  if (!record.withAs) return null
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
  const done = isProtocoled(record) && (!record.withAs || isAsProtocoled(record))

  return (
    <li
      className={`rounded-2xl border bg-card transition-colors ${
        selected ? 'border-border' : 'border-dashed border-border/70 bg-card/50'
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Generous tap target: this is the control people use most on a phone. */}
        <label className="-m-1 flex cursor-pointer items-center p-1">
          <Checkbox
            className="size-5"
            checked={selected}
            disabled={busy || done}
            onCheckedChange={() => onToggleSelected(record.num)}
            aria-label={
              selected
                ? `Deixar ${record.num} fora do envio`
                : `Incluir ${record.num} no envio`
            }
          />
        </label>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span
              className={`font-mono text-base font-semibold break-all ${
                selected ? '' : 'text-muted-foreground line-through decoration-1'
              }`}
            >
              {formatProtocol(record.num)}
            </span>

            <div className="-mt-1 -mr-1 flex shrink-0 items-center">
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

          <div className="flex flex-wrap items-center gap-1.5">
            {record.editedAt && (
              <Badge variant="outline">
                <Pencil /> corrigido
              </Badge>
            )}
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
            <StepBadge spec={protocolBadge(record)} />
            <StepBadge spec={asBadge(record)} />
            {!selected && !done && <Badge variant="outline">fora do envio</Badge>}
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

          <label className="flex w-fit cursor-pointer items-center gap-2 py-1 text-xs text-muted-foreground">
            <Checkbox
              className="size-4"
              checked={record.withAs}
              disabled={busy || done}
              onCheckedChange={() => onToggleAs(record.num)}
            />
            Protocolar também AS
          </label>
        </div>
      </div>
    </li>
  )
}
