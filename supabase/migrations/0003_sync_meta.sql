-- ============================================================================
-- 同步元数据：为 user_data 增加 per-item 合并所需的 meta 列。
-- 在 Supabase 控制台 → SQL Editor 里整段执行即可（可安全重复执行）。
--
-- 背景：早期同步以「一行一整段 blob」为单位、整块 last-write-wins，两端离线各改
-- 同一分片会互相覆盖（连改的是不同条目也会被清掉）。新版把集合类分片降到「按 item
-- 合并 + 墓碑」：每个 item 记一个 {u:最近修改ms, d?:删除ms}，据此做 item 级 LWW。
--
-- 存储形状（保持向后兼容）：
--   · value 列：不变，仍是该分片的完整 JSON（老客户端照常读写，无感）；
--   · meta  列：新增、可空。集合类分片存 { "<itemId>": { "u": 1699999999999,
--     "d": 1700000000000 }, ... }；单例类分片（house/settings/synth 等）留空。
-- 老客户端不认识 meta 列 → 忽略；新客户端读到 meta 为空的老行 → 按 value 现状回填。
-- ============================================================================

alter table public.user_data
  add column if not exists meta jsonb;

-- 说明：无需额外授权/RLS 变更——meta 属于既有 user_data 行，沿用 0001 的
-- user_data_owner_all 策略与 authenticated 授权；updated_at 仍由客户端写入
-- （用于 Realtime 回声过滤），逐条冲突改由 meta 里的 per-item 时间戳裁决。
