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
| **批次 4** | 阶段四：旗舰演说生态对齐 (P3) | P-24, P-25, P-26, P-27, P-28 | `[x]` 已完成（P-01 ~ P-28 全 28 项核心审查问题全部闭环；B4-01 ~ B4-05 全部提交，余后续维护台账 B4-06 ~ B4-13） |

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

- [x] **B4-03** `P-26 (FEAT-06)`: 全局幻灯片全览网格矩阵 (Overview Grid) — 已完成 (`13997681`)
  - 涉及文件：新增 `src/client/features/presentation/slide-overview-grid.tsx` + `.test.ts`、`slide-thumb.tsx`、`use-presentation-session.ts`；改 `presentation-overlay.tsx`（489→131 行）、`presentation-stage.tsx`、`presentation-controls.tsx` + `.test.ts`、`presentation-keys.ts` + `.test.ts`、`presentation-state.ts` + `.test.ts`、`use-presentation-keys.ts` + `.test.ts`、`use-dialog-behavior.ts`、`slide-rail.tsx`（346→194 行）+ `.test.ts`、`slide-cache.test.ts`、`src/client/components/overlay/hooks.ts` + `.test.ts`、`src/client/styles/presentation.css`、`src/shared/locales/{en-US,zh-CN}/workspace.ts`、`scripts/e2e-visual.mjs`、`tests/fullscreen-policy.test.ts`、`README.md`、`README_ZH.md`、`scripts/check-comments.mjs`、`scripts/check-size.baseline.json`
  - 目标：按 `G` 或 `O` 在幻灯片之上铺开整份 deck 的页卡矩阵，方向键按行漫游、`Enter` 或单击跳页，问答阶段一眼定位；矩阵收起后键盘回到打开它的那个控件，`Esc` 阶梯先收矩阵而不代价整场放映。
  - 方案：
    - 矩阵是**放映面板之内**的 `absolute inset-0` 层（`z-[var(--z-popover)]`），不是自己的 dialog——浏览器只画全屏元素的子树，另开一层就画不出来（同 B4-02 偏差 4 的层序结论）。
    - 网格归浏览器：`repeat(auto-fill, minmax(200px, 1fr))`，卡宽即缩略图宽。行宽不派生自索引，而在按键时读首行卡片的 `offsetTop` 实数（`columnsIn`）——唯一能改它的是视口变化，而 resize observer 会为「一次按键用一个数」重渲染整份 deck。
    - 漫游位置 `roam` 是矩阵自己的状态，起点为当前页：放映可以在矩阵底下移动（点击投影、方向键跳页），键盘不把手从指针下抽走。roving tabIndex（焦点项 `0`，其余 `-1`）让一次 Tab 落在一张卡上。
    - 键盘归 `useGridKeyboard`：先判「打开矩阵的那把键在矩阵内任何位置都收得回它」——window capture 上的放映处理器对卡上的 `Enter`/`Space` 本来让位（按钮 own 这两个键），矩阵必须自己接回来；其余走 `overviewMove(key, from, count, columns)`（左右 ±1、上下 ±行宽、`Home`/`End` 到首尾、边缘夹住、未知键返回 null 交还放映）。
    - 焦点契约 `useOpenedFocus`：挂载时聚焦当前页卡，卸载时交还「打开者」；**打开者每个实例只记一次**。
    - 遮住即不可达：矩阵升起时幻灯片（`presentation-stage.tsx`）、控制胶囊、侧栏各接一条 `occluded` 并置 `inert`；配套把 `isAvailableFocusTarget`（`components/overlay/hooks.ts`）过滤 `[inert]`——焦点陷阱否则会把盖住的控件当落点，dialog 静默地一个焦点都没有。
    - 缩略图从 `slide-rail.tsx` 提为共用模块 `slide-thumb.tsx`（`thumbMetrics` / `useThumbView` / `pageLabel` / `extractSlideHeading` / `usePageHtml` / `useCachedSlideHtml` / `SlideThumb`）：矩阵与侧栏因此共用同一份量测、同一份内容缓存、同一套页标签与编号，从任一处跳页落点一致。CSS 类名随之从 `.ink-slide-rail-thumb` 改 `.ink-slide-thumb`。
    - 键位表：八条只差字母的 case 收进 `TOOL_KEYS: Record<string, PresentationCommand>`，新增一把工具是一行。
    - 会话状态机（哪篇笔记在放、如何分页、讲到第几页、五个模式）拆为 `use-presentation-session.ts`，overlay 只留渲染。
  - 与草案的偏差：
    1. **两把键而不是草案的一把**：`O` 是 reveal.js 的 deck overview 键、`G` 直读它铺成的 grid，讲者抓哪个都到同一屏；`opens the overview on O, and on G for the grid it is laid out as` 一条同时钉住两个字母，变异 M06（从表里删掉 `o` 那行）由它杀死。
    2. **不写死 4~5 列**：草案的方案段把响应式写成常量列数，实现改由浏览器排、键盘按实测行宽走。写死列数在窄视口（矩阵一行 1~2 张）会把 `ArrowDown` 跳错行。
    3. **不做拖拽重排、不做卡内编辑**：评审 P-26 只要「快速跳页」，其余是为凑标题预铺。
    4. **「打开者只记一次」是实测逼出来的**：dev 下 StrictMode 会双跑挂载效果，第二次跑时键盘已在矩阵内，重读 `document.activeElement` 就把矩阵自己的一张卡记成打开者，关闭时它已 detached、交还整个不再发生。探针读数见验证段。
    5. **不加延后重试**：探针同时证明关闭那一刻控制胶囊已不再 `inert`（`chromeInert:false`，且那次 `focus()` 真的生效），「等一等再还」是给不存在的问题写代码。
    6. **会话拆分不在草案**：接完矩阵的 overlay 越 500 行预算，按 AGENTS.md「超限优先按职责拆分」处理；`tests/fullscreen-policy.test.ts` 的原生全屏归属名单因此改指 `use-presentation-session.ts`。
    7. **jsdom 不实现 `inert` 的聚焦阻断**：浏览器会丢掉对 inert 元素的 `focus()`，jsdom 让它在。单测因此自带 `maskedOpener` 夹具（一个被遮住就不再接受键盘的按钮）复现这条语义，而不是把它留给浏览器门禁独守。
  - 验证：
    - 先红（红在浏览器里）：`:7750` 首跑该行 `✗ overview: the closed matrix hands the keyboard back to the control that opened it {"grid":false,"open":true,"position":"2 / 9","chromeInert":false,"backOnToggle":false,"active":"body"}`——矩阵确实收了、页码对，键盘落在 `body`。单测侧新增同名行为用例（`maskedOpener` + StrictMode），把「只记一次」退回「每次读」即红（变异 M10）。
    - 探针读数（`HTMLElement.prototype.focus` 打桩，同实例 `:7754`，记 before/after/isConnected/inert 祖先链）：打开阶段 3 次调用——(1) 聚焦卡 0，此前 activeElement 是 opener；(2) 对 opener 的交还落在 `inertAncestor: DIV#`（控制胶囊当时被遮罩）且 `after` 未变，即浏览器把它丢了；(3) 第二次挂载再聚焦卡 0。关闭阶段 1 次调用 `before: BODY → after: BUTTON|显示幻灯片全览`，`FINAL {"isToggle":true,"toggleConnected":true,"chromeInert":false}`。故承重的是「只记一次」，不是「重试」。
    - 单元：`slide-overview-grid.test.ts` 15 例（逐页卡片且页序与方向键一致 / 命名与编号 / 把投影备好的标记画进卡 / 行宽漫游 / 边缘夹住 / 空网格不动 / 交还不属于自己的键 / 从任意卡按打开它的键收回且不顺带跳页 / roving tabIndex / 单击取页并收起 / 焦点进出交接 / 被自己的 mount 移走过仍交还 / 被压小的页按 projector 量到的内容盒切片）；`presentation-state.test.ts` 补 `overviewMove` 全键位与新 Esc 阶梯；`presentation-keys.test.ts` 补 `TOOL_KEYS` 与 `o`/`g`；`use-presentation-keys.test.ts` 补「把方向键留给正在漫游的矩阵」「随放映收起」；`presentation-controls.test.ts` 补「矩阵升起时控制胶囊不可达」；`overlay/hooks.test.ts` 补「inert 控件不当焦点落点」；`slide-rail.test.ts`、`slide-cache.test.ts` 随共用缩略图调整。放映目录 + overlay hooks **22 文件 / 246 例**通过；全量 `npm run test:unit` **611 文件 / 5462 通过 + 1 跳过 / 0 失败**；`npm run typecheck` 通过。
    - 变异：16 项，**15 项被具名用例杀死**（跑前基线 110 例 rc=0，跑完按 sha256 校验工作树逐字节复原）——`overviewMove` 的行宽退化成 ±1 / 不夹边 / `Home` 写错端点 / 删空网格早退；`escapeAction` 的矩阵与激光两级互换；`o` 从表里删掉 / 单字母工具不再让位聚焦控件；`onSlideList` 不含矩阵根 / `!open` 复位删掉；`useOpenedFocus` 的「只记一次」去掉 / 挂载聚焦删掉 / 收起时不 `preventDefault`；焦点过滤不再管 `inert`；控制条的 `occluded` 删掉。**M11 存活并如实记录**：删掉归还前的 `isConnected` 守卫后 110 例仍全绿——detached 元素的 `focus()` 在 jsdom 与 Chrome 都是 no-op，这是可证明的行为等价变异，不为它写假测试（守卫留着表达意图）。**M16 首轮存活**：`thumbMetrics` 的 `contentWidth` 减不掉左右内边距时，被压小的页会按整幅宽切片——补一条断言切片写的宽高恰为 `(1280-56*2)/0.5` 与 `(720-44*2)/0.5`（即 `SLIDE_PAD_X`/`SLIDE_PAD_Y` 那对内容盒）后复跑，该项由 `slices a shrunk page of the card at the content box the projector measured it in` 杀死。
    - 浏览器：全新实例 `:7754`，先 `scripts/e2e.mjs` **177 通过 / 0 失败**（建出门禁用 Owner-1），再 `scripts/e2e-visual.mjs` **710 通过 / 7 失败**（717 行）。21 行 `overview:` 全绿，含那条归还断言；矩阵的 axe 两行也在内（`the matrix has no axe violations`、`no unexpected axe review items in the matrix`——开着矩阵跑，盖住幻灯片的层不新增放行项）。7 条失败与本树 B4-09 清单逐条同名，非本批带来。
    - 静态门禁：`typecheck` 与 13 项自定义门禁全绿；注释白名单重建为 **1348 文件 / 12903 条**，size 基线 51 个豁免文件 + 本批新条目。
    - i18n：新增 `workspace.presentation_overview` / `_show_overview` / `_hide_overview`（按钮名称随状态在「显示/隐藏」之间换），en-US 与 zh-CN 齐备，`i18n:check` 通过。
    - 快照自证：`/tmp/snap-b403`（`git archive HEAD` + 本批暂存版本，`node_modules` 软链）内重生成注释白名单与 size 基线后，13 项静态门禁 + `tsc -b` + 放映目录测试通过 → 本提交单独可过 CI。
  - 顺带记录：
    - 整份 deck 的卡片共用的那**一个** IntersectionObserver 是从 `slide-rail.tsx`（提交 `9cc8bf05`）搬进 `slide-thumb.tsx` 的；本批只是让它同时服务侧栏与矩阵，「全场景只有一个 observer、退订后回调不再触发」至今没有单测钉住——记为 B4-12。
    - `presentation-stage.tsx` 的 `inert={occluded}` 只由浏览器行 `the slide and the pill are out of reach behind the matrix` 守着：jsdom 不做命中测试、也不让 `inert` 阻断聚焦，单测最远只能断言属性在。
    - `waitForRailFilled` 的两读诊断（`slide list never finished {"before":…,"after":…}`）是 B4-11 期间定位「导出页饿死量测」用的，随本批进入 `e2e-visual.mjs`。
