// ============================================================================
// 添加种子表单
// - 可从 SEED_PRESETS 选预设（自动填名称/等级/默认生长时长），也可自定义。
// - 生长时长用「小时 + 分钟」两个输入框，默认取预设的 defaultDurationMs。
// - 种植时间默认「现在」，但提供可编辑的 datetime-local 以补登已种下的种子。
// ============================================================================

import { useMemo, useState } from 'react'
import { useSeeds } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import {
  MS_PER_HOUR,
  MS_PER_MINUTE,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
} from '../../utils/time'
import { SEED_PRESETS } from '../../data/gameData'

/** 把毫秒拆成 {小时, 分钟}，用于初始化输入框 */
function msToHourMinute(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.round(ms / MS_PER_MINUTE))
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

/** 等级 -> 徽标类名（1=碧/jade，2=金/gold，3=红/red） */
function levelBadgeClass(level: number): string {
  if (level >= 3) return 'badge-red'
  if (level === 2) return 'badge-gold'
  if (level === 1) return 'badge-ok'
  return 'badge-outline'
}

/** 自定义项的哨兵索引 */
const CUSTOM = -1

export default function AddSeedForm() {
  const { add } = useSeeds()
  const now = useNow()

  // 选中的预设下标；CUSTOM 表示自定义
  const [presetIndex, setPresetIndex] = useState<number>(1) // 默认二级种子
  // 自定义名称 / 等级（仅自定义模式生效）
  const [customName, setCustomName] = useState('')
  const [customLevel, setCustomLevel] = useState(2)
  // 生长时长（小时 + 分钟）
  const initial = msToHourMinute(SEED_PRESETS[1].defaultDurationMs)
  const [hours, setHours] = useState(initial.hours)
  const [minutes, setMinutes] = useState(initial.minutes)
  // 种植时间（datetime-local 字符串）。空串表示「使用现在」
  const [plantedAtValue, setPlantedAtValue] = useState('')
  const [note, setNote] = useState('')

  const isCustom = presetIndex === CUSTOM
  const activePreset = isCustom ? null : SEED_PRESETS[presetIndex]

  // 切换预设：同步名称/等级/默认时长
  function selectPreset(index: number) {
    setPresetIndex(index)
    if (index !== CUSTOM) {
      const p = SEED_PRESETS[index]
      const hm = msToHourMinute(p.defaultDurationMs)
      setHours(hm.hours)
      setMinutes(hm.minutes)
    }
  }

  const durationMs = useMemo(
    () => hours * MS_PER_HOUR + minutes * MS_PER_MINUTE,
    [hours, minutes],
  )

  const seedName = isCustom ? customName.trim() : activePreset!.seedName
  const level = isCustom ? customLevel : activePreset!.level

  // 表单是否可提交：名称非空 且 时长大于 0
  const canSubmit = seedName.length > 0 && durationMs > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    // 解析种植时间：留空用现在；非法值（NaN）也回退到现在
    let plantedAt = now
    if (plantedAtValue) {
      const parsed = fromDatetimeLocalValue(plantedAtValue)
      if (!Number.isNaN(parsed)) plantedAt = parsed
    }

    add({
      seedName,
      level,
      plantedAt,
      durationMs,
      note: note.trim() || undefined,
    })

    // 重置可变字段，保留所选预设与时长，方便连续种同款
    setNote('')
    setPlantedAtValue('')
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {/* 预设快捷选择 */}
      <div className="field">
        <label>选择种子</label>
        <div className="row row-wrap courtyard-presets">
          {SEED_PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.seedName}
              className={'chip' + (!isCustom && presetIndex === i ? ' active' : '')}
              onClick={() => selectPreset(i)}
            >
              {p.seedName}
            </button>
          ))}
          <button
            type="button"
            className={'chip' + (isCustom ? ' active' : '')}
            onClick={() => selectPreset(CUSTOM)}
          >
            自定义
          </button>
        </div>
      </div>

      {/* 自定义名称 / 等级 */}
      {isCustom && (
        <div className="row row-wrap">
          <div className="field" style={{ flex: 2, minWidth: 160 }}>
            <label>种子名称</label>
            <input
              className="input"
              placeholder="例如：灵芝种子"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 110 }}>
            <label>等级</label>
            <select
              className="select"
              value={customLevel}
              onChange={(e) => setCustomLevel(Number(e.target.value))}
            >
              <option value={0}>未分级</option>
              <option value={1}>一级</option>
              <option value={2}>二级</option>
              <option value={3}>三级</option>
            </select>
          </div>
        </div>
      )}

      {/* 当前选择的等级徽标提示 */}
      {seedName && (
        <div className="row small muted">
          <span>本次种植：</span>
          <span className={'badge ' + levelBadgeClass(level)}>
            {level > 0 ? `${level} 级` : '未分级'}
          </span>
          <span>{seedName}</span>
        </div>
      )}

      {/* 生长时长：小时 + 分钟 */}
      <div className="field">
        <label>生长时长</label>
        <div className="courtyard-duration-row">
          <div className="field">
            <input
              className="input"
              type="number"
              min={0}
              max={240}
              value={hours}
              onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <span className="small muted">小时</span>
          <div className="field">
            <input
              className="input"
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) =>
                setMinutes(Math.min(59, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </div>
          <span className="small muted">分钟</span>
        </div>
      </div>

      {/* 种植时间（可补登） */}
      <div className="field">
        <label>种植时间（留空＝现在）</label>
        <input
          className="input"
          type="datetime-local"
          value={plantedAtValue}
          max={toDatetimeLocalValue(now)}
          onChange={(e) => setPlantedAtValue(e.target.value)}
        />
      </div>

      {/* 备注 */}
      <div className="field">
        <label>备注（可选）</label>
        <input
          className="input"
          placeholder="例如：种在东侧花盆"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="row">
        <button type="submit" className="btn btn-jade" disabled={!canSubmit}>
          🌱 种下
        </button>
        {!canSubmit && (
          <span className="small muted">请填写名称并设置大于 0 的生长时长</span>
        )}
      </div>
    </form>
  )
}
