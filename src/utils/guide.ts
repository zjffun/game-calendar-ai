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

/** 搜索匹配：标题 / 摘要 / 标签 / 正文要点，任一命中即可（不区分大小写） */
export function guideMatches(entry: GuideEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (entry.title.toLowerCase().includes(q)) return true
  if (entry.summary?.toLowerCase().includes(q)) return true
  if (entry.tags?.some((t) => t.toLowerCase().includes(q))) return true
  return entry.sections.some(
    (s) =>
      s.heading?.toLowerCase().includes(q) ||
      s.items.some((it) => it.toLowerCase().includes(q)),
  )
}
