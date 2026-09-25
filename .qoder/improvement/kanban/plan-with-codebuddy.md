# 看板（kanban）模块改进计划 — codebuddy/hy4preview

- 分支：`kanban-improvement-codebuddy-hy4preview`
- 工作区：`/home/kubuntu/code/cloudflare/inkstone-kanban-improvement-codebuddy-hy4preview`（git worktree，基线 `dev` @ cc09e4b3）
- 基線：typecheck 通过；`vitest run` 468 套件 / 4259 用例全绿（blog-frontend 依赖软链后 parity 套件也绿）
- 每完成一项：实现 → 相关测试 → 回归（pre-commit 门禁 + 全量 `test:unit`）→ 提交 → 更新本文件
- 状态：✅ 16 项已全部完成并以 `--no-ff` 合并入 `dev`（合并提交 `3130127d`，2026-09-25）；
  dev 上合并后冒烟（kanban + preview 相关）125 文件 / 1460 用例全绿。本文件现驻 dev 分支，
  后续跟踪（未实施项的重启与实施记录）直接在本文件追加。

## 阶段小结（全部计划完成）

两轮共完成 **16 个改进项、19 次原子提交**，全部通过 pre-commit 门禁（size / comments / escape /
empty-catch / hardcoded / token / i18n / module-state / deep-imports / code-style / surfaces /
migration）+ typecheck + 相关测试 + 全量 `test:unit`。全量跑中观察到的偶发失败
（radiogroup-names、starter-deck-render、music-hub-modal、calendar-tree 模糊超时、
kanban-unsaved）均与看板改动无关、单独运行通过，已逐项核实。

- 性能：P-1（registry memo 击穿）、P-3（勾选全列重绘）、P-4（批量拖放链表单遍）、P-5（条几何两遍计算）✅
- 安全：S-2（打印纸 cloneNode）、S-3（预览 2MB 上限）、S-4（URL 白名单分级）、S-6（字段长度钳制）✅
- 功能：F-1（WIP 守门）、F-2（到期提示）、F-8（url 属性类型）、F-10（JSON 导出）✅
- 样式：U-1/U-3/U-5/U-7 ✅
- 量测驱动（未实施）：P-2（列内虚拟化）⏸ —— 需先在目标设备跑 `scripts/measure-kanban.mjs`
  确认超标；P-6/P-7 属已知低风险（<1ms / <5ms），无需动作。
- 产品级/暂缓（未实施）：F-3（@提及/人员体系）、F-4（实时多人协同）、F-5（卡片级活动历史）⏸ ——
  详细原因、重启条件、涉及文件与建议方案见文末「未实施项跟踪」；
  S-1/F-7/F-9/内嵌工具栏密度等其余未实施项也收录在该章节速览表中。

## 进度总览

