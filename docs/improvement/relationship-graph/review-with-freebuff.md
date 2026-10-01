# Inkstone「关系图谱」问题台账（合并版）

> **本文档的地位**：图谱模块**唯一**的问题清单。合并自三轮审查 + 一轮复核：
>
> | 来源 | 原始条目 | 本轮处置 |
> | :--- | :--- | :--- |
> | `review-with-agy-1.md`（29 项 PERF/UX/UI/SEC/SPEC/FEAT/TEST） | 29 | 逐条复核真伪 → **29 项全部关闭**（22 项完全关闭，含 FEAT-01/FEAT-05/TEST-01 等已交付项；**7 项留下残留面**，残留一律提升为新编号） |
> | `review-with-qoder-1.md`（30 项 Q-） | 30 | **1 项判定不成立、6 项前提需改写、23 项成立** → 去重后并入 |
> | `review-with-buffy-2.md`（20 项 BF-） | 20 | 全部并入（与 Q- 重叠的合并，不重复计） |
> | `verify-with-buffy-1.md`（对 Q- 的逐条复核） | — | 判定结论已并入每条的「判定」字段 |
>
> **合计**：79 条原始条目 → **去重后 48 个编号**（G-01…G-48）：✅ 成立 39 条、🟡 成立但前提需收窄 6 条、🔬 待量测 3 条；其中 3 条（G-46、G-48 与 G-43 的 ②③）不挂图谱批次。另有 **8 条已失效条目**（1 条整体不成立、7 条局部失实需改写）与 **1 组待补的度量脚本**。
> **审查基线**：分支 `improvement/relationship-graph-agy` @ `ec916280480eb06d658cd4358ace9ba23b9c2806`（三轮文档与复核都在同一棵树上，行号可直接对照）。
> **工程规范**：[`AGENTS.md`](../../../AGENTS.md)、[`ADR-0002`](../../../ADR-0002-renderer-theme-following.md)。
> **配套计划**：[`plan-with-freebuff.md`](./plan-with-freebuff.md) —— 本台账不含排期与批次，只答「问题是什么、真假、怎么改、代价多少」。

**判定图例**：✅ 成立（已回代码取证）　🟡 成立但前提需收窄/修正　🔬 待量测（结论方向对，量级未证实）　❌ 不成立

---

## 0. 本轮实测（可复现）

| 动作 | 命令 | 结果 |
| :--- | :--- | :--- |
| 图谱测试基线 | `npx vitest run src/client/features/graph tests/graph-routes.test.ts src/shared/graph-filter-expression.test.ts src/client/lib/graph-settings.test.ts` | **20 文件 / 136 用例全绿**（16.4s） |
| React 事件委派 | `grep -n "isPassiveListener\|passiveBrowserEventsSupported" node_modules/react-dom/cjs/react-dom-client.development.js` | :19251 确认 `wheel` 在 root 上以 `{ passive: true }` 注册 |
| 对比度复算 | 按 WCAG 相对亮度公式对 `TAG_FALLBACK_PALETTE` / `ORGANIZER_COLORS` 复算两套主题底色 | 与 Q-UI-01 的表一致：浅色 `#84cc16` **1.814**、`ORGANIZER_COLORS` 浅色最低 **2.70**（`#ca8a04`）、深色最低 **2.87**（`#4f46e5`） |
| 关闭态复核 | `git log`、`grep`、读源码逐条核对 agy 29 项 | 24 完全关闭 / 5 有残留（见 §1） |
| 死键复核 | 逐 key `grep` 全仓（排除 locales） | 8 个键 0 引用（含被截断的重命名事故 key） |
| 静态门禁 | `node scripts/check-size.mjs`、`node scripts/check-comments.mjs` | 全绿（1906 文件 / 12747 条注释白名单） |

**未运行**：`typecheck`、`style:check`、`build` 与三个浏览器门禁（`e2e` / `e2e-visual` / `check-contrast`）。因此本文档**不含**「门禁当前是否绿」的判断；凡「某门禁未覆盖某处」的结论均来自 `grep` 事实。

---

## 1. 已关闭项（agy 29 项）与它们的残留

> 结论：**29 项全部关闭**，代码里确实能看到修复。但其中 **7 项**在修复过程中留下了未覆盖的相邻面（SPEC-01/02/03 与 FEAT-02/03/04/05），这些残留已提升为下面的 G- 编号——**这是本轮复核的主要价值**：避免「上一轮说修好了」被当成「这块干净了」。

| 原编号 | 内容 | 关闭状态 | 残留（→ 新编号） |
| :--- | :--- | :--- | :--- |
| agy PERF-01 | 视觉参数混入查询 → 拖滑块重查并重建布局 | ✅ 完全关闭（`useGraphQueryRequest` 只列查询字段；`panel-parameter-isolation.test.ts` 钉住） | 「查询参数变化仍会重建」是**另一件事** → **G-06** |
| agy PERF-02 | `tick()` 内 `getBoundingClientRect` | ✅ 完全关闭（`renderGraphScene` 改用 `state.width/height`） | 悬停/拖拽路径仍逐事件读 rect → **G-09** |
| agy PERF-03 | 分块加载边/标签串行 `await` | ✅ 完全关闭（`db.batch`，`graph.ts:331-360`） | 批处理时移除了逐语句 `LIMIT` → **G-01**；标签边无预算 → **G-02** |
| agy PERF-04 | 未截断仍执行 `COUNT(*)` | ✅ 完全关闭（两条查询都是 `results.length <= limit` 时直接复用长度） | —— |
| agy PERF-05 | 斥力硬截断致团簇向心重叠 | ✅ 完全关闭（`Math.max(0.04, 1 - distance/2400)`；`canvas-physics.test.ts` 有专条） | —— |
| agy PERF-06 | `fitGraph` 120ms 竞态 | ✅ 完全关闭（改为 `onSettled` → 第 70 帧取景，有专条用例） | 「每次重查都重新取景」的耦合 → **G-06** |
| agy SEC-01 | 递归 CTE 环路指数膨胀 | ✅ 完全关闭（`INSTR(path, ','+id+',')` 防回环，`tests/graph-routes.test.ts` 有环用例） | —— |
| agy SEC-02 | 未解析标题无界长度 | ✅ 完全关闭（`truncateText(..., LIMITS.titleMaxLength)`） | —— |
| agy SEC-03 | 归档笔记度数泄露 / 与连线脱节 | ✅ 完全关闭（`degreeJoin` 两分支都 join `adjacent` 并校验 `is_archived = 0`） | **MCP 侧的同一条规则没同步** → **G-04** |
| agy SEC-04 | LocalStorage 偏好无租户隔离 | ✅ 完全关闭（`graphPrefsStorageKey(userId)` + 逐字段白名单/夹区间） | —— |
| agy UX-01 | 单击节点强退图谱 | ✅ 完全关闭（单击选中、双击/Enter 打开、Cmd/Ctrl+单击开次面板） | —— |
| agy UX-02 | 减少动画致布局死锁 | ✅ 完全关闭（命中时同步跑 120 步后定格，`canvas-physics.test.ts` 有专条） | —— |
| agy UX-03 | 设置抽屉 ESC 穿透 | ✅ 完全关闭（抽屉内 `useEscape`；`panel-escape-stack.test.ts`） | 抽屉其余无障碍关系 → **G-25** |
| agy UX-04 | 移动端 pinch 偏心跳变 | ✅ 完全关闭（以双指中点做仿射反补偿，`canvas.tsx:133-148`） | —— |
| agy UX-05 | 指针状态与空格/中键平移缺失 | ✅ 完全关闭（`cursorClass` 动态 + `isSpaceDownRef` + `button === 1`） | —— |
| agy UX-06 | 读屏盲区 | ✅ 完全关闭（`aria-live` 播报选中与出入度） | 说明未关联、取消选择不播报 → **G-27** |
| agy UI-01 | 画布不跟随主题 | ✅ 完全关闭（`createThemeObserver` + `canvas-theme.test.ts` 三条） | ADR 与 AGENTS.md 未同步、缺浏览器像素断言 → **G-40** |
| agy UI-02 | 悬停时邻居文字被弱化 | ✅ 完全关闭（`getConnectedNeighborIds` 喂给 `drawNodes`/`drawLabels`） | —— |
| agy UI-03 | 标签穿透线条无光晕 | ✅ 完全关闭（`strokeText` + `colors.bgBase` 光晕） | —— |
| agy UI-04 | 无图例、未设色标签单色化 | ✅ 完全关闭（`buildColorLegends` + `tagHashColor` 回退） | 回退色板是**第二套**且浅色底不达标 → **G-29** |
| agy SPEC-01 | 7–10 个位置参数 | 🟡 部分关闭：主体已改对象传参，`createGraphTicker` 仍留一个**零调用者**的位置重载 | → **G-33** |
| agy SPEC-02 | 绕过组件库裸写控件 | 🟡 部分关闭：`Segmented`/`Input`/`Button` 已换，**同一文件的原生 `input[type=range]` 漏了** | → **G-32** |
| agy SPEC-03 | i18n 拼接句子 | 🟡 部分关闭：`stats_summary`/`direction_counts` 已替换 | 拼接时代的 8 个死键仍在 → **G-34** |
| agy FEAT-01 | 悬停预览卡 | ✅ 交付（`useGraphNodePreview` + `WikiLinkHoverCard`） | 拖拽时锚点不跟随 → **G-16**；`isDark` 陈旧 → **G-31** |
| agy FEAT-02 | 伴随式局部图谱 | 🟡 交付但留缺口：面板存在（`workspace-views.tsx:300`） | 不复用用户偏好 → **G-20**；无深度/上限入口 → **G-21** |
| agy FEAT-03 | 标签作为拓扑节点 | 🟡 交付但留缺口（`applyTagNodes`） | 边无预算 → **G-02**；读屏不可辨 → **G-24**；截断读数把标签算成「篇」 → **G-38** |
| agy FEAT-04 | 排除语法 + 颜色规则 | 🟡 交付但只做了一半：过滤语法（`tag:`/`path:`/`-`）与颜色规则已完成 | **单篇「从图谱排除」没做** → **G-42**；边类型与附件 → **G-43** |
| agy FEAT-05 | pin + 导出 | 🟡 交付但留缺口（右键 pin、PNG/SVG 导出均在） | pin 与坐标不跨查询存活 → **G-07**；导出无选项 → **G-45** |
| agy TEST-01 | 图谱测试补齐 | ✅ 完全关闭（21 文件 / 145 用例，本轮复跑 20 文件 / 136 用例全绿） | 四类「用户跨步意图」断言仍缺 → **G-41** |

