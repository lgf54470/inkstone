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

### K-04 全屏期间栅栏被删 → 覆盖层停在空舞台 → 已修（`（本提交）`）
- 证据：`registry.ts` `disposeEntry` + `ui/kanban-fullscreen.tsx`（`moveBack` 只在卸载时跑）；`features/preview/use-kanban-blocks.ts` 的 `fullscreen` 状态无人清理。
- 影响：边开全屏边在编辑器删掉整块栅栏 → 空全屏、无提示，只能 Esc。
- 实现结构（为什么订阅放在 preview 而不在覆盖层）：覆盖层若 import `registry` 的 `subscribeKanbans` 会成环 —— `registry.ts` 已 import `./ui` 桶，而该桶 re-export `KanbanFullscreen`（`registry → ui/index → kanban-fullscreen → registry`）。因此「板子没了」这个事实由 registry 广播（`entry.disposed` + 仅在**裁剪路径** `notify`），由已持有公开入口的 `features/preview/use-kanban-blocks.ts` 订阅并关闭 + 解释。
- 细节：① `KanbanBlockEntry.disposed` 与 `KanbanSession.isAlive()`：状态而非纯拆卸动作；② 只在 `mountKanbans` 的裁剪循环里 notify —— `destroyKanbans`（整个预览卸载）也 dispose，但那是读者已知的自己离开，不该弹「看板被移除」；③ `attach/detachKanbanToOverlay` 对已 disposal 的 entry 直接 return，否则覆盖层自己的 effect cleanup 跑 `moveBack()` 时会把已拆的容器塞回占位符（那个位置可能已被新块占着）；④ 订阅放进 `useKanbanTeardown` 的同一个 effect，**先 unsubscribe 再 flush/destroy**，使顺序确定而非依赖 React 的清理次序。双语 +1 键 `preview.kanban_board_removed`。
- 验证：新增 `features/preview/kanban-dispose.test.ts` 4 例（三个断言先红：`isAlive` 不存在、覆盖层仍开着、无提示；第四例为护栏：离开笔记时不弹提示）；该文件用真实 `useKanbanBlocks` 驱动（不是桩），因此覆盖的是接线而非假设。**变异自检**：拿掉 `detachKanbanFromOverlay` 的 `disposed` 守卫后，恰好「容器不得被塞回」这例转红（1 failed / 3 passed），还原后 4/4；`size:check` 拦下首个 describe 67 行 → 按「disposal 是状态 / 容器归属 / 看板侧的关闭与解释」拆三个 describe，未 resnapshot。kanban+preview+tests/kanban 95 文件 **1039** passed，13 项静态门禁 exit=0。

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

### K-29（本轮新增，跨模块）标签筛选浮层的选中标记同样是字面 `‘✓’` → 待修（不在看板范围）
- 证据：`components/tag-filter-popover-views.tsx:50` 以 `{selected && <span>✓</span>}` 作选中标记；K-13a 在 `components/overlay/menu.tsx` 把它换成 `aria-hidden` 图标（行已是 `menuitemcheckbox`，`aria-checked` 已经报过一次），同一句话在该文件尚未适用，故作跨模块项登记。
- 建议：与 `menu.tsx` 同法（`lucide` 图标 + `aria-hidden`，或 `aria-hidden` 包住该 span），随筛选浮层自己的改动一起做。

### K-28（本轮新增，跨模块）笔记附件预览的图像同样无策略/无 referrer → 待修（不在看板范围）
- 证据：`features/preview/file-preview-modal/file-preview-views.tsx:70` 的 `<img>` 既未问 `preview.externalImages` 也未设 `referrerpolicy`，与 K-07 是同一类缺陷、不同模块。
- 建议：K-07 的 `KanbanBlockedImage`/判定可直接复用（判定已在叶模块；占位若被第二个模块采用应提到公共组件层），随该模块自己的改动一起做，不在看板批次里夹带。

### K-08 文本附件预览失败静默 → 已修（`（本提交）`）
- 证据：`ui/kanban-file-preview-modal.tsx` `TextFilePreview` 的 `catch(() => setLoading(false))` → 空 `<pre>`。
- 影响：违反「加载中/失败/空」三态红线（CSP `connect-src 'self'` 与 FILES-KV 都会走这条）。
- 施工中额外发现（同一条链、同一处）：旧实现在**拿到 404 时照读 body**——已删除对象返回的错误页会被当成文件内容打印进面板，而 K-03 改成「确认后永久删除」后这正是最常见的落地场景。已并入本项修复（`if (!res.ok) throw`）。
- 落地方式：读动作抽为 `useKanbanTextRead`（`loading/ready/failed` + `attempt` 重试），组件只负责渲染；失败态统一用 `ReadFailed`（标题 + 提示 + 「重试」钮，走了 `components/primitives` 的 `Button`），空文件单独走 `preview.kanban_file_empty`（与失败区分，避免把「空」读成「坏」）；图像侧新增 `ImagePreview`，`onError` 时换成同一失败态且按 URL 作 key（换附件即清掉上一个文件的错误）。失败写 `console.warn('[inkstone] …')` 带 URL，不静默。双语 +4 键。
- 验证：`kanban-file-preview-modal.test.ts` 6→12 例，新增 6 例先红（读失败仍画空文档、404 body 被当成内容、无重试钮、空文件与失败未区分、允许加载的图加载失败仍留破图、断网拒绝）；`size:check` 两次拦下超长函数（生产 `TextFilePreview` 58 行 → 拆出 `useKanbanTextRead`；测试两个 describe 58/70 行 → 按「读到了什么 / 读不到时」与「策略 / 画不出来」各拆两段），均未 resnapshot 基线。kanban+preview+tests/kanban 94 文件 **1030** passed，13 项静态门禁 exit=0，白名单 660 文件 / 4479 条。

