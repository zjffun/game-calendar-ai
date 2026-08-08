// ============================================================================
// 图片查看器：openImageLightbox(src, alt?) 点击任意图片全屏放大展示。
// 沿用 ConfirmDialog 的单例宿主模式：<ImageLightbox /> 挂在 App 根部，
// 任何组件 import { openImageLightbox } 即可调用，无需层层传 props。
// 关闭方式：点遮罩 / 关闭按钮 / Esc。
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'

interface ViewerState {
  src: string
  alt: string
}

let hostHandler: ((state: ViewerState) => void) | null = null

/** 打开全屏图片查看器；宿主未挂载时静默忽略（正常运行时始终挂有宿主）。 */
export function openImageLightbox(src: string, alt = '') {
  hostHandler?.({ src, alt })
}

export default function ImageLightbox() {
  const [state, setState] = useState<ViewerState | null>(null)

  useEffect(() => {
    hostHandler = setState
    return () => {
      hostHandler = null
    }
  }, [])

  const close = useCallback(() => setState(null), [])

  // 打开时：Esc 关闭 + 锁定背景滚动
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [state, close])

  if (!state) return null

  return (
    <div
      className="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={state.alt || '图片查看'}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <button className="lightbox-close" type="button" aria-label="关闭" onClick={close}>
        <Icon name="x" size={22} />
      </button>
      <img className="lightbox-img pop-in" src={state.src} alt={state.alt} />
      {state.alt && <p className="lightbox-caption">{state.alt}</p>}
    </div>
  )
}
