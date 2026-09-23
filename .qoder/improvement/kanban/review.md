# 看板（```kanban）模块审查总报告（合并版）

> 合并来源：①本仓库第一轮全量审查报告；②第三方复审文档（全量代码审查 + 对另一份实施计划的逐条核验）。
> 合并方法：所有条目均经**读码核实到 file:line**，能实测的已实测（jsdom 复现、grep 全仓引用、门禁命令）。
> 每条标注来源：`[共识]` 两份报告均确认；`[附件补充]` 我方报告遗漏、经实证成立；`[独有]` 我方报告发现、附件未覆盖；`[修正]` 对原表述的措辞收窄或推翻。
> 审查日期：2026-09-18。基线：`dev` 分支 53824e3c，71 条 kanban 单测全绿。

---

## 一、总体判断

功能骨架罕见地完整（8 视图、子任务、标签、筛选排序、图表、上传），门禁全绿。但：

- **5 个会产生静默数据丢失 / 错误数据的正确性缺陷**（双实例状态分裂、outline 写回丢字段、日历新建污染 status、冲突写回失联、筛选态拖拽落点错位）；
- **1 个越权读取的隐私缺口** + 一套与 attachments 平行的无配额附件体系；
- **1 个必然空白的功能**（PDF 预览被自家 CSP 挡死）；
- 全屏模式「第二实例」架构导致的状态分裂与性能放大；
- 规范层面：Rules of Hooks 违规、~116 个裸控件、9 个自造浮层、颜色/对比度游离于令牌守卫外、a11y 多条红线。

两份报告合并后的完整问题台账如下。

---

## 二、P0 — 正确性（第一批止血）

### 1. `[共识]` 内联与全屏是两套 React 实例，数据单向分裂

- **问题**：全屏未走 `session.moveInto`（`attachKanbanToOverlay` 在 kanban 定义了但零调用，`registry.ts:217`、`session.ts:41`；对比 mindmap 在 `registry.ts:481/494` 的范式）。`kanban-fullscreen.tsx` 在 Modal 里新挂第二个 `KanbanRoot` + 本地 `data` state，内联根仍存活。`useKanbanHistory` 的 reducer（`kanban-history.ts:76`）初始值只读一次，`registry.ts:143-152` 重渲染传入的新 `initialData` 被永久忽略。后果链：全屏编辑 → 关掉后内联显示编辑前状态 → 用户下一次内联编辑基于陈旧 state 构建 → **覆盖已保存内容**。编辑器直接改栅栏 JSON 后，已挂载界面永不更新，`entry.data` 已换 → 点击混出新旧杂交数据。
- **方案**：走 mindmap 范式单根化（`bodyRef` + `session.moveInto/moveBack`，删本地 data state 与第二 root）。**必须同时做四件事**（`[附件补充]` 我方原方案漏项）：① `attachKanbanToOverlay` 加 `is-fullscreen` 类；② 新增 `.kanban-canvas.is-fullscreen` 高度契约（今天 480px 来自 `.ink-prose .kanban-canvas`，搬出 prose 即失效）；③ 搬走后的内联占位，避免块塌陷；④ `isFullscreen` 经 `renderKanbanEntry` options 透传。
- **范围**：`ui/kanban-fullscreen.tsx`、`use-kanban-blocks.ts`、`registry.ts`、`session.ts`、`styles/kanban.css`、`kanban-fullscreen.test.ts`。代价：中。
- **验证**：全屏编辑并关闭后内联显示同一数据；同一 container 节点被搬移未重建；全屏 canvas 撑满、内联块不塌陷。现有测试对此零覆盖，先补复现用例。
- **伴生性能问题 `[独有]`**：修好此项同时消掉「全屏每次击键 → `updateKanbanData → renderKanbanEntry` → 内联根全量重渲（两棵树）」的放大效应，验收指标应包含它。

### 2. `[共识+修正]` outline 模式写回静默丢字段（比原报告更严重）

