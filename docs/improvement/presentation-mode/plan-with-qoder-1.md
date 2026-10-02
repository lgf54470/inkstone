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
| **R2-2** | 安全与链接处理 | N-07, N-08, N-09, N-10 | 小-中 | `[x]` 四条提交全部落地（N-07 `7120d1c2`、N-10 `07d97b7f`、N-08 `f3309972`、N-09 `c26cdd70` + 用例归位 `2e4fb18a`），每条各自带变异电池与静态门禁，回填时又在最终字节上复跑一遍电池；批次收尾四条重型门禁已跑，视觉门禁红数与 L-1 基线逐条同名、无本批新增红 |
| **R2-3** | 演讲者模式完整交付 | N-04, N-05, N-06, N-26 | 中-高 | `[x]` 四条提交全部落地（N-04 `d165436e`、N-05 `4174b9e6`、N-06 `d06bdb3e`（前置拆分 `227aa9ca`）、N-26 `7507b92e`），每条各自带变异电池与静态门禁；批次收尾已跑（场景 `87a6c751` + 本条回填），四条重型门禁各一遍，本批共同的「演讲者侧只有 jsdom 证据」由新增的 `assertPresenterConsole`（25 条）收掉，收尾实测另开 **L-7**（窗被关后仍在广播）与 **L-8**（看板焦点断言间歇红） |
| **R2-4** | 信息层 / a11y / 合规残留 | N-11, N-13, N-16, N-12, N-14, N-19, N-15, N-20, N-21, N-22, N-30 | 中 | `[ ]` 待办（顺带解 L-1 的 axe 红） |
| **R2-5** | 性能治理 | N-23, N-25, N-27, N-28, N-29, N-24 | 中-高 | `[ ]` 待办（依赖 R2-1） |
| **R2-6** | 信息量与功能补全 | N-36, N-32, N-37, N-38, N-17, N-18+N-35, N-31, N-33 | 低 → 高 | `[ ]` 待办（按此顺序做） |
| **R2-7** | 观众侧同步放映 | N-34 | 高 | `[ ]` 待办（**公共契约变更，先写 ADR**） |
| **收尾** | 台账与文档 | L-1, L-2, L-3, L-4, L-5, L-6, L-7, L-8 | 低-中 | `[ ]` 待办（L-3 / L-4 由 R2-1 批次收尾实测新开，L-5 由 N-04 变异实测新开，L-6 由 N-05 阅读新开，L-7 / L-8 由 R2-3 批次收尾的浏览器实测新开） |

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
- [x] **N-08** 右键菜单的链接动作绕过左键那套协议白名单（`中高` · 安全）— 已提交 `f3309972`
  - 涉及文件：`presentation-state.ts`、`presentation-context-menu.tsx`、两侧测试
  - 目标：把 `interceptSlideLink` 的协议判定抽成 `isSafeSlideLinkHref(href): boolean` 纯函数，左键与右键共用；右键侧对非白名单 href 不渲染这两项。
  - 验证：`javascript:` / `data:` 链接在菜单里不出现「打开链接」，纯函数表驱动用例。
  - 代价：小 · 依赖：N-10（同一份谓词）——`07d97b7f` 已把 `isSafeSlideLinkHref()` 落在 `presentation-state.ts` 并导出，本条直接引用即可
  - 落地：`buildLinkItems()` 开头改成 `if (!isSafeSlideLinkHref(linkUrl)) return []`，两条链接项（打开 / 复制）与左键共用同一份白名单；prev 的 `separatorBefore` 同用该谓词，链接段被隐藏时不留一条孤零零的分隔线；`isSafeSlideLinkHref()` 顺手收成类型谓词 `href is string`，`interceptSlideLink()` 因此不必再重复兜 `null`。
- [x] **N-09** 右键菜单可穿透解析到放映画面之外的链接（`中` · 安全/正确性）— 已提交 `c26cdd70`（命中栈用例归位 `2e4fb18a`）
  - 涉及文件：`presentation-context-menu.tsx`、`presentation-context-menu.test.ts`
  - 目标：命中栈只取第一个非背板元素，并加 `panelRef.current.contains(el)` 约束，不再全栈搜索。
  - 验证：在遮罩外放一个链接、遮罩内画面无链接，断言菜单不提供「打开链接」。
  - 代价：小
  - 落地：`extractAnchorHrefFromPoint()` 增第 4 参数 `surface`（遮罩二次右键时由 `contextMenuProps.container` 即放映面板传入），命中栈只取**第一个**既非菜单遮罩、也不在 `[role="menu"]` 内的元素，再要求它落在 `surface` 内才解析 `closest('a[href]')`，否则回 `null`（走原有事件目标兜底路径）。真实 Chrome 实测确认「取第一个」不会误伤激光笔/聚光层：`pointer-events: none` 的元素根本不在 `elementsFromPoint` 栈里。
- [x] **N-10** 链接协议判定大小写敏感、非白名单链接静默失效（`中` · 正确性）— 已提交 `07d97b7f`
  - 涉及文件：`presentation-state.ts`、`presentation-state.test.ts`、`slide-canvas.tsx`、`slide-canvas.test.ts`、`src/shared/locales/{en-US,zh-CN}/workspace.ts`、`scripts/check-comments.mjs`
  - 目标：比较先 `toLowerCase()`；被拦下的非白名单链接给一次 toast（复用 `useUi`，同模块用法见 `deck-print.tsx:101`）。
  - 验证：`HTTP://` 大写链接仍可翻页内跳转；`mailto:` 之类断言有 toast 而非无声。
  - 代价：小
  - 落地：协议白名单从 `interceptSlideLink` 体内抽成 `SLIDE_LINK_PROTOCOLS` + `isSafeSlideLinkHref()`（只折叠比较用的副本，交出去打开的 href 保留原大小写），另出 `isBlockedSlideLinkHref()`（真 href 且不在白名单；页内 `#` 跳转与空 href 不算被拒）——N-08 要用的谓词已在此，可直接引用。

**批次收尾**（已跑完，证据在执行日志的 R2-2 收尾条目）：`npm run test:unit` + `test:e2e` + `e2e-visual.mjs` + `contrast:check` 各一遍，四条全在最终 HEAD 字节上跑。视觉门禁 **726 / 8** 与 R2-1 收尾的干净实例采样逐条同名——L-1 基线 7 条一条不少，第 8 条是 L-3 的 `mindmap:`，L-4 的 `cover:` 两条本轮皆绿；**没有一条红与本批四条改动同名或同意图**。本批共同的残留是「四条都只有 jsdom 证据」：`e2e-visual.mjs` 里没有任何真实指针右键场景，也没有大写链接真开新标签的浏览器断言，随 N-07 的 ④ / N-10 的 ③ 一并留给 R2-3。

---

## 批次 R2-3 · 演讲者模式完整交付

- [x] **N-04** 演讲者窗口的当前页/下一页完全不跑富媒体增强（`高`）— 已提交 `d165436e`
  - 涉及文件：`presenter-view/presenter-window.tsx`、`presenter-view/use-presenter-channel.ts`、`slide-html.ts`、`presenter-view/*.test.ts`
  - 目标：`slideMarkup(renderSlideSource(...))` 缺 `enhancePreview`/`renderChartJs`/`renderPendingMermaid`/`renderMath`。二选一并写明理由：A 演讲者侧补齐增强链；B 让广播载荷直接携带放映侧已渲染的 HTML。**选 B 须与 N-26 一并设计**（payload 更大）。
  - 验证：演讲者窗里断言出现 `svg`/katex 节点而非占位块（jsdom 可断言 DOM 标记，几何留给 e2e）。
  - 代价：中
  - 落地：**选 A**。新增 `presenter-view/use-presenter-slide-media.ts`，对本窗自己渲染的标记跑同一条 `enhancePreview` 链 + `renderPendingMermaid`，通道与放映侧的暂存准备逐字一致（`mindmap`/`excalidraw`/`kanban` 全 `snapshot`、`fences` 随标记同行、`codeBlockCollapseLines: 0`、`mindmapBox` 取本页内容盒）；`PresenterSlidePreview` 的标记 memo 改为同时交出 `html` 与 `fences`，切片页保留整页栅栏体，`hostRef` 经 `PresenterScaledSlide` 落到 `SlideProse` 的 `[data-slide-page]`。B 未选的理由写在执行日志。
- [x] **N-05** 计时从应用启动起算且跨场次不复位（`高`）— 已提交 `4174b9e6`
  - 涉及文件：`src/client/store/presentation.ts`、`use-presentation-session.ts`、`presenter-view/*`
  - 目标：`startedAt` 随「本次放映开始」复位——在 store 的 `start()` 里记 `startedAt: Date.now()`，session 从 store 读而非自己 `useRef`；接上 B4-05 已有的 `accumulatedMs` 增量模型。
  - 验证：单测断言第二次 `start()` 后 `startedAt` 变化；跨场次不累加。
  - 代价：小
  - 落地：store 新增 `startedAt`（未放映为 `0`，`start()` 记 `Date.now()`、`stop()` 清零），`presentation-overlay.tsx` 读出后经 `PresentationSessionOptions` 透传，`useSessionPresenter` 删掉 `useRef(Date.now()).current`；顺带把它的六个位置参数收成对象（加一个就成 7 个位置参数）。`usePresenterTimer` 不动——它已按 `startedAt` 变化复位（复位时连 `isPaused` 一起清），只是此前永远收到同一个冻结值。清零不产生「演讲者窗读到 0」的窗口：广播的 sync effect 由 `open` 守着（`use-presenter-channel.ts:214-224`，N-26 之后）。
