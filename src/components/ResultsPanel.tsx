import { useState } from 'react'
import { ArrowLeft, CircleAlert, CircleCheck, Copy, Download, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatProtocol } from '@/lib/protocol'
import { recordOutcomes } from '@/lib/queue'
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

/** `numero;id;tipo;situacao;motivo` — semicolons because pt-BR Excel splits on them. */
function toCsv(outcomes: ProtocolOutcome[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const rows = outcomes.map((outcome) =>
    [
      outcome.num,
      outcome.id ?? '',
      KIND_LABEL[outcome.kind],
      outcome.ok ? 'sucesso' : 'falha',
      outcome.reason,
    ]
      .map(escape)
      .join(';'),
  )
  return ['"numero";"id";"tipo";"situacao";"motivo"', ...rows].join('\n')
}

function ResultRow({ outcome }: { outcome: ProtocolOutcome }) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-base font-semibold break-all">
          {formatProtocol(outcome.num)}
        </span>
        <Badge variant={outcome.kind === 'as' ? 'default' : 'outline'}>
          {KIND_LABEL[outcome.kind]}
        </Badge>
        <Badge variant="outline">ID {outcome.id ?? '—'}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{outcome.reason}</p>
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
  const [copied, setCopied] = useState(false)

  // Derived from the records rather than held in state, so the report survives
  // a reload and always reflects the latest retry.
  const outcomes = records.flatMap(recordOutcomes)
  const succeeded = outcomes.filter((outcome) => outcome.ok)
  const failed = outcomes.filter((outcome) => !outcome.ok)

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(outcomes))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const downloadCsv = () => {
    // Leading BOM so Excel opens the accented reasons as UTF-8.
    const blob = new Blob([`﻿${toCsv(outcomes)}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `protocolos-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="pt-safe flex items-center gap-3 px-4 pb-3">
        <Button size="icon" variant="ghost" onClick={onBack} aria-label="Voltar">
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Relatório</h1>
          <p className="text-sm text-muted-foreground">
            {succeeded.length} com sucesso · {failed.length} com falha
          </p>
        </div>
        {/* `ml-auto`: this header has no justify-between, unlike Dashboard's. */}
        <div className="ml-auto">
          <UserChip usuario={usuario} onLogout={onLogout} />
        </div>
      </header>

      <div className="flex-1 space-y-4 px-4 pb-4">
        {outcomes.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nada foi protocolado ainda.
          </p>
        )}

        {failed.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-destructive">
              <CircleAlert className="size-4" /> Falha ({failed.length})
            </h2>
            <ul className="space-y-2">
              {failed.map((outcome) => (
                <ResultRow key={`${outcome.num}-${outcome.kind}`} outcome={outcome} />
              ))}
            </ul>
            <Button className="w-full" onClick={onRetryFailed}>
              <RefreshCw /> Tentar novamente os que falharam
            </Button>
          </section>
        )}

        {succeeded.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-success">
              <CircleCheck className="size-4" /> Sucesso ({succeeded.length})
            </h2>
            <ul className="space-y-2">
              {succeeded.map((outcome) => (
                <ResultRow key={`${outcome.num}-${outcome.kind}`} outcome={outcome} />
              ))}
            </ul>
          </section>
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
