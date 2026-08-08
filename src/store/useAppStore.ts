// ============================================================================
// 全局状态仓库（单一数据源）
// 基于 useSyncExternalStore：任何组件的修改会即时同步到所有订阅者，
// 并自动持久化到 localStorage。各功能模块通过下方「分片 Hook」消费，
// 不要直接改动本文件以外的存储逻辑。
// ============================================================================

import { useSyncExternalStore } from 'react'
import {
  STORAGE_KEYS,
  type TodoTask,
  type TodoCycle,
  type SeedTimer,
  type SeedMode,
  type Dungeon,
  type DungeonCycle,
  type HouseState,
  type AppSettings,
  type Character,
  type GuideEntry,
  type GuideCategory,
  type GuideSection,
  type GuideNote,
  type PriceItem,
  type PriceComment,
  type PriceObservation,
  type SynthInputs,
  SOLO_CHARACTER_ID,
} from '../types'
import { DEFAULT_SETTINGS, createDefaultHouse, SERVANT_ROOM_TIERS } from '../data/gameData'
import { DEFAULT_PRICE_ITEMS } from '../data/prices'
import { DEFAULT_SYNTH_INPUTS } from '../utils/synth'
import { currentCleanliness, currentDurability, clamp } from '../utils/house'
import { uid } from '../utils/id'
import { getAllImages, putImages, clearImages } from './imageStore'

// ---------------------------------------------------------------------------
// 内部状态
// ---------------------------------------------------------------------------

