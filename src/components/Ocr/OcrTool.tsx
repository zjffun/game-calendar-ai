// ============================================================================
// 取字（OCR）：粘贴 / 拖入 / 选择一张图片 → 本机识别出文字 → 落到可编辑文本框。
// - 复用 utils/ocr 的 ocrImage()（含放大+灰度+对比度预处理），图片全程在本机处理、不上传。
// - Ctrl/⌘ + V 可在页面任意位置粘贴截图；每次识别覆盖文本框内容（清掉上一张的输出）。
// - tesseract 识别中文时常在字与字之间塞空格，这里在本页做一次清理（不改公共 ocr.ts，
//   以免影响物价 OCR 依赖空格切分「物品名 + 价格」）。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { ocrImage, type OcrProgress } from '../../utils/ocr'
import Icon from '../common/Icon'
import './Ocr.css'

type Phase = 'idle' | 'running' | 'done' | 'error'

/** 汉字/全角字符范围（用于判断空格是否夹在中文里）。 */
const CJK = '\\u4e00-\\u9fff\\u3400-\\u4dbf\\uff00-\\uffef'

/**
 * 清理识别文本：
 * - 去掉紧挨汉字的多余空格（「光 芒 石」→「光芒石」、「80 万」→「80万」），
 *   但保留纯英文单词之间的空格（两侧都非汉字时不动）；
 * - 去掉行尾空白，连续空行压成一个。
 */
function tidyText(text: string): string {
  return text
    .replace(new RegExp(`([${CJK}])[^\\S\\n]+`, 'g'), '$1') // 汉字后紧跟的空格
    .replace(new RegExp(`[^\\S\\n]+(?=[${CJK}])`, 'g'), '') // 汉字前紧挨的空格
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** tesseract 阶段名 → 中文提示。 */
function progressLabel(p: OcrProgress | null): string {
  if (!p) return '准备中…'
  const map: Record<string, string> = {
    'loading tesseract core': '加载识别内核…',
    'initializing tesseract': '初始化…',
    'loading language traineddata': '下载中文语言包…（首次较慢，之后会缓存）',
    'initializing api': '准备识别引擎…',
    'recognizing text': '识别文字中…',
  }
  return map[p.status] ?? `${p.status}…`
}

export default function OcrTool() {
  const [preview, setPreview] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  // 串行识别：正在识别时忽略新的图片，避免共享 Worker 被并发调用
  const busyRef = useRef(false)

  // 离开页面时释放预览 URL（Worker 是全站共享的，不在此销毁）
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const runOcr = useCallback(async (blob: Blob) => {
    if (busyRef.current) return
    busyRef.current = true

    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(blob)
    })
    setPhase('running')
    setProgress(null)
    setError(null)
    setCopied(false)
    setText('') // 新图片：先清掉上一张的识别结果

    try {
      const result = await ocrImage(blob, { onProgress: setProgress })
      const clean = tidyText(result)
      if (clean) {
        setText(clean) // 覆盖为本张的结果
        setPhase('done')
      } else {
        setPhase('done')
        setError('没识别到文字，换一张更清晰、文字更大的图片再试试。')
      }
    } catch (err) {
      console.error('[ocr]', err)
      setError('识别失败：' + (err instanceof Error ? err.message : String(err)) + '（首次使用需联网下载识别引擎）')
      setPhase('error')
    } finally {
      busyRef.current = false
    }
  }, [])

  // 页面任意处 Ctrl/⌘+V：只在剪贴板含图片时接管，否则放行（如往文本框粘贴文字）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = e.clipboardData
        ? [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
        : undefined
      const file = item?.getAsFile()
      if (file) {
        e.preventDefault()
        runOcr(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [runOcr])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
      if (file) runOcr(file)
    },
    [runOcr],
  )

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) runOcr(file)
    e.target.value = '' // 允许再次选同一张
  }

  async function copyText() {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('复制失败，请手动选中文本复制。')
    }
  }

  function clearAll() {
    setText('')
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPhase('idle')
    setProgress(null)
    setError(null)
    setCopied(false)
  }

  const running = phase === 'running'
  const pct = Math.round((progress?.progress ?? 0) * 100)

  return (
    <section className="stack ocr-page">
      <div>
        <h2 className="section-title">取字（OCR）</h2>
        <p className="muted small">
          粘贴、拖入或选择一张图片，本机识别出文字后落到下方文本框，可直接编辑、复制。图片只在本机处理，不上传。
        </p>
      </div>

      {/* 图片输入区：点击选图 / 拖入 / 也是粘贴目标 */}
      <div
        className={`card ocr-drop${dragOver ? ' drag' : ''}${running ? ' busy' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !running && fileRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !running) {
            e.preventDefault()
            fileRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {preview ? (
          <img className="ocr-preview" src={preview} alt="待识别图片" />
        ) : (
          <div className="ocr-drop-hint">
            <Icon name="scan-text" size={30} />
            <p className="ocr-drop-title">
              按 <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>V</kbd> 粘贴截图
            </p>
            <p className="muted small">或点击此处选择图片，也可把图片拖进来</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      </div>

      {running && (
        <div className="ocr-progress">
          <div className="meter meter-ok" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">{progressLabel(progress)}</span>
            <span className="muted small">{pct}%</span>
          </div>
        </div>
      )}

      {error && <div className="ocr-error">{error}</div>}

      {/* 可编辑结果 */}
      <div className="card ocr-result">
        <div className="ocr-result-head">
          <span className="ocr-result-title">
            <Icon name="note" size={16} />
            识别结果
          </span>
          {text && <span className="muted small">{text.length} 字</span>}
          <span className="spacer" />
          <button className="btn btn-sm" onClick={copyText} disabled={!text}>
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            {copied ? '已复制' : '复制'}
          </button>
          <button className="btn btn-sm" onClick={clearAll} disabled={!text && !preview}>
            <Icon name="trash" size={14} />
            清空
          </button>
        </div>
        <textarea
          className="textarea ocr-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="识别出的文字会显示在这里，可直接编辑。也可以直接在此处输入或粘贴文本。"
          spellCheck={false}
        />
      </div>
    </section>
  )
}
