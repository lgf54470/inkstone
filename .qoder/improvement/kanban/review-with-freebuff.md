# 看板（```kanban）模块审查台账 · Freebuff 轮次

> 来源：2026-09-22 Freebuff 全量复审（读码核实到 file:line + 门禁实跑）。
> 基线：`kanban-improvement-qoder-qwen38f`，HEAD `6c4a81ba`；工作区干净。
> 关系：本台账是 `.qoder/improvement/kanban/review.md`（2026-09-18 第一轮 31 条）与 `plan.md`（六批施工）之后的**新一轮**增量台账。
> 前六批条目已逐条对回当前代码，确认落地；本台账只登记**当前仍然成立**的问题，编号 K-xx 独立于旧编号。
> 施工进度见同目录 `plan-with-freebuff.md`。

## 0. 结论摘要

| 维度 | 结论 |
| --- | --- |
| UI 规范 | 色彩/字号/圆角全部走令牌（`hardcoded:check` 绿）；扣分在控件体系：模块内 116 个裸 `<button>`，仅空板引导用 `Button` 原语；头部工具按钮恒 28px，未用 `IconButton` 的移动端 36px 档 |
| 信息表达 | 视觉层次/AA 标签色/逾期徽章/WIP 计数到位；缺口：搜索收起后无「筛选中」线索、标签筛选与会话态不一致、封面无 UI 写入 |
| 全屏完整度 | 骨架完整（8 视图/子任务/评论/附件/归档/WIP/泳道/CSV/模板/撤销）；真实差距：移动端不能搬卡、时间线/甘特固定 28 天、批量只有 3 项、封面只能手写 JSON |
| 性能 | 两处 per-render 工厂击穿整块看板 `memo`（每次提交全量重渲）；每 500ms 写回整篇笔记，成本线性于卡数 |
| 安全 | 服务端已达标；剩余在导出（CSV 公式注入、无 BOM）与图片策略不一致（封面绕过 `preview.externalImages`、缺 `referrerpolicy`） |

## 1. P1 — 正确性与数据完整性

### K-01 单卡删除既无确认也无撤销提示 → 已修（`（本提交）`）
- 证据：`ui/kanban-item-detail-fields.tsx:119-129`（Trash 紧邻「完成」）→ `ui/kanban-root-hooks.ts` `handleDeleteItem` 只 `commitData`；对比批量删除（`BATCH_DELETE_UNDO_TOAST_MS`）与删视图（`VIEW_DELETE_UNDO_TOAST_MS`）都有撤销 toast。
- 影响：最容易误触的破坏性动作反而是唯一静默的。
- 进度：新增 `useKanbanItemDeletion`（`ui/kanban-root-hooks.ts`）统一单卡删除：经 items ref 判存后提交 + `toastWithUndo('preview.kanban_card_deleted', history.undo, 8s)`，详情底栏与上下文菜单共用；归档面板的「彻底删除」同走这一条；三处重复的 8000 常量收成 `DESTRUCTIVE_UNDO_TOAST_MS`。顺带修掉「删除不存在的卡片也提交一次」的空步（旧实现会凭空压一条 undo 历史）。双语 +1 键。
- 验证：`kanban-view-state.test.ts` +2 例（先红：无 toast；不存在 id 仍提交）后绿，其中一例通过运行 toast 的 action 断言卡片真的回来（不是只看 toast 出现）。

### K-02 删列无撤销提示，整列卡片落「No Status」 → 待修
- 证据：`ui/kanban-column-menu.tsx`（删除项直接 `onDelete()`）；`ui/kanban-column-hooks.ts:21-32` `deleteColumnFromData` 把该列卡片的分组值置 `undefined`。
- 影响：一次点击让数十张卡失去分组，仅靠 Ctrl+Z。

### K-03 附件删除与撤销冲突，撤销留下悬空文件 → 待修
- 证据：`ui/kanban-files-cell.tsx` 摘引用（可撤销的 `commitData`）后立即 `deleteKanbanFile` 真删 R2 对象。
- 影响：Ctrl+Z 恢复引用，对象已不在 → 预览/下载 404 的幽灵附件。

