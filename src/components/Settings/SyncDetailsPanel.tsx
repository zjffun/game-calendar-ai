// ============================================================================
// 同步详情面板（设置页，仅登录后显示）。
//  · 顶部：总体状态 + 最近拉取/上行时刻 + 待上传/失败计数 + 立即同步/重试/刷新。
//  · 逐分片状态表：本地同步时刻 vs 云端更新时刻 + 状态（已同步/待上传/上次失败/仅云端）。
//  · 同步日志：最近的上/下行与失败事件。
// 数据来自 syncStore 的可订阅快照（useSyncExternalStore），动作走 cloudSync。
// ============================================================================

import { useState, useSyncExternalStore } from 'react'
import { useAuth } from '../../store/authStore'
import { STORAGE_KEYS } from '../../types'
import {
  subscribeSyncInfo,
  getSyncInfoSnapshot,
  type SyncInfoSnapshot,
  type SyncEvent,
} from '../../store/syncStore'
import { flushNow, retryFailed, refreshRemoteTimes } from '../../store/cloudSync'
import Icon from '../common/Icon'

const KEY_LABELS: { key: string; label: string }[] = [
  { key: STORAGE_KEYS.todos, label: '待办' },
  { key: STORAGE_KEYS.seeds, label: '种子 / 种植' },
  { key: STORAGE_KEYS.dungeons, label: '副本' },
  { key: STORAGE_KEYS.characters, label: '角色' },
  { key: STORAGE_KEYS.guides, label: '自定义攻略' },
  { key: STORAGE_KEYS.guideNotes, label: '攻略笔记' },
  { key: STORAGE_KEYS.pinnedGuides, label: '置顶攻略' },
  { key: STORAGE_KEYS.priceItems, label: '物价条目' },
  { key: STORAGE_KEYS.priceComments, label: '物价备注' },
  { key: STORAGE_KEYS.priceObservations, label: '价格观测' },
  { key: STORAGE_KEYS.house, label: '房屋' },
  { key: STORAGE_KEYS.settings, label: '设置' },
  { key: STORAGE_KEYS.synth, label: '算价输入' },
]
const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  KEY_LABELS.map(({ key, label }) => [key, label]),
)

function fmt(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type ChipKind = 'ok' | 'warn' | 'err' | 'muted'

function keyStatus(key: string, snap: SyncInfoSnapshot): { text: string; kind: ChipKind } {
  const ob = snap.outbox[key]
  if (ob?.failed) return { text: '上次失败', kind: 'err' }
  if (ob) return { text: '待上传', kind: 'warn' }
  if (snap.lastSynced[key]) return { text: '已同步', kind: 'ok' }
  if (snap.remoteAt[key]) return { text: '仅云端', kind: 'muted' }
  return { text: '未同步', kind: 'muted' }
}

function eventText(ev: SyncEvent): string {
  const who = ev.key === 'images' ? '图片' : ev.key ? (LABEL_BY_KEY[ev.key] ?? ev.key) : ''
  const arrow = ev.dir === 'up' ? '↑ 上行' : ev.dir === 'down' ? '↓ 下行' : '·'
  const result = ev.ok ? '成功' : `失败：${ev.msg ?? '未知错误'}`
  return `${arrow} ${who} ${result}`.trim()
}

export default function SyncDetailsPanel() {
  const auth = useAuth()
  const snap = useSyncExternalStore(subscribeSyncInfo, getSyncInfoSnapshot, getSyncInfoSnapshot)
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)

  // 未配置云端或未登录时不展示（登录入口在 AccountPanel 里）
  if (!auth.isCloudConfigured || auth.status !== 'signedIn') return null

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const overall =
    snap.failedCount > 0
      ? { text: `${snap.failedCount} 项同步失败`, kind: 'err' as ChipKind }
      : snap.pendingCount > 0 || snap.imagePending > 0
        ? { text: `${snap.pendingCount + snap.imagePending} 项待上传`, kind: 'warn' as ChipKind }
        : { text: '全部已同步', kind: 'ok' as ChipKind }

  return (
    <div className="card pad-lg">
      <div className="card-head">
        <h3>同步详情</h3>
        <span className={`sync-chip is-${overall.kind}`}>{overall.text}</span>
      </div>

      <ul className="settings-usage" style={{ margin: '0 0 12px' }}>
        <li>最近拉取：{fmt(snap.lastPullAt)}</li>
        <li>最近上行：{fmt(snap.lastPushAt)}</li>
        {snap.imagePending > 0 && <li>图片待上传：{snap.imagePending} 项</li>}
      </ul>

      <div className="row row-wrap" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void run(flushNow)}
        >
          <Icon name="rotate" size={13} />
          立即同步
        </button>
        {snap.failedCount > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void run(retryFailed)}
          >
            重试失败项
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => void run(refreshRemoteTimes)}
        >
          刷新云端时间
        </button>
      </div>

      <div className="sync-table-wrap">
        <table className="sync-table">
          <thead>
            <tr>
              <th>数据</th>
              <th>本地同步</th>
              <th>云端更新</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {KEY_LABELS.map(({ key, label }) => {
              const st = keyStatus(key, snap)
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="muted small">{fmt(snap.lastSynced[key])}</td>
                  <td className="muted small">{fmt(snap.remoteAt[key])}</td>
                  <td>
                    <span className={`sync-chip is-${st.kind}`}>{st.text}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowLog((v) => !v)}
        >
          {showLog ? '收起同步日志' : `查看同步日志（${snap.log.length}）`}
        </button>
      </div>

      {showLog && (
        <div className="sync-log pop-in">
          {snap.log.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              暂无同步事件。
            </p>
          ) : (
            <ul>
              {snap.log.map((ev, i) => (
                <li key={`${ev.at}-${i}`} className={ev.ok ? '' : 'is-err'}>
                  <span className="sync-log-time">{fmt(ev.at)}</span>
                  <span className="sync-log-text">{eventText(ev)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="muted small" style={{ margin: '12px 0 0' }}>
        断网时改动会先存本地队列（待上传），联网后自动重试；集合类数据按条目合并，两台设备
        各改不同条目不会互相覆盖。
      </p>
    </div>
  )
}
