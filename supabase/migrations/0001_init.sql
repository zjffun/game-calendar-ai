-- ============================================================================
-- 云同步初始化：每用户的键值数据 + 图片。
-- 在 Supabase 控制台 → SQL Editor 里整段执行即可。
-- 数据隔离完全由 Row Level Security 保证：前端持 anon key 也只能读写自己的行。
-- ============================================================================

-- ---- 文本数据：一行 = 一个 storageKey 的 JSON 值 ----
create table if not exists public.user_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null,          -- 应用的 storageKey，如 'mhxy.todos.v1'
  value      jsonb       not null,          -- 该分片的完整 JSON 值
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_data enable row level security;

drop policy if exists "user_data_owner_all" on public.user_data;
create policy "user_data_owner_all"
  on public.user_data
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- 图片：一行 = 一张图片（base64 data URL），与 markdown 里的 img:<id> 对应 ----
create table if not exists public.user_images (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  id         text        not null,          -- 图片 id（与 IndexedDB key 一致）
  data_url   text        not null,          -- base64 data URL
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.user_images enable row level security;

drop policy if exists "user_images_owner_all" on public.user_images;
create policy "user_images_owner_all"
  on public.user_images
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- 授予 Data API（PostgREST）的 authenticated 角色访问权 ----
-- 若项目关闭了「Automatically expose new tables」，新表默认无授权、无法经 REST 访问，
-- 这两行显式补上；开着也无副作用。只授权登录用户，匿名用户无权访问（配合上面的 RLS）。
grant select, insert, update, delete on public.user_data   to authenticated;
grant select, insert, update, delete on public.user_images to authenticated;

-- 说明：updated_at 由客户端在每次 upsert 时显式写入（用于「最后写入胜出」的合并
-- 与 Realtime 回声过滤），故此处不加自动刷新触发器，以免覆盖客户端时间戳。

-- ---- 开启 Realtime 多设备实时下行：把文本表加入 supabase_realtime 发布 ----
-- 其它设备的文本改动会实时下行、逐条合并（图片仍在登录/刷新时拉取）。客户端订阅早已就绪
-- （cloudSync.subscribeRealtime），未发布时静默不生效。幂等：已加入则跳过，可安全重复执行。
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_data'
  ) then
    alter publication supabase_realtime add table public.user_data;
  end if;
end $$;
