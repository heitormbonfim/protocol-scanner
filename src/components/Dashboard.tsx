import { useMemo, useState } from 'react'
import {
  Camera,
  FileText,
  ListChecks,
  Search,
  Send,
  Square,
  Trash2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ProtocolRow } from '@/components/ProtocolRow'
import { formatProtocol } from '@/lib/protocol'
import type { QueueProgress } from '@/lib/queue'
import type { ProtocolRecord } from '@/types'

type DashboardProps = {
  records: ProtocolRecord[]
  running: boolean
  progress: QueueProgress | null
  onOpenScanner: () => void
  onEdit: (num: string) => void
  onToggleAs: (num: string) => void
  onRetryLookup: (num: string) => void
  onDelete: (num: string) => void
  onClearHistory: () => void
  onProtocolAll: () => void
  onAbort: () => void
  onViewResults: () => void
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'destructive' | 'warning'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'destructive'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-foreground'
  return (
    <Card>
      <CardContent className="p-3">
        <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

export function Dashboard({
  records,
  running,
  progress,
  onOpenScanner,
  onEdit,
  onToggleAs,
  onRetryLookup,
  onDelete,
  onClearHistory,
  onProtocolAll,
  onAbort,
  onViewResults,
}: DashboardProps) {
  const [query, setQuery] = useState('')

  const stats = useMemo(
    () => ({
      total: records.length,
      pending: records.filter((r) => r.protocol.status === 'idle').length,
      done: records.filter((r) => r.protocol.status === 'success').length,
      failed: records.filter(
        (r) =>
          r.protocol.status === 'failed' ||
          (r.withAs && (r.as.status === 'failed' || r.as.status === 'skipped')),
      ).length,
    }),
    [records],
  )

  const filtered = useMemo(() => {
    const digits = query.replace(/\D/g, '')
    if (!digits) return records
    return records.filter((r) => r.num.includes(digits))
  }, [records, query])

  const hasResults = records.some(
    (r) => r.protocol.status === 'success' || r.protocol.status === 'failed',
  )
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="pt-safe flex items-center justify-between gap-3 px-4 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Leitor de Protocolos</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total === 0
              ? 'Nenhum protocolo no histórico'
              : `${stats.total} no histórico`}
          </p>
        </div>
        {hasResults && (
          <Button variant="outline" size="sm" onClick={onViewResults}>
            <FileText /> Relatório
          </Button>
        )}
      </header>

      <div className="space-y-4 px-4">
        <Button size="lg" className="w-full" onClick={onOpenScanner} disabled={running}>
          <Camera /> Escanear protocolos
        </Button>

        {stats.total > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Total" value={stats.total} />
            <Stat label="A enviar" value={stats.pending} />
            <Stat label="Enviados" value={stats.done} tone="success" />
            <Stat label="Falhas" value={stats.failed} tone="destructive" />
          </div>
        )}
      </div>

      {/* ── History ────────────────────────────────────────────────────────── */}
      {records.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="rounded-2xl bg-secondary p-5">
            <ListChecks className="size-8 text-muted-foreground" />
          </div>
          <p className="font-medium">O histórico está vazio</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Abra a câmera e enquadre a folha inteira. O app acha o campo
            &quot;Protocolo Nº&quot; sozinho — não precisa aproximar.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por número…"
                inputMode="numeric"
                className="pl-9"
              />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={running}
                  aria-label="Limpar histórico"
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso apaga os {records.length} protocolos deste aparelho,
                    inclusive os que já foram enviados. Não dá para desfazer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onClearHistory}>
                    Limpar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum protocolo contém “{query}”.
            </p>
          ) : (
            <ul className="space-y-2 pb-4">
              {filtered.map((record) => (
                <ProtocolRow
                  key={record.num}
                  record={record}
                  busy={running}
                  onEdit={onEdit}
                  onToggleAs={onToggleAs}
                  onRetryLookup={onRetryLookup}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Sticky action bar ──────────────────────────────────────────────── */}
      {records.length > 0 && (
        <div className="pb-safe sticky bottom-0 mt-auto space-y-2 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur">
          {running && progress ? (
            <>
              <Progress value={percent} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {progress.done} de {progress.total}
                  {progress.current && (
                    <span className="ml-1 font-mono">
                      {formatProtocol(progress.current)}
                    </span>
                  )}
                </p>
                <Button variant="outline" size="sm" onClick={onAbort}>
                  <Square /> Parar
                </Button>
              </div>
            </>
          ) : (
            <Button size="lg" className="w-full" onClick={onProtocolAll}>
              <Send /> Protocolar todos
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
