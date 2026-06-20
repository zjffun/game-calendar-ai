// ============================================================================
// 房屋清洁 / 耐久 提示模块
// 显示当前洁净度与耐久（随时间衰减）、距阈值剩余时间、一键清洁/修理，
// 以及可折叠的「参数设置」区。所有写操作均走 store actions。
// ============================================================================

import { useState } from 'react'
import { useHouse } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import {
  currentCleanliness,
  currentDurability,
  msUntilCleanWarn,
  msUntilDurabilityWarn,
  houseLevel,
  clamp,
  type HouseStatusLevel,
} from '../../utils/house'
import { formatClock, formatRemainingHuman } from '../../utils/time'
import './House.css'

/** 把毫秒提示拼成「距离需要清洁/修理还有 X」，处理 Infinity（衰减关闭）情况 */
function describeWarn(ms: number, label: string): string {
  if (ms === Infinity) return '衰减已关闭'
  return `距离需要${label}还有 ${formatRemainingHuman(ms)}`
}

interface MetricProps {
  /** 指标名称，如「洁净度」 */
  name: string
  /** 当前值 0-100 */
  value: number
  /** 等级（决定配色与是否告警） */
  level: HouseStatusLevel
  /** 距告警的剩余毫秒（可能为 Infinity 或 0） */
  warnMs: number
  /** 告警时的动词，如「清洁」「修理」 */
  warnLabel: string
  /** 操作按钮文案 */
  actionLabel: string
  /** 按钮样式类（鎏金 / 碧玉） */
  actionClass: string
  /** 点击按钮（立即清洁 / 立即修理） */
  onAction: () => void
}

/** 单条指标：进度条 + 百分比 + 提示 + 操作按钮 */
function HouseMetric({
  name,
  value,
  level,
  warnMs,
  warnLabel,
  actionLabel,
  actionClass,
  onAction,
}: MetricProps) {
  const pct = Math.round(value)
  const meterClass =
    level === 'danger' ? 'meter-danger' : level === 'warn' ? 'meter-warn' : 'meter-ok'

  return (
    <div className="hc-metric">
      <div className="hc-metric-head">
        <span className="hc-metric-name">{name}</span>
        {level === 'danger' && (
          <span className="badge badge-danger">需要{warnLabel}</span>
        )}
        <span className="spacer" />
        <span className={`hc-percent hc-${level}`}>{pct}%</span>
      </div>

      <div className={`meter ${meterClass}`}>
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="hc-metric-foot">
        <span className="hc-hint">
          {level === 'danger' ? `已低于阈值，建议立即${warnLabel}` : describeWarn(warnMs, warnLabel)}
        </span>
        <span className="spacer" />
        <button type="button" className={`btn btn-sm ${actionClass}`} onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

export default function HouseCleaning() {
  const { house, update, clean, repair } = useHouse()
  const now = useNow()
  const [showSettings, setShowSettings] = useState(false)

  // 实时洁净度 / 耐久（随 now 刷新衰减）
  const cleanliness = currentCleanliness(house, now)
  const durability = currentDurability(house, now)
  const cleanLevel = houseLevel(cleanliness, house.cleanlinessWarnThreshold)
  const durLevel = houseLevel(durability, house.durabilityWarnThreshold)

  // 数字输入统一处理：空值 / 非法值不写入，避免污染 store。
  // 阈值类约束在 [0,100]，衰减类不小于 0，防止用户输入越界值。
  const handleNumber = (key: keyof typeof house) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value)
    if (e.target.value === '' || Number.isNaN(raw)) return
    const v = key.endsWith('WarnThreshold') ? clamp(raw, 0, 100) : Math.max(0, raw)
    update({ [key]: v })
  }

  return (
    <div className="card pad-lg pop-in">
      <div className="card-head">
        <span className="section-title" style={{ margin: 0 }}>
          <span className="glyph">🏯</span>
          房屋清洁 · 耐久
        </span>
        <span className="spacer" />
        <span className="muted small">上次更新 {formatClock(house.updatedAt)}</span>
      </div>

      <div className="hc-top">
        <span className="badge badge-outline">{house.name || '我的房屋'}</span>
      </div>

      <div className="hc-metrics">
        <HouseMetric
          name="洁净度"
          value={cleanliness}
          level={cleanLevel}
          warnMs={msUntilCleanWarn(house, now)}
          warnLabel="清洁"
          actionLabel="立即清洁"
          actionClass="btn-jade"
          onAction={() => clean(now)}
        />
        <HouseMetric
          name="耐久度"
          value={durability}
          level={durLevel}
          warnMs={msUntilDurabilityWarn(house, now)}
          warnLabel="修理"
          actionLabel="立即修理"
          actionClass="btn-gold"
          onAction={() => repair(now)}
        />
      </div>

      <div className="divider" />

      <button
        type="button"
        className={`hc-settings-toggle${showSettings ? ' hc-open' : ''}`}
        onClick={() => setShowSettings((s) => !s)}
      >
        <span className="hc-caret">▶</span>
        参数设置
      </button>

      {showSettings && (
        <div className="hc-settings-grid pop-in">
          <div className="field">
            <label htmlFor="hc-name">房屋名称</label>
            <input
              id="hc-name"
              className="input"
              type="text"
              value={house.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="我的房屋"
            />
          </div>

          <div className="field">
            <label htmlFor="hc-clean-decay">洁净度每日衰减</label>
            <input
              id="hc-clean-decay"
              className="input"
              type="number"
              min={0}
              step={1}
              value={house.cleanlinessDecayPerDay}
              onChange={handleNumber('cleanlinessDecayPerDay')}
            />
          </div>

          <div className="field">
            <label htmlFor="hc-dur-decay">耐久每日衰减</label>
            <input
              id="hc-dur-decay"
              className="input"
              type="number"
              min={0}
              step={1}
              value={house.durabilityDecayPerDay}
              onChange={handleNumber('durabilityDecayPerDay')}
            />
          </div>

          <div className="field">
            <label htmlFor="hc-clean-warn">洁净度提示阈值</label>
            <input
              id="hc-clean-warn"
              className="input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={house.cleanlinessWarnThreshold}
              onChange={handleNumber('cleanlinessWarnThreshold')}
            />
          </div>

          <div className="field">
            <label htmlFor="hc-dur-warn">耐久提示阈值</label>
            <input
              id="hc-dur-warn"
              className="input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={house.durabilityWarnThreshold}
              onChange={handleNumber('durabilityWarnThreshold')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
