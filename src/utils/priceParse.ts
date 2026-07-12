// ============================================================================
// 价格解析与趋势计算
// - normalizePrice：把 "80w" "3500万" "1.2亿" 等归一化为梦幻币数值（用于趋势）
// - parseText：把 OCR 出的聊天/摊位文本，逐行解析为「物品 + 价格 + 买卖」候选
// - 趋势：按天取中位数，抗喊价离群
// 解析为启发式，结果先给用户校对再入库，不追求 100% 准确。
// ============================================================================

import type { PriceObservation, PriceSource } from '../types'

export interface PriceCandidate {
  itemId?: string
  itemName: string
  priceText?: string
  value?: number
  side?: 'buy' | 'sell'
  server?: string
  rawText: string
  /** 默认勾选保留（有价格且识别到物品名时为 true） */
  keep: boolean
}

export interface KnownItem {
  id: string
  name: string
}

// 单位倍率（注意匹配顺序：千万 先于 万）
const PRICE_RE = /(\d+(?:\.\d+)?)\s*(亿|億|[eE]|千万|kw|KW|万|w|W|k|K)?/

// OCR 常在相邻中文字之间插入空格（如「定 魂 珠」）。识别前把「汉字 空格 汉字」之间的
// 空格去掉，还原成连续中文，避免物品名被拆断。
const CJK = '\\u4e00-\\u9fa5'
const CJK_SPACE_RE = new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, 'g')
export function collapseCjkSpaces(s: string): string {
  return s.replace(CJK_SPACE_RE, '$1')
}

/** 把价格文本归一化为梦幻币数值；无法解析返回 undefined。 */
export function normalizePrice(text: string): number | undefined {
  const m = text.match(PRICE_RE)
  if (!m) return undefined
  const n = parseFloat(m[1])
  if (!isFinite(n)) return undefined
  const unit = (m[2] || '').toLowerCase()
  let mult = 1
  if (unit === '亿' || unit === '億' || unit === 'e') mult = 1e8
  else if (unit === '千万' || unit === 'kw') mult = 1e7
  else if (unit === '万' || unit === 'w') mult = 1e4
  else if (unit === 'k') mult = 1e3
  return Math.round(n * mult)
}

/** 把梦幻币数值格式化为易读文本（亿/万）。 */
export function formatMoney(v: number | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  if (v >= 1e8) return `${trimZero(v / 1e8)} 亿`
  if (v >= 1e4) return `${trimZero(v / 1e4)} 万`
  return String(Math.round(v))
}
function trimZero(n: number): string {
  return (Math.round(n * 100) / 100).toString()
}

const SIDE_BUY = /(收购|求购|长期收|高收|收|求)/
const SIDE_SELL = /(甩卖|出售|低价出|出|卖|甩|秒|转)/
const SERVER_RE = /([一-龥A-Za-z0-9]{1,6}区)/
// 解析物品名时要剔除的噪声词
const NOISE = /(有的?滴滴|滴滴|价格|联系|私聊|私|电话|qq|QQ|微信|谢谢|个|颗|组|件|一口价|一口|包邮|已出|已收|优先|价可小刀|小刀|议价|现货|自动|摆摊)/g

function detectSide(line: string): 'buy' | 'sell' | undefined {
  const b = line.search(SIDE_BUY)
  const s = line.search(SIDE_SELL)
  if (b === -1 && s === -1) return undefined
  if (b === -1) return 'sell'
  if (s === -1) return 'buy'
  return b <= s ? 'buy' : 'sell'
}

