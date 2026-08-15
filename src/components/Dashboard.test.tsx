import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import type { ProtocolRecord } from '@/types'

function makeRecord(overrides: Partial<ProtocolRecord> = {}): ProtocolRecord {
  return {
    num: '202601300217719',
    id: 'PRT-217719',
    scannedAt: 0,
    source: 'anchored',
    withAs: false,
    selected: true,
    lookup: { status: 'ok' },
    protocol: { status: 'idle' },
    as: { status: 'idle' },
    protocoled: false,
    asProtocoled: false,
    ...overrides,
  }
}

function setup(records: ProtocolRecord[], running = false) {
  const handlers = {
    onOpenScanner: vi.fn(),
    onEdit: vi.fn(),
    onToggleAs: vi.fn(),
    onToggleSelected: vi.fn(),
    onSelectAll: vi.fn(),
    onRetryLookup: vi.fn(),
    onDelete: vi.fn(),
    onClearHistory: vi.fn(),
    onProtocolAll: vi.fn(),
    onAbort: vi.fn(),
    onViewResults: vi.fn(),
  }
  render(
    <Dashboard records={records} running={running} progress={null} {...handlers} />,
  )
  return handlers
}

const other = { num: '202601300217720', id: 'PRT-217720' }

describe('Dashboard — the submit button counts what will be sent', () => {
  it('counts every ticked record', () => {
    setup([makeRecord(), makeRecord(other)])
    expect(screen.getByRole('button', { name: /protocolar 2/i })).toBeEnabled()
  })

  it('drops an unticked record from the count', () => {
    setup([makeRecord(), makeRecord({ ...other, selected: false })])
    expect(screen.getByRole('button', { name: /protocolar 1/i })).toBeInTheDocument()
  })

  it('does not count a record that was already filed', () => {
    setup([
      makeRecord(),
      makeRecord({ ...other, protocoled: true, protocol: { status: 'success' } }),
    ])
    expect(screen.getByRole('button', { name: /protocolar 1/i })).toBeInTheDocument()
  })

  it('offers nothing to send when everything is unticked', () => {
    setup([makeRecord({ selected: false })])
    expect(screen.getByRole('button', { name: /nada a enviar/i })).toBeDisabled()
  })

  it('starts a run when pressed', async () => {
    const user = userEvent.setup()
    const { onProtocolAll } = setup([makeRecord()])

    await user.click(screen.getByRole('button', { name: /protocolar 1/i }))
    expect(onProtocolAll).toHaveBeenCalled()
  })
})

describe('Dashboard — bulk selection', () => {
  it('reports how many of the outstanding records are ticked', () => {
    setup([makeRecord(), makeRecord({ ...other, selected: false })])
    expect(screen.getByText(/de 2 selecionados para protocolar/i)).toBeInTheDocument()
  })

  it('unticks everything when all were ticked', async () => {
    const user = userEvent.setup()
    const { onSelectAll } = setup([makeRecord(), makeRecord(other)])

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    expect(onSelectAll).toHaveBeenCalledWith(false)
  })

  it('ticks everything when some were left out', async () => {
    const user = userEvent.setup()
    const { onSelectAll } = setup([
      makeRecord(),
      makeRecord({ ...other, selected: false }),
    ])

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    expect(onSelectAll).toHaveBeenCalledWith(true)
  })
})

describe('Dashboard — empty and running states', () => {
  it('offers only the scanner when there is no history', () => {
    setup([])
    expect(screen.getByRole('button', { name: /escanear/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /protocolar/i })).not.toBeInTheDocument()
  })

  it('swaps the dock for a stop control while running', () => {
    render(
      <Dashboard
        records={[makeRecord()]}
        running
        progress={{ done: 1, total: 3, current: '202601300217719' }}
        onOpenScanner={vi.fn()}
        onEdit={vi.fn()}
        onToggleAs={vi.fn()}
        onToggleSelected={vi.fn()}
        onSelectAll={vi.fn()}
        onRetryLookup={vi.fn()}
        onDelete={vi.fn()}
        onClearHistory={vi.fn()}
        onProtocolAll={vi.fn()}
        onAbort={vi.fn()}
        onViewResults={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /parar/i })).toBeInTheDocument()
    expect(screen.getByText(/1 de 3/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^protocolar/i })).not.toBeInTheDocument()
  })
})
