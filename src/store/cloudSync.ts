// ============================================================================
// 云同步引擎：把 useAppStore 的各分片与 Supabase 表 user_data 双向同步。
//
// 数据模型：user_data(user_id, key, value jsonb, updated_at)，一行 = 一个 storageKey。
// RLS 保证每个用户只能读写自己的行（见 supabase/migrations/0001_init.sql）。
//
// 合并策略（按 key 独立处理，简单可预测）：
//  · 登录时（pull）：云端存在该 key → 以云端为准写回本地（"登录=找回我的账号数据"）；
//    云端缺该 key 而本地有 → 把本地推上去（首次启用云同步时不会丢数据）。
//  · 登录后：本地改动 → 防抖 upsert 上行；其它设备的改动经 Realtime 下行，
//    仅当远端 updated_at 比本地记录更新时才应用（同时天然过滤掉自己推送的回声）。
//
// 局限（已知、可接受）：登出状态下的离线本地改动，在下次登录时可能被云端较新数据覆盖。
// 图片（IndexedDB）暂不在此同步范围内，后续接 Supabase Storage。
// ============================================================================

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { STORAGE_KEYS } from '../types'
import { onLocalCommit, applyExternalUpdate, readAllSlices } from './useAppStore'
import { onImageCommit, getAllImages, applyImagesFromRemote } from './imageStore'

const TABLE = 'user_data'
/** 图片表：一行 = 一张图片（id -> base64 data URL），与 IndexedDB / markdown 的 img:<id> 对应。 */
const IMAGES_TABLE = 'user_images'
/** 图片较大，批量上行时分块，避免单次请求体过大。 */
const IMAGE_PUSH_CHUNK = 10
/** 本地记录的各 key 最近一次同步/提交时间戳（storageKey -> epoch ms），用于 LWW 比较。 */
const META_KEY = 'mhxy.sync.meta.v1'
const SYNCED_KEYS: readonly string[] = Object.values(STORAGE_KEYS)
/** 本地改动上行前的防抖窗口，合并连续编辑。 */
const DEBOUNCE_MS = 900

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'
type StatusCb = (s: SyncStatus) => void

type Meta = Record<string, number>

function loadMeta(): Meta {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Meta
  } catch {
    return {}
  }
}

function saveMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m))
  } catch {
    /* 配额等异常忽略：meta 丢失最多导致一次多余的下行应用，幂等无害 */
  }
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
const pendingTimers = new Map<string, number>()
let statusCb: StatusCb | null = null

function setStatus(s: SyncStatus) {
  statusCb?.(s)
}

/**
 * 启动某用户的云同步：先做一次全量合并，再挂上本地改动监听与 Realtime 下行。
 * 幂等：同一 userId 重复调用直接返回；切换用户会先清理旧的。
 */
export async function startCloudSync(userId: string, onStatus: StatusCb): Promise<void> {
  if (!supabase) return
  if (currentUserId === userId) {
    statusCb = onStatus
    return
  }
  stopCloudSync()
  currentUserId = userId
  statusCb = onStatus

  setStatus('syncing')
  let ok = true
  try {
    await pull(userId)
  } catch (err) {
    ok = false
    console.warn('[cloudSync] 初次同步失败，稍后本地改动仍会尝试上行', err)
  }
  // 图片同步是独立的尽力而为步骤：未建 user_images 表时不影响文本同步
  try {
    await pullImages(userId)
  } catch (err) {
    console.warn('[cloudSync] 图片初次同步失败（可能未建 user_images 表）', err)
  }
  setStatus(ok ? 'synced' : 'error')

  // 本地文本改动 → 防抖上行
  unsubscribeCommit = onLocalCommit((storageKey, value) => {
    if (currentUserId !== userId) return
    if (!SYNCED_KEYS.includes(storageKey)) return
    schedulePush(storageKey, value)
  })

  // 本地图片增删 → 同步到云端图片表
  unsubscribeImage = onImageCommit((c) => {
    if (currentUserId !== userId) return
    if (c.type === 'put') void pushImage(userId, c.id, c.dataUrl)
    else if (c.type === 'delete') void deleteImagesRemote(userId, c.ids)
    else void clearImagesRemote(userId)
  })

  // 其它设备的文本改动 → Realtime 下行（未开启表复制时，此订阅静默不生效，无副作用）
  // 图片较大，不走 Realtime；换设备时在登录/刷新时统一拉取。
  subscribeRealtime(userId)
}

/** 停止同步并清理所有监听/定时器（登出或切换用户时调用）。 */
export function stopCloudSync(): void {
  unsubscribeCommit?.()
  unsubscribeCommit = null
  unsubscribeImage?.()
  unsubscribeImage = null
  if (realtimeChannel && supabase) {
    void supabase.removeChannel(realtimeChannel)
  }
  realtimeChannel = null
  for (const t of pendingTimers.values()) window.clearTimeout(t)
  pendingTimers.clear()
  currentUserId = null
}

