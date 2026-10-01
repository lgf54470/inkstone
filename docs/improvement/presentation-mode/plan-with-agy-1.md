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
| **批次 3** | 阶段三：导航强化、合规收尾与性能深度治理 (P2) | P-12, P-13, P-14, P-15, P-16, P-17, P-18, P-19, P-20, P-21, P-22, P-23 | `[x]` 已完成 (`5f02e2d4` ~ `decd0c8d`，B3-01 ~ B3-12) |
| **批次 4** | 阶段四：旗舰演说生态对齐 (P3) | P-24, P-25, P-26, P-27, P-28 | `[~]` 进行中（B4-01 `6888b30f`；B4-02 `e7cf8aba`；B4-11 已提交，其哈希由下一提交回填） |

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
- [x] **B3-12** `P-23 (FEAT-01)`: 智能标题识别切分长笔记（H1/H2 分页） — 已完成 (`decd0c8d`)
  - 涉及文件：`src/client/features/presentation/slides.ts` (`buildDeck`/`classifyLine`/`scanBoundaries`/`autoSlideLevel`/`dividerBoundaries`)、`src/client/features/presentation/slides.test.ts`、`README.md`、`README_ZH.md`、`scripts/check-comments.mjs`
  - 目标：对于未显式插入 `---` 分割线的一般笔记，支持根据 H1/H2 智能切分幻灯片。
  - 方案：`splitIntoSlides` 与 `findSlideIndexByOffset` 收敛为同一次 `buildDeck` 扫描（消除旧的分页/光标两套栅栏走查漂移）；逐行状态机 `classifyLine` 识别围栏/分割线/ATX 标题；无任何 `---` 时才启用标题分页——优先按 front matter 声明的 `slide-level: 1|2`，否则自动判定（≥2 个 H1 用 H1，否则退化到 H2 层级，含更浅层标题）；分割线只「切分」不归属任何页，标题行属于它开启的那一页，故分割线页从 `offset+1` 起算而标题页从自身行起算；front matter 解析改复用 `@shared/markdown-utils` 的 `parseFrontMatter`（不新增依赖，`...` 结束符与预览渲染对齐）。
  - 验证：`slides.test.ts` 31 例（新增智能分页 8 例 + `slide-level` 4 例 + 相邻分割线 1 例 + 标题页光标 2 例）。既有笔记零回归由 26 例差分基座证明：同一份输入下新实现与 `HEAD` 旧实现的 slides 数组、逐字符偏移量的 `findSlideIndexByOffset` 完全一致。12 项变异全部被具名用例杀死（含 `ATX_HEADING` 缩进/超六档放宽这一项：以「缩进 hash 视为代码块」用例的三页/两页差异钉住）。

---

## 批次 4 · 阶段四：旗舰演说生态对齐 (P3)

