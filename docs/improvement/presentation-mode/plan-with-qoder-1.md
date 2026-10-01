# 全笔记演示模式整改执行计划 · 第二轮 (Qoder · 2026-10-02)

> 依据：`docs/improvement/presentation-mode/review-with-qoder-1.md`（第二轮复审报告，33 条缺陷 + 5 条功能缺口）。  
> 上一轮：`review-with-agy-1.md` / `plan-with-agy-1.md`（P-01 ~ P-29 已全部闭环，台账遗留 B4-09、B4-10 两项，本计划收作 L-1、L-2）。  
> 基线 Commit：`03628a57707b9d9d9335ba9316f3af99bbdcbe8b`  
> 分支：`improvement/presentation-mode-agy`  
> 约定：
> 1. 每个条目 = 一个原子提交，条目 id 直接沿用报告的 `N-xx` / `L-x`，不再另起编号，避免两套账；
> 2. 严格遵守 `AGENTS.md`（Conventional Commits + 逐文件说明改动到方法/组件级）；
> 3. 每个提交必跑静态门禁全集 + 相关单元测试 + `typecheck`；**重型门禁（`test:e2e`、`e2e-visual.mjs`、`contrast:check`）按批次跑一次**，不在每个条目上重复；
> 4. 修 bug 先留红：每个条目先写能复现的失败用例，再改实现（`AGENTS.md`「测试」段）；
> 5. **每一次提交 git 都要实时更新本文件**（进度勾选、commit 短哈希、执行日志）；
> 6. 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash） · `[-]` 已证伪 / 已跳过（附理由）；
> 7. 报告 §十 标了 `[需实测]` 的条目，先按该表补测量脚本拿到数字，再决定是否改——**不许用推算值当验收阈值**。

---

## 进度总览

| 批次 | 主题 | 覆盖条目 | 代价 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **R2-0** | 文档基线 | 本报告与执行计划 | 极低 | `[x]` 已提交 (`48e645b5`) |
| **R2-1** | 分页语义正确性 | N-01, N-02, N-03 | 中 | `[ ]` 待办（**最先做**，其余批次的页数断言以它为新基线） |
| **R2-2** | 安全与链接处理 | N-07, N-08, N-09, N-10 | 小-中 | `[ ]` 待办 |
| **R2-3** | 演讲者模式完整交付 | N-04, N-05, N-06, N-26 | 中-高 | `[ ]` 待办 |
| **R2-4** | 信息层 / a11y / 合规残留 | N-11, N-13, N-16, N-12, N-14, N-19, N-15, N-20, N-21, N-22, N-30 | 中 | `[ ]` 待办（顺带解 L-1 的 axe 红） |
| **R2-5** | 性能治理 | N-23, N-25, N-27, N-28, N-29, N-24 | 中-高 | `[ ]` 待办（依赖 R2-1） |
| **R2-6** | 信息量与功能补全 | N-36, N-32, N-37, N-38, N-17, N-18+N-35, N-31, N-33 | 低 → 高 | `[ ]` 待办（按此顺序做） |
| **R2-7** | 观众侧同步放映 | N-34 | 高 | `[ ]` 待办（**公共契约变更，先写 ADR**） |
| **收尾** | 台账与文档 | L-1, L-2 | 低-中 | `[ ]` 待办 |

**若只允许做三件事**：N-01（地基性正确性）· N-07+N-08（安全红线，`AGENTS.md` 不允许例外）· N-11+N-36+N-12（用户两张截图里直接可见的三项）。

---

## 批次 R2-1 · 分页语义正确性

- [ ] **N-01** 分页器与渲染器对「分隔线」的判定不一致（`高`）
  - 涉及文件：`src/client/features/presentation/slides.ts`（`SLIDE_BREAK`、`classifyLine`、`scanBoundaries`）、`slides.test.ts`、`src/client/features/presentation/README.md` / `README_ZH.md`、`scripts/check-comments.mjs`
  - 目标：让分页器接受渲染器实际会画成 `<hr>` 的全部写法（`---`/`***`/`___`/`- - -`），且不再把「标题行 + `---`」这种 setext 写法误判为切页；两边规则须由同一份谓词给出，杜绝再次漂移。
  - 验证：新增表驱动用例覆盖五种分隔线写法 × 「在标题下 / 在段落下」两种上下文，断言分页器切页数与 markdown-it 的 `<hr>` 判定一致（本轮 `node -e` 的对照表即为用例来源）；随后重跑所有页数基线断言。
  - 代价：中（改动本身小，难在差分基线要重跑）
