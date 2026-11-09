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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ProtocolRow } from '@/components/ProtocolRow'
import { formatProtocol } from '@/lib/protocol'
import {
  isAsProtocoled,
  isComplete,
  isProtocoled,
  pendingRecords,
  type QueueProgress,
} from '@/lib/queue'
import { UserChip } from '@/components/UserChip'
import type { Usuario } from '@/lib/session'
import type { ProtocolRecord } from '@/types'

type DashboardProps = {
  records: ProtocolRecord[]
  running: boolean
  progress: QueueProgress | null
  onOpenScanner: () => void
  onEdit: (num: string) => void
  onToggleAs: (num: string) => void
  onToggleSelected: (num: string) => void
  onSelectAll: (selected: boolean) => void
  onRetryLookup: (num: string) => void
  onDelete: (num: string) => void
  onClearHistory: () => void
  onProtocolAll: () => void
  onAbort: () => void
  onViewResults: () => void
  usuario: Usuario
  onLogout: () => void
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
    <div className="rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-sm">
      <p className={`text-3xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}

export function Dashboard({
  records,
  running,
  progress,
  onOpenScanner,
  onEdit,
  onToggleAs,
  onToggleSelected,
  onSelectAll,
  onRetryLookup,
  onDelete,
  onClearHistory,
  onProtocolAll,
  onAbort,
  onViewResults,
  usuario,
  onLogout,
}: DashboardProps) {
  /*
   * Whether this user may file at all.
   *
   * Derived by the server from the upstream `permissoes` array, so that array
   * never has to leave — see `toSessionDto` in server/auth/auth.dto.ts. Without
   * this check a read-only login would happily start a batch and collect a 403
   * per slip, which reads as a broken app rather than as the wrong account.
   *
   * Read straight off the session, with no fallback: there is deliberately no
   * "unknown, assume allowed" path, because that path would only ever be taken
   * by accident.
   */
  const podeProtocolar = usuario.podeProtocolar
  const [query, setQuery] = useState('')

  /** Records with work left that the user has actually left ticked. */
  const toSend = useMemo(() => pendingRecords(records), [records])

  /** Records with work left, ticked or not — the denominator for the header. */
  const outstanding = useMemo(
    () =>
      records.filter(
        (record) => !isProtocoled(record) || !isAsProtocoled(record),
      ),
    [records],
  )

  const stats = useMemo(
    () => ({
      total: records.length,
      pending: toSend.length,
      done: records.filter(isComplete).length,
      failed: records.filter(
        (record) =>
          record.protocol.status === 'failed' ||
          (record.withAs &&
            (record.as.status === 'failed' || record.as.status === 'skipped')),
      ).length,
    }),
    [records, toSend],
  )

  const filtered = useMemo(() => {
    const term = query
      .trim()
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (!term) return records
    const digits = term.replace(/\D/g, '')
    return records.filter(
      (record) =>
        (digits.length > 0 && record.num.includes(digits)) ||
        (record.nomecompleto ?? '')
          .toLocaleLowerCase('pt-BR')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(term),
    )
  }, [records, query])

  const hasResults = records.some(
    (record) =>
      isProtocoled(record) ||
      isAsProtocoled(record) ||
      record.protocol.status === 'failed' ||
      record.as.status === 'failed',
  )

  const percent =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0

  const allSelected =
    outstanding.length > 0 &&
    outstanding.every(
      (record) =>
        (isProtocoled(record) || record.withProtocol !== false) &&
        (isAsProtocoled(record) || record.withAs),
    )
  const noneSelected = toSend.length === 0
  const selectionState = allSelected
    ? true
    : noneSelected
      ? false
      : ('indeterminate' as const)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="pt-safe border-b border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-white">
              <ListChecks className="size-5" />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight">Mais Cidadão</p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Leitor de protocolos
              </p>
            </div>
          </div>
          <UserChip usuario={usuario} onLogout={onLogout} />
        </div>
      </header>
      <div className="px-4 pt-6 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          Área de trabalho
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Seus protocolos</h1>
          {hasResults && (
            <Button
              variant="outline"
              disabled={running}
              onClick={onViewResults}
            >
              <FileText /> Relatório
            </Button>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Escaneie, confira os clientes e escolha o que enviar.
        </p>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
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
        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="A enviar" value={stats.pending} />
            <Stat label="Protocolados" value={stats.done} tone="success" />
            <Stat label="Falhas" value={stats.failed} tone="destructive" />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cliente ou protocolo"
                aria-label="Buscar cliente ou protocolo"
                className="h-12 pl-9 text-base"
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

          {/* Bulk selection, so leaving a few out does not mean many taps. */}
          {outstanding.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 text-sm">
              <Checkbox
                className="size-5"
                checked={selectionState}
                disabled={running}
                onCheckedChange={() => onSelectAll(!allSelected)}
                aria-label="Selecionar todas as ações pendentes"
              />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {toSend.length}
                </span>{' '}
                com ações selecionadas para envio
              </span>
            </label>
          )}

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado para “{query}”.
            </p>
          ) : (
            <ul className="grid items-start gap-3 pb-2 sm:grid-cols-2">
              {filtered.map((record) => (
                <ProtocolRow
                  key={record.num}
                  record={record}
                  busy={running}
                  onEdit={onEdit}
                  onToggleAs={onToggleAs}
                  onToggleSelected={onToggleSelected}
                  onRetryLookup={onRetryLookup}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Bottom action dock ─────────────────────────────────────────────── */}
      {/*
        Everything you press repeatedly lives down here: on a phone held one
        handed, the top of the screen is the hardest place to reach, and this
        app is used standing up with a stack of paper in the other hand.
      */}
      <div className="pb-safe sticky bottom-0 z-20 mt-auto border-t border-border/60 bg-background/95 px-4 pt-3 backdrop-blur-md">
        {running && progress ? (
          <div className="space-y-2 pb-3">
            <Progress value={percent} />
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-muted-foreground">
                {progress.done} de {progress.total}
                {progress.current && (
                  <span className="ml-1 font-mono">
                    {formatProtocol(progress.current)}
                  </span>
                )}
              </p>
              <Button variant="outline" size="lg" onClick={onAbort}>
                <Square /> Parar
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 pb-3">
            <Button
              size="lg"
              variant={records.length === 0 ? 'default' : 'outline'}
              className={`min-w-0 px-3 text-sm ${records.length === 0 ? 'col-span-2' : ''}`}
              onClick={onOpenScanner}
            >
              <Camera /> Escanear
            </Button>
            {records.length > 0 && (
              <Button
                size="lg"
                className="min-w-0 px-3 text-sm"
                onClick={onProtocolAll}
                disabled={toSend.length === 0 || !podeProtocolar}
              >
                <Send />
                {!podeProtocolar
                  ? 'Sem permissão'
                  : toSend.length === 0
                    ? 'Nada a enviar'
                    : `Enviar ${toSend.length}`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
