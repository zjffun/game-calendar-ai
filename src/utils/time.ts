// ============================================================================
// 时间 / 周期 计算工具
// 说明：均按「用户本地时区」计算。游戏每日/每周重置点可在设置中调整。
// ============================================================================

import type { AppSettings, TodoCycle, DungeonCycle } from '../types'

export const MS_PER_MINUTE = 60_000
export const MS_PER_HOUR = 3_600_000
export const MS_PER_DAY = 86_400_000

/** 把 JS 的 getDay()（0=周日..6=周六）转换为 ISO（1=周一..7=周日） */
function isoWeekday(d: Date): number {
  const day = d.getDay()
  return day === 0 ? 7 : day
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// ----------------------------------------------------------------------------
// 周期 Key —— 用于「本周期是否已完成」判断（相等即已完成，跨周期自动重置）
// ----------------------------------------------------------------------------

/** 每日周期 Key，按每日重置点把凌晨划归前一天。返回 'YYYY-MM-DD' */
export function getDailyPeriodKey(now: number, resetHour: number): string {
  // 把时间减去 resetHour 小时，再取当地日期，即为「游戏日」。
  const shifted = new Date(now - resetHour * MS_PER_HOUR)
  return ymd(shifted)
}

/**
 * 取得当前「游戏周」的起始时刻（最近一次 周X 的 resetHour 点）。
 */
export function getWeekStart(
  now: number,
  resetWeekday: number,
  resetHour: number,
): number {
  const d = new Date(now)
  const todayAtReset = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    resetHour,
    0,
    0,
    0,
  ).getTime()
  const diff = (isoWeekday(d) - resetWeekday + 7) % 7
  let start = todayAtReset - diff * MS_PER_DAY
  if (start > now) start -= 7 * MS_PER_DAY
  return start
}

/** 每周周期 Key，'W' + 游戏周起始日期 */
export function getWeeklyPeriodKey(
  now: number,
  resetWeekday: number,
  resetHour: number,
): string {
  return 'W' + ymd(new Date(getWeekStart(now, resetWeekday, resetHour)))
}

/** 取得当前「游戏月」的起始时刻（当月 1 号 resetHour 点） */
export function getMonthStart(now: number, resetHour: number): number {
  const d = new Date(now)
  let start = new Date(
    d.getFullYear(),
    d.getMonth(),
    1,
    resetHour,
    0,
    0,
    0,
  ).getTime()
  if (now < start) {
    // 1 号 resetHour 之前，归上个月
    start = new Date(d.getFullYear(), d.getMonth() - 1, 1, resetHour, 0, 0, 0).getTime()
  }
  return start
}

/** 每月周期 Key，'YYYY-MM' */
export function getMonthlyPeriodKey(now: number, resetHour: number): string {
  const start = new Date(getMonthStart(now, resetHour))
  return `${start.getFullYear()}-${pad2(start.getMonth() + 1)}`
}

/** 按周期类型取得当前周期 Key（TODO 与副本通用） */
export function getPeriodKey(
  cycle: TodoCycle | DungeonCycle,
  now: number,
  settings: AppSettings,
): string {
  switch (cycle) {
    case 'daily':
      return getDailyPeriodKey(now, settings.dailyResetHour)
    case 'weekly':
      return getWeeklyPeriodKey(now, settings.weeklyResetWeekday, settings.dailyResetHour)
    case 'monthly':
      return getMonthlyPeriodKey(now, settings.dailyResetHour)
    case 'every4days':
      return getEvery4DaysPeriodKey(now, settings.every4DaysAnchor)
    default:
      return getDailyPeriodKey(now, settings.dailyResetHour)
  }
}

/** 每 4 天周期 Key，'4d' + 距起算点的周期序号 */
export function getEvery4DaysPeriodKey(now: number, anchor: number): string {
  const span = 4 * MS_PER_DAY
  return '4d' + Math.floor((now - anchor) / span)
}

