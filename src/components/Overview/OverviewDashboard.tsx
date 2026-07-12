import type { KeyboardEvent, ReactNode } from 'react'
import type { TabId } from '../../tabs'
import {
  useTodos,
  useSeeds,
  useDungeons,
  useHouse,
  useSettings,
  useCharacters,
  useGuides,
} from '../../store/useAppStore'
import { GUIDE_PRESETS } from '../../data/guides'
import { useNow } from '../../hooks/useNow'
import {
  getPeriodKey,
  getNextReset,
  formatCountdown,
  formatRemainingHuman,
  WEEKDAY_LABELS,
} from '../../utils/time'
import { effectiveCharacterIds, isTaskAllDone } from '../../utils/todo'
import { getGrowthCycle } from '../../data/gameData'
import { computeSeedSchedule, isCaredToday, seedMode } from '../../utils/courtyard'
import {
  currentCleanliness,
  currentDurability,
  houseLevel,
  msUntilCleanWarn,
  msUntilDurabilityWarn,
  type HouseStatusLevel,
} from '../../utils/house'
import Icon, { type IconName } from '../common/Icon'
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
  icon: IconName
  title: string
  onNavigate: () => void
  children: ReactNode
}) {
  const { icon, title, onNavigate, children } = props
  // 键盘可达性：回车或空格触发跳转
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onNavigate()
    }
  }
  return (
    <div
      className="card ov-card"
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={onKeyDown}
    >
      <div className="ov-card-head">
        <Icon name={icon} size={16} className="ov-card-icon" />
        <span className="ov-card-title">{title}</span>
        <Icon name="chevron-right" size={15} className="ov-card-arrow" />
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
  const { characters } = useCharacters()
  const { guides: customGuides } = useGuides()
  const charIds = effectiveCharacterIds(characters)

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
  // 一条任务「全部角色完成」才算完成
  const dailyDone = dailyTodos.filter((t) => isTaskAllDone(t, charIds, dailyKey)).length
  const weeklyUndone = todos.filter(
    (t) => t.cycle === 'weekly' && !isTaskAllDone(t, charIds, weeklyKey),
  ).length
  const monthlyUndone = todos.filter(
    (t) => t.cycle === 'monthly' && !isTaskAllDone(t, charIds, monthlyKey),
  ).length

  // —— 庭院统计：可处理(可收获/待清)数 + 待养护数 + 下一事件倒计时（cycle 与 timer 通用） ——
  let seedActionable = 0
  let seedCareNeeded = 0
  const seedUpcoming: number[] = []
  for (const s of seeds) {
    const cycle = getGrowthCycle(s.level)
    if (seedMode(s) === 'cycle' && cycle) {
      const sc = computeSeedSchedule(s, cycle, settings.dailyResetHour, now)
      if (sc.todayIsHarvest || sc.ended) seedActionable++
      if (!sc.ended && !isCaredToday(s, settings.dailyResetHour, now)) seedCareNeeded++
      const left = sc.nextEventAt - now
      if (left > 0) seedUpcoming.push(left)
    } else {
      const left = s.plantedAt + s.durationMs - now
      if (left <= 0) seedActionable++
      else seedUpcoming.push(left)
    }
  }
  const nextSeedLeft = seedUpcoming.length > 0 ? Math.min(...seedUpcoming) : null

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
    <div className="stack">
      {/* 顶部问候 / 今日概要 */}
      <section className="ov-hero">
        <div className="ov-hero-main">
          <h2 className="ov-hero-title">{greeting}，少侠</h2>
          <span className="muted">
            {dateLabel} · {weekday}
          </span>
        </div>
        <div className="ov-hero-reset">
          <span className="muted small">距每日刷新</span>
          <span className={`countdown ov-hero-countdown ${dailyResetLeft <= 60 * 60 * 1000 ? 'urgent' : ''}`}>
            {formatCountdown(dailyResetLeft, '即将刷新')}
          </span>
        </div>
      </section>

      <div className="grid ov-grid">
        {/* 待办卡片 */}
        <OverviewCard icon="todo" title="今日待办" onNavigate={() => onNavigate('todo')}>
          {dailyTodos.length === 0 ? (
            <div className="ov-line">
              <span className="muted small">还没有每日待办，点击前往添加</span>
            </div>
          ) : (
            <>
              <div className="ov-stat">
                <span
                  className={`ov-stat-num ${dailyDone === dailyTodos.length ? 'is-ok' : 'is-attention'}`}
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
            <span className="badge">周 {weeklyUndone} 未完成</span>
            <span className="badge">月 {monthlyUndone} 未完成</span>
          </div>
        </OverviewCard>

        {/* 庭院卡片 */}
        <OverviewCard icon="sprout" title="庭院种子" onNavigate={() => onNavigate('courtyard')}>
          {seeds.length === 0 ? (
            <div className="ov-line">
              <span className="muted small">还没有种植，点击进入庭院播种</span>
            </div>
          ) : (
            <>
              <div className="ov-stat">
                <span className={`ov-stat-num ${seedActionable > 0 ? 'is-attention' : ''}`}>
                  {seedActionable}
                </span>
                <span className="ov-stat-unit">株可处理</span>
                {seedActionable > 0 && <span className="badge badge-ok">待收获</span>}
                {seedCareNeeded > 0 && (
                  <span className="badge badge-warn">{seedCareNeeded} 待养护</span>
                )}
              </div>
              <div className="ov-next">
                {nextSeedLeft != null ? (
                  <>
                    <span className="muted small">下一事件</span>
                    <span
                      className={`countdown ${
                        nextSeedLeft <= 30 * 60 * 1000 ? 'urgent' : ''
                      }`}
                    >
                      {formatCountdown(nextSeedLeft, '即将')}
                    </span>
                  </>
                ) : (
                  <span className="badge badge-ok">暂无进行中</span>
                )}
              </div>
            </>
          )}
        </OverviewCard>

        {/* 副本卡片 */}
        <OverviewCard icon="shield" title="副本进度" onNavigate={() => onNavigate('dungeon')}>
          {dungeons.length === 0 ? (
            <div className="ov-line">
              <span className="muted small">还没有副本，点击添加追踪</span>
            </div>
          ) : (
            <>
              <div className="ov-stat">
                <span
                  className={`ov-stat-num ${requiredUndone.length > 0 ? 'is-attention' : 'is-ok'}`}
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
        <OverviewCard icon="home" title="房屋状态" onNavigate={() => onNavigate('house')}>
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

        {/* 攻略卡片 */}
        <OverviewCard icon="guide" title="攻略大全" onNavigate={() => onNavigate('guide')}>
          <div className="ov-stat">
            <span className="ov-stat-num">{GUIDE_PRESETS.length}</span>
            <span className="ov-stat-unit">条内置攻略</span>
            {customGuides.length > 0 && (
              <span className="badge">自定义 {customGuides.length}</span>
            )}
          </div>
          <div className="ov-line row-wrap">
            <span className="badge badge-outline">副本</span>
            <span className="badge badge-outline">周六活动</span>
            <span className="badge badge-outline">周日活动</span>
            <span className="badge badge-outline">神器·起</span>
            <span className="badge badge-outline">神器·转</span>
            <span className="badge badge-outline">神器·合</span>
            <span className="badge badge-outline">奇遇</span>
            <span className="badge badge-outline">看戏</span>
          </div>
        </OverviewCard>
      </div>
    </div>
  )
}
