// ============================================================================
// 网页内容更新（仅 Tauri 桌面端有意义）。
// 桌面端内置构建时的网页（完全离线可用）；联网时可从 GitHub Pages 拉取
// 最新构建（对比 version.json，由 Rust 侧下载并原子替换本地缓存），
// 前端 reload 后即运行新版本。网页端（浏览器直接访问 GH Pages）天然最新，
// 这些函数在网页端调用会安全地返回空/报错。
// ============================================================================

/** 是否运行在 Tauri 桌面端 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Rust download_web_update 命令的返回（serde camelCase） */
export interface WebUpdateResult {
  status: 'updated' | 'upToDate' | 'error'
  current?: string | null
  remote?: string | null
  message?: string | null
}

/**
 * 检查并下载网页更新（Tauri 内调用）。
 * 返回 "updated" 表示新版本已落盘，reload 后生效。
 */
export async function checkAndDownloadWebUpdate(): Promise<WebUpdateResult> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<WebUpdateResult>('download_web_update')
}

/** 当前正在运行的网页版本信息（来自同源 /version.json；开发模式下无此文件） */
export interface ActiveWebVersion {
  version: string
  builtAt?: string
}

export async function activeWebVersion(): Promise<ActiveWebVersion | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown; builtAt?: unknown }
    if (typeof data.version !== 'string') return null
    return {
      version: data.version,
      builtAt: typeof data.builtAt === 'string' ? data.builtAt : undefined,
    }
  } catch {
    return null
  }
}
