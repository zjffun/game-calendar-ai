# 项目约定 / 坑

给「梦幻西游 · 游戏日历」维护者与 AI 的速查约定。功能与架构见 [README.md](README.md)。

## CSS

### 带图标的输入框：左内边距必须提高特异性，否则图标与文字重叠

全局 `.input`（`src/index.css`）用的是 **`padding` 简写**（`padding: 7px 10px`），
它会展开成 `padding-left: 10px`。若在组件里用同级选择器写 `.xxx-search { padding-left: 34px }`，
两者特异性都是 `(0,1,0)`，谁在样式表里靠后谁生效 —— 一旦 CSS 打包/引入顺序变化，
简写就会盖掉 `padding-left`，图标就压到 placeholder 文字下面（俗称「图标重叠」）。

**约定：** 凡是「输入框 + 绝对定位图标」的搜索框，给 input 的左/右内边距用
**后代选择器**提高特异性到 `(0,2,0)`，稳定压过全局简写：

```css
/* ✅ 正确：.xxx-search-wrap 包住 input，用后代选择器 */
.price-search-wrap .price-search { padding-left: 34px; }

/* ❌ 错误：与 .input 同特异性，靠源码顺序决定，脆弱 */
.price-search { padding-left: 34px; }
```

已按此约定处理的搜索框：`Price`（物价，`.price-search-wrap .price-search`）、
`Quiz`（`.quiz-search-wrap .quiz-search`）、`Guide`（攻略）。新增带图标输入框时照此办理。

## Service Worker（PWA）

### sw.js 的构建期占位符：注释里别再出现同名 token，注入用 `replaceAll`

`public/sw.js` 里的 `__SW_VERSION__` / `__SW_PRECACHE__` 由
`scripts/gen-web-manifest.mjs` 在 `pnpm build` 末尾替换成真实值（版本 + 预缓存清单）。
**坑：** 若在文件顶部注释里也写了这两个 token，`String.replace()`（只换第一处）
会把**注释里**的占位符当成目标替换掉，真正的代码行仍是占位符 —— SW 运行时
`__SW_PRECACHE__ is not defined`，安装即失败且**静默**（构建日志照样打印「stamped」）。

**约定：** 注释里只用「版本 / 清单」这类描述词，别出现字面 token；gen 脚本用
`replaceAll` 注入，替换后校验 `/__SW_[A-Z]+__/` 无残留，有则 `exit(1)` 让构建报错。

### 部署基路径：所有同源引用走 `import.meta.env.BASE_URL`，别写绝对 `/`

线上部署在子路径 `/game-calendar-ai/`（GitHub Pages）。SW 注册、`version.json`
拉取、manifest 的 `start_url`/`scope`/图标全用相对 `./` 或 `import.meta.env.BASE_URL`
拼接；写死绝对 `/version.json`、`/sw.js` 会解析到站点根而 404（`webUpdate.ts` 曾踩此坑）。

## 云同步（Supabase）

数据按登录用户隔离：一个 storageKey 分片 ⇄ `user_data(user_id, key, value, meta, updated_at)`
表里的一行（主键 `user_id,key`）。隔离由 **RLS** 保证（`0001_init.sql` 的
`using/​with check (auth.uid() = user_id)`，且仅授权 `authenticated` 角色）——前端持 anon key
也只能读写自己的行。未登录 = 纯本地（localStorage / IndexedDB），不上云。

### 新增「参与同步的分片」要同时动 5 处，漏 `SYNCED_KEYS` 会静默不同步

给一个 slice 开启云同步，除了 `src/types.ts` 里 `STORAGE_KEYS` 建键，还必须同步改：

1. `useAppStore.ts` `readAllSlices()` —— 全量拉取合并时要能读到它
2. `useAppStore.ts` `applyExternalUpdate()` —— 云端 / 它端改动要能落回这个 slice
3. `syncMerge.ts` `STRATEGY` —— 归为 `itemArray` / `itemMap` / `whole`（决定合并粒度）
4. `cloudSync.ts` `SYNCED_KEYS` —— **三条同步入口的总闸**：`handleLocalCommit`（上行 outbox）、
   `pullAndMerge`（全量）、`handleRealtime`（实时下行）都先 `SYNCED_KEYS.includes(key)` 才放行

**坑：** 漏第 4 步最阴 —— slice 照样 `setSlice` 落 localStorage，本地刷新还在、看着像「好了」，
但三个方向全被闸掉，**永不上云也不下发，且无任何报错**。`guideTags`（攻略标签）就漏过这行、
静默不同步。

**约定：** `SYNCED_KEYS` 必须与 `readAllSlices` / `applyExternalUpdate` 覆盖一致（该数组上方注释即此意）；
新增 / 改动同步分片后，对着这 4 处逐条核一遍。

此外若要它在「设置 → 同步详情」面板里现身，还需在 `SyncDetailsPanel.tsx` 的
`KEY_LABELS`（行的标签，兼日志友好名）/ `valueByKey`（条目计数与展开）/ `itemName`
（逐条名字回查）三处补上。纯展示，漏了不影响同步本身，只是面板不列该分片、日志里显原始
storageKey（`guideTags` 就漏过这三处）。
