// ============================================================================
// 物价模块主入口。
// - 展示「常见任务产出物品」的参考价（内置，只读，来自 data/prices）；
// - 支持自定义新增物品（名称 / 分类 / 参考价 / 说明），可编辑、删除；
// - 每条物品（内置或自定义）都可添加一段自己的备注（如本区实时价）。
// 物价随服务器与版本波动，内置价仅供参考，实际以游戏内摊位为准。
// ============================================================================

import { useMemo, useState } from 'react'
import type { PriceItem, PriceComment } from '../../types'
import { usePriceItems, usePriceComments } from '../../store/useAppStore'
import { PRICE_PRESETS, PRICE_CATEGORY_ORDER } from '../../data/prices'
import { appConfirm } from '../common/ConfirmDialog'
import Icon from '../common/Icon'
import './Price.css'

const CATEGORY_OPTIONS = [...PRICE_CATEGORY_ORDER]

/** 自定义条目按 order 升序（无 order 排后） */
function byOrder(a: PriceItem, b: PriceItem): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
}

export default function PriceBook() {
  const { priceItems, add, update, remove } = usePriceItems()
  const { priceComments, set: setComment } = usePriceComments()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const allItems = useMemo(
    () => [...PRICE_PRESETS, ...[...priceItems].sort(byOrder)],
    [priceItems],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((it) =>
      [it.name, it.price, it.desc, it.category]
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

  const presetCount = PRICE_PRESETS.length
  const customCount = priceItems.length

  return (
    <section className="stack price-book">
      <div className="price-head">
        <div>
          <h2 className="section-title">物价</h2>
          <p className="muted small">
            内置参考 {presetCount} 条 · 自定义 {customCount} 条
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd((v) => !v)}
        >
          <Icon name={showAdd ? 'x' : 'plus'} size={14} />
          {showAdd ? '收起' : '新增物品'}
        </button>
      </div>

      <div className="price-note">
        <Icon name="alert" size={15} />
        <span>
          梦幻西游物价随「服务器 / 时段 / 版本」大幅波动，内置价仅为参考区间；
          点每条右侧「备注」可记录本区实时价，实际成交以游戏内摊位（Alt+X）为准。
        </span>
      </div>

      {showAdd && <AddPriceForm onAdd={add} onDone={() => setShowAdd(false)} />}

      <div className="price-search-wrap">
        <Icon name="search" size={14} className="price-search-icon" />
        <input
          className="input price-search"
          placeholder="搜索物品 / 分类 / 价格…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {groups.length === 0 ? (
        <div className="empty">没有匹配的物品，换个关键词或新增一条。</div>
      ) : (
        groups.map(({ category, list }) => (
          <div className="card" key={category}>
            <div className="card-head">
              <h3>{category}</h3>
              <span className="muted small">{list.length}</span>
            </div>
            <ul className="price-list">
              {list.map((item) => (
                <PriceRow
                  key={item.id}
                  item={item}
                  comment={priceComments[item.id]}
                  onSetComment={setComment}
                  onUpdate={update}
                  onRemove={remove}
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
// 单行物品：展示价格，支持备注（所有条目）与编辑/删除（仅自定义）
// ---------------------------------------------------------------------------

interface PriceRowProps {
  item: PriceItem
  comment?: PriceComment
  onSetComment: (id: string, text: string) => void
  onUpdate: (id: string, patch: Partial<Omit<PriceItem, 'id' | 'preset'>>) => void
  onRemove: (id: string) => void
}

function PriceRow({ item, comment, onSetComment, onUpdate, onRemove }: PriceRowProps) {
  const [commenting, setCommenting] = useState(false)
  const [draft, setDraft] = useState(comment?.text ?? '')
  const [editing, setEditing] = useState(false)

  function saveComment() {
    onSetComment(item.id, draft)
    setCommenting(false)
  }

  async function del() {
    if (await appConfirm(`删除自定义物品「${item.name}」？`)) onRemove(item.id)
  }

  if (editing) {
    return (
      <li className="price-item">
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
        <div className="price-item-info">
          <div className="price-item-name">
            {item.name}
            {!item.preset && <span className="badge badge-outline price-custom-badge">自定义</span>}
          </div>
          {item.desc && <div className="muted small price-item-desc">{item.desc}</div>}
        </div>
        <div className="price-item-value">{item.price || '—'}</div>
      </div>

      <div className="price-row-actions">
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => {
            setDraft(comment?.text ?? '')
            setCommenting((v) => !v)
          }}
        >
          <Icon name="note" size={13} />
          {comment ? '编辑备注' : '备注'}
        </button>
        {!item.preset && (
          <>
            <button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={13} />
              编辑
            </button>
            <button className="btn btn-ghost btn-xs danger" onClick={del}>
              <Icon name="trash" size={13} />
              删除
            </button>
          </>
        )}
      </div>

      {comment && !commenting && (
        <div className="price-comment">
          <Icon name="note" size={13} className="price-comment-icon" />
          <span>{comment.text}</span>
        </div>
      )}

      {commenting && (
        <div className="price-comment-edit">
          <textarea
            className="input price-comment-input"
            rows={2}
            maxLength={200}
            autoFocus
            placeholder="记录你的备注，例如：本区 130w 收 / 卖 160w"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={saveComment}>
              保存
            </button>
            <button className="btn btn-sm" onClick={() => setCommenting(false)}>
              取消
            </button>
            {comment && (
              <button
                className="btn btn-sm danger"
                onClick={() => {
                  onSetComment(item.id, '')
                  setCommenting(false)
                }}
              >
                删除备注
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// 新增物品表单
// ---------------------------------------------------------------------------

function AddPriceForm({
  onAdd,
  onDone,
}: {
  onAdd: (input: { name: string; category?: string; price?: string; desc?: string }) => string
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>(CATEGORY_OPTIONS[0])
  const [price, setPrice] = useState('')
  const [desc, setDesc] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, category, price: price.trim() || undefined, desc: desc.trim() || undefined })
    setName('')
    setPrice('')
    setDesc('')
    onDone()
  }

  return (
    <div className="card price-add-card">
      <div className="card-head">
        <h3>新增物品</h3>
      </div>
      <div className="stack">
        <div className="row row-wrap">
          <div className="field" style={{ flex: '2 1 180px' }}>
            <label>物品名称</label>
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
          <div className="field" style={{ flex: '1 1 110px' }}>
            <label>分类</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 130px' }}>
            <label>参考价（可选）</label>
            <input
              className="input"
              value={price}
              maxLength={40}
              placeholder="例如：约 80 万"
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        </div>
        <div className="field">
          <label>说明（可选）</label>
          <input
            className="input"
            value={desc}
            maxLength={80}
            placeholder="产出来源 / 用途等"
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
            添加物品
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 编辑（自定义物品）表单
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
  const [desc, setDesc] = useState(item.desc ?? '')

  function save() {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      category,
      price: price.trim() || undefined,
      desc: desc.trim() || undefined,
    })
  }

  return (
    <div className="stack price-edit">
      <div className="row row-wrap">
        <div className="field" style={{ flex: '2 1 180px' }}>
          <label>物品名称</label>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '1 1 110px' }}>
          <label>分类</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 130px' }}>
          <label>参考价</label>
          <input className="input" value={price} maxLength={40} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>说明</label>
        <input className="input" value={desc} maxLength={80} onChange={(e) => setDesc(e.target.value)} />
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
