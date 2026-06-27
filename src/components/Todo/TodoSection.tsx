// ============================================================================
// 待办 TODO 模块主入口。
// - 三类周期（每日/每周/每月）分组展示，各组显示完成进度与「距下次刷新」倒计时；
// - 每条 TODO 可勾选完成 / 编辑 / 删除；
// - 「常用任务」一键添加（PresetPicker）+ 自定义添加表单（AddTodoForm）。
// 所有数据变更均通过 store actions，倒计时由 useNow 驱动刷新。
// ============================================================================

import { useMemo } from 'react'
import type { TodoCycle, TodoTask } from '../../types'
import type { TabId } from '../../tabs'
import { useTodos, useSettings, useCharacters } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import { getPeriodKey, getNextReset, formatCountdown } from '../../utils/time'
import { effectiveCharacterIds, isTaskAllDone } from '../../utils/todo'
import TodoItem from './TodoItem'
import PresetPicker from './PresetPicker'
import AddTodoForm from './AddTodoForm'
import CharacterBar from './CharacterBar'
import './Todo.css'

interface CycleMeta {
  cycle: TodoCycle
  label: string
  glyph: string
  /** 周期徽标对应的全局类名 */
  badgeClass: string
}

const CYCLES: CycleMeta[] = [
  { cycle: 'daily', label: '每日', glyph: '🌅', badgeClass: 'badge-daily' },
  { cycle: 'weekly', label: '每周', glyph: '📅', badgeClass: 'badge-weekly' },
  { cycle: 'monthly', label: '每月', glyph: '🌙', badgeClass: 'badge-monthly' },
]

/** 按 order 升序排序（无 order 的排后面） */
function byOrder(a: TodoTask, b: TodoTask): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
}

interface Props {
  /** 跳转到其它标签页（用于「攻略大全」入口） */
  onNavigate?: (tab: TabId) => void
}

export default function TodoSection({ onNavigate }: Props) {
  const { todos } = useTodos()
  const { settings } = useSettings()
  const { characters } = useCharacters()
  const charIds = effectiveCharacterIds(characters)
  const now = useNow(1000)

  // 按周期分组并排序，仅在依赖变化时重算
  const grouped = useMemo(() => {
    const map: Record<TodoCycle, TodoTask[]> = { daily: [], weekly: [], monthly: [] }
    for (const t of todos) map[t.cycle].push(t)
    for (const key of Object.keys(map) as TodoCycle[]) map[key].sort(byOrder)
    return map
  }, [todos])

  const hasAny = todos.length > 0

  return (
    <section className="stack pop-in">
      <h2 className="section-title">
        <span className="glyph" aria-hidden>
          📜
        </span>
        日常待办
      </h2>

      {/* 攻略大全入口：跳转到攻略模块（副本/神器/奇遇/看戏 + 自定义） */}
      {onNavigate && (
        <button type="button" className="todo-guide-entry" onClick={() => onNavigate('guide')}>
          <span className="todo-guide-entry-glyph" aria-hidden>
            📖
          </span>
          <span className="todo-guide-entry-text">
            <strong>攻略大全</strong>
            <span className="muted small">副本 · 神器 · 奇遇 · 看戏，支持自定义</span>
          </span>
          <span className="todo-guide-entry-arrow" aria-hidden>
            ›
          </span>
        </button>
      )}

      {/* 角色管理：增加角色后按角色分别勾选 */}
      <CharacterBar />

      {/* 三类周期分组 */}
      {CYCLES.map((meta) => {
        const list = grouped[meta.cycle]
        const periodKey = getPeriodKey(meta.cycle, now, settings)
        // 一条任务「全部角色完成」才算完成
        const doneCount = list.filter((t) => isTaskAllDone(t, charIds, periodKey)).length
        const total = list.length
        // 距下次刷新倒计时
        const remaining = getNextReset(meta.cycle, now, settings) - now
        const allDone = total > 0 && doneCount === total

        return (
          <div className="card" key={meta.cycle}>
            <div className="card-head todo-group-head">
              <span className={`badge ${meta.badgeClass}`}>
                {meta.glyph} {meta.label}
              </span>
              <h3>{meta.label}任务</h3>
              {total > 0 && (
                <span className="todo-group-progress">
                  已完成 {doneCount}/{total}
                </span>
              )}
              <span className="spacer" />
              <span className="muted small">距刷新</span>
              <span className={`countdown small${allDone ? ' ready' : ''}`}>
                {formatCountdown(remaining)}
              </span>
            </div>

            {total === 0 ? (
              <div className="empty">
                暂无{meta.label}任务，可从下方「常用任务」一键添加，或自定义新增。
              </div>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {list.map((task) => (
                  <TodoItem key={task.id} task={task} periodKey={periodKey} />
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {/* 常用任务一键添加 */}
      <div className="card">
        <div className="card-head">
          <span className="glyph" aria-hidden>
            ⭐
          </span>
          <h3>常用任务</h3>
          <span className="muted small">点击添加，已添加的点击可移除</span>
        </div>
        <PresetPicker />
      </div>

      {/* 自定义添加 */}
      <div className="card">
        <div className="card-head">
          <span className="glyph" aria-hidden>
            ✍️
          </span>
          <h3>自定义添加</h3>
        </div>
        <AddTodoForm />
      </div>

      {!hasAny && (
        <p className="muted small" style={{ textAlign: 'center' }}>
          小贴士：跨天/跨周/跨月后，完成状态会自动重置，无需手动清除。
        </p>
      )}
    </section>
  )
}
