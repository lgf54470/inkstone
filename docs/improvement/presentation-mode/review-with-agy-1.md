# Inkstone 笔记 App「演示模式」全方位深度审查报告 (Antigravity · 2026-09-30)

> **审查对象**：全笔记演示模式系统（`src/client/features/presentation` 及相关联动模块）  
> **审查领域**：设计规范合规性（`AGENTS.md`）、视觉美感与信息架构、交互操作体验、主流竞品横向对齐（Obsidian / Logseq / Marp / Slidev）、端到端性能瓶颈与潜在隐患、安全性与系统鲁棒性。  
> **文档目的**：详细记录每个问题的**具体文件路径、涉及函数/Hook/组件、现状代码片段、根本原因机制、具体修复方案与建议代码**。后发开发者无需通读全局源代码，即可直接按图索骥开展重构与修复。

---

## 零、前序调查审查与纠偏审计 (Challenge & Corrections)

在对源码进行逐行比对后，澄清了若干常见误判，并挖掘出更为底层的架构缺陷：

| 编号 | 常见假定/误判点 | 代码真实现状 (Ground Truth) | 纠偏结论与深度真相 |
| :--- | :--- | :--- | :--- |
| **REV-01** | CSS 动效未做 `prefers-reduced-motion` 适配。 | `src/client/styles/tokens.css#L416-L423` 与 `src/client/styles/motion.css#L246-L258` 全局重置了 CSS 动效。 | CSS 层已防御。**真正的缺陷在 Canvas/JS 层**：`src/client/features/presentation/slide-canvas.tsx#L190` 中 Chart.js 的 `instantCharts` 放映时固定为 `false`，未读取系统减弱动画偏好；HUD 自动隐藏亦未提供时长调节选项。 |
| **REV-02** | 开合侧栏导致“预热线程从第 0 页重新全量量测”。 | `src/client/features/presentation/slide-preflight.tsx#L226` 中 `usePassRestart` 重启 Token 为 `${deckLength}:${fingerprint}:${dark}`，**完全不包含尺寸**。 | **危害远甚于重新量测**：开合侧栏时，`cacheKeys` 生成全新宽高后缀（如 `1168x723`），但预热队列 `done.current` **并未重置**。预热线程认为已测过不再重测，导致旧尺寸缓存成为幽灵，前台索取新尺寸缓存发生**永久缓存未命中（Cache Miss）**，图表和增强元素闪烁或回退为纯文本！ |
| **REV-03** | 侧栏缩略图完全未做视口优化。 | `src/client/features/presentation/slide-rail.tsx#L173` 存在 `useNearViewport`，非可视区不渲染 Prose DOM。 | 缩略图有视口门限，但**性能瓶颈在于**：每个列表项独立创建 `new IntersectionObserver()`（100 页即 100 个实例）；且每个列表项均调用 `useSyncExternalStore(subscribeSlideHtml)`，任一页预热完成都会引发全量组件广播唤醒（惊群效应）。 |
| **REV-04** | 控制条隐藏后无 A11y 隐患。 | `src/client/features/presentation/presentation-controls.tsx#L36` 仅施加 `opacity-0 pointer-events-none`。 | 隐藏后未加 `visibility: hidden` 或 `inert`，键盘 Tab 键依然会聚焦到看不见的按钮上，产生“焦点盲跳”，屏幕阅读器依然会读取幽灵元素。 |
| **REV-05** | 快捷键拦截机制完备。 | `src/client/features/presentation/presentation-keys.ts#L35-L43` 中 `f/s/l` 未校验 `context.onControl`。 | 幻灯片内若有输入框或弹窗，用户输入字母 `f`、`s`、`l` 时按键被吞，并意外触发全屏、侧栏或快照冻结。此外，左右方向键未对侧栏列表焦点进行隔离。 |
| **REV-06** | 侧栏已有完整导航体验。 | `src/client/features/presentation/slide-rail.tsx#L180-L202` 仅渲染 0.11 比例缩略图与序号。 | 20 页以上长篇演说无法通过文字大纲快速扫视定位，仅凭微小缩微图识别效率极低。 |
| **REV-07** | 导出具备常规加载状态。 | `src/client/features/presentation/deck-print.tsx#L80-L86` 离屏排队等待至多 8 秒无反馈。 | 点击导出后界面处于冻结空白状态，无进度条，易引发重复连击与高分辨率位图累积 OOM 崩溃。 |

---

## 一、模块架构与核心文件定位

Inkstone 全笔记演示模式位于 `src/client/features/presentation` 目录：

1. **入口与生命周期容器**：
   - 文件：`src/client/features/presentation/presentation-overlay.tsx`
   - 核心组件：`PresentationOverlay`、`PresentationDialog`、`PresentationStage`
   - 核心 Hook：`usePresentationSession`、`useFullscreenToggle`、`useDialogBehavior`、`useChromeAutoHide`
2. **键盘事件路由**：
   - 文件：`src/client/features/presentation/presentation-keys.ts`
   - 核心函数：`presentationCommand(key: string, context: PresentationKeyContext)`
   - 联动 Hook：`src/client/features/presentation/use-presentation-keys.ts`
3. **舞台度量与自适应**：
   - 文件：`src/client/features/presentation/slide-stage.ts`
   - 核心函数：`measureStage(stageWidth, stageHeight)`
   - 核心 Hook：`useStageMetrics`
4. **悬浮控制条与状态指示**：
   - 文件：`src/client/features/presentation/presentation-controls.tsx`
   - 核心组件：`PresentationControls`、`SlideStepper`、`SlideProgress`
