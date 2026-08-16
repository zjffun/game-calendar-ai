import { useEffect, useState } from 'react'
import { useNow } from './hooks/useNow'
import {
  formatClock,
  formatCountdown,
  formatMmSs,
  getMhxyDayNight,
  getNextReset,
  WEEKDAY_LABELS,
} from './utils/time'
import { useSettings } from './store/useAppStore'
import { initAuth, useAuth } from './store/authStore'
import { syncQuizForUser, useQuizCloud } from './store/quizStore'
import OverviewDashboard from './components/Overview/OverviewDashboard'
import TodoSection from './components/Todo/TodoSection'
import GuideBook from './components/Guide/GuideBook'
import PriceBook from './components/Price/PriceBook'
import OcrTool from './components/Ocr/OcrTool'
import QuizBook from './components/Quiz/QuizBook'
import AdminPanel from './components/Admin/AdminPanel'
import SettingsPanel from './components/Settings/SettingsPanel'
import ConfirmHost from './components/common/ConfirmDialog'
import ImageLightbox from './components/common/ImageLightbox'
import Icon, { type IconName } from './components/common/Icon'
import type { TabId } from './tabs'
import './App.css'

/** 顶级导航：只保留 概览 / 待办 / 攻略；设置走侧边栏底部齿轮 */
const NAV: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'overview', label: '概览', icon: 'overview' },
  { id: 'todo', label: '待办', icon: 'todo' },
  { id: 'guide', label: '攻略', icon: 'guide' },
  { id: 'price', label: '物价', icon: 'coin' },
  { id: 'ocr', label: '取字', icon: 'scan-text' },
  { id: 'quiz', label: '答题', icon: 'quiz' },
]

/** 侧边栏时钟：独立组件，避免秒级刷新牵动整棵组件树 */
function SideClock() {
  const now = useNow(1000)
  const { settings } = useSettings()
  const d = new Date(now)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  const weekday = WEEKDAY_LABELS[d.getDay() === 0 ? 7 : d.getDay()]
  const resetLeft = getNextReset('daily', now, settings) - now
  const { phase, msToNext } = getMhxyDayNight(now)
  const isDay = phase === 'day'
  return (
    <div className="side-clock">
      <div className="side-clock-top">
        <span className="side-clock-time">
          {pad(d.getHours())}:{pad(d.getMinutes())}
        </span>
        <span className={`daynight-badge ${isDay ? 'is-day' : 'is-night'}`}>
          <Icon name={isDay ? 'sun' : 'moon'} size={13} />
          {isDay ? '白天' : '夜晚'}
          <span className="daynight-count">{formatMmSs(msToNext)}</span>
        </span>
      </div>
      <span className="side-clock-date">
        {d.getMonth() + 1} 月 {d.getDate()} 日 · {weekday}
      </span>
      <div className="side-clock-stats">
        <div className="side-clock-stat">
          <span>距每日刷新</span>
          <span className="countdown">{formatCountdown(resetLeft, '即将刷新')}</span>
        </div>
      </div>
    </div>
  )
}

/** 移动端顶栏时钟（HH:MM + 昼夜切换倒计时） */
function MobileClock() {
  const now = useNow(1000)
  const { phase, msToNext } = getMhxyDayNight(now)
  const isDay = phase === 'day'
  return (
    <span className="mobile-clock">
      {formatClock(now).slice(-5)}
      <span className={`mobile-daynight ${isDay ? 'is-day' : 'is-night'}`}>
        <Icon name={isDay ? 'sun' : 'moon'} size={12} />
        {formatMmSs(msToNext)}
      </span>
    </span>
  )
}