- [ ] **N-02** 超大单块整体缩排而不续页（`中`）
  - 涉及文件：`slide-pagination.ts`、`slide-canvas.tsx`、`slide-pagination.test.ts`
  - 目标：给缩放设下限 `MIN_FIT_SCALE`（取投影可读的比值，落地前按报告 §十 实测确认）；低于下限改走「块内续页」——表格按 `<tr>`、代码块按行、列表按 `<li>` 断。
  - 验证：构造超界表格/代码块/列表三类各一例，断言不再出现低于下限的 scale，且续页后总页数与页序确定。
  - 代价：中 · 依赖：N-01
- [ ] **N-03** 分割线分页与标题分页互斥、且无关闭自动分页的取值（`中`）
  - 涉及文件：`slides.ts`（`buildDeck`、`dividerBoundaries`、`slideLevelOf`）、`slides.test.ts`、README 两版
  - 目标：两种边界取并集去重后一起排序；front matter 支持 `slide-level: none` 显式关闭标题分页。
  - 验证：混写 `---` 与标题的 deck 断言页数 = 并集；`slide-level: none` 断言只按分隔线切。
  - 代价：小-中 · 依赖：N-01

**批次收尾**：重跑 `npm run test:unit` + `test:e2e` + `e2e-visual.mjs` 各一次（页数基线在本批整体位移）。

---

## 批次 R2-2 · 安全与链接处理

- [ ] **N-07** 演讲者通道可被同源任意文档读取与改写（`高` · 安全）
  - 涉及文件：`presenter-view/use-presenter-channel.ts`、`src/client/app.tsx`（presenter 路由）、`presenter-view/presenter-window.tsx`、`use-presenter-channel.test.ts`
  - 目标：`ready`→`sync` 与 `command`→nav 现在无任何来源校验；改为一次性会话令牌（`start()` 时生成，随 `openPresenterWindow` 的 URL 传给新窗口），无令牌的 `ready`/`command` 一律忽略并 `console.warn`。频道名不再固定常量。
  - 验证：新增用例断言「不带令牌的 ready 不回 sync」「带错误令牌的 command 不动页」；私有备注不出现在无令牌会话里。
  - 代价：中
- [ ] **N-08** 右键菜单的链接动作绕过左键那套协议白名单（`中高` · 安全）
  - 涉及文件：`presentation-state.ts`、`presentation-context-menu.tsx`、两侧测试
  - 目标：把 `interceptSlideLink` 的协议判定抽成 `isSafeSlideLinkHref(href): boolean` 纯函数，左键与右键共用；右键侧对非白名单 href 不渲染这两项。
  - 验证：`javascript:` / `data:` 链接在菜单里不出现「打开链接」，纯函数表驱动用例。
  - 代价：小 · 依赖：N-10（同一份谓词）
- [ ] **N-09** 右键菜单可穿透解析到放映画面之外的链接（`中` · 安全/正确性）
  - 涉及文件：`presentation-context-menu.tsx`、`presentation-context-menu.test.ts`
  - 目标：命中栈只取第一个非背板元素，并加 `panelRef.current.contains(el)` 约束，不再全栈搜索。
  - 验证：在遮罩外放一个链接、遮罩内画面无链接，断言菜单不提供「打开链接」。
  - 代价：小
- [ ] **N-10** 链接协议判定大小写敏感、非白名单链接静默失效（`中` · 正确性）
  - 涉及文件：`presentation-state.ts`、`slide-canvas.tsx`、`src/shared/locales/{en-US,zh-CN}/workspace.ts`
  - 目标：比较先 `toLowerCase()`；被拦下的非白名单链接给一次 toast（复用 `useUi`，同模块用法见 `deck-print.tsx:101`）。
  - 验证：`HTTP://` 大写链接仍可翻页内跳转；`mailto:` 之类断言有 toast 而非无声。
  - 代价：小

---

## 批次 R2-3 · 演讲者模式完整交付

- [ ] **N-04** 演讲者窗口的当前页/下一页完全不跑富媒体增强（`高`）
  - 涉及文件：`presenter-view/presenter-window.tsx`、`presenter-view/use-presenter-channel.ts`、`slide-html.ts`、`presenter-view/*.test.ts`
  - 目标：`slideMarkup(renderSlideSource(...))` 缺 `enhancePreview`/`renderChartJs`/`renderPendingMermaid`/`renderMath`。二选一并写明理由：A 演讲者侧补齐增强链；B 让广播载荷直接携带放映侧已渲染的 HTML。**选 B 须与 N-26 一并设计**（payload 更大）。
  - 验证：演讲者窗里断言出现 `svg`/katex 节点而非占位块（jsdom 可断言 DOM 标记，几何留给 e2e）。
  - 代价：中