### K-09 跨源附件链接会导航离开应用 → 已修（`（本提交）`）
- 证据：`ui/kanban-file-preview-modal.tsx` 的「下载」用 `<a href={file.url} download>` 且无 `target`；`kanban/url.ts` 允许 `http(s)`。
- 影响：跨源 `download` 被浏览器忽略 → 当前标签页被导航走（全屏看板随之一起消失，未保存的上下文全丢）。
- 选型：跨源附件**根本不提供下载钮**（留着也只会去导航，标签写着 Download 而行为是跳转属误导），只保留已有的「在新标签打开」；同类源（真正能下载的）不变。连同把共用判定从 `isExternalImageUrl` 正名为 `isCrossOriginUrl`——它现在同时决定「图片能不能加载」与「链接能不能当下载」，名字要说得对。
- 影响面清点：模块内仅三处 `href`，全在该文件（PDF 预览的「新标签打开」与页脚两个）。`ui/kanban-files-cell.tsx` 等只显示文件名，无链接。
- 验证：`kanban-file-preview-modal.test.ts` 12→14 例（同类源仍有 `download=文件名`、无 `target`；跨源无任何 `a[download]` 且指向该 URL 的链接全带 `target=_blank` + `noopener`），新增 1 例先红；`renderer.test.ts` 32 例与 `kanban-gallery-cover.test.ts` 7 例同跑绿，证正名未改行为。

### K-10 上传无客户端预检 → 已修（仅体积；类型无白名单可预检）
- 证据：`ui/kanban-files-cell.tsx` 直接上传；服务端已达标（`worker/routes/kanban.ts` 白名单/配额/节流）。
- 影响：超大/不支持文件要传完才被 413/429 拒。
- 核实后收窄的范围：服务端实际只硬拦一项——`file.size > LIMITS.attachmentMaxBytes`（25 MB）；类型不是白名单拒绝，而是 `safeAttachmentMime(bytes, file.type)` 嗅探改写存储 MIME（危险类型只在 GET 时降为 attachment 下载）。所以客户端做「类型预检」无源可依——自造一份白名单会在两边漂移，反而会拒掉服务端本会收的文件。配额同样无法预检：客户端既不知道账号已用量，也不知道后端是 R2 还是 KV（两个配额常量不同）。故本项只做体积，且用 `@shared/constants` 里**同一个** `LIMITS.attachmentMaxBytes`，不在看板里重写 25 MB。
- 进度：`ui/kanban-files-cell.tsx` 新增 `splitByUploadLimit`（在发第一个字节前分流；恰好等于上限算通过，与服务端「只有大于才拒」一致）与 `reportTooLarge`（danger toast，标题里的 MB 数由常量算出，限额变更自动跟随；描述列出被跳过的文件名）；全部超限时不调用 `onChangeFiles`（不写空提交）。双语 +1 键 `preview.kanban_file_too_large`。
- 验证：`kanban-files-cell.test.ts` 8→11 例（超限文件一个字节也不发且拒稿文案与限制值逐字匹配、部分超限时只传合规的那一个并只报一次、恰好等于上限不报）；**变异自检**：判定改成 `> 上限×2` 后恰好这两例转红（2 failed / 9 passed），还原后 11/11；`size:check` 拦下变长的 `handleUpload` → 拆出两个具名助手函数后 exit=0（未 resnapshot）。kanban+preview+tests/kanban 94 文件 **1035** passed，13 项静态门禁 exit=0。

### K-27（本轮新增，跨模块）分享访问日志导出的 CSV 同样无公式防护 → 待修（不在看板范围）
- 证据：`features/share/share-helpers.ts:150-167` `exportVisitsToCsv` 手写 CSV：只对 `noteTitle`/`referrer` 做引号加倍，**无公式前缀防护**，且 `slug`/`country`/`city`/`deviceType`/`os`/`browser` 等字段根本没加引号（含分隔符即错列）。
- 影响：访客可控的 `referrer`（浏览器可伪造）会原样落进导出文件，站主导出访问日志用 Excel 打开即触发同类公式/外链风险。
- 建议：与 K-06 共用同一份转义器（提出到 `src/shared/` 的 CSV 工具，参数化表头与收尾），不在看板改动里夹带；已登记，未施工。

## 3. P1 — 功能完整度（全屏＝独立 app）