- [x] **N-06** 弹窗被拦截时静默失败、且无内嵌降级（`中高`）— 已提交 `d06bdb3e`（前置拆分 `227aa9ca`）
  - 涉及文件：`presenter-view/`、`presentation-controls.tsx`、locales 两版
  - 目标：`openPresenterWindow()` 返回 `null` 时开内嵌演讲者面板 + toast 说明原因。内嵌面板必须落在 `AGENTS.md`「工具栏展开」段的四种合格去处之一（建议「独立一列」，与大纲/反向链接同类）。
  - 验证：stub `window.open` 返回 null，断言面板挂载且 toast 出现；`surfaces:check` 名单同步。
  - 代价：中
  - 落地：**独立一列**。`use-presentation-session.ts` 新增 `usePresenterFallback(open)`，`openPresenterWindow()` 返回 `null` 即开面板 + `tone: 'warning'` toast；面板 `presenter-view/presenter-panel.tsx`（63 行）画「下一页 + 本页讲者备注 + 本次放映计时」，状态由同一个 `buildPresenterSlideState(source)` 在本窗口内派生，**不经第二条通道**；作为 `PresentationStage` 的兄弟列挂在 `presentation-overlay.tsx`，`inert`/淡出契约与 `SlideRail` 一致（`chromeHidden || occluded`）。`p` 键与工具栏按钮都汇到 `useSessionPresenter` 的同一个回调，`presentation-controls.tsx` 因此未改（见执行日志取舍①）。`surfaces:check` 无需同步：面板不是 `fixed inset-0`/`app-viewport-fixed` 根，不在那 8 个表面里。备注面板带来的键盘问题按 `铁律 13` 在本条一并收（`onNotesPane`），非顺手修。
- [x] **N-26** 演讲者 state 每次渲染都广播、无连接也发（`中`）— 已提交 `7507b92e`
  - 涉及文件：`presenter-view/use-presenter-channel.ts`
  - 目标：未收到 `ready` 不建连接也不发；`statePayload` 进 `useMemo`。
  - 验证：无 presenter 窗口时断言 postMessage 调用数为 0；渲染次数与广播次数解耦。
  - 代价：低 · 依赖：与 N-04 的方案选择联动
  - 落地：通道改**握手门控**——`ready` 到达才算有观众（当场交一次当前状态），`close`（两个方向都算）即恢复沉默，挂载时的即时 sync 删除；接收侧（`usePresenterReceiver`）卸载时也对称 post `close`，放映不再对着已关的窗念稿。载荷由新导出 `usePresenterSlideState(source)` 用 `useMemo` 派生，**通道与 N-06 的降级面板共用同一份依赖清单**（N-06 取舍②承诺的那一笔）。判据按**流量计数**而非到达计数：新增 `presenter-channel.test-helpers.ts`（先记录每次 post 再投递的通道桩）+ `use-presenter-broadcast.test.ts` 4 例（无人听不发、同一页重绘不发、窗关了恢复沉默、迟到的窗拿到当前页与备注）。

**批次收尾**（已跑完，证据在执行日志的 R2-3 收尾条目）：`npm run test:unit` + `test:e2e` + `e2e-visual.mjs` + `contrast:check` 各一遍，全在本批最终 HEAD 字节上跑。本批四条共同的残留——演讲者侧的富媒体、计时、降级面板、通道流量全都只有 jsdom 证据——由新增场景 `assertPresenterConsole`（25 条断言，真实两个文档 + 真实 `BroadcastChannel`）收掉；收尾实测另开 **L-7**（窗被关掉后放映仍在广播）与 **L-8**（看板焦点断言间歇红），两条都按 `铁律 14` 不在收尾内修。

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
- [ ] **L-5** N-04 变异副产品：`preview.mermaid` 关掉后，放映与演讲者两处仍把图画出来（`中` · `[需实测]`）
  - 实测在案：N-04 变异电池里把增强选项写成 `mermaid: false`（M4）在演讲者窗 25 例上**零红**，即关掉「渲染 Mermaid 图表」设置后图照样落地。原因在 `enhance/mermaid.ts:115-136`——`renderPendingMermaid()` 不读任何用户设置，凡 `data-rendered` 与当前签名不符的 `[data-mermaid]` 块一律画；而放映侧 `slide-canvas.tsx:292` 的 `useSlideDiagrams` 同样无条件调用它。
  - 判定：演讲者窗因此**不比放映更错**（两处一致，N-04 的目标是「读到房间读到的那一页」，已达成），但设置在这两个表面上名存实亡。先确认这是设置语义 bug 还是「放映场景假定图为开」的有意取舍；若判为 bug，修法是把两处 `renderPendingMermaid` 收进 `preview.mermaid` 分支，并各补一条「设置关时读到的是栅栏源码」的用例。
  - 归属：不在 N-04 内顺手修（`铁律 14`）。本条只有 jsdom 证据，未在浏览器复测。
  - 代价：低
- [ ] **L-6** N-05 阅读副产物：放映结束后，演讲者窗的耗时仍在走（`低-中`）
  - 实测在案：通道收到 `close` 只把 `connected` 置假、`state` 原样留着（`use-presenter-channel.ts:248-250`），而 `PresenterWindow` 只要 `state` 存在就画整个头（`presenter-window.tsx:33-64`），`usePresenterTimer(state.startedAt)` 里的 tick interval 不看 `connected`（`presenter-window.tsx:396-413`）。结果是关掉放映后，演讲者窗显示「未连接」但计时继续累加。判定依据是读代码，未做浏览器复测，也未写用例。
  - 行号更新在案（`227aa9ca` + `d06bdb3e` 之后）：计时已移出，那段 interval 现在是 `presenter-view/use-presenter-timer.ts:6`（`window.setInterval(…, 500)`，仍不看 `connected`），调用点在 `presenter-window.tsx:94`，读表处 `presenter-window.tsx:125`。`use-presenter-channel.ts:248-250` 与「`state` 存在就画头」的判定不变。
  - 行号再更新在案（`7507b92e` 之后）：接收侧那段 `close` 分支现在是 `use-presenter-channel.ts:267-269`（N-26 在它前面加了 `usePresenterSlideState` 与握手注释），判定的两样——`connected` 置假而 `state` 留着、tick 不看 `connected`——一字未动。
  - 归属：不在 N-05 内顺手修——N-05 的验收只问「起点是不是本次放映」，改「结束后要不要停表」是另一条行为决定（停表 / 停在最后值 / 归零，三者都得选一个并配文案）。建议与 N-06（弹窗被拦截时的降级）一并处理演讲者窗的连接态。
  - N-06 未合并处理（2026-10-02，理由在执行日志取舍⑤）：本条新增的内嵌面板随 `open` 收起，自身没有「结束后仍走表」；该缺陷只属于演讲者窗。停表 / 停在最后值 / 归零 的行为决定与新文案不在 N-06 射程内（`铁律 14`）。
  - 代价：低
- [ ] **L-7** R2-3 收尾实测新发现：演讲者窗被**关掉**之后，放映仍在向它广播（`中` · 浏览器实测在案）
  - 实测在案：新增的 `assertPresenterConsole` 场景里，演讲者窗 `window.close()` 之后一次真实翻页（`3 / 3` → `2 / 3`）仍产生一条 sync（计数 4 → 5，`/tmp/r23-visual2.log` 第 124 行 detail `posts=5 before=4`）。机制：React 的 effect cleanup 不会在浏览器丢弃文档时运行，接收侧那句对称的 `close` 告别发不出去，放映侧 `readyRef` 于是仍认定有观众。
  - 与 N-26 的关系：N-26 把损失从「每次渲染一条」压到「每次翻页一条」，**没有**消除它；被拦下的弹窗那条路（从未有文档认领通道）已经彻底不发，是本条没覆盖的另一半。
  - 修法候选（择一后再补浏览器断言）：接收侧改挂 `pagehide`/`visibilitychange` 发告别；或放映侧给一个「连续 N 次广播无人认领即沉默」的超时（需要一个 ack，代价大）；或把 `close` 语义定为「窗仍活着但不再监听」，仅覆盖 unmount 而不覆盖关窗——那么本条转为文档化行为。三者都带连带决定「重新打开窗时是否自动恢复」，故属行为决定而非缺陷速修。
  - 归属：R2-3 收尾**未修**（`铁律 14`），门禁里这一段只测不钉，`scripts/e2e-visual.mjs` 的注释指名本条。
  - 代价：低-中
