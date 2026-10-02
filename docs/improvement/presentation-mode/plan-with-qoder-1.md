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
| **R2-1** | 分页语义正确性 | N-01, N-02, N-03 | 中 | `[x]` 五条提交全部落地（N-01 `3f16c100`、N-02 `f8f2602d`、N-03 `72b58681`、收尾 `cab2d30f` + `3303479e`），批次收尾四条重型门禁已跑；其余批次的页数断言以本批为新基线，本批新开的两条门禁红见 L-3 / L-4 |
| **R2-2** | 安全与链接处理 | N-07, N-08, N-09, N-10 | 小-中 | `[~]` N-07 已提交 `7120d1c2`、N-10 已提交 `07d97b7f`；N-08 / N-09 待办（N-08 直接复用 N-10 抽出的 `isSafeSlideLinkHref`，无需再等） |
| **R2-3** | 演讲者模式完整交付 | N-04, N-05, N-06, N-26 | 中-高 | `[ ]` 待办 |
| **R2-4** | 信息层 / a11y / 合规残留 | N-11, N-13, N-16, N-12, N-14, N-19, N-15, N-20, N-21, N-22, N-30 | 中 | `[ ]` 待办（顺带解 L-1 的 axe 红） |
| **R2-5** | 性能治理 | N-23, N-25, N-27, N-28, N-29, N-24 | 中-高 | `[ ]` 待办（依赖 R2-1） |
| **R2-6** | 信息量与功能补全 | N-36, N-32, N-37, N-38, N-17, N-18+N-35, N-31, N-33 | 低 → 高 | `[ ]` 待办（按此顺序做） |
| **R2-7** | 观众侧同步放映 | N-34 | 高 | `[ ]` 待办（**公共契约变更，先写 ADR**） |
| **收尾** | 台账与文档 | L-1, L-2, L-3, L-4 | 低-中 | `[ ]` 待办（L-3 / L-4 由 R2-1 批次收尾实测新开） |

**若只允许做三件事**：N-01（地基性正确性）· N-07+N-08（安全红线，`AGENTS.md` 不允许例外）· N-11+N-36+N-12（用户两张截图里直接可见的三项）。

---

## 批次 R2-1 · 分页语义正确性

- [x] **N-01** 分页器与渲染器对「分隔线」的判定不一致（`高`）— 已提交 `3f16c100`
  - 涉及文件：`src/client/features/presentation/slides.ts`（新 `readLine()` 块状态机取代 `SLIDE_BREAK`/`classifyLine`，`scanBoundaries` 改读它）、`slides.test.ts`、根 `README.md` / `README_ZH.md`（本仓没有 `features/presentation/README.md`，报告原写误）、`scripts/check-comments.mjs`
  - 目标：让分页器接受渲染器实际会画成 `<hr>` 的全部写法（`---`/`***`/`___`/`- - -`），且不再把「标题行 + `---`」这种 setext 写法误判为切页；两边规则须由同一份谓词给出，杜绝再次漂移。
  - 验证：表驱动差分基座 22 种写法 × 16 种上文（空行/段落/多行段落/ATX/列表/有序列表/嵌套列表/引用/表格/闭合围栏/图片/`<div>x</div>`/裸标签/独行内联标签/内联标记行/未闭合注释）共 352 例，切页期望**直接由 app 自己的 `renderMarkdown()` 是否输出 `<hr>` 推出**，不写死手抄表；同一 describe 再加四条具名断言（setext 短横线、setext 等号、缩进超段的惰性续行不成标题、HTML 块在空行处闭合）。本文件实测由 100 例增至 421 例，演示模式目录 23 个测试文件 702 例全绿。施工前先量旧实现：同一 352 组矩阵里旧分页器与渲染器判定**不一致 118 组**，新实现 **0 组**。变异 9 项全部被具名用例杀死（M1 只认连字符 49 红 · M2 需四符号 116 红 · M3 出格行仍折叠 18 红 · M4 空格分隔也折叠 8 红 · M5 空行不闭合 HTML 块 1 红 · M6 惰性行仍开块 13 红 · M7 块级标签不吞 12 红 · M8 制表符按 1 列 8 红 · M9 列表记号不记列 13 红）。
  - 代价：中（改动本身小，难在差分基线要重跑）
  - 落地取舍与残留：没有采纳报告方案 3「分页时向渲染器要一次 `hr` 判定」，因为 B3-12 刻意让分页保持不复用渲染器的独立逐行状态机（把 markdown-it 拉进分页等于让分页承担渲染管线的成本与耦合）；改为「分页器内一份谓词 + 以渲染器为或轴的差分基座」，漂移仍会被测试钉住。已知残留：空行之后嵌套列表的**再缩进**分隔线（`  - item` → 空行 → 四空格 `----`）仍判为惰性行不切页——本状态机只在段落开着时记容器列，不维护列表栈；该写法在真实 deck 里未见，留作记录，不另开条目。
