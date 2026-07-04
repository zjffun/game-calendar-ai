// ============================================================================
// 图片压缩：把用户粘贴/上传的图片压到适合本地存储的体积，输出 base64 data URL。
// 策略：
//   1. 限制最大边长（超出按比例缩小）；
//   2. 优先 WebP（体积小、保留透明），环境不支持则回退 JPEG（白底合成）；
//   3. 质量逐档下调 + 必要时二次缩小，直到 data URL 不超过目标体积；
//   4. 小体积 GIF 原样保留（重编码会丢动画）。
// 在浏览器与 Tauri WebView（WKWebView / WebView2）中均可用，无任何依赖。
// ============================================================================

/** 压缩后单张图片的 data URL 目标上限（字符数 ≈ 二进制体积 × 4/3） */
const TARGET_DATAURL_CHARS = 400_000 // ≈ 300KB 二进制
/** 首次绘制的最大边长（px） */
const MAX_DIMENSION = 1400
/** 质量档位，从高到低逐档尝试 */
const QUALITY_STEPS = [0.85, 0.7, 0.55]
/** 达不到目标体积时的追加缩小轮数（每轮 ×0.7） */
const MAX_SHRINK_ROUNDS = 3
/** GIF 不超过此体积则原样保留（保动画） */
const GIF_KEEP_BYTES = 1_000_000

export interface CompressedImage {
  /** base64 data URL（image/webp、image/jpeg 或原样 image/gif） */
  dataUrl: string
  width: number
  height: number
}

/** 检测 canvas 是否支持导出 WebP（Safari 16.4+ / Chromium 均支持） */
let webpSupported: boolean | null = null
function supportsWebp(): boolean {
  if (webpSupported === null) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    webpSupported = c.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpSupported
}

/** Blob → 位图。优先 createImageBitmap，失败回退 <img> 解码 */
async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      /* 回退 <img> */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片解码失败'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function bitmapSize(bmp: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return 'naturalWidth' in bmp
    ? { w: bmp.naturalWidth, h: bmp.naturalHeight }
    : { w: bmp.width, h: bmp.height }
}

/** 按目标尺寸绘制到 canvas；JPEG 无透明通道，回退 JPEG 时先铺白底 */
function draw(bmp: ImageBitmap | HTMLImageElement, w: number, h: number, whiteBg: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 不可用')
  if (whiteBg) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(bmp, 0, 0, w, h)
  return canvas
}

/** Blob 原样读为 data URL（GIF 保留动画用） */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 压缩一张图片为 base64 data URL。
 * 始终返回不超过（或已尽力接近）目标体积的结果；解码失败时抛错。
 */
export async function compressImage(blob: Blob): Promise<CompressedImage> {
  // 小 GIF 原样保留，避免丢动画
  if (blob.type === 'image/gif' && blob.size <= GIF_KEEP_BYTES) {
    const dataUrl = await blobToDataUrl(blob)
    const bmp = await loadBitmap(blob)
    const { w, h } = bitmapSize(bmp)
    return { dataUrl, width: w, height: h }
  }

  const bmp = await loadBitmap(blob)
  const { w: srcW, h: srcH } = bitmapSize(bmp)
  if (!srcW || !srcH) throw new Error('图片尺寸无效')

  const useWebp = supportsWebp()
  const mime = useWebp ? 'image/webp' : 'image/jpeg'
  let scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH))
  let best: CompressedImage | null = null

  for (let round = 0; round <= MAX_SHRINK_ROUNDS; round++) {
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))
    const canvas = draw(bmp, w, h, !useWebp)
    for (const q of QUALITY_STEPS) {
      const dataUrl = canvas.toDataURL(mime, q)
      if (!best || dataUrl.length < best.dataUrl.length) best = { dataUrl, width: w, height: h }
      if (dataUrl.length <= TARGET_DATAURL_CHARS) return { dataUrl, width: w, height: h }
    }
    scale *= 0.7
  }
  // 尽力压缩后仍超标：返回最小的一版（极端大图/复杂图）
  return best!
}

/** data URL 的近似二进制体积（字节） */
export function dataUrlBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(',')
  const b64 = idx >= 0 ? dataUrl.length - idx - 1 : dataUrl.length
  return Math.round(b64 * 0.75)
}

/** 人类可读体积 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
