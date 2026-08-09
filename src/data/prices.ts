// ============================================================================
// 物价 · 默认内置条目
//
// 物价随「服务器 / 时段 / 版本」大幅波动，应用不内置任何“参考价”：价格全部由用户
// 自填（自由文本，以游戏内摊位 Alt+X 当天为准）。
//
// DEFAULT_PRICE_ITEMS 只提供一份「常见任务产出道具」的名字 + 分组，作为首次进入时的
// 默认清单（价格留空自填），全部可编辑 / 可删除；删空后不会再自动补回。
// 分组由用户自定义，这里给出四个常用起始分组：宠物 / 装备 / 宝石五宝 / 其它。
// ============================================================================

import type { PriceItem } from '../types'

/** 生成一条默认条目：名字 + 分组，价格留空由用户自填 */
function def(id: string, name: string, category: string, order: number): PriceItem {
  return { id, name, category, order }
}

/**
 * 首次进入时植入的「常见任务产出道具」默认清单（可编辑 / 可删除）。
 * order 以 10 递增并按分组连续分配，保证分组按 宠物 → 装备 → 宝石五宝 → 其它 排列，
 * 方便用户在中间插入自定义条目后仍有序。
 */
export const DEFAULT_PRICE_ITEMS: PriceItem[] = [
  // ---- 宠物：喂养 / 打书（金柳露·净瓶玉露·兽决） ----
  def('price-def-jinliulu', '金柳露', '宠物', 10),
  def('price-def-jinliulu-chao', '超级金柳露', '宠物', 20),
  def('price-def-jingpingyulu', '净瓶玉露', '宠物', 30),
  def('price-def-jingpingyulu-chao', '超级净瓶玉露', '宠物', 40),
  def('price-def-shoujue-pu', '普通兽决', '宠物', 50),
  def('price-def-shoujue-gao', '高级兽决', '宠物', 60),

  // ---- 装备：各等级防具 / 武器 ----
  def('price-def-equip-60', '60装备', '装备', 70),
  def('price-def-weapon-60', '60武器', '装备', 80),
  def('price-def-equip-70', '70装备', '装备', 90),
  def('price-def-weapon-70', '70武器', '装备', 100),
  def('price-def-equip-80', '80装备', '装备', 110),
  def('price-def-weapon-80', '80武器', '装备', 120),

  // ---- 宝石五宝：大五宝 + 常见宝石 + 强化 / 合成材料 ----
  def('price-def-jingang', '金刚石', '宝石五宝', 130),
  def('price-def-dinghun', '定魂珠', '宝石五宝', 140),
  def('price-def-yeguang', '夜光珠', '宝石五宝', 150),
  def('price-def-longlin', '龙鳞', '宝石五宝', 160),
  def('price-def-bishui', '避水珠', '宝石五宝', 170),
  def('price-def-taiyang', '太阳石', '宝石五宝', 180),
  def('price-def-yueliang', '月亮石', '宝石五宝', 190),
  def('price-def-sheli', '舍利子', '宝石五宝', 200),
  def('price-def-guangmang', '光芒石', '宝石五宝', 210),
  def('price-def-hongmanao', '红玛瑙', '宝石五宝', 220),
  def('price-def-heibaoshi', '黑宝石', '宝石五宝', 230),
  def('price-def-xinghuishi', '星辉石', '宝石五宝', 240),
  def('price-def-wuselingchen', '五色灵尘', '宝石五宝', 250),
  def('price-def-qianghuashi', '强化石', '宝石五宝', 260),

  // ---- 其它：炼妖 / 炼妖石 / 图册 / 储灵袋 ----
  def('price-def-chulingdai', '储灵袋', '其它', 270),
  def('price-def-lianyao-105', '105炼妖石', '其它', 280),
  def('price-def-lianyao-115', '115炼妖石', '其它', 290),
  def('price-def-lianyao-125', '125炼妖石', '其它', 300),
  def('price-def-tuce-105', '105图册', '其它', 310),
  def('price-def-tuce-115', '115图册', '其它', 320),
  def('price-def-tuce-125', '125图册', '其它', 330),
]