### K-11 移动端无法搬卡，且无「移动到…」入口 → 已修（`（本提交）`）
- 证据：拖拽只走 HTML5 DnD（`ui/kanban-board-dnd.ts`）；模块内 pointer/touch 仅列宽把手；上下文菜单无「移动到分组」；键盘路径只有 Alt+方向键，而 Alt+←/→ 是浏览器后退键（未验证能否 `preventDefault`）。
- 影响：手机/平板唯一搬卡方式是外接键盘。
- 落地：
  - ① **两个坐标各得一个子菜单**。`ui/kanban-context-menu.tsx` 新增可选 `groupOptions` / `laneOptions` / `onMoveItemToGroup` / `onMoveItemToLane`，渲染两行 `submenuFor(...)`：分组行（`preview.kanban_move_to_column`，复用了此前没人用的死键并把 zh 的「移动到列」校成「分组」以对齐模块其余文案）与泳道行（新键 `preview.kanban_move_to_band`）；每行只在视图确有该轴且属性有选项时出现，卡当前所在的那一项用 `checked` 打勾（`role=menuitemcheckbox`）。**触屏可达性成立**：`Menu` 的 `handleClick` 对带 `submenu` 的行是「点一下展开」（不是 hover-only），子菜单行是真按钮，所以长按 → 移动到分组 → 点目标 是纯指针路径。
  - ② **写入走拖拽同一条路**（`ui/kanban-move-to-axes.ts`，为守 500 行从 `kanban-root-hooks.ts` 抽出）：两个 writer 都调 `moveItem`（即 `useMoveItemClearingSorts` 包装过的同一个 mover），所以排序清理、落到分组内顺序、一次手势一步撤销都与拖拽一致。坐标语义按拖拽对齐——**换分组不写泳道**（卡片画在哪条泳道是它自己的字段，写入的只有分组；板上有泳道时也不会跳行），**换泳道要带上当前分组**（`moveKanbanItemToCell` 会在你给的分组里重排，不给就会把卡片从原分组里挪走）；已目标即当前值时两个 writer 都直接返回，不给「点自己所在的勾选项」留一步空撤销。
  - ③ **快捷键改绑 Alt+方向键 → Shift+方向键**（`ui/kanban-card.tsx`）。Alt+←/→ 在 Windows/Linux 是浏览器后退/前进，靠 `preventDefault` 抢回来属于「赢在当下、输在某个版本」，不值得把卡片手势押上去；Shift 单键没有被任何浏览器加速键占用。同时补了当初缺的护栏：按键起点是输入框/文本域/`.cm-editor`（复用 `lib/hotkeys.ts` 的 `isEditableTarget`）时一律不管，否则改标题时 Shift+方向键选文字会顺带搬卡；无修饰键的裸方向键也不动手。
- 验证：`kanban-context-menu.test.ts` +4 例（列出分组/打勾/回报目标、缺宿主或空选项时不出现行、泳道轴的选项与回报、两行各自只在对应轴成立时出现）；`kanban-board-swimlanes.test.ts` +6 例走**真长按（`contextmenu` 事件）→ 点菜单行 → 点目标行**的渲染级路径（换分组保住泳道、目标分组里已有别行卡片时仍不换行、勾选态、同目标零提交、换泳道保住分组、无泳道时不给该行）；`kanban-move-announcement.test.ts` +2 例（裸方向键不动、字段内 Shift+方向键不动）。四个旧助手从 `altKey` 改成 `shiftKey`（改名 `pressShiftArrow*`）。两次变异逐一被杀：分组写入改带 `laneKey: '__none__'` → 2 例红；换泳道回显 `'__none__'` 而非当前分组 → 1 例红；去掉 `shiftKey` 与 `isEditableTarget` 两个护栏 → 各 1 例红。
- 遗留（登记不施工）：**真机（真实触屏设备）未验证**，本机没有可用的触屏设备，只有 jsdom 渲染级路径与共享 `Menu` 自身的用例；`item.cover` 与多选属性的分组写入仍是拖拽路径原有语义（多选分组字段上写入标量），菜单与拖拽共用同一 writer，没有引入新的不一致，但也未修正。

### K-12 时间线/甘特固定 28 天窗口 → 已修
- 证据：`timeline-helpers.ts:22` `buildTimelineDays(7, 21)`，两视图 `useMemo(…, [])` 挂载算一次；`calculateTimelineBarGeometry` 直接 `left = startIdx * 48 + 4`。
- 影响：早于 −7 天的卡片得到负 left（不可见）；晚于 +21 天被裁；无日期卡片被画在「今天」；无缩放/跳转。
- 复现（先红，旧实现）：早于窗口的卡片 `left = -3260`；晚于窗口的卡片右边缘 `4556` 对 1392 的网格。
- 进度：`buildTimelineDays` 换成 `buildTimelineRange({items, fields, zoom, baseDate, locale})`——窗口由卡片最早/最晚日推导（两侧各留 3 天），空板才用「今天前 7 / 后 21 天」的兜底；**今天始终落在窗口内**（过去板不会失去时间参照）；跨度超 400 天时截取今天前后的窗口并置 `clipped`，视图顶部按 `preview.kanban_timeline_clipped` 说明，而不是静默只画一部分。`calculateTimelineBarGeometry(item, range, fields)` 现在返回 `{left,width,clippedBefore,clippedAfter} | null`：无日期卡片**返回 null**（不再画在「今天」），越界的条截到边界并在视图上用直角表示被截；最窄条宽改为独立常量 `TIMELINE_MIN_BAR_WIDTH=8`（月刻度下 6px/天算不出负宽）。刻度 `day/week/month` 只改列宽与表头写入频率（日：每列写；周：仅周首写；月：仅月初写，一月带年份），周首由 `weekStartFor(locale)` 决定（与日历同源，不自己判语言）。无日期卡片改到网格下方的清单（`TimelineUndatedList`，带计数、可点开详情）。“回到今天”将网格滚到今天居中，刻度切换也会重新居中（换刻度就是换一套列，需重新定位），而卡片编辑引起的重算**不会**动读者的滚动位置。两视图共用 `ui/kanban-timeline-grid.tsx` 的 `useTimelineViewState`/表头/控件，缩放刻意不落盘（每次写都是整篇笔记的一次写回，见 K-20）。
- 验证：`timeline-helpers.test.ts` 改为新 API 18 例（窗口推导/今天就位/空板兜底/上限/越界裁剪/无日期返回 null/双向日期/配置字段与遗留回退/最小条宽/三种刻度的表头写入与外语文周首）+ 新增 `ui/kanban-timeline-view.test.ts` 7 例（视图级：远处卡片落在网格内且未被截断、今天有列、无日期卡片列在网格外并可点开、三档列宽与表头密度、今天控件滚动到 `todayIndex*dayWidth - clientWidth/2`、被截窗口会声明、正常板不声明）。变异：把区间改回固定窗口杀 5 例。

