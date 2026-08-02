import type { KeyboardEvent, ReactNode } from 'react'
import type { TabId } from '../../tabs'
import {
  useTodos,
  useSettings,
  useCharacters,
  useGuides,
} from '../../store/useAppStore'
import { GUIDE_PRESETS, GUIDE_CATEGORY_META } from '../../data/guides'
import { useNow } from '../../hooks/useNow'
import {
  getPeriodKey,
  getNextReset,
  formatCountdown,
  WEEKDAY_LABELS,
} from '../../utils/time'
import { effectiveCharacterIds, isTaskAllDone } from '../../utils/todo'
import Icon, { type IconName } from '../common/Icon'
import './Overview.css'

interface Props {
  onNavigate: (tab: TabId) => void
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
  const onceKey = getPeriodKey('once', now, settings)
  const dailyTodos = todos.filter((t) => t.cycle === 'daily')
  // 一条任务「全部角色完成」才算完成
  const dailyDone = dailyTodos.filter((t) => isTaskAllDone(t, charIds, dailyKey)).length
  const onceUndone = todos.filter(
    (t) => t.cycle === 'once' && !isTaskAllDone(t, charIds, onceKey),
  ).length
  const weeklyUndone = todos.filter(
    (t) => t.cycle === 'weekly' && !isTaskAllDone(t, charIds, weeklyKey),
  ).length
  const monthlyUndone = todos.filter(
    (t) => t.cycle === 'monthly' && !isTaskAllDone(t, charIds, monthlyKey),
  ).length

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
            {onceUndone > 0 && <span className="badge">单次 {onceUndone} 未完成</span>}
            <span className="badge">周 {weeklyUndone} 未完成</span>
            <span className="badge">月 {monthlyUndone} 未完成</span>
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
            {GUIDE_CATEGORY_META.filter((m) => m.category !== '自定义').map((m) => (
              <span className="badge badge-outline" key={m.category}>
                {m.category}
              </span>
            ))}
          </div>
        </OverviewCard>
      </div>
    </div>
  )
}
