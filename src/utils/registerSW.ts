// ============================================================================
// 注册 Service Worker（PWA 离线 / 可安装）。
// 只在生产构建注册：开发模式下 public/sw.js 仍是占位符模板，且 SW 缓存会干扰热更新。
// SW 与作用域都落在部署基路径下（GitHub Pages 子路径 /game-calendar-ai/ 亦适用），
// 因为 import.meta.env.BASE_URL 就是 Vite 的 base（本项目为 './'）。
// ============================================================================

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('[pwa] Service Worker 注册失败', err)
    })
  })
}