interface AppState {
  todos: TodoTask[]
  seeds: SeedTimer[]
  dungeons: Dungeon[]
  house: HouseState
  settings: AppSettings
  characters: Character[]
  /** 用户自定义攻略（内置攻略来自 data，不在此） */
  guides: GuideEntry[]
  /** 内置攻略的用户补充内容：攻略id -> Markdown 笔记 */
  guideNotes: Record<string, GuideNote>
  /** 置顶攻略 id 列表（内置/自定义均可，按置顶顺序，最新在前） */
  pinnedGuides: string[]
  /** 用户自定义物价条目（内置参考条目来自 data，不在此） */
  priceItems: PriceItem[]
  /** 物价条目的用户备注：物品id -> 备注 */
  priceComments: Record<string, PriceComment>
  /** 价格观测（OCR 识别的带时间戳记录，用于趋势） */
  priceObservations: PriceObservation[]
  /** 算价页的输入记忆（宝石/星辉石/五色灵尘/九转金丹的基准价与品质） */
  synth: SynthInputs
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * 物价条目加载：仅在「本浏览器从未写过该 key」（真·首次进入）时，植入一份可删除的
 * 默认清单（常见任务产出道具，价格留空自填）。用户删空后 key 已存在，不会再补回。
 * 已有数据（含空数组）的老用户保持原样，避免打扰。
 */
function loadPriceItems(): PriceItem[] {
  const raw = localStorage.getItem(STORAGE_KEYS.priceItems)
  if (raw == null) {
    const seeded = DEFAULT_PRICE_ITEMS.map((it) => ({ ...it }))
    save(STORAGE_KEYS.priceItems, seeded)
    return seeded
  }
  try {
    return JSON.parse(raw) as PriceItem[]
  } catch {
    return []
  }
}

/**
 * 待办数据迁移：旧版用单一 lastCompletedPeriodKey 记录完成，
 * 新版改为按角色 completions。确保每条都带 completions，
 * 旧的完成状态迁移到保留角色 SOLO_CHARACTER_ID 上。
 */
function migrateTodos(todos: TodoTask[]): TodoTask[] {
  return todos.map((t) => {
    const hasCompletions = !!t.completions
    // 已迁移且无遗留字段 → 原样返回（保持引用不变，便于检测是否发生迁移）
    if (hasCompletions && t.lastCompletedPeriodKey === undefined) return t
    const completions: Record<string, string> = { ...(t.completions ?? {}) }
    if (!hasCompletions && t.lastCompletedPeriodKey) {
      completions[SOLO_CHARACTER_ID] = t.lastCompletedPeriodKey
    }
    const next: TodoTask = { ...t, completions }
    // 丢弃已废弃字段，保证迁移幂等、导出干净
    delete next.lastCompletedPeriodKey
    return next
  })
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[store] 持久化 "${key}" 失败`, err)
  }
}

const rawTodos = load<TodoTask[]>(STORAGE_KEYS.todos, [])
const migratedTodos = migrateTodos(rawTodos)

let state: AppState = {
  todos: migratedTodos,
  seeds: load<SeedTimer[]>(STORAGE_KEYS.seeds, []),
  dungeons: load<Dungeon[]>(STORAGE_KEYS.dungeons, []),
  // 合并默认值，确保旧数据也带上新字段（如 servantRoomLevel）
  house: { ...createDefaultHouse(Date.now()), ...load<Partial<HouseState>>(STORAGE_KEYS.house, {}) },
  settings: { ...DEFAULT_SETTINGS, ...load<Partial<AppSettings>>(STORAGE_KEYS.settings, {}) },
  characters: load<Character[]>(STORAGE_KEYS.characters, []),
  guides: load<GuideEntry[]>(STORAGE_KEYS.guides, []),
  guideNotes: load<Record<string, GuideNote>>(STORAGE_KEYS.guideNotes, {}),
  pinnedGuides: load<string[]>(STORAGE_KEYS.pinnedGuides, []),
  priceItems: loadPriceItems(),
  priceComments: load<Record<string, PriceComment>>(STORAGE_KEYS.priceComments, {}),
  priceObservations: load<PriceObservation[]>(STORAGE_KEYS.priceObservations, []),
  synth: { ...DEFAULT_SYNTH_INPUTS, ...load<Partial<SynthInputs>>(STORAGE_KEYS.synth, {}) },
}

// 若初始加载触发了迁移（migrateTodos 对未变项保持同一引用），立即落盘，
// 让 localStorage 立刻变为新格式，避免旧格式长期滞留。
if (migratedTodos.some((t, i) => t !== rawTodos[i])) {
  save(STORAGE_KEYS.todos, migratedTodos)
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ---------------------------------------------------------------------------
// 本地变更监听（供云同步层订阅）
// 每次「本地」发起的分片提交都会通知，携带对应 storageKey 与新值，
// 云同步据此把该分片防抖上传。注意：来自远程/跨标签页的「外部更新」
// 走 applyExternalUpdate，不触发这些监听，避免回声（收到→又推上去）。
// ---------------------------------------------------------------------------
type CommitListener = (storageKey: string, value: unknown) => void
const commitListeners = new Set<CommitListener>()

/** 订阅本地分片提交；返回取消订阅函数。 */
export function onLocalCommit(fn: CommitListener): () => void {
  commitListeners.add(fn)
  return () => {
    commitListeners.delete(fn)
  }
}

/** 以不可变方式更新某个分片并持久化 + 通知（本地提交，会触发 commitListeners） */
function setSlice<K extends keyof AppState>(key: K, value: AppState[K], storageKey: string) {
  state = { ...state, [key]: value }
  save(storageKey, value)
  emit()
  for (const l of commitListeners) l(storageKey, value)
}

/**
 * 应用一条「外部更新」到对应分片：用于跨标签页 storage 事件与云同步下行。
 * 会做与初始加载一致的规范化（todos 迁移、settings/house 合并默认值），
 * 落盘 + 通知订阅者，但【不】触发 commitListeners（防止回声）。
 * @returns 是否识别并应用了该 storageKey
 */
export function applyExternalUpdate(storageKey: string, parsed: unknown): boolean {
  let sliceKey: keyof AppState
  let value: AppState[keyof AppState]
  switch (storageKey) {
    case STORAGE_KEYS.todos:
      sliceKey = 'todos'
      value = migrateTodos(parsed as TodoTask[])
      break
    case STORAGE_KEYS.seeds:
      sliceKey = 'seeds'
      value = parsed as SeedTimer[]
      break
    case STORAGE_KEYS.dungeons:
      sliceKey = 'dungeons'
      value = parsed as Dungeon[]
      break
    case STORAGE_KEYS.house:
      sliceKey = 'house'
      value = { ...createDefaultHouse(Date.now()), ...(parsed as Partial<HouseState>) }
      break
    case STORAGE_KEYS.settings:
      sliceKey = 'settings'
      value = { ...DEFAULT_SETTINGS, ...(parsed as Partial<AppSettings>) }
      break
    case STORAGE_KEYS.characters:
      sliceKey = 'characters'
      value = parsed as Character[]
      break
    case STORAGE_KEYS.guides:
      sliceKey = 'guides'
      value = parsed as GuideEntry[]
      break
    case STORAGE_KEYS.guideNotes:
      sliceKey = 'guideNotes'
      value = parsed as Record<string, GuideNote>
      break
    case STORAGE_KEYS.pinnedGuides:
      sliceKey = 'pinnedGuides'
      value = parsed as string[]
      break
    case STORAGE_KEYS.priceItems:
      sliceKey = 'priceItems'
      value = parsed as PriceItem[]
      break
    case STORAGE_KEYS.priceComments:
      sliceKey = 'priceComments'
      value = parsed as Record<string, PriceComment>
      break
    case STORAGE_KEYS.priceObservations:
      sliceKey = 'priceObservations'
      value = parsed as PriceObservation[]
      break
    case STORAGE_KEYS.synth:
      sliceKey = 'synth'
      value = { ...DEFAULT_SYNTH_INPUTS, ...(parsed as Partial<SynthInputs>) }
      break
    default:
      return false
  }
  // 内联落盘 + 通知（刻意不走 setSlice，避免触发 commitListeners 造成回声）
  state = { ...state, [sliceKey]: value }
  save(storageKey, value)
  emit()
  return true
}

/** 全量读取各分片（storageKey -> 当前值），云同步首次上传时使用。 */
export function readAllSlices(): { key: string; value: unknown }[] {
  return [
    { key: STORAGE_KEYS.todos, value: state.todos },
    { key: STORAGE_KEYS.seeds, value: state.seeds },
    { key: STORAGE_KEYS.dungeons, value: state.dungeons },
    { key: STORAGE_KEYS.house, value: state.house },
    { key: STORAGE_KEYS.settings, value: state.settings },
    { key: STORAGE_KEYS.characters, value: state.characters },
    { key: STORAGE_KEYS.guides, value: state.guides },
    { key: STORAGE_KEYS.guideNotes, value: state.guideNotes },
    { key: STORAGE_KEYS.pinnedGuides, value: state.pinnedGuides },
    { key: STORAGE_KEYS.priceItems, value: state.priceItems },
    { key: STORAGE_KEYS.priceComments, value: state.priceComments },
    { key: STORAGE_KEYS.priceObservations, value: state.priceObservations },
    { key: STORAGE_KEYS.synth, value: state.synth },
  ]
}

// ---------------------------------------------------------------------------
// 跨标签页同步：其它标签页修改 localStorage 时，更新本页状态
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || e.newValue == null) return
    try {
      applyExternalUpdate(e.key, JSON.parse(e.newValue))
    } catch {
      /* ignore */
    }
  })
}

// ===========================================================================
// Actions —— 各分片的增删改
// ===========================================================================

function nextOrder(items: { order?: number }[]): number {
  return items.reduce((m, it) => Math.max(m, it.order ?? 0), 0) + 1
}

// ---- TODO ----
export const todoActions = {
  add(input: { name: string; cycle: TodoCycle; note?: string; preset?: boolean }) {
    const task: TodoTask = {
      id: uid('todo_'),
      name: input.name.trim(),
      cycle: input.cycle,
      note: input.note?.trim() || undefined,
      preset: input.preset,
      completions: {},
      order: nextOrder(state.todos),
    }
    setSlice('todos', [...state.todos, task], STORAGE_KEYS.todos)
  },
  update(id: string, patch: Partial<Omit<TodoTask, 'id'>>) {
    setSlice(
      'todos',
      state.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      STORAGE_KEYS.todos,
    )
  },
  remove(id: string) {
    setSlice('todos', state.todos.filter((t) => t.id !== id), STORAGE_KEYS.todos)
  },
  /** 切换【某个角色】本周期完成。periodKey 与角色 ID 由调用方传入。 */
  toggleCharacter(id: string, charId: string, periodKey: string) {
    setSlice(
      'todos',
      state.todos.map((t) => {
        if (t.id !== id) return t
        const completions = { ...(t.completions ?? {}) }
        if (completions[charId] === periodKey) delete completions[charId]
        else completions[charId] = periodKey
        return { ...t, completions }
      }),
      STORAGE_KEYS.todos,
    )
  },
  /** 一次性把指定角色集合全部标记完成 / 全部取消（主勾选框用）。 */
  setAllCharacters(id: string, charIds: string[], periodKey: string, done: boolean) {
    setSlice(
      'todos',
      state.todos.map((t) => {
        if (t.id !== id) return t
        const completions = { ...(t.completions ?? {}) }
        for (const cid of charIds) {
          if (done) completions[cid] = periodKey
          else delete completions[cid]
        }
        return { ...t, completions }
      }),
      STORAGE_KEYS.todos,
    )
  },
  reorder(orderedIds: string[]) {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]))
    setSlice(
      'todos',
      state.todos.map((t) => ({ ...t, order: orderMap.get(t.id) ?? t.order })),
      STORAGE_KEYS.todos,
    )
  },
}

// ---- 种子 ----
export const seedActions = {
  add(input: {
    seedName: string
    level: number
    plantedAt: number
    /** timer 模式所需；cycle 模式可省略（不使用，存 0） */
    durationMs?: number
    /** 计时方式；缺省按 'timer' */
    mode?: SeedMode
    note?: string
  }) {
    const seed: SeedTimer = {
      id: uid('seed_'),
      seedName: input.seedName.trim() || '种子',
      level: input.level,
      plantedAt: input.plantedAt,
      durationMs: input.durationMs ?? 0,
      mode: input.mode,
      note: input.note?.trim() || undefined,
    }
    setSlice('seeds', [...state.seeds, seed], STORAGE_KEYS.seeds)
  },
  update(id: string, patch: Partial<Omit<SeedTimer, 'id'>>) {
    setSlice(
      'seeds',
      state.seeds.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      STORAGE_KEYS.seeds,
    )
  },
  /** 重新种植：把种植时间设为指定时刻，并清掉「今日养护」标记，重新开始周期 */
  replant(id: string, plantedAt: number) {
    seedActions.update(id, { plantedAt, lastCareDayKey: undefined })
  },
  /** cycle 模式：切换「今日已养护」（dayKey = 当前每日周期 Key，跨日自动失效） */
  toggleCared(id: string, dayKey: string) {
    setSlice(
      'seeds',
      state.seeds.map((s) =>
        s.id === id
          ? { ...s, lastCareDayKey: s.lastCareDayKey === dayKey ? undefined : dayKey }
          : s,
      ),
      STORAGE_KEYS.seeds,
    )
  },
  remove(id: string) {
    setSlice('seeds', state.seeds.filter((s) => s.id !== id), STORAGE_KEYS.seeds)
  },
}

// ---- 副本 ----
export const dungeonActions = {
  add(input: { name: string; resetCycle: DungeonCycle; required?: boolean; note?: string; preset?: boolean }) {
    const d: Dungeon = {
      id: uid('dgn_'),
      name: input.name.trim(),
      resetCycle: input.resetCycle,
      required: input.required ?? true,
      note: input.note?.trim() || undefined,
      preset: input.preset,
      order: nextOrder(state.dungeons),
    }
    setSlice('dungeons', [...state.dungeons, d], STORAGE_KEYS.dungeons)
  },
  update(id: string, patch: Partial<Omit<Dungeon, 'id'>>) {
    setSlice(
      'dungeons',
      state.dungeons.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      STORAGE_KEYS.dungeons,
    )
  },
  remove(id: string) {
    setSlice('dungeons', state.dungeons.filter((d) => d.id !== id), STORAGE_KEYS.dungeons)
  },
  setRequired(id: string, required: boolean) {
    dungeonActions.update(id, { required })
  },
  /** 切换「本周期已完成」 */
  toggle(id: string, periodKey: string) {
    setSlice(
      'dungeons',
      state.dungeons.map((d) =>
        d.id === id
          ? {
              ...d,
              lastCompletedPeriodKey:
                d.lastCompletedPeriodKey === periodKey ? undefined : periodKey,
            }
          : d,
      ),
      STORAGE_KEYS.dungeons,
    )
  },
}

// ---- 房屋 ----
/** 取佣人房等级对应的恢复档（越界回退到「无佣人房」） */
function servantTier(level: number) {
  return SERVANT_ROOM_TIERS[level] ?? SERVANT_ROOM_TIERS[0]
}

export const houseActions = {
  update(patch: Partial<HouseState>) {
    setSlice('house', { ...state.house, ...patch }, STORAGE_KEYS.house)
  },
  /** 打扫：按佣人房等级提升清洁度（封顶 100），同时把耐久结算到当前值，刷新时间戳 */
  clean(now: number) {
    const h = state.house
    const gain = servantTier(h.servantRoomLevel).cleanGain
    houseActions.update({
      cleanlinessBase: clamp(currentCleanliness(h, now) + gain, 0, 100),
      durabilityBase: currentDurability(h, now),
      updatedAt: now,
    })
  },
  /** 修理：按佣人房等级提升耐久度（封顶 100），同时把清洁结算到当前值，刷新时间戳 */
  repair(now: number) {
    const h = state.house
    const gain = servantTier(h.servantRoomLevel).durabilityGain
    houseActions.update({
      durabilityBase: clamp(currentDurability(h, now) + gain, 0, 100),
      cleanlinessBase: currentCleanliness(h, now),
      updatedAt: now,
    })
  },
  /** 一键补满清洁度到 100（耐久结算到当前值） */
  fillClean(now: number) {
    const h = state.house
    houseActions.update({
      cleanlinessBase: 100,
      durabilityBase: currentDurability(h, now),
      updatedAt: now,
    })
  },
  /** 一键补满耐久度到 100（清洁结算到当前值） */
  fillRepair(now: number) {
    const h = state.house
    houseActions.update({
      durabilityBase: 100,
      cleanlinessBase: currentCleanliness(h, now),
      updatedAt: now,
    })
  },
}

// ---- 设置 ----
export const settingsActions = {
  update(patch: Partial<AppSettings>) {
    setSlice('settings', { ...state.settings, ...patch }, STORAGE_KEYS.settings)
  },
}

// ---- 角色 ----
export const characterActions = {
  /** 添加角色；同名（去空格后）已存在则忽略。返回是否成功添加。 */
  add(name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false
    if (state.characters.some((c) => c.name === trimmed)) return false
    const c: Character = { id: uid('char_'), name: trimmed, order: nextOrder(state.characters) }
    setSlice('characters', [...state.characters, c], STORAGE_KEYS.characters)
    return true
  },
  /** 重命名角色；与其它角色重名则忽略。返回是否成功。 */
  rename(id: string, name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false
    if (state.characters.some((c) => c.id !== id && c.name === trimmed)) return false
    setSlice(
      'characters',
      state.characters.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
      STORAGE_KEYS.characters,
    )
    return true
  },
  /** 删除角色，并清掉所有待办里该角色的完成记录，避免残留孤儿数据。 */
  remove(id: string) {
    setSlice('characters', state.characters.filter((c) => c.id !== id), STORAGE_KEYS.characters)
    setSlice(
      'todos',
      state.todos.map((t) => {
        if (!t.completions || !(id in t.completions)) return t
        const completions = { ...t.completions }
        delete completions[id]
        return { ...t, completions }
      }),
      STORAGE_KEYS.todos,
    )
  },
  reorder(orderedIds: string[]) {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]))
    setSlice(
      'characters',
      state.characters.map((c) => ({ ...c, order: orderMap.get(c.id) ?? c.order })),
      STORAGE_KEYS.characters,
    )
  },
}

// ---- 攻略（仅用户自定义；内置攻略来自 data，不入库） ----
export const guideActions = {
  add(input: {
    title: string
    category: GuideCategory
    summary?: string
    tags?: string[]
    sections: GuideSection[]
  }): string {
    const now = Date.now()
    const g: GuideEntry = {
      id: uid('guide_'),
      title: input.title.trim() || '未命名攻略',
      category: input.category,
      summary: input.summary?.trim() || undefined,
      tags: input.tags?.map((t) => t.trim()).filter(Boolean),
      sections: input.sections,
      preset: false,
      order: nextOrder(state.guides),
      updatedAt: now,
    }
    setSlice('guides', [...state.guides, g], STORAGE_KEYS.guides)
    return g.id
  },
  update(id: string, patch: Partial<Omit<GuideEntry, 'id' | 'preset'>>) {
    setSlice(
      'guides',
      state.guides.map((g) =>
        g.id === id ? { ...g, ...patch, updatedAt: Date.now() } : g,
      ),
      STORAGE_KEYS.guides,
    )
  },
  remove(id: string) {
    setSlice('guides', state.guides.filter((g) => g.id !== id), STORAGE_KEYS.guides)
    // 删除自定义攻略时一并清理置顶，避免留下失效 id
    if (state.pinnedGuides.includes(id)) {
      setSlice('pinnedGuides', state.pinnedGuides.filter((x) => x !== id), STORAGE_KEYS.pinnedGuides)
    }
  },
  reorder(orderedIds: string[]) {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]))
    setSlice(
      'guides',
      state.guides.map((g) => ({ ...g, order: orderMap.get(g.id) ?? g.order })),
      STORAGE_KEYS.guides,
    )
  },
}

// ---- 攻略补充（内置攻略的用户自定义 Markdown 内容） ----
export const guideNoteActions = {
  /** 写入/更新某条攻略的补充内容；内容为空则等同删除 */
  set(guideId: string, markdown: string) {
    const text = markdown.trim()
    const next = { ...state.guideNotes }
    if (text) next[guideId] = { markdown: text, updatedAt: Date.now() }
    else delete next[guideId]
    setSlice('guideNotes', next, STORAGE_KEYS.guideNotes)
  },
  remove(guideId: string) {
    if (!(guideId in state.guideNotes)) return
    const next = { ...state.guideNotes }
    delete next[guideId]
    setSlice('guideNotes', next, STORAGE_KEYS.guideNotes)
  },
}

// ---- 攻略置顶（内置/自定义均可，仅存 id 列表；最新置顶排在最前） ----
export const pinnedGuideActions = {
  /** 切换某条攻略的置顶状态：未置顶则置顶（置于最前），已置顶则取消 */
  togglePin(guideId: string) {
    const cur = state.pinnedGuides
    const next = cur.includes(guideId) ? cur.filter((x) => x !== guideId) : [guideId, ...cur]
    setSlice('pinnedGuides', next, STORAGE_KEYS.pinnedGuides)
  },
}

// ---- 物价（仅用户自定义条目；内置参考条目来自 data，不入库） ----
export const priceActions = {
  add(input: { name: string; category?: string; price?: string; desc?: string }): string {
    const item: PriceItem = {
      id: uid('price_'),
      name: input.name.trim() || '未命名物品',
      category: input.category?.trim() || '其它',
      price: input.price?.trim() || undefined,
      desc: input.desc?.trim() || undefined,
      preset: false,
      order: nextOrder(state.priceItems),
    }
    setSlice('priceItems', [...state.priceItems, item], STORAGE_KEYS.priceItems)
    return item.id
  },
  update(id: string, patch: Partial<Omit<PriceItem, 'id' | 'preset'>>) {
    setSlice(
      'priceItems',
      state.priceItems.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      STORAGE_KEYS.priceItems,
    )
  },
  remove(id: string) {
    setSlice('priceItems', state.priceItems.filter((it) => it.id !== id), STORAGE_KEYS.priceItems)
  },
}

// ---- 物价备注（可附加在内置或自定义条目上；物品id -> 备注） ----
export const priceCommentActions = {
  /** 写入/更新某条物品的备注；内容为空则等同删除 */
  set(itemId: string, text: string) {
    const t = text.trim()
    const next = { ...state.priceComments }
    if (t) next[itemId] = { text: t, updatedAt: Date.now() }
    else delete next[itemId]
    setSlice('priceComments', next, STORAGE_KEYS.priceComments)
  },
  remove(itemId: string) {
    if (!(itemId in state.priceComments)) return
    const next = { ...state.priceComments }
    delete next[itemId]
    setSlice('priceComments', next, STORAGE_KEYS.priceComments)
  },
}

// ---- 价格观测（OCR 识别的带时间戳记录，用于趋势） ----
export const priceObservationActions = {
  /** 批量写入观测（OCR 校对后一次性保存） */
  addMany(inputs: Omit<PriceObservation, 'id'>[]): PriceObservation[] {
    const created = inputs.map((o) => ({ ...o, id: uid('obs_') }))
    setSlice(
      'priceObservations',
      [...state.priceObservations, ...created],
      STORAGE_KEYS.priceObservations,
    )
    return created
  },
  remove(id: string) {
    setSlice(
      'priceObservations',
      state.priceObservations.filter((o) => o.id !== id),
      STORAGE_KEYS.priceObservations,
    )
  },
  /** 删除某物品的全部观测 */
  clearItem(itemId: string) {
    setSlice(
      'priceObservations',
      state.priceObservations.filter((o) => o.itemId !== itemId),
      STORAGE_KEYS.priceObservations,
    )
  },
  clearAll() {
    setSlice('priceObservations', [], STORAGE_KEYS.priceObservations)
  },
}

// ---- 算价（合成价格推算器的输入记忆；随其它分片本地持久化并云同步） ----
export const synthActions = {
  /** 局部更新算价输入（合并进现有值）。 */
  update(patch: Partial<SynthInputs>) {
    setSlice('synth', { ...state.synth, ...patch }, STORAGE_KEYS.synth)
  },
}

// ---- 数据管理（导入 / 导出 / 重置） ----
// 备份格式 = 全量 state + images（IndexedDB 图片库，id -> base64 data URL）。
// 图片在 IndexedDB（异步），因此导出/导入/重置均为 async。
export const dataActions = {
  async exportJSON(): Promise<string> {
    const images = await getAllImages().catch(() => ({}) as Record<string, string>)
    return JSON.stringify({ ...state, images }, null, 2)
  },
  async importJSON(json: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(json) as Partial<AppState> & {
        images?: Record<string, string>
      }
      if (parsed.todos) setSlice('todos', migrateTodos(parsed.todos), STORAGE_KEYS.todos)
      if (parsed.seeds) setSlice('seeds', parsed.seeds, STORAGE_KEYS.seeds)
      if (parsed.dungeons) setSlice('dungeons', parsed.dungeons, STORAGE_KEYS.dungeons)
      if (parsed.house) setSlice('house', parsed.house, STORAGE_KEYS.house)
      if (parsed.settings)
        setSlice('settings', { ...DEFAULT_SETTINGS, ...parsed.settings }, STORAGE_KEYS.settings)
      if (parsed.characters) setSlice('characters', parsed.characters, STORAGE_KEYS.characters)
      if (parsed.guides) setSlice('guides', parsed.guides, STORAGE_KEYS.guides)
      if (parsed.guideNotes) setSlice('guideNotes', parsed.guideNotes, STORAGE_KEYS.guideNotes)
      if (parsed.pinnedGuides)
        setSlice('pinnedGuides', parsed.pinnedGuides, STORAGE_KEYS.pinnedGuides)
      if (parsed.priceItems) setSlice('priceItems', parsed.priceItems, STORAGE_KEYS.priceItems)
      if (parsed.priceComments)
        setSlice('priceComments', parsed.priceComments, STORAGE_KEYS.priceComments)
      if (parsed.priceObservations)
        setSlice('priceObservations', parsed.priceObservations, STORAGE_KEYS.priceObservations)
      if (parsed.synth)
        setSlice('synth', { ...DEFAULT_SYNTH_INPUTS, ...parsed.synth }, STORAGE_KEYS.synth)
      if (parsed.images) await putImages(parsed.images)
      return true
    } catch {
      return false
    }
  },
  async resetAll(now: number): Promise<void> {
    setSlice('todos', [], STORAGE_KEYS.todos)
    setSlice('seeds', [], STORAGE_KEYS.seeds)
    setSlice('dungeons', [], STORAGE_KEYS.dungeons)
    setSlice('house', createDefaultHouse(now), STORAGE_KEYS.house)
    setSlice('settings', { ...DEFAULT_SETTINGS }, STORAGE_KEYS.settings)
    setSlice('characters', [], STORAGE_KEYS.characters)
    setSlice('guides', [], STORAGE_KEYS.guides)
    setSlice('guideNotes', {}, STORAGE_KEYS.guideNotes)
    setSlice('pinnedGuides', [], STORAGE_KEYS.pinnedGuides)
    setSlice('priceItems', [], STORAGE_KEYS.priceItems)
    setSlice('priceComments', {}, STORAGE_KEYS.priceComments)
    setSlice('priceObservations', [], STORAGE_KEYS.priceObservations)
    setSlice('synth', { ...DEFAULT_SYNTH_INPUTS }, STORAGE_KEYS.synth)
    await clearImages().catch(() => {})
  },
}

// ===========================================================================
// 选择器 Hook —— 组件用这些读取状态（自动订阅、即时更新）
// ===========================================================================

function useSelector<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

/** 待办分片：返回数据 + 操作 */
export function useTodos() {
  const todos = useSelector((s) => s.todos)
  return { todos, ...todoActions }
}

/** 种子分片 */
export function useSeeds() {
  const seeds = useSelector((s) => s.seeds)
  return { seeds, ...seedActions }
}

/** 副本分片 */
export function useDungeons() {
  const dungeons = useSelector((s) => s.dungeons)
  return { dungeons, ...dungeonActions }
}

/** 房屋分片 */
export function useHouse() {
  const house = useSelector((s) => s.house)
  return { house, ...houseActions }
}

/** 设置分片 */
export function useSettings() {
  const settings = useSelector((s) => s.settings)
  return { settings, ...settingsActions }
}

/** 角色分片：返回（按 order 排序的）角色列表 + 操作 */
export function useCharacters() {
  const characters = useSelector((s) => s.characters)
  return { characters, ...characterActions }
}

/** 攻略分片：仅返回用户自定义攻略（内置攻略由组件合并 data 提供） */
export function useGuides() {
  const guides = useSelector((s) => s.guides)
  return { guides, ...guideActions }
}

/** 攻略补充分片：内置攻略的用户自定义 Markdown 内容（攻略id -> 笔记） */
export function useGuideNotes() {
  const guideNotes = useSelector((s) => s.guideNotes)
  return { guideNotes, ...guideNoteActions }
}

/** 攻略置顶分片：置顶的攻略 id 列表 + 操作 */
export function usePinnedGuides() {
  const pinnedGuides = useSelector((s) => s.pinnedGuides)
  return { pinnedGuides, ...pinnedGuideActions }
}

/** 物价分片：仅返回用户自定义条目（内置参考条目由组件合并 data 提供） */
export function usePriceItems() {
  const priceItems = useSelector((s) => s.priceItems)
  return { priceItems, ...priceActions }
}

/** 物价备注分片：物品id -> 用户备注 */
export function usePriceComments() {
  const priceComments = useSelector((s) => s.priceComments)
  return { priceComments, ...priceCommentActions }
}

/** 价格观测分片：OCR 识别的带时间戳记录（用于趋势） */
export function usePriceObservations() {
  const priceObservations = useSelector((s) => s.priceObservations)
  return { priceObservations, ...priceObservationActions }
}

/** 算价分片：合成价格推算器的输入记忆 + 操作 */
export function useSynth() {
  const synth = useSelector((s) => s.synth)
  return { synth, ...synthActions }
}

/** 只读全量状态（用于概览 / 导出） */
export function useFullState(): AppState {
  return useSelector((s) => s)
}
