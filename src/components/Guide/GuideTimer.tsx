// ============================================================================
// 攻略计时：给一条攻略「开始 / 结束」计时，并记录每次用时。
// - 计时状态存的是「开始时刻」而非已走秒数（store.guideRuns），刷新页面、
//   切标签页、换设备（云同步）后回来还能接着算，不会归零；
// - 结束即记一条历史（最新在前），可展开查看、单条删除、一键清空；
// - 周六/周日活动是固定开放时段的玩法，不需要计时，由调用方（GuideBook）不渲染本组件。
// ============================================================================

import { useEffect, useState } from 'react'
import { useGuideRuns } from '../../store/useAppStore'
import { formatClock, formatElapsed } from '../../utils/time'
import { appConfirm } from '../common/ConfirmDialog'
import Icon from '../common/Icon'

interface Props {
  /** 所属攻略 id（内置攻略 id 稳定，可放心作为存储键） */
  guideId: string
}

/** 展开历史前默认只列最近几条，超出部分点「全部」再展开 */
const PREVIEW_COUNT = 5

export default function GuideTimer({ guideId }: Props) {
  const { guideRuns, start, finish, cancel, removeRun, clearRuns } = useGuideRuns()
  const log = guideRuns[guideId]
  const running = log?.running
  const runs = log?.runs ?? []

  const [showHistory, setShowHistory] = useState(false)
  const [showAll, setShowAll] = useState(false)
  // 计时中每秒重渲染一次；不计时不开定时器
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  // 切换攻略时收起历史（本组件由调用方带 key={guideId} 重挂载，这里是双保险）
  useEffect(() => {
    setShowHistory(false)
    setShowAll(false)
  }, [guideId])

  const best = runs.length ? Math.min(...runs.map((r) => r.durationMs)) : 0
  const avg = runs.length
    ? Math.round(runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length)
    : 0
  const visibleRuns = showAll ? runs : runs.slice(0, PREVIEW_COUNT)

  async function handleCancel() {
    if (!(await appConfirm('放弃本次计时吗？本次用时不会被记录。'))) return
    cancel(guideId)
  }

  async function handleClear() {
    if (!(await appConfirm(`确定清空这条攻略的 ${runs.length} 条计时记录吗？`))) return
    clearRuns(guideId)
    setShowAll(false)
  }

  return (
    <section className="guide-timer">
      <div className="guide-timer-bar">
        <Icon name="clock" size={14} className="guide-timer-glyph" />
        <span className="guide-timer-title">用时计时</span>

        {running ? (
          <span className="guide-timer-live" title={`开始于 ${formatClock(running)}`}>
            {formatElapsed(Date.now() - running)}
          </span>
        ) : runs.length > 0 ? (
          <span className="muted small guide-timer-stats">
            最近 {formatElapsed(runs[0].durationMs)} · 最快 {formatElapsed(best)} · 平均{' '}
            {formatElapsed(avg)}
          </span>
        ) : (
          <span className="muted small guide-timer-stats">还没有记录，开一把试试</span>
        )}

        <span className="spacer" />

        {running ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={handleCancel}>
              <Icon name="x" size={13} />
              放弃
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => finish(guideId)}>
              <Icon name="check" size={13} />
              结束
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => start(guideId)}>
            <Icon name="clock" size={13} />
            开始
          </button>
        )}

        {runs.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            <Icon name="note" size={13} />
            记录 {runs.length}
          </button>
        )}
      </div>

      {showHistory && runs.length > 0 && (
        <div className="guide-timer-history pop-in">
          <ul className="guide-timer-list">
            {visibleRuns.map((r, i) => (
              <li className="guide-timer-row" key={r.id}>
                {/* visibleRuns 恒为「最新在前」列表的前缀，故第 i 条的次序号 = 总数 - i */}
                <span className="guide-timer-index">#{runs.length - i}</span>
                <span className="guide-timer-when">{formatClock(r.startedAt)}</span>
                <span
                  className={`guide-timer-dur${r.durationMs === best ? ' best' : ''}`}
                  title={r.durationMs === best ? '目前最快' : undefined}
                >
                  {formatElapsed(r.durationMs)}
                </span>
                <button
                  type="button"
                  className="guide-timer-del"
                  aria-label="删除这条记录"
                  title="删除这条记录"
                  onClick={() => removeRun(guideId, r.id)}
                >
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="guide-timer-history-foot">
            {runs.length > PREVIEW_COUNT && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? '收起' : `展开全部 ${runs.length} 条`}
              </button>
            )}
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={handleClear}>
              <Icon name="trash" size={13} />
              清空记录
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
