// ============================================================================
// 合成算价：由「1 级材料单价」推算更高等级价格；由「基准品质金丹价格」推算各品质价格。
// 价格一律用「裸数值」计算与展示（不带万/亿单位）。均为材料成本，不含合成手续费/失败损耗。
//
// 规则与置信度（梦幻西游电脑版 / 端游）：
//   · 宝石：2 颗同类同级合 1 颗高一级 → N 级 = 2^(N-1) 颗 1 级。10 级 512 颗为端游公认值，
//     data/prices.ts 亦记「7 级约需 64 颗」(=2^6)。
//   · 星辉石：3 颗同级合 1 颗高一级 → N 级 = 3^(N-1) 颗 1 级。最高 11 锻；9 锻及以上合成
//     还需额外提交星辉石，实际成本高于纯材料价。
//   · 五色灵尘：合成必成（消耗体力）。2 级 = 2 个 1 级；N 级 = 2 个低一级 + 1 个低两级，
//     故 1 级等价颗数为佩尔数列 1,2,5,12,29,70…；最高 15 级。
//   · 九转金丹：经验 = 品质 × 0.5，只用于修炼，价值随品质线性 → 价格 ∝ 品质；品质为 10 的
//     倍数，此处固定输出 10~100。
// 参考：网易官方物品页 + 163/腾讯/叶子猪/技术宅 等多来源交叉（详见对话记录）。
// ============================================================================

import type { SynthInputs } from '../types'

export interface LevelRow {
  level: number
  /** 该等级需要多少个 1 级材料 */
  count: number
  /** 材料成本价 = count × 1 级单价（裸数值） */
  price: number
}

/** 由「1 级单价」与「各级所需 1 级颗数表」生成逐级行。 */
export function levelRows(base1Price: number, counts: number[]): LevelRow[] {
  return counts.map((count, i) => ({ level: i + 1, count, price: base1Price * count }))
}

// ----------------------------------------------------------------------------
// 宝石（2:1）
// ----------------------------------------------------------------------------

export const GEM_MAX_LEVEL = 10
/** 各级所需 1 级宝石颗数：2^(N-1)。 */
export const GEM_COUNTS: number[] = Array.from({ length: GEM_MAX_LEVEL }, (_, i) => 2 ** i)

/**
 * 常见镶嵌宝石名（价格随区服波动，各宝石单独填价、单独存储）。
 * 排在前面的是需求较大的主流宝石。
 */
export const GEM_NAMES = [
  '光芒石',
  '太阳石',
  '月亮石',
  '舍利子',
  '红宝石',
  '红玛瑙',
  '黑宝石',
  '翡翠石',
  '绿宝石',
  '神秘石',
] as const

// ----------------------------------------------------------------------------
// 星辉石（3:1，最高 11 锻）
// ----------------------------------------------------------------------------

export const STAR_MAX_LEVEL = 11
/** 各级所需 1 级星辉石颗数：3^(N-1)。 */
export const STAR_COUNTS: number[] = Array.from({ length: STAR_MAX_LEVEL }, (_, i) => 3 ** i)

// ----------------------------------------------------------------------------
// 五色灵尘（必成；N 级 = 2×低一级 + 1×低两级，最高 15 级）
// ----------------------------------------------------------------------------

export const DUST_MAX_LEVEL = 15
/** 各级所需 1 级五色灵尘个数：佩尔数列 c1=1,c2=2,c(n)=2·c(n-1)+c(n-2)。 */
export const DUST_COUNTS: number[] = buildDustCounts(DUST_MAX_LEVEL)

function buildDustCounts(max: number): number[] {
  const c = [1, 2]
  while (c.length < max) c.push(2 * c[c.length - 1] + c[c.length - 2])
  return c.slice(0, Math.max(1, max))
}

// ----------------------------------------------------------------------------
// 九转金丹（品质线性，固定输出 10~100）
// ----------------------------------------------------------------------------

export const PILL_QUALITY_STEP = 10
export const PILL_MIN_QUALITY = 10
export const PILL_MAX_QUALITY = 100

/** 品质 → 修炼经验：经验 = 品质 × 0.5。 */
export function pillExp(quality: number): number {
  return quality * 0.5
}

export interface PillRow {
  quality: number
  /** 价格 = 单价 × 品质，其中单价 = 基准价 / 基准品质（裸数值） */
  price: number
  /** 该品质可转化的修炼经验 */
  exp: number
}

/**
 * 由「基准品质 + 该品质价格」按品质线性推算 10~100 品质价格。
 * @param baseQuality 已知价格对应的品质（如 1 / 10 / 40 / 100）
 * @param basePrice   该品质的价格（裸数值）
 */
export function pillQualityPrices(baseQuality: number, basePrice: number): PillRow[] {
  // 单价 = 每 1 品质的价格；基准品质非正时退化为 0，交由界面提示补全输入
  const unitPrice = baseQuality > 0 ? basePrice / baseQuality : 0
  const rows: PillRow[] = []
  for (let q = PILL_MIN_QUALITY; q <= PILL_MAX_QUALITY; q += PILL_QUALITY_STEP) {
    rows.push({ quality: q, price: unitPrice * q, exp: pillExp(q) })
  }
  return rows
}

// ----------------------------------------------------------------------------
// 算价页输入的默认值（空价 + 默认宝石 + 金丹基准品质 1）
// ----------------------------------------------------------------------------

/** 「算价」页输入记忆的默认值（详见 types 的 SynthInputs）。 */
export const DEFAULT_SYNTH_INPUTS: SynthInputs = {
  gemName: GEM_NAMES[0],
  gemPrices: {},
  starPrice: '',
  dustPrice: '',
  pillQuality: '1',
  pillPrice: '',
}
