# 全笔记演示模式整改执行计划 (Antigravity · 2026-09-30)

> 依据：`docs/improvement/presentation-mode/review-with-agy-1.md`（完整审查报告，28 项问题诊断与方案对标）。  
> 基线 Commit：`39a3814a9123a636acf7bb8f56f2df8c2406e054`  
> 分支：`improvement/presentation-mode-agy`  
> 约定：
> 1. 每个条目 = 一个原子提交；
> 2. 严格遵守 `AGENTS.md` 规范（Conventional Commits + 逐文件说明改动到方法/组件级）；
> 3. 每个提交均运行回归检查（类型检查、单元测试、静态检查门禁）；
> 4. **每一次提交 git 都要实时更新本文件**（更新进度勾选、commit 短哈希、执行日志）；
> 5. 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash） · `[-]` 已证伪 / 已跳过。

---

## 进度总览

| 批次 | 领域 | 覆盖问题项 | 状态 |
| :--- | :--- | :--- | :--- |
| **批次 0** | 文档基线 | 审查报告与整改计划初始化 | `[x]` 已提交 (`d8aa7a00`) |
| **批次 1** | 核心架构、安全守卫与 A11y 红线 (P0/P1) | P-01, P-02, P-03, P-06, P-07, P-08 | `[x]` 已完成 (`bfa28129` ~ `3250081d`) |
| **批次 2** | 演说交互体验与视觉信息强化 (P1) | P-04, P-05, P-09, P-10, P-11 | `[x]` 已完成 (`bbe158b8` ~ `c6426131`) |
| **批次 3** | 阶段三：导航强化、合规收尾与性能深度治理 (P2) | P-12, P-13, P-14, P-15, P-16, P-17, P-18, P-19, P-20, P-21, P-22, P-23 | `[x]` 已完成 (已提交: `5f02e2d4` ~ `ed5a64d8` + 本次 B3-12，短哈希在批次 4 首个提交回填) |
| **批次 4** | 阶段四：旗舰演说生态对齐 (P3) | P-24, P-25, P-26, P-27, P-28 | `[ ]` 待处理 |

---

## 批次 0 · 文档基线

- [x] **B0-DOC**: 建立 `review-with-agy-1.md`（全量问题深度诊断、涉及文件与函数、修复代码设计）与 `plan-with-agy-1.md`（执行跟踪计划） — 已提交 (`d8aa7a00`)

---

## 批次 1 · 核心架构、安全守卫与 A11y 红线

- [x] **B1-01** `P-01 (SEC-01)`: 全局快捷键表单输入守卫（`F/S/L` 忽略 `onControl` 修复） — 已完成 (`bfa28129`)
  - 涉及文件：`src/client/features/presentation/presentation-keys.ts` (`presentationCommand`)、`src/client/features/presentation/presentation-keys.test.ts`
  - 目标：当焦点位于 input / textarea / editable 等控件时，不拦截 `F/S/L`。
  - 验证：单元测试新增用例覆盖 `onControl: true` 下 `f/F/s/S/l/L` 均返回 `null`，既有导航用例全绿。
- [x] **B1-02** `P-02 (UX-05)`: Escape 键退出层级优化（全屏放映时优先退出全屏，窗口态才关闭演说） — 已完成 (`15652917`)
  - 涉及文件：`src/client/features/presentation/presentation-state.ts` (`escapeAction`)、`src/client/features/presentation/presentation-state.test.ts`、`src/client/features/presentation/presentation-overlay.tsx` (`useDialogBehavior`)
  - 目标：放映时按 Esc 优先退至窗口态，再次按 Esc 退出模式，避免误关演说。
  - 验证：单元测试覆盖全屏返回 exitFullscreen、窗口返回 close，overlay 行为正确衔接。
- [x] **B1-03** `P-03 (PERF-01)`: 舞台设计画幅固定为 `1280x720`，彻底解耦侧栏尺寸与缓存死锁 — 已完成 (`59a988fe`)
  - 涉及文件：`src/client/features/presentation/slide-stage.ts` (`measureStage`)、`src/client/features/presentation/slide-stage.test.ts`、`scripts/check-comments.mjs`
  - 目标：将设计画幅固定为 1280x720，容器缩放使用 CSS scale，开合侧栏不再改变设计宽高，100% 杜绝预热缓存失效。
  - 验证：新增 `slide-stage.test.ts` 验证在不同分辨率与侧栏开合时设计画幅与内容区稳定为 1280x720 / 1168x632。
