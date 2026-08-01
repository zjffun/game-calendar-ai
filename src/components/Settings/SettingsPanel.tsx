// ============================================================================
// 设置模块：周期重置点设置 + 数据管理（导出/导入/清空）+ 关于
// 全部读写均通过 store actions（useSettings / dataActions），不直接操作 localStorage。
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useSettings, dataActions } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import {
  WEEKDAY_LABELS,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  getNextEvery4DaysReset,
  formatClock,
} from '../../utils/time'
import { STORAGE_KEYS } from '../../types'
import { imagesUsage } from '../../store/imageStore'
import { formatBytes } from '../../utils/image'
import { activeWebVersion, type ActiveWebVersion } from '../../utils/webUpdate'
import Icon from '../common/Icon'
import AccountPanel from './AccountPanel'
import './Settings.css'

/** 存储用量快照：文本（localStorage）+ 图片库（IndexedDB）+ 浏览器配额 */
interface UsageInfo {
  /** 本应用各 key 在 localStorage 中的近似占用（UTF-16，字节） */
  localBytes: number
  imageCount: number
  imageBytes: number
  /** navigator.storage.estimate 的整源用量/配额（可能不可用） */
  estimate?: { usage: number; quota: number }
}

/** localStorage 单源配额的常见下限（5MB），用于给出占比参考 */
const LOCAL_STORAGE_NOMINAL = 5 * 1024 * 1024

/** 临时提示文案的状态：内容 + 类型（成功/失败） */
interface Toast {
  text: string
  kind: 'ok' | 'err'
}

