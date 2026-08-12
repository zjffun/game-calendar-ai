// ============================================================================
// 生成 dist/version.json —— 网页内容的版本清单。
// 在 `pnpm build` 末尾运行（见 package.json）。用途：
//   1. 部署到 GitHub Pages 后，Tauri 桌面端靠它检测「网页内容是否有新版本」；
//   2. files 列表告诉桌面端要下载哪些文件（vite 产物文件名带 hash，不可枚举猜测）。
// version 取所有文件内容的 sha256 摘要（内容不变则版本不变，避免无意义更新）。
// ============================================================================

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist', import.meta.url))

/** 递归收集 dist 下所有文件的相对路径（POSIX 分隔符，稳定排序） */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(relative(dist, full).split(sep).join('/'))
  }
  return out
}

const files = walk(dist)
  .filter((f) => f !== 'version.json')
  .sort()

const hash = createHash('sha256')
for (const f of files) {
  hash.update(f)
  hash.update(readFileSync(join(dist, f)))
}

const manifest = {
  version: hash.digest('hex').slice(0, 12),
  builtAt: new Date().toISOString(),
  files,
}

writeFileSync(join(dist, 'version.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`[gen-web-manifest] version=${manifest.version} files=${files.length}`)

// ── 给 Service Worker 注入版本 + 预缓存清单 ────────────────────────────────
// public/sw.js 被 vite 原样拷到 dist/sw.js，里面留了两个占位符。这里替换成真实值：
//   __SW_VERSION__  → 内容版本（改了 sw.js 字节，浏览器才会检测到 SW 更新）
//   __SW_PRECACHE__ → 应用外壳文件（index.html + assets/* + 根目录图标），
//                     刻意排除体量巨大的 guide-img/ 与 version.json（按需 / 网络优先）。
const swPath = join(dist, 'sw.js')
const precache = files.filter((f) => {
  if (f.startsWith('guide-img/')) return false
  if (f === 'index.html' || f === 'manifest.webmanifest') return true
  if (f.startsWith('assets/')) return true
  return /^[^/]+\.(?:svg|png|ico)$/.test(f) // 根目录图标（favicon / icon-*/ maskable / apple-touch）
})

try {
  let sw = readFileSync(swPath, 'utf8')
  if (!sw.includes('__SW_VERSION__') || !sw.includes('__SW_PRECACHE__')) {
    throw new Error('sw.js 缺少占位符 __SW_VERSION__ / __SW_PRECACHE__')
  }
  sw = sw
    .replaceAll('__SW_VERSION__', manifest.version)
    .replaceAll('__SW_PRECACHE__', JSON.stringify(precache))
  // 兜底：确保没有残留占位符（否则 SW 运行时会 ReferenceError，静默失效）。
  const leftover = sw.match(/__SW_[A-Z]+__/)
  if (leftover) throw new Error(`sw.js 仍残留占位符 ${leftover[0]}`)
  writeFileSync(swPath, sw)
  console.log(`[gen-web-manifest] sw.js stamped: precache=${precache.length} files`)
} catch (err) {
  console.error(`[gen-web-manifest] 无法给 sw.js 注入版本：${err.message}`)
  process.exit(1)
}