/** 登录时的一次性合并：云端已有的写回本地，本地独有的推上去。 */
async function pull(userId: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase
    .from(TABLE)
    .select('key,value,updated_at')
    .eq('user_id', userId)
  if (error) throw error

  const meta = loadMeta()
  const rows = data ?? []
  const remoteKeys = new Set(rows.map((r) => r.key as string))

  // 1) 云端 → 本地（云端为准）
  for (const row of rows) {
    const key = row.key as string
    if (!SYNCED_KEYS.includes(key)) continue
    applyExternalUpdate(key, row.value)
    meta[key] = new Date(row.updated_at as string).getTime()
  }

  // 2) 本地独有（云端缺失且本地非空）→ 推上去
  const nowIso = new Date().toISOString()
  const now = Date.now()
  const toPush = readAllSlices()
    .filter(({ key, value }) => !remoteKeys.has(key) && !isEmptyValue(value))
    .map(({ key, value }) => {
      meta[key] = now
      return { user_id: userId, key, value, updated_at: nowIso }
    })
  if (toPush.length > 0) {
    const { error: upErr } = await supabase.from(TABLE).upsert(toPush, { onConflict: 'user_id,key' })
    if (upErr) throw upErr
  }

  saveMeta(meta)
}

/** 防抖调度某个 key 的上行（连续编辑只保留最后一次的值）。 */
function schedulePush(storageKey: string, value: unknown) {
  const prev = pendingTimers.get(storageKey)
  if (prev !== undefined) window.clearTimeout(prev)
  const t = window.setTimeout(() => {
    pendingTimers.delete(storageKey)
    void pushOne(storageKey, value)
  }, DEBOUNCE_MS)
  pendingTimers.set(storageKey, t)
}

async function pushOne(storageKey: string, value: unknown): Promise<void> {
  if (!supabase || !currentUserId) return
  const now = Date.now()
  // 先落 meta：我们主动写入的 updated_at 与之相等，Realtime 回声即被过滤
  const meta = loadMeta()
  meta[storageKey] = now
  saveMeta(meta)

  setStatus('syncing')
  const { error } = await supabase.from(TABLE).upsert(
    { user_id: currentUserId, key: storageKey, value, updated_at: new Date(now).toISOString() },
    { onConflict: 'user_id,key' },
  )
  if (error) {
    console.warn('[cloudSync] 上行失败', storageKey, error)
    setStatus('error')
  } else {
    setStatus('synced')
  }
}

function subscribeRealtime(userId: string) {
  if (!supabase) return
  realtimeChannel = supabase
    .channel(`user_data:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as { key?: string; value?: unknown; updated_at?: string } | null
        if (!row?.key || !row.updated_at || !SYNCED_KEYS.includes(row.key)) return
        const remoteTs = new Date(row.updated_at).getTime()
        const meta = loadMeta()
        // 不比本地更新 → 忽略（含过滤掉自己刚推送的回声）
        if (remoteTs <= (meta[row.key] ?? 0)) return
        applyExternalUpdate(row.key, row.value)
        meta[row.key] = remoteTs
        saveMeta(meta)
      },
    )
    .subscribe()
}

// ---------------------------------------------------------------------------
// 图片同步（user_images 表；base64 data URL）
// 策略：登录时把云端图片写回本地、把本地独有的推上去；之后本地增删即时同步。
// 不做 LWW / Realtime——图片是「一次写入、按 id 引用」的不可变内容，够用且省流量。
// ---------------------------------------------------------------------------

/** 登录时的一次性图片合并：云端 → 本地（静默），本地独有 → 云端（分块）。 */
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
  const toPush = Object.entries(localAll)
    .filter(([id]) => !remoteIds.has(id))
    .map(([id, data_url]) => ({ user_id: userId, id, data_url }))
  for (let i = 0; i < toPush.length; i += IMAGE_PUSH_CHUNK) {
    const chunk = toPush.slice(i, i + IMAGE_PUSH_CHUNK)
    const { error: upErr } = await supabase
      .from(IMAGES_TABLE)
      .upsert(chunk, { onConflict: 'user_id,id' })
    if (upErr) throw upErr
  }
}

async function pushImage(userId: string, id: string, dataUrl: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from(IMAGES_TABLE)
    .upsert({ user_id: userId, id, data_url: dataUrl }, { onConflict: 'user_id,id' })
  if (error) console.warn('[cloudSync] 图片上行失败', id, error)
}

async function deleteImagesRemote(userId: string, ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  const { error } = await supabase.from(IMAGES_TABLE).delete().eq('user_id', userId).in('id', ids)
  if (error) console.warn('[cloudSync] 图片删除同步失败', error)
}

async function clearImagesRemote(userId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from(IMAGES_TABLE).delete().eq('user_id', userId)
  if (error) console.warn('[cloudSync] 图片清空同步失败', error)
}

/** 登出或断开云同步后，清掉本地的同步元数据（下次登录重新以云端为准合并）。 */
export function clearSyncMeta(): void {
  try {
    localStorage.removeItem(META_KEY)
  } catch {
    /* ignore */
  }
}
