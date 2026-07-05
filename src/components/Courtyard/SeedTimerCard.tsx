// ============================================================================
// 单株种子卡片
// 按计时方式分两种渲染：
//   · cycle（二/三/四/一级）：真实「生长周期」卡片 —— 当前天数、结果时间轴、
//     今日养护、生命周期进度、下一事件倒计时、到期清除重种。
//   · timer（自定义/旧数据）：单次倒计时卡片（成熟时刻、倒计时、改时长）。
// 倒计时/进度均由父级传入的 now 驱动（来自 useNow），保证秒级刷新。
// ============================================================================

import { useState } from 'react'
import type { SeedTimer, SeedGrowthCycle } from '../../types'
import { useSeeds, useSettings } from '../../store/useAppStore'
import {
  MS_PER_HOUR,
  MS_PER_MINUTE,
  formatClock,
  formatCountdown,
  getDailyPeriodKey,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
} from '../../utils/time'
import {
  computeSeedSchedule,
  isCaredToday,
  seedMode,
  plantDayStart,
} from '../../utils/courtyard'
import { getGrowthCycle, CARE_GUIDE } from '../../data/gameData'
import { levelBadgeClass, levelLabel } from './seedLevel'
import Icon from '../common/Icon'

/** 把 0-1 的比例截断成 0-100 的百分比数值（用于进度条宽度） */
function clamp01Percent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0
  return Math.min(100, Math.max(0, ratio * 100))
}

interface Props {
  seed: SeedTimer
  now: number
}

export default function SeedTimerCard({ seed, now }: Props) {
  const { settings } = useSettings()
  const cycle = getGrowthCycle(seed.level)
  // cycle 模式且有对应等级周期 -> 周期卡；否则单次倒计时卡
  if (seedMode(seed) === 'cycle' && cycle) {
    return (
      <CycleSeedCard
        seed={seed}
        cycle={cycle}
        now={now}
        resetHour={settings.dailyResetHour}
      />
    )
  }
  return <TimerSeedCard seed={seed} now={now} />
}

// ---------------------------------------------------------------------------
// 生长周期卡片（cycle 模式）
// ---------------------------------------------------------------------------

