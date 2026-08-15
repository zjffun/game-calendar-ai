// ============================================================================
// 攻略标签行内编辑：给任意一条攻略（内置或自定义）打自定义标签。
// - 标签存在用户标签库（guideTags，攻略id -> 标签数组），与只读的内置正文分离；
// - 已有标签渲染为可删除的芯片；点「＋标签」展开输入框，回车 / 失焦提交；
// - 支持一次输入多个（逗号 / 顿号 / 空格分隔），去重、上限 8 个（store 内约束）。
// ============================================================================

import { useState } from 'react'
import { useGuideTags } from '../../store/useAppStore'
import Icon from '../common/Icon'

const MAX_GUIDE_TAGS = 8

interface Props {
  guideId: string
}

export default function GuideTagEditor({ guideId }: Props) {
  const { guideTags, addTags, removeTag } = useGuideTags()
  const tags = guideTags[guideId] ?? []
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const atMax = tags.length >= MAX_GUIDE_TAGS

  function commit() {
    const text = draft.trim()
    if (text) addTags(guideId, text)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="row row-wrap guide-tag-editor">
      {tags.map((t) => (
        <span className="chip guide-tag guide-tag-editable" key={t}>
          {t}
          <button
            type="button"
            className="guide-tag-remove"
            onClick={() => removeTag(guideId, t)}
            aria-label={`删除标签 ${t}`}
            title="删除标签"
          >
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}

      {adding && !atMax ? (
        <input
          className="input guide-tag-input"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          placeholder="标签名，回车确认"
          maxLength={20}
        />
      ) : (
        !atMax && (
          <button
            type="button"
            className="chip guide-tag guide-tag-add"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" size={11} />
            标签
          </button>
        )
      )}
    </div>
  )
}