### K-13 选择与批量能力偏弱 → 已修（K-13a 选择 90b10948 / K-13b 批量字段 11a67a56）
- 证据：`onToggleAll` 只接表格（`ui/kanban-table-view.tsx:76-81`）；看板/列表/画廊只能逐张勾选；批量条仅分组/归档/删除三项。
- 影响：换 20 张卡的负责人要点 20 次详情。
- K-13a 落地（选择）：
  - ① **选择本组**：列菜单新增一个勾选框行（`ui/kanban-column-menu.tsx` 的 `selectAll` 可选项，`KanbanColumnHeader` / `KanbanBoardColumn` 逐层透传，只有整列（非泳道条）接）。选原生 checkbox 而不是普通按钮，因为它能说出「本组是否已全选」；勾上即整组一批提交（`group.items` 一次映射），取消即整组退出选择；组内无卡时禁用。`isAllSelected` 与 `onToggle` 由 `useColumnSelectAll()` 在列级算，与表格表头勾选框同一套 `computeSelectionAfterToggleAll` 语义。
  - ② **选择当前视图全部**：上下文菜单（卡片上右键/长按、或板上空白处）新增一行 `kanban-select-all-visible`，`checked` 表示「已全选」，点击切换；“可见”取的是 `filterSort.viewData.items`，所以搜索/筛选筛掉的卡片不会被顺手选中（这是与「全选整份文档」的关键差别，已有断言钉住）。
  - ③ 顺手修同一个变更里暴露的无障碍缺陷：`components/overlay/menu.tsx` 的选中标记原本是一段字面 `‘✓’` 文本，会进入行的可访问名（`aria-checked` 已经报过一次，于是被读两遍）。改为 `lucide` 的 `Check` 图标 + `aria-hidden`，与 `submenu.tsx` 子菜单行的写法一致。`tag-filter-popover-views.tsx:50` 有同一段写法，已在 review 末尾另行登记（不夹带）。
  - ④ 为守住 500 行，把两个覆盖层（详情面板与上下文菜单）从 `ui/kanban-root.tsx` 移到新文件 `ui/kanban-overlays.tsx`（纯搬迁，无行为变化）。
- K-13a 验证：新增 `ui/kanban-select-all.test.ts`（7 例，渲染级）——列菜单勾选框选中本列、不动其他列、勾选态与取消、可见集合受搜索限制（同时断言批量条计数为 2，因为未渲染的卡片无法从 DOM 看出）、已全选时的勾选态、再点一次清空、列表视图同样可达；`kanban-context-menu.test.ts` +4 例（两个分支都给出该行、勾选态与回调、位于批量步骤之后且在「清除选择」之前、宿主不支持时不出行）。四次变异逐一被杀：本列 id 取成当前选择、可见集合换成 `state.data.items`（先被漏掉，后靠批量条计数断言补上）、列菜单不接 `selectAll`。
- K-13b 落地（批量字段）：
  - ① 批量条只多一个入口：`ui/kanban-batch-bar.tsx` 新增可选 `edits`（`assignees` / `tags` / `onAssign` / `onAddTag` / `onSetDueDate`）与 `BatchEditsMenu`（共用 `Menu` + `submenuFor`，子菜单为 Portal，键盘/触屏路径都在组件里）。选菜单而不是再加三个 `<select>`：条子是浮在看板上的，每多一个控件就多盖一块卡片。
  - ② 写入器收进新模块 `ui/kanban-batch-edits.ts`：`handleBatchSetProperty`（负责人、到期日）、`handleBatchAddTag`（与卡上已有标签求并集，已有则不重复写）、`handleBatchGroupChange`（一并从 `kanban-root-hooks.ts` 搬过来，空的 selection 不再空提交）。字段写入**保留选择**（卡原地不动，读者可能还要接着设下一个字段），改分组仍然清空选择（卡搬走了，屏幕上剩下的不再是他刚才在弄的那批）——这一差别写在该模块的文件头注释里。
  - ③ 到期日给的是按天递进的选项（今天/明天/下周/清除）而不是日历：模块自己的 `kanban-date-picker` 是独立浮层，嵌进菜单面板会让两个浮层争 Escape 与外部点击；写的是与详情面板同一个 `dueDate` 键，`undefined` 即清空。
  - ④ 接线在 `ui/kanban-root.tsx` 的 `useKanbanBatchEditFields()`：人员列按 `type === 'person'` 找（不写死 `assignee`/`owner`，已用 `members` 列名钉住），名单取 `people[列 id]`；标签列仍按模块惯例取 `id === 'tags'`；字段缺失即不出该行，三个都缺则连入口都不出。
