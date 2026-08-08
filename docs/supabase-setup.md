# 云同步（Supabase）接入说明

本应用是纯前端网页应用（Vite 构建的静态站点，部署在 GitHub Pages）。默认「纯本地」运行；
配置 Supabase 后即启用**登录 + 多设备数据同步**。未配置时一切照旧，不影响构建与离线使用。

同步范围：待办、种子、副本、房屋、设置、角色、自定义攻略与补充、物价条目/备注/观测，
以及「我的补充」里的图片（存 user_images 表）。

> 部署架构：静态站点（GitHub Pages）+ 托管后端（Supabase），浏览器直连 Supabase 的 REST/Auth。
> 无需自建服务器，也**无需更换部署方式**。

---

## 一、创建项目并建表

1. 到 [supabase.com](https://supabase.com) 注册并新建一个项目（免费档即可）。
2. 打开 **SQL Editor**，把 [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) 整段粘贴执行。
   - 会创建 `user_data` / `user_images` 两张表并开启 **Row Level Security**：每个用户只能读写自己的数据。
   - 若弹出 “Potential issue detected”（因含 `drop policy if exists`），确认执行即可。
3. （可选，多设备实时同步）执行文件末尾被注释的这行，开启 Realtime：
   ```sql
   alter publication supabase_realtime add table public.user_data;
   ```
   不开也能用，只是换设备后要刷新页面才拉到最新（图片本就在登录/刷新时拉取）。

## 二、配置前端环境变量（本地开发）

Supabase 控制台 → **Project Settings → API Keys**，取两处值：

| 取值 | 环境变量 |
| --- | --- |
| Project URL（形如 `https://xxxx.supabase.co`） | `VITE_SUPABASE_URL` |
| **anon**（Legacy anon, JWT）密钥 | `VITE_SUPABASE_ANON_KEY` |

> 说明：新版 `sb_publishable_…` 密钥当前不被 GoTrue 鉴权端点接受，故用 **Legacy anon（JWT）** 密钥
> —— 它以 `eyJ…` 开头，与 supabase-js 全兼容。两个值都是「可公开」的前端配置，安全边界是数据库 RLS。

在项目根目录把 `.env.example` 复制为 `.env` 并填入（`.env` 已被 `.gitignore` 忽略）：

```bash
cp .env.example .env
# 然后编辑 .env 填入上面两个值
```

重启 dev server 生效。

## 三、配置登录方式

Supabase 控制台 → **Authentication**：

- **邮箱 + 密码**：默认已开启。开发期可在 Sign In / Providers → Email 里关掉 "Confirm email"
  以免每次注册都要收验证邮件（上线建议开启）。
- **Magic Link（邮件登录）**：属于 Email provider，默认可用。
- **GitHub / Google OAuth**：在 Providers 里分别开启，填入各自平台申请的 Client ID / Secret；
  把 Supabase 给出的回调地址填到 GitHub/Google 应用里。
- **URL Configuration → Redirect URLs / Site URL**：把要用的网页地址加进白名单：
  - 本地：`http://localhost:5173`
  - 线上：你的 GitHub Pages 地址（见下）
  邮件链接与 OAuth 回跳都会校验这个白名单。

## 四、部署到 GitHub Pages（无需更换部署方式）

GitHub Pages 只托管静态文件，浏览器直接连 Supabase，因此**继续用 GitHub Pages 即可**。
唯一要注意：`VITE_*` 变量在**构建时**被内联进产物，而 `.env` 不入库，所以要把这两个值提供给 CI 构建：

1. 仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加两个 secret：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   （已在 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 的 Build 步骤注入。不加则线上退回纯本地模式。）
2. 把线上地址加入 Supabase 的 **Redirect URLs / Site URL**（第三步），否则线上的 Magic Link / OAuth 回跳会被拒。
3. 推送到 `main` 触发部署即可。

## 五、合并 / 冲突策略（简述）

- **首次登录**：以云端为准写回本地；云端还没有的分片则把本地推上去
  （因此第一次启用不会丢数据——那时云端本来是空的）。
- **登录后**：本地文本改动防抖上传；其它设备改动经 Realtime 下行，按分片
  **最后写入胜出**（updated_at 比较）。图片按 id 一次写入、增删即时同步，换设备在登录/刷新时拉取。
- 已知取舍：登出状态下的离线改动，下次登录可能被云端较新数据覆盖。

## 六、免费额度注意

- 免费项目**连续 7 天无请求会自动暂停**，控制台点一下即可恢复。
- 免费账号最多 2 个活跃项目；数据库 500MB、文件存储 1GB、5 万 MAU，足够本应用使用。
- 图片以 base64 存在 `user_images`（占数据库额度）；若日后截图很多撑满 500MB，可再迁到 Supabase Storage（1GB）。

## 七、管理后台 + 签到答题「众包题库」

在原有云同步之上，新增了「用户提交签到答题 → 管理员审核 → 全员可搜」的共享题库，
以及一个应用内的**管理后台**（仅管理员可见，入口在侧边栏底部 / 移动端顶栏的盾牌图标）。

### 1. 建表

打开 **SQL Editor**，把 [`supabase/migrations/0002_quiz_admin.sql`](../supabase/migrations/0002_quiz_admin.sql)
整段粘贴执行。会创建两张表并开启 RLS：

| 表 | 用途 | 关键策略 |
| --- | --- | --- |
| `profiles` | 每个用户一行，`is_admin` 标记管理员 | 本人可读自己；管理员可读/改全部；用户无法自我提权 |
| `quiz_questions` | 共享题库（`pending`/`approved`/`rejected`） | 任何登录用户可提交（强制 pending）；approved 对所有登录用户可读；改/删仅管理员（提交者可撤回自己 pending 的） |

脚本还会：给新注册用户自动建 `profiles` 档案（触发器），并为已有用户补建档案。

### 2. 指定第一个管理员

建表后，在 SQL Editor 执行一次（把邮箱换成你的账号）：

```sql
update public.profiles set is_admin = true
where email = 'you@example.com';
```

之后其余管理员**无需再回 SQL**——直接在应用「管理后台 → 用户管理」里点选设置即可。

### 3. 使用

- **普通登录用户**：答题页底部「补充题目」填题目 + 答案提交，状态为「待审核」，可在「我的提交」里撤回。
- **管理员**：管理后台
  - **题库审核**：按「待审核 / 已通过 / 已驳回 / 全部」筛选，可通过、驳回、编辑题面、删除，也可直接新增（可选直接通过）。
  - **用户管理**：列出所有用户，一键设/撤管理员。
- 审核**通过**的题会并入答题页的关键词搜索与选窗口 OCR 识别（与内置题库合并、按题目去重）。

> 说明：内置只读题库（`data/quizBank`）继续离线可用、对所有人生效；众包题库是**登录后**的增量层
> （RLS 限定 `authenticated` 可读），未登录用户搜到的仍是内置题。