- [x] **N-02** 超大单块整体缩排而不续页（`中`）— 已提交 `f8f2602d`
  - 涉及文件：`slide-pagination.ts`（新 `MIN_FIT_SCALE`、`continuationBands()`，`SlideBlock.breaks` 与 `SlidePage.clip`，`samePlan` 比 clip）、`slide-canvas.tsx`（`slideBreakOffsets()`/`breakUnits()` 读 `<tr>`/`<li>`/代码行的真实顶边，`applySlidePage()` 把内量写到块上）、`slide-html.ts`（`applySliceBand()`：缩略图/打印/演讲者窗走同一页）、`slide-pagination.test.ts`、`slide-canvas.test.ts`、`slide-slice.test.ts`、新 `scripts/measure-slide-fit.mjs`、`scripts/check-i18n.mjs`、`scripts/check-comments.mjs`
  - 目标：给缩放设下限 `MIN_FIT_SCALE`（取投影可读的比值，落地前按报告 §十 实测确认）；低于下限改走「块内续页」——表格按 `<tr>`、代码块按行、列表按 `<li>` 断。
  - 验证：构造超界表格/代码块/列表三类各一例，断言不再出现低于下限的 scale，且续页后总页数与页序确定。
  - 代价：中 · 依赖：N-01
- [x] **N-03** 分割线分页与标题分页互斥、且无关闭自动分页的取值（`中`）— 已提交 `72b58681`
  - 涉及文件：`slides.ts`（`slideBoundaries()` 取代 `dividerBoundaries()`、`DeclaredSlideLevel` 与 `slideLevelOf()` 认 `none`、`buildDeck()` 走页循环加 `blankRunBefore()` 去重）、`slides.test.ts`（新 describe 4 例 + declared-level describe 补 3 例 + 1 例改名）、`README.md`、`README_ZH.md`、`scripts/check-comments.mjs`
  - 后续：收尾提交 `cab2d30f` 把该去重判定从「只有空行」扩成「只有空行或一行版式指令」并改名 `holdsNothingToDraw()`，按现名 grep 即以它为准
  - 目标：两种边界取并集去重后一起排序；front matter 支持 `slide-level: none` 显式关闭标题分页。
  - 验证：混写 `---` 与标题的 deck 断言页数 = 并集；`slide-level: none` 断言只按分隔线切。
  - 代价：小-中 · 依赖：N-01

**批次收尾**（已跑完，证据在执行日志的 R2-1 收尾条目）：`npm run test:unit` + `test:e2e` + `e2e-visual.mjs` + `contrast:check` 各一遍。跑出来的页数红逐条判为**夹具缺陷**（paste 落在编辑器自有游标 offset 0，把笔记自己的 front matter 顶成分隔线），由 `3303479e` 修好；两条与改动相关度存疑的红另立 L-3 / L-4，不在本批内顺手修（`铁律 14`）。

---

## 批次 R2-2 · 安全与链接处理

- [x] **N-07** 演讲者通道可被同源任意文档读取与改写（`高` · 安全）— 已提交 `7120d1c2`
  - 涉及文件：`presenter-view/use-presenter-channel.ts`、`presenter-view/presenter-window.tsx`、`use-presentation-session.ts`、`use-presenter-channel.test.ts`、`scripts/check-comments.mjs`
  - 目标：`ready`→`sync` 与 `command`→nav 现在无任何来源校验；改为一次性会话令牌（`start()` 时生成，随 `openPresenterWindow` 的 URL 传给新窗口），无令牌的 `ready`/`command` 一律忽略并 `console.warn`。频道名不再固定常量。
  - 验证：新增用例断言「不带令牌的 ready 不回 sync」「带错误令牌的 command 不动页」；私有备注不出现在无令牌会话里。
  - 代价：中
- [ ] **N-08** 右键菜单的链接动作绕过左键那套协议白名单（`中高` · 安全）
  - 涉及文件：`presentation-state.ts`、`presentation-context-menu.tsx`、两侧测试
  - 目标：把 `interceptSlideLink` 的协议判定抽成 `isSafeSlideLinkHref(href): boolean` 纯函数，左键与右键共用；右键侧对非白名单 href 不渲染这两项。
  - 验证：`javascript:` / `data:` 链接在菜单里不出现「打开链接」，纯函数表驱动用例。
  - 代价：小 · 依赖：N-10（同一份谓词）——`07d97b7f` 已把 `isSafeSlideLinkHref()` 落在 `presentation-state.ts` 并导出，本条直接引用即可
- [ ] **N-09** 右键菜单可穿透解析到放映画面之外的链接（`中` · 安全/正确性）
  - 涉及文件：`presentation-context-menu.tsx`、`presentation-context-menu.test.ts`
  - 目标：命中栈只取第一个非背板元素，并加 `panelRef.current.contains(el)` 约束，不再全栈搜索。
  - 验证：在遮罩外放一个链接、遮罩内画面无链接，断言菜单不提供「打开链接」。
  - 代价：小
- [x] **N-10** 链接协议判定大小写敏感、非白名单链接静默失效（`中` · 正确性）— 已提交 `07d97b7f`
  - 涉及文件：`presentation-state.ts`、`presentation-state.test.ts`、`slide-canvas.tsx`、`slide-canvas.test.ts`、`src/shared/locales/{en-US,zh-CN}/workspace.ts`、`scripts/check-comments.mjs`
  - 目标：比较先 `toLowerCase()`；被拦下的非白名单链接给一次 toast（复用 `useUi`，同模块用法见 `deck-print.tsx:101`）。
  - 验证：`HTTP://` 大写链接仍可翻页内跳转；`mailto:` 之类断言有 toast 而非无声。
  - 代价：小
  - 落地：协议白名单从 `interceptSlideLink` 体内抽成 `SLIDE_LINK_PROTOCOLS` + `isSafeSlideLinkHref()`（只折叠比较用的副本，交出去打开的 href 保留原大小写），另出 `isBlockedSlideLinkHref()`（真 href 且不在白名单；页内 `#` 跳转与空 href 不算被拒）——N-08 要用的谓词已在此，可直接引用。

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

