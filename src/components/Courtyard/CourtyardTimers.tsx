// ============================================================================
// 庭院种子倒计时 —— 模块入口
// 重点支持二级 / 三级种子（也允许一级与自定义）。
// 成熟时间 = plantedAt + durationMs；剩余 = plantedAt + durationMs - now。
// 列表按「剩余时间升序」排序，已成熟的排最前并高亮。
// 全部数据走 useSeeds() store action，倒计时由 useNow() 驱动刷新。
// ============================================================================

import { useMemo } from 'react'
import { useSeeds } from '../../store/useAppStore'
import { useNow } from '../../hooks/useNow'
import AddSeedForm from './AddSeedForm'
import SeedTimerCard from './SeedTimerCard'
import './Courtyard.css'

export default function CourtyardTimers() {
  const { seeds } = useSeeds()
  const now = useNow()

  // 按剩余时间升序排序：已成熟（剩余<=0）自然排在最前（剩余越小越靠前）。
  // 用 useMemo 避免每秒重算时产生不必要的新数组引用波动。
  const sorted = useMemo(() => {
    return [...seeds].sort((a, b) => {
      const ra = a.plantedAt + a.durationMs - now
      const rb = b.plantedAt + b.durationMs - now
      return ra - rb
    })
  }, [seeds, now])

  // 统计已成熟数量，用于标题徽标
  const ripeCount = useMemo(
    () => seeds.filter((s) => s.plantedAt + s.durationMs - now <= 0).length,
    [seeds, now],
  )

  return (
    <section className="stack">
      <h2 className="section-title">
        <span className="glyph">🌿</span>
        庭院种子倒计时
        {ripeCount > 0 && (
          <span className="badge badge-ok">{ripeCount} 株可收获</span>
        )}
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
          庭院空空如也，先在上方种下二级 / 三级种子吧～
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