- [x] **B4-01** `P-24 (FEAT-03)`: 演讲私有备注语法支持 (`<!-- note: ... -->`) — 已提交 (`6888b30f`)
  - 涉及文件：`src/client/features/presentation/slides.ts`、`src/client/features/presentation/slides.test.ts`、`README.md`、`README_ZH.md`
  - 目标：`<!-- note: ... -->` / `<!-- speaker: ... -->` 读作该页幻灯片的私有备注，放映与导出画面均不出现其内容，备注作为 Slide 元数据成对可取。
  - 方案：抽取放在分页**之前**（`buildDeck` 前置一步 `readSpeakerNotes` 逐行走查），而非评审草案提议的「对整篇源码跑 `[\s\S]*?` 正则再替换」——草案写法会把跨行备注在其中的 `---` 处截断，剩下半截作为正文投出去，反而是新的泄露面。逐行状态机同时避开三种误认：围栏之内（演示该语法的代码块原样保留、不当备注）、front matter 之内（元数据里的同类写法不是备注，且不参与栅栏状态推断）、行首 ≥4 空格（Markdown 读作代码块）。整行归备注时删该行并连带删掉它上面的那个空行（否则幻灯片里留一个空洞）；`-->` 之后的文字属作者正文，保留。未闭合的备注一路私有到文末，与 Markdown 阅读器丢弃未闭合注释的既有行为一致。备注按行号归页：`noteLimit` 让分割线自己的行归上一页、标题行归它开启的那一页；`placeCues` 把「吞掉尾部所有行」的备注落到正文最后的现存行，避免尾部空白页被裁掉时备注一并消失；末组的右界取 `Infinity`，因为该组可能已无任何行可站。
  - 与草案的偏差（实测纠偏）：评审前提「备忘内容会直接投射到大屏」**不成立**——渲染器 `html: true` 产出的注释节点在 DOMPurify 一道就被丢弃，投影里本来就看不见。评审点名的 `slide-html.ts` 因此不动：剔除发生在分页时而不是渲染时，`use-slide-html` / `slide-canvas` / `slide-rail` / `deck-print` 四条渲染入口自动同步，无需各改一处。本项的实际收益因此是：(1) 修掉草案正则的跨行截断面；(2) 把备注提为与 `splitIntoSlides` 同序的 Slide 元数据（`splitIntoSlidesWithNotes`），供 B4-05 演讲者窗口直接读取。草案中的「演讲备注面板 UI」不在本项交付，归 B4-05；本项只交付语法识别 + 剔除 + 元数据，`notes` 半边在 B4-05 之前无生产消费者（同一批次内两步走，不为尚未到来的面板预铺 plumbing）。
  - 验证：`slides.test.ts` 52 例（新增 `splitIntoSlides — private speaker cues` 一组 21 例：单行、多行合并、`speaker:` 别名、大小写、`<!--note:` 贴合写法、行首四空格不识别、围栏内保留、`---` 写在备注内不分页、`-->` 后正文保留、未闭合私有到文末、备注独占一页、整篇只有一条备注、备注与分割线同行、备注吞掉分页后的尾部、front matter 不当备注、front matter 不开栅栏、光标越过备注仍落对页）。既有笔记零回归由 184 条差分断言证明：60 条不含备注的输入下，新实现与 `HEAD` 旧实现的 slides 数组与逐字符偏移的 `findSlideIndexByOffset` 完全一致，且 notes 全为空串；21 条含备注输入再各自断言「围栏外无备注文本/备注正文完整/不留空白尾页」。25 项变异全部被具名用例杀死（`NOTE_OPEN` 的缩进、大小写、空格三档放宽或收紧，`takeNote` 的删行与不删行与错行，`placeCues` 的上界与整体移除，`noteLimit` 的 `+1`，末组 `Infinity` 退回 `lines.length`，front matter 跳过条件失效等）。无新增 UI 文案，i18n 资源无变化。