- [ ] **L-1**（原 `B4-09`）本机浏览器门禁基线红未定位（`高`）
  - 步骤：①给两条 `canvas fills the stage` 补 detail（打出 stage 与 canvas 的实测 `w×h` 与 `getBoundingClientRect`）；②按三条线索分头查——几何两条是否与 N-23 同因、缩略图三条与 N-23/N-25 一并复测、axe 那条由 N-11/N-16 顺带解掉（它转绿即 N-16 修对的证据）。
  - 数量以 R2-1 收尾实测为准：**基线 7 条**（2 几何 + 3 缩略图 + 1 主题反转 + 1 axe `color-contrast` `.bottom-4` 1.67:1），本批两次采样分别报到 8 / 10 条，多出的都归 L-3 / L-4。
  - 判定沿用上一轮台账「对同一 HEAD 快照同法实跑得到同样 7 个失败名 → 非本分支引入」；**本轮未实跑**，落地前须复现一次。
    - 未实跑：两条 `canvas fills the stage` 的补 detail 与「是否与 N-23 同因」的对照实验**本轮都没做**；上面那 4 条只是台账改口径，不是定位完成。
  - 代价：中
- [ ] **L-2**（原 `B4-10`）`AGENTS.md` 视觉门禁断言计数已过期（`低`）
  - `AGENTS.md:372` 仍写「当前 380 条断言」，台账实跑为 694 / 717。单独一次 `docs` 提交，以收尾那轮实跑为准；不在功能提交里夹带（`AGENTS.md` 自述需 PR 评审）。
  - 代价：极低
- [ ] **L-3** R2-1 收尾新发现：`mindmap: a node added from the keyboard reaches the note source` 两次采样皆红（`中` · `[需实测]`）
  - 现象：`e2e-visual.mjs` 里这一条在本批**改夹具后**的两次采样都红（`/tmp/r21-tail-visual.out`、`/tmp/r21-visual2.out`），改前的三次运行（基线 727/7 与批内 719/15、722/12）都是绿；紧随其后的 `mindmap: the added node is on the map too` 两次都绿，即**节点已上到导图，只是没在 15 秒内出现在编辑器文本里**——写得慢，不是写丢。
  - 待测假设：该断言读 `.cm-content` 的 `textContent`，而 CodeMirror 只渲染视口内的行；`3303479e` 把写入位置与聚焦动作换了（`writeAtEndOfNote` / `parkCaretAtNoteEnd`），滚动落点随之变了，于是栅栏行可能落在视口外。测法：把该断言改成读已提交的栅栏体（与本仓既有约定一致：笔记侧断言读提交后的 fence 而不是编辑器可视行），或先打印 `firstLine/lastLine` 与 fence 所在行号，再判红是不是纯视口问题。
  - 归属：不在 R2-1 内顺手修（`铁律 14`），本条**尚未确认与本批改动有因果关系**，只是相关性 2/2 vs 0/3 记录在案。
  - 代价：低（大概率是断言取数面）
- [ ] **L-4** R2-1 收尾复证：`cover:` 黑屏/白屏两条在本地实例上随机红（`中` · `[需实测]`）
  - 现象：`cover: pressing a key lifts the blackout` 与 `cover: W covers the projector in white`（detail `{"insideDialog":false,"hitIsCover":false,"bg":""}` —— 按下键后连遮罩元素本身都没命中）在同一份代码上逐次翻转：批内 `n03-visual.clean` 全绿、`n03b-visual` 双红、收尾 `r21-tail-visual` 全绿、`r21-visual2` 双红。改前改后都红，即**与 `3303479e` 无关**。
  - 与既有条目的关系：白屏/黑屏元素正是 N-14 要重写的非语义控件，键盘解除路径也在 N-14 与 N-15（焦点落点）的射程内。先实测「红的时候键到底有没有被放映面板收到」，再决定是单开一条还是并入 N-14/N-15 的验收断言。
  - 代价：待实测

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
- 2026-10-02 · R2-1 / N-01（`3f16c100`）：分页器分隔线判定与渲染器统一。做法是把 `SLIDE_BREAK` + `classifyLine` 的「上一行是否空行」判定换成 `readLine()` 逐行块状态机（段落/列表内容列/围栏/引用/表格行/HTML 块/惰性续行 + 制表符按四列展开），setext 下划线读成被折叠段落首行的标题、`---`/`***`/`___` 及空格分隔写法读成 `<hr>`；`readSpeakerNotes()` 与 `takeLayoutDirective()` 与它共用 `nextFence()`，围栏只有一处定义。
  - 红先在案：把 `git show HEAD~1` 的旧分页器与新矩阵同场对跑，352 组用例里**旧实现 118 组与渲染器判定不一致**（`***`/`___`/`- - -`/`* * *`/带缩进与行尾空格的写法一律不切，而渲染器画 `<hr>`），新实现 0 组不一致；差分基座（`slides.test.ts`）的期望值由 `renderMarkdown()` 实际输出 `<hr>` 与否推出，不写死手抄表。
  - 变异在案：9 项变异全部被具名用例杀死（红数 49/116/18/8/1/13/12/8/13），详见 N-01 验证行；跑完按字节还原（`md5sum` 与变异前一致 `1fe68356…`），临时脚本 `mutation-n01.mjs` 与探针 `probe-*.ts` 已删。
  - 门禁在案：`typecheck` 通过；静态门禁 13 项全绿（`style`/`size`/`escape`/`empty-catch`/`hardcoded`/`tokens`/`i18n`/`module-state`/`deep-imports`/`surfaces`/`vendor`/`budget`/`comments`，其中 `size:check` 先因新 describe 超 50 行报红，改为把表数据与 `parityNote()` 提到模块作用域后转绿，未动基线）；`npm run test:unit` 全量 **617 文件 / 5939 通过 + 1 跳过 / 0 失败**（本轮未出现台账记录的负载敏感超时）；提交钩子另跑 `vitest related` 18 文件 / 557 例全绿。
  - 未做：本条**没有**跑 `test:e2e` / `e2e-visual.mjs` / `contrast:check`（按计划约定重型门禁按批次跑，留待 R2-1 批次收尾，届时页数基线随 N-02/N-03 整体位移一起复测）；`README` 两版的分隔线说明已随本条改写，未另立 `features/presentation/README.md`。