- [ ] **L-8** R2-3 收尾实测：`surface keyboard: the kanban board hands focus back to the control it was opened from` 间歇红（`低` · `[需复证]`）
  - 实测在案：同一份代码两次完整跑逐次翻转——第一轮（场景 26 条时）红，detail `{"opener":"button[全屏]","active":"button[全屏]","inherited":"","returned":false}`；第二轮（25 条）绿。两轮都含 R2-3 新增的演讲者场景，故与本批改动无因果；红的形态是**可访问名称相同而元素身份不同**，即比对发生在看板顶栏控件被重建之后（该断言按身份比 `document.activeElement` 与打开它的那个按钮）。
  - 与既有约定的关系：AGENTS「工具栏展开」与「看板在笔记里不止一块板」已记过这个表面的取数面脆弱性；测法应先确认红的那一次里顶栏是否真的换了一批元素（打印元素的 `isConnected` 与创建序号），再判是断言取数面还是看板重挂的时序问题。
  - 归属：不在收尾内顺手修（`铁律 14`），本条只有「一次红一次绿」两次采样，未确认成因。
  - 代价：低

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
- 2026-10-02 · R2-2 / N-08（`f3309972`）：右键菜单的两条链接动作改为复用左键那份协议白名单。`presentation-context-menu.tsx` 的 `buildLinkItems()` 开头由 `if (!linkUrl) return []` 换成 `if (!isSafeSlideLinkHref(linkUrl)) return []`，`javascript:` / `data:` / 相对链接 / 页内 `#` 锚点都不再渲染「打开链接」「复制链接地址」；`buildNavigationItems()` 里 prev 的 `separatorBefore` 同用该谓词，链接段整段隐藏时不留一条孤零零的分隔线。`presentation-state.ts` 的 `isSafeSlideLinkHref()` 收成 `href is string` 类型谓词，`interceptSlideLink()` 因此直接 `href.trim()` 而不再重复兜 `null`。
  - 红先在案：实现前菜单测试文件 `Tests 5 failed | 18 passed (23)`（复现方式：在 `f3309972^` 的冻结快照里只换上新的测试文件跑，`npx vitest run …/presentation-context-menu.test.ts`）。5 条失败名逐字为 `offers no link item for a javascript: href`、`… for a mixed-case javascript: href`、`… for a data: href`、`… for a relative note link href`、`… for a in-page anchor href`，首条报错原文 `AssertionError: expected [ 'link-open', 'link-copy', …(12) ] to not include 'link-open'`。**5 条都是旧代码下的真实可利用行为**：旧实现只看 `linkUrl` 有没有值，右键命中 `javascript:` 链接即在菜单里给出「打开链接」，选中就 `window.open('javascript:…')`。另 2 条正例（大写 `HTTPS://` 与 `mailto:`）改前改后皆绿，作为「白名单没收紧过头」的护栏。
  - 变异在案：8 项变异（`/tmp/mut-n08.mjs`，把 `presentation-state` / `slide-canvas` / 菜单三个链接路径测试文件合跑，使 N-10 的判定与本条共用一份电池），控制运行 `red=0 green=103`，三源 md5 `STATE 6a88f4ac / CANVAS 398dae3a / MENU 29d25fd2`，跑完逐源 `restored … true` 全部回到原值。**8/8 全被具名用例杀死**：P1 比较不折叠大小写 → 7 红；P2 把折叠后的副本交出去打开 → 2 红；P3 被拒链接不 toast → 1 红；P4 页内 `#` 也算被拒 → 2 红；P5 白名单接受一切 → 18 红；P6 菜单不查白名单（退回只判有无值）→ 5 红；P7 分隔线不看白名单 → 5 红；P8 菜单自带一份区分大小写的 `https://` 副本 → 2 红。
  - 门禁在案：提交钩子的增量 `tsc -b` 通过，回填时对本批最终字节复跑全量 `npm run typecheck` rc=0 且无诊断（`/tmp/n09-typecheck-final.log`）；13 项静态门禁逐条 rc=0（提交钩子打印 `comment policy check passed: 13133 approved English architecture notes across 1356 files`、`i18n check passed: 3901 English keys`、`size check passed: 1903 files scanned, 52 grandfathered`，另有 visual label / escape hatches / empty catch / hardcoded / token drift / undefined-var / module state / deep import / code style / surface coverage 全绿）；提交钩子另跑 `vitest related` **12 文件 / 160 例全绿**。
  - 落地取舍与残留：①右键被拒 href **不出 toast**，与左键有意不同——左键那次点击已被 `preventDefault` 吞掉、不给反馈就是「幻灯片点了没反应」，右键这里只是菜单少两项，同一份拒因画两种反馈更易误导。②判定只加在渲染那一步，`extractLinkHref()` 与上游一律不重复设门（一条规则一处判）。③本条仍只有 jsdom 证据，浏览器端「右键 `javascript:` 链接菜单里没有链接项」未进 `e2e-visual.mjs`，与 N-07 的 ④ / N-10 的 ③ 同批留给 R2-3。
- 2026-10-02 · R2-2 / N-09（`c26cdd70`，用例归位 `2e4fb18a`）：右键菜单不再穿透解析到放映画面之外的链接。`extractAnchorHrefFromPoint()` 增第 4 参数 `surface`，命中栈从「全栈搜第一个带 `a[href]` 的」改为「取**第一个**既非菜单遮罩（`[data-presentation-menu-backdrop]`）、也不在 `[role="menu"]` 内的元素」，再要求它落在 `surface` 内才解析其 `closest('a[href]')`，否则回 `null`；遮罩二次右键由组件把 `contextMenuProps.container`（即 `panelRef.current`，放映面板）传进来作为这条边界。
  - 实测在案（先定「取第一个」到底会不会误伤穿透层）：真实 Chrome（`/usr/bin/google-chrome` + puppeteer-core，`/tmp/probe/probe-elementsfrompoint.mjs`）三种状态下各读一次 `document.elementsFromPoint(25, 25)`——链接之上盖 `pointer-events: none` 层 → `["link","panel","BODY","HTML"]`（**穿透层根本不在栈里**，激光笔/聚光/黑幕不会因为「只取第一个」而被误当成命中物）；改盖不透明且 `pointer-events: auto` 的层 → `["cover","link",…]`（**被盖住的链接仍留在栈里**，所以「全栈搜锚点」必然读到放映者没瞄准的链接）；`contextmenu` 事件在覆盖层上的 `event.target` → `cover`。这就是本条把「取第一个」与「必须落在面板内」两条同时立起来的依据。
  - 红先在案：实现前菜单测试文件 `Tests 4 failed | 25 passed (29)`（同一套快照法：`c26cdd70^` + 新测试文件）。4 条失败名与报错原文逐条为 `ignores a link that sits under an opaque surface of its own` = `expected 'https://example.com/under-the-cover' to be null`、`ignores a link outside the projector panel` = `expected 'https://example.com/behind-the-show' to be null`、`resolves nothing when the menu has no panel to constrain it to` = `expected 'https://example.com/orphan' to be null`、组件用例 `reopens with no link when the point lands on the slide and an anchor lives behind the projector` = `expected "vi.fn()" to be called with arguments: [ { x: 300, y: 400 }, null ]`。**四条都是行为差异，没有一条是「函数缺参数」**：旧签名收到第 4 实参只是忽略它（esbuild 只转译不校验），旧实现因此把面板外、被遮住、无面板可约束三种情况都解析成了链接。另 2 条（`resolves the link the projector is showing`、`looks past the open menu itself…`）改前改后皆绿，前者钉住「不回归」，后者见下条。
  - 变异在案：7 项变异（`/tmp/mut-n09.mjs`，与 N-08 同一组三文件），控制运行 `red=0 green=103`，跑完逐源 `restored … true`（三 md5 同上）。**7/7 全被具名用例杀死**：Q1 不校验面板边界 → 1 红；Q2 往栈深处搜锚点（本条改前的实现）→ 1 红；Q3 `contains` 方向反了 → 3 红；Q4 遮罩自己算命中 → 2 红；Q5 打开着的菜单自己算命中 → 1 红；Q6 遮罩处理器不传面板 → 1 红；Q7 命中面板外元素时回落到原始事件目标 → 3 红。**Q5 是本轮唯一「改前改后都绿」的用例**：`looks past the open menu itself when the second right click lands on one of its rows` 在实现前就通过（旧实现同样跳过菜单行），它的作用是钉住这条既有语义别被本条的收紧顺带改坏——如实记为 pinning，不冒充红先。
  - 门禁在案：`npm run typecheck` rc=0 且无诊断（HEAD 字节复跑，同 `/tmp/n09-typecheck-final.log`）；`npx vitest run src/client/features/presentation src/client/store` = **27 文件 / 795 例全绿**；13 项静态门禁逐条 rc=0（提交钩子打印 `comment policy check passed: 13143 approved English architecture notes across 1356 files`、`size check passed: 1903 files scanned, 52 grandfathered`、`surface coverage check passed: all 8 full screen surfaces are opened and read by scripts/e2e-visual.mjs`，其余同上）；提交钩子另跑 `vitest related` **5 文件 / 44 例全绿**；归位提交 `2e4fb18a` 另跑一次 `vitest related` = **1 文件 / 29 例全绿**，`size:check` 通过未动基线。
  - 落地取舍与残留：①与报告的措辞差异——「第一个非背板元素」补齐为「第一个非背板**且非菜单**元素」，因为二次右键的命中栈里菜单行排在最前，不跳掉它就成了「菜单自己挡住自己」；两处跳过都按属性/角色识别，不依赖 class。②`surface` 缺省（`null`）时一律不解析而不是退回旧的全栈搜索：没有边界就等于不知道放映画面到哪为止，宁可不给链接项。③既有 `elementsFromPoint` 用例的夹具改成真实结构（链接与菜单都在面板内），断言本身一字未改；两条用例的分组归位单独走 `2e4fb18a`，`size:check` 的 `longFns` 线（describe 回调体同样计数）在归位过程中实测过一次越线（hides 组 52 行 → `baseline null -> current {"longFns":1}`），按正/负两组重排后回到 0 漂移。④本条与 N-08/N-07/N-10 一样只有 jsdom 证据：`e2e-visual.mjs` 里没有任何一条真实指针在放映画面上按右键的场景，浏览器端「遮罩下是幻灯片正文、背后应用里有链接 → 菜单没有链接项」未量测，留 R2-3 一并补。
