// ============================================================================
// 物价 · 常见任务产出物品参考价（内置，只读）
//
// 更新基准：2026-07（联网整理）
// 来源：网易官方物品/宝石/杂物介绍页 + 163/腾讯「摸透物价」「系统高价值宝贝排行」
//       + 9game/叶子猪 宝石与藏宝图资料，多源交叉。
//
// ⚠️ 梦幻西游物价随「服务器 / 时段 / 版本」大幅波动，下列 price 为「参考价」区间或
//    定性描述，仅用于建立直觉；实际成交价请以游戏内摊位（Alt+X）当天为准。
//    用户可在页面中修改自定义条目、并给任意条目添加自己的备注（如本区实时价）。
// ============================================================================

import type { PriceItem } from '../types'

/** 分类展示顺序（决定分组先后） */
export const PRICE_CATEGORY_ORDER = ['兽决', '五宝', '宝石', '珍宝', '材料', '其它'] as const

export const PRICE_PRESETS: PriceItem[] = [
  // ---- 兽决（魔兽要诀）：抓鬼 / 副本 / 宝箱常见产出 ----
  {
    id: 'price-shoujue-normal',
    name: '普通兽决（吸血 / 法术连击 / 偷袭 等）',
    category: '兽决',
    price: '约 80 万',
    desc: '抓鬼、副本、宝箱常见产出；价格随兽决种类与本区召唤兽需求浮动。',
    preset: true,
  },
  {
    id: 'price-shoujue-high',
    name: '高级兽决（高级法术波动 / 高级必杀 等）',
    category: '兽决',
    price: '约 3000–3500 万起',
    desc: '高价值兽决，热门种类更高；是打书宝宝的大头成本。',
    preset: true,
  },
  {
    id: 'price-shoujue-rare',
    name: '稀有特殊兽决（如浮云神马）',
    category: '兽决',
    price: '极高（可达数万元宝 / RMB 级）',
    desc: '收藏级稀有兽决，价格波动极大，视版本与需求而定。',
    preset: true,
  },

  // ---- 五宝（大五宝）：副本 / 宝箱 / 任务产出 ----
  { id: 'price-wubao-jingang', name: '金刚石', category: '五宝', price: '约 135–140 万', desc: '大五宝之一，需求稳定。', preset: true },
  { id: 'price-wubao-dinghun', name: '定魂珠', category: '五宝', price: '约 135 万', desc: '大五宝之一。', preset: true },
  { id: 'price-wubao-yeguang', name: '夜光珠', category: '五宝', price: '偏高（视区）', desc: '五宝中价值较高的一类。', preset: true },
  { id: 'price-wubao-longlin', name: '龙鳞', category: '五宝', price: '中等（视区）', desc: '五宝之一。', preset: true },
  { id: 'price-wubao-bishui', name: '避水珠', category: '五宝', price: '较低（视区）', desc: '五宝中价值相对较低。', preset: true },

  // ---- 宝石（1 级，镶嵌材料；多以银币计） ----
  { id: 'price-gem-taiyang', name: '太阳石（1 级）', category: '宝石', price: '约 4.5 万银', desc: '镶嵌命中，合成高级用；低级宝石多以银币交易。', preset: true },
  { id: 'price-gem-guangmang', name: '光芒石（1 级）', category: '宝石', price: '约 6 万银', desc: '镶嵌伤害。', preset: true },
  { id: 'price-gem-sheli', name: '舍利子（1 级）', category: '宝石', price: '约 6–7 万银', desc: '镶嵌气血，需求大；7 级约需 64 颗。', preset: true },
  { id: 'price-gem-yueliang', name: '月亮石（1 级）', category: '宝石', price: '约 9–10 万银', desc: '镶嵌防御，价格较高；7 级约需 64 颗、造价约 700 万。', preset: true },
  { id: 'price-gem-cold', name: '冷门宝石（红玛瑙 / 黑宝石 / 翡翠石 / 绿宝石 / 神秘石）', category: '宝石', price: '视区，部分无人收', desc: '冷门属性宝石，个别区服可能挂不出去。', preset: true },

  // ---- 珍宝：副本 / 秘境 / 天命 / 挖宝高价产出 ----
  { id: 'price-zhenzhu', name: '130 级珍珠', category: '珍宝', price: '视区（较值钱）', desc: '秘境 / 副本产出，用于修理高耐久装备，耐久机制变动会影响价格。', preset: true },
  { id: 'price-yuanchu-moshi', name: '原初魔石', category: '珍宝', price: '视区（较值钱）', desc: '天命副本核心产出之一（侠士 / 英雄难度有机会掉落）。', preset: true },
  { id: 'price-cangbaotu-high', name: '高级藏宝图', category: '珍宝', price: '视区（挖宝产出）', desc: '挖出高价物品概率低，价格随出货预期波动。', preset: true },

  // ---- 材料 / 消耗 ----
  { id: 'price-sheyaoxiang', name: '摄妖香', category: '材料', price: '1000 银 / 支（杂货店固定）', desc: '各地杂货店可买，使用后约 30 分钟避免遇怪。', preset: true },
  { id: 'price-jinliulu', name: '金柳露 / 超级金柳露', category: '材料', price: '视区', desc: '炼妖时改变召唤兽等级的原料。', preset: true },
  { id: 'price-xinghuishi', name: '星辉石', category: '材料', price: '视区', desc: '打造 / 强化装备相关材料。', preset: true },
]