| # | 类别 | 条目 | 状态 | 提交 |
|---|---|---|---|---|
| 1 | 性能 P-1 | registry 每次挂载重建回调击穿 `KanbanRoot` memo；编辑器每次防抖提交全树重渲染 | ✅ 完成 | `f3d88a06` |
| 2 | 性能 P-3 | 勾选一张卡导致所有展开列重绘（`selectAll` 对象每渲染新建） | ✅ 完成 | 见 git log |
| 3 | 性能 P-4 | 批量拖放 `moveKanbanItemsToCell` O(k·n) 串行 | ✅ 完成 | 见 git log |
| 4 | 安全 S-2 | 打印导出 `dangerouslySetInnerHTML` 重解析已渲染 DOM | ✅ 完成 | `cc778dd5` |
| 5 | 样式 U-5 | `duration-300` 未随 `prefers-reduced-motion` 令牌归零 | ✅ 完成 | 见 git log |
| 6 | 样式 U-1 | `.kanban-print-sheet { left: -100000px }` 魔法数字 | ✅ 完成 | 见 git log |
| 7 | 样式 U-3 | 子任务复选框完成态内联样式 → `data-*` + CSS | ✅ 完成 | 见 git log |
| 8 | 样式 U-7 | 卡片头部 `stopPropagation` 吞掉 onKeyDown，需确认并注释 | ✅ 完成 | 见 git log |
| 9 | 安全 S-3 | 跨域文本预览 `res.text()` 无体积上限 | ✅ 完成 | 见 git log |
| 10 | 安全 S-4 | `data:image/*` 白名单放行 `file.url` | ✅ 完成 | 见 git log |
| 11 | 安全 S-6 | fence JSON 无字段长度约束 | ✅ 完成 | 见 git log |
| 12 | 功能 F-1 | WIP 超限只提示不阻止落卡 | ✅ 完成 | 见 git log |
| 13 | 功能 F-2 | 截止日临期/逾期提示 | ✅ 完成 | 见 git log |
| 14 | 功能 F-8 | 新增 `url` 属性类型 | ✅ 完成 | 见 git log |
| 15 | 功能 F-10 | JSON 一键导出 | ✅ 完成 | 见 git log |
| 16 | 性能 P-2 | 渲染窗口只增不减（滚到底等效全量挂载） | ⏸ 量测驱动 | — |
| 17 | 性能 P-5 | 时间轴/甘特条几何重复计算两遍 | ✅ 完成 | 见 git log |

## 记录

### 1. 性能 P-1 — registry 击穿 memo ✅ `f3d88a06`

- 问题：`renderKanbanEntry` 每次调用新造 `onUpdateData/onRetryWrite/onDiscardWrite/onToggleFullscreen` 四个闭包，`KanbanRoot` 是 `memo`，浅比较必然失败；而 `mountBlock` 在每次预览提交（编辑器打字 90ms 防抖后）末尾无条件调用它，即使 fence body 一字未变。
- 方案：回调改为 entry 上按「是否可写」缓存的稳定处理器（读 `scopeOptions` 在调用时，而非闭合某一次 render 的副本）；`renderKanbanEntry` 增加渲染指纹（source/data/unsaved/owner/noteId/writable/renderDescription 身份），指纹未变即跳过 `root.render`。
- 验证：`registry-remount.test.ts` 新增两例，回退改动后首例失败（painted 变 `['Sprint','Sprint']`），修复后为 `['Sprint']`；第二例保证围栏变化仍重绘。
- 回归：门禁全绿；相关 96 文件 / 846 用例通过。
- 备注：全量 `test:unit` 中 `starter-deck-render`、`music-hub-modal` 两个套件偶发失败，单独跑均通过，与本次改动无关（不 import kanban）。

### 2. 性能 P-3 — 勾选一张卡全列重绘 ✅

- 问题：`selectedIds` 是全板一个 Set，勾选任意卡即换新身份；memo 列直接拿到它，且 `selectAll` 捆绑按 `[group, selectedIds, …]` 记忆也每次新建 → 泳道板下每次勾选重绘 bands × groups 个 cell。
- 方案：`useColumnSelectAll` 改为按 `count`/`isAllSelected` 两个原始值记忆（对象身份只在答案变化时更新）；新增 `useColumnSelection`，把该列自己的选中卡哈希成签名，签名不变时复用同一个 Set，向 memo 列传列级选中集而非全板集合。
- 验证：`kanban-board-column-memo.test.ts` 新增两例；回退改动后「勾选只重绘所在列」失败（`['todo','doing','done']`），修复后为 `['todo']`。
- 回归：typecheck 通过；kanban 目录 108 文件 / 1348 用例通过；全量 `test:unit` 仅剩已知偶发 `music-hub-modal`（单独跑通过）。

### 3. 性能 P-4 — 批量拖放 O(k·n) 单遍化 ✅

