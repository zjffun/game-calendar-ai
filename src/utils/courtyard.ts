// ============================================================================
// 庭院「生长周期」推算工具（纯函数）
// 参考梦幻西游电脑版庭院种植：以「种下当天 = 第 1 天」计，结果(收获)与清除
// 均在当日的每日重置点(0 点)生效；期间每个自然日需养护，否则状态下降直至枯死。
//
// 本文件只依赖 time 工具，生长周期(SeedGrowthCycle)由调用方传入，
// 不反向依赖 data 层，保持工具层为叶子层。
// ============================================================================

import type { SeedGrowthCycle, SeedTimer } from '../types'
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  getDailyPeriodKey,
  getNextDailyReset,
} from './time'

/**
 * 植物「第 1 天」的起始时刻：即种植时刻所在「游戏日」的重置点。
 * 例如 resetHour=0、种于 06-22 15:00，则第 1 天起点为 06-22 00:00。
 */
export function plantDayStart(plantedAt: number, resetHour: number): number {
  const shifted = new Date(plantedAt - resetHour * MS_PER_HOUR)
  return new Date(
    shifted.getFullYear(),
    shifted.getMonth(),
    shifted.getDate(),
    resetHour,
    0,
    0,
    0,
  ).getTime()
}

/** 第 dayN 个植物日（第 1 天 = 种植当天）的起始时刻 */
export function plantDayAt(plantedAt: number, resetHour: number, dayN: number): number {
  return plantDayStart(plantedAt, resetHour) + (dayN - 1) * MS_PER_DAY
}

/** 当前处于植物的第几天（>=1；种植当天即第 1 天） */
export function plantDayIndex(plantedAt: number, resetHour: number, now: number): number {
  const start = plantDayStart(plantedAt, resetHour)
  return Math.floor((now - start) / MS_PER_DAY) + 1
}

/** 单个「结果天」相对当前的状态 */
export type HarvestStatus =
  | 'done' // 该收获日已过（收获窗口结束）
  | 'today' // 今天正是收获日（现在可收获）
  | 'upcoming' // 尚未到来

export interface HarvestPoint {
  /** 第几天结果 */
  day: number
  /** 该结果日起始时刻（可收获时刻） */
  at: number
  status: HarvestStatus
}

/** 下一个事件类型：结果(收获) 或 清除(重种) */
export type SeedEventType = 'harvest' | 'clear'

export interface SeedSchedule {
  /** 当前第几天 */
  dayIndex: number
  /** 各结果日及其状态（按天数升序） */
  harvests: HarvestPoint[]
  /** 已收获(已过)次数 */
  harvestedCount: number
  /** 总结果次数 */
  totalHarvests: number
  /** 清除/重种 时刻（永久休眠日的起点） */
  clearAt: number
  /** 清除天 */
  clearDay: number
  /** 生命周期是否已结束（已到/已过清除日，待清除重种） */
  ended: boolean
  /** 今天是否为结果日（现在可收获） */
  todayIsHarvest: boolean
  /** 下一次结果(收获)时刻；没有更多结果则为 null */
  nextHarvestAt: number | null
  /** 下一个事件（结果或清除）时刻 */
  nextEventAt: number
  /** 下一个事件类型 */
  nextEventType: SeedEventType
  /** 今日养护截止时刻（下一个每日重置点）；生命周期结束后无意义 */
  careDeadline: number
}

/**
 * 推算一株 cycle 模式种子的完整日程。
 * @param seed     种子（取其 plantedAt）
 * @param cycle    该等级的生长周期（结果天 / 清除天）
 * @param resetHour 每日重置小时（来自设置，一般为 0）
 * @param now      当前时刻
 */
export function computeSeedSchedule(
  seed: SeedTimer,
  cycle: SeedGrowthCycle,
  resetHour: number,
  now: number,
): SeedSchedule {
  const dayIndex = plantDayIndex(seed.plantedAt, resetHour, now)

  const harvests: HarvestPoint[] = cycle.harvestDays.map((day) => {
    const at = plantDayAt(seed.plantedAt, resetHour, day)
    const nextDay = plantDayAt(seed.plantedAt, resetHour, day + 1)
    let status: HarvestStatus
    if (now < at) status = 'upcoming'
    else if (now < nextDay) status = 'today'
    else status = 'done'
    return { day, at, status }
  })

  const clearAt = plantDayAt(seed.plantedAt, resetHour, cycle.clearDay)
  const ended = now >= clearAt
  const harvestedCount = harvests.filter((h) => h.status === 'done').length
  const todayIsHarvest = harvests.some((h) => h.status === 'today')

  // 下一次「尚未到来」的结果时刻
  const upcoming = harvests.find((h) => h.at > now)
  const nextHarvestAt = upcoming ? upcoming.at : null

  // 下一个事件：清除日之前的最近一次结果优先，否则为清除
  let nextEventAt: number
  let nextEventType: SeedEventType
  if (nextHarvestAt != null && nextHarvestAt < clearAt) {
    nextEventAt = nextHarvestAt
    nextEventType = 'harvest'
  } else {
    nextEventAt = clearAt
    nextEventType = 'clear'
  }

  return {
    dayIndex,
    harvests,
    harvestedCount,
    totalHarvests: cycle.harvestDays.length,
    clearAt,
    clearDay: cycle.clearDay,
    ended,
    todayIsHarvest,
    nextHarvestAt,
    nextEventAt,
    nextEventType,
    careDeadline: getNextDailyReset(now, resetHour),
  }
}

/** cycle 模式：今日是否已养护（lastCareDayKey 等于当前每日周期 Key） */
export function isCaredToday(seed: SeedTimer, resetHour: number, now: number): boolean {
  if (!seed.lastCareDayKey) return false
  return seed.lastCareDayKey === getDailyPeriodKey(now, resetHour)
}

/** 取种子的有效计时模式（缺省按 'timer'，兼容旧数据） */
export function seedMode(seed: SeedTimer): 'cycle' | 'timer' {
  return seed.mode ?? 'timer'
}

/**
 * 统一的「下一个需关注时刻」——供列表排序使用（越早越靠前，已可处理的为过去时刻排最前）。
 * - cycle 模式：已结束 -> 清除时刻；今日可收获 -> 今日结果时刻（已过，排到最前）；
 *   否则下一个事件（结果 / 清除）时刻。
 * - timer 模式：成熟时刻 plantedAt + durationMs。
 */
export function seedNextAt(
  seed: SeedTimer,
  cycle: SeedGrowthCycle | undefined,
  resetHour: number,
  now: number,
): number {
  if (seedMode(seed) === 'cycle' && cycle) {
    const sc = computeSeedSchedule(seed, cycle, resetHour, now)
    if (sc.ended) return sc.clearAt
    // 今日可收获：用今天的结果时刻（已过）作为排序键，让「现在就能收」的排到最前
    const today = sc.harvests.find((h) => h.status === 'today')
    if (today) return today.at
    return sc.nextEventAt
  }
  return seed.plantedAt + seed.durationMs
}