- **问题**：`serializeKanbanOutline`（`outline.ts:123-168`）只写 status 分组/checked/priority/assignee/start/end/progress/tags，丢弃 **subtasks、files、icon/cover、content/description、自定义属性、views，连看板标题都丢**。outline 板上这些编辑入口全部可用，用户加子任务→关闭→消失，无提示。
- **方案**：首次 UI 写回前把 `entry.mode` 升级为 `'json'` 整体序列化；outline 保留为导入/导出格式（注明不是持久化格式）；补 mindmap 式「转换为 JSON/大纲」动作 + undo toast；同步 README/CHANGELOG。
- **补充 `[独有]`**：`parseOutlineProperties` 的 `[key: value]` 正则会**误吞标题本身含 `[…]` 的行**，需转义规则——parse 侧问题与 serialize 侧同批修。
- **范围**：`write.ts`、`registry.ts`、`outline.ts`、`body.ts`、块头菜单、文档。代价：中。
- **验证**：outline 板加子任务/附件后写回 JSON 且字段完整；转换可撤销；含方括号标题的 round-trip 不变形。

### 3. `[共识+修正]` 冲突写回失联（措辞已收窄）

- **问题**：`flushKanbanEntry`（`write.ts:17-32`）在 `write()` 前置 `dirty=false`，返回 conflict 时不保留脏标记；`entry.ref/source` 只在 'written' 时前进。**`[修正]` 「永久失联」收窄**：`fence-edit.locateFence` 有「行号命中 或 全文唯一 body 匹配」兜底，栅栏**仅移动位置可自愈**；只有 body 被外部改动（栅栏内容变化/出现歧义）才持续失败。且**同 ref 重试必然再 conflict**（`[附件修正]` 原「重试 1–2 次」方案不成立）。
- **方案**：内存保留数据 + `dirty` 复位 + 工具栏持久「未保存 · 重试/放弃」态，重试前按当前正文**重新定位**。
- **范围**：`write.ts`、`kanban-sync.ts`、`kanban-header.tsx`。代价：小。
- **验证**：栅栏移动后仍能落盘；body 被改后明确报「未保存」且不清空改动。

### 4. `[附件补充]` 日历「新建」把日期写进 status

- **问题**：`kanban-calendar-view.tsx:12,122,140` 把 `day.dateStr` 以 string 形参传给 `handleAddItem`，而 `kanban-root-hooks.ts:240-258` 将 string 形参直接落 `properties.status` → 新卡片的「状态」是一个日期字符串。
- **方案**：改传 `{ [view.dateField ?? 'startDate']: dateStr }`；拆开 `handleAddItem` 的 `string | Record` 联合签名。
- **范围**：`kanban-calendar-view.tsx`、`kanban-root-hooks.ts`、`kanban-timeline-view.tsx`。代价：小。
- **验证**：日历新建落在日期字段、卡片出现在日历格。

### 5. `[附件补充]` 详情弹窗在早 return 之后调 hooks（Rules of Hooks 违规）

- **问题**：`kanban-item-detail.tsx:250-253` `if (!item) return null` 位于 `useKanbanDetailState(...)`（内含 useState/useEffect）之前。
- **实测限定 `[修正]`**：jsdom + React 19 手工复现 null→item→null→item 序列**未崩溃**（`crashes=[]`），但 `console.error` 打出 "Internal React error: Expected static flag was missing"。结论：违规确定、需修，但「dev 必然崩」不成立，浏览器真机行为未验证。
- **方案**：拆外层判空 + `KanbanItemDetailBody`（hooks 全在内层）。
- **范围**：`ui/kanban-item-detail.tsx`、新增 `kanban-item-detail.test.tsx`（注意：vitest include 为 `src/**/*.test.ts`，.tsx 测试文件不会被发现——测试命名或配置需先核）。代价：小。
- **验证**：打开→编辑→关闭→再打开，hooks 数恒定、无 React 内部错误。

### 6. `[独有]` 筛选开启时拖拽落点错位

- **问题**：`kanban-board-dnd.ts:35-53`，`handleCardDrop` 的 `targetIndex` 基于**过滤后**分组下标计算，却作用于**全量** items 数组——有筛选/搜索时卡片插到错误位置。
- **方案**：index 换算统一以全量数组为基准（或过滤态禁用跨卡精确落位，只允许列尾/列首）。代价：小。
- **验证**：开筛选拖拽后落点与指示线一致，复现测试先行。

