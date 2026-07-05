// ============================================================================
// 房屋清洁度 / 耐久度 模块（参考梦幻西游电脑版「房屋属性」）
// - 清洁度与耐久度随时间衰减；耐久按官方四档显示当前功能效果%。
// - 打扫(只加清洁) / 修理(只加耐久) 为两个独立操作，恢复量随「佣人房等级」变化；
//   另提供「补满」直接拉到 100。
// - 含「房屋资料」与「参数设置」两个可折叠区。所有写操作均走 store actions。
// ============================================================================

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useHouse } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import {
  currentCleanliness,
  currentDurability,
  msUntilCleanWarn,
  msUntilDurabilityWarn,
  houseLevel,
  durabilityEffectPercent,
  clamp,
  type HouseStatusLevel,
} from '../../utils/house'
import { SERVANT_ROOM_TIERS, HOUSE_TIERS, HOUSE_GUIDE } from '../../data/gameData'
import { formatClock, formatRemainingHuman } from '../../utils/time'
import Icon from '../common/Icon'
import './House.css'

/** 把毫秒提示拼成「距离需要清洁/修理还有 X」，处理 Infinity（衰减关闭）情况 */
function describeWarn(ms: number, label: string): string {
  if (ms === Infinity) return '衰减已关闭'
  if (ms <= 0) return `已低于建议值，可${label}`
  return `约 ${formatRemainingHuman(ms)}后需${label}`
}

interface MetricProps {
  /** 指标名称，如「清洁度」 */
  name: string
  /** 当前值 0-100 */
  value: number
  /** 等级（决定配色与是否告警） */
  level: HouseStatusLevel
  /** 距告警的剩余毫秒（可能为 Infinity 或 0） */
  warnMs: number
  /** 告警时的动词，如「打扫」「修理」 */
  warnLabel: string
  /** 头部右侧附加徽标（如耐久效果%） */
  badge?: ReactNode
  /** 一行补充说明（如清洁→环境指数） */
  subNote?: string
  /** 主操作（佣人维护，按档增量）文案与回调 */
  actionLabel: string
  onAction: () => void
  /** 主操作按钮样式类 */
  actionClass: string
  /** 补满到 100 */
  onFill: () => void
}

