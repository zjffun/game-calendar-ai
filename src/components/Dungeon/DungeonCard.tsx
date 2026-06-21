// ============================================================================
// 单张副本卡片
// - 显示「距下次刷新」倒计时（随 useNow 秒级刷新）
// - 勾选「本周期已完成」（toggle 当前周期 Key），已完成置灰 + 绿色 ✅
// - 「本期需完成」开关（setRequired）
// - 支持内联编辑周期 / 删除
// ============================================================================

import { useState } from 'react'
import type { Dungeon, DungeonCycle } from '../../types'
import { useDungeons, useSettings } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import {
  getNextReset,
  getPeriodKey,
  formatCountdown,
  formatClock,
  MS_PER_HOUR,
} from '../../utils/time'

interface DungeonCardProps {
  dungeon: Dungeon
}

/** 周期对应的中文标签与徽标类 */
function cycleMeta(cycle: DungeonCycle): { label: string; badge: string } {
  switch (cycle) {
    case 'daily':
      return { label: '每日', badge: 'badge-daily' }
    case 'weekly':
      return { label: '每周', badge: 'badge-weekly' }
    case 'every4days':
      return { label: '天命·每4天', badge: 'badge-red' }
  }
}

export default function DungeonCard({ dungeon }: DungeonCardProps) {
  const { settings } = useSettings()
  const { toggle, setRequired, update, remove } = useDungeons()
  const now = useNow()

  // 编辑态：本地暂存名称与周期
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(dungeon.name)
  const [editCycle, setEditCycle] = useState<DungeonCycle>(dungeon.resetCycle)

  const periodKey = getPeriodKey(dungeon.resetCycle, now, settings)
  const done = dungeon.lastCompletedPeriodKey === periodKey

  const nextReset = getNextReset(dungeon.resetCycle, now, settings)
  const remainMs = nextReset - now
  // 不足 1 小时视为「紧迫」，高亮
  const urgent = remainMs > 0 && remainMs <= MS_PER_HOUR

  const meta = cycleMeta(dungeon.resetCycle)

  function saveEdit() {
    const name = editName.trim()
    if (!name) return
    update(dungeon.id, { name, resetCycle: editCycle })
    setEditing(false)
  }

  function cancelEdit() {
    setEditName(dungeon.name)
    setEditCycle(dungeon.resetCycle)
    setEditing(false)
  }

  // ---- 编辑态 ----
  if (editing) {
    return (
      <div className="card dgn-card pop-in">
        <div className="dgn-edit">
          <div className="field">
            <label>副本名称</label>
            <input
              className="input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="副本名称"
            />
          </div>
          <div className="dgn-edit-row">
            <div className="field">
              <label>刷新周期</label>
              <select
                className="select"
                value={editCycle}
                onChange={(e) => setEditCycle(e.target.value as DungeonCycle)}
              >
                <option value="every4days">天命·每4天</option>
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-jade btn-sm" onClick={saveEdit}>
              保存
            </button>
            <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>
              取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- 展示态 ----
  return (
    <div className={`card dgn-card pop-in${done ? ' dgn-done' : ''}`}>
      <div className="dgn-card-top">
        <div className="dgn-name">{dungeon.name}</div>
        <div className="spacer" />
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        {dungeon.required && <span className="badge badge-gold">需完成</span>}
      </div>

      {dungeon.note && <div className="muted small">{dungeon.note}</div>}

      <div className="dgn-timer-row">
        <span className="dgn-timer-label">距下次刷新</span>
        {done ? (
          <span className="dgn-done-mark">✅ 本周期已完成</span>
        ) : (
          <span className={`countdown${urgent ? ' urgent' : ''}`}>
            {formatCountdown(remainMs, '刷新中…')}
          </span>
        )}
      </div>
      <div className="muted small">刷新时刻 {formatClock(nextReset)}</div>

      <div className="divider" />

      <div className="dgn-card-actions">
        <button
          className={`btn btn-sm ${done ? 'btn-ghost' : 'btn-jade'}`}
          onClick={() => toggle(dungeon.id, periodKey)}
        >
          {done ? '撤销完成' : '标记完成'}
        </button>

        <label className="dgn-required" title="是否纳入「本周期还需完成」统计">
          <input
            type="checkbox"
            checked={dungeon.required}
            onChange={(e) => setRequired(dungeon.id, e.target.checked)}
          />
          本期需完成
        </label>

        <div className="spacer" />

        <button
          className="btn btn-ghost btn-icon"
          title="编辑"
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
        <button
          className="btn btn-ghost btn-icon"
          title="删除"
          onClick={() => remove(dungeon.id)}
        >
          🗑
        </button>
      </div>
    </div>
  )
}
