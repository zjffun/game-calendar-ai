// ============================================================================
// 单株种子倒计时卡片
// - 显示名称 + 等级徽标、成熟时刻、大号倒计时、生长进度条。
// - 操作：重新种植（收获后再种）、编辑生长时长、删除。
// 倒计时/进度均由父级传入的 now 驱动（来自 useNow），保证秒级刷新。
// ============================================================================

import { useState } from 'react'
import type { SeedTimer } from '../../types'
import { useSeeds } from '../../store/useAppStore'
import {
  MS_PER_HOUR,
  MS_PER_MINUTE,
  formatClock,
  formatCountdown,
} from '../../utils/time'

/** 把 0-1 的比例截断成 0-100 的百分比数值（用于进度条宽度） */
function clamp01Percent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0
  return Math.min(100, Math.max(0, ratio * 100))
}

/** 等级 -> 徽标类名（1=碧/jade，2=金/gold，3=红/red，其它=描边） */
function levelBadgeClass(level: number): string {
  if (level >= 3) return 'badge-red'
  if (level === 2) return 'badge-gold'
  if (level === 1) return 'badge-ok'
  return 'badge-outline'
}

function levelLabel(level: number): string {
  return level > 0 ? `${level} 级` : '未分级'
}

interface Props {
  seed: SeedTimer
  now: number
}

export default function SeedTimerCard({ seed, now }: Props) {
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
        {ripe ? '✅ 可收获' : formatCountdown(remaining)}
      </div>

      {/* 生长进度条 */}
      <div className={'meter ' + meterClass}>
        <span style={{ width: `${progress}%` }} />
      </div>

      {/* 备注 */}
      {seed.note && <div className="courtyard-note">📝 {seed.note}</div>}

      {/* 操作区 */}
      {!editing ? (
        <div className="row row-wrap">
          <button
            type="button"
            className={'btn btn-sm ' + (ripe ? 'btn-jade' : 'btn-ghost')}
            onClick={() => replant(seed.id, now)}
            title="把种植时间重置为现在，重新开始生长"
          >
            {ripe ? '🌱 收获并重种' : '↻ 重新种植'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={openEdit}>
            ⏱ 改时长
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => remove(seed.id)}
            title="删除这株种子"
          >
            🗑 删除
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
            <button type="button" className="btn btn-sm btn-gold" onClick={saveEdit}>
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
