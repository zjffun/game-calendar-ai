// ============================================================================
// 攻略大全 模块（入口）
// - 左侧边栏：按分类（副本 / 神器 / 奇遇 / 看戏 / 自定义）分组列出所有攻略；
//   内置攻略只读，用户自定义攻略可编辑/删除，二者一并展示在侧边；
// - 顶部搜索：按标题或标签匹配，支持拼音（全拼 / 首字母）；命中的标签在列表中高亮；
// - 右侧主区：展示选中攻略的正文，或新增/编辑表单；
// - 「＋ 新增攻略」让用户把自己的内容加入侧边；
// - 内置攻略正文只读，但可在详情下方「我的补充」追加自定义 Markdown 内容。
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import type { GuideCategory, GuideEntry } from '../../types'
import {
  useGuides,
  useGuideNotes,
  useGuideTags,
  usePinnedGuides,
  useGuideRuns,
} from '../../store/useAppStore'
import { GUIDE_PRESETS, GUIDE_CATEGORY_META } from '../../data/guides'
import { guideMatches, guideTagMatches, ensurePinyinLoaded } from '../../utils/guide'
import GuideContentView from './GuideContentView'
import GuideEditor, { type GuideDraft } from './GuideEditor'
import GuideNotes from './GuideNotes'
import GuideTimer from './GuideTimer'
import GuideTagEditor from './GuideTagEditor'
import { appConfirm } from '../common/ConfirmDialog'
import { openImageLightbox } from '../common/ImageLightbox'
import Icon from '../common/Icon'
import './Guide.css'

type Mode = 'view' | 'add' | 'edit'

/**
 * 不展示计时器的分类：周六/周日活动是固定开放时段的玩法（按点开、按点结束），
 * 记「自己用了多久」没有意义，故这两类攻略不出现「开始/结束」。
 */
const NO_TIMER_CATEGORIES: readonly GuideCategory[] = ['周六活动', '周日活动']

/** 当前查看的攻略记录在 URL 查询参数里，刷新后可恢复（App 见到该参数会打开攻略页） */
export const GUIDE_URL_PARAM = 'guide'

function readGuideParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(GUIDE_URL_PARAM)
}

/** 把当前攻略 id 写回地址栏（用 replaceState，不新增历史记录） */
function writeGuideParam(id: string | null): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get(GUIDE_URL_PARAM) === (id ?? null)) return
  if (id) url.searchParams.set(GUIDE_URL_PARAM, id)
  else url.searchParams.delete(GUIDE_URL_PARAM)
  window.history.replaceState(null, '', url)
}

/** 自定义攻略按 order 升序（无 order 排后） */
function byOrder(a: GuideEntry, b: GuideEntry): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
}