export default function App() {
  // 应用启动时恢复登录态并监听认证事件（未配置云端时为空操作）
  useEffect(() => {
    initAuth()
  }, [])
  const { status: authStatus, user } = useAuth()
  const { isAdmin } = useQuizCloud()

  // 登录态变化 → 驱动云端题库/管理状态加载（登出/未配置时清空）
  const userId = user?.id ?? null
  useEffect(() => {
    if (authStatus === 'loading') return
    void syncQuizForUser(authStatus === 'signedIn' ? userId : null)
  }, [authStatus, userId])

  // 带 ?guide= 参数刷新时直接落到攻略页（GuideBook 再据此恢复选中的攻略）
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('guide')) {
      return 'guide'
    }
    return 'overview'
  })

  // 离开攻略页时清掉 guide 参数，避免在其它页刷新又被拉回攻略
  useEffect(() => {
    if (tab === 'guide' || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.has('guide')) {
      url.searchParams.delete('guide')
      window.history.replaceState(null, '', url)
    }
  }, [tab])

  // 失去管理员权限（或登出）后仍停留在管理页 → 退回概览
  useEffect(() => {
    if (!isAdmin && tab === 'admin') setTab('overview')
  }, [isAdmin, tab])

  return (
    <div className="app">
      {/* 桌面侧边栏 */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            梦
          </span>
          <div className="brand-text">
            <span className="brand-name">游戏日历</span>
            <span className="brand-sub">梦幻西游</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="主导航">
          {NAV.map((t) => (
            <button
              key={t.id}
              className={`side-item${tab === t.id ? ' active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={17} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <SideClock />
          <nav className="side-nav" aria-label="设置">
            {isAdmin && (
              <button
                className={`side-item${tab === 'admin' ? ' active' : ''}`}
                aria-current={tab === 'admin' ? 'page' : undefined}
                onClick={() => setTab('admin')}
              >
                <Icon name="shield" size={17} />
                管理后台
              </button>
            )}
            <button
              className={`side-item${tab === 'settings' ? ' active' : ''}`}
              aria-current={tab === 'settings' ? 'page' : undefined}
              onClick={() => setTab('settings')}
            >
              <Icon name="settings" size={17} />
              设置
            </button>
          </nav>
          <p className="side-note">
            {authStatus === 'signedIn'
              ? '已登录，数据自动云端同步，可在设置中管理。'
              : '数据保存在本机，可在设置中登录云同步或导出备份。'}
          </p>
        </div>
      </aside>

      <div className="main-col">
        {/* 移动端顶栏 */}
        <header className="mobile-topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              梦
            </span>
            <div className="brand-text">
              <span className="brand-name">游戏日历</span>
            </div>
          </div>
          <MobileClock />
          {isAdmin && (
            <button
              className={`mobile-settings-btn${tab === 'admin' ? ' active' : ''}`}
              aria-label="管理后台"
              onClick={() => setTab('admin')}
            >
              <Icon name="shield" size={17} />
            </button>
          )}
          <button
            className={`mobile-settings-btn${tab === 'settings' ? ' active' : ''}`}
            aria-label="设置"
            onClick={() => setTab('settings')}
          >
            <Icon name="settings" size={17} />
          </button>
        </header>

        <main className="content">
          <div className="content-inner">
            {tab === 'overview' && <OverviewDashboard onNavigate={setTab} />}
            {tab === 'todo' && <TodoSection />}
            {tab === 'guide' && <GuideBook />}
            {tab === 'price' && <PriceBook />}
            {tab === 'ocr' && <OcrTool />}
            {tab === 'quiz' && <QuizBook />}
            {tab === 'admin' && <AdminPanel />}
            {tab === 'settings' && <SettingsPanel />}
          </div>
        </main>
      </div>

      {/* 移动端底部导航 */}
      <nav className="mobile-nav" aria-label="主导航">
        {NAV.map((t) => (
          <button
            key={t.id}
            className={`mobile-nav-item${tab === t.id ? ' active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={19} />
            {t.label}
          </button>
        ))}
      </nav>

      <ConfirmHost />
      <ImageLightbox />
    </div>
  )
}
