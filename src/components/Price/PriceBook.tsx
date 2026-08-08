// ============================================================================
// 物价模块主入口（自定义物价本）。
// - 物品与价格全部由用户自行录入，只有「分类 / 名字 / 价格」三项，价格为自由文本；
// - 一屏尽量多展示：分类分组 + 密集单行列表（名字 · 价格）；
// - 进阶：可用「OCR 导入」从截图批量录入观测，并在有观测的物品下看价格趋势。
// 物价随服务器与版本波动，实际以游戏内摊位（Alt+X）为准。
// ============================================================================

import { useMemo, useState } from 'react'
import type { PriceItem, PriceObservation } from '../../types'
import { usePriceItems, usePriceObservations } from '../../store/useAppStore'
import { PRICE_CATEGORY_ORDER } from '../../data/prices'
import { formatMoney, statsFor } from '../../utils/priceParse'
import { appConfirm } from '../common/ConfirmDialog'
import Icon from '../common/Icon'
import OcrImport from './OcrImport'
import { Sparkline, TrendChart } from './Trend'
import './Price.css'

const CATEGORY_OPTIONS = [...PRICE_CATEGORY_ORDER]

/** 条目按 order 升序（无 order 排后） */
function byOrder(a: PriceItem, b: PriceItem): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
}

