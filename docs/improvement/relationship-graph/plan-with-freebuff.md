# Inkstone「关系图谱」唯一执行计划（合并版）

> **文档地位**：本目录只有两份文档——问题台账 [`review-with-freebuff.md`](./review-with-freebuff.md)（`G-01…G-48`）与本执行计划。被取代的六份中间文档（`review-with-agy-1.md`、`plan-with-agy-1.md`、`review-with-qoder-1.md`、`plan-with-qoder-1.md`、`review-with-buffy-2.md`、`verify-with-buffy-1.md`）已清退；其中两份 agy 文档原为 git 跟踪文件，由一次 `docs(graph)` 提交删除。它们的有效结论已全部并入台账：29 项 agy 全部关闭并登记 7 处残留、qoder 30 项中 1 项撤下 / 6 项前提改写 / 23 项并入、buffy 20 项全部并入，去重后即 `G-01…G-48`。
> **基线分支/提交**：`improvement/relationship-graph-agy` @ `ec916280480eb06d658cd4358ace9ba23b9c2806`。台账与本计划的行号、证据均以该树为准。
> **工程规范**：[`AGENTS.md`](../../../AGENTS.md)、[`ADR-0002`](../../../ADR-0002-renderer-theme-following.md)。
> **当前状态（如实说明）**：**已开工**。批次 1（P0）四项已全部落地并收尾：1.1 `d4d2e12e`、1.2 `b45dab64`、1.3 `24f2f22a`、1.4 `1358a374`；批次收尾门禁在同一棵树上实测——`test:unit` 620 文件 / 5452 通过 + 1 跳过、`budget:check` 退出码 0、`e2e` 177 passed / 0 failed、`e2e-visual` 682 passed / 0 failed、`check-contrast` 两套主题全绿（明细见 §4「批次 1 收尾门禁」）。批次 2 四项已全部落地并收尾：2.1（G-01）`17dc66de`、2.2（G-03）`023e1e7d`、2.3（G-04①）`6e3ed4c2`、2.4（G-09）`e21bde8c`；批次收尾门禁在同一棵树上实测——`test:unit` 624 文件 / 5460 通过 + 1 跳过、`budget:check` 退出码 0、`e2e` 177 passed / 0 failed、`e2e-visual` 682 passed / 0 failed、`check-contrast` 两套主题全绿（明细见 §4「批次 2 收尾门禁」）。批次 3 已开工：3.1（G-29）`4c24d686`——用户选定 B 方案，新增客户端私有 `--graph-tag-*` 令牌并删掉第二套回退色板，两套主题全部 ≥3:1；3.2（G-30）`50ea81cc`——tag 节点加双环，三类节点不依赖颜色可辨；3.3（G-31）`d4c40a6a`——`useIsDarkTheme()` 订阅 `data-theme`，预览卡随翻转重渲；3.4（G-40）`01a9df9f`（文档：ADR/AGENTS 与代码对齐、补 G-43① 口径）+ `4d00b9f3`（断言：`assertGraphThemeFollow` 读真实像素，先红时同一元素像素和不变、仅「新调色板」一条失败，绿后 `e2e-visual` 685 passed / 0 failed）；3.5（G-41）`fbb3d235`——对比度门禁增图谱场景，十枚 `--graph-tag-*` 与画布实际平色都在两套主题下对 `--bg-base` 按 3:1 量测，先红时 `--graph-tag-1` 改成表面色即 1.00:1 报红。批次 3 收尾门禁已在同一棵树上实测——`test:unit` 625 文件 / 5466 通过 + 1 跳过（1 条已登记 flake 单跑复核通过）、`budget:check` 退出码 0、`e2e` 177 / 0、`e2e-visual` 685 / 0、`check-contrast` 两套主题全绿（含图谱行，明细见 §4「批次 3 收尾门禁」）。批次 4 已开工：4.1（G-23）`4c4286dd`——方向键改按画布空间取邻居（半平面内距离/对齐度打分）、该方向无节点时保持原选中、无选中时从两端进入，键盘选中的节点平移相机保证可见；旧「按数组序环绕」的行为与断言一并推翻（`canvas-a11y.test.ts`、`canvas-selection-loop.test.ts` 同步改）。4.2（G-24）`752cfeb8`——选中播报带上 kind（复用 `graph.tag_node`，排在标题前）、标签节点的 `Enter` 改绑「按标签筛选」并与 G-22 菜单入口同一行为、局部图谱无筛选可收敛时播报 `graph.tag_filter_unavailable` 而非静默吞键（F-02），`Enter` 的 kind 分派抽成 `activateSelectedNode` 以守住 `size:check` 的嵌套上限。4.3（G-25）`7cabe676`——设置抽屉按断点换外壳（窄屏 `div role='dialog' aria-modal='true'`、宽屏 `aside role='region'`，因为 `dialog` 不是 `aside` 的合法 role）、`aria-controls` 由面板生成 id 双向下发、开关经 `aria-describedby` 接到提示、`useSettingsDisclosureFocus` 补焦点往返，并为此把 `GraphSettingsPanel`/`GraphPanel` 各抽出一个按职责的函数以守住 50 行上限。4.4（G-26）`a67c28a5`——色板热区 `size-5` → `size-6`，行内间隙 `gap-1` → `gap-1.5` 给选中环留位。4.5（G-27）`7fd27668`——画布 `aria-describedby` 指向不再被 `hidden` 掉的说明层（窄屏以 `sr-only md:not-sr-only` 留在无障碍树里）、取消选中时播报新增的 `graph.selection_cleared`（`wasSelectedRef` 守住「从未选中不播报」）。**批次 4 已收尾**：收尾门禁在同一棵树上实测——`test:unit` 625 文件 / 5487 通过 + 1 跳过（1 条已登记 flake 单跑复核通过）、`budget:check` 退出码 0、`e2e` 177 / 0、`e2e-visual` 690 / 0、`check-contrast` 两套主题全绿（明细见 §4「批次 4 收尾门禁」）。批次 5 已开工：5.1（G-14 ①②③④）`eea50690` + `a40b2886` + `17872ccd`——搜索从「重新查询」升级为「定位」（未命中变暗、「仅显示匹配」开关与它的默认关、跳到首个命中、图例改为可聚焦按钮并单击循环高亮/过滤/清除）；5.2（G-15）`2c578962`——筛选致空时改说「没有笔记匹配这些筛选」并给「清除全部筛选」出口；5.3（G-16）`0951a445`——节点被拖过 4px 那条线（新常量 `GRAPH_CLICK_TRAVEL_MAX`，两轴相加判定）即关掉预览卡，边沿一次、标记随 `state.dragging` 生灭，松手把卡重新挂到落点节点，且拖拽后松手仍不选中不打开；5.4（G-18）`1641d909`——色板图例与节点详情徽标改由同一条 `BottomBand` 按流竖向排布（`inset-x-4 bottom-4 flex flex-col gap-2`），两个子元素不再各自 `absolute` 钉在同一条 `bottom-4` 上（375px 浏览器实测改前相交 58px、改后留 8px 间隙），并给两条叠加各加一个 `data-graph-*` 标记供结构与像素两侧定位；5.5（G-19）`891d43ab`——画布提示按 `useMediaQuery('(pointer: coarse)')` 分流文案（触屏整句写「长按查看更多」，未报 coarse 的设备保持既有整句），窄屏改画一行 `md:hidden` + `aria-hidden` 的缩写、完整句仍以 `sr-only` 挂在 `aria-describedby` 目标上（375px 实测整句需 449px、画布只有 375px，缩写行宽 261px、右侧余 98px）；5.6（G-20）`5d1492fa`——`useGraphPrefs` 提为共享的 `use-graph-prefs.ts`（写者 `useGraphPreferences` 仍只在全屏面板，读者 `useStoredGraphPreferences` 给伴随面板，同页写回靠自定义事件广播），伴随面板的画布与请求都改取用户值（`depth`/`includeOrphans`/`includeUnresolved`/`showTagNodes`，仅覆写 `mode: 'local'` 与自己的 `LOCAL_GRAPH_LIMIT`，刻意不继承 `tag`/`folderId`/`q`），头部新增 `Graph settings` 入口经 ui store 的 `graphSettingsRequested` 直达全屏抽屉（浏览器实测：改前 6 节点无图例，改后 6→4 且画出 work/urgent 两行）；5.7（G-21）`e78c6a44`——`LIMITS` 新增图谱的 limit/depth 两对界值，worker clamp、演示后端、`loadPreferences`、抽屉滑杆四处同源，`limit` 成为偏好并进请求，伴随面板头部加自己的 `Link depth`（覆写只活在本次挂载、不写回偏好），深度档位两处共用 `GRAPH_DEPTHS`，上界未突破 600 故 `useGraphFit` 的展开求极值只补承重前提注释（实测滑杆 min 50 / max 600 / step 50，拉到 600 后全屏与伴随面板的请求都跟着变成 `limit=600`；375px 头部仍 32px 不溢出）。**批次 5 已收尾**：七项在同一棵树（`ae80e96f`）上跑完收尾门禁——`test:unit` 631 文件 / 5551 通过 + 1 跳过（0 失败）、`budget:check` 退出码 0、`e2e` 177 / 0、`e2e-visual` 690 / 0（首轮 689 / 1，唯一红点是看板覆盖层焦点断言、换全新实例复跑即通过且不在本批改动面上，登记为 §8 F-07）、`check-contrast` 两套主题全绿；三项「收尾时一并看」的浏览器确认（G-18 窄屏间隙、G-14 ④ 图例空白命中穿透、Tab 序）已用 `/tmp/confirm-band.mjs` 量完并写进 §4，真机长按等价性仍留人工（明细见 §4「批次 5 收尾门禁」）。**批次 0 已开工并拿到数字**：0.1 `adef5e84` 新增 `scripts/measure-graph.mjs`（落盘 D1 副本灌 10k 笔记 / 50k 链接 + headless Chrome 帧采样，界值运行时从源码读回以防复刻漂移），三组结论是——V-01 画到客户端上限 600 节点时**每帧仍排在 vsync 内**（均值 16.9ms、p95 16.8ms、仅首帧 50ms；绘制 5.6ms/帧、物理按差值估 ≈11.3ms 上界）；V-02 一次全局页只读回 1750 行 links / 5.0ms 且走 `idx_links_user_source`，候选上限 10000 未触及；V-03 degree 聚合 113ms **占一次全局页读 143ms 的 79%**、且与页面大小无关（全库物化）。据此 §6.2 的四个闸门已登记结论：D-1（G-08）①③ 不做、② 待开标签节点的大库场景；D-2（G-10）A 不做、B 与 `no-store`/`module-state:check` 冲突故不成立，按 §5 规则 10 以证据关闭并写明重开条件；D-4（G-01 阈值 / G-03 预算）保留不动；D-3（G-47）归属决策仍未决。**批次 6 已开工**：6.1（G-11 + G-32，同一提交）——`GRAPH_FORCE_RANGES` / `GRAPH_FORCE_RANGE` 成为三个力滑块与 `loadPreferences` clamp 的同一份界值与默认值，`GraphRange` 换用组件库 `Slider`（可访问名与 `aria-valuetext` 由组件给），滑块值先落组件本地 state、在 `onPointerUp` / `onKeyUp` / `onBlur` / **`onPointerCancel`** 四个边界之一提交进 prefs，`localStorage` 写改为 300ms debounce + 卸载前 flush，`catch` 补 `console.warn`（G-20 的同页广播因此延后一程，两条跟随用例改等 `settlePersist`）。批次 6 的收尾门禁尚未跑（其余 6 项未完）。台账 §2 的 8 条失效条目仍禁止作为任务执行。任何 `[x]` 只由真实提交与真实门禁输出来填。

> **核心原则**：一项一次原子提交，正文按 `- 路径: 改动` 逐文件写；先红后绿；每落地一项即在本文档登记提交哈希与实测输出；不伪造、不夹带（铁律 14）；不静默假设、不静默失败、不静默降级。

> **4.1 的追加真实浏览器门禁**：jsdom 里那条「相机跟随」用例是手写 `state.width/height` 得来的，布局本身从未被验证，因此补 `a2e7acc2`——`scripts/e2e-visual.mjs` 新增场景 `assertGraphKeyboardWalk`（真实布局、真实相机、真实像素）。先红：临时删掉 `handleCanvasArrowKey` 的 `ensureNodeVisible(state, next)` 再跑整条 `e2e-visual` → 687 passed / 3 failed，失败的正是三条依赖相机的断言（走到窗口外的锚点框 `left=1407`、八步 `dx/dy` 全零、平移集合为空）；恢复后同树 **690 passed / 0 failed**，明细 `· graph walk: 12 presses over the graph, 2 of them panned — ArrowRight by (-124, 0)px at 0.953, ArrowRight by (-362, 0)px at 0.841`。

**编号与优先级**：唯一编号 `G-01…G-48`；分布 P0 4 条（G-06 / G-07 / G-22 / G-02）、P1 24 条、P2 17 条、候选 3 条（G-43 / G-46 / G-48），以台账 §6 为唯一来源。本计划不新增编号；落地过程中发现的新问题写进 §8「新增发现」，另开条目。

---

## 0. 怎么用这份计划

1. 每条任务的证据与方案取舍**不在此重复**，只注明台账小节号；动手前先读那一条的「判定 / 证据 / 方案」。
2. 每条给出：涉及文件 / 修改要点 / 验证命令 / 依赖 / 代价 / 提交建议 / 提交哈希 / 状态。
3. **先红后绿是硬要求**：行为变化的条目先让复现用例（或命令输出）变红，记录失败输出，再改实现转绿（AGENTS.md「修 bug 先写复现测试」）。
4. 提交哈希逐项登记进本表；`docs(graph): 登记 …` 提交与本仓库既有做法一致（`git log` 可见 `d5ec396b`、`ec916280` 等先例）。
5. 台账 §2 的 **8 条已失效条目禁止作为任务执行**。最容易踩的一条：`Q-UX-02` 主张「删除『以此笔记为中心』菜单项」——**不成立**，该入口是可达的（`onOpenNote` → 活动笔记变化 → 面板以新 id 重查）；正确判据应看 `mode`，见 §5 第 1 条。
6. 三条 🔬（G-08 / G-10 / G-47）在决策闸门里处理，不混进批次；批次 0 拿到数字前不动手。

---

## 1. 进展概览与统计

| 批次 | 涵盖编号 | 目标与完成判据 | 编号数 | 估计代价 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **批次 0（前置）｜先量后改** | V-01…V-03（无 G 编号） | 新增 `scripts/measure-graph.mjs` + 合成大库样本，拿到布局帧成本、单请求读行数、degree 聚合耗时；三个 🔬 条目据此进入决策闸门 | — | ≈0.5–1 人日 | ⬜ 未开始 |
| **批次 1｜P0 渲染连续性与红线** | G-06（含 G-07 步骤 1）、G-22、G-28、G-02、G-38 | 输入搜索词/切开关不再重建画布，拖过的坐标与 pin 存活；键盘可开节点菜单；标签边有预算；开启标签节点后截断读数不再自相矛盾 | 6 | ≈4–5 人日 | 🟢 6/6 已收尾（1.1 `d4d2e12e`、1.2 `b45dab64`、1.3 `24f2f22a`、1.4 `1358a374`；收尾门禁 test:unit 620 文件 / e2e 177 / e2e-visual 682 / contrast 全绿 / budget:check 退出码 0；G-07 步骤 2 属批次 6） |
| **批次 2｜请求与开销边界** | G-01、G-03、G-04（①）、G-09 | 一次请求读多少有明确上界；读端点有超时与节流；MCP 与 UI 的归档口径一致；拖拽不再逐事件强制布局 | 4 | ≈2 人日 | 🟢 4/4 已收尾（2.1 `17dc66de`、2.2 `023e1e7d`、2.3 `6e3ed4c2`、2.4 `e21bde8c`；收尾门禁 test:unit 624 文件 / e2e 177 / e2e-visual 682 / contrast 全绿 / budget:check 退出码 0） |
| **批次 3｜视觉、主题与门禁** | G-29、G-30、G-31、G-40、G-41（G-43① 顺手） | 调色板收敛为单一来源并达标；主题翻转预览卡同步；ADR/AGENTS 不再与代码相反且有像素断言；对比度门禁覆盖图谱表面 | 5 | ≈3.5–4 人日 | 🟢 5/5 已收尾（3.1 `4c24d686`、3.2 `50ea81cc`、3.3 `d4c40a6a`、3.4 `01a9df9f` + `4d00b9f3`、3.5 `fbb3d235`；收尾门禁 test:unit 625 文件 / e2e 177 / e2e-visual 685 / contrast 全绿（含图谱两套主题）/ budget:check 退出码 0；一条已登记 flake 已复核） |
| **批次 4｜无障碍关系与键盘语义** | G-23、G-24、G-25、G-26、G-27 | 方向键按空间序且选中可见；标签节点可辨、可操作；设置抽屉关系完整；色板热区达标；说明关联与取消播报补全 | 5 | ≈2 人日 | 🟢 5/5 已收尾（4.1 `4c4286dd` + 真实浏览器门禁 `a2e7acc2`、4.2 `752cfeb8`、4.3 `7cabe676`、4.4 `a67c28a5`、4.5 `7fd27668`；收尾门禁 test:unit 625 文件 / 5487 + 1 跳过（1 条已登记 flake 单跑通过）/ budget:check 退出码 0 / e2e 177 / e2e-visual 690 / contrast 两套主题全绿，明细见 §4「批次 4 收尾门禁」） |
| **批次 5｜交互与检索语义** | G-14、G-15、G-16、G-18、G-19、G-20、G-21 | 搜索是定位不是重查；空态有出口；拖拽期间不悬停预览；窄屏不重叠、触屏提示到位；伴随图谱复用偏好；上限/深度可调 | 7 | ≈6 人日 | 🟢 7/7 已收尾（5.1 `eea50690` + `a40b2886` + `17872ccd` 整体关闭 G-14，5.2 `2c578962` 关闭 G-15，5.3 `0951a445` 关闭 G-16，5.4 `1641d909` 关闭 G-18，5.5 `891d43ab` 关闭 G-19，5.6 `5d1492fa` 关闭 G-20，5.7 `e78c6a44` 关闭 G-21；收尾门禁 test:unit 631 文件 / 5551 + 1 跳过 / budget:check 退出码 0 / e2e 177 / e2e-visual 690（首轮 689+1 条看板焦点断言未复现，登记为 F-07）/ contrast 两套主题全绿，明细见 §4「批次 5 收尾门禁」） |
| **批次 6｜设置与工程卫生** | G-11 + G-32、G-35、G-36、G-37、G-39、G-07 步骤 2、G-33（两步两提交） | 滑块走组件库且不逐事件落盘；文案/默认值/常量单一来源；pin 跨会话持久；死重载与渲染期写 ref 清除 | 7 | ≈3 人日 | 🟡 1/7（6.1 `fix(graph)` 一次关闭 G-11 + G-32；其余 6 项未开始，收尾门禁未跑） |
| **批次 7｜收尾与对标** | G-05 + G-45、G-12、G-13、G-17、G-34、G-42、G-44 | 导出有隐私选项；字体读取策略有据；绘制异常不静默停帧；滚轮非 passive；死键清零；单篇排除；方向过滤 | 8 | ≈4.5 人日 | ⬜ 0/8 |
| **决策闸门** | G-08、G-10、G-47 | 按批次 0 的数字定 G-08/G-10；G-47 需归属决策而非数字；结论（含「不做」）必须登记为以证据关闭 | 3 | 由证据决定 | 🟡 结论已登记（D-2/G-10 以证据关闭：聚合占 79% 但 A 的契约变更代价不成立、B 与 `no-store`/`module-state:check` 冲突；D-1/G-08 ①③ 不做（600 节点下每帧都在 vsync 内）、② 待「开标签节点的大库场景」前置；D-3/G-47 归属未决；新增 D-4：G-01 阈值与 G-03 预算按 V-02 保留） |
| **不挂批次** | G-43 ②③、G-46、G-48 | 持久化契约变更 / 跨模块色板语义 / 候选清单 | 3 | 另立 | ⬜ 不排期 |
| **总计** | **G-01…G-48** | 图谱本体 45 条（42 挂批次 + 3 决策闸门） | **48** | ≈25–28 人日 + 门禁 | **🟡 30/48（批次 1–5 全部收尾＝27 条编号；决策闸门 G-10 以证据关闭＝28；批次 6 的 6.1 一次关闭 G-11 + G-32＝30；G-08 ①③ 已判「不做」、② 待前置，G-47 归属未决，故这两条不计；批次 0 的 0.1 已落地；批次 6 其余 6 项与批次 7 未开始）** |

> G-07 跨批次 1（步骤 1）与批次 6（步骤 2），编号只计一次（记在批次 1）。G-28 随 G-22 落地、不单独提交。G-04 的 ②（共享范围判定）与 G-43 的 ②③（`links` 增类型/附件节点）属**另立事项**，不进本计划排期。

### 1.1 编号定位索引（G-xx → 批次）

| 编号 | 批次 | 编号 | 批次 | 编号 | 批次 | 编号 | 批次 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| G-01 | 2 | G-13 | 7 | G-25 | 4 | G-37 | 6 |
| G-02 | 1 | G-14 | 5 | G-26 | 4 | G-38 | 1 |
| G-03 | 2 | G-15 | 5 | G-27 | 4 | G-39 | 6 |
| G-04 | 2（①） | G-16 | 5 | G-28 | 1（随 G-22） | G-40 | 3 |
| G-05 | 7 | G-17 | 7 | G-29 | 3 | G-41 | 3 |
| G-06 | 1 | G-18 | 5 | G-30 | 3 | G-42 | 7 |
| G-07 | 1 + 6 | G-19 | 5 | G-31 | 3 | G-43 | ① 3；②③ 另立 |
| G-08 | 闸门 | G-20 | 5 | G-32 | 6 | G-44 | 7 |
| G-09 | 2 | G-21 | 5 | G-33 | 6 | G-45 | 7 |
| G-10 | 闸门 | G-22 | 1 | G-34 | 7 | G-46 | 另立 |
| G-11 | 6 | G-23 | 4 | G-35 | 6 | G-47 | 闸门 |
| G-12 | 7 | G-24 | 4 | G-36 | 6 | G-48 | 候选不排期 |

---

## 2. 批次依赖与合并约束（动手前必读）

这些约束是从代码里读出来的，违反会产生比原缺陷更糟的中间态：

