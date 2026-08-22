// ============================================================================
// 云同步引擎：把 useAppStore 的各分片与 Supabase 表 user_data 双向同步。
//
// 数据模型：user_data(user_id, key, value jsonb, meta jsonb, updated_at)，一行 = 一个
// storageKey。value 是分片的完整业务值；meta 是集合类分片的 per-item {id:{u,d}}（见迁移
// 0003 与 syncMerge）。RLS 保证每个用户只能读写自己的行（见 supabase/migrations/0001）。
//
// 送达（durability）—— outbox 模式：
//  本地改动先落持久化 outbox（syncStore），防抖上行；成功才移除，失败/断网留存。
//  online / 页面重新可见 / 定时器都会触发重试 → 「本地写不会因为断网而丢」。
//
// 合并（conflict）—— 按分片策略：
//  · 集合类（待办/副本/角色/攻略/物价/观测、攻略笔记/物价备注）：pull 与 Realtime 下行
//    都走 item 级合并 + 墓碑（syncMerge.mergeItemKey），两端各改不同条目也不会互相清掉；
//    同一条目的冲突按 per-item 时间戳 last-write-wins，删除也带时间戳、不会被旧数据复活。
//  · 单例类（设置/算价/置顶序）：整块 LWW——本地有未同步改动则本地胜，否则云端胜。
//
// 已知取舍（阶段三再解）：per-item 时间戳用客户端时钟，多设备时钟偏差可能选错赢家。
// 图片（IndexedDB）走独立的轻量队列：只把 id+op 入队，dataUrl 用时再从本地读，避免撑爆
// localStorage；登录/刷新时统一 pull，之后增删即时同步、失败重试。
// ============================================================================

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { STORAGE_KEYS } from '../types'
import { onLocalCommit, applyExternalUpdate, readAllSlices } from './useAppStore'
import {
  onImageCommit,
  getAllImages,
  getImages,
  applyImagesFromRemote,
  type ImageCommit,
} from './imageStore'
import {
  isItemKey,
  emptyValueOf,
  diffMeta,
  mergeItemKey,
  backfillMeta,
  type ItemMeta,
} from './syncMerge'
import * as ss from './syncStore'

export type { SyncStatus } from './syncStore'
type StatusCb = (s: ss.SyncStatus) => void

const TABLE = 'user_data'
const IMAGES_TABLE = 'user_images'
const IMAGE_PUSH_CHUNK = 10
/** 本地改动上行前的防抖窗口，合并连续编辑。 */
const DEBOUNCE_MS = 900
/** 图片增删的防抖窗口。 */
const IMAGE_DEBOUNCE_MS = 400
/** 存在待上行项时的定时重试间隔。 */
const RETRY_MS = 15000

/** 参与同步的分片（与 useAppStore.readAllSlices / applyExternalUpdate 覆盖一致；不含 quizRegion）。 */
const SYNCED_KEYS: readonly string[] = [
  STORAGE_KEYS.todos,
  STORAGE_KEYS.settings,
  STORAGE_KEYS.characters,
  STORAGE_KEYS.guides,
  STORAGE_KEYS.guideNotes,
  STORAGE_KEYS.guideTags,
  STORAGE_KEYS.guideRuns,
  STORAGE_KEYS.pinnedGuides,
  STORAGE_KEYS.priceItems,
  STORAGE_KEYS.priceComments,
  STORAGE_KEYS.priceObservations,
  STORAGE_KEYS.synth,
]

interface RemoteRow {
  key?: string
  value?: unknown
  meta?: unknown
  updated_at?: string
}

/**
 * meta 列是否可用：若迁移 0003 尚未执行（列不存在），首次读/写会命中错误，
 * 此后本会话降级为「不带 meta 的整块同步」（集合类退回整块 LWW），不至于让同步完全瘫痪。
 * 用户执行迁移后重新加载即自动恢复 per-item 合并。
 */
let metaColumnAvailable = true
function isMissingMetaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /\bmeta\b/i.test(error.message ?? '')
}

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