- [ ] **N-05** 计时从应用启动起算且跨场次不复位（`高`）
  - 涉及文件：`src/client/store/presentation.ts`、`use-presentation-session.ts`、`presenter-view/*`
  - 目标：`startedAt` 随「本次放映开始」复位——在 store 的 `start()` 里记 `startedAt: Date.now()`，session 从 store 读而非自己 `useRef`；接上 B4-05 已有的 `accumulatedMs` 增量模型。
  - 验证：单测断言第二次 `start()` 后 `startedAt` 变化；跨场次不累加。
  - 代价：小
- [ ] **N-06** 弹窗被拦截时静默失败、且无内嵌降级（`中高`）
  - 涉及文件：`presenter-view/`、`presentation-controls.tsx`、locales 两版
  - 目标：`openPresenterWindow()` 返回 `null` 时开内嵌演讲者面板 + toast 说明原因。内嵌面板必须落在 `AGENTS.md`「工具栏展开」段的四种合格去处之一（建议「独立一列」，与大纲/反向链接同类）。
  - 验证：stub `window.open` 返回 null，断言面板挂载且 toast 出现；`surfaces:check` 名单同步。
  - 代价：中
- [ ] **N-26** 演讲者 state 每次渲染都广播、无连接也发（`中`）
  - 涉及文件：`presenter-view/use-presenter-channel.ts`
  - 目标：未收到 `ready` 不建连接也不发；`statePayload` 进 `useMemo`。
  - 验证：无 presenter 窗口时断言 postMessage 调用数为 0；渲染次数与广播次数解耦。
  - 代价：低 · 依赖：与 N-04 的方案选择联动

---

## 批次 R2-4 · 信息层 / a11y / 合规残留

- [ ] **N-11** 页码在四处各写一套，截图里两个数字并排不可分辨（`高`）
  - 涉及文件：`presentation-controls.tsx`、`presentation-stage.tsx`、`slide-rail.tsx`、`slide-thumb.tsx`（`pageLabel`）、`presentation-state.ts`
  - 目标：一处派生函数出「幻灯片号 + 子页号」，子页芯片移到步进按钮**左侧**并统一为 `3 · 2/4` 这类可分辨形态；角落页码片与缩略图标签同源。
  - 验证：断言同一页在四个表面上读出的字符串由同一函数派生；`SlideProgress` 的口径问题并入 N-21 处理。
  - 代价：低（改动小，测试多）· **与 N-13 必须同提交**
- [ ] **N-13** 翻页对读屏是裸数字、两个相邻 live region 各报一遍（`高` · a11y）
  - 涉及文件：`presentation-controls.tsx`、`presentation-controls.test.ts`
  - 目标：可见数字 `aria-hidden`，旁挂一个 `sr-only` 整句 live region（用已有的 `presentation_slide_page_number` / `presentation_page_of` 键）。
  - 验证：断言只有一个 `aria-live` 区域且其文本含「幻灯片 3，共 14，第 2 子页」。
  - 代价：低 · 依赖：N-11
- [ ] **N-16** 裸 Tailwind 阶梯值与裸 `z-index` 残留（`中` · 铁律 4/12）
  - 涉及文件：`presentation-stage.tsx:112` 等各处 + `scripts/check-hardcoded.mjs`
  - 目标：①逐处换令牌；②给 `hardcoded:check` 补一条 Tailwind 阶梯类规则（`p-N`/`px-N`/`py-N`/`m*-N`/`h-N`/`w-N`/`bottom-N`/`z-N`/`gap-N`），否则第四次还会漏。
  - 验证：门禁新规则对已知样例变异必杀；`contrast:check` 里放映表面的 axe 1.67:1 红转绿（即 L-1 的第 4 条）。
  - 代价：低（改动）+ 中（门禁）· 依赖：N-11