/** 单条指标：进度条 + 百分比 + 提示 + 操作按钮 */
function HouseMetric({
  name,
  value,
  level,
  warnMs,
  warnLabel,
  badge,
  subNote,
  actionLabel,
  onAction,
  actionClass,
  onFill,
}: MetricProps) {
  const pct = Math.round(value)
  const meterClass =
    level === 'danger' ? 'meter-danger' : level === 'warn' ? 'meter-warn' : 'meter-ok'

  return (
    <div className="hc-metric">
      <div className="hc-metric-head">
        <span className="hc-metric-name">{name}</span>
        {badge}
        <span className="spacer" />
        <span className={`hc-percent hc-${level}`}>{pct}%</span>
      </div>

      <div className={`meter ${meterClass}`}>
        <span style={{ width: `${pct}%` }} />
      </div>

      {subNote && <div className="hc-subnote">{subNote}</div>}

      <div className="hc-metric-foot">
        <span className="hc-hint">{describeWarn(warnMs, warnLabel)}</span>
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={onFill}>
          补满
        </button>
        <button type="button" className={`btn btn-sm ${actionClass}`} onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

/** 耐久效果徽标：按官方四档显示 100%/80%/60%/40% */
function durabilityEffectBadge(value: number): ReactNode {
  const pct = durabilityEffectPercent(value)
  const cls = pct >= 100 ? 'badge-ok' : pct >= 60 ? 'badge-warn' : 'badge-danger'
  return <span className={`badge ${cls}`}>{pct >= 100 ? '满效果' : `效果 ${pct}%`}</span>
}

export default function HouseCleaning() {
  const { house, update, clean, repair, fillClean, fillRepair } = useHouse()
  const now = useNow()
  const [showGuide, setShowGuide] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // 实时清洁度 / 耐久度（随 now 刷新衰减）
  const cleanliness = currentCleanliness(house, now)
  const durability = currentDurability(house, now)
  const cleanLevel = houseLevel(cleanliness, house.cleanlinessWarnThreshold)
  const durLevel = houseLevel(durability, house.durabilityWarnThreshold)

  // 当前佣人房档（越界回退到「无佣人房」）
  const tier = SERVANT_ROOM_TIERS[house.servantRoomLevel] ?? SERVANT_ROOM_TIERS[0]

  // 数字输入统一处理：空值 / 非法值不写入，避免污染 store。
  const handleNumber = (key: keyof typeof house) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value)
    if (e.target.value === '' || Number.isNaN(raw)) return
    const v = key.endsWith('WarnThreshold') ? clamp(raw, 0, 100) : Math.max(0, raw)
    update({ [key]: v })
  }

  return (
    <section className="stack">
      <h2 className="section-title">
        房屋状态
        <span className="spacer" />
        <span className="muted small">上次更新 {formatClock(house.updatedAt)}</span>
      </h2>

      <div className="card pad-lg">

      <div className="hc-top">
        <span className="badge badge-outline">{house.name || '我的房屋'}</span>
        <span className="spacer" />
        <span className="small muted">佣人房</span>
        <div className="row row-wrap hc-servant">
          {SERVANT_ROOM_TIERS.map((t, i) => (
            <button
              key={t.name}
              type="button"
              className={'chip' + (house.servantRoomLevel === i ? ' active' : '')}
              onClick={() => update({ servantRoomLevel: i })}
              title={`打扫 +${t.cleanGain} 清洁 · 修理 +${t.durabilityGain} 耐久`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="hc-metrics">
        <HouseMetric
          name="清洁度"
          value={cleanliness}
          level={cleanLevel}
          warnMs={msUntilCleanWarn(house, now)}
          warnLabel="打扫"
          subNote="清洁 100 时环境指数最高，卧室每日休息次数最多"
          actionLabel={`佣人打扫 +${tier.cleanGain}`}
          actionClass="btn-jade"
          onAction={() => clean(now)}
          onFill={() => fillClean(now)}
        />
        <HouseMetric
          name="耐久度"
          value={durability}
          level={durLevel}
          warnMs={msUntilDurabilityWarn(house, now)}
          warnLabel="修理"
          badge={durabilityEffectBadge(durability)}
          subNote="耐久 ≥80 满效果；60-79→80%，30-59→60%，<30→40%"
          actionLabel={`佣人修理 +${tier.durabilityGain}`}
          actionClass="btn-gold"
          onAction={() => repair(now)}
          onFill={() => fillRepair(now)}
        />
      </div>

      <div className="divider" />

      {/* 房屋资料（参考） */}
      <button
        type="button"
        className={`hc-settings-toggle${showGuide ? ' hc-open' : ''}`}
        onClick={() => setShowGuide((s) => !s)}
      >
        <Icon name="chevron-right" size={14} className="hc-caret" />
        房屋资料（参考梦幻西游电脑版）
      </button>
      {showGuide && (
        <div className="hc-guide pop-in">
          <ul className="hc-guide-list small muted">
            {HOUSE_GUIDE.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <div className="hc-tiers small">
            <span className="muted">房屋档次（空间格数）：</span>
            {HOUSE_TIERS.map((t) => (
              <span key={t.name} className="badge badge-outline">
                {t.name} {t.spaceMin}-{t.spaceMax}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`hc-settings-toggle${showSettings ? ' hc-open' : ''}`}
        onClick={() => setShowSettings((s) => !s)}
      >
        <Icon name="chevron-right" size={14} className="hc-caret" />
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
            <label htmlFor="hc-clean-decay">清洁度每日衰减</label>
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
            <label htmlFor="hc-dur-decay">耐久度每日衰减</label>
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
            <label htmlFor="hc-clean-warn">清洁度建议下限</label>
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
            <label htmlFor="hc-dur-warn">耐久度建议下限</label>
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
    </section>
  )
}
