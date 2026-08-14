import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIELD_ROI,
  SCAN_ROI,
  clampRoiInside,
  pointToSourceFraction,
  roiToSourceRect,
} from './preprocess'

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

describe('pointToSourceFraction', () => {
  /**
   * Where tap-to-focus aims. The same `cover` crop applies, so a tap near the
   * top of a tall screen is *not* near the top of the frame — getting this
   * wrong points the autofocus at something other than the paper, and the only
   * symptom is that focusing seems not to work.
   */
  it('returns null before the stream has dimensions', () => {
    expect(pointToSourceFraction(fakeVideo(0, 0, 400, 800), { x: 0.5, y: 0.5 })).toBeNull()
  })

  it('maps the centre to the centre', () => {
    const point = pointToSourceFraction(fakeVideo(1920, 1080, 400, 800), {
      x: 0.5,
      y: 0.5,
    })
    expect(point!.x).toBeCloseTo(0.5, 5)
    expect(point!.y).toBeCloseTo(0.5, 5)
  })

  it('passes fractions straight through when aspect ratios match', () => {
    const point = pointToSourceFraction(fakeVideo(1000, 1000, 500, 500), {
      x: 0.25,
      y: 0.75,
    })
    expect(point!.x).toBeCloseTo(0.25, 5)
    expect(point!.y).toBeCloseTo(0.75, 5)
  })

  it('compresses the axis that cover crops', () => {
    // Landscape camera, portrait element: the sides are clipped, so the full
    // width of the screen only spans the middle band of the frame.
    const left = pointToSourceFraction(fakeVideo(1920, 1080, 400, 800), {
      x: 0,
      y: 0.5,
    })
    expect(left!.x).toBeCloseTo(690 / 1920, 4)
    expect(left!.x).toBeGreaterThan(0)
  })

  it('clamps a tap in the cropped-away region to the frame edge', () => {
    const point = pointToSourceFraction(fakeVideo(1080, 1920, 800, 400), {
      x: 0.5,
      y: 1.4,
    })
    expect(point!.y).toBeLessThanOrEqual(1)
    expect(point!.y).toBeGreaterThanOrEqual(0)
  })

  it('agrees with the ROI mapping at the same on-screen point', () => {
    // Both go through the same transform; if they ever disagree, the guide and
    // the focus point are describing different places.
    const video = fakeVideo(1920, 1080, 400, 800)
    const rect = roiToSourceRect(video, { x: 0.25, y: 0.4, w: 0.1, h: 0.1 })
    const point = pointToSourceFraction(video, { x: 0.25, y: 0.4 })
    expect(point!.x).toBeCloseTo(rect!.sx / 1920, 5)
    expect(point!.y).toBeCloseTo(rect!.sy / 1080, 5)
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

describe('clampRoiInside', () => {
  /**
   * The aim box is dragged by hand and persisted, so it is the one region that
   * can arrive at `preprocessFrame` holding anything at all. A box outside the
   * guide reads pixels the user is not framing, and the only symptom is a
   * scanner that quietly finds nothing.
   */
  it('leaves a box that already fits alone', () => {
    expect(clampRoiInside(DEFAULT_FIELD_ROI)).toEqual(DEFAULT_FIELD_ROI)
  })

  it('pulls a box back inside when dragged off each edge', () => {
    const right = clampRoiInside({ ...DEFAULT_FIELD_ROI, x: 5 })
    expect(right.x + right.w).toBeCloseTo(SCAN_ROI.x + SCAN_ROI.w, 5)

    const left = clampRoiInside({ ...DEFAULT_FIELD_ROI, x: -5 })
    expect(left.x).toBeCloseTo(SCAN_ROI.x, 5)

    const below = clampRoiInside({ ...DEFAULT_FIELD_ROI, y: 5 })
    expect(below.y + below.h).toBeCloseTo(SCAN_ROI.y + SCAN_ROI.h, 5)

    const above = clampRoiInside({ ...DEFAULT_FIELD_ROI, y: -5 })
    expect(above.y).toBeCloseTo(SCAN_ROI.y, 5)
  })

  it('keeps the size when only the position is out of bounds', () => {
    const clamped = clampRoiInside({ ...DEFAULT_FIELD_ROI, x: 9, y: 9 })
    expect(clamped.w).toBe(DEFAULT_FIELD_ROI.w)
    expect(clamped.h).toBe(DEFAULT_FIELD_ROI.h)
  })

  it('shrinks a box too large for the guide rather than overflowing it', () => {
    const clamped = clampRoiInside({ x: 0, y: 0, w: 3, h: 3 })
    expect(clamped).toEqual(SCAN_ROI)
  })
})

describe('DEFAULT_FIELD_ROI', () => {
  it('starts inside the document guide', () => {
    expect(clampRoiInside(DEFAULT_FIELD_ROI)).toEqual(DEFAULT_FIELD_ROI)
  })

  it('is a band, not a pinhole — a wrapped field still has to fit', () => {
    expect(DEFAULT_FIELD_ROI.w).toBeGreaterThan(0.5)
    expect(DEFAULT_FIELD_ROI.h).toBeGreaterThan(0.1)
  })
})
