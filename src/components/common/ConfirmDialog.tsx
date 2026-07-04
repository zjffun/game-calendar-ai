// ============================================================================
// 应用内确认弹窗：appConfirm(message) → Promise<boolean>。
// 为什么不用 window.confirm：Tauri 的 WebView（WKWebView / WebView2）对
// alert/confirm/prompt 支持不完整（可能静默返回 false），网页端原生弹窗也与
// 应用主题割裂。<ConfirmHost /> 挂在 App 根部，任何地方 await appConfirm(...)。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'

type Resolver = (ok: boolean) => void

let hostHandler: ((message: string) => Promise<boolean>) | null = null

/**
 * 弹出确认框，等待用户选择。ConfirmHost 未挂载时回退 window.confirm
 * （仅测试等极端场景；正常运行时 App 根部始终挂有 ConfirmHost）。
 */
export function appConfirm(message: string): Promise<boolean> {
  if (hostHandler) return hostHandler(message)
  return Promise.resolve(window.confirm(message))
}

export default function ConfirmHost() {
  const [message, setMessage] = useState<string | null>(null)
  const resolverRef = useRef<Resolver | null>(null)
  const okButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    hostHandler = (msg: string) =>
      new Promise<boolean>((resolve) => {
        // 已有弹窗未决时，旧请求按「取消」结掉，避免悬挂
        resolverRef.current?.(false)
        resolverRef.current = resolve
        setMessage(msg)
      })
    return () => {
      hostHandler = null
      resolverRef.current?.(false)
      resolverRef.current = null
    }
  }, [])

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setMessage(null)
  }, [])

  // 打开时聚焦确认键；Esc = 取消
  useEffect(() => {
    if (message === null) return
    okButtonRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [message, close])

  if (message === null) return null

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false)
      }}
    >
      <div className="confirm-dialog pop-in" role="alertdialog" aria-modal="true" aria-label="确认操作">
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={() => close(false)}>
            取消
          </button>
          <button ref={okButtonRef} className="btn btn-primary" onClick={() => close(true)}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
