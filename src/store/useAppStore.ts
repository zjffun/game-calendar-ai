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
  type Dungeon,
  type DungeonCycle,
  type HouseState,
  type AppSettings,
} from '../types'
import { DEFAULT_SETTINGS, createDefaultHouse } from '../data/gameData'
import { currentCleanliness, currentDurability } from '../utils/house'
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

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[store] 持久化 "${key}" 失败`, err)
  }
}

let state: AppState = {
  todos: load<TodoTask[]>(STORAGE_KEYS.todos, []),
  seeds: load<SeedTimer[]>(STORAGE_KEYS.seeds, []),
  dungeons: load<Dungeon[]>(STORAGE_KEYS.dungeons, []),
  house: load<HouseState>(STORAGE_KEYS.house, createDefaultHouse(Date.now())),
  settings: { ...DEFAULT_SETTINGS, ...load<Partial<AppSettings>>(STORAGE_KEYS.settings, {}) },
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
          state = { ...state, todos: parsed }
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
  /** 切换「本周期完成」。periodKey 由调用方按当前周期计算后传入。 */
  toggle(id: string, periodKey: string) {
    setSlice(
      'todos',
      state.todos.map((t) =>
        t.id === id
          ? {
              ...t,
              lastCompletedPeriodKey:
                t.lastCompletedPeriodKey === periodKey ? undefined : periodKey,
            }
          : t,
      ),
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
    durationMs: number
    note?: string
  }) {
    const seed: SeedTimer = {
      id: uid('seed_'),
      seedName: input.seedName.trim() || '种子',
      level: input.level,
      plantedAt: input.plantedAt,
      durationMs: input.durationMs,
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
  /** 重新种植：把种植时间设为指定时刻（默认现在） */
  replant(id: string, plantedAt: number) {
    seedActions.update(id, { plantedAt })
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
export const houseActions = {
  update(patch: Partial<HouseState>) {
    setSlice('house', { ...state.house, ...patch }, STORAGE_KEYS.house)
  },
  /** 清洁：把洁净度重置为 100，同时把耐久结算到当前值，刷新时间戳 */
  clean(now: number) {
    const h = state.house
    houseActions.update({
      cleanlinessBase: 100,
      durabilityBase: currentDurability(h, now),
      updatedAt: now,
    })
  },
  /** 修理：把耐久重置为 100，同时把洁净度结算到当前值，刷新时间戳 */
  repair(now: number) {
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

// ---- 数据管理（导入 / 导出 / 重置） ----
export const dataActions = {
  exportJSON(): string {
    return JSON.stringify(state, null, 2)
  },
  importJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json) as Partial<AppState>
      if (parsed.todos) setSlice('todos', parsed.todos, STORAGE_KEYS.todos)
      if (parsed.seeds) setSlice('seeds', parsed.seeds, STORAGE_KEYS.seeds)
      if (parsed.dungeons) setSlice('dungeons', parsed.dungeons, STORAGE_KEYS.dungeons)
      if (parsed.house) setSlice('house', parsed.house, STORAGE_KEYS.house)
      if (parsed.settings)
        setSlice('settings', { ...DEFAULT_SETTINGS, ...parsed.settings }, STORAGE_KEYS.settings)
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

/** 只读全量状态（用于概览 / 导出） */
export function useFullState(): AppState {
  return useSelector((s) => s)
}
