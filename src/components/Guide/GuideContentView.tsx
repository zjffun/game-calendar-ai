// ============================================================================
// 攻略正文渲染：把若干小节（heading + items）渲染为标题 + 要点列表。
// 内置攻略与自定义预览/详情共用，保证展示一致。
// ============================================================================

import { useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { GuideSection } from '../../types'

interface Props {
  sections: GuideSection[]
}

export default function GuideContentView({ sections }: Props) {
  const markdownComponents = useMemo<Components>(() => ({
    a: ({ node: _n, children, ...props }) => (
      <a {...props} className="md-link" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    p: ({ node: _n, children }) => <>{children}</>,
  }), [])

  return (
    <div className="guide-content-view">
      {sections.map((s, i) => (
        <div className="guide-sec" key={i}>
          {s.heading && <div className="guide-sec-head">{s.heading}</div>}
          <ul className="guide-sec-list">
            {s.items.map((it, j) => (
              <li key={j}>
                <Markdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={markdownComponents}
                >
                  {it}
                </Markdown>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
