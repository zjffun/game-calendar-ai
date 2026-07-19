// ============================================================================
// 抓取「网易大神」攻略文章配图 → 压缩为 WebP → 落到 public/guide-img/
//
// 用法：
//   node scripts/fetch-guide-img.mjs <prefix> <url1> [url2 ...]
//   node scripts/fetch-guide-img.mjs --list <prefix> <urlsFile>
//
// 说明：
// - 大神正文图托管在 ok.166.net，带 ?imageView&thumbnail=1500x0 参数；
// - 自动跳过二维码/App 推广图（game.16163.com 域名）；
// - 用 cwebp 压缩（-q 72 -m 6），并把宽度限制到 900px，肉眼可读且体积小；
// - 输出文件名：<prefix>-<序号>.webp，便于在 guides 数据里稳定引用。
// ============================================================================

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = 'public/guide-img'
const TMP = '.tmp-guide-img'
const MAX_W = 900
const QUALITY = 72

function isSkippable(url) {
  return /16163\.com|qrcode|avatar|logo/i.test(url)
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://ds.163.com/' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buf)
  return buf.length
}

function toWebp(src, dest) {
  // -resize W 0：仅在超过 MAX_W 时等比缩小（cwebp 的 resize 会强制缩放，故先探测宽度）
  const info = execFileSync('identify', ['-format', '%w', src], { encoding: 'utf8' }).trim()
  const width = parseInt(info, 10)
  const args = ['-q', String(QUALITY), '-m', '6', '-quiet']
  if (Number.isFinite(width) && width > MAX_W) args.push('-resize', String(MAX_W), '0')
  args.push(src, '-o', dest)
  execFileSync('cwebp', args)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length < 2) {
    console.error('用法: node scripts/fetch-guide-img.mjs <prefix> <url...>')
    process.exit(1)
  }
  const prefix = argv[0]
  const urls = argv.slice(1).filter((u) => !isSkippable(u))

  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(TMP, { recursive: true })

  let i = 0
  const results = []
  for (const url of urls) {
    i += 1
    const tmpFile = join(TMP, `${prefix}-${i}.src`)
    const out = join(OUT_DIR, `${prefix}-${i}.webp`)
    try {
      const raw = await download(url, tmpFile)
      toWebp(tmpFile, out)
      const size = statSync(out).size
      results.push({ file: `guide-img/${prefix}-${i}.webp`, raw, size })
      console.log(
        `✓ ${prefix}-${i}.webp  ${(raw / 1024).toFixed(0)}KB → ${(size / 1024).toFixed(0)}KB` +
          `  (-${Math.round((1 - size / raw) * 100)}%)`,
      )
    } catch (err) {
      console.error(`✗ ${url}: ${err.message}`)
    }
  }
  rmSync(TMP, { recursive: true, force: true })
  console.log('\n' + JSON.stringify(results.map((r) => r.file), null, 2))
}

main()
