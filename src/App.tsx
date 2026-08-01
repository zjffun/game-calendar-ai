import { useEffect, useState } from 'react'
import { useNow } from './hooks/useNow'
import { formatClock, formatCountdown, getNextReset, WEEKDAY_LABELS } from './utils/time'
import { useSettings } from './store/useAppStore'
import { initAuth, useAuth } from './store/authStore'
import OverviewDashboard from './components/Overview/OverviewDashboard'
import TodoSection from './components/Todo/TodoSection'
import CourtyardTimers from './components/Courtyard/CourtyardTimers'
import DungeonTracker from './components/Dungeon/DungeonTracker'
import HouseCleaning from './components/House/HouseCleaning'
import GuideBook from './components/Guide/GuideBook'
import PriceBook from './components/Price/PriceBook'
import SettingsPanel from './components/Settings/SettingsPanel'
import ConfirmHost from './components/common/ConfirmDialog'
import Icon, { type IconName } from './components/common/Icon'
import type { TabId } from './tabs'
import './App.css'

/** 顶级导航：只保留 概览 / 待办 / 攻略；设置走侧边栏底部齿轮 */
const NAV: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'overview', label: '概览', icon: 'overview' },
  { id: 'todo', label: '待办', icon: 'todo' },
  { id: 'guide', label: '攻略', icon: 'guide' },
  { id: 'price', label: '物价', icon: 'coin' },
]

/** 子页（从概览进入，不出现在主导航）：显示为概览下的当前位置 */
const SUB_PAGES: Partial<Record<TabId, { label: string; icon: IconName }>> = {
  courtyard: { label: '庭院种子', icon: 'sprout' },
  dungeon: { label: '副本进度', icon: 'shield' },
  house: { label: '房屋状态', icon: 'home' },
}

/** 侧边栏时钟：独立组件，避免秒级刷新牵动整棵组件树 */
function SideClock() {
  const now = useNow(1000)
  const { settings } = useSettings()
  const d = new Date(now)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  const weekday = WEEKDAY_LABELS[d.getDay() === 0 ? 7 : d.getDay()]
  const resetLeft = getNextReset('daily', now, settings) - now
  return (
    <div className="side-clock">
      <span className="side-clock-time">
        {pad(d.getHours())}:{pad(d.getMinutes())}
      </span>
      <span className="side-clock-date">
        {d.getMonth() + 1} 月 {d.getDate()} 日 · {weekday}
      </span>
      <span className="side-clock-reset">
        距每日刷新
        <span className="countdown">{formatCountdown(resetLeft, '即将刷新')}</span>
      </span>
    </div>
  )
}

/** 移动端顶栏时钟（只显示 HH:MM） */
function MobileClock() {
  const now = useNow(1000)
  return <span className="mobile-clock">{formatClock(now).slice(-5)}</span>
}

export default function App() {
  // 应用启动时恢复登录态并监听认证事件（未配置云端时为空操作）
  useEffect(() => {
    initAuth()
  }, [])
  const { status: authStatus } = useAuth()

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

  const sub = SUB_PAGES[tab]
  // 子页归属概览：主导航高亮「概览」
  const navActive: TabId = sub ? 'overview' : tab

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
              className={`side-item${navActive === t.id ? ' active' : ''}`}
              aria-current={navActive === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={17} />
              {t.label}
            </button>
          ))}
          {sub && (
            <span className="side-subitem" aria-current="page">
              <Icon name={sub.icon} size={14} />
              {sub.label}
            </span>
          )}
        </nav>

        <div className="side-foot">
          <SideClock />
          <nav className="side-nav" aria-label="设置">
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
            {sub && (
              <div className="subpage-bar">
                <button className="back-btn" onClick={() => setTab('overview')}>
                  <Icon name="arrow-left" size={15} />
                  返回概览
                </button>
              </div>
            )}
            {tab === 'overview' && <OverviewDashboard onNavigate={setTab} />}
            {tab === 'todo' && <TodoSection />}
            {tab === 'courtyard' && <CourtyardTimers />}
            {tab === 'dungeon' && <DungeonTracker />}
            {tab === 'house' && <HouseCleaning />}
            {tab === 'guide' && <GuideBook />}
            {tab === 'price' && <PriceBook />}
            {tab === 'settings' && <SettingsPanel />}
          </div>
        </main>
      </div>

      {/* 移动端底部导航 */}
      <nav className="mobile-nav" aria-label="主导航">
        {NAV.map((t) => (
          <button
            key={t.id}
            className={`mobile-nav-item${navActive === t.id ? ' active' : ''}`}
            aria-current={navActive === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={19} />
            {t.label}
          </button>
        ))}
      </nav>

      <ConfirmHost />
    </div>
  )
}
