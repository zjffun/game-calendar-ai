// ============================================================================
// 梦幻西游 预设数据
// 说明：数值（如种子生长时长、副本周期、房屋衰减）为合理默认值，
//      均可在界面中调整，以适配不同服务器 / 版本。
// ============================================================================

import type {
  PresetTodo,
  SeedPreset,
  SeedGrowthCycle,
  DungeonPreset,
  HouseState,
  AppSettings,
} from '../types'
import { MS_PER_HOUR } from '../utils/time'

// ----------------------------------------------------------------------------
// 常用 TODO 预设（可一键勾选添加）
// ----------------------------------------------------------------------------

export const PRESET_TODOS: PresetTodo[] = [
  // —— 日常（每日）——
  { name: '签到', cycle: 'daily', category: '日常' },
  { name: '牧场', cycle: 'daily', category: '日常' },
  { name: '庭院', cycle: 'daily', category: '日常' },
  { name: '房屋休息', cycle: 'daily', category: '日常' },
  { name: '飘香香', cycle: 'daily', category: '日常' },
  { name: '师门任务', cycle: 'daily', category: '日常' },
  { name: '师徒任务', cycle: 'daily', category: '日常' },
  { name: '押镖', cycle: 'daily', category: '日常' },
  { name: '修炼法宝', cycle: 'daily', category: '日常' },
  { name: '吃百岁', cycle: 'daily', category: '日常' },
  { name: '吃海马', cycle: 'daily', category: '日常' },

  // —— 周常（每周）——
  { name: '九色鹿1', cycle: 'weekly', category: '周常' },
  { name: '九色鹿2', cycle: 'weekly', category: '周常' },
  { name: '维摩诘', cycle: 'weekly', category: '周常' },
  { name: '看戏', cycle: 'weekly', category: '周常' },

  // —— 月常（每月）——
  { name: '领取回梦丹', cycle: 'monthly', category: '月常' },
  { name: '换五行之力', cycle: 'monthly', category: '月常' },
  { name: '换免费仙玉', cycle: 'monthly', category: '月常' },
]

// ----------------------------------------------------------------------------
// 庭院种子「生长周期」（参考梦幻西游电脑版资料）
//
// 计时口径：以「种下当天 = 第 1 天」，结果(收获)与清除均在当日 0 点(每日重置点)生效。
//
// 数据来源与置信度（详见 git 提交说明）：
//   · 二级 / 三级：高置信。17173 电脑版实测文逐日原文佐证，且 3DM / 网易官方对
//     永久休眠日(13 / 18)交叉印证。
//   · 四级：clearDay=22 较可信（3DM / 9game / 叶子猪原文一致）；但逐日 harvestDays
//     为【推断值】—— 所有实测来源均注明四级「种子昂贵，暂未实验」。此处按二/三级
//     规律(每循环 2 次结果、循环间隔 4~5 天、共 4 循环约 8 次结果)外推，落在第 21、22 天
//     以第 22 天永久休眠收束。若官方/实测公布精确日程，请在此更正。
// 参考：18183 / 9game / 3DM / 叶子猪 / 网易官方 xyq.163.com。
// ----------------------------------------------------------------------------

export const GROWTH_CYCLES: SeedGrowthCycle[] = [
  // 二级：两循环、四次结果（高置信）
  { level: 2, harvestDays: [7, 8, 12, 13], clearDay: 13, restDays: [9], earlyRipenDay: 6 },
  // 三级：三循环、六次结果（高置信）
  { level: 3, harvestDays: [7, 8, 11, 12, 16, 17], clearDay: 18, restDays: [13], earlyRipenDay: 6 },
  // 四级：四循环、约八次结果（clearDay 较可信；harvestDays 为推断值）
  {
    level: 4,
    harvestDays: [7, 8, 11, 12, 16, 17, 21, 22],
    clearDay: 22,
    restDays: [13, 18],
    earlyRipenDay: 6,
  },
]

/** 按等级查找生长周期；无对应等级（如自定义）返回 undefined */
export function getGrowthCycle(level: number): SeedGrowthCycle | undefined {
  return GROWTH_CYCLES.find((c) => c.level === level)
}

/** 养护操作要点（电脑版各来源一致，高置信），用于界面提示 */
export const CARE_GUIDE: string[] = [
  '种下当天：浇水 4 次 + 施肥 2 次，养到「笑脸」状态',
  '之后每天：浇水 2 次 + 施肥 1 次，维持笑脸',
  '查看状态前先「除虫」；有虫(难受脸)务必先除',
  '每日 0 点状态下降，需当天养护补满；状态归零会枯死',
  '二级及以上为多年生，中途休眠当天仍需 2 水 1 肥',
]

// ----------------------------------------------------------------------------
// 庭院种子预设（快速添加）
// 二 / 三 / 四级走真实「生长周期」(cycle)；
// 「自定义」种子走单次倒计时(timer)，时长可在界面填写。
// ----------------------------------------------------------------------------

/** 自定义(timer 模式)种子的默认生长时长 */
export const CUSTOM_SEED_DEFAULT_DURATION_MS = 4 * MS_PER_HOUR

export const SEED_PRESETS: SeedPreset[] = [
  { seedName: '二级种子', level: 2, mode: 'cycle' },
  { seedName: '三级种子', level: 3, mode: 'cycle' },
  { seedName: '四级种子', level: 4, mode: 'cycle' },
]