- 问题：`moveKanbanItemsToCell` 对每张选中卡各跑一次 `moveKanbanItemToCell`（findIndex + map + filter + splice 共约 5 次全数组扫描），200 张选中卡 × 1000 卡文档 ≈ 百万次级数组操作挤在一个提交帧里。
- 方案：改为双链表 + id 索引模拟同样的逐卡走法（band 写入、仅换泳道不挪位、anchor 独占 pivot、目标列为空时 pivot 被忽略转文档末尾等语义逐条保留），数组只走两遍（建链表、读回）；列尾指针惰性解析（pivot 插入后标记未解析，下次读取时向前走一段，每批至多一次）。
- 验证：`swimlane.test.ts` 新增 400 轮种子随机模糊测试，以「逐卡 reduce」为参照实现断言 `toStrictEqual` 全等（顺序 + 属性写入）。模糊测试先后抓出两处语义偏差并修复：目标列为空时 pivot 必须被忽略；列尾指针在 pivot 插入后须先解析再回退。另临时放大到 4000 轮 × 40 卡全部通过后还原参数。
- 回归：typecheck 通过；批量/泳道相关 5 文件 74 用例通过；全量 `test:unit` 4 个失败均为负载性超时/偶发（starter-deck、music×2、calendar-tree 模糊 5s 超时），单独运行全部通过，与本次改动无关。

### 4. 安全 S-2 — 打印纸去 innerHTML 重解析 ✅ `cc778dd5`
- `KanbanPrintSheet` 改为 ref + `cloneNode(true)` 挂载视图副本；测试补断言「纸上是视图树形且非活面板」。

### 5-8. 样式与令牌细节 U-5/U-1/U-3/U-7 ✅
- U-5：进度条 `duration-300` → `duration-[var(--dur-base)]`，随 `prefers-reduced-motion` 归零。
- U-1：`left: -100000px` → 具名变量 `--print-offscreen-x`（CSS 不允许注释，变量名即文档）。
- U-3：子任务复选框条件内联样式 → `data-completed` 属性 + Tailwind `data-[completed]:` 变体。
- U-7：确认卡片头部事件隔离层的抑制范围（标签弹层打开期间，键入其输入框的方向键/Escape 不得被容器上的看板键盘处理器读取），补注释说明。
- 回归：typecheck + hardcoded/token/style/comments 门禁通过；全量 `test:unit` 仅剩已知偶发（radiogroup-names、calendar-tree，单独跑通过）。

### 9. 安全 S-3 — 跨域文本预览体积上限 ✅
- `readTextCapped`：声明 `Content-Length` 超限则在触碰响应体前拒绝；未声明的按流读取，越过 `KANBAN_FILE_TEXT_MAX_BYTES`（2 MB）即取消。
- 新增 `tooLarge` 状态与 `data-kanban-file-too-large` 呈现（无重试按钮——重试无意义），文案复用既有 `preview.kanban_file_too_large`（带 MB 参数）。
- 测试：声明式超限不读 body；无声明的流式 body 越限即停。
- 回归：typecheck + size + i18n 门禁通过；全量 `test:unit` 470 文件 / 4267 用例全绿。

### 10. 安全 S-4 — cover 与 file.url 白名单分级 ✅
- `safeKanbanUrl` 收紧为 http/https/blob/同站相对（不再接受任何 data:）；新增 `safeKanbanCoverUrl` 仅 cover 可额外接受 `data:image/*`（cover 只作 `<img src>`，data url 中的脚本不可能执行；file.url 是链接与 fetch 目标）。
- `body.ts` 的解析期 fail-closed 守卫按字段分别调用；`url.test.ts` 与 `tests/kanban-url-fields.test.ts` 按字段各自的白名单钉住（含 data:image/svg 与 data:application/pdf 的拒绝例）。
- 回归：typecheck 通过；URL 相关 4 文件 53 用例通过；全量 `test:unit` 470 文件 / 4269 用例全绿。

