import { useState } from 'react'
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Copy,
  Download,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatProtocol } from '@/lib/protocol'
import { recordOutcomes } from '@/lib/queue'
import {
  dayLabel,
  groupOutcomes,
  reportTime,
  toCsv,
  reportDay,
} from '@/lib/report'
import { UserChip } from '@/components/UserChip'
import type { Usuario } from '@/lib/session'
import type { ProtocolOutcome, ProtocolRecord } from '@/types'

type ResultsPanelProps = {
  records: ProtocolRecord[]
  onRetryFailed: () => void
  onBack: () => void
  usuario: Usuario
  onLogout: () => void
}

const KIND_LABEL: Record<ProtocolOutcome['kind'], string> = {
  protocol: 'Protocolo',
  as: 'AS',
}

function ResultRow({ outcome }: { outcome: ProtocolOutcome }) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span
          className={
            outcome.ok
              ? 'flex items-center gap-1 text-success'
              : 'flex items-center gap-1 text-destructive'
          }
        >
          {outcome.ok ? (
            <CircleCheck className="size-4" />
          ) : (
            <CircleAlert className="size-4" />
          )}
          {outcome.ok ? 'Concluído' : 'Falhou'}
        </span>
        <span className="text-muted-foreground">{reportTime(outcome.at)}</span>
      </div>
      <h3 className="mb-2 break-words font-semibold">
        {outcome.nomecompleto || 'Nome não disponível'}
      </h3>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-base font-semibold break-all">
          {formatProtocol(outcome.num)}
        </span>
        <Badge variant={outcome.kind === 'as' ? 'default' : 'outline'}>
          {KIND_LABEL[outcome.kind]}
        </Badge>
        <Badge variant="outline">ID {outcome.id ?? '—'}</Badge>
      </div>
      <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
        {outcome.reason}
      </p>
    </li>
  )
}

export function ResultsPanel({
  records,
  onRetryFailed,
  onBack,
  usuario,
  onLogout,
}: ResultsPanelProps) {
  const [day, setDay] = useState('all')
  const [copyError, setCopyError] = useState(false)
  const [copied, setCopied] = useState(false)

  // Derived from the records rather than held in state, so the report survives
  // a reload and always reflects the latest retry.
  const outcomes = records.flatMap(recordOutcomes)
  const succeeded = outcomes.filter((outcome) => outcome.ok)
  const failed = outcomes.filter((outcome) => !outcome.ok)

  const groups = groupOutcomes(outcomes)
  const visible = groups.filter((group) => day === 'all' || group.day === day)
  const exported = visible.flatMap((group) => group.rows)

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(exported))
      setCopyError(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      setCopyError(true)
    }
  }

  const downloadCsv = () => {
    // Leading BOM so Excel opens the accented reasons as UTF-8.
    const blob = new Blob([`﻿${toCsv(exported)}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `protocolos-${reportDay(Date.now())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="pt-safe flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 pb-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={onBack}
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Relatório</h1>
          <p className="text-sm text-muted-foreground">
            {succeeded.length} com sucesso · {failed.length} com falha
          </p>
        </div>
        {/* `ml-auto`: this header has no justify-between, unlike Dashboard's. */}
        <div className="ml-auto min-w-0 max-w-full">
          <UserChip usuario={usuario} onLogout={onLogout} />
        </div>
      </header>

      <div className="flex-1 space-y-5 px-4 py-5">
        {outcomes.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nada foi protocolado ainda.
          </p>
        )}

        {outcomes.length > 0 && (
          <label className="block space-y-2 text-sm font-medium">
            Data do envio
            <select
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="mt-2 h-12 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-base"
            >
              <option value="all">Todos os dias</option>
              {groups.map((group) => (
                <option key={group.day} value={group.day}>
                  {dayLabel(group.day)}
                </option>
              ))}
            </select>
            <span className="block text-xs font-normal text-muted-foreground">
              Horários de Fortaleza · exportação acompanha o filtro
            </span>
          </label>
        )}
        {visible.map((group) => (
          <section key={group.day} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{dayLabel(group.day)}</h2>
              <p className="text-xs text-muted-foreground">
                {group.rows.filter((row) => row.ok).length} concluídos ·{' '}
                {group.rows.filter((row) => !row.ok).length} falhas
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.rows.map((outcome) => (
                <ResultRow
                  key={`${outcome.num}-${outcome.kind}`}
                  outcome={outcome}
                />
              ))}
            </ul>
          </section>
        ))}
        {failed.length > 0 && (
          <Button
            className="h-auto min-h-12 w-full whitespace-normal"
            disabled={!usuario.podeProtocolar}
            onClick={onRetryFailed}
          >
            <RefreshCw /> Tentar novamente as ações com falha
          </Button>
        )}
        {copyError && (
          <p role="status" className="text-sm text-destructive">
            Não foi possível copiar. Use o botão CSV para baixar.
          </p>
        )}
      </div>

      {outcomes.length > 0 && (
        <div className="pb-safe sticky bottom-0 flex gap-2 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur">
          <Button variant="outline" className="flex-1" onClick={copyReport}>
            <Copy /> {copied ? 'Copiado!' : 'Copiar'}
          </Button>
          <Button variant="outline" className="flex-1" onClick={downloadCsv}>
            <Download /> CSV
          </Button>
        </div>
      )}
    </div>
  )
}
