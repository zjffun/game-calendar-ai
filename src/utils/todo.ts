// ============================================================================
// 待办「按角色完成」相关的纯函数工具。
// 单角色（未添加角色）时统一用保留 ID SOLO_CHARACTER_ID，复用同一套逻辑。
// ============================================================================

import { type Character, type TodoTask, SOLO_CHARACTER_ID } from '../types'

/** 实际参与完成判定的角色 ID 列表：没有角色时返回 [SOLO]。 */
export function effectiveCharacterIds(characters: Character[]): string[] {
  return characters.length > 0 ? characters.map((c) => c.id) : [SOLO_CHARACTER_ID]
}

/** 某角色本周期是否已完成该任务。 */
export function isCharDone(task: TodoTask, charId: string, periodKey: string): boolean {
  return task.completions?.[charId] === periodKey
}

/** 本周期内已完成该任务的角色数量。 */
export function doneCharCount(task: TodoTask, charIds: string[], periodKey: string): number {
  return charIds.reduce((n, id) => (isCharDone(task, id, periodKey) ? n + 1 : n), 0)
}

/** 是否全部角色都已完成（用于主勾选框 / 进度统计）。 */
export function isTaskAllDone(task: TodoTask, charIds: string[], periodKey: string): boolean {
  return charIds.length > 0 && charIds.every((id) => isCharDone(task, id, periodKey))
}

/** 是否部分（至少一个、但非全部）角色已完成（用于主勾选框的半选态）。 */
export function isTaskPartlyDone(task: TodoTask, charIds: string[], periodKey: string): boolean {
  const done = doneCharCount(task, charIds, periodKey)
  return done > 0 && done < charIds.length
}