- 2026-10-02 · R2-2 批次收尾（`7c335c15` 回填 + 本条）：四条重型门禁在最终 HEAD 字节上各跑一遍，全量单测与接口 e2e 零红，视觉门禁逐条对回 L-1 基线，本批**未新增任何一条门禁红**。
  - 门禁在案：`npm run test:unit` 全量 **617 文件 / 6002 通过 + 1 跳过 / 0 失败**（rc=0，`/tmp/r22-unit.log`，耗时 167 s）——R2-1 收尾同口径是 5963 例（5962 + 1 跳过），本批四条新增用例把总数推到 6003，且 R2-1 / N-10 两次采样里那条负载敏感超时（`blog-comments-window` / `music-hub-modal`）本轮**没有复现**；`npm run test:e2e` **177 通过 / 0 失败**（rc=0，先杀掉本会话早前起的 :7712 旧实例，再按台账约定用 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` 新起一个，避开 R2-1 记下的「复用实例数据漂移」）；`node scripts/e2e-visual.mjs` **726 通过 / 8 失败**（rc=1，总 734 条断言，与本批开始前 R2-1 收尾的干净实例采样**同数同名**）；`npm run contrast:check` rc=0（两套主题、桌面与手机宽度的层级 × 底色量测与各表面 axe 全绿）。
  - 逐条比对在案（8 = 基线 7 + L-3，一条不多不少）：`presentation: canvas fills the stage` 与 `presentation session: the canvas refills the stage` = L-1 的 2 条几何；`a thumbnail renders the markup the projector prepared`（`thumb=svg=1,katex=0,charts=0,live=false,painted=0`）、`the slide list shows the chart as a picture`、`the picture in the slide list was drawn, not an empty frame`（`pixels=-1`）= L-1 的 3 条缩略图；`a theme flip re-prepares the list instead of leaving placeholders` = L-1 的主题反转；`a11y: the presentation overlay has no axe violations` 里那条 `color-contrast` `.bottom-4` **1.67**（`#c3c3c3` on `#faf9f6`）= L-1 第 4 条，R2-4 的 N-11/N-16 顺带解；第 8 条 `mindmap: a node added from the keyboard reaches the note source` = L-3，本批未碰导图也未碰它的夹具。L-4 的 `cover:` 两条本轮皆绿（`pressing a key lifts the blackout` / `clicking lifts the whiteout` 都过），是对「随机红」这一判定的又一次复证，不改判。
  - 变异电池复跑在案：回填时对最终字节的三个源文件（`presentation-state.ts 6a88f4ac`、`slide-canvas.tsx 398dae3a`、`presentation-context-menu.tsx 29d25fd2`）把 N-08 与 N-09 两批电池各跑一遍——控制运行均 `red=0 green=103`，N-08 **P1–P8 全 KILLED**（红数 7/2/1/2/18/5/5/2），N-09 **Q1–Q7 全 KILLED**（红数 1/1/3/2/1/1/3），逐源 `restored … true`，跑完 `git status` 干净。红先复现同法补测：`f3309972^` + 新测试文件 = `5 failed | 18 passed (23)`，`c26cdd70^` + 新测试文件 = `4 failed | 25 passed (29)`，快照放在 `/tmp/snap-n08` / `/tmp/snap-n09`（`git archive` 出树 + `node_modules` 软链），工作区全程未被回退过。
  - 落地取舍与残留：①收尾**不夹带修复**——L-1 的 7 条与 L-3 的一条按 `铁律 14` 原样留给「收尾」批次，本条只把「同名同数」这一事实钉进台账，作为后续批次判断回归的尺子。②本批四条共同的残留是**浏览器端证据为零**：`e2e-visual.mjs` 现有放映场景完全不按右键、也不点幻灯片里的链接，所以 N-07 的跨窗口真实链路、N-08/N-09 的「右键不出链接项」、N-10 的「大写链接真开新标签」全都只有 jsdom 断言；R2-3 补演讲者窗场景时一并把这三类浏览器断言加进去（同一场景要写进 `check-surface-coverage.mjs` 的名单，否则新表面没人读会挂）。③`/tmp` 下的电池脚本与快照目录本轮保留（L-1 复跑还要用），台账关闭后再清。
- 2026-10-02 · R2-3 / N-04（`d165436e`）：演讲者窗口的当前页与下一页改为本窗自己跑富媒体增强链。新增 `presenter-view/use-presenter-slide-media.ts`（`usePresenterSlideMedia()`：`enhancePreview` → `renderPendingMermaid`，卸载时 `destroyChartInstances`），`PresenterSlidePreview` 的标记 memo 从「只交出 html」改为交出整个 `SlideMarkup`（`html` + `fences`，切片页仍拿整页栅栏体），`hostRef` 经 `PresenterScaledSlide` 落到 `SlideProse` 的 `[data-slide-page]`；两个窗格各挂一份该组件，因此各自增强一次。
  - 方案在案（A vs B）：**选 A（演讲者侧补齐）**。三条依据：①`FenceBodies` 本来就随标记同行（`SlideMarkup.fences`，P-01 的落地形态），而放映侧那份已渲染标记的缓存是**模块级** `slideHtmlCache`——演讲者窗是 `window.open` 出去的另一个 realm，读不到它，B 只能把渲染结果塞进广播载荷；②载荷会暴涨：mermaid 整张 SVG、导图/白板的 `data:` URL 快照、图表的 PNG base64 都在几百 KB 量级，且每次翻页、每次子页各发一份，正是 N-26 要往下压的那条通道；③已有先例：打印管线 `deck-print.tsx:192-216` 就是「一个已连接的 root 自己跑增强」，A 与它同形。
  - 红先在案：实现前 `presenter-view/presenter-window.test.ts` = `Tests 6 failed | 16 passed (22)`，6 条失败名为 `draws the diagram the slide carries instead of leaving its placeholder`、`sets the formula the slide carries instead of showing its source`、`draws the chart on a live canvas instead of the fenced source`、`draws a board as its cards, reading the fence bodies its own markup came from`、`draws the diagram of the slide the presenter walked on to, not only the first one`、`draws a diagram in the next-slide pane as well as the current one`，报错原文逐条为 `AssertionError: the presenter left its slide in the placeholder state: expected false to be true`。**6 条都是旧代码的真实缺失**：旧 `PresenterSlidePreview` 只 `slideMarkup(renderSlideSource(...))`、从不 `enhancePreview`，所以 `[data-mermaid]`/`[data-chart]`/`[data-kanban]` 永远停在 `loading` + `aria-busy` 占位态，公式只剩空的 `data-math` span。
  - 后补用例（不冒充红先）：`keeps reading those bodies when the pane shows one page of a longer slide`、`hands a map to the snapshot renderer at the size of its own page`、`hands a whiteboard to the snapshot renderer instead of leaving its scene` 三条写于实现之后，「改前即红」不成立，其敏感程度只由下面的变异证明。
  - 变异在案：14 项（`/tmp/mut-n04.mjs`，演讲者窗 + 通道两测试文件合跑），控制运行 `red=0 green=40`，双源 md5 `MEDIA 481f0d0f / WINDOW 028967b4`，跑完逐源 `restored … true` 回到原值。**11/14 被具名用例杀死**：M1 不下发栅栏体 → 2 红；M2 跳过 `renderPendingMermaid` → 3 红；M3 公式通道写死为关 → 1 红；M5 看板通道不设 → 2 红；M6 导图通道不设 → 1 红；M7 白板通道不设 → 1 红；M8 导图下发包换成与本页无关的 1280×720 → 1 红；M9 导图不看屏幕主题 → 1 红；M10 `hostRef` 不交给 `SlideProse` → 9 红；M11 切片页丢掉栅栏体 → 1 红；M14 整个 hook 不跑 → 9 红。**3 项存活，逐条给因**：M4（选项写 `mermaid: false`）存活不是用例漏判，而是 `renderPendingMermaid()` 根本不读该设置（`enhance/mermaid.ts:115-136` 只按签名挑待画的 `[data-mermaid]`），放映侧 `slide-canvas.tsx:292` 同样无条件调用它——已单开 **L-5**；M12（把 `html` 从依赖数组删掉）是**等价变异**，`html` 与 `fences` 出自同一个 memo、必然同一批变；M13（删掉 `destroyChartInstances`）在 jsdom 里无从观察——共享画布桩的 `context.canvas` 是新造元素、chart.js 拒收（`Failed to create chart: can't acquire context from the given item`，`slide-remount.test.ts` 早有同一条 stderr），压根没有实例可销毁。
  - 门禁在案：`npm run typecheck` rc=0；13 项静态门禁逐条 rc=0——`comments:check` 先红 **21 条**新注释、`sync-comments-allowlist.mjs` 重建后 **13164 条 / 1358 文件** 通过（工作区仅本条 5 个文件在改，重建安全），`size:check` **1904 文件** 通过且 `presenter-window.tsx` 落在 **494 行**（未动基线），`deep-imports:check` 通过（`lib/markdown/*` 子路径是本模块既有引用面，`slide-html.ts:1` 等 8 处在先），`surfaces:check` 8 表面 / `vendor:check` / `budget:check` / `i18n:check`（3901 键，本条无新文案）全绿；**本次全量单测里唯一真实新增的门禁红是 `tests/kanban-render-channel.test.ts` 的 2 条调用点名单**（新调用点必须自报通道与栅栏体来源），已把它写进两处名单（`snapshot` / `option`）并同步该文件顶部那份表面清单；`npm run test:unit` 全量 **617 文件 / 6010 通过 + 1 跳过 / 1 失败**，失败为 `blog-comments-window.test.ts > mounts one page of rows and grows on demand` 的 `Error: Test timed out in 5000ms`，单跑该文件 **1 例全绿**（与 R2-1 / N-10 两次采样同类的负载敏感超时，该文件不引用演示目录）；演示目录 + `enhance` + `mindmap` 合跑 **33 文件 / 902 例全绿**；提交钩子增量 `tsc -b` 与 `vitest related` **5 文件 / 38 例全绿**。
  - 落地取舍与残留：①三个 `snapshot` 通道与 `codeBlockCollapseLines: 0`、`mindmapBox` 逐字对齐放映侧的暂存准备（`use-slide-html.ts:41-57`），不是「演讲者窗自己另定一遍」——两表面读出不同配色或尺寸即回归，判据由 M8/M9 钉住。②`renderSlideSource(source, true)` 的外链参数沿用改前的硬编码 `true`，本条不动（那是 N-19/N-36 的射程）。③浏览器端证据仍为零：`e2e-visual.mjs` 完全不打开演讲者窗，「演讲者窗里图真画出来了、切主题会重画」没有像素级断言，与 R2-2 四条共同的残留同类，随 R2-3 的场景补齐一起做（L-1 那三条缩略图红正属于「缓存标记 vs 实画」同一族问题）。④`presenter-window.tsx` 494 行、离 500 上限只剩 6 行余量：本条没把 `PresenterSlidePreview` + `PresenterScaledSlide` + `useStageAutoMetrics` 拆出去，是选「不夹带无关重构」（`铁律 14`），但 N-05/N-06 任一条再往该文件加东西之前，拆分是前置动作。⑤`preview.mermaid` 在两个放映表面上都不生效由本条变异暴露，另立 **L-5** 跟踪，本条未改行为。
