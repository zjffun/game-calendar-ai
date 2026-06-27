// ============================================================================
// 攻略正文渲染：把若干小节（heading + items）渲染为标题 + 要点列表。
// 内置攻略与自定义预览/详情共用，保证展示一致。
// ============================================================================

import type { GuideSection } from '../../types'

interface Props {
  sections: GuideSection[]
}

export default function GuideContentView({ sections }: Props) {
  return (
    <div className="guide-content-view">
      {sections.map((s, i) => (
        <div className="guide-sec" key={i}>
          {s.heading && <div className="guide-sec-head">{s.heading}</div>}
          <ul className="guide-sec-list">
            {s.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