- K-13b 验证：新增 `ui/kanban-batch-edits.test.ts` 15 例：单元 6（指派写入与原子性、选择保留、标签求并集、重复不起作用、清到期日写 `undefined`、空集零提交）、批量条 6（无配置无入口、给了空字段就不出行、三个子菜单的标签与顺序、无字段配置时无入口、按天选项的顺序与明天实算、清除选项）、渲染级 2（从看板勾选两张卡→指派同一人；加标签后选择仍在且批量条计数不变）。三次变异逐一被杀：标签写入改成覆盖、去掉重复守卫、指派写死列 id。
- K-13 结案：选择能力与批量字段均已落地。

### K-14 `item.cover` 只读不写 → 已修（`（本提交）`）
- 落地：`ui/kanban-files-cell.tsx` 新增可选 `cover` / `onChangeCover` 两 prop（宿主不传则没有任何行显示封面动作）；只对图像文件给按钮（`isImageFile`，与画廊选图同一判定思路），带 `aria-pressed` 与逐文件的 `aria-label`（用文件名的 i18n 键，不靠图标说话）；点已为封面的那一行则传 `undefined`（移除封面，回到「画廊用第一张图」的默认）。接线在详情面板（`ui/kanban-item-detail-fields.tsx` 传 `item.cover` 与 `onUpdate({ ...item, cover })`），与文件增删同一条可撤销提交路径。表格的文件格不接：那里是快速改值的列，把封面动作同时塞进去会让同名按钮在一行里出现两次（已在 review 登记这一取舍）。双语 +2 键。
- 验证：`kanban-files-cell.test.ts` 11→14 例（图像行给出动作并回报所选 URL、非图像行不给、宿主不传时一行都没有），前两例先红；`size:check` 两次拦下超长函数（生产 `KanbanFilesCell` 54 行 → 抽出 `FileRows`；测试 57 行 describe → 拆两段），均未 resnapshot。
- 证据：`types.ts:95` 声明、`body.ts:33-34` 校验、`ui/kanban-gallery-view.tsx:38` 读取；全模块无写入点。
- 影响：封面只能手写 JSON。

### K-15 搜索/标签筛选的可见性与持久化不一致 → 已修（`（本提交）`）
- 逐条核实（一处报告与实际不符，已写明）：
  - ① 搜索收起后无「筛选中」线索 → **成立，且来源比报告更具体**：搜索框根本没有收起控件（`isOpen` 只能由 false 变 true），所以「收起且有查询」的真实场景是**重新打开板子**——`searchQuery` 按视图落盘、`isOpen` 是组件态且随重挂载回到 false，于是读者打开旧板子时界面上只有一个搜索图标，实际已经在过滤。
  - ② 标签筛选与会话态不一致 → 成立，已统一到视图状态（见下）。
  - ③ 「debounce 待提交计时器在收起时未清」→ **不成立**：既然没有收起动作，计时器只会在组件卸载时作废，而卸载清理早已存在。本项不改行为，改为补一条护栏用例把它钉住（免得日后真加了收起控件时把它弄坏）。
- 证据：`ui/kanban-search-box.tsx` 收起后无指示；`searchQuery/filters/sorts/cardSize/hiddenColumns` 已按视图落盘而 `selectedTags` 仍是 `useState`（`ui/kanban-root-hooks.ts`）；`useDebouncedSearch` 收起时未清待提交计时器。
- 落地：`ui/kanban-search-box.tsx` 新增 `ActiveSearchChip`（折叠且 `searchQuery` 非空时替换裸图标：可点开继续编辑、可一键清除，名称走新键 `preview.kanban_clear_search`）；`KanbanView.selectedTags` 入库（`types.ts`）并由 `ui/kanban-view-state.ts` 读写（`EMPTY_TAGS` 保证未设置时引用稳定，与 filters/sorts 同一手法），`ui/kanban-root-hooks.ts` 删掉本地 `useState` 改用视图状态——`onToggleTag` 改从传入的 `selectedTags` 推导，避免闭包读到旧值。双语 +1 键。
- 验证：`kanban-search-and-select.test.ts` 7→10 例（新增组：折叠但仍在过滤时显示查询串与清除钮、清除回报空串；无查询时仍只是一枚图标；卸载时不给已走的框提交过滤），前两例先红、后两例为护栏；`kanban-view-state.test.ts` 新增 `the tag filter as view state` 三例（存入当前视图而不影响其他视图、从视图读回、未设置时引用稳定），前两例先红。`size:check` 拦下变长的搜索框组件与测试 describe → 各拆（`ActiveSearchChip`、测试按「折叠时 / 防抖」分组），未 resnapshot。kanban+preview+tests/kanban 95 文件 **1050** passed，13 项静态门禁 exit=0。

