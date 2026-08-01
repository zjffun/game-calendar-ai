// ============================================================================
// 认证状态仓库（单一数据源，useSyncExternalStore）。
//
// 职责：包装 supabase.auth，对外暴露登录态 + 同步状态 + 各登录动作；
// 并根据登录/登出驱动云同步引擎（cloudSync）的启停。
// 未配置云端（supabase === null）时，status 恒为 'unconfigured'，UI 隐藏登录入口，
// 应用行为与接入前完全一致。
//
// 支持的登录方式：
//  · 邮箱 + 密码（两端均可，纯 API 调用，无重定向）
//  · Magic Link 邮件登录（网页端；桌面端需 deep-link，见 docs）
//  · GitHub / Google OAuth（网页端；桌面端需 deep-link，见 docs）
// ============================================================================

import { useSyncExternalStore } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isCloudConfigured } from './supabase'
import { startCloudSync, stopCloudSync, clearSyncMeta, type SyncStatus } from './cloudSync'

export type AuthStatus = 'unconfigured' | 'loading' | 'signedOut' | 'signedIn'
export type OAuthProvider = 'github' | 'google'

export interface AuthResult {
  ok: boolean
  /** 面向用户的中文提示（成功可省略；失败必带） */
  message?: string
}

interface AuthState {
  status: AuthStatus
  user: User | null
  session: Session | null
  syncStatus: SyncStatus
}

let authState: AuthState = {
  status: isCloudConfigured ? 'loading' : 'unconfigured',
  user: null,
  session: null,
  syncStatus: 'idle',
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
function set(patch: Partial<AuthState>) {
  authState = { ...authState, ...patch }
  emit()
}

function onSyncStatus(s: SyncStatus) {
  set({ syncStatus: s })
}

/** 把 supabase 会话变化落到本地状态，并驱动云同步启停。 */
function applySession(session: Session | null) {
  const prevUserId = authState.user?.id ?? null
  const nextUserId = session?.user?.id ?? null
  set({
    session,
    user: session?.user ?? null,
    status: session ? 'signedIn' : 'signedOut',
  })
  if (nextUserId) {
    // 仅在用户真正变化时重启同步（避免 token 刷新事件反复触发）
    if (nextUserId !== prevUserId) void startCloudSync(nextUserId, onSyncStatus)
  } else {
    stopCloudSync()
    set({ syncStatus: 'idle' })
  }
}

let initialized = false
/** 应用启动时调用一次：恢复既有会话并监听后续认证事件。幂等。 */
export function initAuth(): void {
  if (initialized || !supabase) return
  initialized = true
  void supabase.auth.getSession().then(({ data }) => {
    applySession(data.session)
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session)
  })
}

// —— 错误信息中文化（未命中的回退到原始 message）——
function friendlyError(message: string | undefined): string {
  if (!message) return '操作失败，请稍后重试。'
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return '邮箱或密码不正确。'
  if (m.includes('email not confirmed')) return '邮箱尚未验证，请查收验证邮件后再登录。'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return '该邮箱已注册，请直接登录。'
  if (m.includes('password should be at least')) return '密码太短，至少需要 6 位。'
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return '邮箱格式不正确。'
  if (m.includes('rate limit') || m.includes('too many')) return '请求过于频繁，请稍后再试。'
  return message
}

/** 登录回跳目标：当前页面地址（去掉 hash/query）。 */
function webRedirectTo(): string {
  return window.location.origin + window.location.pathname
}

export const authActions = {
  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, message: '未配置云同步。' }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? { ok: false, message: friendlyError(error.message) } : { ok: true }
  },

  async signUpWithPassword(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, message: '未配置云同步。' }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: webRedirectTo() },
    })
    if (error) return { ok: false, message: friendlyError(error.message) }
    // 开启了邮箱验证时 session 为空，需用户点邮件里的链接
    if (!data.session) {
      return { ok: true, message: '注册成功，请前往邮箱点击验证链接完成激活。' }
    }
    return { ok: true, message: '注册并登录成功。' }
  },

  async sendMagicLink(email: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, message: '未配置云同步。' }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: webRedirectTo() },
    })
    return error
      ? { ok: false, message: friendlyError(error.message) }
      : { ok: true, message: '登录邮件已发送,请查收并点击其中的链接完成登录。' }
  },

  async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
    if (!supabase) return { ok: false, message: '未配置云同步。' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: webRedirectTo() },
    })
    // 成功时浏览器会立即跳转到第三方授权页，这里一般不会继续执行
    return error ? { ok: false, message: friendlyError(error.message) } : { ok: true }
  },

  async signOut(): Promise<AuthResult> {
    if (!supabase) return { ok: false, message: '未配置云同步。' }
    const { error } = await supabase.auth.signOut()
    if (error) return { ok: false, message: friendlyError(error.message) }
    clearSyncMeta()
    return { ok: true }
  },
}

function useAuthState(): AuthState {
  return useSyncExternalStore(
    subscribe,
    () => authState,
    () => authState,
  )
}

/** 认证分片 Hook：登录态 + 同步状态 + 各登录动作。 */
export function useAuth() {
  const s = useAuthState()
  return {
    status: s.status,
    user: s.user,
    session: s.session,
    syncStatus: s.syncStatus,
    isCloudConfigured,
    ...authActions,
  }
}
