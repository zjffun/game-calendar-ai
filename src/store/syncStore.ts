// ============================================================================
// 同步层的持久化状态 + 面板可订阅快照（单一数据源）。
//
// 持久化到 localStorage 的几块（都很小）：
//  · itemMeta 镜像   mhxy.sync.itemmeta.v1 —— 每分片的 per-item {u,d}，与云端 meta 列对应。
//  · lastSynced      mhxy.sync.meta.v1     —— 每 key 最近一次成功同步的 ms（Realtime 回声过滤）。
//  · outbox          mhxy.sync.outbox.v1   —— 待上行的分片（含 value/meta），送达成功才移除；
//                                            断网/失败留存，联网重试 → 保证「本地写不丢」。
//  · imgQueue        mhxy.sync.imgqueue.v1 —— 图片待办（只存 id+op，dataUrl 用时再从 IndexedDB 读，
//                                            避免把大图塞进 localStorage）。
//  · log             mhxy.sync.log.v1      —— 最近同步事件环形缓冲，供「同步日志」展示。
//
// 另外维护一个内存快照（叠加 status / remoteAt 等瞬态），通过 subscribe/getSnapshot
// 暴露给设置页的「同步详情」面板（useSyncExternalStore 消费）。
// ============================================================================

import type { ItemMeta } from './syncMerge'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

const K_ITEMMETA = 'mhxy.sync.itemmeta.v1'
const K_LASTSYNCED = 'mhxy.sync.meta.v1'
const K_OUTBOX = 'mhxy.sync.outbox.v1'
const K_IMGQUEUE = 'mhxy.sync.imgqueue.v1'
const K_LOG = 'mhxy.sync.log.v1'
/** outbox 归属的用户 id：换账号时据此清理，避免把上一个账号的待上行数据推给新账号。 */
const K_OWNER = 'mhxy.sync.owner.v1'
const LOG_MAX = 60

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 配额等异常忽略：这些是可重建的辅助状态，丢失最多导致一次多余的合并，幂等无害 */
  }
}

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 一个待上行分片：合并后的 value + meta，加上入队时间与失败信息。 */
export interface OutboxEntry {
  value: unknown
  meta: ItemMeta | null
  dirtySince: number
  failed?: boolean
  lastError?: string
}

export type ImageOp = 'put' | 'del'
export interface ImageQueue {
  ops: Record<string, ImageOp>
  /** 待执行的「清空云端图片」标记（清空动作与逐条增删互斥，置位后逐条项作废）。 */
  clear?: boolean
}

export type SyncEventDir = 'up' | 'down' | 'info'
export interface SyncEvent {
  at: number
  dir: SyncEventDir
  key?: string
  ok: boolean
  msg?: string
}

export interface SyncInfoSnapshot {
  status: SyncStatus
  lastPullAt?: number
  lastPushAt?: number
  /** 每 key 最近成功同步时刻。 */
  lastSynced: Record<string, number>
  /** 每 key 云端 updated_at（面板「刷新」时拉取填充）。 */
  remoteAt: Record<string, number>
  /** 待上行分片的轻量视图（不含 value/meta）。 */
  outbox: Record<string, { dirtySince: number; failed: boolean; lastError?: string }>
  pendingCount: number
  failedCount: number
  imagePending: number
  log: SyncEvent[]
}

// ---------------------------------------------------------------------------
// itemMeta 镜像
// ---------------------------------------------------------------------------

type ItemMetaAll = Record<string, ItemMeta>

export function getItemMeta(key: string): ItemMeta {
  return readJSON<ItemMetaAll>(K_ITEMMETA, {})[key] ?? {}
}
export function setItemMeta(key: string, meta: ItemMeta): void {
  const all = readJSON<ItemMetaAll>(K_ITEMMETA, {})
  all[key] = meta
  writeJSON(K_ITEMMETA, all)
}

// ---------------------------------------------------------------------------
// lastSynced
// ---------------------------------------------------------------------------

type LastSynced = Record<string, number>

export function getLastSynced(key: string): number {
  return readJSON<LastSynced>(K_LASTSYNCED, {})[key] ?? 0
}
export function setLastSynced(key: string, ms: number): void {
  const all = readJSON<LastSynced>(K_LASTSYNCED, {})
  all[key] = ms
  writeJSON(K_LASTSYNCED, all)
  refreshSnapshot()
}

// ---------------------------------------------------------------------------
// outbox
// ---------------------------------------------------------------------------

type Outbox = Record<string, OutboxEntry>

export function outboxAll(): Outbox {
  return readJSON<Outbox>(K_OUTBOX, {})
}
export function outboxGet(key: string): OutboxEntry | undefined {
  return outboxAll()[key]
}
export function outboxHas(key: string): boolean {
  return key in outboxAll()
}
export function outboxSet(key: string, entry: OutboxEntry): void {
  const all = outboxAll()
  all[key] = entry
  writeJSON(K_OUTBOX, all)
  refreshSnapshot()
}
export function outboxRemove(key: string): void {
  const all = outboxAll()
  if (!(key in all)) return
  delete all[key]
  writeJSON(K_OUTBOX, all)
  refreshSnapshot()
}
export function outboxMarkFailed(key: string, err: string): void {
  const all = outboxAll()
  const e = all[key]
  if (!e) return
  e.failed = true
  e.lastError = err
  writeJSON(K_OUTBOX, all)
  refreshSnapshot()
}
/** 重试失败项：清掉 failed 标记（不改 value），交给下一轮 flush。 */
export function outboxClearFailedFlags(): void {
  const all = outboxAll()
  let touched = false
  for (const e of Object.values(all)) {
    if (e.failed) {
      e.failed = false
      e.lastError = undefined
      touched = true
    }
  }
  if (touched) {
    writeJSON(K_OUTBOX, all)
    refreshSnapshot()
  }
}

