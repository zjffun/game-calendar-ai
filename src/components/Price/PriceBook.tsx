// ============================================================================
// 物价模块主入口。分两个子视图，用顶部分段切换：
//   物价本   —— 用户自填的物价清单（自定义分组 · 名字 · 价格）+ OCR 导入 + 价格趋势；
//   合成算价 —— 由 1 级材料 / 基准品质的价格推算高等级参考价（原「算价」页并入）。
// 物价随服务器与版本波动，实际以游戏内摊位（Alt+X）为准。
//
// 设计要点（本次重构）：
//   1) 分组自定义：不再用固定分类，分组名由用户自由新建 / 重命名，空则归「其它」；
//   2) 清爽排版：单列「名字 —— 价格」密集清单，操作按钮 hover 才出现；
//   3) 趋势按需看：每条改价按天记一条观测，点「趋势」按钮展开折线 + 历史点，
//      单点可删（剔除错误数据，避免污染统计）。
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PriceItem, PriceObservation, PriceSource } from '../../types'
import { usePriceItems, usePriceObservations } from '../../store/useAppStore'
import {
  finalizePriceInput,
  formatMoney,
  normalizePrice,
  sanitizeNumericInput,
  statsFor,
} from '../../utils/priceParse'
import { appConfirm } from '../common/ConfirmDialog'
import Icon from '../common/Icon'
import OcrImport from './OcrImport'
import { TrendChart } from './Trend'
import SynthCalculators from './SynthCalculators'
import './Price.css'

/** 顶部视图：物价清单 / 合成算价 */
type PriceView = 'book' | 'synth'

/** 取条目所属分组（空归「其它」） */
function groupOf(it: PriceItem): string {
  return it.category?.trim() || '其它'
}

/** 条目按 order 升序（无 order 排后） */
function byOrder(a: PriceItem, b: PriceItem): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
}