- [x] **B4-04** `P-27 (FEAT-08)`: 封面居中与双栏排版模板 — 已完成 (`2c304cf1`)
  - 涉及文件：`src/client/features/presentation/slides.ts` + `.test.ts`、`slide-html.ts`、`slide-prose.tsx`、`slide-pagination.ts` + `.test.ts`、`slide-canvas.tsx`、`slide-thumb.tsx`、`slide-rail.tsx`、`slide-overview-grid.tsx`、`deck-print.tsx` + `.test.ts`、`use-slide-html.ts`、`slide-preflight.tsx`、新增 `slide-layout.test.ts`、`src/client/styles/presentation.css`、`README.md`、`README_ZH.md`、`scripts/e2e-visual.mjs`、`scripts/check-comments.mjs`、`scripts/check-size.baseline.json`
  - 目标：`<!-- layout: cover -->` 把该页作封面垂直与水平双向居中，`<!-- layout: split -->` 把该页排成左右等宽两栏；侧栏卡、全览矩阵、打印页与 PNG 导出画的是放映**量出来**的同一种版式。
  - 方案：
    1. 开关在渲染时由 `takeLayoutDirective` 从 slide 源里取出并带走整行（连同它上面那个空行，否则原地留一个洞）。值表 `LAYOUT_VALUES` 认 `cover`/`split`/`two-columns`，允许 ≤3 空格缩进，只读该页第一条；栅栏内的开关原样留在正文。开关绝不进 markup——`renderer/index.ts` 的 `html: true` 会把认不得的开关原样发成注释节点，放映上就是一处源码泄漏，而"第二条开关不生效"正是这条规则的必然结果。
    2. 版式沿 `SlideRender → SlideMarkup → SlidePlan` 一路带下去：缓存条目带 `layout`，量测把版式写进 plan，各表面读 plan 的版式而不是作者的开关。
    3. 分页归 `planSlidePages(blocks, contentHeight, layout)`：`split` 一律整页——两栏靠"平衡"而不是"顺序流"装页，按页首去切会把并排的块隐掉；`cover` 与无版式照旧分页（封面正文超页时也得分页，否则裁掉）。
    4. 两栏是"装得下"的手段，不是"慢一点溢出"的手段：`slideLayoutForFit` 在栏式下读 host 自身高度（即较高那栏），超过一页就把版式退回流式，交还给能走到每个块的分页那条路。
    5. **量测自己强制几何**：`readSlideGeometries` 先摘掉 cover/split 读流式块位，再加上 split 读栏高，摘掉后才出 plan，最后由 plan 决定留哪个类。
  - 与草案的偏差：
    1. **不做"首页含一级标题就自动当 cover"**：草案把自动识别与显式开关并列。自动识别等于同一条排版在两处各判一次，且作者无法否决；只认显式开关。
    2. **不做 `::: two-columns` 容器语法**：仓库没有 markdown-it-container，为一条排版加依赖要过供应链审查（铁律 8），`:::` 还要与既有代码栅栏、备注语法重定优先级。`<!-- layout: two-columns -->` 作为 `split` 的同义拼写把草案想要的名字覆盖了。
    3. **类名走既有前缀** `ink-slide-cover`/`ink-slide-split`，不是草案的 `slide-layout-cover`（与 `.ink-slide-rail-thumb`、`.ink-slide-thumb` 同源）。
    4. **版式是量出来的，不是写出来的**：比草案的"识别标记→挂类"多一层拒绝机制，因为两栏一旦超页，照草案挂类就是把内容裁掉。
    5. **卡跟放映走**：`usePageHtml` 的版式取值定为 `plan ? plan.layout : markup.layout`——没量过的页按作者的话画，量过的页按放映真正画过的几何切片；打印侧 `deck-print.tsx` 早已取 `plan.layout`，本批把两处对齐。
    6. **cover 的居中靠它自己那一页的高度**：flex 居中需要可分配空间，故 `SlideProse` 只在 cover 上写内联 `minHeight: contentHeight`（运行时几何值，符合铁律 12 的例外）；split 不写，因为它的块高正是量测要读的东西。
  - 验证：
    - 先红（红在放映自己身上）：把"读块之前先摘掉类"那行删掉（M9）后，同实例 `:7770` 探针在 20s 内 7 次采样读到 `data-slide-list-complete` 恒为 `false`、后台量测一直卡在最后一张；修复后同一 deck 约 2s 内翻真，页序读数 `[1,1,5,1]`。同张被拒两栏的 slide 在卡上画 4 个块、在放映那一页是 6 个块——两处不同幅，正是这条耦合的可观测后果。
    - 先红（红在优先级上）：`usePageHtml` 的取值退回 `markup.layout` 后本目录单测 1 失败 / 13 通过（`follows the projector onto the flow layout when its columns were refused`），浏览器读到该页 `marked` 已是流式而 `cardMarked` 仍写 `ink-slide-split`。
    - 先红（红在拒绝机制上）：把栏高读数钉成 0（M10，等于"永远接受两栏"）后探针读到那张页 `marked` 含 `ink-slide-split`、`pageFraction 3.333`、`pages 1`、`cardMarked` 含 split，整份 deck 的页数读数退回 `[1,1,1,1]`——正是 `layout: a slide whose columns overflow the page goes back to the flow layout`、`layout: the slide the columns could not hold is paged instead of cut off`、`layout: the slide list draws the layout the projector drew` 三行所拒绝的状态。
    - 单元：新增 `slide-layout.test.ts` 14 例（开关进出、栅栏内不动、缓存条目带版式、列式页的卡切片、`usePageHtml` 三条优先级、cover 的类与 minHeight、split 的类）；`slide-pagination.test.ts` 19 例（split 整页、装不下则拒、无开关不受影响、`samePlan` 把版式变化算成新 plan）；`slides.test.ts` 65 例（含 `takeLayoutDirective` 13 例）；`deck-print.test.ts` 15 例（打印页与画页保留量测到的版式）。放映目录 + overlay 组件 **23 文件 / 283 例**通过（B4-03 时为 22 文件 / 246 例）；全量 `npm run test:unit` **612 文件 / 5499 通过 + 1 跳过 / 0 失败**（默认并发下 3~5 条与演示无关的重 jsdom 用例超 5s 阈值，逐条单跑全绿；`--maxWorkers=4 --testTimeout=20000` 全绿，见文末「全量单元测试基线说明」）；`npm run typecheck` 通过。
    - 变异：单元 8 项全部被**具名用例**杀死（跑前基线 4 文件 / 113 例 rc=0，跑完按 `cmp` 校验 5 个源文件逐字节复原）——`slideLayoutForFit` 永不拒绝（M1）/ 把列式当 cover 那样整页打包（M2）/ `samePlan` 不比版式（M3）/ 栅栏内开关也算数（M4）/ 一切已知值都答 cover（M5）/ cover 不给它要居中的那一页（M6）/ 打印页丢掉量测版式（M7）/ 卡按作者的话画（M8）。浏览器 2 项（M9、M10）见上面三条先红；它们杀不掉任何单测，因为 jsdom 不做布局，`offsetTop/offsetHeight` 恒为 0——几何耦合只能由浏览器读出来。
    - 浏览器：全新实例 `:7770`，先 `scripts/e2e.mjs` **177 通过 / 0 失败**（建出门禁登录用的 Owner-1），再 `scripts/e2e-visual.mjs` **722 通过 / 7 失败（729 行）**，B4-03 基线为 710/7（717 行），差值正是本批新增 12 行 `layout:`，7 条失败与本树 B4-09 清单逐条同名。新增读数：cover `columnCount auto`、`centredColumn true`、`gapTop=gapBottom=216`、`pageFraction 0.878`；装得下的 split `columnCount 2`、`lefts 2`、`pages 1`、`0.841`；被拒的 split `columnCount auto`、`pages 5`、`3.697` 且二次读数逐字段相同；无开关页 `pages 1`、`0.383`；四页 `straySwitch false`。
    - 静态门禁：`typecheck` 与 13 项自定义门禁全绿；注释白名单 **1349 文件 / 12977 条**；size 基线新增 `slides.test.ts` 一项（`describe('takeLayoutDirective')` 回调 57 行，与本树既有 25 条同类测试豁免一致）。
    - CSS 不带注释：`scripts/check-comments.mjs` 的 `scanCss` 对任何 CSS 注释一律拒绝且没有白名单通道，故三条排版规则的读法写在 `slide-prose.tsx` 与 `slide-pagination.ts` 的 TS 注释里。
    - i18n：无新增用户可见文案（README 属文档，不是资源键），`i18n:check` 通过。
  - 顺带记录：
    - **本批的浏览器场景自己带过一个缺陷**：`assertSlideLayouts` 收尾只按一次 `Escape`。放映会取原生全屏，第一把 `Escape` 只把全屏交还浏览器、面板仍在，于是其后每个场景的"读 DOM"照旧通过（面板与笔记并列而非取而代之）、第一次真实指针点击被遮罩吃掉——实测两次运行都崩在下一个场景 `pickMindmapPalette` 等 `[role="menu"] [role="menuitemcheckbox"]`（15s 超时）。改为按两把并断言"面板确实没了、全屏确实退了"（新增第 12 行 `layout: the show is put away before the next scenario reaches for the pointer`），并用一次性探针读到 `after 1 Escape {dialog:"演示模式",canvas:true,fullscreen:null}`、`after 2 Escape {dialog:null,canvas:false}`、可点按钮覆盖数 0。结论：任何开过放映的场景都必须自己断言收尾，不能只按一下。
    - `waitForRailFilled` 在量测永不收尾时是"整场门禁崩在这里"而不是"红一行"（它抛 `slide list never finished {"before":…,"after":…}`）。这条诊断（B4-11 加的）本批用它定位了 M9，值得保留，但它意味着任何让量测无法收尾的改动都会伪装成门禁崩溃。
    - 本机默认并发下超 5s 的既有用例不止 blog 一条：本轮实测 `blog-comments-window`、`music-track-table`、`music-hub-modal`、`tests/radiogroup-names`、`tests/starter-deck-render` 五条按运行轮换超时，单跑 1.3~2.3s 全绿；对 `git archive HEAD` 快照单跑 `tests/starter-deck-render.test.ts` 得 1351ms，本树同法 1575ms，同量级，故与本批无关。文末基线说明按本轮更新。
