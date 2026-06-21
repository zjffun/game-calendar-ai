import type { KeyboardEvent, ReactNode } from 'react'
import type { TabId } from '../../tabs'
import { useTodos, useSeeds, useDungeons, useHouse, useSettings } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import {
  getPeriodKey,
  getNextReset,
  formatCountdown,
  formatRemainingHuman,
  WEEKDAY_LABELS,
} from '../../utils/time'
import {
  currentCleanliness,
  currentDurability,
  houseLevel,
  msUntilCleanWarn,
  msUntilDurabilityWarn,
  type HouseStatusLevel,
} from '../../utils/house'
import './Overview.css'

interface Props {
  onNavigate: (tab: TabId) => void
}

/** 把房屋状态等级映射到 meter 的配色类 */
const METER_CLASS: Record<HouseStatusLevel, string> = {
  ok: 'meter-ok',
  warn: 'meter-warn',
  danger: 'meter-danger',
}

/** 可点击的概览卡片外壳：支持鼠标点击与键盘（回车/空格）跳转 */
function OverviewCard(props: {
  glyph: string
  title: string
  onNavigate: () => void
  children: ReactNode
}) {
  const { glyph, title, onNavigate, children } = props
  // 键盘可达性：回车或空格触发跳转
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onNavigate()
    }
  }
  return (
    <div
      className="card ov-card pop-in"
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={onKeyDown}
    >
      <div className="ov-card-head">
        <span className="ov-card-glyph" aria-hidden>
          {glyph}
        </span>
        <span className="ov-card-title">{title}</span>
        <span className="ov-card-arrow" aria-hidden>
          ›
        </span>
      </div>
      {children}
    </div>
  )
}

