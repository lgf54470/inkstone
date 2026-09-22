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

### K-02 删列无撤销提示，整列卡片落「No Status」 → 已修（`（本提交）`）
- 证据：`ui/kanban-column-menu.tsx`（删除项直接 `onDelete()`）；`ui/kanban-column-hooks.ts:21-32` `deleteColumnFromData` 把该列卡片的分组值置 `undefined`。
- 影响：一次点击让数十张卡失去分组，仅靠 Ctrl+Z。
- 进度：新增 `useKanbanGroupDeletion`（`ui/kanban-column-hooks.ts`），分组删除从此报出「多少张卡片已归入未分组」并交出与 Ctrl+Z 同一条 undo；`useKanbanColumnOperations` 改对象传参（新增 data/undo 两个依赖，避免四参数）；文档里不存在的分组不再提交空步。顺带发现：表格 schema 的「删属性列」（`schemaOps.deleteColumn`）**本来就有** undo toast（既有 `preview.kanban_column_deleted`），故新键按本模块分组语汇取名 `preview.kanban_group_deleted(_cards)`，与 en 的 'Delete Group'/'Group options' 一致，不与属性列那条混用。
- 验证：`kanban-view-state.test.ts` +3 例（有卡的分组报数量且 undo 真能还原；无卡分组不带数量；不存在的分组不提交不吭声），修复前三例均红。

### K-03 附件删除与撤销冲突，撤销留下悬空文件 → 已修（`（本提交）`）
- 证据：`ui/kanban-files-cell.tsx` 摘引用（可撤销的 `commitData`）后立即 `deleteKanbanFile` 真删 R2 对象。
- 影响：Ctrl+Z 恢复引用，对象已不在 → 预览/下载 404 的幽灵附件。
- 选型（用户裁定 2026-09-22）：**立即永久删除 + 确认框**，与笔记附件（`features/attachments/attachment-drive-modal/hooks.ts` 的 `deleteFileFlow`）口径一致。曾评估但未采纳：①「只摘引用 + 交给 `worker/attachments/kanban-reclaim.ts` 孤儿回收」——撤销永远安全，但会把 `DELETE /api/kanban/file/...` 变成无人调用的端点（按规范需连带删除它与 4 条安全测试，还会让旧客户端/PWA 走到 404）；②「前端延迟窗口后真删」——保留端点但只收窄而非根治窗口。
- 进度：`ui/kanban-files-cell.tsx` 的 `handleDelete` 改为「先确认再动」，用仓内 `components/overlay` 的 `confirm()`（Modal 外壳、焦点陷阱、ESC、danger 确认钮），标题带文件名、说明写明「永久删除、无法恢复」；确认后才摘引用并真删对象，成功后补 `tone:'success'` 反馈（此前只有失败有 toast，成功静默）。**外站 URL 的附件既不弹确认也不请求服务端**：那里没有本应用的对象可删，弹「永久删除」是假话。
- 验证：`ui/kanban-files-cell.test.ts` 8 例（新增 3 例先红后绿：确认参数逐字匹配且确认后才删对象；取消时引用/对象/toast 三者都不动；成功后报 success），既有 3 例保持绿（「外站 URL」一例补断言 `confirm` 未被调用）。typecheck ✅；kanban+preview+tests/kanban 88 文件 992 passed ✅。
- 残留（如实登记，不夹带）：撤销/重做仍可能恢复出指向已删对象的引用——`history` 快照里本就存着那份数据，删除不重写历史。其降级显示（「文件已不可用」）并入 **K-08**，同一处 `ui/kanban-file-preview-modal.tsx` 的失败态一并做。

### K-04 全屏期间栅栏被删 → 覆盖层停在空舞台 → 待修
- 证据：`registry.ts` `disposeEntry` + `ui/kanban-fullscreen.tsx`（`moveBack` 只在卸载时跑）；`features/preview/use-kanban-blocks.ts` 的 `fullscreen` 状态无人清理。
- 影响：边开全屏边在编辑器删掉整块栅栏 → 空全屏、无提示。