---

## 2. 已失效条目（不成立或前提被证伪）

> 这些条目**不要**按原文执行。其中 **1 条整体不成立（Q-UX-02）**，其余 7 条是局部失实或前提需改写（证据错、口径错）。

| 原编号 | 原文主张 | 失效原因（本轮取证） | 处置 |
| :--- | :--- | :--- | :--- |
| **Q-UX-02** | 局部图谱「以此笔记为中心」是可见、可点、**无效果**的死菜单项，应按缺省不渲染删掉 | 该项 `onSelect` 先 `void onOpenNote(node.id)`，而伴随图谱的 `noteId` 就是当前活动笔记（`workspace-views.tsx:300-303`）；`openNote` 默认 `activate: true`（`store/notes/open.ts:58-65`）→ 活动笔记变为被点节点 → 面板以新 id 重查。**功能是可达的**，机制是「打开笔记换中心」而非「切换模式」；`onMakeLocal={() => {}}` 是代码异味 | **❌ 不成立，撤下**。删除该项会让伴随图谱**永久失去**这个入口（它没有全屏面板的 scope 分段控件）。若要消除异味，判据应改成「看 `mode`」：`mode === 'local'` 时不渲染该项，而不是「看回调是否存在」 |
| Q-FEAT-04（一半） | 「附件、**嵌入**在图谱上完全空白」 | `WIKI_RE`（`shared/markdown-utils/wiki.ts:4`）= `/\[\[([^[\]\|\n]{1,400})…\]\]/g` 会匹配 `![[X]]` 中的 `[[X]]`，`extractWikiLinks` 据此写 `links` 行 → **嵌入已经作为普通边进图**。只有附件走另一条路（`extractAttachmentIds` / `ATTACHMENT_REFERENCE_RE`，`wiki.ts:30-36`），不进 `links`。`links` 表也**没有类型列**（`db/schema/tables.ts:72-79`） | 🟡 改写为「嵌入有边但类型不可辨；附件完全不可见」→ 并入 **G-42**，并把量级从「登记项」提升为「持久化契约变更」 |
| Q-PERF-04（部分） | `toWorld` 的 `canvasRef.current!`「在 Q-PERF-01 造成的卸载瞬间会抛 `TypeError`」 | 指针事件绑定在画布元素上，元素卸载后不再派发该元素的事件；`!` 是防御性写法，无已知复现路径 | 🟡 保留 rect 缓存部分（**G-09**），`!` 降级为「顺带修的防御写法」 |
| Q-PERF-03（数字） | 「30 次同步写 + 30 次物理唤醒 × 90 帧」 | `useDynamicGraphPrefs` 是 `state.frame = Math.min(state.frame, 270)`；rAF 本来就持续运行，该赋值只把**剩余**帧拉回 ≤270，不是每次新增 90 帧 | 🟡 结论不变（**G-11**），量化改为「每次 input 事件一次同步 `localStorage` 写 + 一次物理唤醒」 |
| Q-A11Y-04（一半） | 色板 `aria-label={color}`（hex 名）与 `aria-pressed` 是图谱的缺陷 | **这是全仓既有约定**：`tags/tag-color-submenu.tsx:31`、`tags/tag-manager-row.tsx:177-180`、`folders/folder-color-submenu.tsx:42`、`folders/manage-folders-modal/pickers.tsx:63-66` 四处完全同款 | 🟡 拆开：热区（图谱 `size-5`=20px，既有实现是 `size-6`/`size-7`）留给 **G-26**；色名与单选语义升级为**跨模块**事项 **G-46**（不挂在图谱批次） |
| Q-SPEC-03（证据） | 「位置形态仅 `canvas-physics.test.ts` 在用」 | grep 全部调用点（`canvas.tsx:83`、`canvas-draw.test.ts:172/201/248`、`canvas-physics.test.ts:94`）**全是对象形态** → 位置重载是**零调用者的纯死代码**（比原主张更死）。但同条要删的 `'current' in colorsRef/prefsRef` **是活的**：`canvas-physics.test.ts:90-91` 传的是朴素 `readThemeColors()` / `DEFAULT_PREFERENCES` | 🟡 → **G-33**，且必须拆成两步（先删重载，再在测试改传 `{ current }` 后删 `'current' in`），否则会打断两个测试文件 |
| Q-SPEC-04（行号） | 死键行号写成 `zh-CN/graph.ts:6,12,13,14,21,31,60,71` | :21 是 `graph_canvas_accessible`（**活键**，`canvas.tsx:220` 与 `canvas-a11y.test.ts:61` 在用），漏了真正的死键 :35（`graph.open_a_note_from_the_graph`） | 🟡 键表本身正确、行号串更正为 `6,12,13,14,31,35,60,71` → **G-34** |
| Q-SEC-02（口径） | 「把标签节点与**未创建笔记**计入篇」 | 未创建节点计「篇」与全应用一致（`graph.stats_unresolved` 就写「{count} 篇未创建」） | 🟡 收窄为「开启标签节点后，60 个标签被读成 60 篇」→ **G-38** |

---

## 3. 开放条目台账（44 条）

### 3.1 安全、隐私与成本边界（5 条）

#### G-01 边查询移除了逐语句 `LIMIT`，一页笔记的**全部**出链先入内存再截断
- **判定**：✅ 成立（BF-03 独有）
- **来源**：BF-03；残留自 agy PERF-03 的修复
- **证据**：`worker/routes/search/graph.ts:331-336` 的两条分块语句已无 `LIMIT`，注释说明「上限改在构图时按整页施加」；而 `buildGraphEdges` 的 `slice(0, GRAPH_EDGE_CANDIDATE_LIMIT = 10_000)`（`routes/search/helpers.ts:7`）发生在**所有分块结果合并之后**。一页 350 篇笔记 × 每篇数百出链 = 数万行跨 D1 边界搬进 Worker 内存
- **方案**：① 分块循环累计行数，达到 `GRAPH_EDGE_CANDIDATE_LIMIT` 即停止追加后续语句并置 `truncated`（保住「跨分块不漏边」的语义）；② 给每条语句加 `LIMIT (chunk.length × 每篇上限 + 1)`（MCP 侧 `loadMcpLinkEdges` 已用此形状）；③ 断言截断的确定性（`linkRows.sort` 已按 `(source, target_key)` 排序，正好可用）
- **范围**：`worker/routes/search/graph.ts`、`tests/graph-routes.test.ts`
- **代价**：**S**（≤1 人日）
- **建议**：与 G-03 同批（同属「端点成本」）；本条把「一个请求读多少」从「取决于库多大」变成「有明确上界」

#### G-02 标签边绕过边预算：`applyTagNodes` 无上限 push
- **判定**：✅ 成立（Q-PERF-02，理论 21,000 条）
- **来源**：Q-PERF-02；残留自 agy FEAT-03
- **证据**：`shared/graph-tag-nodes.ts:46-61` 只限簇数（`GRAPH_TAG_NODE_LIMIT = 60`），对每个簇的**每个成员**无条件 `edges.push`；调用点 `graph.ts:433` 晚于 `:384` 的 10k 截断。同时节点数也突破 `limit`（350 + 60 = 410）
- **方案**：① 新增 `GRAPH_TAG_EDGE_LIMIT`，按簇大小降序分配边预算，超预算的簇降级为「不展开」；② `truncated` 与 `meta.totalEdges` 在标签边落定后判定；③ 断言 `tagNodes=1` 时 `edges.length` 落在预算内
- **范围**：`shared/graph-tag-nodes.ts`（Worker 与 demo 共用，改一处两端同步）、`routes/search/graph.ts`、`tests/graph-routes.test.ts`
- **代价**：**S**（≤1 人日）。注意测试 `graph-routes.test.ts:329-401` 已造出 61 笔记 × 61 标签的场景，加一条边数断言即可
- **建议**：默认关闭（`showTagNodes: false`）降低了触发概率，但踩到的是「界面卡死」而非「功能不可用」；与 G-01 分开提交（一个是 SQL、一个是共享函数）

#### G-03 图谱读请求：客户端无超时、服务端无节流
- **判定**：✅ 成立（Q-SEC-01）
- **来源**：Q-SEC-01
- **证据**：`lib/api/vault.ts:54-68` 的 `api.graph` 只传 `{ signal }`，而同文件 `:69-73` 的 `sync` 带 `timeoutMs: 30_000`；`routes/search/graph.ts:88` 的 `searchRoutes.get('/graph', requireAuth, graphHandler)` 无任何节流中间件。仓库里 `reindex`（`routes/search/reindex.ts:33-55`）、分享读预算、看板、音乐上传都有 `consumeAttemptBudget`，图谱没有
- **方案**：① `api.graph` 加 `{ timeoutMs: 15_000 }`；② 给 `GET /graph` 挂按用户维度的读预算，照抄 `reindex` 的 `consumeAttemptBudget + ThrottleError → ApiError(429, 'too_many_attempts', …, { retryAfter })` 形状；③ 前端把 429 接进既有错误三态
- **范围**：`lib/api/vault.ts`、`routes/search/graph.ts`、前端错误提示；`tests/graph-routes.test.ts`
- **代价**：**S**（≤0.5 人日 + 用例）。注意 `consumeAttemptBudget` 是 D1 递增预算、**每个读请求多一次 D1 写**，与 G-10 的减负方向相反——若 G-10 采纳物化方案，本条只保留客户端超时
- **建议**：自伤型成本风险（非越权），优先级低于 G-01/G-02，但客户端超时是零成本的一行