1. **G-06 ⇄ G-07 步骤 1 必须同批同提交**。坐标与 pin 丢失大半是画布整体重建的下游症状；只修其一会出现「画布没重建但坐标被 reset」的更怪现象。G-06 的坐标继承天然保住 pin，步骤 1 约 12 行、不动共享契约。
2. **G-11 + G-32 合并为一次提交**。两处改的是同一个 `GraphRange` 组件（换 `Slider` 与去掉逐事件副作用）；拆开会出现「新组件里仍带旧副作用」的中间版本。
3. **G-22 先于 G-24 与 G-07 步骤 2**。菜单独占「固定节点 / 按标签筛选 / 右侧打开 / 以此笔记为中心」四个功能；键盘入口不修，后续给标签节点绑的「按标签筛选」与 pin 持久化对键盘用户同样不可达。
4. **G-34（死键清理）排在 G-35 与 G-24 之后**。`graph.reset` 由 G-35 一并删除；`graph.tag_node` 被 G-24 使用必须保留——提前删会让两项的文案来源断裂。
5. **G-41 的四条功能断言各归入其功能项的同一提交**（跨查询 pin 存活 → G-07；标签边预算 → G-02；键盘开菜单 → G-22；筛选空态出口 → G-15），**不单开测试批次**，否则又变成「先实现后补测」。G-41 本身只做对比度门禁的图谱场景与核对。
6. **G-29 若走 B 方案（新增 `--graph-tag-*` 令牌）**：改共享令牌后必须 `node scripts/check-token-drift.mjs --update-baseline`，且 G-41 的图谱场景同批跟上（色板改了才需要门禁守住）。
7. **G-21 若把 `limit` 上界提到数千**，`canvas-hooks.tsx` 的 `Math.min(...xs)` 必须同步改循环求极值——当前不溢出只是因为服务端 `clampInt` 上限 600（见台账 V-04）。在 600 以内则只需一条注释说明前提。
8. **G-02 与 G-38 共用 `buildGraphBody` 的标签边与 `truncated`/`totalEdges` 判定**，排同批、相邻提交（避免两次改同一段），但仍是两个提交：一个是预算，一个是读数口径。
9. **G-33 必须两步两提交**：先删零调用者的位置重载与 `!` 断言；再把 `canvas-draw.test.ts` / `canvas-physics.test.ts` 改成传 `{ current }` 后删 `'current' in` 双形态判断。合成一步会让「先红后绿」把测试失败误读成回归。
10. **G-40 的文档部分先单独 `docs(graph)` 提交**，并**保留 `ADR-0002:59` 的「修复方向」段**——它顺带记录了「这条 effect 会重建布局」，正是 G-06 的根因，删掉会丢失为什么坐标继承要存在。
11. **G-46 不挂图谱批次**（五处调用点同改，只改图谱会制造局部偏离，铁律 14）；**G-43 ②③ 不挂图谱批次**（`links` 表增类型属持久化契约变更，须走 expand-contract + 迁移不可变门禁 + 部署前备份）。
12. **同一文件被多提交共享时**（`canvas-draw.ts`、`canvas.tsx`、`index.tsx`、`graph.ts` 会各被多项触碰）：按 AGENTS.md「分批与门禁」执行——工作区停在最终态，只把本批 hunk 暂存（`git diff <file> > /tmp/all.patch` 后按块切分），每个暂存快照单独用 `git archive` 快照验证；**不得为凑中间态回退工作区**。

---

## 3. 执行前提与门禁操作（本工程实测，避免误判回归）

- **统一命令（每条提交前）**，下表各条目的「验证命令」在此之上叠加：

```bash
npm run typecheck && npm run style:check && npm run comments:check && npm run empty-catch:check \
  && npm run escape:check && npm run hardcoded:check && npm run tokens:check && npm run i18n:check \
  && npm run size:check && npm run module-state:check && npm run deep-imports:check \
  && npm run surfaces:check \
  && npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts \
     src/shared/graph-filter-expression.test.ts tests/graph-routes.test.ts src/client/demo/backend.test.ts
```

  改到 i18n 文案或视觉文案的条目（G-15 / G-19 / G-24 / G-27 / G-34 / G-35 等）另跑 `npm run labels:check`。

- **批次收尾（每批一次）**：`npm run test:unit`、`npm run build`、`npm run budget:check`，以及三个浏览器门禁。浏览器门禁**只对全新实例有效**：以当前树新起 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`（用 `setsid nohup … </dev/null &` 启动，避免超时调用杀掉进程组）后依次 `node scripts/e2e.mjs`、`INKSTONE_CHROME_PATH=… node scripts/e2e-visual.mjs`、`INKSTONE_CHROME_PATH=… node scripts/check-contrast.mjs`；复用上一轮实例会累积账号/面板状态并产出假失败。判定「是否我引入的」用 `git archive HEAD~N` 快照跑同一条门禁对比。
- **浏览器门禁运行期间不改任何文件**：Tailwind 会重扫 `.md`/`.mjs` 并重出 `app.css`，页面会在 `page.evaluate` 期间跳转。文档编辑与门禁串行。
- **`npm run test:unit` 有已登记的负载敏感 flake**（`tests/starter-deck-render.test.ts`、`blog-comments-window.test.ts`、`calendar-tree.test/activity.test.ts`、`radiogroup-names*.test.ts`、`music-hub-modal.test.ts`，以及 `music-store/eq.test.ts:164` 的取值断言）。全量红时先看失败块是否为 `Test timed out`，再单独重跑那几个文件并核对 import；按 flake 如实报告，不得写「全绿」，也不得顺手修（铁律 14）。
- **`check-size.mjs` 把 `describe`/`it` 的回调也计为函数**：在既有 describe 里加用例可能被报成长函数并让基线从 `null` 变 `{"longFns":1}`。做法是拆分 describe 或把 setup 提出去，**不用 `--update-baseline` 吸收自己造的长函数**。
- **`check-hardcoded.mjs` 按文件粒度 grandfathering**：从别的组件原样复制一行 `text-white` 到新文件仍是新违规，用令牌（如 `--swatch-white`）。
- **本仓库禁止运行 prettier**（无配置，其默认风格与 `style:check` 冲突）。格式以一提交前的门禁为准。
- `.githooks/pre-commit` 镜像大部分静态门禁，并对暂存 TS 跑增量 `tsc -b` 与 `vitest related`；它检查的是**工作区**而非暂存快照，多提交共享文件时按 §2 第 12 条处理。

---

## 4. 详细任务执行清单

### 批次 0：先量后改（V-01…V-03）

> 目标：把三条 🔬 从「推断」变成「实测」。完成判据：三个数字写进台账 §5 的 V 表，并作为 §6 决策闸门的输入。本批不碰产品代码，可与批次 1 并行。

- [x] **0.1 新增 `scripts/measure-graph.mjs`：布局帧成本、单请求读行数、degree 聚合耗时**
  - 台账：§5 V-01 / V-02 / V-03
  - 文件：`scripts/measure-graph.mjs`（新增）；合成样本写入方式沿用既有脚本（写笔记/栅栏或直接对本地 D1 造库），不改 `src/`
  - 要点：① 按仓库既有手动验收脚本惯例——`node scripts/measure-graph.mjs [baseUrl] [nodes]`，`NODES`/推帧上限可调，账号用 `INKSTONE_VISUAL_USERNAME/PASSWORD`、浏览器用 `INKSTONE_CHROME_PATH`，**只报告不判定**（帧时序在共享 runner 上是噪声）；② 采样项：布局期物理 vs 绘制占比、单次布局最长提交、每次请求耗时与返回的节点/边数（配合 `wrangler d1 execute --local` 的 `EXPLAIN QUERY PLAN` 与 10k 笔记 / 50k 链接量级合成库）；③ 结论以数据 + 判读两段打印，与 `measure-preflight.mjs` / `measure-kanban.mjs` / `measure-music.mjs` 同风格
  - 验证：在全新 `dev:kv` 实例上跑通脚本（`node scripts/measure-graph.mjs`），把三组数字与本机配置一并贴进台账 §5
  - 落地口径（实际）：按用户 2026-10-02 的决策走**落盘实例 + 复刻 SQL**，而不是退到 HTTP 层计时。SQL 段把 `.wrangler/state/v3/d1/**/<hash>.sqlite` **复制**到临时文件后灌 10k 笔记 / 50k 链接（永不原地写），复刻 `graph.ts` 的全局页查询、degree 聚合、分块 links 读与局部递归，逐条 `EXPLAIN QUERY PLAN` + 5 次计时取中位；浏览器段用公开 API 灌 `DRAW_NODES`（默认 600）篇笔记、开图谱采样 rAF 帧间隔与 longtask，再用真实导出函数（`buildInitialLayout`/`drawEdges`/`drawNodes`/`drawLabels`）在离屏 ctx 上量单帧绘制。**要点 ① 的两处偏离**：账号不是 `INKSTONE_VISUAL_USERNAME` 而是脚本自己的固定 fixture `graph-perf`（登录优先、注册兜底，第二次跑复用已灌好的库，省掉 26 秒）；界值不写死——`sourceNumbers()` 运行时从 `graph.ts`/`helpers.ts`/`shared/constants.ts` 读回 chunk / 候选上限 / limit 三对数字，读不到就硬失败，让「复刻的 SQL 静默漂走」变成一次报错。报告文本一律英文：`i18n:check` 里兄弟脚本的白名单理由是「按语言匹配 UI 标签」，与本脚本的终端报告不同，故不扩白名单而改英文
  - 可验证性（量测脚本没有「先红」，但两道守卫被实测过）：① `sourceNumbers()` 第一版只认 `name = 数字`，被 `LIMITS` 的 `name: 数字` 写法挡下并报 `graphNodeLimitDefault is no longer a plain numeric constant; update this script`，说明漂移守卫不是摆设；② 迁移只在首个碰库请求时才跑，空 D1 文件复制过来后表是空的，故补 `assertSchema`，否则脚本会安静地量一个 0 行的库
  - 实测数字（本机 miniflare + headless Chrome，非生产 D1；三次跑一致）：**V-01** 画 600 节点时 settle 窗口 663 帧、均值 16.9ms、p95 16.8ms、最长 50ms，longtask 1 条 53ms；真实函数离屏绘制一帧中位 5.6ms（最大 11.6ms），建布局（含首帧物理）1.3ms，物理按差值估 ≈11.3ms/帧——均值贴住 vsync、不掉帧。**V-02** 350 节点页面 → 9 条分块语句读回 1750 行 links、合计 5.0ms（最慢单条 1.7ms），候选上限 10000 远未触及，计划走 `idx_links_user_source`；局部递归 depth1/2/3 = 0.3 / 0.7 / 5.5ms。**V-03** 一次全局页读中位 143.4ms（最大 179.1ms），其中 degree 聚合中位 113.0ms（最大 124.3ms）＝**79%**，且聚合量与页面大小无关（10000 note 行 / 100000 端点全量物化，计划里是 `MATERIALIZE d` + `SCAN (subquery-2)` + `USE TEMP B-TREE FOR GROUP BY` + `AUTOMATIC COVERING INDEX`）
  - 验证命令（已跑）：`node scripts/measure-graph.mjs http://localhost:7715` 全跑通（另以 `SKIP_BROWSER=1` 单跑 SQL 段一次）；7 项相关静态门禁全绿（`i18n` 3918 键、`comments` 重新同步后 **13078 条 / 1384 文件**、`size` 1920 文件 / 47 豁免不变（脚本 433 行 < 500）、`style`/`escape`/`empty-catch`/`hardcoded` 均 0）；`npm run test:unit` → **631 文件 / 5550 通过 + 1 跳过，1 条失败**（`blog-comments-window.test.ts` `Test timed out in 5000ms`，单跑 1/0 通过、4.15s）——§3 已登记的负载敏感 flake，未顺手修
  - 边界（如实登记）：① SQL 数字是**本机 miniflare 落盘副本**的，不是生产 D1 的绝对延迟，能信的是「读的形状、索引选择、degree 占页面读的占比」；② 物理占比是「整帧 − 绘制」的差值，含浏览器自己的合成与回收，是上界而非精确拆分；不为测量去导出 `advancePhysics`（本批声明不碰 `src/`）；③ `NOTES`（SQL 库大小）与 `DRAW_NODES`（浏览器画多少）是两个尺寸，后者默认 600 是因为客户端不能要更多——更大的库只让读更重（那是 V-02/V-03 的问题），不让画面更密；④ 浏览器段复用实例上已有的库，同一实例第二次跑不重灌，故数字依赖实例状态，要干净对比就换新实例；⑤ longtask 条数在两次运行间是 1 与 0，均值与最长稳定；⑥ 运维事实：`--port 7714 --strictPort` 起不来时 `curl :7714/api/health` 仍会返回**另一个 worktree 实例**的健康检查，表现为「注册 403」——本机 :7712 与 :7714 都属别的会话，起实例前必须先确认端口空闲；且 `INKSTONE_EPHEMERAL_DEV=1` 只影响 `persistState`，并不会把 D1 与别的实例隔开
  - 依赖：无。G-08 / G-10 / G-01 阈值 / G-03 必要性引用它的输出
  - 代价：S（0.5–1 人日）｜提交建议：`perf(graph)` → 实际用 `test(graph)`（本项不改产品代码，`perf` 会被读成性能改动）
  - 提交哈希：`adef5e84`｜状态：✅ 已完成（2026-10-02）

### 批次 1：P0 渲染连续性与红线（6 项编号 / 4 次提交）

> 完成判据：输入搜索词、切换六个开关、重试时画布**不重建**，读者拖过的坐标与 pin 原样保留；键盘能打开节点菜单；`tagNodes=1` 时边数落在预算内；开启标签节点后截断徽标与顶部统计不再互相矛盾。

- [x] **1.1 G-06（含 G-07 步骤 1）｜画布不再整体重建，坐标与 pin 跨查询存活** ★P0
  - 台账：§3.2 G-06 / G-07
  - 文件：`graph-panel/index.tsx`、`canvas.tsx`、`canvas-draw.ts`、`canvas-hooks.tsx`、`types.ts`；`canvas-physics.test.ts`、`panel-parameter-isolation.test.ts`
  - 要点：① `buildInitialLayout` 增 `previous` 参数，按 id 建 Map 继承 `x/y/vx/vy/pinned`，未命中才螺线播种；② `GraphBody` 只在**首次加载**与硬错误时替换内容，刷新中保留画布并在角落挂 `role='status'` 指示器；③ `useGraphCanvasLoop` 的数据依赖收敛，数据变更走显式 `applyData()` 通道；④ `fitGraph` 只在首次载入、节点集合实质变化、用户 Fit/Home 时执行；⑤ `createCanvasResizer` 的 `if (!state.offsetX && !state.offsetY)` 改按「是否已有过布局」判定，避免旧相机套新坐标
  - 先红后绿：新增 `canvas-refresh-continuity.test.ts` 3 条用例，改动前分别红在「继承坐标被重置为 (0,0)」「onSettled 只调用 1 次」「刷新期间 `panelCanvas()` 为 null」
  - 验证命令（已跑）：图谱聚合 **22 文件 / 148 条全绿**；`typecheck` 与 12 项静态门禁全绿。批次收尾的 `test:unit` 与三个浏览器门禁不属本项提交，已在「批次 1 收尾门禁」登记
  - 依赖：无（全表第一项）。G-07 步骤 2、G-14、G-47② 依赖本项
  - 代价：M（本项实际约 0.5 人日 + 用例）｜提交建议：`fix(graph)`
  - 提交哈希：`d4d2e12e`｜状态：✅ 已完成（2026-10-01）。注意：本项只交付 **G-07 步骤 1**（pin 随坐标继承、同会话存活），跨会话持久化（步骤 2）仍在批次 6，G-07 编号整体未完成

- [x] **1.2 G-22 + G-28｜节点菜单的键盘入口（WCAG 2.1.1 Level A）** ★P0
  - 台账：§3.4 G-22 / G-28
  - 文件：`canvas.tsx`、`use-graph-preview.ts`、`canvas-a11y.test.ts`、`graph-canvas-mount.test-helpers.ts`（pressKey 支持修饰键）、`features/command/shortcuts-panel.tsx` + `shortcuts-panel.test.ts`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点（落地口径）：① `handleCanvasKeyDown` 增 `ContextMenu` 键与 `Shift+F10` 分支，复用导出的 `computeNodeAnchor` 把选中节点换算成屏幕锚点后 `setContext`；② 无选中时不打开空菜单；③ `graph_canvas_accessible` 补「菜单键或 Shift+F10 打开节点操作」承诺；④ G-28 的 `?` 面板登记落在 `shortcuts-panel.tsx` 新增图谱画布一节（移动/缩放/适应/打开/节点操作五行）+ 5 个双语键，不新开提交；菜单锚点与固定回调抽成 `useGraphNodeActions`（否则 `useGraphCanvasController` 越过 50 行）
  - 先红后绿（已跑）：`canvas-a11y.test.ts` 4 条 + `shortcuts-panel.test.ts` 1 条，改动前分别红在菜单不存在 / aria-label 不含 `Shift+F10` / 图谱行不在面板里
  - 验证命令（已跑）：图谱 + command + overlay 聚合 **30 文件 / 183 条全绿**；提交钩子的增量 `vitest related` 在同一工作区跑出 **410 文件 / 3411 条全绿**；typecheck 与 13 项静态门禁全绿（i18n 3905 键）
  - 依赖：无。G-24 与 G-07 步骤 2 依赖本项；G-41 的第三条断言随本提交落地
  - 代价：S（本项实际约 0.3 人日 + 用例）｜提交建议：`fix(graph)`
  - 提交哈希：`b45dab64`｜状态：✅ 已完成（2026-10-01）

- [x] **1.3 G-02｜标签边预算：`applyTagNodes` 不再无上限 push** ★P0
  - 台账：§3.1 G-02
  - 文件：`src/shared/graph-tag-nodes.ts`、`src/worker/routes/search/graph.ts`；`tests/graph-routes.test.ts`（demo 后端与 Worker 共用该共享函数，改一处两端同步）
  - 要点（落地口径）：① `GRAPH_TAG_EDGE_LIMIT = 2000`，簇按大小降序展开、累加成员预算，装不下的簇**整个跳过**（同小的后续簇仍可装入），返回值 `dropped` 计入所有未展开簇；② `truncated` 与 `meta.totalEdges` 仍在标签边落定后判定（`buildGraphBody` 已是该顺序，本项未改 server 侧）；③ `tagNodes=1` 的边数断言落在两处：纯函数套件与 `graph-routes.test.ts` 的 61 笔记 × 61 标签场景
  - 先红后绿（已跑）：`src/shared/graph-tag-nodes.test.ts` 4 条，改动前分别红在常量不存在（TypeError）、预算被突破、单个超大簇仍被展开
  - 验证命令（已跑）：`src/shared/graph-tag-nodes.test.ts` + `tests/graph-routes.test.ts` + `src/client/demo/backend.test.ts` + 图谱套件 **21 文件 / 144 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1362 文件 / 12748 条）
  - 依赖：与 1.4 同批（相邻提交，1.4 改的是 `buildGraphBody` 的读数口径；本项只改共享函数与断言，未动 server 侧）；默认关闭 `showTagNodes` 只降低触发概率，踩到的是界面卡死
  - 代价：S（本项实际约 0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`24f2f22a`｜状态：✅ 已完成（2026-10-01）

- [x] **1.4 G-38｜截断徽标与顶部统计的口径统一（标签节点计「篇」的矛盾）**
  - 台账：§3.6 G-38
  - 文件：`graph-overlays.tsx`、`index.tsx`、`helpers.ts`、`src/worker/routes/search/graph.ts`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点（落地口径）：① 新增 `graphNodeCounts(nodes)` 纯函数，`GraphStats` 改用它，删掉三处各写一遍的 `filter`（徽标与顶部统计同源）；② 采纳「量词中立」而非改用 `notes`：`showing_limit` 英文补 `nodes`、中文把「篇」改为「个节点」（服务端 `totalNodes` 本就含标签与未创建节点，改用 `notes` 反而会与 `total` 对不上）；③ 服务端 `totalEdges`/`truncated` 已在 1.3 确认是标签边落定后判定，本项未动 server；④ unresolved 计「篇」与全应用一致，未改
  - 先红后绿（已跑）：`helpers.test.ts` 的 `graphNodeCounts` 用例（改动前函数不存在）与 `canvas-a11y.test.ts` 的文案断言（改动前英文不含 `nodes`）两条先红
  - 验证命令（已跑）：图谱聚合 **23 文件 / 157 条全绿**；typecheck 与 13 项静态门禁全绿
  - 依赖：1.3（相邻提交，同一段 `buildGraphBody` 读数）
  - 代价：XS（本项实际约 0.2 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`1358a374`｜状态：✅ 已完成（2026-10-01）

#### 批次 1 收尾门禁（已跑，2026-10-01）

