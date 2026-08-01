// ============================================================================
// 图片库（IndexedDB）——「我的补充」里粘贴/上传的图片，以 base64 data URL 存储。
//
// 为什么不放 localStorage：localStorage 每源仅约 5MB 且同步阻塞，几十张截图就会
// 写满/卡顿；IndexedDB 配额通常为数百 MB 起，且为异步接口。文本类数据量小，
// 仍留在 localStorage（见 useAppStore），两边通过图片 id 关联：
// Markdown 里以 ![alt](img:<id>) 引用，渲染时从这里取 data URL。
// 浏览器与 Tauri WebView（WKWebView / WebView2 / WebKitGTK）均支持 IndexedDB。
// ============================================================================

const DB_NAME = 'mhxy-images'
const DB_VERSION = 1
const STORE = 'images'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        // 连接被其它上下文的升级请求关闭时，重置缓存以便下次重开
        db.onclose = () => {
          dbPromise = null
        }
        resolve(db)
      }
      req.onerror = () => {
        dbPromise = null
        reject(req.error ?? new Error('打开图片库失败'))
      }
    })
  }
  return dbPromise
}

/** 以 Promise 包装一次事务请求 */
function txRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = run(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('图片库操作失败'))
      }),
  )
}

// ---------------------------------------------------------------------------
// 图片变更通知（供云同步层订阅）：本地增删图片时通知，云同步据此上/下行。
// 来自云端下行的写入走 applyImagesFromRemote（notifyEnabled=false），不触发通知，
// 避免回声（收到远程图片 → 又被推回云端）。
// ---------------------------------------------------------------------------
export type ImageCommit =
  | { type: 'put'; id: string; dataUrl: string }
  | { type: 'delete'; ids: string[] }
  | { type: 'clear' }

const imageListeners = new Set<(c: ImageCommit) => void>()
let notifyEnabled = true

/** 订阅图片变更；返回取消订阅函数。 */
export function onImageCommit(fn: (c: ImageCommit) => void): () => void {
  imageListeners.add(fn)
  return () => {
    imageListeners.delete(fn)
  }
}

function notify(c: ImageCommit) {
  if (!notifyEnabled) return
  for (const l of imageListeners) l(c)
}

/** 写入/覆盖一张图片（base64 data URL） */
export async function putImage(id: string, dataUrl: string): Promise<void> {
  await txRequest('readwrite', (s) => s.put(dataUrl, id))
  notify({ type: 'put', id, dataUrl })
}

/** 批量读取：返回 id -> dataUrl（不存在的 id 直接缺席） */
export async function getImages(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return {}
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out: Record<string, string> = {}
    for (const id of unique) {
      const req = store.get(id)
      req.onsuccess = () => {
        if (typeof req.result === 'string') out[id] = req.result
      }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error ?? new Error('读取图片失败'))
  })
}

/** 批量删除（id 不存在则忽略） */
export async function deleteImages(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const id of unique) store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('删除图片失败'))
  })
  notify({ type: 'delete', ids: unique })
}

/** 全量导出：id -> dataUrl（备份用） */
export async function getAllImages(): Promise<Record<string, string>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out: Record<string, string> = {}
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        if (typeof cursor.value === 'string') out[String(cursor.key)] = cursor.value
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error ?? new Error('导出图片失败'))
  })
}

/** 批量写入（导入备份 / 云端下行用） */
export async function putImages(images: Record<string, string>): Promise<void> {
  const entries = Object.entries(images)
  if (entries.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [id, dataUrl] of entries) {
      if (typeof dataUrl === 'string') store.put(dataUrl, id)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('导入图片失败'))
  })
  for (const [id, dataUrl] of entries) {
    if (typeof dataUrl === 'string') notify({ type: 'put', id, dataUrl })
  }
}

/**
 * 从云端下行写入图片：与 putImages 相同，但【不】触发变更通知，避免回声。
 * 云同步拉取远程图片时使用。
 */
export async function applyImagesFromRemote(images: Record<string, string>): Promise<void> {
  notifyEnabled = false
  try {
    await putImages(images)
  } finally {
    notifyEnabled = true
  }
}

/** 清空图片库（清空所有数据用） */
export async function clearImages(): Promise<void> {
  await txRequest('readwrite', (s) => s.clear())
  notify({ type: 'clear' })
}

/** 用量统计：图片张数与近似总字节数（data URL 字符数 × 0.75） */
export async function imagesUsage(): Promise<{ count: number; bytes: number }> {
  const all = await getAllImages()
  let chars = 0
  for (const v of Object.values(all)) chars += v.length
  return { count: Object.keys(all).length, bytes: Math.round(chars * 0.75) }
}

/** 从 Markdown 文本中提取引用的图片 id（形如 ![alt](img:<id>)） */
export function extractImageIds(markdown: string): string[] {
  const ids = new Set<string>()
  for (const m of markdown.matchAll(/\(img:([A-Za-z0-9_-]+)\)/g)) ids.add(m[1])
  return [...ids]
}