### 7. `[独有]` undo 快捷键作用域与抢占

- **问题**：`kanban-history.ts:47-69` keydown 挂 `window`，每实例一份（P0-1 修复后仍余「焦点在正文任意处看板 undo 压过全局语义」问题，仅 INPUT/TEXTAREA/contenteditable 让路）。
- **方案**：绑定在该块 canvas 容器（或 Modal）上，仅当焦点/悬停归属此实例时生效。代价：小。随 P0-1 同文件顺手。
- **验证**：同屏两板，焦点在板 A 时 Ctrl+Z 只撤 A。

### 8. `[独有]` KanbanRoot 无 ErrorBoundary

- **问题**：独立 `createRoot` 不在宿主错误边界内（`registry.ts:143-151` 直接 render），单块抛错白掉该卡片且无局部兜底，违反「加载/失败/空」三态红线。
- **方案**：每实例 root 外包一层 ErrorBoundary，失败态显示源码 + 提示。代价：小-中。
- **验证**：注入抛错数据后该块显示错误态、页面其余部分正常。

---

## 三、P1 — 安全与隐私

### 9. `[共识]` `GET /api/kanban/file/*` 完全无鉴权

- **证据**：`src/worker/routes/kanban.ts:74` GET 无 `requireAuth`（POST/DELETE 有）；`:115` DELETE 在 customMetadata 缺失时跳过属主校验。与 attachments 体系（`files/library.ts:69-82` owner/share 判定）形成反差。`kanbanName` 常为 `default`、文件名含用户原始名，仅 `newId()` 一段是防线（security-by-obscurity）。
- **方案**：GET 加 `requireAuth` + `customMetadata.userId` 属主校验；DELETE 补 metadata 缺失即拒。保留现有下载侧防护（inline/nosniff/sandbox CSP、SVG/HTML 强制 attachment——这两条是**做对的**）。
- **验证**：他人文件 GET → 403/404；未登录 → 401。`tests/kanban-routes.test.ts`。

### 10. `[共识+独有]` 附件体系无配额/类型/节流 + 存量孤儿无人回收 + 建议并轨

- **增量问题 `[共识]`**：上传只校验大小（无 MIME 白名单/配额/节流），存储缺失不显式 4xx → 对齐 `files/organizer.ts` 校验 + `consumeAttemptBudget`。
- **删除侧 `[共识]`**：删除只摘 JSON 引用（`kanban-files-cell.tsx:122`），`deleteKanbanFile`（`api/kanban.ts:20`）全仓零调用；详情弹窗不传 `kanbanName` → 全落 `kanban/default/`。**若改 key 命名空间必须 expand-contract 双读旧前缀**（历史笔记正文已存旧 URL）。
- **存量问题 `[独有]`**：已产生的 R2 孤儿对象——清理 Cron 不扫 `kanban/` 前缀，删笔记/删账号也不回收。需把 `kanban/` 纳入清理任务 + 笔记删除联动。
- **选型建议 `[独有]`**：评估**直接复用 attachments 通道**而非修补平行体系（AGENTS「禁止重复造轮子」，配额/鉴权/清理一并白拿）。**先决定通道，再写鉴权**，能省 #9/#10 一半工。
- **验证**：超限/缺存储被拒且有明确文案；删除后 R2 对象移除，失败有 toast + 回滚。

### 11. `[共识+修正]` 栅栏注入 URL 无协议白名单（理由已修正）

- **问题**：`body.ts:22-99` normalize 不校验 `files[].url`/`item.cover`。**`[修正]`**：`javascript:` href 已被 React 19 `sanitizeURL` 拦截，真实风险是**外部请求面**——任意远端 `<img src>`/`fetch` 可做访问追踪（读分享笔记时隐私泄漏），`data:` 大对象可 DoS。
- **方案**：新增 `safeKanbanUrl()`（允许相对路径 `/api/...`、`blob:`、`data:image/*`、`http(s)`），normalize 阶段清洗，非法协议置空并走错误态提示（不静默降级）。
- **范围**：新工具 + `body.ts`、`kanban-file-preview-modal.tsx`、`kanban-gallery-view.tsx`、`kanban-files-cell.tsx`。代价：小。