5. **幻灯片画布渲染与分页**：
   - 文件：`src/client/features/presentation/slide-canvas.tsx`
   - 核心组件：`SlideViewport`、`SlideCanvas`
   - 核心 Hook：`useSlideLayout`、`useSlideDiagrams`
   - 辅助组件：`src/client/features/presentation/slide-prose.tsx` (`SlideProse`)
6. **左侧大纲缩略图栏**：
   - 文件：`src/client/features/presentation/slide-rail.tsx`
   - 核心组件：`SlideRail`、`SlideRailList`、`SlideRailItem`、`SlideThumb`
   - 核心 Hook：`useRailKeyboard`、`useNearViewport`
7. **离屏后台度量预热（Preflight）**：
   - 文件：`src/client/features/presentation/slide-preflight.tsx`
   - 核心组件：`SlidePreflight`
   - 核心 Hook：`usePreflightPass`、`usePassRestart`
8. **打印与导出**：
   - 文件：`src/client/features/presentation/deck-print.tsx`
   - 核心函数：`saveDeckPages`、`useDeckSheetReady`
9. **全局状态机**：
   - 文件：`src/client/store/presentation.ts`
   - 核心状态：`usePresentation` (`open`, `noteId`, `title`, `snapshot`, `following`, `start`, `stop`)

---

## 二、全量问题深度诊断（含具体文件、函数与代码定位）

### P-01 (SEC-01): 全局快捷键劫持表单字符输入 (`F/S/L`)
- **涉及文件**：`src/client/features/presentation/presentation-keys.ts`
- **涉及函数**：`presentationCommand(key: string, context: PresentationKeyContext)`
- **现有代码**：
  ```ts
  case 'f':
  case 'F':
    return 'fullscreen'
  case 'l':
  case 'L':
    return 'follow'
  case 's':
  case 'S':
    return 'slideList'
  ```
- **问题机制**：
  `presentation-keys.ts` 中 `f/F`、`s/S`、`l/L` 忽略了 `context.onControl`。如果幻灯片中含有用户交互控件（如内嵌 input、可编辑块、弹出的评论或搜索输入框），当焦点在输入框中时，用户输入字母 `f`、`s`、`l`，按键事件在 `use-presentation-keys.ts` 中被 `event.preventDefault()` 吞没，并意外触发全屏切换、侧栏开合或快照冻结。
- **修复方案**：
  为 `f/F`、`s/S`、`l/L` 增加 `if (context.onControl) return null;` 守卫条件：
  ```ts
  case 'f':
  case 'F':
    return context.onControl ? null : 'fullscreen'
  case 'l':
  case 'L':
    return context.onControl ? null : 'follow'
  case 's':
  case 'S':
    return context.onControl ? null : 'slideList'
  ```

---

### P-02 (UX-05): Escape 键粗暴销毁整场演说退出
- **涉及文件**：`src/client/features/presentation/presentation-overlay.tsx`
- **涉及函数/Hook**：`useDialogBehavior` (L298-L302) 与 `useFullscreenToggle` (L444-L480)
- **现有代码**：
  ```ts
  function useDialogBehavior(open: boolean, panelRef: RefObject<HTMLDivElement | null>, onClose: () => void): void {
    useEscape(open, onClose)
    useLockScroll(open)
    useDialogFocus(open, panelRef, panelRef)
  }
  ```
- **问题机制**：
  在全屏放映模式下，用户按 `Escape` 键，`useEscape` 优先捕获并直接执行 `onClose()`，导致整场演说直接退出关闭，退回编辑器。主流演说软件（如 PowerPoint, Keynote, Marp, Slidev）的心智模型是：全屏状态下按 Esc 先退出全屏（变为窗口化放映，便于多任务切换或单窗口屏幕共享），窗口化状态下再次按 Esc 才退出演示。
- **修复方案**：
  在 `useDialogBehavior` 中区分全屏态与窗口态：全屏态下按 Esc 触发退出全屏；仅在非全屏态（窗口态）下按 Esc 才调用 `onClose()`。
  ```ts
  function useDialogBehavior(
    open: boolean,
    panelRef: RefObject<HTMLDivElement | null>,
    isFullscreen: boolean,
    toggleFullscreen: () => void,
    onClose: () => void,
  ): void {
    const handleEscape = useCallback(() => {
      if (isFullscreen) {
        toggleFullscreen()
      } else {
        onClose()
      }
    }, [isFullscreen, toggleFullscreen, onClose])
    useEscape(open, handleEscape)
    useLockScroll(open)
    useDialogFocus(open, panelRef, panelRef)
  }
  ```

---

### P-03 (PERF-01 / REV-02): 侧栏开合导致尺寸突变与缓存永久失效死锁（核心架构缺陷）
- **涉及文件**：
  1. `src/client/features/presentation/slide-stage.ts` 中的 `measureStage` (L36-L48)
  2. `src/client/features/presentation/presentation-overlay.tsx` (L200-L203)
  3. `src/client/features/presentation/slide-preflight.tsx` (L226)