- [x] **B4-02** `P-25 (FEAT-04)`: 虚拟激光笔（评审标题里的「聚光灯」拆到 B4-06） — 已完成 (`e7cf8aba`)
  - 涉及文件：新增 `src/client/features/presentation/presentation-pointer.tsx` + `.test.ts`、`use-presentation-keys.test.ts`、`use-dialog-behavior.ts`；改 `presentation-keys.ts` + `.test.ts`、`presentation-state.ts` + `.test.ts`、`use-presentation-keys.ts`、`presentation-overlay.tsx`、`src/client/styles/presentation.css`、`scripts/e2e-visual.mjs`、`scripts/check-comments.mjs`、`README.md`、`README_ZH.md`
  - 目标：放映中按一个键在大屏画出跟随指针的红色激光点（带拖尾与呼吸脉冲），开启期间系统光标隐藏；`Esc` 先把激光笔收回去而不代价一屏；模式关闭、放映结束、层卸载三条路径都不留悬空监听器与残点；激光点不吞掉大屏本要收到的点击。
  - 方案：`presentation-pointer.tsx` 在**对话框内部**渲染一层 `aria-hidden` 的 `.laser-pointer`，`pointermove` 经 `requestAnimationFrame` 合帧，一帧只写 `--laser-x/--laser-y` 两个 CSS 变量；点与三条拖尾读同一坐标、只差 `transition-duration`（`--dur-fast/base/slow`），于是「拖尾」是 CSS 的滞后而非每帧绘制的粒子；颜色取 `var(--danger)`，脉冲光晕用 `color-mix` 在同一令牌上稀释；`prefers-reduced-motion: reduce` 下脉冲写作 `animation: none`（时长令牌本身退化成 1ms，缩短会变成频闪）。键位在 `presentation-keys.ts` 注册 `'laser'`，`use-presentation-keys.ts` 的 `useLaserMode` 持有模式并以「放映关闭即退出」为效果，`escapeAction` 增加第一级 `clearLaser` 并由 `useDialogBehavior` 消费。
  - 与草案的偏差（设计冲突自决，不回头问）：
    1. **键位取 `C` 而非 `L`**：`l/L` 自首批即「跟随编辑」，`presentation-keys.test.ts` 既有用例钉住它（变异 M06「把 following 改写成 laser」正被 `keeps the pointer key off L…` 与 `toggles fullscreen, the slide list and following on F, S and L` 两条杀死，说明这条边界是被守住的而非碰巧）；`Alt+L` 不可行——浮层按键处理在 `metaKey || ctrlKey || altKey` 时直接早退，为激光笔放开修饰键等于削弱一条已发布的修饰键边界。README 两版快捷键表因此写 `C`，`presentation-keys.ts` 内注释记下表意。
    2. **不做 `LaserCanvas`**：ADR-0002 规则 1「能走 CSS 就走 CSS」优先。canvas 每帧重绘要么把颜色冻在创建时刻（要么实现 `changeTheme`/重绘管道，要么「刷新页面才变色」即回归），要么就得在绘制循环里读 `getComputedStyle`（规则 5 禁止）。DOM+CSS 变体下主题切换由浏览器完成，`--danger` 自动随明暗，不需要主题接线代码，也不需要为「颜色是否跟随主题」新增浏览器场景；草案点名的 `presentation-stage.tsx` 因此不动。
    3. **聚光灯不在本项交付**：评审对 P-25 的编号设计只描述了激光笔，聚光灯需要自己的设计（遮罩与层序、亮区令牌、与激光笔的互斥关系），拆为 B4-06，不为凑标题里的两个词预铺未设计的实现。
    4. **激光层刻意挂在 `[role="dialog"]` 之内**：与 `ScreenCover` 一样并排在面板之外，会被不透明面板压住。本次实测顺带确认了浮层既有的层序缺陷（记为 B4-07），但不为「让幕布可见」在本提交顺手改黑屏。
    5. **`useDialogBehavior` 抽出为 `use-dialog-behavior.ts`**：给它加两个参数后 `presentation-overlay.tsx` 到 514 行、越过 AGENTS.md 的 500 行预算；按「超限优先按职责拆分」把对话框的浏览器契约（Escape 阶梯 / 滚动锁 / 焦点陷阱）搬出，回到 491 行且无长函数。未用 `--update-baseline`——那会把新违规洗成存量。
    6. **发现但未修**：`use-presentation-keys.ts` 读 `event.target?.closest(...)`，keydown 的 target 为 `document`/`window`（无 `closest`）时会抛 TypeError。单测因此把事件派发到 `document.body`（真实浏览器路径），不靠兜底把这条隐藏起来；记为 B4-08。
  - 验证：
    - 先红（红在断言自己身上，不在实现上）：门禁首轮报 `laser: the dot is drawn in the red the theme carries` 失败，且该行无 detail 可查。用一次性 Chrome 探针（`puppeteer-core` + `/usr/bin/google-chrome-stable`）实测：作者写作 `oklch(49% 0.19 22)` 的颜色，Chrome 的计算值原样回 `oklch(0.49 0.19 22)`，而 `rgb(160, 40, 40)` 才回 `rgb(...)`；同一颜色画进 1px canvas 解出像素 `[179, 16, 42]`。即断言里那个只认 `rgb(...)` 的正则永不命中、`isRed` 恒假——**断言写法错，实现没错**。改法：把点色与该元素自己的 `--danger` 两侧都经 canvas 解码成像素再比（与写法无关；「等于令牌」这一条能杀死「写死 `#ff0000`」的变异），并补 detail 输出；另加一条「激光点是读者看得见的图形」，按非文本 3:1 量它对面板底色的对比度，`contrastRatio` 复用 `scripts/lib/contrast.mjs`（不复制第三份亮度公式）。
    - 单元：`presentation-pointer.test.ts` 7 例（关闭不画层 / 一点三尾且 `aria-hidden` / 坐标写进 `--laser-x`+`--laser-y` / 一串 move 只合帧一次并落在最新位置 / 下一帧继续跟踪 / 模式关闭后不再排帧 / 层随放映卸载后不再排帧），`use-presentation-keys.test.ts` 4 例（`c`/`C` 来回切换 / 焦点在控件上时把键交还控件 / 放映关闭模式随之退出 / 幕布升起时下一个键只收幕布），`presentation-keys.test.ts` 新增 3 例（含偏差 1 的 `l/L` 边界），`presentation-state.test.ts` 的 `escapeAction` 覆盖四态。放映目录 16 文件 / 184 例通过；全量 `npm run test:unit` **610 文件 / 5420 通过 + 1 跳过**（本工作机既有基线失败 `blog-comments-window.test.ts` 本轮未复现，仍按既有约定只判新增失败）；`npm run typecheck` 通过。
    - 变异：14 项全部被**具名用例**杀死（先确认基线 rc=0，跑完按 sha256 校验工作树逐字节复原）——`escapeAction` 的激光级删掉 / 排到全屏之后；`c` 的 focus 守卫删掉 / 整条映射删掉 / 只留大写；`l` 被改写成 laser；`toggleLaser` 改成置真；`open` 复位改成反向；rAF 合帧守卫删掉；`removeEventListener` 删掉；`active` 守卫删掉；x 写成 y；少一条拖尾；`aria-hidden` 删掉。面板的 `cursor-none` 与颜色/对比度不在单测射程内，由浏览器门禁守。
    - 浏览器门禁：全新 `INKSTONE_EPHEMERAL_DEV=1 --mode kv` 实例（`:7742`），先 `scripts/e2e.mjs` **177 通过 / 0 失败**（同时建出门禁登录用的 Owner-1），再 `scripts/e2e-visual.mjs` **687 通过 / 7 失败**，`laser:` 12 条全绿（含改正后的颜色断言与新增的对比度断言）；首轮该组为 685 通过 / 8 失败，唯一新增失败即上面那条断言写法。
    - 对照基线（判定哪些红是我带来的）：同机同法对 `git archive HEAD` 快照（`:7743`，同样先跑 `e2e.mjs` 177/0）跑一次得 **675 通过 / 7 失败**，失败名与本树逐条一致：`presentation: canvas fills the stage`、`presentation session: the canvas refills the stage`、`presentation pages: a thumbnail renders the markup the projector prepared`、`presentation pages: the slide list shows the chart as a picture`、`presentation pages: the picture in the slide list was drawn, not an empty frame`、`presentation pages: a theme flip re-prepares the list instead of leaving placeholders`、`a11y: the presentation overlay has no axe violations`（`.bottom-4` 页码片 1.67:1）。七项因此是本工作机既有红、与 B4-02 无关，另记 B4-09，不在本提交夹带修复（AGENTS.md 铁律 14）。
    - 静态门禁：`size:check`（抽出后 491 行 / 无长函数）、`comments:check`（重建白名单 12732 条 / 1340 文件，双向通过）、`style/escape/empty-catch/hardcoded/tokens/i18n/module-state/deep-imports/surfaces/vendor` 全绿。CSS 依既有政策不带注释，激光样式的读法（拖尾只差时长、离屏停靠不算状态、`pointer-events` 让出点击、reduce 下取消脉冲而非缩短）写在 `presentation-pointer.tsx` 头部注释里。
    - i18n：无新增用户可见文案（README 属文档，不是资源键），`i18n:check` 通过。

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