### 12. `[附件补充]` PDF 预览被自家 CSP 挡死

- **证据**：`src/worker/app.ts:87-88` `frame-src 'none'; object-src 'none'`，`kanban-file-preview-modal.tsx:65` 用 `<object data={file.url}>` 嵌 PDF → **必然空白**，非概率问题。
- **方案**：移除 `<object>`，改「新标签打开 + 图片/文本内联」。代价：小。
- **验证**：PDF 新标签打开正常，无空白框。

---

## 四、P1 — 性能（全屏模式）

### 13. `[共识]` 拖拽期间整板每帧重渲染

- **证据**：`kanban-board-dnd.ts:90-94` 每次 dragover 生成新 `cardDropTarget` 对象；`kanban-board-view.tsx:301-323` 内联箭头 props + `commitData` 依赖 `state.data`（`kanban-history.ts:82-89`）→ memo 全失效 → 300+ 卡时每次 mousemove 全板重渲。
- **方案**：`commitData` 改函数式更新去掉 `state.data` 依赖；drop 指示局部化；同 `cardId+position` 时 bail。
- **验证**：500 卡编辑/拖拽帧耗时采样；拖拽回归。

### 14. `[共识]` 图表每次重建 + 主题不跟随 + 硬编码英文（ADR-0002 违规）

- **证据**：`kanban-chart-view.tsx:109-135` `dataset` 无 memo → Chart.js 销毁重建；`:122` 一次性读 `data-theme` 且不在依赖 → 切主题颜色不变（AGENTS 明文「读一次就把颜色冻在创建时刻即回归」）；`entry.dark/locale` 传进 registry 后根本没接到 `KanbanRoot` props（死代码，见 #27）。
- **方案**：`dataset` `useMemo`、组件 `memo`、监听 `data-theme` 重绘、文案进 locales、canvas 加 `role='img'` + 摘要。
- **验证**：同数据不重建；切主题颜色更新。

### 15. `[独有]` `data-kanban` 属性双份存储

- **证据**：`renderer/fence.ts:206` 把整份 JSON encode/escape 进 DOM 属性，每次预览重渲染对全文档所有看板重复编码；MB 级大板显著拖慢 90ms 防抖后的提交管线。
- **方案**：超长时改存 WeakMap（挂载时按 index 从解析结果取）；mindmap 同类问题一并评估。代价：中。可后置，先立 issue。

### 16. `[共识]` 搜索无 debounce / 表格全选 O(n²)

- **证据**：输入直改 state 触发全量过滤；`kanban-table-view.tsx:60-77` 全选逐条 `onToggleSelect`。
- **方案**：`useDeferredValue` + 缓存小写化索引；全选一次 set。代价：小。

### 17. `[独有]` 详情标题每键提交 + 长文本无约束

- **证据**：详情标题 onChange 直 `commitData`（每击键一次 undo 快照）；`MetricCards` 声明 `grid-cols-4` 只画 2 卡（`kanban-chart-view.tsx:89`，md 以上半行留白 `[附件]`）；description textarea 无长度约束，480px 内联画布里长文本卡片体验崩坏。
- **方案**：本地草稿 + Enter/blur 提交；history 加合并窗口；textarea 限长 + 展开态。代价：小-中。

### 18. `[独有]` text/plain 拖拽兜底无校验

- **证据**：`kanban-board-dnd.ts:28` 附近，从外部拖入任意纯文本会被当作卡片 id 执行移动。
- **方案**：校验 `data-item-id` 存在再动作。代价：极小。

---

## 五、P1 — 功能完整性（全屏当独立 app，对比 Linear/Notion/Height）

### 19. `[共识]` 「视图」是假的：配置不持久化 + 7 个死字段

- **证据**：`kanban-root-hooks.ts:42-46` filters/sorts/searchQuery/cardSize 全是组件内存 useState，切视图/关全屏/刷新即丢；`activeViewId` 不写回；`types.ts:122-138` 的 `dateField/startField/endField/progressField/coverField/chartMetric/hiddenProperties` **无人读**（timeline-helpers.ts:75-76、calendar-helpers.ts:63-64、gantt:77 各自硬编码字段名）。8 个「视图」实际是一个全局配置的类型切换器。
- **方案**：视图态按 `viewId` 写回 `KanbanView`、`activeViewId` 写回 `data.activeViewId`；各视图按字段配置解析属性；**无法尽快接线的字段删除，不留死字段**。代价：中。