- **现有代码**：
  ```ts
  // slide-stage.ts
  export function measureStage(stageWidth: number, stageHeight: number): StageMetrics {
    if (stageWidth < 1 || stageHeight < 1) return FALLBACK_METRICS
    const scale = Math.min(stageWidth / SLIDE_DESIGN_WIDTH, stageHeight / SLIDE_DESIGN_HEIGHT)
    const designWidth = clamp(stageWidth / scale, SLIDE_DESIGN_WIDTH, MAX_DESIGN_WIDTH)
    const designHeight = clamp(stageHeight / scale, SLIDE_DESIGN_HEIGHT, MAX_DESIGN_HEIGHT)
    return { scale, designWidth, designHeight, contentWidth: designWidth - SLIDE_PAD_X * 2, contentHeight: designHeight - SLIDE_PAD_Y * 2 }
  }
  
  // presentation-overlay.tsx
  const cacheKeys = useMemo(
    () => deck.map((_, item) => slideCacheKey({ fingerprint, dark, index: item, contentWidth: metrics.contentWidth, contentHeight: metrics.contentHeight })),
    [deck, fingerprint, dark, metrics.contentWidth, metrics.contentHeight],
  )
  
  // slide-preflight.tsx
  usePassRestart(`${deckLength}:${fingerprint}:${dark}`, restart, idle)
  ```
- **问题机制**：
  1. `slide-stage.ts` 动态计算 `designWidth` 与 `designHeight`。用户点击侧栏展开/收起时，舞台宽高改变，导致 `metrics.contentWidth` 和 `metrics.contentHeight` 发生变化。
  2. `cacheKeys` 生成全新后缀（如 `...:1168x723` 变成 `...:1168x632`）。
  3. 后台预热线程 `slide-preflight.tsx` 的重启 Token 仅为 `${deckLength}:${fingerprint}:${dark}`，**不包含尺寸**。因此预热线程的 `done.current` 集合保留着历史索引，认为已经测量完毕，不会重新触发预热。
  4. 最终导致：预热好的 HTML 全部留在旧尺寸 key 下，前台索取新尺寸 key 发生**永久缓存未命中（Cache Miss）**，复杂的 Mermaid 图表与 Chart.js 发生反复销毁与重算闪烁，或者回退到无样式的空白占位。
- **修复方案**：
  遵循主流幻灯片系统（PowerPoint / Marp / Slidev）的固定画幅设计：
  - 将幻灯片设计画幅严格固定为标准 16:9 坐标系：`designWidth = 1280`, `designHeight = 720`。
  - `contentWidth = 1280 - 56 * 2 = 1168`, `contentHeight = 720 - 44 * 2 = 632`，成为常量。
  - `measureStage` 仅计算适应舞台容器的等比缩放比率 `scale = Math.min(stageWidth / 1280, stageHeight / 720)`，居中显示黑边（letterbox/pillarbox）。
  - 彻底解耦 `slideCacheKey` 与视口物理尺寸的依赖！无论侧栏开合还是浏览器窗口缩放，`cacheKey` 永远恒定，预热缓存 100% 命中，动效与图表零闪烁。

---

### P-04 (UX-04): 舞台点击与移动端轻扫手势响应缺失
- **涉及文件**：`src/client/features/presentation/presentation-overlay.tsx`
- **涉及组件**：`PresentationStage` (L128-L140)
- **现有代码**：
  ```ts
  function PresentationStage({ stageRef, session }: { stageRef: RefObject<HTMLDivElement | null>; session: PresentationSession }) {
    return (
      <div ref={stageRef} className='relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden'>
        <SlideViewport ... />
      </div>
    )
  }
  ```
- **问题机制**：
  舞台背景仅负责排版居中，没有任何鼠标点击、触控或轻扫响应。站立演讲者使用鼠标点击、遥控器或触摸屏时，无法通过点击屏幕左右半区前进后退，也无法在触控板或手机上轻扫翻页。
- **修复方案**：
  在 `PresentationStage` 上添加鼠标分区点击与手势识别：
  - 点击左侧 35% 区域调用 `goPrev()`，点击右侧 65% 区域调用 `goNext()`（如果点击的是交互控件如超链接则不触发）。
  - 支持触摸轻扫（`pointerdown` / `pointerup` 判断水平位移差）。

---

### P-05 (UX-01 / UX-02): 舞台核心信息真空与进度条连带被抹去
- **涉及文件**：
  1. `src/client/features/presentation/presentation-overlay.tsx` (L88-L91)
  2. `src/client/features/presentation/presentation-controls.tsx` (L112-L124)
- **现有代码**：
  ```ts
  // presentation-controls.tsx
  export function SlideProgress({ index, count, chromeHidden }: { index: number; count: number; chromeHidden: boolean }) {
    return (
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[var(--border-subtle)] transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]',
          chromeHidden && 'opacity-0',
        )}
        aria-hidden='true'
      >
        <div className='h-full bg-[var(--accent)] transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]' style={{ width: `${Math.round(((index + 1) / count) * 100)}%` }} />
      </div>
    )
  }
  ```
- **问题机制**：
  1. 底部 2px 进度条本为环境感知型非侵入元素，却绑定了 `chromeHidden && 'opacity-0'`。2.6 秒无鼠标操作后，进度条同控制条一并消失。
  2. 舞台四个角落无任何页码提示，观众在提问环节无法获知当前页码，演讲者无法感知进度。
- **修复方案**：
  1. 解耦 `SlideProgress` 与 `chromeHidden`，使其在放映时常驻于屏幕底部（极简 2px 细线）。
  2. 在舞台角落（例如右下角或左下角）提供半透明微型页码徽标（如 `04 / 28`），鼠标移开时依然以极低透明度优雅保留或供演讲者感知。

---

### P-06 (SPEC-05): Follow/Freeze 按钮图标与激活状态认知倒置
- **涉及文件**：`src/client/features/presentation/presentation-controls.tsx` (L29, L46-L50)
- **现有代码**：
  ```ts
  const followLabel = following ? t('workspace.presentation_freeze') : t('workspace.presentation_follow')
  ...
  <Tooltip label={followLabel} side='top'>
    <IconButton label={followLabel} size='sm' active={following} onClick={onToggleFollowing}>
      {following ? <Snowflake size={14} /> : <Radio size={14} />}
    </IconButton>
  </Tooltip>
  ```