#### G-04 MCP 图谱与 UI 图谱口径分叉：归档笔记的处理不一致
- **判定**：✅ 成立（BF-10 独有）
- **来源**：BF-10；残留自 agy SEC-03
- **证据**：`worker/mcp/library/graph.ts:21` 只过滤 `deleted_at IS NULL`，**没有 `is_archived = 0`**；UI 侧的 `filters`（`routes/search/graph.ts:162`）与 `degreeJoin` 都排除归档。于是同一个库，「关系图谱」看不到归档笔记，而 MCP 工具 `explore_note_graph`（`mcp/server/assets.ts:20`）会把归档笔记连同标题与摘要一起返回
- **方案**：① 立刻给 `loadMcpNotesByIds` 补 `AND is_archived = 0`，并在工具 description 写明「不含归档与已删除」；② 短期把「哪些笔记参与图谱」抽成共享判定（如 `src/shared/graph-scope.ts` 导出 SQL 片段，两处引用），共享的是**范围**而不是整个遍历；③ 不合并两套遍历实现（形状差异大：BFS+摘要 vs 聚合+合成节点）
- **范围**：`mcp/library/graph.ts`、可选新增 `shared/graph-scope.ts`、`routes/search/graph.ts`；MCP 与路由两侧用例
- **代价**：①**XS**（0.2 人日）；②**M**（1 人日，跨层契约需走 `src/shared` 公开入口）
- **建议**：①属于口径修正，应单独提交；②在 MCP 侧下次改动图谱时做

#### G-05 导出把笔记标题写进文件，且没有「不含标题」选项
- **判定**：✅ 成立（BF-19 子项）
- **来源**：BF-19
- **证据**：`graph-export.ts` 的 SVG/PNG 都会绘制 `graphNodeLabel(node)`（即笔记标题）；`runGraphExport` 无任何开关；文件名固定 `graph-<mode>.<ext>`
- **方案**：导出面板加「不含标题」「背景透明/纯色」两个开关（`prefs` 里新增两个布尔项即可，绘制路径已按 `prefs.labels` 分支）
- **范围**：`graph-export.ts`、`use-graph-export.ts`、`lib/graph-settings.ts`、locales
- **代价**：**S**（0.5 人日）
- **建议**：导出的 PNG 常被贴到外部，标题即笔记名——这条同时是隐私项，建议与 G-44 合并做

### 3.2 渲染连续性与性能（8 条）

#### G-06 查询条件一变就重建整块画布、坐标清零、相机重取景 ★
- **判定**：✅ 成立（Q-PERF-01 = BF-01，两份独立取证一致）
- **来源**：Q-PERF-01 / BF-01
- **证据**：链路为 `index.tsx:88,94` 无条件 `setData(null)` → `GraphBody:229` 用 `LoadingBlock` **替代** children → `canvas.tsx:98` 的 effect 依赖含 `data`，cleanup 拆掉 rAF 与 `ResizeObserver`/`MutationObserver` → 响应到达后重新挂载 → `buildInitialLayout`（`canvas-draw.ts:259-272`）按 `index * 2.399963` 重铺螺旋线 → 第 70 帧 `onSettled: fitGraph`（`canvas-draw.ts:246`）再取景一次。另：`createCanvasResizer` 的 `if (!state.offsetX && !state.offsetY)`（`canvas-draw.ts:321`）在复用时为假，**旧相机被套到一套全新坐标上**。触发面：搜索框每个停顿（220ms 防抖）、文件夹/标签/深度/孤立/未创建/标签节点六个开关、重试按钮、局部图谱切笔记
- **方案**：① `buildInitialLayout(data, prefs, state, previous?)` 用旧 `state` 按 id 建 Map，命中则沿用 `x/y/vx/vy/pinned`，未命中才螺线播种；② `GraphBody` 只在**首次加载**与硬错误时替换内容，刷新中保留画布并在角落挂 `role='status'` 指示器；③ `useGraphCanvasLoop` 依赖从 `data` 收敛，数据变更走显式 `applyData()` 通道；④ `fitGraph` 只在首次载入、节点集合实质变化、用户按 Fit/Home 时执行
- **范围**：`graph-panel/index.tsx`、`canvas.tsx`、`canvas-draw.ts`、`canvas-hooks.tsx`；`canvas-physics.test.ts`、`panel-parameter-isolation.test.ts` 扩展
- **代价**：**M**（1.5–2 人日 + 0.5 人日测试）。风险：继承坐标会让被过滤掉的节点留下空洞，需要一条「松弛策略」断言
- **建议**：**全表第一优先**。它是「图会不会被用户驯服」的根源项，也是 G-07 的上游；O(n²) 物理的重复次数也随它一起下降

#### G-07 `pinned` 与节点坐标不跨查询存活（`pinned` 不在共享契约里）
- **判定**：✅ 成立（Q-FEAT-01）
- **来源**：Q-FEAT-01 + BF-19 子项；残留自 agy FEAT-05
- **证据**：`graph-panel/types.ts:12` 的 `pinned?: boolean` 只在画布副本上；`shared/types/graph.ts` 的 `GraphNode` **没有该字段**；`buildInitialLayout` 每次 `data.nodes.map` 重建；`canvas.tsx:335-337` 的 `onTogglePin` 只改画布对象。用户流程：摆好图 → 固定 3 个枢纽 → 搜一个字 → pin 与全部坐标回到螺线
- **方案**：① 步骤 1 与 G-06 **同批**（继承坐标即顺带保住 pin，约 12 行，不动契约）；② 步骤 2：`pinned` 提升为 `GraphPreferences.pinnedNodeIds: string[]`，`loadPreferences` 按 `/^[0-9a-hjkmnp-tv-z]{26}$|^tag:.+$/` 白名单逐项校验，实现跨会话持久
- **范围**：`canvas-draw.ts`、`types.ts`、`shared/types/graph.ts`（步骤 2 才动）、`helpers.ts`、`canvas.tsx`
- **代价**：步骤 1 **XS**（随 G-06）；步骤 2 **S**（0.5 人日）
- **建议**：步骤 2 排在 G-22（键盘入口）之后——键盘入口不修，pin 对键盘用户仍不可达

#### G-08 布局期物理与绘制没有帧预算
- **判定**：🔬 待量测（方向确定，具体帧成本需实测）
- **来源**：BF-02 独有
- **证据**：`applyRepulsion`（`canvas-draw.ts:23-46`）是纯 O(n²) 两两循环 → 350 节点 6.1 万对/帧、600 节点 18 万对/帧；`renderGraphScene`（`:190-215`）每帧重画全部边（每条边 `stroke` + 箭头 `fill` 两次绘制）、全部节点（1–3 个 arc）、每个可见标签 **两次**文本绘制（`strokeText` 光晕 + `fillText`）；`PHYSICS_FRAME_LIMIT = 360`（上限 410 节点 ≈ 1.4M 次绘制调用/次布局）。绘制之外，`drawLabels` 还每帧调 `graphLabelVisible` / `graphNodeLabel`，`renderGraphScene` 每帧调 `getConnectedNeighborIds`（新建 Set）
- **方案（按性价比，不必全做）**：① 物理每 2 帧跑一次（视觉几乎无差别，斥力成本减半）；② 节点数 > N 时只给选中/悬停/邻居标签画光晕；③ 远端团簇（`distance > 1800` 且无共同邻居）跳过该对——须保留一条「远端团簇仍分开」的断言（守住 agy PERF-05）；④ **不建议**上 Barnes-Hut（上限 410 时收益不抵复杂度）
- **范围**：`canvas-draw.ts`、`constants.ts`、`canvas-physics.test.ts`
- **代价**：①**XS**、②**S**；④**不做**
- **建议**：**先量再改**——仓库已有 `scripts/measure-preflight.mjs` / `measure-kanban.mjs` / `measure-music.mjs` 的手动验收脚本惯例，图谱缺一个（见 §5 的待补脚本）。用真实帧数据决定 ①② 是否值得做

#### G-09 `toWorld` 逐 pointermove 强制同步布局
- **判定**：🟡 成立（rect 部分），`!` 抛错部分**未证实**
- **来源**：Q-PERF-04（修正后）
- **证据**：`canvas-hooks.tsx:53-57` 的 `toWorld` 用 `canvasRef.current!.getBoundingClientRect()`；`moveDrag` 每个 pointermove 都调它（`canvas-hooks.tsx:171`）。拖动时还有 `setHover` → React 状态更新 → DOM 变化，下一次 pointermove 的 gBCR 便会强制一次样式/布局重算
- **方案**：rect 缓存进 `CanvasState`（`viewLeft`/`viewTop`），由既有 `createCanvasResizer` 回调失效重取；`toWorld` 内把非空断言换成判空早返回（防御性写法，顺带修）
- **范围**：`canvas-hooks.tsx`、`types.ts`、`canvas-draw.ts`（resizer 回调）
- **代价**：**XS**（0.3 人日）