> 四项全部落地后在同一棵树（1.4 提交 `1358a374`）上跑完。`test:unit` 与 `budget:check` 直接在开发机跑；三个浏览器门禁先以 `setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv > /tmp/inkstone-graph-dev.log 2>&1 < /dev/null &` 新起 :7712 实例（`curl http://localhost:7712/api/health` 返回 `{"ok":true}`），门禁期间未改任何文件（避免 Tailwind 重扫跳页）。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **620 文件全部通过 / 5452 通过 + 1 跳过（5453），225.72s** | ✅ 无回归 |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0；music 相关各 chunk ≤ 97.7 KiB，excalidraw 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs` | **177 passed / 0 failed** | ✅ |
| 视觉与交互 | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs` | **682 passed / 0 failed**（含 G-22/G-28 落地后的画布快捷键与菜单路径） | ✅ |
| 对比度与外壳 a11y | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/check-contrast.mjs` | 全部 ✓，结尾 `contrast gate passed`（两套主题均达 AA） | ✅ |

- 门禁结束后已停掉临时实例，:7712 释放；`:7770` 上另一 worktree 的 vite 与本轮无关，全程未触碰。
- `npm run build` **未单独运行**：`budget:check` 内含构建且退出码 0；如需单列，按此口径记为「由 `budget:check` 覆盖」而非「未运行」。
- 本轮无负载敏感 flake（首轮即全绿），故未触发 §3 的 flake 复核流程。

### 批次 2：请求与开销边界（4 项）

> 完成判据：大库请求读行数有明确上界且超时可回退；服务端读端点有节流；MCP 与 UI 的归档口径一致；拖拽路径不再逐 pointermove 强制布局。

- [x] **2.1 G-01｜边查询补回逐语句 `LIMIT`，读满即报截断**
  - 台账：§3.1 G-01
  - 文件：`src/worker/routes/search/graph.ts`；`tests/graph-routes.test.ts`；注释门禁 `scripts/check-comments.mjs`
  - 要点（落地口径）：① 每条边语句绑定 `LIMIT GRAPH_EDGE_CANDIDATE_LIMIT + 1`——**与计划的 ② 有出入**：没有采用「`chunk.length × 每篇上限 + 1`」，因为单篇出链没有真实上界（2 MiB 笔记里每个 `[[…]]` 都会入库），人为的每篇上限会在正常密度的笔记上提前丢边；用请求自己的候选预算当单条语句的天花板，与分块前的单语句 `LIMIT` 同形；② 多出来的那一行就是「语句读满 = 被截断」的判据，`loadGraphEdgesAndTags` 把它并入响应 `meta.truncated`（未读到的行可能含页内边，不能看起来完整）；③ `collectGraphLinkRows` 承担「按页内目标过滤 + 截断判定」，`loadGraphLinkRows` 只备语句与排序（否则其函数体 54 行越过 `size:check` 的 50 行）；④ 语句仍全部走一次 `db.batch`（保住 `029f252b` 的单次往返），所以**一次请求的读上界是「分块数 × (候选上限 + 1)」**：默认 `limit=350` 为 9 × 10001 = 90,009 行；⑤ 计划 ① 的「达到上限即停止追加后续语句」在单次 batch 里省不下 I/O（语句在执行前已全部备好），故以「每条语句有界 + 截断显式上报」落地；⑥ 阈值待批次 0 的 V-02 实测校准（本次未跑批 0，按合理常量落地）
  - 先红后绿（已跑）：`tests/graph-routes.test.ts` 新增用例（递归 CTE 一次插入 `上限 + 2` 行链接，目标是归档笔记，页内边为 0），改动前分别红在 `expected 10002 to be less than or equal to 10001`（单条语句把 10,002 行全搬过来）与 `expected false to be true`（读被截断却报 `truncated: false`）
  - 验证命令（已跑）：图谱聚合 **23 文件 / 158 条全绿**；`tests/graph-routes.test.ts` 单跑 20 条全绿；typecheck 与 13 项静态门禁全绿（comments 1362 文件 / 12758 条）
  - 依赖：批次 0 的 V-02（阈值校准）；与 2.2 同批（同属端点成本）
  - 代价：S（本项实际约 0.3 人日 + 用例）｜提交建议：`fix(graph)`
  - 提交哈希：`17dc66de`｜状态：✅ 已完成（2026-10-01）

- [x] **2.2 G-03｜图谱读请求：客户端加超时，服务端挂读预算**
  - 台账：§3.1 G-03
  - 文件：`src/worker/routes/search/read-budget.ts`（新增）、`src/worker/routes/search/graph.ts`、`src/client/lib/api/vault.ts`；`tests/graph-routes.test.ts`、`src/client/lib/api/vault.test.ts`（新增）、`src/client/features/graph/graph-panel/panel-throttle.test.ts`（新增）；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 预算挂在**新文件** `read-budget.ts` 而不是 `graph.ts` 里（后者已 483 行，逼近 `size:check` 的 500 行文件上限）；形状与窗口照 `share/read-budget.ts`：`graph-read:${userId}`、120 次 / 5 分钟、超预算锁 60 秒、`ApiError(429, 'too_many_attempts', …, { retryAfter })`；② 扣预算的位置在 `parseGraphParams` 之后、查询之前——坏参数回 400 不花预算，卡在重试循环里的读才是 429；③ `api.graph` 补 `timeoutMs: 15_000`，挂起的读走既有 `request_timeout` 三态（本地化文案 + Retry），不再是永不落定的 Promise；④ 既有「边语句一次 batch」用例改为断言批次形态 `[1, 4]`：读预算自身是一次单语句 batch，这就是「每个读请求多一次 D1 写」的可见代价，已登记；⑤ `G-10` 闸门若采纳物化方案，按计划只保留客户端超时
  - 先红后绿（已跑）：服务端两条改动前分别红在 `expected 200 to be 429` 与 `expected null to deeply equal { fails: 1 }`；客户端超时用例改动前红在 `fetch` 拿不到可中止的 `signal`（stub 的 fetch 只被 abort 结束，与真实 fetch 同形）。面板级 429 用例是**守卫**：改动前后都应为绿，未为它虚构先红
  - 验证命令（已跑）：图谱 + api 聚合 **25 文件 / 162 条全绿**；提交钩子的 `vitest related` 在同一工作区跑出 **310 文件 / 2420 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1365 文件 / 12768 条）
  - 边界（如实登记）：`details.retryAfter` 的秒数未接进错误文案——`translateApiError` 对已知码返回本地化通稿，逐码带参数的文案属全应用错误口径，另立事项；本项只保证「不静默 + 可重试」
  - 依赖：批次 0 的 V-02（预算必要性）；G-10 的闸门结论（若物化则本条只留客户端超时）
  - 代价：S（本项实际约 0.4 人日 + 三个测试文件）｜提交建议：`fix(graph)`
  - 提交哈希：`023e1e7d`｜状态：✅ 已完成（2026-10-01）

- [x] **2.3 G-04（①）｜MCP 图谱补上归档过滤，工具说明写清范围**
  - 台账：§3.1 G-04
  - 文件：`src/worker/mcp/library/graph.ts`、`src/worker/mcp/server/assets.ts`；`tests/mcp-graph.test.ts`（新增）；`scripts/check-comments.mjs`
  - 要点（落地口径）：① `loadMcpNotesByIds` 补 `AND is_archived = 0`，与 UI 侧 `filters` 同口径：归档笔记不进节点集，穿过它的边随 `nodes.has` 过滤消失（答案不再连同标题与摘要返回归档笔记）；② 工具 `description` 补「Archived and deleted notes stay out of the graph」；③ 归档笔记当 root 时两侧都答空图（UI 的 local CTE 同样把归档中心过滤掉），故**未改** `requireOwnedNote`（它还服务附件/分享/笔记工具，改它会夹带）；④ ②（抽 `shared/graph-scope.ts`）属另立事项，未做
  - 先红后绿（已跑）：`tests/mcp-graph.test.ts` 两条用例，改动前分别红在节点列表多出 `cccc…`（归档笔记）与 description 不含 archived/deleted 字样
  - 验证命令（已跑）：MCP + 图谱容器 **29 文件 / 193 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1366 文件 / 12769 条）
  - 依赖：无
  - 代价：① XS（本项实际约 0.3 人日，含新建 MCP 图谱测试文件）｜提交建议：`fix(mcp)`
  - 提交哈希：`6e3ed4c2`｜状态：✅ 已完成（2026-10-01）

- [x] **2.4 G-09｜`toWorld` 缓存画布 rect，去掉逐 pointermove 的强制同步布局**
  - 台账：§3.2 G-09
  - 文件：`types.ts`、`canvas-draw.ts`、`canvas-hooks.tsx`、`canvas.tsx`；10 个既有 `CanvasState` 字面量（测试夹具与存档状态）、`canvas-draw.test.ts`、`canvas-pointer-layout.test.ts`（新增）；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 画布盒的视口偏移缓存进 `CanvasState`（`viewLeft`/`viewTop`），由既有 `createCanvasResizer` 回调写入；② **resizer 构建时先量一次**——`ResizeObserver` 首回调是异步的，早到的指针否则会读到零偏移；③ `toWorld` 改读缓存并删掉 `canvasRef` 参数与非空断言（`!` 是防御性写法，「卸载瞬间抛 TypeError」无复现路径，未单独断言）；④ `canvas.tsx` 双指捏合的两处读取同属拖拽热路径，一并改读缓存（若只改 `toWorld` 会留下第二处逐事件量测）；⑤ 测试夹具的 10 处 `CanvasState` 字面量补两字段（TS 必填字段，漏改无法通过 typecheck）
  - 先红后绿（已跑）：`canvas-pointer-layout.test.ts` 改动前红在 `expected 9 to be 3`——3 = 1 次按下 + 2 次选中时预览锚点，6 次 `pointermove` 各量一次；`canvas-draw.test.ts` 的「tick 不测量」用例改为记录**新次数**（构建时 1 次 + 显式 `resize` 2 次，tick 之后不变）并断言 `viewLeft=32`/`viewTop=18`，改动前红（次数与缓存字段都不存在）
  - 验证命令（已跑）：图谱聚合 **25 文件 / 162 条全绿**；提交钩子的 `vitest related` 在同一工作区跑出 **18 文件 / 94 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1367 文件 / 12783 条）
  - 边界（如实登记）：① `wheel` 与本面板预览锚点仍在离散事件上读画布盒——不属 `pointermove` 热点，未动以免夹带；② 缓存随 `resize` 失效的前提是**本面板为 `app-viewport-fixed`、画布尺寸只随内部布局变化**，会移动画布的情形都伴随一次 `resize`，已写进注释
  - 依赖：1.1（同改 `CanvasState` 与 resizer，排在它之后少一次改写）
  - 代价：XS（本项实际约 0.3 人日 + 两个测试文件）｜提交建议：`perf(graph)`
  - 提交哈希：`e21bde8c`｜状态：✅ 已完成（2026-10-01）

#### 批次 2 收尾门禁（已跑，2026-10-01）

> 四项全部落地后在同一棵树（2.4 提交 `e21bde8c`）上跑完。起止同批次 1：`test:unit` 与 `budget:check` 直接在开发机跑；三个浏览器门禁先以 `setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv > /tmp/inkstone-graph-dev.log 2>&1 < /dev/null &` 新起 :7712 实例（`curl http://localhost:7712/api/health` 返回 `{"ok":true}`），门禁期间未改任何文件（避免 Tailwind 重扫跳页）；结束时停掉临时实例释放 :7712。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **624 文件全部通过 / 5460 通过 + 1 跳过（5461），170.32s** | ✅ 无回归 |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0；music 各 chunk ≤ 97.7 KiB，excalidraw 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs` | **177 passed / 0 failed** | ✅ |
| 视觉与交互 | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs` | **682 passed / 0 failed** | ✅ |
| 对比度与外壳 a11y | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/check-contrast.mjs` | 全部 ✓，结尾 `contrast gate passed`（两套主题均达 AA） | ✅ |

- 与批次 1 相比，`test:unit` 由 620 文件 / 5452 条增至 624 文件 / 5460 条：批次 2 新增了 `tests/graph-routes.test.ts` 的截断与读预算用例、`src/client/lib/api/vault.test.ts`、`src/client/features/graph/graph-panel/panel-throttle.test.ts`、`tests/mcp-graph.test.ts`、`src/client/features/graph/graph-panel/canvas-pointer-layout.test.ts` 这些文件与用例。
- 三个浏览器门禁的条数与批次 1 完全相同（177 / 682）——批次 2 未改对外交互行为，符合预期；`e2e-visual` 末行 `console: no page errors` 说明 2.2 的客户端超时没有在正常路径上误触发。
- `npm run build` 同样**未单独运行**：`budget:check` 内含构建且退出码 0，按批次 1 口径记为「由 `budget:check` 覆盖」。
- 本轮无负载敏感 flake（首轮即全绿），故未触发 §3 的 flake 复核流程。
- 运维备注（如实登记）：收尾时按 `pgrep -f "vite --mode kv"` 停进程，该模式同时命中了另一 worktree 在 `:7770` 上的 vite（同命令启动），已一并停掉；未触碰其工作区文件，重启由该 worktree 的负责人自行决定。

### 批次 3：视觉、主题与门禁（5 项 + G-43① 顺手）

> 完成判据：调色板收敛为单一来源且两套主题达标（A/B 见下）；主题翻转后预览卡与画布同步；`ADR-0002` / `AGENTS.md` 不再与代码相反、且 ADR 点名要的浏览器像素断言存在；`npm run contrast:check` 覆盖图谱表面。

- [x] **3.1 G-29｜消除第二套回退色板；浅色底不达标的 6/10 收敛（B 方案）**
  - 台账：§3.5 G-29
  - 文件：`src/client/styles/tokens.css`、`constants.ts`、`helpers.ts`、`canvas-draw.ts`、`graph-export.ts`、`types.ts`；`helpers.test.ts`、`canvas-theme.test.ts`、`canvas-legend.test.ts`；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 经用户决策走 **B 方案并一次做对**：删掉 `TAG_FALLBACK_PALETTE`，新增客户端私有令牌 `--graph-tag-1…10`（浅色取 600/700 阶、暗色取 400 阶，两套值全部 ≥3:1——实测最低 4.44:1 / 6.52:1，已含 `data-background='white'` 的 `#ffffff` 与 `#151617` 变体；这也正是 A 方案做不到的两条：`ORGANIZER_COLORS` 浅色 2/10、暗色 1/10 不达标）；② `tagHashColor` 改 `tagHashIndex`——槽位与主题无关，`nodeColor` 改对象传参接 `tagPalette`（`{ groupBy, fallback, tagPalette }`，守住 ≤3 参数规则）；③ 图例里未赋色的标签改指 `var(--graph-tag-N)`：DOM 侧由 CSS 变量解析，**主题翻转不必重算图例**；画布与导出走 `readThemeColors().tagPalette`（SVG/PNG 需要解析后的值）；④ 样式表尚未就位（jsdom、首帧）时退回共享 `ORGANIZER_COLORS`——不引入第三套板；⑤ **未改令牌漂移基线**：`--graph-tag-*` 只声明在应用侧、不属两棵树共享层，门禁输出仍是「89 tokens, values stable」，与「改共享令牌才需 `--update-baseline`」的口径一致
  - 先红后绿（已跑）：`helpers.test.ts` 五处改新口径（改动前红在 `TypeError: tagHashIndex is not a function` 与 `expected [ { label: 'idea', color: '#ec4899' } ] to deeply equal [ { … color: 'var(--graph-tag-4)' } ]`）；`canvas-theme.test.ts` 两条（`readThemeColors()` 少 `tagPalette` 键；无令牌时 `expected undefined to deeply equal [ '#dc2626', … ]`）；`canvas-legend.test.ts` 一条（`expected 'background-color: rgb(236, 72, 153);' to contain 'background-color: var(--graph-tag-4)'`）
  - 验证命令（已跑）：图谱聚合 **25 文件 / 165 条全绿**（较 2.4 的 162 条多出本项新增的 3 条）；typecheck 与 13 项静态门禁全绿（comments 1368 文件 / 12795 条）；提交钩子 `vitest related` **20 文件 / 118 条全绿**
  - 边界（如实登记）：① 用户**已赋色**的标签仍旧走共享 `ORGANIZER_COLORS`（标签管理器里选的颜色属用户数据），其中浅色 2/10、暗色 1/10 低于 3:1 的问题因此仍在——那是共享色板的语义问题（G-46 另立），本项只保证「没有颜色时」的槽位达标；② 同一标签在浅/暗两套主题下取值不同（这就是「跟随主题」），槽位不变；③ 浏览器侧守住属 3.5（G-41）的对比度场景，本项只落地令牌与接线
  - 依赖：3.5（门禁守住）；与 3.3 可并行
  - 代价：S（本项实际约 0.4 人日 + 三个测试文件）｜提交建议：`fix(graph)`
  - 提交哈希：`4c24d686`｜状态：✅ 已完成（2026-10-02）

- [x] **3.2 G-30｜默认 `groupBy: 'none'` 下信息密度偏低（采纳方案 ③）**
  - 台账：§3.5 G-30
  - 文件：`constants.ts`、`canvas-draw.ts`、`graph-export.ts`；`canvas-draw.test.ts`、`graph-export.test.ts`；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 三选一中采纳 **③「三类节点不依赖颜色也能区分」**：tag 节点在实心点上补一圈同色外环（`r + 2`、线宽 1.5 随缩放，与 unresolved 的空心圈、note 的实心点组成三态）；② 几何提为 `GRAPH_TAG_RING_GAP` / `GRAPH_TAG_RING_WIDTH`，画布与 SVG 导出共用（导出侧同步出环，pinned 描边环顺序不变）；③ **未采纳** ① 默认 `groupBy: 'folder'`（用户可感知变化，且需同步 README 设置表）与 ② 首次打开一次性提示（需新增文案与一次性状态，且不解决「颜色本就是分组语义」的重叠）；④ 未改任何默认值与设置项，故 README 无需同步
  - 先红后绿（已跑）：`canvas-draw.test.ts` 新增「三类节点形态」用例，改动前红在 `expected [ Array(3) ] to have a length of 4 but got 3`；`graph-export.test.ts` 新增导出环用例，改动前红在 `expected '<svg …>' to contain '<circle cx="0" cy="0" r="12" …'`
  - 验证命令（已跑）：图谱聚合 **25 文件 / 167 条全绿**（较 3.1 多 2 条）；typecheck 与静态门禁全绿（comments 1368 文件 / 12797 条）；提交钩子 `vitest related` **120 条全绿**
  - 边界（如实登记）：双环与 pinned 环（`r + 2.5`、强调色）在同一 tag 上会同时出现，两环半径相差 0.5、颜色不同（标签色 vs 强调色），未做合并；形态差异只在画布与导出可见，图例（DOM 圆点）不区分种类
  - 依赖：3.1（同改 `drawNodes` 与导出侧，紧接其后少一次改写）
  - 代价：XS（本项实际约 0.3 人日 + 两个测试文件）｜提交建议：`feat(graph)`
  - 提交哈希：`50ea81cc`｜状态：✅ 已完成（2026-10-02）

- [x] **3.3 G-31｜`isDark` 不再在渲染期直读 DOM，预览卡跟随主题**
  - 台账：§3.5 G-31
  - 文件：`canvas-hooks.tsx`、`canvas.tsx`、`graph-overlays.tsx`；`canvas-preview-theme.test.ts`（新增）、`preview-stub.test-helpers.ts`；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 在 `canvas-hooks.tsx` 新增 `useIsDarkTheme()`（useState + MutationObserver 订阅 `html[data-theme]`，与 `presentation-theme.ts` / `pinned-windows-layer.tsx` 同形）——翻转既触发 React 重渲、也覆盖「账号跟随系统时 OS 偏好变化」这条不写 store 的路径；② `GraphCanvas` 改调该 hook，删掉渲染期 `document.documentElement` 直读与 `typeof document !== 'undefined'` 守卫；③ `GraphOverlays` 的 `isDark` 由「可选 + 默认 true」改为**必填 prop**；④ 预览桩记录收到的 `dark`，用例读「已打开的卡片拿到了什么」而不是组件内部值；⑤ 浏览器侧复核（V-05）归 3.5
  - 先红后绿（已跑）：新增 `canvas-preview-theme.test.ts` 两条（亮→暗、暗→亮），改动前分别红在 `expected false to be true` 与 `expected true to be false`
  - 验证命令（已跑）：图谱聚合 **26 文件 / 169 条全绿**（较 3.2 多 1 文件 / 2 条）；typecheck 与 13 项静态门禁全绿（comments 1370 文件 / 12800 条）；提交钩子 `vitest related` 全绿
  - 边界（如实登记）：① 同类「读 DOM 主题」的副本在 editor / preview / presentation 仍各有一份，合并它们是跨模块重构（铁律 14），未在本项夹带；② 卡片内容的重渲只在 `dark` 值变化时发生，卡片若已关闭则无对象可重渲（用例在卡片打开时可翻转）
  - 依赖：无（可与 3.1/3.2 并行）
  - 代价：XS（本项实际约 0.3 人日 + 一个新测试文件）｜提交建议：`fix(graph)`
  - 提交哈希：`d4c40a6a`｜状态：✅ 已完成（2026-10-02）

- [x] **3.4 G-40｜ADR/AGENTS 与代码对齐（先独立 `docs` 提交）+ ADR 点名要的浏览器像素断言**
  - 台账：§3.7 G-40（G-43① 顺手）
  - 文件：`ADR-0002-renderer-theme-following.md`、`AGENTS.md`、`README.md`、`scripts/e2e-visual.mjs`、`scripts/check-comments.mjs`
  - 要点（落地口径）：① 文档提交：渲染物表该行改 ✅ 并写清机制（`createThemeObserver` 只换 `colorsRef.current` + `state.schedule?.()`，不重建布局，坐标与相机原地保留）、删除「已知缺口」段与复现证据表、**保留 :59「修复方向」**（它记录了「这条 effect 会重建布局」，是 G-06 的根因）；`AGENTS.md`「设计令牌位置」删掉「图谱面板 canvas 是当前已知缺口」；同批写 G-43① 的口径（图谱画 wiki 关系、`![[嵌入]]` 与普通链接同权、附件既不是节点也不是边）进 `README.md` 的 Graph tag filtering；② 断言提交：新增 `assertGraphThemeFollow(page)`——账号主题设「跟随系统」→ 系统偏好 `light` → 开图谱（`pressOpener` 设置 / Ctrl+Shift+G）→ 连续三帧像素和相同（物理收敛）后给 canvas 打 `data-gate-graph-canvas` → 翻 `dark` → 断言 **marker 还在**（同一张元素）**且像素和变了**（新调色板），退场清 marker、复位媒体特性、Escape 关图谱并交还浅色；③ 断言只读真实像素（`getContext('2d').getImageData`，按 400 字节步长采样），不复用内联色断言，故与 3.1/3.3 的 jsdom 用例互补
  - 先红后绿（已跑）：把 `canvas.tsx` 的 `createThemeObserver(colorsRef, () => state.schedule?.())` 临时换成冻结调色板的桩后跑整条门禁，**同一元素像素和 `72232 → 72232`、仅「新调色板」一条失败（684 passed / 1 failed）**；恢复后 **685 passed / 0 failed**（较批次 2 的 682 多 3 条，全部为新增 `graph:` 断言）
  - 验证命令（已跑）：断言提交跑全新实例的 `node scripts/e2e-visual.mjs`（全新实例由 `scripts/e2e.mjs` 先注册 Owner-1，与 CI 顺序一致）；文档提交跑统一命令的静态门禁；两提交的提交钩子（13 项静态门禁 + `typecheck`）全绿，comments 1370 文件 / 12804 条
  - 边界（如实登记）：① 该场景只证明「同一元素重画了新调色板」，不覆盖 G-31 的预览卡与 G-30 的节点形态（各归其项）；② 像素和为采样值，只用于「变了 / 没变」的判定，不当作颜色断言；③ 场景依赖图谱表面在门禁里已有内容（前序场景创建的笔记），空库下 `before.sum > 0` 会先失败并说明原因
  - 依赖：无（文档部分可与 3.1/3.3 并行）；断言依赖图谱表面的启动路径（`pressOpener` + `e2e-harness.mjs` 的登录与主题动作）
  - 代价：文档 XS + 断言 S（本项实际约 0.6 人日 + 两次整条浏览器门禁）｜提交建议：`docs(graph)` + `test(graph)`
  - 提交哈希：`01a9df9f`（文档）+ `4d00b9f3`（断言）｜状态：✅ 已完成（2026-10-02）

