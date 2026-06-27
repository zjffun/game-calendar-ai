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
  SOLO_CHARACTER_ID,
} from '../types'
import { DEFAULT_SETTINGS, createDefaultHouse, SERVANT_ROOM_TIERS } from '../data/gameData'
import { currentCleanliness, currentDurability, clamp } from '../utils/house'
import { uid } from '../utils/id'

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

/** 以不可变方式更新某个分片并持久化 + 通知 */
function setSlice<K extends keyof AppState>(key: K, value: AppState[K], storageKey: string) {
  state = { ...state, [key]: value }
  save(storageKey, value)
  emit()
}

// ---------------------------------------------------------------------------
// 跨标签页同步：其它标签页修改 localStorage 时，更新本页状态
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || e.newValue == null) return
    try {
      const parsed = JSON.parse(e.newValue)
      switch (e.key) {
        case STORAGE_KEYS.todos:
          state = { ...state, todos: migrateTodos(parsed) }
          break
        case STORAGE_KEYS.seeds:
          state = { ...state, seeds: parsed }
          break
        case STORAGE_KEYS.dungeons:
          state = { ...state, dungeons: parsed }
          break
        case STORAGE_KEYS.house:
          state = { ...state, house: parsed }
          break
        case STORAGE_KEYS.settings:
          state = { ...state, settings: { ...DEFAULT_SETTINGS, ...parsed } }
          break
        case STORAGE_KEYS.characters:
          state = { ...state, characters: parsed }
          break
        case STORAGE_KEYS.guides:
          state = { ...state, guides: parsed }
          break
        default:
          return
      }
      emit()
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

// ---- 数据管理（导入 / 导出 / 重置） ----
export const dataActions = {
  exportJSON(): string {
    return JSON.stringify(state, null, 2)
  },
  importJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json) as Partial<AppState>
      if (parsed.todos) setSlice('todos', migrateTodos(parsed.todos), STORAGE_KEYS.todos)
      if (parsed.seeds) setSlice('seeds', parsed.seeds, STORAGE_KEYS.seeds)
      if (parsed.dungeons) setSlice('dungeons', parsed.dungeons, STORAGE_KEYS.dungeons)
      if (parsed.house) setSlice('house', parsed.house, STORAGE_KEYS.house)
      if (parsed.settings)
        setSlice('settings', { ...DEFAULT_SETTINGS, ...parsed.settings }, STORAGE_KEYS.settings)
      if (parsed.characters) setSlice('characters', parsed.characters, STORAGE_KEYS.characters)
      if (parsed.guides) setSlice('guides', parsed.guides, STORAGE_KEYS.guides)
      return true
    } catch {
      return false
    }
  },
  resetAll(now: number) {
    setSlice('todos', [], STORAGE_KEYS.todos)
    setSlice('seeds', [], STORAGE_KEYS.seeds)
    setSlice('dungeons', [], STORAGE_KEYS.dungeons)
    setSlice('house', createDefaultHouse(now), STORAGE_KEYS.house)
    setSlice('settings', { ...DEFAULT_SETTINGS }, STORAGE_KEYS.settings)
    setSlice('characters', [], STORAGE_KEYS.characters)
    setSlice('guides', [], STORAGE_KEYS.guides)
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

/** 只读全量状态（用于概览 / 导出） */
export function useFullState(): AppState {
  return useSelector((s) => s)
}
