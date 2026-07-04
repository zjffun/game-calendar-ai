import { useEffect, useState } from 'react'
import { useNow } from './hooks/useNow'
import { formatClock, WEEKDAY_LABELS } from './utils/time'
import { isTauri, checkAndDownloadWebUpdate } from './utils/webUpdate'
import { appConfirm } from './components/common/ConfirmDialog'
import { useSettings } from './store/useAppStore'
import OverviewDashboard from './components/Overview/OverviewDashboard'
import TodoSection from './components/Todo/TodoSection'
import CourtyardTimers from './components/Courtyard/CourtyardTimers'
import DungeonTracker from './components/Dungeon/DungeonTracker'
import HouseCleaning from './components/House/HouseCleaning'
import GuideBook from './components/Guide/GuideBook'
import SettingsPanel from './components/Settings/SettingsPanel'
import ConfirmHost from './components/common/ConfirmDialog'
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
  { id: 'guide', label: '攻略', glyph: '📖' },
  { id: 'settings', label: '设置', glyph: '⚙️' },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('overview')
  const now = useNow(1000)
  const { settings } = useSettings()
  const d = new Date(now)
  const weekday = WEEKDAY_LABELS[d.getDay() === 0 ? 7 : d.getDay()]

  // Tauri 桌面端：启动后静默检查 GitHub Pages 上是否有新的网页构建，
  // 有则下载到本地缓存并询问是否立即重载（离线/失败都静默忽略）
  useEffect(() => {
    if (!import.meta.env.PROD || !isTauri()) return
    const timer = window.setTimeout(async () => {
      try {
        const res = await checkAndDownloadWebUpdate()
        if (res.status !== 'updated') return
        if (await appConfirm(`网页内容有新版本（${res.remote ?? '未知'}），已下载完成。\n立即重载使用新版本吗？`)) {
          window.location.reload()
        }
      } catch {
        /* 网页端 / 通信失败：忽略 */
      }
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [])

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
        {tab === 'todo' && <TodoSection onNavigate={setTab} />}
        {tab === 'courtyard' && <CourtyardTimers />}
        {tab === 'dungeon' && <DungeonTracker />}
        {tab === 'house' && <HouseCleaning />}
        {tab === 'guide' && <GuideBook />}
        {tab === 'settings' && <SettingsPanel />}
      </main>

      <footer className="app-footer muted small">
        数据保存在本机（localStorage + IndexedDB），不会上传。可在「设置」中导出 / 导入备份。
      </footer>

      <ConfirmHost />
    </div>
  )
}
