// ============================================================================
// 攻略大全 模块（入口）
// - 左侧边栏：按分类（副本 / 神器 / 奇遇 / 看戏 / 自定义）分组列出所有攻略；
//   内置攻略只读，用户自定义攻略可编辑/删除，二者一并展示在侧边；
// - 顶部搜索：按标题 / 摘要 / 标签 / 正文（含「我的补充」）匹配；
// - 右侧主区：展示选中攻略的正文，或新增/编辑表单；
// - 「＋ 新增攻略」让用户把自己的内容加入侧边；
// - 内置攻略正文只读，但可在详情下方「我的补充」追加自定义 Markdown 内容。
// ============================================================================

import { useMemo, useState } from 'react'
import type { GuideEntry } from '../../types'
import { useGuides, useGuideNotes } from '../../store/useAppStore'
import { GUIDE_PRESETS, GUIDE_CATEGORY_META } from '../../data/guides'
import { guideMatches } from '../../utils/guide'
import GuideContentView from './GuideContentView'
import GuideEditor, { type GuideDraft } from './GuideEditor'
import GuideNotes from './GuideNotes'
import { appConfirm } from '../common/ConfirmDialog'
import Icon from '../common/Icon'
import './Guide.css'

type Mode = 'view' | 'add' | 'edit'

/** 自定义攻略按 order 升序（无 order 排后） */
function byOrder(a: GuideEntry, b: GuideEntry): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
}

export default function GuideBook() {
  const { guides: customGuides, add, update, remove } = useGuides()
  const { guideNotes } = useGuideNotes()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('view')

  // 全部攻略（内置在前、自定义在后）——用于按 id 查找
  const allEntries = useMemo<GuideEntry[]>(
    () => [...GUIDE_PRESETS, ...[...customGuides].sort(byOrder)],
    [customGuides],
  )

  // 按分类分组并按搜索过滤（「我的补充」内容也参与匹配）；保留分类展示顺序
  const groups = useMemo(() => {
    return GUIDE_CATEGORY_META.map((meta) => {
      const list = allEntries.filter(
        (e) =>
          e.category === meta.category &&
          guideMatches(e, query, guideNotes[e.id]?.markdown),
      )
      return { meta, list }
    }).filter((g) => g.list.length > 0)
  }, [allEntries, query, guideNotes])

  // 过滤后的扁平列表（用于默认选中第一条）
  const visibleFlat = useMemo(() => groups.flatMap((g) => g.list), [groups])

  // 当前选中：优先 selectedId（仍可见），否则取第一条
  const activeEntry =
    visibleFlat.find((e) => e.id === selectedId) ?? visibleFlat[0] ?? null

  const presetCount = GUIDE_PRESETS.length
  const customCount = customGuides.length

  function select(id: string) {
    setSelectedId(id)
    setMode('view')
  }

  function handleSaveAdd(draft: GuideDraft) {
    const id = add(draft)
    setSelectedId(id)
    setMode('view')
  }

  function handleSaveEdit(draft: GuideDraft) {
    if (!activeEntry) return
    update(activeEntry.id, draft)
    setMode('view')
  }

  async function handleDelete(entry: GuideEntry) {
    if (!(await appConfirm(`确定删除「${entry.title}」吗？`))) return
    remove(entry.id)
    setSelectedId(null)
    setMode('view')
  }

  return (
    <section className="stack">
      <h2 className="section-title">
        攻略大全
        <span className="spacer" />
        <span className="muted small">
          内置 {presetCount} 条 · 自定义 {customCount} 条
        </span>
      </h2>

      <div className="guide-layout">
        {/* 侧边栏：分类 + 攻略导航 */}
        <aside className="guide-sidebar">
          <div className="guide-side-tools">
            <div className="guide-search-wrap">
              <Icon name="search" size={14} className="guide-search-icon" />
              <input
                className="input guide-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索攻略…"
              />
            </div>
            <button
              className="btn btn-tonal btn-sm guide-add-btn"
              onClick={() => setMode('add')}
              title="把你自己的攻略加入侧边"
            >
              <Icon name="plus" size={13} />
              新增攻略
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="empty">没有匹配「{query}」的攻略</div>
          ) : (
            <nav className="guide-nav" aria-label="攻略列表">
              {groups.map(({ meta, list }) => (
                <div className="guide-group" key={meta.category}>
                  <div className="guide-group-head">
                    <span className="guide-group-name">{meta.category}</span>
                    <span className="guide-group-count">{list.length}</span>
                  </div>
                  <ul className="guide-nav-list">
                    {list.map((entry) => {
                      const active = activeEntry?.id === entry.id && mode === 'view'
                      return (
                        <li key={entry.id}>
                          <button
                            className={`guide-nav-item${active ? ' active' : ''}`}
                            onClick={() => select(entry.id)}
                          >
                            <span className="guide-nav-title">{entry.title}</span>
                            {entry.preset && guideNotes[entry.id] && (
                              <span className="guide-nav-note" title="已补充自定义内容" aria-hidden />
                            )}
                            {!entry.preset && (
                              <span className="guide-nav-tag">自定义</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </aside>

        {/* 主区：详情 / 新增 / 编辑 */}
        <div className="guide-main card">
          {mode === 'add' ? (
            <GuideEditor onSave={handleSaveAdd} onCancel={() => setMode('view')} />
          ) : mode === 'edit' && activeEntry ? (
            <GuideEditor
              initial={activeEntry}
              onSave={handleSaveEdit}
              onCancel={() => setMode('view')}
            />
          ) : activeEntry ? (
            <article className="guide-detail pop-in">
              <header className="guide-detail-head">
                <div className="guide-detail-titles">
                  <div className="row row-wrap" style={{ gap: 8 }}>
                    <span className="badge badge-outline">{activeEntry.category}</span>
                    {!activeEntry.preset && (
                      <span className="badge badge-gold">自定义</span>
                    )}
                  </div>
                  <h3 className="guide-detail-title">{activeEntry.title}</h3>
                  {activeEntry.summary && (
                    <p className="muted guide-detail-summary">{activeEntry.summary}</p>
                  )}
                </div>
                {!activeEntry.preset && (
                  <div className="guide-detail-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setMode('edit')}
                    >
                      <Icon name="pencil" size={13} />
                      编辑
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(activeEntry)}
                    >
                      <Icon name="trash" size={13} />
                      删除
                    </button>
                  </div>
                )}
              </header>

              {activeEntry.tags && activeEntry.tags.length > 0 && (
                <div className="row row-wrap guide-detail-tags">
                  {activeEntry.tags.map((t) => (
                    <span className="chip guide-tag" key={t}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              <div className="divider" />

              <GuideContentView sections={activeEntry.sections} />

              {/* 配图：压缩后随应用打包的本地图片 */}
              {activeEntry.images && activeEntry.images.length > 0 && (
                <div className="guide-images">
                  {activeEntry.images.map((img) => (
                    <figure className="guide-figure" key={img.src}>
                      <img
                        src={import.meta.env.BASE_URL + img.src}
                        alt={img.caption ?? activeEntry.title}
                        loading="lazy"
                      />
                      {img.caption && <figcaption>{img.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}

              {activeEntry.source && (
                <p className="muted small guide-detail-source">资料出处：{activeEntry.source}</p>
              )}

              {/* 内置攻略：正文只读，但可补充自定义 Markdown 内容 */}
              {activeEntry.preset && (
                <GuideNotes key={activeEntry.id} guideId={activeEntry.id} />
              )}
            </article>
          ) : (
            <div className="empty">
              还没有攻略，点击「新增攻略」把你的内容加进来吧～
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
