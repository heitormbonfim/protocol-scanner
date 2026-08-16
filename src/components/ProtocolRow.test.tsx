import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProtocolRow } from './ProtocolRow'
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

function setup(record: ProtocolRecord, busy = false) {
  const handlers = {
    onEdit: vi.fn(),
    onToggleAs: vi.fn(),
    onToggleSelected: vi.fn(),
    onRetryLookup: vi.fn(),
    onDelete: vi.fn(),
  }
  render(<ProtocolRow record={record} busy={busy} {...handlers} />)
  return handlers
}

describe('ProtocolRow — status wording', () => {
  it('says "Protocolado" once the protocol has been filed', () => {
    setup(makeRecord({ protocoled: true, protocol: { status: 'success' } }))
    expect(screen.getByText('Protocolado')).toBeInTheDocument()
  })

  it('still says "Protocolado" when a later run left the step mid-flight', () => {
    // The wording follows the sticky flag, not the step status — otherwise a
    // record queued for its pending AS would read as unsent despite being filed.
    setup(makeRecord({ protocoled: true, protocol: { status: 'running' } }))
    expect(screen.getByText('Protocolado')).toBeInTheDocument()
    expect(screen.queryByText('Protocolando…')).not.toBeInTheDocument()
  })

  it('says "Protocolando…" while it is actually in flight', () => {
    setup(makeRecord({ protocol: { status: 'running' } }))
    expect(screen.getByText('Protocolando…')).toBeInTheDocument()
  })

  it('says "Falha ao protocolar" when it failed', () => {
    setup(makeRecord({ protocol: { status: 'failed', reason: 'HTTP 500' } }))
    expect(screen.getByText('Falha ao protocolar')).toBeInTheDocument()
    expect(screen.getByText('HTTP 500')).toBeInTheDocument()
  })

  it('says "AS protocolada" when the AS went out', () => {
    setup(
      makeRecord({
        withAs: true,
        protocoled: true,
        asProtocoled: true,
        protocol: { status: 'success' },
        as: { status: 'success' },
      }),
    )
    expect(screen.getByText('AS protocolada')).toBeInTheDocument()
  })

  it('says "AS não enviada" when AS was skipped', () => {
    setup(
      makeRecord({
        withAs: true,
        protocol: { status: 'failed', reason: 'HTTP 500' },
        as: { status: 'skipped', reason: 'AS não enviado' },
      }),
    )
    expect(screen.getByText('AS não enviada')).toBeInTheDocument()
  })

  it('shows no AS status at all when AS was not requested', () => {
    // A stale AS result must not surface for a record that no longer asks for
    // one. (The "Protocolar também AS" checkbox itself is always offered.)
    setup(makeRecord({ withAs: false, as: { status: 'failed', reason: 'stale' } }))

    expect(screen.queryByText('AS protocolada')).not.toBeInTheDocument()
    expect(screen.queryByText('Falha na AS')).not.toBeInTheDocument()
    expect(screen.queryByText('AS não enviada')).not.toBeInTheDocument()
    expect(screen.queryByText('stale')).not.toBeInTheDocument()
  })
})

describe('ProtocolRow — leaving records out', () => {
  it('reports an unticked record as out of the run', async () => {
    setup(makeRecord({ selected: false }))
    expect(screen.getByText('fora do envio')).toBeInTheDocument()
  })

  it('unticks on tap', async () => {
    const user = userEvent.setup()
    const { onToggleSelected } = setup(makeRecord({ selected: true }))

    await user.click(
      screen.getByRole('checkbox', { name: /deixar .* fora do envio/i }),
    )
    expect(onToggleSelected).toHaveBeenCalledWith('202601300217719')
  })

  it('re-ticks a record that was left out', async () => {
    const user = userEvent.setup()
    const { onToggleSelected } = setup(makeRecord({ selected: false }))

    await user.click(
      screen.getByRole('checkbox', { name: /incluir .* no envio/i }),
    )
    expect(onToggleSelected).toHaveBeenCalledWith('202601300217719')
  })

  it('cannot be unticked once filed — there is nothing left to leave out', () => {
    setup(makeRecord({ protocoled: true, protocol: { status: 'success' } }))
    expect(
      screen.getByRole('checkbox', { name: /fora do envio/i }),
    ).toBeDisabled()
  })

  it('locks the checkboxes while a run is in progress', () => {
    setup(makeRecord(), true)
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeDisabled()
    }
  })
})
