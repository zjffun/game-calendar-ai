# 梦幻西游 · 游戏日历

一个面向《梦幻西游》玩家的本地游戏日历 / 日常清单网页应用。所有数据保存在浏览器
`localStorage`，**不上传任何服务器**，可随时在「设置」里导出 / 导入备份。

> React 18 + TypeScript + Vite，纯前端、零后端、零账号。

## ✨ 功能

顶级导航只保留 **概览 / 待办 / 攻略** 三个入口；庭院、副本、房屋作为子页从概览卡片进入，
设置收在侧边栏底部（移动端在顶栏齿轮）。

| 模块 | 入口 | 说明 |
| --- | --- | --- |
| **概览** | 主导航 | 首页仪表盘：问候语 + 今日日期 + 距每日刷新；聚合今日待办进度、种子状态、待打副本、房屋状态，点击卡片进入对应子页 |
| **待办** | 主导航 | 每日 / 每周 / 每月 三类 TODO；多角色分别勾选；内置常用任务一键添加；支持自定义、编辑、删除；**跨天 / 跨周 / 跨月自动重置**，并显示距下次刷新倒计时 |
| **攻略** | 主导航 | 内置副本 / 神器 / 奇遇 / 看戏攻略，支持搜索、自定义攻略与「我的补充」（Markdown + 截图，仅存本机） |
| **庭院** | 概览 → 庭院种子 | 二级 / 三级 / 四级种子真实生长周期（结果时间轴、今日养护）与自定义单次倒计时 |
| **副本** | 概览 → 副本进度 | 天命（每 4 天）/ 每日 / 每周副本刷新倒计时；标记「本周期已完成」；「本期需完成」目标统计；预设一键添加、筛选、分组 |
| **房屋** | 概览 → 房屋状态 | 洁净度 / 耐久随时间衰减，低于阈值提示；按佣人房等级打扫 / 修理；衰减速率与阈值可调 |
| **设置** | 侧边栏底部 | 周期重置点、存储用量、数据导出 / 导入 / 清空、版本与网页更新 |

## 🏗️ 架构

数据层与展示层分离，每个功能模块是独立组件，共享同一个数据源：

```
src/
├── types.ts                 # 全局类型契约 + localStorage Key
├── store/useAppStore.ts     # 单一数据源（useSyncExternalStore），自动持久化、跨标签页同步
├── hooks/
│   ├── useLocalStorage.ts   # 通用持久化 Hook
│   └── useNow.ts            # 秒级刷新时钟（驱动所有倒计时）
├── utils/
│   ├── time.ts             # 周期 Key / 下次刷新 / 倒计时格式化
│   ├── house.ts            # 洁净度 / 耐久 衰减计算
│   └── id.ts
├── data/gameData.ts         # 预设：常用任务 / 种子 / 副本 / 默认房屋与设置
├── components/
│   ├── common/Icon.tsx      # 全站统一的描边 SVG 图标
│   ├── Overview/  Todo/  Courtyard/  Dungeon/  House/  Guide/  Settings/
├── App.tsx                  # 外壳：侧边栏导航 + 子页 + 移动端底部导航
└── index.css / App.css      # 设计系统（暖米白 + 单一陶土强调色，极简风）
```

**两个关键设计：**

1. **完成状态用「周期 Key」表达**，而非布尔值。勾选完成时记录当前周期 Key（如每日
   `2026-06-20`、每周 `W2026-06-15`、每月 `2026-06`）；渲染时与当前周期 Key 比较，
   不相等即视为未完成 —— 因此跨天 / 跨周 / 跨月会**自动重置**，无需任何定时任务。
2. **单一数据源** 通过 `useSyncExternalStore` 实现，任意模块的修改即时同步到所有视图
   （包括概览仪表盘），并自动写入 `localStorage`。

## 🚀 运行

本项目使用 [pnpm](https://pnpm.io/)（可通过 `corepack enable` 一键启用）：

```bash
pnpm install
pnpm dev           # 本地开发：http://localhost:5173
pnpm build         # 生产构建（tsc + vite）输出到 dist/
pnpm preview       # 预览生产构建
```

> 也可用 npm（`npm install && npm run dev`），但 CI 与锁文件以 pnpm 为准。

## 🌐 部署

推送到 `main` 会触发 [GitHub Actions](.github/workflows/deploy.yml) 自动构建并部署到
**GitHub Pages**：<https://zjffun.github.io/game-calendar-ai/>

## 📱 安装 / 离线（PWA）

站点是 PWA，可「添加到主屏幕」当作 App 用：Chrome / Edge 在地址栏点安装图标，
iOS Safari 用「分享 → 添加到主屏幕」。

- **离线可用**：首次联网访问后，应用外壳（页面 + JS/CSS + 图标）由 Service Worker
  预缓存，浏览过的攻略图片按需缓存，之后断网也能打开。
- **自动更新**：每次部署内容有变 → `sw.js` 版本随之变化 → 下次访问自动拉取新版并清理旧缓存。
- 云同步、OCR 语言模型仍需联网。

Service Worker（`public/sw.js`，无 Workbox 依赖）与图标、`manifest.webmanifest` 都在
`public/`；版本与预缓存清单在 `pnpm build` 末尾由 `scripts/gen-web-manifest.mjs` 注入。
开发模式（`pnpm dev`）不注册 SW，避免干扰热更新。

## 📝 说明

- 种子生长时长、副本刷新周期、房屋衰减速率等**数值均为合理默认值，可在界面中调整**，
  以适配不同服务器 / 版本。
- 时间按**本地时区**计算；游戏每日 / 每周重置点可在「设置」中修改。