- [x] **B4-05** `P-28 (FEAT-02)`: 独立双屏演讲者模式 (Presenter View) — 已完成 (`cac9c063`)
  - 涉及文件：
    - `src/client/features/presentation/presenter-view/use-presenter-channel.ts`
    - `src/client/features/presentation/presenter-view/presenter-window.tsx`
    - `src/client/features/presentation/presenter-view/use-presenter-channel.test.ts`
    - `src/client/features/presentation/presenter-view/presenter-window.test.ts`
    - `src/client/features/presentation/presentation-keys.ts`
    - `src/client/features/presentation/presentation-keys.test.ts`
    - `src/client/features/presentation/use-presentation-keys.ts`
    - `src/client/features/presentation/presentation-controls.tsx`
    - `src/client/features/presentation/presentation-controls.test.ts`
    - `src/client/features/presentation/use-presentation-session.ts`
    - `src/client/features/presentation/presentation-overlay.tsx`
    - `src/client/features/presentation/index.ts`
    - `src/client/app.tsx`
    - `src/shared/locales/{en-US,zh-CN}/workspace.ts`
    - `README.md`, `README_ZH.md`
    - `scripts/check-comments.mjs`, `scripts/check-size.baseline.json`
  - 目标：双屏独立输出，讲者窗口独立展示当前页、下一页预览、私有小抄与时钟。
  - 方案：通过 `window.open` 弹出独立窗口作为第二屏控制台（URL 带 `?presenter=1`，由独立 `PresenterRoute` 轻量挂载，绕过编辑器启动），主子窗口借助 `BroadcastChannel` 传输页码、时间戳与小抄，实现低延迟双向联动。
  - 验证与加固：
    - 加固修复（二次审查）：
      - 修复计时器暂停/恢复时间漂移（wall clock 直接相减导致暂停时间被计入耗时且重置被后续 interval 冲刷覆盖）：重构为 `accumulatedMs` 与 `lastResumeAt` 增量累计模型，暂停停止累计，重置清零。
      - 修复 BroadcastChannel 随每次渲染重建及断连闪烁：分离 Channel 生命周期（仅随 `open` 挂载/卸载）与状态同步 effect（`statePayload` 更新时单独 `postMessage`）。
      - 修复多子页下一页预览错误：当前页有多子页且未到尾页时，下一页预览展示当前页的下一个子页（透传 `nextPlan`, `nextSubPage`, `proseFont`）。
      - 修复按键穿透与焦点陷阱：控制台内按钮（暂停/重置）获得焦点时按空格/回车不触发幻灯片切页；演讲者备注区域获得焦点时纵向滚动键（`ArrowDown/Up`, `PageDown/Up`, `Home/End`, `Space`）优先滚动备注面板。
      - 遵循 AGENTS.md 规范消除长函数：重构拆分 `PresenterScaledSlide`, `useTimerInterval`, `dispatchPresenterKey`, `useBroadcasterChannel`，全量消除 `presenter-view` 4 个文件中的所有超 50 行长函数，完全从 `scripts/check-size.baseline.json` 中移除。
    - 单测覆盖：
      - `use-presenter-channel.test.ts`：5 例测试覆盖广播者与接收者挂载握手、状态双向同步、控制命令反向派发、广播者卸载关闭信号、连接稳定性（无多余销毁/闪烁）、多子页与尾页下一页预览推导。
      - `presenter-window.test.ts`：16 例测试覆盖控制台挂载、未连接状态、当前页与下一页渲染、演讲者备注提取渲染、倒计时/计时器启动暂停重置与时间累计、按键导航防穿透与全屏退出。
      - `presentation-keys.test.ts`：补充 `P` 键触发 `presenter` 命令及表单输入守卫测试。
      - `presentation-controls.test.ts`：测试悬浮工具栏演讲者模式按钮渲染与触发。
    - 门禁与全量：
      - 20 个 presentation 测试文件全绿（290 例）。
      - `npm run typecheck` 通过。
      - 静态门禁全部通过（`style`, `tokens`, `vendor`, `escape`, `empty-catch`, `module-state`, `deep-imports`, `surfaces`, `hardcoded`, `i18n`, `comments:check`, `size:check`）。