- 2026-10-02 · R2-3 / N-05（`4174b9e6`）：放映计时改由「本次放映」定起点。`store/presentation.ts` 新增 `startedAt`（`start()` 记 `Date.now()`、`stop()` 清零、未放映为 `0`），`presentation-overlay.tsx` 读出后经 `PresentationSessionOptions` 透传，`use-presentation-session.ts` 的 `useSessionPresenter` 删掉自带的 `useRef(Date.now()).current` 并改为对象传参。
  - 方案在案：缺陷不在 `usePresenterTimer`——它从 B4-05 起就按 `startedAt` 变化复位（清 `accumulatedMs`、清 `isPaused`），只是此前永远收到同一个冻结值。真正的错处在喂给它的那个数：`PresentationOverlay` 由外壳长期挂载（`presentation-overlay.tsx:18-33`，`open` 为假只是 `return null`，hooks 不卸载），所以「在读取处取时刻」等于取应用启动时刻，且同会话第二场继续累加。所有权因此交给放映本身的生命周期（`start()/stop()`），而不是给浮层找挂载时机。另一条可选路「在 `openPresenter()` 点击时记戳」不选：那会把「放映开始」与「打开演讲者窗」绑死，先演讲、中途才开演讲者窗的既有顺序会拿到错误起点。传参走 options 而非在 session 内直接订阅 store，与本模块「state 订阅在浮层、`getState()` 只用于 action」的分工一致。
  - 红先在案：实现前三个测试文件合跑 = `Test Files 2 failed | 1 passed (3)` / `Tests 4 failed | 32 passed (36)`，四条失败名为 `stamps the moment the show started and restamps it for the next one`、`keeps one clock while the show freezes, captures and follows again`（store，两条均 `AssertionError: expected +0 to be 5000`）、`counts from the moment this show started rather than from the moment the app mounted`（`AssertionError: expected 1000 to be 61000`）、`restamps the clock for the next show instead of carrying the previous one over`（`AssertionError: expected 1000 to be 3700000`）。
  - 后补用例（不冒充红先）：`keeps one clock while the same show follows, freezes and resumes`（集成）与 `starts a new talk from zero instead of adding up the one before it`（`usePresenterTimer`）写于实现之前但**改前即绿**，作用是钉住「同场次内不改戳」与「B4-05 的复位不被本条改坏」；`restamps when a new note takes over a show that is still open` 与 `counts the talk from the show clock the projector sent, not from its own clock` 写于实现之后，前者为 M11 而补（`start()` 在未 stop 的放映上直接换笔记是可达路径：命令面板与全局快捷键都走 `startPresentationFromNote()`，而 `start()` 没有 `open` 守卫），后者是 M10 首轮存活后补的判据。敏感度一律由下面的变异证明。
  - 变异在案：11 项（`/tmp/mut-n05.mjs`，锚点落在 store / session / overlay / presenter-window 四个源文件，四个测试文件合跑），控制运行 `red=0 green=38`，跑完逐源 `restored … true` 且 `md5sum -c /tmp/n05-md5.txt` 全 OK。**11/11 被具名用例杀死**（红数 M1 5 / M2 5 / M3 1 / M4 2 / M5 2 / M6 3 / M7 1 / M8 1 / M9 1 / M10 1 / M11 1）。两处如实记录：①**M10（`usePresenterTimer(state.startedAt)` → `usePresenterTimer(0)`）首轮 SURVIVED**——演讲者窗此前只断言计时元素存在与「reset 后 00:00」，从不断言那个数读的是通道里的放映时钟；补一条具名用例后复跑，该变异只杀这 1 条（`03:20` vs `01:05`）。②M3（`stop()` 不清零）由**既有**用例 `stopping clears the snapshot so the next show cannot open a stale deck` 杀死（`IDLE` 加了 `startedAt: 0` 之后），不是本条新写的用例。电池在拆分测试文件之后按最终字节整体复跑一遍，仍是 11/11。
  - 事故与教训在案：①电池脚本前两版自行崩溃（模板串里多一个右括号；`readFileSync` 未带 `'utf8'` 导致 `original.split is not a function`），两次崩溃都发生在任何写入之前，`md5sum -c` 证明树未被污染。②第三次收口时用 `pkill -f mut-n05.mjs` 停一个多余的复跑，该模式同时匹配发起命令的 shell 自身（`Exit code 143`），被停的那个进程正处在 M2 生效期间，于是 `store/presentation.ts` 留下变异体——由 `md5sum -c` 报 `FAILED` 发现，按精确字符串还原为 `startedAt: Date.now()`，复跑该文件 8 例全绿后 md5 回原值。教训与既有记忆同一族：`pkill -f <脚本名>` 会命中等待者自己，重型电池只按 PID 收口，且还原核验一律在杀进程之后做。③新增的假计时器用例把 `vi.useRealTimers()` 放在末行，断言失败时会把它跳过、把同文件后续用例留在假计时器上（首轮 M10 实测放大成 13 红 + 5 条 5 s 超时）——已在该文件的 `afterEach` 归还真实计时器。
  - 门禁在案：`npm run typecheck` rc=0——先红一处 `presenter-show-clock.test.ts(31,3): TS2322 number | undefined`，helper 改为显式 `typeof` 收窄后抛错，不用 `as`（`escape:check` 禁这类逃逸）。13 项静态门禁逐条 rc=0：`size:check` 先红两处（`presenter-window.test.ts` 报 `{"lines":508}` 超 500 上限、`presenter-show-clock.test.ts` 报 `{"longFns":1}` 即那个 describe 回调超 50 行），处理方式是**按职责拆而不是压行**——N-04 的富媒体增强用例（含三个 vendor stub 与夹具）整块移入新文件 `presenter-view/presenter-slide-media.test.ts`（225 行），show-clock 文件拆成「跨场次」与「场次内」两个 describe，拆后 `presenter-window.test.ts` 299 行、四个文件合跑 38 例全绿，`check-size.baseline.json` 未动（仍 52 条 grandfathered / 1906 文件）；`comments:check` 先红（store 的 `startedAt` 文档注释与新测试文件的注释），`sync-comments-allowlist.mjs` 重建至 **13173 条 / 1361 文件** 通过，`git diff` 核对新增 16 行只落在本条改动的文件里。`npm run test:unit` 全量 **619 文件 / 6019 通过 + 1 跳过 / 0 失败**（180.9 s；R2-2 收尾同口径为 617 / 6003，本批 N-04 + 本条新增用例与文件），那条负载敏感超时本轮没有复现。提交钩子另跑增量 `tsc -b` 与 `vitest related` **11 文件 / 68 例**全绿。本条无用户可见文案变化，`i18n:check` 键数不动。
  - 落地取舍与残留：①`startedAt: 0` 表示「没有放映」而不是「1970 年起算」，不给它加特判——广播的 sync effect 已被 `open` 门住（`use-presenter-channel.ts:214-224`，N-26 之后），通道不会把 0 当成一次有效载荷发出去，为不会发生的场景写防御反而掩盖真正的守卫位置。②`useSessionPresenter` 改对象传参只为本条不再往 6 个位置参数上叠第 7 个（`AGENTS` 参数规则），行为无变化。③测试文件拆分把 N-04 的 9 条媒体用例移出 `presenter-window.test.ts`，用例逐字未改；N-04 台账里按文件名的引用以本次为准，其变异电池不因这次移动重跑（判据与被测源文件的锚点都不变）。④浏览器端证据仍为零：`e2e-visual.mjs` 从不打开演讲者窗，所以「演讲者窗的计时从本次放映起算、跨场次归零」没有像素级断言，与 N-04 ③、R2-2 四条共同的残留同族，随 R2-3 的演讲者窗场景一起补。⑤`presenter-window.tsx` 保持 494 行（本条没往里加东西），N-06 若要在演讲者侧加内嵌面板，那条「先拆 `PresenterSlidePreview` + `PresenterScaledSlide` + `useStageAutoMetrics`」的前置动作仍然有效。⑥本条为确认「清零会不会把 `0` 广播出去」而读通道时发现的「放映结束后演讲者窗仍在计时」另立 **L-6**，本条未改该行为。
