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
