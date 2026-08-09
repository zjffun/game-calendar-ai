// ============================================================================
// 合成算价：宝石 / 星辉石 / 五色灵尘（各级材料成本）与九转金丹（各品质价格）。
// 作为「物价」页的一个子视图（合成算价），由 PriceBook 直接嵌入，不再是独立页。
// - 输入通过 store 的 synth 分片持久化，随其它数据一并云同步（换设备也能找回填过的价）。
// - 价格用裸数值（不带万/亿单位）；宝石按「不同宝石」分别存价。
// - 计算规则与置信度见 utils/synth.ts；价格为材料成本，不含合成手续费与失败损耗。
// ============================================================================

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useSynth } from '../../store/useAppStore'
import {
  GEM_NAMES,
  GEM_COUNTS,
  STAR_COUNTS,
  DUST_COUNTS,
  levelRows,
  pillQualityPrices,
  pillExp,
  PILL_MAX_QUALITY,
} from '../../utils/synth'
import Icon, { type IconName } from '../common/Icon'
import './Synth.css'

/** 解析裸数值文本；空/非法/非正返回 0。 */
function toNum(text: string): number {
  const n = parseFloat(text)
  return isFinite(n) && n > 0 ? n : 0
}

/** 裸数值展示：整数 + 千分位（不加万/亿单位）。 */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-CN')
}

/** 只保留数字与一个小数点（价格可含小数，如 4.5）。 */
function cleanDecimal(s: string): string {
  const t = s.replace(/[^\d.]/g, '')
  const i = t.indexOf('.')
  return i === -1 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '')
}

/** 只保留数字（品质为整数）。 */
function cleanInt(s: string): string {
  return s.replace(/\D/g, '')
}

// ---------------------------------------------------------------------------
// 单个「按等级合成」的材料卡：宝石 / 星辉石 / 五色灵尘共用
// ---------------------------------------------------------------------------

function LevelCard({
  icon,
  title,
  subtitle,
  inputs,
  base,
  counts,
  countUnit,
  emptyHint,
  note,
}: {
  icon: IconName
  title: string
  subtitle: string
  inputs: ReactNode
  base: number
  counts: number[]
  countUnit: string
  emptyHint: ReactNode
  note: ReactNode
}) {
  const rows = useMemo(() => levelRows(base, counts), [base, counts])
  return (
    <div className="card pad-lg synth-card">
      <div className="synth-card-head">
        <Icon name={icon} size={18} />
        <h3>{title}</h3>
        <span className="spacer" />
        <span className="muted small">{subtitle}</span>
      </div>

      <div className="row row-wrap synth-inputs">{inputs}</div>

      {base <= 0 ? (
        <div className="empty synth-empty">{emptyHint}</div>
      ) : (
        <table className="synth-table">
          <thead>
            <tr>
              <th>等级</th>
              <th className="num">所需 1 级</th>
              <th className="num">材料成本价</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.level} className={r.level === 1 ? 'synth-base-row' : undefined}>
                <td>
                  <span className="synth-level">{r.level} 级</span>
                  {r.level === 1 && <span className="badge badge-outline synth-you">你的输入</span>}
                </td>
                <td className="num">
                  {fmt(r.count)} {countUnit}
                </td>
                <td className="num synth-price">{fmt(r.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted small synth-note">
        <Icon name="alert" size={13} />
        <span>{note}</span>
      </p>
    </div>
  )
}

/** 1 级单价数值输入框 */
function PriceInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      className="input"
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(cleanDecimal(e.target.value))}
    />
  )
}

// ---------------------------------------------------------------------------
// 宝石（多种宝石，各自分别存价）
// ---------------------------------------------------------------------------