### 11. 功能 F-10 — JSON 一键导出 ✅
- 导出面板新增「导出 JSON」行（PNG / JSON / 打印三出口）：`serializeKanban(data, 'json')` 惰性序列化整板（含视图、列、归档卡，可完整回灌），经 `downloadTextFile` 下载为 `<板名>-<视图>.json`。
- i18n：`preview.kanban_export_json` / `preview.kanban_export_json_done` 双语；size 基线因 locale 各 +2 行重拍（仅行数变化）。
- 测试：`kanban-export.test.ts` 重构（抽 `openExportPanel`/`pressRow` helper、按出口拆 describe 以守 50 行门禁），新增 JSON 出口断言（文件名、MIME、内容可 `JSON.parse` 且含全量列/视图/卡）。
- 回归：typecheck + i18n + size + comments 门禁通过；全量 `test:unit` 470 文件 / 4270 用例全绿。

### 12. 安全 S-6 — fence 文本字段长度约束 ✅
- 解析边界新增 `clampKanbanTextBounds`（JSON 与 outline 两路共用）：板标题 200 / 列名·选项标签·评论作者 120 / 卡标题 500 / 评论 2000 / 子任务标题 200 / 图标 100 / 描述沿用既有 5000；属性值不动（类型由列决定，截断 id 会悄悄改家）。
- 先例一致：与 URL 白名单同一解析边界、与 normalize 默认值填充同一「读取归一化」语义；outline 无板标题时保持缺省不发明空串。
- 测试：`body.test.ts` 新增 4 例（全字段超限钳制、outline 卡标题、UI 写出的板原样不动、属性值永不钳制）。
- 回归：typecheck + size 门禁通过；body 27 用例通过；全量 `test:unit` 偶发 3 例（radiogroup/share-collections/starter-deck，负载性，单独跑通过）。

### 16. 功能 F-8 — url 属性类型 ✅
- 类型与选择器：`KanbanPropertyType` 新增 `'url'`，进入 `KANBAN_EDITABLE_TYPES`（类型选择器 centrally 驱动）+ 双语类型名 `kanban_type_url`（Link/链接）；过滤器沿用文本算子（contains/equals 等，测试全类型枚举覆盖）。
- 渲染：表格单元格与详情字段沿用文本编辑 + 旁置「新开」链接入口；卡面 url 字段渲染为锚点（`noopener noreferrer`，stopPropagation 不误开详情）。所有 href 一律经 `safeKanbanUrl` 白名单，白名单外退化为纯文本。
- 解析期：`assertFenceUrlsAreSafe` 对 url 列值执行同一 fail-closed 白名单（JSON/outline 两路），错误信息点名列 id。
- 函数超限治理：引入过程中 4 个函数越过 50 行上限，均以提取子组件/子函数方式拆平（`readUrlField`/`UrlCellValue`/`DateCellValue`/`TextCellValue`/`UrlDetailField`/`DateDetailField`/`TextDetailField`），size 基线恢复原 27 项豁免，未新增任何豁免。
- 回归：typecheck + 全部静态门禁通过；相关 6 文件 165 用例 + 重构后 5 文件 94 用例通过；全量 `test:unit` 471 文件 / 4286 用例全绿。

### 17. 性能 P-2 — 渲染窗口回收 ⏸ 量测驱动
- 现状：每列 30 张渲染窗口只增不减，长列滚到底等效全量挂载（残余风险：列内 333 卡全部挂载后，后续手势 reconcile 基数 ~1.3 万节点）。
- 不直接实施的理由：这是二阶问题——需要先在目标设备跑 `scripts/measure-kanban.mjs`（需 `INKSTONE_VISUAL_USERNAME/PASSWORD` 与 Chrome 路径）确认单次视图切换 / 最坏主线程任务确实超标，再决定「列内真虚拟化」或「limit 尾部回收」。真虚拟化会改动全部 8 个视图的滚动契约（公告、拖拽落点、窗口尾部哨兵），无证据支撑前不动。
- 完整记录（重启条件 / 两档方案 / 涉及文件 / 代价与风险）见文末「未实施项跟踪 → P-2」。