#### G-10 全局图谱每次请求对该用户全量 `links` 做 degree 聚合
- **判定**：🔬 事实成立、影响待量测（Q-PERF-05）
- **来源**：Q-PERF-05
- **证据**：`degreeJoin`（`routes/search/graph.ts:63-82`）的两个分支都在该用户**全部** links 上聚合，且因 `ORDER BY COALESCE(d.degree,0) DESC` 无法下推 LIMIT；`runGlobalGraphQuery` 每次请求都带它。`idx_links_user_source` / `idx_links_user_target` 存在，所以是「该用户全部链接」而非全表扫描
- **方案**：择一——**A 物化**：`notes` 加 `link_degree`/`in_degree`/`out_degree` 由写入路径维护（属持久化契约变更，须 expand-contract + `check-migration-immutability` + `tests/schema-migrations.test.ts`，部署前先备份）；**B 请求内 memo + 短缓存**（`Cache-Control: private, max-age=5` 需为 API 的 `no-store` 开例外并注明理由）
- **范围**：`routes/search/graph.ts`、`worker/db/writes.ts`（A 方案）、`middleware/security-headers.ts`（B 方案）
- **代价**：**M**（1–2 人日）；B 方案不得引入 Worker 模块级可变状态（`module-state:check`）
- **建议**：**先量**（`EXPLAIN QUERY PLAN` + 大库样本）。若实测无压力则撤销或降级——不要为一个未证实的问题做持久化契约变更

#### G-11 力滑块每个 `input` 事件同步写 localStorage 并唤醒物理
- **判定**：🟡 成立（量化收窄）
- **来源**：Q-PERF-03（数字修正后）
- **证据**：`index.tsx:34-40` 每次 prefs 变化同步 `localStorage.setItem(..., JSON.stringify(prefs))`（`catch` 有注释但无日志，属铁律 2 的 best-effort 例外形式，缺最低级别日志）；`settings.tsx:115` 是原生 `onChange`（步长 50 拉满 300→1800 约 30 次）；`canvas-hooks.tsx:70-76` 每次 `repulsion`/`linkDistance` 变化即 `state.frame = Math.min(state.frame, 270)` + schedule
- **方案**：① 滑块值先落组件本地 state 做即时反馈，`onPointerUp`/rAF 边界提交进 `prefs`；② `localStorage` 写入 debounce 300ms 并移出渲染路径；③ `catch` 内补 `console.warn`（保留既有注释）
- **范围**：`settings.tsx`、`index.tsx`、`canvas-hooks.tsx`
- **代价**：**S**（0.5 人日）
- **建议**：与 G-31（换用 `Slider`）合并为一次提交——两处改的是同一个 `GraphRange` 组件

#### G-12 每帧读 `--font-ui`
- **判定**：✅ 成立（低危）
- **来源**：BF-13 独有
- **证据**：`canvas-draw.ts:211` 每帧 `style.getPropertyValue('--font-ui')`，`style` 是 effect 首帧取到的 computed style
- **方案**：把它并入「由主题/字体变更观察器刷新的引用」（现有 `createThemeObserver` 扩一个观察对象），或保留每帧读但**写明理由**（它正是「换字体后自愈」的机制）。若改缓存，必须补一条「换 UI 字体后画布文字用新字体」的用例
- **范围**：`canvas-draw.ts`、`canvas.tsx`
- **代价**：**XS**（0.3 人日）
- **建议**：**不要**简单 `useMemo` 缓存——那正是 ADR-0002 警告的「把主题/字体冻在创建时刻」

#### G-13 绘制路径无错误边界，异常即永久停帧
- **判定**：✅ 成立（BF-17 独有）
- **来源**：BF-17
- **证据**：`renderGraphScene` 在 rAF 回调里执行（`canvas-draw.ts:216-253`），无 try/catch；异常会让 `state.raf` 停在非 0，`schedule()` 之后永远认为「已有一帧在跑」→ 整张图谱静止且无日志。导出路径反而有 try/catch + toast（`use-graph-export.ts:23`）
- **方案**：`tick()` 内 try/catch：`console.error('[inkstone] graph paint failed', error)`（带 message、不带数据，铁律 2）、复位 `state.raf = 0`、停止循环，并经可选 `onPaintError` 让面板显示 `Empty` + 重试（复用 `graph.could_not_load_graph` 文案）
- **范围**：`canvas-draw.ts`、`canvas.tsx`；`canvas-draw.test.ts`（上下文替身已可注入抛错）
- **代价**：**XS**（0.5 人日）

### 3.3 交互与体验（8 条）

#### G-14 搜索是「重新查询」而非「定位」，且图例不可交互
- **判定**：✅ 成立（Q-FEAT-03 + BF-07）
- **来源**：Q-FEAT-03 / BF-07
- **证据**：`q` 进查询串（`index.tsx:63-80`）→ 服务端过滤 → 命中留下的同时**边一起消失**（上下文丢失）；配合 G-06 即「输入 → 白屏 → 重排 → fit」。`ColorLegend`（`graph-overlays.tsx:54`）是 `pointer-events-none`，既不能点击高亮某组也无法键盘访问
- **方案**：① 引入「变暗模式」：命中集合在客户端算（复用已有 `graphFilterMatches`），未命中节点/边降透明度，**不发起请求**（因此绕开 G-06）；② 保留服务端过滤作为「仅显示匹配」开关（默认关）；③ 命中数 > 0 时提供「跳到第一个命中」（顺带解决上限内找不到目标）；④ 图例改为可聚焦的 `button`，支持「点击高亮 / 双击过滤」
- **范围**：`index.tsx`、`canvas-draw.ts`（dim 集合入参）、`helpers.ts`、`graph-overlays.tsx`、locales
- **代价**：**M**（2–3 人日）
- **建议**：与 G-06 合并成一个「图谱检索语义升级」批次，一次把 dim 集合与坐标继承都做掉（避免两次改同一段渲染管线）

#### G-15 筛选致空时提示「还没有可以画的东西」，且没有清除出口
- **判定**：✅ 成立（Q-UX-01）
- **来源**：Q-UX-01
- **证据**：`index.tsx:238-245`：`loadError` 有「重试」action，而 `data.nodes.length === 0` 一律走 `graph.nothing_to_graph_yet`（「用 [[双链]] 把笔记连起来…」）且**无 action**。用户输入 `tag:不存在` 得到的是空库文案
- **方案**：按 `query || prefs.tag || prefs.folderId || selectedTags.length` 分流到「没有匹配的笔记」+ 一个清空全部筛选的 `Button`；新增 2 个 locale key × 2 语言（不拼接句子）
- **范围**：`index.tsx`、locales
- **代价**：**XS**（0.3 人日）

#### G-16 拖拽节点时预览卡不跟随、也不隐藏
- **判定**：✅ 成立（BF-04 独有）
- **来源**：BF-04
- **证据**：`canvas.tsx:325` 的 `onDragStart` 关掉预览卡，但同一个 tick 里 `beginDrag` 又调 `onSelectNode?.(node)`（`canvas-hooks.tsx:163`）→ `showPreview` 用**当时**的坐标重算锚点并重新打开；拖动中锚点不再更新；松手时位移 ≥ 5px 直接 return（`canvas-hooks.tsx:135`），也不重锚。于是卡片停在被按下时的位置，直到鼠标移到别的节点
- **方案**：`applyDragMove` 在节点位移超过 4px 时 `preview.closePreview()`，松手后重新 `showPreview`（拖动**期间**不该有悬浮卡）
- **范围**：`canvas-hooks.tsx`、`canvas.tsx`、`use-graph-preview.ts`；`canvas-selection-loop.test.ts`
- **代价**：**XS**（0.3 人日）

#### G-17 滚轮缩放的 `preventDefault` 是空调用
- **判定**：✅ 成立（BF-05 独有）
- **来源**：BF-05
- **证据**：`canvas.tsx:167` 在 React `onWheel`（`:246`）里 `event.preventDefault()`；React 19 把 `wheel` 绑定在 root 且声明 `{ passive: true }`（已在 `react-dom-client.development.js:19251` 核实），因此该调用无效并会在 Chrome 打印 "Unable to preventDefault inside passive event listener"。当前因 `useLockScroll` 锁了 body、画布也不是滚动容器，**没有可见副作用**
- **方案**：仿仓库既有做法（`features/preview/lightbox.tsx:32` 的 `window.addEventListener('wheel', …, { passive: false })`）在画布容器上注册非 passive 原生监听；或至少给面板加 `overscroll-behavior: none` 并去掉误导性的 `preventDefault`
- **范围**：`canvas.tsx`
- **代价**：**XS**（0.3 人日）
- **建议**：低危但值得修——一旦图谱被嵌进可滚动容器（伴随面板进侧栏滚动区就是这种情形），它会真的带着页面滚

#### G-18 窄屏图例与节点详情徽标落在同一水平带
- **判定**：✅ 成立（Q-UX-03，几何可算）
- **来源**：Q-UX-03
- **证据**：`graph-overlays.tsx:42`（徽标 `bottom-4 left-1/2 max-w-[80vw]`）与 `:54`（图例 `bottom-4 left-4 max-w-56`）同为 `bottom-4`；375px 下图例占 16→240，徽标居中占 ≈37→337，必然相交。图例只在 `groupBy`/颜色规则/标签节点启用时出现
- **方案**：图例存在时徽标下移一档（如 `bottom-14`），或图例改右上与 `TruncatedBadge` 错开；断点用既有令牌，不散写视觉字面量
- **范围**：`graph-overlays.tsx`
- **代价**：**XS**（0.2 人日）

#### G-19 窄屏的交互提示完全缺席，且「右键」在触屏上没有等价说明
- **判定**：✅ 成立（Q-UX-04）
- **来源**：Q-UX-04
- **证据**：`graph-overlays.tsx:90` 的提示层是 `hidden … md:block`（窄屏整体藏掉）；`graph.interaction_hint` 含「右键查看更多」，而触屏对应长按（`onContextMenu` 在移动端由长按触发，**能力存在但无处说明**）
- **方案**：窄屏改为可折叠的一行简版提示，或首次进入时一次性 `role='status'` 播报；文案按 `pointer: coarse` 分流（触屏写「长按查看更多」）
- **范围**：`graph-overlays.tsx`、locales
- **代价**：**S**（0.5 人日）

