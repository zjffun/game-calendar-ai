// ============================================================================
// 价格趋势可视化（纯内联 SVG，无第三方图表库）
// - Sparkline：列表行内的迷你走势
// - TrendChart：物品详情里的较大折线图（含最值、日期范围、样本点）
// 数据 = 该物品的价格观测按天取中位数。
// ============================================================================

import { useMemo } from 'react'
import type { PriceObservation } from '../../types'
import { dailyMedianSeries, formatMoney } from '../../utils/priceParse'

export function Sparkline({
  obs,
  width = 132,
  height = 30,
}: {
  obs: PriceObservation[]
  width?: number
  height?: number
}) {
  const series = useMemo(() => dailyMedianSeries(obs), [obs])
  if (series.length < 2) return null
  const values = series.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 3
  const x = (i: number) => pad + (i / (series.length - 1)) * (width - 2 * pad)
  const y = (v: number) => height - pad - ((v - min) / range) * (height - 2 * pad)
  const d = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ')
  const lastIdx = series.length - 1
  const up = series[lastIdx].value >= series[0].value
  return (
    <svg
      className={`spark ${up ? 'spark-up' : 'spark-down'}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastIdx)} cy={y(series[lastIdx].value)} r="2.2" fill="currentColor" />
    </svg>
  )
}

export function TrendChart({ obs }: { obs: PriceObservation[] }) {
  const series = useMemo(() => dailyMedianSeries(obs), [obs])

  if (series.length === 0) {
    return <div className="muted small">暂无可绘制的趋势（观测都没解析出价格数值）。</div>
  }
  if (series.length === 1) {
    const p = series[0]
    return (
      <div className="muted small">
        仅 1 天数据（{fmtDate(p.t)}）：{formatMoney(p.value)}。多导入几天即可看到走势。
      </div>
    )
  }

  const W = 320
  const H = 132
  const padL = 8
  const padR = 8
  const padT = 10
  const padB = 18
  const values = series.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const x = (i: number) => padL + (i / (series.length - 1)) * (W - padL - padR)
  const y = (v: number) => H - padB - ((v - min) / range) * (H - padT - padB)
  const line = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" preserveAspectRatio="none" role="img" aria-label="价格趋势">
        <path d={area} className="trend-area" />
        <path d={line} className="trend-line" fill="none" />
        {series.map((p, i) => (
          <circle key={p.t} cx={x(i)} cy={y(p.value)} r="2" className="trend-dot">
            <title>{`${fmtDate(p.t)}：${formatMoney(p.value)}（${p.count} 条）`}</title>
          </circle>
        ))}
      </svg>
      <div className="trend-axis">
        <span>{fmtDate(series[0].t)}</span>
        <span className="muted">高 {formatMoney(max)} · 低 {formatMoney(min)}</span>
        <span>{fmtDate(series[series.length - 1].t)}</span>
      </div>
    </div>
  )
}

function fmtDate(t: number): string {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