### 13. 功能 F-1 — WIP 超限拒绝落卡 ✅
- 布线层新增 `kanbanWipRefuses`：目标列有 wipLimit 且「将新进入的卡数 > 0」且 `现有数 + 新进入 > 上限` 时拒绝移动（toast `preview.kanban_wip_blocked`，双语）；拒绝发生在公告之前——活区域保持安静、writer 不被调用、不产生撤销步。
- 语义：上限守门不守序——已在列内的卡（重排、换泳道）永不计入 incoming，超限列内仍可自由换位；无上限列、未知列放行。
- 覆盖路径：单卡拖放、批量拖放（按整个选择集判定）、Shift+方向键键盘移动；批量条的成组改写为刻意绕过（成批改写是读者对自己选择的直接操作，见计划备注）。
- 测试：`kanban-column-wip.test.ts` 改写旧「超限仍公告 over」用例为拒绝 + toast + 无 commit；新增「恰好满员拒绝」「列内换位不受限」；`kanbanWipRefuses` 导出供单测。
- 回归：typecheck 通过；WIP/拖拽/键盘/公告 4 文件 45 用例通过；全量 `test:unit` 470 文件 / 4275 用例全绿。

### 14. 性能 P-5 — 时间轴/甘特条几何一次计算两层共用 ✅
- `dependencies.ts` 新增 `kanbanTimelineBarMap`；`kanbanDependencyLinks` 增加可选 `barsByItem` 参数；`KanbanDependencyLayer` 接收视图已算好的 bar map。
- 时间轴与甘特视图各自 `useMemo` 一次几何（visibleDated × range × fields 为依赖），行渲染与依赖箭头共用同一 map——此前 zoom 每档、每次提交整表几何算两遍（ADR-0006 预留的复用口）。
- 测试：`dependencies.test.ts` 新增「传入预计算 map 与自行计算的箭头逐字段一致」。
- 回归：typecheck 通过；依赖/甘特/时间轴 4 文件 39 用例通过；全量 `test:unit` 470 文件 / 4276 用例全绿。

### 15. 功能 F-2 — 到期临期/逾期提示 ✅
- `date-fields.ts` 新增 `kanbanDueNotice(items, columns, dateFieldHint)`：选一个 date 列（视图 dateField → dueDate → endDate → 首个有值的 date 列），统计未归档未完成卡中逾期与今日到期；无 date 列返回 null。
- 新组件 `ui/kanban-due-notice.tsx`（`role='status'`）：渲染于工具栏下方，两个计数即两个按钮——写入 `is_overdue` / `equals(今日)` 过滤到当前视图（复用既有过滤机制， notice 与 filter 同一列同一口径）；可关闭（本次挂载内）。
- i18n：`kanban_due_overdue / kanban_due_today / kanban_due_dismiss` 双语。
- 测试：`kanban-due-notice.test.ts` 6 例（分桶与豁免、列偏好、回退与无列、按钮写规则、关闭、无事不扰）。
- 回归：typecheck + i18n + size 门禁通过；全量 `test:unit` 471 文件 / 4282 用例全绿。

## 未实施项跟踪

以下条目在本批改进中**刻意未实施**。逐条记录问题、不实施的详细原因、重启条件（什么情况下值得
重新评估）、涉及文件与建议方案，供后续跟踪或立项。总原则与批次划分一致：性能类量测驱动、
产品级决策不抢跑、数据模型不与「数据住在笔记里」的原则冲突、不过早优化。

---

### P-2 — 列内真虚拟化（渲染窗口只增不减）⏸ 量测驱动

- **问题**：`kanban-render-window.tsx` 的每列 30 张渲染窗口向下滚动只扩大上限、**永不回收**——
  长列滚到底后等效全量挂载。单列 333 卡（1000 卡预算 ÷ 3 列）全部挂载后，任何手势（拖拽、勾选、
  过滤）的 reconcile 基数约 1.3 万 DOM 节点。这是本批唯一「可能超标但尚无证据」的残余性能风险。