// ---------------------------------------------------------------------------
// 图片队列
// ---------------------------------------------------------------------------

export function imgQueueGet(): ImageQueue {
  return readJSON<ImageQueue>(K_IMGQUEUE, { ops: {} })
}
function imgQueueWrite(q: ImageQueue) {
  writeJSON(K_IMGQUEUE, q)
  refreshSnapshot()
}
export function imgQueuePut(id: string): void {
  const q = imgQueueGet()
  q.ops[id] = 'put'
  imgQueueWrite(q)
}
export function imgQueueDel(ids: string[]): void {
  const q = imgQueueGet()
  for (const id of ids) q.ops[id] = 'del'
  imgQueueWrite(q)
}
export function imgQueueClear(): void {
  // 清空覆盖一切：作废逐条项，只留 clear 标记
  imgQueueWrite({ ops: {}, clear: true })
}
export function imgQueueRemove(ids: string[]): void {
  const q = imgQueueGet()
  for (const id of ids) delete q.ops[id]
  imgQueueWrite(q)
}
export function imgQueueClearDone(): void {
  const q = imgQueueGet()
  if (q.clear) {
    q.clear = false
    imgQueueWrite(q)
  }
}
function imgPendingCount(q: ImageQueue): number {
  return Object.keys(q.ops).length + (q.clear ? 1 : 0)
}

// ---------------------------------------------------------------------------
// 事件日志
// ---------------------------------------------------------------------------

export function logEvent(ev: SyncEvent): void {
  const log = readJSON<SyncEvent[]>(K_LOG, [])
  log.unshift(ev)
  if (log.length > LOG_MAX) log.length = LOG_MAX
  writeJSON(K_LOG, log)
  refreshSnapshot()
}

// ---------------------------------------------------------------------------
// 复位（登出时）：清掉同步簿记，但【不动】业务数据本身（仍在 useAppStore/localStorage）。
// 下次登录以「本地 store × 云端」重新合并。
// ---------------------------------------------------------------------------

export function getOwner(): string | null {
  try {
    return localStorage.getItem(K_OWNER)
  } catch {
    return null
  }
}
export function setOwner(userId: string): void {
  try {
    localStorage.setItem(K_OWNER, userId)
  } catch {
    /* ignore */
  }
}

export function resetSyncStore(): void {
  for (const k of [K_ITEMMETA, K_LASTSYNCED, K_OUTBOX, K_IMGQUEUE, K_LOG, K_OWNER]) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  remoteAt = {}
  status = 'idle'
  lastPullAt = undefined
  lastPushAt = undefined
  refreshSnapshot()
}

// ---------------------------------------------------------------------------
// 内存瞬态 + 快照
// ---------------------------------------------------------------------------

let status: SyncStatus = 'idle'
let remoteAt: Record<string, number> = {}
let lastPullAt: number | undefined
let lastPushAt: number | undefined

export function setStatus(s: SyncStatus): void {
  if (status === s) return
  status = s
  refreshSnapshot()
}
export function getStatus(): SyncStatus {
  return status
}
export function setRemoteAt(map: Record<string, number>): void {
  remoteAt = map
  refreshSnapshot()
}
export function notePull(at: number): void {
  lastPullAt = at
  refreshSnapshot()
}
export function notePush(at: number): void {
  lastPushAt = at
  refreshSnapshot()
}

const listeners = new Set<() => void>()
let snapshot: SyncInfoSnapshot = buildSnapshot()

function buildSnapshot(): SyncInfoSnapshot {
  const outboxRaw = outboxAll()
  const outbox: SyncInfoSnapshot['outbox'] = {}
  let pendingCount = 0
  let failedCount = 0
  for (const [key, e] of Object.entries(outboxRaw)) {
    outbox[key] = { dirtySince: e.dirtySince, failed: !!e.failed, lastError: e.lastError }
    pendingCount++
    if (e.failed) failedCount++
  }
  return {
    status,
    lastPullAt,
    lastPushAt,
    lastSynced: readJSON<LastSynced>(K_LASTSYNCED, {}),
    remoteAt,
    outbox,
    pendingCount,
    failedCount,
    imagePending: imgPendingCount(imgQueueGet()),
    log: readJSON<SyncEvent[]>(K_LOG, []),
  }
}

function refreshSnapshot(): void {
  snapshot = buildSnapshot()
  for (const l of listeners) l()
}

/** 供 useSyncExternalStore 订阅（面板用）。 */
export function subscribeSyncInfo(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
export function getSyncInfoSnapshot(): SyncInfoSnapshot {
  return snapshot
}
