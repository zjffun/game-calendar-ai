// ============================================================================
// 单条待办 TODO 行。
// - 主勾选框表示「全部角色完成」：全部完成=实心✓，部分完成=半选，未完成=空。
//   点击主框：未全部完成则一键全部完成；已全部完成则一键全部取消。
// - 添加了角色后，名称下方出现每个角色的小勾选，可单独标记某个角色完成。
// - 行内编辑名称 / 备注、删除。
// ============================================================================

import { useState } from 'react'
import type { TodoTask } from '../../types'
import { useTodos, useCharacters } from '../../store/useAppStore'
import {
  effectiveCharacterIds,
  isCharDone,
  isTaskAllDone,
  isTaskPartlyDone,
  doneCharCount,
} from '../../utils/todo'

interface TodoItemProps {
  task: TodoTask
  /** 当前周期 Key（由父级按 task.cycle 计算后传入） */
  periodKey: string
}

export default function TodoItem({ task, periodKey }: TodoItemProps) {
  const { toggleCharacter, setAllCharacters, update, remove } = useTodos()
  const { characters } = useCharacters()

  const hasChars = characters.length > 0
  const charIds = effectiveCharacterIds(characters) // 无角色时为 [SOLO]
  const allDone = isTaskAllDone(task, charIds, periodKey)
  const partly = isTaskPartlyDone(task, charIds, periodKey)
  const doneN = doneCharCount(task, charIds, periodKey)

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

  // 主勾选：已全部完成则全部取消，否则全部标记完成
  function toggleMaster() {
    setAllCharacters(task.id, charIds, periodKey, !allDone)
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
    <li className={`todo-item${allDone ? ' todo-done' : ''}`}>
      <button
        type="button"
        role="checkbox"
        className={`todo-check${allDone ? ' checked' : partly ? ' partial' : ''}`}
        aria-checked={allDone ? true : partly ? 'mixed' : false}
        aria-label={
          hasChars ? `${task.name}：${doneN}/${charIds.length} 个角色已完成` : task.name
        }
        title={
          allDone
            ? hasChars
              ? '全部角色已完成，点击全部取消'
              : '已完成，点击取消'
            : hasChars
              ? '点击：全部角色标记完成'
              : '点击标记完成'
        }
        onClick={toggleMaster}
      >
        {partly ? '–' : '✓'}
      </button>

      <div className="todo-body">
        <div className="todo-name">
          {task.name}
          {hasChars && (
            <span className={`todo-charcount${allDone ? ' all' : ''}`}>
              {doneN}/{charIds.length}
            </span>
          )}
        </div>
        {task.note && <div className="todo-note">{task.note}</div>}

        {hasChars && (
          <div className="todo-chars">
            {characters.map((c) => {
              const cdone = isCharDone(task, c.id, periodKey)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`todo-charchip${cdone ? ' done' : ''}`}
                  aria-pressed={cdone}
                  title={cdone ? `${c.name} 已完成，点击取消` : `${c.name} 未完成，点击标记完成`}
                  onClick={() => toggleCharacter(task.id, c.id, periodKey)}
                >
                  <span className="todo-charchip-mark">{cdone ? '✓' : '○'}</span>
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
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
