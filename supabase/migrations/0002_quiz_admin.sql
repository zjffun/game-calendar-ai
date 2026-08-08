-- ============================================================================
-- 管理后台 + 签到答题「众包题库」审核。
-- 在 Supabase 控制台 → SQL Editor 里整段执行（可与 0001 同一项目，重复执行安全）。
--
-- 两块能力：
--  1) profiles：每个用户一行，用 is_admin 标记管理员。管理后台据此放行。
--  2) quiz_questions：共享的签到答题题库。任何登录用户都能「提交新题」（自动 pending），
--     管理员「审核通过」（approved）后，所有登录用户才能在答题页搜到。
--
-- 数据边界由 Row Level Security 保证：
--  · 普通登录用户：能读到 approved 的题 + 自己提交的题；只能新增（强制 pending）。
--  · 管理员：题库全量增删改查 + 管理用户 is_admin。
-- ============================================================================

-- ---- 1. 用户档案：admin 标记 ------------------------------------------------
create table if not exists public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  email      text,
  is_admin   boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 「当前请求者是不是管理员」——SECURITY DEFINER 以属主身份执行、绕过 RLS，
-- 从而避免 profiles 策略里再查 profiles 造成的递归。
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  );
$$;

-- 读：本人可读自己；管理员可读全部（管理后台列用户用）。
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- 增：仅能为「自己」建档，且不能自封管理员（is_admin 必须 false）。
-- 供前端登录后 upsert(ignoreDuplicates) 兜底建档，即便没装下面的触发器也不影响。
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and is_admin = false);

-- 改：仅管理员可改（用于设/撤管理员）。普通用户无更新权限，无法自我提权。
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.profiles to authenticated;

-- 新用户注册时自动建档（记录 email，供管理后台展示）。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 为「触发器安装前就已存在」的用户补建档案。
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ---- 2. 共享题库：提交 + 审核 ----------------------------------------------
create table if not exists public.quiz_questions (
  id          uuid        primary key default gen_random_uuid(),
  q           text        not null,
  a           text        not null,
  status      text        not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  note        text,                                   -- 审核备注 / 驳回理由（可选）
  created_by  uuid        references auth.users (id) on delete set null,
  reviewed_by uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.quiz_questions enable row level security;

-- 读：approved 对所有登录用户可见（搜题用）；本人可见自己的提交（含 pending 状态）；
--     管理员可见全部（审核队列用）。
drop policy if exists quiz_select on public.quiz_questions;
create policy quiz_select on public.quiz_questions
  for select to authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());

-- 增：任何登录用户都能提交，但只能以「自己」的名义提交；非管理员强制 pending，
--     管理员可直接以任意状态录入（比如直接 approved）。
drop policy if exists quiz_insert on public.quiz_questions;
create policy quiz_insert on public.quiz_questions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_admin() or status = 'pending')
  );

-- 改：仅管理员（审核通过/驳回、修订题面）。
drop policy if exists quiz_update on public.quiz_questions;
create policy quiz_update on public.quiz_questions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 删：管理员可删任意；提交者可删自己「尚未审核（pending）」的提交。
drop policy if exists quiz_delete on public.quiz_questions;
create policy quiz_delete on public.quiz_questions
  for delete to authenticated
  using (public.is_admin() or (created_by = auth.uid() and status = 'pending'));

grant select, insert, update, delete on public.quiz_questions to authenticated;

create index if not exists quiz_questions_status_idx     on public.quiz_questions (status);
create index if not exists quiz_questions_created_by_idx on public.quiz_questions (created_by);

-- ---- 3. 指定第一个管理员 ----------------------------------------------------
-- 建表后，把下面这行的邮箱改成你的账号邮箱并执行一次，即可成为管理员：
--
--   update public.profiles set is_admin = true
--   where email = 'you@example.com';
--
-- 之后其余管理员可直接在应用的「管理后台 → 用户管理」里点选设置，无需再回 SQL。