- **未实施的详细原因**：
  1. *无实测证据*：P-1（跳过无变化重渲染）、P-3（勾选只重绘所在列）、P-4（批量拖放单遍化）、
     P-5（条几何一次计算）落地后，主线程压力已显著下降，残余风险是否在目标设备上真实超标未知；
  2. *改动面横跨 8 个视图*：真虚拟化会改动全部视图共享的滚动契约——滚动到锚点卡（双击搜索结果、
     依赖详情跳转）、拖拽落点判定（dragover 依赖被拖行的 DOM 存在，虚拟化后不可见行不可命中）、
     窗口尾部哨兵、读屏公告的行存在性。牵一发动全身，回归面大；
  3. *轻方案收益存疑*：「尾部回收」只能缓解不能根治，若实测未超标则属过早优化。
- **重启条件**：在目标设备跑 `scripts/measure-kanban.mjs`（需要 `INKSTONE_VISUAL_USERNAME/PASSWORD`
  环境变量与 Chrome 可执行路径），若「单次视图切换」或「最坏主线程任务」确实超标（如长帧 > 50ms）
  则启动；量测数据同时决定选哪档方案。
- **涉及文件**：
  - `src/client/lib/markdown/kanban/ui/kanban-render-window.tsx`（核心：30 张上限与只增不减逻辑）
  - 8 个视图的接入点：`kanban-column-cards.tsx`、`kanban-board-swimlanes.tsx` 及列表/画廊/表格/日历/时间轴/甘特视图容器
  - `kanban-board-dnd.ts`（落点判定需适配「未挂载行不可命中」或挂载占位行）
  - `scripts/measure-kanban.mjs`（先跑它，产出决策依据）
- **建议方案**（按代价从低到高，量测后二选一）：
  1. *尾部回收*：窗口保留上限语义，超出上限 N 张时从顶部回收（保持滚动锚点不跳），改动仅在
     render-window 内部、视图无感知——先做这一档，量测验证收益；
  2. *列内真虚拟化*：动态测量行高 + 只渲染可视区间 + overscan，需同步适配滚动锚点、DnD 命中、
     哨兵三层契约，建议另立 ADR 评审后再动。
- **预估代价**：方案 1 低-中（1-2 天含回归）；方案 2 中-高（3-5 天起，含 8 视图回归）。
- **风险与注意**：卡片高度不均（子任务展开、封面图、描述预览）使虚拟化行高测量复杂化；键盘
  方向键巡卡需要「滚到未挂载卡 → 先挂载再聚焦」路径；`measure-kanban.mjs` 的栅栏上限 1000 卡
  即最坏场景，量测时务必用满。

---

### F-3 — @提及 / 真实人员体系 ⏸ 产品级决策，暂缓

- **现状**：person 属性与评论作者均为自由文本（`types.ts` 中 person 只存字符串，无人员实体）；
  已有「从笔记扫描人名」辅助输入，但无头像、无可点击的个人页、跨板同名不合并。
- **未实施的详细原因**：真实人员体系需要人员主数据（从账号体系来？还是笔记内定义？），
  这个决定牵动数据模型、权限与 UI 全貌，是**产品级决策**而非模块内技术改进——看板模块单方面
  引入人员实体会造成「板内人员 vs 全应用人员」两套体系并存的更坏局面。
- **重启条件**：产品决定引入全应用级人员实体，或明确与账号体系对接的口径。
- **涉及文件**：`src/client/lib/markdown/kanban/types.ts`（person 字段定义）、`kanban-property-cell.tsx`
  （person 编辑与渲染）、评论作者输入组件、`locales`（新增文案）、若接账号体系还涉 worker 侧。
- **短期替代**（低成本，随时可做，不需要产品决策）：*提及高亮*——输入 `@` 时弹出已扫描人名，
  存储仍是纯文本（fence 不变），渲染时对已知人名高亮即可，无实体引入。

