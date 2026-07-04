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