- 2026-10-02 · R2-3 / N-06（`d06bdb3e`，前置拆分 `227aa9ca`）：演讲者窗被浏览器拦截时不再静默失败——放映内降级出一条演讲者列。`use-presentation-session.ts` 新增 `usePresenterFallback(open)`，`openPresenter()` 里 `openPresenterWindow(token)` 返回 `null` 即 `setPanelOpen(true)` 并 toast（`tone: 'warning'`）；面板 `presenter-view/presenter-panel.tsx`（63 行）画「下一页 + 本页讲者备注 + 本次放映计时」，状态由 `useSessionPresenter` 用同一个 `buildPresenterSlideState(source)` 在本窗口内派生，`presentation-overlay.tsx` 把它挂在 `PresentationStage` 的兄弟列位置；`presenter-view/use-presenter-timer.ts`（57 行）把 `usePresenterTimer` 与 500 ms tick 从 `presenter-window.tsx` 原样移出供两表面共用（该文件 324 → 269 行）。
  - 方案在案：①选「独立一列」而不是工具栏展开——`AGENTS.md`「工具栏展开」禁止内联面板把刚点下的按钮推离指针，而这块面板要替代的恰恰是那条工具栏上的按钮；列的 `inert`/淡出契约逐字照 `SlideRail`（`chromeHidden || occluded`），放映结束（`open` 为假）随 `usePresenterFallback` 的 effect 一起收起。②面板**不走第二条 `BroadcastChannel`**：同文档内直接派生状态即可，再开一条通道等于把讲者备注与笔记源码再过一次「名字即凭据」的机制——N-07 的论证反过来读就是：能不建就不建。③当前页不进面板：投影已经在放它，与演讲者窗「当前页 + 下一页」的取舍不同，多画一份只是把同一页排两遍。④`p` 键与工具栏按钮共用 `useSessionPresenter` 的同一个回调，判定落在 session 即两条驱动同时覆盖。⑤备注面板的键盘让位（`presentation-keys.ts` 新增 `onNotesPane`）算本表面自己的正确性（`铁律 13`）：面板里那块备注用 `tabIndex={0}` 承接焦点、靠 `PageUp/PageDown/↑↓/Home/End/Space` 阅读，放映若继续吞这些键，读备注就变成翻 deck。
  - 红先在案：两条 keymap 面（`presentation-keys.test.ts` + `use-presentation-keys.test.ts`）实现前合跑 `Tests 2 failed | 45 passed (47)`；降级链路文件实现前 `Tests 4 failed | 1 passed (5)`——通过的那条按定义是 `opens no panel and says nothing when the window does open`（旧行为本就不开面板、不 toast），它不是判据而是旧行为快照，实际红先判据是那 4 条。这两轮的具体断言文本未在本轮日志中留存，逐条判据一律由下面的变异电池重放；`presenter-view/presenter-panel.test.ts`（4 例）与面板同批写就、其红先未单独留档，判据同样只由变异提供，不冒充红先。
  - 一次红得不对在案：`presenter-panel-fallback.test.ts` 更早一轮是 5 条全挂在「找不到演讲者按钮」上——`document.querySelector` 之所以为 null，是因为测试从未真正挂载 `PresentationOverlay`。用一个临时调试文件（`zz-debug.test.ts`，验证后已删）证明放映中 chrome 与 `Presenter console` 标签确实渲染，再把挂载移进 `startShow()`（`if (!view) view = renderElement(…)`，一个挂载代表整个会话），才拿到上面那轮真判据。这与 N-05 记下的「浮层由外壳长期挂载」是同一事实的两次应用。
  - 变异在案：15 项（`/tmp/mut-n06.mjs`，锚点落在 session / panel / presentation-keys / use-presentation-keys / overlay 五个源文件，五个测试文件合跑），**15/15 被具名用例杀死**（红数 M1 4 / M2 1 / M3 3 / M4 3 / M5 3 / M6 1 / M7 1 / M8 1 / M9 1 / M10 2 / M11 1 / M12 2 / M13 2 / M14 1 / M15 1），跑完打印 `tree restored byte-for-byte`。三处判据值得记：M4（面板拿不到状态）与 M5（面板无视是否被要求）从相反方向杀同一条链路，说明 `presenterPanel = panelOpen ? buildPresenterSlideState(source) : null` 这一处三元同时承重「开」与「喂」；M7（恒不 inert）与 M8（漏掉 `occluded`）各杀 1 条，即层序那条判据认的是 `occluded` 而不是淡出；M9（`usePresenterTimer(state.startedAt)` → `usePresenterTimer(Date.now())`）杀的正是「面板时钟读本次放映」而非「读自己的挂载时刻」，与 N-05 同族。正式复跑前先做锚点干跑（`/tmp/n06-anchor-check.mjs` → `anchors checked=15 bad=0`），避免整电池在无效锚点上白跑。
  - 事故与教训在案：电池被**并发启动了两次**（`/tmp/n06-battery.log` 与 `/tmp/mut-n06.log` 两份日志），两个进程在同一棵树上轮流写入不同变异体——这不会让结论更严，只会让红数无法归因（一次运行的失败可能来自另一进程的变异）。按 PID 收口（先 2685512/2685708，再补杀幸存者 2685710；不用 `pkill -f`，该模式会命中等待者自己，N-05 已记过一次），随后先跑锚点审计（`every anchor present — no leftover mutation`）再单实例复跑整电池，上面的 15/15 只引用这次干净复跑的 `/tmp/mut-n06.log`。同族教训第二条：`ps | grep -c '^node /tmp/mut-n06.mjs$'` 恒为 0，因为真实 args 是 mise 的绝对路径 node——数实例必须按 `ps -eo pid,ppid,args` 读实际输出，不能凭直觉写模式。
  - 门禁在案：`npm run typecheck` rc=0（落地后一次、下述结构调整后再一次）。13 项静态门禁逐条 rc=0，其中两处先红后绿：①`size:check` 报 `use-presentation-session.ts: baseline null -> current {"longFns":1}`——`usePresentationSession` 因两个新返回键越过 50 行；处理是**按该函数自己的约定收，而不是压行**：`useSessionPresenter` 的三件产物合成 `presenter` 一次展开（键映射改读 `presenter.openPresenter`），净减 2 行，`check-size.baseline.json` 未动（仍 **52 条 grandfathered / 1912 文件**）。②`i18n:check` 报两处中文：`presentation-overlay.tsx:74` 的注释写了 `AGENTS「工具栏展开」`，而它被 `sync-comments-allowlist.mjs` 收进白名单后又在 `scripts/check-comments.mjs:6867` 二次报红——注释改为全英文后两处同清（白名单内 `grep -c 工具栏` = 0）。`comments:check` 重建至 **13190 条 / 1363 文件**（新增 23 行经 `git diff` 核对只落在本条文件里）；`i18n:check` **3903 键**（本条 +2 条文案）；`surfaces:check` 仍报 **8 表面**——面板是 dialog 内的兄弟列，不是 `fixed inset-0`/`app-viewport-fixed` 根，故台账「名单同步」一项实际无需同步。`npm run budget:check`（含 `npm run build`）rc=0。`npm run test:unit` 全量在本条里跑了**两次**：结构调整前 **621 文件 / 6031 通过 + 1 跳过 / 0 失败**（213 s），调整后再跑 **1 failed | 620 passed (621) / 6030 通过 + 1 失败 + 1 跳过**（178 s），唯一失败为 `src/client/features/blog/blog-comments-window.test.ts > comment list window > mounts one page of rows and grows on demand` 的 `Error: Test timed out in 5000ms`——单跑该文件 **1 例全绿**（4.71 s），且该文件不引用演示目录（`grep -c presentation` = 0）；同一条用例在同一轮里一次过一次超时，按台账已知的负载敏感超时记（N-04 记过同名用例），不记为新增失败。提交钩子另跑增量 `tsc -b` 与 `vitest related` **417 文件 / 4007 例**全绿；那份日志里 484 条 `not wrapped in act` 警告全部落在既有文件（kanban 系列、`music-servers.test.ts`、`slide-overview-grid.test.ts` 等），本条两个新测试文件各 0 条——上一轮为压这批警告试过 `vi.useFakeTimers()`，实测与本条无关（真因是「已渲染标记的微任务落在 `act` 之外」），改为在 `await act(async () => …)` 里放行微任务后归零，假计时器已从该文件撤回（`grep -c useFakeTimers presenter-panel-fallback.test.ts` = 0）。
  - 落地取舍与残留：①与台账「涉及文件」的偏差：`presentation-controls.tsx` **未改**——按钮走 `onOpenPresenter`（`presentation-controls.tsx:86`）、`p` 键走 `openPresenter`，两条驱动都汇到 `useSessionPresenter` 的同一个回调，被拦截判定放在那里即全覆盖，控件文件里没有本条的可改点。②面板状态每次渲染重算（`buildPresenterSlideState(source)` 未 memo）——与通道侧 `usePresenterBroadcaster` 的既有行为同形，属 **N-26** 射程，本条不提前修（`铁律 14`），但 N-26 落地时要把面板这条新调用点一并覆盖。③浏览器端证据仍为零：`e2e-visual.mjs` 既不打开演讲者窗，也没有「弹窗被拦截」的场景；jsdom 里 stub `window.open` 只能证明「返回 null 时降级发生」，证明不了真实浏览器在哪些条件下返回 null，与 N-04 ③、N-05 ④、R2-2 残留同族，随 R2-3 的演讲者窗场景一起补。④未合并处理 **L-6**（理由已写进该条新增两行）：面板随 `open` 收起，本表面没有「结束后仍走表」；演讲者窗停表是另一条行为决定，要先选「停表 / 停在最后值 / 归零」并配文案。⑤N-04/N-05 台账点名的前置拆分已完成（`227aa9ca` 移出 preview 与两个 pane，本条移出计时），`presenter-window.tsx` 现 269 行，该目录不再贴着 500 行上限。⑥本轮踩到的工具事实：Vitest 的 `include` 只有 `src/**/*.test.ts` 与 `tests/**/*.test.ts`，`.test.tsx` **不会被收集**（报 `No test files found`），本仓组件测试一律 `.test.ts` + `createElement`——两个新文件最初写成 `.test.tsx` 后按此改名。
