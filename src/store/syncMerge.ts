// ============================================================================
// 同步合并核心（纯函数，无副作用、可单测）。
//
// 把每个 storageKey 归到一种合并策略：
//  · itemArray —— 值是「带 id 的对象数组」（待办/副本/角色/攻略/物价/观测）：
//    按 item id 合并，逐条 last-write-wins + 墓碑（删除也带时间戳，避免被旧数据复活）。
//  · itemMap   —— 值是「id -> 对象」的 Record（攻略笔记/攻略标签/物价备注）：同上，按键 id 合并。
//  · whole     —— 单例值（设置/算价/置顶序/答题区）：不拆条，整块 LWW（在 cloudSync 里
//    以「本地是否有未同步改动」为准裁决，避免跨端时钟比较）。
//
// per-item 元数据 ItemMeta：{ [id]: { u:最近修改ms, d?:删除(墓碑)ms } }，
// 随分片一起存到 user_data.meta 列（见迁移 0003）。value 列仍是干净的业务值
// （不含墓碑），墓碑只活在 meta 里——所以 useAppStore 与各组件完全无需改动。
// ============================================================================

import { STORAGE_KEYS } from '../types'

/** 单条 item 的同步元数据：u=最近修改时刻(ms)，d=删除时刻(ms，存在即墓碑)。 */
export type ItemMetaEntry = { u: number; d?: number }
/** 一个分片的 per-item 元数据：item id -> 元数据。 */
export type ItemMeta = Record<string, ItemMetaEntry>

export type KeyStrategy = 'itemArray' | 'itemMap' | 'whole'

/** 墓碑保留时长：超过则在下次 diff/merge 时被 GC 清除（30 天足够覆盖多端补同步）。 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const STRATEGY: Record<string, KeyStrategy> = {
  [STORAGE_KEYS.todos]: 'itemArray',
  [STORAGE_KEYS.characters]: 'itemArray',
  [STORAGE_KEYS.guides]: 'itemArray',
  [STORAGE_KEYS.priceItems]: 'itemArray',
  [STORAGE_KEYS.priceObservations]: 'itemArray',
  [STORAGE_KEYS.guideNotes]: 'itemMap',
  [STORAGE_KEYS.guideTags]: 'itemMap',
  [STORAGE_KEYS.guideRuns]: 'itemMap',
  [STORAGE_KEYS.priceComments]: 'itemMap',
  // 其余（settings/synth/pinnedGuides/quizRegion）落到默认 'whole'
}

export function strategyOf(key: string): KeyStrategy {
  return STRATEGY[key] ?? 'whole'
}

export function isItemKey(key: string): boolean {
  const s = strategyOf(key)
  return s === 'itemArray' || s === 'itemMap'
}

/** 该策略下的「空值」：数组分片 → []，Map 分片 → {}。仅用于 item 策略。 */
export function emptyValueOf(key: string): unknown {
  return strategyOf(key) === 'itemMap' ? {} : []
}

// —— 规范化比较：对象键排序后 JSON 化，屏蔽键序差异带来的假「变化」——
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const o = val as Record<string, unknown>
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(o).sort()) sorted[k] = o[k]
      return sorted
    }
    return val as unknown
  })
}
export function canonEqual(a: unknown, b: unknown): boolean {
  return canon(a) === canon(b)
}

/** 从分片值里取出 id -> item（保持数组原始顺序）。仅对 item 策略有意义。 */
function itemsOf(key: string, value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const strat = strategyOf(key)
  if (strat === 'itemArray') {
    if (Array.isArray(value)) {
      for (const it of value) {
        const id = (it as { id?: unknown })?.id
        if (typeof id === 'string') out[id] = it
      }
    }
  } else if (strat === 'itemMap') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [id, v] of Object.entries(value as Record<string, unknown>)) out[id] = v
    }
  }
  return out
}

/** 由「有序 id 列表 + id->item」重建分片值（数组保序，Map 保插入序）。 */
function rebuild(key: string, orderedIds: string[], itemById: Record<string, unknown>): unknown {
  if (strategyOf(key) === 'itemArray') {
    return orderedIds.map((id) => itemById[id])
  }
  const obj: Record<string, unknown> = {}
  for (const id of orderedIds) obj[id] = itemById[id]
  return obj
}

/**
 * 本地提交后，diff 上一版与新版，推断出新的 per-item 元数据：
 *  · 新增 / 内容变化的 item → u=now；
 *  · 消失的 item → 打墓碑 d=now（保留原 u）；
 *  · 仍不在的旧墓碑 → 原样保留，超 TTL 则 GC。
 * whole 策略返回空 meta（不参与 item 合并）。
 */
