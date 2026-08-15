// ============================================================================
// 攻略工具：自定义攻略的「文本 ⇄ 小节」解析，以及搜索匹配。
// 自定义攻略让用户用一个文本框书写，约定一套极简标记：
//   - 以 # / ## / ### 开头的行 = 小节标题（去掉井号）
//   - 以 - * • · 开头的行 = 要点（去掉符号）
//   - 其它非空行 = 要点（原样）
//   - 第一个标题之前的要点归入一个无标题小节
// ============================================================================

import type { GuideEntry, GuideSection } from '../types'

const BULLET_RE = /^[-*•·]\s+/

/** 把用户输入的文本解析为攻略小节数组（空内容返回空数组） */
export function parseGuideContent(text: string): GuideSection[] {
  const sections: GuideSection[] = []
  let current: GuideSection | null = null

  const pushCurrent = () => {
    if (current && current.items.length) sections.push(current)
    current = null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const headingMatch = line.match(/^#{1,6}\s*(.+)$/)
    if (headingMatch) {
      pushCurrent()
      current = { heading: headingMatch[1].trim(), items: [] }
      continue
    }
    const item = line.replace(BULLET_RE, '').trim()
    if (!item) continue
    if (!current) current = { items: [] }
    current.items.push(item)
  }
  pushCurrent()
  return sections
}

/** 把小节数组还原为可再次编辑的文本（用于「编辑」时回填文本框） */
export function serializeGuideContent(sections: GuideSection[]): string {
  return sections
    .map((s) => {
      const head = s.heading ? `## ${s.heading}\n` : ''
      const body = s.items.map((it) => `- ${it}`).join('\n')
      return head + body
    })
    .join('\n\n')
}

/** 标签解析：逗号 / 顿号 / 空格分隔 */
export function parseTags(text: string): string[] {
  return text
    .split(/[,，、\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8)
}

// ── 标题 / 标签拼音搜索 ─────────────────────────────────────────────────
// 拼音字典约 142KB gzip，按需动态加载：仅当用户输入含拉丁字母（拼音意图）时
// 才拉取，纯中文搜索的用户不会下载它。见 ensurePinyinLoaded / usePinyinSearch。
type PinyinFn = typeof import('pinyin-pro').pinyin
let pinyinFn: PinyinFn | null = null
let pinyinLoad: Promise<void> | null = null

/** 触发按需加载拼音字典；加载完成后 resolve。重复调用复用同一 Promise。 */
export function ensurePinyinLoaded(): Promise<void> {
  if (pinyinFn) return Promise.resolve()
  if (!pinyinLoad) {
    pinyinLoad = import('pinyin-pro').then((m) => {
      pinyinFn = m.pinyin
    })
  }
  return pinyinLoad
}

/** 文本拼音缓存：{ full: 全拼, initials: 首字母 }，均为小写、无声调、无分隔 */
const pinyinCache = new Map<string, { full: string; initials: string }>()

/** 字典未就绪时返回 null（此时跳过拼音匹配，仅中文子串生效） */
function textPinyin(text: string): { full: string; initials: string } | null {
  if (!pinyinFn) return null
  let cached = pinyinCache.get(text)
  if (!cached) {
    const full = pinyinFn(text, { toneType: 'none', type: 'array' }).join('').toLowerCase()
    const initials = pinyinFn(text, { pattern: 'first', toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase()
    cached = { full, initials }
    pinyinCache.set(text, cached)
  }
  return cached
}

/** 一段文本是否命中查询：中文子串，或全拼 / 首字母子串（拼音字典未就绪时仅前者）。 */
function textMatches(text: string, q: string): boolean {
  if (text.toLowerCase().includes(q)) return true
  const py = textPinyin(text)
  return !!py && (py.full.includes(q) || py.initials.includes(q))
}

/**
 * 单个标签是否命中查询（不区分大小写，支持拼音）。空查询返回 false，
 * 供搜索列表高亮「因它而命中」的标签用（见 GuideBook 的 renderNavItem）。
 */
export function guideTagMatches(tag: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return textMatches(tag, q)
}

/**
 * 搜索匹配：按标题、分类或任一标签匹配（不区分大小写），并支持拼音——
 * 全拼（如「秘境降妖」→ mijingjiangyao）或首字母（→ mjjy）任一子串命中即可。
 * 拼音字典按需加载，未就绪时仅做中文子串匹配（见 ensurePinyinLoaded）。
 * 分类也纳入匹配：标题里不再冗余重复分类名（如看戏各条只留「一斛珠」），
 * 搜「看戏」仍能命中整组。标签来自用户自定义标签库（guideTags），由调用方按 id 取出后传入。
 */
export function guideMatches(entry: GuideEntry, query: string, tags?: string[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (textMatches(entry.title, q)) return true
  if (textMatches(entry.category, q)) return true
  return !!tags?.some((t) => textMatches(t, q))
}