- [ ] **B4-06** `P-25 (FEAT-04) 后半`: 聚光灯（Spotlight）
  - 目标：把大屏其余部分压暗、只留一块跟随指针的亮区，与 B4-02 的激光笔共用同一套模式状态与 `Esc` 阶梯。
  - 待设计：遮罩层与 `--bg-overlay` / `z-index` 的关系（不得重犯 B4-07 的层序错）、亮区尺寸的令牌化、`prefers-reduced-motion` 下不做缩放动画、两种指点模式是否互斥。
  - 拆出原因：评审对 P-25 的编号设计只写了激光笔，聚光灯没有可直接照抄的方案。
- [ ] **B4-07** 缺陷修复: 黑屏/白屏覆盖层压不住放映面板
  - 现象：`ScreenCover` 与 `[role="dialog"]` 并排且 z 取 `--z-popover`(50)，而面板 `z-[var(--z-modal)]`(250) 自带不透明底色，同层上下文里覆盖层画在面板之下——按 `B`/`.` 后大屏可能仍是幻灯片。B4-02 的激光层因此刻意渲染在面板之内。
  - 方案：把覆盖层层序提到面板之上（或作为面板子元素），并为「幕布确实盖住了幻灯片」补浏览器断言——该路径当前无门禁覆盖，属既有缺口。