- [ ] **B4-06** `P-25 (FEAT-04) 后半`: 聚光灯（Spotlight）
  - 目标：把大屏其余部分压暗、只留一块跟随指针的亮区，与 B4-02 的激光笔共用同一套模式状态与 `Esc` 阶梯。
  - 待设计：遮罩层与 `--bg-overlay` / `z-index` 的关系（不得重犯 B4-07 的层序错）、亮区尺寸的令牌化、`prefers-reduced-motion` 下不做缩放动画、两种指点模式是否互斥。
  - 拆出原因：评审对 P-25 的编号设计只写了激光笔，聚光灯没有可直接照抄的方案。
- [ ] **B4-07** 缺陷修复: 黑屏/白屏覆盖层压不住放映面板
  - 现象：`ScreenCover` 与 `[role="dialog"]` 并排且 z 取 `--z-popover`(50)，而面板 `z-[var(--z-modal)]`(250) 自带不透明底色，同层上下文里覆盖层画在面板之下——按 `B`/`.` 后大屏可能仍是幻灯片。B4-02 的激光层因此刻意渲染在面板之内。
  - 方案：把覆盖层层序提到面板之上（或作为面板子元素），并为「幕布确实盖住了幻灯片」补浏览器断言——该路径当前无门禁覆盖，属既有缺口。
