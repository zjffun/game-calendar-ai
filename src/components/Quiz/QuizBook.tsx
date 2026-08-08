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
import { ocrImage, type OcrProgress } from '../../utils/ocr'
import { searchQuiz, matchOcr, QUIZ_COUNT, type QuizMatch } from '../../utils/quiz'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { STORAGE_KEYS, type QuizStatus } from '../../types'
import { useAuth } from '../../store/authStore'
import {
  useQuizCloud,
  submitQuestion,
  deleteMySubmission,
} from '../../store/quizStore'
import { appConfirm } from '../common/ConfirmDialog'
import { RegionSelector, captureFrame, type Region } from '../common/ScreenCapture'
import Icon from '../common/Icon'
import './Quiz.css'

/** 自动识别间隔（毫秒） */
const AUTO_INTERVAL = 3000
/** OCR 命中率达到此值才当作「有把握」的答案 */
const CONFIDENT = 0.5

export default function QuizBook() {
  const { approved } = useQuizCloud()
  return (
    <section className="stack quiz-page">
      <div>
        <h2 className="section-title">签到答题</h2>
        <p className="muted small">
          内置 {QUIZ_COUNT} 道每日签到答题（游戏系统 / 常识题）
          {approved.length > 0 && `，另含 ${approved.length} 道云端共享题`}。选游戏窗口自动识别（可框选题目区域，框选会被记住），
          或手动搜关键词。识别全程在本机完成、不上传。
        </p>
      </div>

      <CapturePanel />
      <SearchPanel />
      <SubmitPanel />
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
        // displaySurface: 'window' 让 Chrome 选择器默认停在「窗口」而不是「标签页」，
        // 方便直接选游戏窗口；selfBrowserSurface: 'exclude' 顺手隐藏本站自己的标签页。
        video: { frameRate: 5, displaySurface: 'window' },
        audio: false,
        selfBrowserSurface: 'exclude',
      } as DisplayMediaStreamOptions)
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
    if (!video.videoWidth || !video.videoHeight) return

    busyRef.current = true
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      // 若框选了识别区域，仅截取该区域（相对比例 → 帧像素），OCR 更快更准
      const blob = await captureFrame(video, regionRef.current)

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
        </p>
      ) : (
        <>
          <div className="sc-video-wrap">
            {/* muted 是自动播放前提；playsInline 防止移动端全屏 */}
            <video ref={videoRef} className="sc-video" muted playsInline />
            <RegionSelector
              videoRef={videoRef}
              region={region}
              onChange={setRegion}
              tip="拖拽框选题目区域"
            />
            {busy && (
              <div className="sc-video-badge">
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
// 关键词搜索
// ---------------------------------------------------------------------------

function SearchPanel() {
  const [query, setQuery] = useState('')
  // approved 变化（云端题拉取/审核变动）时重算，让新通过的题即时可搜
  const { approved } = useQuizCloud()
  const results = useMemo(() => searchQuiz(query, 30), [query, approved])
  const trimmed = query.trim()

  return (
    <div className="stack quiz-search-block">
      <div className="quiz-search-wrap">
        <Icon name="search" size={14} className="quiz-search-icon" />
        <input
          className="input quiz-search"
          placeholder="输入题目里的几个字"
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

// ---------------------------------------------------------------------------
// 补充题目（登录用户提交 → 管理员审核通过后全员可搜）
// ---------------------------------------------------------------------------

const SUBMIT_STATUS: Record<QuizStatus, { label: string; cls: string }> = {
  pending: { label: '待审核', cls: 'badge-warn' },
  approved: { label: '已通过', cls: 'badge-ok' },
  rejected: { label: '已驳回', cls: 'badge-danger' },
}

function SubmitPanel() {
  const { status, isCloudConfigured } = useAuth()
  const { mine } = useQuizCloud()
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )
  function flash(text: string, kind: 'ok' | 'err') {
    setToast({ text, kind })
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setToast(null), 4000)
  }

  // 未配置云端时，补充题目功能不可用，直接不渲染（保持纯本地形态）
  if (!isCloudConfigured) return null

  if (status !== 'signedIn') {
    return (
      <div className="card quiz-submit">
        <div className="quiz-cap-head">
          <span className="quiz-cap-title">
            <Icon name="plus" size={16} />
            补充题目
          </span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          登录后可提交你遇到的新题，管理员审核通过后所有人都能搜到。请到「设置 → 账号与云同步」登录。
        </p>
      </div>
    )
  }

  const canSubmit = q.trim() && a.trim() && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      const res = await submitQuestion(q, a)
      if (res.ok) {
        setQ('')
        setA('')
        flash(res.message ?? '已提交。', 'ok')
      } else {
        flash(res.message ?? '提交失败。', 'err')
      }
    } finally {
      setBusy(false)
    }
  }

  async function removeMine(id: string, text: string) {
    const ok = await appConfirm(`删除这条提交吗？\n「${text}」`)
    if (!ok) return
    const res = await deleteMySubmission(id)
    if (!res.ok) flash(res.message ?? '删除失败。', 'err')
  }

  return (
    <div className="card quiz-submit">
      <div className="quiz-cap-head">
        <span className="quiz-cap-title">
          <Icon name="plus" size={16} />
          补充题目
        </span>
      </div>
      <p className="muted small quiz-submit-hint">
        遇到题库里没有的题？填在这里提交，管理员审核通过后会并入搜索，所有人受益。
      </p>

      <div className="field">
        <label htmlFor="quiz-submit-q">题目</label>
        <textarea
          id="quiz-submit-q"
          className="textarea"
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="题目原文（尽量完整，便于以后匹配）"
        />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="quiz-submit-a">答案</label>
        <input
          id="quiz-submit-a"
          className="input"
          value={a}
          onChange={(e) => setA(e.target.value)}
          placeholder="正确答案"
        />
      </div>
      <div className="row row-wrap" style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={!canSubmit}>
          提交审核
        </button>
        {toast && <span className={`settings-toast pop-in is-${toast.kind}`}>{toast.text}</span>}
      </div>

      {mine.length > 0 && (
        <div className="quiz-mine">
          <div className="quiz-mine-title">我的提交（{mine.length}）</div>
          <ul className="quiz-mine-list">
            {mine.map((m) => {
              const meta = SUBMIT_STATUS[m.status]
              return (
                <li className="quiz-mine-item" key={m.id}>
                  <div className="quiz-mine-head">
                    <span className={`badge ${meta.cls}`}>{meta.label}</span>
                    {m.status === 'pending' && (
                      <button
                        className="btn btn-ghost btn-sm quiz-mine-del"
                        onClick={() => void removeMine(m.id, m.q)}
                      >
                        <Icon name="trash" size={13} />
                        撤回
                      </button>
                    )}
                  </div>
                  <div className="quiz-mine-q">{m.q}</div>
                  <div className="quiz-mine-a">
                    <Icon name="check" size={13} />
                    {m.a}
                  </div>
                  {m.note && <div className="quiz-mine-note">管理员备注：{m.note}</div>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