### K-16 命令面板无看板命令 / 无卡片键盘导航 → 已修（命令面板；卡片 roving 经复核不立项）
- 证据：`features/command/*` 0 命中 kanban；卡片容器非焦点停靠点。
- 进度：新增 `lib/markdown/kanban/surface-commands.ts`（模块级注册表：一块看板在屏幕上就登记一个**惰性读取器**而非快照，面板打开那一刻才回答）+ `ui/kanban-surface.ts`（`useKanbanSurface`，经 ref 持有最新 state，不因每次提交重新登记）；面板侧新增 `boardCommandItems`（新增卡片 / 逐个视图切换并标出当前视图 / 选择当前视图全部 / 仅在有选择与有历史时才给出清除·撤销·重做），组名取看板标题以便一块笔记里多块板互相区分。视图图标由 `kanbanViewIcon` 统一导出，两处不会漂。归属判定：多块板同时在场时只有焦点所在的那块回答，只有一块时无需先点进去。
- 卡片 `tabIndex` roving focus **不立项**（复核结论）：卡片的指针热区已有键盘等价物（卡上的详情钮 + 上下文菜单 + Shift+方向键搬卡），`axe` 也据此通过；再加一层 roving tabindex 会引入第二个焦点模型与第二套快捷键语义，收益是要少按几次 Tab，代价是卡片内部控件的焦点顺序要重新定义。已在本条目登记为有意取舍，留待「卡片级键盘导航」作为独立设计题。

### K-17 移动端头部布局与触控目标 → 已修
- 证据：`ui/kanban-header.tsx` 仅一处响应式类；工具按钮固定 `size-7`（28px）对 `components/primitives.tsx` 的 `IconButton`（手机 36px）。
- 进度：动作行加 `data-kanban-actions` 并改为 `flex-wrap`（而不是报告里建议的横向滚动——过滤/排序/选项面板都是 `absolute top-full` 挂在这一行上的，行一旦成为滚动容器就会把它们裁掉）；`filter`/`sort`/`group-by`/`csv`/`new item` 的花字在 `md` 以下收起并同时补上 `aria-label`（收起文字不得连名字一起收起）；`archive`/`csv` 触发器改走 `Button size='sm'`；搜索钮（含筛选 chip 与展开后的输入框）、写状态 chip 及其两个按钮改到同一高度档（`h-9`/`size-9` + `md:` 回落）；视图标签与两个管理钮同样上到项目刻度。`undo`/`redo` 仍为裸 `<button>`：`IconButton` 有意不收 `title`，而这两钮的 native 提示（`kanban_undo_shortcut` 三例既有断言）就是功能本身，故按同尺寸档写开并注明理由。头文件 517→398 行，把全屏标题的「标题↔输入框」两半抽成 `ui/kanban-fullscreen-title.tsx`。
- 验证：4 例新测试——动作行内「每一个只靠图标的控件」都满足手机目标且有可访问名；点名 7 个控件同时满足手机/桌面两档；收起的文字仍在且带 `hidden md:inline`；行会换行、且从面板沿祖先链向上到 `[data-kanban-header]` 无任何 `overflow-*` 裁剪容器。变异自检：把搜索钮改回 `size-7` 恰好杀 2 例。

### K-18 仍缺的产品能力（登记 roadmap，不施工）
活动流/提醒（评论已有）、卡片依赖（甘特无连线）、卡片复制粘贴、列级排序、跨笔记「我的任务」汇总。

## 4. P1 — 性能（全屏）

### K-19 整块看板 `memo` 被 per-render 工厂击穿 → 已修（比台账写的更深一层）
- 证据：`ui/kanban-root.tsx` 的 `BoardTableView`/`ListGalleryView` 每渲染新建 `writeItem`/`handleUpdateSubtasks`，表格路径每渲染新建 `kanbanPropertyWriter(props.data, …)`，逐层下发到 `memo` 的 `KanbanBoardView`/`KanbanBoardColumn`/`KanbanCard`。
- 影响：每次提交重画窗口内全部卡片（≤30/列 × 列数）；`memo` 名存实亡。
- 复核发现（台账低估）：把 writer 稳住并**不能**让「勾一张卡只重画那张」成立——`ui/kanban-board-view.tsx` 里列级还有一层：`ColumnCardsList` 给每张卡传两个包装闭包（`onDragStart`/`onMoveColumn`，而卡片本就拿得到自己的 id）、`ExpandedBoardColumn` 每次渲染重建全部列内处理器，`useKanbanBoardMoves` 的 `handleMoveItem`/`handleMoveCell` 也是每渲染新建。任何一层没稳住，`memo` 就整列失效。
- 进度：① 单卡字段写入收到 `useKanbanValueWrites`（新模块 `ui/kanban-value-writes.ts`）——一律用 `commitData((prev) => …)` 的更新器形式从**提交时**的文档构建，因此 identity 与渲染无关，顺带去掉 `data` 捕获（旧写法把当次渲染的副本写回，是潜在丢更新点）；② 列内处理器收到新模块 `ui/kanban-cell-handlers.ts` 的 `useColumnCellHandlers`（按 cell 的两个键 + 稳定回调 memo，cell 对象在 memo 内重建，因为板子每次渲染都发新的对象字面量）；③ `useKanbanBoardMoves` 的 mover 改 ref + `useCallback`（板子在渲染期间就把分组算完了，mover 只该在调用时读最新分组）；④ `ColumnCardsList` 去掉两个多余包装（卡片自己把 id 交给 handler）；⑤ 甘特进度条改为走同一个 `handleUpdateProperty`（不再在渲染里 map 整份 items）。
- 验证：`ui/kanban-repaint-scope.test.ts`（新）用 `memo` 包住**真实**卡片计数（包一层非 memo 的计数器只能测到“父组件又渲染了元素”，测不到 memo 是否生效，这一版修正了该测量口径）：打开一张卡的详情 → 0 张重画；勾选一张卡 → 只重画那一张；另两例钉住 writer identity 与写入形状。三次变异逐一被杀。
- 历史风险复核：`plan.md` K2-01c1 记录的「writer 变稳后语言不再重绘」在今天的结构下不再成立——`tests/kanban-locale-repaint-policy.test.ts` 已强制每个 `memo` 组件自行订阅 locale，三个 locale 回归文件（`registry-locale`、`kanban-memo-locale`、`tests/kanban-locale-repaint-policy`）均未改仍绿。