function CycleSeedCard({
  seed,
  cycle,
  now,
  resetHour,
}: {
  seed: SeedTimer
  cycle: SeedGrowthCycle
  now: number
  resetHour: number
}) {
  const { replant, remove, toggleCared, update } = useSeeds()
  const [editing, setEditing] = useState(false)
  const [editPlantedAt, setEditPlantedAt] = useState('')

  const sched = computeSeedSchedule(seed, cycle, resetHour, now)
  const cared = isCaredToday(seed, resetHour, now)
  const dayKey = getDailyPeriodKey(now, resetHour)

  // 生命周期进度（第 1 天起点 -> 清除日起点）
  const lifeStart = plantDayStart(seed.plantedAt, resetHour)
  const lifeTotal = sched.clearAt - lifeStart
  const lifeProgress = clamp01Percent(lifeTotal > 0 ? (now - lifeStart) / lifeTotal : 1)

  const ripe = sched.todayIsHarvest // 今天正是结果日
  const nextLeft = sched.nextEventAt - now

  function openEdit() {
    setEditPlantedAt(toDatetimeLocalValue(seed.plantedAt))
    setEditing(true)
  }
  function saveEdit() {
    if (editPlantedAt) {
      const parsed = fromDatetimeLocalValue(editPlantedAt)
      if (!Number.isNaN(parsed)) update(seed.id, { plantedAt: parsed })
    }
    setEditing(false)
  }

  return (
    <div
      className={
        'card courtyard-seed pop-in' +
        (ripe ? ' is-ripe' : '') +
        (sched.ended ? ' is-ended' : '')
      }
    >
      {/* 头部：名称 + 等级徽标 */}
      <div className="courtyard-seed-head">
        <span className="courtyard-seed-name">{seed.seedName}</span>
        <span className="spacer" />
        <span className={'badge ' + levelBadgeClass(seed.level)}>
          {levelLabel(seed.level)}
        </span>
      </div>

      {/* 当前天数 / 周期 / 已收获 */}
      <div className="courtyard-meta">
        第 {sched.dayIndex} 天 · {sched.clearDay} 天周期
        {sched.totalHarvests > 0 && (
          <> · 已收获 {sched.harvestedCount}/{sched.totalHarvests}</>
        )}
      </div>

      {/* 主状态 */}
      <div
        className={
          'countdown courtyard-countdown' +
          (ripe ? ' ready' : nextLeft < MS_PER_HOUR ? ' urgent' : '')
        }
      >
        {sched.ended
          ? ripe
            ? '可收获 · 待清除'
            : '周期结束 · 可清除重种'
          : ripe
            ? '今日可收获'
            : formatCountdown(nextLeft)}
      </div>
      {!sched.ended && !ripe && (
        <div className="courtyard-meta">
          {sched.nextEventType === 'harvest' ? '距下次结果' : '距清除重种'} ·{' '}
          {formatClock(sched.nextEventAt)}
        </div>
      )}

      {/* 生命周期进度 */}
      <div className={'meter ' + (sched.ended ? 'meter-ok' : 'meter-warn')}>
        <span style={{ width: `${lifeProgress}%` }} />
      </div>

      {/* 结果时间轴 */}
      {cycle.harvestDays.length > 0 && (
        <div className="courtyard-timeline">
          {sched.harvests.map((h) => (
            <span
              key={h.day}
              className={'courtyard-tl-pill ' + h.status}
              title={`第 ${h.day} 天 · ${formatClock(h.at)}`}
            >
              第{h.day}天
            </span>
          ))}
        </div>
      )}

      {/* 今日养护（生命周期结束后不再需要） */}
      {!sched.ended && (
        <button
          type="button"
          className={'courtyard-care' + (cared ? ' done' : '')}
          onClick={() => toggleCared(seed.id, dayKey)}
          title="浇水/施肥/除虫后勾选；跨日自动重置"
        >
          <span className="courtyard-care-check" aria-hidden>
            <Icon name="check" size={11} strokeWidth={3} />
          </span>
          <span>{cared ? '今日已养护' : '今日待养护'}</span>
          <span className="spacer" />
          <span className="small muted">
            {formatCountdown(sched.careDeadline - now, '即将刷新')} 截止
          </span>
        </button>
      )}

      {/* 备注 */}
      {seed.note && <div className="courtyard-note">{seed.note}</div>}

      {/* 操作区 */}
      {!editing ? (
        <div className="row row-wrap">
          <button
            type="button"
            className={'btn btn-sm ' + (sched.ended ? 'btn-primary' : 'btn-ghost')}
            onClick={() => replant(seed.id, now)}
            title="把种植时间重置为现在，重新开始整个生长周期"
          >
            <Icon name="rotate" size={13} />
            {sched.ended ? '清除并重种' : '重新种植'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={openEdit}>
            <Icon name="clock" size={13} />
            改种植时间
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => remove(seed.id)}
            title="删除这株种子"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      ) : (
        <div className="courtyard-edit stack">
          <div className="field">
            <label>种植时间</label>
            <input
              className="input"
              type="datetime-local"
              value={editPlantedAt}
              max={toDatetimeLocalValue(now)}
              onChange={(e) => setEditPlantedAt(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="button" className="btn btn-sm btn-primary" onClick={saveEdit}>
              保存
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 养护要点（默认折叠） */}
      <details className="courtyard-guide">
        <summary className="small muted">养护要点</summary>
        <ul className="courtyard-guide-list small muted">
          {CARE_GUIDE.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 单次倒计时卡片（timer 模式：自定义 / 旧数据）
// ---------------------------------------------------------------------------

function TimerSeedCard({ seed, now }: Props) {
  const { replant, remove, update } = useSeeds()
  const [editing, setEditing] = useState(false)
  // 编辑时长用的临时小时/分钟（仅在打开编辑时初始化）
  const [editHours, setEditHours] = useState(0)
  const [editMinutes, setEditMinutes] = useState(0)

  const matureAt = seed.plantedAt + seed.durationMs
  const remaining = matureAt - now
  const ripe = remaining <= 0
  // 紧迫：剩余不足 1 小时但尚未成熟
  const urgent = !ripe && remaining < MS_PER_HOUR

  // 生长进度（0-100）：已过时间 / 总时长
  const elapsed = now - seed.plantedAt
  const progress = clamp01Percent(elapsed / seed.durationMs)
  // 进度配色：接近成熟（>=80%）用 ok，否则用 warn 提示仍在生长
  const meterClass = ripe || progress >= 80 ? 'meter-ok' : 'meter-warn'

  function openEdit() {
    const totalMinutes = Math.max(0, Math.round(seed.durationMs / MS_PER_MINUTE))
    setEditHours(Math.floor(totalMinutes / 60))
    setEditMinutes(totalMinutes % 60)
    setEditing(true)
  }

  function saveEdit() {
    const durationMs = editHours * MS_PER_HOUR + editMinutes * MS_PER_MINUTE
    if (durationMs > 0) {
      update(seed.id, { durationMs })
    }
    setEditing(false)
  }

  return (
    <div className={'card courtyard-seed pop-in' + (ripe ? ' is-ripe' : '')}>
      {/* 头部：名称 + 等级徽标 */}
      <div className="courtyard-seed-head">
        <span className="courtyard-seed-name">{seed.seedName}</span>
        <span className="spacer" />
        <span className={'badge ' + levelBadgeClass(seed.level)}>
          {levelLabel(seed.level)}
        </span>
      </div>

      {/* 成熟时刻 */}
      <div className="courtyard-meta">成熟时刻：{formatClock(matureAt)}</div>

      {/* 大号倒计时 */}
      <div
        className={
          'countdown courtyard-countdown' +
          (ripe ? ' ready' : urgent ? ' urgent' : '')
        }
      >
        {ripe ? '可收获' : formatCountdown(remaining)}
      </div>

      {/* 生长进度条 */}
      <div className={'meter ' + meterClass}>
        <span style={{ width: `${progress}%` }} />
      </div>

      {/* 备注 */}
      {seed.note && <div className="courtyard-note">{seed.note}</div>}

      {/* 操作区 */}
      {!editing ? (
        <div className="row row-wrap">
          <button
            type="button"
            className={'btn btn-sm ' + (ripe ? 'btn-primary' : 'btn-ghost')}
            onClick={() => replant(seed.id, now)}
            title="把种植时间重置为现在，重新开始生长"
          >
            <Icon name="rotate" size={13} />
            {ripe ? '收获并重种' : '重新种植'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={openEdit}>
            <Icon name="clock" size={13} />
            改时长
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => remove(seed.id)}
            title="删除这株种子"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      ) : (
        <div className="courtyard-edit stack">
          <div className="field">
            <label>生长时长</label>
            <div className="courtyard-duration-row">
              <div className="field">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={240}
                  value={editHours}
                  onChange={(e) => setEditHours(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <span className="small muted">小时</span>
              <div className="field">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={59}
                  value={editMinutes}
                  onChange={(e) =>
                    setEditMinutes(
                      Math.min(59, Math.max(0, Number(e.target.value) || 0)),
                    )
                  }
                />
              </div>
              <span className="small muted">分钟</span>
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn btn-sm btn-primary" onClick={saveEdit}>
              保存
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