// —— 运行时状态 ——
let currentUserId: string | null = null
let unsubscribeCommit: (() => void) | null = null
let unsubscribeImage: (() => void) | null = null
let realtimeChannel: RealtimeChannel | null = null
let statusCb: StatusCb | null = null
const pendingTimers = new Map<string, number>()
let imageFlushTimer: number | null = null
let retryTimer: number | null = null
/** 每 key 上一次「见到」的值，用于本地提交时 diff 出 per-item 变更。 */
const lastSeen = new Map<string, unknown>()

function setStatus(s: ss.SyncStatus) {
  statusCb?.(s)
  ss.setStatus(s)
}
function recomputeStatus() {
  const snap = ss.getSyncInfoSnapshot()
  if (snap.failedCount > 0) setStatus('error')
  else if (snap.pendingCount > 0 || snap.imagePending > 0) setStatus('syncing')
  else setStatus('synced')
}

/** 按 key 读当前分片值（readAllSlices 只有 13 条，开销可忽略）。 */
function sliceValue(key: string): unknown {
  for (const s of readAllSlices()) if (s.key === key) return s.value
  return undefined
}

// ---------------------------------------------------------------------------
// 启停
// ---------------------------------------------------------------------------

/**
 * 启动某用户的云同步：先做一次 reconcile 合并，再挂上本地改动监听、Realtime 下行、
 * 以及 online/可见性/定时重试触发器。幂等：同一 userId 重复调用直接返回。
 */
export async function startCloudSync(userId: string, onStatus: StatusCb): Promise<void> {
  if (!supabase) return
  if (currentUserId === userId) {
    statusCb = onStatus
    return
  }
  teardown()

  // 换账号：清掉上一个账号残留的 outbox/meta，避免串号
  const owner = ss.getOwner()
  if (owner && owner !== userId) ss.resetSyncStore()
  ss.setOwner(userId)

  currentUserId = userId
  statusCb = onStatus

  initLastSeen()
  ensureBackfill()

  setStatus('syncing')
  let ok = true
  try {
    await pull(userId)
  } catch (err) {
    ok = false
    console.warn('[cloudSync] 初次同步失败，本地改动仍在 outbox 中，稍后自动重试', err)
  }
  try {
    await pullImages(userId)
  } catch (err) {
    console.warn('[cloudSync] 图片初次同步失败（可能未建 user_images 表）', err)
  }

  // 送出本次 pull 产生的合并结果 + 之前离线残留的 outbox
  await flushOutbox()
  if (ok) recomputeStatus()
  else setStatus('error')

  // 本地文本改动 → diff 出 per-item 变更 → 落 outbox → 防抖上行
  unsubscribeCommit = onLocalCommit(handleLocalCommit)
  // 本地图片增删 → 轻量队列 → 防抖上行
  unsubscribeImage = onImageCommit(handleImageCommit)
  // 其它设备的文本改动 → Realtime 下行合并（未开启表复制时静默不生效，无副作用）
  subscribeRealtime(userId)

  installGlobalListeners()
  startRetryTimer()
}

/** 停止同步并清理监听/定时器（登出或切换用户时调用）。不清 outbox（由 owner 变更或登出显式清）。 */
export function stopCloudSync(): void {
  teardown()
  currentUserId = null
}

function teardown() {
  unsubscribeCommit?.()
  unsubscribeCommit = null
  unsubscribeImage?.()
  unsubscribeImage = null
  if (realtimeChannel && supabase) void supabase.removeChannel(realtimeChannel)
  realtimeChannel = null
  for (const t of pendingTimers.values()) window.clearTimeout(t)
  pendingTimers.clear()
  if (imageFlushTimer !== null) window.clearTimeout(imageFlushTimer)
  imageFlushTimer = null
  stopRetryTimer()
  removeGlobalListeners()
}

// 说明：登出【不再】清空同步簿记（itemMeta / outbox）。清空会丢掉每条的真实时间戳，逼下次
// 登录用 ensureBackfill 回填——正是数据被覆盖的根因之一；且清 outbox 会丢未上行的离线改动。
// 换账号的隔离由 startCloudSync 里的 owner 判断兜底（owner !== userId → resetSyncStore）。

function initLastSeen() {
  lastSeen.clear()
  for (const { key, value } of readAllSlices()) lastSeen.set(key, value)
}

