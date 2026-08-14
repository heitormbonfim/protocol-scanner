import { describe, expect, it } from 'vitest'
import { SCAN_ROI, roiToSourceRect } from './preprocess'

/**
 * `roiToSourceRect` maps the framing box the user sees onto the video's
 * intrinsic pixel grid. Getting it wrong means the box on screen and the pixels
 * actually read drift apart — a silent failure where the scanner simply never
 * finds anything and nothing looks broken. Hence the coverage.
 */

function fakeVideo(
  videoWidth: number,
  videoHeight: number,
  clientWidth: number,
  clientHeight: number,
): HTMLVideoElement {
  return { videoWidth, videoHeight, clientWidth, clientHeight } as HTMLVideoElement
}

describe('roiToSourceRect', () => {
  it('returns null before the stream has dimensions', () => {
    // videoWidth is 0 until the first frame arrives.
    expect(roiToSourceRect(fakeVideo(0, 0, 400, 800), SCAN_ROI)).toBeNull()
  })

  it('returns null when the element has not been laid out', () => {
    expect(roiToSourceRect(fakeVideo(1920, 1080, 0, 0), SCAN_ROI)).toBeNull()
  })

  it('scales straight through when aspect ratios match', () => {
    const rect = roiToSourceRect(fakeVideo(1000, 1000, 500, 500), {
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.1,
    })
    expect(rect).toEqual({ sx: 100, sy: 200, sw: 500, sh: 100 })
  })

  it('accounts for the horizontal crop when cover overflows sideways', () => {
    // A landscape camera in a portrait element: `cover` scales to fill the
    // height and clips the sides, so a full-width ROI must map to the middle
    // band of the frame, not to its full width.
    const rect = roiToSourceRect(fakeVideo(1920, 1080, 400, 800), {
      x: 0,
      y: 0.5,
      w: 1,
      h: 0.1,
    })
    expect(rect).not.toBeNull()
    expect(rect!.sx).toBeCloseTo(690, 0)
    expect(rect!.sy).toBeCloseTo(540, 0)
    expect(rect!.sw).toBeCloseTo(540, 0)
    expect(rect!.sh).toBeCloseTo(108, 0)
    // The decisive assertion: a full-width box reads well under the full frame.
    expect(rect!.sw).toBeLessThan(1920)
  })

  it('accounts for the vertical crop when cover overflows downward', () => {
    const rect = roiToSourceRect(fakeVideo(1080, 1920, 800, 400), {
      x: 0.5,
      y: 0,
      w: 0.1,
      h: 1,
    })
    expect(rect).not.toBeNull()
    expect(rect!.sh).toBeLessThan(1920)
  })

  it('keeps the rect inside the frame when the ROI runs off the edge', () => {
    const rect = roiToSourceRect(fakeVideo(1000, 1000, 500, 500), {
      x: 0.9,
      y: 0.9,
      w: 0.5,
      h: 0.5,
    })
    expect(rect).not.toBeNull()
    expect(rect!.sx).toBeGreaterThanOrEqual(0)
    expect(rect!.sy).toBeGreaterThanOrEqual(0)
    expect(rect!.sx + rect!.sw).toBeLessThanOrEqual(1000)
    expect(rect!.sy + rect!.sh).toBeLessThanOrEqual(1000)
  })

  it('never returns a zero-area rect', () => {
    const rect = roiToSourceRect(fakeVideo(1000, 1000, 500, 500), {
      x: 1,
      y: 1,
      w: 0.1,
      h: 0.1,
    })
    expect(rect!.sw).toBeGreaterThan(0)
    expect(rect!.sh).toBeGreaterThan(0)
  })
})

describe('SCAN_ROI', () => {
  it('stays inside the frame', () => {
    expect(SCAN_ROI.x).toBeGreaterThanOrEqual(0)
    expect(SCAN_ROI.y).toBeGreaterThanOrEqual(0)
    expect(SCAN_ROI.x + SCAN_ROI.w).toBeLessThanOrEqual(1)
    expect(SCAN_ROI.y + SCAN_ROI.h).toBeLessThanOrEqual(1)
  })

  it('covers most of the frame', () => {
    // Guards the fix for the focus-distance problem: a small guide forces the
    // phone closer than its minimum focus distance and every frame comes back
    // blurred. If someone shrinks this back into a thin strip, this fails.
    expect(SCAN_ROI.w * SCAN_ROI.h).toBeGreaterThan(0.5)
  })
})
