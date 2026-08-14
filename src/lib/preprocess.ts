/**
 * Turning a camera frame into something Tesseract can read.
 *
 * ## Why this reads the whole slip instead of a thin strip
 *
 * The first version framed a narrow box around the number alone. That failed
 * in practice for a physical reason: filling a thin box with a 15-digit number
 * means holding the phone closer than its **minimum focus distance**, so every
 * frame came back blurred. No amount of thresholding recovers a defocused
 * image.
 *
 * So the guide is now a large document frame — hold the phone at a comfortable
 * distance with the whole slip in view — and the field is picked out *within*
 * that frame, by the aim box below, rather than by moving the phone closer.
 *
 * ## Why there is no binarization here
 *
 * The earlier pipeline did grayscale + Otsu thresholding. Measured on the
 * reference photo, that *helps* on a tight crop but actively **hurts** on a
 * full page: a single global threshold cannot cope with the lighting gradient
 * across a whole sheet, and Tesseract's own adaptive thresholding — which sees
 * the full page layout — does a better job. Removing it raised per-frame
 * accuracy from ~39% to ~85%.
 */

/**
 * ## Two regions, and why
 *
 * The guide the user frames with and the region actually read are **not** the
 * same box, and separating them is what makes both problems solvable at once:
 *
 *  - `SCAN_ROI` — the document guide. Large, so the phone stays at a distance
 *    where it can focus. It decides *where the user holds the phone*.
 *  - `FIELD_ROI` — the aim box, inside the guide. It decides *which pixels are
 *    read*, and it exists because a slip carries several "Protocolo" labels;
 *    text alone cannot say which one is the one, but position can.
 *
 * The crop is taken from the same full-distance frame, so pointing at a small
 * region costs nothing in focus — the earlier version's failure was the phone
 * being held inside its minimum focus distance to fill a small guide, not the
 * cropping itself. Reading less of the frame is also faster, and spends more
 * pixels per digit.
 */

/** Region of interest, as fractions (0..1) of the *displayed* video box. */
export type Roi = { x: number; y: number; w: number; h: number }

/**
 * The document guide: most of the frame, leaving a small margin so the user
 * has something to aim with. Deliberately large — see the note above about
 * minimum focus distance.
 */
export const SCAN_ROI: Roi = { x: 0.04, y: 0.06, w: 0.92, h: 0.86 }

/**
 * Where the `Protocolo Nº` field goes — the only part of the slip read.
 *
 * A starting position, not a fixed one: forms put the field in different
 * places, so the user drags the box onto it once and the position is
 * remembered (see `loadFieldRoi`). A band rather than a tight box, so a field
 * that wraps onto a second line still lands inside it.
 */
export const DEFAULT_FIELD_ROI: Roi = { x: 0.08, y: 0.28, w: 0.84, h: 0.16 }

/**
 * Keep a region inside the guide.
 *
 * The aim box is dragged by hand, and one that wandered outside the guide would
 * read pixels the user was never framing — the scanner would simply stop
 * finding anything, with nothing on screen to explain why.
 */
export function clampRoiInside(roi: Roi, bounds: Roi = SCAN_ROI): Roi {
  const w = Math.min(roi.w, bounds.w)
  const h = Math.min(roi.h, bounds.h)
  return {
    x: Math.max(bounds.x, Math.min(roi.x, bounds.x + bounds.w - w)),
    y: Math.max(bounds.y, Math.min(roi.y, bounds.y + bounds.h - h)),
    w,
    h,
  }
}

/**
 * Width to normalise the crop to before OCR.
 *
 * Measured on the reference photo: 1200px wide runs at roughly 1s per frame
 * with ~85% per-frame accuracy. Going wider costs runtime without buying
 * accuracy, and going much narrower starts losing digits.
 */
const TARGET_WIDTH = 1200

/**
 * The `object-fit: cover` transform, from the element's CSS box to the video's
 * intrinsic pixel grid.
 *
 * The two have different aspect ratios and the frame is cropped on one axis, so
 * anything that goes from what the user sees to what the camera captured has to
 * come back through this — reading raw fractions would silently drift off
 * target. Returns null until the element is laid out and the first frame has
 * arrived; `videoWidth` is 0 before that.
 */
function coverTransform(video: HTMLVideoElement) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = video.clientWidth
  const ch = video.clientHeight
  if (!vw || !vh || !cw || !ch) return null

  // `cover` scales the frame up until it fills both axes, overflowing one.
  const scale = Math.max(cw / vw, ch / vh)

  return {
    vw,
    vh,
    cw,
    ch,
    scale,
    // Offsets are <= 0: the overflow is split evenly and clipped on both sides.
    offsetX: (cw - vw * scale) / 2,
    offsetY: (ch - vh * scale) / 2,
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Map the on-screen ROI box onto the video's intrinsic pixel grid, so the box
 * the user frames with is the pixels that actually get read.
 */
export function roiToSourceRect(
  video: HTMLVideoElement,
  roi: Roi,
): { sx: number; sy: number; sw: number; sh: number } | null {
  const transform = coverTransform(video)
  if (!transform) return null
  const { vw, vh, cw, ch, scale, offsetX, offsetY } = transform

  // ROI in element coordinates, then back through the transform.
  const sx = (roi.x * cw - offsetX) / scale
  const sy = (roi.y * ch - offsetY) / scale
  const sw = (roi.w * cw) / scale
  const sh = (roi.h * ch) / scale

  // Clamp into the frame so drawImage never gets an out-of-bounds source.
  const clampedX = Math.max(0, Math.min(sx, vw))
  const clampedY = Math.max(0, Math.min(sy, vh))
  return {
    sx: clampedX,
    sy: clampedY,
    sw: Math.max(1, Math.min(sw, vw - clampedX)),
    sh: Math.max(1, Math.min(sh, vh - clampedY)),
  }
}

/**
 * Map a point the user tapped — as fractions of the displayed video box — onto
 * the frame's own coordinate space, also as fractions.
 *
 * This is what `pointsOfInterest` wants when telling the camera where to focus:
 * the point is relative to the **captured frame**, not to the element, and with
 * `object-fit: cover` those disagree by however much is cropped off the
 * overflowing axis. Tapping the top of a tall screen would otherwise aim the
 * autofocus somewhere above the paper entirely.
 *
 * Clamped to 0..1: a tap in the cropped-away region has no exact counterpart in
 * the frame, and the nearest edge is the honest answer.
 */
export function pointToSourceFraction(
  video: HTMLVideoElement,
  point: { x: number; y: number },
): { x: number; y: number } | null {
  const transform = coverTransform(video)
  if (!transform) return null
  const { vw, vh, cw, ch, scale, offsetX, offsetY } = transform

  return {
    x: clamp01((point.x * cw - offsetX) / scale / vw),
    y: clamp01((point.y * ch - offsetY) / scale / vh),
  }
}

/**
 * Crop the current frame to the document guide and normalise its width.
 *
 * Returns the plain colour crop: no channel tricks, no thresholding. Tesseract
 * gets the pixels closest to what the camera saw.
 */
export function preprocessFrame(
  video: HTMLVideoElement,
  roi: Roi,
): HTMLCanvasElement | null {
  const rect = roiToSourceRect(video, roi)
  if (!rect) return null

  // Only ever scale down. Upscaling a defocused frame adds no information.
  const scale = Math.min(1, TARGET_WIDTH / rect.sw)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.sw * scale))
  canvas.height = Math.max(1, Math.round(rect.sh * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    video,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas
}