#### G-20 伴随式局部图谱不复用用户偏好
- **判定**：✅ 成立（BF-08 独有）
- **来源**：BF-08；残留自 agy FEAT-02
- **证据**：`local-graph.tsx:113` 用 `{ ...DEFAULT_PREFERENCES, mode: 'local' }` 作为画布偏好，请求写死 `depth: 1, limit: 100, includeOrphans: true, includeUnresolved: true`（`:74-82`）。用户在设置里关掉「显示未创建笔记」/箭头/标题、设 depth=3、配颜色规则，**全屏图谱生效、伴随图谱不生效**；伴随面板也没有任何设置入口
- **方案**：把 `index.tsx` 里的 `useGraphPrefs` 提升为共享 hook 供两处使用；伴随面板只覆写 `mode: 'local'` 与自己的深度（默认取用户值，下限 1），并在头部加一个「打开图谱设置」入口
- **范围**：`index.tsx`、`local-graph.tsx`、`local-graph.test.ts`
- **代价**：**S**（1 人日）。注意两处写同一 localStorage key 的竞态：建议只在全屏面板持久化、伴随面板只读，并把该策略写进注释
- **建议**：顺手让伴随面板的 `createNote` 与全屏面板的 `{{folder}}` 语义一致

#### G-21 节点上限与局部深度不可调（服务端能力被界面埋掉）
- **判定**：✅ 成立（Q-FEAT-02）
- **来源**：Q-FEAT-02；残留自 agy FEAT-02
- **证据**：`index.tsx:78` 永远发 `limit: 350`，服务端允许到 600（`clampInt(…, 50, 600, 350)`）；`local-graph.tsx` 写死 `depth: 1`；设置里的 depth 选择器只在 `prefs.mode === 'local'` 时渲染，而伴随面板没有设置入口。超过上限只显示「Showing X of Y」徽标
- **方案**：① `limit` 提为 prefs 项 + `Slider`（界值与服务端 `clampInt` 共享常量，避免 G-31 式的两处定义）；② 伴随面板补深度切换（至少 1/2 两档）；③ 若上界突破 600，同步把 `canvas-hooks.tsx:41` 的 `Math.min(...xs)` 改循环求极值（当前不溢出的前提只是服务端 clamp）
- **范围**：`index.tsx`、`local-graph.tsx`、`settings.tsx`、`lib/graph-settings.ts`、`routes/search/graph.ts`
- **代价**：**S**（1 人日）

### 3.4 无障碍（7 条）

#### G-22 节点上下文菜单只有右键可达，四个功能对键盘不存在 ★
- **判定**：✅ 成立（Q-A11Y-01；WCAG 2.1.1 Level A）
- **来源**：Q-A11Y-01
- **证据**：全目录唯一的 `setContext` 调用点是 `canvas.tsx:240` 的 `onContextMenu`；`handleCanvasKeyDown`（`:171-207`）只有空格/`+ -`/`Home`/`Enter`/方向键，**没有任何键映射到菜单**。菜单独占：固定节点、按标签筛选、右侧打开、以此笔记为中心。画布自己的 `aria-label`（`graph_canvas_accessible`）也确实没提菜单——它如实描述了一个不完整的键盘契约。axe 结构上查不出「功能只有指针能触发」
- **方案**：`handleCanvasKeyDown` 增 `ContextMenu` 键与 `Shift+F10` 分支，复用 `use-graph-preview.ts` 的 `computeAnchor` 把选中节点换算成屏幕锚点后 `setContext`；无选中时不打开空菜单；同步更新 `graph_canvas_accessible` 文案，把「菜单键/Shift+F10 打开节点操作」写进对外承诺
- **范围**：`canvas.tsx`、`canvas-hooks.tsx`、`use-graph-preview.ts`、locales；`canvas-a11y.test.ts`（先补必红用例）
- **代价**：**S**（0.5 人日 + 用例）
- **建议**：**全表第一优先之一**。它是 G-07 步骤 2 与 G-24 的前置——不修这个，pin 与「按标签筛选」对键盘用户等于不存在

#### G-23 方向键按数组序跳跃、冷启动跳过首节点、选中节点可能不在视口
- **判定**：✅ 成立（Q-A11Y-02 + BF-12 前半）
- **来源**：Q-A11Y-02 / BF-12
- **证据**：`canvas.tsx:198-204` 用 `state.nodes[(current + step + n) % n]`，而 `state.nodes` 的顺序是服务端 `degree DESC, updated_at DESC, id ASC` + 标签簇追加，**与画布空间位置无关**；`Math.max(0, findIndex(...))` 让无选中时第一次按 `→` 落到 `nodes[1]`（第一个节点要用 `←` 才能到），且该行为已被 `canvas-a11y.test.ts` 固化成断言；全程没有相机跟随，选中节点可能在视口外
- **方案**：① 提纯函数 `pickNeighborInDirection(nodes, fromIndex, direction)`（从当前 `x/y` 出发，在指定半平面取角度加权距离最小者，约 15 行、可单测）；② 选中变化时若节点在视口外则平移相机（复用 `useGraphFit` 的偏移数学）；③ 无选中时 `→` 取 `nodes[0]`、`←` 取最后一个（**同步改那条既有断言**）
- **范围**：`canvas.tsx`、`canvas-hooks.tsx`、`canvas-a11y.test.ts`
- **代价**：**S**（0.5–1 人日）

#### G-24 标签节点与笔记节点对读屏不可辨，`Enter` 落在标签节点上静默无效
- **判定**：✅ 成立（Q-A11Y-05 + BF-12 后半）
- **来源**：Q-A11Y-05 / BF-12
- **证据**：`canvas.tsx:275` 的播报只有 title + 出入度，**没有 kind**；`#` 前缀只出现在绘制文字里（`helpers.ts` 的 `graphNodeLabel`）。Enter 分支只处理 note/unresolved，tag 走到函数末尾无操作。现成的 `graph.tag_node` key（zh:71）**0 引用**，显然当初就是为这件事准备的
- **方案**：播报里带 kind（复用 `graph.tag_node`）；标签节点的 `Enter` 改绑「按标签筛选」（与 G-22 的菜单入口同源）
- **范围**：`canvas.tsx`、`canvas-a11y.test.ts`
- **代价**：**XS**（0.3 人日）
- **建议**：依赖 G-22；`graph.tag_node` 因此必须保留（G-34 清理时注意）

#### G-25 设置抽屉的四项无障碍关系缺失
- **判定**：✅ 成立（Q-A11Y-03，四条子主张全部取证）
- **来源**：Q-A11Y-03
- **证据**：① `index.tsx:189` 声明 `aria-haspopup='dialog'` 与 `aria-expanded` 但**无 `aria-controls`**；② 桌面端 `aside` 是 `md:static` 的独立一列（**不是 dialog**），`aria-haspopup='dialog'` 是错误声明；③ `settings.tsx:96-107` 的 `hintId` 只挂在提示图标上，`Switch` 无 `aria-describedby` 指向它（纯装饰）；④ 开合无焦点迁移（只有 `useEscape`）；⑤ `settings.tsx:35` 的遮罩是裸 `<div onClick>`（铁律 10，缓解项：ESC 与关闭按钮均可用且 `aria-hidden`）
- **方案**：`aside` 加 `id` + `role='region'`（移动端条件改 `role='dialog' aria-modal='true'`）；触发器加 `aria-controls`，桌面端撤下 `aria-haspopup`；`Switch` 接 `aria-describedby`；开合各补一次焦点迁移；移动端遮罩走既有 Overlay 语义
- **范围**：`settings.tsx`、`index.tsx`；`panel-disclosure-state.test.ts` 扩展
- **代价**：**S**（0.5 人日）

#### G-26 颜色规则色板热区 20px（小于全仓既有实现）
- **判定**：🟡 成立（仅热区；色名与语义见 G-46）
- **来源**：Q-A11Y-04（修正后）
- **证据**：`settings-color-rules.tsx:77-84` 是 `size-5`（20px）；全仓同类控件为 `size-6`（24px，`tag-manager-row.tsx`、`folder-color-submenu.tsx`、`folders/manage-folders-modal/pickers.tsx`）与 `size-7`（28px，`tag-color-submenu.tsx`）
- **方案**：升到 `size-6`，或保持视觉尺寸而用 padding 扩大命中面积
- **范围**：`settings-color-rules.tsx`
- **代价**：**XS**（0.1 人日）

#### G-27 画布的交互说明未与控件关联，取消选择不播报
- **判定**：✅ 成立（BF-16 独有）
- **来源**：BF-16；残留自 agy UX-06
- **证据**：`canvas.tsx:220` 的 canvas 有 `role='application'` + `aria-label`，但 `graph.interaction_hint` 的视觉提示（`graph-overlays.tsx:90`）没有通过 `aria-describedby` 关联；`NodeDetailBadge` 是 `pointer-events-none` 的纯视觉层；选择播报走 `aria-live`（`canvas.tsx:301`），但**取消选择**（点空白 → `setSelectedId(null)`）不播报
- **方案**：给画布加 `aria-describedby`（hint 保持视觉层 + 另建一份 `sr-only`，或用同一节点 id）；取消选择时把 live region 设为新增文案（`graph.selection_cleared`，双语言）
- **范围**：`canvas.tsx`、`graph-overlays.tsx`、locales；`canvas-a11y.test.ts`
- **代价**：**XS**（0.3 人日）

#### G-28 画布无 `role` 之外的等价键盘层承诺（与 G-22 同源，登记以免遗漏）
- **判定**：✅ 成立（并入 G-22 处理，此处仅登记清单）
- **说明**：`role='application'` 把全部键盘语义的责任交给组件；当前承诺（方向键/±/Home/Enter）覆盖了导航与打开，但**覆盖 / 固定 / 右侧打开 / 设为局部中心 / 按标签筛选**五类动作没有键盘路径。G-22 解决菜单入口后，需在 `graph.graph_canvas_accessible` 与快捷键清单（`?` 面板）里同步登记
- **代价**：随 G-22（文案与清单同步）

