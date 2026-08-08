// ============================================================================
// 签到答题——题库检索 + 选游戏窗口 OCR 自动识别。
//
// 两种用法：
// 1) 关键词搜索：输入题目里的几个字，模糊匹配内置题库，答案高亮显示。
// 2) 选择游戏窗口识别：浏览器 getDisplayMedia 让你选梦幻窗口 → 截当前画面 →
//    本机 OCR（复用 utils/ocr）→ 在题库里找出这道题 → 显示答案。可开自动识别，
//    每隔几秒自动截图找答案，接近官方「对答如流」。
//
// 图片/视频帧全程在本机处理，绝不上传；窗口共享随时可停。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject, PointerEvent as ReactPointerEvent } from 'react'
import { ocrImage, type OcrProgress } from '../../utils/ocr'
import { searchQuiz, matchOcr, QUIZ_COUNT, type QuizMatch } from '../../utils/quiz'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { STORAGE_KEYS } from '../../types'
import Icon from '../common/Icon'
import './Quiz.css'

/** 自动识别间隔（毫秒） */
const AUTO_INTERVAL = 3000
/** OCR 命中率达到此值才当作「有把握」的答案 */
const CONFIDENT = 0.5

/**
 * 框选的识别区域，用相对视频帧的 0–1 比例存储，
 * 这样换分辨率/窗口大小仍然有效，也便于持久化记忆。
 */