/** 用已知物品名匹配行，命中则返回该物品；用于把观测挂到已有条目上。 */
function matchKnownItem(line: string, known: KnownItem[]): KnownItem | undefined {
  let best: { item: KnownItem; keyLen: number } | undefined
  for (const it of known) {
    for (const key of itemKeys(it.name)) {
      if (key.length >= 2 && line.includes(key)) {
        if (!best || key.length > best.keyLen) best = { item: it, keyLen: key.length }
      }
    }
  }
  return best?.item
}
function itemKeys(name: string): string[] {
  const keys = new Set<string>()
  keys.add(name)
  const head = name.split(/[（(·:：]/)[0].trim()
  if (head) keys.add(head)
  return [...keys]
}

/** 从一行里提取物品名（剔除价格、买卖词、区服、噪声、标点数字后剩下的中文串）。 */
function extractName(line: string, priceText?: string): string {
  let s = line
  if (priceText) s = s.replace(priceText, ' ')
  s = s
    .replace(SERVER_RE, ' ')
    .replace(SIDE_BUY, ' ')
    .replace(SIDE_SELL, ' ')
    .replace(NOISE, ' ')
    .replace(/[0-9.]+\s*(亿|億|万|w|W|k|K|千万|kw)?/g, ' ')
    .replace(/[^一-龥A-Za-z·]+/g, ' ')
    .trim()
  // 取最长的中文片段作为物品名
  const parts = s.split(/\s+/).filter(Boolean)
  parts.sort((a, b) => b.length - a.length)
  return parts[0] ?? ''
}

/**
 * 解析 OCR 文本为候选观测（逐行）。只保留含价格数字的行。
 */
export function parseText(
  raw: string,
  opts: { source: PriceSource; known?: KnownItem[] },
): PriceCandidate[] {
  const known = opts.known ?? []
  const out: PriceCandidate[] = []
  const lines = raw
    .split(/\r?\n/)
    .map((l) => collapseCjkSpaces(l.trim()))
    .filter((l) => l.length > 0)

  for (const line of lines) {
    // 找价格：优先带单位的，其次 5 位以上的裸数字
    const withUnit = line.match(/(\d+(?:\.\d+)?)\s*(亿|億|[eE]|千万|kw|KW|万|w|W)/)
    const bareBig = line.match(/\b(\d{5,})\b/)
    const priceMatch = withUnit ?? bareBig
    if (!priceMatch) continue
    const priceText = priceMatch[0].trim()
    const value = normalizePrice(priceText)

    const matched = matchKnownItem(line, known)
    const itemName = matched?.name ?? extractName(line, priceText)
    if (!itemName) continue

    const serverM = line.match(SERVER_RE)
    out.push({
      itemId: matched?.id,
      itemName,
      priceText,
      value,
      side: detectSide(line),
      server: serverM?.[1],
      rawText: line,
      keep: !!itemName && value != null,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// 趋势计算
// ---------------------------------------------------------------------------

const DAY = 86_400_000

export function median(nums: number[]): number | undefined {
  const a = nums.filter((n) => isFinite(n)).sort((x, y) => x - y)
  if (a.length === 0) return undefined
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

export interface TrendPoint {
  /** 当天 0 点的时间戳 */
  t: number
  /** 当天价格中位数（梦幻币） */
  value: number
  /** 当天样本数 */
  count: number
}

/** 把观测按「本地自然天」聚合，取每天价格中位数，时间升序。 */
export function dailyMedianSeries(obs: { value?: number; capturedAt: number }[]): TrendPoint[] {
  const byDay = new Map<number, number[]>()
  for (const o of obs) {
    if (o.value == null || !isFinite(o.value)) continue
    const d = new Date(o.capturedAt)
    d.setHours(0, 0, 0, 0)
    const key = d.getTime()
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(o.value)
  }
  return [...byDay.entries()]
    .map(([t, vals]) => ({ t, value: median(vals)!, count: vals.length }))
    .sort((a, b) => a.t - b.t)
}

export interface PriceStats {
  count: number
  latest?: number
  min?: number
  max?: number
  median?: number
}

export function statsFor(obs: PriceObservation[]): PriceStats {
  const vals = obs.map((o) => o.value).filter((v): v is number => v != null && isFinite(v))
  if (obs.length === 0) return { count: 0 }
  const latest = [...obs].sort((a, b) => b.capturedAt - a.capturedAt).find((o) => o.value != null)?.value
  return {
    count: obs.length,
    latest,
    min: vals.length ? Math.min(...vals) : undefined,
    max: vals.length ? Math.max(...vals) : undefined,
    median: median(vals),
  }
}

export { DAY }
