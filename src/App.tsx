import { useState } from 'react'
import { useNow } from './hooks/useNow'
import { formatClock, WEEKDAY_LABELS } from './utils/time'
import { useSettings } from './store/useAppStore'
import OverviewDashboard from './components/Overview/OverviewDashboard'
import TodoSection from './components/Todo/TodoSection'
import CourtyardTimers from './components/Courtyard/CourtyardTimers'
import DungeonTracker from './components/Dungeon/DungeonTracker'
import HouseCleaning from './components/House/HouseCleaning'
import SettingsPanel from './components/Settings/SettingsPanel'
import type { TabId } from './tabs'
import './App.css'

interface TabDef {
  id: TabId
  label: string
  glyph: string
}

const TABS: TabDef[] = [
  { id: 'overview', label: '概览', glyph: '🧭' },
  { id: 'todo', label: '待办', glyph: '📜' },
  { id: 'courtyard', label: '庭院', glyph: '🌱' },
  { id: 'dungeon', label: '副本', glyph: '⚔️' },
  { id: 'house', label: '房屋', glyph: '🏠' },
  { id: 'settings', label: '设置', glyph: '⚙️' },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('overview')
  const now = useNow(1000)
  const { settings } = useSettings()
  const d = new Date(now)
  const weekday = WEEKDAY_LABELS[d.getDay() === 0 ? 7 : d.getDay()]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-main">
          <div className="app-title">
            <span className="app-seal">梦</span>
            <div>
              <h1>梦幻西游 · 游戏日历</h1>
              <p className="app-subtitle muted small">
                {formatClock(now)} · {weekday} · 每日 {settings.dailyResetHour} 点重置
              </p>
            </div>
          </div>
        </div>
        <nav className="tabbar" role="tablist" aria-label="功能切换">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-glyph" aria-hidden>
                {t.glyph}
              </span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {tab === 'overview' && <OverviewDashboard onNavigate={setTab} />}
        {tab === 'todo' && <TodoSection />}
        {tab === 'courtyard' && <CourtyardTimers />}
        {tab === 'dungeon' && <DungeonTracker />}
        {tab === 'house' && <HouseCleaning />}
        {tab === 'settings' && <SettingsPanel />}
      </main>

      <footer className="app-footer muted small">
        数据保存在本地浏览器（localStorage），不会上传。可在「设置」中导出 / 导入备份。
      </footer>
    </div>
  )
}
