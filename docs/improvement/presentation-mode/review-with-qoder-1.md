# Inkstone 演示模式深度审查 · 第二轮复审 (Qoder · 2026-10-02)

> 基线 Commit：`03628a57707b9d9d9335ba9316f3af99bbdcbe8b`（分支 `improvement/presentation-mode-agy`）
> 上一轮：`review-with-agy-1.md`（P-01 ~ P-29）与 `plan-with-agy-1.md`（批次 0 ~ 4）
> 本轮定位：**第二轮复审**。上一轮闭环的 29 项一律不重复报；本轮报的是①上一轮修复留下的缺口，②上一轮根本没看的切面，③台账里已记但未闭环的项。
> 编号：`N-01 ~ N-38`，按域分组、全局连续编号，供 `plan-with-qoder-1.md` 直接引用。  
> 更名记录：本文件初稿名为 `review-with-agy-2.md`，2026-10-02 按「谁出的报告记谁」改为 `review-with-qoder-1.md`；上一轮 `*-with-agy-1` 两份文档的名字与编号不变，本报告对它们的引用仍写作 `review-with-agy-1.md` / `plan-with-agy-1.md`。

---

## 零、本轮方法与证据规则（先读这段，再判断哪条可信）

- **本轮没有启动任何浏览器、没有跑 dev server、没有跑 `scripts/e2e*.mjs` / `check-contrast.mjs` / `measure-*.mjs`。** 所有结论来自静态阅读 + grep + 只读静态门禁 + `node -e` 实跑。凡是需要真实布局/真实解码才能定的，一律标 `[需实测]`，不伪装成结论。
- 证据分三级标注：
  - `[已复核]` = 主代理本轮亲自读被引用的那几行确认过（本报告 20 条；14 条「高/中高」中除 N-15 与 N-24 外全部在内）。
  - `[子代理]` = 专项子代理给出 file:line，主代理未逐行复核，可信但建议动手前再看一眼。
  - `[推断]` = 由代码结构推出的机理，无直接断言证据。
  - `[历史/子代理]` = 结论来自上一轮台账（`plan-with-agy-1.md`）的记录而非本轮实跑，仅 L-1 用这一级。
