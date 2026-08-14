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
    // Full page segmentation: we hand Tesseract the whole slip and let its own
    // layout analysis find the lines. It is markedly better at this than any
    // cropping we do by hand.
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