- [ ] **B4-08** 健壮性: 放映按键的 target 兜底
  - 现象：`use-presentation-keys.ts` 用 `event.target?.closest(...)` 判定焦点归属，keydown 的 target 为 `document`/`window` 时（无 `closest`）抛 TypeError。单测目前按真实浏览器路径派发到 `document.body`，未掩盖该风险。
  - 方案：只对 `Element` 取 `closest` 的显式守卫，并加一条「target 是 document 的按键不炸放映」的用例。
- [ ] **B4-09** 门禁既有红: 本机浏览器门禁 7 项（HEAD 快照复现）
  - 清单见 B4-02 验证段的对照基线条。判定依据：对同一 HEAD 快照以同法实跑，得到同样 7 个失败名。
  - 待查方向：两条 `canvas fills the stage` 无 detail 输出（先给它补 detail 才谈得上定位）；缩略图那组读数为 `katex=0/charts=0/painted=0`、`pixels=-1`，即 rail 的静止帧没画出来（疑似本机字体或解码时序）；axe 那条是 `.bottom-4` 页码片的文字色在 `--bg-overlay` 上合成出 1.67:1，若 CI 不复现则说明底色合成随环境而变，需按令牌复测该色对。
- [ ] **B4-10** 文档: `AGENTS.md` 的视觉门禁断言计数已过期
  - 现象：`AGENTS.md` 写 `scripts/e2e-visual.mjs`「当前 380 条断言」，本分支 HEAD 快照实跑已是 682 条，B4-02 后为 694 条（687 通过 + 7 既有红）。
  - 处置：`AGENTS.md` 自述「修改本文件需 PR 评审」，不在功能提交里改文档计数；单独提交或随批次收尾一并更新。（顺带核实：仓库根有 `.pre-commit-authors.json` 把 `AGENTS.md`/`scripts/e2e-visual.mjs`/`scripts/check-comments.mjs` 记给若干上游作者，但 `.githooks/pre-commit` 与本仓脚本都不读它，本检出中不生效——B4-01/B4-02 均按现状提交了这些文件。）B4-11 后本树实跑为 717 条（709 通过 + 8 失败）。