### K-20 每次编辑写回整篇笔记，成本线性于板子大小 → 已核实：**不是缺陷**（先量后改，自适应静默期裁定不取，改守预算）
- 证据：`write.ts` `flushKanbanEntry` → `serializeKanban(整板)` → `features/preview/kanban-sync.ts` `state.editContent(noteId, 整篇)`，debounce 500ms。
- **实测（确定性，无计时断言）**：新增 `write.test.ts` 的 7 例用假时钟数「写回次数」与「每次写回的字节数」：
  - 滑块扫 12 步（每步 120ms）→ **1 次写回**；卡片连攞 12 个格子（每步 40ms）→ **1 次**；提交后内容与笔记里一致（重复点当前视图页签、拖回原格）→ **0 次**。结论：成本是「**每个手势一次**」而非「每次编辑一次」——debounce 被后续编辑重置，连续手势只在停手后写一次。台账原文的「每半秒一次 MB 级写回」是误判，已改正。
  - 手势之间隔着 700ms（debounce 拦不住）→ 6 个手势写 6 次；每个手势都是读者完成的一次完整编辑，跳过它就是在卡片崩溃/失焦时真的丢数据。
  - 每次写回的栅栏体积（beautified JSON）：20 卡 7,285 B、50 卡 14,935 B、200 卡 53,385 B，≈**256 B/卡**。
- **裁定：不用自适应延长静默期**（台账 ① 不取）。我先按台账写了个 500/1500/3000ms 的三层方案并实测：连续 5 秒的编辑从「停手后写 1 次」变成「期间写 1～3 次」，而单次手势的滞写从 0.5s 拉长到最多 3s——任何“在手势进行中写”的方案都只能减少「手势间隔 > debounce」那种情形的次数，代价是滞写变长。用数据安全换写回次数，恰是 AGENTS「不牺牲当前可用性」不允许的方向，故**回退，未入库**。
- **保留的产物**：把「一个手势一次写回」变成可执行的契约——`write.ts` 的注释 + `write.test.ts` 的计数用例（下一个想改静默期的人必须先看到这张表），另加两条**栅栏体积预算**（200 卡 < 64 KiB；增量 < 320 B/卡），拦住“往每张卡里写没人读的字段”这类使成本翻倍的改动。
- 未采纳两项（登记结论）：② 超大板提示（预算与实测表明成本并未失控；真要提醒应做成看板头部的一行状态而非弹窗，属产品决策）；③ 卡片级栅栏（格式级变更，属公共契约，需另立 ADR）。

### K-21 视图级像素门禁只覆盖表格视图 → 已修（8 个视图全部打开；实跑又漏出一处会误伤的断言）
- 证据：`scripts/e2e-visual.mjs` 的看板场景以 `[role="table"]` 为「内容已到」判据，其余 7 个视图从未打开。
- 进度：`ui/kanban-root.tsx` 的 `role='tabpanel'` 上新增 `data-kanban-view-type`——列表/日历/时间轴/甘特图/画廊都画卡片，「有卡片」证明不了是哪个视图画的，「这个视图的面板里有它自己的东西」才能；脚本里 `KANBAN_VIEWS` 逐个点名（页签双语名 + 该视图独有的选择器：看板 `[data-kanban-board]`、表格 `[role=table]`、图表 `canvas`、其余 `[data-item-id]`），`assertKanbanViews` 每个视图断言两件事：**该视图面板内**画出了自己的内容，且顶栏高度与打开前一致（头部不得随视图切换长大或抖动）。fixture 补上 `startDate`/`endDate`/`progress`（相对今天的日期，否则日历/时间轴/甘特图会随时间漂出区间）——K-12 重建过的两个视图因此第一次被真正读到。
- 附带修正（实跑撞出来的）：① 脚本原先按 `.ink-prose [data-kanban]` 取「那块板」，但覆盖层是**借**走内联画布而不是拷贝——一打开卡片就离开块，靠卡片标记定位的写法会立刻失效，故改为「打开前找到自己写的那块板 → 记下 `data-kanban-index` → 之后按序号定位」，并补一条 `the note still holds the block the overlay borrowed from`；② `canvases`/`reserve` 两处原本数全文档，笔记里若存有另一块板就会误伤，改为只数自己那块 + 覆盖层。
- 验证：浏览器门禁 **234 passed / 0 failed**（看板 37 条，新增 17 条）；变异自检：把日历视图改成 `return null` 后恰好只杀「日历视图自己画了东西」一条，顶栏高度那条仍绿。

