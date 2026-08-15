// ============================================================================
// 自定义攻略编辑器：新增 / 编辑用户攻略。
// 用一个文本框书写正文（约定：# 小节标题、- 要点），保存时解析为小节并入库。
// 右侧/下方提供实时预览，所见即所得。
// ============================================================================

import { useMemo, useState } from 'react'
import type { GuideCategory, GuideEntry, GuideSection } from '../../types'
import { parseGuideContent, serializeGuideContent } from '../../utils/guide'
import GuideContentView from './GuideContentView'

const CATEGORIES: GuideCategory[] = ['天命副本', '周六活动', '周日活动', '神器·起', '神器·转', '神器·合', '奇遇', '看戏', '自定义']

export interface GuideDraft {
  title: string
  category: GuideCategory
  summary?: string
  sections: GuideSection[]
}

interface Props {
  /** 编辑已有自定义攻略时传入；新增时为空 */
  initial?: GuideEntry
  onSave: (draft: GuideDraft) => void
  onCancel: () => void
}

const PLACEHOLDER = `支持极简标记：
## 玩法
- 第一步要点
- 第二步要点

## 奖励
- 产出说明`

export default function GuideEditor({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<GuideCategory>(initial?.category ?? '自定义')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [content, setContent] = useState(
    initial ? serializeGuideContent(initial.sections) : '',
  )

  // 实时预览小节
  const previewSections = useMemo(() => parseGuideContent(content), [content])
  const canSave = title.trim().length > 0 && previewSections.length > 0

  function handleSave() {
    if (!canSave) return
    onSave({
      title: title.trim(),
      category,
      summary: summary.trim() || undefined,
      sections: previewSections,
    })
  }

  return (
    <div className="guide-editor pop-in">
      <div className="guide-editor-head">
        <h3>{initial ? '编辑攻略' : '新增自定义攻略'}</h3>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!canSave}>
          保存
        </button>
      </div>

      <div className="guide-editor-grid">
        <div className="field">
          <label>标题</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如 我的五开日程 / 某副本翻牌技巧"
          />
        </div>
        <div className="field">
          <label>分类</label>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value as GuideCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>一句话摘要（可选）</label>
        <input
          className="input"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="一句话定位，显示在标题下方"
        />
        <span className="muted small">保存后可在攻略详情页添加标签。</span>
      </div>

      <div className="field">
        <label>正文</label>
        <textarea
          className="textarea guide-editor-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={10}
        />
        <span className="muted small">
          以 <code>#</code> 开头为小节标题，以 <code>-</code> 开头为要点；普通整行也会作为一条要点。
        </span>
      </div>

      <div className="guide-editor-preview">
        <div className="guide-editor-preview-label muted small">预览</div>
        {previewSections.length > 0 ? (
          <GuideContentView sections={previewSections} />
        ) : (
          <div className="empty">在上方正文输入内容后，这里会显示预览</div>
        )}
      </div>
    </div>
  )
}