export default function GuideBook() {
  const { guides: customGuides, add, update, remove } = useGuides()
  const { guideNotes } = useGuideNotes()
  const { guideTags } = useGuideTags()
  const { pinnedGuides, togglePin } = usePinnedGuides()
  const { guideRuns } = useGuideRuns()
  const [query, setQuery] = useState('')
  // 拼音字典是否就绪；就绪后重算分组，让拼音匹配生效
  const [pinyinReady, setPinyinReady] = useState(false)
  // 初始选中优先取 URL 参数（刷新后恢复上次查看的攻略）
  const [selectedId, setSelectedId] = useState<string | null>(() => readGuideParam())
  const [mode, setMode] = useState<Mode>('view')
  // 窄屏：默认展开搜索+列表；选中攻略后把搜索区收成一个图标（桌面端此状态无视觉影响）
  const [navCollapsed, setNavCollapsed] = useState(false)

  // 全部攻略（内置在前、自定义在后）——用于按 id 查找
  const allEntries = useMemo<GuideEntry[]>(
    () => [...GUIDE_PRESETS, ...[...customGuides].sort(byOrder)],
    [customGuides],
  )

  // 查询含拉丁字母 = 拼音意图，按需加载拼音字典（纯中文搜索不会触发下载）
  useEffect(() => {
    if (pinyinReady || !/[a-z]/i.test(query)) return
    let cancelled = false
    ensurePinyinLoaded().then(() => {
      if (!cancelled) setPinyinReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [query, pinyinReady])

  const pinnedSet = useMemo(() => new Set(pinnedGuides), [pinnedGuides])

  // 置顶条目：按置顶顺序（最新在前），仍受搜索过滤；失效 id 自动跳过
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pinnedEntries = useMemo(() => {
    const byId = new Map(allEntries.map((e) => [e.id, e]))
    return pinnedGuides
      .map((id) => byId.get(id))
      .filter((e): e is GuideEntry => !!e && guideMatches(e, query, guideTags[e.id]))
  }, [pinnedGuides, allEntries, query, pinyinReady, guideTags])

  // 按分类分组并按搜索过滤（按标题或标签匹配，支持拼音）；置顶项移到顶部分组，故这里排除
  // pinyinReady 入依赖：字典加载完成后重算，纳入拼音匹配结果
  const groups = useMemo(() => {
    return GUIDE_CATEGORY_META.map((meta) => {
      const list = allEntries.filter(
        (e) =>
          e.category === meta.category &&
          !pinnedSet.has(e.id) &&
          guideMatches(e, query, guideTags[e.id]),
      )
      return { meta, list }
    }).filter((g) => g.list.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEntries, query, pinyinReady, pinnedSet, guideTags])

  // 过滤后的扁平列表（置顶在前，用于默认选中第一条）
  const visibleFlat = useMemo(
    () => [...pinnedEntries, ...groups.flatMap((g) => g.list)],
    [pinnedEntries, groups],
  )

  // 当前选中：优先 selectedId（仍可见），否则取第一条
  const activeEntry =
    visibleFlat.find((e) => e.id === selectedId) ?? visibleFlat[0] ?? null

  // 地址栏始终反映当前查看的攻略（含默认第一条 / URL 中失效 id 的自愈）
  useEffect(() => {
    writeGuideParam(activeEntry?.id ?? null)
  }, [activeEntry?.id])

  const presetCount = GUIDE_PRESETS.length
  const customCount = customGuides.length

  function select(id: string) {
    setSelectedId(id)
    setMode('view')
    setNavCollapsed(true) // 窄屏：选中后收起搜索区，把主区留给正文
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

  // 侧边一条攻略项（置顶分组与各分类分组共用）：标题按钮 + 标签行
  function renderNavItem(entry: GuideEntry) {
    const active = activeEntry?.id === entry.id && mode === 'view'
    const tags = guideTags[entry.id]
    return (
      <li key={entry.id}>
        <button
          className={`guide-nav-item${active ? ' active' : ''}`}
          onClick={() => select(entry.id)}
        >
          <span className="guide-nav-main">
            <span className="guide-nav-title">{entry.title}</span>
            {entry.preset && guideNotes[entry.id] && (
              <span className="guide-nav-note" title="已补充自定义内容" aria-hidden />
            )}
            {guideRuns[entry.id]?.running && (
              <span className="guide-nav-timing" title="计时中">
                <Icon name="clock" size={11} />
              </span>
            )}
            {!entry.preset && <span className="guide-nav-tag">自定义</span>}
          </span>
          {tags && tags.length > 0 && (
            <span className="guide-nav-tags">
              {tags.map((t) => (
                <span
                  className={`guide-nav-chip${
                    guideTagMatches(t, query) ? ' matched' : ''
                  }`}
                  key={t}
                >
                  {t}
                </span>
              ))}
            </span>
          )}
        </button>
      </li>
    )
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

      <div className={`guide-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
        {/* 窄屏收起态：把搜索+列表收成一个可点回的图标（桌面端始终隐藏） */}
        <button
          type="button"
          className="guide-nav-toggle"
          onClick={() => setNavCollapsed(false)}
          aria-label="展开搜索与攻略列表"
        >
          <Icon name="search" size={15} />
          <span>攻略列表</span>
        </button>

        {/* 侧边栏：分类 + 攻略导航 */}
        <aside className="guide-sidebar">
          <div className="guide-side-tools">
            <div className="guide-search-wrap">
              <Icon name="search" size={14} className="guide-search-icon" />
              <input
                className="input guide-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题 / 标签…"
              />
              {query && (
                <button
                  type="button"
                  className="guide-search-clear"
                  aria-label="清空"
                  onClick={() => setQuery('')}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
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

          {pinnedEntries.length === 0 && groups.length === 0 ? (
            <div className="empty">没有匹配「{query}」的攻略</div>
          ) : (
            <nav className="guide-nav" aria-label="攻略列表">
              {pinnedEntries.length > 0 && (
                <div className="guide-group guide-group-pinned pop-in" key="__pinned__">
                  <div className="guide-group-head">
                    <Icon name="pin" size={12} className="guide-group-pin-icon" />
                    <span className="guide-group-name">置顶</span>
                    <span className="guide-group-count">{pinnedEntries.length}</span>
                  </div>
                  <ul className="guide-nav-list">{pinnedEntries.map(renderNavItem)}</ul>
                </div>
              )}
              {groups.map(({ meta, list }) => (
                <div className="guide-group" key={meta.category}>
                  <div className="guide-group-head">
                    <span className="guide-group-name">{meta.category}</span>
                    <span className="guide-group-count">{list.length}</span>
                  </div>
                  <ul className="guide-nav-list">{list.map(renderNavItem)}</ul>
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
                  {/* 摘要按纯文本直出（不过 Markdown）：这是一行定位语，
                      渲染块级语法会撑坏头部布局。要富文本请写进正文 sections */}
                  {activeEntry.summary && (
                    <p className="muted guide-detail-summary">{activeEntry.summary}</p>
                  )}
                </div>
                <div className="guide-detail-actions">
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm guide-pin-btn${
                      pinnedSet.has(activeEntry.id) ? ' pinned' : ''
                    }`}
                    onClick={() => togglePin(activeEntry.id)}
                    aria-pressed={pinnedSet.has(activeEntry.id)}
                    title={pinnedSet.has(activeEntry.id) ? '取消置顶' : '置顶到侧边顶部'}
                  >
                    <Icon name="pin" size={13} />
                    {pinnedSet.has(activeEntry.id) ? '已置顶' : '置顶'}
                  </button>
                  {!activeEntry.preset && (
                    <>
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
                    </>
                  )}
                </div>
              </header>

              <div className="guide-detail-tags">
                <GuideTagEditor key={activeEntry.id} guideId={activeEntry.id} />
              </div>

              {!NO_TIMER_CATEGORIES.includes(activeEntry.category) && (
                <GuideTimer key={`timer-${activeEntry.id}`} guideId={activeEntry.id} />
              )}

              {/* 内置攻略：把「我的补充」自定义内容置顶，正文之前 */}
              {activeEntry.preset && (
                <GuideNotes key={activeEntry.id} guideId={activeEntry.id} />
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
                        onClick={() =>
                          openImageLightbox(
                            import.meta.env.BASE_URL + img.src,
                            img.caption ?? activeEntry.title,
                          )
                        }
                      />
                      {img.caption && <figcaption>{img.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}

              {activeEntry.source && (
                <p className="muted small guide-detail-source">资料出处：{activeEntry.source}</p>
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
