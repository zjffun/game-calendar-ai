// ============================================================================
// Supabase 客户端（单例）。
//
// 通过环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 配置：
//  - 两者都存在 → 启用云端（登录 + 数据同步）；
//  - 缺任一 → supabase === null，应用退回「纯本地」模式（与接入前完全一致），
//    保证未配置时也能正常构建、运行、离线使用。
//
// anon key 是「公开可暴露」的密钥：真正的数据隔离由数据库的 Row Level Security
// 策略保证（见 supabase/migrations），前端拿到 anon key 也只能读写自己的数据。
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 是否已配置云端（决定是否显示登录入口、是否启动同步）。 */
export const isCloudConfigured: boolean = Boolean(url && anonKey)

/** Supabase 客户端；未配置时为 null。使用前务必判空。 */
export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        // 会话持久化到 localStorage，刷新/重开自动恢复登录态
        persistSession: true,
        autoRefreshToken: true,
        // 网页端 OAuth / Magic Link 回跳后，自动从 URL 中解析并写入会话
        detectSessionInUrl: true,
        // PKCE 更适合纯前端 + 重定向登录流
        flowType: 'pkce',
      },
    })
  : null
