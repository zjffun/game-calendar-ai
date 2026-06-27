// ============================================================================
// 庭院种子等级 -> 徽标配色 / 文案（AddSeedForm 与 SeedTimerCard 共享）
// 配色：1=碧 / 2=金 / 3=红 / 4=紫，自定义(0)=描边。
// ============================================================================

/** 等级 -> 徽标类名 */
export function levelBadgeClass(level: number): string {
  if (level >= 4) return 'badge-purple'
  if (level === 3) return 'badge-red'
  if (level === 2) return 'badge-gold'
  if (level === 1) return 'badge-ok'
  return 'badge-outline'
}

/** 等级 -> 文案，例如 '2 级'；未分级返回 '未分级' */
export function levelLabel(level: number): string {
  return level > 0 ? `${level} 级` : '未分级'
}