- [x] **B4-11** 缺陷修复: 图片导出反复重跑且从不拆掉导出页 — 已完成（哈希由下一提交回填）
  - 涉及文件：`src/client/features/presentation/deck-print.tsx`、`src/client/features/presentation/deck-print.test.ts`、`scripts/e2e-visual.mjs`、`scripts/check-comments.mjs`、`scripts/check-size.baseline.json`
  - 现象（由 B4-03 的浏览器场景暴露）：概览场景等一份 9 页 deck 的量测完成 >60s 不返回，而同样的 deck 在干净会话里约 5s 完成（一次性探针读到 `[data-slide-list-complete]` 在 t=4→5 之间翻真）。失败状态里 `aria-busy="true"` 且 `[data-deck-print]` 仍在文档中——是上一个场景的图片导出没结束，离屏导出页整场保留并持续布局，把下一页的空闲量测饿死。
  - 根因两条，都在 `useDeckSheetReady`：(1) 效果依赖内联的 `handOver`/`onDone`，而导出每画一页就 `setProgress` 重渲染一次，于是 `prepareDeckSheet` + 栅格化 + 存档整轮随每次渲染重启；修复前探针实测一次按压 `restarts=69`、约 18s 内完成 5 份存档（5 个下载）。(2) 图片路径只有 `afterprint` 会调 `onDone`，写完存档从不交还放映。
  - 修法：两个回调收进 ref，依赖只留 `dark`/`metrics`/`sheetRef`（`useStageMetrics` 的 `sameMetrics` 保证 metrics 身份稳定，故主题与几何仍会照旧触发重备）；图片导出在写完存档后 `onDone()`；run 被取代或卸载时由 `cancelled` 拦住交还，顺序仍是先写存档再交还。
  - 验证：
    - 先红：把两处修复按原字符串退回后 `deck-print.test.ts` = 2 failed / 7 passed，两条都以 `Test timed out in 5000ms` 红（重启的导出把事件循环灌满，红因即缺陷本身；stderr 里 `deck sheet preparation failed` 重复 3008 次）；恢复修复后本文件 11 例全绿。jsdom 无 `document.fonts`，而 `prepareDeckSheet` 把自己的异常吞在 best-effort catch 里——不桩它就等于跳过被测那步，故测试自带 fonts 桩并让等待有界，避免把「没跑到」伪装成「跑过了」。
    - 单元新增 4 例：一次按压只出一份存档；顺序为 `['archive written','deck handed back']`；交还读「当前渲染」的回调而非挂载时的（`rerender` 换掉 `onDone` 后只有后者被调用）；放映已离开则放弃在绘的导出（fonts 桩挂起 → 卸载 → 释放 → `renderDeckPagePng` 与 `onDone` 均不触发）。
    - 变异 6 项全部被具名用例杀死（跑前基线 11 例 rc=0，跑完按 sha256 校验工作树逐字节复原）：删 `onDone()`（2 例红）；`handOver, onDone` 放回依赖（2 例 5007/5010ms 超时 + 1 例 45ms 断言红）；改用挂载时的 `handOver` 闭包（1 例红）；交还早于写存档（2 例红）；不写就绪标记（1 例红）；去掉 `cancelled` 守卫（1 例红）。
    - 浏览器：全新实例 `:7750`，`scripts/e2e.mjs` **177 通过 / 0 失败**，`scripts/e2e-visual.mjs` **709 通过 / 8 失败**——8 条为 B4-09 的 7 条既有红 + 1 条概览焦点归还（属 B4-03，不在本提交修）。`export:` 5 行全绿，含本批新增两行 `export: the image export mounts one sheet and takes it down again`、`export: the image export hands the deck back to the show`。一次性 MutationObserver 探针同实例读到 `mounts=1 teardowns=1 pages=7 outcome="true" busyAfter="absent"`、下载目录只有一份 `deck-images.zip`、导出后 `[data-slide-list-complete]` 仍为 true 且条目 7（量测不再被饿死）。
    - 全量：`npm run test:unit` **611 文件 / 5458 通过 + 1 跳过 / 0 失败**（首轮曾见 8 文件 10 例超时，与并发 dev server 争 CPU 有关，空载复跑归零；见本文末「全量单元测试基线说明」）；`npm run typecheck` 与 13 项自定义门禁通过。
    - 快照自证：`/tmp/b411-snap`（`git archive HEAD` + 本批文件，其中 `e2e-visual.mjs` 只取导出场景改动）内重生成白名单（12774 条 / 1340 文件）与 size 基线（只多 `deck-print.test.ts` 一项），13 项静态门禁 + `tsc -b`（rc=0）+ `deck-print.test.ts` 11 例全绿 → 本提交单独可过 CI。
  - 与草案的偏差：本项不在评审/计划清单内，是 B4-03 的浏览器场景实测出来的缺陷，按铁律 14 单独成提交。`waitForRailFilled` 的诊断输出（两读相隔 2s、把 complete/busy/measuring/entries 写进错误消息）服务于概览场景的可读性，归 B4-03。
  - 顺带记录：`e2e-visual.mjs` 的图片导出场景原先「先 `waitForSelector` 就绪标记、再 `evaluate` 读页框」，在导出页随存档一起卸载之后这条读法必然踩空——本轮 `:7748` 的运行就在 `export: the printed PDF has the deck page count` 之后 `Waiting failed: 60000ms exceeded` 崩掉。改为按下控件**之前**挂 MutationObserver，采样 mount/teardown/最大页框数/最大 canvas 数/就绪值与拆页时的 `aria-busy`，并以 60s 有界 resolve（导出没发生时给出红行而不是崩掉门禁）。

---

## 全量单元测试基线说明

`npm run test:unit` 在本工作机上存在**与演示模式无关**的负载敏感超时，非本分支引入：

- `src/client/features/blog/blog-comments-window.test.ts` > `mounts one page of rows and grows on demand`：250 行渲染超 5000ms 阈值。
- 已在纯净快照（`git archive HEAD | tar -x -C /tmp/snap-base` + 软链 `node_modules`）复现同一失败，故与本分支改动无关。
- 处置：每批次提交仍跑全量套件并逐条比对失败清单，只判定「新增失败」；不夹带修复（AGENTS.md 铁律 14）。若后续需根治，应单独提交提高该用例超时或缩减 fixture 行数。