- [x] **B4-08** 健壮性: 放映按键的 target 兜底 — 已完成 (`0c2f096d`)
  - 涉及文件：`src/client/features/presentation/use-presentation-keys.ts`、`src/client/features/presentation/use-presentation-keys.test.ts`
  - 现象：`use-presentation-keys.ts` 用 `event.target?.closest(...)` 判定焦点归属，keydown 的 target 为 `document`/`window` 时（无 `closest`）抛 TypeError。单测目前按真实浏览器路径派发到 `document.body`，未掩盖该风险。
  - 方案：改 `event.target as HTMLElement | null` 为 `event.target instanceof Element ? event.target : null` 显式守卫，确保仅对 Element 调用 `closest`。
  - 验证：单元测试新增「target 是 document 与 window 的按键不炸放映并正常触发命令」，11 例测试全绿。
- [ ] **B4-09** 门禁既有红: 本机浏览器门禁 7 项（HEAD 快照复现）
  - 清单见 B4-02 验证段的对照基线条。判定依据：对同一 HEAD 快照以同法实跑，得到同样 7 个失败名。
  - 待查方向：两条 `canvas fills the stage` 无 detail 输出（先给它补 detail 才谈得上定位）；缩略图那组读数为 `katex=0/charts=0/painted=0`、`pixels=-1`，即 rail 的静止帧没画出来（疑似本机字体或解码时序）；axe 那条是 `.bottom-4` 页码片的文字色在 `--bg-overlay` 上合成出 1.67:1，若 CI 不复现则说明底色合成随环境而变，需按令牌复测该色对。
