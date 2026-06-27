// ============================================================================
// 角色管理条：增加 / 重命名 / 删除角色。
// 添加角色后，每条待办会按角色分别勾选；不加角色时按单人处理。
// ============================================================================

import { useState } from 'react'
import { useCharacters } from '../../store/useAppStore'

export default function CharacterBar() {
  const { characters, add, rename, remove } = useCharacters()

  const [newName, setNewName] = useState('')
  const [err, setErr] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function submitAdd() {
    const name = newName.trim()
    if (!name) return
    if (!add(name)) {
      setErr(`已存在角色「${name}」`)
      return
    }
    setNewName('')
    setErr('')
  }

  function confirmRemove(id: string, name: string) {
    if (window.confirm(`删除角色「${name}」？该角色在所有待办里的完成记录会一并清除。`)) {
      remove(id)
    }
  }

  function startEdit(id: string, current: string) {
    setEditingId(id)
    setEditName(current)
  }

  function commitEdit() {
    if (editingId && editName.trim()) rename(editingId, editName)
    setEditingId(null)
    setEditName('')
  }

  return (
    <div className="card char-bar">
      <div className="card-head">
        <span className="glyph" aria-hidden>
          👥
        </span>
        <h3>角色（{characters.length}）</h3>
        <span className="muted small">
          {characters.length === 0
            ? '未添加角色＝按单人记录。添加角色后可分别勾选每个角色'
            : '主框＝全部角色完成；下方可单独勾选每个角色'}
        </span>
      </div>

      <div className="char-list">
        {characters.map((c) =>
          editingId === c.id ? (
            <span className="char-chip editing" key={c.id}>
              <input
                className="char-edit-input"
                value={editName}
                autoFocus
                maxLength={12}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') {
                    setEditingId(null)
                    setEditName('')
                  }
                }}
              />
            </span>
          ) : (
            <span className="char-chip" key={c.id}>
              <button
                type="button"
                className="char-chip-name"
                title="点击重命名"
                aria-label={`重命名角色 ${c.name}`}
                onClick={() => startEdit(c.id, c.name)}
              >
                {c.name}
              </button>
              <button
                type="button"
                className="char-chip-del"
                title={`删除角色「${c.name}」`}
                aria-label={`删除角色 ${c.name}`}
                onClick={() => confirmRemove(c.id, c.name)}
              >
                ✕
              </button>
            </span>
          ),
        )}

        <div className="char-add">
          <input
            className="input char-add-input"
            value={newName}
            maxLength={12}
            placeholder="新角色名，如 大号 / 二号"
            onChange={(e) => {
              setNewName(e.target.value)
              if (err) setErr('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd()
            }}
          />
          <button className="btn btn-gold btn-sm" onClick={submitAdd} disabled={!newName.trim()}>
            ＋ 添加角色
          </button>
        </div>
      </div>

      {err && (
        <p className="char-err small" role="alert">
          {err}
        </p>
      )}
    </div>
  )
}