- 2026-10-02 · R2-3 / N-26（`7507b92e`）：演讲者通道不再对着不存在的观众念稿。`presenter-view/use-presenter-channel.ts` 的广播改由握手门控（`ready` 到达才算有观众并当场交一次当前状态、任一方向的 `close` 即恢复沉默、挂载时的即时 sync 删除），接收侧 `usePresenterReceiver` 卸载时补上对称的 `close`；载荷从「每次渲染重算」改成本文件新导出的 `usePresenterSlideState(source)`（`useMemo`），放映内的降级面板调用点（`use-presentation-session.ts:157`）同步改走它。判据按**流量计数**而非到达计数，因此新增 `presenter-channel.test-helpers.ts`（先记录每次 post 再投递的通道桩，61 行）与 `use-presenter-broadcast.test.ts`（153 行 / 4 例），`use-presenter-channel.test.ts` 删掉自带的不记账桩（+6/−39）。
  - 方案在案：①门控用 ref 而不是 `connected` state——`ready`/`close` 都经异步投递到达，用 state 会把「有没有观众」这件事变成一次额外渲染，而广播只需要在下一次 effect 里读到它；代价如实写在源码注释里：ref 变化不重跑 effect，所以 `readyRef` **不在** sync effect 的依赖数组内，迟到的窗由通道内的握手服务、effect 只欠「有观众期间的变化」。②载荷**仍然只带源文本**、不带放映侧已渲染的 HTML，即 N-04 选 A 的取舍不变；正因如此「少发」本身就是这条通道上的隐私判据——空转回放的是作者私密讲者备注与笔记原文，同源里任何一个知道频道名的文档都收得到。③接收侧对称 post `close`：放映侧关窗那一路本来就有（`useBroadcasterChannel` 的 cleanup），反过来缺它就成了「放映侧留着一个已经不存在的监听者」。④N-05 取舍①依赖的那道门（sync effect 被 `open` 守看）在本条之后多了一层（`open && readyRef.current && channelRef.current`），「`startedAt: 0` 不会被当成一次有效载荷发出去」的结论只更强，不改判。
  - 红先在案：新文件的 3 例先写、先对着**改前**的通道跑，`Test Files 1 failed (1) / Tests 3 failed (3)`，三条断言逐字是 `expected 2 to be +0`（无人听却发了两次）、`expected 3 to be 1`（两次同页重绘各发一次）、`expected 3 to be 1`（窗关了还在发）。第 4 例「hands a window that arrives late the page it missed, notes and all」是**实现后补的钉住用例**（披露：它防的是反向退化——为省流量把交付冻结在挂载时刻），并由 M8 杀它证明有效。
  - 变异在案：电池 `/tmp/mut-n26.mjs`（10 个变异体，只改 `use-presenter-channel.ts`，跑那 4 个文件）。开跑前先跑 control 并**要求 42/42 全绿**才允许写入，结果 `control run: total=42 passed=42 failed=0`；十条逐条 KILLED 且都点名到具体断言：M1 挂载即发 3 红、M2 不把来窗当观众 2 红、M3 不再问有没有人听 3 红、M4 不学窗已离开 1 红、M5 窗离开不吭声 1 红、M6 载荷每次渲染重算 1 红、M7 依赖清单漏掉页码 2 红、M8 握手只交挂载时的状态 1 红、M9 没窗也建通道 1 红、M10 广播不再跟随放映 2 红。十个变异跑完都按保存字节还原（`restored=true` ×10），电池末行 `tree restored byte-for-byte`。源文件的最终字节 = 电池所测字节；测试文件在电池跑完后只做过「describe 分组」与「删无用导出」两处形状改动，故按最终字节**复跑一遍整条电池**，红数与上一行逐条同名（killed 10/10、total=42 不变）。
  - 事故与教训在案：①第一版 M4 的锚点从 `      } else if (msg.type === 'close') {` 起删，把上一条 `command` 分支的收尾花括号一起吃掉 → oxc 解析失败、vitest 收集不到用例，而电池把「失败断言数为 0」读成 **SURVIVED**，差点记成一条没人管的判据。修在两处：锚点带上文（从 `handleInboundCommand(msg.command, navRef.current)` 那行起）使删掉分支后语法仍合法；电池加两重护栏——control 必须全绿才开跑，每个变异体跑完的**收集用例总数必须等于 control 的 42**，否则报 INVALID（另有 `total === 0` 与 `TransformError|SyntaxError|ParseError` 两道）。这与既有判据同族：killed = 具名断言失败，空断言列表不是证据。②`i18n:check` 第三次被同一件事拦下：注释里用了中文直角引号「」（两份新文件各一处，白名单吸收后成第三处），改成英文双引号并重跑 `sync-comments-allowlist.mjs` 后 rc=0。③`size:check` 先红 `use-presenter-broadcast.test.ts {"longFns":1}`——单个 describe 回调 61 行 > 50；处理仍按「按职责拆而不是压行」，拆成「who the show is willing to speak to」（无人听不发 / 窗关了恢复沉默）与「what one page turn costs」（同页重绘不发 / 迟到窗拿到当前页）两个 describe，用例逐字未动、拆后 4 例照旧全绿，`check-size.baseline.json` 未动（52 条 grandfathered / 1914 文件）。④共用桩抽出后 `channelPosts()` 无人使用，按 `铁律 5` 直接删；`syncs()` 那层只转发一次的包装也一并去掉，断言直接读 `syncPostCount()`。⑤实现后用例 2/3 仍然红，一路追到**夹具自己**：`options(slide)` 原来每次渲染新建 `deck`/`notes`/`plans` 字面量，于是一次重绘在判据上就是「状态动了」，这个文件量的会变成夹具而不是被测源文件。定位用了一处临时 `console.log` 打印 post 序列，看完按保存字节还原（`grep -c` 该标记归零核验），修法是三者提到模块常量——与「测试应可独立运行、不共享可变状态」是同一条要求的两面。
  - 门禁在案：`npm run typecheck` rc=0。13 项静态门禁逐条 rc=0（先红的 `i18n:check` 与 `size:check` 见上第②③条；本条无用户可见文案，`i18n:check` 键数仍 3903）。`npm run test:unit` 全量 **622 文件 / 6035 通过 + 1 跳过 / 0 失败**（199.2 s）。计数用 `git ls-tree` 复核过：`HEAD~1` 的 `*.test.ts` 为 621 个、`HEAD` 为 622 个（本条净增 1 个测试文件），而 N-06 台账记的是 619 文件 / 6019 例——**这两个文件的差额不属于本条**（本条只在 `presenter-view` 里加了一个测试文件），照实记下、不强行圆成增量；两轮全量都 0 失败，那条负载敏感超时本轮没有复现。目标面：`presenter-view` 目录 + 降级面板 6 文件 / 55 例全绿，电池所用 4 文件 / 42 例全绿。新文件对 `not wrapped in act` 的贡献实测为 **0**（单跑该文件 grep 命中 0；目录里那条 act 警告来自既有文件——首版确实有 13 条，成因是把 `await flushed()` 直接写在 `act` 外面，收成 `settle()`（`await act(async () => await flushed())`）后归零）。提交钩子另跑增量 `tsc -b` 与 `vitest related` **12 文件 / 76 例**全绿。回填时顺手更新三处按行号引用本文件的句子：N-05 的两处 `197-204` → `214-224`，L-6 的 `248-250` → `267-269`（判定文字一字未动）。
  - 落地取舍与残留：①面板侧**没有**独立的引用稳定性用例：判据住在共用的那一个 memo 里，M6/M7 杀的正是 `usePresenterSlideState`，面板随之同判；面板自己的 4 例只看内容随翻页而变，不重复量同一件事。②`useSessionPresenter` 与 `usePresenterBroadcaster` 因此各持一份 memo 实例（同输入、同判据、不会漂移）；本条不为此改 `PresenterBroadcasterOptions` 的形状把载荷搬过去传——那是 `铁律 14` 之外的搬运。③流量计数只到「几条 sync」的粒度，不断言字节数；载荷大小由 N-04 的 A 方案决定（只带源文本），本条不改判。④本条**只有 jsdom 证据**，与本批四条同族残留：`e2e-visual.mjs` 仍不打开演讲者窗，所以「真实两窗链路上一次翻页只发一条 sync」「弹窗被拦时一条都不发」都没有像素级断言——随 R2-3 批次收尾的演讲者窗场景一起补。⑤「迟到的窗拿到当前页」只覆盖到窗口在放映中途挂载这一件事；一个 token 被**两个**文档各开一次（重复点按钮）时后到的那个同样会被当作观众、前者也仍在听，本条未改这个语义（`window.open` 用同名 window 名，实际会复用同一个窗，故可达路径上只有一个观众）。