export default function SettingsPanel() {
  const { settings, update } = useSettings()
  const now = useNow()

  // —— 导出相关 ——
  const [exportText, setExportText] = useState('')
  const [exportToast, setExportToast] = useState<Toast | null>(null)

  // —— 导入相关 ——
  const [importText, setImportText] = useState('')
  const [importToast, setImportToast] = useState<Toast | null>(null)

  // —— 清空二次确认 ——
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetToast, setResetToast] = useState<Toast | null>(null)

  // —— 网页版本（关于） ——
  const [webVersion, setWebVersion] = useState<ActiveWebVersion | null>(null)

  useEffect(() => {
    void activeWebVersion().then(setWebVersion)
  }, [])

  // —— 存储用量 ——
  const [usage, setUsage] = useState<UsageInfo | null>(null)

  async function refreshUsage() {
    let localBytes = 0
    for (const key of Object.values(STORAGE_KEYS)) {
      const v = localStorage.getItem(key)
      if (v != null) localBytes += (key.length + v.length) * 2
    }
    const img = await imagesUsage().catch(() => ({ count: 0, bytes: 0 }))
    let estimate: UsageInfo['estimate']
    try {
      const est = await navigator.storage?.estimate?.()
      if (est?.quota) estimate = { usage: est.usage ?? 0, quota: est.quota }
    } catch {
      /* 环境不支持则不展示 */
    }
    setUsage({ localBytes, imageCount: img.count, imageBytes: img.bytes, estimate })
  }

  useEffect(() => {
    void refreshUsage()
  }, [])

  // 提示自动消失计时器（卸载时清理，避免泄漏）
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  /** 在若干毫秒后自动清除某个提示 */
  function autoClear(clear: () => void, delay = 2400) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(clear, delay)
  }

  // —— 周期重置点：每日重置小时 ——
  function handleDailyHourChange(e: React.ChangeEvent<HTMLSelectElement>) {
    update({ dailyResetHour: Number(e.target.value) })
  }

  // —— 周期重置点：每周重置星期 ——
  function handleWeeklyWeekdayChange(e: React.ChangeEvent<HTMLSelectElement>) {
    update({ weeklyResetWeekday: Number(e.target.value) })
  }

  // —— 天命副本「每 4 天」刷新基准时刻 ——
  function handleAnchorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const ms = fromDatetimeLocalValue(e.target.value)
    if (Number.isNaN(ms)) return
    update({ every4DaysAnchor: ms })
  }

  // —— 生成导出 JSON 并填入预览框（含 IndexedDB 图片，故为异步）——
  async function handleExport() {
    const json = await dataActions.exportJSON()
    setExportText(json)
    setExportToast({ text: '已生成备份内容（含图片），可复制或下载。', kind: 'ok' })
    autoClear(() => setExportToast(null))
  }

  // —— 复制到剪贴板 ——
  async function handleCopy() {
    const json = exportText || (await dataActions.exportJSON())
    if (!exportText) setExportText(json)
    try {
      await navigator.clipboard.writeText(json)
      setExportToast({ text: '已复制到剪贴板。', kind: 'ok' })
    } catch {
      setExportToast({ text: '复制失败，请手动选择文本复制。', kind: 'err' })
    }
    autoClear(() => setExportToast(null))
  }

  // —— 下载为 .json 文件 ——
  async function handleDownload() {
    const json = exportText || (await dataActions.exportJSON())
    if (!exportText) setExportText(json)
    try {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date(now)
      const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
      const filename = `梦幻日历备份-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
        stamp.getDate(),
      )}.json`
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportToast({ text: '已开始下载备份文件。', kind: 'ok' })
    } catch {
      setExportToast({ text: '下载失败，请改用复制方式。', kind: 'err' })
    }
    autoClear(() => setExportToast(null))
  }

  // —— 导入 ——
  async function handleImport() {
    const text = importText.trim()
    if (!text) {
      setImportToast({ text: '请先粘贴备份 JSON。', kind: 'err' })
      autoClear(() => setImportToast(null))
      return
    }
    const ok = await dataActions.importJSON(text)
    if (ok) {
      setImportToast({ text: '导入成功，数据已更新。', kind: 'ok' })
      setImportText('')
      void refreshUsage()
    } else {
      setImportToast({ text: '导入失败：JSON 格式有误。', kind: 'err' })
    }
    autoClear(() => setImportToast(null))
  }

  // —— 清空所有数据（二次确认）——
  async function handleResetClick() {
    if (!confirmingReset) {
      setConfirmingReset(true)
      // 一段时间未确认则自动取消，避免误触常驻
      autoClear(() => setConfirmingReset(false), 4000)
      return
    }
    await dataActions.resetAll(now)
    setConfirmingReset(false)
    setExportText('')
    setImportText('')
    setResetToast({ text: '已清空所有数据（含图片库），并恢复默认设置。', kind: 'ok' })
    autoClear(() => setResetToast(null))
    void refreshUsage()
  }

  return (
    <section className="stack">
      <h2 className="section-title">设置</h2>

      {/* —— 账号与云同步 —— */}
      <AccountPanel />

      {/* —— 周期重置点 —— */}
      <div className="card pad-lg">
        <div className="card-head">
          <h3>周期重置点</h3>
        </div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          此处决定每日 / 每周任务的「本周期已完成」如何判定，以及各项刷新倒计时的归零时刻。
          调整后，所有待办与副本的完成状态、倒计时会立即按新设置重新计算。
        </p>
        <div className="grid settings-grid-2">
          <div className="field">
            <label htmlFor="settings-daily-hour">每日重置时间（整点）</label>
            <select
              id="settings-daily-hour"
              className="select"
              value={settings.dailyResetHour}
              onChange={handleDailyHourChange}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h.toString().padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="settings-weekly-weekday">每周重置（星期）</label>
            <select
              id="settings-weekly-weekday"
              className="select"
              value={settings.weeklyResetWeekday}
              onChange={handleWeeklyWeekdayChange}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
                <option key={wd} value={wd}>
                  {WEEKDAY_LABELS[wd]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="settings-tianming-anchor">天命副本刷新基准（每 4 天）</label>
            <input
              id="settings-tianming-anchor"
              className="input"
              type="datetime-local"
              value={toDatetimeLocalValue(settings.every4DaysAnchor)}
              onChange={handleAnchorChange}
            />
            <span className="muted small">
              下次刷新：{formatClock(getNextEvery4DaysReset(now, settings.every4DaysAnchor))}
            </span>
          </div>
        </div>
        <p className="muted small" style={{ margin: '12px 0 0' }}>
          当前：每日 {settings.dailyResetHour.toString().padStart(2, '0')}:00 重置，每周{' '}
          {WEEKDAY_LABELS[settings.weeklyResetWeekday]}{' '}
          {settings.dailyResetHour.toString().padStart(2, '0')}:00 重置。
        </p>
      </div>

      {/* —— 存储用量 —— */}
      <div className="card pad-lg">
        <div className="card-head">
          <h3>存储用量</h3>
        </div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          文本数据存于 localStorage（单源约 5MB，足够存放全部待办/攻略文本）；
          图片体积大，单独存于 IndexedDB（配额通常数百 MB 起），互不挤占。
        </p>
        {usage ? (
          <ul className="settings-usage">
            <li>
              文本数据（localStorage）：约 {formatBytes(usage.localBytes)}（
              {((usage.localBytes / LOCAL_STORAGE_NOMINAL) * 100).toFixed(1)}% / 5MB）
            </li>
            <li>
              图片库（IndexedDB）：{usage.imageCount} 张，约 {formatBytes(usage.imageBytes)}
            </li>
            {usage.estimate && (
              <li>
                浏览器整源用量：{formatBytes(usage.estimate.usage)} /{' '}
                {formatBytes(usage.estimate.quota)}
              </li>
            )}
          </ul>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            正在统计…
          </p>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refreshUsage()}>
            <Icon name="rotate" size={13} />
            重新统计
          </button>
        </div>
      </div>

      {/* —— 数据管理：导出 —— */}
      <div className="card pad-lg">
        <div className="card-head">
          <h3>导出备份</h3>
        </div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          导出当前全部数据（待办、种子、副本、房屋、设置、自定义攻略、攻略补充与其中的图片）为
          JSON，可复制留存或下载为文件。含图片时文件可能较大，建议用「下载」。
        </p>
        <div className="row row-wrap" style={{ marginBottom: exportText ? 12 : 0 }}>
          <button type="button" className="btn btn-primary" onClick={handleExport}>
            生成备份
          </button>
          <button type="button" className="btn" onClick={handleCopy}>
            <Icon name="copy" size={14} />
            复制到剪贴板
          </button>
          <button type="button" className="btn" onClick={handleDownload}>
            <Icon name="download" size={14} />
            下载为 .json 文件
          </button>
        </div>
        {exportText && (
          <pre className="settings-json pop-in" aria-label="备份内容预览">
            {exportText}
          </pre>
        )}
        {exportToast && (
          <p className={`settings-toast pop-in is-${exportToast.kind}`} style={{ marginTop: 10 }}>
            {exportToast.text}
          </p>
        )}
      </div>

      {/* —— 数据管理：导入 —— */}
      <div className="card pad-lg">
        <div className="card-head">
          <h3>导入备份</h3>
        </div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          粘贴此前导出的 JSON，点击「导入」覆盖对应数据。导入前请确认内容无误。
        </p>
        <div className="field">
          <label htmlFor="settings-import">备份 JSON</label>
          <textarea
            id="settings-import"
            className="textarea settings-import-area"
            placeholder="在此粘贴备份的 JSON 内容…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!importText.trim()}
          >
            导入
          </button>
          {importToast && (
            <span className={`settings-toast pop-in is-${importToast.kind}`}>
              {importToast.text}
            </span>
          )}
        </div>
      </div>

      {/* —— 危险区域：清空所有数据 —— */}
      <div className="card pad-lg settings-danger-zone">
        <div className="card-head">
          <h3 style={{ color: 'var(--c-danger)' }}>清空所有数据</h3>
        </div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          删除全部待办、种子、副本、房屋记录、攻略补充与图片库，并把所有设置恢复为默认值。
          此操作不可撤销，建议先「导出备份」。
        </p>
        <div className="row row-wrap">
          <button type="button" className="btn btn-danger" onClick={handleResetClick}>
            {confirmingReset ? '确认清空？再点一次' : '清空所有数据'}
          </button>
          {confirmingReset && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmingReset(false)}
            >
              取消
            </button>
          )}
          {resetToast && (
            <span className={`settings-toast pop-in is-${resetToast.kind}`}>{resetToast.text}</span>
          )}
        </div>
      </div>

      {/* —— 关于 / 网页版本 —— */}
      <div className="card pad-lg">
        <div className="card-head">
          <h3>关于</h3>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          梦幻西游 · 游戏日历（网页应用）。未登录时数据仅保存在本机（文本存 localStorage、
          图片存 IndexedDB）；登录后会同步到云端并在各设备间保持一致。未登录时清除浏览器数据或
          更换设备 / 浏览器将无法恢复，请及时「导出备份」或登录启用云同步。
        </p>
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          网页版本：
          {webVersion
            ? `${webVersion.version}${
                webVersion.builtAt ? `（构建于 ${new Date(webVersion.builtAt).toLocaleString()}）` : ''
              }`
            : '开发模式 / 未知'}
        </p>
      </div>
    </section>
  )
}
