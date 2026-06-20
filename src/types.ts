// ============================================================================
// 梦幻西游 游戏日历 —— 全局类型契约
// 所有功能模块都依赖此文件中的类型。请勿在功能模块中重复定义这些类型。
// ============================================================================

/** TODO 周期类型 */
export type TodoCycle = 'daily' | 'weekly' | 'monthly'

/**
 * 一条 TODO 任务。
 * 完成状态用「最近完成的周期 Key」表示：渲染时把它和「当前周期 Key」比较，
 * 相等即视为本周期已完成；跨天/跨周/跨月后会自动重置为未完成（无需定时任务）。
 */
export interface TodoTask {
  id: string
  name: string
  cycle: TodoCycle
  /** 是否来自内置预设（仅用于 UI 标识，可被删除） */
  preset?: boolean
  /** 备注（可选） */
  note?: string
  /** 最近一次完成时所属的周期 Key，例如每日 '2026-06-20'、每周 '2026-W25'、每月 '2026-06' */
  lastCompletedPeriodKey?: string
  /** 排序权重，越小越靠前 */
  order?: number
}

/** 内置预设 TODO（用于「常用任务」勾选添加） */
export interface PresetTodo {
  name: string
  cycle: TodoCycle
  /** 分类标签，例如 '日常' '帮派' '活动' */
  category?: string
}

// ----------------------------------------------------------------------------
// 庭院种子倒计时
// ----------------------------------------------------------------------------

/**
 * 一株正在生长的庭院种子。
 * 成熟时间 = plantedAt + durationMs。
 */
export interface SeedTimer {
  id: string
  /** 种子名称/等级，例如 '二级种子' '三级种子' 或自定义 */
  seedName: string
  /** 种子等级（用于配色/分组），1/2/3，自定义可为 0 */
  level: number
  /** 种植时间（epoch 毫秒） */
  plantedAt: number
  /** 生长所需时长（毫秒） */
  durationMs: number
  /** 备注，例如种在哪个花盆 */
  note?: string
}

/** 种子预设（用于快速添加，时长可在 UI 中调整） */
export interface SeedPreset {
  seedName: string
  level: number
  /** 默认生长时长（毫秒）—— 可由用户在界面上调整 */
  defaultDurationMs: number
}

// ----------------------------------------------------------------------------
// 副本刷新与完成追踪
// ----------------------------------------------------------------------------

export type DungeonCycle = 'daily' | 'weekly'

/**
 * 一个副本。
 * - 通过 resetCycle + 周期重置点 计算「下次刷新倒计时」。
 * - lastCompletedPeriodKey 与当前周期 Key 相等即视为「本周期已完成」，刷新后自动回到未完成。
 */
export interface Dungeon {
  id: string
  name: string
  /** 刷新周期：每日 / 每周 */
  resetCycle: DungeonCycle
  /** 是否为「本期需要完成」的目标副本 */
  required: boolean
  /** 最近一次完成所属的周期 Key */
  lastCompletedPeriodKey?: string
  preset?: boolean
  note?: string
  order?: number
}

/** 副本预设 */
export interface DungeonPreset {
  name: string
  resetCycle: DungeonCycle
  note?: string
}

// ----------------------------------------------------------------------------
// 房屋清洁 / 耐久
// ----------------------------------------------------------------------------

/**
 * 房屋状态。洁净度与耐久随时间衰减：
 *   当前值 = baseValue - decayPerDay * (距 updatedAt 的天数)，并截断到 [0, 100]。
 * 用户「清洁/修理」时把 baseValue 重置为 100 并刷新 updatedAt。
 */
export interface HouseState {
  /** 房屋名称（可选，用于多套房产场景） */
  name: string
  /** 上次记录的洁净度基准值（0-100） */
  cleanlinessBase: number
  /** 上次记录的耐久基准值（0-100） */
  durabilityBase: number
  /** 上次更新时间（epoch 毫秒） */
  updatedAt: number
  /** 洁净度每日衰减量 */
  cleanlinessDecayPerDay: number
  /** 耐久每日衰减量 */
  durabilityDecayPerDay: number
  /** 低于该阈值时提示清洁 */
  cleanlinessWarnThreshold: number
  /** 低于该阈值时提示修理 */
  durabilityWarnThreshold: number
}

// ----------------------------------------------------------------------------
// 全局设置（周期重置点）
// ----------------------------------------------------------------------------

export interface AppSettings {
  /** 每日重置的小时（0-23），游戏内一般为 0 点 */
  dailyResetHour: number
  /** 每周重置的星期（1=周一 ... 7=周日） */
  weeklyResetWeekday: number
}

// ----------------------------------------------------------------------------
// localStorage 存储 Key（集中管理，避免各模块写错）
// ----------------------------------------------------------------------------

export const STORAGE_KEYS = {
  todos: 'mhxy.todos.v1',
  seeds: 'mhxy.seeds.v1',
  dungeons: 'mhxy.dungeons.v1',
  house: 'mhxy.house.v1',
  settings: 'mhxy.settings.v1',
} as const
