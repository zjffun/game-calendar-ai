// ============================================================================
// 攻略「我的补充」：给内置攻略追加用户自定义 Markdown 内容。
// - 内置正文保持只读；补充文本按攻略 id 存于 localStorage（store.guideNotes）；
// - 支持 Ctrl+V 粘贴 / 按钮上传 / 拖拽插入图片：先 canvas 压缩（限边长 + 质量
//   迭代，目标 ≤300KB），以 base64 存入 IndexedDB 图片库，正文中以
//   ![alt](img:<id>) 引用；
// - 保存 / 取消 / 删除 / 切换攻略时清理不再被引用的图片（GC），避免存储泄漏。
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGuideNotes } from '../../store/useAppStore'
import { compressImage } from '../../utils/image'
import { uid } from '../../utils/id'
import {
  putImage,
  getImages,
  deleteImages,
  extractImageIds,
} from '../../store/imageStore'
import { appConfirm } from '../common/ConfirmDialog'
import MarkdownView from './MarkdownView'

const PLACEHOLDER = `支持 Markdown（表格 / 任务列表也可以），例如：
## 我的打法
1. 先清小怪再点火
2. BOSS 半血 **集火** 秘书

| 轮次 | 掉落 |
| --- | --- |
| 7-1 | 珍珠 |

直接 Ctrl+V 粘贴截图，或点上方「插入图片」`