// ----------------------------------------------------------------------------
// 副本预设（周期可在界面调整）
// 依据梦幻西游电脑版「天命副本」系统（2024「天命之路」资料片起）：
//   - 天命副本进度【每 4 天】刷新一次；
//   - 仅 胡姬琵琶行、西域宝藏 为【每周】刷新；
//   - 实际「天命」名单会随天命游记轮换，这里给出常见副本池，可自行增删。
// ----------------------------------------------------------------------------

export const DUNGEON_PRESETS: DungeonPreset[] = [
  // —— 天命副本（每 4 天刷新）——
  { name: '车迟国', resetCycle: 'every4days' },
  { name: '乌鸡国', resetCycle: 'every4days' },
  { name: '通天河', resetCycle: 'every4days' },
  { name: '水陆大会', resetCycle: 'every4days' },
  { name: '金兜洞', resetCycle: 'every4days' },
  { name: '秘境降妖', resetCycle: 'every4days' },
  { name: '红孩儿', resetCycle: 'every4days' },
  { name: '黑风山', resetCycle: 'every4days' },
  { name: '灵猴出世', resetCycle: 'every4days' },
  { name: '东海巡珍', resetCycle: 'every4days' },
  { name: '青丘迷雾', resetCycle: 'every4days' },
  { name: '七绝山', resetCycle: 'every4days' },
  // —— 每周刷新 ——
  { name: '胡姬琵琶行', resetCycle: 'weekly' },
  { name: '西域宝藏', resetCycle: 'weekly' },
]

// ----------------------------------------------------------------------------
// 房屋系统数据（参考梦幻西游电脑版「房屋属性」官方与攻略资料）
//
// 数据来源与置信度：
//   · 耐久四档(≥80=100% / 60-79=80% / 30-59=60% / <30=40%，0 有几率倒塌)：
//     高置信，网易官方「耐久指数」页 3 处电脑版来源逐字一致。
//   · 清洁度=100 时环境指数最高、休息次数最多：高置信（官方原文）。
//   · 每日衰减约 4/4：中置信（叶子猪手册 + 百度知道转引；官方页未给精确点数）。
//   · 佣人房恢复(修理=10+7×等级 / 清洁=20+10×等级)：普通档官方证实(+17)，
//     其余为多玩家来源自洽公式，高级档(+31/+50)为推断。
//   · 维护机制：打扫(只加清洁)与修理(只加耐久)是两个独立、各自付费的操作（5 源一致）。
// 参考：xyq.163.com(官方) / 叶子猪 / 百度知道 / 9game。
// ----------------------------------------------------------------------------

/** 佣人房等级 -> 单次打扫/修理恢复量（index 即等级） */
export const SERVANT_ROOM_TIERS = [
  { name: '无佣人房', cleanGain: 20, durabilityGain: 10 },
  { name: '普通佣人房', cleanGain: 30, durabilityGain: 17 },
  { name: '中级佣人房', cleanGain: 40, durabilityGain: 24 },
  { name: '高级佣人房', cleanGain: 50, durabilityGain: 31 },
] as const

/** 房屋档次与空间（格数口径：民宅 8-14 / 华宅 18-22 / 豪宅 28-32） */
export const HOUSE_TIERS = [
  { name: '民宅', spaceMin: 8, spaceMax: 14 },
  { name: '华宅', spaceMin: 18, spaceMax: 22 },
  { name: '豪宅', spaceMin: 28, spaceMax: 32 },
] as const

/** 房屋养护要点（用于界面参考提示） */
export const HOUSE_GUIDE: string[] = [
  '耐久度官方四档：≥80 满效果，60-79 降为 80%，30-59 降为 60%，低于 30 仅 40%',
  '耐久为 0 时房屋有几率倒塌需重建，建议降到 80~83 就修理',
  '清洁度=100 时环境指数最高，卧室每日休息次数最多（如紫气豪宅 100→11 次、96→10 次）',
  '打扫只加清洁、修理只加耐久，是两个独立操作，需分别雇佣人并各自付费',
  '清洁与耐久每天各约衰减 4 点，家具/房间越多衰减越慢',
  '卧室休息恢复全部气血魔法；房屋够整洁还额外回体力/活力（高级卧室约 33 点/次、每日约 14 次）',
]

export function createDefaultHouse(now: number): HouseState {
  return {
    name: '我的房屋',
    cleanlinessBase: 100,
    durabilityBase: 100,
    updatedAt: now,
    cleanlinessDecayPerDay: 4, // 清洁度每日衰减（官方约 4/天）
    durabilityDecayPerDay: 4, // 耐久度每日衰减（官方约 4/天）
    cleanlinessWarnThreshold: 90, // 清洁建议保持 ≥90（满环境指数贴近 100）
    durabilityWarnThreshold: 80, // 耐久满效果线 80
    servantRoomLevel: 0, // 默认无佣人房，可在设置中调整
  }
}

// ----------------------------------------------------------------------------
// 默认全局设置（周期重置点）
// ----------------------------------------------------------------------------

export const DEFAULT_SETTINGS: AppSettings = {
  dailyResetHour: 0, // 每日 0 点重置
  weeklyResetWeekday: 1, // 周一重置
  // 天命副本「每 4 天」刷新的起算基准（默认 2024-01-01 00:00，可在设置里对齐到实际刷新时刻）
  every4DaysAnchor: new Date(2024, 0, 1, 0, 0, 0, 0).getTime(),
}