- [x] **B1-04** `P-06 (SPEC-05)`: Follow/Freeze 图标与激活态语义纠偏 — 已完成 (`1c63d758`)
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`PresentationControls`)
  - 目标：跟随中高亮脉冲 `<Radio />`；冻结后不高亮显示 `<Snowflake />`。
  - 验证：纠偏状态图标渲染逻辑，跟随态显示广播电波，冻结态显示冰冻雪花。
- [x] **B1-05** `P-07 (SPEC-03)`: 控制条自动隐藏时移出 Tab 键顺序（`inert` 与 `invisible` 修复） — 已完成 (`a1ad08f5`)
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`PresentationControls`)
  - 目标：`chromeHidden` 为 true 时增加 `inert` 和 `invisible`，杜绝键盘焦点盲跳。
  - 验证：自动隐藏时节点赋予 inert 属性并切换 visibility: hidden，键盘焦点与辅助树不再穿透。
- [x] **B1-06** `P-08 (SPEC-02)`: 自动分排子页微标纳入读屏实时播报区域（`aria-live='polite'`） — 已完成 (`3250081d`)
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`SlideStepper`)
  - 目标：视障用户在子页间翻动时能感知到页码变化。
  - 验证：子页徽标配置 aria-live='polite'，长篇内容自动拆分子页翻动时读屏器实时接收播报。

---

## 批次 2 · 演说交互体验与视觉信息强化

- [x] **B2-01** `P-04 (UX-04)`: 舞台左右半区分区点击翻页与触摸手势识别 — 已完成 (`bbe158b8`)
  - 涉及文件：`src/client/features/presentation/presentation-state.ts` (`stageClickDirection`, `swipeDirection`)、`src/client/features/presentation/presentation-state.test.ts`、`src/client/features/presentation/presentation-overlay.tsx` (`PresentationStage`)
  - 目标：支持屏幕左 35% 后退、右 65% 前进与触摸轻扫。
  - 验证：单元测试覆盖点击坐标分区及滑动阈值判断，控件元素点击不穿透。
- [x] **B2-02** `P-05 (UX-01/02)`: 底部细线进度条常驻（解耦 `chromeHidden`）与舞台微型角落页码指示 — 已完成 (`52c2ab4a`)
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`SlideProgress`)、`src/client/features/presentation/presentation-stage.tsx` (`PresentationStage`)、`src/client/features/presentation/presentation-state.ts` (`formatMicroPage`)、`src/client/features/presentation/presentation-state.test.ts`
  - 目标：屏幕底部进度条环境常驻，舞台角落显示无侵入式微型页码。
  - 验证：单元测试覆盖 formatMicroPage 单双页及子页格式化，底部进度条常驻渲染。
- [x] **B2-03** `P-09 (SEC-02)`: 幻灯片超链接安全拦截代理（外链新标签页打开，双链防跳顶） — 已完成 (`332de745`)
  - 涉及文件：`src/client/features/presentation/presentation-state.ts` (`interceptSlideLink`)、`src/client/features/presentation/presentation-state.test.ts`、`src/client/features/presentation/slide-canvas.tsx` (`useSlideLinkInterceptor`)
  - 目标：拦截幻灯片内 `<a>` 标签，保护演讲主舞台不跳出。
  - 验证：单元测试覆盖安全协议（https/http/mailto/tel）新窗打开与不安全协议/锚点防跳顶拦截，SlideCanvas 挂载代理监听。
- [x] **B2-04** `P-10 (FEAT-05)`: 黑屏 (B) 与白屏 (W) 口头互动控制 — 已完成 (`100648a4`)
  - 涉及文件：`src/client/features/presentation/presentation-keys.ts` (`blackout`/`whiteout`)、`src/client/features/presentation/presentation-keys.test.ts`、`src/client/features/presentation/use-presentation-keys.ts` (`useScreenCover`)、`src/client/features/presentation/presentation-stage.tsx` (`ScreenCover`)、`src/client/features/presentation/presentation-overlay.tsx`
  - 目标：按 `B`/`.` 切换纯黑全屏遮罩，按 `W`/`,` 切换纯白全屏遮罩，按任意键或点击复原。
  - 验证：单元测试覆盖按键映射与获焦守卫，遮罩唤醒与任意键解除闭环。