/**
 * 首次启用同步 / itemMeta 被清空（换账号、清站点数据、换 origin 如 localhost）时，给已存在
 * 的本地 item 回填 per-item 元数据——基准 u 必须取「最古」的 0，绝不能用 now。
 *
 * 曾经的数据丢失根因就在这：用 now 会让「刚 seed 出来的空值 / 陈旧本地数据」带上比云端真实
 * 改价时刻还新的时间戳，pull 合并（mergeItemKey 的 per-item LWW）时反杀云端、把好数据整片
 * 冲成空。基准取 0 后，本地未打过时间戳的条目一律认输：
 *  · 云端存在该条目（带真实 u，或由 updated_at 回填）→ 0 < 真实ms → 云端胜（好数据不再被覆盖）；
 *  · 云端没有该条目（缺席方 rTs=-1）→ 0 > -1 → 本地仍胜，本地独有数据照常上行、不丢。
 * 真正的用户改价走 handleLocalCommit→diffMeta，会打上 u=now，不受此基准影响、正常胜出。
 */
function ensureBackfill() {
  for (const { key, value } of readAllSlices()) {
    if (!isItemKey(key)) continue
    if (Object.keys(ss.getItemMeta(key)).length > 0) continue
    const bf = backfillMeta(key, value, 0)
    if (Object.keys(bf).length > 0) ss.setItemMeta(key, bf)
  }
}

// ---------------------------------------------------------------------------
// 本地文本改动 → outbox
// ---------------------------------------------------------------------------

function handleLocalCommit(storageKey: string, value: unknown) {
  if (currentUserId == null || !SYNCED_KEYS.includes(storageKey)) return
  const now = Date.now()
  let meta: ItemMeta | null = null
  if (isItemKey(storageKey)) {
    meta = diffMeta(storageKey, lastSeen.get(storageKey), value, ss.getItemMeta(storageKey), now)
    ss.setItemMeta(storageKey, meta)
  }
  lastSeen.set(storageKey, value)
  ss.outboxSet(storageKey, { value, meta, dirtySince: now })
  schedulePush(storageKey)
}

function schedulePush(key: string) {
  const prev = pendingTimers.get(key)
  if (prev !== undefined) window.clearTimeout(prev)
  const t = window.setTimeout(() => {
    pendingTimers.delete(key)
    void flushKey(key)
  }, DEBOUNCE_MS)
  pendingTimers.set(key, t)
}

/** 送出单个分片的 outbox 项；成功且期间无更新编辑才移除。 */
async function flushKey(key: string): Promise<void> {
  if (!supabase || currentUserId == null) return
  const entry = ss.outboxGet(key)
  if (!entry) return
  if (!navigator.onLine) {
    recomputeStatus()
    return
  }
  setStatus('syncing')
  const at = Date.now()
  const buildRow = (): Record<string, unknown> => {
    const row: Record<string, unknown> = {
      user_id: currentUserId,
      key,
      value: entry.value,
      updated_at: new Date(at).toISOString(),
    }
    if (isItemKey(key) && metaColumnAvailable) row.meta = entry.meta ?? {}
    return row
  }

  let { error } = await supabase.from(TABLE).upsert(buildRow(), { onConflict: 'user_id,key' })
  if (error && metaColumnAvailable && isMissingMetaError(error)) {
    metaColumnAvailable = false
    ss.logEvent({ at, dir: 'info', ok: false, msg: 'user_data.meta 列缺失，降级为整块同步（请执行迁移 0003）' })
    ;({ error } = await supabase.from(TABLE).upsert(buildRow(), { onConflict: 'user_id,key' }))
  }
  if (error) {
    ss.outboxMarkFailed(key, error.message)
    ss.logEvent({ at, dir: 'up', key, ok: false, msg: error.message })
    recomputeStatus()
    return
  }
  const cur = ss.outboxGet(key)
  if (cur && cur.dirtySince === entry.dirtySince) ss.outboxRemove(key)
  ss.setLastSynced(key, at)
  ss.notePush(at)
  ss.logEvent({ at, dir: 'up', key, ok: true })
  recomputeStatus()
}