- **问题机制**：
  当 `following`（正在跟随编辑、实时广播）为 true 时，按钮呈现高亮激活态，图标却显示为雪花（`<Snowflake />`），Tooltip 提示“冻结”。在通用心智模型中，“高亮显示雪花”意味着“当前已被冻结”，造成严重认知反差。
- **修复方案**：
  纠偏状态认知：
  - 跟随中（`following === true`）：图标显示广播脉冲 `<Radio size={14} />`，按钮为 `active` 高亮态，Tooltip 说明“正在实时跟随编辑（点击冻结快照）”。
  - 已冻结（`following === false`）：图标显示雪花 `<Snowflake size={14} />`，按钮为常规未激活态，Tooltip 说明“演示已冻结（点击恢复跟随）”。

---

### P-07 (SPEC-03): 控制条自动隐藏时未移出 Tab 键顺序（盲跳焦点隐患）
- **涉及文件**：`src/client/features/presentation/presentation-controls.tsx` (L31-L38)
- **现有代码**：
  ```ts
  <div
    data-presentation-chrome
    className={cn(
      'absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]',
      'transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]',
      chromeHidden && 'pointer-events-none opacity-0',
    )}
  >
  ```
- **问题机制**：
  `chromeHidden` 仅设置了 `opacity-0` 和 `pointer-events-none`，按钮节点依然驻留在无障碍渲染树与键盘 Tab 遍历顺序中。键盘用户在放映时按 Tab 键，焦点会落在完全隐形的按钮上，屏幕阅读器会莫名读出幽灵按钮，严重违背 A11y 规范。
- **修复方案**：
  在 `chromeHidden` 为 true 时，容器设置 `inert={chromeHidden ? true : undefined}` 以及 `invisible`（对应 CSS `visibility: hidden`），确保不可见元素彻底移出键盘焦点序列与读屏软件。

---

### P-08 (SPEC-02): 自动分排子页翻页时读屏软件保持静默
- **涉及文件**：`src/client/features/presentation/presentation-controls.tsx` 中的 `SlideStepper` (L92-L107)
- **现有代码**：
  ```ts
  <span aria-live='polite' className='tabular min-w-14 text-center text-[length:var(--text-12)] text-[var(--text-secondary)]'>
    {slideIndex + 1} / {slideCount}
  </span>
  ...
  {pageCount > 1 && (
    <span
      className='tabular mr-1 rounded-[var(--r-full)] bg-[var(--accent-soft)] px-[var(--sp-2)] py-0.5 text-[length:var(--text-11)] text-[var(--accent)]'
      title={t('workspace.presentation_page_of', { value0: subPage + 1, value1: pageCount })}
    >
      {subPage + 1}/{pageCount}
    </span>
  )}
  ```
- **问题机制**：
  主页码 `{slideIndex + 1} / {slideCount}` 包含 `aria-live='polite'`，但长内容自动分排的子页微标 `{subPage + 1}/{pageCount}` 只是一个独立的静态 `<span>`。用户在一个超长 Slide 的多个子页之间翻动时，主页码数值不变，读屏器保持绝对静默，视障用户完全无法感知内容正在翻页滚动。
- **修复方案**：
  为子页徽标加上 `aria-live='polite'`，或将整体页码统一包裹在 live region 中：
  ```tsx
  {pageCount > 1 && (
    <span
      aria-live='polite'
      className='tabular mr-[var(--sp-1)] rounded-[var(--r-full)] bg-[var(--accent-soft)] px-[var(--sp-2)] py-[var(--sp-0-5)] text-[length:var(--text-11)] text-[var(--accent)]'
      title={t('workspace.presentation_page_of', { value0: subPage + 1, value1: pageCount })}
    >
      {subPage + 1}/{pageCount}
    </span>
  )}
  ```

---

### P-09 (SEC-02): 超链接原生跳转导致演讲跳出与地址栏污染
- **涉及文件**：`src/client/features/presentation/slide-prose.tsx` 与 `slide-canvas.tsx`
- **问题机制**：
  Markdown 渲染出的内部或外部链接未做拦截沙箱保护。点击普通外部链接直接在当前全屏窗口导航跳出，打断整场演示；点击双链 WikiLink 或锚点链接触发 `href="#"` 导致地址栏 URL 哈希突变与跳顶。
- **修复方案**：
  在 `SlideCanvas` 挂载事件代理，监听幻灯片容器内部 `<a>` 点击事件：
  - 拦截默认导航 `event.preventDefault()`。
  - 外部链接安全使用 `window.open(url, '_blank', 'noopener,noreferrer')` 打开新标签页，不打乱主屏。
  - 站内双链做轻量提示或弹窗预览，禁止页面跳出。

---

### P-10 (FEAT-05): 黑屏 (B) 与白屏 (W) 口头互动控制缺失
- **涉及文件**：
  1. `src/client/features/presentation/presentation-keys.ts`
  2. `src/client/features/presentation/presentation-overlay.tsx`
  3. `src/client/features/presentation/use-presentation-keys.ts`
- **问题机制**：
  演讲过程中，演讲者常需要暂停幻灯片视觉焦点，让观众注意力转移到讲者本人的口头互动上。行业标准快捷键为 `B` 键黑屏（Blackout）、`W` 键白屏（Whiteout）。目前按 `B`/`W` 没有任何响应。