- [x] **B2-05** `P-11 (UX-03)`: 导出按钮安全收敛与防误触隔离 — 已完成 (`c6426131`)
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`PresentationControls`)、`src/client/features/presentation/presentation-controls.test.ts`
  - 目标：将导出 PDF 与图片 ZIP 等高危不可逆操作从全屏/退出等高频视窗按钮间剥离，设置专属安全分隔带，杜绝演说误触调出原生打印窗口。
  - 方案：重构悬浮控制条布局结构，在全屏控制项与导出按钮之间增加明确的垂直分隔线与安全间隔，按语义将动作区划分为“导航翻页”、“状态与视图”、“导出与分发”、“退出模式”四个子群组。
  - 验证：组件结构测试与样式检查，确保各操作组拥有明确边界与分隔标记。

---

## 批次 3 · 阶段三：导航强化、合规收尾与性能深度治理 (P2)

- [x] **B3-01** `P-12 (UX-06)`: 侧栏缩略图补充大纲标题文字标签 — 已完成 (`5f02e2d4`)
  - 涉及文件：`src/client/features/presentation/slide-rail.tsx` (`SlideRailItem`, `extractSlideHeading`)、`src/client/features/presentation/slide-rail.test.ts`
  - 目标：长篇演说支持文字大纲快速扫视定位。
  - 方案：新增 `extractSlideHeading(source: string): string` 纯函数，提取每个 Slide 的首个有效 Heading（H1~H3）或第一行正文作为 Slide 简明标题，在缩略图右侧或下方以清晰文本标签呈现，超长智能截断。
  - 验证：单元测试覆盖多级 Heading、无 Heading 纯文本、带代码块与空页等场景的大纲文本提取正确性。
- [x] **B3-02** `P-13 (UX-07)`: 侧栏获焦时左右方向键隔离 — 已完成 (`a8a99505`)
  - 涉及文件：`src/client/features/presentation/presentation-keys.ts` (`presentationCommand`)、`src/client/features/presentation/presentation-keys.test.ts`
  - 目标：焦点在侧栏缩略图列表时，左右方向键（`ArrowLeft` / `ArrowRight`）不穿透导致舞台翻页。
  - 方案：在 `presentationCommand` 中针对 `ArrowLeft` / `ArrowRight` 增加 `if (context.onSlideList) return null;` 守卫条件。
  - 验证：单元测试覆盖 `onSlideList: true` 下按 `ArrowLeft`/`ArrowRight` 均返回 `null`，既有侧栏上下导航保持顺畅。