### 20. `[共识]` 属性/分组/批量只认 status

- **证据**：表格写死 6 列（`kanban-table-view.tsx:26-58`），自定义属性根本不渲染；「新增分组」未传 `onAddGroup` 退化为新增卡片（`:122`，root 只传 `onAddColumn`）`[附件补充]`；分组只按 id 匹配，存 label 的卡片全进 No Status（`filter-sort.ts:136`）`[附件补充]`；新建分组/批量赋值基于 status 而非 `activeView.groupBy`。
- **方案**：`groupKanbanItems` id/label 双匹配（小，第一批）；以 `columns` schema 驱动表格列：显隐/重命名/类型/选项编辑、行内编辑、表头排序、列宽顺序持久化（大，第三批）；分组/批量泛化到 groupBy（中，第二批）。

### 21. `[共识]` 分享/导出/放映永远停在「加载中」

- **证据**：`use-share-page.ts:80` 的 `enhancePreview` 无 kanban 分支（share 页看板块 `aria-busy=true` 卡死，违反三态红线）；`useKanbanBlocks` 全仓仅 `use-preview.ts:463` 一处；`features/presentation/`、`lib/export-note.ts`、`deck-print.tsx` grep kanban 为零。**（附件称此路径不存在——已证伪，文件存在且 80 行即 enhancePreview。）**
- **方案**：只读静态快照或服务端渲染静态 HTML；`enhance` 补 kanban 分支。代价：大，第三批。

### 22. `[附件补充]` 三处死操作

- 「转换为项目」：`kanban-item-detail-fields.tsx:217-223` 不传 `onConvertToItem`，`kanban-subtask-list.tsx:287` 只做 `?.` 安全调用 → 死菜单项。
- 「打开子任务」：`kanban-subtask-menu.tsx:87` `onOpen &&`，无人传 → 永不渲染。
- 「复制名称」：`:81` `void navigator.clipboard.writeText(...)` 无 `.catch()` → 未处理 Promise。
- **方案**：实现子任务→卡片；`onOpen` 未传不渲染；照 mindmap 写法 `clipboard?.writeText` + try/catch + toast。代价：小，第一批。

### 23. `[附件补充]` ID 可碰撞

- **证据**：`item-${Date.now()}`（`kanban-root-hooks.ts:241`）、`status-`、`sub_${Date.now()}`（`kanban-subtask-list.tsx`）同毫秒新建撞 id。
- **方案**：换不可碰撞生成。代价：小。

### 24. `[附件补充]` 排序与拖拽静默冲突 + 甘特隐藏交互

- 有 sorts 时手动拖拽排序无反馈（禁用并提示，或拖拽即切「手动排序」）；甘特进度 `(p+25)%125` 不会超 100（`Math.min` 已钳住 `[修正]`），真缺陷是**只能双击、无键盘、无提示**且 100→0 回环归零（`kanban-gantt-view.tsx:77,86`）→ 改真实进度控件。代价：小-中。

### 25. `[独有]` 产品能力差距清单（主流看板对标，附件全部未提）

| 缺口 | 说明 |
| --- | --- |
| 详情无 markdown 渲染 | description 是纯文本 textarea |
| 无评论 / 活动流 / 提醒 | 主流看板标配 |
| 无 WIP 上限、无泳道 | Height/Linear 核心 |
| 无存档（archive） | Notion/Height |
| 无 CSV 导入导出 | outline 导入 ≠ CSV |
| 筛选算子缺数值/日期比较 | 只有等值类 |
| `person` 类型无成员选择器 | assignee 只能手输 |
| 无 due date 字段统一 | `[独有]` 卡片读 `dueDate`（`kanban-card.tsx:180`）、详情读 `endDate/date`，三键漂移，同一卡两视图可显示不同日期（此条属正确性，随 #20 批次修） |

排期建议：进第三批或独立 roadmap，不与止血批次混。

---

## 六、P2 — 规范收敛

