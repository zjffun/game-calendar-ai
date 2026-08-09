// ============================================================================
// OCR 导入面板：上传/粘贴 游戏聊天或摊位截图 → 本机 OCR → 解析为候选 →
// 用户校对（改名/改价/归类/勾选）→ 保存为带时间戳的价格观测（用于趋势）。
// 图片全程在本机识别，不上传。
// ============================================================================

import { useMemo, useRef, useState } from 'react'
import type { PriceSource } from '../../types'
import { usePriceItems, usePriceObservations } from '../../store/useAppStore'
import { ocrImage, type OcrProgress } from '../../utils/ocr'
import { parseText, normalizePrice, formatMoney, type PriceCandidate } from '../../utils/priceParse'
import Icon from '../common/Icon'

type Target = string | '__new__' | '__none__'
interface Row extends PriceCandidate {
  target: Target
}

const SOURCES: { value: PriceSource; label: string }[] = [
  { value: 'chat', label: '聊天频道' },
  { value: 'stall', label: '摊位' },
]

function progressLabel(p: OcrProgress | null): string {
  if (!p) return '识别中…'
  const map: Record<string, string> = {
    'loading tesseract core': '加载 OCR 内核…',
    'initializing tesseract': '初始化…',
    'loading language traineddata': '下载中文语言模型…（首次较慢，之后会缓存）',
    'initializing api': '初始化识别引擎…',
    'recognizing text': `识别文字… ${Math.round(p.progress * 100)}%`,
  }
  return map[p.status] ?? `${p.status}…`
}

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function OcrImport({ onClose }: { onClose: () => void }) {
  const { priceItems, add: addItem } = usePriceItems()
  const { addMany } = usePriceObservations()

  const allItems = priceItems
  const known = useMemo(() => allItems.map((it) => ({ id: it.id, name: it.name })), [allItems])

  const [blob, setBlob] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [source, setSource] = useState<PriceSource>('chat')
  const [phase, setPhase] = useState<'idle' | 'ocr' | 'review'>('idle')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [capturedAt, setCapturedAt] = useState<number>(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function acceptImage(file: Blob | null) {
    if (!file) return
    setBlob(file)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setRows([])
    setPhase('idle')
    setError(null)
    setSavedMsg(null)
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
    if (item) acceptImage(item.getAsFile())
  }

  async function runOcr() {
    if (!blob) return
    setPhase('ocr')
    setProgress(null)
    setError(null)
    try {
      const text = await ocrImage(blob, { onProgress: setProgress })
      const cands = parseText(text, { source, known })
      setRows(cands.map((c) => ({ ...c, target: c.itemId ?? '__new__' })))
      setCapturedAt(Date.now())
      setPhase('review')
      if (cands.length === 0) setError('没能从图片里解析出「物品 + 价格」。可换更清晰的截图，或直接用「新增物品」手动记录。')
    } catch (err) {
      console.error('[ocr]', err)
      setError('识别失败：' + (err instanceof Error ? err.message : String(err)))
      setPhase('idle')
    }
  }

  function patchRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function save() {
    const keep = rows.filter((r) => r.keep && r.itemName.trim())
    if (keep.length === 0) return
    // 同名「新建」去重：一次保存里同名只建一个物品
    const newIdByName = new Map<string, string>()
    const observations = keep.map((r) => {
      let itemId: string | undefined
      let itemName = r.itemName.trim()
      if (r.target === '__none__') {
        itemId = undefined
      } else if (r.target === '__new__') {
        const cached = newIdByName.get(itemName)
        if (cached) itemId = cached
        else {
          itemId = addItem({ name: itemName, category: '其它', price: r.priceText })
          newIdByName.set(itemName, itemId)
        }
      } else {
        itemId = r.target
        itemName = allItems.find((it) => it.id === r.target)?.name ?? itemName
      }
      return {
        itemId,
        itemName,
        value: normalizePrice(r.priceText ?? '') ?? undefined,
        priceText: r.priceText,
        side: r.side,
        source,
        server: r.server,
        capturedAt,
        rawText: r.rawText,
      }
    })
    addMany(observations)
    setSavedMsg(`已保存 ${observations.length} 条价格观测`)
    setRows([])
    setBlob(null)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPhase('idle')
  }

  const keepCount = rows.filter((r) => r.keep && r.itemName.trim()).length

  return (
    <div className="card price-ocr" onPaste={onPaste}>
      <div className="card-head">
        <h3>OCR 导入价格</h3>
        <span className="spacer" />
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          <Icon name="x" size={14} />
          关闭
        </button>
      </div>

      <p className="muted small">
        上传或粘贴「聊天频道 / 摊位」截图，本机识别后校对入库；多次导入即可看价格趋势。图片不上传，仅在本机处理。
      </p>

      {/* 来源 + 上传 */}
      <div className="row row-wrap price-ocr-controls">
        <div className="field" style={{ flex: '0 0 auto' }}>
          <label>截图来源</label>
          <select className="select" value={source} onChange={(e) => setSource(e.target.value as PriceSource)}>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 auto' }}>
          <label>图片（可点击选择，或直接 Ctrl/Cmd+V 粘贴）</label>
          <div className="row">
            <button className="btn btn-tonal btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={14} />
              选择图片
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => acceptImage(e.target.files?.[0] ?? null)}
            />
            {blob && phase !== 'ocr' && (
              <button className="btn btn-primary btn-sm" onClick={runOcr}>
                <Icon name="search" size={14} />
                {phase === 'review' ? '重新识别' : '开始识别'}
              </button>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div className="price-ocr-preview">
          <img src={preview} alt="待识别截图" />
        </div>
      )}

      {phase === 'ocr' && (
        <div className="price-ocr-progress">
          <div className="price-ocr-bar">
            <div
              className="price-ocr-bar-fill"
              style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
            />
          </div>
          <span className="muted small">{progressLabel(progress)}</span>
        </div>
      )}

      {error && <div className="price-ocr-error">{error}</div>}
      {savedMsg && <div className="price-ocr-saved">{savedMsg}</div>}

      {/* 校对表 */}
      {phase === 'review' && rows.length > 0 && (
        <div className="stack price-ocr-review">
          <div className="row row-wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <label>采集时间（默认现在，可改成截图时间）</label>
              <input
                className="input"
                type="datetime-local"
                value={toLocalInput(capturedAt)}
                onChange={(e) => {
                  const t = new Date(e.target.value).getTime()
                  if (isFinite(t)) setCapturedAt(t)
                }}
              />
            </div>
            <span className="muted small">识别到 {rows.length} 条，勾选保留 {keepCount} 条</span>
          </div>

          <ul className="price-ocr-rows">
            {rows.map((r, i) => (
              <li key={i} className={`price-ocr-row${r.keep ? '' : ' off'}`}>
                <input
                  type="checkbox"
                  className="price-ocr-keep"
                  checked={r.keep}
                  onChange={(e) => patchRow(i, { keep: e.target.checked })}
                  aria-label="保留这条"
                />
                <div className="price-ocr-fields">
                  <input
                    className="input price-ocr-name"
                    value={r.itemName}
                    placeholder="物品名"
                    onChange={(e) => patchRow(i, { itemName: e.target.value })}
                  />
                  <input
                    className="input price-ocr-price"
                    value={r.priceText ?? ''}
                    placeholder="价格，如 80w"
                    onChange={(e) => patchRow(i, { priceText: e.target.value })}
                  />
                  <span className="price-ocr-value" title="归一化价格">
                    {formatMoney(normalizePrice(r.priceText ?? '') ?? undefined)}
                  </span>
                  <select
                    className="select price-ocr-side"
                    value={r.side ?? ''}
                    onChange={(e) => patchRow(i, { side: (e.target.value || undefined) as Row['side'] })}
                  >
                    <option value="">—</option>
                    <option value="buy">收</option>
                    <option value="sell">卖</option>
                  </select>
                  <select
                    className="select price-ocr-target"
                    value={r.target}
                    onChange={(e) => patchRow(i, { target: e.target.value as Target })}
                  >
                    <option value="__new__">＋ 新建同名物品</option>
                    <option value="__none__">不归类</option>
                    {allItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        归入：{it.name.length > 12 ? it.name.slice(0, 12) + '…' : it.name}
                      </option>
                    ))}
                  </select>
                </div>
                {r.rawText && <div className="price-ocr-raw muted small">{r.rawText}</div>}
              </li>
            ))}
          </ul>

          <div className="row">
            <button className="btn btn-primary" onClick={save} disabled={keepCount === 0}>
              保存 {keepCount} 条观测
            </button>
            <button className="btn" onClick={() => setRows([])}>
              清空
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
