// ============================================================================
// 签到答题——题库检索。
//
// 两种入口：
// - searchQuiz(query)：手动输入关键词，做子串 + 二元组模糊匹配，容忍错字/漏字。
// - matchOcr(text)：把「选窗口截图 OCR 出的一大段带噪文本」丢进来，找出题库里
//   哪一道题「最像藏在这段文本里」。用二元组「包含率」而非 Dice——因为 OCR 文本
//   比单条题目长得多，Dice 会被长度惩罚，包含率才是「题目是否出现在噪声里」的正解。
//
// 归一化会去掉所有空白与标点，只留可比字符，抵消 OCR 的空格/标点噪声。
// ============================================================================

import { QUIZ_BANK, type QuizEntry } from '../data/quizBank'
import { QUIZ_EXTRA } from '../data/quizExtra'

export interface QuizMatch {
  entry: QuizEntry
  /** 0–1，越大越匹配 */
  score: number
}

const PUNCT = /[\s，。、；：？！,.;:?!"'“”‘’（）()【】\[\]{}—–…·・「」《》〈〉~`@#￥%&*_+=|/\\<>^-]/g

/** 归一化：去空白与标点、转小写。 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(PUNCT, '')
}

/** 相邻字符二元组集合；长度不足 2 时退化成单字集合。 */
function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  if (s.length < 2) {
    if (s) set.add(s)
    return set
  }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

// 每条题目的归一化文本与二元组集合只算一次，缓存复用。
interface Indexed {
  entry: QuizEntry
  qNorm: string
  /** 题目 + 答案的归一化，供手动搜索命中答案文字 */
  textNorm: string
  qGrams: Set<string>
}

let indexCache: Indexed[] | null = null

/**
 * 云端「审核通过」的众包题（见 store/quizStore）。登录后拉取并注入，
 * 优先级介于「手动补充库」与「自动生成库」之间；变更时会清缓存以便重建索引。
 */
let cloudEntries: QuizEntry[] = []

/** 注入/更新云端已通过的题目集合，并使搜索索引在下次取用时重建。 */
export function setCloudQuizEntries(entries: QuizEntry[]): void {
  cloudEntries = entries
  indexCache = null
}

function getIndex(): Indexed[] {
  if (indexCache) return indexCache
  // 优先级：手动补充库 > 云端已通过 > 自动生成库；去重按归一化题目（先到先得）。
  const seen = new Set<string>()
  const index: Indexed[] = []
  for (const entry of [...QUIZ_EXTRA, ...cloudEntries, ...QUIZ_BANK]) {
    const qNorm = normalize(entry.q)
    if (!qNorm || seen.has(qNorm)) continue
    seen.add(qNorm)
    index.push({ entry, qNorm, textNorm: qNorm + normalize(entry.a), qGrams: bigrams(qNorm) })
  }
  indexCache = index
  return indexCache
}

/** Dice 系数：2|A∩B| / (|A|+|B|)，两串长度相近时衡量整体相似度。 */
function dice(aGrams: Set<string>, bGrams: Set<string>): number {
  if (aGrams.size === 0 || bGrams.size === 0) return 0
  let inter = 0
  for (const g of aGrams) if (bGrams.has(g)) inter++
  return (2 * inter) / (aGrams.size + bGrams.size)
}

/**
 * 手动关键词搜索：按空格分词后要求「每个词都出现」（AND），命中题目优先于命中答案；
 * 单个词时再补一层二元组模糊，容忍错字。返回按匹配度降序的前 limit 条。
 */
export function searchQuiz(query: string, limit = 20): QuizMatch[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean)
  if (!tokens.length) return []
  const covered = tokens.reduce((s, t) => s + t.length, 0)
  const single = tokens.length === 1 ? bigrams(tokens[0]) : null
  const out: QuizMatch[] = []
  for (const item of getIndex()) {
    let score: number
    if (tokens.every((t) => item.textNorm.includes(t))) {
      // 每个关键词都命中：覆盖越多、题目越短越相关；全部落在题目里再加权
      score = 1 + covered / Math.max(item.qNorm.length, 1)
      if (tokens.every((t) => item.qNorm.includes(t))) score += 0.3
    } else if (single) {
      // 单个关键词的错字兜底
      score = dice(single, item.qGrams)
      if (score < 0.34) continue
    } else {
      continue
    }
    out.push({ entry: item.entry, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

/**
 * 从一段 OCR 文本里找最匹配的题目。用「题目二元组在文本中的命中率」打分，
 * 直接子串命中给满分。返回按分数降序的前 limit 条（含置信度 score）。
 */
export function matchOcr(text: string, limit = 5): QuizMatch[] {
  const hay = normalize(text)
  if (hay.length < 2) return []
  const hayGrams = bigrams(hay)
  const out: QuizMatch[] = []
  for (const item of getIndex()) {
    if (item.qNorm.length < 2) continue
    let score: number
    if (hay.includes(item.qNorm)) {
      score = 1
    } else {
      let hit = 0
      for (const g of item.qGrams) if (hayGrams.has(g)) hit++
      score = hit / item.qGrams.size
    }
    if (score > 0) out.push({ entry: item.entry, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

/** 去重合并（含补充库）后的题目总数 */
export const QUIZ_COUNT = getIndex().length