### 26. `[共识+独有]` 控件与浮层

- 全模块 **86 个裸 `<button>` / 22 `<input>` / 8 `<select>`** 未走 `components` 原语 `[独有]` 清点；9 处自绘 `role='dialog'` 无焦点陷阱/ESC（date-picker、tag-picker、icon-picker、color-picker 等）；`kanban-subtask-menu` 自绘 `role='menu'` 绕开 `Menu`；本地 click-outside 复制 6 份。
- **`[附件修正]`**：9 个浮层候选中 5 个只借用 overlay 的 `useClickOutside`，没有一个走 `Menu`/`Popover`；z-index `z-50` 6 处与 `--z-*`/`z-index.ts` 并存。
- **方案**：迁 overlay 的 `Menu`/`Popover`，z-index 统一 `var(--z-menu)/var(--z-popover)`；裸控件可随功能改动逐文件带走，不单开纯重构。代价：中-高。

### 27. `[共识]` 死代码

- `entry.dark`/`entry.locale`（registry 传了没人用）、`kanban-context-menu.tsx:233` `useMemo(…, [props])` 无效依赖、`api/index.ts` 零调用的 `files.remove`。删。代价：极小。

### 28. `[共识]` 颜色令牌与对比度

- `--kanban-tag-*` 24 个 hex/rgba 定义在 `kanban.css`，不在 oklch 令牌体系、无对比度门禁、切强调色不变；`chart-helpers.ts` 还有第二套硬编码调色板。
- **`[独有]` 补充**：另有 10 处 `text-white` 直接压 accent 底（同模块 `kanban-header.tsx:278` 已正确使用 `--accent-contrast`，自相矛盾）；`!important` 2 处无注释（规则 #12 要求限定作用域+注释）。
- **方案**：标签色接令牌（或登记 baseline 纳入 `contrast:check`，含 7 强调色）；chart 调色板读计算后的强调色；`tokens:check` 增加字面色规则。触碰共享令牌后 `node scripts/check-token-drift.mjs --update-baseline`。代价：中。

### 29. `[共识+独有]` a11y 清单

- hover-only `opacity-0` 控件键盘焦点不可见（约 10 处，**同时解释截图里卡片顶部的空白行** `[附件]`）；卡片嵌套 `role='button'`；表格全 div 无 `table/row/cell` 语义 `[独有]`；`tablist`（`kanban-view-tabs.tsx:23-24` timeline/gantt 还共用一个图标）无方向键/`aria-controls` `[共识]`；图标按钮缺可访问名称约 12 处；`aria-expanded/haspopup` 全目录 0 命中 `[独有]`；拖拽无键盘替代与 `aria-live`；canvas/进度条无可访问名。
- **方案**：与 #26 合并做，axe 断言为 0 收口。代价：中。

### 30. `[共识+独有]` i18n / 本地化

- 快捷键提示硬编码 Ctrl（应按平台 ⌘/Ctrl）；日历标题/周起始未本地化 `[共识]`。
- **`[独有]` 补充**：`batch-bar.tsx:56-58` 句子拼接；`tag-picker.tsx:41` 借用 mindmap 键当删除文案。
- **`[附件修正，我方核实]`**：`kanban-date-picker.tsx:96,120` **已用** `Intl.DateTimeFormat(locale,…)`，此项合规不用修；`filter-sort.ts:129` 的 `'No Status'` 字面量经 `i18n-helpers.ts:84` 映射到 `preview.kanban_no_status`（zh/en 键都在），**展示层已本地化**，只有内部哨兵值语义，不算违规。
- 代价：中。

### 31. `[共识]` 门禁与观测

- 全屏看板不在 `check-surface-coverage.mjs`/`e2e-visual.mjs`/axe 场景内——**这解释了为何上述问题全部存活**。
- **方案**：纳入 surface 名单；`e2e-visual.mjs` 增看板场景（进入 → 内容已到 → 工具栏控件逐个点击断言高度与位移 0 → Escape 关闭并断言焦点回到 `[data-kanban-fullscreen]` → axe 为 0，两套主题）。代价：小-中。
- **测试基建 `[独有]`**：vitest include 是 `src/**/*.test.ts`，`.tsx` 测试不被发现；新建组件测试要么用 `createElement`，要么先确认 include 规则，避免假绿。