### 3.5 视觉（3 条）

#### G-29 两套硬编码调色板，且浅色主题下 6/10 低于 3:1
- **判定**：✅ 成立（Q-UI-01 = BF-09；对比度已独立复算）
- **来源**：Q-UI-01 / BF-09；残留自 agy UI-04
- **证据**：`helpers.ts:73` 的 `TAG_FALLBACK_PALETTE`（Tailwind 500 阶）与 `shared/organizer-colors.ts` 的 `ORGANIZER_COLORS`（600/700 阶）值不同；`nodeColor` 对「已赋色标签走 organizer、未赋色走 fallback」，用户一给标签上色它就整体换族，图例（`extractNodeLegend`）同样混用。**复算结果**（对 `tokens.css` 的浅色 `#f7f5f1` / 深色 `#181614`）：回退板浅色 **最低 1.81**（`#84cc16`）、**6/10 低于 3:1**；`ORGANIZER_COLORS` 浅色最低 2.70（`#ca8a04`）、2/10 不达标，深色最低 2.87（`#4f46e5`）、1/10 不达标。节点圆点是分组语义的唯一编码（文字标签属冗余编码，故非红线，但「按颜色分组」的价值就是颜色本身）
- **方案**：**A（先做）** 删 `TAG_FALLBACK_PALETTE`，`tagHashColor` 改为在 `ORGANIZER_COLORS` 上取模——单一来源，立刻消除两族；**B（随后）** 若要更细色相区分，加 `--graph-tag-1…10` 令牌按主题给两套值，并把画布色纳入对比度门禁（见 G-40）；改共享令牌后必须 `node scripts/check-token-drift.mjs --update-baseline`
- **范围**：`helpers.ts`、`canvas-draw.ts`、`tokens.css`（B）、`helpers.test.ts`、`canvas-color-groups.test.ts` / `canvas-legend.test.ts`（颜色断言会变，**是预期结果**）
- **代价**：**S**（0.5–1 人日）
- **建议**：B 方案的门禁部分与 G-40 同批；A 方案的 2.70 也只是勉强，若要做 B 就一次做对（两套主题都 ≥ 3:1）

#### G-30 默认 `groupBy: 'none'` 下全图单一颜色，信息密度偏低
- **判定**：✅ 成立（BF-14 独有）
- **来源**：BF-14
- **证据**：`constants.ts:24` 的 `groupBy: 'none'` → 全部节点用 `--text-tertiary` 填充，唯一视觉变量是半径 `(4 + min(9, √degree × 2.4)) × nodeScale`
- **方案（择一，不建议默认强开）**：① 默认 `groupBy: 'folder'`（`nodeColor` 已有 `organizerColorOrNull ?? fallback` 兜底）；② 保留 none，但首次打开给一次性提示；③ 让三类节点（note/unresolved/tag）**不依赖颜色**也能区分（unresolved 已是空心圈，tag 可加双环）
- **范围**：`constants.ts`、`canvas-draw.ts`、README 的设置表
- **代价**：**XS**（0.3 人日）。改默认值属用户可感知变化，README 的图谱设置表要同步；偏好按账号存 localStorage，只影响新账号

#### G-31 `isDark` 在渲染期读 DOM，主题翻转后预览卡沿用旧配色
- **判定**：✅ 成立（Q-UI-02，可达路径已核实）
- **来源**：Q-UI-02
- **证据**：`canvas.tsx:369` 渲染期直读 `document.documentElement.dataset.theme`；`createThemeObserver` 回调只写 `colorsRef.current` + `state.schedule?.()`，**不触发 React 渲染**；`store/session.ts:491-494` 的系统偏好监听只调 `applyThemeToDom`（纯 DOM 写入）**不改 store**，而 `GraphPanel` 的 zustand 选择器（`activeNoteId`/`selectedTags`）也不会因此重渲。可达路径：另一个标签页改主题、或账号主题为「跟随系统」时 OS 偏好变化（面板打开期间账号菜单不可达）。修复范式在 `presentation-theme.ts:6-9`、`pinned-windows-layer.tsx:99-102` 已有
- **方案**：用应用的主题 hook/store 订阅替换这行内联读取（ADR-0002:59「修复方向」点名的做法）；删掉无 SSR 意义的 `typeof document !== 'undefined'` 守卫；`GraphOverlays` 的 `isDark = true` 默认值改为必填 prop（铁律 5：删掉会掩盖漏传的默认值）
- **范围**：`canvas.tsx`、`graph-overlays.tsx`
- **代价**：**XS**（0.3 人日）

### 3.6 规范与工程（8 条）

#### G-32 三个力滑块绕过组件库 `Slider`，界值写了两处
- **判定**：✅ 成立（Q-SPEC-01；残留自 agy SPEC-02）
- **来源**：Q-SPEC-01
- **证据**：全仓裸 `input[type=range]` 只有两处——`music/music-seek-bar.tsx:35`（自带取舍注释）与 `settings.tsx:115`（**无任何说明**）；`form.tsx:372` 已导出 `Slider`，它提供 `ink-slider` 轨道、固定宽度读数、`aria-valuetext` 与 `min-w-0` 修复，被 editor/appearance/sync/music 等 10+ 处使用。界值在 `settings.tsx:70-72` 与 `helpers.ts:41-43` 各写一遍
- **方案**：`GraphRange` 内部换用 `Slider`（`label` 给可访问名称、`suffix` 给单位）；新增 `GRAPH_FORCE_RANGES` 常量表，面板与 `loadPreferences` 同读一份
- **范围**：`settings.tsx`、`helpers.ts`、`constants.ts`
- **代价**：**S**（0.5 人日）
- **建议**：与 G-11 同一提交

#### G-33 `createGraphTicker` 保留零调用者的位置重载（死代码）
- **判定**：🟡 成立（前提修正：不是「仅测试在用」，而是**无人使用**）
- **来源**：Q-SPEC-03（修正后）；残留自 agy SPEC-01
- **证据**：`canvas-draw.ts:216-243` 的双形态签名（`optionsOrState: GraphTickerOptions | CanvasState` + 8 个可选参数 + 一串 `!` 断言），grep 全部调用点（`canvas.tsx:83`、`canvas-draw.test.ts:172/201/248`、`canvas-physics.test.ts:94`）**全是对象形态** → 位置分支是纯死代码（违反铁律 5）。**但**同处 `renderGraphScene:196-197` 的 `'current' in colorsRef/prefsRef` 是**活的**：`canvas-physics.test.ts:90-91` 传的是朴素 `readThemeColors()` / `DEFAULT_PREFERENCES`，`canvas-draw.test.ts:172` 亦然
- **方案**：**分两步**——① 删位置重载与 `!` 断言（零风险）；② 先把两个测试文件改成传 `{ current: … }`，再删 `'current' in` 双形态判断
- **范围**：`canvas-draw.ts`、`canvas-draw.test.ts`、`canvas-physics.test.ts`
- **代价**：**XS**（0.3 人日）+ **XS**（0.2 人日）
- **建议**：不要合成一步——否则「先红后绿」时会把测试失败误读成回归

#### G-34 死 i18n 键（两语言共 16 条）
- **判定**：✅ 成立（Q-SPEC-04 + BF-11；行号已更正）
- **来源**：Q-SPEC-04 / BF-11；残留自 agy SPEC-03
- **证据**：以下键在源码中 0 引用（逐 key grep，排除 locales）：`graph.drag_to_pan_scroll_to_zoom_click_a_node_to_open_it_use_the_selector_abov`（key 本身在词中被截断，是重命名事故残留）、`graph.graph_canvas_drag_to_pan_and_scroll_to_zoom_keyboard_users_can_open_note`、`graph.choose_a_note`、`graph.open_a_note_from_the_graph`、`graph.links`、`graph.notes`（把标点烧进资源）、`graph.unresolved_short`、`graph.tag_node`。行号：`zh-CN/graph.ts:6,12,13,14,31,35,60,71`（**更正**：:21 是活键 `graph_canvas_accessible`，不在其列）。`npm run i18n:check` 只校验两语言键集一致、**不校验是否被引用**
- **方案**：删 7 项；`graph.tag_node` **保留**给 G-24 使用；`graph.reset` 由 G-35 处理后再删。「给 `i18n:check` 增零引用报告」属全仓性收益，单独立项（铁律 14）
- **范围**：两个 locale 文件
- **代价**：**XS**（0.2 人日）
- **依赖**：必须排在 G-35（`graph.reset`）与 G-24（`graph.tag_node`）**之后**

#### G-35 Tooltip 可见文案与可访问名称不一致
- **判定**：✅ 成立（Q-SPEC-02）
- **来源**：Q-SPEC-02
- **证据**：`index.tsx:185`：`<Tooltip label={t('graph.fit')}>`（可见「适应画布」）包着 `<IconButton label={t('graph.reset')}>`（可访问名「复位」）
- **方案**：两处统一为 `graph.fit`；`graph.reset` 随 G-34 清理一并删除
- **范围**：`index.tsx`、locales
- **代价**：**XS**（0.1 人日）
- **建议**：按「同文件两处文案应一致」来修比押在 WCAG 2.5.3 上更稳（该 SC 约束的是**可见文本标签**，tooltip 是否算「可见标签」有解释空间；axe 的 `label-content-name-mismatch` 也只读真实可见文本，不会报此项）

