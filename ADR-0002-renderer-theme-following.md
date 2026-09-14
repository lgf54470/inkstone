# ADR 0002: 渲染物的主题跟随与重画约定

Status: Accepted

Date: 2026-09-15

## Context

主应用的主题是一整套 CSS 变量（`src/client/styles/tokens.css`，`npm run tokens:check` + `scripts/check-token-drift.baseline.json` 守卫漂移），解析结果只写在 `document.documentElement.dataset.theme` 上。走 CSS 的渲染物切换主题时自动跟随；但有一类渲染物**不走 CSS**，它们把颜色画在别处：

1. **库把颜色写进元素的内联样式或像素**：mind-elixir 的 `changeTheme` 把十几个变量写成元素内联样式、画连接线时再把分支调色板烧进节点；Chart.js 把颜色画进 canvas；Mermaid 把主题编译进生成的 SVG。
2. **实例刻意跨重渲染存活**：预览每次提交都重建正文标记，思维导图的实例被重新挂到新占位符上，以保住相机、选中与撤销栈。存活意味着"创建时那一次"的颜色会一起被冻住。

两种情况的共同后果是一个已经被记为回归的现象：**只有刷新页面才变色**。这不是库的缺陷，而是调用方必须在主题变化时把新配色下发或重画。此前这条约定只存在于导图一处（`AGENTS.md`「富媒体块」），没有覆盖其余渲染物，也没有说明"刻意不跟随"的例外算不算遗漏。本 ADR 记录一次全量审计的结论、统一的约定与验证方式。

## Decision

### 一、审计清单（`src/client`）

**自己画颜色的渲染物：**

| 渲染物 | 颜色来源 | 主题变化时 | 机制 / 回归所在 |
| --- | --- | --- | --- |
| mind-elixir（`mindmap` 栅栏块） | 库把主题变量写成元素内联样式，并把分支调色板在画连接线时烧进节点 | 显式下发 | `MindmapHandle.applyTheme()` = `changeTheme(...)` + `linkDiv()`，`shouldRefresh=false` 以免重建节点丢相机/选中；`scripts/e2e-visual.mjs` 断言"同一画布元素 + 内联变量与分支色都变了" |
| Chart.js（`chart` 块） | 画进 canvas，文字/网格色按 `dark` 计算，签名带 `d`/`l` 前缀 | 重画 | `enhance/chart.ts` 的渲染签名；`use-preview.ts` 以 `dark: theme === 'dark'` 重跑 enhance |
| Mermaid（`mermaid` 块） | `mermaid.initialize({ theme })` 编译进 SVG，按 `dark` 分键缓存 | 重画 | `enhance/mermaid.ts`：`data-rendered` 签名含 `d`/`l`，不匹配即重渲染（命中缓存则换回原 SVG） |
| 导图静态快照（分享 / 演示 / 导出 / 嵌套笔记） | `exportSvg` 快照 | 每次用都重画，自动正确 | `mindmap/static.ts`、`presentation/deck-print.tsx` |
| 演示导出（PNG / PDF） | 导出时用 `getComputedStyle` 拷当前计算样式后栅格化 | 导出时重建，自动正确 | `presentation/deck-image.ts` |
| 图谱面板 canvas | `getComputedStyle(document.documentElement)` 读 `--text-tertiary`/`--border-strong`/`--accent`/`--text-secondary` | ❌ 不重画（见 Consequences） | `features/graph/graph-panel/canvas-draw.ts`、`canvas.tsx` |
| 音乐可视化 canvas | 每 `ACCENT_REFRESH_FRAMES` 帧重读 `--accent` | ⚠️ 动画中自愈；`prefers-reduced-motion` 下只画一帧，此后停在读到的那个 accent | `features/music/music-visualizer.tsx` |

**跟随 CSS、不需要机制**：KaTeX（唯一颜色是 `errorColor: 'var(--danger)'`）、Prism.js（只产 `.token.*` 类名，颜色在 `styles/prose/code.css` 按 `--syntax-*` 令牌给）、原生 `<video controls>` / `<audio controls>`（浏览器绘制，元素跨重渲染稳定）、组件库与设计系统组件（全走令牌，`hardcoded:check`/`tokens:check` 守卫）。

