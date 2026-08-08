// ============================================================================
// 云端签到答题「众包题库」+ 管理后台 状态仓库（useSyncExternalStore 单一数据源）。
//
// 数据在 Supabase（表 quiz_questions / profiles，RLS 见 migrations/0002）：
//  · 任何登录用户可「提交新题」（强制 pending）；
//  · 管理员审核通过（approved）后，approved 题目并入答题页搜索/识别（setCloudQuizEntries）；
//  · 管理员可增删改查题库、设/撤其他用户为管理员。
//
// 未配置云端 / 未登录时：isAdmin=false、无云端题，答题页退回纯内置题库，行为如初。
// 与 authStore 解耦：由 App 在登录态变化时调用 syncQuizForUser(userId | null) 驱动。
// ============================================================================

import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { setCloudQuizEntries } from '../utils/quiz'
import type { AdminUser, QuizQuestion, QuizStatus } from '../types'

const TABLE = 'quiz_questions'
const PROFILES = 'profiles'

export interface QuizActionResult {
  ok: boolean
  /** 面向用户的中文提示（失败必带） */
  message?: string
}

interface QuizCloudState {
  /** 已完成当前登录态下的首次加载（登录成功拉完 / 登出置空）。 */
  ready: boolean
  /** 当前用户是否管理员（决定是否显示管理后台入口）。 */
  isAdmin: boolean
  /** 已审核通过的题（并入搜索索引；也用于触发搜索面板重算）。 */
  approved: QuizQuestion[]
  /** 当前用户自己的提交（用于在答题页展示各自状态）。 */
  mine: QuizQuestion[]
  loading: boolean
  error: string | null
}

let state: QuizCloudState = {
  ready: false,
  isAdmin: false,
  approved: [],
  mine: [],
  loading: false,
  error: null,
}

const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
function set(patch: Partial<QuizCloudState>) {
  state = { ...state, ...patch }
  emit()
}

/** 当前云同步用户；用于在 await 期间发生用户切换时丢弃过期结果。 */
let currentUserId: string | null = null

// —— 行映射：DB 蛇形字段 → 前端驼峰类型 ——
type Row = {
  id: string
  q: string
  a: string
  status: QuizStatus
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function mapRow(r: Row): QuizQuestion {
  return {
    id: r.id,
    q: r.q,
    a: r.a,
    status: r.status,
    note: r.note ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function errMsg(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const m = raw.toLowerCase()
  if (m.includes('row-level security') || m.includes('permission'))
    return '没有权限执行该操作。'
  if (m.includes('network') || m.includes('fetch')) return '网络异常，请稍后重试。'
  return raw || '操作失败，请稍后重试。'
}

// ---------------------------------------------------------------------------
// 登录态驱动：加载/清空
// ---------------------------------------------------------------------------

/**
 * 登录态变化时调用（由 App 驱动）：
 *  · userId 为 null（登出/未配置/未登录）→ 清空云端题与管理员标记，ready=true；
 *  · userId 有值 → 兜底建档 + 拉取 isAdmin / approved / mine，并注入搜索索引。
 * 幂等安全：await 期间用户又变了则丢弃本次结果。
 */
export async function syncQuizForUser(userId: string | null): Promise<void> {
  currentUserId = userId
  if (!supabase || !userId) {
    setCloudQuizEntries([])
    set({ ready: true, isAdmin: false, approved: [], mine: [], loading: false, error: null })
    return
  }
  set({ loading: true, error: null })
  try {
    await ensureProfile(userId)
    const [isAdmin, approved, mine] = await Promise.all([
      fetchIsAdmin(userId),
      fetchApproved(),
      fetchMine(userId),
    ])
    if (currentUserId !== userId) return
    setCloudQuizEntries(approved.map((e) => ({ q: e.q, a: e.a })))
    set({ ready: true, isAdmin, approved, mine, loading: false, error: null })
  } catch (err) {
    if (currentUserId !== userId) return
    // 失败不致命：答题页仍可用内置题库，管理入口保持隐藏
    setCloudQuizEntries([])
    set({ ready: true, isAdmin: false, loading: false, error: errMsg(err) })
  }
}

/** 兜底建档：即便没装触发器，登录后也保证 profiles 里有自己这行（不改 is_admin）。 */
async function ensureProfile(userId: string): Promise<void> {
  if (!supabase) return
  const email = (await supabase.auth.getUser()).data.user?.email ?? null
  // ignoreDuplicates → INSERT ... ON CONFLICT DO NOTHING，已存在则原样保留（含 is_admin）
  await supabase
    .from(PROFILES)
    .upsert({ id: userId, email }, { onConflict: 'id', ignoreDuplicates: true })
}

async function fetchIsAdmin(userId: string): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase
    .from(PROFILES)
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data?.is_admin)
}

async function fetchApproved(): Promise<QuizQuestion[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow as (r: unknown) => QuizQuestion)
}

async function fetchMine(userId: string): Promise<QuizQuestion[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow as (r: unknown) => QuizQuestion)
}

/** 重新拉取 approved 并刷新搜索索引（管理员改动后调用，让搜索即时反映）。 */
export async function reloadApproved(): Promise<void> {
  if (!supabase || !currentUserId) return
  try {
    const approved = await fetchApproved()
    if (currentUserId == null) return
    setCloudQuizEntries(approved.map((e) => ({ q: e.q, a: e.a })))
    set({ approved })
  } catch {
    /* 忽略：下次登录/刷新会重拉 */
  }
}

