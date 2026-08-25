import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ENDPOINTS } from './lib/endpoints'
import { server } from './mocks/server'
import type { ProtocolRecord } from './types'

/**
 * The app shell, exercised for one thing: a run must not start while a record
 * still has no id.
 *
 * The camera is the only part that cannot run here, so both hooks are stubbed
 * into their idle state. Nothing below opens the scanner — the case that
 * matters is reachable without it, because a record restored from storage with
 * an unfinished lookup is in exactly the state a just-scanned slip is in.
 */

vi.mock('@/hooks/useCamera', () => ({
  useCamera: () => ({
    videoRef: { current: null },
    status: 'idle',
    error: null,
    torchOn: false,
    torchSupported: false,
    focusSupported: false,
    start: vi.fn(),
    stop: vi.fn(),
    toggleTorch: vi.fn(),
    focusAt: vi.fn(),
  }),
}))

vi.mock('@/hooks/useScanner', () => ({
  useScanner: () => ({ ready: false, error: null, agreement: 0, required: 3 }),
}))

const NUM = '202601300217719'
const RECORDS_KEY = 'protocol-scanner:records'

function storedRecord(overrides: Partial<ProtocolRecord> = {}): ProtocolRecord {
  return {
    num: NUM,
    id: null,
    scannedAt: 0,
    source: 'anchored',
    withAs: false,
    selected: true,
    // Mid-lookup: the id has been asked for and has not come back.
    lookup: { status: 'pending' },
    protocol: { status: 'idle' },
    as: { status: 'idle' },
    protocoled: false,
    asProtocoled: false,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('a run that starts before the ids have arrived', () => {
  it('waits for the lookup, then submits with the id it returned', async () => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify([storedRecord()]))

    const seen: string[] = []
    let releaseLookup: (() => void) | null = null
    const lookupReached = new Promise<void>((resolve) => {
      server.use(
        http.all(ENDPOINTS.lookup.path, async () => {
          seen.push('lookup')
          resolve()
          // Hold the lookup open, so a run that does not wait is guaranteed to
          // reach the submission first rather than winning a race by luck.
          await new Promise<void>((release) => {
            releaseLookup = release
          })
          return HttpResponse.json({ id: 'PRT-217719' })
        }),
        http.all(`${ENDPOINTS.protocol.path}/:id`, ({ params }) => {
          seen.push(`protocol:${String(params.id)}`)
          return HttpResponse.json({ ok: true })
        }),
      )
    })

    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /protocolar/i }))

    // The lookup goes out and the submission does not follow it yet.
    await lookupReached
    expect(seen).toEqual(['lookup'])

    releaseLookup!()

    await waitFor(() => {
      expect(seen).toEqual(['lookup', 'protocol:PRT-217719'])
    })

    // And nothing was reported as missing an id.
    expect(screen.queryAllByText(/sem id/i)).toEqual([])
  })

  it('still reports "Sem ID" when the lookup genuinely fails', async () => {
    // The wait must not paper over a real failure: a record that truly has no
    // id has not been protocolled, and the user has to see that.
    localStorage.setItem(RECORDS_KEY, JSON.stringify([storedRecord()]))

    let submitted = false
    server.use(
      http.all(ENDPOINTS.lookup.path, () =>
        HttpResponse.json({ message: 'não encontrado' }, { status: 404 }),
      ),
      http.all(`${ENDPOINTS.protocol.path}/:id`, () => {
        submitted = true
        return HttpResponse.json({ ok: true })
      }),
    )

    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /protocolar/i }))

    await waitFor(() => {
      expect(screen.queryAllByText(/sem id/i).length).toBeGreaterThan(0)
    })
    expect(submitted).toBe(false)
  })
})