/** 送出全部待上行项（文本 + 图片）。 */
async function flushOutbox(): Promise<void> {
  if (!navigator.onLine) return
  for (const key of Object.keys(ss.outboxAll())) await flushKey(key)
  await flushImages()
}

// ---------------------------------------------------------------------------
// 登录时的 reconcile：逐分片合并（集合类 item 级合并 / 单例类 dirty 优先）。
// ---------------------------------------------------------------------------

async function pull(userId: string): Promise<void> {
  if (!supabase) return

  let rows: RemoteRow[] = []
  if (metaColumnAvailable) {
    const res = await supabase.from(TABLE).select('key,value,meta,updated_at').eq('user_id', userId)
    if (res.error && isMissingMetaError(res.error)) {
      metaColumnAvailable = false
      ss.logEvent({
        at: Date.now(),
        dir: 'info',
        ok: false,
        msg: 'user_data.meta 列缺失，降级为整块同步（请执行迁移 0003）',
      })
    } else if (res.error) {
      throw res.error
    } else {
      rows = (res.data ?? []) as RemoteRow[]
    }
  }
  if (!metaColumnAvailable) {
    const res = await supabase.from(TABLE).select('key,value,updated_at').eq('user_id', userId)
    if (res.error) throw res.error
    rows = (res.data ?? []) as RemoteRow[]
  }

  const remoteByKey = new Map<string, { value: unknown; meta: ItemMeta | null; updatedAt: number }>()
  for (const r of rows) {
    if (!r.key) continue
    remoteByKey.set(r.key, {
      value: r.value,
      meta: (r.meta as ItemMeta | null) ?? null,
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : 0,
    })
  }

  const now = Date.now()
  for (const { key, value: localValue } of readAllSlices()) {
    if (!SYNCED_KEYS.includes(key)) continue
    const remote = remoteByKey.get(key)

    if (isItemKey(key)) {
      const remoteValue = remote?.value ?? emptyValueOf(key)
      const remoteMeta = remote
        ? (remote.meta ?? backfillMeta(key, remote.value, remote.updatedAt))
        : {}
      const merged = mergeItemKey(
        key,
        { value: localValue, meta: ss.getItemMeta(key) },
        { value: remoteValue, meta: remoteMeta },
        now,
      )
      if (merged.changedVsLocal) {
        applyExternalUpdate(key, merged.value)
        lastSeen.set(key, sliceValue(key))
      }
      ss.setItemMeta(key, merged.meta)
      if (remote) ss.setLastSynced(key, remote.updatedAt)
      if (merged.changedVsRemote || !remote) {
        ss.outboxSet(key, { value: merged.value, meta: merged.meta, dirtySince: now })
      }
    } else {
      // 单例：本地有未同步改动 → 本地胜（已/将入 outbox）；否则云端胜
      if (ss.outboxHas(key)) {
        // 保留本地，flushOutbox 会推上去
      } else if (remote) {
        applyExternalUpdate(key, remote.value)
        lastSeen.set(key, sliceValue(key))
        ss.setLastSynced(key, remote.updatedAt)
      } else if (!isEmptyValue(localValue)) {
        ss.outboxSet(key, { value: localValue, meta: null, dirtySince: now })
      }
    }
  }

  const remoteAt: Record<string, number> = {}
  for (const [k, r] of remoteByKey) remoteAt[k] = r.updatedAt
  ss.setRemoteAt(remoteAt)
  ss.notePull(now)
}

// ---------------------------------------------------------------------------
// Realtime 下行（其它设备的改动）
// ---------------------------------------------------------------------------

