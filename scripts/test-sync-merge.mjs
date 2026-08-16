// ============================================================================
// 同步合并逻辑的断言测试（本项目无测试框架：用 esbuild 现打 syncMerge.ts 成 esm 再 node assert）。
// 运行：pnpm test:sync
//
// 核心是钉死一次真实发生过的数据丢失：itemMeta 为空的上下文（清站点数据 / localhost / 换设备）
// 登录时 ensureBackfill 回填基准 u 必须是 0，才不会让空价/陈旧本地反杀云端。
// ============================================================================

import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const outfile = join(mkdtempSync(join(tmpdir(), 'syncmerge-')), 'syncMerge.mjs')
await build({
  entryPoints: ['src/store/syncMerge.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
})
const { mergeItemKey, backfillMeta } = await import(outfile)

const KEY = 'mhxy.priceItems.v1' // itemArray 策略
const REAL = 1_700_000_000_000 // 某个「真实」云端改价时间戳
let n = 0
const pass = (name, f) => {
  f()
  n++
  console.log(`  ✓ ${name}`)
}

// ① 复现并锁死数据丢失：本地空价 seed（ensureBackfill 回填基准 0）遇到云端真实价 → 云端必须胜
pass('空价 seed 不再冲掉云端真实价（回填基准 0）', () => {
  const localVal = [{ id: 'a', name: '超级金柳露', price: '' }]
  const remoteVal = [{ id: 'a', name: '超级金柳露', price: '80w' }]
  const local = { value: localVal, meta: backfillMeta(KEY, localVal, 0) }
  const remote = { value: remoteVal, meta: { a: { u: REAL } } }
  const m = mergeItemKey(KEY, local, remote, REAL + 1000)
  assert.equal(m.value[0].price, '80w') // 好数据保住
})

// 对照：若回填基准仍用 now（旧 bug），同样输入会把云端冲成空 —— 证明差别只在基准
pass('对照：回填基准 now 会复现覆盖（记录旧行为）', () => {
  const localVal = [{ id: 'a', name: '超级金柳露', price: '' }]
  const remoteVal = [{ id: 'a', name: '超级金柳露', price: '80w' }]
  const NOW = REAL + 10_000_000
  const local = { value: localVal, meta: backfillMeta(KEY, localVal, NOW) }
  const remote = { value: remoteVal, meta: { a: { u: REAL } } }
  const m = mergeItemKey(KEY, local, remote, NOW + 1000)
  assert.equal(m.value[0].price, '') // 旧 bug：被冲空
})

// ② 本地独有条目（云端没有）在基准 0 下仍须保留并上行：0 > 缺席的 -1
pass('本地独有条目在基准 0 下仍保留、仍上行', () => {
  const localVal = [{ id: 'b', name: '自定义物品', price: '5' }]
  const local = { value: localVal, meta: backfillMeta(KEY, localVal, 0) }
  const remote = { value: [], meta: {} }
  const m = mergeItemKey(KEY, local, remote, 1)
  assert.equal(m.value.length, 1)
  assert.equal(m.value[0].price, '5')
  assert.equal(m.changedVsRemote, true) // 需要上行
})

// ③ 真正的本地编辑（u 更大）仍胜过云端旧值
pass('真实本地编辑（u 更大）胜过云端旧值', () => {
  const local = { value: [{ id: 'a', name: 'x', price: '99' }], meta: { a: { u: REAL + 5000 } } }
  const remote = { value: [{ id: 'a', name: 'x', price: '80w' }], meta: { a: { u: REAL } } }
  const m = mergeItemKey(KEY, local, remote, REAL + 6000)
  assert.equal(m.value[0].price, '99')
})

// ④ 云端较晚的删除（墓碑）仍能删掉基准 0 的本地存活项（不复活僵尸）
pass('云端较晚删除胜过基准 0 的本地存活项', () => {
  const localVal = [{ id: 'a', name: 'x', price: '1' }]
  const local = { value: localVal, meta: backfillMeta(KEY, localVal, 0) }
  const remote = { value: [], meta: { a: { u: 0, d: REAL } } } // 云端已删
  const m = mergeItemKey(KEY, local, remote, REAL + 1000)
  assert.equal(m.value.length, 0)
})

console.log(`\n${n} 项断言全部通过 ✅`)
