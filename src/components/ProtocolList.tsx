import { formatProtocol } from '../lib/protocol'
import type { QueueProgress } from '../lib/queue'
import type { ProtocolRecord, StepState } from '../types'

type ProtocolListProps = {
  records: ProtocolRecord[]
  running: boolean
  progress: QueueProgress | null
  onRetryLookup: (num: string) => void
  onToggleAs: (num: string) => void
  onDelete: (num: string) => void
  onProtocolAll: () => void
  onAbort: () => void
  onBackToScanning: () => void
}

function LookupChip({ record }: { record: ProtocolRecord }) {
  if (record.lookup.status === 'pending') {
    return <span className="chip chip--muted">buscando ID…</span>
  }
  if (record.lookup.status === 'ok') {
    return <span className="chip chip--ok">ID {record.id}</span>
  }
  return <span className="chip chip--warn">sem ID</span>
}

function StepChip({ label, step }: { label: string; step: StepState }) {
  switch (step.status) {
    case 'running':
      return <span className="chip chip--muted">{label}: enviando…</span>
    case 'success':
      return <span className="chip chip--ok">{label}: ok</span>
    case 'failed':
      return <span className="chip chip--error">{label}: falhou</span>
    case 'skipped':
      return <span className="chip chip--warn">{label}: não enviado</span>
    default:
      return null
  }
}

export function ProtocolList({
  records,
  running,
  progress,
  onRetryLookup,
  onToggleAs,
  onDelete,
  onProtocolAll,
  onAbort,
  onBackToScanning,
}: ProtocolListProps) {
  const missingIds = records.filter((record) => !record.id).length
  const asCount = records.filter((record) => record.withAs).length
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h1>Lote escaneado</h1>
          <p className="muted">
            {records.length} protocolo{records.length === 1 ? '' : 's'}
            {asCount > 0 && ` · ${asCount} com AS`}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onBackToScanning}
          disabled={running}
        >
          Escanear mais
        </button>
      </header>

      {missingIds > 0 && !running && (
        <p className="alert alert--warn">
          {missingIds} protocolo{missingIds === 1 ? '' : 's'} sem ID. Sem o ID
          não é possível protocolar — tente buscar novamente antes de continuar.
        </p>
      )}

      <ul className="list">
        {records.map((record) => (
          <li key={record.num} className="list__row">
            <div className="list__main">
              <span className="list__num">{formatProtocol(record.num)}</span>
              <span className="list__meta">
                <LookupChip record={record} />
                <StepChip label="Protocolo" step={record.protocol} />
                {record.withAs && <StepChip label="AS" step={record.as} />}
              </span>

              {record.lookup.status === 'failed' && record.lookup.reason && (
                <span className="list__reason">{record.lookup.reason}</span>
              )}
              {record.protocol.reason && record.protocol.status === 'failed' && (
                <span className="list__reason">{record.protocol.reason}</span>
              )}
              {record.withAs &&
                record.as.reason &&
                record.as.status !== 'success' && (
                  <span className="list__reason">{record.as.reason}</span>
                )}

              <label className="checkbox checkbox--inline">
                <input
                  type="checkbox"
                  checked={record.withAs}
                  disabled={running}
                  onChange={() => onToggleAs(record.num)}
                />
                <span>
                  Protocolar também <strong>AS</strong>
                </span>
              </label>
            </div>

            <div className="list__actions">
              {record.lookup.status === 'failed' && (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => onRetryLookup(record.num)}
                  disabled={running}
                >
                  Buscar ID
                </button>
              )}
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => onDelete(record.num)}
                disabled={running}
                aria-label={`Remover ${record.num}`}
              >
                Remover
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="panel__foot">
        {running && progress ? (
          <>
            <div className="progress" role="progressbar" aria-valuenow={percent}>
              <div className="progress__fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="muted">
              {progress.done} de {progress.total}
              {progress.current ? ` — ${formatProtocol(progress.current)}` : ''}
            </p>
            <button type="button" className="btn btn--ghost" onClick={onAbort}>
              Parar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={onProtocolAll}
            disabled={records.length === 0}
          >
            Protocolar todos
          </button>
        )}
      </div>
    </section>
  )
}
