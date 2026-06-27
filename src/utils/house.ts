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

/**
 * 根据当前值与「建议下限」阈值给出状态等级：
 *   - value >= threshold：良好(ok)
 *   - threshold-20 <= value < threshold：偏低(warn)
 *   - 否则：告警(danger)
 * 例：耐久阈值 80 → ≥80 良好 / 60-79 偏低 / <60 告警，与官方耐久分档吻合。
 */
export function houseLevel(value: number, threshold: number): HouseStatusLevel {
  if (value >= threshold) return 'ok'
  if (value >= threshold - 20) return 'warn'
  return 'danger'
}

/**
 * 官方耐久四档对应的房屋功能效果百分比：
 *   ≥80 → 100%，60-79 → 80%，30-59 → 60%，<30 → 40%（0 有几率倒塌）。
 */
export function durabilityEffectPercent(value: number): number {
  if (value >= 80) return 100
  if (value >= 60) return 80
  if (value >= 30) return 60
  return 40
}
