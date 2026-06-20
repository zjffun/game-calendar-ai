// ============================================================================
// 「常用任务」一键添加：把 PRESET_TODOS 渲染成 chip，按分类分组。
// - 未添加 → 点击 add 到对应周期；
// - 已存在同名同周期 → chip 显示为 active，点击则移除，避免重复添加。
// ============================================================================

import { useMemo } from 'react'
import type { PresetTodo, TodoTask } from '../../types'
import { useTodos } from '../../store/useAppStore'
import { PRESET_TODOS } from '../../data/gameData'

/** 周期对应的中文标签，用于 chip 文案提示 */
const CYCLE_LABEL: Record<PresetTodo['cycle'], string> = {
  daily: '日',
  weekly: '周',
  monthly: '月',
}

/** 同名同周期视为「同一条」，用于判断预设是否已添加 */
function sameTask(a: { name: string; cycle: string }, b: { name: string; cycle: string }): boolean {
  return a.name === b.name && a.cycle === b.cycle
}

export default function PresetPicker() {
  const { todos, add, remove } = useTodos()

  // 按 category 分组（无分类归入「其它」），保持预设原有顺序
  const groups = useMemo(() => {
    const map = new Map<string, PresetTodo[]>()
    for (const preset of PRESET_TODOS) {
      const cat = preset.category ?? '其它'
      const list = map.get(cat) ?? []
      list.push(preset)
      map.set(cat, list)
    }
    return [...map.entries()]
  }, [])

  // 找到与预设匹配的已存在任务（用于切换 active / 移除）
  function findExisting(preset: PresetTodo): TodoTask | undefined {
    return todos.find((t) => sameTask(t, preset))
  }

  function onChipClick(preset: PresetTodo) {
    const existing = findExisting(preset)
    if (existing) {
      // 已添加则移除，实现可逆切换
      remove(existing.id)
    } else {
      add({ name: preset.name, cycle: preset.cycle, preset: true })
    }
  }

  return (
    <div className="stack">
      {groups.map(([category, presets]) => (
        <div className="todo-preset-group" key={category}>
          <div className="todo-preset-cat">{category}</div>
          <div className="todo-preset-chips">
            {presets.map((preset) => {
              const active = Boolean(findExisting(preset))
              return (
                <span
                  key={`${preset.cycle}:${preset.name}`}
                  className={`chip todo-chip${active ? ' active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  title={active ? '点击移除该任务' : '点击添加到列表'}
                  onClick={() => onChipClick(preset)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onChipClick(preset)
                    }
                  }}
                >
                  <span className="todo-chip-mark">{active ? '✓' : '＋'}</span>
                  {preset.name}
                  <span className="small muted" style={{ opacity: 0.8 }}>
                    {CYCLE_LABEL[preset.cycle]}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