---

## 七、两份报告交叉核验判定（留档）

| 类别 | 结论 |
| --- | --- |
| 双方共识（约 20 条） | 双 root、outline 丢字段、GET 无鉴权、memo 失效、冲突写回、死字段、a11y、分享 loading 等，证据一致 |
| 附件有、我方原报告遗漏（17 条） | 日历 dateStr→status、CSP 挡 PDF、详情 hooks 早退、表格新增分组退化、两个死操作 + clipboard catch、7 个死视图字段、分组 id-only、搜索 debounce/全选 O(n²)、死代码三处、hover-only 空白行、进度条口径、每键提交、⌘/Ctrl、批量删除无撤销、排序×拖拽冲突、kanbanName 全落 default —— 已全部并入上文对应条目 |
| 我方有、附件遗漏（约 20 条） | 筛选态拖拽落点错位、ErrorBoundary 缺失、undo 抢占、text/plain 兜底、due date 三键漂移、outline parse 正则吞标题、data-kanban 双份存储、击键双树重渲、存量孤儿回收/Cron 前缀、复用 attachments 通道建议、text-white×10、!important×2、i18n 具体违例、裸控件底数清点、textarea 无约束、产品能力差距 8 项、vitest .tsx 盲区 —— 已标注 `[独有]` 并入 |
| 附件断言被推翻 | 「use-share-page.ts:80 路径不存在」为**假**（文件存在，80 行即 enhancePreview）；其「需修正 #1/#3/#5」针对的是另一份计划而非我方报告 |
| 附件的合理修正（我方已采纳） | 冲突重试不成立→dirty 保留+重新定位；单根化四件套；javascript: 理由改外部请求面；「永久失联」收窄为「body 被改后失联」 |
| 不成立的指控 | date-picker 缺 Intl（已合规）；'No Status' 硬编码文案（有 i18n 映射）；甘特进度可 >100%（Math.min 钳住） |

---

## 八、建议施工批次（合并版）

**第一批 · 止血（P0 + 安全最小集）**：#1 单根化四件套 → #4 日历 status → #5 hooks 位置 → #2 outline→json 升级 → #3 冲突未保存态 → #12 PDF → #9 GET 鉴权 → #11 URL 白名单 → #10 删除接线 + kanbanName → #6 落点错位 → #22 死操作三条 → #24 分组双匹配 + 甘特控件 → #7/#8 undo 作用域 + ErrorBoundary。

**第二批 · 持久化与性能**：#19 视图态落盘 + 死字段处置 → #20 分组/批量泛化 → #13 commitData 稳定化 + dragover 合帧 → #14 图表三件套 → #16 debounce/全选 → #17 标题草稿 + 合并窗口 → #23 ID 生成 → #28 令牌与对比度 → #27 死代码 → #10 存量回收（Cron 前缀 + 删笔记联动；**先拍板是否并轨 attachments**）。

**第三批 · 独立 app 完整度**：#20 表格 schema 驱动列 → #21 分享/导出/放映快照通道 → #26+#29 浮层/控件/a11y 专项 → #30 i18n → #31 门禁收口 → #25 产品差距清单排 roadmap。

**每批收尾验证**：

```bash
npm run typecheck && npm run test:unit
npm run comments:check && npm run i18n:check && npm run hardcoded:check
npm run tokens:check && npm run size:check && npm run surfaces:check
npm run test:e2e && npm run contrast:check
```

---

## 九、验证证据与局限（如实声明）

- 所有 file:line 均来自本次会话直接读码与 `grep -r` 复核，可复现；share/export/放映无 kanban 挂载经 `grep -rln -i kanban features/presentation/` 为空确认。
- hooks 早退（#5）jsdom 实测：未崩溃，仅 React 内部错误日志；**浏览器真机行为未验证**。
- 71 条现有 kanban 单测在审查全程保持绿色；工作区无残留（scratch 测试文件已删）。
- 未执行的验证：`npm run test:e2e`、`contrast:check`（需本地起实例）；性能条目（500 卡帧耗时）为代码路径推断，落地时须按「先写能失败的复现测试」补实测。