- [ ] **B4-10** 文档: `AGENTS.md` 的视觉门禁断言计数已过期
  - 现象：`AGENTS.md` 写 `scripts/e2e-visual.mjs`「当前 380 条断言」，本分支 HEAD 快照实跑已是 682 条，B4-02 后为 694 条（687 通过 + 7 既有红）。
  - 处置：`AGENTS.md` 自述「修改本文件需 PR 评审」，不在功能提交里改文档计数；单独提交或随批次收尾一并更新。（顺带核实：仓库根有 `.pre-commit-authors.json` 把 `AGENTS.md`/`scripts/e2e-visual.mjs`/`scripts/check-comments.mjs` 记给若干上游作者，但 `.githooks/pre-commit` 与本仓脚本都不读它，本检出中不生效——B4-01/B4-02 均按现状提交了这些文件。）B4-11 后本树实跑为 717 条（709 通过 + 8 失败）；B4-03 后同为 717 条（**710 通过 + 7 既有红**）——那 8→7 是 B4-03 修掉了自己场景里的归还焦点那条，而 B4-03 新增的 21 行 `overview:` 断言本就在 B4-11 那次运行的工作树里（未提交），故总数不变；`HEAD`（`3d163856`）快照按减法推算为 696 条 = 717 − 21（**推算，未实跑**——B4-10 更新 `AGENTS.md` 时应按那次实跑为准）。

