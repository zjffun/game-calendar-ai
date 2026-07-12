// ============================================================================
// 本地 OCR（Tesseract.js）—— 图片在浏览器内识别，绝不上传。
// 首次使用会下载中文语言模型（chi_sim，几 MB），之后浏览器缓存复用。
// 如需完全离线（Tauri 桌面端），把语言模型放到 public/tessdata/ 并设置 LANG_PATH。
// ============================================================================

import { createWorker, type Worker } from 'tesseract.js'

export interface OcrProgress {
  /** tesseract 状态，如 'loading language traineddata' / 'recognizing text' */
  status: string
  /** 0–1 */
  progress: number
}

// 语言模型来源：默认走 CDN（首次下载后缓存）。若 public/tessdata 内放了模型，改成
// `${import.meta.env.BASE_URL}tessdata` 即可离线。留空表示用 tesseract.js 默认 CDN。
const LANG_PATH: string | undefined = undefined

let workerPromise: Promise<Worker> | null = null
let progressListener: ((m: OcrProgress) => void) | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(['chi_sim', 'eng'], 1, {
      ...(LANG_PATH ? { langPath: LANG_PATH } : {}),
      logger: (m: OcrProgress) => progressListener?.(m),
    })
  }
  return workerPromise
}

function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => reject(e)
    img.src = url
  })
}

/**
 * 预处理：放大 + 灰度 + 轻度对比度增强，显著提升游戏截图（彩色小字）的识别率。
 * 不做硬二值化，避免彩色文字在纯背景上丢字。
 */
export async function preprocess(source: Blob | string): Promise<string> {
  const img = await loadImage(source)
  const scale = img.width > 0 && img.width < 1200 ? Math.min(2, 1200 / img.width) : 1
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return typeof source === 'string' ? source : URL.createObjectURL(source)
  ctx.drawImage(img, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data
  const contrast = 1.35
  const intercept = 128 * (1 - contrast)
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    g = g * contrast + intercept
    g = g < 0 ? 0 : g > 255 ? 255 : g
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

/** 对图片做 OCR，返回识别文本。图片全程在本机处理。 */
export async function ocrImage(
  source: Blob | string,
  opts: { onProgress?: (m: OcrProgress) => void; preprocess?: boolean } = {},
): Promise<string> {
  const worker = await getWorker()
  progressListener = opts.onProgress ?? null
  try {
    const input = opts.preprocess === false ? source : await preprocess(source)
    const { data } = await worker.recognize(input)
    return data.text ?? ''
  } finally {
    progressListener = null
  }
}

/** 释放 OCR worker（可选，用于彻底清理内存）。 */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return
  const w = await workerPromise
  await w.terminate()
  workerPromise = null
}