## 5. P2 — 规范收敛

- **K-22** 116 个裸 `<button>`（模块内仅 1 处用 `Button`）；多数浮层自绘 `role='dialog'` 未走 `Menu`/`Popover`。→ 随功能改动逐文件迁移，不单开重构批。**待收敛**。
- **K-23** 已修（`（本提交）`）：`kanban-card.tsx` 的容器仍保持 `div` + 指针热区，但把豁免写成了注释：为何不加 `role`/`tabIndex`（会给同一动作多一个无名称控件与一个重复的 tab 停靠点）、键盘路径是 CardHeader 的详情钮、`onKeyDown` 靠子元素冒泡才能到达、Alt+方向搬卡在菜单里也有等价入口——即按 AGENTS 规则 10 登记的**有理由**豁免，而非默认忽略。
- **K-24** 已修（`（本提交）`）：`kanban-card-header.tsx` 标签删除钮的两处 `!important` 按规则 12 补注释：同一元素上 `group-hover/card` 与 `group-hover/tag` 特异度相同，Tailwind 的发射顺序决定谁赢，故用 `!` 钉住「悬停标签本身时删除钮必须全不透明」；两处都只作用在该元素上，不外溢。
- **K-25** 已修（`（本提交）`）：无标题板的覆盖层名称不再来自硬编码。追下去发现根因比报告里写的深一层——读出来的是 `outline.ts` 在「大纲体→JSON」解析时写的 `title: 'Kanban'`，即**双语/可本地化之前就已把英文名当数据**，而首次 JSON 编辑会把它写进笔记（以后每块被升级的大纲板都叫 Kanban）。故修两处：`outline.ts` 不再造标题（大纲体本来就没有标题），`session.title()` 无标题时返回 `''` 交给调用方（`ui/kanban-fullscreen.tsx` 已有的 `|| t('preview.kanban_fullscreen')` 回退即刻生效）。CSV 表头仍固定英文 `Title`（属导出格式：本地化表头会与导入侧对称性冲突，需产品决定，另登记）。验证：`kanban-fullscreen.test.ts` +2 例（无标题板 `title()` 为空且回退到本地化文案、有标题板仍用自身标题），无标题一例先红；`outline.test.ts` 中原本断言 `title === 'Kanban'` 的一例改为 `toBeUndefined()`（旧断言恰好钉住了这个行为）。

### L-04（本轮新增，跨模块）`e2e.mjs` 的「reindex 不能覆盖编辑器写入」在本机两个全新实例上均失败 → 登记不夹带
- 证据：`scripts/e2e.mjs:329-350` 并发提交 `POST /api/search/reindex` 与 `PATCH /api/notes/:id`，随后断言索引里是编辑后的内容；本机两次全新实例（第一次未捕获行号，第二次为 `reindex=200 edit=200`）结果为 `175 passed / 1 failed`，且仅这一条失败。
- 判定：该路径为 worker 搜索/FTS 重索引，与本轮改动面（`src/client/lib/markdown/kanban/**`、locale、`components/overlay/menu.tsx`）无交集；`npm run test:unit` 与 `tests/` 449 例均绿。可能是本机 workerd 下两个并发请求的到达顺序与 CI 不同。
- 建议：由持有搜索/FTS 上下文的人单独复核（竞态断言本身是否对环境敏感），本批不夹带（AGENTS 规则 14）。

## 6. 局限与未验证项（如实声明）

- 本台账为读码 + 门禁实跑证据；第一轮自由审查期间**未运行** `test:e2e`、`e2e-visual.mjs`、`contrast:check`（需本地实例），也未在真浏览器验证移动键与触摸拖拽——这两项在施工中按条目分别处理，未验证处逐条登记。
- 已更新（2026-09-22 施工期）：本机已具备完整浏览器门禁（`node_modules` 软链 + `/usr/bin/google-chrome`），`e2e-visual.mjs` 已跑通 **216 passed / 0 failed**（K-17 结案时记录）；仅 `e2e.mjs` 的 reindex 竞态一条在本机失败，已登记为 L-04。
- 已更新（2026-09-23 收尾，同一全新实例上按 CI 顺序全跑）：`typecheck` ✅；`test:unit` **289 文件 / 2700 测试全绿**；14 项静态门禁（含 `surfaces`/`vendor`/`size`/`i18n`/`tokens` 与 blog 两项）全绿；`e2e-visual.mjs` **234 passed / 0 failed**（含 K-21 的八视图扫描）；`e2e.mjs` **175 passed / 1 failed**（唯一失败即 L-04，与 HEAD 同签名）；`check-contrast.mjs` 失败仅剩 **L-01 的 2 例**（导图全屏第二遍 axe），其余全部通过：两套主题 7 强调色 × 各表面层级量测 0 低于 AA、外壳/命令面板/设置三表面的 axe 两主题均无违规无未审项。L-01 已于 `plan.md` 复核结案到「库 `bgOverlap` + 门禁规则」层面（猜测证伪、证据齐全），不夹带修。
- K-20 的写回成本是代码路径推断 + `plan.md` K3-05 已有实测外推；落地以「同一文档 N 次写回的字节数」这类确定性量测为准，不用计时断言。