- [ ] **N-12** 导出进度提示被放映面板压住（`高`）
  - 涉及文件：`presentation-overlay.tsx`、`deck-print.tsx`、`styles/presentation.css`、`deck-print.test.ts`
  - 目标：进度提示移进 `PresentationDialog`（与 `ScreenCover`/`LaserPointer` 同级），层级走 `--z-toast` 令牌而非裸 `z-50`；「导出图片」按钮就地加 Spinner，让反馈不依赖浮层层序。
  - 验证：`e2e-visual.mjs` 断言点导出后提示元素实际可见（几何非零、不被遮挡）。这是 `AGENTS.md`「可见浮层绘制堆栈」的第三次违反，规则本身也应在本条落进门禁或 review 清单。
  - 代价：低
- [ ] **N-14** 黑屏/白屏遮罩是非语义控件、`aria-label` 硬编码英文（`中高` · 铁律 10 / i18n）
  - 涉及文件：`presentation-stage.tsx`（`ScreenCover`）、locales（`workspace.presentation_blackout` / `_whiteout` 两语已存在，直接接上）
  - 目标：改成铺满的 `<button type="button">`，`aria-label={t(...)}`；遮罩升起/解除用 `role="status"` 播报。
  - 验证：键盘 Enter/Space 解除遮罩；`i18n:check` 通过且源码内无中文字面量。
  - 代价：低
- [ ] **N-19** 跟随状态与启动失败无回声（`中` · 铁律 2）
  - 涉及文件：`use-presentation-session.ts`、`presentation-controls.tsx`、locales
  - 目标：快照失效即把图标切到「已冻结」并 toast；`start()` 返回 `false` 走 toast。
  - 代价：中
- [ ] **N-15** 开放映后焦点默认落侧栏 tab，方向键与空格全部失效（`中高`）
  - 涉及文件：`presentation-overlay.tsx`（`useDialogBehavior`）、焦点契约测试、`e2e-visual.mjs`
  - 目标：初始焦点落在控制胶囊而非侧栏（同时改善 N-11「用户不知道从哪开始」）。
  - 代价：中（要重跑焦点契约测试）
- [ ] **N-20** 激光笔开启后全屏无光标且无残留指示（`中` · a11y）
  - 涉及文件：`presentation-stage.tsx`（`LaserPointer`）、`presentation-controls.tsx`
  - 目标：胶囊保留开启态高亮；键盘给一个默认落点（画面中心）。
  - 代价：低
- [ ] **N-21** 死参数与冗余 ARIA 状态（`低` · 铁律 5）
  - 涉及文件：`presentation-controls.tsx`（`SlideProgress` 的 `chromeHidden: _chromeHidden`）、`use-presentation-session.ts:307-309`（错位注释）
  - 目标：删死参数；`SlideProgress` 改为按**页**而非按**幻灯片**计数（否则 1 页 deck 进度条恒为 100%）。
  - 代价：低
- [ ] **N-22** 注释与它所标注的函数说的不是一回事（`低`）
  - 涉及文件：`use-presentation-session.ts`
  - 代价：低
- [ ] **N-30** 全屏进入/失败与富媒体准备失败静默（`低-中` · 铁律 2）
  - 涉及文件：`use-presentation-session.ts`（`report()` 只 `console.debug`）、`enhance` 失败路径、locales
  - 目标：toast + 不支持全屏时改用应用内叠加层（先例见导图 `disarmNativeFullscreen`）；富媒体 catch + `console.warn` + `role="status"`。
  - 代价：小（toast）/ 大（iOS 无全屏路径的完整降级）——**本条只做小的一半**，iOS 降级若要做须单开条目。

---

## 批次 R2-5 · 性能治理

> 本批的 N-24/N-27/N-28 依报告 §十：**先补 `scripts/measure-*.mjs` 风格的测量脚本拿到数字**，再改；测量脚本本身作为独立提交进仓（手动验收脚本，不进 CI）。

- [ ] **N-23** 缓存上限小于量测目标规模，长 deck 整趟量测被自己挤掉（`高`）
  - 涉及文件：`slide-html.ts`（`SLIDE_HTML_CACHE_LIMIT=60`、`SLIDE_PLAN_CACHE_LIMIT=120`）、`slide-html.test.ts`
  - 目标：上限随 deck 规模（`Math.max(60, deck.length)`）或改字节预算；plan 缓存对齐 `max(120, deck.length)`。
  - 验证：同一次实验同时检验它是否为 L-1 三条缩略图红的成因（60 页 deck 复现红 → 提上限复跑对比）。
  - 代价：中（须评估内存上界，可加「按 surface 分级保留」：舞台与侧栏必留，导出页逐条释放）· 依赖：R2-1
