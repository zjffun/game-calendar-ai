// ============================================================================
// 副本刷新与完成追踪 模块（入口）
// 需求：
//  - 每个副本按 resetCycle(daily/weekly) 显示「距下次刷新」倒计时
//  - 标记「本周期已完成」（toggle 当前周期 Key），刷新后自动回到未完成
//  - 「本期需完成」开关 + 顶部汇总（daily / weekly 分别统计 required 且未完成的数量）
//  - 预设副本一键添加（chip，已添加同名显示 active）
//  - 自定义添加（名称 + 周期 + 是否 required）
//  - 周期分组 / 筛选（全部 / 每日 / 每周 / 仅需完成 / 未完成）展示
// ============================================================================

import { useMemo, useState } from 'react'
import type { Dungeon, DungeonCycle } from '../../types'
import { useDungeons, useSettings } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import { getPeriodKey } from '../../utils/time'
import { DUNGEON_PRESETS } from '../../data/gameData'
import DungeonCard from './DungeonCard'
import Icon from '../common/Icon'
import './Dungeon.css'

/** 筛选模式 */
type FilterMode = 'all' | 'tianming' | 'daily' | 'weekly' | 'required' | 'undone'

const FILTERS: { value: FilterMode; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'tianming', label: '天命' },
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'required', label: '仅需完成' },
  { value: 'undone', label: '未完成' },
]

/** 单一周期筛选（此时分组无意义，退回平铺展示） */
const SINGLE_CYCLE_FILTERS: FilterMode[] = ['tianming', 'daily', 'weekly']