**刻意与主题无关（有理由，不是遗漏）**：二维码（`qrcode.react` 与 `share-helpers.ts` 的画布一律 `QR_FG_COLOR`/`QR_BG_COLOR` 画在白卡上——可扫性依赖稳定对比度）、DiceBear 头像（`lib/avatar.ts` 按 seed 从固定调色板取色，是身份标识而非 UI chrome，缓存后永不随主题变）、音乐封面与图片处理（画的是下载来的位图/上传前转码，与主题无关）。

### 二、统一约定

1. **能走 CSS 就走 CSS**：颜色落在令牌上，让浏览器完成切换；只有库把颜色烤进 DOM/SVG/canvas 时才需要下面的机制。
2. **解析后的主题只有一个来源**：`document.documentElement.dataset.theme`。需要它的组件用 `MutationObserver` 订阅（范式见 `features/preview/use-preview.ts`、`features/presentation/presentation-theme.ts`、`features/preview/pinned-windows-layer.tsx`），不要读设置里的偏好（`system` 不是最终答案）。
3. **显式下发优先于重建**：实例跨重渲染存活的地方，主题变化必须下发给活着的实例；能只改颜色就只改颜色，绝不为了换色重建实例、丢相机/选中/撤销栈/正在编辑的节点。
4. **库只认"创建时参数"时，按主题分键渲染**，并让签名/键参与缓存判定（Chart.js、Mermaid 的做法），使"同键命中、异键重画"成为唯一路径。
5. **自己读 `getComputedStyle` 的画面，要么每次绘制都读，要么把主题放进重画的依赖里**。读一次就缓存进绘制循环的，等价于把主题冻在创建时刻。
6. **快照/导出路径每次用都重画**，不跨主题缓存图。
7. **刻意不跟随主题的产物必须在代码里写明理由**，否则下一个人会把它当遗漏来"修"。
8. **验证按渲染物分两类，且都必须同时断言元素没被重建**：库把颜色写成内联样式的，断言"同一元素 + 内联颜色变量变了"；画进画布的，断言像素变了。"颜色变了"与"实例还在"是同一件事的两半，缺一半就会把"重建一次"当成修好了。
9. **归口**：这类断言属浏览器门禁——思维导图的跟随与配色选择器在 `scripts/e2e-visual.mjs`，外壳与面板的对比度/axe 在 `scripts/check-contrast.mjs`，纯逻辑判定（体自带优先、注解解析、写入补丁）在 `src/client/lib/markdown/mindmap/*.test.ts`。

## Consequences

- **已知缺口：图谱面板 canvas 不跟随主题**（本次审计发现，未在本次修复）。`canvas-draw.ts` 的 `readThemeColors()` 用 `getComputedStyle` 读一次令牌，`canvas.tsx` 的 `useGraphCanvasLoop` 在 effect 首帧把结果交给 `createGraphTicker`，而 effect 依赖是 `[data, fitGraph, prefs.*]`——不含主题；`features/graph` 全目录没有出现 `theme`/`dark`，即没有任何订阅入口。
- **复现证据**（Puppeteer，1440×900，账号主题设为"跟随系统"后翻转系统偏好，画布像素按步长采样求和）：

  | | `--text-tertiary` | `--border-strong` | canvas 像素采样和 |
  | --- | --- | --- | --- |
  | 浅色 | `oklch(50% 0.009 265)` | `oklch(20% 0.01 265 / 17%)` | 33174 |
  | 切到深色后 | `oklch(70% 0.009 265)` | `oklch(100% 0 0 / 17%)` | 33174（逐字节一致） |

  令牌已翻转而画布像素完全相同，说明这次主题变化没有触发任何一次重绘。
- **修复方向**：仿照 `use-preview.ts` 订阅主题，把主题作为 `useGraphCanvasLoop` 的依赖并重新 `readThemeColors()`；由于这条 effect 会重建布局（`buildInitialLayout`），重跑时应只换调色板、保留节点坐标与相机，或改为在 ticker 内按需重读颜色。修完的回归必须是浏览器断言：切主题后**同一张 canvas 元素**的像素发生变化。
- **音乐可视化是次要缺口**：它在动画循环里每 N 帧重读一次 `--accent`，所以只在 `prefers-reduced-motion`（单帧绘制）下可能停在旧色；这属于可接受范围，本轮不改，但改这个组件时不要去掉那次重读。
- **本文档与 `AGENTS.md` 的关系**：`AGENTS.md`「设计令牌位置」一节只保留一句指针（清单与约定以本 ADR 为准），避免规范文件继续膨胀。