/** 下次「每 4 天」刷新时刻（epoch 毫秒） */
export function getNextEvery4DaysReset(now: number, anchor: number): number {
  const span = 4 * MS_PER_DAY
  const k = Math.floor((now - anchor) / span)
  return anchor + (k + 1) * span
}

// ----------------------------------------------------------------------------
// 下次重置时间 —— 用于刷新倒计时
// ----------------------------------------------------------------------------

/** 下次每日重置时刻（epoch 毫秒） */
export function getNextDailyReset(now: number, resetHour: number): number {
  const d = new Date(now)
  let next = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    resetHour,
    0,
    0,
    0,
  ).getTime()
  if (next <= now) next += MS_PER_DAY
  return next
}

/** 下次每周重置时刻（epoch 毫秒） */
export function getNextWeeklyReset(
  now: number,
  resetWeekday: number,
  resetHour: number,
): number {
  return getWeekStart(now, resetWeekday, resetHour) + 7 * MS_PER_DAY
}

/** 下次每月重置时刻（epoch 毫秒） */
export function getNextMonthlyReset(now: number, resetHour: number): number {
  const start = new Date(getMonthStart(now, resetHour))
  return new Date(start.getFullYear(), start.getMonth() + 1, 1, resetHour, 0, 0, 0).getTime()
}

/** 按周期类型取得下次重置时刻 */
export function getNextReset(
  cycle: TodoCycle | DungeonCycle,
  now: number,
  settings: AppSettings,
): number {
  switch (cycle) {
    case 'daily':
      return getNextDailyReset(now, settings.dailyResetHour)
    case 'weekly':
      return getNextWeeklyReset(now, settings.weeklyResetWeekday, settings.dailyResetHour)
    case 'monthly':
      return getNextMonthlyReset(now, settings.dailyResetHour)
    case 'every4days':
      return getNextEvery4DaysReset(now, settings.every4DaysAnchor)
    default:
      return getNextDailyReset(now, settings.dailyResetHour)
  }
}

// ----------------------------------------------------------------------------
// 时长格式化
// ----------------------------------------------------------------------------

export interface DurationParts {
  totalMs: number
  negative: boolean
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** 把毫秒拆解为 天/时/分/秒 */
export function breakdownDuration(ms: number): DurationParts {
  const negative = ms < 0
  let s = Math.floor(Math.abs(ms) / 1000)
  const days = Math.floor(s / 86400)
  s -= days * 86400
  const hours = Math.floor(s / 3600)
  s -= hours * 3600
  const minutes = Math.floor(s / 60)
  s -= minutes * 60
  return { totalMs: ms, negative, days, hours, minutes, seconds: s }
}

/**
 * 倒计时文本，例如：
 *   '2天 03:15:42'、'03:15:42'、'00:09'（不足 1 小时）
 * ms <= 0 时返回 fallback（默认 '00:00:00'），通常由调用方改用「已就绪」等文案。
 */
export function formatCountdown(ms: number, fallback = '00:00:00'): string {
  if (ms <= 0) return fallback
  const { days, hours, minutes, seconds } = breakdownDuration(ms)
  const hms = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  return days > 0 ? `${days}天 ${hms}` : hms
}

/** 中文友好的剩余时间，例如 '2 天 3 小时'、'15 分钟'、'即将到来' */
export function formatRemainingHuman(ms: number): string {
  if (ms <= 0) return '已到期'
  const { days, hours, minutes } = breakdownDuration(ms)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分钟`
  return '不到 1 分钟'
}

/** 把 epoch 毫秒格式化为 'MM-DD HH:mm'（本地时间） */
export function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`
}

/** 把 epoch 毫秒格式化为 datetime-local 输入框需要的 'YYYY-MM-DDTHH:mm' */
export function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`
}

/** 把 datetime-local 字符串解析为 epoch 毫秒（解析失败返回 NaN） */
export function fromDatetimeLocalValue(value: string): number {
  const ms = new Date(value).getTime()
  return ms
}

export const WEEKDAY_LABELS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
