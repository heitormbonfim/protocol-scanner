import type { ProtocolOutcome } from '../types'

// Work is reported in the team's timezone, including when a phone is travelling.
export const REPORT_TIME_ZONE = 'America/Fortaleza'
export function reportDay(at?: number): string {
  if (at === undefined || !Number.isFinite(at)) return 'unknown'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function dayLabel(day: string): string {
  if (day === 'unknown') return 'Data não registrada'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))
}

export function reportTime(at?: number): string {
  if (at === undefined || !Number.isFinite(at)) return 'Horário não registrado'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: REPORT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

export function groupOutcomes(outcomes: ProtocolOutcome[]) {
  const groups = new Map<string, ProtocolOutcome[]>()
  for (const outcome of outcomes) {
    const day = reportDay(outcome.at)
    groups.set(day, [...(groups.get(day) ?? []), outcome])
  }
  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a),
    )
    .map(([day, rows]) => ({
      day,
      rows: rows.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
    }))
}

export function toCsv(outcomes: ProtocolOutcome[]): string {
  const escape = (value: string) => {
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
  }
  const rows = groupOutcomes(outcomes)
    .flatMap(({ rows }) => rows)
    .map((outcome) =>
      [
        reportDay(outcome.at) === 'unknown' ? '' : reportDay(outcome.at),
        outcome.at === undefined ? '' : reportTime(outcome.at),
        outcome.num,
        outcome.id ?? '',
        outcome.nomecompleto ?? '',
        outcome.kind === 'as' ? 'AS' : 'Protocolo',
        outcome.ok ? 'sucesso' : 'falha',
        outcome.reason,
      ]
        .map(escape)
        .join(';'),
    )
  return [
    '"data";"hora (Fortaleza)";"numero";"id";"nomecompleto";"tipo";"situacao";"motivo"',
    ...rows,
  ].join('\n')
}