- [x] **B3-03** `P-14 (SPEC-01)`: 统一替换裸 Tailwind 阶梯尺寸为设计令牌（AGENTS.md 铁律 4/12） — 已完成 (`913d5f36`)
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx`
  - 目标：全面采用 `var(--sp-*)`，消除残余的 `p-1`, `mx-1`, `h-4`, `py-0.5`, `h-0.5`, `bottom-4`。
  - 方案：将所有硬编码间距与尺寸类名系统性对齐全局设计系统令牌。
  - 验证：运行 `npm run tokens:check`、`npm run style:check`，确保零硬编码阶梯值违规。
- [x] **B3-04** `P-15 (SPEC-04)`: 侧栏补充标准 ARIA 集合语义声明 — 已完成 (`333a755c`)
  - 涉及文件：`src/client/features/presentation/slide-rail.tsx` (`SlideRail`, `SlideRailList`, `SlideRailItem`)、`src/client/features/presentation/slide-rail.test.ts`
  - 目标：为侧栏导航声明标准 `tablist`/`tab` 集合语义，规范屏幕阅读器体验。
  - 方案：外层导航标注 `role="tablist"`，列表项按钮标注 `role="tab"` 与 `aria-selected`，并准确标注集合尺寸 `aria-setsize` 与序号 `aria-posinset`。
  - 验证：通过组件单元测试断言列表项包含完整的集合角色与可访问状态声明。
- [x] **B3-05** `P-16 (SPEC-06)`: Canvas/JS 层接入系统减弱动画偏好（`prefers-reduced-motion`） — 已完成 (`0c84674c`)
  - 涉及文件：`src/client/features/presentation/slide-canvas.tsx` (`SlideCanvas`, `SlideViewport`)、`src/client/features/presentation/slide-canvas.test.ts`
  - 目标：减弱动画偏好开启时，Chart.js 采用 `instant: true`，禁用入场缩放动画。
  - 方案：读取媒体查询 `prefers-reduced-motion: reduce`，在满足时将 `instantCharts` 强制设为 `true`。
  - 验证：单元测试模拟媒体查询激活状态，断言 Chart.js 以无动画模式极速挂载。
- [x] **B3-06** `P-17 (FEAT-07)`: 光标就近启动演示（根据编辑器当前位置定位 Slide） — 已完成 (`666a69bb`)
  - 涉及文件：`src/client/features/presentation/slides.ts` (`findSlideIndexByOffset`)、`src/client/features/presentation/slides.test.ts`、`src/client/store/presentation.ts`、`src/client/features/workspace/workspace/use-workspace.ts`
  - 目标：长文编辑无需从第 0 页翻起，直接从当前光标所在幻灯片起播。
  - 方案：在 `slides.ts` 中实现纯函数 `findSlideIndexByOffset(source, offset)`；在 `useWorkspace` 的启动入口处获取当前 CodeMirror 光标偏移量，计算目标页索引并传入 `usePresentation.getState().start({ initialSlideIndex })`。
  - 验证：单元测试覆盖文档首段、中间分页处、末尾及边界位置的光标映射精度。
- [x] **B3-07** `P-18 (PERF-02)`: 单 Slide 内容哈希增量缓存（避免跟随模式协同全篇重算） — 已完成 (`ea66634f`)
  - 涉及文件：`src/client/features/presentation/presentation-overlay.tsx` (`useSlidePlans`)、`src/client/features/presentation/slide-html.ts`、`src/client/features/presentation/slide-preflight.tsx`
  - 目标：改整篇 fingerprint 失效为每张 Slide 基于其源码的独立哈希缓存，打字时仅重算改动 Slide 的 Plan，其余页坚决复用。
  - 方案：使用 `hashContent(slideSource)` 作为单页子指纹，在 `useSlidePlans` 中维护按 Slide 源码哈希索引的 Plan 映射，未编辑页缓存稳如磐石。
  - 验证：单元测试模拟长文档部分行修改，断言未改动页的 SlidePlan 对象引用与缓存 100% 保持复用。
- [x] **B3-08** `P-19 (PERF-03)`: 侧栏单例 Observer 与细粒度事件订阅 — 已完成 (`9cc8bf05`)
  - 涉及文件：`src/client/features/presentation/slide-rail.tsx`、`src/client/features/presentation/slide-html.ts`
  - 目标：消除 100 个 `IntersectionObserver` 实例并解决全量广播惊群效应。
  - 方案：在 `SlideRail` 顶层统一构建单例 `IntersectionObserver` 实例供各子项共享；重构 `subscribeSlideHtml` 为按 `cacheKey` 精准派发的订阅机制。
  - 验证：单元测试断言单张幻灯片完成预热时仅触发对应 key 的监听器，其余缩略图无虚假渲染。
- [x] **B3-09** `P-20 (PERF-04)`: 导出图片流式分批与进度提示 — 已完成 (`882e034e`)
  - 涉及文件：`src/client/features/presentation/deck-print.tsx` (`saveDeckPages`, `DeckImageSheet`)
  - 目标：导出过程提供实时模态进度反馈，串行分批挂载和流式生成，防范浏览器 OOM 崩溃。
  - 方案：在 `saveDeckPages` 中引入进度回调驱动 UI 状态展示 `正在导出 (3/30)...`，每完成一张图片即时入流并释放 Canvas 与位图 Blob。
  - 验证：单元测试模拟多页导出，断言进度回调按预期每页递增且最终正确完成打包。
- [x] **B3-10** `P-21 (SEC-03)`: 嵌套 Bento-Slides 优雅占位降级 — 已完成 (`53b3c570`)
  - 涉及文件：`src/client/features/presentation/slide-canvas.tsx` (`useBentoSlidesFallback`)
  - 目标：全笔记演示模式中遇到 Bento-Slides 代码块不再永久停留于 "Loading slides..." 占位态。
  - 方案：在 `SlideCanvas` 中提供 `useBentoSlidesFallback`，解析围栏内的卡片结构并直接呈现为整洁的静态卡片网格预览，移除 `loading` 类并设置 `aria-busy="false"`。
  - 验证：单元测试验证包含 ` ```slides ` 的内容在 SlideCanvas 中被正确增强为静态卡片结构，无残留 loading 状态。
