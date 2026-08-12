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