// ---------------------------------------------------------------------------
// 普通用户：提交 / 删除自己的待审提交
// ---------------------------------------------------------------------------

/** 提交一道新题（强制 pending，待管理员审核）。 */
export async function submitQuestion(q: string, a: string): Promise<QuizActionResult> {
  if (!supabase || !currentUserId) return { ok: false, message: '请先登录后再提交。' }
  const qt = q.trim()
  const at = a.trim()
  if (!qt || !at) return { ok: false, message: '题目和答案都要填写。' }
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ q: qt, a: at, status: 'pending', created_by: currentUserId })
    .select('*')
    .single()
  if (error) return { ok: false, message: errMsg(error) }
  set({ mine: [mapRow(data as Row), ...state.mine] })
  return { ok: true, message: '已提交，管理员审核通过后所有人都能搜到。' }
}

/** 删除自己的一条提交（RLS 仅允许删自己 pending 的；管理员另走后台）。 */
export async function deleteMySubmission(id: string): Promise<QuizActionResult> {
  if (!supabase || !currentUserId) return { ok: false, message: '请先登录。' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, message: errMsg(error) }
  set({ mine: state.mine.filter((x) => x.id !== id) })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 管理员：题库增删改查 + 用户管理
// 列表类结果不进全局 store，由管理后台组件自行持有；改动后刷新 approved 缓存。
// ---------------------------------------------------------------------------

/** 按状态列出题目（不传 status = 全部）。仅管理员可见 approved 之外的题。 */
export async function adminListQuestions(status?: QuizStatus): Promise<QuizQuestion[]> {
  if (!supabase) return []
  let query = supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapRow as (r: unknown) => QuizQuestion)
}

/** 各状态的题目数量（用于审核队列角标）。 */
export async function adminCountByStatus(): Promise<Record<QuizStatus, number>> {
  const counts: Record<QuizStatus, number> = { pending: 0, approved: 0, rejected: 0 }
  if (!supabase) return counts
  const statuses: QuizStatus[] = ['pending', 'approved', 'rejected']
  await Promise.all(
    statuses.map(async (s) => {
      const { count } = await supabase!
        .from(TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('status', s)
      counts[s] = count ?? 0
    }),
  )
  return counts
}

/** 审核：设为 approved / rejected（记录审核人与时间；可带备注/驳回理由）。 */
export async function adminSetStatus(
  id: string,
  status: QuizStatus,
  note?: string,
): Promise<QuizActionResult> {
  if (!supabase || !currentUserId) return { ok: false, message: '未登录。' }
  const patch: Record<string, unknown> = {
    status,
    reviewed_by: currentUserId,
    updated_at: new Date().toISOString(),
  }
  if (note !== undefined) patch.note = note.trim() || null
  const { error } = await supabase.from(TABLE).update(patch).eq('id', id)
  if (error) return { ok: false, message: errMsg(error) }
  await reloadApproved()
  return { ok: true }
}

/** 修订题面（题目/答案）。 */
export async function adminUpdateQuestion(
  id: string,
  patch: { q?: string; a?: string },
): Promise<QuizActionResult> {
  if (!supabase) return { ok: false, message: '未配置云端。' }
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.q !== undefined) body.q = patch.q.trim()
  if (patch.a !== undefined) body.a = patch.a.trim()
  if ((body.q !== undefined && !body.q) || (body.a !== undefined && !body.a))
    return { ok: false, message: '题目和答案不能为空。' }
  const { error } = await supabase.from(TABLE).update(body).eq('id', id)
  if (error) return { ok: false, message: errMsg(error) }
  await reloadApproved()
  return { ok: true }
}

/** 管理员直接新增一道题（可选择直接通过）。 */
export async function adminAddQuestion(
  q: string,
  a: string,
  approved: boolean,
): Promise<QuizActionResult> {
  if (!supabase || !currentUserId) return { ok: false, message: '未登录。' }
  const qt = q.trim()
  const at = a.trim()
  if (!qt || !at) return { ok: false, message: '题目和答案都要填写。' }
  const status: QuizStatus = approved ? 'approved' : 'pending'
  const { error } = await supabase.from(TABLE).insert({
    q: qt,
    a: at,
    status,
    created_by: currentUserId,
    reviewed_by: approved ? currentUserId : null,
  })
  if (error) return { ok: false, message: errMsg(error) }
  await reloadApproved()
  return { ok: true }
}

/** 删除一道题（管理员可删任意）。 */
export async function adminDeleteQuestion(id: string): Promise<QuizActionResult> {
  if (!supabase) return { ok: false, message: '未配置云端。' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, message: errMsg(error) }
  await reloadApproved()
  return { ok: true }
}

/** 列出所有用户（含是否管理员），供用户管理。 */
export async function adminListUsers(): Promise<AdminUser[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(PROFILES)
    .select('id,email,is_admin,created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: (r.email as string | null) ?? null,
    isAdmin: Boolean(r.is_admin),
    createdAt: r.created_at as string,
  }))
}

/** 设/撤某用户为管理员。 */
export async function adminSetUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<QuizActionResult> {
  if (!supabase) return { ok: false, message: '未配置云端。' }
  const { error } = await supabase.from(PROFILES).update({ is_admin: isAdmin }).eq('id', userId)
  if (error) return { ok: false, message: errMsg(error) }
  // 若改的是自己，刷新本地管理员标记（撤销自己会立即失去入口）
  if (userId === currentUserId) set({ isAdmin })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** 读取云端答题/管理状态（自动订阅）。 */
export function useQuizCloud() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}
