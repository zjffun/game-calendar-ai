// ============================================================================
// 添加种子表单
// - 预设(二/三/四/一级)走真实「生长周期」(cycle)：日程由等级自动推导，无需填时长，
//   选中后实时预览结果天与清除天。
// - 「自定义」走单次倒计时(timer)：手填名称/等级/生长时长，沿用旧逻辑。
// - 种植时间默认「现在」，可编辑 datetime-local 以补登已种下的种子。
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
import {
  SEED_PRESETS,
  getGrowthCycle,
  CUSTOM_SEED_DEFAULT_DURATION_MS,
} from '../../data/gameData'
import { levelBadgeClass, levelLabel } from './seedLevel'
import Icon from '../common/Icon'

/** 把毫秒拆成 {小时, 分钟}，用于初始化输入框 */
function msToHourMinute(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.round(ms / MS_PER_MINUTE))
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

/** 自定义项的哨兵索引 */
const CUSTOM = -1

export default function AddSeedForm() {
  const { add } = useSeeds()
  const now = useNow()

  // 选中的预设下标；CUSTOM 表示自定义。默认二级种子（下标 0）
  const [presetIndex, setPresetIndex] = useState<number>(0)
  // 自定义名称 / 等级（仅自定义模式生效）
  const [customName, setCustomName] = useState('')
  const [customLevel, setCustomLevel] = useState(0)
  // 自定义(timer)生长时长（小时 + 分钟）
  const initial = msToHourMinute(CUSTOM_SEED_DEFAULT_DURATION_MS)
  const [hours, setHours] = useState(initial.hours)
  const [minutes, setMinutes] = useState(initial.minutes)
  // 种植时间（datetime-local 字符串）。空串表示「使用现在」
  const [plantedAtValue, setPlantedAtValue] = useState('')
  const [note, setNote] = useState('')

  const isCustom = presetIndex === CUSTOM
  const activePreset = isCustom ? null : SEED_PRESETS[presetIndex]

  const durationMs = useMemo(
    () => hours * MS_PER_HOUR + minutes * MS_PER_MINUTE,
    [hours, minutes],
  )

  const seedName = isCustom ? customName.trim() : activePreset!.seedName
  const level = isCustom ? customLevel : activePreset!.level
  const mode = isCustom ? 'timer' : activePreset!.mode
  const cycle = mode === 'cycle' ? getGrowthCycle(level) : undefined

  // 表单是否可提交：
  // - cycle：名称非空（预设恒满足）
  // - timer：名称非空 且 时长大于 0
  const canSubmit =
    seedName.length > 0 && (mode === 'cycle' || durationMs > 0)

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
      mode,
      durationMs: mode === 'timer' ? durationMs : undefined,
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
              onClick={() => setPresetIndex(i)}
            >
              {p.seedName}
            </button>
          ))}
          <button
            type="button"
            className={'chip' + (isCustom ? ' active' : '')}
            onClick={() => setPresetIndex(CUSTOM)}
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
              <option value={2}>二级</option>
              <option value={3}>三级</option>
              <option value={4}>四级</option>
            </select>
          </div>
        </div>
      )}

      {/* 当前选择的等级徽标提示 */}
      {seedName && (
        <div className="row row-wrap small muted">
          <span>本次种植：</span>
          <span className={'badge ' + levelBadgeClass(level)}>{levelLabel(level)}</span>
          <span>{seedName}</span>
          <span className="badge badge-outline">
            {mode === 'cycle' ? '生长周期' : '单次计时'}
          </span>
        </div>
      )}

      {/* cycle 模式：生长周期预览 */}
      {mode === 'cycle' && cycle && (
        <div className="courtyard-cycle-preview">
          {cycle.harvestDays.length > 0 ? (
            <div className="row row-wrap small">
              <span className="muted">结果(可收获)：</span>
              <span className="courtyard-cycle-days">
                第 {cycle.harvestDays.join('、')} 天
              </span>
            </div>
          ) : (
            <div className="small muted">仅装饰，不结果</div>
          )}
          <div className="row row-wrap small">
            <span className="muted">清除重种：</span>
            <span className="courtyard-cycle-days">第 {cycle.clearDay} 天</span>
            {cycle.earlyRipenDay != null && cycle.harvestDays.length > 0 && (
              <span className="muted">· 第 {cycle.earlyRipenDay} 天起可能早熟</span>
            )}
          </div>
          {level >= 4 && (
            <div className="small courtyard-cycle-caveat">
              <Icon name="alert" size={12} /> 四级逐日结果天为推断值（官方未公布实测），清除日(第
              22 天)较可信
            </div>
          )}
        </div>
      )}

      {/* timer 模式：生长时长（小时 + 分钟） */}
      {mode === 'timer' && (
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
      )}

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
          placeholder="例如：种在东侧花圃"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          种下
        </button>
        {!canSubmit && (
          <span className="small muted">
            {isCustom ? '请填写名称并设置大于 0 的生长时长' : '请先选择种子'}
          </span>
        )}
      </div>
    </form>
  )
}
