/* eslint-disable no-restricted-globals */
// ============================================================================
// 手写 Service Worker —— 让「游戏日历」可安装、可离线，无 Workbox 依赖。
//
// 版本与预缓存清单在构建时注入：scripts/gen-web-manifest.mjs 会把下面代码里的两个
// 占位符（VERSION 的字符串、PRECACHE_URLS 的字面量）替换成真实值：
//   · 版本   → 本次构建的内容版本（同 version.json 的 version）
//   · 清单   → 应用外壳文件列表（index.html + assets/* + 图标，排除 guide-img）
// 因为版本随内容变化，sw.js 的字节也随之变化，浏览器才会检测到
// 新的 SW 并更新缓存（这正是 Workbox「往 SW 里注入 revision」的同款原理）。
//
// 开发模式（vite dev）不注册本文件（见 src/utils/registerSW.ts），占位符不会生效。
// ============================================================================

const VERSION = '__SW_VERSION__'
const PRECACHE_URLS = __SW_PRECACHE__

// 外壳缓存随版本走：新版本 = 新缓存名，activate 时清掉旧的。
const SHELL_CACHE = `shell-${VERSION}`
// 攻略图片体量大且极少变动，单独一个跨版本长期复用的缓存，按需填充。
const IMG_CACHE = 'guide-img-v1'

/** 把相对 scope 的路径解析成绝对 URL（self.location 即 …/sw.js）。 */
const abs = (path) => new URL(path, self.location).href

// —— 安装：预缓存应用外壳，逐个添加，个别失败不拖垮整体 ——
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await Promise.all(
        PRECACHE_URLS.map((u) => cache.add(abs(u)).catch(() => {})),
      )
      await self.skipWaiting()
    })(),
  )
})

// —— 激活：删除旧版本外壳缓存，立即接管页面 ——
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.map((k) =>
          k !== SHELL_CACHE && k !== IMG_CACHE ? caches.delete(k) : undefined,
        ),
      )
      await self.clients.claim()
    })(),
  )
})

// 允许页面主动触发跳过等待（预留给「有新版本，点击刷新」这类交互）。
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // 跨源请求（Supabase 同步、tesseract 语言模型 CDN 等）一律直连，不经缓存。
  if (url.origin !== self.location.origin) return

  // 导航请求：网络优先，离线时回退到预缓存的应用外壳（index.html）。
  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(req))
    return
  }

  const path = url.pathname
  // 攻略图片：cache-first，首访下载、之后离线可用。
  if (path.includes('/guide-img/')) {
    event.respondWith(cacheFirst(req, IMG_CACHE))
    return
  }
  // 带 hash 的构建产物与图标（不可变）：cache-first。
  if (path.includes('/assets/') || /\.(?:js|css|woff2?|ttf|png|svg|webmanifest)$/.test(path)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE))
    return
  }
  // 其余（含 version.json 等）：网络优先，离线回退缓存。
  event.respondWith(networkFirst(req, SHELL_CACHE))
})

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch (err) {
    return hit || Response.error()
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(req)
    return hit || Response.error()
  }
}

// 导航：优先网络（拿最新页面），离线时回退到预缓存的 index.html 应用外壳。
async function navigationHandler(req) {
  try {
    return await fetch(req)
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE)
    const shell =
      (await cache.match(abs('index.html'))) || (await cache.match(abs('./')))
    return shell || Response.error()
  }
}