export default function PriceBook() {
  const { priceItems, add, update, remove } = usePriceItems()
  const { priceObservations, clearItem } = usePriceObservations()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showOcr, setShowOcr] = useState(false)

  // 物品 id -> 该物品的观测列表（用于趋势）
  const obsByItem = useMemo(() => {
    const map = new Map<string, PriceObservation[]>()
    for (const o of priceObservations) {
      if (!o.itemId) continue
      if (!map.has(o.itemId)) map.set(o.itemId, [])
      map.get(o.itemId)!.push(o)
    }
    return map
  }, [priceObservations])

  const unlinkedCount = useMemo(
    () => priceObservations.filter((o) => !o.itemId).length,
    [priceObservations],
  )

  const allItems = useMemo(() => [...priceItems].sort(byOrder), [priceItems])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((it) =>
      [it.name, it.price, it.category]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    )
  }, [allItems, query])

  // 按分类分组：先按 PRICE_CATEGORY_ORDER，再附加其它出现过的分类
  const groups = useMemo(() => {
    const map = new Map<string, PriceItem[]>()
    for (const it of filtered) {
      const cat = it.category || '其它'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(it)
    }
    const ordered: { category: string; list: PriceItem[] }[] = []
    for (const cat of CATEGORY_OPTIONS) {
      if (map.has(cat)) {
        ordered.push({ category: cat, list: map.get(cat)! })
        map.delete(cat)
      }
    }
    for (const [category, list] of map) ordered.push({ category, list })
    return ordered
  }, [filtered])

  return (
    <section className="stack price-book">
      <div className="price-head">
        <div>
          <h2 className="section-title">物价</h2>
          <p className="muted small">共 {priceItems.length} 条 · 价格自填，随服务器/版本波动，以摊位实价为准</p>
        </div>
        <div className="row">
          <button className="btn btn-tonal btn-sm" onClick={() => setShowOcr((v) => !v)}>
            <Icon name={showOcr ? 'x' : 'image'} size={14} />
            {showOcr ? '收起' : 'OCR 导入'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)}>
            <Icon name={showAdd ? 'x' : 'plus'} size={14} />
            {showAdd ? '收起' : '新增'}
          </button>
        </div>
      </div>

      {showOcr && <OcrImport onClose={() => setShowOcr(false)} />}
      {showAdd && <AddPriceForm onAdd={add} onDone={() => setShowAdd(false)} />}

      {priceObservations.length > 0 && (
        <p className="muted small price-obs-note">
          已记录 {priceObservations.length} 条价格观测
          {unlinkedCount > 0 && `（其中 ${unlinkedCount} 条未归类，不计入任何物品趋势）`}
          ，趋势显示在对应物品下。
        </p>
      )}

      {priceItems.length > 0 && (
        <div className="price-search-wrap">
          <Icon name="search" size={14} className="price-search-icon" />
          <input
            className="input price-search"
            placeholder="搜索物品 / 分类 / 价格…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {priceItems.length === 0 ? (
        <div className="empty price-empty">
          <p>还没有物价记录。</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={14} />
            新增第一条
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">没有匹配的物品，换个关键词或新增一条。</div>
      ) : (
        groups.map(({ category, list }) => (
          <div className="card price-cat" key={category}>
            <div className="card-head price-cat-head">
              <h3>{category}</h3>
              <span className="muted small">{list.length}</span>
            </div>
            <ul className="price-list">
              {list.map((item) => (
                <PriceRow
                  key={item.id}
                  item={item}
                  observations={obsByItem.get(item.id) ?? []}
                  onUpdate={update}
                  onRemove={remove}
                  onClearObs={clearItem}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 单行物品：密集展示「名字 · 价格」，行内编辑 / 删除；有观测时可看趋势
// ---------------------------------------------------------------------------

interface PriceRowProps {
  item: PriceItem
  observations: PriceObservation[]
  onUpdate: (id: string, patch: Partial<Omit<PriceItem, 'id' | 'preset'>>) => void
  onRemove: (id: string) => void
  onClearObs: (itemId: string) => void
}

function PriceRow({ item, observations, onUpdate, onRemove, onClearObs }: PriceRowProps) {
  const [editing, setEditing] = useState(false)
  const [showTrend, setShowTrend] = useState(false)

  const stats = useMemo(() => statsFor(observations), [observations])

  async function del() {
    if (await appConfirm(`删除物品「${item.name}」？`)) onRemove(item.id)
  }

  async function clearObs() {
    if (await appConfirm(`清空「${item.name}」的 ${observations.length} 条价格观测？`)) {
      onClearObs(item.id)
      setShowTrend(false)
    }
  }

  if (editing) {
    return (
      <li className="price-item price-item-editing">
        <EditPriceForm
          item={item}
          onSave={(patch) => {
            onUpdate(item.id, patch)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li className="price-item">
      <div className="price-row-main">
        <span className="price-item-name" title={item.name}>
          {item.name}
        </span>
        <span className="price-item-value">{item.price || '—'}</span>
        <span className="price-row-actions">
          {stats.count > 0 && (
            <button
              className="btn btn-ghost btn-icon-xs"
              title="价格趋势"
              onClick={() => setShowTrend((v) => !v)}
            >
              <Icon name={showTrend ? 'chevron-down' : 'trending-up'} size={14} />
            </button>
          )}
          <button className="btn btn-ghost btn-icon-xs" title="编辑" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={14} />
          </button>
          <button className="btn btn-ghost btn-icon-xs danger" title="删除" onClick={del}>
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>

      {stats.count > 0 && !showTrend && (
        <div className="price-trend-inline">
          <Sparkline obs={observations} />
          <span className="muted small">
            最新 {formatMoney(stats.latest)} · 低 {formatMoney(stats.min)} · 高 {formatMoney(stats.max)} · {stats.count} 条
          </span>
        </div>
      )}

      {showTrend && stats.count > 0 && (
        <div className="price-trend-detail">
          <TrendChart obs={observations} />
          <button className="btn btn-ghost btn-xs danger" onClick={clearObs}>
            <Icon name="trash" size={13} />
            清空该物品观测
          </button>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// 新增物品表单（分类 / 名字 / 价格）
// ---------------------------------------------------------------------------

function AddPriceForm({
  onAdd,
  onDone,
}: {
  onAdd: (input: { name: string; category?: string; price?: string }) => string
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>(CATEGORY_OPTIONS[0])
  const [price, setPrice] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, category, price: price.trim() || undefined })
    setName('')
    setPrice('')
    // 连续录入：保留分类与展开状态，聚焦回名称由 autoFocus 保证
  }

  return (
    <div className="card price-add-card">
      <div className="row row-wrap price-add-row">
        <div className="field" style={{ flex: '1 1 120px' }}>
          <label>分类</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '2 1 180px' }}>
          <label>名字</label>
          <input
            className="input"
            value={name}
            maxLength={40}
            autoFocus
            placeholder="例如：高级魔兽要诀·法术连击"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="field" style={{ flex: '1 1 130px' }}>
          <label>价格</label>
          <input
            className="input"
            value={price}
            maxLength={40}
            placeholder="自定义，如 80w / 约135万"
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={!name.trim()}>
          添加
        </button>
        <button className="btn btn-sm" onClick={onDone}>
          完成
        </button>
        <span className="muted small">回车快速连续添加</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 编辑物品表单（分类 / 名字 / 价格）
// ---------------------------------------------------------------------------

function EditPriceForm({
  item,
  onSave,
  onCancel,
}: {
  item: PriceItem
  onSave: (patch: Partial<Omit<PriceItem, 'id' | 'preset'>>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState<string>(item.category || CATEGORY_OPTIONS[0])
  const [price, setPrice] = useState(item.price ?? '')

  function save() {
    if (!name.trim()) return
    onSave({ name: name.trim(), category, price: price.trim() || undefined })
  }

  return (
    <div className="stack price-edit">
      <div className="row row-wrap price-add-row">
        <div className="field" style={{ flex: '1 1 120px' }}>
          <label>分类</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '2 1 180px' }}>
          <label>名字</label>
          <input
            className="input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        <div className="field" style={{ flex: '1 1 130px' }}>
          <label>价格</label>
          <input
            className="input"
            value={price}
            maxLength={40}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!name.trim()}>
          保存
        </button>
        <button className="btn btn-sm" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