export default function OverviewDashboard({ onNavigate }: Props) {
  const now = useNow(1000)
  const { todos } = useTodos()
  const { seeds } = useSeeds()
  const { dungeons } = useDungeons()
  const { house } = useHouse()
  const { settings } = useSettings()

  // —— 顶部概要：今日日期 / 星期 / 距每日刷新 ——
  const today = new Date(now)
  const weekday = WEEKDAY_LABELS[today.getDay() === 0 ? 7 : today.getDay()]
  const dateLabel = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日`
  const hour = today.getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早安' : hour < 14 ? '午安' : hour < 19 ? '午后好' : '晚上好'
  const dailyResetLeft = getNextReset('daily', now, settings) - now

  // —— 待办统计 ——
  const dailyKey = getPeriodKey('daily', now, settings)
  const weeklyKey = getPeriodKey('weekly', now, settings)
  const monthlyKey = getPeriodKey('monthly', now, settings)
  const dailyTodos = todos.filter((t) => t.cycle === 'daily')
  const dailyDone = dailyTodos.filter((t) => t.lastCompletedPeriodKey === dailyKey).length
  const weeklyUndone = todos.filter(
    (t) => t.cycle === 'weekly' && t.lastCompletedPeriodKey !== weeklyKey,
  ).length
  const monthlyUndone = todos.filter(
    (t) => t.cycle === 'monthly' && t.lastCompletedPeriodKey !== monthlyKey,
  ).length

  // —— 庭院统计：成熟数 + 最近一株未成熟的倒计时 ——
  const matureCount = seeds.filter((s) => s.plantedAt + s.durationMs <= now).length
  const growing = seeds
    .map((s) => s.plantedAt + s.durationMs - now)
    .filter((left) => left > 0)
    .sort((a, b) => a - b)
  const nextSeedLeft = growing.length > 0 ? growing[0] : null

  // —— 副本统计：本期 required 且未完成的数量（按各自周期判断）+ 最近刷新 ——
  const requiredUndone = dungeons.filter((d) => {
    if (!d.required) return false
    const key = getPeriodKey(d.resetCycle, now, settings)
    return d.lastCompletedPeriodKey !== key
  })
  // 未完成副本里，按各自周期取最近一次刷新作为提醒
  const undoneNextResets = requiredUndone.map((d) => getNextReset(d.resetCycle, now, settings) - now)
  const dungeonNextLeft =
    undoneNextResets.length > 0
      ? Math.min(...undoneNextResets)
      : getNextReset('daily', now, settings) - now

  // —— 房屋：当前洁净度 / 耐久 ——
  const cleanliness = currentCleanliness(house, now)
  const durability = currentDurability(house, now)
  const cleanLevel = houseLevel(cleanliness, house.cleanlinessWarnThreshold)
  const duraLevel = houseLevel(durability, house.durabilityWarnThreshold)
  const houseHasWarn = cleanLevel !== 'ok' || duraLevel !== 'ok'
  // 取两项里最快需要打理的那一项作为「下次提醒」（可能为 Infinity）
  const nextHouseWarnLeft = Math.min(
    msUntilCleanWarn(house, now),
    msUntilDurabilityWarn(house, now),
  )

  return (
    <div className="stack pop-in">
      {/* 顶部问候 / 今日概要 */}
      <section className="card pad-lg ov-hero">
        <span className="ov-hero-seal" aria-hidden>
          签
        </span>
        <div className="ov-hero-main">
          <span className="ov-hero-title">{greeting}，少侠</span>
          <span className="muted small">
            {dateLabel} · {weekday}
          </span>
        </div>
        <div className="ov-hero-reset">
          <span className="muted small">距每日刷新</span>
          <span className={`countdown ${dailyResetLeft <= 60 * 60 * 1000 ? 'urgent' : ''}`}>
            {formatCountdown(dailyResetLeft, '即将刷新')}
          </span>
        </div>
      </section>

      <div className="grid ov-grid">
        {/* 待办卡片 */}
        <OverviewCard glyph="📜" title="今日待办" onNavigate={() => onNavigate('todo')}>
          {dailyTodos.length === 0 ? (
            <div className="ov-line">
              <span className="muted small">还没有每日待办，去添加吧 ›</span>
            </div>
          ) : (
            <>
              <div className="ov-stat">
                <span
                  className={`ov-stat-num ${dailyDone === dailyTodos.length ? 'is-jade' : 'is-red'}`}
                >
                  {dailyDone}
                </span>
                <span className="ov-stat-unit">/ {dailyTodos.length} 已完成</span>
                {dailyDone === dailyTodos.length && (
                  <span className="badge badge-ok">今日已清</span>
                )}
              </div>
              <div className="meter meter-ok" aria-hidden>
                <span
                  style={{
                    width: `${
                      dailyTodos.length > 0 ? (dailyDone / dailyTodos.length) * 100 : 0
                    }%`,
                  }}
                />
              </div>
            </>
          )}
          <div className="ov-line row-wrap">
            <span className="badge badge-weekly">周 {weeklyUndone} 未完成</span>
            <span className="badge badge-monthly">月 {monthlyUndone} 未完成</span>
          </div>
        </OverviewCard>

        {/* 庭院卡片 */}
        <OverviewCard glyph="🌱" title="庭院种子" onNavigate={() => onNavigate('courtyard')}>
          {seeds.length === 0 ? (
            <div className="ov-line">
              <span className="muted small">还没有种植，去庭院播下种子吧 ›</span>
            </div>
          ) : (
            <>
              <div className="ov-stat">
                <span className={`ov-stat-num ${matureCount > 0 ? 'is-gold' : ''}`}>
                  {matureCount}
                </span>
                <span className="ov-stat-unit">株可收获</span>
                {matureCount > 0 && <span className="badge badge-gold">待收获</span>}
              </div>
              <div className="ov-next">
                {nextSeedLeft != null ? (
                  <>
                    <span className="muted small">最近成熟</span>
                    <span
                      className={`countdown ${
                        nextSeedLeft <= 30 * 60 * 1000 ? 'urgent' : ''
                      }`}
                    >
                      {formatCountdown(nextSeedLeft, '已成熟')}
                    </span>
                  </>
                ) : (
                  <span className="badge badge-ok">全部已成熟</span>
                )}
              </div>
            </>
          )}
        </OverviewCard>

        {/* 副本卡片 */}
        <OverviewCard glyph="⚔️" title="副本进度" onNavigate={() => onNavigate('dungeon')}>
          {dungeons.length === 0 ? (
            <div className="ov-line">
              <span className="muted small">还没有副本，去添加追踪吧 ›</span>
            </div>
          ) : (
            <>
              <div className="ov-stat">
                <span
                  className={`ov-stat-num ${requiredUndone.length > 0 ? 'is-red' : 'is-jade'}`}
                >
                  {requiredUndone.length}
                </span>
                <span className="ov-stat-unit">个待打（必做）</span>
                {requiredUndone.length === 0 && (
                  <span className="badge badge-ok">已全部完成</span>
                )}
              </div>
              <div className="ov-next">
                <span className="muted small">
                  {requiredUndone.length > 0 ? '最近刷新' : '下次每日刷新'}
                </span>
                <span
                  className={`countdown ${dungeonNextLeft <= 60 * 60 * 1000 ? 'urgent' : ''}`}
                >
                  {formatCountdown(dungeonNextLeft, '即将刷新')}
                </span>
              </div>
            </>
          )}
        </OverviewCard>

        {/* 房屋卡片 */}
        <OverviewCard glyph="🏠" title="房屋状态" onNavigate={() => onNavigate('house')}>
          <div className="ov-meters">
            <div className="ov-meter-row">
              <div className="ov-meter-top">
                <span>洁净度</span>
                <span className={`ov-meter-val ${cleanLevel === 'danger' ? 'muted' : ''}`}>
                  {Math.round(cleanliness)}
                </span>
              </div>
              <div className={`meter ${METER_CLASS[cleanLevel]}`} aria-hidden>
                <span style={{ width: `${cleanliness}%` }} />
              </div>
            </div>
            <div className="ov-meter-row">
              <div className="ov-meter-top">
                <span>耐久度</span>
                <span className="ov-meter-val">{Math.round(durability)}</span>
              </div>
              <div className={`meter ${METER_CLASS[duraLevel]}`} aria-hidden>
                <span style={{ width: `${durability}%` }} />
              </div>
            </div>
          </div>
          <div className="ov-line row-wrap">
            {houseHasWarn ? (
              <>
                {cleanLevel !== 'ok' && (
                  <span className={`badge badge-${cleanLevel === 'danger' ? 'danger' : 'warn'}`}>
                    {cleanLevel === 'danger' ? '需清洁' : '洁净偏低'}
                  </span>
                )}
                {duraLevel !== 'ok' && (
                  <span className={`badge badge-${duraLevel === 'danger' ? 'danger' : 'warn'}`}>
                    {duraLevel === 'danger' ? '需修理' : '耐久偏低'}
                  </span>
                )}
              </>
            ) : (
              <span className="badge badge-ok">状态良好</span>
            )}
            {!houseHasWarn && Number.isFinite(nextHouseWarnLeft) && (
              <span className="muted small">
                约 {formatRemainingHuman(nextHouseWarnLeft)} 后需打理
              </span>
            )}
          </div>
        </OverviewCard>
      </div>
    </div>
  )
}
