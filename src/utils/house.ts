// ============================================================================
// 房屋 洁净度 / 耐久 衰减计算
// 当前值 = base - decayPerDay * (距 updatedAt 的天数)，截断到 [0, 100]。
// ============================================================================

import type { HouseState } from '../types'
import { MS_PER_DAY } from './time'

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** 距上次更新的天数（可为小数） */
export function daysSince(updatedAt: number, now: number): number {
  return Math.max(0, (now - updatedAt) / MS_PER_DAY)
}

/** 当前洁净度（0-100） */
export function currentCleanliness(house: HouseState, now: number): number {
  const d = daysSince(house.updatedAt, now)
  return clamp(house.cleanlinessBase - house.cleanlinessDecayPerDay * d, 0, 100)
}

/** 当前耐久（0-100） */
export function currentDurability(house: HouseState, now: number): number {
  const d = daysSince(house.updatedAt, now)
  return clamp(house.durabilityBase - house.durabilityDecayPerDay * d, 0, 100)
}

/** 距洁净度降到阈值还有多少毫秒（已低于则为 0） */
export function msUntilCleanWarn(house: HouseState, now: number): number {
  const cur = currentCleanliness(house, now)
  if (cur <= house.cleanlinessWarnThreshold) return 0
  if (house.cleanlinessDecayPerDay <= 0) return Infinity
  const days = (cur - house.cleanlinessWarnThreshold) / house.cleanlinessDecayPerDay
  return days * MS_PER_DAY
}

/** 距耐久降到阈值还有多少毫秒（已低于则为 0） */
export function msUntilDurabilityWarn(house: HouseState, now: number): number {
  const cur = currentDurability(house, now)
  if (cur <= house.durabilityWarnThreshold) return 0
  if (house.durabilityDecayPerDay <= 0) return Infinity
  const days = (cur - house.durabilityWarnThreshold) / house.durabilityDecayPerDay
  return days * MS_PER_DAY
}

export type HouseStatusLevel = 'ok' | 'warn' | 'danger'

/** 根据当前值与阈值给出状态等级 */
export function houseLevel(value: number, threshold: number): HouseStatusLevel {
  if (value <= threshold) return 'danger'
  if (value <= threshold + 20) return 'warn'
  return 'ok'
}
