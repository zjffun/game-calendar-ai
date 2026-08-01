// ============================================================================
// 账号与云同步面板（设置页顶部）。
//  · 未配置云端：显示一句说明，不影响任何本地功能。
//  · 未登录：邮箱+密码 / 注册 / Magic Link / GitHub / Google。
//  · 已登录：显示账号、同步状态、退出登录。
// 所有登录动作走 authStore；数据同步由 cloudSync 在后台自动完成。
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../store/authStore'
import type { SyncStatus } from '../../store/cloudSync'
import Icon from '../common/Icon'

interface Toast {
  text: string
  kind: 'ok' | 'err'
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  idle: '未同步',
  syncing: '同步中…',
  synced: '已同步',
  error: '同步失败（本地数据仍可用）',
}

export default function AccountPanel() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  const timerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )
  function flash(t: Toast, delay = 4000) {
    setToast(t)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setToast(null), delay)
  }

  // 统一跑一个登录动作：置忙 → 执行 → 反馈
  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    if (busy) return
    setBusy(true)
    try {
      const res = await action()
      if (res.message) flash({ text: res.message, kind: res.ok ? 'ok' : 'err' })
      else if (!res.ok) flash({ text: '操作失败，请重试。', kind: 'err' })
    } catch (err) {
      flash({ text: err instanceof Error ? err.message : '操作异常。', kind: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const emailOk = /.+@.+\..+/.test(email.trim())
  const canPasswordLogin = emailOk && password.length >= 6 && !busy

  // —— 未配置云端 ——
  if (!auth.isCloudConfigured) {
    return (
      <div className="card pad-lg">
        <div className="card-head">
          <h3>账号与云同步</h3>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          当前未启用云同步，数据仅保存在本机。若需在多设备间同步，请在项目根目录配置{' '}
          <code>.env</code> 的 <code>VITE_SUPABASE_URL</code> 与{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>（详见 docs/supabase-setup.md）。
        </p>
      </div>
    )
  }

  // —— 正在恢复会话 ——
  if (auth.status === 'loading') {
    return (
      <div className="card pad-lg">
        <div className="card-head">
          <h3>账号与云同步</h3>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          正在检查登录状态…
        </p>
      </div>
    )
  }

  // —— 已登录 ——
  if (auth.status === 'signedIn') {
    return (
      <div className="card pad-lg">
        <div className="card-head">
          <h3>账号与云同步</h3>
        </div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          已登录，数据会自动同步到云端并在各设备间保持一致。
        </p>
        <ul className="settings-usage">
          <li>账号：{auth.user?.email ?? auth.user?.id}</li>
          <li>同步状态：{SYNC_LABEL[auth.syncStatus]}</li>
        </ul>
        <div className="row row-wrap" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void run(auth.signOut)}
          >
            退出登录
          </button>
          {toast && (
            <span className={`settings-toast pop-in is-${toast.kind}`}>{toast.text}</span>
          )}
        </div>
      </div>
    )
  }

  // —— 未登录：登录 / 注册 ——
  return (
    <div className="card pad-lg">
      <div className="card-head">
        <h3>账号与云同步</h3>
      </div>
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        登录后，你的待办、种子、副本、房屋、攻略与物价数据会同步到云端，换设备也能找回。
      </p>

      <div className="grid settings-grid-2">
        <div className="field">
          <label htmlFor="account-email">邮箱</label>
          <input
            id="account-email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor="account-password">密码（至少 6 位）</label>
          <input
            id="account-password"
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="row row-wrap" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canPasswordLogin}
          onClick={() => void run(() => auth.signInWithPassword(email, password))}
        >
          登录
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canPasswordLogin}
          onClick={() => void run(() => auth.signUpWithPassword(email, password))}
        >
          注册
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!emailOk || busy}
          title="向邮箱发送一次性登录链接，无需密码"
          onClick={() => void run(() => auth.sendMagicLink(email))}
        >
          <Icon name="mail" size={14} />
          发送登录邮件
        </button>
      </div>

      <div className="account-oauth-divider">
        <span>或使用第三方账号</span>
      </div>

      <div className="row row-wrap">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(() => auth.signInWithOAuth('github'))}
        >
          使用 GitHub 登录
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(() => auth.signInWithOAuth('google'))}
        >
          使用 Google 登录
        </button>
      </div>

      {toast && (
        <p className={`settings-toast pop-in is-${toast.kind}`} style={{ marginTop: 12 }}>
          {toast.text}
        </p>
      )}
    </div>
  )
}
