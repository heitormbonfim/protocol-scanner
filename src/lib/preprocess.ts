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
 * distance with the whole slip in view — and the number is located in software
 * by anchoring on the "Protocolo" label (see `extractProtocol`).
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

/** Region of interest, as fractions (0..1) of the *displayed* video box. */
export type Roi = { x: number; y: number; w: number; h: number }

/**
 * The document guide: most of the frame, leaving a small margin so the user
 * has something to aim with. Deliberately large — see the note above about
 * minimum focus distance.
 */
export const SCAN_ROI: Roi = { x: 0.04, y: 0.06, w: 0.92, h: 0.86 }

/**
 * Width to normalise the crop to before OCR.
 *
 * Measured on the reference photo: 1200px wide runs at roughly 1s per frame
 * with ~85% per-frame accuracy. Going wider costs runtime without buying
 * accuracy, and going much narrower starts losing digits.
 */
const TARGET_WIDTH = 1200

/**
 * Map the on-screen ROI box onto the video's intrinsic pixel grid.
 *
 * The <video> is rendered with `object-fit: cover`, so its CSS box and its
 * intrinsic videoWidth/videoHeight have different aspect ratios and the frame
 * is cropped on one axis. Slicing with raw fractions would silently drift off
 * target — the box the user sees would not be the pixels we read.
 */
export function roiToSourceRect(
  video: HTMLVideoElement,
  roi: Roi,
): { sx: number; sy: number; sw: number; sh: number } | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = video.clientWidth
  const ch = video.clientHeight
  if (!vw || !vh || !cw || !ch) return null

  // `cover` scales the frame up until it fills both axes, overflowing one.
  const scale = Math.max(cw / vw, ch / vh)
  const renderedW = vw * scale
  const renderedH = vh * scale

  // Offsets are <= 0: the overflow is split evenly and clipped on both sides.
  const offsetX = (cw - renderedW) / 2
  const offsetY = (ch - renderedH) / 2

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