### K-04 全屏期间栅栏被删 → 覆盖层停在空舞台 → 待修
- 证据：`registry.ts` `disposeEntry` + `ui/kanban-fullscreen.tsx`（`moveBack` 只在卸载时跑）；`features/preview/use-kanban-blocks.ts` 的 `fullscreen` 状态无人清理。
- 影响：边开全屏边在编辑器删掉整块栅栏 → 空全屏、无提示。

### K-05 CSV 导出无 BOM（中文乱码） → 待修
- 证据：`kanban/csv.ts` `kanbanToCsv` 直接 `join('\n')`；仓内既有约定 `features/share/share-helpers.ts:167` 明确加 `\uFEFF`。
- 影响：Windows Excel 双击导出文件即乱码。

### K-06 CSV 导出无公式注入防护 → 待修
- 证据：`kanban/csv.ts` `escapeCsvCell` 只处理 `"`/CR/LF；`=`/`+`/`-`/`@` 开头原样落盘（`lib/export-note.ts:26` 直接下载）。
- 影响：共享 → 导出 → 第三方打开的链上触发公式/外链。

## 2. P1 — 安全与隐私

### K-07 封面/附件图片绕过「外部图片」策略 → 待修
- 证据：正文双闸门（`lib/markdown/renderer/media.ts:26-45` 占位 + `referrerpolicy=no-referrer`；`worker/app.ts:67,86` 按设置裁剪 `img-src`）；看板侧 `ui/kanban-gallery-view.tsx:38-52`、`ui/kanban-file-preview-modal.tsx:91` 直接 `<img src>` 且无 `referrerpolicy`。
- 影响：关闭外部图片时破图无说明；开启时封面可被第三方当像素追踪。

### K-08 文本附件预览失败静默 → 待修
- 证据：`ui/kanban-file-preview-modal.tsx` `TextFilePreview` 的 `catch(() => setLoading(false))` → 空 `<pre>`。
- 影响：违反「加载中/失败/空」三态红线（CSP `connect-src 'self'` 与 FILES-KV 都会走这条）。

### K-09 跨源附件链接会导航离开应用 → 待修
- 证据：`ui/kanban-file-preview-modal.tsx` 的「下载」用 `<a href={file.url} download>` 且无 `target`；`kanban/url.ts` 允许 `http(s)`。
- 影响：跨源 `download` 被浏览器忽略 → 当前标签页被导航走。

### K-10 上传无客户端预检 → 待修
- 证据：`ui/kanban-files-cell.tsx` 直接上传；服务端已达标（`worker/routes/kanban.ts` 白名单/配额/节流）。
- 影响：超大/不支持文件要传完才被 413/429 拒。

## 3. P1 — 功能完整度（全屏＝独立 app）

### K-11 移动端无法搬卡，且无「移动到…」入口 → 待修
- 证据：拖拽只走 HTML5 DnD（`ui/kanban-board-dnd.ts`）；模块内 pointer/touch 仅列宽把手；上下文菜单无「移动到分组」；键盘路径只有 Alt+方向键，而 Alt+←/→ 是浏览器后退键（未验证能否 `preventDefault`）。
- 影响：手机/平板唯一搬卡方式是外接键盘。

### K-12 时间线/甘特固定 28 天窗口 → 待修
- 证据：`timeline-helpers.ts:22` `buildTimelineDays(7, 21)`，两视图 `useMemo(…, [])` 挂载算一次；`calculateTimelineBarGeometry` 直接 `left = startIdx * 48 + 4`。
- 影响：早于 −7 天的卡片得到负 left（不可见）；晚于 +21 天被裁；无日期卡片被画在「今天」；无缩放/跳转。

### K-13 选择与批量能力偏弱 → 待修
- 证据：`onToggleAll` 只接表格（`ui/kanban-table-view.tsx:76-81`）；看板/列表/画廊只能逐张勾选；批量条仅分组/归档/删除三项。
- 影响：换 20 张卡的负责人要点 20 次详情。

