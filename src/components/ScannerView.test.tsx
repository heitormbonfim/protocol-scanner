import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { ScannerView } from './ScannerView'
import { DEFAULT_FIELD_ROI, SCAN_ROI } from '@/lib/preprocess'

/**
 * The aim box is what decides *which* number gets read on a slip carrying
 * several "Protocolo" labels, so the wiring that positions it is worth pinning
 * down: a box that does not go where it is dragged reads the wrong field, and
 * the only symptom is a number that looks plausible and is wrong.
 *
 * jsdom implements neither pointer capture nor layout, both of which the drag
 * genuinely needs in a browser. They are supplied here rather than guarded
 * against in the component, so the code under test is the code that ships.
 */

const WIDTH = 400
const HEIGHT = 800

const originalRect = Element.prototype.getBoundingClientRect

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: WIDTH, bottom: HEIGHT, width: WIDTH, height: HEIGHT }) as DOMRect

  for (const [prop, value] of [
    ['clientWidth', WIDTH],
    ['clientHeight', HEIGHT],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { value, configurable: true })
  }
  for (const [prop, value] of [
    ['videoWidth', 1920],
    ['videoHeight', 1080],
  ] as const) {
    Object.defineProperty(HTMLVideoElement.prototype, prop, { value, configurable: true })
  }
})

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect
})

function setup(props: Partial<React.ComponentProps<typeof ScannerView>> = {}) {
  const onFieldRoiChange = vi.fn()
  const onFocusAt = vi.fn()

  render(
    <ScannerView
      videoRef={createRef<HTMLVideoElement>()}
      cameraStatus="active"
      cameraError={null}
      torchOn={false}
      torchSupported={false}
      focusSupported
      fieldRoi={DEFAULT_FIELD_ROI}
      onStart={vi.fn()}
      onToggleTorch={vi.fn()}
      onFocusAt={onFocusAt}
      onFieldRoiChange={onFieldRoiChange}
      ocrReady
      scannerError={null}
      agreement={0}
      required={3}
      source={null}
      paused={false}
      scannedThisSession={0}
      pendingCount={0}
      onProtocol={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  )

  return { box: screen.getByRole('application'), onFieldRoiChange, onFocusAt }
}

/** Press, move, release — the browser's own sequence for a drag. */
function drag(box: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(box, { pointerId: 1, clientX: 100, clientY: 400 })
  fireEvent.pointerMove(box, { pointerId: 1, clientX: 100 + dx, clientY: 400 + dy })
  fireEvent.pointerUp(box, { pointerId: 1, clientX: 100 + dx, clientY: 400 + dy })
}

describe('the overlay itself', () => {
  it('stacks above the dashboard chrome', () => {
    // Regression. The dashboard's header and bottom dock are `sticky z-20`, and
    // a positioned element with a z-index paints above a `fixed` one with
    // `z-index: auto` — so with no z-index here the Escanear and Protocolar
    // buttons showed through the camera and could be pressed mid-scan.
    setup()
    const overlay = document.querySelector('.fixed.inset-0')

    expect(overlay).not.toBeNull()
    expect(overlay).toHaveClass('z-40')
  })

  it('counts the slips confirmed since the camera opened', () => {
    setup({ scannedThisSession: 7 })
    expect(screen.getByText(/7 nesta sessão/)).toBeInTheDocument()
  })
})

describe('finishing a stack from the scanner', () => {
  it('offers no submit button when there is nothing to send', () => {
    setup({ pendingCount: 0 })
    expect(
      screen.queryByRole('button', { name: /protocolar/i }),
    ).not.toBeInTheDocument()
  })

  it('offers one, counting what would go out', () => {
    setup({ pendingCount: 4 })
    expect(
      screen.getByRole('button', { name: /protocolar 4/i }),
    ).toBeInTheDocument()
  })

  it('hands the run to the app, which closes the camera first', async () => {
    // The camera must not stay up during a run: submissions would go out behind
    // an opaque overlay with no progress and no way to stop them.
    const user = userEvent.setup()
    const onProtocol = vi.fn()
    setup({ pendingCount: 2, onProtocol })

    await user.click(screen.getByRole('button', { name: /protocolar 2/i }))
    expect(onProtocol).toHaveBeenCalledOnce()
  })

  it('still offers Concluir on its own', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    setup({ pendingCount: 3, onClose })

    await user.click(screen.getByRole('button', { name: /concluir/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('the aim box', () => {
  it('is drawn where the ROI says it is', () => {
    const { box } = setup()
    expect(box.style.left).toBe(`${DEFAULT_FIELD_ROI.x * 100}%`)
    expect(box.style.top).toBe(`${DEFAULT_FIELD_ROI.y * 100}%`)
    expect(box.style.width).toBe(`${DEFAULT_FIELD_ROI.w * 100}%`)
  })

  it('moves by the distance dragged', () => {
    const { box, onFieldRoiChange } = setup()
    drag(box, 0, 80)

    const roi = onFieldRoiChange.mock.lastCall?.[0]
    // 80px down a 800px-tall screen is a tenth of the way.
    expect(roi.y).toBeCloseTo(DEFAULT_FIELD_ROI.y + 0.1, 5)
    expect(roi.x).toBeCloseTo(DEFAULT_FIELD_ROI.x, 5)
  })

  it('cannot be dragged out of the document guide', () => {
    const { box, onFieldRoiChange } = setup()
    drag(box, 0, 10_000)

    const roi = onFieldRoiChange.mock.lastCall?.[0]
    expect(roi.y + roi.h).toBeCloseTo(SCAN_ROI.y + SCAN_ROI.h, 5)
  })

  it('ignores a press too small to be a drag, and focuses there instead', () => {
    // Otherwise every tap on the paper would nudge the box off the field.
    const { box, onFieldRoiChange, onFocusAt } = setup()
    drag(box, 2, 2)

    expect(onFieldRoiChange).not.toHaveBeenCalled()
    expect(onFocusAt).toHaveBeenCalled()
  })

  it('nudges with the arrow keys, for a position a finger cannot hit', () => {
    const { box, onFieldRoiChange } = setup()
    fireEvent.keyDown(box, { key: 'ArrowDown' })

    const roi = onFieldRoiChange.mock.lastCall?.[0]
    expect(roi.y).toBeGreaterThan(DEFAULT_FIELD_ROI.y)
    expect(roi.x).toBe(DEFAULT_FIELD_ROI.x)
  })

  it('leaves other keys to the browser', () => {
    const { box, onFieldRoiChange } = setup()
    fireEvent.keyDown(box, { key: 'Tab' })
    expect(onFieldRoiChange).not.toHaveBeenCalled()
  })
})