- [ ] **N-25** 缓存命中时仍跑一次完整 markdown 渲染且结果被丢弃（`中`）
  - 涉及文件：`slide-canvas.tsx:79-88`
  - 目标：依赖加 `prepared`，命中时短路成常量空对象。
  - 代价：低
- [ ] **N-27** 跟随模式一次编辑跑 4 遍全篇文本扫描（`中` · `[需实测]`）
  - 涉及文件：`slides.ts`（`splitIntoSlidesWithNotes`）、`use-presentation-session.ts`
  - 目标：让分割函数一并返回逐页 hash，一处算全复用。
  - 代价：中
- [ ] **N-28** 全模块零 `React.memo`，换页与量测片让全部列表项重跑（`中` · `[需实测]`）
  - 涉及文件：`slide-rail.tsx`、`slide-thumb.tsx`、overview 网格卡
  - 目标：加 `memo`，或把 `plans` 订阅细粒度化（先例：`subscribeSlideHtml` 按 key，`slide-thumb.tsx:128`）。
  - 代价：低-中
- [ ] **N-29** 三处高频路径未节流 / 未收敛（`低`）
  - 代价：低
- [ ] **N-24** PNG 导出是 O(页数 × 全量 CSS)，且每页新建大 canvas（`高` · `[需实测]`）
  - 涉及文件：`deck-image.ts`、`deck-print.tsx`、`element-image.ts`
  - 目标：只内联本页真正用到的 `@font-face`；canvas 复用同一实例并及时置空；blob 增量喂 zip（`client-zip` 支持流式）。
  - 前置：`scripts/measure-deck-export.mjs`（20 / 60 / 150 页各一遍，记内存峰值、总时长、最坏单帧），并按报告 §十 验一次「PNG 是否丢 `<img>`」与「`client-zip` 是否落在首屏 boot chunk」。
  - 代价：高

---

## 批次 R2-6 · 信息量与功能补全（按「价值 ÷ 代价」顺序做）

- [ ] **N-36** 看板在放映表面退化成「标题 + 圆点列表」（`高`，用户截图所见）
  - 涉及文件：`src/client/lib/markdown/kanban/static.ts`、`snapshot` 通道选择点（`use-slide-html.ts:47`、`deck-print.tsx:200`）、`styles/kanban.css`、kanban 相关测试
  - 目标：加 `snapshot: 'board'` 变体专供放映与导出——列横向并排、状态列用列底色、卡片显示 `cardFields` 声明字段（优先级点、标签色条、子任务 `3/5`、封面缩略图）；读 `groupBy` 与 `sorts`，仍不读 `filters`（沿用既有取舍并在注释里写明）。
  - 验证：用用户截图那张板断言出现 3 个并排列 + 列底色 + 子任务进度；窄屏 projector 可读性按报告 §十 实测。
  - 代价：中
- [ ] **N-32** handout / 备注页导出 + 导出页无页码（功能缺口，`低代价`）
  - 涉及文件：`deck-print.tsx`、`deck-export.ts`、`styles/presentation.css`
  - 目标：`DeckSheet` 加 `variant: 'pages' | 'notes'`，复用 `splitIntoSlidesWithNotes` 已有的 notes 与 `formatMicroPage`；导出页补页码，解「所见 ≠ 所印」。
  - 代价：低（全场性价比最高的一条）· 依赖：R2-1
- [ ] **N-37** 舞台上的死控件吞掉翻页点击（`中`）
  - 涉及文件：`presentation-stage.tsx:69`、`mindmap/view.ts`、`excalidraw/view.ts`、`slide-canvas.tsx:288-296`、locales
  - 目标：成功路径统一删头部控件；复制/运行改走 slide 级代理或明确保留但可用。
  - 代价：小
- [ ] **N-38** 导出兜底不画 bento-slides；未量测页只印 1 页（`中` / `低-中`）
  - 涉及文件：`deck-print.tsx:32-40`、`:194-214`、`use-presentation-session.ts:138`
  - 目标：`prepareDeckSheet` 内同调 slides 快照；导出前若 `!listProgress.finished` 给提示或补测可见范围。
  - 代价：小
- [ ] **N-17** 20 多条键位绑定无可查处（`中`）
  - 涉及文件：`presentation-controls.tsx`（Tooltip `combo`）、`presentation-keys.ts`、`shortcuts-panel.tsx`、`presentation-context-menu.tsx`、locales
  - 目标：①Tooltip 补 `combo`；②`?` 键开合快捷键卡（走「内容区绝对定位浮层」，同导图）；③`shortcuts-panel.tsx` 收录放映键；④右键菜单补 combo。
  - 代价：小-中