- 2026-10-02 · R2-1 / N-02（`f8f2602d`）：超页单块从「整体缩排」改为「按自带单元续页」。`slide-pagination.ts` 加 `MIN_FIT_SCALE` 与 `continuationBands()`——低于下限、且每个单元都装得下一页时，把该块切成若干 `[start, end]` 带，一页仍是 `{from, to: from + 1, top: pageTop + start}` 再加 `clip`；`slide-canvas.tsx` 的 `readSlideGeometries()` 用 host 的 `rect/offsetHeight` 比把 `<tr>`/`<li>` 的真实顶边（代码块按 `pre` 行均分）换算成设计 px 交给 `breaks`；放映面沿用「外层平移 + `visibility`」，只多写一条块上的 `clip-path`，切片面（缩略图 / 打印 / 演讲者窗）在 `slide-html.ts` 的 `applySliceBand()` 里带同一条内量并自平移，逐页与放映一致。
  - 实测在案（补 §十 N-02 那条 `[需实测]`，先量后改）：新建 `scripts/measure-slide-fit.mjs`，在 `1920×1080` 真实放映里走页。改前三块 `scale` 与落地字号 = `0.054 / 1.84 css px`（表 11 672 设计 px）、`0.075 / 2.06`（代码 8 451）、`0.064 / 2.40`（列表 9 810），页 632，基准正文 28 设计 px，舞台 1.331。`MIN_FIT_SCALE = 0.64` 即「投影正文地板 18 设计 px ÷ 实测 28 设计 px」，不是拍的比值。改后同夹具重跑：51 页（表 21 / 代码 14 / 列表 16），每页 `scale=1.000` 且块上写了 `clip`，落地字号 `33.92 / 27.58 / 37.27 css px`；断点落在真实行/项顶边（表带 581.1 设计 px = 10 行，列表带 619.1 = 14 项，代码带 624.0），单元实测 57.6 / 32.3 / 44.2 设计 px。
  - 变异在案：13 项变异最终全部被具名用例杀死（红数 4/1/4/4/1/4/1/2/1/3/1/2/2，控制运行 47 例先绿）。**M2（去掉「本块独占一页」条件）首轮存活**——没有用例覆盖「块与块重叠且首块超页」，补 `keeps shrinking when a block sits inside the one that overflows` 一条后复跑才被杀死；电池跑完按字节还原（`restored-clean: true`）。顺带删掉 `continuationBands()` 里 `units.length === 0` 的早退：它已被「单元间隙比页高就回退缩放」那条判定包含，删除后 28 例仍全绿，即证明该判定承重（`铁律 5` 不留重复兜底）。
  - 门禁在案：`typecheck` 通过；13 项静态门禁全绿（`size:check` 先因新 describe 87 行 > 50 报红 → `rows()` 提到模块作用域并按「能续页 / 切不动」拆两个 describe 后转绿，**未动基线**；`i18n:check` 先因量测脚本里的双语控件名报红 → 按 `measure-kanban`/`measure-music` 既有先例把该脚本登记进 `check-i18n.mjs` 的 `localizedFixtureFiles` 并写明理由）；`npm run test:unit` 全量 **617 文件 / 5954 通过 + 1 跳过 / 0 失败**；演示目录 23 文件 **717** 例全绿（N-01 时 702，本条 +15）；提交钩子另跑 `vitest related` 16 文件 / 158 例全绿。
  - 落地取舍与残留：续页用 `clip-path` 内量而不是给每页加 `fit` 值，因为内量随 `outerHTML` 一起序列化，缩略图 / 打印 / 演讲者窗自动与放映同页；切不过去的三种情形（无单元可断、单元比页高、块与块重叠）退回整体缩放，不静默丢内容。`slideBreakOffsets()`/`breakUnits()` 读真实几何，jsdom 无布局故**没有** jsdom 用例，由量测脚本在浏览器里守住；切片面的 `clip-path` 渲染同样只能由真实浏览器验，留给 R2-1 批次收尾的 `e2e-visual.mjs`。本条**没有**跑 `test:e2e` / `e2e-visual.mjs` / `contrast:check`。`scripts/measure-slide-fit.mjs` 与同类手量表脚本一样不进 CI，它在 `AGENTS.md`「手动验收脚本」清单里的那一行，与 `AGENTS.md:372` 的断言数一起留给收尾 L-2 单独 `docs` 提交，不在功能提交里夹带。