### K-14 `item.cover` 只读不写 → 待修
- 证据：`types.ts:95` 声明、`body.ts:33-34` 校验、`ui/kanban-gallery-view.tsx:38` 读取；全模块无写入点。
- 影响：封面只能手写 JSON。

### K-15 搜索/标签筛选的可见性与持久化不一致 → 待修
- 证据：`ui/kanban-search-box.tsx` 收起后无指示；`searchQuery/filters/sorts/cardSize/hiddenColumns` 已按视图落盘而 `selectedTags` 仍是 `useState`（`ui/kanban-root-hooks.ts`）；`useDebouncedSearch` 收起时未清待提交计时器。

### K-16 命令面板无看板命令 / 无卡片键盘导航 → 待修
- 证据：`features/command/*` 0 命中 kanban；卡片容器非焦点停靠点。

### K-17 移动端头部布局与触控目标 → 待修
- 证据：`ui/kanban-header.tsx` 仅一处响应式类；工具按钮固定 `size-7`（28px）对 `components/primitives.tsx` 的 `IconButton`（手机 36px）。

### K-18 仍缺的产品能力（登记 roadmap，不施工）
活动流/提醒（评论已有）、卡片依赖（甘特无连线）、卡片复制粘贴、列级排序、跨笔记「我的任务」汇总。

## 4. P1 — 性能（全屏）

### K-19 整块看板 `memo` 被 per-render 工厂击穿 → 待修
- 证据：`ui/kanban-root.tsx` 的 `BoardTableView`/`ListGalleryView` 每渲染新建 `writeItem`/`handleUpdateSubtasks`，表格路径每渲染新建 `kanbanPropertyWriter(props.data, …)`，逐层下发到 `memo` 的 `KanbanBoardView`/`KanbanBoardColumn`/`KanbanCard`；`KanbanHeader` 收到每渲染新建的 `state` 对象。
- 影响：每次提交重画窗口内全部卡片（≤30/列 × 列数）；`memo` 名存实亡。
- 风险：`plan.md` K2-01c1 记录过「writer 变稳定后语言不再重绘」，需先写回归确认。

### K-20 每次编辑写回整篇笔记，成本线性于板子大小 → 待修
- 证据：`write.ts` `flushKanbanEntry` → `serializeKanban(整板)` → `features/preview/kanban-sync.ts` `state.editContent(noteId, 整篇)`，debounce 仅 500ms。

### K-21 视图级像素门禁只覆盖表格视图 → 待修
- 证据：`scripts/e2e-visual.mjs` 的看板场景以 `[role="table"]` 为「内容已到」判据，其余 7 个视图从未打开。

## 5. P2 — 规范收敛

- **K-22** 116 个裸 `<button>`（模块内仅 1 处用 `Button`）；多数浮层自绘 `role='dialog'` 未走 `Menu`/`Popover`。→ 随功能改动逐文件迁移，不单开重构批。**待收敛**。
- **K-23** `kanban-card.tsx` 的 `div` + `onClick`（打开详情）+ `onKeyDown`，无 `role`/`tabIndex`，有键盘等价按钮。→ 加注释说明豁免。**待修**。
- **K-24** `kanban-card-header.tsx` 两处 `!important`（`group-hover/tag:!opacity-100`、`focus-visible:!opacity-100`）未按规则 12 注释原因。**已修**。
- **K-25** `session.title()` 对无标题板返回硬编码 `'Kanban'` 作覆盖层可访问名；CSV 表头固定英文 `Title`。**待修**（覆盖层名称走 i18n；CSV 表头由产品决定，另行登记）。

## 6. 局限与未验证项（如实声明）

- 本台账为读码 + 门禁实跑证据；第一轮自由审查期间**未运行** `test:e2e`、`e2e-visual.mjs`、`contrast:check`（需本地实例），也未在真浏览器验证 Alt+方向键与触摸拖拽——这两项在施工中按条目分别处理，未验证处逐条登记。
- K-20 的写回成本是代码路径推断 + `plan.md` K3-05 已有实测外推；落地以「同一文档 N 次写回的字节数」这类确定性量测为准，不用计时断言。