- [x] **B4-11** 缺陷修复: 图片导出反复重跑且从不拆掉导出页 — 已完成 (`3d163856`)
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

- [ ] **B4-12** 测试缺口: 全缩略图共用那一个观察者无人钉
  - 现象：`slide-thumb.tsx` 的模块级 `sharedThumbObserver` + `thumbObserverCallbacks`（预取边距 `THUMB_PREFETCH_MARGIN = '320px'`）是提交 `9cc8bf05` 在 `slide-rail.tsx` 里建的，本批 B4-03 把它随缩略图一起提为共用，于是侧栏与矩阵**共用同一个**观察者。「一张列表一个观察者」与「列表全部卸载后回调不再触发、且 `thumbObserverCallbacks` 不留下已 detached 的元素」两条都只由实现读得出，没有任何断言守着；把它改回每卡一个 observer（正是当初要修掉的惊群）会静默通过现有全部测试。
  - 方案：把观察者的创建收进可注入的工厂（或暴露一个只读的创建计数），断言一整个挂载/卸载周期内创建数为 1、退订后回调不再触发、映射表随退订清空；侧栏与矩阵同场时仍为 1。属测试补强，不在功能提交里夹带（铁律 14）。
- [ ] **B4-13** 待查: 缩略图预取的 rootMargin 够不到被侧栏裁掉的卡
  - 由来：一条经远程频道转来的"缺陷确认"要求把 `slide-thumb.tsx` 的 `THUMB_PREFETCH_MARGIN = '320px'` 改成 `'0px 0px 320px 0px'`，理由是"四值简写在垂直滚动容器里不生效"。**该理由不成立**：`320px` 是合法简写，四边各扩 320px，已包含下方 320px；改成只留下边只是把上/左/右的预取收窄，不解决任何东西。该行也不在本批 diff 内（`git diff` 无 `THUMB_PREFETCH` 的 `+/-` 行，常量随 `13997681` 从 `slide-rail.tsx` 搬来、原建于 `9cc8bf05`）。
  - 真实机制（读代码得出，未实测）：观察者建在 `root` 缺省（视口）上，而侧栏自己是 `overflow-y-auto` 的中间滚动容器（`slide-rail.tsx:115`）。IntersectionObserver 的相交矩形要按祖先滚动盒逐层裁剪，`rootMargin` 只扩根矩——被侧栏裁到零矩的卡永远不会 `isIntersecting`，四边扩 320px 也够不到它。于是"预取"实际只在卡进入侧栏可见框那一刻生效。
  - 方案（若确要预取）：把观察者建时带上 `root: <侧栏滚动盒>` 并配下方 margin；同时给"共用一个观察者"补断言（B4-12），两者一起改才谈得上可验证。属独立项，不在功能提交里夹带（铁律 14）。