- 2026-10-02 · R2-1 / N-03（`72b58681`）：分隔线与标题从「互斥」改为「并集」，并给 front matter 一个关掉自动分页的取值。`slides.ts` 里 `dividerBoundaries()` 改名 `slideBoundaries()`：`scanBoundaries()` 的 `breaks` 与处于当前层级的 `headings` 拼成一个数组按行排序，不再有「写了分隔线就当没有标题」的早退；`slideLevelOf()` 增加 `SLIDE_LEVEL_NONE`（trim + 小写比较，返回 `DeclaredSlideLevel`），`none` 时只回 `breaks`；`buildDeck()` 的走页循环新增一条跳过——`blankRunBefore(lines, from, boundary.line)` 为真（该标题之上到上一次切页之间只有空行，含紧贴分隔线下一行的空区间）且 `boundary.level !== 0` 时不切，因为分隔线已经翻开了这一页。
  - 红先在案：实现前先落 5 条红（`Tests 5 failed | 423 passed`）——`divides on both when a note mixes separators with heading sections`（报告 §N-03 的「2 条 `---` + 4 个 H1」夹具，旧码 3 页、并集语义 5 页）、`cuts no blank page where a heading falls on the slide a separator already opened`、`keeps a separator inside a heading section dividing as its own page does`、`applies a declared level to the headings a separator deck still carries`、`keeps headings out of the deck when the front matter turns slide-level off`；另 3 条是护栏（`still lets an authored separator keep its blank page above a heading`、`still divides on separators with slide-level turned off`、大小写 `NONE` 写法）改前改后都必须绿。实现后 428 例全绿，**既有期望值一条未改**：setext 折叠、围栏内标题、四空格缩进、cue 归属、`findSlideIndexByOffset` 与 deck 一致这些判定都没动，新分支只吃并集多出来的重复刀口。
  - 变异在案：11 项变异，控制运行 428 例先绿，最终 10 项被具名用例杀死（红数 M1 4 / M2 16 / M3 16 / M4 1 / M5 1 / M7 4 / M8 3 / M9 22 / M10 17 / M11 16），跑完按字节还原（`restored-clean: true`，md5 与 `/tmp/n03-pristine.ts` 一致）。**M6（删掉 `none` 的早退）是等价变异**，运行结果与删前相同——`heading.level <= 'none'` 在 JS 里恒为假，等于「不取任何标题边界」；它由 `npm run typecheck` 守住：实跑该变异得 `slides.ts(294,87): error TS2365: Operator '<=' cannot be applied to types 'number' and 'string | number'`，随即按原字节还原。这里如实记成「typecheck 杀死」，不冒充测试杀死。首轮电池作废并重跑：`FAIL` 行匹配器写成 `^ FAIL \|`（实际是两个空格）导致全部误报 SURVIVED，而 M9 的锚点在 `autoSlideLevel()` 里也出现一次（`ANCHOR HITS 2`），换成长锚点后重跑；另注意电池跑动期间读 `slides.ts` 会读到 M1 的变异体（那条 `if (breaks.length) return breaks` 就是这么「回来」的），核验一律在还原之后做。
  - 门禁在案：`typecheck` 通过；13 项静态门禁全绿（`size:check` 未动基线，新 describe 4 例；`comments:check` 由 `sync-comments-allowlist.mjs` 重建白名单 +11 条，工作区只有本条改动）；`npm run test:unit` 全量 **617 文件 / 5961 通过 + 1 跳过 / 0 失败**（N-02 时 5954，本条 +7）；演示目录 23 文件 **724** 例全绿；提交钩子另跑 `vitest related` 18 文件 / **570** 例全绿。
  - 落地取舍与残留：去重只作用于标题，**分隔线永远照切**，所以「两条分隔线之间的空白页是有意义的一页」这条既有决定不动（`# A\n\n---\n\n---\n\n# B` 仍 3 页）；`blankRunBefore()` 对空区间 `[from, from)` 返回真，紧贴分隔线的标题因此靠同一条判定去掉，不需要特判；并集已按行排序，`to < from` 的区间不会出现，故不写额外防御。`slide-level` 的取值面仍是 `{1, 2, none}`，`off`/`false` 之类不认（认了就多一条没人写的别名）；报告建议的「逃生是整篇塞满 `---`」由此不再必要。本条**没有**跑 `test:e2e` / `e2e-visual.mjs` / `contrast:check`，页数基线在本批整体位移，三条重型门禁留到 R2-1 批次收尾一次跑完。
