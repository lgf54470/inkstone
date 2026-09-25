# 看板（kanban）模块改进计划 — codebuddy/hy4preview

- 分支：`kanban-improvement-codebuddy-hy4preview`
- 工作区：`/home/kubuntu/code/cloudflare/inkstone-kanban-improvement-codebuddy-hy4preview`（git worktree，基线 `dev` @ cc09e4b3）
- 基線：typecheck 通过；`vitest run` 468 套件 / 4259 用例全绿（blog-frontend 依赖软链后 parity 套件也绿）
- 每完成一项：实现 → 相关测试 → 回归（pre-commit 门禁 + 全量 `test:unit`）→ 提交 → 更新本文件

## 阶段小结（截至当前批次）

已完成 7 个改进项、7 次原子提交，全部通过 pre-commit 门禁（size / comments / escape / empty-catch /
hardcoded / token / i18n / module-state / deep-imports / code-style / surfaces / migration）+
typecheck + 相关测试 + 全量 `test:unit`。全量跑中观察到的偶发失败（radiogroup-names、
starter-deck-render、music-hub-modal、calendar-tree 模糊超时）均与看板无关、单独运行通过，
已逐项核实。

剩余项为功能性增强（F-1/F-2/F-8/F-10）、防御纵深（S-6）与量测驱动的二阶性能项（P-2/P-5），
建议按「F-1 → F-2 → F-8 → F-10 → S-6」顺序继续；P-2/P-5 先跑
`scripts/measure-kanban.mjs` 确认实际超标再做。

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
| 13 | 功能 F-2 | 截止日临期/逾期提示 | ⬜ 待做 | — |
| 14 | 功能 F-8 | 新增 `url` 属性类型 | ⬜ 待做 | — |
| 15 | 功能 F-10 | JSON 一键导出 | ✅ 完成 | 见 git log |
| 16 | 性能 P-2 | 渲染窗口只增不减（滚到底等效全量挂载） | ⬜ 待做 | — |
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
