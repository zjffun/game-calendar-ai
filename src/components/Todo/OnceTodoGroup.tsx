// ============================================================================
// 「单次待办」分组卡片。
// 单次待办做完即止、不会自动重置，完成后长期堆在列表里会越攒越多。
// 因此这里把「已完成」的单次待办折叠到列表后面（默认收起，可展开），
// 未完成的照常置顶展示，保持待办清爽。
// ============================================================================

import { useMemo, useState } from 'react'
import type { TodoTask } from '../../types'
import { useCharacters } from '../../store/useAppStore'
import { effectiveCharacterIds, isTaskAllDone } from '../../utils/todo'
import { ONCE_PERIOD_KEY } from '../../utils/time'
import TodoItem from './TodoItem'
import AddOnceTodo from './AddOnceTodo'
import Icon from '../common/Icon'

interface OnceTodoGroupProps {
  /** 已按 order 排序的单次待办列表 */
  tasks: TodoTask[]
}

export default function OnceTodoGroup({ tasks }: OnceTodoGroupProps) {
  const { characters } = useCharacters()
  const charIds = effectiveCharacterIds(characters)
  const [showDone, setShowDone] = useState(false)

  // 拆成「未完成」置顶 / 「已完成」折叠到后面（各自保持原有 order）
  const { pending, done } = useMemo(() => {
    const pending: TodoTask[] = []
    const done: TodoTask[] = []
    for (const t of tasks) {
      if (isTaskAllDone(t, charIds, ONCE_PERIOD_KEY)) done.push(t)
      else pending.push(t)
    }
    return { pending, done }
  }, [tasks, charIds])

  const total = tasks.length
  const doneCount = done.length

  return (
    <div className="card">
      <div className="card-head todo-group-head">
        <h3>单次待办</h3>
        {total > 0 && (
          <span className="todo-group-progress">
            {doneCount}/{total} 已完成
          </span>
        )}
        <span className="spacer" />
        <span className="muted small">做完即止，不会自动重置</span>
      </div>

      {pending.length > 0 && (
        <ul className="todo-list">
          {pending.map((task) => (
            <TodoItem key={task.id} task={task} periodKey={ONCE_PERIOD_KEY} />
          ))}
        </ul>
      )}

      {/* 已完成的单次待办：折叠到后面，默认收起 */}
      {doneCount > 0 && (
        <div className="todo-done-fold">
          <button
            type="button"
            className="todo-done-toggle"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            <Icon name={showDone ? 'chevron-down' : 'chevron-right'} size={14} />
            已完成 {doneCount}
          </button>
          {showDone && (
            <ul className="todo-list">
              {done.map((task) => (
                <TodoItem key={task.id} task={task} periodKey={ONCE_PERIOD_KEY} />
              ))}
            </ul>
          )}
        </div>
      )}

      <AddOnceTodo />
    </div>
  )
}
