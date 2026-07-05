// ============================================================================
// Markdown 渲染：基于 react-markdown（+ GFM 表格/任务列表/删除线 + 软换行=<br>）。
//
// 为什么用库而不再手写解析器：需求已扩展到表格、任务列表、图片等，
// 手写解析器的边界情况维护成本超过收益；react-markdown 默认不渲染原始
// HTML、URL 走白名单转换（defaultUrlTransform），安全性与手写方案等同。
//
// 图片协议：正文里以 ![alt](img:<id>) 引用本机图片库（IndexedDB，见
// store/imageStore）；渲染时经 images 映射解析为 base64 data URL。
// 外链 http(s) 图片照常渲染；javascript: 等危险协议被默认转换器清洗。
// ============================================================================

import { useMemo } from 'react'
import Markdown, { defaultUrlTransform, type Components, type UrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

/** 本机图片引用协议前缀（配合图片库使用） */
export const IMAGE_URL_PREFIX = 'img:'

/** 放行本机图片协议，其余交给默认白名单（http/https/mailto/相对路径等） */
const urlTransform: UrlTransform = (url) =>
  url.startsWith(IMAGE_URL_PREFIX) ? url : defaultUrlTransform(url)

interface Props {
  markdown: string
  /** 本机图片：id -> base64 data URL（正文出现 img: 引用时传入） */
  images?: Record<string, string>
}

export default function MarkdownView({ markdown, images }: Props) {
  const components = useMemo<Components>(
    () => ({
      a: ({ node: _n, children, ...props }) => (
        <a {...props} className="md-link" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
      img: ({ node: _n, src, alt, ...props }) => {
        const url = typeof src === 'string' ? src : ''
        if (url.startsWith(IMAGE_URL_PREFIX)) {
          const dataUrl = images?.[url.slice(IMAGE_URL_PREFIX.length)]
          if (!dataUrl) {
            // 图片仍在加载或已被清理：显示占位而不是裂图
            return <span className="md-img-missing">图片加载中或已丢失{alt ? `：${alt}` : ''}</span>
          }
          return <img {...props} className="md-img" src={dataUrl} alt={alt ?? ''} loading="lazy" />
        }
        return <img {...props} className="md-img" src={url} alt={alt ?? ''} loading="lazy" />
      },
    }),
    [images],
  )

  return (
    <div className="md-view">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={urlTransform}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  )
}