- [x] **3.5 G-41｜对比度门禁覆盖图谱表面；核对四条功能断言已随功能项落地**
  - 台账：§3.7 G-41
  - 文件：`scripts/check-contrast.mjs`、`scripts/check-comments.mjs`
  - 要点（落地口径）：① 新增图谱场景 `readGraphPalette(page, theme, colors)`，插在每套主题的 `SURFACES` 循环之后（图例/节点色不是文字与底色的一对，所以不是 `SURFACES` 条目）：用应用自己的快捷键开面板（`Control+Shift+G`，先 blur 编辑器——热键表让编辑器有焦点时把组合键留给页面）、读画布像素、Escape 关闭，两套主题各一遍；② 判定分两层：**声明层**把样式表里每一枚 `--graph-tag-*` 解析出来后对图谱自己的表面（面板根元素的背景，要求按值回认到 `--bg-base`）按 **3:1**（`AA_MARK`，WCAG 1.4.11 非文字）量——这正是 G-29 手工复算的那一步；**画布层**把画布上不透明的平色（≥24 px）按令牌值回认，能回认的同样按 3:1 量，回认不到（用户自己的标签色）只报告不判定，与看板读者的口径一致；一枚都回认不到、或表面不是 `--bg-base`，都直接失败；③ 逐条核对四条功能断言：**G-07 跨查询 pin** 已在 1.1（`canvas-refresh-continuity.test.ts:93`「carries the position, velocity and pin of every node the new response still holds」）、**G-02 标签边预算** 已在 1.3（`tests/graph-routes.test.ts:434-438` 断言 `edges.length <= GRAPH_TAG_EDGE_LIMIT`）、**G-22 键盘开菜单** 已在 1.2（`canvas-a11y.test.ts:165-176` 的 `ContextMenu` 与 `Shift+F10` 用例）、**G-15 筛选空态出口** 当时尚未落地（归 5.2，本项不代做），现已随 5.2 `2c578962` 落地（`panel-empty-filters.test.ts` 的 5 条用例，其中「releases every filter with one press」就是这条出口断言）；④ 3.1 的 B 方案令牌已全覆盖（十枚逐枚声明量测）
  - 先红后绿（已跑）：把浅色 `--graph-tag-1` 临时改成表面色 `#f7f5f1` 后，门禁红在 `✗ graph (light): 10 declared tag colours + 3 colours the canvas painted measured against --bg-base, 1 below 3:1` + `1.00:1 (needs 3) --graph-tag-1 on --bg-base — #f7f5f1 on #f7f5f1`，整条 `contrast gate failed: 1 tier/surface pairs below AA`；恢复后两套主题 `✓ graph (light): 10 declared tag colours + 3 colours the canvas painted … 0 below 3:1`、`✓ graph (dark): 10 declared tag colours + 2 colours …`，整条 `contrast gate passed`
  - 验证命令（已跑）：全新实例上 `node scripts/check-contrast.mjs`（两套主题全绿）与 `npm run surfaces:check`（8 个全屏表面仍有门禁）；图谱聚合 **26 文件 / 169 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1370 文件 / 12831 条）；提交钩子全绿
  - 边界（如实登记）：① 画布只读**不透明**平色（边 42%、标签 72%、非邻居节点 18% 都是混合色，回认它们就是猜），所以这一层守的是节点圆点；② 图例 DOM 圆点与画布同源（`tagLegendColor` 与 `nodeColor` 共用同一 `tagPalette`），其取值已由 `canvas-legend.test.ts` 在 jsdom 断言 `var(--graph-tag-N)`，本场景不按不稳定的 DOM 形状选元素；③ 图谱默认 `showTagNodes: false`，画布里是否出现标签色取决于库里有没有标签，所以「十枚令牌都在屏幕上被画过」不是本项的前提——它们是**声明层**逐枚量测的；④ 本场景不给图谱加 axe 读者（那不是本项范围，图谱的 a11y 归行为门禁的全屏扫描）
  - 依赖：3.1（色板改完才守得住）
  - 代价：M（本项实际约 1 人日 + 两次整条对比度门禁）｜提交建议：`test(graph)`
  - 提交哈希：`fbb3d235`｜状态：✅ 已完成（2026-10-02）

#### 批次 3 收尾门禁（已跑，2026-10-02）

> 五项全部落地后在同一棵树（3.5 提交 `fbb3d235`）上跑完。起止同批次 1/2：`test:unit` 与 `budget:check` 直接在开发机跑；三个浏览器门禁先以 `setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv > /tmp/inkstone-graph-dev.log 2>&1 < /dev/null &` 新起 :7712 实例（`curl http://localhost:7712/api/health` 返回 `{"ok":true}`），门禁期间未改任何文件（避免 Tailwind 重扫跳页）；结束时停掉临时实例释放 :7712。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **625 文件 / 5466 通过 + 1 跳过，1 条失败（`blog-comments-window.test.ts` 超时）；单跑该文件 4.55s 通过**——属 §3 已登记的负载敏感 flake，已复核 | ⚠️ 无回归（flake 已复核） |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0；`bundle budget check passed (eager + 9 lazy prefixes)`（含 `tsc -b && vite build`）；music 各 chunk ≤ 97.7 KiB，excalidraw 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs` | **177 passed / 0 failed** | ✅ |
| 视觉与交互 | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs` | **685 passed / 0 failed**（含 3.4 新增的 3 条 `graph:` 像素断言） | ✅ |
| 对比度与外壳 a11y | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/check-contrast.mjs` | 全部 ✓，结尾 `contrast gate passed`；图谱两套主题：`✓ graph (light): 10 declared tag colours + 3 colours the canvas painted … 0 below 3:1`、`✓ graph (dark): 10 declared tag colours + 1 colours … 0 below 3:1` | ✅ |

- 条数变化：`test:unit` 624 → 625 文件、5460 → 5466 条（3.1/3.2/3.3 新增的图形本测试）；`e2e-visual` 682 → **685**，多出的 3 条全部是 3.4 的 `graph:` 断言；`e2e` 仍 177（本批未动对外接口）。
- 本批唯一红点是 §3 已登记的负载敏感 flake（`blog-comments-window.test.ts` 的 5s 超时），按 §3 口径先看 `Test timed out` 再单跑核实：单跑 4.55s 通过。**没有写成「全绿」**，也没有顺手修它（铁律 14）。

#### 批次 4 收尾门禁（已跑，2026-10-02）

> 五项全部落地后在同一棵树（4.5 提交 `7fd27668`）上跑完。起止与批次 3 同：**本机 7712 被另一棵 worktree 的 vite 占用**（`ss -ltnp` 里 pid 2352378），故新起实例跑在 **:7713**（`setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npx vite --mode kv --port 7713 --strictPort </dev/null &`，`curl http://localhost:7713/` 返回 200），三个门禁期间未改任何文件，跑完按进程组停掉自己的实例，**未碰对方的 7712**。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **625 文件 / 5487 通过 + 1 跳过，1 条失败（`blog-comments-window.test.ts` `Test timed out in 5000ms`）；单跑该文件 1/0 通过**——属 §3 已登记的负载敏感 flake，已复核 | ⚠️ 无回归（flake 已复核） |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0（含 `tsc -b && vite build`）；music 各 chunk ≤ 97.7 KiB，`@excalidraw/excalidraw` 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs http://localhost:7713` | **177 passed / 0 failed** | ✅ |
| 视觉与交互 | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs http://localhost:7713` | **690 passed / 0 failed**（含 4.1 补的 5 条 `graph walk:` 断言，明细 `12 presses over the graph, 2 of them panned`） | ✅ |
| 对比度与外壳 a11y | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/check-contrast.mjs http://localhost:7713` | 全部 ✓，结尾 `contrast gate passed: …clears AA in both themes, at desktop and phone width`；含 4.3 改过外壳的设置抽屉（桌面 `region`、手机 `dialog`）的 axe 扫描 | ✅ |

- 条数变化：`test:unit` 625 文件不变、5466 → **5489** 条（4.2 + 2、4.3 + 6、4.4 + 1、4.5 + 3，另 4.2 把一条钉住旧缺陷的用例翻转为新断言）；`e2e-visual` 685 → **690**，多出的 5 条全部是 4.1 追加的 `graph walk:` 断言（4.2–4.5 未改测试脚本，这是如实登记的缺口）；`e2e` 仍 177（本批未动对外接口）。
- 本批唯一红点依旧是 §3 已登记的负载敏感 flake（`blog-comments-window.test.ts` 的 5s 超时），单跑 1/0 通过。**没有写成「全绿」**，也没有顺手修它（铁律 14）。
- **未覆盖的如实登记**：4.3 的窄屏/宽屏两种 role、4.4 的 24px 像素热区、4.5 的 `aria-describedby` 与取消播报都只有 jsdom 证据（分别靠 `stubWideViewport`、尺寸类断言与 `pressPointer`），**没有**真实浏览器像素级断言；`check-contrast` 里的 axe 扫描顺带覆盖了设置抽屉两种形态的结构合法性，但热区尺寸与播报文本仍未被浏览器门禁读到（补法见 §8 F-05）。
- `npm run build` 同样**未单独运行**：`budget:check` 内含构建且退出码 0，按批次 1/2 口径记为「由 `budget:check` 覆盖」。
- 运维备注（如实登记）：本轮停实例改用 `pkill -f '[v]ite'` 的方括号写法——无括号的 `pkill -f vite` 会命中它自己那条命令行（命令里含有 `vite`），把调用它的 shell 一起杀掉，表现为「静默无输出且后台任务从未启动」；本次已因此白跑一次 `test:unit` 的启动。另：3.4/3.5 的两次先红都用「临时改产品/令牌 + 跑整条浏览器门禁 + `git` 校对工作区」的方式取得，工作区在提交前已逐次确认干净（`git status` 只剩当次要提交的两个脚本）。

### 批次 4：无障碍关系与键盘语义（5 项，依赖批次 1 的 G-22）

> 完成判据：方向键按空间序移动且选中节点可见；标签节点对读屏可辨、Enter 有明确行为；设置抽屉的 ARIA 关系与焦点迁移完整；色板热区达标；画布说明与取消选择播报补全。

- [x] **4.1 G-23｜方向键按空间序取邻居，选中节点进入视口**
  - 台账：§3.4 G-23
  - 文件：`helpers.ts`、`canvas.tsx`、`constants.ts`；`helpers.test.ts`、`canvas-a11y.test.ts`、`canvas-selection-loop.test.ts`；`scripts/check-comments.mjs`（**与计划的文件清单有出入**：两个提纯函数放进 `helpers.ts`（客户端纯函数层，`graphScaleAfterWheel` 也在那）而不是 `canvas-hooks.tsx`，因为它们是可直接单测的纯函数、不需要 React；相机也没复用 `useGraphFit` 的整套拟合，而是只在需要时平移 offset，读者的缩放不被改）
  - 要点（落地口径）：① `pickNeighborInDirection(nodes, fromIndex, direction)`：只取箭头半平面内的候选（`ahead > 0`），得分 = 距离 ÷ 对齐度（`ahead / 距离`，下限 0.25），正前方胜于侧面近邻，同分按距离、再按响应序；没有任何候选时返回 `-1`；② `ensureNodeVisible(state, node)`：屏幕坐标 = `x * scale + offsetX`，越界时只把 offset 平移刚好的距离（边距 `GRAPH_CAMERA_PADDING + r * scale`），画布未量出尺寸时不动；③ 无选中时 `→`/`↓` 取第一个节点、`←`/`↑` 取最后一个（计划只点名了 →/←，↑/↓ 对称处理并登记）；④ 该方向无节点时**保持原选中**，不再环绕到与箭头无关的节点（这正是旧行为的一半问题）；⑤ `handleCanvasArrowKey` 单独成函数——不拆的话 `handleCanvasKeyDown` 会越过 `size:check` 的 50 行
  - 先红后绿（已跑）：两个测试文件先写后跑，红在 `TypeError: pickNeighborInDirection is not a function` / `ensureNodeVisible` 同类错误（6 条）与旧实现下的子集断言 10 条，其中包括把旧行为钉死的证据 `expected 'Gamma, 2 in · 0 out' to contain 'Alpha'`（首按 `→` 在旧代码里落到 `nodes[1]`、两次就走到 `nodes[2]`）与 `expected 0 to be less than 0`（相机从不跟随）
  - 验证命令（已跑）：图谱聚合 **26 文件 / 177 条全绿**（较 3.5 的 169 多 8 条：helpers 6 + a11y 3 − 旧环绕用例 1）；`npm run typecheck` 与 13 项静态门禁全绿（comments 1370 文件 / 12848 条）；提交钩子 `vitest related` 130 条全绿
  - 边界（如实登记）：① `canvas-selection-loop.test.ts` 的「一次选中一次重绘」必须同步改——首按现在落在第一个节点（Alpha）而不是第二个；② 相机只保证节点进入视口（带 `GRAPH_CAMERA_PADDING` 边距），不做动画也不改缩放；③ 方向键不再环绕：沿某个方向走到尽头后需要换方向或 Home 拟合
  - 依赖：1.2（同改 `handleCanvasKeyDown`）
  - 代价：S（本项实际约 0.6 人日）｜提交建议：`fix(graph)`
  - **追加门禁（真实浏览器，`a2e7acc2`，同属本项）**：jsdom 里那条相机用例是手写 `state.width/height` 得来的，布局从未被验证，所以 `scripts/e2e-visual.mjs` 补场景 `assertGraphKeyboardWalk`（插在 `assertGraphThemeFollow` 之后，与它同样走 `pressOpener` 的 `Control+Shift+G` 路径）；只改测试脚本，产品代码不动
  - 追加门禁·口径：① 先等物理 settle：`waitForStillGraphCanvas(page, 80)`（实测 53 个节点的图要 ~7s；默认的 24 × 250ms 不够），因为 settle 回调里的 `fitGraph` 会把之后按的缩放撤销，且未静止的节点会被当成「相机在动」；② 用画布自己的缩放键 `=` 按 20 次（0.2 → 4.0，每次 +0.2），已拟合的图每个节点都在屏内、那样的走位什么都证明不了；③ 12 次方向键走位 `→×5 → ←×3 → ↓ → ↑ → → ←`：先走出窗口再走回来（原地转圈的走法实测只平移 1 次，走出再回来的走法平移 2 次）；④ 每次按后读两样——**选中节点在哪**用预览锚点框（面板 `computeNodeAnchor` 用与平移同一套相机算出它，也是预览卡真实挂靠的位置），**相机动没动**用画布 alpha 掩码的列/行直方图互相关（选中只改颜色、不改哪些像素被画，只有平移能整体搬动这组指纹；未平移时读数为 `dx/dy=0`、分数 0.98–1.00）
  - 追加门禁·四条断言：settle 后再开始；走到的每个节点都在窗口内（锚点框完全落入画布框）；首个方向键必须播报出落点节点（读 live region）；至少一步平移（位移 ≥ 24px = `GRAPH_CAMERA_PADDING` 且两轴余弦相似度 ≥ 0.75）且其中有一步的节点「正好停在被带进来那条边内侧 24px」——后者由 `broughtNodeToEdge` 把平移方向（画布内容向相机反向移动）与夹取数学绑在一起：锚点框半宽就是节点半径，`GRAPH_CAMERA_PADDING + r·scale` 抵消后只剩 24
  - 追加门禁·先红后绿（已跑）：先临时删掉 `handleCanvasArrowKey` 的 `ensureNodeVisible(state, next)`（不新增注释），跑整条 `e2e-visual` → **687 passed / 3 failed**；失败正是「每个走到的节点都画在窗口内」（锚点框 `left=1407` 在 1280 宽窗口外）、「相机确实平移」（八步 `dx/dy` 全 0、分数 0.98–0.99）、「平移把节点带进来」（空集）——同一文件其余场景（含 3.4 的主题断言）全绿；恢复后同树 **690 passed / 0 failed**，明细行 `· graph walk: 12 presses over the graph, 2 of them panned — ArrowRight by (-124, 0)px at 0.953, ArrowRight by (-362, 0)px at 0.841`。**如实说明**：先红那次用的是初版 8 键走法（上表那套混合转向），绿跑前才改成 12 键的右向主导走法以提高平移发生率（见下方边界 ①）；被打破的行为、断言形状与运行命令两者一致
  - 追加门禁·验证命令（已跑）：本地实例因另一棵 worktree 的 vite 占用 7712 而跑在 `:7713`，命令 `node scripts/e2e.mjs http://localhost:7713` 先铺账号（53 个笔记）→ `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs http://localhost:7713` 得 690/0；`node scripts/check-comments.mjs` 12863 条 / 1370 文件；12 项静态门禁与提交钩子全绿
  - 追加门禁·边界（如实登记）：① 实例规模决定平移是否会发生：图越大走位越可能真的越过窗口；走位到尽头后方向上无候选时按键是空操作（选中不动、不平移），断言允许这种步；② 标签节点不走 `showPreview`（锚点会停在上一个节点），本门禁不覆盖这一支——`showTagNodes` 默认关，且 4.2 正好补这条语义；③ 平移读数是统计量（余弦相似度），阈值 0.75 来自实测 0.82–0.96；若日后画布改为填满背景而非 `clearRect`，这组指纹会失效（像素全部“不透明”）而平移断言也会随之失效；④ `waitForStillGraphCanvas` 的 `attempts`/`stable` 是兼容扩展（默认 24、原返回形状照旧），主题场景仍用默认耐心，故 §8 新登记的 settle 观察对它仍然成立
  - 提交哈希：`4c4286dd`（实现）+ `a2e7acc2`（追加真实浏览器门禁）｜状态：✅ 已完成（2026-10-02）

- [x] **4.2 G-24｜标签节点的 kind 播报与 Enter 行为（复用 `graph.tag_node`）**
  - 台账：§3.4 G-24
  - 文件：`canvas.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`；`canvas-a11y.test.ts`、`graph-canvas-mount.test-helpers.ts`
  - 要点：① 播报里带 kind（复用现成但 0 引用的 `graph.tag_node`）；② 标签节点的 `Enter` 改绑「按标签筛选」（与 1.2 的菜单入口同源）；③ **`graph.tag_node` 必须保留**，G-34 清理时注意
  - 落地口径（实际）：① 播报提为纯函数 `nodeAnnouncement(node)`，kind 排在标题**前**（两种语言里都读作一个名词短语，且 kind 是区分两类节点的那一个词），笔记/未创建节点不带前缀、逐字不变；② `Enter` 的三种 kind 抽成 `activateSelectedNode(node, h)`——因为在 `handleCanvasKeyDown` 里再接一条 `else if` 会把控制流嵌套推到 4 层（`size:check` 的 `maxNesting` 上限 3，基线从 `null` 变 `{"deepFns":1}`），早返回版同时满足「嵌套 ≤ 3」与「单函数 ≤ 50 行」；③ 标签节点走 `onFilterByTag(node.title)` + `onClose()`，与 `graphMenuItems` 的 `filter` 项**同一行为**（含关面板）；④ `onFilterByTag` 保持可选：读调用点才发现 `local-graph.tsx`（笔记内局部图谱）根本不传它，它没有标签筛选可收敛——此时播报新增文案 `graph.tag_filter_unavailable` 而不是静默吞键（登记为 F-02）；⑤ 对外承诺同步：`graph.graph_canvas_accessible`（画布 `aria-label`）与 `graph.canvas_keys_open`（快捷键参考卡）都补上「回车打开选中笔记（选中标签节点时按标签筛选）」，与 G-22 加菜单键时同一口径
  - 先红后绿（已跑）：① 改完测试先跑 `canvas-a11y.test.ts` → **2 failed / 17 passed**，红在 `expected 'work, 1 in · 0 out' to be 'work Tag node, 1 in · 0 out'`（kind 缺失）与 `expected "vi.fn()" to be called with arguments: [ 'work' ] / Number of calls: 0`（Enter 无效）——后者是把**已有**用例里钉死旧缺陷的断言（`expect(graph.filterByTag).not.toHaveBeenCalled()`）翻转为期望筛选，不是新写的用例；② 第三条用例（「无筛选可收敛时不静默」）先于实现单独验证：临时把 `if (!h.onFilterByTag) { h.announce(...); return }` 改成 `if (!h.onFilterByTag) return` 跑同文件 → **1 failed / 19 passed**（红在 live region 为空），恢复后同树 20/0；③ 绿跑：图谱聚合 **21 文件 / 133 条全绿**（较 4.1 的 131 多 2：kind 播报与无筛选播报，另删一条改写一条）
  - 验证命令（已跑）：`npm run typecheck` 干净；13 项静态门禁全绿（`style:check`、`comments:check` 12874 条 / 1370 文件、`empty-catch:check`、`escape:check`、`hardcoded:check`、`tokens:check`、`i18n:check` 3906 键、`labels:check` 150 条、`size:check` 1913 文件 / 47 grandfathered、`module-state:check`、`deep-imports:check`、`surfaces:check`）；计划 §3 聚合命令（含 `graph-settings` / `graph-filter-expression` / `graph-routes` / `demo/backend`）另加 `src/client/features/command`（因为改了 `canvas_keys_open` 文案）→ **28 文件 / 187 条全绿**；提交钩子 `vitest related` **414 文件 / 3423 条全绿**
  - 边界（如实登记）：① kind 只加在标签节点上，「未创建」节点仍与笔记节点同形——补第三个 kind 名词需新开条目，且 `graph.unresolved_short` 是形如 `' unresolved'` 的残片不能直接当标签（登记为 F-03，本次明确**不做**）；② `Enter` 筛选后**关面板**，理由与菜单项一致（面板关闭本身是结果的可感知反馈）；面板不关则读者按键后毫无反馈——两种行为都有代价，取与 G-22 菜单项相同的一种；③ `onFilterByTag` 缺席时不筛选也不关面板，只播报（局部图谱）；④ 标签节点仍不画预览卡（`showPreview` 早退），故 4.1 登记的锚点读数门禁不覆盖标签节点（F-04，本次不做）；⑤ `graph.tag_node` 现已有 2 处引用，G-34 清理时确认保留
  - 依赖：1.2
  - 代价：XS（本项实际约 0.5 人日，超出 0.3 的部分是读调用点发现的 F-02）｜提交建议：`fix(graph)`
  - 提交哈希：`752cfeb8`｜状态：✅ 已完成（2026-10-02）