---

### F-4 — 实时多人协作 ⏸ 依赖底层，暂缓

- **现状**：写回是整段 fence 覆盖（`write.ts`），无字段级合并；两人同时编辑同一块板，后写者覆盖
  先写者，仅靠 unsaved 机制（重试/放弃对话框）兜底，无静默丢字保护。
- **未实施的详细原因**：协同的第一性问题是**笔记正文的并发模型**，而看板数据住在笔记的 fence 里。
  单独给看板做 OT/CRDT 既无法解决正文冲突，又极易与未来编辑器层协同方案冲突——等于在错误的
  层做一次注定重做的工作。
- **重启条件**：笔记编辑器引入协同方案（Yjs/OT/服务端字段合并）时，将 fence 写回纳入该方案的
  合并单位，届时看板侧只需适配写回接口。
- **涉及文件**：`write.ts`、`kanban-sync.ts`、`use-kanban-blocks.ts`（写回与冲突路径全链路）、
  worker 侧保存路由；若接 Yjs 还涉数据初始化与迁移。

---

### F-5 — 卡片级活动历史 ⛔ 建议不做（与项目原则冲突）

- **现状**：只有板级 30 步撤销（`kanban-history`）；卡片本身无「谁在何时改了什么」的日志。
- **不做的详细原因**：活动日志是**只增数据**——每卡存历史会让 fence 体积随使用线性膨胀，
  1000 卡板叠加日志会迅速逼近甚至击穿 2MB 笔记上限；这与「数据住在笔记里、保持最小」的项目
  数据原则直接冲突。且 JSON 导出/回灌（F-10 已实现）会把日志变成 forever 负担——删了丢审计，
  留着涨体积。
- **替代与重启条件**：误操作回滚已由板级撤销覆盖，删除找回已由归档/回收站覆盖；若未来确有
  审计需求，建议走**独立后端表（D1）**记录、不进 fence——此时才重启评估。
- **涉及文件**（若强做）：`types.ts`（数据模型加 logs 字段）、`write.ts`（每次变更追加日志）、
  `kanban-history.ts`（撤销与日志的边界需重理）。

---

### 其余未实施项速览

| # | 条目 | 状态 | 一句话理由 | 涉及文件 | 建议 |
|---|---|---|---|---|---|
| S-1 | 描述渲染「预览模式」env 机制化 | 防御纵深，可做 | 跨域资源闸门目前靠各增强模块自觉读 `externalImages`——安全但依赖约定，未来新增增强块可能漏防 | `use-kanban-blocks.ts`、markdown 增强器注册处 | 给 `renderDescription` 传显式预览模式标志，增强器在该模式下默认收紧到无网络行为，机制化取代约定；代价中 |
| F-7 | 卡片模板库 | 可选 | 已有板级模板与卡片复制，边际收益低 | `kanban-context-menu`、quick-add | 右键「存为模板」+ 空列新建时选择；模板存储位置需先决策（板内字段会增大 fence，本地存储不跨设备） |
| F-9 | 触屏拖拽 | 暂缓 | 仅 HTML5 DnD，触屏不触发；已有右键菜单/键盘替代 | `kanban-board-dnd.ts`（重写） | Pointer Events 重写或 touch 长按模拟，代价高；建议等真实触屏用户反馈再投入 |
| UX-1 | 内嵌窄容器工具栏密度 | 按需 | 内嵌形态窄容器下仍全量图标一行，新用户难辨认（截图观察） | 工具栏组件、容器查询样式 | 按 `owner === 'inline'` 区分形态，窄容器把低频操作（CSV/导出/分组依据）收进溢出菜单；随下次 UI 批次顺手做 |

> 跟踪约定：任一条目重启时，在本章节对应小节追加「→ 实施」小节（日期、提交、验证结果），
> 并同步更新「进度总览」表的状态列。
