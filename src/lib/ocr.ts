import { createWorker, PSM, type Worker } from 'tesseract.js'

/**
 * Tesseract worker lifecycle.
 *
 * One worker is created per session and reused for every frame. Spinning one
 * up per recognition would dominate the runtime — worker startup costs far
 * more than the recognition itself.
 *
 * The WASM core and the English model are fetched from the jsDelivr CDN on
 * first use and cached in IndexedDB, so only the very first scan needs network.
 */

let workerPromise: Promise<Worker> | null = null

async function buildWorker(): Promise<Worker> {
  const worker = await createWorker('eng')
  await worker.setParameters({
    // Automatic segmentation: Tesseract's own layout analysis finds the lines,
    // which it does markedly better than any hand-rolled splitting.
    //
    // This was chosen when the input was the whole slip. The input is now the
    // aim box — a band of a line or two — for which `PSM.SINGLE_BLOCK` is the
    // conventional choice and may well read better. It is a one-line change,
    // but an unmeasured one: the accuracy figures in the README came off real
    // photographs, and this should be swapped only against the same.
    tessedit_pageseg_mode: PSM.AUTO,
    // Deliberately NO character whitelist. An earlier version restricted this
    // to digits, which reads the number marginally better in isolation but
    // makes the word "Protocolo" unreadable — and that label is what tells us
    // which of the numbers on the page is the one we want.
    tessedit_char_whitelist: '',
  })
  return worker
}

/** Idempotent: safe to call from an effect that may run twice under StrictMode. */
export function initOcr(): Promise<Worker> {
  workerPromise ??= buildWorker()
  return workerPromise
}

/** Recognise a frame. Returns the raw text for `extractProtocol`. */
export async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await initOcr()
  // v6+ disables every output format except `text` by default, which is all we
  // need and keeps the worker round-trip small.
  const { data } = await worker.recognize(canvas)
  return data.text
}

export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    // Worker never finished starting up; nothing to tear down.
  }
}