- 实跑的只读门禁：`style:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`comments:check`、`size:check`、`deep-imports:check`、`surfaces:check` —— **8 项全绿，跑前跑后 `git status --short` 均为空**。见 N-16：门禁全绿恰恰是本轮一类问题的症状，不是反证。
- 实跑的 `node -e`：用仓库自带的 `markdown-it`（commonmark 预设，`html:true`）对比渲染器与分页器对五种分隔线写法的判定，结果见 N-01。

---

## 一、结论摘要

**工程底子是第一梯队的**：固定画幅、逐页 idle 分片量测、rAF 合帧指针工具、单例观察者、`inert` 三处同步、Esc 阶梯、焦点归还、双语资源、13 项自定义门禁——这些在同类实现里都属少见。上一轮把「放映交互层」补齐了。

**本轮的问题集中在三处，且都不是「少个功能」：**

1. **「讲前—讲中—讲后」这条链只做了中段。** 双屏演讲者模式（P-28）在真实投屏场景里有两处直接不可用：演讲者窗口的当前页/下一页**不跑富媒体增强**（图表、Mermaid、看板、公式在讲者眼里全是占位块，`[已复核]`），计时器**从应用启动起算而非从开场起算**（`[已复核]`）。这不是缺功能，是功能交付了一半。
2. **分页器的语法判定与渲染器各说各话。** 实测证明：`标题行` + 下一行 `---` 在渲染器是 `<h2>`、在分页器是切页；`* * *` / `___` / `- - -` 在渲染器是 `<hr>`、在分页器不切。作者看到的分隔线与实际分页行为不一致，且没有逃生阀。这是**正确性**问题，优先级高于一切视觉优化。
3. **可见浮层的层序规则被违反了第二次。** B4-07 刚为黑屏遮罩立过规则、`presentation-overlay.tsx:75-76` 的注释白纸黑字写着「放在对话框里面而不是旁边：面板拥有自己的绘制堆栈」，而导出进度提示就挂在这个面板之外——点「导出图片」后屏幕上什么都不出现，用户只能反复点。

**按严重度计数（由本报告标题行实数得出）：高 10 条 · 中高 4 条 · 中 15 条 · 低-中 1 条 · 低 3 条 = 33 条缺陷；另有 5 条功能缺口（N-31 ~ N-35，只按「价值 ÷ 代价」排序，无严重度）。合计 38 条。**

**建议动手顺序（批次划分与依赖见 §九 矩阵）：**

| 序 | 项 | 为什么先做 |
| :-- | :-- | :-- |
| 1 | N-01 分页语义分歧 | 正确性，影响所有不用标准 `---` 写法的笔记，越晚改回归面越大 |
| 2 | N-04 + N-05 演讲者窗口富媒体与计时 | 双屏场景当前不可用；两条同目录，一次改完 |
| 3 | N-12 导出进度被压住 | 一行结构移动，收益立竿见影，且是已立规则的第二次违反 |
| 4 | N-11 页码四处不同源 | 用户截图直接反映的困惑 |
| 5 | N-23 缓存上限 < 量测目标 | 长 deck 上整趟量测白做 |
| 6 | N-07 / N-08 / N-09 安全三条 | 代价都不大，其中两条是「同一动作两条路径两套信任判定」 |

---

## 二、正确性：分页语义（最高优先）

### N-01 `[已复核]` 分页器与渲染器对「分隔线」的判定不一致 — 高

**现象**
- 笔记里写 `章节标题` 换行 `---`（CommonMark 的 setext H2），渲染器画成 `<h2>` 标题，分页器**在这里切了一刀** → 标题孤零零留在上一页，正文跑到下一页，大屏上出现一页只有一行字。
- 笔记里写 `* * *`、`___`、`- - -`（都是合法的 CommonMark 分隔线），渲染器画 `<hr>`，分页器**不切** → 作者看到分隔线以为分页了，实际整段挤在一页。
- 只有「空行 + `---`」这一种写法两边一致。

**证据**（`node -e` 用仓库自带 markdown-it 实跑，非推断）

| 笔记写法 | markdown-it 渲染 | `SLIDE_BREAK` 是否匹配 |
| :-- | :-- | :-- |
| `Intro line` + `---` | `<h2>`，**无** `<hr>` | 切 1 处 |
| `para` + 空行 + `---` + 空行 | `<hr>` | 切 1 处 |
| `a` + 空行 + `* * *` | `<hr>` | 不切 |
| `a` + 空行 + `___` | `<hr>` | 不切 |
| `a` + 空行 + `- - -` | `<hr>` | 不切 |

- `src/client/features/presentation/slides.ts:3` — `const SLIDE_BREAK = /^ {0,3}-{3,}[ \t]*$/`
- `src/client/lib/markdown/renderer/index.ts:34-35` — `new MarkdownIt({ html: true })`，默认 commonmark 预设，setext 标题启用
- 分页是**独立逐行状态机**（`plan-with-agy-1.md` B3-12 的设计决定），刻意不复用渲染器 → 两边规则必然漂移

**根因** 分页器自己实现了一套「什么算分隔线」，而这一版比 CommonMark 窄（只认连字符、不认空格分隔形式）又比 CommonMark 宽（不要求前置空行，于是把 setext 下划线也当分隔线）。

**修复方案**
1. `SLIDE_BREAK` 扩为 CommonMark 的三种 thematic break 形式：`-{3,}` / `*{3,}` / `_{3,}`，含 `- - -`、`* * *` 的空格分隔变体。
2. 同时要求**该行前面是空行或文件首**，否则不切——这一条把 setext 误切挡掉。
3. 更稳的做法：分页时向渲染器要一次「thematic break 所在行」的判定（markdown-it token 流里有 `hr`），让**分页读渲染器的结论**而不是维护第二套规则。仓库已有先例：`B4-04` 的 `<!-- layout: -->` 注解「渲染成 `data-mindmap-theme`，registry 再交给同一个 reader，所以两处判定不会漂移」（见 `AGENTS.md` 富媒体块段）。
4. 无论选哪种，`slides.test.ts` 的 26 例差分基座（B3-12 建立）必须先扩到覆盖这五种写法，否则改完不知道砸了什么。

**涉及文件** `slides.ts`（`SLIDE_BREAK`、`classifyLine`、`scanBoundaries`）、`slides.test.ts`、`README.md`/`README_ZH.md`、`scripts/check-comments.mjs`
**代价** 中（改动本身小，难在差分基线要重跑）
**验证** 五种写法各一条具名用例；差分基座证明既有 `---` 笔记零回归

---

### N-02 `[子代理]` 超大单块整体缩排而不续页 — 中

**现象** 一张跨 2 页的长表格、一段 60 行代码、一个长列表，会被**等比缩小到刚好一页**（2 页高 → 0.5 倍）而不是拆到下一页。投影上字号直接掉到不可读。

**证据**
- `slide-pagination.ts:50` — `if (first.height > limit) scales[from] = limit / first.height`
- `slide-canvas.tsx:214-227` — `transform: scale(...)` + `overflow: hidden`，且 `scale >= 1` 时才复原
- 分页循环 `slide-pagination.ts:43-52` 只在**块之间**找断点（`breakIndex`），块内部无法断

**修复方案** 给缩放设下限（`MIN_FIT_SCALE`，取一个投影可读的比值）；低于下限时改走「块内续页」：表格按 `<tr>` 断、代码块按行断、列表按 `<li>` 断。这三类各有天然断点，不需要通用文本回流。
**涉及文件** `slide-pagination.ts`、`slide-canvas.tsx`、`slide-pagination.test.ts`
**代价** 中
**验证** 一张 3 页高的表：断言产出 3 页且每页缩放为 1

---

### N-03 `[子代理]` 分割线分页与标题分页互斥，且没有关闭自动分页的取值 — 中

**现象** 只要笔记里出现任意一条 `---`，H1/H2 智能分页就整体失效（`slides.ts:86-90,194-200`）。混合写法的笔记——作者本意是「大节按 H1 分，重点处手动强切」——只能得到纯分割线行为。唯一逃生是「整篇塞满 `---`」，等于放弃智能分页。

**修复方案** 让两种边界**并集**而不是互斥：`dividerBoundaries` 与标题边界合并去重后一起排序。再给 front matter 一个 `slide-level: none` 显式关闭标题分页（当前 `slideLevelOf` 只认 `1|2`）。
**涉及文件** `slides.ts`（`buildDeck`、`dividerBoundaries`、`slideLevelOf`）、`slides.test.ts`、README 两版
**代价** 小-中
**验证** 「2 条 `---` + 4 个 H1」的笔记断言出 5 页（当前会出 3 页）

---

## 三、演讲者模式（N-04 ~ N-06）与安全（N-07 ~ N-10）

### N-04 `[已复核]` 演讲者窗口的当前页/下一页完全不跑富媒体增强 — 高

**现象** 双屏放映时，讲者看到的「当前页」与「下一页预览」里：Chart.js 图表、Mermaid、思维导图、看板、note embed 全部停在「正在加载…」占位；KaTeX 是**空白**；代码块无高亮。观众看到渲染好的，讲者看到空壳。

**证据**
- `presenter-view/presenter-window.tsx:350` — `const markup = slideMarkup(renderSlideSource(source, true))`，只有这一句，没有 `enhancePreview` / `renderPendingMermaid` / `renderChartJs` / `renderMath`
- 对照放映侧：`slide-canvas.tsx:240-242` 才有那几个增强调用；`use-slide-html.ts:36-47` 是增强入口
- `grep -rn "kanban|mindmap|mermaid|chart|katex|enhance" src/client/features/presentation/presenter-view/` → **零命中**，即该目录连一条相关测试都没有
- 跨窗口协议只传源码：`use-presenter-channel.ts:106` 传 `currentSlideSource`；新 window 也读不到主窗的 `slideHtmlCache`（模块级 Map，不跨文档）

**根因** P-28 的通道设计传的是 markdown 源码而非已渲染标记，而演讲者窗的渲染路径没有把主窗那套增强补回来。

**修复方案**（二选一，须说明理由）
- **A. 补齐渲染**：`PresenterSlidePreview` 挂载后对 host 跑与 `use-slide-html` 同一套 `enhancePreview({ kanban:'snapshot', mindmap:'snapshot', excalidraw:'snapshot', ... })` + `renderPendingMermaid` + `renderChartJs`。优点：与投影同源；缺点：讲者窗要自己加载一遍导图/图表库（vendor 体积与 `vendor:check` 需复核）。
- **B. 传已渲染标记**：通道改传主窗 `slideHtmlCache` 里的 html + fences。优点：不重复加载库、所见严格一致；缺点：payload 变大（与 N-26 冲突，需一并处理），canvas 类富媒体需转静态快照。
- 建议 **B**：「讲者看到的」与「观众看到的」不一致本身就是演讲者模式的缺陷，A 修不了这个。

**涉及文件** `presenter-view/presenter-window.tsx`、`presenter-view/use-presenter-channel.ts`、`slide-html.ts`、`presenter-view/*.test.ts`
**代价** 中
**验证** 含图表 + Mermaid + 公式的 deck，演讲者窗断言三者各自的产物节点存在（不是占位文案）

---

### N-05 `[已复核]` 演讲者计时从应用启动起算，且跨场次不复位 — 高

**现象** 9:00 打开应用、10:30 才开始讲，演讲者窗口显示已用 `01:30:00`。第二场放映接着第一场的时长继续走。

**证据**
- `use-presentation-session.ts:103` — `const startedAt = useRef(Date.now()).current`
- `presentation-overlay.tsx:28-30` — `usePresentationSession(...)` 在 `if (!open) return null` **之前**调用，而 `app-shell.tsx:59` 无条件挂载 `PresentationOverlay` → `useRef` 在 shell 挂载那一刻初始化，与 `open` 无关，此后永不复位
- 下游确认：`use-presenter-channel.ts:114` 把 `startedAt` 放进 state → `presenter-window.tsx:157` `usePresenterTimer(state.startedAt)`

**修复方案** `startedAt` 随「本次放映开始」复位：在 `usePresentation` store 的 `start()` 里记 `startedAt: Date.now()`，session 从 store 读而非自己 `useRef`。顺带把「暂停/重置」语义（B4-05 已做的 `accumulatedMs` 增量模型）接到同一来源。
**涉及文件** `store/presentation.ts`、`use-presentation-session.ts`、`presenter-view/*`
**代价** 小
**验证** 单测：`open` 从 false→true 时 `startedAt` 变化；同一 shell 生命周期内两场放映各自从 0 起算

---

### N-06 `[已复核]` 弹窗被拦截时演讲者模式静默失败，且无内嵌降级 — 中高

**现象** 会议室笔电、无痕窗口、部分浏览器设置会拦 `window.open`。此时按 `P` 或点演讲者按钮——**什么都没有发生**，无提示、无降级。

**证据**
- `use-presenter-channel.ts:54-60` — `const win = window.open(...)`；`win?.focus()`；返回值被 `useSessionPresenter`（`use-presentation-session.ts:104`）丢弃
- 无对应 i18n 键（locales 无「弹窗被拦」类文案）
- 违反 `AGENTS.md` 铁律 2（调用边界必须处理失败态）

**修复方案** `win === null` 时走内嵌降级：在放映面板内开一个可收起的侧栏，画同样的「次页 + 备注 + 计时」；并 toast 说明「弹窗被拦截，已改用内嵌演讲者面板」。内嵌面板必须遵守 `AGENTS.md`「工具栏展开」段的四种合格去处之一（该段明确禁止内联展开面板撑高工具栏）——建议走「独立一列」，与大纲/反向链接同类。
**涉及文件** `presenter-view/`、`presentation-controls.tsx`、`locales/{en-US,zh-CN}/workspace.ts`
**代价** 中
**验证** 桩掉 `window.open` 返回 null，断言降级面板出现且焦点/ESC 契约成立

---

### N-07 `[已复核]` 私有备注与放映状态可被同源任意文档读取与改写 — 高（安全）

**现象** `BroadcastChannel('inkstone-presenter-sync')` 是**广播**，不是点对点，且没有会话身份。任何同源文档（分享页、上传的 HTML 附件、另一个标签页）post 一条 `{type:'ready'}`，主窗就会回一份完整 state——其中含 `notes`，即作者用 `<!-- note: ... -->` 写的**演讲者私有备注**。同一通道还能反向控制投影翻页、伪造讲者的提词。

**证据**
- `use-presenter-channel.ts:6` — 通道名是固定常量，无会话 token
- `:131-143` — 收到 `ready` 无条件回 `sync`；收到 `command` 无条件执行 `goNext/goPrev/jumpTo`，**没有任何发送方校验**
- `:113` — state 含 `notes: notes[slideIndex] ?? ''`
- `:224-226` — 接收侧 `setState(msg.state)` 无形状校验；`presenter-window.tsx:351` 在 `plan` 缺失时读 `plan.pages.length` 会抛错 → 演讲者窗白屏
- 附带正确性问题：两个标签页各开一场放映时共用同一通道 → 互相抢同一个演讲者窗、一条 `command` 同时翻两份投影

**根因** 缺一次握手与一个会话标识。

**修复方案**
1. 主窗 `openPresenter()` 时生成一次性随机 token，经 URL **fragment**（不进服务端日志）交给子窗；子窗 `ready` 时带 token，主窗只回给认得的 token。
2. 消息形状用 Zod 校验（仓库已有 Zod 基座）。
3. 加 `sessionId`，让通道成为多路复用的会话总线，顺带解决双放映互抢。

**涉及文件** `presenter-view/use-presenter-channel.ts`、`app.tsx`（presenter 路由）、`presenter-window.tsx`、`use-presenter-channel.test.ts`
**代价** 中
**验证** 三条具名用例：无 token 的 `ready` 不得到 sync；错 token 不得到 sync；带对 token 的 `command` 才生效。另加「两个 sessionId 并存的通道互不串台」

---

### N-08 `[已复核]` 右键菜单的链接动作绕过了左键那套协议白名单 — 中高（安全）

**现象** 幻灯片里点链接（左键）走 `interceptSlideLink` 的 `https/http/mailto/tel` 白名单；**右键**菜单的「在新标签页打开链接」与「复制链接地址」不做任何协议判定，直接把 `href` 原值交给 `window.open`。同一个动作，两条路径，两套信任判定。

**证据**
- `presentation-context-menu.tsx:57` — `onSelect: () => window.open(linkUrl, '_blank', 'noopener,noreferrer')`，`linkUrl` 无校验
- `presentation-context-menu.tsx:203-214` — `extractLinkHref` 原样返回 `getAttribute('href')`，另有一条读 SVG `baseVal` 的分支（刻意支持导图/图表里的 `<a>`，而 SVG 属性名的净化路径与 HTML 不完全相同）
- 对照 `presentation-state.ts:89-105` — 白名单只在这里
- 当前唯一实际防线是上游 DOMPurify。它今天会剥掉 `javascript:`，但这条路径自己不设防，等于把安全押在上游配置不变上（违反 `AGENTS.md` 铁律 1「外部输入必须校验」的纵深要求）

**修复方案** 把 `interceptSlideLink` 的协议判定抽成 `isSafeSlideLinkHref(href): boolean` 纯函数，左键与右键共用；右键侧对非白名单 href **不渲染这两项**。
**涉及文件** `presentation-state.ts`、`presentation-context-menu.tsx`、两侧测试
**代价** 小
**验证** `javascript:` / `data:` / `vbscript:` / `HTTPS:`（大小写）/ 前导控制字符各一条，断言菜单项不出现

---

### N-09 `[已复核]` 右键菜单可穿透解析到放映画面之外的链接 — 中（安全 / 正确性）

**现象** 在幻灯片上没有链接的区域右键，菜单可能给出「打开/复制」一个**画面上根本看不见**的链接——它来自被不透明面板盖住的下层笔记编辑器或侧栏。

**证据**
- `presentation-context-menu.tsx:216-229` — `extractAnchorHrefFromPoint` 遍历整条 `document.elementsFromPoint(x,y)`，只跳过 `data-presentation-menu-backdrop` 与 `[role="menu"]`，**不限定在放映面板内**
- `presentation-overlay.tsx:66` — 面板是 `fixed inset-0` 不透明背景，但只有 `stage/rail/controls` 接了 `inert`（`use-presentation-session.ts:165`），app 外壳其余部分没有
- 违反 `AGENTS.md` 铁律 1（开放重定向 / 信息泄露面）+ 用户可感知的「菜单在骗我」

**修复方案** 命中栈只取**第一个非背板元素**（而不是全栈找），并加 `panelRef.current.contains(el)` 约束。
**涉及文件** `presentation-context-menu.tsx`、`presentation-context-menu.test.ts`
**代价** 小
**验证** 在面板外放一个链接、面板内该位置无链接，断言右键不出现链接项

---

### N-10 `[已复核]` 链接协议判定大小写敏感，非白名单链接静默失效 — 中（正确性）

**现象** 笔记里写 `[文档](HTTPS://example.com)`（大写协议）或相对链接，放映中左键点击**完全无反应**——既不打开也不提示。

**证据**
- `slide-canvas.tsx:125` — 命中 `<a>` 就无条件 `event.preventDefault()`
- `slide-canvas.tsx:127` → `presentation-state.ts:96-100` — `trimmed.startsWith('https://')` 等四条小写比较；RFC 3986 的 scheme 大小写不敏感
- 返回 false 后调用方不做任何事 → 死链接，无反馈（铁律 2）

**修复方案** 协议比较先 `toLowerCase()`；对被拦下的非白名单链接给一次 toast（复用 `useUi`，同模块已有用法见 `deck-print.tsx:101`）。
**涉及文件** `presentation-state.ts`、`slide-canvas.tsx`、locales
**代价** 小

---

## 四、UI 规范与交互

### N-11 `[已复核]` 页码在四处各写一套，截图里两个数字并排不可分辨 — 高

**现象**（对应用户截图 1 底部工具条 `‹ 1 / 1 › 1/2`）
- 主计数器 `1 / 1` 是「第几张幻灯片 / 共几张」，子页徽标 `1/2` 是「这张的第几页 / 这张共几页」，两者**并排且无任何标签**；
- 更糟的是子页徽标渲染在 `›`（下一页）**右边**（`presentation-controls.tsx:146`，位于 next 按钮之后），读起来像「下一页的页码」；
- 右下角还有第三种写法 `01 / 02 (1/2)`（`presentation-state.ts:79` `formatMicroPage`），侧栏序号是第四种。

**证据** `presentation-controls.tsx:138-153`、`presentation-stage.tsx:112`、`slide-rail.tsx:185`、`presentation-state.ts:79-87`
**根因** 四处独立格式化，没有一个「页码怎么读」的单一来源。

**修复方案**
1. 定一个读数格式，复用**已存在**的 `workspace.presentation_slide_page_number` 键；
2. 子页徽标移到主计数器**左侧**（紧贴它、属于它），或干脆并进同一串：`第 1 / 1 张 · 第 1 / 2 页`；
3. 删掉右下角角落徽标（它与常驻进度条 + 主计数器三重冗余）；
4. 侧栏序号改 `1·2` 形式，与主读数同源。

**涉及文件** `presentation-controls.tsx`、`presentation-stage.tsx`、`slide-rail.tsx`、`slide-thumb.tsx`（`pageLabel`）、`presentation-state.ts`
**代价** 低（改动小，测试多）
**验证** 断言四处读数由同一个纯函数产生

---

### N-12 `[已复核]` 导出进度提示被放映面板压住，点了像没反应 — 高

**现象** 点「导出图片」，屏幕上不出现「正在导出 (3/30)…」。用户只能重复点击或以为功能坏了。

**证据**
- `deck-print.tsx:118-126` — 进度条 `fixed ... z-50`
- `presentation-overlay.tsx:83` — `<PresentationSheets>` 渲染在 `[role="dialog"]` **之外**（是其兄弟节点）
- `presentation-overlay.tsx:66` — 面板是 `fixed inset-0 z-[var(--z-modal)] bg-[var(--bg-base)]`（250 层，不透明）→ 250 的不透明层画在 50 的进度条之上
- **同一条规则的第二次违反**：`presentation-overlay.tsx:75-76` 注释原文「Inside the dialog rather than beside it: the panel owns the paint stack, and a pointer drawn outside it would sit under the very slide it is meant to point at」，而 B4-07（`fdb5a6b5`）正是为 `ScreenCover` 修过同一个问题

**修复方案** 把进度提示移进 `PresentationDialog`（与 `ScreenCover`/`LaserPointer` 同级），层级走 `--z-toast` 令牌而非裸 `z-50`；同时给「导出图片」按钮就地加 Spinner，让反馈不依赖浮层层序。
**涉及文件** `presentation-overlay.tsx`、`deck-print.tsx`、`styles/presentation.css`、`deck-print.test.ts`
**代价** 低
**验证** 浏览器门禁：导出进行中，断言进度节点在 `[role="dialog"]` 子树内且 `elementFromPoint` 命中它自己（不是面板）

> **建议顺带做的根治** `[推断]`：本仓已第三次踩「浮层挂在不透明全屏 surface 之外」。可在 `scripts/check-surface-coverage.mjs`（`surfaces:check`）加一条：任何 `fixed` 且带 `role="status"`/`aria-live` 的可见浮层，其 JSX 祖先链必须包含它要覆盖的那个 surface。文档规则挡不住第二次。

---

### N-13 `[已复核]` 翻页对读屏是裸数字，且两个相邻 live region 各报一遍 — 高（a11y）

**证据** `presentation-controls.tsx:138` 与 `:147` 两个 `<span aria-live='polite'>`，内容分别是 `1 / 1` 与 `1/2`。P-08 加了 `aria-live` 但没给可读名称 → 播报是 "one slash one" 然后 "one slash two"，无「幻灯片」「页」语境，且两串相邻数字听不出区别。
**修复方案** 可见数字 `aria-hidden`，旁挂一个 `sr-only` 的整句 live region（用已有的 `presentation_slide_page_number` / `presentation_page_of` 键）。
**涉及文件** `presentation-controls.tsx`、`presentation-controls.test.ts`
**代价** 低

---

### N-14 `[已复核]` 黑屏/白屏遮罩是非语义控件，且 `aria-label` 硬编码英文 — 中高（铁律 10 / i18n）

**证据**
- `presentation-stage.tsx:122-134` — `ScreenCover` 是 `<div onClick>` + `aria-label`，无 `role`；`aria-label` 挂在 generic 元素上不被可靠播报
- `:132` — `aria-label={cover === 'black' ? 'Blackout' : 'Whiteout'}` 是英文字面量
- 而 `workspace.presentation_blackout` / `_whiteout` **双语键早已存在**（`locales/en-US/workspace.ts:112-113` = `Blackout`/`Whiteout`，`locales/zh-CN/workspace.ts:112-113` = `黑屏模式`/`白屏模式`）→ 中文账号读屏念英文
- 违反 `AGENTS.md` 铁律 10（禁 `div`+`onClick` 模拟控件）、铁律 13，以及「源码 UI 文案必须使用英文 message id」

**修复方案** 改成铺满的 `<button type="button">`，`aria-label={t(...)}`；遮罩升起/解除用 `role="status"` 播报。
**代价** 低
**验证** 键盘 Tab 能到达、Enter/Space 能解除；断言 `aria-label` 计算值等于 zh-CN 资源

---

### N-15 `[子代理]` 开放映后焦点默认落在侧栏 tab，此时方向键与空格全部失效 — 中高

**现象** 放映打开后什么都不按，直接按 `←`/`→` 或空格——**不翻页**，只有 `PageUp`/`PageDown` 能用，而这个事实界面上没有任何地方说。

**证据** `presentation-keys.ts:22,26`（`onSlideList` 时 `ArrowLeft/Right` 返回 null）、`slide-rail.tsx:81-99`（侧栏挂载即聚焦 tab）、`use-presentation-keys.ts:138`
**根因** P-13 修的是「焦点在侧栏时方向键不该穿透翻页」，但没考虑「默认焦点就在侧栏」这个初始状态——于是把默认状态下的主功能挡住了。
**修复方案** 二选一：①初始焦点落在控制胶囊而非侧栏；②侧栏内 `←`/`→` 交还给放映（侧栏自己的漫游用 `↑`/`↓`）。建议 ①，因为它同时改善 N-11 里「用户不知道从哪开始」。
**代价** 中（要重跑焦点契约测试）

---

### N-16 `[已复核]` 裸 Tailwind 阶梯值与裸 z-index 残留，8 项门禁全绿没抓到 — 中（铁律 4/12）

**证据**（P-14 只清了 `presentation-controls.tsx` 一个文件，同类值散在别处）
- `presentation-stage.tsx:112` — `bottom-4 right-4 py-0.5 opacity-35 shadow-xs z-10`
- `deck-print.tsx:122` — `z-50 shadow-lg`
- `presentation-controls.tsx:138` — `min-w-14`
- `presenter-view/presenter-window.tsx:264` — `h-2 w-2`
- `slide-rail.tsx:185` — `pt-0.5`
- 对应令牌 `--sp-4`、`--sp-0\.5`、`--shadow-xs`、`--z-sticky` **都存在**（`min-w-14` 无对应，需新增或改内容撑宽）
- 门禁为什么没抓：`hardcoded:check` 的解析面只覆盖 Tailwind 任意值（`[240px]`）与 hex 字面量，**阶梯类不在射程内**；`palette-baseline` 里没有本模块条目，即不是豁免而是漏检

**修复方案** ①逐处换令牌；②给 `hardcoded:check` 补一条 Tailwind 阶梯类规则（`p-N`/`px-N`/`py-N`/`m*-N`/`h-N`/`w-N`/`bottom-N`/`z-N`/`gap-N`），否则第四次还会漏。
**代价** 低（改动）+ 中（门禁）

---

### N-17 `[已复核]` 20 多条键位绑定，放映中没有任何可查处 — 中

**现象** 放映有约 20 条绑定（`presentation-keys.ts:20-68`：方向键 / `PageUp` / `PageDown` / `Home` / `End` / 空格 / Enter / `.` / `,` + `f l c t k s o g b w p`），但：
- 控制胶囊的 Tooltip **一律不传 `combo`**（`presentation-controls.tsx:48,75-98`），而同仓 `components/overlay/modal.tsx:57` 的关闭按钮传了 `combo='escape'`，本模块自己的右键菜单每条都带 combo——同一产品内三种做法；
- 放映中**没有 `?` 键快捷键卡**（`presentation-keys.ts` 无 `'?'` 绑定），而思维导图全屏有参考卡（`AGENTS.md`「工具栏展开」段把它列为四种合格去处之一的先例）；
- 应用内快捷键参考面板不含放映键（`shortcuts-panel.tsx` 无 presentation 条目，`PRESENTATION_HOTKEYS` 只有 `mod+alt+p` 一条）；
- 截图 2 的编辑器右键菜单「演示模式」项**漏标 `combo:'mod+alt+p'`**（同菜单「撤销」带 `mod+z`）——`workspace/context-menu/canvas.tsx:199` vs `:210`

**修复方案** ①所有 Tooltip 补 `combo`；②加 `?` 键开合的快捷键卡（走 `AGENTS.md` 认可的「内容区绝对定位浮层」，同导图）；③`shortcuts-panel.tsx` 收录放映键；④右键菜单补 combo。
**代价** 小-中
**验证** 触屏不可达的工具（激光笔/聚光灯/黑白屏）在卡片里可见即算部分闭环

---

### N-18 `[子代理]` 窄屏下控制胶囊溢出裁切 — 中

**证据** `presentation-controls.tsx:32-53`，10 个图标 + 计数约 435px，无 `flex-wrap`、无 `max-w`、无横滚；全模块无一处 `md:`/`sm:` 断点。390px 视口下两端的 `‹` 与 `×` 被裁掉。
**修复方案** 窄屏折叠成一个 `Menu`（组件库已有），或允许换行 + 限宽。与 N-34（触屏工具不可达）同一处改。
**代价** 中（要重排断点契约与 `surfaces:check` 名单）

---

### N-19 `[子代理]` 跟随状态与启动失败无回声 — 中（铁律 2）

- 笔记被删除后仍显示旧快照，而「跟随」图标**照常亮**（`presentation-state.ts:20-24` 刻意保留最后快照，这个行为是对的；但 UI 没把「已冻结」告诉用户）
- `startPresentationFromNote()` 返回 `false` 被两个调用方丢弃（`start-presentation.ts:15-23`；`use-workspace.ts:311`、`command-palette/use-commands.tsx:107` 都是 `void`）
- 弹窗被拦见 N-06

**修复方案** 快照失效即把图标切到「已冻结」并 toast；`false` 回执走 toast。
**代价** 中

---

### N-20 `[子代理]` 激光笔开启后全屏无光标且无残留指示 — 中（a11y）

**证据** `presentation-overlay.tsx:66` 的 `cursor-none`、`styles/presentation.css:137`、`presentation-pointer.tsx:33-41`（要点一次 `pointermove` 才落位）。键盘用户或指针静止时，屏幕上既没有光标也没有「激光笔开着」的痕迹。
**修复方案** 胶囊保留开启态高亮；键盘给一个默认落点（画面中心）。
**代价** 低

---

### N-21 `[已复核]` 死参数与冗余 ARIA 状态 — 低（铁律 5）

- `presentation-controls.tsx:159` — `SlideProgress({ index, count, chromeHidden: _chromeHidden })`，唯一调用方 `presentation-overlay.tsx:71` 从不传该参数。P-05 解耦留下的残留。
- `slide-rail.tsx:169-175` — 同一个 tab 同时挂 `aria-selected` 与 `aria-current`，且无对应 `tabpanel`。

**代价** 低

---

### N-22 `[已复核]` 注释与它所标注的函数说的不是一回事 — 低

`use-presentation-session.ts:307-309` 的注释「Renders the enhanced markup off-DOM and caches it per slide; the cache hit is what keeps diagrams alive across any remount of the slide subtree」挂在 `useDeckIndex`（一个纯索引 hook）头上，描述的其实是 `useSlideHtml` 的职责。本仓把注释当承重结构（大量「为什么」注释），错位注释比没注释更危险。
**代价** 低

---

## 五、性能

### N-23 `[已复核]` 缓存上限小于量测目标规模，长 deck 的整趟量测被自己挤掉 — 高

**证据**
- `slide-html.ts:31` `SLIDE_HTML_CACHE_LIMIT = 60`；`:35` `SLIDE_PLAN_CACHE_LIMIT = 120`
- `slide-preflight.tsx:185`、`:214` — 量测按 `deck.length` 全篇跑，不为 60 停下
- 机理：LRU 逐条淘汰（`slide-html.ts:43-45` 的 `while (size > LIMIT)` 取 `keys().next()`）→ 跑到第 61 页时第 1 页的已渲染标记已被挤出 → 侧栏开头与回看全部 miss，缩略图退回首渲染（丢导图、丢 plan 无法切片）
- 这正好击穿该缓存自己注释声明的用途（`slide-html.ts:26-29`：「重挂载时复用上次的 html，而不是把图退回到 loading 占位」）

**修复方案** 上限随 deck 规模（`Math.max(60, deck.length)`）或改字节预算；plan 缓存同理对齐到 `max(120, deck.length)`。
**代价** 中（要评估内存上界，可加「按 surface 分级保留」：舞台与侧栏必留，导出页逐条释放）
**验证** 单测：250 页跑完，断言 `readSlideHtml(cacheKeys[0])` 仍命中

---

### N-24 `[子代理]` PNG 导出是 O(页数 × 全量 CSS)，且每页新建大 canvas — 高 `[需实测]`

**证据链** `[子代理]`
- `deck-print.tsx:179-181` → `lib/element-image.ts:24-39,43-44,124-140`：每页把**整份文档样式表**拼进该页 SVG（`css + pad` → `XMLSerializer` → `encodeURIComponent`）。KaTeX CSS 加载后，collector 会顺序 fetch 并把约 60 个字体 base64 内联
- 每页新建 2560×1440 canvas（约 14.7MB 后备存储），不复用、不显式释放；PNG blob 全部攒到 zip（`deck-print.tsx:176-184`）

**修复方案** 只内联本页真正用到的 `@font-face`；canvas 复用同一实例并及时置空；blob 增量喂 zip（`client-zip` 支持流式）。
**代价** 高
**验证** 新增 `scripts/measure-deck-export.mjs`（`PAGES` 分档 5/50/150，报 `css.length`、单页墙钟、`performance.memory` 峰值）。**本轮未跑，量级未证实。**

---

### N-25 `[已复核]` 缓存命中时仍跑一次完整 markdown 渲染，且结果被丢弃 — 中

**证据**
- `slide-canvas.tsx:79-83` 的注释原文：「无条件渲染等于把量测趟过的每一页的 markdown 开销翻倍——缓存命中时那次 plain render 是纯浪费」
- `slide-canvas.tsx:84-87` 的实现：`useMemo(() => renderSlideSource(source, ...), [source, preview.externalImages])` —— 依赖里**没有 `prepared`**，所以注释里声明要避免的那次浪费照样发生
- `slide-canvas.tsx:88` — `const html = prepared?.html ?? fallbackRender.html`，命中时 `fallbackRender` 整个丢弃

**修复方案** 依赖加 `prepared`，命中时短路成常量空对象。
**代价** 低
**验证** spy 渲染器，断言缓存命中时调用数为 0

---

### N-26 `[子代理]` 演讲者 state 每次渲染都广播，无连接也发 — 中

**证据** `use-presenter-channel.ts:170`（`buildPresenterSlideState` 每次渲染返回新对象）→ `:176-183`（effect 依赖 `statePayload`，每次渲染一次 `postMessage`，结构化克隆当前页 + 下一页源码 + plan）。量测每片至少 2 次渲染 → 未连接时也在持续克隆整页源码。
**修复方案** 未收到 `ready` 不建不发；`statePayload` 进 `useMemo`。与 N-04 方案 B 一并设计（B 会让 payload 更大）。
**代价** 低

---

### N-27 `[子代理]` 跟随模式一次编辑约 13ms 纯 JS、4 遍全篇文本扫描 — 中 `[需实测]`

**证据** `[子代理]` 实跑 replica（240KB / 250 页）：`buildDeck` 6.38ms（开映跑 2 次）、全篇 `hashContent` 0.75ms、逐页 hash 1.31ms、`buildIncrementalSlidePlans` 2.83ms。代码位置：`use-presentation-session.ts:293-296`、`:194-199`、`:367-369`；`slide-preflight.tsx:183-193,241`
**机理** 一次编辑要把整篇文本扫 4 遍（切分、全篇指纹、逐页指纹、plan 重建）。P-18 的增量缓存在「改的是 front matter / `slide-level`」时不重量测（成立），但逐页 hash 每次全跑。
**修复方案** 让 `splitIntoSlidesWithNotes` 一并返回逐页 hash，一处算全复用。
**代价** 中

---

### N-28 `[子代理]` 全模块零 `React.memo`，换页与量测片让全部列表项重跑 — 中

**证据** `[子代理]` grep 全模块 `memo(` 命中 0；`slide-rail.tsx:157`、`slide-overview-grid.tsx:157`。`index`/`sub`/`chromeHidden`/`occluded` 任一变 → 所有 entry 项重跑组件函数（memo 命中可让 `slicePageHtml` 不重跑，但 element 创建照跑）；量测每片 `setPlans` 又让 `railEntries` O(E) 重建 → 一趟 O(D×E)。
**修复方案** 给 `SlideRailItem` 与网格卡加 `memo`，或把 `plans` 的订阅细粒度化（已有 `subscribeSlideHtml` 按 key 的先例，`slide-thumb.tsx:128`）。
**代价** 低-中
**验证** `[需实测]` React Profiler 录一次翻页的 commit 时长

---

### N-29 `[已复核]` 三处高频路径未节流 / 未收敛 — 低

- `use-presentation-session.ts:262-287` — 每个 `pointermove` 都 `clearTimeout`+`setTimeout`+`setHidden(false)`，未节流（`AGENTS.md` 明确要求高频事件防抖节流）
- `use-slide-html.ts:27-33,58-66` — deps 含 `content`，改笔记别处会让 effect 重跑、cleanup 置 `cancelled` 杀掉在途增强，而新 run 见已有 plain 渲染即 early return → **增强结果永不落该 key**，缩略图长期停在占位符（代价评 中）
- `use-presentation-keys.ts:126,145,147-151` — actions 字面量每次新 → `run`/`onKeyDown` 每次新 → window keydown 每次 remove+add

---

### N-30 `[子代理]` 全屏进入/失败与富媒体准备失败静默 — 低-中（铁律 2）

- `use-presentation-session.ts:404,409,413` — 全屏请求失败只 `console.debug`，按 `F` 被拒用户无任何反馈；且 debug 级低于 `AGENTS.md` 的 warn/error + `[inkstone]` 前缀基线。**注**：iOS Safari 不支持对非媒体元素调用 `requestFullscreen`，故在 iPad 上放映永远进不了全屏，而 `useChromeAutoHide(open && isFullscreen)`（`:134`）意味着控制条也不会自动隐藏——整个「放映 = 全屏活动」的前提在 iOS 上不成立，且无降级路径。
- `use-slide-html.ts:62` — `void prepare()` 无 catch，`resolveNoteEmbeds`/`enhancePreview` 拒绝即未处理 rejection，该 slide 永久停在图表/公式占位，投影、缩略图、PDF/PNG 四路同时静默降级。

**修复方案** 前者走 toast + 在不支持全屏时改用应用内叠加层（`AGENTS.md`「全屏归属」段已有该模式的先例：导图的 `disarmNativeFullscreen`）；后者 catch + `console.warn` + `role="status"` 提示。
**代价** 小（toast）/ 大（iOS 无全屏路径的完整降级）

---

## 六、功能对标与缺口

### 6.1 对标矩阵（✓ 有 · ✗ 无 · ? 未查到）

| 能力 | reveal.js | Slidev | Marp | Obsidian Advanced Slides | PowerPoint / Keynote / Google Slides | Notion | **Inkstone** | 差距 |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 页内分步揭示（fragment） | ✓ | ✓ (`v-click`) | ✗ | reveal 基础 | ? | ? | **✗** | 高 |
| 演讲者视图（次页+备注+计时） | ✓ | ✓ | ✗ | ? | ✓ | ? | **✓ 但见 N-04/N-05** | 中 |
| 观众/远程同步放映 | ✓ | ✓ | ✗ | ? | ? | ? | **✗** | 高 |
| 私有备注语法 | ✓ | ✓（尾注释） | ✓ | ✓ | ✓ | ? | **✓** | 低 |
| PDF 导出 | ✓ | ✓ | ✓ | ✓ | ✓ | ? | **✓** | 低 |
| 备注页 / handout | ? | ? | ✓ (`--notes`) | ? | ? | ? | **✗** | 中 |
| 独立 HTML deck | ✓ | ✓ | ✓ | ✓ | ? | ? | **✗** | 中 |
| 逐页计时 / 排练 | ? | ? | ? | ? | Keynote ✓ | ? | **✗** | 中 |
| 按标题智能分页 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗（需手写分隔线） | **✓** | **领先** |
| 双栏 / 封面版式 | 部分 | 部分 | 部分 | ? | ✓ | ? | **✓** | 低 |
| 导出图片 ZIP + 进度 | ? | ✓ | ✓ | ? | ✓ | ? | **✓** | 低 |

**Inkstone 领先的一项值得写进 README**：按 H1/H2 智能分页是这 7 家里唯一做到的——其余全部要求作者手写 `---`（Notion 2026-03 刚发布的演示模式也需要手动加分隔线）。

### 6.2 缺口清单（按「价值 ÷ 代价」排序）

| 编号 | 缺口 | 用户故事 | 竞品做法 | 本仓现状（证据） | 方案 | 代价 |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| **N-31** | **页内分步揭示** | 讲 40 页技术分享，架构图/对比表想逐层揭，现在整页一次出现，只能靠黑屏糊过去 | [reveal.js fragments](https://revealjs.com/fragments/)、[Slidev `v-click`](https://sli.dev/guide/syntax)（Marp 刻意不做） | `presentationCommand` 无 fragment；`goNext` 只走子页（`use-presentation-session.ts:330-336`） | 沿用注释指令族 `<!-- steps -->`（与 `takeLayoutDirective` 并排加 `takeStepDirective`），步数进 `SlidePlan`，顺序 = 步 → 子页 → 下一页；隐藏沿用 `applySlidePage` 的 visibility 法。**导出必须按步展开**（照 Slidev `--with-clicks` 一页一态），缩略图/全览取末态，`role="status"` 播报，两语文案 | 中-高 |
| **N-32** | **handout / 备注页导出 + 导出页无页码** | 评审后听众要「缩图 + 讲稿」的 PDF | Marp CLI `--notes`、Advanced Slides 的 PDF 输出 | `splitIntoSlidesWithNotes` 已成对给出 notes（`slides.ts:258`）但 `DeckExportOptions` 根本不带（`deck-export.ts:20-29`）；放映有角落页码（`presentation-stage.tsx:110-117`）而导出页无（`styles/presentation.css:69-112`）→ **所见 ≠ 所印** | 给 `DeckSheet` 加 `variant: 'pages' \| 'notes'`，复用 `formatMicroPage`。分页结果与已渲染标记与放映同源（`AGENTS.md`「演示模式导出」段已确立这条架构） | **低**（性价比最高的一个） |
| **N-33** | **独立 HTML deck 导出** | 把 deck 发给不用 Inkstone 的人，双击就能放 | Marp / Advanced Slides 都把 HTML 当一等输出 | 无 | `collectDeckCss()` 已能自取样式（`deck-image.ts:31`），补一小段导航 script。**附件与外链必须绝对化**；不引新依赖（铁律 8） | 中 |
| **N-34** | **观众侧同步放映** | 远程/混合场次，观众在自己设备上跟页 | [reveal.js multiplex](https://revealjs.com/multiplex/) 明写 "everyone will follow… on their own device" | 分享与集合路由不挂放映（`app.tsx:174-211`；overlay 只在已登录 shell `app-shell.tsx:59`） | `/s/<slug>?present=1` 复用 `SlideRail` + 画布，页位走 URL hash 或既有轮询基座。**这是公共契约变更**：要走 deprecation 周期，且 `ADR-0003`（访客会话）/`ADR-0005`（公开集合）的口令、有效期、访客分析口径需重判，还要限速与缓存头 | 高 |
| **N-35** | **触屏拿不到四个工具** | 用 iPad 放映，激光笔/聚光灯/黑屏/白屏全不可达 | 主流 Web deck 在触屏上给的是长按菜单或工具条 | 控制条只有列表/全览/演讲者/跟随/全屏/导出（`presentation-controls.tsx:73-101`），那四把只绑字母键（`presentation-keys.ts:56-68`）与右键菜单（触屏无右键） | 胶囊在触屏断点下多收进一个 `Menu`（与 N-18 同一处改） | 中 |

---

## 七、富媒体在放映中的信息量

### N-36 `[已复核]` 看板在所有放映表面退化成「标题 + 圆点列表」（用户截图所见）— 高

**定性：这是设计本意，不是兜底失败——但取舍选错了场合。**

**证据链**
- `use-slide-html.ts:47` 与 `deck-print.tsx:200` 的 `kanban: 'snapshot'` → `enhance/index.ts:93-94` → `kanban/static.ts:93` `renderStaticKanbans` → `snapshotNode`
- 产物结构：`<div class="kanban-snapshot">` + `.kanban-snapshot-title`（取 `data.title`，即截图里的 "Kanban"）+ `<dl>`，每组一个 `<dt>`（未开始/进行中/已完成）配 `<ul class="kanban-snapshot-cards"><li>卡片标题</li></ul>`；CSS 明写 `list-style: disc` 且组为 `flex-direction: column`（`styles/kanban.css:111-134`）
- 截图里那个 `JSON` 徽标是栅栏自带的 `.kanban-block-mode`（`renderer/fence.ts:215`）
- **反证**（兜底态是另一种长相）：源码态是 `<pre><code>`（`kanban/view.ts:172-183`）、错误态带「重试」按钮（`view.ts:143-164`）、加载态是 `aria-busy` 占位（`fence.ts:220`）——都不是截图那个形态
- `kanban/static.ts:1-8` 的文件头注释**自己把「a slide」列进了它服务的通道**：「an exported document, a shared note, **a slide**, a link hover card, the editor's live preview」

**丢失的信息** `kanban/static.ts:31` 只取 `item.title`。`types.ts:104-212` 里的 `subtasks` / `properties` / `labels` / `cover` / `description` / `comments` / `dependsOn`，以及 `view.type` / `sorts` / `filters` / `cardFields` / `sumBy` / `swimlaneBy` **全部不读**；列是纵向堆叠的 `<dt>`，不是并排的看板列。

**判断** 该通道为「文档/分享」设计——那里一段列表是合理的静态可读形式，且注释明说「filters 刻意不应用，因为静图没有控件告诉读者它看的是子集」，这是清醒的取舍。但**同一份输出被用在 16:9 投影上**时取舍不成立：投影的全部价值就是视觉信息密度，而这里恰好把看板的视觉信息全丢了。

**修复方案** 加一个 `snapshot: 'board'` 变体，专供放映与导出：列**横向并排**、状态列用列底色、卡片显示 `cardFields` 声明的字段（优先级点、标签色条、子任务 `3/5` 进度、封面缩略图）。不读 `filters`（沿用既有取舍），但读 `groupBy` 与 `sorts`。
**涉及文件** `kanban/static.ts`、`snapshot` 通道选择点（`use-slide-html.ts:47`、`deck-print.tsx:200`）、`styles/kanban.css`、kanban 相关测试
**代价** 中
**验证** 用用户截图那张板：断言放映里出现 3 个并排列 + 每列底色 + 子任务进度

---

### N-37 `[子代理]` 舞台上的死控件吞掉翻页点击，且不告知「放映中不可交互」— 中

**证据** `presentation-stage.tsx:69` — `closest('button')` 命中即 `return`，于是点导图/看板的头部控件既不做事也不翻页（用户以为卡住）。`removeHeadControls` 只在**降级态**调用（`mindmap/view.ts:151-153` vs `:239/:256`、`excalidraw/view.ts:130-136/154`），成功路径没删；`slide-canvas.tsx:288-296` 未删 bento 的全屏钮。locales 里无「放映中不可交互」文案。
**修复方案** 成功路径统一删头部控件；复制/运行改走 slide 级代理（或明确保留但让它真能用）。
**代价** 小

---

### N-38 `[子代理]` 导出兜底不画 bento-slides；未量测页只印 1 页 — 中 / 低-中

- `deck-print.tsx:194-214` 无 slides 通道（只有 `slide-canvas.tsx:95` 处理）→ 未被量测的 slide 印出「加载中」
- `deck-print.tsx:32-40` + `use-presentation-session.ts:138` 不看 `listProgress.finished` → 导出早于量测完成时，未测 slide 只印 1 页，页序与放映不一致

**修复方案** `prepareDeckSheet` 内同调 slides 快照；导出前若 `!finished` 给一次提示或补测当前可见范围。
**代价** 小

---

## 八、台账既有未闭环项（上一轮已记，本轮确认仍在）

### L-1 `B4-09` 本机浏览器门禁 7 条红，未定位 — 高（含放映表面自身的 a11y 违规）

`plan-with-agy-1.md:301-303` 记录，本轮确认对应断言仍在原位、对应缺陷代码仍在：

| 断言 | 位置 | 本轮补充 |
| :-- | :-- | :-- |
| `presentation: canvas fills the stage` | `scripts/e2e-visual.mjs:428` | 无 detail 输出。**这条说的是舞台画幅没铺满**——是放映的核心几何，不是边缘用例 |
| `presentation session: the canvas refills the stage` | `:490` | 同上 |
| `presentation pages: a thumbnail renders the markup the projector prepared` 及其后 2 条 | `:573` 等 | 缩略图静帧没画出来（`katex=0/charts=0/painted=0`、`pixels=-1`）——与 N-23 的缓存淘汰机理高度相关，建议一并查 |
| `a11y: the presentation overlay has no axe violations` | `:635` | 报的是 `.bottom-4` 角落页码片 1.67:1。本轮 N-16 确认该裸类名**仍在** `presentation-stage.tsx:112`，且 `opacity-35` 加剧了它。**即 L-1 的这条 a11y 红与 N-11 / N-16 是同一个元素的同一个问题**，修那两条会顺带解掉它 |

**判定依据（沿用台账）**：对同一 HEAD 快照以同法实跑得到同样 7 个失败名 → 非本分支引入。**本轮未实跑，该判定为 `[历史/子代理]`。**
**建议** 先给两条 `canvas fills the stage` 补 detail（无 detail 谈不
上定位——把实测的 `stage/w × h` 与 `canvas/w × h` 和 `getBoundingClientRect` 一起打出来），再按三条线索分头查：(a) 几何两条是否与 N-23 的缓存淘汰同因（量测跑不完 → 页高未定 → 画幅不铺满）；(b) 缩略图三条与 N-23/N-25 同一次改动里复测；(c) a11y 那条直接由 N-11/N-16 的修改解掉，解掉后这条红应自动转绿，可作为「N-16 确实修对了」的证据。
**代价** 中（补 detail 小，定位取决于前三条能否顺出因果）

### L-2 `B4-10` `AGENTS.md` 的视觉门禁断言计数已过期 — 低（文档准确性）

**现象** `AGENTS.md:372` 仍写 `scripts/e2e-visual.mjs`「当前 380 条断言」。
**证据** `plan-with-agy-1.md:304-306`：本分支 HEAD 快照实跑 682 → B4-02 后 694 → B4-11 后 717 → B4-03 后 717（710 通过 + 7 既有红）。
**本轮确认** `[已复核]`：`AGENTS.md:372` 的那句仍是 380，且本轮为放映新增的断言（若按 §九 落地）还会继续推高它。
**修复方案** 单独一次 `docs` 提交更新计数，并按台账要求「以那次实跑为准」——不要在功能批次里夹带（`AGENTS.md` 自述需 PR 评审）。
**代价** 极低

---

## 九、优先级矩阵与批次划分

沿用上一轮约定：**一个条目一个原子提交**，每条各自先留红、再变异、再补断言；重型门禁（`test:e2e`、`contrast:check`、`e2e-visual`）按批跑一次，静态门禁每批必跑。条目 id 直接沿用本报告的 `N-xx` / `L-x`，见 `plan-with-qoder-1.md`。

| 批次 | 主题 | 覆盖条目 | 合计代价 | 前置 / 依赖 | 备注 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **R2-1** | 分页语义正确性 | N-01、N-02、N-03 | 中 | 无 | **最先做**。N-01 会改变既有 deck 的页数，后续所有页数断言与缩略图/导出场景都要以它为新基线 |
| **R2-2** | 安全与链接处理 | N-07、N-08、N-09、N-10 | 小-中 | 无 | N-08/N-09/N-10 是同一族链接逻辑，共用一次协议白名单改动 + 同一组测试夹具 |
| **R2-3** | 演讲者模式完整交付 | N-04、N-05、N-06、N-26 | 中-高 | 无（R2-2 的通道鉴权会被 N-04/N-26 复用） | 集中在 `presenter-view/`；N-04 要抽一个「增强链」共用函数，别在 presenter 里复制第二遍 |
| **R2-4** | 信息层 / a11y / 合规残留 | N-11、N-13、N-16、N-12、N-14、N-19、N-15、N-20、N-21、N-30 | 中 | N-11 与 N-13 必须同提交（同一个 `aria-live` 结构）；N-16 是 N-11 的收尾 | **顺带解掉 L-1 的 axe 红**。N-22（注释错位）随本批的低风险清理一并改 |
| **R2-5** | 性能治理 | N-23、N-25、N-28、N-29、N-27、N-24 | 中-高 | 依赖 R2-1（页数变了量测目标规模才准） | N-24/N-27 先补测量脚本（照 `scripts/measure-*.mjs` 三个既有脚本的写法），**拿到数字再改** |
| **R2-6** | 信息量与功能补全 | N-36、N-32、N-37、N-38、N-17、N-18 + N-35、N-31、N-33 | 低 → 高（按此顺序） | N-32 依赖 R2-1；N-31 依赖 R2-1 + R2-4 的播报结构；N-18 与 N-35 同一处改动 | **N-32 是全场性价比最高的一条**（低代价、直接补上「所见 ≠ 所印」)；N-36 直接对上用户截图 |
| **R2-7** | 公共契约（需评审） | N-34 | 高 | 需先写 ADR；`ADR-0003`/`ADR-0005` 的访客会话与公开集合口径要重判 | 走「deprecation 标记 + 迁移窗口」，**不要塞进任何功能批次** |
| **收尾** | 文档与台账 | L-1（定位）、L-2（计数） | 低-中 | L-1 依赖 R2-4；L-2 依赖全部批次实跑 | 各一次独立 `docs`/`infra` 提交 |

### 如果只修三件事

1. **N-01**（分页器与渲染器对分隔线判定不一致）——它决定「用户写的东西到底算几页」，是其余一切的地基，且是纯正确性缺陷。
2. **N-07 + N-08**（演讲者通道无鉴权、右键菜单绕过协议白名单）——安全红线不允许例外（铁律 1）。
3. **N-11 + N-36 + N-12**（页码四套并存、看板退化成圆点列表、导出提示被压住）——这三条正是用户两张截图里看得见的东西。

---

## 十、未证实 / 需实测清单

以下条目**证据链不完整**，落地前必须先实测；表中给出建议的测法（沿用仓库既有的 `scripts/measure-*.mjs` 手动验收脚本惯例，不进 CI）。

| 条目 | 未证实的部分 | 建议测法 | 判定阈值来源 |
| :-- | :-- | :-- | :-- |
| N-02 | 「超大单块缩排后在 1080p  projector 上不可读」的实际缩放比 | 造一个 8000px 高的单块 slide，读 `scales[from]` 与最终 `transform` | 需要新阈值（正文最小可读字号） |
| N-24 | PNG 导出的真实内存峰值与耗时量级 | `measure-deck-export.mjs`：对 20 / 60 / 150 页各跑一遍，记 `performance.memory` 峰值、总时长、最坏单帧 | 需要新预算 |
| N-27 | 跟随模式一次击键的实际 JS 耗时与「4 遍全篇扫描」是否可在 60fps 内感知 | 复用 `measure-preflight.mjs` 的窗口法，对 200KB 笔记逐键输入 | 现有 `SLICE_BUDGET_MS` 可作对照 |
| N-28 | 一次换页 / 一片量测让多少列表项重跑、单次提交实际多长 | React Profiler + `PerformanceObserver('longtask')`，同 `measure-kanban.mjs` 的 `WORST_TASK_MAX` 口径 | 该脚本已有 50ms 口径可沿用 |
| N-29 | 全屏监听 / resize 未节流的可测后果 | 拖窗口连续 resize 200 次，数 `applySlidePage` 调用次数 | — |
| N-23 | 缓存淘汰对长 deck 量测的实际挤兑程度、以及它是否就是 L-1 那三条缩略图红的成因 | 用同一份 60 页 deck：先复现红，再把 `SLIDE_HTML_CACHE_LIMIT`/`SLIDE_PLAN_CACHE_LIMIT` 提到 200/400 复跑对比 | **这是把 N-23 与 L-1 连起来的那次实验** |
| N-31 | 分步揭示与自动分页交互时的步序正确性 | 需先有实现才能测——列为该批次的验收断言设计项 | — |
| N-33 | 独立 HTML deck 里的附件与外链绝对化后能否离线播放 | 断网双击产物 | — |
| N-36 | 横向并排看板在窄屏 projector（1366×768）上的可读性 | 与本表 N-02 同一次打开里加一块 5 列板 | 新阈值 |
| 未列编号 | `transform: scale()` 下的图表 tooltip / 悬停定位是否偏移 | 浏览器里真实悬停一个 Chart.js 块读 tooltip 坐标 | 本轮无法判定（jsdom 不布局） |
| 未列编号 | PNG 导出是否丢 `<img>`（`element-image.ts:24-39` 与 `:74-96` 两条路径行为不同） | 造含外链图的 slide，导出后解包数 `data:` 与 `<image href>` | 本轮仅静态读码 |
| 未列编号 | `client-zip` 是否落在首屏 boot chunk（影响放映启动） | `npm run build` 后读 bundle 归属 | — |

---

## 十一、本轮局限（读完这段再用本报告）

1. **没有跑过任何浏览器或 dev server**。本轮全部为静态读码 + `node -e` 纯函数复现 + 静态门禁复跑。因此：**一切几何结论（画幅铺不铺满、缩略图有没有画出来、胶囊溢出多少、对比度实际比值）都未经实测**，L-1 的七条红本轮也未复跑，其「非本分支引入」的判定沿用台账（`[历史/子代理]`）。
2. **性能条目的数字都是推算或来自子代理读码**（N-24/N-27/N-28/N-29 标了 `[需实测]`）。报告没有引用任何一次实测日志，因为本轮没有产生日志。
3. **静态门禁全绿不等于合规**：本轮确认 `hardcoded:check` / `style:check` / `tokens:check` 不解析裸 Tailwind 阶梯类名与裸 `z-N`，所以 N-16 那类残留在「8 项门禁通过」的状态下依然存在——这是门禁盲区，不是判例错误。修 N-16 时建议同时评估是否把它做成可强制的（`AGENTS.md`「能工具强制的不靠人记」）。
4. **子代理结论已按高危项逐条复核**：标 `[已复核]` 的 20 条是我本人重读引用行后确认的；标 `[子代理]` 的条目证据行号来自它们的报告，方向可信但**具体行号在合并前需再核一次**（本轮已发现一处行号偏移）。
5. **对标矩阵里的 `?` 是「未查到」不是「没有」**，采用前需回源确认；竞品链接已给出。
6. **未覆盖范围**：`blog-frontend`、分享页放映、移动端放映手势、以及 R2-7 之外的服务端配合改动，本轮未审。
7. 本报告**不含代码改动**，只含定位与方案。落地时请为每条生成或复用红→绿证据链，并按 §九 的批次划分原子提交。