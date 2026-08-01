/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目 URL（形如 https://xxxx.supabase.co）。缺省时应用退回纯本地模式。 */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase 匿名公钥（anon public key），可安全暴露给前端。 */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