- **修复方案**：
  1. 在 `presentation-keys.ts` 注册 `'blackout' | 'whiteout'` 命令。
  2. 在 `presentation-overlay.tsx` 中维护 `screenCover: 'black' | 'white' | null` 状态。
  3. 当按下 `B` 时切换黑屏遮罩，按 `W` 时切换白屏遮罩，按任意按键恢复正常展示。

---

### P-11 (UX-03): 高危导出按钮混排在控制条中间易误触
- **涉及文件**：`src/client/features/presentation/presentation-controls.tsx` (L56-L65)
- **现有代码**：
  ```ts
  <Tooltip label={t('workspace.presentation_export')} side='top'>
    <IconButton label={t('workspace.presentation_export')} size='sm' onClick={onExport}>
      <Download size={14} />
    </IconButton>
  </Tooltip>
  <Tooltip label={t('workspace.presentation_export_images')} side='top'>
    <IconButton label={t('workspace.presentation_export_images')} size='sm' onClick={onExportImages}>
      <Images size={14} />
    </IconButton>
  </Tooltip>
  ```
- **问题机制**：
  导出 PDF 与导出 ZIP 图片的按钮紧挨全屏和关闭按钮（间距仅 2px）。演讲者在现场全屏状态下用鼠标寻找退出或翻页按钮时，极易误触导出 PDF，导致浏览器直接弹出原生打印遮罩，现场体验极为尴尬。
- **修复方案**：
  将导出 PDF 和图片收敛进“更多（More）”二级下拉菜单，或者将其移至侧边栏顶部/控制条右端，增加安全间距与防误触缓冲。

---

### P-12 (UX-06): 侧栏缺少大纲标题文本
- **涉及文件**：`src/client/features/presentation/slide-rail.tsx` (L180-L202)
- **现有代码**：
  ```tsx
  <button ...>
    <span ...>{entryIndex + 1}</span>
    <SlideThumb ... />
  </button>
  ```
- **问题机制**：
  列表项仅渲染一个微缩至 0.11 的超小缩略图与序号数字。超过 15~20 页的大型演说中，所有缩略图文字均缩为模糊色块，演讲者无法通过肉眼辨别具体幻灯片章节，导航定位极其低效。
- **修复方案**：
  提取每个 Slide 的首个有效 Heading（H1/H2/H3）或第一行正文作为 Slide 简短标题，在缩略图右侧或下方以清晰的文字大纲形式呈现，支持扫视检索。

---

### P-13 (UX-07 / REV-05): 侧栏获焦时左右方向键穿透全局触发翻页
- **涉及文件**：`src/client/features/presentation/presentation-keys.ts` (L18-L23) 与 `src/client/features/presentation/slide-rail.tsx` (L107-L127)
- **现有代码**：
  ```ts
  case 'ArrowRight':
  case 'PageDown':
    return 'next'
  case 'ArrowLeft':
  case 'PageUp':
    return 'prev'
  case 'ArrowDown':
    return context.onSlideList ? null : 'next'
  case 'ArrowUp':
    return context.onSlideList ? null : 'prev'
  ```
- **问题机制**：
  `ArrowDown` 和 `ArrowUp` 校验了 `context.onSlideList ? null : ...`，但 `ArrowRight` 和 `ArrowLeft` 未做隔离。当用户在侧栏列表中使用方向键时，若误触左右键，全局舞台会翻页，而侧栏焦点未同步移动，导致舞台与列表焦点错位。
- **修复方案**：
  在 `presentation-keys.ts` 或 `useRailKeyboard` 中统一管理列表导航按键，避免非预期的焦点穿透。

---

### P-14 (SPEC-01): 设计令牌混用裸 Tailwind 尺寸（违背 AGENTS.md 铁律 4/12）
- **涉及文件**：`src/client/features/presentation/presentation-controls.tsx`
- **问题机制**：
  代码中混用了裸 Tailwind 阶梯数值：
  - `p-1` (L34) 违规，应为 `p-[var(--sp-1)]`
  - `mx-1`、`h-4` (L40) 违规，应为 `mx-[var(--sp-1)] h-[var(--sp-4)]`
  - `py-0.5` (L102) 违规，应为 `py-[var(--sp-0-5)]`
  - `h-0.5` (L116) 违规，应为 `h-[2px]` 或令牌高度
- **修复方案**：
  全面遵照项目规范替换为 `var(--sp-*)` 设计令牌。

---

### P-15 (SPEC-04): 侧栏缺少复合 ARIA 语义声明
- **涉及文件**：`src/client/features/presentation/slide-rail.tsx` (L82-L104, L181-L201)
- **问题机制**：
  外层使用 `<nav>`，内部项目使用 `tabIndex={active ? 0 : -1}` 漫游焦点与 `aria-current`，但未声明复合列表角色（如 `role="tablist"` / `role="tab"` 或 `role="listbox"` / `role="option"`），无障碍辅助工具无法播报列表项在集合中的位置关系（如 "第 3 项，共 20 项"）。
- **修复方案**：
  补充标准 ARIA 集合语义，规范键盘可达性。

---

### P-16 (SPEC-06 / REV-01): Canvas/JS 层忽略减弱动画偏好
- **涉及文件**：`src/client/features/presentation/slide-canvas.tsx` (L55, L72, L190)
- **现有代码**：
  ```ts
  export function SlideCanvas({ ..., instantCharts = false }: SlideCanvasProps) {
    ...
    useSlideDiagrams(hostRef, html, dark, markDiagramsRendered, instantCharts)
  }
  ```
- **问题机制**：
  `instantCharts` 在正常放映时硬编码为 `false`。虽然 CSS 动效已被全局 `tokens.css` 重置，但 Chart.js 是 JS/Canvas 动效，依旧在放映时播放完整入场动画。在系统开启 `prefers-reduced-motion: reduce` 时，图表仍会进行繁复的缩放旋转动效，可能引发前庭功能障碍用户的不适。
