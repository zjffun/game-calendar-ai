// ============================================================================
// 网页版本信息：读取同源 /version.json，用于在「设置 → 关于」展示当前部署版本。
// 该文件由 scripts/gen-web-manifest.mjs 在构建时生成；开发模式下无此文件，返回 null。
// ============================================================================

/** 当前正在运行的网页版本信息（来自同源 /version.json；开发模式下无此文件） */
export interface ActiveWebVersion {
  version: string
  builtAt?: string
}

export async function activeWebVersion(): Promise<ActiveWebVersion | null> {
  try {
    // 用部署基路径（GitHub Pages 子路径 /game-calendar-ai/ 亦适用）。
    // 绝对 '/version.json' 在子路径部署下会 404。
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
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