- [x] **4.3 G-25｜设置抽屉的四项无障碍关系补齐**
  - 台账：§3.4 G-25
  - 文件：`settings.tsx`、`index.tsx`、`types.ts`、`src/client/components/form.tsx`；`panel-disclosure-state.test.ts`、`graph-panel-mount.test-helpers.ts`、`settings-color-rules.test.ts`
  - 要点：① `aside` 加 `id` + `role='region'`，移动端条件改 `role='dialog' aria-modal='true'`；② 触发器加 `aria-controls`，桌面端撤下错误的 `aria-haspopup='dialog'`；③ `Switch` 接 `aria-describedby` 指向 `hintId`；④ 开合各补一次焦点迁移；⑤ 移动端遮罩不再用裸 `<div onClick>`（走既有 Overlay 语义，铁律 10）
  - 落地口径（实际）：① 外壳按 `useBreakpoint()` 分两种**元素**而不是两种 role——`role='dialog'` 不是 `aside` 的合法 role（`components/overlay/drawer.tsx` 的注释已记下这条，axe 读过），所以盖住画布时是 `div role='dialog' aria-modal='true'`，在画布旁边时是 `aside role='region'`；`tabIndex={-1}` + 挂载即 `focus()`，焦点落在抽屉上（与 `Modal` 无 autofocus 目标时的做法一致）；② `aria-controls` 指向的 `id` 由 `GraphPanel` 的 `useId()` 生成、经 `settingsId` 同时下发给头部按键与抽屉，两处指同一个元素（**不用**在抽屉里自己生成 id 再上报）；③ 焦点往返用 `useSettingsDisclosureFocus(isSettingsOpen)`（一个 `wasOpen` ref 把「关闭」与「从未打开」分开，否则面板挂载时会把焦点从对话框抢到设置键上），三条关闭路径（触发键、ESC、抽屉内关闭键、遮罩点击）都走它；④ 窄屏保留 `aria-haspopup='dialog'`、宽屏置 `undefined`，两边都说真话；⑤ `Switch` 在 `components/form.tsx` 透传可选 `aria-describedby`（该文件其他控件已有同名透传约定）；⑥ 为过 `size:check`（`maxFnLines` 50 / `maxFileLines` 500）做**两处按职责拆分**：`GraphSettingsPanel` 51 → 抽出 `GraphFilterSection`（筛选段自成一个函数）、`GraphPanel` 51 → 抽出 `useFolderFilterRepair`（失效文件夹筛选的清理本就不属于面板组合）。`form.tsx` 刚好卡在 500 行，所以 `Switch` 只加 2 行（不写注释，理由写在 `GraphToggle` 调用处）
  - 先红后绿（已跑）：先写五条用例再改实现 → **5 failed / 2 passed**，红在 `expected '' to be truthy`（抽屉无 id）、`expected null to be 'dialog'`、`expected 'dialog' to be null`（宽屏仍宣称弹窗）、`expected <button> to be <aside>`（焦点没进抽屉）、`expected null to be truthy`（开关无描述）；两条原有 disclosure 用例全程绿（helper 改三种外壳后仍匹配）
  - 验证命令（已跑）：`npm run typecheck` 干净；13 项静态门禁全绿（`comments:check` 12891 条 / 1371 文件、`size:check` 1913 文件 / 47 grandfathered、`i18n:check` 3906 键、`labels:check` 150 条、`surfaces:check` 8 个全屏表面）；图谱聚合 **21 文件 / 139 条全绿**（较 4.2 的 133 多 6：G-25 五条 + ESC 关闭后焦点归还一条）；提交钩子 `vitest related` **268 文件 / 2127 条全绿**（含 `form.tsx` 的 `Switch` 全部调用方）
  - 边界（如实登记）：① **遮罩仍是 `<div onClick aria-hidden>`**（计划要点 ⑤ 未按字面改造）：读 `Modal`/`Drawer` 后确认本仓 Overlay 层的遮罩就是同一写法（`modal.tsx:46`、`drawer.tsx`），所谓「既有 Overlay 语义」就是这个形状，遮罩也不是可交互控件（ESC + 关闭按钮已在）；真正缺的是焦点往返，已由 ③ 补上。改遮罩写法会与 Overlay 层分叉，故不单独改；② 焦点落点选的是抽屉容器本身而不是第一个控件（与 `Modal` 一致），所以不会替读者做「先选第一个开关」的决定；③ jsdom 的 `matchMedia` 全部不匹配 ⇒ `useBreakpoint()` 读出 `'mobile'`，所以默认用例跑的是**窄屏 dialog 分支**，宽屏 region 分支由 `stubWideViewport()` 单独打开；④ 移动端分屏切换（`md:` 断点 768px 与 `useBreakpoint` 的 medium 阈值一致）不改变结构，只换 role；⑤ 窄屏时抽屉是 `aria-modal` 的 dialog 但**没有自己的焦点陷阱**（面板的 `useDialogFocus` 仍管着整个面板）——未加嵌套陷阱，两个陷阱会互相抢 Tab
  - 依赖：无
  - 代价：S（本项实际约 0.9 人日，超出 0.5 的是两处按职责拆分与读 Overlay 层定遮罩口径）｜提交建议：`fix(graph)`
  - 提交哈希：`7cabe676`｜状态：✅ 已完成（2026-10-02）

- [x] **4.4 G-26｜颜色规则色板热区从 20px 提到全仓既有尺寸**
  - 台账：§3.4 G-26
  - 文件：`settings-color-rules.tsx`
  - 要点：升到 `size-6`（24px），或保持视觉尺寸而用 padding 扩大命中面积；色名与单选语义属跨模块 G-46，**不在本提交里做**
  - 落地口径（实际）：取全仓同类控件的写法（`tag-manager-row.tsx:184`、`folder-color-submenu.tsx`）：色板按钮 `size-5` → `size-6`；同时把行内 `gap-1` → `gap-1.5`——选中态的 `ring-2 + ring-offset-1` 会向外伸 3px，4px 间隙下相邻色板会被环压到，而 `tag-manager-row` 正是用 6px 间隙给环留位的
  - 先红后绿（已跑）：先补一条用例钉住 24px 目标 → 红在 `expected 'flex size-5 items-center justify-cent…' to contain 'size-6'`；改完同文件 7/0
  - 验证命令（已跑）：图谱聚合 **21 文件 / 140 条全绿**；13 项静态门禁全绿（`comments:check` 12894 条 / 1372 文件、`size:check`、`hardcoded:check` 等）；提交钩子全绿
  - 边界（如实登记）：① 断言只能钉**类名**（jsdom 不排版、不加载 Tailwind），像素级证据不在本项；② 抽屉净宽约 252px，10 枚 24px 色板 + 间隙需要 ≈276–294px，**必然从一行换成两行**（容器已有 `flex-wrap`）；这是算出来的，未在浏览器里量过（登记为待目视项）
  - 依赖：无
  - 代价：XS（0.1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`a67c28a5`｜状态：✅ 已完成（2026-10-02）

- [x] **4.5 G-27｜画布说明与控件关联、取消选择时播报**
  - 台账：§3.4 G-27
  - 文件：`canvas.tsx`、`graph-overlays.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`；`canvas-a11y.test.ts`、`graph-canvas-mount.test-helpers.ts`、`canvas-pointer-layout.test.ts`
  - 要点：① 给画布加 `aria-describedby`（hint 保持视觉层 + 另建 `sr-only`，或用同一节点 id）；② 取消选择时把 live region 设为新增文案 `graph.selection_cleared`（双语言，不拼接句子）
  - 落地口径（实际）：① `hintId` 由 `GraphCanvas` 的 `useId()` 生成，同时下发给画布与 `GraphOverlays`，两边指同一个节点；说明层从 `hidden md:block` 改为**不隐藏的容器 + `sr-only md:not-sr-only` 的文字**——原先整层 `hidden`，窄屏下 `aria-describedby` 会指向一个不在无障碍树里的元素（等于没描述）；② 取消播报加在现有选中 effect 的 `else` 分支，用 `wasSelectedRef` 区分「刚取消」与「从未选中」：没有这个守卫，面板首次挂载就会朝 live region 说一句「未选中任何节点」
  - 先红后绿（已跑）：先写三条用例 → **2 failed / 21 passed**，红在 `expected null to be truthy`（画布无 `aria-describedby`）与 `expected 'Beta, 0 in · 1 out' to be 'graph.selection_cleared'`；第三条（「从未选中不播报」）红前即绿，它是那条守卫的钉子
  - 验证命令（已跑）：图谱聚合 **21 文件 / 143 条全绿**（较 4.4 的 140 多 3）；13 项静态门禁全绿（`comments:check` 12904 条 / 1373 文件、`i18n:check` 3907 键、`labels:check` 150 条、`size:check`、`surfaces:check`）；提交钩子全绿
  - 边界（如实登记）：① `pressPointer` 从 `canvas-pointer-layout.test.ts` 提到共享 test helper（两处 4 行完全相同，AGENTS.md 允许直接提取）；该文件自己保留一个 `pointerMove`（共享 helper 只做 down/up）② `graph.selection_cleared` 文案选的是**陈述状态**（「未选中任何节点」）而不是陈述动作，与它要描述的对象（当前选中）一致；③ 悬停变化不播报（只动悬停不动选中），那是既有口径，本次未改
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`7fd27668`｜状态：✅ 已完成（2026-10-02）

### 批次 5：交互与检索语义（7 项）

> 完成判据：搜索输入不再白屏/重排，未命中只变暗且可跳到首个命中；筛选致空有出口；拖拽期间预览卡消失、松手后重锚；窄屏图例与徽标不重叠；触屏能看到「长按」等价提示；伴随图谱与全屏图谱偏好一致；上限与局部深度可调。

- [x] **5.1a G-14 ①②③｜搜索从「重新查询」升级为「定位」（客户端变暗 + 仅显示匹配 + 跳到首个命中）**
  - 台账：§3.3 G-14
  - 文件：`index.tsx`、`canvas-draw.ts`（dim 集合入参）、`helpers.ts`、`canvas-hooks.tsx`、`types.ts`、`constants.ts`、`graph-export.ts`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：① 引入「变暗模式」：命中集合在客户端算（复用已有 `graphFilterMatches`），未命中节点/边降透明度，**不发起请求**（因此绕开 G-06）；② 保留服务端过滤作为「仅显示匹配」开关（默认关）；③ 命中数 > 0 时提供「跳到第一个命中」
  - 落地口径（实际）：① 命中集在 `helpers.ts` 的 `graphSearchHits()` 里算，返回 `null` 表示「没有可用的搜索表达」（空串/纯空白/纯停用词），此时绘制路径与改动前逐字节一致；`tag:`/`path:`/`-term` 走 `src/shared/graph-filter-expression.ts`，与 worker 的 `title LIKE` + `tag:` 语义是同一份语法；② 「仅显示匹配」把 `query` 交给 `useGraphQueryRequest`（`effectiveQuery = isOnlyMatching ? query : ''`），该式在 memo **之外**算——请求身份不随变暗变化，所以不发第二次请求；③ 跳跃经新增的公开入口 `GraphControls.selectNode`（`useGraphNodeFocus`：选中 + `ensureNodeVisible` + 重画），不暴露 `CanvasState`
  - 优先级（本项的行为定义）：悬停焦点、悬停邻居、正在读的笔记**永远盖过变暗**；变暗只落在三者都没认领的节点上。边只在两端都未命中时降到 `GRAPH_SEARCH_DIM_EDGE_ALPHA`
  - 先红后绿（已跑）：新用例先跑 → **canvas-search-dim 7 failed / 1 passed**、**panel-search-focus 12 failed**，红在 alpha 序列 `[1, 1, 1]`（无变暗）、`expected 2 to be 1`（第二次 `api.graph`）与 `document.body` 上找不到 `data-graph-search-status`；转绿后 canvas-search-dim 8、helpers 27、panel-search-focus 7、graph-export 22 全绿
  - 验证命令（已跑）：图谱聚合 `npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts src/shared/graph-filter-expression.test.ts src/shared/graph-tag-nodes.test.ts tests/graph-routes.test.ts` → `eea50690` 后 **27 文件 / 202 条全绿**（提交后同一棵树复跑，非改前旧数），`a40b2886` 后 **27 文件 / 204 条全绿**；单跑 `src/client/features/graph` 为 23 文件 / 164 条；12 项静态门禁全绿（`comments:check` 12929→12934 条 / 1375 文件、`i18n:check` 3911 键、`labels:check` 150 条、`size:check` 1915 文件 / 47 豁免、`surfaces:check` 8 表面）；`npm run test:unit` **627 文件 / 5509 + 5511 passed + 1 跳过**（170.48s 与 173.87s 两轮，均无 flake）；提交钩子 `vitest related` 420 文件 / 3520 条全绿（`eea50690`）、7 文件 / 30 条全绿（`a40b2886`）
  - 变异（9 项全部被具名用例杀死）：去掉 `isSearchMissed` 的边分支、把 alpha 写成 1、`graphSearchHits` 空串返回空集（而非 null）、`effectiveQuery` 移进 memo（typing 触发重查 → 杀 5 条）、跳跃不 `ensureNodeVisible`、开关持久化进 prefs、导出沿用 `state.searchHits`、tag 节点不按自己标题匹配、悬停邻居被变暗
  - 边界（如实登记）：① 导出**刻意不变暗**（`graph-export.ts` 置 `searchHits: null`——文件画的是整张图，不是读者当时的搜索），该行为有断言（`graph-export.test.ts` 的 ctx 桩现在记录 `globalAlpha`）；② 13 处 `CanvasState` 测试夹具补 `searchHits: null`，因为该字段是必需的（不选可选是为了让「忘记接线」在类型检查就失败）；③ `size:check` 一度把 `useGraphCanvasController` 顶过 50 行，故两个新 hook 落在 `canvas-hooks.tsx`；④ 面板搜索框仍有 220ms 防抖（属 G-06 已收尾的既有行为，本项未改）
  - 补口（②「默认关」的同一项第二提交，已跑）：「默认关」是**每一次搜索**的默认，不是本次访问的默认——清空搜索框后 `isOnlyMatching` 仍留着，读者重新输入一个词，图谱会在没有再按任何键的情况下直接返回**已过滤**的结果。先写用例 → **1 failed / 7 passed**，红在请求序列 `[undefined, 'Beta', undefined, 'Gamma']` 对 `[undefined, 'Beta', undefined]`（多发了一次带 `q` 的过滤请求，且按钮 `aria-pressed` 仍是 `'true'`）；转绿后该文件 9 条全绿。实现是把这些状态收进 `useGraphSearchMode()`（框文本、防抖后的 `query`、开关与两个处理函数同生同灭），清空**或只剩空白**的行都结束这次选择；两条变异各由一条具名用例杀死（删掉 reset 那一行 → 「forgets the choice once the box is empty」；`value.trim()` 改 `value.length` → 「ends the choice when the line is left with nothing a search could match」）。附带：`size:check` 因 `GraphPanel` 与最后一个 `describe` 回调双双越过 50 行而失败，故抽出该 hook 并把 describe 拆成两个
  - 依赖：1.1（坐标继承与不重建是它的前提）
  - 代价：M（2–3 人日）｜提交建议：`feat(graph)`
  - 提交哈希：`eea50690`（①②③ 主体）+ `a40b2886`（②「默认关」补口）｜状态：✅ 已完成（2026-10-02，G-14 整体仍差 ④，见 5.1b）

- [x] **5.1b G-14 ④｜图例改为可聚焦按钮，单击循环「高亮 → 过滤 → 清除」**
  - 台账：§3.3 G-14（④，随本提交 G-14 编号整体关闭）
  - 文件：`graph-overlays.tsx`、`helpers.ts`（`buildColorLegends` 需带 `query`）、`index.tsx`
  - 要点：④ 图例条目改为可聚焦的语义 `button`，点击高亮该色组、再击过滤、三击清除；补键盘路径（Tab 可达、Enter/Space 触发、`aria-pressed`）
  - 落地口径（原要点「点击高亮 / 双击过滤」已改）：**双击没有键盘与触屏等价物**（AGENTS.md 规则 13 的可访问性红线），改为单击三态循环；需要一条可见的状态提示，否则读者不知道自己在第几态
  - 落地口径（实际）：不新增第三种收窄机制——**每一行本来就是一条过滤线**。`ColorLegendItem` 加 `query`（helpers.ts:238 的 `extractNodeLegend` 与 :258 的类型）：色组规则行回传规则自己的 `GraphColorGroup.query`（它的 label 就是这条线），标签行给 `tag:<name>`，目录行给 `path:<name>`；按下经 `cycleLegend()`（index.tsx:380）写进同一根搜索行，于是复用 5.1a 的两条通路——第一次 `changeSearch(query)` → 客户端变暗（0 次请求），第二次 → `isOnlyMatching` → 服务端过滤，第三次 → `changeSearch('')` 复位。行的可见按下态是 `aria-pressed:bg-[var(--accent-soft)]` + `aria-pressed:text-[var(--accent)]`
  - 先红后绿（已跑）：新用例文件在 `1d99eccc`（5.1b 之前）的 `git archive` 快照上跑 → **5 failed / 0 passed**，五条都红在 `Error: the graph panel draws no legend row for tag:work`（改动前的图例是不带 `data-legend-query` 的静态 `div`）；转绿后 `panel-legend-cycle` 5 条、`helpers.test.ts` 29 条（含本项新增的 2 条）全绿
  - 验证命令（已跑）：统一命令聚合 `npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts src/shared/graph-filter-expression.test.ts tests/graph-routes.test.ts src/client/demo/backend.test.ts` → **28 文件 / 216 条全绿**；同一条命令在同一快照上的改前基线 **27 文件 / 209 条**（差 1 文件 / 7 条即本项新增）；单跑 `src/client/features/graph` 24 文件 / 173 条；12 项静态门禁全绿（`comments:check` 12934→**12947** 条 / 1376 文件、`i18n:check` **3912** 键、`labels:check` 150 条、`size:check` 1916 文件 / 47 豁免、`surfaces:check` 8 表面、`typecheck` 干净）；提交钩子按 CI 顺序把全量 `test:unit` 跑了一遍 → **421 文件 / 3529 条全绿**（142.02s，本轮无 flake）
  - 变异（7 项全部被具名用例杀死；恢复用 /tmp 保存原文，3 个文件 sha256 逐字节一致）：`cycleLegend` 永远只写框 → 杀「二次请求」「三次复位」；三击只关开关 → 杀「三次复位」；`aria-pressed` 恒 false → 杀「首击变暗」「换色组」；`onSelect` 传 `undefined`（图例退回静态行）→ 杀全部 5 条；tag 节点行丢 `tag:` 前缀 → 杀图例形状断言；目录行丢 `path:` 前缀 → 杀形状断言 + 「行过滤线仍能选中该行节点」不变量；规则行回传空串 → 杀 7 条
  - 边界（如实登记）：① 第几态的**可见**提示取 `--accent` 文字于 `--accent-soft` 软底，这一色对由 `scripts/check-contrast.mjs:926` 的「每个强调色作为文字落在自身软底」规则按 7 个强调色 × 两套主题校验（在批次收尾的浏览器门禁里跑，本项未单独跑）；② 容器仍 `pointer-events-none`、只有按钮 `pointer-events-auto`，图例空白处的画布手势照常穿过——jsdom 不做命中测试，**该条无单元测试**，留给批次 5 收尾在 375px 下人工确认（与 G-18 同一轮）；③ `legendQuery` 传的是**未防抖**的框文本，读者自己敲出同一行过滤线时该行也会立刻显示为按下态，这条时序未断言；④ 笔记内伴随图谱不传 `onLegendSelect`（`local-graph.tsx:135`），故它继续画静态图例行——那根线没有可写的搜索行，与 F-02 的 `onFilterByTag` 同理；⑤ `size:check` 一度因新文件的 `describe` 回调 63 行而报 `baseline null -> {"longFns":1}`，做法是拆成两个 describe，不动基线
  - 依赖：5.1a（过滤态复用 `graphSearchHits` 与 `searchHits` 通路）
  - 代价：S（1 人日）｜提交建议：`feat(graph)`
  - 提交哈希：`17872ccd`｜状态：✅ 已完成（2026-10-02，G-14 ①②③④ 整体关闭）