export function diffMeta(
  key: string,
  prevValue: unknown,
  nextValue: unknown,
  prevMeta: ItemMeta,
  now: number,
): ItemMeta {
  if (!isItemKey(key)) return {}
  const prevItems = itemsOf(key, prevValue)
  const nextItems = itemsOf(key, nextValue)
  const meta: ItemMeta = {}
  const ids = new Set([
    ...Object.keys(prevItems),
    ...Object.keys(nextItems),
    ...Object.keys(prevMeta),
  ])
  for (const id of ids) {
    const prevEntry = prevMeta[id]
    const inNext = id in nextItems
    const inPrev = id in prevItems
    if (inNext) {
      const changed = !inPrev || !canonEqual(prevItems[id], nextItems[id])
      meta[id] = { u: changed ? now : (prevEntry?.u ?? now) }
    } else if (inPrev) {
      // 本次删除 → 新墓碑
      meta[id] = { u: prevEntry?.u ?? now, d: now }
    } else if (prevEntry) {
      // 早已不在：保留旧墓碑（或 meta），超 TTL 的墓碑丢弃
      if (prevEntry.d && now - prevEntry.d > TOMBSTONE_TTL_MS) continue
      meta[id] = prevEntry
    }
  }
  return meta
}

/** 给「有 value 无 meta」的旧行回填元数据：每个现存 id 记 u=ts（该行 updated_at）。 */
export function backfillMeta(key: string, value: unknown, ts: number): ItemMeta {
  const meta: ItemMeta = {}
  for (const id of Object.keys(itemsOf(key, value))) meta[id] = { u: ts }
  return meta
}

export interface SideData {
  value: unknown
  meta: ItemMeta
}
export interface MergeResult {
  value: unknown
  meta: ItemMeta
  /** 合并结果与本地值不同 → 需要写回本地（applyExternalUpdate）。 */
  changedVsLocal: boolean
  /** 合并结果与远端不同 → 需要上行推送。 */
  changedVsRemote: boolean
}

/**
 * item 级合并：对每个 id 取「有效时间戳 max(u,d) 更大」的一侧；
 * 相等时活着的一方优先、否则取本地。删除（墓碑）与编辑之间同样按时间戳裁决——
 * 删得更晚则删除生效，编辑更晚则复活为编辑后的内容。
 */
export function mergeItemKey(key: string, local: SideData, remote: SideData, now: number): MergeResult {
  const localItems = itemsOf(key, local.value)
  const remoteItems = itemsOf(key, remote.value)
  const lMeta = local.meta ?? {}
  const rMeta = remote.meta ?? {}

  const allIds = new Set([
    ...Object.keys(localItems),
    ...Object.keys(remoteItems),
    ...Object.keys(lMeta),
    ...Object.keys(rMeta),
  ])

  const mergedMeta: ItemMeta = {}
  const itemById: Record<string, unknown> = {}
  const aliveSet = new Set<string>()

  for (const id of allIds) {
    const lAlive = id in localItems
    const rAlive = id in remoteItems
    const le = lMeta[id]
    const re = rMeta[id]
    const lTs = Math.max(le?.u ?? (lAlive ? 0 : -1), le?.d ?? -1)
    const rTs = Math.max(re?.u ?? (rAlive ? 0 : -1), re?.d ?? -1)

    let pickLocal: boolean
    if (lTs > rTs) pickLocal = true
    else if (rTs > lTs) pickLocal = false
    else pickLocal = !(rAlive && !lAlive) // 平手：活着的一方优先，否则本地

    const alive = pickLocal ? lAlive : rAlive
    const entry = pickLocal ? le : re
    if (alive) {
      itemById[id] = pickLocal ? localItems[id] : remoteItems[id]
      mergedMeta[id] = { u: entry?.u ?? 0 }
      aliveSet.add(id)
    } else if (entry?.d) {
      if (now - entry.d <= TOMBSTONE_TTL_MS) mergedMeta[id] = { u: entry.u ?? 0, d: entry.d }
    }
  }

  // 顺序：先本地原序，再补远端独有——尽量维持用户看到的排列稳定
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const id of Object.keys(localItems)) {
    if (aliveSet.has(id) && !seen.has(id)) (ordered.push(id), seen.add(id))
  }
  for (const id of Object.keys(remoteItems)) {
    if (aliveSet.has(id) && !seen.has(id)) (ordered.push(id), seen.add(id))
  }

  const value = rebuild(key, ordered, itemById)
  return {
    value,
    meta: mergedMeta,
    changedVsLocal: !canonEqual(value, local.value),
    changedVsRemote: !canonEqual(value, remote.value) || !canonEqual(mergedMeta, rMeta),
  }
}