export default function DungeonTracker() {
  const { dungeons, add } = useDungeons()
  const { settings } = useSettings()
  const now = useNow()

  // 视图状态
  const [filter, setFilter] = useState<FilterMode>('all')
  const [grouped, setGrouped] = useState(true)

  // 自定义添加表单
  const [name, setName] = useState('')
  const [cycle, setCycle] = useState<DungeonCycle>('every4days')
  const [required, setRequired] = useState(true)

  // 已存在的副本名集合（用于预设 chip 的 active 判断）
  const existingNames = useMemo(
    () => new Set(dungeons.map((d) => d.name)),
    [dungeons],
  )

  // 判断某副本本周期是否已完成
  function isDone(d: Dungeon): boolean {
    return d.lastCompletedPeriodKey === getPeriodKey(d.resetCycle, now, settings)
  }

  // 顶部汇总：required 且未完成的数量，按周期分别统计
  const summary = useMemo(() => {
    let tianming = 0
    let daily = 0
    let weekly = 0
    for (const d of dungeons) {
      if (!d.required) continue
      if (isDone(d)) continue
      if (d.resetCycle === 'every4days') tianming += 1
      else if (d.resetCycle === 'daily') daily += 1
      else weekly += 1
    }
    return { tianming, daily, weekly }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeons, now, settings])

  // 排序：先按 order，再按创建顺序兜底
  const sorted = useMemo(
    () => [...dungeons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [dungeons],
  )

  // 应用筛选
  const visible = useMemo(() => {
    return sorted.filter((d) => {
      switch (filter) {
        case 'tianming':
          return d.resetCycle === 'every4days'
        case 'daily':
          return d.resetCycle === 'daily'
        case 'weekly':
          return d.resetCycle === 'weekly'
        case 'required':
          return d.required
        case 'undone':
          return !isDone(d)
        default:
          return true
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, filter, now, settings])

  // 添加预设副本（已存在同名则忽略）
  function addPreset(preset: (typeof DUNGEON_PRESETS)[number]) {
    if (existingNames.has(preset.name)) return
    add({
      name: preset.name,
      resetCycle: preset.resetCycle,
      required: true,
      note: preset.note,
      preset: true,
    })
  }

  // 添加自定义副本
  function submitCustom() {
    const trimmed = name.trim()
    if (!trimmed) return
    add({ name: trimmed, resetCycle: cycle, required })
    setName('')
    setRequired(true)
  }

  // 渲染卡片列表（带空态）
  function renderCards(list: Dungeon[]) {
    if (list.length === 0) {
      return <div className="empty">暂无符合条件的副本</div>
    }
    return (
      <div className="dgn-grid">
        {list.map((d) => (
          <DungeonCard key={d.id} dungeon={d} />
        ))}
      </div>
    )
  }

  // 分组视图：天命（每4天）/ 每日 / 每周
  const tianmingList = visible.filter((d) => d.resetCycle === 'every4days')
  const dailyList = visible.filter((d) => d.resetCycle === 'daily')
  const weeklyList = visible.filter((d) => d.resetCycle === 'weekly')

  return (
    <section className="stack">
      <h2 className="section-title">副本进度</h2>

      {/* 顶部汇总 */}
      <div className="card pad-lg">
        <div className="dgn-summary">
          <span className="dgn-summary-item">
            本周期还需完成
          </span>
          <span className="dgn-summary-item">
            天命
            <span
              className={`dgn-summary-num${summary.tianming === 0 ? ' dgn-clear' : ''}`}
            >
              {summary.tianming}
            </span>
            个
          </span>
          <span className="dgn-summary-item">
            每日
            <span
              className={`dgn-summary-num${summary.daily === 0 ? ' dgn-clear' : ''}`}
            >
              {summary.daily}
            </span>
            个
          </span>
          <span className="dgn-summary-item">
            每周
            <span
              className={`dgn-summary-num${summary.weekly === 0 ? ' dgn-clear' : ''}`}
            >
              {summary.weekly}
            </span>
            个
          </span>
          {summary.tianming === 0 &&
            summary.daily === 0 &&
            summary.weekly === 0 &&
            dungeons.length > 0 && (
              <span className="badge badge-ok">
                <Icon name="check" size={11} strokeWidth={2.5} />
                本周期目标已全部完成
              </span>
            )}
        </div>
      </div>

      {/* 预设一键添加 */}
      <div className="card">
        <div className="card-head">
          <h3>常用副本</h3>
          <div className="spacer" />
          <span className="muted small">点击添加，已添加显示高亮</span>
        </div>
        <div className="dgn-presets">
          {DUNGEON_PRESETS.map((p) => {
            const added = existingNames.has(p.name)
            return (
              <button
                key={p.name}
                type="button"
                className={`chip${added ? ' active' : ''}`}
                onClick={() => addPreset(p)}
                disabled={added}
                title={added ? '已添加' : '点击添加'}
              >
                {p.name}
                <span className="small">
                  {p.resetCycle === 'daily' ? '日' : p.resetCycle === 'weekly' ? '周' : '4天'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 自定义添加 */}
      <div className="card">
        <div className="card-head">
          <h3>自定义添加</h3>
        </div>
        <div className="dgn-add-form">
          <div className="field">
            <label>副本名称</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCustom()
              }}
              placeholder="例如 镇妖塔"
            />
          </div>
          <div className="field">
            <label>刷新周期</label>
            <select
              className="select"
              value={cycle}
              onChange={(e) => setCycle(e.target.value as DungeonCycle)}
            >
              <option value="every4days">天命·每4天</option>
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
            </select>
          </div>
          <label className="dgn-required">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            本期需完成
          </label>
          <button
            className="btn btn-primary"
            onClick={submitCustom}
            disabled={!name.trim()}
          >
            添加副本
          </button>
        </div>
      </div>

      {/* 筛选与分组开关 */}
      <div className="card">
        <div className="row row-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`chip${filter === f.value ? ' active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          <div className="spacer" />
          <button
            type="button"
            className={`btn btn-sm ${grouped ? 'btn-tonal' : 'btn-ghost'}`}
            onClick={() => setGrouped((g) => !g)}
            title="按周期分组展示"
          >
            {grouped && <Icon name="check" size={12} strokeWidth={2.25} />}
            周期分组
          </button>
        </div>
      </div>

      {/* 列表区 */}
      {dungeons.length === 0 ? (
        <div className="empty">
          还没有副本，先从上方「常用副本」或「自定义添加」开始吧～
        </div>
      ) : grouped && !SINGLE_CYCLE_FILTERS.includes(filter) ? (
        // 分组视图（当筛选已限定单一周期时，分组无意义，退回平铺）
        <div className="stack">
          {tianmingList.length > 0 && (
            <div>
              <div className="dgn-group-title">
                <span className="badge badge-red">天命 · 每4天</span>
                <span className="muted small">{tianmingList.length} 个</span>
              </div>
              {renderCards(tianmingList)}
            </div>
          )}
          {dailyList.length > 0 && (
            <div>
              <div className="dgn-group-title">
                <span className="badge badge-daily">每日</span>
                <span className="muted small">{dailyList.length} 个</span>
              </div>
              {renderCards(dailyList)}
            </div>
          )}
          {weeklyList.length > 0 && (
            <div>
              <div className="dgn-group-title">
                <span className="badge badge-weekly">每周</span>
                <span className="muted small">{weeklyList.length} 个</span>
              </div>
              {renderCards(weeklyList)}
            </div>
          )}
          {visible.length === 0 && <div className="empty">暂无符合条件的副本</div>}
        </div>
      ) : (
        renderCards(visible)
      )}
    </section>
  )
}