### K-05 CSV 导出无 BOM（中文乱码） → 已修（`（本提交）`）
- 证据：`kanban/csv.ts` `kanbanToCsv` 直接 `join('\n')`；仓内既有约定 `features/share/share-helpers.ts:167` 明确加 `\uFEFF`。
- 影响：Windows Excel 双击导出文件即乱码。
- 进度：`kanban/csv.ts` 新增 `UTF8_BOM` 常量，`kanbanToCsv` 输出首部前置（与 share 模块同一手法）。BOM 属于「文件」而非「行」，且读回侧 `parseKanbanCsv` 本就会剥掉它，所以「导出 → 再导入」往返不变形；`kanbanToCsv` 的唯一生产调用方是导出面板（已 grep 确认，worker/MCP/blog 均无第二处），改动面收敛。
- 验证：`csv.test.ts` +1 例（首字符 0xFEFF，且往返读回时标题不带该字符）、`ui/kanban-csv.test.ts` +1 例（下载文本首字符 0xFEFF），两例先红后绿；两处 raw 字符串断言改为显式带上 BOM；两个文件 50 passed，kanban+preview+tests/kanban 88 文件 994 passed。

### K-06 CSV 导出无公式注入防护 → 已修（`（本提交）`）
- 证据：`kanban/csv.ts` `escapeCsvCell` 只处理 `"`/CR/LF；`=`/`+`/`-`/`@` 开头原样落盘（`lib/export-note.ts:26` 直接下载）。
- 影响：共享 → 导出 → 第三方打开的链上触发公式/外链。
- 方案依据（今日实抓 OWASP [CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)，非凭记忆）：需拦截的首字符为 `=`/`+`/`-`/`@`/TAB/CR/LF（并额外指出全角 `＝＋－＠` 在部分 CJK 环境同样被当公式）；**单引号前缀被该页明确标注为「不可靠」**（Excel 重新保存后会去掉引号让公式复活），其推荐的 Excel 抗性做法是「在引号内的字段前缀 TAB（0x09）」；同时提醒必须处理分隔符与引号（否则危险字符可被挤到下一格行首）。
- 进度：`kanban/csv.ts` 新增 `FORMULA_LEAD`（含全角变体；`-` 仅当整格不是纯数字时才拦——`-5` 是数值不是表达式，且 `-2+3+cmd|…` 这类载荷仍被拦）与 `FORMULA_MARK`（`\t`）；`escapeCsvCell` 先打标记再把 `\t` 纳入需加引号的字符集，保证「标记在引号内」。分隔符/引号挤出下一格的向量由既有的「含 `,`/`"`/CR/LF 即整体加引号」挡掉（本次为 `\t` 补上同一入口）。
- 取舍（明写）：TAB 与前缀单引号相比，Excel 里不可见且不可被重存撤销；代价是「数据里真的多一个 TAB」——本模块自己的导入侧 `trimmed()` 会把它洗掉，故「导出→再导入」往返仍得到原文（已有测试钉住）；第三方程序化解析会看到该 TAB（OWASP 亦标注此取舍）。
- 验证：`csv.test.ts` 新增 `the cells a spreadsheet must not run` 3 例——标记例先红后绿（5 种首字符逐字断言 + `"\t=1+2"` 断言标记落在引号内），另两例为护栏：纯负数 `-5` 不得被打标记、往返读回标题与正文与原文一致（若改用单引号前缀，后者会立即转红）。53 passed。

## 2. P1 — 安全与隐私

### K-07 封面/附件图片绕过「外部图片」策略 → 已修（`（本提交）`）
- 证据：正文双闸门（`lib/markdown/renderer/media.ts:26-45` 占位 + `referrerpolicy=no-referrer`；`worker/app.ts:67,86` 按设置裁剪 `img-src`）；看板侧 `ui/kanban-gallery-view.tsx:38-52`、`ui/kanban-file-preview-modal.tsx:91` 直接 `<img src>` 且无 `referrerpolicy`。
- 影响：关闭外部图片时破图无说明；开启时封面可被第三方当像素追踪。
- 落地方式（选型）：**不**在看板里写第二套判定。判定提到新叶模块 `lib/markdown/external-images.ts`（原 `renderer/media.ts` 的私有函数搬过去，`media.ts` 改 import），原因是 `renderer/fence.ts` 已 import 看板模块，看板反向 import `renderer/index.ts` 会闭合成环；叶模块两侧皆可 import，`deep-imports:check` 也不报（`lib/markdown/` 无 `index.ts`）。看板侧新增 `ui/kanban-image-policy.tsx`：`useKanbanImageAllowed(url)` 经 `useSession` 读 `preview.externalImages`（设置面板一改即重绘已在屏的封面，不是刷新才变）+ `KanbanBlockedImage` 占位（复用正文同一条 i18n 键 `markdown.external_image_blocked`，带 `data-kanban-image-blocked`）。两处 `<img>` 无论是否放行都补 `referrerPolicy='no-referrer'`（对齐 `media.ts` 与 `link-dynamic-icon.tsx` 的既有手法）。
- 验证：`kanban-gallery-cover.test.ts` 4→7 例、`kanban-file-preview-modal.test.ts` 2→6 例（新增组先红 5 例：外站封面仍发请求、外站预览仍发请求、两处未设 `referrerpolicy`、放行后仍被拦）；既有两例 lazy/decoding 夹具从外站 URL 改为同类源 URL，因为旧夹具恰好编码了「外站也直连」这一旧行为；`renderer.test.ts` 32 例未动仍绿，证明判定搬家未改正文行为。全套 kanban+preview+tests/kanban 94 文件 **1024** passed，13 项静态门禁 exit=0。