---

## 全量单元测试基线说明

`npm run test:unit` 在本工作机上存在**与演示模式无关**的负载敏感超时，非本分支引入：

- 本轮（B4-04，2026-10-01）默认并发四跑实测：第一跑 1 条、第二跑 5 条、第三跑 3 条、降并发跑 0 条，失败名单在各跑之间**轮换**而非固定，全为重 jsdom 渲染用例：`blog-comments-window`（`mounts one page of rows and grows on demand`）、`music-track-table`（`mounts one page of cards for a library nobody searched`）、`music-hub-modal`（`says how many matches the capped grid leaves out`）、`tests/radiogroup-names`（两条）、`tests/starter-deck-render`（一条）。
- 五条同场单跑 **5 文件 / 51 例全绿**，最慢一条 2333ms（阈值 5000ms）；同机并发时它们报到 5161~14850ms。本机常驻第三方 GUI 进程（一次 `ps` 采样 `%CPU` Lifetime 均值 73.6 与 61.5）+ `vite`/`vitest` 自身把 16 核占满，是这些固定开销被放大的来源。
- 与分支改动无关的对照：`git archive HEAD` 快照单跑 `tests/starter-deck-render.test.ts` 为 **1351ms**，本树同法 **1575ms**（同量级，未测出本批带来的额外开销）。
- 处置：每批次提交仍跑全量套件并逐条比对失败清单，只判定「新增失败」；不夹带修复（AGENTS.md 铁律 14）。为拿到一次可读的全量结论，允许在同树同内容下降并发并放宽单例预算复跑一次，命令与结果须如实写明（本批为 `npx vitest --config vitest.config.ts run --maxWorkers=4 --testTimeout=20000` → 612 文件 / 5499 通过 + 1 跳过 / 0 失败）。若后续需根治，应单独提交提高这些用例的超时或缩减 fixture 行数。

