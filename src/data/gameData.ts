// ============================================================================
// 梦幻西游 预设数据
// 说明：数值（如种子生长时长、副本周期、房屋衰减）为合理默认值，
//      均可在界面中调整，以适配不同服务器 / 版本。
// ============================================================================

import type {
  PresetTodo,
  SeedPreset,
  DungeonPreset,
  HouseState,
  AppSettings,
} from '../types'
import { MS_PER_HOUR } from '../utils/time'

// ----------------------------------------------------------------------------
// 常用 TODO 预设（可一键勾选添加）
// ----------------------------------------------------------------------------

export const PRESET_TODOS: PresetTodo[] = [
  // —— 每日 ——
  { name: '签到', cycle: 'daily', category: '日常' },
  { name: '牧场喂养', cycle: 'daily', category: '日常' },
  { name: '庭院浇水/种植', cycle: 'daily', category: '日常' },
  { name: '师门任务', cycle: 'daily', category: '日常' },
  { name: '捉鬼', cycle: 'daily', category: '日常' },
  { name: '帮派任务', cycle: 'daily', category: '帮派' },
  { name: '帮派修炼', cycle: 'daily', category: '帮派' },
  { name: '押镖/跑商', cycle: 'daily', category: '日常' },
  { name: '江湖英杰录', cycle: 'daily', category: '活动' },
  { name: '法宝任务', cycle: 'daily', category: '日常' },
  { name: '华山论剑', cycle: 'daily', category: '活动' },
  { name: '双倍时间', cycle: 'daily', category: '活动' },
  { name: '善恶有报', cycle: 'daily', category: '活动' },
  { name: '领取体力/活力', cycle: 'daily', category: '日常' },

  // —— 每周 ——
  { name: '比武大会', cycle: 'weekly', category: '活动' },
  { name: '帮派玲珑宝图', cycle: 'weekly', category: '帮派' },
  { name: '三界悬赏', cycle: 'weekly', category: '活动' },
  { name: '科举乡试/会试', cycle: 'weekly', category: '活动' },
  { name: '师门礼遇', cycle: 'weekly', category: '日常' },

  // —— 每月 ——
  { name: '月卡/会员领取', cycle: 'monthly', category: '福利' },
  { name: '月长安保卫战', cycle: 'monthly', category: '活动' },
]

// ----------------------------------------------------------------------------
// 庭院种子预设（生长时长可在界面调整）
// ----------------------------------------------------------------------------

export const SEED_PRESETS: SeedPreset[] = [
  { seedName: '一级种子', level: 1, defaultDurationMs: 2 * MS_PER_HOUR },
  { seedName: '二级种子', level: 2, defaultDurationMs: 4 * MS_PER_HOUR },
  { seedName: '三级种子', level: 3, defaultDurationMs: 8 * MS_PER_HOUR },
]

// ----------------------------------------------------------------------------
// 副本预设（周期可在界面调整）
// ----------------------------------------------------------------------------

export const DUNGEON_PRESETS: DungeonPreset[] = [
  { name: '车迟斗法', resetCycle: 'weekly' },
  { name: '乌鸡国', resetCycle: 'weekly' },
  { name: '大闹天宫', resetCycle: 'weekly' },
  { name: '一气化三清', resetCycle: 'weekly' },
  { name: '通天河', resetCycle: 'weekly' },
  { name: '水陆大会', resetCycle: 'weekly' },
  { name: '镇妖塔', resetCycle: 'weekly' },
  { name: '师门副本', resetCycle: 'daily' },
  { name: '帮派副本', resetCycle: 'daily' },
]

// ----------------------------------------------------------------------------
// 房屋默认状态
// ----------------------------------------------------------------------------

export function createDefaultHouse(now: number): HouseState {
  return {
    name: '我的房屋',
    cleanlinessBase: 100,
    durabilityBase: 100,
    updatedAt: now,
    cleanlinessDecayPerDay: 5, // 洁净度每日衰减
    durabilityDecayPerDay: 3, // 耐久每日衰减
    cleanlinessWarnThreshold: 30,
    durabilityWarnThreshold: 30,
  }
}

// ----------------------------------------------------------------------------
// 默认全局设置（周期重置点）
// ----------------------------------------------------------------------------

export const DEFAULT_SETTINGS: AppSettings = {
  dailyResetHour: 0, // 每日 0 点重置
  weeklyResetWeekday: 1, // 周一重置
}