- [x] **5.2 G-15｜筛选致空时的文案分流与「清除全部筛选」出口**
  - 台账：§3.3 G-15
  - 文件：`index.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：① 按 `query || prefs.tag || prefs.folderId || selectedTags.length` 分流到「没有匹配的笔记」+ 一个清空全部筛选的 `Button`；② 新增 2 个 locale key × 2 语言（不拼接句子）；③ 空库场景仍保留原「还没有可以画的东西」文案
  - 落地口径（实际）：分流在 `GraphBody`（index.tsx:305-326）——它已经握着 `data.nodes.length === 0` 这一条分支，只需再读一个 `isNarrowed`；`isNarrowed` 在 `GraphPanel` 里按要点 ① 的四路算（index.tsx:460，取**防抖后的** `query`，与画出这张空图的那次请求同源）。出口是模块级 `clearAllGraphFilters(changeSearch, changePref)`（index.tsx:419）：清空搜索行（连带 5.1a 的「空行即结束选择」把 `isOnlyMatching` 一起关掉）、`tag`、`folderId`，再 `clearTagSelection()` 放行多选标签。文案是新键 `graph.nothing_matches_the_filters`（标题）+ `graph.clear_all_filters`（按钮），不复用 `graph.no_matching_notes`（那句说的是「这个搜索」，而致空的可能是标签或目录）
  - 先红后绿（已跑）：键先加（纯数据，不改行为），用例后写、实现前跑 → **3 failed / 1 passed**：两条「names the filters …」红在 `expected 'Graph0 notes · 0 linksGlobalLocalNoth…' to contain 'No note matches these filters'`（仍是空库文案），「releases every filter with one press」红在 `Error: the empty graph offers no way out`；「keeps the empty-library copy」当时即通过，它是钉住不变的第三条。第 5 条「counts a line the reader typed as a narrowing, filtered or not」是转绿后补的（钉住「两种搜索模式都不改变致空判定」），它的红由变异 M3 代打（杀 2 条）。转绿后本文件 5 条全绿
  - 验证命令（已跑）：统一命令聚合 → **29 文件 / 220 条全绿**（上一提交同一命令为 28 / 216，差 1 文件 / 4 条即本项新增）；单跑 `src/client/features/graph` 25 文件 / 177 条；12 项静态门禁全绿（`comments:check` 12947→**12954** 条 / 1377 文件、`i18n:check` **3914** 键、`labels:check` 150 条、`size:check` 1917 文件 / 47 豁免、`surfaces:check` 8 表面、`typecheck` 干净）；提交钩子对暂存文件跑 `vitest related` → **418 文件 / 3460 条全绿**（144.90s，本轮无 flake）
  - 变异（8 项全部被具名用例杀死；恢复用 /tmp 保存原文，index.tsx sha256 逐字节一致）：`isNarrowed` 恒 false → 杀 4 条；恒 true → 杀「空库原文案」；`isNarrowed` 漏掉 `query` → 杀「服务端过滤致空」「typed 行不论模式」；不给 `action` → 杀「标签致空」与「一键放行」；清除时漏掉搜索行 / 漏掉 `tag` / 漏掉 `folderId` / 漏掉 `clearTagSelection()` → 各杀「releases every filter with one press」
  - 边界（如实登记）：① 分流只看「有没有筛选用在图上」，不看是谁答的：只变暗（未开「仅显示匹配」）时服务端仍会返回整张图，所以「输入一行 + 空库」读到的是「没有笔记匹配这些筛选」而不是空库文案——第 5 条用例把这条判定钉住；② 清除出口只放行**四处筛选**，不动视图偏好（`groupBy`、`showTagNodes`、力导向参数等），与设置抽屉里的「恢复默认」是两件事；③ 空态文案切换没有 live region——它是读者自己按键触发的结果，且面板的重查状态由既有的 `GraphRefreshBadge`（`role='status'`）说话；④ `useFolderFilterRepair` 只在 `folders` 非空时才丢失效的 `folderId`，因此用例里的假 id 用 26 位 cuid 形状（`a`.repeat(26)）而不是 `'f1'`，后者会被 `loadPreferences` 的正则直接吃掉
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`2c578962`｜状态：✅ 已完成（2026-10-02）

- [x] **5.3 G-16｜拖拽节点时关掉预览卡，松手后重新锚定**
  - 台账：§3.3 G-16
  - 文件：`canvas-hooks.tsx`、`canvas.tsx`、`use-graph-preview.ts`；`canvas-selection-loop.test.ts`
  - 要点：`applyDragMove` 在节点位移超过 4px 时 `preview.closePreview()`；松手后重新 `showPreview`（拖动**期间**不该有悬浮卡，也不要靠「位移 ≥5 直接 return」的既有分支兜底）
  - 落地口径（实际）：「点击还是拖拽」这条线提为唯一常量 `GRAPH_CLICK_TRAVEL_MAX = 4`（constants.ts），两轴位移相加（Manhattan）判定，`hasBeenDragged()`（canvas-hooks.tsx:159）同时供**关卡片**与**松手分派**用，两侧不可能对同一手势给出不同答案。关卡片发生在 `moveDrag`（不是 `applyDragMove`）：边沿触发一次，标记 `cardPutAway` 存在 `state.dragging` 上（types.ts:33），随手势生灭——一次 pointermove 不重复 `setPreviewCard(null)`，同 `canvas-pointer-layout.test.ts` 对「每次移动都不许多读一次盒子」的既有预算一致。松手重锚复用 `onSelectNode`（它的调用方正是 `preview.showPreview`），不新增第三个回调；新增的只有 `onNodeDragged`（canvas.tsx:429 接 `preview.closePreview()`），因为按下时 `onDragStart` 关过、`onSelectNode` 又把卡挂回来，卡片必须由拖拽自己再关一次
  - 先红后绿（已跑）：本项最早 3 条用例在实现前跑 → **2 failed / 3 passed**，红在 `expected 'Alpha' to be null`（拖拽期间卡还挂着）与 `expected 100 to be close to 140, received difference is 40`（松手不重锚，卡仍停在按下处）。后 4 条（平移相机、按住修饰键拖拽不打开、被取消的手势之后下一次仍能关、斜向 3+3 越线）是转绿后补的，它们的红由变异 M6/M5/M7 代打（各杀 1 条具名用例）
  - 验证命令（已跑）：统一命令聚合 → **29 文件 / 228 条全绿**（同一命令在 `9ed428be` 上实测 29 / 221，差 7 条即本项新增；221 比 5.2 登记的 220 多 1，是那次复测本身低记 1 条）；单跑 `canvas-selection-loop.test.ts` **9 条全绿**；12 项静态门禁全绿（`comments:check` 12954→**12983** 条 / 1377 文件、`size:check` 1917 文件 / **47 豁免不变**、`style`/`escape`/`empty-catch`/`hardcoded`/`tokens`/`i18n` 3914 键/`deep-imports`/`surfaces` 8 表面/`module-state`/`vendor` 均 0，`typecheck` 干净）；提交钩子对暂存文件跑 `vitest related` → **25 文件 / 185 条全绿**
  - 变异（7 项全部被具名用例杀死；canvas-hooks.tsx 从 /tmp 保存原文还原，sha256 前缀 18928de73d87 逐字节一致）：拖拽期间不关卡片 → 杀 3 条；松手不重锚 → 杀 2 条（含「按住修饰键也不打开」那条的卡回到断言）；阈值 `-1`（任何移动都算拖拽）→ 杀「2px 微动仍算点击」；阈值 `1e9`（永远不算拖拽）→ 杀 5 条（卡不关 ×3、修饰键打开笔记、平移相机后选中被放下）；手势起点即「卡已关」→ 杀 3 条；松手顺带 `setSelectedId(null)` → 杀「平移相机仍握着原节点」；位移只算一轴 → 杀斜向那条
  - 边界（如实登记）：① `use-graph-preview.ts` **未改**（计划的文件清单列了它）——`closePreview`/`showPreview` 早已导出，本项只需在控制器侧多接一根线；② 台账字面写的是 `applyDragMove` 里关卡片，实现在 `moveDrag`，因为 `applyDragMove` 是无 React 感知的纯几何步、且它同时服务相机平移（平移不该有 `onNodeDragged` 语义）；③ 拖拽**期间**关掉的卡不会因为悬停重新挂回：`moveDrag` 在拖拽分支里提前 return，不走悬停路径，且按下时 `preview.clearTimers()` 已清掉悬停计时器；④ 松手重锚只画卡，不改选中（拖拽前按下已选中它），也不触发重查；⑤ `size:check` 一度报两处 `baseline null -> {"longFns":1}`：新 describe 回调 68 行 → 按行为拆成三个（卡走 / 卡回 / 拖拽不是点击），`useGraphCanvasController` 51 行 → 把新增注释压成一行回到 50，都不动基线；⑥ `CanvasState.dragging` 多了必填字段 `cardPutAway`，`canvas-physics.test.ts:193` 手搭的那个对象因此补一个值；⑦ 笔记内伴随图谱经 `GraphCanvas` 挂同一控制器，无需额外接线
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`0951a445`｜状态：✅ 已完成（2026-10-02）

- [x] **5.4 G-18｜窄屏图例与节点详情徽标不再落在同一水平带**
  - 台账：§3.3 G-18
  - 文件：`graph-overlays.tsx`；`panel-bottom-band.test.ts`（新）、`graph-panel-mount.test-helpers.ts`
  - 要点：图例存在时徽标下移一档（如 `bottom-14`），或图例改右上与 `TruncatedBadge` 错开；断点与尺寸用既有令牌，不散写视觉字面量
  - 落地口径（实际）：要点给的两条都**没**采用，改成「一条带装两个」——新增 `BottomBand`（graph-overlays.tsx:100）把 `ColorLegend` 与 `NodeDetailBadge` 放进同一个 `absolute inset-x-4 bottom-4 flex flex-col items-center gap-2` 容器，两个子元素自己不再带任何定位（图例改 `self-start` 保住左起，徽标由带的 `items-center` 居中）。理由一：`bottom-14`（56px）只清得开约 40px 高的图例，而 375px 实测三行图例高 **134px**、单行也有 **54px**，固定偏移追不上 `max-h-36`（144px）的可滚动列表；理由二：图例改右上会与 `TruncatedBadge`（`top-3 left-1/2`）抢同一条上沿，也把「颜色说明」从它要解释的画面底部挪走；理由三：重叠是**带自身宽度**的函数而不是视口断点的函数（同一组数据 640px 实测留 74px 间隙、375px 相交 58px），按断点分流等于把本项要删掉的那个数字再写一遍。带只用 `inset-x-4`/`bottom-4`/`gap-2` 既有 utility，未新增视觉字面量
  - 先红后绿（已跑）：jsdom 侧的红是结构性的——把 `1641d909^` 的 `graph-overlays.tsx` 取回原位置跑新用例 → **2 failed / 0 passed**，红在 `Error: the graph panel draws no [data-graph-legend] overlay` 与 `... no [data-graph-detail] overlay`（当时两条叠加既无可定位标记、也无共同父级），还原后 sha256 前缀 `960c4eee1a43` 逐字节一致。像素侧的红在浏览器里量：把改动前那两个 class 串以克隆节点挂回**同一个定位父级**（`position: relative`，即它们当时的包含块），375px 下实测图例 16→184、徽标 126→249、两者底边同为 651 → 水平相交 **58px**（单行图例时也相交 2px）；改后同一条数据图例 16→184 / 476→610、徽标 126→249 / 618→651，竖向留 8px 间隙，整条带仍在表面内（16→359 ⊂ 0→375，底 651 ≤ 667）
  - 验证命令（已跑）：统一命令聚合 → **30 文件 / 230 条全绿**（`0951a445` 上同一命令为 29 / 228，差 1 文件 / 2 条即本项新增）；单跑 `panel-bottom-band.test.ts` **2 条全绿**；12 项静态门禁全绿（`comments:check` 12983→**12995** 条 / 1378 文件、`size:check` 1918 文件 / **47 豁免不变**、`i18n` 3914 键、`tokens` 89 令牌无漂移、`surfaces` 8 表面、`typecheck` 干净）；浏览器量测脚本 `/tmp/measure-band.mjs`（Puppeteer + `scripts/e2e-harness.mjs` 的登录，跑在本机新起的 `dev:kv` 实例 :7713 上——:7712 属另一 worktree，未动）
  - 变异（7 项全部被具名用例杀死；graph-overlays.tsx 从保存原文还原，sha256 前缀 `960c4eee1a43` 一致）：徽标恢复自带的 `absolute bottom-4 left-1/2 -translate-x-1/2` → 杀「stacks…」；带改 `flex-row items-end` → 杀「stacks…」；带改成「无图例就不画」 → 杀「keeps the badge on the bottom edge…」；去掉 `data-graph-legend` 标记 → 杀「stacks…」；去掉图例的 `self-start` → 杀「stacks…」；带不再 `inset-x-4`（改 `right-4`）→ 杀「stacks…」；带内两个子元素对调顺序 → 杀「stacks…」
  - 边界（如实登记）：① **宽屏的图例上移了**：带在所有宽度都竖向堆叠，1280px 实测图例底边从 784 抬到 743（徽标仍是 578→702，与改前同一位置）——这是把「不重叠」写成结构而非数字的代价，只让窄屏堆叠就得重新引入断点；② 带在 DOM 里紧跟 `TruncatedBadge`，图例行的按钮因此在 Tab 序里**先于**悬停预览卡（改前相反）——预览卡是悬停才出现的临时物，这条时序无断言，批次 5 收尾的 375px 人工确认时一并看；③ 相交数字来自「3 条配色规则 + 选中 Beta」这组数据，规则更多或标题更长只会让相交更宽（徽标上限 80vw=300px、图例上限 `max-w-56`=224px，相加 524px > 带内 343px），不存在「刚好错开」的取值；④ jsdom 不做布局，两条用例钉的是结构（同一父级、`flex-col`、子元素无自带定位、图例 `self-start`、带 `inset-x-4`、先后顺序），不是像素；⑤ 5.1b 登记的「图例空白处命中穿透」人工确认（G-14 ④ 边界 ②）与本项的 375px 量测是同一件事，收尾时一次做完
  - 依赖：无
  - 代价：XS（0.2 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`1641d909`｜状态：✅ 已完成（2026-10-02）

- [x] **5.5 G-19｜窄屏交互提示与触屏的「长按」等价说明**
  - 台账：§3.3 G-19
  - 文件：`graph-overlays.tsx`、`canvas.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`；`canvas-a11y.test.ts`、`graph-canvas-mount.test-helpers.ts`
  - 要点：窄屏改为可折叠的一行简版提示，或首次进入时一次性 `role='status'` 播报；文案按 `pointer: coarse` 分流（触屏写「长按查看更多」），不改变桌面文案
  - 落地口径（实际）：要点给的两条实现路径（可折叠提示 / 一次性播报）都**没**采用，改成「整句永远在、按设备换字，窄屏另画一行缩写」。① `canvas.tsx:467` 以 `useMediaQuery('(pointer: coarse)')` **正向**问「是不是粗指针」，未上报 coarse 的环境（桌面、SSR、jsdom）保持既有整句，桌面文案一字未改（`canvas-a11y.test.ts` 其余 23 条与图谱其余文件不受影响）；② `graph-overlays.tsx:123` 把提示层抽成 `CanvasHint`，完整句仍带 `id={hintId}`（`sr-only md:not-sr-only`）作 `aria-describedby` 的目标，新增 `[data-graph-hint-brief]` 一行 `md:hidden` + `aria-hidden` 只给眼睛看——id 挂在 span 而不是外层，描述只解析到一句话，缩写不会被读第二遍；③ 文案三键 `interaction_hint_touch` / `interaction_hint_brief` / `interaction_hint_touch_brief`，en/zh 各 +3（`i18n:check` 3914→**3917**）。不用折叠控件的理由：它要新增一个可聚焦按钮并处理焦点往返，而提示本身不是控件；不用一次性播报的理由：它只在首次进入说一次，此后读屏用户无从复查，且它替代的正是 G-27 刚钉住的「描述一直在画面上」。
  - 先红后绿（已跑）：把 `891d43ab^` 的 `canvas.tsx` + `graph-overlays.tsx` 取回原位置跑 `canvas-a11y.test.ts` → **4 failed / 23 passed**，红在 `expected false to be true`（G-27 那条被改判的断言：`id` 从外层 div 移到 span）、`writes the long-press sentence for a pointer with no right button`、`draws a line a phone can read…`（`expected undefined to be 'Drag to pan · Scroll to zoom · Right-…'`，当时没有第二行）、`abbreviates the gestures a phone actually has`；还原后 sha256 前缀 `8925abdbc171`（canvas.tsx）/ `fb2288418257`（graph-overlays.tsx）逐字节一致、`git status` 干净，单跑回到 **27 / 27**
  - 像素（浏览器实测，`/tmp/measure-hint.mjs` + `/tmp/measure-hint-before.mjs`，跑在本机新起的 `dev:kv` :7713，:7712 属另一 worktree 未动）：1280×800 无触摸 → 画的是整句鼠标文案，盒子 16→520（宽 504、高 14）落在画布（0→1280）内，缩写行 `display: none`（宽 0）；375×667 且 `hasTouch: true`（`matchMedia('(pointer: coarse)')` 报 true）→ 画的是 `Drag to pan · Pinch to zoom · Long-press for more`，盒子 16→277（宽 261），右侧余 98px，`aria-describedby` 解析到整句触屏文案（sr-only，宽 1px）；375×667 无触摸 → 画的是鼠标缩写（宽 257）、描述仍是鼠标整句，即「窄」与「触屏」两条件各管各的；回到 1280 与第一次桌面读数一致，没有卡在窄屏态。改前的量测（把 sr-only 那句去掉 `class`、`white-space: nowrap` 克隆回同一父级）：整句触屏文案需要 **449px**，画布只有 **375px**（从 16px 起画越界 90px）——这是画缩写而非整句的实测理由。探针注意：`setViewport({ hasTouch: true })` 会让已打开的面板关一次（那次指针移动按到了遮罩），故每个状态先确认 canvas 在、不在就重新按命令面板打开；`mod+shift+g` 在这个 headless 启动里仍不触发（与 5.4 同一口径）
  - 验证命令（已跑）：统一命令聚合 → **30 文件 / 234 条全绿**（`1641d909` 上同一命令为 30 / 230，+4 即本项新增）；`typecheck` rc=0；14 项静态门禁全绿（`comments` 重新同步后 **13003 条 / 1378 文件**、`size` 1918 文件 / **47 豁免不变**、`i18n` 3917 键、`labels` 150、`tokens`/`style`/`escape`/`empty-catch`/`hardcoded`/`deep-imports`/`surfaces`(8)/`module-state`/`vendor` 均为 0）；`.githooks/pre-commit` 在本次提交内跑完全量单元 **419 文件 / 3473 条通过**（批次收尾仍按批次再跑一次）
  - 变异（7 项全部被具名用例杀死，两个源文件按保存原文还原、sha 一致）：M1 整句永不提长按 → 杀 1；M2 改问 `(pointer: fine)` → 杀 2；M3 缩写行钉死鼠标文案 → 杀 1；M4 缩写行去掉 `md:hidden` → 杀 1；M5 完整句不再 `sr-only` → 杀 1（G-27 那条）；M6 缩写行去掉 `aria-hidden` → 杀 1；M7 描述里把两句并成一句 → 杀 5。一条教训登记在此：M5 第一次**活了下来**，因为断言写成 `expect(hint.className).toContain('sr-only')`，而 `md:not-sr-only` 本身含 `sr-only` 子串；改判 `classList.contains('sr-only')` / `contains('hidden')` / `contains('md:hidden')` 后才杀死
  - 边界（如实登记）：① 台账建议的两条口径均未采用，理由见「落地口径」，若仍要一次性播报需另立条目；② 为把 `id` 移到 span 而改写了 G-27 已有的一条断言（`className` → `classList`），属既有覆盖的改判、不是新增；③ `hintBrief` 是 `GraphOverlaysProps` 必填项，笔记内伴随图谱与全屏图谱共用同一 `GraphCanvas`（`canvas.tsx:476`），两处同时生效、无第三处调用；④ 缩写行只在 <768px 画，所以「窄但用鼠标」的设备画的是鼠标缩写——刻意如此（画面装不下整句），该行也不出现「长按」；⑤ 读屏在窄屏只听到整句（缩写 `aria-hidden`），因此仍听得到画面上省掉的 `Tap to select` / `Double-tap to open`；⑥ jsdom 无布局，「画哪一行」在测试里钉的是 class 与 `aria-hidden`，像素由上面那组浏览器量测负责；⑦ `matchMedia` 缺失的环境 `useMediaQuery` 返回 false（`src/client/lib/hooks.ts` 的守卫），SSR 与首帧不会闪成触屏文案；⑧ 真机上「长按」是否确实等价于右键菜单仍是人工确认项（批次 5 收尾一并看），本项只保证文案说的是这台设备有的手势
  - 依赖：无
  - 代价：S（0.5 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`891d43ab`｜状态：✅ 已完成（2026-10-02）

- [x] **5.6 G-20｜伴随式局部图谱复用用户偏好**
  - 台账：§3.3 G-20
  - 文件：`graph-panel/use-graph-prefs.ts`（新）、`graph-panel/index.tsx`、`local-graph.tsx`、`graph-panel/constants.ts`、`store/ui/{types,store}.ts`、`workspace/workspace/workspace-views.tsx`；`local-graph.test.ts`、`companion-settings-entry.test.ts`（新）
  - 要点：① 把 `useGraphPrefs` 提升为共享 hook 供两处使用；② 伴随面板只覆写 `mode: 'local'` 与自己的深度（默认取用户值，下限 1）；③ 头部加「打开图谱设置」入口；④ 两处写同一 localStorage key 的竞态策略：只在全屏面板持久化、伴随面板只读，并把该策略写进注释
  - 落地口径（实际）：四条要点都按字面落地，另加一条自己的判定。① `useGraphPrefs` 从 `index.tsx` 提到 `graph-panel/use-graph-prefs.ts`，拆成写者 `useGraphPreferences()`（仍只有全屏面板持有）与读者 `useStoredGraphPreferences()`（伴随面板用）；同页写回靠一条自定义事件 `inkstone:graph-preferences-written` 广播——浏览器自己的 `storage` 事件只发给**其他**标签页，不广播就等于让伴随面板一直画它挂载时那份设置；且只在序列化结果与已存值不同时才写+广播，否则每次挂载都会递给读者一个新对象、触发画布重贴色。② 伴随面板覆写 `mode: 'local'` 与自己那份 `LOCAL_GRAPH_LIMIT = 100`，其余按用户值：`depth`（`loadPreferences` 已把它夹在 1..3，要点说的「下限 1」由既有边界保证，不再重复夹）、`includeOrphans`、`includeUnresolved`、`showTagNodes`。③ 头部入口沿用 `openSettings(section)` 的「请求—消费」口径：ui store 新增 `graphSettingsRequested` + `openGraphSettings()`，全屏面板 `useGraphSettingsDisclosure` 读到就开抽屉并当场把请求花掉。④ 写者唯一性除注释外还钉了一条 `Storage.prototype.setItem` 监听。**要点之外**：伴随面板**不**继承 `tag` / `folderId` / `q` 三个筛选——它没有显示或清除筛选的出口，继承会把面板清空且无路可退（与 G-15 的口径一致）
  - 先红后绿（已跑）：新用例先红在 **5 failed / 5 passed（10 条）**——`Error: the companion graph offers no way to the graph settings`、`TypeError: useUi.getState(...).openGraphSettings is not a function`、`expected { mode: 'local', …(5) } to deeply equal ObjectContaining{…}`、两条 `Error: the companion graph draws no colour legend`；「筛选不外泄」那条当时即通过，作为回归护栏保留。绿后两个文件 **11 / 11**
  - 像素（浏览器实测，`/tmp/measure-companion.mjs`，:7713 新实例，1280×800，账号 band-probe，打开笔记 Alpha 并点亮伴随图谱）：**改前**（把 `HEAD` 的 `local-graph.tsx` 放回原位置跑同一条路径）伴随面板头部只有 `Fit to canvas / Open full graph / Close`，在全屏抽屉里关掉 `Show unresolved notes`、把 `Color by` 改成 tag 之后，面板仍是 **6** 个节点、无图例；**改后**头部多出 `Graph settings`，按它直接进入全屏图谱且**抽屉已经开着**，同样两步改完关掉全屏后面板从 **6 → 4** 个节点，并画出 `work` / `urgent` 两行图例；跑完按保存原文还原，sha256 前缀 `a629533416b6` 逐字节一致
  - 验证命令（已跑）：统一命令聚合 → **31 文件 / 242 条全绿**（5.5 上同一命令为 30 / 234，+1 文件即本项新增的入口用例；**更正**：本条先前登记的 241 是加进「只有一处写 key」那条用例之前的读数，5.7 开工前在 `git archive c54b97bc` 快照上按同一命令复测为 **242**）；ui store 扩容的回归面 `src/client/store features/settings features/workspace features/shell features/music` → **137 文件 / 1176 条全绿**；`typecheck` rc=0；13 项静态门禁全绿（`comments` 重新同步后 **13025 条 / 1382 文件**、`size` 1920 文件 / **47 豁免不变**、`i18n` **3917 键不变**（复用 `graph.settings`，未新增文案）、`labels` 150、`tokens`/`style`/`escape`/`empty-catch`/`hardcoded`/`deep-imports`/`surfaces`(8)/`module-state`/`vendor` 均 0）；全量 `npx vitest run` → **631 文件 / 5544 通过 + 1 跳过**；提交钩子 `vitest related` → **330 文件 / 2633 条全绿**
  - 一次未定位的红（如实登记）：第一次 `git commit` 时钩子报 `1 failed | 329 passed (330) / 1 failed | 2632 passed (2633)`，提交被拦下；该轮输出被我 `tail -6` 截断，**没能记下失败用例名**，因此不能按 §3 的 flake 口径写成「已复核的超时 flake」。随后在同一棵树连跑三次——全量 `npx vitest run`（631 / 5544 + 1 跳过）、钩子同款 `vitest related`（330 / 2633）、直接执行 `.githooks/pre-commit`（330 / 2633，rc=0）——均 0 失败，第二次提交通过
  - 变异（11 项全部被具名用例杀死；三个源文件按保存原文还原、sha 一致）：M1 读者不再监听 → 杀 1；M2 写者不广播 → 杀 1；M3 写者根本不写 → 杀 2（含既有 `panel-parameter-isolation`）；M4 depth 仍写死 1 → 杀 1；M5 筛选漏进伴随请求 → 杀 1；M6 画面不跟用户规则 → 杀 2；M7 入口消失 → 杀 1；M8 入口按错目标（改调 `onOpenFullGraph`）→ 杀 1；M9 伴随面板也写同一 key → 杀 1；M10 请求没被花掉 → 杀 2；M11 面板读到请求却忽略 → 杀 1
  - 边界（如实登记）：① 「只在值变化时写」这条守卫本身无断言——去掉它没有可观察差异，只是每次挂载多一次写与一次读者重渲染；② 读者不监听跨标签页的 `storage` 事件（未做），另一个标签页改设置时伴随面板要等重挂载才跟上；③ 继承筛选的前提是先给伴随面板一个看得见、清得掉的出口（G-15），本项不做；④ 台账「建议」的 `createNote` `{{folder}}` 语义未顺手改：全屏面板用的正是 `prefs.folderId`（筛选值），而伴随面板按 ③ 不读筛选，继承过去反而自相矛盾，另立条目更合适；⑤ `limit` 仍是伴随面板自己的 `LOCAL_GRAPH_LIMIT = 100`，5.7（G-21）把上限提为偏好后两处一并接；⑥ `workspace-views.tsx` 那一行接线无自动化断言，浏览器实测走的就是这条路（点伴随面板头部按钮直达全屏抽屉）；⑦ 为守住 `size:check` 的 50 行上限，「只有一处写 key」那条用例单独成 describe（`check-size` 把 describe 回调计入函数），未动基线；⑧ jsdom 无布局，图例是否画对由结构断言与上面那组像素两侧共同负责
  - 依赖：无
  - 代价：S（1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`5d1492fa`｜状态：✅ 已完成（2026-10-02）

- [x] **5.7 G-21｜节点上限与局部深度可调（服务端能力不再被界面埋掉）**
  - 台账：§3.3 G-21
  - 文件：`src/shared/constants.ts`、`src/worker/routes/search/graph.ts`、`src/client/demo/backend/routes/search.ts`、`src/client/lib/graph-settings.ts`、`graph-panel/{helpers,constants,index,settings,canvas-hooks}.ts(x)`、`local-graph.tsx`；`helpers.test.ts`、`panel-parameter-isolation.test.ts`、`local-graph.test.ts`、`tests/graph-routes.test.ts`
  - 要点：① `limit` 提为 prefs 项 + `Slider`，界值与服务端 `clampInt` 共享常量（避免两处定义）；② 伴随面板补深度切换（至少 1/2 两档）；③ 若上界突破 600，同步把 `canvas-hooks.tsx` 的 `Math.min(...xs)` 改循环求极值（当前不溢出的前提只是服务端 clamp），否则补一条注释说明前提（台账 V-04）
  - 落地口径（实际）：三条要点都落地，③ 走的是「不突破就把前提写清」那一支。① `LIMITS` 新增 `graphNodeLimitMin/Max/Default`（50/600/350）与 `graphDepthMin/Max/Default`（1/3/1）；`GraphPreferences` 新增 `limit`，`loadPreferences` 按同一界值夹，抽屉筛选区加一条 `Node limit` 滑杆（`step` 是本模块的 `GRAPH_LIMIT_STEP = 50`，它是交互节奏不是界值，故不入 `LIMITS`），`graphRequest` 发 `prefs.limit`。**第三处定义一并接上**：`demo/backend/routes/search.ts` 原本自己写着 `Math.max(50, Math.min(600, …))`，与 worker 各写一份，现同样引用 `LIMITS`——否则演示版会答出真实版拒绝的取值，正是 G-31 那一类两处定义。② 伴随面板头部加自己的 `Link depth` 选择器，档位由新导出的 `GRAPH_DEPTHS` 生成（抽屉里那个原本硬编码 `[['1','1'],['2','2'],['3','3']]`，也改用它，于是「至少 1/2 两档」在两处是同一份表）；覆写**只活在本次挂载、不写回偏好**——5.6 刚把「只有一个写者」钉成断言，这里写回去就自相矛盾。③ 上界仍是 600，`useGraphFit` 的 `Math.min(...xs)` 不改代码，改为原地写清前提（响应最多 `graphNodeLimitMax` 个节点，比参数个数上限低三个数量级；抬高界值必须把这两行改成归约）
  - 先红后绿（已跑）：新用例先红在 **6 failed / 63 passed（69 条）**，原文为 `TypeError: actual value must be number or bigint, received "undefined"`（界值常量还不存在，`toBeGreaterThan` 拒收 undefined）、`expected { Object (mode, centerId, ...) } to match object { limit: undefined }`（路由侧同源断言）、`expected 350 to be undefined`（全屏请求仍发硬编码）、`Error: the graph settings have no control labelled graph.node_limit`、两条 `Error: the companion graph offers no link-depth choice`；绿后统一命令 **31 文件 / 249 条全绿**
  - 像素（浏览器实测 `/tmp/measure-limit.mjs`，:7713 新实例，账号 band-probe，笔记 Alpha）：1280×800 下伴随面板头部高仍 **32px**，右侧控件簇 1116→1268 ⊂ 面板 458→1280（`overflowsSection: false`）；375×667（`hasTouch: true`）下面板 0→375、控件簇 175→363，同样不溢出、头部仍 32px——新选择器没有把窄屏头部挤高。深度选择器实测 options `[1,2,3]`、初值 1，选 2 后网络里出现 `GET /api/graph?mode=local&center=…&depth=2&includeOrphans=1&includeUnresolved=1&tagNodes=0&limit=350`；抽屉里的 `Node limit` 滑杆实测 `min 50 / max 600 / step 50 / value 350`，拉到最大后全屏请求变为 `…&limit=600`，**同一份新值经 5.6 的同页事件也带到了伴随面板的下一次请求**（`…&depth=1&…&limit=600`）；关掉全屏、切到 375 重开面板后深度回到 1，即覆写按设计只活在本次挂载
  - 验证命令（已跑）：基线在 `git archive c54b97bc` 快照上按统一命令实测 **31 文件 / 242 条**，改后同一棵树 **31 文件 / 249 条**（+7 条即本项新增，`git diff c54b97bc..e78c6a44` 里 `+ it(` 计数同为 7）；`typecheck` rc=0；13 项静态门禁全绿（`comments` 重新同步后 **13041 条 / 1383 文件**、`size` 1920 文件 / **47 豁免不变**、`i18n` 3917→**3918** 键、`labels` 150、`tokens` 89 令牌无漂移、`hardcoded` 160 palette / 41 文件不变、`style`/`escape`/`empty-catch`/`deep-imports`/`surfaces`(8)/`module-state`/`vendor` 均 0）；全量 `npm run test:unit` → **631 文件 / 5550 通过 + 1 跳过，1 条失败**（`blog-comments-window.test.ts` `Test timed out in 5000ms`，单跑该文件 **1/0 通过、4.46s**）——属 §3 已登记的负载敏感 flake，与批次 3、4 收尾时同一条，未顺手修（铁律 14）；提交钩子 `vitest related` → **487 文件 / 4377 条全绿**（`src/shared/constants.ts` 被广泛引用，相关面比前几项大得多）
  - 变异（10 项全部被具名用例杀死；六个源文件按保存原文还原、sha 一致；每条臂都断言收集到的用例数与基线 28 文件 / 228 条相同，否则判 INVALID 而非 SURVIVED）：M1 存量 limit 读不回来 → 杀 4；M2 depth 被夹得比路由还窄 → 杀 2；M3 全屏仍发 350 → 杀 2；M4 滑杆不进了设置 → 杀 1；M5 伴随面板忽略自己头部的深度 → 杀 2；M6 伴随面板改回优先用户值 → 杀 2；M7 伴随面板写回共享 key → 杀 2（含 5.6 的「只有一处写」）；M8 伴随面板自留 100 上限 → 杀 2；M9 路由改回自己那份 50/900/350 → 杀 1（同源断言就是为这一条写的）；M10 `GRAPH_DEPTHS` 少一档 → 杀 1
  - 边界（如实登记）：① 滑杆的 `step` 与 min 无断言，只有「滑杆存在、能拉到 max、值进请求并进存储」这一条覆盖它；② 伴随面板的深度覆写不持久化，重挂载（换笔记、切断点、重开）回到用户值——这是 G-20 单一写者的直接后果，若产品要它记住，得给伴随面板一个自己的键，不在本项；③ `DEFAULT_PREFERENCES.limit` 取 350，与旧硬编码同值，因此默认路径下请求 URL 一字未变（实测 `…&limit=350`），本项不改变任何没动过设置的人的读数；④ 上界未突破 600，故 `useGraphFit` 只加了前提注释、未改代码，该注释本身无断言，靠「客户端夹 + 路由 clamp 同源」两条断言间接守住前提；⑤ 演示后端与 worker 现在同源，但 `demo/backend.test.ts` 未新增「demo 也按同一界值夹」的越界用例（现有用例只覆盖界内取值），这条路径靠同源引用保证；⑥ jsdom 无布局，头部会不会被新选择器挤高由上面那组像素实测负责，测试只钉选择器的存在与取值
  - 依赖：5.6（伴随面板的偏好通路）
  - 代价：S（1 人日）｜提交建议：`feat(graph)`
  - 提交哈希：`e78c6a44`｜状态：✅ 已完成（2026-10-02）

#### 批次 5 收尾门禁（已跑，2026-10-02）

> 七项全部落地后在同一棵树（5.7 登记提交 `ae80e96f`）上跑完。起止与批次 3/4 同：本机 :7712 仍被另一棵 worktree 的 vite 占用，本批自己的 `dev:kv` 跑在 **:7713**（`setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv > /tmp/inkstone-g5-closeout.log 2>&1 < /dev/null &`，`/api/health` 返回 `{"ok":true}`）；三个浏览器门禁期间未改任何仓库文件，跑完按进程组只停自己的实例，**未碰对方的 7712**。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **631 文件 / 5551 通过 + 1 跳过，0 失败**（本轮无 flake。5.7 提交前那一轮曾报 1 条 `blog-comments-window.test.ts` `Test timed out in 5000ms`，单跑该文件 1/0 通过、4.46s——属 §3 已登记的负载敏感 flake） | ✅ |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0（内含 `tsc -b && vite build`）；music 各 chunk ≤ 97.7 KiB，`@excalidraw/excalidraw` 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs http://localhost:7713` | **177 passed / 0 failed**（两轮各跑一次，均 177/0） | ✅ |
| 视觉与交互 | `node scripts/e2e-visual.mjs http://localhost:7713` | 第一轮 **689 passed / 1 failed**：`surface keyboard: the kanban board hands focus back to the control it was opened from {"opener":"button[全屏]","active":"body","inherited":"","returned":false}`；换全新实例重跑第二轮 **690 passed / 0 failed**，同一条断言通过 | ⚠️ 单次未复现，见下 |
| 对比度与外壳 a11y | `node scripts/check-contrast.mjs http://localhost:7713` | 退出码 0，结尾 `contrast gate passed: every text tier, accent, status color and kanban tag colour painted on a tint clears AA in both themes, at desktop and phone width`（本轮含 `1 kanban tag colour/tint pairs measured (12 ratios)`） | ✅ |

- **那条看板红点的如实结论**：它不在本批的改动面上——`git diff --name-only ecfc3e5e..ae80e96f` 除图谱模块外只有 `store/ui`（一个字段 + 一个 action）、`shared/constants.ts`（六枚界值）、`workspace-views.tsx`（伴随面板一行接线）、两份 graph locale、`worker/routes/search/graph.ts` 与 `demo/backend/routes/search.ts`，没有一处在看板的焦点归还路径上；同一棵树换全新实例复跑即通过。故记为**未复现的单次失败**：它不在 §3 的 flake 清单里，所以不写成「已复核的 flake」，也不顺手去查看板（铁律 14），已登记为 §8 **F-07**。
- 条数变化：`e2e` 仍 177（本批未动对外接口）；`e2e-visual` 仍 **690**——**本批七项都没有将改判并入浏览器门禁**，5.4/5.5/5.6/5.7 的像素证据全在一次性脚本里（`/tmp/measure-band.mjs`、`/tmp/measure-hint.mjs`、`/tmp/measure-companion.mjs`、`/tmp/measure-limit.mjs`），这是如实登记的覆盖缺口，与 F-05 同一类，补法并入批次 7；`test:unit` 625 → **631** 文件、5487 → **5552** 条（本批新增 7 个测试文件，其余增量为同期既有模块）。
- 三项此前登记「收尾时一并看」的浏览器确认，本轮用 `/tmp/confirm-band.mjs` 在同一棵树、同一实例上量完（账号 Owner-1，zh-CN，2 条命中标签规则）：
  - **G-18 窄屏不重叠**：375×667（`hasTouch: true`）实测图例 16→179 / 516→610、徽标 111→264 / 618→651 → 竖向间隙 **8px**、`overlapping: false`，整条带 16→359 在表面 0→375 内；1280×800 同一组数据间隙同为 **8px**（图例 16→175 / 665→743、徽标 563→717 / 751→784）。与 5.4 当时在改动前后各量一次的结果一致，此次是在七项全部落地后的树上复量。
  - **G-14 ④ 图例空白处命中穿透**：取图例自身盒子内右侧偏中的一点（375 下 176,563；1280 下 172,704），`document.elementFromPoint` 回的都是 **canvas**（`isCanvas: true`、`insideLegend: false`），即图例的空白区不吞指针。
  - **G-18 ②／G-19 的 Tab 序**：375 下从画布起连按 12 次 Tab，顺序为 `tag:alpha → tag:import-atomic → 全局 → 筛选笔记… → 缩小 → 复位 → 放大 → 导出为 PNG → 导出为 SVG → 图谱设置 → 关闭 → 回到画布`——图例行确实在头部控件之前（5.4 登记的那条副作用成立），且一圈走回画布、没有掉进已关闭的表面。
  - **仍未做的**：真机上的「长按 = 节点菜单」等价性（5.5 边界 ⑧）只有 headless Chrome 的 `hasTouch` 替身，手机上的实际压感阈值与系统手势拦截无法在本环境验证，留给人工。
- `npm run build` 未单独运行，由 `budget:check` 内含的构建覆盖（与批次 1–4 同一口径）。
- 运维备注：停自己的实例仍按进程组（`lsof -ti :7713` 取 pid → `ps -o pgid=` → `kill -TERM -PGID`），未用 `pkill -f`；探针账号 `band-probe` 在全新实例上可自建（`/tmp/seed-band-probe.mjs`），但**门禁跑完的实例注册已被 e2e 关掉**（register 返回 403），故本轮确认改用了门禁自己的 `Owner-1` 账号并按其真实标签构造配色规则。

### 批次 6：设置与工程卫生（7 项）

> 完成判据：全仓裸 `input[type=range]` 只剩既有注释例外；三处默认值有守卫；滑块不逐事件落盘；pin 跨会话存活；死重载与渲染期写 ref 清除。

- [x] **6.1 G-11 + G-32｜力滑块换用组件库 `Slider`，界值单一来源，副作用移出输入路径（同一提交）**
  - 台账：§3.2 G-11 / §3.6 G-32
  - 文件：`src/client/lib/graph-settings.ts`、`graph-panel/{settings.tsx,constants.ts,helpers.ts,use-graph-prefs.ts,graph-panel-mount.test-helpers.ts}`；`panel-force-slider.test.ts`（新）、`helpers.test.ts`、`panel-parameter-isolation.test.ts`、`local-graph.test.ts`
  - 要点：① `GraphRange` 内部换用 `Slider`（`label` 给可访问名称、`suffix` 给单位，`aria-valuetext` 由组件提供）；② 新增 `GRAPH_FORCE_RANGES` 常量表，面板与 `loadPreferences` 同读一份；③ 滑块值先落组件本地 state 做即时反馈，`onPointerUp`/rAF 边界提交进 `prefs`；④ `localStorage` 写入 debounce 300ms 并移出渲染路径；⑤ 既有 `catch` 内补 `console.warn`（保留注释，铁律 2 的 best-effort 例外形式）
  - 落地口径（实际）：五条要点全落地，另有两处按现场实情定形。表放在 `lib/graph-settings.ts`（与 `GRAPH_SETTINGS_TOGGLES` 同一清单文件），导出 `GRAPH_FORCE_RANGES`（数组，面板 map 用）与 `GRAPH_FORCE_RANGE`（按 prefKey 查，clamp 与默认值用），`DEFAULT_PREFERENCES` 的三个 default 与 `loadPreferences` 的三个 clamp 都改为读它——于是「抽屉给的轨道」和「存储读回来时夹的界」不可能再各写一份。`Slider` **不转发任何事件**（它的 props 是固定白名单），所以三个提交边界（`onPointerUp` / `onKeyUp` / `onBlur`）挂在包裹的 `div` 上而不是 `Slider` 上；另补 `onPointerCancel`，因为手指被系统手势抢走时浏览器只发 cancel，不补就会把读者已经拖到的值丢掉（改前的逐步提交反而不会）。持久化抽成模块内唯一的 `writeGraphPreferences()`，带 300ms debounce 与**卸载前 flush**（拖完立刻按 Esc 的读者设置仍然算），`catch` 里补 `console.warn('[inkstone] graph preferences could not be stored', error)`。**未改 `canvas-hooks.tsx`**（计划文件清单列了它）：「≤1 次物理唤醒」是由「松手才改 prefs」实现的，画布侧不需要新代码。要点 ① 的 `suffix` 未用——三个力量值本来没有单位，硬加一个反而是假信息。
  - 先红后绿（已跑）：把 5 个产品文件退回 `HEAD` 跑新用例 → **4 failed / 41 passed**，原文为 `TypeError: GRAPH_FORCE_RANGES is not iterable`（×2）、`AssertionError: expected [ [ …(2) ], [ …(2) ] ] to deeply equal []`（拖动期间就已经写了盘）、`AssertionError: expected null to be 'Repulsion'`（滑块没有可访问名称）；五个文件按保存原文还原，sha256 逐一比对一致（`a50e7b1cf62c` / `e0eb52f58ad4` / `0d2d7d5927e5` / `7d5df0c13021` / `dc3bd1dc7faa`）。绿后新文件 **6/6**、统一命令 **32 文件 / 256 条**
  - 验证命令（已跑）：基线为 5.7 的 **31 文件 / 249 条**，改后 **32 文件 / 256 条**（+1 文件 / +7 条：`helpers.test.ts` 1 条 + 新文件 6 条）；`typecheck` rc=0；13 项静态门禁全绿（`comments` 重新同步后 **13092 条 / 1385 文件**、`size` 1921 文件 / **47 豁免不变**、`i18n` 3918 键不变（未新增文案）、`labels` 150、`tokens`/`style`/`escape`/`empty-catch`/`hardcoded`/`deep-imports`/`surfaces`(8)/`module-state`/`vendor` 均 0）
  - 变异（8 项全部被具名用例杀死；三个源文件按保存原文还原、sha 一致；每臂先核对收集用例数与基线 212 相同）：M1 存储 clamp 到一个抽屉不提供的界 → 杀 1；M2 松手交回旧值 → 杀 6；M3 松手根本不提交 → 杀 5；M4 滑块丢可访问名 → 杀 9；M5 轨道起点不走表 → 杀 1；M6 去掉 debounce → 杀 1；M7 去掉卸载 flush → 杀 1；M8 去掉 pointercancel 提交 → 杀 1。**M6 第一版活了下来**：两次提交落在同一个 `act` 批次里，即便延时为 0 也来得及被第二次的 cleanup 清掉；把第二次提交挪到窗口中点（等 150ms 再松手）之后才真正杀死——即「debounce」要有可观察的窗口，不能只靠同批合并
  - 边界（如实登记）：① 伴随面板跟随设置的延迟从「同帧」变成「约 300ms」——同页广播事件挂在写盘之后（G-20 的机制不变，只是被 debounce 挡了一程），`local-graph.test.ts` 两条跟随用例因此从 `settleGraphPanel` 改为 `settlePersist`；② 拖动过程中画布不再实时重排，松手才改（要点 ③ 的字面结果），若产品要实时预览需要另设「拖动中只改本地渲染」的通路；③ 表里三个 default 与旧硬编码同值，因此没动过设置的人存储内容一字不变；④ `GRAPH_FORCE_RANGES` 的**数字本身**无断言（改表不会红），断言钉的是「抽屉与 clamp 读同一份」这一关系；⑤ 长按方向键连发会产生多次提交，但同一 300ms 窗口内只落一次盘（M6 那条断言）；⑥ jsdom 无 PointerEvent，松手/取消都用同名 `Event` 模拟，真实触控板与触屏的手势路径由批次 6 收尾的浏览器门禁与本项之外的手工确认覆盖；⑦ 计划文件清单里的 `canvas-hooks.tsx` 未改，理由见「落地口径」
  - 依赖：无（合并约束 2）
  - 代价：S（1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：✅ 已完成（2026-10-02）

- [ ] **6.2 G-35｜Tooltip 可见文案与可访问名称统一为 `graph.fit`**
  - 台账：§3.6 G-35
  - 文件：`index.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：`Tooltip label` 与 `IconButton label` 统一为 `graph.fit`；`graph.reset` 随本提交一并删除（G-34 的前置）
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npx vitest run src/client/features/graph`
  - 依赖：无
  - 代价：XS（0.1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.3 G-36｜默认值的唯一来源与守卫**
  - 台账：§3.6 G-36
  - 文件：`src/client/lib/graph-settings.ts`、`constants.ts`、`graph-settings.test.ts`
  - 要点：测试改断言 `DEFAULT_PREFERENCES[control.prefKey] === control.default`；或让 `DEFAULT_PREFERENCES` 的布尔项由 manifest 派生，使 `default` 成为唯一来源（两者 7 个布尔值目前一致，是「无守卫的重复」而非已漂移）
  - 先红后绿：把测试改成对 `constants.ts` 求值后，先把 `includeOrphans` 翻转验证会红，再恢复
  - 验证命令：统一命令 + `npx vitest run src/client/lib/graph-settings.test.ts`
  - 依赖：无
  - 代价：XS（0.2 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.4 G-37｜魔法数字提具名常量（跨端共享的放共享层）**
  - 台账：§3.6 G-37
  - 文件：`index.tsx`、`local-graph.tsx`、`src/worker/routes/search/graph.ts`、`use-graph-preview.ts`、`constants.ts`
  - 要点：逐项提常量——`limit: 350`、防抖 `220`、伴随图谱 `depth:1`/`limit:100`、`params.limit - 50` 与 `50`（同一数字两种含义）、查询长度 `200`、悬停 `300`/隐藏 `200`；`graph.ts` 的 `!a || b && c` 补显式括号
  - 注意：ULID 正则重复是全仓级现象（10+ 处），**不在图谱批次里做**（§5 第 8 条）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph tests/graph-routes.test.ts`
  - 依赖：无
  - 代价：S（0.5 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.5 G-39｜`useGraphControls` 不在 render 阶段写 ref**
  - 台账：§3.6 G-39
  - 文件：`canvas-hooks.tsx`；`header-export.test.ts`
  - 要点：改成 `useEffect(() => { controlsRef.current = {...} }, [stateRef, fitGraph])`；调用点只在 `onClick` 时读，effect 时序足够。若既有测试依赖渲染期写入，那正是该修的时序假设
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/header-export.test.ts`
  - 依赖：无
  - 代价：XS（0.2 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.6 G-07 步骤 2｜pin 跨会话持久化（步骤 1 已随 1.1 落地）**
  - 台账：§3.2 G-07
  - 文件：`helpers.ts`、`src/client/lib/graph-settings.ts`、`types.ts`、`canvas-draw.ts`、`canvas.tsx`（`shared/types/graph.ts` 仅在需要把 pin 语义外显时同步）
  - 要点：`pinned` 提升为 `GraphPreferences.pinnedNodeIds: string[]`；`loadPreferences` 按 `/^[0-9a-hjkmnp-tv-z]{26}$|^tag:.+$/` 白名单逐项校验（沿用 agy SEC-04 的偏好加固形状）；加载时把命中的节点的 `pinned` 置回
  - 先红后绿：补「重载后 pin 仍在」与「非法 id 被丢弃」用例
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts`
  - 依赖：1.1（坐标继承）与 1.2（键盘入口；否则 pin 对键盘用户仍不可达）
  - 代价：S（0.5 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.7 G-33｜`createGraphTicker` 双形态签名清理（两步两提交）**
  - 台账：§3.6 G-33
  - 文件：`canvas-draw.ts`、`canvas-draw.test.ts`、`canvas-physics.test.ts`
  - 要点：**步骤 ①** 删位置重载与一串 `!` 断言（grep 已确认全部调用点都是对象形态，零调用者）；**步骤 ②** 先把两个测试文件改成传 `{ current: … }` 并确认仍绿，再删 `'current' in colorsRef/prefsRef` 双形态判断（`canvas-physics.test.ts` 传的是朴素 `readThemeColors()`/`DEFAULT_PREFERENCES`，是这条判断的真实调用者）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/{canvas-draw,canvas-physics}.test.ts`
  - 依赖：无；**不得合并两步**（合并约束 9）
  - 代价：XS（0.3 + 0.2 人日）｜提交建议：`refactor(graph)` ×2
  - 提交哈希：待登记（两个）｜状态：⬜ 待开始

### 批次 7：收尾与对标（7 项 / 8 个编号）

> 完成判据：导出面板能去掉标题（隐私）与背景；绘制异常不再静默停帧；滚轮监听不再被动；死键清零；单篇排除与方向过滤落地。

- [ ] **7.1 G-05 + G-45｜导出选项：「不含标题」「背景透明/纯色」（含隐私维度）**
  - 台账：§3.1 G-05 / §3.8 G-45
  - 文件：`graph-export.ts`、`use-graph-export.ts`、`src/client/lib/graph-settings.ts`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：`prefs` 新增两个布尔项（绘制路径已按 `prefs.labels` 分支）；导出面板提供开关；文件名固定 `graph-<mode>.<ext>` 的现状在提交信息里说明是否保留；导出的 PNG 常被贴到外部，标题即笔记名，属隐私项
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/graph-export.test.ts src/client/features/graph/graph-panel/use-graph-export.test.ts`
  - 依赖：无
  - 代价：S（0.5 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.2 G-12｜`--font-ui` 每帧读取的处理（缓存必须显式跟随变更）**
  - 台账：§3.2 G-12
  - 文件：`canvas-draw.ts`、`canvas.tsx`
  - 要点：择一——并入「由主题/字体变更观察器刷新的引用」（现有 `createThemeObserver` 扩一个观察对象），或保留每帧读但**写明理由**（它正是「换字体后自愈」的机制）。若改缓存，必须补「换 UI 字体后画布文字用新字体」用例；**不要**简单 `useMemo` 缓存（ADR-0002 警告的「冻在创建时刻」）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph`
  - 依赖：3.3（同一处主题订阅收敛后改，避免两次改同一段）
  - 代价：XS（0.3 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.3 G-13｜绘制路径错误边界：异常不静默停帧**
  - 台账：§3.2 G-13
  - 文件：`canvas-draw.ts`、`canvas.tsx`；`canvas-draw.test.ts`
  - 要点：`tick()` 内 try/catch：`console.error('[inkstone] graph paint failed', error)`（带 message、不带数据）、复位 `state.raf = 0`、停止循环，并经可选 `onPaintError` 让面板显示 `Empty` + 重试（复用 `graph.could_not_load_graph` 文案）
  - 先红后绿：用上下文替身注入抛错，断言不会永久停帧且错误被记录
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/canvas-draw.test.ts`
  - 依赖：3.3
  - 代价：XS（0.5 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.4 G-17｜滚轮缩放换非 passive 原生监听**
  - 台账：§3.3 G-17
  - 文件：`canvas.tsx`
  - 要点：仿 `features/preview/lightbox.tsx` 的做法在画布容器上注册 `{ passive: false }` 原生监听（React 19 在 root 上被动注册，现有 `preventDefault` 是空调用，并会在 Chrome 打印警告）；或至少给面板加 `overscroll-behavior: none` 并去掉误导性的 `preventDefault`。低危但一旦图谱进可滚动容器会真的带着页面滚
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph`
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.5 G-34｜死 i18n 键清理（排在 6.2 与 4.2 之后）**
  - 台账：§3.6 G-34
  - 文件：`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：删 7 项（`graph.drag_to_pan_…_abov` 截断 key、`graph.graph_canvas_drag_…_note`、`graph.choose_a_note`、`graph.open_a_note_from_the_graph`、`graph.links`、`graph.notes`、`graph.unresolved_short`）；`graph.tag_node` **保留**（4.2 在用）；`graph.reset` 已随 6.2 删除；zh-CN 正确行号 `6,12,13,14,31,35,60,71`（:21 是活键 `graph_canvas_accessible`，不在其列）
  - 注意：不去改 `i18n:check` 增零引用报告（§5 第 7 条）
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npm run i18n:check`
  - 依赖：6.2 + 4.2（合并约束 4）
  - 代价：XS（0.2 人日）｜提交建议：`chore(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.6 G-42｜单篇「从图谱中排除」**
  - 台账：§3.8 G-42
  - 文件：`src/client/lib/graph-settings.ts`、`helpers.ts`、`src/worker/routes/search/graph.ts`、`settings.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：prefs 新增 `excludedNoteIds`（复用 6.6 的白名单校验机制）；服务端 `filters` 加 `NOT IN`——注意 D1 绑定变量预算与既有 `GRAPH_NOTE_ID_CHUNK`，需分块或改用临时表；设置面板提供移除入口
  - 先红后绿：补「排除的笔记不出现在结果里（且现有文件夹/标签过滤不受影响）」用例
  - 验证命令：统一命令 + `npx vitest run tests/graph-routes.test.ts src/client/lib/graph-settings.test.ts src/client/features/graph`
  - 依赖：6.6（校验机制形状）
  - 代价：M（1–1.5 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.7 G-44｜局部图谱的方向过滤（仅入 / 仅出 / 双向）**
  - 台账：§3.8 G-44
  - 文件：`src/worker/routes/search/graph.ts`（递归 CTE 方向分支）、`src/client/lib/graph-settings.ts`、`settings.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：局部图谱加三选一（全局图谱语义上无意义，不渲染）；服务端只需在 CTE 的方向分支上加条件；默认「双向」，保持现有行为
  - 验证命令：统一命令 + `npx vitest run tests/graph-routes.test.ts src/client/lib/graph-settings.test.ts`
  - 依赖：5.7（同行设置区块）
  - 代价：S–M（1 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

---

## 5. 不做清单（明确不做，避免反复讨论）

1. **不删「以此笔记为中心」菜单项**（台账 §2 Q-UX-02 整体不成立）。该功能经「打开笔记 → 活动笔记变化 → 面板以新 id 重查」可达；若要去掉 `onMakeLocal={() => {}}` 的异味，正确判据是看 `mode === 'local'`，且这属于可选打磨（需产品确认），不在 48 条内。
2. **不上 Barnes-Hut**。节点上限 410 时收益不抵复杂度（G-08 只考虑「每 2 帧物理 / 光晕降级 / 远端团簇跳过」三档）。
3. **不合并 MCP 与 UI 两套图谱遍历实现**。形状差异大（BFS+摘要 vs 聚合+合成节点），只共享「范围」判定（G-04②，另立）。
4. **不在本计划排期内改 `links` 表**。G-43 ②③（附件节点 / 边类型）是持久化契约变更，须走 expand-contract + 迁移不可变门禁 + 部署前备份，另立事项。
5. **G-46（色板可访问名与单选语义，5 个调用点）不挂图谱批次**。只改图谱会制造局部偏离（铁律 14）。
6. **G-48 候选里只保留两项**：「按路径分组着色（含祖先目录）」与「从笔记自身打开全屏图谱」；其余（小地图、缩放百分比读数、冻结物理开关、图谱前进后退、节点尺寸公式可调、框选、未链接的提及）明确不做。
7. **不给 `i18n:check` 增零引用报告**。属全仓性收益，单独立项（铁律 14）。
8. **不在图谱批次里抽 ULID 正则共享**。该重复是全仓 10+ 处的现象，另立。
9. **不顺手修已登记的音乐/日历 flake**（铁律 14，见 §3）；不用 `--update-baseline` 吸收自己造的长函数。
10. **不做无证据的持久化契约变更**。G-10 先量后决定；量测结论为「无压力」时登记为以证据关闭。

---

## 6. 待量测与决策闸门

### 6.1 待量测（批次 0 产出，写入台账 §5 的 V 表）

| 编号 | 待量测 | 手段 | 解锁 |
| :--- | :--- | :--- | :--- |
| V-01 | 布局期真实帧成本（物理 vs 绘制各占多少） | **已实测**（`scripts/measure-graph.mjs`，`adef5e84`；接缝：`advancePhysics` 是模块私有，故物理按「整帧 − 绘制」估，是上界）：600 节点下均值 16.9ms / p95 16.8ms / 最长 50ms，绘制一帧中位 5.6ms，物理 ≈11.3ms | G-08 的 ①② 取舍（见 D-1） |
| V-02 | 一次请求实际读多少行 links（大库样本） | **已实测**：350 节点页 → 9 条分块语句读回 1750 行、合计 5.0ms，走 `idx_links_user_source`，候选上限 10000 未触及 | G-01 的提前退出阈值与 G-03 服务端预算必要性（见 D-4） |
| V-03 | 全局图谱 degree 聚合真实耗时 | **已实测**：页面读中位 143.4ms，其中聚合 113.0ms＝79%，且聚合量与页面大小无关（全库物化 + SQLite 自建覆盖索引） | G-10 的 A/B/撤销（见 D-2） |
| V-04 | `Math.min(...xs)` 的安全上界 | 文档层已确认（服务端 clamp 600 + 标签 60 → ≤410）；**5.7（G-21）已落地**：上限未放开（`LIMITS.graphNodeLimitMax` 仍 600），前提已写进 `canvas-hooks.tsx` 的 `useGraphFit` 注释，并把 worker clamp、`loadPreferences`、抽屉滑杆、演示后端四处收到同一份 `LIMITS` | G-21 的前置（已满足） |
| V-05 | 主题翻转时预览卡的像素/内联色是否真的陈旧 | 浏览器断言（先设账号「跟随系统」再翻系统偏好） | G-31 的验收条件 |

### 6.2 决策闸门（拿到证据后必须登记结论，含「不做」）

| 闸门 | 决策 | 判据 | 结论（2026-10-02，数字见 §5 V 表与 0.1 登记） |
| :--- | :--- | :--- | :--- |
| D-1（G-08） | 做「每 2 帧物理」「标签光晕降级」「远端团簇跳过」的哪几档，或全部不做 | V-01：单次布局最长提交与绘制占比；不做 Barnes-Hut | **①③ 不做**：600 节点（客户端上限）下 settle 均值 16.9ms、p95 16.8ms，即每一帧都还排在 vsync 里，只有首帧 50ms；把物理降到每 2 帧换不来任何可读性，反而让松手后的收敛看起来会卡顿，而「远端团簇跳过」要省的那部分正是这 11ms 里不可见的一环。**② 证据不足，暂不决定**：光晕只在 `showTagNodes=1` 时存在，本次量的库没开标签节点（脚本默认走 `tagNodes=0`），要判它得先有一个开标签节点的大库场景（与 F-04 同一前置） |
| D-2（G-10） | A 物化 `link_degree`（持久化契约变更，须 expand-contract + 备份 + 迁移门禁）/ B 请求内 memo + 短缓存（须为 `no-store` 开例外并注明理由、不得引入模块级可变状态）/ 撤销 | V-03 的 `EXPLAIN QUERY PLAN` 与实测耗时 | **A 不做、B 不成立，按 §5 规则 10 以证据关闭**：聚合确实是一次全局读的大头（113ms / 143ms＝79%）且与页面大小无关（全库物化），但 B 在单次请求里 degree 只算一次、没有可省的重复，跨请求缓存又与 `no-store` 和 `module-state:check` 直接冲突；A 能把这 113ms 挪到写入侧，代价是持久化契约变更 + 迁移不可变门禁。**本机 miniflare 的 143ms 不足以支撑这个代价**（不外推到生产 D1）——重开条件：生产侧出现「一次图谱读」可感知等待的数字，或库规模让聚合随库线性增长撞上限（脚本可复测：`NOTES=50000`） |
| D-3（G-47） | ① 底部徽标升级为可点开的邻居清单（M）；② 节点菜单「展开相邻笔记」合并进当前图（M，依赖 G-06） | **不需要数字**，需要归属决策（是否算图谱模块该做的事）；建议 ① 先做、② 待 1.1 落地后评估 | 未决（归属决策，不由数字解锁）：1.1 已落地（`d4d2e12e`），② 的前置已满足，等 §5 之外的排期决定 |
| D-4（G-01 阈值 / G-03 必要性） | 提前退出的阈值是否合适、服务端读预算是否必要 | V-02 的大库样本 | **预算保留、阈值不动**：350 节点页面只读回 1750 行 links（9 条分块语句、5.0ms、走 `idx_links_user_source`），候选上限 10000 远未触及——即预算是「挡住一篇 2MiB 笔记」的护栏而非日常摩擦，成本几乎为零；G-03（2.3 已落的读端点超时/节流）与本条无关，不因此回退 |

---

## 7. 完成定义（每项都按此验收，不满足不得勾 `[x]`）

1. **先红后绿**：行为变化先有复现用例并记录失败输出，再改代码转绿。
2. **原子提交**：一次提交只做一件事，正文按 `- 路径: 改动` 逐文件写；§2 指定的同批项在提交信息中互相引用。
3. **门禁**：统一命令 + 该项「验证命令」全绿；批次收尾跑 `test:unit`、`build`、`budget:check` 与三个浏览器门禁（全新实例）；负载 flake 按证据标注而不得写成「全绿」。
4. **文档同步**：对外行为变化（键盘承诺、空态文案、可调上限、默认分组、导出选项）同步 `AGENTS.md` 相关条目、`ADR-0002`、`README.md` 设置表、locale 资源与本表；本表每落地一项即登记提交哈希。
5. **不夹带**：过程中的新问题写进 §8 并另开条目，不在当前提交里顺手修（铁律 14）。
6. **不伪造**：无法运行的验证必须在「状态」列写明「未验证 + 原因 + 风险」。首轮文档落地时 `typecheck` / `style:check` / `build` / 三个浏览器门禁均未运行；批次 1 开工后 `typecheck`、静态门禁与图谱聚合测试已按条登记实测输出，批次收尾门禁（`test:unit` / `budget:check` / `e2e` / `e2e-visual` / `check-contrast`）已在「批次 1/2/3/4 收尾门禁」登记实测数字；批次 3、4 各条唯一红点均是 §3 已登记的负载敏感 flake，已单跑复核并如实标注，未写成「全绿」。`build` 未单独运行，由 `budget:check` 内含的构建覆盖。

---

## 8. 新增发现（待登记，本表落地过程中随时追加）

| 编号 | 现象 | 涉及文件 | 严重程度 | 归属批次 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| F-01 | 图谱物理在 53 个节点时 settle 要 ~7s，超出 `waitForStillGraphCanvas` 默认的 24 × 250ms；主题场景只用 `sum > 0` 判据，等不够也不会报红 | `scripts/e2e-visual.mjs`、`src/client/features/graph/graph-panel/canvas-draw.ts` | 低（门禁耐心，不是产品缺陷） | 批次 4 | 部分处理：`a2e7acc2` 给该 helper 加了 `attempts`/`stable`，走位场景用 80；主题场景仍用默认值（待批次 7 收尾时再看） |
| F-02 | 笔记内的局部图谱（`local-graph.tsx`）**没有**标签筛选可收敛，它不传 `onFilterByTag`；菜单那一支本来就降级为只剩「固定」，但键盘那一支会静默吞掉 Enter | `src/client/features/graph/local-graph.tsx`、`src/client/features/graph/graph-panel/canvas.tsx` | 中（铁律 2 静默失败） | 批次 4 | 已处理：`752cfeb8` 在无回调时播报 `graph.tag_filter_unavailable`；**未做的部分**是给局部图谱一个真的筛选入口（属新功能，需新编号，不在本计划内） |
| F-03 | 「未创建」节点（`unresolved`）的播报仍只有标题与出入度，与普通笔记节点同形；`graph.unresolved_short` 是形如「' unresolved'」的残片，不宜直接当 kind 标签 | `src/client/features/graph/graph-panel/canvas.tsx`、`src/shared/locales/*/graph.ts` | 低（读屏可辨性，与 G-24 同类） | 不排期 | 不做（本次）：G-24 的判据是「标签节点 vs 笔记节点不可辨」，已修；给第三种 kind 补一个名词 key 需新开条目，G-34 删 `unresolved_short` 时一并看 |
| F-04 | 标签节点的预览卡不画（`showPreview` 对 `kind !== 'note' && 'unresolved'` 直接 return），这是有意为之；但 4.1 登记的 `assertGraphKeyboardWalk` 用预览锚点框读位置，走到一个标签节点上读数会停在上一个节点 | `src/client/features/graph/graph-panel/use-graph-preview.ts`、`scripts/e2e-visual.mjs` | 低（门禁覆盖边界） | 批次 7 | 不做：4.1 边界 ② 已如实登记，且 `showTagNodes` 默认关、真实浏览器场景走不到标签节点；门禁改读 `state.nodes` 坐标属另一项 |
| F-05 | 批次 4 的四项修复（4.3 抽屉 role/焦点、4.4 色板热区、4.5 描述与取消播报）都只有 jsdom 证据：热区断言读的是类名而不是像素，播报与 role 只在假 matchMedia 下验过 | `scripts/e2e-visual.mjs`、`src/client/features/graph/graph-panel/settings*.tsx` | 中（门禁覆盖缺口，不是产品缺陷） | 批次 7 | 不做（本次）：补法是在 `e2e-visual` 的 graph 场景里开一次设置抽屉，点「添加颜色规则」后量色板 `getBoundingClientRect()` ≥ 24px，并读 `role`/`aria-modal`/`aria-describedby`；只差一个可跑的场景，不值得为它单开一个提交 |
| F-06 | `panel-throttle.test.ts` 的重试场景在 React 下发 `An update to GraphPanel inside a test was not wrapped in act(...)` | `src/client/features/graph/graph-panel/panel-throttle.test.ts` | 低（测试卫生，不是产品缺陷；该文件两条断言仍通过） | 不排期 | 不做（本次）：先证实它早于 5.1 —— 在 `ecfc3e5e`（5.1 之前）与 `eea50690` 两个 `git archive` 快照上单跑同一文件，各命中 1 次同样的警告，故非本次搜索改动引入；铁律 14 要求另开条目。补法是把重试点击之后到达的那次状态更新包进 `act`（或在用例里等到它落地再断言） |
| F-07 | 批次 5 收尾第一轮 `e2e-visual` 报 1 条看板断言失败：`surface keyboard: the kanban board hands focus back to the control it was opened from`，读数是 `{"opener":"button[全屏]","active":"body","returned":false}`（Escape 关掉全屏看板后焦点掉到 body，而不是回到打开它的「全屏」按钮）。换全新实例复跑第二轮同一条通过（690/0），本批改动面（`git diff --name-only ecfc3e5e..ae80e96f`）不含任何看板或 overlay 焦点文件 | `scripts/e2e-visual.mjs` 的逐表面焦点断言、看板覆盖层的焦点归还路径 | 中（若可复现即违反 AGENTS 可访问性 MUST「关闭后焦点归还」；单次未复现） | 不排期（图谱计划外） | 未处理（铁律 14）：复现方法是按人打开全屏看板 → 按 `Escape` → 读 `document.activeElement`，多轮 + 不同前置表面各试一次；若稳定复现，应另开独立条目按看板模块修，不在本计划夹带 |