- [ ] **N-18 + N-35** 窄屏胶囊溢出 / 触屏拿不到四个工具（`中`，同一处改）
  - 涉及文件：`presentation-controls.tsx`、`surfaces:check` 名单、e2e 断点契约
  - 目标：窄屏把视图组折叠进组件库的 `Menu`（触屏断点里包含激光笔/聚光灯/黑屏/白屏）。
  - 代价：中
- [ ] **N-31** 页内分步揭示 fragment（功能缺口）
  - 目标：`<!-- steps -->` 指令族（与 `takeLayoutDirective` 并排 `takeStepDirective`），步数进 `SlidePlan`，顺序 = 步 → 子页 → 下一页；**导出必须按步展开**（照 Slidev `--with-clicks`），缩略图/全览取末态，`role="status"` 播报，两语文案。
  - 代价：中-高 · 依赖：R2-1 + N-13 的播报结构
- [ ] **N-33** 独立 HTML deck 导出（功能缺口）
  - 目标：复用 `collectDeckCss()` 自取样式 + 一小段导航 script；附件与外链必须绝对化；**不引新依赖**（铁律 8）。
  - 代价：中

---

## 批次 R2-7 · 观众侧同步放映（先写 ADR）

- [ ] **N-34** `/s/<slug>?present=1` 观众侧跟页（功能缺口，`高` 代价）
  - 前置：新写一份 ADR（沿用 `ADR-0003` 访客会话、`ADR-0005` 公开集合的口径），明确口令、有效期、访客分析、限速与缓存头；这是**公共契约变更**，须走 `AGENTS.md` 的「deprecation 标记 + 迁移窗口 + 到期删除」流程，不夹带进任何功能批次。
  - 涉及文件：`src/client/app.tsx`、`app-shell.tsx`、`src/worker/routes/share*`、`src/shared/types/`
  - 代价：高

---

## 收尾 · 台账遗留

- [ ] **L-1**（原 `B4-09`）本机浏览器门禁 7 条红未定位（`高`）
  - 步骤：①给两条 `canvas fills the stage` 补 detail（打出 stage 与 canvas 的实测 `w×h` 与 `getBoundingClientRect`）；②按三条线索分头查——几何两条是否与 N-23 同因、缩略图三条与 N-23/N-25 一并复测、axe 那条由 N-11/N-16 顺带解掉（它转绿即 N-16 修对的证据）。
  - 判定沿用上一轮台账「对同一 HEAD 快照同法实跑得到同样 7 个失败名 → 非本分支引入」；**本轮未实跑**，落地前须复现一次。
  - 代价：中
- [ ] **L-2**（原 `B4-10`）`AGENTS.md` 视觉门禁断言计数已过期（`低`）
  - `AGENTS.md:372` 仍写「当前 380 条断言」，台账实跑为 694 / 717。单独一次 `docs` 提交，以收尾那轮实跑为准；不在功能提交里夹带（`AGENTS.md` 自述需 PR 评审）。
  - 代价：极低

---

## 门禁与验证矩阵

| 范围 | 命令 | 频率 |
| :--- | :--- | :--- |
| 每个条目 | `npm run typecheck`、`npx vitest --config vitest.config.ts run <related>`、`npm run style:check`、`comments:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`escape:check`、`empty-catch:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`vendor:check`、`budget:check`、`size:check` | 每次提交 |
| 每个批次 | `npm run test:unit`（全量）、`npm run test:e2e`、`node scripts/e2e-visual.mjs`、`npm run contrast:check` | 批次收尾各一次 |
| R2-1 / R2-4 / R2-5 | 页数基线、焦点契约、量测与导出计时 | 这些批次的红→绿证据必须逐条贴进执行日志 |

**已知噪声**：`npm run test:unit` 在本机存在与演示模式无关的负载敏感超时（见 `plan-with-agy-1.md`「全量单元测试基线说明」）。处置沿用上一轮：逐条比对失败清单，只判「新增失败」；需要一次可读全量结论时允许降并发复跑，命令与结果如实写明。

---

## 执行日志

- 2026-10-02 · R2-0：`review-with-agy-2.md` 更名为 `review-with-qoder-1.md`（38 条条目、§九 批次矩阵、§十 需实测清单、§十一 本轮局限补全），并新建本执行计划。基线 `03628a57`，本轮**未启动浏览器、未跑 dev server**，所有几何/性能数字仍待各批次实测。