- **修复方案**：
  检测 `window.matchMedia('(prefers-reduced-motion: reduce)').matches`，当用户开启减弱动画偏好时，强制将 `instantCharts` 设为 `true`。

---

### P-17 (FEAT-07): 从当前光标所在位置就近启动演示
- **涉及文件**：
  1. `src/client/features/workspace/workspace/use-workspace.ts` (L309-L313)
  2. `src/client/store/presentation.ts` (L20, L33)
  3. `src/client/features/presentation/slides.ts`
- **问题机制**：
  目前点击演示模式按钮时，始终强制从第 0 页开始：
  ```ts
  function useStartPresentation(note: NotesState['notes'][string] | null | undefined, content: string): () => void {
    return useCallback(() => {
      if (note) usePresentation.getState().start({ noteId: note.id, content, title: note.title })
    }, [note, content])
  }
  ```
  在编辑长篇笔记（如 50 页）时，用户每次想要预览正在编辑的某张幻灯片，都必须从第 0 页重新翻 40 次，效率极其低下。
- **修复方案**：
  1. 在 `slides.ts` 中提供 `slideIndexAtOffset(source: string, offset: number): number` 工具函数。
  2. 获取 CodeMirror 编辑器当前光标行/偏移量，计算出当前编辑的 Slide 索引。
  3. 在 `usePresentation.getState().start({ ..., initialSlideIndex })` 中传入该索引，使演示模式就近从当前正在撰写的幻灯片启动。

---

### P-18 (PERF-02): 跟随模式协同打字时全篇推倒重测雪崩
- **涉及文件**：`src/client/features/presentation/presentation-overlay.tsx` (L407-L418)
- **现有代码**：
  ```ts
  function useSlidePlans(fingerprint: string) {
    const [plans, setPlans] = useState<Record<number, SlidePlan>>({})
    useEffect(() => {
      setPlans({})
    }, [fingerprint])
    ...
  }
  ```
- **问题机制**：
  协同编辑或本地跟随打字时，全篇笔记的 `fingerprint` 改变，导致所有幻灯片的 `SlidePlan` 被整齐清空为 `{}`，预热线程从第 0 页开始从头量测。若一篇长文有 30 页，每次打字都会引发全篇重测风暴。
- **修复方案**：
  为每个 Slide 建立独立的子指纹（`hashContent(slideSource)`）。当某页正文内容未改变时，坚决复用其缓存与已测 Plan，仅对内容变更的 Slide 进行增量失效。

---

### P-19 (PERF-03 / REV-03): 侧栏多 Observer 实例与广播惊群效应
- **涉及文件**：`src/client/features/presentation/slide-rail.tsx` (L177, L260-L272)
- **现有代码**：
  ```ts
  const cached = useSyncExternalStore(subscribeSlideHtml, () => readSlideHtml(cacheKey)?.html ?? '', () => '')
  ...
  function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
    ...
    const observer = new IntersectionObserver(...)
    observer.observe(element)
    ...
  }
  ```
- **问题机制**：
  1. 100 张幻灯片的列表会创建 100 个 `IntersectionObserver` 实例，浪费浏览器内部资源。
  2. 全局只有一个 `subscribeSlideHtml` 事件通道，后台预热线程每完成 1 页，就触发一次广播，导致 100 个 `SlideRailItem` 同时被唤醒执行 `useSyncExternalStore` 回调，产生惊群效应。
- **修复方案**：
  1. 侧栏顶层使用单例共享的 `IntersectionObserver`。
  2. 订阅机制优化为带 Key 的精准订阅，单页量测完成仅通知关联的该页缩略图。

---

### P-20 (PERF-04 / REV-07): 导出 PDF/图片缺乏进度反馈且长篇存在 OOM 风险
- **涉及文件**：`src/client/features/presentation/deck-print.tsx` (L91-L108, L138-L148)
- **现有代码**：
  ```ts
  for (const [index, page] of pages.entries()) {
    images.push({ path: `...`, blob: await renderDeckPagePng(page, geometry, css) })
  }
  saveDeckImages(await zipDeckImages(images), `...`)
  ```
- **问题机制**：
  1. 长达数十页的高清幻灯片渲染为 2K/4K 物理分辨率 PNG，所有 Blob 同时常驻于 `images` 数组中，极易打爆移动端或轻薄本的可用内存，触发浏览器 OOM 崩溃。
  2. 导出过程中界面没有任何进度条指示，用户以为卡死会重复点击。
- **修复方案**：
  1. 增加导出进度弹窗/Toast 实时展示 `正在导出 (3/30)...`。
  2. 串行分批挂载和流式生成，减轻瞬时内存峰值。

---

