import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from './ConfirmSheet'
import type { ScanCandidate } from '@/types'

const candidate: ScanCandidate = {
  num: '202601300217719',
  thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  source: 'anchored',
}

function setup(props: Partial<React.ComponentProps<typeof ConfirmSheet>> = {}) {
  const onConfirm = vi.fn()
  const onDiscard = vi.fn()
  render(
    <ConfirmSheet
      candidate={candidate}
      duplicate={false}
      defaultWithAs={false}
      onConfirm={onConfirm}
      onDiscard={onDiscard}
      {...props}
    />,
  )
  return { onConfirm, onDiscard, user: userEvent.setup() }
}

describe('ConfirmSheet', () => {
  it('shows the number grouped, and the photo it was read from', () => {
    setup()
    // The image is the real correctness guarantee — the user compares it to
    // the digits — so its absence would be a serious regression.
    expect(screen.getByAltText(/foto capturada/i)).toBeInTheDocument()
    expect(screen.getByText('20260130 0217719')).toBeInTheDocument()
  })

  it('confirms with the scanned number and no AS by default', async () => {
    const { onConfirm, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onConfirm).toHaveBeenCalledWith('202601300217719', false, false)
  })

  it('confirms with AS when the box is ticked', async () => {
    const { onConfirm, user } = setup()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onConfirm).toHaveBeenCalledWith('202601300217719', true, false)
  })

  it('carries the sticky AS choice in from the previous scan', () => {
    setup({ defaultWithAs: true })
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('blocks confirming a duplicate', () => {
    setup({ duplicate: true })
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    expect(screen.getByText(/já está no histórico/i)).toBeInTheDocument()
  })

  it('warns when the date prefix does not parse', () => {
    // Day 90 — the shape a misread digit usually takes.
    setup({ candidate: { ...candidate, num: '202601900217719' } })
    expect(screen.getByText(/não formam uma data válida/i)).toBeInTheDocument()
  })

  it('lets the user correct a misread number and reports it as edited', async () => {
    const { onConfirm, user } = setup()
    await user.click(screen.getByRole('button', { name: /toque para corrigir/i }))

    const input = screen.getByLabelText(/corrigir número/i)
    await user.clear(input)
    await user.type(input, '202601300217711')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(onConfirm).toHaveBeenCalledWith('202601300217711', false, true)
  })

  it('refuses to confirm a number of the wrong length', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /toque para corrigir/i }))

    const input = screen.getByLabelText(/corrigir número/i)
    await user.clear(input)
    await user.type(input, '123')

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  it('strips non-digits typed into the correction field', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /toque para corrigir/i }))

    const input = screen.getByLabelText<HTMLInputElement>(/corrigir número/i)
    await user.clear(input)
    await user.type(input, '2026-01-30 abc')

    expect(input.value).toBe('20260130')
  })

  it('discards without recording anything', async () => {
    const { onConfirm, onDiscard, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onDiscard).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
