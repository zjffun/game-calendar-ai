/**
 * 生成本地唯一 ID。优先用 crypto.randomUUID，降级用时间戳+随机数。
 */
export function uid(prefix = ''): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return prefix + crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