/** 更新时间展示：YYYY-MM-DD HH:mm */
function formatUpdatedAt(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface Props {
  /** 所属攻略 id（内置攻略 id 稳定，可放心作为存储键） */
  guideId: string
}

export default function GuideNotes({ guideId }: Props) {
  const { guideNotes, set, remove } = useGuideNotes()
  const note = guideNotes[guideId]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  /** 已加载到内存的图片：id -> data URL（展示与预览共用） */
  const [images, setImages] = useState<Record<string, string>>({})
  /** 正在压缩/入库的图片数（>0 时禁止保存） */
  const [busyCount, setBusyCount] = useState(0)
  const [imgError, setImgError] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 本次编辑会话新插入的图片 id（取消/离开时用于回收未保存的图片） */
  const sessionAddedRef = useRef<Set<string>>(new Set())
  /** 已确认在图片库中不存在的 id，避免反复徒劳查询 */
  const knownMissingRef = useRef<Set<string>>(new Set())
  const noteRef = useRef(note)
  noteRef.current = note

  // —— 按当前展示的正文（编辑中为草稿）加载引用的图片 ——
  const activeMarkdown = editing ? draft : (note?.markdown ?? '')
  const neededIds = useMemo(() => extractImageIds(activeMarkdown), [activeMarkdown])
  useEffect(() => {
    const missing = neededIds.filter(
      (id) => !(id in images) && !knownMissingRef.current.has(id),
    )
    if (missing.length === 0) return
    let cancelled = false
    getImages(missing)
      .then((found) => {
        if (cancelled) return
        for (const id of missing) {
          if (!(id in found)) knownMissingRef.current.add(id)
        }
        if (Object.keys(found).length) setImages((prev) => ({ ...prev, ...found }))
      })
      .catch(() => {
        /* 读取失败按缺图占位展示 */
      })
    return () => {
      cancelled = true
    }
  }, [neededIds, images])

  // —— 组件卸载（切换攻略/页签）时，回收本会话未保存的图片 ——
  useEffect(
    () => () => {
      const keep = new Set(noteRef.current ? extractImageIds(noteRef.current.markdown) : [])
      const orphans = [...sessionAddedRef.current].filter((id) => !keep.has(id))
      if (orphans.length) void deleteImages(orphans).catch(() => {})
    },
    [],
  )

  function startEdit() {
    setDraft(note?.markdown ?? '')
    setImgError('')
    setEditing(true)
  }

  /** 在光标处独占一行插入文本（图片引用），并把光标移到其后 */
  function insertAtCursor(snippet: string) {
    const ta = textareaRef.current
    setDraft((prev) => {
      const start = ta?.selectionStart ?? prev.length
      const end = ta?.selectionEnd ?? prev.length
      const before = prev.slice(0, start)
      const after = prev.slice(end)
      const pre = before && !before.endsWith('\n') ? `${before}\n` : before
      const post = after.startsWith('\n') || after === '' ? after : `\n${after}`
      const caret = pre.length + snippet.length
      requestAnimationFrame(() => {
        ta?.focus()
        ta?.setSelectionRange(caret, caret)
      })
      return pre + snippet + post
    })
  }

  /** 压缩并入库若干图片，然后在正文插入引用 */
  async function addImageBlobs(blobs: Blob[]) {
    if (blobs.length === 0) return
    setImgError('')
    for (const blob of blobs) {
      setBusyCount((n) => n + 1)
      try {
        const { dataUrl } = await compressImage(blob)
        const id = uid('img_')
        await putImage(id, dataUrl)
        sessionAddedRef.current.add(id)
        knownMissingRef.current.delete(id)
        setImages((prev) => ({ ...prev, [id]: dataUrl }))
        insertAtCursor(`![图片](img:${id})`)
      } catch {
        setImgError('图片处理失败：文件可能已损坏或格式不支持')
      } finally {
        setBusyCount((n) => n - 1)
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...(e.clipboardData?.items ?? [])]
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length) {
      e.preventDefault()
      void addImageBlobs(files)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      void addImageBlobs(files)
    }
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // 允许再次选择同一文件
    void addImageBlobs(files)
  }

  /** 保存：落库草稿，并回收本次编辑中被移除引用的图片 */
  function handleSave() {
    if (!draft.trim() || busyCount > 0) return
    const newIds = new Set(extractImageIds(draft))
    const oldIds = note ? extractImageIds(note.markdown) : []
    const orphans = [...new Set([...oldIds, ...sessionAddedRef.current])].filter(
      (id) => !newIds.has(id),
    )
    set(guideId, draft)
    sessionAddedRef.current = new Set()
    setEditing(false)
    if (orphans.length) void deleteImages(orphans).catch(() => {})
  }

  /** 取消：丢弃草稿，回收本会话新插入且未被已保存内容引用的图片 */
  function handleCancel() {
    const keep = new Set(note ? extractImageIds(note.markdown) : [])
    const orphans = [...sessionAddedRef.current].filter((id) => !keep.has(id))
    sessionAddedRef.current = new Set()
    setEditing(false)
    if (orphans.length) void deleteImages(orphans).catch(() => {})
  }

  async function handleDelete() {
    if (!(await appConfirm('确定删除这条攻略的自定义补充内容吗？其中的图片会一并清除。'))) return
    const ids = note ? extractImageIds(note.markdown) : []
    remove(guideId)
    sessionAddedRef.current = new Set()
    setEditing(false)
    if (ids.length) void deleteImages(ids).catch(() => {})
  }

  // —— 编辑态：文本框（支持粘贴/拖拽图片）+ 实时预览 ——
  if (editing) {
    return (
      <section className="guide-notes editing pop-in">
        <header className="guide-notes-head">
          <span aria-hidden>📝</span>
          <span className="guide-notes-title">我的补充</span>
          <span className="spacer" />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => fileInputRef.current?.click()}
            title="选择图片文件插入（也可直接 Ctrl+V 粘贴或拖拽）"
          >
            🖼 插入图片
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleCancel}>
            取消
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!draft.trim() || busyCount > 0}
          >
            保存
          </button>
        </header>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handlePickFiles}
        />
        <textarea
          ref={textareaRef}
          className="textarea guide-notes-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          placeholder={PLACEHOLDER}
          rows={8}
          autoFocus
        />
        <span className="muted small">
          支持 Markdown（GFM：表格、任务列表、删除线）；图片可 <code>Ctrl+V</code> 粘贴、
          拖拽或点「插入图片」，会自动压缩后保存在本机图片库。
        </span>
        {busyCount > 0 && <span className="guide-notes-busy">⏳ 正在压缩 {busyCount} 张图片…</span>}
        {imgError && <span className="guide-notes-error">{imgError}</span>}
        <div className="guide-notes-preview">
          <div className="muted small guide-notes-preview-label">预览</div>
          {draft.trim() ? (
            <MarkdownView markdown={draft} images={images} />
          ) : (
            <div className="empty">在上方输入内容后，这里会显示预览</div>
          )}
        </div>
      </section>
    )
  }

  // —— 无补充：一个「添加」入口 ——
  if (!note) {
    return (
      <button className="guide-notes-add" onClick={startEdit}>
        ＋ 补充自定义内容（支持 Markdown 与截图，仅存在本机）
      </button>
    )
  }

  // —— 展示态：渲染 Markdown + 编辑/删除 ——
  return (
    <section className="guide-notes pop-in">
      <header className="guide-notes-head">
        <span aria-hidden>📝</span>
        <span className="guide-notes-title">我的补充</span>
        <span className="muted small">更新于 {formatUpdatedAt(note.updatedAt)}</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={startEdit}>
          ✏️ 编辑
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleDelete}>
          🗑 删除
        </button>
      </header>
      <MarkdownView markdown={note.markdown} images={images} />
    </section>
  )
}
