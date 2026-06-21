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
// 庭院种子预设（生长时长可在界面调整）
// ----------------------------------------------------------------------------

export const SEED_PRESETS: SeedPreset[] = [
  { seedName: '一级种子', level: 1, defaultDurationMs: 2 * MS_PER_HOUR },
  { seedName: '二级种子', level: 2, defaultDurationMs: 4 * MS_PER_HOUR },
  { seedName: '三级种子', level: 3, defaultDurationMs: 8 * MS_PER_HOUR },
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
  // 天命副本「每 4 天」刷新的起算基准（默认 2024-01-01 00:00，可在设置里对齐到实际刷新时刻）
  every4DaysAnchor: new Date(2024, 0, 1, 0, 0, 0, 0).getTime(),
}
