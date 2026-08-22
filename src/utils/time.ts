// ============================================================================
// 时间 / 周期 计算工具
// 说明：均按「用户本地时区」计算。游戏每日/每周重置点可在设置中调整。
// ============================================================================

import type { AppSettings, TodoCycle } from '../types'

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

/**
 * 单次待办的固定周期 Key：永不变化，
 * 因此标记完成后长期保持已完成（不会跨周期自动重置，可手动删除）。
 */
export const ONCE_PERIOD_KEY = 'ONCE'

/** 按周期类型取得当前周期 Key（TODO 与副本通用） */
export function getPeriodKey(
  cycle: TodoCycle,
  now: number,
  settings: AppSettings,
): string {
  switch (cycle) {
    case 'once':
      return ONCE_PERIOD_KEY
    case 'daily':
      return getDailyPeriodKey(now, settings.dailyResetHour)
    case 'weekly':
      return getWeeklyPeriodKey(now, settings.weeklyResetWeekday, settings.dailyResetHour)
    case 'monthly':
      return getMonthlyPeriodKey(now, settings.dailyResetHour)
    default:
      return getDailyPeriodKey(now, settings.dailyResetHour)
  }
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
  cycle: TodoCycle,
  now: number,
  settings: AppSettings,
): number {
  switch (cycle) {
    case 'once':
      // 单次待办没有下次刷新时刻
      return Number.POSITIVE_INFINITY
    case 'daily':
      return getNextDailyReset(now, settings.dailyResetHour)
    case 'weekly':
      return getNextWeeklyReset(now, settings.weeklyResetWeekday, settings.dailyResetHour)
    case 'monthly':
      return getNextMonthlyReset(now, settings.dailyResetHour)
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

/**
 * 正向计时/用时文本，例如 '07:42'（不足 1 小时）、'1:05:20'、'1天 2:03:04'。
 * 与 formatCountdown 的区别：不补前导「00:」小时位，读秒更紧凑（攻略计时用）。
 */
export function formatElapsed(ms: number): string {
  const { days, hours, minutes, seconds } = breakdownDuration(Math.max(0, ms))
  const mmss = `${pad2(minutes)}:${pad2(seconds)}`
  if (days > 0) return `${days}天 ${hours}:${mmss}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

/** 分:秒 倒计时，例如 '12:05'（用于 <1 小时的短倒计时，如昼夜切换） */
export function formatMmSs(ms: number): string {
  if (ms <= 0) return '00:00'
  const { hours, minutes, seconds } = breakdownDuration(ms)
  return `${pad2(hours * 60 + minutes)}:${pad2(seconds)}`
}

// ----------------------------------------------------------------------------
// 梦幻西游（电脑版）昼夜循环
// 游戏一天 = 现实 30 分钟，12 时辰各 2 分 30 秒，从现实整点起依「子丑寅卯辰巳午未申
// 酉戌亥」排列并每半小时重复一轮。白天 = 辰巳午未申酉（第 4–9 个时辰），落在每个
// 30 分钟周期的第 10–25 分钟；其余（戌亥子丑寅卯）为黑夜。
// 即现实每小时 :10–:25、:40–:55 为白天，:25–:40、:55–:10 为黑夜。
// ----------------------------------------------------------------------------

export type DayPhase = 'day' | 'night'

export interface DayNightState {
  /** 当前处于白天还是黑夜 */
  phase: DayPhase
  /** 距离切换到「另一种」状态的剩余毫秒（总是 (0, 15 分钟]） */
  msToNext: number
}

const DAYNIGHT_CYCLE = 30 * MS_PER_MINUTE
const DAY_START = 10 * MS_PER_MINUTE // 辰时起：周期内第 10 分钟转白天
const DAY_END = 25 * MS_PER_MINUTE // 酉时末：周期内第 25 分钟转黑夜

/** 依现实时钟计算梦幻西游当前昼夜与距下次切换的剩余时间 */
export function getMhxyDayNight(now: number): DayNightState {
  const d = new Date(now)
  // 当前时刻在 30 分钟周期内的偏移（现实整点、半点各为一轮起点）
  const msInCycle =
    ((d.getMinutes() % 30) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds()
  const isDay = msInCycle >= DAY_START && msInCycle < DAY_END
  let msToNext: number
  if (isDay) {
    msToNext = DAY_END - msInCycle
  } else if (msInCycle < DAY_START) {
    msToNext = DAY_START - msInCycle
  } else {
    // 已过 DAY_END：跨到下一轮的白天起点
    msToNext = DAYNIGHT_CYCLE - msInCycle + DAY_START
  }
  return { phase: isDay ? 'day' : 'night', msToNext }
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