- [x] **B3-11** `P-22 (SEC-04)`: 命令面板注册“启动演示模式”命令 — 已完成 (`ed5a64d8`)
  - 涉及文件：`src/client/features/presentation/start-presentation.ts`（新增）、`src/client/features/presentation/presentation-hotkeys.ts`（新增）、`src/client/features/presentation/index.ts`、`src/client/features/command/command-palette/use-commands.tsx`（`currentNoteCommands`）、`src/client/features/shell/app-shell.tsx`、`src/client/features/workspace/workspace/use-workspace.ts`
  - 目标：`Cmd+K` 支持快速呼出演示模式。
  - 方案：抽出唯一启动路径 `startPresentationFromNote(noteId)`（按编辑器光标定位起始 Slide），命令面板注册 `cmd-presentation-mode`（`<Play>` 图标）；新增特性自有 `PRESENTATION_HOTKEYS`（`mod+alt+p`，`allowInInput`，放映中 `when` 让位）并由 `app-shell` 的 `registerAll` 挂载，使面板 `combo` 提示与真实绑定一致；`useStartPresentation` 改为委托该路径以消除重复实现。
  - 验证：`start-presentation.test.ts`（5 例：正文/标题、光标就近、无编辑器、正文未加载、笔记已删除）＋ `presentation-hotkeys.test.ts`（7 例：编辑器内与 textarea 内触达、参考面板收录、放映中让位、无活动笔记、`mod+p` 不匹配）＋ `presentation-command.test.ts`（3 例：命令存在与文案/快捷键/分组、与 `cmd-slides-from-outline` 共存、`run` 委托）。四轮变异（`when` 门、`allowInInput`、光标偏移、面板项）均被具名用例杀死。
- [x] **B3-12** `P-23 (FEAT-01)`: 智能标题识别切分长笔记（H1/H2 分页） — 已完成
  - 涉及文件：`src/client/features/presentation/slides.ts` (`buildDeck`/`classifyLine`/`scanBoundaries`/`autoSlideLevel`/`dividerBoundaries`)、`src/client/features/presentation/slides.test.ts`、`README.md`、`README_ZH.md`、`scripts/check-comments.mjs`
  - 目标：对于未显式插入 `---` 分割线的一般笔记，支持根据 H1/H2 智能切分幻灯片。
  - 方案：`splitIntoSlides` 与 `findSlideIndexByOffset` 收敛为同一次 `buildDeck` 扫描（消除旧的分页/光标两套栅栏走查漂移）；逐行状态机 `classifyLine` 识别围栏/分割线/ATX 标题；无任何 `---` 时才启用标题分页——优先按 front matter 声明的 `slide-level: 1|2`，否则自动判定（≥2 个 H1 用 H1，否则退化到 H2 层级，含更浅层标题）；分割线只「切分」不归属任何页，标题行属于它开启的那一页，故分割线页从 `offset+1` 起算而标题页从自身行起算；front matter 解析改复用 `@shared/markdown-utils` 的 `parseFrontMatter`（不新增依赖，`...` 结束符与预览渲染对齐）。
  - 验证：`slides.test.ts` 31 例（新增智能分页 8 例 + `slide-level` 4 例 + 相邻分割线 1 例 + 标题页光标 2 例）。既有笔记零回归由 26 例差分基座证明：同一份输入下新实现与 `HEAD` 旧实现的 slides 数组、逐字符偏移量的 `findSlideIndexByOffset` 完全一致。12 项变异全部被具名用例杀死（含 `ATX_HEADING` 缩进/超六档放宽这一项：以「缩进 hash 视为代码块」用例的三页/两页差异钉住）。