interface Region {
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

export default function QuizBook() {
  return (
    <section className="stack quiz-page">
      <div>
        <h2 className="section-title">签到答题</h2>
        <p className="muted small">
          内置 {QUIZ_COUNT} 道每日签到答题（游戏系统 / 常识题）。选游戏窗口自动识别（可框选题目区域，框选会被记住），
          或手动搜关键词。识别全程在本机完成、不上传。
        </p>
      </div>

      <CapturePanel />
      <SearchPanel />
    </section>
  )
}

// ---------------------------------------------------------------------------
// 选游戏窗口 OCR 识别
// ---------------------------------------------------------------------------

type CapPhase = 'idle' | 'sharing'

function CapturePanel() {
  const [phase, setPhase] = useState<CapPhase>('idle')
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [matches, setMatches] = useState<QuizMatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocrPreview, setOcrPreview] = useState<string>('')
  // 框选的识别区域（相对比例），持久化——记住后无需每次重选
  const [region, setRegion] = useLocalStorage<Region | null>(STORAGE_KEYS.quizRegion, null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const busyRef = useRef(false)
  // 让 recognize（deps 为空、供定时器长期持有）始终读到最新的框选区域
  const regionRef = useRef<Region | null>(region)
  useEffect(() => {
    regionRef.current = region
  }, [region])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setPhase('idle')
    setAuto(false)
  }, [])

  // 卸载时释放窗口共享
  useEffect(() => () => stop(), [stop])

  // 进入 sharing 后 <video> 才挂载，这里把已获取的流接上并播放
  useEffect(() => {
    if (phase !== 'sharing') return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject !== stream) video.srcObject = stream
    video.play().catch(() => {})
  }, [phase])

  const start = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('当前浏览器不支持屏幕捕获，请用较新的 Chrome / Edge，并通过 https 或 localhost 访问。')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      })
      streamRef.current = stream
      // 用户在浏览器原生条上点「停止共享」时同步收起
      stream.getVideoTracks()[0]?.addEventListener('ended', stop)
      // 注意：<video> 仅在 sharing 阶段挂载，此刻还没渲染，videoRef 为 null，
      // 故不能在这里接流。改由下方 effect 在挂载后把流接上并播放。
      setPhase('sharing')
      setMatches(null)
    } catch (err) {
      // 用户取消选择不算错误
      if (err instanceof DOMException && err.name === 'NotAllowedError') return
      setError('无法开始窗口共享：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [stop])

  /** 截当前帧 → OCR → 匹配题库 */
  const recognize = useCallback(async () => {
    const video = videoRef.current
    if (!video || busyRef.current) return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return

    busyRef.current = true
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      // 若框选了识别区域，仅截取该区域（相对比例 → 帧像素），OCR 更快更准
      const r = regionRef.current
      let sx = 0
      let sy = 0
      let sw = w
      let sh = h
      if (r && r.w > 0 && r.h > 0) {
        sx = clamp(Math.round(r.x * w), 0, w - 1)
        sy = clamp(Math.round(r.y * h), 0, h - 1)
        sw = clamp(Math.round(r.w * w), 1, w - sx)
        sh = clamp(Math.round(r.h * h), 1, h - sy)
      }
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法创建画布')
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('截图失败')

      // 用默认预处理（灰度+对比度增强）：整帧一般已宽于 1200px 不会再放大，
      // 但灰度化对游戏里的彩色小字识别帮助明显，耗时几乎不变
      const text = await ocrImage(blob, { onProgress: setProgress })
      setOcrPreview(text.trim())
      const found = matchOcr(text, 4)
      setMatches(found)
    } catch (err) {
      setError('识别失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  // 自动识别：开启后每隔 AUTO_INTERVAL 截一次（忙则跳过本轮）
  useEffect(() => {
    if (!auto || phase !== 'sharing') return
    recognize()
    const id = window.setInterval(() => {
      if (!busyRef.current) recognize()
    }, AUTO_INTERVAL)
    return () => window.clearInterval(id)
  }, [auto, phase, recognize])

  const best = matches?.[0] ?? null
  const others = matches?.slice(1).filter((m) => m.score > 0.3) ?? []
  const pct = Math.round((progress?.progress ?? 0) * 100)

  return (
    <div className="card quiz-cap">
      <div className="quiz-cap-head">
        <span className="quiz-cap-title">
          <Icon name="monitor" size={16} />
          选择游戏窗口识别
        </span>
        <span className="spacer" />
        {phase === 'idle' ? (
          <button className="btn btn-primary btn-sm" onClick={start}>
            <Icon name="monitor" size={14} />
            选择游戏窗口
          </button>
        ) : (
          <>
            <label className="quiz-auto">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              自动识别
            </label>
            <button className="btn btn-primary btn-sm" onClick={recognize} disabled={busy}>
              <Icon name={busy ? 'rotate' : 'scan-text'} size={14} className={busy ? 'spin' : undefined} />
              {busy ? '识别中…' : '识别当前画面'}
            </button>
            <button className="btn btn-sm" onClick={stop}>
              <Icon name="x" size={14} />
              停止
            </button>
          </>
        )}
      </div>

      {phase === 'idle' ? (
        <p className="muted small quiz-cap-hint">
          点「选择游戏窗口」后，在弹窗里选中梦幻西游的窗口即可。可在画面上拖拽框选题目区域（会被记住），
          出现签到答题时点「识别当前画面」，或勾选「自动识别」由它每隔几秒自动找答案。
          需通过 https 或 localhost 访问才能截屏。
        </p>
      ) : (
        <>
          <div className="quiz-video-wrap">
            {/* muted 是自动播放前提；playsInline 防止移动端全屏 */}
            <video ref={videoRef} className="quiz-video" muted playsInline />
            <RegionSelector videoRef={videoRef} region={region} onChange={setRegion} />
            {busy && (
              <div className="quiz-video-badge">
                <Icon name="scan-text" size={13} />
                {progress?.status === 'recognizing text' ? `识别中 ${pct}%` : '识别中…'}
              </div>
            )}
          </div>
          <div className="quiz-region-bar">
            <Icon name="crop" size={14} />
            {region ? (
              <>
                <span>已框选识别区域，仅识别框内 · 在画面上拖拽可重新框选</span>
                <button className="quiz-region-clear" onClick={() => setRegion(null)}>
                  清除（识别整屏）
                </button>
              </>
            ) : (
              <span>在画面上拖拽即可框选题目区域，识别更快更准，框选会被记住</span>
            )}
          </div>
        </>
      )}

      {error && <div className="quiz-error">{error}</div>}

      {best && (
        <div className={`quiz-answer${best.score >= CONFIDENT ? '' : ' weak'}`}>
          <div className="quiz-answer-q">
            <span className="quiz-answer-tag">
              {best.score >= CONFIDENT ? '匹配题目' : '疑似题目'}
            </span>
            {best.entry.q}
          </div>
          <div className="quiz-answer-a">
            <Icon name="check" size={18} />
            <span>{best.entry.a}</span>
          </div>
          {best.score < CONFIDENT && (
            <p className="muted small quiz-answer-note">
              匹配度不高（{Math.round(best.score * 100)}%），请核对题目是否一致，或看下方候选。
            </p>
          )}
          {others.length > 0 && (
            <details className="quiz-others">
              <summary>其它候选（{others.length}）</summary>
              {others.map((m, i) => (
                <div className="quiz-other-item" key={i}>
                  <span className="quiz-other-score">{Math.round(m.score * 100)}%</span>
                  <span className="quiz-other-q">{m.entry.q}</span>
                  <span className="quiz-other-a">{m.entry.a}</span>
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {matches && matches.length === 0 && !busy && (
        <div className="quiz-error">
          没在画面里认出题库中的题目。确认签到答题窗口正对屏幕、文字清晰，或改用下方关键词搜索。
        </div>
      )}

      {ocrPreview && (
        <details className="quiz-ocr-raw">
          <summary>查看识别到的原文</summary>
          <pre>{ocrPreview}</pre>
        </details>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 框选识别区域：在视频上拖拽画框，映射为相对比例交回上层记忆
// ---------------------------------------------------------------------------

function RegionSelector({
  videoRef,
  region,
  onChange,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  region: Region | null
  onChange: (r: Region | null) => void
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
      className="quiz-region-layer"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {box && (
        <div
          className="quiz-region-box"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      {!box && <span className="quiz-region-tip">拖拽框选题目区域</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 关键词搜索
// ---------------------------------------------------------------------------

function SearchPanel() {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchQuiz(query, 30), [query])
  const trimmed = query.trim()

  return (
    <div className="stack quiz-search-block">
      <div className="quiz-search-wrap">
        <Icon name="search" size={14} className="quiz-search-icon" />
        <input
          className="input quiz-search"
          placeholder="输入题目里的几个字，如「四大才女」「洞冥草」…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="quiz-search-clear" aria-label="清空" onClick={() => setQuery('')}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {trimmed === '' ? (
        <p className="muted small">输入关键词后显示匹配的题目与答案。</p>
      ) : results.length === 0 ? (
        <div className="empty">没找到相关题目，换个关键词试试。</div>
      ) : (
        <ul className="quiz-list">
          {results.map((m, i) => (
            <li className="quiz-list-item" key={i}>
              <div className="quiz-list-q">{m.entry.q}</div>
              <div className="quiz-list-a">
                <Icon name="check" size={14} />
                {m.entry.a}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
