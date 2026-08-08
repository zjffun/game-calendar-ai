// ============================================================================
// 物价 · 分类定义 + 默认内置条目
//
// 物价随「服务器 / 时段 / 版本」大幅波动，应用不内置任何“参考价”：价格全部由用户
// 自填（自由文本，以游戏内摊位 Alt+X 当天为准）。
//
// DEFAULT_PRICE_ITEMS 只提供一份「常见任务产出道具」的名字 + 分类，作为首次进入时的
// 默认清单（价格留空自填），全部可编辑 / 可删除；删空后不会再自动补回。
// 名称参考网易官方「捉鬼/藏宝图」产出与常见社区叫法（含 66 / C66 等抓鬼常见掉落）。
// ============================================================================

import type { PriceItem } from '../types'

/** 分类展示顺序（决定新增下拉选项与分组先后） */
export const PRICE_CATEGORY_ORDER = ['兽决', '五宝', '宝石', '珍宝', '材料', '其它'] as const

/** 生成一条默认条目：只有名字 + 分类，价格留空由用户自填 */
function def(id: string, name: string, category: string, order: number): PriceItem {
  return { id, name, category, order }
}

/**
 * 首次进入时植入的「常见任务产出道具」默认清单（可编辑 / 可删除）。
 * order 以 10 递增，方便用户在中间插入自定义条目后仍有序。
 */
export const DEFAULT_PRICE_ITEMS: PriceItem[] = [
  // ---- 兽决（魔兽要诀）：抓鬼 / 藏宝图 / 副本常见产出 ----
  def('price-def-shoujue-pu', '普通兽决', '兽决', 10),
  def('price-def-shoujue-gao', '高级兽决', '兽决', 20),

  // ---- 五宝（大五宝）：抓鬼 / 变异鬼 / 副本产出 ----
  def('price-def-jingang', '金刚石', '五宝', 30),
  def('price-def-dinghun', '定魂珠', '五宝', 40),
  def('price-def-yeguang', '夜光珠', '五宝', 50),
  def('price-def-longlin', '龙鳞', '五宝', 60),
  def('price-def-bishui', '避水珠', '五宝', 70),

  // ---- 宝石 / 强化材料（含抓鬼掉落的 66、C66 叫法） ----
  def('price-def-66', '66', '宝石', 80),
  def('price-def-c66', 'C66', '宝石', 90),
  def('price-def-taiyang', '太阳石', '宝石', 100),
  def('price-def-yueliang', '月亮石', '宝石', 110),
  def('price-def-sheli', '舍利子', '宝石', 120),
  def('price-def-guangmang', '光芒石', '宝石', 130),

  // ---- 珍宝：藏宝图 / 挖宝高价产出 ----
  def('price-def-cangbaotu-gao', '高级藏宝图', '珍宝', 140),
  def('price-def-tianyan', '天眼', '珍宝', 150),

  // ---- 材料 / 消耗：抓鬼常见奖励 ----
  def('price-def-jinliulu-chao', '超级金柳露', '材料', 160),
  def('price-def-jingpingyulu', '净瓶玉露', '材料', 170),
  def('price-def-sheyaoxiang', '摄妖香', '材料', 180),
  def('price-def-xinghuishi', '星辉石', '材料', 190),
  def('price-def-jingpolingshi', '精魄灵石', '材料', 200),
]