### K-28（本轮新增，跨模块）笔记附件预览的图像同样无策略/无 referrer → 待修（不在看板范围）
- 证据：`features/preview/file-preview-modal/file-preview-views.tsx:70` 的 `<img>` 既未问 `preview.externalImages` 也未设 `referrerpolicy`，与 K-07 是同一类缺陷、不同模块。
- 建议：K-07 的 `KanbanBlockedImage`/判定可直接复用（判定已在叶模块；占位若被第二个模块采用应提到公共组件层），随该模块自己的改动一起做，不在看板批次里夹带。

### K-08 文本附件预览失败静默 → 已修（`（本提交）`）
- 证据：`ui/kanban-file-preview-modal.tsx` `TextFilePreview` 的 `catch(() => setLoading(false))` → 空 `<pre>`。
- 影响：违反「加载中/失败/空」三态红线（CSP `connect-src 'self'` 与 FILES-KV 都会走这条）。
- 施工中额外发现（同一条链、同一处）：旧实现在**拿到 404 时照读 body**——已删除对象返回的错误页会被当成文件内容打印进面板，而 K-03 改成「确认后永久删除」后这正是最常见的落地场景。已并入本项修复（`if (!res.ok) throw`）。
- 落地方式：读动作抽为 `useKanbanTextRead`（`loading/ready/failed` + `attempt` 重试），组件只负责渲染；失败态统一用 `ReadFailed`（标题 + 提示 + 「重试」钮，走了 `components/primitives` 的 `Button`），空文件单独走 `preview.kanban_file_empty`（与失败区分，避免把「空」读成「坏」）；图像侧新增 `ImagePreview`，`onError` 时换成同一失败态且按 URL 作 key（换附件即清掉上一个文件的错误）。失败写 `console.warn('[inkstone] …')` 带 URL，不静默。双语 +4 键。
- 验证：`kanban-file-preview-modal.test.ts` 6→12 例，新增 6 例先红（读失败仍画空文档、404 body 被当成内容、无重试钮、空文件与失败未区分、允许加载的图加载失败仍留破图、断网拒绝）；`size:check` 两次拦下超长函数（生产 `TextFilePreview` 58 行 → 拆出 `useKanbanTextRead`；测试两个 describe 58/70 行 → 按「读到了什么 / 读不到时」与「策略 / 画不出来」各拆两段），均未 resnapshot 基线。kanban+preview+tests/kanban 94 文件 **1030** passed，13 项静态门禁 exit=0，白名单 660 文件 / 4479 条。

### K-09 跨源附件链接会导航离开应用 → 待修
- 证据：`ui/kanban-file-preview-modal.tsx` 的「下载」用 `<a href={file.url} download>` 且无 `target`；`kanban/url.ts` 允许 `http(s)`。
- 影响：跨源 `download` 被浏览器忽略 → 当前标签页被导航走。

### K-10 上传无客户端预检 → 待修
- 证据：`ui/kanban-files-cell.tsx` 直接上传；服务端已达标（`worker/routes/kanban.ts` 白名单/配额/节流）。
- 影响：超大/不支持文件要传完才被 413/429 拒。

### K-27（本轮新增，跨模块）分享访问日志导出的 CSV 同样无公式防护 → 待修（不在看板范围）
- 证据：`features/share/share-helpers.ts:150-167` `exportVisitsToCsv` 手写 CSV：只对 `noteTitle`/`referrer` 做引号加倍，**无公式前缀防护**，且 `slug`/`country`/`city`/`deviceType`/`os`/`browser` 等字段根本没加引号（含分隔符即错列）。
- 影响：访客可控的 `referrer`（浏览器可伪造）会原样落进导出文件，站主导出访问日志用 Excel 打开即触发同类公式/外链风险。
- 建议：与 K-06 共用同一份转义器（提出到 `src/shared/` 的 CSV 工具，参数化表头与收尾），不在看板改动里夹带；已登记，未施工。

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