function GemCalculator() {
  const { synth, update } = useSynth()
  const name = synth.gemName
  const setName = (v: string) => update({ gemName: v })
  const prices = synth.gemPrices

  const priceText = prices[name] ?? ''
  const base = toNum(priceText)
  const setPrice = (v: string) => update({ gemPrices: { ...prices, [name]: v } })

  // 已填过价的宝石数量（用于提示「各宝石单独存」已生效）
  const filledCount = Object.entries(prices).filter(([, v]) => toNum(v) > 0).length

  return (
    <LevelCard
      icon="gem"
      title="宝石合成算价"
      subtitle="2 颗同级 → 1 颗高级"
      base={base}
      counts={GEM_COUNTS}
      countUnit="颗"
      emptyHint={<>输入 1 级{name}的单价，自动推算 1~10 级价格。</>}
      inputs={
        <>
          <div className="field" style={{ flex: '1 1 150px' }}>
            <label>宝石{filledCount > 0 && <span className="synth-hint"> · 已存 {filledCount} 种</span>}</label>
            <select className="select" value={name} onChange={(e) => setName(e.target.value)}>
              {GEM_NAMES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label>1 级单价</label>
            <PriceInput value={priceText} onChange={setPrice} placeholder={`${name} 1 级价格`} />
          </div>
        </>
      }
      note={
        <>
          端游 2 颗同类同级合 1 颗高一级，N 级 = 2^(N-1) 颗 1 级（10 级 512 颗）。每种宝石单独填价、
          单独保存。此处为<b>材料成本价</b>，未计合成手续费与失败损耗，实际造价更高。
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// 星辉石（3:1，最高 11 锻）
// ---------------------------------------------------------------------------

function StarCalculator() {
  const { synth, update } = useSynth()
  const priceText = synth.starPrice
  const setPrice = (v: string) => update({ starPrice: v })
  const base = toNum(priceText)
  return (
    <LevelCard
      icon="gem"
      title="星辉石合成算价"
      subtitle="3 颗同级 → 1 颗高级"
      base={base}
      counts={STAR_COUNTS}
      countUnit="颗"
      emptyHint="输入 1 级星辉石的单价，自动推算各级价格。"
      inputs={
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label>1 级单价</label>
          <PriceInput value={priceText} onChange={setPrice} placeholder="星辉石 1 级价格" />
        </div>
      }
      note={
        <>
          端游 3 颗同级合 1 颗高一级，N 级 = 3^(N-1) 颗 1 级（最高 11 锻）。此处为<b>材料成本价</b>，
          未计合成手续费；9 锻及以上合成还需额外提交星辉石，实际成本更高。
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// 五色灵尘（必成，N 级 = 2×低一级 + 1×低两级，最高 15 级）
// ---------------------------------------------------------------------------

function DustCalculator() {
  const { synth, update } = useSynth()
  const priceText = synth.dustPrice
  const setPrice = (v: string) => update({ dustPrice: v })
  const base = toNum(priceText)
  return (
    <LevelCard
      icon="gem"
      title="五色灵尘合成算价"
      subtitle="合成必成 · 无失败损耗"
      base={base}
      counts={DUST_COUNTS}
      countUnit="个"
      emptyHint="输入 1 级五色灵尘的单价，自动推算各级价格。"
      inputs={
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label>1 级单价</label>
          <PriceInput value={priceText} onChange={setPrice} placeholder="五色灵尘 1 级价格" />
        </div>
      }
      note={
        <>
          合成必成（消耗体力）：2 级 = 2 个 1 级；N 级 = 2 个低一级 + 1 个低两级（1 级等价个数为
          佩尔数列，最高 15 级）。此处为<b>材料成本价</b>，未计合成消耗的体力。
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// 九转金丹（品质线性，固定输出 10~100）
// ---------------------------------------------------------------------------

function PillCalculator() {
  const { synth, update } = useSynth()
  const quality = synth.pillQuality
  const setQuality = (v: string) => update({ pillQuality: v })
  const priceText = synth.pillPrice
  const setPrice = (v: string) => update({ pillPrice: v })

  const base = toNum(priceText)
  const q = parseInt(quality, 10)
  const validQ = Number.isFinite(q) && q > 0
  const rows = useMemo(() => (validQ ? pillQualityPrices(q, base) : []), [validQ, q, base])

  return (
    <div className="card pad-lg synth-card">
      <div className="synth-card-head">
        <Icon name="coin" size={18} />
        <h3>九转金丹算价</h3>
        <span className="spacer" />
        <span className="muted small">价值随品质线性</span>
      </div>

      <div className="row row-wrap synth-inputs">
        <div className="field" style={{ flex: '0 1 120px' }}>
          <label>基准品质</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            value={quality}
            placeholder="1"
            onChange={(e) => setQuality(cleanInt(e.target.value))}
          />
        </div>
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label>该品质价格</label>
          <PriceInput value={priceText} onChange={setPrice} placeholder="基准品质的价格" />
        </div>
      </div>

      {!validQ || base <= 0 ? (
        <div className="empty synth-empty">
          输入基准品质与其价格（如「1 品质卖 X」），自动推算 10~100 品质价格。
        </div>
      ) : (
        <table className="synth-table">
          <thead>
            <tr>
              <th>品质</th>
              <th className="num">修炼经验</th>
              <th className="num">价格</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.quality}>
                <td>
                  <span className="synth-level">{r.quality} 品质</span>
                </td>
                <td className="num">{r.exp} 点</td>
                <td className="num synth-price">{fmt(r.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted small synth-note">
        <Icon name="alert" size={13} />
        <span>
          品质决定修炼经验（经验 = 品质 × 0.5，如 {q > 0 ? q : 100} 品质 = {pillExp(q > 0 ? q : 100)} 点），
          只用于修炼，价值随品质线性 → 价格 ∝ 品质。品质为 10 的倍数，固定输出 10~{PILL_MAX_QUALITY}。
        </span>
      </p>
    </div>
  )
}

/**
 * 合成算价卡片组（宝石 / 星辉石 / 五色灵尘 / 九转金丹）。
 * 不含页头标题——由物价页的分段切换统一提供，直接嵌在「合成算价」子视图下。
 */
export default function SynthCalculators() {
  return (
    <div className="stack synth-cards">
      <GemCalculator />
      <StarCalculator />
      <DustCalculator />
      <PillCalculator />
    </div>
  )
}
