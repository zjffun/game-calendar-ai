import { useEffect, useState } from 'react'

/**
 * 返回一个会随时间自动更新的「当前时间」（epoch 毫秒）。
 * 用于所有倒计时组件，保证秒级刷新。
 *
 * @param intervalMs 刷新间隔，默认 1000ms（每秒）
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