- 2026-10-02 · R2-3 批次收尾（`87a6c751` 场景 + 本条回填）：演讲者窗第一次在真实浏览器里被打开并读过。`scripts/e2e-visual.mjs` 新增 `assertPresenterConsole`（25 条断言，排在 `assertPresentationOverview` 之后），按 `workspace.presentation_presenter` 的**真实指针点击**（不是 `element.click()`——`window.open` 只认用户激活，合成点击会把浏览器的拦截错当成应用的降级）开出 `?presenter=` 第二个文档，再读它自己的窗格；为此在 `presenter-window.tsx`（`data-presenter-current-pane` / `data-presenter-clock`）、`presenter-panes.tsx`（`data-presenter-next-pane`，演讲者窗与降级面板共用该组件）、`presenter-panel.tsx`（`data-presenter-clock`）加三个按身份读取的钩子，`LABELS` 补演讲者窗与面板的可访问名称（全经 `localeLabel` 取资源）。
  - 场景在案（逐条对上本批四条 + R2-2 收尾留下的一条）：N-04 = `the diagram is drawn rather than pasted`（当前页里 mermaid 由该窗自己的增强链画成 `svg`，页面文本不再含 `flowchart`）；N-05 = `the clock counts this show, not the app`（门禁跑到此处应用已开数分钟，而窗上计时 < 120 s）；N-06 = `a refused window is said out loud` / `leaves the console in this window` / `the panel carries the page, the cue and the clock` / `a turn still moves the panel` / `the panel is gone once dismissed`；N-26 = `nothing is spoken before a window asks` / `arriving is answered` / `a settled window hears nothing until the deck moves` / `one turn is one broadcast` / `a chrome redraw is not a page turn` / `with nobody to hear, the show still says nothing`；R2-2 收尾③交给本批的双窗链路 = `a turn in the window moves the projector`（在演讲者窗按 ArrowRight，放映侧计数器 +1）。流量判据用 `BroadcastChannel.prototype.postMessage` 的包装只数 `sync`——「发了几条」正是 N-26 的判据本身，与 jsdom 侧数的是同一个东西。
  - 三轮自我纠正在案：①第一次完整跑（场景 26 条）红三条，其中**两条是场景自己的期望写错**：开幕页的「下一页」预览的是第二页而不是第三页（实测 `next=Presenter diagram`），以及 `arriving costs exactly one broadcast` 把「到达恰好一条」当成不变量，而真实浏览器里分页测量可能在窗到达之后才落定（实测 2 条）。判据因此换成有界的 `arriving is answered`（1~4 条）加一条更强的 `a settled window hears nothing until the deck moves`（静置 1.5 s 不增长），并把「一次翻页 = 一条」的基线改成落定后的读数。②第三条不是期望写错，是本批的真发现，另立 **L-7**（见下条）。③另一处把同步的 `presenter.isClosed()` 当 promise 用（`TypeError: ... .catch is not a function`），那次崩溃让整条门禁中途退出，其余场景随后完整重跑一遍才算数。
  - 新发现在案（另立 **L-7**）：放映者**关掉**演讲者窗之后，放映仍在广播。实测同一路径：窗 `window.close()` 之后一次真实翻页（`3 / 3` → `2 / 3`）仍产生一条 sync（计数 4 → 5）。机制——React 的 effect cleanup 不在浏览器丢弃文档时运行，接收侧那句对称的 `close` 告别发不出去，放映侧 `readyRef` 仍认定有观众。N-26 把损失从「每次渲染一条」压到「每次翻页一条」，但没消除它。收尾按 `铁律 14` 不修，门禁里这一段**只测不钉**，源码注释指名 L-7。
  - 逐条比对在案（**10 = L-1 基线 7 + L-3 一条 + L-4 两条，一条不多不少**）：`presentation: canvas fills the stage`、`presentation session: the canvas refills the stage`、`presentation pages:` 四条（缩略图渲染 / 图表成图 / 成图像素 / 主题反转重备列表）、`a11y: the presentation overlay has no axe violations`（`.bottom-4` 1.67:1）= L-1 七条；`mindmap: a node added from the keyboard reaches the note source` = L-3；`cover: pressing a key lifts the blackout` 与 `cover: W covers the projector in white` = L-4（R2-2 收尾那轮这两条为绿，本轮为红，与该条「本地实例随机红」的记载一致）。本批新增的 25 条**全绿**。
  - 计数账在案：视觉门禁由 R2-2 收尾的 726 通过 / 8 红（734 条）变为 **749 通过 / 10 红**（759 条）——734 + 25 = 759，通过数 726 + 25 − 2（cover 两条由绿转红）= 749，两处差值都能对上，没有解释不了的红。
  - 间歇红在案（另立 **L-8**）：`surface keyboard: the kanban board hands focus back to the control it was opened from` 在第一轮（26 条时）红，detail `{"opener":"button[全屏]","active":"button[全屏]","inherited":"","returned":false}`——名称相同而元素身份不同，即比对发生在看板顶栏控件被重建之后；去掉 L-7 那条断言后同一份场景代码复跑为绿。两轮都含本批新场景，故与本批改动无因果，是一条本身间歇的门禁断言。
  - 门禁在案：`npm run test:unit` 全量 **622 文件 / 6035 通过 + 1 跳过 / 0 失败**（212.7 s）；`node scripts/e2e-visual.mjs` **749 通过 / 10 红**（见上三条）；`npm run contrast:check` rc=0；三条都在跑了整批门禁的常驻实例（:7712）上跑，最终字节与提交内容同一份树。`npm run test:e2e` 第一次也跑在那台常驻实例上，得 `29 通过 / 82 失败`，第一条红即 `[setup] fresh instance (not initialized)`、第二条即 `register -> 201 owner {"code":"registration_closed"}`——**该门禁的前提是未初始化的全新实例**，与另外三条「要已配好 Owner-1 + supersecret100」的前提互斥，CI 靠顺序同时满足（同一次启动里 e2e 先建账号）。于是另起 `INKSTONE_EPHEMERAL_DEV=1` 的全新实例（:7721）重跑：`node scripts/e2e.mjs http://localhost:7721` → **177 通过 / 0 失败**，rc=0。同一台 :7721 上 `check-contrast.mjs` 连跑两次都在 `the stylesheet declares no accents to measure` 崩（而 `curl :7721/src/client/styles/tokens.css?direct` 与 :7712 同样含 14 处 `data-accent` 规则），即该门禁还需要「应用已被真实走一遍」的实例——CI 的顺序里它排在视觉门禁之后，本批因此沿用 :7712 那一次 rc=0 的结果，未再为本条重跑视觉门禁。13 项静态门禁与 `npm run typecheck` 逐条 rc=0（`size:check` 1914 文件 / 52 grandfathered，基线未动；`labels:check` 162 条标签全是资源今天携带的字符串；`comments:check` 白名单重建至 13262 条 / 1365 文件）。提交钩子另跑增量 `tsc -b` 与 `vitest related` **9 文件 / 54 例**全绿。
  - 落地取舍与残留：①场景不把「真实浏览器在哪些条件下拦截弹窗」写成断言，只覆写 `window.open` 返回 null 验证降级——可钉的是「返回 null 之后用户看得见提示、点得掉、跟着翻页」，不可钉的是拦截条件。②三个 `data-*` 只为让门禁按身份读窗格与计时，不引入新的可访问语义；`surfaces:check` 名单不动（演讲者窗根元素是 `h-screen`，降级面板在放映内部，两者都不是 `fixed inset-0` / `app-viewport-fixed` 根，本轮实测仍报 8 个表面）。③多观众情形（一个 token 被两个文档各开一次）在浏览器侧仍无证据，与 N-26 取舍⑤同源。④**L-6**（放映结束后演讲者窗仍在计时）本轮未修；收尾场景先关窗再退放映，两者不互相遮蔽。⑤收尾之后本批四条在浏览器侧的残留只剩 L-7 那一段（窗被关）与「在演讲者窗里改主题会重画富媒体」一类，随各自条目处理；R2-4 之后再回到演讲者窗场景时，应把这两类一起补。
