// ============================================================================
// 管理后台（仅管理员可见，入口在侧边栏/移动端顶栏）。
//  · 题库：审核队列（待审核/已通过/已驳回/全部）、通过/驳回、编辑题面、删除、直接新增。
//  · 用户：列出所有用户，设/撤管理员。
// 所有数据操作走 store/quizStore（Supabase + RLS），普通用户看不到此页。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  adminAddQuestion,
  adminCountByStatus,
  adminDeleteQuestion,
  adminListQuestions,
  adminListUsers,
  adminSetStatus,
  adminSetUserAdmin,
  adminUpdateQuestion,
  useQuizCloud,
  type QuizActionResult,
} from '../../store/quizStore'
import type { AdminUser, QuizQuestion, QuizStatus } from '../../types'
import Icon from '../common/Icon'
import { appConfirm } from '../common/ConfirmDialog'
import './Admin.css'

interface Toast {
  text: string
  kind: 'ok' | 'err'
}

const STATUS_META: Record<QuizStatus, { label: string; badge: string }> = {
  pending: { label: '待审核', badge: 'badge-warn' },
  approved: { label: '已通过', badge: 'badge-ok' },
  rejected: { label: '已驳回', badge: 'badge-danger' },
}

type QFilter = QuizStatus | 'all'
const FILTERS: { id: QFilter; label: string }[] = [
  { id: 'pending', label: '待审核' },
  { id: 'approved', label: '已通过' },
  { id: 'rejected', label: '已驳回' },
  { id: 'all', label: '全部' },
]