- 2026-10-02 · R2-1 批次收尾（`cab2d30f` + `3303479e`）：四条重型门禁跑完，跑出来的页数红逐条判成**夹具缺陷**而不是分页回归，修复落在门禁脚本里；同一次收尾顺带把 N-03 的去重判定扩到版式指令。
  - 红先在案：N-03 落地后首跑 `node scripts/e2e-visual.mjs` = **719 通过 / 15 失败**（断言总数 734），比本批前的实测基线 **727 / 7** 多出 8 条，且全在「往笔记里写 deck 夹具」的场景、全朝页数变多的方向：`layout:` 5 条（`a slide that asked for nothing is drawn as it was` 读出 `cardBlocks=6 pages=2`、`the slide the columns could not hold is paged instead of cut off` 读出 `pages=1`、`a split slide reads in two columns of equal width` 读出 `straySwitch:false pageFraction:0.158`、`a slide whose columns overflow the page goes back to the flow layout` 与 `the slide list draws the layout the projector drew` 读出 `marked` 里缺 `ink-slide-split`）、`presentation session:` 2 条（`an edit lands on the projector while following before=1 / 2 after=1 / 4`、`unfreezing catches up with the note position=1 / 5`）、`overview: the matrix opens on the deck it was written for slides=10 position=1 / 10`。
  - 实测在案（先证伪「分页器读错了同一份源」）：把三份夹具原文（首行是 app 新建笔记模板的 `---` front matter）按两种落点分别喂 `splitIntoSlides()`——落在文件开头时三份都**多出一页纯元数据页**（OVERVIEW 应为 9 却报 10、LAYOUT 4→5、PAGINATED 2→3），落在末尾时页数与各断言声明值一致。根因在门禁脚本：`appendToNote` 用 `paste` 事件写入，而 paste 落在编辑器**自有**游标上，新挂载笔记的游标就是 offset 0（`DEFAULT_NEW_NOTE_TEMPLATE` 没有 `{{cursor}}`，`pendingEditorCursors` 因此从不触发），于是插入把该笔记自己的 title+createdAt 两块 `---` 顶到文件中部，这两条 `---` 在 deck 语义里正是分隔线。**这是作者对一篇真实笔记做不到的操作**，属夹具缺陷。
  - 修复在案（`3303479e`，只动 `scripts/e2e-visual.mjs`）：新增 `parkCaretAtNoteEnd()`——真实按键 `Control`+`End` 走 CM6 的 `cursorDocEnd`，并断言选点 anchor 确实落在最后一行 `.cm-line` 上，拿不到焦点或没走到末尾就直接抛错而不是静默 paste（puppeteer-core 25.10.0 不解析 `'Control+End'` 这种带 `+` 的串，按 `down/press/up` 分开按）；`assertPresentationSession` 在笔记还可聚焦时先停靠游标，三处场景夹具改走 `writeAtEndOfNote()`（`content.focus()` + `selectAllChildren` + `collapseToEnd` + `insertText`）。改后**既有期望值一条未改**即转绿（session 的 +1/+2、`overview … slides=9` 都是原断言），只把页数读数 `1.1 2.1` 加进三条断言的 detail，下次红的时候能直接读出「谁跳到哪一页」——为此 `presentationSession()` 与 `readDeckSize()` 的返回值多带一个 `deck`。
  - 顺带扩语义（`cab2d30f`，分页器本体）：`blankRunBefore()` 改名 `holdsNothingToDraw()` 并把判定从「只有空行」扩到「只有空行或一行 `<!-- layout: … -->`」，`buildDeck()` 的跳过条件同处生效；理由写在函数注释里——版式切换是一页的属性而不是页上的内容，单独给它一页会画出一张什么都没有的页，并把版式从真正要它的页上拿走。README / README_ZH 各改一句（「之间只有空行和一行版式指令」）。实现前先落 2 条红（`leaves a layout switch above a heading on the slide that switch belongs to`、`leaves a layout switch at the head of the deck on the slide it opens`），实现后同文件 430 例全绿。
  - 门禁在案：`typecheck` 通过；13 项静态门禁全绿，其中 `comments:check` 按 `AGENTS.md`「分批与门禁」把 `scripts/check-comments.mjs` 的 4 个 `@@` hunk 拆给两个提交（门禁文件 3 条给 `3303479e`、`slides.ts` 那 1 条给 `cab2d30f`），A 批的暂存快照用 `git checkout-index --prefix=/tmp/snapA/ -a` + `node_modules` 软链单独验过，最终打印 **13111 条 / 1354 文件**；`npm run test:unit` 全量 **617 文件 / 5962 通过 + 1 跳过 / 1 失败**，唯一失败是 `blog-comments-window.test.ts > comment list window > mounts one page of rows and grows on demand`，单独复跑为绿——台账记录的负载敏感噪声，与演示模式无关；演示目录 **23 文件 / 726 例**全绿（收尾复跑实测，N-03 时 724，本批 +2 条版式指令用例）；`npm run test:e2e` **177 通过 / 0 失败**（在 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` 新起的 :7712 上跑，并把该账号 bootstrap 好给视觉门禁；先前对复用实例跑报 29/82，属实例数据漂移不是代码）；`node scripts/e2e-visual.mjs` 两次采样 **726 / 8**（干净实例）与 **724 / 10**（复用实例），与基线 **727 / 7** 逐条比对：基线那 7 条一条不少（L-1），两次各多出的即 L-3 / L-4；`npm run contrast:check` 通过（两套主题 + 各表面的令牌量测与 axe 全绿；放映表面那条 axe `color-contrast` 1.67:1 红只出现在 `e2e-visual.mjs` 里，属 L-1 的第 4 条，由 N-11/N-16 顺带解掉）。
  - 落地取舍与残留：①两条收尾提交**没有跑变异电池**——`cab2d30f` 的改动是把已有判定的覆盖面从「空行」扩到「空行 + 版式行」，两条红先用例各钉住一个新分支，未做逐点变异；`3303479e` 是门禁脚本，仓库没有对它的变异机制。②`mindmap:` 那条新红与本批改动的相关性只有 2/2 vs 0/3 的记录，因果未确认，另立 L-3；`cover:` 两条改前改后都随机红，另立 L-4，两者都不在本批内修（`铁律 14`）。③本批整体位移的页数基线以 L-1 那 7 条 + 各场景 detail 里新打印的 `deck` 读数为准，R2-5 的 N-23/N-25 复测直接沿用。
- 2026-10-02 · R2-2 / N-07（`7120d1c2`）：演讲者通道从「固定公共频道名」改为「按一次性令牌派生频道名」。`use-presenter-channel.ts` 里 `PRESENTER_CHANNEL_NAME` 降级为模块内私有 `PRESENTER_CHANNEL_PREFIX`，新 `presenterChannelName(token)` 出 `inkstone-presenter-sync:<token>`；路由本身当信封——`openPresenterWindow(token)` 写 `?presenter=<token>`，`presenterTokenFromLocation(search)` 读回来（空串视为无令牌），令牌由 `openPresenter` 每次点击用 `secureRandomId()`（`lib/id.ts` 既有阶梯，不新造轮子）现铸；广播端与接收端都在 `!token` 时**根本不建通道**。顺带把 `buildPresenterSlideState()` 的参数面从 `PresenterBroadcasterOptions` 收窄成新的 `PresenterStateSource`，纯函数不再被迫接受导航回调。
  - 红先在案：实现前该文件 7 条红（`Tests 7 failed | 8 passed`，改前 15 例中既有 8 例一条未动仍绿）。其中 4 条是**旧实现下的真实可利用行为**：`opens no channel before a presenter window has been asked for` = `expected 1 to be +0`（一开放映就建了通道，尽管没人开窗）；`ignores a document that guesses the untokenised channel name` = `inkstone-presenter-sync: expected "vi.fn()" to not be called at all, but actually been called 1 times`（陌生文档在公共名上 post `ready` + `command:next`，投影真的翻了页）；`leaves a window that carries no token out of a running show` = `expected true to be false`（手打 `?presenter=1` 的窗口连上了正在放映的场，也就拿到了 `notes` 里那句私有小抄——夹具把 `notes[0]` 特意写成 `'private note'` 就是为了让这条断言问对问题）；`opens a popup whose route carries the session token` = 路由参数断言失败。另 3 条是 API 尚不存在（`TypeError: presenterChannelName/presenterTokenFromLocation is not a function`），不算行为证据。
  - 变异在案：7 项变异，控制运行 15 例先绿（源文件 md5 `aa166025`，跑完 `restored-clean: true`）。**M1–M5 全被具名用例杀死**（M1 频道名忽略令牌 → 2 红；M2 广播端去掉 `!token` → 1 红；M3 接收端去掉 `!token` → 1 红；M4 空串当令牌（`|| null`→`?? null`）→ 1 红；M5 路由丢掉令牌 → 1 红）。**M6、M7 存活并如实记录**：M6 去掉 `encodeURIComponent`——`secureRandomId()` 三条取值路径（randomUUID / CSPRNG hex / `base36-base36`）产出的字符全在 URL 安全集内，没有测试能在不伪造「app 永远不会生成的令牌」的前提下命中它；编码留着作为 URL 拼接的常规正确写法，不为它编一条假值用例。M7 把接收端 effect 依赖 `[token]` 改回 `[]`——`PresenterWindow` 的令牌是 `useMemo(…, [])` 一次性读的，同一文档生命周期内不会变，故两者等价；`[token]` 是 exhaustive-deps 的正确形式，保留。
  - 门禁在案：`npm run typecheck` 通过；13 项静态门禁 rc=0（钩子逐条打印：`comment policy check passed: 13122 approved English architecture notes across 1355 files`、`surface coverage check passed: all 8 full screen surfaces are opened and read by scripts/e2e-visual.mjs`、`i18n check passed: 3900 English keys`、`token drift check passed (89 tokens, values stable)`、`hardcoded/escape/empty-catch/module-state/deep-imports/style/size/vendor/budget` 全绿；`comments:check` 由 `sync-comments-allowlist.mjs` 按当前工作区重建，工作区只有本条 5 个文件在改）；`npx vitest run src/client/features/presentation src/client/store` = **27 文件 / 762 例全绿**（其中 `presenter-view` 两文件 31 例：频道 15 + 演讲者窗 16）；提交钩子另跑 `vitest related` **7 文件 / 49 例全绿**。
  - 落地取舍与残留：①与报告方案的两处偏差写明——令牌**按点击现铸**而非 `start()` 时铸（放映一开始就建通道正是本条要消除的行为，且多数放映不开演讲者窗）；**没有**加「忽略无令牌消息并 `console.warn`」那一步，因为频道名即凭据，陌生文档的消息根本到不了 handler，要 warn 就得重新监听公共名、把泄露面再开一次。②`app.tsx` 未改：路由选择器 `has('presenter')` 原样成立，令牌走的是同一个参数的值，不需要新增接线。③未加消息级令牌字段（名称已承重，多一层是重复判定，`YAGNI`）。④本条**只有 jsdom 证据**，没有跨窗口真实链路或浏览器端断言——`e2e-visual.mjs` 目前完全不打开演讲者窗；真实双窗链路与「弹窗被拦」的降级（`openPresenterWindow` 返回 `null` 仍未处理）一并留给 R2-3 的 N-04/N-06，届时补浏览器断言。⑤`PRESENTER_CHANNEL_NAME` 旧导出无任何使用者，直接删，不留兼容别名（`铁律 5`）。
- 2026-10-02 · R2-2 / N-10（`07d97b7f`）：幻灯片链接的协议判定改为大小写不敏感，并把白名单从 `interceptSlideLink` 体内抽成可复用谓词。`presentation-state.ts` 新增模块私有 `SLIDE_LINK_PROTOCOLS`（`https://` `http://` `mailto:` `tel:`）+ 导出的 `isSafeSlideLinkHref()`（比较用 `(href ?? '').trim().toLowerCase()` 的副本，交给 `openWindow` 的仍是原样 trim 的 href——路径的大小写有意义）与 `isBlockedSlideLinkHref()`（真 href 且不在白名单才算被拒，页内 `#` 跳转与空 href 由私有的 `isInPageSlideLink()` 排除）；`interceptSlideLink()` 收成「谓词 + 打开」两步，行为除大写协议外与改前一致。`slide-canvas.tsx` 的 `useSlideLinkInterceptor()` 改为导出（同文件已有 `applySlidePage`/`useBentoSlidesFallback` 为测试导出的先例），左键点击若被白名单拒下则 `useUi.getState().toast({ tone: 'warning' })` 一次——该点击在此之前已被 `preventDefault` 吞掉，放映者两头都没有反馈。文案 `workspace.presentation_link_blocked` 双语补齐。
  - 红先在案：实现前两文件合跑 `Tests 20 failed | 54 passed (74)`。其中 **1 条是旧代码的真实行为差异**：`folds only the scheme, so the path the author wrote keeps its case` —— 旧 `interceptSlideLink('HTTPS://Example.COM/Talk#Section')` 直接返回 `false`，大写协议根本打不开。另 **19 条是 API 尚不存在**（`TypeError: isSafeSlideLinkHref / isBlockedSlideLinkHref / useSlideLinkInterceptor is not a function`，日志里 4 处具名报错），不作为行为证据：14 条表驱动判定 + 2 条 `isBlockedSlideLinkHref` + 3 条拦截器用例。既有的 5 条 `interceptSlideLink` 用例一条未改，改前改后皆绿。
  - 变异在案：8 项变异（`/tmp/mut-n10.mjs`），控制运行 `red=0 green=74`，两文件 md5 `052433e9` / `398dae3a`，跑完 `restored … true` 双双回到原值。**8/8 全被具名用例杀死**：M1 比较不折叠大小写 → 6 红；M2 把折叠后的副本交出去打开 → 2 红；M3 被拒链接不 toast → 1 红；M4 页内 `#` 也算被拒 → 2 红；M5 白名单去掉 `mailto:` → 3 红；M6 白名单接受一切 → 12 红；M7 `interceptSlideLink` 不走谓词（只判 `!href`）→ 4 红；M8 被拒判定不再回头查白名单 → 1 红（大写协议那条被误报成「被拒」）。
  - 门禁在案：`npm run typecheck` rc=0；13 项静态门禁逐条 rc=0，其中 `comments:check` 先红 7 条新注释、`node scripts/sync-comments-allowlist.mjs` 重建后 **13129 条 / 1355 文件** 通过（工作区只有本条 6 个文件在改，重建安全），`i18n:check` **3901 English keys** 双语完整，`size:check` 1903 文件通过（`presentation-state.ts` 193 行）；`npm run test:unit` 全量 **617 文件 / 5987 通过 + 1 跳过 / 2 失败**，两条都是 `Error: Test timed out in 5000ms`（`blog-comments-window.test.ts > mounts one page of rows and grows on demand`、`music-hub-modal.test.ts > says how many matches the capped grid leaves out`），单独复跑这两文件 **22 例全绿**——与 R2-1 收尾记下的负载敏感超时同类，且两文件不引用演示目录；提交钩子另跑 `vitest related` **412 文件 / 3989 例全绿**（`presentation-state` 被放映各处引用，related 覆盖面因此很大）。
  - 落地取舍与残留：①toast 不带被拒的 href 原文，只说「演示模式无法打开该链接」——长 URL 放进一次性提示不可读，且这条是用户可见反馈不是错误路径，不另加 `console.warn`。②行为位移如实记录：笔记间相对链接（`/notes/another`）在放放映时过去是**静默无效**，现在会出一次提示；这与 N-10「非白名单链接静默失效」的判定一致，但确实改了作者能看见的东西，R2-4 的 N-19（幻灯片内笔记间跳转语义）若要支持站内链接，得在白名单或专用路径里显式加它。③本条仍只有 jsdom 证据，浏览器端「点大写链接真开新标签、点被拒链接出 toast」未进 `e2e-visual.mjs`；与 N-07 的 ④ 同类，一并留给 R2-3。④右键侧本条**未动**，`presentation-context-menu.tsx:57` 仍把原值直接交给 `window.open`——那是 N-08，用的就是这里抽出的同一份谓词。