export default function PriceBook() {
  const [view, setView] = useState<PriceView>('book')

  return (
    <section className="stack price-book">
      <div className="price-head">
        <div>
          <h2 className="section-title">物价</h2>
          <p className="muted small">
            {view === 'book'
              ? '价格自填，随服务器/版本波动，以摊位实价为准'
              : '由 1 级材料 / 基准品质的价格推算高等级参考价，仅供估算'}
          </p>
        </div>
        <div className="seg" role="tablist" aria-label="物价视图">
          <button
            role="tab"
            aria-selected={view === 'book'}
            className={`seg-btn${view === 'book' ? ' active' : ''}`}
            onClick={() => setView('book')}
          >
            <Icon name="coin" size={14} />
            物价本
          </button>
          <button
            role="tab"
            aria-selected={view === 'synth'}
            className={`seg-btn${view === 'synth' ? ' active' : ''}`}
            onClick={() => setView('synth')}
          >
            <Icon name="gem" size={14} />
            合成算价
          </button>
        </div>
      </div>

      {view === 'book' ? <PriceBookView /> : <SynthCalculators />}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 物价本子视图：自定义分组 + 单列密集清单（名字 · 价格）+ OCR 导入 + 趋势
// ---------------------------------------------------------------------------

function PriceBookView() {
  const { priceItems, add, update, remove, renameGroup } = usePriceItems()
  const { priceObservations, recordManual, remove: removeObs, clearItem } = usePriceObservations()
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  // 就地改价：当前处于价格编辑态的条目 id（点价格触发）
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)

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

  const allItems = useMemo(() => [...priceItems].sort(byOrder), [priceItems])

  // 分组顺序：按「组内最小 order」排列，让新建分组自然落到末尾
  const groupOrder = useMemo(() => {
    const minOrder = new Map<string, number>()
    allItems.forEach((it, i) => {
      const g = groupOf(it)
      const ord = it.order ?? i
      if (!minOrder.has(g) || ord < minOrder.get(g)!) minOrder.set(g, ord)
    })
    return [...minOrder.keys()].sort((a, b) => minOrder.get(a)! - minOrder.get(b)!)
  }, [allItems])

  // 各分组计数（筛选 chip 用）
  const groupCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const it of allItems) {
      const g = groupOf(it)
      map.set(g, (map.get(g) ?? 0) + 1)
    }
    return map
  }, [allItems])

  // 选中的分组若已不存在（改名/删空）则视为「全部」
  const effectiveGroup = activeGroup && groupOrder.includes(activeGroup) ? activeGroup : null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allItems.filter((it) => {
      if (effectiveGroup && groupOf(it) !== effectiveGroup) return false
      if (!q) return true
      return [it.name, it.category]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q))
    })
  }, [allItems, query, effectiveGroup])

  // 按分组聚合（保持 groupOrder 顺序）
  const groups = useMemo(() => {
    const map = new Map<string, PriceItem[]>()
    for (const it of filtered) {
      const g = groupOf(it)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(it)
    }
    return groupOrder
      .filter((g) => map.has(g))
      .map((g) => ({ group: g, list: map.get(g)! }))
  }, [filtered, groupOrder])

  // 就地改价 Tab 导航：按可见分组顺序拍平所有条目 id，供「Tab 跳下一条」用
  const priceEditOrder = useMemo(
    () => groups.flatMap((g) => g.list.map((it) => it.id)),
    [groups],
  )

  // —— 新增：写入条目 + 若价格可解析则记一条当天手动观测 ——
  function handleAdd(input: { name: string; category?: string; price?: string }): string {
    const id = add(input)
    const v = input.price ? normalizePrice(input.price) : undefined
    if (v != null) recordManual({ itemId: id, itemName: input.name, value: v, priceText: input.price })
    return id
  }

  // —— 编辑保存：更新条目 + 按天记录当前价 ——
  function handleUpdate(
    item: PriceItem,
    patch: Partial<Omit<PriceItem, 'id' | 'preset'>>,
  ) {
    update(item.id, patch)
    if (patch.price !== undefined) {
      const v = patch.price ? normalizePrice(patch.price) : undefined
      if (v != null) {
        recordManual({
          itemId: item.id,
          itemName: patch.name ?? item.name,
          value: v,
          priceText: patch.price,
        })
      }
    }
  }

  // —— 就地改价：提交（仅在变化时写库，顺带按天记趋势）——
  function commitPrice(item: PriceItem, raw: string) {
    const price = finalizePriceInput(raw) || undefined
    if ((item.price ?? '') !== (price ?? '')) handleUpdate(item, { price })
  }

  // —— 就地改价：Tab / Shift+Tab 移到下一 / 上一条 ——
  function movePriceEdit(fromId: string, dir: 1 | -1) {
    const i = priceEditOrder.indexOf(fromId)
    setEditingPriceId(i < 0 ? null : priceEditOrder[i + dir] ?? null)
  }

  function handleRenameGroup(from: string, to: string) {
    renameGroup(from, to)
    if (effectiveGroup === from) setActiveGroup(to.trim() || null)
  }

  const defaultGroup = effectiveGroup ?? groupOrder[0] ?? '其它'

  return (
    <>
      <div className="price-book-bar">
        <span className="muted small">
          共 {priceItems.length} 条
          {groupOrder.length > 0 && ` · ${groupOrder.length} 个分组`}
        </span>
        <span className="spacer" />
        <button className="btn btn-tonal btn-sm" onClick={() => setShowOcr((v) => !v)}>
          <Icon name={showOcr ? 'x' : 'image'} size={14} />
          {showOcr ? '收起' : 'OCR 导入'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)}>
          <Icon name={showAdd ? 'x' : 'plus'} size={14} />
          {showAdd ? '收起' : '新增'}
        </button>
      </div>

      {showOcr && <OcrImport onClose={() => setShowOcr(false)} />}
      {showAdd && (
        <AddPriceForm
          defaultGroup={defaultGroup}
          groups={groupOrder}
          onAdd={handleAdd}
          onDone={() => setShowAdd(false)}
        />
      )}

      {priceItems.length > 0 && (
        <div className="price-search-wrap">
          <Icon name="search" size={14} className="price-search-icon" />
          <input
            className="input price-search"
            placeholder="搜索物品 / 分组…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {groupOrder.length > 1 && (
        <div className="price-cats" role="tablist" aria-label="分组筛选">
          <button
            className={`chip${effectiveGroup === null ? ' active' : ''}`}
            onClick={() => setActiveGroup(null)}
          >
            全部 <span className="price-cat-count">{priceItems.length}</span>
          </button>
          {groupOrder.map((g) => (
            <button
              key={g}
              className={`chip${effectiveGroup === g ? ' active' : ''}`}
              onClick={() => setActiveGroup(g)}
            >
              {g} <span className="price-cat-count">{groupCounts.get(g)}</span>
            </button>
          ))}
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
        <div className="empty">没有匹配的物品，换个关键词或分组，或新增一条。</div>
      ) : (
        groups.map(({ group, list }) => (
          <div className="card price-group" key={group}>
            <GroupHead group={group} count={list.length} onRename={handleRenameGroup} />
            <ul className="price-list">
              {list.map((item) => (
                <PriceRow
                  key={item.id}
                  item={item}
                  groups={groupOrder}
                  observations={obsByItem.get(item.id) ?? []}
                  priceEditing={editingPriceId === item.id}
                  onStartPriceEdit={() => setEditingPriceId(item.id)}
                  onCommitPrice={(raw, move) => {
                    commitPrice(item, raw)
                    if (move) movePriceEdit(item.id, move)
                    else setEditingPriceId(null)
                  }}
                  onCancelPrice={() => setEditingPriceId(null)}
                  onUpdate={handleUpdate}
                  onRemove={remove}
                  onRemoveObs={removeObs}
                  onClearObs={clearItem}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// 分组标题：展示名字 + 计数，可就地重命名（自定义分组）
// ---------------------------------------------------------------------------

function GroupHead({
  group,
  count,
  onRename,
}: {
  group: string
  count: number
  onRename: (from: string, to: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group)

  function commit() {
    const next = name.trim()
    if (next && next !== group) onRename(group, next)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="price-group-head">
        <input
          className="input price-group-input"
          value={name}
          autoFocus
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setName(group)
              setEditing(false)
            }
          }}
        />
        <button className="btn btn-primary btn-xs" onClick={commit}>
          保存
        </button>
        <button
          className="btn btn-xs"
          onClick={() => {
            setName(group)
            setEditing(false)
          }}
        >
          取消
        </button>
      </div>
    )
  }

  return (
    <div className="price-group-head">
      <h3>{group}</h3>
      <span className="price-group-count">{count}</span>
      <button
        className="btn btn-ghost btn-icon-xs price-group-rename"
        title="重命名分组"
        onClick={() => {
          setName(group)
          setEditing(true)
        }}
      >
        <Icon name="pencil" size={13} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 单行物品：密集展示「名字 · 价格」，行内编辑 / 删除；有观测时可展开趋势
// ---------------------------------------------------------------------------

interface PriceRowProps {
  item: PriceItem
  groups: string[]
  observations: PriceObservation[]
  priceEditing: boolean
  onStartPriceEdit: () => void
  onCommitPrice: (raw: string, move: 1 | -1 | null) => void
  onCancelPrice: () => void
  onUpdate: (item: PriceItem, patch: Partial<Omit<PriceItem, 'id' | 'preset'>>) => void
  onRemove: (id: string) => void
  onRemoveObs: (id: string) => void
  onClearObs: (itemId: string) => void
}

function PriceRow({
  item,
  groups,
  observations,
  priceEditing,
  onStartPriceEdit,
  onCommitPrice,
  onCancelPrice,
  onUpdate,
  onRemove,
  onRemoveObs,
  onClearObs,
}: PriceRowProps) {
  const [editing, setEditing] = useState(false)
  const [showTrend, setShowTrend] = useState(false)

  const hasData = observations.length > 0

  async function del() {
    if (await appConfirm(`删除物品「${item.name}」？`)) onRemove(item.id)
  }

  if (editing) {
    return (
      <li className="price-item price-item-editing">
        <EditPriceForm
          item={item}
          groups={groups}
          onSave={(patch) => {
            onUpdate(item, patch)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li className={`price-item${showTrend ? ' price-item-expanded' : ''}`}>
      <div className="price-item-top">
        <div className="price-row-main">
          <span className="price-item-name" title={item.name}>
            {item.name}
          </span>
          {priceEditing ? (
            <PriceQuickEdit
              initial={item.price ?? ''}
              onCommit={onCommitPrice}
              onCancel={onCancelPrice}
            />
          ) : (
            <button
              type="button"
              className={`price-item-value price-item-value-btn${item.price ? '' : ' is-empty'}`}
              title="点击改价"
              onClick={onStartPriceEdit}
            >
              {item.price || '＋ 价格'}
            </button>
          )}
        </div>
        {!priceEditing && (
          <span className="price-row-actions">
            {hasData && (
              <button
                className={`btn btn-ghost btn-icon-xs${showTrend ? ' active' : ''}`}
                title="价格趋势"
                aria-pressed={showTrend}
                onClick={() => setShowTrend((v) => !v)}
              >
                <Icon name={showTrend ? 'chevron-down' : 'trending-up'} size={13} />
              </button>
            )}
            <button className="btn btn-ghost btn-icon-xs" title="编辑名称/分组" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={13} />
            </button>
            <button className="btn btn-ghost btn-icon-xs danger" title="删除" onClick={del}>
              <Icon name="trash" size={13} />
            </button>
          </span>
        )}
      </div>

      {showTrend && hasData && (
        <TrendPanel
          item={item}
          observations={observations}
          onRemoveObs={onRemoveObs}
          onClearObs={() => {
            onClearObs(item.id)
            setShowTrend(false)
          }}
        />
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// 趋势面板：折线图 + 历史价格点（按天记录，单点可删以剔除错误数据）
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<PriceSource, string> = {
  manual: '手动',
  chat: '聊天',
  stall: '摊位',
}

function fmtDay(t: number): string {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function TrendPanel({
  item,
  observations,
  onRemoveObs,
  onClearObs,
}: {
  item: PriceItem
  observations: PriceObservation[]
  onRemoveObs: (id: string) => void
  onClearObs: () => void
}) {
  const stats = useMemo(() => statsFor(observations), [observations])
  const points = useMemo(
    () => [...observations].sort((a, b) => b.capturedAt - a.capturedAt),
    [observations],
  )

  async function clearAll() {
    if (await appConfirm(`清空「${item.name}」的 ${observations.length} 条价格记录？`)) onClearObs()
  }

  return (
    <div className="price-trend-detail">
      <div className="price-trend-stats muted small">
        最新 {formatMoney(stats.latest)} · 低 {formatMoney(stats.min)} · 高 {formatMoney(stats.max)}
        {stats.median != null && ` · 中位 ${formatMoney(stats.median)}`}
      </div>

      <TrendChart obs={observations} />

      <div className="price-points">
        <div className="price-points-head">
          <span className="muted small">历史记录 {points.length} 条 · 改价按天累积</span>
          <button className="btn btn-ghost btn-xs danger" onClick={clearAll}>
            <Icon name="trash" size={13} />
            清空
          </button>
        </div>
        <ul className="price-point-list">
          {points.map((p) => (
            <li className="price-point" key={p.id}>
              <span className="price-point-date">{fmtDay(p.capturedAt)}</span>
              <span className="price-point-val">{formatMoney(p.value)}</span>
              {p.priceText && p.priceText !== formatMoney(p.value) && (
                <span className="price-point-raw muted">{p.priceText}</span>
              )}
              <span className="price-point-src">{SOURCE_LABEL[p.source] ?? p.source}</span>
              <button
                className="btn btn-ghost btn-icon-xs danger price-point-del"
                title="删除这条记录"
                onClick={() => onRemoveObs(p.id)}
              >
                <Icon name="x" size={13} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 分组填写：自绘组合框——可从已有分组里点选，也可直接输入新分组名。
// 取代原生 datalist（各浏览器样式不一、下拉会遮挡下方按钮），风格与全站一致。
// ---------------------------------------------------------------------------

function GroupField({
  value,
  onChange,
  groups,
}: {
  value: string
  onChange: (v: string) => void
  groups: string[]
}) {
  const [open, setOpen] = useState(false)
  const [hl, setHl] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  const typed = value.trim()
  const q = typed.toLowerCase()
  const matches = useMemo(
    () => groups.filter((g) => !q || g.toLowerCase().includes(q)),
    [groups, q],
  )
  const canCreate = typed.length > 0 && !groups.some((g) => g === typed)

  // 可高亮的候选项：已有匹配 +（可选）「新建」项
  const optionCount = matches.length + (canCreate ? 1 : 0)

  // 点击外部 / 按 Esc 收起
  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  function pick(g: string) {
    onChange(g)
    setOpen(false)
    setHl(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation()
        setOpen(false)
        setHl(-1)
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (optionCount === 0) return
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setHl((h) => (h + dir + optionCount) % optionCount)
      return
    }
    if (e.key === 'Enter' && open && hl >= 0) {
      e.preventDefault()
      if (hl < matches.length) pick(matches[hl])
      else if (canCreate) pick(typed)
    }
  }

  return (
    <div className="field price-group-field" ref={wrapRef} style={{ flex: '1 1 150px' }}>
      <label>分组</label>
      <div className="price-group-combo">
        <input
          className="input price-group-input-field"
          value={value}
          maxLength={20}
          placeholder="选择或新建，如 兽决"
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setHl(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={`price-group-toggle${open ? ' open' : ''}`}
          aria-label={open ? '收起分组列表' : '展开分组列表'}
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="chevron-down" size={16} />
        </button>

        {open && optionCount > 0 && (
          <ul className="price-group-menu" role="listbox">
            {matches.map((g, i) => (
              <li key={g} role="option" aria-selected={g === typed}>
                <button
                  type="button"
                  className={`price-group-opt${g === typed ? ' active' : ''}${
                    hl === i ? ' hl' : ''
                  }`}
                  onMouseEnter={() => setHl(i)}
                  onClick={() => pick(g)}
                >
                  <span className="price-group-opt-name">{g}</span>
                  {g === typed && <Icon name="check" size={13} />}
                </button>
              </li>
            ))}
            {canCreate && (
              <li role="option">
                <button
                  type="button"
                  className={`price-group-opt price-group-create${
                    hl === matches.length ? ' hl' : ''
                  }`}
                  onMouseEnter={() => setHl(matches.length)}
                  onClick={() => pick(typed)}
                >
                  <Icon name="plus" size={13} />
                  <span className="price-group-opt-name">新建「{typed}」</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 新增物品表单（分组 / 名字 / 价格）
// ---------------------------------------------------------------------------

function AddPriceForm({
  defaultGroup,
  groups,
  onAdd,
  onDone,
}: {
  defaultGroup: string
  groups: string[]
  onAdd: (input: { name: string; category?: string; price?: string }) => string
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState(defaultGroup)
  const [price, setPrice] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, category: group.trim() || '其它', price: finalizePriceInput(price) || undefined })
    setName('')
    setPrice('')
    // 连续录入：保留分组与展开状态，聚焦回名称由 autoFocus 保证
  }

  return (
    <div className="card price-add-card">
      <div className="row row-wrap price-add-row">
        <GroupField value={group} onChange={setGroup} groups={groups} />
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
            maxLength={14}
            inputMode="decimal"
            placeholder="纯数字，如 80.25"
            onChange={(e) => setPrice(sanitizeNumericInput(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </div>
      <div className="price-add-actions">
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={!name.trim()}>
          添加
        </button>
        <button className="btn btn-sm" onClick={onDone}>
          完成
        </button>
        <span className="price-add-hint">回车快速连续添加 · 填了价格会记入趋势</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 编辑物品表单（分组 / 名字 / 价格）
// ---------------------------------------------------------------------------

function EditPriceForm({
  item,
  groups,
  onSave,
  onCancel,
}: {
  item: PriceItem
  groups: string[]
  onSave: (patch: Partial<Omit<PriceItem, 'id' | 'preset'>>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(item.name)
  const [group, setGroup] = useState(item.category || '其它')
  const [price, setPrice] = useState(item.price ?? '')

  function save() {
    if (!name.trim()) return
    onSave({ name: name.trim(), category: group.trim() || '其它', price: finalizePriceInput(price) || undefined })
  }

  return (
    <div className="stack price-edit">
      <div className="row row-wrap price-add-row">
        <GroupField value={group} onChange={setGroup} groups={groups} />
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
            maxLength={14}
            inputMode="decimal"
            placeholder="纯数字，如 80.25"
            onChange={(e) => setPrice(sanitizeNumericInput(e.target.value))}
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

// ---------------------------------------------------------------------------
// 就地改价：点条目价格即在原位变输入框。
//   回车 = 保存并收起 · Esc = 取消 · Tab / Shift+Tab = 保存并跳到下 / 上一条 · 失焦 = 保存
//   只收纯数字（≤2 位小数），与「价格无单位」约定一致。
// ---------------------------------------------------------------------------

function PriceQuickEdit({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (raw: string, move: 1 | -1 | null) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  // 键盘/取消已处理过则失焦时不再二次提交
  const handledRef = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  function done(move: 1 | -1 | null) {
    handledRef.current = true
    onCommit(val, move)
  }

  return (
    <input
      ref={ref}
      className="input price-quick-input"
      value={val}
      inputMode="decimal"
      placeholder="价格"
      aria-label="价格"
      maxLength={14}
      onChange={(e) => setVal(sanitizeNumericInput(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          done(null)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          handledRef.current = true
          onCancel()
        } else if (e.key === 'Tab') {
          e.preventDefault()
          done(e.shiftKey ? -1 : 1)
        }
      }}
      onBlur={() => {
        if (!handledRef.current) onCommit(val, null)
      }}
    />
  )
}