---

## 批次 4 · 阶段四：旗舰演说生态对齐 (P3)

- [ ] **B4-01** `P-24 (FEAT-03)`: 演讲私有备注语法支持 (`<!-- note: ... -->`)
  - 涉及文件：`src/client/features/presentation/slide-html.ts`、`src/client/features/presentation/slides.ts`
  - 目标：抽取 `<!-- note: ... -->` 作为 Slide 演说备注元数据，正文展示时剔除该块防止公屏泄露。
  - 方案：在流水线中正则解析抽取备忘小抄，从投影 HTML 中安全剥离，并将备注内容保留在 Slide 元数据结构中。
  - 验证：单元测试验证投影 HTML 纯净无备注注释，且返回数据中包含正确的私有备注文本。
- [ ] **B4-02** `P-25 (FEAT-04)`: 虚拟激光笔与聚光灯 (L)
  - 涉及文件：`src/client/features/presentation/presentation-overlay.tsx`、`src/client/features/presentation/presentation-stage.tsx`、`src/client/features/presentation/presentation-keys.ts`
  - 目标：按 `L` 键激活虚拟红光激光笔，大屏投映时高亮引导视觉焦点。
  - 方案：在 `presentation-keys.ts` 注册 `'laser'` 命令；在 `PresentationStage` 顶层叠加 `LaserCanvas` 跟踪指针绘制带发光脉冲与微光拖尾的激光粒子。
  - 验证：单元测试验证激光笔模式开关状态切换与指针跟踪渲染事件。
- [ ] **B4-03** `P-26 (FEAT-06)`: 全局幻灯片全览网格矩阵 (Overview Grid)
  - 涉及文件：新增 `src/client/features/presentation/slide-overview-grid.tsx`、联动 `src/client/features/presentation/presentation-overlay.tsx`
  - 目标：按 `G` 或 `O` 键全屏展开自适应响应式缩略图矩阵，便于问答阶段快速跳页。
  - 方案：新增 `SlideOverviewGrid` 组件，以 4~5 列响应式网格全屏平铺所有幻灯片缩略图，支持键盘上下左右漫游选择与回车跳转。
  - 验证：单元测试覆盖网格渲染、键盘焦点遍历与跳页回调触发。
- [ ] **B4-04** `P-27 (FEAT-08)`: 封面居中与双栏排版模板
  - 涉及文件：`src/client/features/presentation/slide-prose.tsx`、`src/client/styles/presentation.css`
  - 目标：支持 `<!-- layout: cover -->` 首页垂直水平双向居中，以及 `::: two-columns` 双栏排版。
  - 方案：识别版式元数据，向 `SlideProse` 容器注入对应的布局 CSS 类，丰富大屏视觉层级。
  - 验证：单元测试验证包含封面与双栏标记的内容正确挂载对应 class，无样式冲突。
- [ ] **B4-05** `P-28 (FEAT-02)`: 独立双屏演讲者模式 (Presenter View)
  - 涉及文件：新增 `src/client/features/presentation/presenter-view/presenter-window.tsx`、`src/client/features/presentation/presenter-view/use-presenter-channel.ts`
  - 目标：双屏独立输出，讲者窗口独立展示当前页、下一页预览、私有小抄与时钟。
  - 方案：通过 `window.open` 弹出独立窗口作为第二屏控制台，主子窗口借助 `BroadcastChannel` 传输页码、时间戳与小抄，实现低延迟双向联动。
  - 验证：单元测试验证 BroadcastChannel 跨窗口消息同步协议与控制事件收发。

---

## 全量单元测试基线说明

`npm run test:unit` 在本工作机上存在**与演示模式无关**的负载敏感超时，非本分支引入：

- `src/client/features/blog/blog-comments-window.test.ts` > `mounts one page of rows and grows on demand`：250 行渲染超 5000ms 阈值。
- 已在纯净快照（`git archive HEAD | tar -x -C /tmp/snap-base` + 软链 `node_modules`）复现同一失败，故与本分支改动无关。
- 处置：每批次提交仍跑全量套件并逐条比对失败清单，只判定「新增失败」；不夹带修复（AGENTS.md 铁律 14）。若后续需根治，应单独提交提高该用例超时或缩减 fixture 行数。

