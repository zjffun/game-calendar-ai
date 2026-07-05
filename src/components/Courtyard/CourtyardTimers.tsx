// ============================================================================
// 庭院种子倒计时 —— 模块入口
// 支持二/三/四级种子的真实「生长周期」(cycle) 与自定义「单次计时」(timer)。
// 列表按「下一个关注时刻」升序排序：cycle 取下一次结果/清除，timer 取成熟时刻；
// 已可处理的（今日可收获 / 已成熟 / 待清除）自然排在最前。
// 倒计时由 useNow() 驱动刷新。
// ============================================================================

import { useMemo } from 'react'
import { useSeeds, useSettings } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import { getGrowthCycle } from '../../data/gameData'
import {
  computeSeedSchedule,
  isCaredToday,
  seedMode,
  seedNextAt,
} from '../../utils/courtyard'
import AddSeedForm from './AddSeedForm'
import SeedTimerCard from './SeedTimerCard'
import './Courtyard.css'

export default function CourtyardTimers() {
  const { seeds } = useSeeds()
  const { settings } = useSettings()
  const now = useNow()
  const resetHour = settings.dailyResetHour

  // 按「下一个关注时刻」升序排序：越紧迫越靠前（已可处理的为负，排最前）。
  const sorted = useMemo(() => {
    return [...seeds].sort(
      (a, b) =>
        seedNextAt(a, getGrowthCycle(a.level), resetHour, now) -
        seedNextAt(b, getGrowthCycle(b.level), resetHour, now),
    )
  }, [seeds, now, resetHour])

  // 统计：今日可收获 / 今日待养护
  const { ripeCount, careCount } = useMemo(() => {
    let ripe = 0
    let care = 0
    for (const s of seeds) {
      const cycle = getGrowthCycle(s.level)
      if (seedMode(s) === 'cycle' && cycle) {
        const sc = computeSeedSchedule(s, cycle, resetHour, now)
        if (sc.todayIsHarvest) ripe++
        if (!sc.ended && !isCaredToday(s, resetHour, now)) care++
      } else if (s.plantedAt + s.durationMs <= now) {
        ripe++
      }
    }
    return { ripeCount: ripe, careCount: care }
  }, [seeds, now, resetHour])

  return (
    <section className="stack">
      <h2 className="section-title">
        庭院种子
        {ripeCount > 0 && <span className="badge badge-ok">{ripeCount} 株可收获</span>}
        {careCount > 0 && <span className="badge badge-warn">{careCount} 株待养护</span>}
      </h2>

      {/* 添加种子 */}
      <div className="card pad-lg">
        <div className="card-head">
          <h3>种下新种子</h3>
        </div>
        <AddSeedForm />
      </div>

      <div className="divider" />

      {/* 种子列表 */}
      {sorted.length === 0 ? (
        <div className="empty">
          庭院空空如也，先在上方种下二级 / 三级 / 四级种子吧～
        </div>
      ) : (
        <div className="grid courtyard-grid">
          {sorted.map((seed) => (
            <SeedTimerCard key={seed.id} seed={seed} now={now} />
          ))}
        </div>
      )}
    </section>
  )
}
