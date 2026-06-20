// ============================================================================
// 单条待办 TODO 行：大复选框勾选完成、行内编辑名称/备注、删除。
// ============================================================================

import { useState } from 'react'
import type { TodoTask } from '../../types'
import { useTodos } from '../../store/useAppStore'

interface TodoItemProps {
  task: TodoTask
  /** 当前周期 Key（由父级按 task.cycle 计算后传入） */
  periodKey: string
}

export default function TodoItem({ task, periodKey }: TodoItemProps) {
  const { toggle, update, remove } = useTodos()
  // 是否本周期已完成
  const done = task.lastCompletedPeriodKey === periodKey

  // 编辑态：本地缓存输入，确认后写回 store
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(task.name)
  const [note, setNote] = useState(task.note ?? '')

  function startEdit() {
    setName(task.name)
    setNote(task.note ?? '')
    setEditing(true)
  }

  function saveEdit() {
    const trimmed = name.trim()
    if (!trimmed) return // 名称不能为空
    update(task.id, { name: trimmed, note: note.trim() || undefined })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="todo-item pop-in">
        <div className="todo-edit">
          <div className="field">
            <label>任务名称</label>
            <input
              className="input"
              value={name}
              autoFocus
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
          </div>
          <div className="field">
            <label>备注（可选）</label>
            <input
              className="input"
              value={note}
              maxLength={60}
              placeholder="例如：先做双倍"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
          </div>
          <div className="row">
            <button className="btn btn-jade btn-sm" onClick={saveEdit} disabled={!name.trim()}>
              保存
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className={`todo-item${done ? ' todo-done' : ''}`}>
      <button
        type="button"
        className={`todo-check${done ? ' checked' : ''}`}
        aria-pressed={done}
        title={done ? '点击取消完成' : '点击标记完成'}
        onClick={() => toggle(task.id, periodKey)}
      >
        ✓
      </button>

      <div className="todo-body">
        <div className="todo-name">{task.name}</div>
        {task.note && <div className="todo-note">{task.note}</div>}
      </div>

      <div className="todo-actions">
        <button className="btn btn-ghost btn-icon" title="编辑" onClick={startEdit}>
          ✎
        </button>
        <button
          className="btn btn-ghost btn-icon"
          title="删除"
          onClick={() => remove(task.id)}
        >
          🗑
        </button>
      </div>
    </li>
  )
}