#### G-36 默认值定义在三处，测试钉住的是自己那份副本
- **判定**：✅ 成立（Q-SPEC-05）
- **来源**：Q-SPEC-05
- **证据**：`lib/graph-settings.ts` 的 `GRAPH_SETTINGS_TOGGLES[].default` 在 `src/` 无任何消费者（`settings.tsx` 只读 `prefKey`/`labelKey`/`hintKey`）；`constants.ts` 的 `DEFAULT_PREFERENCES` 是第二份；`graph-settings.test.ts` 断的是内联副本。本轮逐项比过：**目前两者 7 个布尔值一致**，所以是「无守卫的重复」而非已漂移——但把 `DEFAULT_PREFERENCES.includeOrphans` 改成 `false`，整套测试仍全绿
- **方案**：测试改断言 `DEFAULT_PREFERENCES[control.prefKey] === control.default`；或让 `DEFAULT_PREFERENCES` 的布尔项由 manifest 派生，使 `default` 成为唯一来源
- **范围**：`lib/graph-settings.ts`、`constants.ts`、`graph-settings.test.ts`
- **代价**：**XS**（0.2 人日）

#### G-37 魔法数字与跨层重复常量
- **判定**：✅ 成立（Q-SPEC-06）
- **来源**：Q-SPEC-06；含 BF-15 之外的独立项
- **证据（逐项实取）**：`index.tsx:78` `limit: 350`；`:281` 防抖 `220`；`local-graph.tsx:74-81` `depth:1`/`limit:100`；`graph.ts:97` `params.limit - 50` 与 `:102/:386` 的 `50`（同一数字承担两种含义且都无名字）；`graph.ts:150` 查询长度 `200`；`use-graph-preview.ts:35,40` 悬停 `300` / 隐藏 `200`；`graph.ts:386` 的 `!a || b && c` 靠优先级成立但可读性差
- **方案**：逐项提具名常量（跨端共享的放共享层）；`graph.ts:386` 补显式括号
- **范围**：`index.tsx`、`local-graph.tsx`、`graph.ts`、`use-graph-preview.ts`、`constants.ts`
- **代价**：**S**（0.5 人日）
- **附注**：ULID 正则 `/^[0-9a-hjkmnp-tv-z]{26}$/` 的重复是**全仓级**现象（`helpers.ts:34`、`backup-format.ts:49`、多个 demo 路由等 10+ 处），不是图谱独有——只登记，另立共享事项，别在图谱批次里夹带

#### G-38 截断徽标与顶部统计自相矛盾（开启标签节点时）
- **判定**：🟡 成立（口径收窄）
- **来源**：Q-SEC-02（修正后）；残留自 agy FEAT-03
- **证据**：`graph-overlays.tsx:87` 传 `shown={data.nodes.length}`（含 tag 与 unresolved 节点），文案 `graph.showing_limit` 用「篇」；`index.tsx:114-118` 的 `GraphStats` 已按 kind 分流。开启标签节点后，用户会看到「显示 410 / 470 篇」而顶部同时写「350 篇笔记 · 60 个标签」。**注意**：unresolved 计「篇」与全应用一致（`graph.stats_unresolved` 就是「{count} 篇未创建」），真正的矛盾只出在标签节点；`total` 侧还叠加了 `tagNodes.dropped`（`graph.ts:441`）
- **方案**：抽 `graphNodeCounts(nodes) → { notes, tags, unresolved }` 纯函数供两处同读；徽标改用 `notes`，或把文案改成量词中立的「{shown} / {total} 个节点」（同步 en/zh）；`buildGraphBody` 在标签边落定后再判定 `truncated` 与 `totalEdges`（与 G-02 同一处改动）
- **范围**：`graph-overlays.tsx`、`index.tsx`、`helpers.ts`、`graph.ts`、locales
- **代价**：**XS**（0.3 人日）

#### G-39 `useGraphControls` 在 render 阶段写 ref
- **判定**：✅ 成立（BF-15 独有，低危）
- **来源**：BF-15
- **证据**：`canvas-hooks.tsx:99` 的 `useGraphControls` 直接 `controlsRef.current = { zoomIn, zoomOut, fit }`（由 `canvas.tsx:340` 在渲染期调用）
- **方案**：改成 `useEffect(() => { controlsRef.current = {...} }, [stateRef, fitGraph])`；调用点只在 `onClick` 时读，effect 时序足够
- **范围**：`canvas-hooks.tsx`
- **代价**：**XS**（0.2 人日）。改完需确认 `header-export.test.ts` 里同步点击读取 `.current` 的路径仍通过（若测试依赖渲染期写入，那正是该修的时序假设）

### 3.7 文档与门禁（2 条）

#### G-40 ADR-0002 与 AGENTS.md 仍把「图谱 canvas 不跟随主题」记为未修复缺口，且 ADR 点名要的浏览器断言不存在
- **判定**：✅ 成立（Q-TEST-01 + BF-18）
- **来源**：Q-TEST-01 / BF-18；残留自 agy UI-01
- **证据**：`ADR-0002:29` 的渲染物表写「❌ 不重画（见 Consequences）」，`:50` 起整段以「**已知缺口**……未在本次修复」开头；`AGENTS.md` 的「设计令牌位置」一节同样写「图谱面板 canvas 是当前已知缺口」。而代码**已按 :59 的「修复方向」实现**（`createThemeObserver` 只换调色板并重绘、不重建布局），`canvas-theme.test.ts` 有三条。同时 ADR 要求的浏览器像素断言确实没有：`grep -ic graph scripts/check-contrast.mjs` = **0**；`scripts/e2e-visual.mjs` 里图谱只有 `:1592` 的工具栏稳定性条目（外加 `:1586`/`:2004` 注释）
- **方案**：① 表格行改 ✅、删除「已知缺口」段落；**保留 `:59` 的「修复方向」**——它顺带记录了「这条 effect 会重建布局」，正是 G-06 的根因；② 补 ADR 要求的断言：开图谱 → 翻主题（先设账号「跟随系统」再翻系统偏好，与既有门禁惯例一致）→ 断言**同一张 canvas 元素**的像素/内联色变化；③ 文档部分零风险，可先单独提交（`docs`）
- **范围**：`ADR-0002`、`AGENTS.md`、`scripts/e2e-visual.mjs`（或 `scripts/e2e-harness.mjs` 复用启动流程）
- **代价**：文档 **XS**（0.2 人日）；断言 **S**（0.5 人日）
- **建议**：这是「一份与代码相反的 ADR」——本轮三轮审查里它已经让人两次差点重复实现已有的修复，文档部分应立即做

#### G-41 对比度门禁 0 覆盖图谱表面 + 四类用户意图断言缺失
- **判定**：✅ 成立（Q-TEST-02，措辞收窄）
- **来源**：Q-TEST-02；残留自 agy TEST-01
- **证据**：`check-contrast.mjs` 图谱 0 命中（G-29 的 1.81:1 因此无人看守）；`canvas-physics.test.ts` 的 pin 用例只断言「其余节点运动时不漂移」，**无跨查询断言**；无「键盘打开节点菜单」用例；`tests/graph-routes.test.ts:387-400` 造了 61 笔记 × 61 标签却**从不约束边总量**（`:363` 那条 `expect(body.edges).toHaveLength(0)` 是 tags 关闭场景，故「没有任何一条断言看过边数」不精确）
- **方案**：① 四条功能断言各归入其功能项的**同一提交**（跨查询 pin → G-07；标签边预算 → G-02；键盘开菜单 → G-22；筛选空态出口 → G-15），**不单开测试批次**（否则又变成「先实现后补测」）；② `check-contrast.mjs` 增图谱场景：两套主题各量图例色与节点色在 `--bg-base` 上的实际比值（令牌色按令牌名量、非令牌的用户标签色只报告不判定，与既有约定一致）；③ 场景按 `surfaces:check` 与 `e2e-harness.mjs` 的既有启动/登录/主题动作编写，**不要复制一份启动流程**
- **范围**：`scripts/check-contrast.mjs`、`scripts/e2e-harness.mjs`、四个测试文件
- **代价**：**M**（1–1.5 人日）
- **建议**：与 G-29-B 同批（色板改了才需要门禁守住）

### 3.8 功能对标（7 条，含 3 条候选）

#### G-42 单篇「从图谱中排除」
- **判定**：✅ 缺失（Q-FEAT-04 可做部分）
- **来源**：Q-FEAT-04
- **证据**：prefs 里没有任何排除机制；只能靠文件夹/标签间接绕开，**不属于任何文件夹的笔记无法排除**
- **方案**：prefs 新增 `excludedNoteIds`（复用 G-07 步骤 2 的白名单校验机制），服务端 `filters` 加 `NOT IN`（注意 D1 绑定变量预算与 `GRAPH_NOTE_ID_CHUNK`，需分块或改用临时表）
- **范围**：`lib/graph-settings.ts`、`helpers.ts`、`routes/search/graph.ts`、设置面板 UI、locales
- **代价**：**M**（1–1.5 人日）
- **对标**：Obsidian 可在文件属性永久 omit

#### G-43 边类型与附件节点（**属持久化契约变更**）
- **判定**：🟡 成立但前提已澄清（不是「嵌入不可见」）
- **来源**：Q-FEAT-04 + BF-19；**前提修正见 §2**
- **证据**：`links` 表只有 `(source_note_id, target_key, target_title, target_note_id, user_id)`，**没有类型列**；`extractWikiLinks` 会连 `![[嵌入]]` 一起记成普通边（`WIKI_RE` 匹配内部的 `[[…]]`）；附件引用（`extractAttachmentIds`）走独立路径，**完全不进图**
- **方案**：分三档——① **不做**：只在文档里写明「图谱画的是 wiki 关系（含嵌入），不含附件」；② 小步：把附件作为**第三类节点**（需要新的查询：`attachments` 表按 `note_id` 关联）；③ 完整：给 `links` 增类型（或新增关系表）→ expand-contract + 迁移不可变门禁 + `tests/schema-migrations.test.ts`
- **范围**：②③ 涉及 schema/writes/查询/渲染/`GraphNode.kind` 与共享契约
- **代价**：①**XS**；②**M**（2 人日）；③**L**（3–5 人日 + 迁移风险）
- **建议**：**先只做 ①**（写清口径），把 ②③ 排到图谱之外的计划里——它是持久化契约变更，不该挂在「功能对标」批次

