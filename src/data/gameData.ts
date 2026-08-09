// ============================================================================
// 梦幻西游 预设数据
// 说明：数值（如每日/每周重置点）为合理默认值，
//      均可在界面中调整，以适配不同服务器 / 版本。
// ============================================================================

import type { PresetTodo, AppSettings } from '../types'

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
// 默认全局设置（周期重置点）
// ----------------------------------------------------------------------------

export const DEFAULT_SETTINGS: AppSettings = {
  dailyResetHour: 0, // 每日 0 点重置
  weeklyResetWeekday: 1, // 周一重置
}
