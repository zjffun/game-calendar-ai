// ============================================================================
// 屏幕捕获复用件：在 getDisplayMedia 的 <video> 上拖拽框选一块区域，并把当前帧
// （可只截框内）导出为 Blob。签到答题「选窗口识别」与取字「选窗口截图」共用。
//
// - Region 用相对视频帧的 0–1 比例存储，换分辨率/窗口大小仍有效，也便于持久化。
// - captureFrame() 把 <video> 当前画面（可裁到 region）画到离屏 canvas → PNG Blob，
//   全程在本机、不产生网络请求。
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import type { RefObject, PointerEvent as ReactPointerEvent } from 'react'
import './ScreenCapture.css'

/**
 * 框选区域，用相对视频帧的 0–1 比例存储，
 * 这样换分辨率/窗口大小仍然有效，也便于持久化记忆。
 */
export interface Region {
  x: number
  y: number
  w: number
  h: number
}

/** 视频元素内「实际画面」的矩形（object-fit:contain 会留黑边）。单位为元素像素。 */
interface ContentRect {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** 计算 object-fit:contain 下视频画面在元素内的实际显示矩形。 */
function getContentRect(video: HTMLVideoElement): ContentRect | null {
  const elW = video.clientWidth
  const elH = video.clientHeight
  const vW = video.videoWidth
  const vH = video.videoHeight
  if (!elW || !elH || !vW || !vH) return null
  const scale = Math.min(elW / vW, elH / vH)
  const dispW = vW * scale
  const dispH = vH * scale
  return { left: (elW - dispW) / 2, top: (elH - dispH) / 2, width: dispW, height: dispH }
}

/**
 * 截取 <video> 当前帧为 PNG Blob；若给了 region（相对比例）只截框内。
 * 框内截取会让后续 OCR 更快更准。
 */
export async function captureFrame(video: HTMLVideoElement, region: Region | null): Promise<Blob> {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) throw new Error('画面尚未就绪，稍等片刻再试')

  let sx = 0
  let sy = 0
  let sw = w
  let sh = h
  if (region && region.w > 0 && region.h > 0) {
    sx = clamp(Math.round(region.x * w), 0, w - 1)
    sy = clamp(Math.round(region.y * h), 0, h - 1)
    sw = clamp(Math.round(region.w * w), 1, w - sx)
    sh = clamp(Math.round(region.h * h), 1, h - sy)
  }

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('截图失败')
  return blob
}

/**
 * 覆盖在视频上的框选层：拖拽画框，映射为相对比例交回上层。
 * tip 为空态下的提示文案，随场景不同（题目区域 / 取字区域）。
 */
export function RegionSelector({
  videoRef,
  region,
  onChange,
  tip = '拖拽框选区域',
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  region: Region | null
  onChange: (r: Region | null) => void
  tip?: string
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<ContentRect | null>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  // 视频/元素尺寸变化时重算画面显示矩形，用于把记住的比例框精确画回去
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () => setRect(getContentRect(video))
    update()
    const raf = requestAnimationFrame(update)
    const ro = new ResizeObserver(update)
    ro.observe(video)
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('resize', update)
    video.addEventListener('playing', update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      video.removeEventListener('loadedmetadata', update)
      video.removeEventListener('resize', update)
      video.removeEventListener('playing', update)
      window.removeEventListener('resize', update)
    }
  }, [videoRef])

  // 指针坐标 → 元素内像素，并夹到画面显示矩形内（避开黑边）
  const pointAt = (e: ReactPointerEvent, cr: ContentRect) => {
    const box = layerRef.current!.getBoundingClientRect()
    return {
      x: clamp(e.clientX - box.left, cr.left, cr.left + cr.width),
      y: clamp(e.clientY - box.top, cr.top, cr.top + cr.height),
    }
  }

  const onDown = (e: ReactPointerEvent) => {
    const video = videoRef.current
    const cr = video && getContentRect(video)
    if (!cr) return
    const p = pointAt(e, cr)
    layerRef.current?.setPointerCapture(e.pointerId)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const video = videoRef.current
    const cr = video && getContentRect(video)
    if (!cr) return
    const p = pointAt(e, cr)
    setDrag((d) => (d ? { ...d, x1: p.x, y1: p.y } : d))
  }

  const onUp = () => {
    const video = videoRef.current
    const cr = video && getContentRect(video)
    if (!drag || !cr) {
      setDrag(null)
      return
    }
    const left = Math.min(drag.x0, drag.x1)
    const top = Math.min(drag.y0, drag.y1)
    const w = Math.abs(drag.x1 - drag.x0)
    const h = Math.abs(drag.y1 - drag.y0)
    setDrag(null)
    // 拖动太小视为误触，保留原有框选，避免误清空
    if (w < 10 || h < 10) return
    onChange({
      x: (left - cr.left) / cr.width,
      y: (top - cr.top) / cr.height,
      w: w / cr.width,
      h: h / cr.height,
    })
  }

  // 优先画拖动中的框，否则画记住的比例框
  let box: { left: number; top: number; width: number; height: number } | null = null
  if (drag) {
    box = {
      left: Math.min(drag.x0, drag.x1),
      top: Math.min(drag.y0, drag.y1),
      width: Math.abs(drag.x1 - drag.x0),
      height: Math.abs(drag.y1 - drag.y0),
    }
  } else if (region && rect) {
    box = {
      left: rect.left + region.x * rect.width,
      top: rect.top + region.y * rect.height,
      width: region.w * rect.width,
      height: region.h * rect.height,
    }
  }

  return (
    <div
      ref={layerRef}
      className="sc-region-layer"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {box && (
        <div
          className="sc-region-box"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      {!box && <span className="sc-region-tip">{tip}</span>}
    </div>
  )
}
