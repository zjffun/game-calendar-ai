import { useCallback, useEffect, useState } from 'react'

/**
 * 把一段状态持久化到 localStorage 的通用 Hook。
 *
 * - 初始化时尝试从 localStorage 读取；失败或为空则用 `initialValue`。
 * - 每次更新自动写回 localStorage。
 * - 支持跨标签页同步（监听 storage 事件）。
 * - setValue 同时支持「新值」和「更新函数」两种写法（与 useState 一致）。
 *
 * @param key   localStorage 键名（建议使用 src/types.ts 的 STORAGE_KEYS）
 * @param initialValue 默认值（localStorage 为空时使用）
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
): [T, (value: T | ((prev: T) => T)) => void] {
  const readInitial = useCallback((): T => {
    const fallback =
      typeof initialValue === 'function'
        ? (initialValue as () => T)()
        : initialValue
    try {
      const raw = window.localStorage.getItem(key)
      if (raw == null) return fallback
      return JSON.parse(raw) as T
    } catch (err) {
      console.warn(`[useLocalStorage] 读取 "${key}" 失败，使用默认值`, err)
      return fallback
    }
    // initialValue 仅用于首帧，无需进入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const [value, setValue] = useState<T>(readInitial)

  // 写回 localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (err) {
      console.warn(`[useLocalStorage] 写入 "${key}" 失败`, err)
    }
  }, [key, value])

  // 跨标签页同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return
      if (e.newValue == null) return
      try {
        setValue(JSON.parse(e.newValue) as T)
      } catch {
        /* 忽略非法 JSON */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue(next)
  }, [])

  return [value, set]
}
