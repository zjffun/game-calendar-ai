// ============================================================================
// 自定义添加表单：名称 + 周期(daily/weekly/monthly) + 可选备注。
// ============================================================================

import { useState } from 'react'
import type { TodoCycle } from '../../types'
import { useTodos } from '../../store/useAppStore'

const CYCLE_OPTIONS: { value: TodoCycle; label: string }[] = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
]

export default function AddTodoForm() {
  const { add } = useTodos()
  const [name, setName] = useState('')
  const [cycle, setCycle] = useState<TodoCycle>('daily')
  const [note, setNote] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    add({ name: trimmed, cycle, note: note.trim() || undefined })
    // 重置输入，保留所选周期方便连续添加
    setName('')
    setNote('')
  }

  return (
    <div className="stack">
      <div className="row row-wrap">
        <div className="field" style={{ flex: '2 1 180px' }}>
          <label>任务名称</label>
          <input
            className="input"
            value={name}
            maxLength={40}
            placeholder="例如：师门任务"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>
        <div className="field" style={{ flex: '1 1 110px' }}>
          <label>周期</label>
          <select
            className="select"
            value={cycle}
            onChange={(e) => setCycle(e.target.value as TodoCycle)}
          >
            {CYCLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '2 1 180px' }}>
          <label>备注（可选）</label>
          <input
            className="input"
            value={note}
            maxLength={60}
            placeholder="可留空"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
          ＋ 添加任务
        </button>
      </div>
    </div>
  )
}