### P-21 (SEC-03): 嵌套 Bento-Slides 代码块卡死在 Loading 状态
- **涉及文件**：`src/client/features/presentation/slide-canvas.tsx`
- **问题机制**：
  若用户的笔记中包含 ` ```slides ` 围栏块（Bento-Slides 块），全笔记演示模式中并没有挂载 Bento-Slides 的运行时激活逻辑，导致这些代码块在投影大屏上永久停留在 "Loading slides..." 静态占位态。
- **修复方案**：
  在 `SlideCanvas` 中对 Bento-Slides 代码块提供优雅降级：直接提取 Bento 卡片内容渲染为静态卡片网格，或者展示整洁的静态预览。

---

### P-22 (SEC-04): 命令面板（Cmd+K / Cmd+P）缺少演示模式入口
- **涉及文件**：`src/client/features/command/command-palette/use-commands.tsx`
- **问题机制**：
  `currentNoteCommands` 包含了“生成 Slides 提纲”（`cmd-slides-from-outline`），却没有直接“启动演示模式”命令。键盘流用户在调起命令面板后无法快捷呼出演示。
- **修复方案**：
  在 `currentNoteCommands` 中注册 `cmd-presentation-mode`，执行 `usePresentation.getState().start(...)`。

---

### P-23 (FEAT-01): 切分规则仅限水平线 `---`，无法智能切分长笔记
- **涉及文件**：`src/client/features/presentation/slides.ts`
- **问题机制**：
  目前只识别显式的水平分割线 `---`（且必须上方有空行）。对于普通的长篇 Markdown 笔记（包含大量 H1 / H2 章节），直接打开演示模式会把整篇笔记塞进单张超长 Slide，生成几十个子页，无法形成幻灯片视觉。
- **修复方案**：
  支持智能分页检测：如果整篇笔记没有任何 `---` 分隔符，或者在 Frontmatter 中声明了 `slide-level: 2`，则自动按照最高级标题（H1 或 H2）切分为独立幻灯片。

---

### P-24 (FEAT-03): 演讲私有备注语法支持 (`<!-- note: ... -->`)
- **涉及文件**：`src/client/features/presentation/slide-html.ts`
- **修复方案**：
  在 HTML 渲染流水线中抽取 `<!-- note: ... -->` 注释内容，正文展示时剔除该块，但将其作为 Slide 的 Speaker Notes 元数据留存。

---

### P-25 (FEAT-04): 虚拟激光笔 (Laser Pointer) 与聚光灯工具
- **涉及文件**：`src/client/features/presentation/presentation-overlay.tsx`
- **修复方案**：
  支持快捷键 `L` 切换激光笔模式。激活后隐藏系统鼠标箭头，在画布最上层绘制高亮红光微粒与移动拖尾，便于投影引导。

---

### P-26 (FEAT-06): 全局幻灯片全览网格矩阵 (Overview Grid)
- **涉及文件**：新增 `src/client/features/presentation/slide-overview-grid.tsx`
- **修复方案**：
  支持快捷键 `G` 或 `O` 展开全屏响应式网格矩阵，呈现所有幻灯片缩略卡片，支持键盘方向键聚焦和回车跳转，方便问答互动。

---

### P-27 (FEAT-08): 封面居中版式与两栏对比排版
- **涉及文件**：`src/client/features/presentation/slide-prose.tsx`
- **修复方案**：
  支持 `<!-- layout: cover -->` 或分栏语法，使首页标题与副标题自动居中排版。

---

### P-28 (FEAT-02): 独立演讲者双屏模式 (Presenter View)
- **涉及文件**：`src/client/features/presentation/presenter-view/*`
- **修复方案**：
  通过 `window.open` 弹出独立窗口作为第二屏控制台，借助 `BroadcastChannel` 同步页码、备注、时钟与下一页预览。

---

## 三、全景综合整改优先级矩阵 (100% 全量收敛)

| 领域分类 | 问题编号 | 问题现象与缺陷描述 | 具体改造方案 | 涉及文件与模块 | 修改代价 | 优先级 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **安全与鲁棒性** | **P-01** | 全局快捷键劫持表单字符输入 (`F/S/L`) | 补齐 `if (context.onControl) return null;` 守卫条件 | `presentation-keys.ts` | 极小（~5 行） | **P0 (立刻修复)** |
| **交互与体验** | **P-02** | Escape 键直接销毁整场演说退出 | 全屏放映时优先退出全屏；窗口态下再次按 Esc 才退出 | `presentation-overlay.tsx` | 小（~15 行） | **P0 (立刻修复)** |
| **性能与架构** | **P-03** | 侧栏开合导致尺寸突变与缓存永久失效死锁 | 画布设计尺寸固定为 `1280x720`，容器由 CSS `scale()` 自适应居中，解耦 CacheKey 尺寸依赖 | `slide-stage.ts`<br>`presentation-overlay.tsx` | 中（~40 行） | **P0 (核心架构)** |
| **交互与体验** | **P-04** | 舞台点击与移动端轻扫手势缺失 | 左右半区点击（左 35% 后退，右 65% 前进）、触摸手势识别 | `presentation-overlay.tsx` | 小（~45 行） | **P1 (基础体验)** |
| **视觉与信息** | **P-05** | 舞台核心信息缺失（页码、进度条连带隐藏） | 舞台角落常驻微型页码指示（`04/28`）；解耦细线进度条使之常驻 | `presentation-overlay.tsx`<br>`presentation-controls.tsx` | 中（~60 行） | **P1 (演说核心)** |
| **规范与合规** | **P-06** | Follow/Freeze 按钮图标与激活态认知倒置 | 修正为：跟随中高亮脉冲 `<Radio />`；冻结后不高亮显示 `<Snowflake />` | `presentation-controls.tsx` | 极小（~10 行） | **P1 (直觉一致)** |
| **规范与 A11y** | **P-07** | 自动隐藏控件未移出 Tab 键顺序（盲跳隐患） | `chromeHidden` 为 true 时，容器设置 `inert` 属性或切换 `visibility: hidden` | `presentation-controls.tsx` | 小（~10 行） | **P1 (A11y 红线)** |
| **规范与 A11y** | **P-08** | 溢出自动子页翻页读屏软件静默无声 | 将子页微标 `{subPage + 1}/{pageCount}` 纳入 `aria-live='polite'` 区域 | `presentation-controls.tsx` | 极小（~8 行） | **P1 (A11y 红线)** |
| **安全与鲁棒性** | **P-09** | 超链接点击导致演说跳出与地址栏污染 | 统一拦截幻灯片内 `<a>` 标签，外链强制 `window.open` 开新标签页 | `slide-canvas.tsx` | 小（~25 行） | **P1 (现场护航)** |
| **竞品对齐** | **P-10** | 黑屏 (B) 与白屏 (W) 口头互动控制缺失 | 监听 `b`/`w` 按键覆盖全屏纯黑/纯白遮罩层，按任意键恢复 | `presentation-keys.ts`<br>`presentation-overlay.tsx` | 小（~30 行） | **P1 (演说实用)** |
| **交互与体验** | **P-11** | 高危导出按钮混排在控制条中间易误触 | 将导出 PDF 和 PNG 收敛或移至安全边际，避免误触打印 | `presentation-controls.tsx` | 小（~25 行） | **P1 (防误操作)** |
| **交互与体验** | **P-12** | 侧栏缺少大纲标题文本 | 提取每个 Slide 的首个有效 Heading，在缩略图旁以清晰标题显示 | `slide-rail.tsx` | 中（~35 行） | **P2 (导航效率)** |
| **交互与体验** | **P-13** | 侧栏获焦时左右方向键穿透全局触发翻页 | 快捷键监听补齐列表状态检查，隔离缩略图列表方向键与舞台 | `presentation-keys.ts` | 极小（~10 行） | **P2 (交互细节)** |
| **规范与合规** | **P-14** | 设计令牌混用裸 Tailwind 尺寸（违背铁律 4/12） | 将 `p-1`, `mx-1`, `h-4`, `py-0.5`, `h-0.5` 统一替换为标准令牌 | `presentation-controls.tsx` | 极小（~15 行） | **P2 (规范合规)** |
| **规范与 A11y** | **P-15** | 侧栏 ARIA 复合语义缺失 | 为侧栏和按钮补充标准 ARIA 集合语义声明 | `slide-rail.tsx` | 小（~15 行） | **P2 (A11y 语义)** |
| **规范与 A11y** | **P-16** | Canvas/JS 层忽略减弱动画偏好 | 读取系统 `prefers-reduced-motion`，开启时 Chart.js 传 `instant: true` | `slide-canvas.tsx` | 小（~20 行） | **P2 (A11y 体验)** |
| **竞品对齐** | **P-17** | 从当前光标所在位置就近启动演示 | 计算光标当前所在行映射的 Slide 索引，并在 `start(...)` 中应用 | `use-workspace.ts`<br>`store/presentation.ts` | 小（~25 行） | **P2 (编辑联动)** |
| **性能与架构** | **P-18** | 跟随模式协同打字时全篇推倒重测雪崩 | 改全篇 fingerprint 失效为单 Slide 内容哈希增量更新 | `presentation-overlay.tsx`<br>`slide-preflight.tsx` | 中（~60 行） | **P2 (性能治理)** |
| **性能与架构** | **P-19** | 侧栏多 Observer 实例与广播惊群效应 | 顶层单例共享 `IntersectionObserver`；改全量广播为精准订阅 | `slide-rail.tsx` | 中（~45 行） | **P2 (性能治理)** |
| **性能与架构** | **P-20** | 导出 PDF/图片缺乏进度反馈且长篇存在 OOM 风险 | 导出增加进度条反馈；离屏渲染改全量并发为分批流式 | `deck-print.tsx` | 中（~50 行） | **P2 (稳定性)** |
| **安全与鲁棒性** | **P-21** | 嵌套 Bento-Slides 代码块卡死在 Loading 状态 | 在 `slide-canvas.tsx` 中挂载只读预览降级 | `slide-canvas.tsx` | 中（~40 行） | **P2 (系统鲁棒)** |
| **安全与鲁棒性** | **P-22** | 命令面板（`Cmd+K`/`Cmd+P`）缺少演示模式入口 | 在命令面板注册 `cmd-presentation-mode` | `use-commands.tsx` | 极小（~10 行） | **P2 (入口补全)** |
| **竞品对齐** | **P-23** | 切分规则仅限水平线 `---`，无法智能切分长笔记 | 支持基于 H1/H2 标题自动识别切分 | `slides.ts` | 中（~50 行） | **P2 (一键转 PPT)** |
| **竞品对齐** | **P-24** | 演讲私有备注语法支持 (`<!-- note: ... -->`) | 在 Markdown 解析中抽取 note 注释块作为元数据 | `slide-html.ts` | 小（~30 行） | **P3 (演说生态)** |
| **竞品对齐** | **P-25** | 虚拟激光笔 (Laser Pointer) 与聚光灯工具 | 监听 `L` 键开启激光笔红光粒子跟随 | `presentation-overlay.tsx` | 中（~60 行） | **P3 (演说生态)** |
| **竞品对齐** | **P-26** | 全局幻灯片全览网格矩阵 (Overview Grid) | 按 `G` 或 `O` 键全屏展开响应式缩略图矩阵 | 新增组件 | 中（~80 行） | **P3 (演说生态)** |
| **竞品对齐** | **P-27** | 封面居中版式与两栏对比排版 | 支持 `<!-- layout: cover -->` 或分栏语法 | `slide-prose.tsx` | 中（~70 行） | **P3 (排版丰富)** |
| **竞品对齐** | **P-28** | 独立演讲者双屏模式 (Presenter View) | 弹窗打开第二屏控制台，通过 `BroadcastChannel` 通信 | 独立模块 | 大（需架构评审） | **P3 (旗舰能力)** |
