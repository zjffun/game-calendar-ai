// ============================================================================
// 单次待办的行内添加入口（仅出现在「单次待办」分组卡片内）。
// 单次待办不走底部「自定义添加」，就地输入名称即可添加，做完即止、不自动重置。
// ============================================================================

import { useState } from 'react'
import { useTodos } from '../../store/useAppStore'

export default function AddOnceTodo() {
  const { add } = useTodos()
  const [name, setName] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    add({ name: trimmed, cycle: 'once' })
    setName('') // 清空输入，方便连续添加
  }

  return (
    <div className="row todo-add-once">
      <input
        className="input"
        style={{ flex: 1 }}
        value={name}
        maxLength={40}
        placeholder="添加单次待办，例如：领取活动奖励"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
      <button className="btn btn-primary btn-sm" onClick={submit} disabled={!name.trim()}>
        添加
      </button>
    </div>
  )
}
