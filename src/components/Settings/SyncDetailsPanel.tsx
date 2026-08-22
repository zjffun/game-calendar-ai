// ============================================================================
// 同步详情面板（设置页，仅登录后显示）。
//  · 顶部：总体状态 + 最近拉取/上行时刻 + 待上传/失败计数 + 立即同步/重试/刷新。
//  · 逐分片状态表：合并方式（逐条/整块）+ 条目数 + 本地同步 vs 云端更新 + 状态。
//    每个分片都可展开：集合类（待办/攻略/物价…）逐条目查看名称与最近改动时刻，再点单条
//    看它的完整 JSON；整块类（设置/算价/置顶）展开直接看整块 JSON。皆可一键复制便于排障。
//  · 同步日志：最近的上/下行与失败事件。
// 数据来自 syncStore 的可订阅快照（useSyncExternalStore）+ useAppStore 的业务值；
// 动作走 cloudSync。内置攻略/物价来自代码、不入云端，这里只列会同步的用户数据分片。
// ============================================================================

import { Fragment, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../../store/authStore'
import { STORAGE_KEYS } from '../../types'
import {
  subscribeSyncInfo,
  getSyncInfoSnapshot,
  getItemMeta,
  type SyncInfoSnapshot,
  type SyncEvent,
} from '../../store/syncStore'
import { isItemKey, TOMBSTONE_TTL_MS } from '../../store/syncMerge'
import { useFullState } from '../../store/useAppStore'
import { GUIDE_PRESETS } from '../../data/guides'
import { DEFAULT_PRICE_ITEMS } from '../../data/prices'
import { flushNow, retryFailed, refreshRemoteTimes } from '../../store/cloudSync'
import Icon from '../common/Icon'

/** 参与云同步的用户数据分片（内置攻略/物价来自代码，不在此列）。 */
const KEY_LABELS: { key: string; label: string }[] = [
  { key: STORAGE_KEYS.todos, label: '待办' },
  { key: STORAGE_KEYS.characters, label: '角色' },
  { key: STORAGE_KEYS.guides, label: '自定义攻略' },
  { key: STORAGE_KEYS.guideNotes, label: '攻略笔记' },
  { key: STORAGE_KEYS.guideTags, label: '攻略标签' },
  { key: STORAGE_KEYS.guideRuns, label: '攻略计时' },
  { key: STORAGE_KEYS.pinnedGuides, label: '置顶攻略' },
  { key: STORAGE_KEYS.priceItems, label: '物价条目' },
  { key: STORAGE_KEYS.priceComments, label: '物价备注' },
  { key: STORAGE_KEYS.priceObservations, label: '价格观测' },
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

/** 一条可展开的条目：显示名 + 最近改动时刻（来自 per-item 元数据）+ 原始数据。 */
interface ShardItem {
  id: string
  name: string
  updatedAt?: number
  /** 该条目当前的业务值（展开可看完整 JSON）。 */
  raw: unknown
}

/** 只读 JSON 视图：等宽、可滚动、可一键复制。用于逐条 / 整块「看详细的 data」。 */
function JsonBlock({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(value, null, 2) ?? String(value)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 无剪贴板权限：忽略，用户仍可手动选中复制 */
    }
  }
  return (
    <div className="sync-json-wrap">
      <button type="button" className="sync-json-copy" onClick={() => void copy()}>
        <Icon name={copied ? 'check' : 'copy'} size={12} />
        {copied ? '已复制' : '复制'}
      </button>
      <pre className="sync-json">{text}</pre>
    </div>
  )
}

export default function SyncDetailsPanel() {
  const auth = useAuth()
  const snap = useSyncExternalStore(subscribeSyncInfo, getSyncInfoSnapshot, getSyncInfoSnapshot)
  const state = useFullState()
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // 逐条目 JSON 展开：键为 `${分片 key}:${条目 id}`
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set())

  // 未配置云端或未登录时不展示（登录入口在 AccountPanel 里）
  if (!auth.isCloudConfigured || auth.status !== 'signedIn') return null

  // storageKey -> 当前业务值（用于条目计数与逐条展开）
  const valueByKey: Record<string, unknown> = {
    [STORAGE_KEYS.todos]: state.todos,
    [STORAGE_KEYS.characters]: state.characters,
    [STORAGE_KEYS.guides]: state.guides,
    [STORAGE_KEYS.guideNotes]: state.guideNotes,
    [STORAGE_KEYS.guideTags]: state.guideTags,
    [STORAGE_KEYS.guideRuns]: state.guideRuns,
    [STORAGE_KEYS.pinnedGuides]: state.pinnedGuides,
    [STORAGE_KEYS.priceItems]: state.priceItems,
    [STORAGE_KEYS.priceComments]: state.priceComments,
    [STORAGE_KEYS.priceObservations]: state.priceObservations,
    [STORAGE_KEYS.settings]: state.settings,
    [STORAGE_KEYS.synth]: state.synth,
  }

  // 攻略笔记 / 攻略标签 / 物价备注按 id 存储，名字要从攻略/物价条目里回查
  const guideTitle = new Map<string, string>()
  for (const g of [...GUIDE_PRESETS, ...state.guides]) guideTitle.set(g.id, g.title)
  const priceName = new Map<string, string>()
  for (const p of [...DEFAULT_PRICE_ITEMS, ...state.priceItems]) priceName.set(p.id, p.name)

  function itemName(key: string, id: string, item: unknown): string {
    const rec = item as Record<string, unknown> | undefined
    switch (key) {
      case STORAGE_KEYS.todos:
      case STORAGE_KEYS.characters:
      case STORAGE_KEYS.priceItems:
        return (rec?.name as string) || id
      case STORAGE_KEYS.guides:
        return (rec?.title as string) || id
      case STORAGE_KEYS.priceObservations:
        return (rec?.itemName as string) || id
      case STORAGE_KEYS.guideNotes:
        return guideTitle.get(id) ?? '（笔记）'
      case STORAGE_KEYS.guideTags:
        return guideTitle.get(id) ?? '（标签）'
      case STORAGE_KEYS.guideRuns:
        return guideTitle.get(id) ?? '（计时）'
      case STORAGE_KEYS.priceComments:
        return priceName.get(id) ?? '（备注）'
      default:
        return id
    }
  }

  /** 分片的条目数：集合类→条目个数；置顶列表→id 个数；单例（设置/算价）→ null。 */
  function itemCount(key: string): number | null {
    const v = valueByKey[key]
    if (Array.isArray(v)) return v.length
    if (isItemKey(key) && v && typeof v === 'object') return Object.keys(v).length
    return null
  }

  /** 展开时的逐条目视图 + 墓碑（已删除但仍在追踪的）计数。 */
  function shardItems(key: string): { live: ShardItem[]; tombstones: number } {
    const meta = getItemMeta(key)
    const v = valueByKey[key]
    const live: ShardItem[] = []
    const liveIds = new Set<string>()
    if (Array.isArray(v)) {
      for (const it of v) {
        const id = (it as { id?: unknown })?.id
        if (typeof id !== 'string') continue
        liveIds.add(id)
        live.push({ id, name: itemName(key, id, it), updatedAt: meta[id]?.u, raw: it })
      }
    } else if (v && typeof v === 'object') {
      for (const [id, it] of Object.entries(v as Record<string, unknown>)) {
        liveIds.add(id)
        const u = meta[id]?.u ?? (it as { updatedAt?: number })?.updatedAt
        live.push({ id, name: itemName(key, id, it), updatedAt: u, raw: it })
      }
    }
    let tombstones = 0
    const now = Date.now()
    for (const [id, m] of Object.entries(meta)) {
      if (!liveIds.has(id) && m.d && now - m.d <= TOMBSTONE_TTL_MS) tombstones++
    }
    live.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return { live, tombstones }
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleItem(itemKey: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemKey)) next.delete(itemKey)
      else next.add(itemKey)
      return next
    })
  }

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
              <th>合并</th>
              <th>条目</th>
              <th>本地同步</th>
              <th>云端更新</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {KEY_LABELS.map(({ key, label }) => {
              const st = keyStatus(key, snap)
              const perItem = isItemKey(key)
              const count = itemCount(key)
              const isOpen = expanded.has(key)
              const failReason = snap.outbox[key]?.failed ? snap.outbox[key]?.lastError : undefined
              return (
                <Fragment key={key}>
                  <tr className="sync-row-expandable">
                    <td>
                      <button
                        type="button"
                        className="sync-expand-btn"
                        aria-expanded={isOpen}
                        onClick={() => toggleExpand(key)}
                      >
                        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={13} />
                        {label}
                      </button>
                    </td>
                    <td>
                      <span
                        className="sync-merge-tag"
                        title={
                          perItem
                            ? '逐条目独立合并：多设备改不同条目互不覆盖，同条目按时间取较新，删除带墓碑'
                            : '整块同步：本地有未同步改动则本地优先，否则采用云端最新值'
                        }
                      >
                        {perItem ? '逐条' : '整块'}
                      </span>
                    </td>
                    <td className="muted small">{count == null ? '—' : `${count} 条`}</td>
                    <td className="muted small">{fmt(snap.lastSynced[key])}</td>
                    <td className="muted small">{fmt(snap.remoteAt[key])}</td>
                    <td>
                      <span className={`sync-chip is-${st.kind}`}>{st.text}</span>
                      {failReason && <span className="sync-err-reason" title={failReason}>{failReason}</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="sync-detail-row">
                      <td colSpan={6}>
                        {perItem
                          ? (() => {
                              const { live, tombstones } = shardItems(key)
                              if (live.length === 0 && tombstones === 0) {
                                return <p className="muted small" style={{ margin: 0 }}>暂无条目。</p>
                              }
                              return (
                                <>
                                  <ul className="sync-item-list">
                                    {live.map((it) => {
                                      const itemKey = `${key}:${it.id}`
                                      const itemOpen = expandedItems.has(itemKey)
                                      return (
                                        <li key={it.id} className="sync-item">
                                          <button
                                            type="button"
                                            className="sync-item-head"
                                            aria-expanded={itemOpen}
                                            onClick={() => toggleItem(itemKey)}
                                          >
                                            <Icon
                                              name={itemOpen ? 'chevron-down' : 'chevron-right'}
                                              size={12}
                                            />
                                            <span className="sync-item-name">{it.name}</span>
                                            <span className="sync-item-time">
                                              {it.updatedAt ? `改动 ${fmt(it.updatedAt)}` : '—'}
                                            </span>
                                          </button>
                                          {itemOpen && <JsonBlock value={it.raw} />}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                  {tombstones > 0 && (
                                    <p className="muted small" style={{ margin: '6px 0 0' }}>
                                      另有 {tombstones} 条已删除（墓碑，约 30 天后清理，用于避免旧数据复活）。
                                    </p>
                                  )}
                                </>
                              )
                            })()
                          : <JsonBlock value={valueByKey[key]} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
        标「逐条」的分片按条目合并：每条攻略 / 物价 / 待办各自独立同步，两台设备各改不同条目不会互相
        覆盖，同一条目按修改时刻取较新，删除也带时间戳不会被旧数据复活。点分片展开可逐条查看最近改动
        时刻，再点单条即可看它同步的完整 JSON（整块类分片展开则直接看整块数据），方便核对与排障。
        内置攻略与内置物价来自应用本身、不入云端，因此不在此列。断网时改动先存本地队列（待上传），
        联网后自动重试。
      </p>
    </div>
  )
}