function subscribeRealtime(userId: string) {
  if (!supabase) return
  realtimeChannel = supabase
    .channel(`user_data:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
      (payload) => void handleRealtime(payload.new as RemoteRow | null),
    )
    .subscribe()
}

async function handleRealtime(row: RemoteRow | null): Promise<void> {
  if (currentUserId == null) return
  if (!row?.key || !row.updated_at || !SYNCED_KEYS.includes(row.key)) return
  const key = row.key
  const remoteAtMs = new Date(row.updated_at).getTime()
  const now = Date.now()

  if (isItemKey(key)) {
    const remoteMeta = (row.meta as ItemMeta | null) ?? backfillMeta(key, row.value, remoteAtMs)
    const merged = mergeItemKey(
      key,
      { value: sliceValue(key), meta: ss.getItemMeta(key) },
      { value: row.value, meta: remoteMeta },
      now,
    )
    ss.setItemMeta(key, merged.meta)
    if (merged.changedVsLocal) {
      applyExternalUpdate(key, merged.value)
      lastSeen.set(key, sliceValue(key))
      ss.logEvent({ at: now, dir: 'down', key, ok: true })
    }
    ss.setLastSynced(key, Math.max(ss.getLastSynced(key), remoteAtMs))
    if (merged.changedVsRemote) {
      ss.outboxSet(key, { value: merged.value, meta: merged.meta, dirtySince: now })
      schedulePush(key)
    }
    // 合并了别处的更新 → 面板体现（即使本地无变化也刷新 remoteAt）
    ss.setRemoteAt({ ...ss.getSyncInfoSnapshot().remoteAt, [key]: remoteAtMs })
  } else {
    // 单例：回声/旧值过滤 + 本地未同步优先
    if (remoteAtMs <= ss.getLastSynced(key)) return
    if (ss.outboxHas(key)) return
    applyExternalUpdate(key, row.value)
    lastSeen.set(key, sliceValue(key))
    ss.setLastSynced(key, remoteAtMs)
    ss.setRemoteAt({ ...ss.getSyncInfoSnapshot().remoteAt, [key]: remoteAtMs })
    ss.logEvent({ at: now, dir: 'down', key, ok: true })
  }
}

// ---------------------------------------------------------------------------
// 图片同步（user_images 表；base64 data URL）——轻量队列 + 尽力而为
// ---------------------------------------------------------------------------

function handleImageCommit(c: ImageCommit) {
  if (currentUserId == null) return
  if (c.type === 'put') ss.imgQueuePut(c.id)
  else if (c.type === 'delete') ss.imgQueueDel(c.ids)
  else ss.imgQueueClear()
  scheduleImageFlush()
}

function scheduleImageFlush() {
  if (imageFlushTimer !== null) window.clearTimeout(imageFlushTimer)
  imageFlushTimer = window.setTimeout(() => {
    imageFlushTimer = null
    void flushImages()
  }, IMAGE_DEBOUNCE_MS)
}

/** 登录时的一次性图片合并：云端 → 本地（静默），本地独有 → 入队等待上行。 */
async function pullImages(userId: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .select('id,data_url')
    .eq('user_id', userId)
  if (error) throw error
  const rows = data ?? []

  const remoteMap: Record<string, string> = {}
  for (const r of rows) remoteMap[r.id as string] = r.data_url as string
  await applyImagesFromRemote(remoteMap)

  const remoteIds = new Set(rows.map((r) => r.id as string))
  const localAll = await getAllImages()
  for (const id of Object.keys(localAll)) if (!remoteIds.has(id)) ss.imgQueuePut(id)
}

async function flushImages(): Promise<void> {
  if (!supabase || currentUserId == null || !navigator.onLine) return
  const uid = currentUserId

  // 1) 清空（优先，且作废其它逐条项）
  const q0 = ss.imgQueueGet()
  if (q0.clear) {
    const { error } = await supabase.from(IMAGES_TABLE).delete().eq('user_id', uid)
    if (error) {
      ss.logEvent({ at: Date.now(), dir: 'up', key: 'images', ok: false, msg: error.message })
      recomputeStatus()
      return
    }
    ss.imgQueueClearDone()
  }

  const q = ss.imgQueueGet()
  const puts = Object.entries(q.ops).filter(([, op]) => op === 'put').map(([id]) => id)
  const dels = Object.entries(q.ops).filter(([, op]) => op === 'del').map(([id]) => id)

  // 2) 删除
  if (dels.length) {
    const { error } = await supabase.from(IMAGES_TABLE).delete().eq('user_id', uid).in('id', dels)
    if (error) {
      ss.logEvent({ at: Date.now(), dir: 'up', key: 'images', ok: false, msg: error.message })
      recomputeStatus()
      return
    }
    ss.imgQueueRemove(dels)
  }

  // 3) 上传（dataUrl 现从 IndexedDB 读；已被删掉的直接出队）
  if (puts.length) {
    const map = await getImages(puts)
    const missing = puts.filter((id) => !map[id])
    if (missing.length) ss.imgQueueRemove(missing)
    const rows = puts.filter((id) => map[id]).map((id) => ({ user_id: uid, id, data_url: map[id] }))
    for (let i = 0; i < rows.length; i += IMAGE_PUSH_CHUNK) {
      const chunk = rows.slice(i, i + IMAGE_PUSH_CHUNK)
      const { error } = await supabase.from(IMAGES_TABLE).upsert(chunk, { onConflict: 'user_id,id' })
      if (error) {
        ss.logEvent({ at: Date.now(), dir: 'up', key: 'images', ok: false, msg: error.message })
        recomputeStatus()
        return
      }
      ss.imgQueueRemove(chunk.map((r) => r.id))
    }
  }
  recomputeStatus()
}

// ---------------------------------------------------------------------------
// 触发器：online / 页面可见 / 定时重试
// ---------------------------------------------------------------------------

/**
 * 重连类触发（online / 页面可见 / 定时重试）先 pull 再 flush（改法 1）：
 * outbox 里可能是「陈旧 / 空」的整片数组，盲推会盖掉云端他端的并发改动。先 pull 会把 outbox
 * 重建成「云端好数据 + 本地编辑」的合并值（见 pull 的 item 分支 outboxSet），再推就不会误盖。
 * realtime 只推重连之后的变更、不补断线缺口，这个回补只能靠 pull。无待上行文本项时跳过 pull
 * ——避免每次切回标签页都全量拉一次。
 */
async function reconcileAndFlush(): Promise<void> {
  if (!navigator.onLine || currentUserId == null) return
  if (ss.getSyncInfoSnapshot().pendingCount > 0) {
    try {
      await pull(currentUserId)
    } catch (err) {
      console.warn('[cloudSync] 重连前 pull 合并失败，仍尝试送出 outbox', err)
    }
  }
  await flushOutbox()
}

function onOnline() {
  void reconcileAndFlush()
}
function onVisibility() {
  if (document.visibilityState === 'visible') void reconcileAndFlush()
}
function installGlobalListeners() {
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
}
function removeGlobalListeners() {
  window.removeEventListener('online', onOnline)
  document.removeEventListener('visibilitychange', onVisibility)
}
function startRetryTimer() {
  stopRetryTimer()
  retryTimer = window.setInterval(() => {
    const snap = ss.getSyncInfoSnapshot()
    if ((snap.pendingCount > 0 || snap.imagePending > 0) && navigator.onLine) void reconcileAndFlush()
  }, RETRY_MS)
}
function stopRetryTimer() {
  if (retryTimer !== null) window.clearInterval(retryTimer)
  retryTimer = null
}

// ---------------------------------------------------------------------------
// 面板动作
// ---------------------------------------------------------------------------

/** 立即同步：重新 reconcile 一次并送出全部待上行项。 */
export async function flushNow(): Promise<void> {
  if (!supabase || currentUserId == null) return
  setStatus('syncing')
  try {
    await pull(currentUserId)
  } catch (err) {
    console.warn('[cloudSync] 立即同步的 pull 失败', err)
  }
  await flushOutbox()
  recomputeStatus()
}

/** 重试失败项：清掉失败标记后再送一遍。 */
export async function retryFailed(): Promise<void> {
  ss.outboxClearFailedFlags()
  await flushOutbox()
}

/** 轻量拉取各 key 的云端 updated_at，仅用于面板展示对比。 */
export async function refreshRemoteTimes(): Promise<void> {
  if (!supabase || currentUserId == null) return
  const { data, error } = await supabase.from(TABLE).select('key,updated_at').eq('user_id', currentUserId)
  if (error) return
  const map: Record<string, number> = {}
  for (const r of (data ?? []) as RemoteRow[]) {
    if (r.key && r.updated_at) map[r.key] = new Date(r.updated_at).getTime()
  }
  ss.setRemoteAt(map)
}