#### G-44 方向过滤（仅入 / 仅出 / 双向）
- **判定**：✅ 缺失（BF-19 独有）
- **方案**：局部图谱加三选一（全局图谱语义上无意义）；服务端只需在递归 CTE 的方向分支上加条件
- **范围**：`graph.ts`（CTE）、`lib/graph-settings.ts`、`settings.tsx`、locales
- **代价**：**S–M**（1 人日）
- **对标**：Obsidian 的局部图谱有 in/out 过滤

#### G-45 导出选项（「不含标题」「透明背景」，**含隐私维度**）
- **判定**：✅ 缺失（BF-19；与 G-05 同源，合并处理）
- **方案**：见 G-05
- **代价**：**S**

#### G-46 色板控件的可访问名与单选语义（**跨模块**）
- **判定**：✅ 成立但是全仓既有约定（Q-A11Y-04 的另一半）
- **证据**：`aria-label={color}`（hex）与 `aria-pressed` 在 `settings-color-rules.tsx:74-84`、`tags/tag-color-submenu.tsx:31`、`tags/tag-manager-row.tsx:177-180`、`folders/folder-color-submenu.tsx:42`、`folders/manage-folders-modal/pickers.tsx:63-66` 五处完全同款
- **方案**：在 `shared/organizer-colors.ts` 增 `ORGANIZER_COLOR_NAMES`（en/zh 各 10 条），五处同改；单选组语义（`radiogroup` + `role='radio'`）同批评估
- **范围**：`shared/organizer-colors.ts` + 5 个调用点 + locales
- **代价**：**M**（1–1.5 人日）
- **建议**：**不挂图谱批次**——只改图谱会制造局部偏离（铁律 14）

#### G-47 邻居展开与邻居清单
- **判定**：🔬 缺失（BF-06 独有）
- **来源**：BF-06
- **方案**：① 底部节点徽标（`NodeDetailBadge`，`graph-overlays.tsx:42`）从纯文本升级为可点开的邻居清单（入/出分组，条目可打开/居中）；② 节点右键菜单加「展开相邻笔记」（以该节点为中心合并结果进当前图，**依赖 G-06 的坐标继承**否则会打乱布局）
- **范围**：`graph-overlays.tsx`、`use-graph-data`（合并模式）、`canvas-hooks.tsx`、locales
- **代价**：①**M**（1.5 人日）；②**M**（2 人日，依赖 G-06）
- **建议**：先做 ①（它同时补上「度数是唯一线索、无法跳邻居」的一半）

#### G-48 候选清单（登记，暂不排期）
- **判定**：登记项（来源：qoder §5 对标表 + BF-19 表）
- **内容**：小地图 / 缩放百分比读数 / 冻结物理开关 / 图谱状态前进后退 / 从笔记自身「以我为中心打开全屏图谱」/ 节点尺寸公式可调 / 按路径分组着色（含祖先目录，当前 `groupBy='folder'` 只取叶子 `folderName`，嵌套目录塌成同名）/ 多选框选 / 未链接的提及
- **建议**：除「按路径分组着色」（对深层目录结构的用户是真实痛点，**S**）与「从笔记打开全屏图谱」（**XS**）外，其余明确**不做**——理由见配套计划 §5「不做清单」

---

## 4. 三份文档之间的重复映射（便于核对，不重复计数）

| 合并后 | agy | qoder | buffy |
| :--- | :--- | :--- | :--- |
| G-06 | PERF-01（关闭态） | Q-PERF-01 | BF-01 |
| G-07 | FEAT-05（残留） | Q-FEAT-01 | BF-19 子项 |
| G-02 | FEAT-03（残留） | Q-PERF-02 | — |
| G-01 | PERF-03（残留） | — | BF-03 |
| G-09 | PERF-02（残留） | Q-PERF-04 | — |
| G-10 | — | Q-PERF-05 | — |
| G-11 | — | Q-PERF-03 | — |
| G-08 | — | — | BF-02 |
| G-12 / G-13 | — | — | BF-13 / BF-17 |
| G-14 | — | Q-FEAT-03 | BF-07 |
| G-15 | — | Q-UX-01 | — |
| G-16 / G-17 / G-18 / G-19 / G-20 / G-21 | FEAT-02（残留） | Q-UX-03 / Q-UX-04 / Q-FEAT-02 | BF-04 / BF-05 / BF-08 |
| G-22 | — | Q-A11Y-01 | — |
| G-23 / G-24 | UX-06（残留） | Q-A11Y-02 / Q-A11Y-05 | BF-12 |
| G-25 / G-26 / G-27 | UX-03（残留） | Q-A11Y-03 / Q-A11Y-04 | BF-16 |
| G-29 | UI-04（残留） | Q-UI-01 | BF-09 |
| G-30 | — | — | BF-14 |
| G-31 | — | Q-UI-02 | — |
| G-40 | UI-01（残留） | Q-TEST-01 | BF-18 |
| G-41 | TEST-01（残留） | Q-TEST-02 | — |
| G-44 / G-45 | FEAT-05（残留） | — | BF-19 |
| G-32 / G-33 / G-34 | SPEC-02 / SPEC-01 / SPEC-03（残留） | Q-SPEC-01 / Q-SPEC-03 / Q-SPEC-04 | — / — / BF-11 |
| G-35 / G-36 / G-38 / G-39 | — | Q-SPEC-02 / Q-SPEC-05 / Q-SEC-02 | — / — / — / BF-15 |
| G-37 | — | Q-SPEC-06 | — |
| G-03 / G-04 | SEC-03（残留） | Q-SEC-01 | BF-10 |
| G-42 / G-43 | FEAT-04（残留） | Q-FEAT-04 | BF-19 |
| G-46 | — | Q-A11Y-04（另一半） | — |
| G-47 | — | — | BF-06 |

**判定为不成立、已撤下**：Q-UX-02（见 §2）。

---

## 5. 待量测与待补的度量手段

> 这些不是「问题」，而是「在动手前必须先拿到数字」的前提。三条判定 🔬 的条目（G-08 / G-10 / G-47）全都卡在这里。

| 编号 | 待量测 | 手段 | 影响 |
| :--- | :--- | :--- | :--- |
| V-01 | 布局期真实帧成本（物理 vs 绘制各占多少） | **新增 `scripts/measure-graph.mjs`**：按仓库既有的手动验收脚本惯例（`measure-preflight.mjs` / `measure-kanban.mjs` / `measure-music.mjs`：需要账号时用 `INKSTONE_VISUAL_USERNAME/PASSWORD`、需要浏览器时用 `INKSTONE_CHROME_PATH`，参数如 `NODES`/推帧上限可调，打印数据与结论、只报告不判定） | 决定 G-08 的 ①②③ 是否值得做 |
| V-02 | 一次请求实际读多少行 links（大库样本） | 同上脚本采样 + `EXPLAIN QUERY PLAN` | 定 G-01 的提前退出阈值与 G-03 的必要性 |
| V-03 | 全局图谱 degree 聚合的真实耗时 | `EXPLAIN QUERY PLAN` + 大库样本（10k 笔记 / 50k 链接量级） | 决定 G-10 是否值得做持久化契约变更 |
| V-04 | `Math.min(...xs)` 的安全上界 | 已在文档层确认（服务端 clamp 600 + 标签 60 → ≤410）；**若 G-21 放开上限则须改为循环求极值** | G-21 的前置 |
| V-05 | 主题翻转时预览卡的像素/内联色是否真的陈旧 | 浏览器断言（G-31 的验收），先设账号「跟随系统」再翻系统偏好 | G-31 的验收条件 |

**注**：仓库目前**没有**图谱的手动量测脚本，而甲板（deck）、看板、音乐都有——补一个 `measure-graph.mjs` 是把 G-08/G-10 从「推断」变成「实测」的最短路径，也符合 AGENTS.md「能自动化的约束不靠人记」的取向。

---

## 6. 一张表看完：48 个编号的优先级分布

| 优先级 | 条目 | 数量 |
| :--- | :--- | :--- |
| **P0（阻断：功能不可用或红线）** | G-06（重建布局）、G-07（pin/坐标丢失）、G-22（菜单无键盘入口，WCAG A）、G-02（标签边无预算） | 4 |
| **P1（严重：坏体验 / 成本无界 / 规范 MUST）** | G-01、G-03、G-04、G-08🔬、G-09、G-11、G-13、G-14、G-15、G-18、G-19、G-20、G-21、G-23、G-24、G-25、G-29、G-30、G-31、G-32、G-35、G-38、G-40、G-41 | 24 |
| **P2（中：可维护性 / 打磨 / 对标）** | G-05、G-10🔬、G-12、G-16、G-17、G-26、G-27、G-28、G-33、G-34、G-36、G-37、G-39、G-42、G-44、G-45、G-47🔬 | 17 |
| **候选（登记不排期）** | G-43（①只做口径说明）、G-46（跨模块）、G-48 | 3 |

**合计**：P0 **4** + P1 **24** + P2 **17** + 候选/跨模块 **3** = **48 个编号**（G-01…G-48）。

其中 G-46（色板可访问名，5 个调用点）与 G-48（候选清单）不挂图谱批次；G-43 只有 ①（把「图谱画的是 wiki 关系、含嵌入，不含附件」写进文档）可随文档批次顺手做，②③ 属持久化契约变更，另立事项。**因此图谱本体待办为 45 条。**

另：3 条 🔬（G-08 / G-10 / G-47）在配套计划的**决策闸门**里处理，不在拿到证据前动手——G-08 与 G-10 等 §5 的数字（量级未经证实，先做等于赌），G-47 卡住它的不是数字而是归属决策（是否算图谱模块该做的事），见 `plan-with-freebuff.md` §6.2 的 D-1…D-3。