export default function AdminPanel() {
  const { isAdmin, ready } = useQuizCloud()
  const [section, setSection] = useState<'quiz' | 'users'>('quiz')

  if (!ready) {
    return (
      <section className="stack admin-page">
        <h2 className="section-title">管理后台</h2>
        <p className="muted small">正在加载…</p>
      </section>
    )
  }

  if (!isAdmin) {
    return (
      <section className="stack admin-page">
        <h2 className="section-title">管理后台</h2>
        <div className="card pad-lg">
          <p className="muted small" style={{ margin: 0 }}>
            你不是管理员，无权访问管理后台。如需权限，请让现有管理员在「用户管理」里把你设为管理员。
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="stack admin-page">
      <div>
        <h2 className="section-title">管理后台</h2>
        <p className="muted small">
          审核用户提交的签到答题、维护共享题库，并管理管理员。审核通过的题会并入答题页的搜索与识别。
        </p>
      </div>

      <div className="admin-tabs">
        <button
          className={`chip${section === 'quiz' ? ' active' : ''}`}
          onClick={() => setSection('quiz')}
        >
          <Icon name="quiz" size={14} />
          题库审核
        </button>
        <button
          className={`chip${section === 'users' ? ' active' : ''}`}
          onClick={() => setSection('users')}
        >
          <Icon name="shield" size={14} />
          用户管理
        </button>
      </div>

      {section === 'quiz' ? <QuizAdmin /> : <UserAdmin />}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 题库审核
// ---------------------------------------------------------------------------

function QuizAdmin() {
  const [filter, setFilter] = useState<QFilter>('pending')
  const [items, setItems] = useState<QuizQuestion[]>([])
  const [counts, setCounts] = useState<Record<QuizStatus, number> | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const timerRef = useRef<number | null>(null)

  const flash = useCallback((t: Toast, delay = 3500) => {
    setToast(t)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setToast(null), delay)
  }, [])
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const loadCounts = useCallback(() => {
    void adminCountByStatus()
      .then(setCounts)
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await adminListQuestions(filter === 'all' ? undefined : filter)
      setItems(list)
    } catch (err) {
      flash({ text: err instanceof Error ? err.message : '加载失败', kind: 'err' })
    } finally {
      setLoading(false)
    }
  }, [filter, flash])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    loadCounts()
  }, [loadCounts])

  // 执行一个改动动作后：反馈 + 重新拉列表与角标
  const run = useCallback(
    async (action: () => Promise<QuizActionResult>, okText?: string) => {
      const res = await action()
      if (res.ok) {
        if (okText) flash({ text: okText, kind: 'ok' })
      } else {
        flash({ text: res.message ?? '操作失败', kind: 'err' })
      }
      if (res.ok) {
        await load()
        loadCounts()
      }
      return res.ok
    },
    [flash, load, loadCounts],
  )

  return (
    <div className="stack">
      <AddQuestionForm
        refresh={() => {
          void load()
          loadCounts()
        }}
        flash={flash}
      />

      <div className="admin-filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip${filter === f.id ? ' active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {counts && f.id !== 'all' && (
              <span className="admin-count">{counts[f.id as QuizStatus]}</span>
            )}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => { void load(); loadCounts() }} disabled={loading}>
          <Icon name="rotate" size={13} className={loading ? 'spin' : undefined} />
          刷新
        </button>
      </div>

      {toast && <div className={`settings-toast pop-in is-${toast.kind}`}>{toast.text}</div>}

      {loading && items.length === 0 ? (
        <p className="muted small">加载中…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          {filter === 'pending' ? '没有待审核的题目。' : '这里还没有题目。'}
        </div>
      ) : (
        <ul className="admin-list">
          {items.map((it) => (
            <QuestionRow key={it.id} item={it} run={run} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AddQuestionForm({
  refresh,
  flash,
}: {
  refresh: () => void
  flash: (t: Toast) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [approved, setApproved] = useState(true)
  const [busy, setBusy] = useState(false)

  const canSave = q.trim() && a.trim() && !busy

  async function submit() {
    if (!canSave) return
    setBusy(true)
    try {
      const res = await adminAddQuestion(q, a, approved)
      if (res.ok) {
        setQ('')
        setA('')
        flash({ text: approved ? '已新增并通过。' : '已新增（待审核）。', kind: 'ok' })
        refresh()
      } else {
        flash({ text: res.message ?? '新增失败', kind: 'err' })
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="btn btn-sm admin-add-toggle" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        新增题目
      </button>
    )
  }

  return (
    <div className="card admin-add">
      <div className="field">
        <label htmlFor="admin-add-q">题目</label>
        <textarea
          id="admin-add-q"
          className="textarea"
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="题目原文"
        />
      </div>
      <div className="field">
        <label htmlFor="admin-add-a">答案</label>
        <input
          id="admin-add-a"
          className="input"
          value={a}
          onChange={(e) => setA(e.target.value)}
          placeholder="正确答案"
        />
      </div>
      <label className="admin-check">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        直接通过（不勾选则进入待审核）
      </label>
      <div className="row row-wrap">
        <button className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={!canSave}>
          保存
        </button>
        <button className="btn btn-sm" onClick={() => setOpen(false)} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  )
}

function QuestionRow({
  item,
  run,
}: {
  item: QuizQuestion
  run: (action: () => Promise<QuizActionResult>, okText?: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState(item.q)
  const [a, setA] = useState(item.a)

  async function saveEdit() {
    const ok = await run(() => adminUpdateQuestion(item.id, { q, a }), '已保存修改。')
    if (ok) setEditing(false)
  }

  async function del() {
    const ok = await appConfirm(`确定删除这道题吗？\n「${item.q}」`)
    if (ok) void run(() => adminDeleteQuestion(item.id), '已删除。')
  }

  const meta = STATUS_META[item.status]

  if (editing) {
    return (
      <li className="admin-item">
        <div className="field">
          <label>题目</label>
          <textarea className="textarea" rows={2} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label>答案</label>
          <input className="input" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        <div className="row row-wrap admin-item-actions">
          <button className="btn btn-primary btn-sm" onClick={() => void saveEdit()}>
            保存
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setQ(item.q)
              setA(item.a)
              setEditing(false)
            }}
          >
            取消
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="admin-item">
      <div className="admin-item-head">
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        <span className="admin-item-time">{new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
      </div>
      <div className="admin-item-q">{item.q}</div>
      <div className="admin-item-a">
        <Icon name="check" size={14} />
        {item.a}
      </div>
      {item.note && <div className="admin-item-note">备注：{item.note}</div>}
      <div className="row row-wrap admin-item-actions">
        {item.status !== 'approved' && (
          <button
            className="btn btn-sm btn-tonal"
            onClick={() => void run(() => adminSetStatus(item.id, 'approved'), '已通过，全员可搜到。')}
          >
            <Icon name="check" size={13} />
            通过
          </button>
        )}
        {item.status !== 'rejected' && (
          <button
            className="btn btn-sm"
            onClick={() => void run(() => adminSetStatus(item.id, 'rejected'), '已驳回。')}
          >
            <Icon name="x" size={13} />
            驳回
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setEditing(true)}>
          <Icon name="pencil" size={13} />
          编辑
        </button>
        <button className="btn btn-sm btn-danger" onClick={() => void del()}>
          <Icon name="trash" size={13} />
          删除
        </button>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// 用户管理
// ---------------------------------------------------------------------------

function UserAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  function flash(t: Toast, delay = 3500) {
    setToast(t)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setToast(null), delay)
  }
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await adminListUsers())
    } catch (err) {
      flash({ text: err instanceof Error ? err.message : '加载失败', kind: 'err' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(u: AdminUser) {
    if (u.isAdmin) {
      const ok = await appConfirm(`确定取消 ${u.email ?? u.id} 的管理员权限吗？`)
      if (!ok) return
    }
    setBusyId(u.id)
    try {
      const res = await adminSetUserAdmin(u.id, !u.isAdmin)
      if (res.ok) {
        flash({ text: u.isAdmin ? '已取消管理员。' : '已设为管理员。', kind: 'ok' })
        await load()
      } else {
        flash({ text: res.message ?? '操作失败', kind: 'err' })
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack">
      <div className="admin-filter">
        <span className="muted small">共 {users.length} 个用户</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => void load()} disabled={loading}>
          <Icon name="rotate" size={13} className={loading ? 'spin' : undefined} />
          刷新
        </button>
      </div>

      {toast && <div className={`settings-toast pop-in is-${toast.kind}`}>{toast.text}</div>}

      {loading && users.length === 0 ? (
        <p className="muted small">加载中…</p>
      ) : users.length === 0 ? (
        <div className="empty">还没有用户记录。</div>
      ) : (
        <ul className="admin-list">
          {users.map((u) => (
            <li key={u.id} className="admin-user">
              <div className="admin-user-info">
                <span className="admin-user-email">
                  {u.email ?? <span className="muted">（无邮箱）</span>}
                  {u.isAdmin && <span className="badge badge-ok admin-user-tag">管理员</span>}
                </span>
                <span className="admin-user-id">
                  加入于 {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <button
                className={`btn btn-sm${u.isAdmin ? ' btn-danger' : ' btn-tonal'}`}
                disabled={busyId === u.id}
                onClick={() => void toggle(u)}
              >
                {u.isAdmin ? '取消管理员' : '设为管理员'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
