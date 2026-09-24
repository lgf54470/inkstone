# 看板模块改进执行计划 · Trae glm53f 轮次

> 依据：2026-09-24 对 `plan-with-freebuff_glm53f.md` 全部条目（G-01…G-19）逐条源码核实，并入同日 Trae 全模块复审增量发现（T-01…T-06）。
> 基线：`dev`，HEAD `24bef793`。
> 施工原则：逐项修复 → 先写能失败的复现测试 → 跑回归与门禁 → 单项提交（Conventional Commits，scope `kanban`/`api`，正文逐文件）→ **同一次提交内更新本文件进度日志**。源码注释有增删的提交，先跑 `node scripts/sync-comments-allowlist.mjs` 重建白名单再过 `comments:check`。
> 与旧计划的关系：承接 `plan-with-freebuff_glm53f.md` 的 G-01…G-19（编号沿用），新增 T-01…T-06；两份旧计划（K-01…K-31、G 系列）已结案条目不再重复。
> 每项收尾的验证命令见文末「固定验证」。

## 核实结论摘要

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| G-01 | ✅ 成立 | `kanban-calendar-view.tsx:29,36` 月份标题硬编码 `{year} - {padMonth}`，未走 Intl |
| G-02 | ✅ 成立 | `kanban-card-title.tsx:27` `KANBAN_TITLE_OPEN_DELAY_MS = 250`；重命名已有铅笔按钮（:105）与 F2（:67）两条替代路径；`e2e-visual.mjs:3026-3085` 与 `kanban-card.test.ts:172,257` 钉的是旧契约，需同提交重写 |
| G-03 | ✅ 成立 | 悬停控件一律 `opacity-0 group-hover/card:opacity-100`（`kanban-card-header.tsx:57,98,161,188`、`kanban-card-title.tsx:109`），触屏无 hover 即不可达 |
| G-04 | ✅ 成立 | timeline 侧栏与图表全量 map（`kanban-timeline-view.tsx:48,98`）、gantt 侧栏全量 map（`kanban-gantt-view.tsx:98`），`useKanbanRenderWindow` 未接入 |
| G-05 | ✅ 成立 | `kanban-csv.tsx:172` `await file.text()` 无字节上限 |
| G-06 | ✅ 成立 | 删除是硬删 + 8 秒内存撤销（`kanban-item-deletion.ts`）；`archive.ts` 只有 `archived` 旗标，无删除分区；toast 过期或关笔记后不可恢复 |
| G-07 | ✅ 成立 | `kanban-board-keys.ts:26-33` Chord 表无 Delete/Backspace 命令 |
| G-08 | ✅ 成立 | `worker/routes/kanban.ts:39-60` 每次上传全量分页 list R2 桶核算配额，且 kanban 上传不写 `attachments` 行 |
| G-09 | ✅ 成立 | `worker/routes/kanban.ts:175-194` DELETE 无 `consumeAttemptBudget` |
| G-10 | ❌ 不成立，结案 | 搜索 200ms 防抖（`kanban-search-box.tsx:7`）+ 写回 500ms 防抖（`write.ts`），搜索为 view 类 commit 不进步栈，无逐字符写放大 |
| G-11 | ✅ 成立 | `kanban-view-tabs.tsx:261-286` 页签无自带筛选标记 |
| G-12 | ✅ 成立 | `kanban-column-header.tsx` 无数值求和 |
| G-13 | ✅ 成立 | `kanban-card.tsx:43-78` CardFooter 无依赖/被阻塞徽标 |
| G-14 | ✅ 成立 | `kanban-chart-view.tsx:229-233` canvas 仅 `role='img'`，无点击下钻 |
| G-15 | ✅ 成立 | `kanban-icon-badge.tsx:55` 非法图标值原样渲染，无截断 |
| G-16 | ✅ 成立 | `kanban-search-box.tsx:112` 输入框固定 `w-28` |
| G-17 | ❌ 不成立，结案 | `column-width.ts:20-29` `clampKanbanColumnWidth` 已钳制 [64,960] 且丢弃非数字 |
| G-18 | ✅ 成立 | 日历仅月份导航；`getMonthWeeks`/周结构可复用 |
| G-19 | ⚠️ 现状未超限，预防性立项 | `check-size.baseline.json` 无看板条目（全部 ≤500 行），但 `kanban-root.tsx` 494 行、`kanban-header.tsx` 482 行贴边；批次 2/3/4 的增量必然越限，先纯移动拆分腾空间 |
| T-01 | ✅ 成立（Trae 复审） | `status`/`priority`/`tags` 按约定 id 硬编码散布 10+ 处（`kanban-card.tsx:112-115`、`kanban-list-view.tsx:311-313`、`kanban-gallery-view.tsx:269-271`、`kanban-item-detail.tsx:377-379`、`kanban-progress-bar.tsx:34`、`kanban-tag-filter-bar.tsx:19`、`kanban-table-group.tsx:104`、`kanban-root.tsx:356`）；最糟一处 `kanban-root-hooks.ts:249` 快捷加卡兜底写死 `'todo'` 幽灵值。`view-ops.ts:30-32` 已有通用推导但未导出复用 |
| T-02 | ✅ 成立（Trae 复审） | `kanban-gantt-view.tsx:71` Slider `onChange` 每步直连 `commitData`（step=5，拖一次 = ~20 步 undo + 20 次全量派生重算 + 全视图重渲染） |
| T-03 | ✅ 成立（Trae 复审） | `kanban-progress-bar.tsx:82-96` 纯 div 序列无 role/aria-label（a11y 红线），:88 以 index 为 key |
| T-04 | ✅ 成立（Trae 复审） | `kanban-sort-popover.tsx:112`、`kanban-filter-popover.tsx:234` 以 index 为可变列表 key |
| T-05 | ✅ 成立（Trae 复审，并入 G-05） | `csv.ts:271` 导入的 `item.content` 绕过 description 5000 字符钳制，单 cell 无长度上限 |
| T-06 | ✅ 成立（Trae 复审） | `url.ts:7` `safeKanbanUrl` 白名单含 `blob:`（当前模块无 createObjectURL，暂不可利用，白名单应最小化） |

## 批次 1 · 止血与规范（小改，互不依赖）

- [x] T-06 `safeKanbanUrl` 的 `blob:` 核实修正：demo 后端上传依赖它（`demo/backend/routes/files.ts:122`），移除会令 demo 栅栏整体进错误态；改为注释固化保留理由 + 测试钉住（原「移除」立项作废）
- [x] T-04 sort/filter 弹层 index key 换稳定 id（`kanban-list-keys.ts` 内容寻址 + 同内容出现序，sort/filter 两弹层接入；T-03 将复用）
- [x] T-03 进度条 `role='img'` + aria-label 汇总（新 key `preview.kanban_status_summary` 双语）+ key 接 `kanbanStableKeys`、子段 aria-hidden
- [x] G-15 非法图标值截断（`clampIconText` 按 Intl.Segmenter 字素簇钳制 3 簇，ZWJ emoji 不切碎；lucide: 前缀不受影响）
- [x] G-16 搜索框聚焦展开加宽（w-28 → focus:w-48，width 200ms 过渡）
- [x] G-01 日历月份标题 Intl 本地化（`Intl.DateTimeFormat(年+long月, UTC)`，zh「2026年9月」/en「September 2026」，双语测试钉住）
- [x] G-03 触屏悬停控件常显（11 处 `opacity-0` 显形控件追加 `pointer-coarse:!opacity-100`，已验证产物 CSS 编译出 `@media (pointer: coarse)`）
- [x] G-02 卡片单击立即打开详情（移除 250ms 等待与 dblclick 重命名；重命名走铅笔按钮 + F2；`kanban-card.test.ts`/`kanban-board-keys.test.ts`/`e2e-visual.mjs` 断言重写到新契约）
- [x] G-20（本轮新增，修复先在性缺陷）：全屏页签条「选中页签滚出可视盒」——根因：strip 无定位，`tab.offsetLeft` 相对外层 positioned 祖先（全屏 stage）读出 130 而非 strip 内偏移 0，reveal 误判右溢出把首 tab 滚出左缘（scrollLeft=130+64−179=15）；修复 = strip 加 `relative` 使其成为 offsetParent（offsetLeft 契约）+ ResizeObserver 在条带尺寸无 render 变化时重跑揭示（DOM 迁移不触发 effect 的自愈）+ 回归测试。修复后 e2e-visual 534/0 全绿

## 批次 2 · 正确性与性能（核心缺陷）

- [x] G-19 预防性拆分：视图渲染器族（KanbanViewRendererProps 接口 + Timeline/BoardTable/ListGallery/Renderer 四组件，174 行）纯移动到 `kanban-view-renderer.tsx`；`kanban-root.tsx` 494→302 行，行为零改动（kanban-item-detail.tsx 461 行未动——批次 3/4 不再向其加行，留着观察）
- [x] T-01 三件套列解析统一：`view-ops.ts` 导出 `kanbanStatusColumn/kanbanPriorityColumn/kanbanTagsColumn`（约定 id → 类型推导 → 无，priority/tags 跳过兄弟已占列），替换 12 处 UI 硬编码（card/list/gallery/item-detail/detail-fields 读写/tag-filter-bar 计数/table-group/header/root 批量编辑/root-hooks 快捷加卡/progress-bar 按列 id 读值/calendar）；幽灵 `'todo'` 改为「推导不到就不写属性」；语义层（outline 格式、isKanbanItemDone、tagMatch、chart 分组维度）保持约定键并记录理由
- [x] T-02 gantt 进度滑杆 commit-on-release：拖动中本地草稿值，pointerup/keyup/blur 一次 commit（拖 0→100 从 ~20 步 undo 降为 1 步）；gantt 测试重写到新契约
- [x] G-04 timeline/gantt 接入渲染窗口：单窗口同时切侧栏与图表行（同索引保持对齐），范围计算仍读全量（日头需覆盖全部日期）；`TimelineUndatedList` 内置窗口（标题计全量）；预算测试天花板收紧钉住窗口（timeline 30 卡/700 节点、gantt 30 卡/1200 节点）

## 批次 3 · 数据安全（客户端 + 服务端）

- [x] G-05+T-05 CSV 导入体积预拒（`KANBAN_CSV_MAX_BYTES = 2MB`，chooser 读前按 file.size 拒绝、解析器对已读文本二次设防）+ 导入 `content` 钳制到 `KANBAN_DESCRIPTION_MAX_CHARS`（5000，常量移至 body.ts 统一来源）；双语拒绝文案
- [x] G-06 删除改软删：`deleted` 旗标（仅字面 `true` 生效，与 `archived` 同规），归档面板分「已归档 / 已删除」两区，已删除可恢复（清两旗标回看板）或永久清除（项目 confirm 弹窗，danger tone）；视图/计数/静态快照/CSV 导出经 `kanbanActiveItems` 自动排除；恢复语义 = 回到看板而非归档架
- [x] G-07 键盘 Delete/Backspace 移除聚焦卡片（接 G-06 软删语义，进 Chord 表与快捷键卡）
- [x] G-08 附件配额改 D1 核算：kanban 上传写 `attachments` 行、删除删行，配额只查 D1；移除每次上传全量 list R2（存量无行对象按少计处理，注释说明）
- [x] G-09 DELETE 接口节流（复用 `consumeAttemptBudget`）

## 批次 4 · 功能增强

- [x] G-11 页签标注视图自带筛选（带 filters/sorts/search/tags 的页签加圆点提示 + aria）
- [x] G-13 卡片依赖徽标（board 卡 footer 显示被阻塞计数，点击开详情）
- [x] G-12 列头数值汇总（视图可选 number 列求和，列头显示 Σ）
- [ ] G-14 图表点击下钻为过滤（点击柱/扇区写入该视图 filters，与快捷过滤 chip 同路径）
- [ ] G-18 日历周视图（月/周切换，复用 `getMonthWeeks` 周结构与事件段几何）

## 核实结案（不改代码）

- G-10 搜索写放大：不成立（G-10 证据行），无代码改动
- G-17 表格列最小宽：`clampKanbanColumnWidth` 已覆盖，无代码改动

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-24 | 核实 G-01…G-19（17 成立 / 2 结案 / G-19 预防性）并整合 Trae 复审 T-01…T-06，建立本轮台账 | （本提交） | 文档提交，无代码改动；工作区干净，分支 dev |
| 2026-09-24 | T-06：blob: 核实为 demo 上传依赖，改为注释固化 + 测试钉住 | 37150c0e | url.test 7 通过；typecheck/comments/hardcoded/size 通过；allowlist 重建（8201 条） |
| 2026-09-24 | T-04：新增 kanbanStableKeys 内容寻址 key，sort/filter 弹层接入 | 0cf29cc0 | list-keys/filter-popover 13 测试通过；typecheck/comments/style/i18n/size 通过；allowlist 8202 条 |
| 2026-09-24 | T-03：进度条可访问名（role=img + 双语汇总 key）与稳定 key | ec9dd2df | progress-bar 2 测试通过；typecheck/i18n/comments/style/size 通过；allowlist 8205 条 |
| 2026-09-24 | G-15：图标徽标按字素簇截断，防长值撑破卡片 | 5efc044b | icon-badge/option-names 19 测试通过；typecheck/comments/size 通过；allowlist 8210 条 |
| 2026-09-24 | G-16：搜索框聚焦加宽（本行台账在下一次提交内补记，原应同提交） | 14c32c45 | style/hardcoded/typecheck 通过；无新增测试（纯 CSS 过渡） |
| 2026-09-24 | G-01：日历月份标题按 locale 格式化（含 UTC 时区防偏移） | 6591fb73 | calendar/view-rows 11 测试通过；typecheck/comments 通过；allowlist 8212 条 |
| 2026-09-24 | G-03：触屏控件常显（11 处 pointer-coarse 变体，build 产物验证） | 3fbb9272 | card/header 36 测试通过；typecheck 通过；build 产物 CSS 含 pointer: coarse 规则 |
| 2026-09-24 | G-02：单击即开详情，重命名收敛到铅笔+F2；e2e 断言重写 | 4b49ee31 | kanban 全模块 106 文件 1312 测试通过；preview 集成 20 用例全绿；e2e.mjs 177/0；e2e-visual 533/1（唯一失败为先在性 tab 几何，基线同签名复现）；contrast:check 通过 |
| 2026-09-24 | G-20：修复全屏页签条 offsetLeft 误判滚动（strip 补 relative + ResizeObserver 自愈） | 45de5175 | view-tabs 40 测试通过；e2e-visual 534/0 全绿（干净实例） |
| 2026-09-24 | G-19：视图渲染器族纯移动拆出，root 494→302 行 | 见 git log | root/keys/fullscreen 26 测试通过；typecheck/size/style/deep-imports/comments 通过 |
| 2026-09-24 | T-01：三件套列解析统一，12 处 UI 硬编码替换，幽灵 todo 消除 | 50b3b4d3 | view-ops/add-operations/preview 116 测试通过（含 3 个新解析器用例 + 2 个幽灵值回归）；typecheck/i18n/comments/size 通过 |
| 2026-09-24 | T-02：gantt 滑杆草稿式拖动、释放一次提交 | 00dc0fca | gantt 5 测试通过；typecheck/comments/style 通过 |
| 2026-09-24 | G-04：timeline/gantt 接渲染窗口（侧栏+图表同切点），预算钉住 | 2bf8d6cd | kanban+preview 120 文件 1395 用例全绿；预算 10/10（timeline/gantt 收紧至窗口）；typecheck/comments/style/size 通过 |
| 2026-09-24 | G-05+T-05：CSV 体积预拒 + content 钳制，描述上限常量归位 body.ts | 36fd2e03 | csv/ui-csv 61 测试通过（新增 2）；typecheck/i18n 通过 |
| 2026-09-24 | G-06：软删除 + 归档面板分区（恢复/永久清除带 confirm） | 见 git log | kanban+preview 120 文件 1401 用例全绿（archive 新增 5 用例）；typecheck/i18n/comments/style/size 通过 |
| 2026-09-24 | G-07：键盘 Delete/Backspace 软删聚焦卡（走 handleDeleteItem，undo 返回）；chord 表 + 快捷键卡自动派生 | 96043237 | board-keys/shortcuts/view-state 55 测试通过（新增 3 用例 + 字段守卫断言）；kanban 全模块 106 文件 1328 用例全绿；typecheck/i18n/comments/style/size/escape/empty-catch/module-state/deep-imports 通过；allowlist 8274 条；size 基线重照（locale 501→502 行） |
| 2026-09-24 | G-08：kanban 附件配额改 D1 台账核算（上传写 attachments 行、删除删行、行失败回滚对象），移除每次上传全量 list R2；存量无行对象按少计 | d7e5ff5b | routes/orphan-reclaim/url-fields/attachment-* 5 文件 65 测试通过（route 新增 4 用例：台账写入、配额不再 list 桶、行失败回滚、删除删行）；typecheck/comments/style/size/escape/empty-catch/module-state/deep-imports/i18n 通过；上传 handler 超 50 行按职责拆出 storeKanbanAttachment，无需 size 豁免 |
| 2026-09-24 | G-09：DELETE 接口节流（`LIMITS.attachmentDeletesPerHour = 300`，复用 consumeAttemptBudget）；enforceUploadThrottle 泛化为 enforceKanbanThrottle 供上传/删除共用 | e248bad4 | kanban-routes 16 测试通过（新增 429 用例：预算耗尽拒删、不触 R2 与台账）；typecheck/comments/style/size/escape/empty-catch/module-state/deep-imports/i18n 通过 |
| 2026-09-24 | G-11：视图页签自带状态标注——`kanbanViewCarriesState` 判定 filters/sorts/searchQuery/selectedTags，页签画强调色圆点 + sr-only 双语文案 | 9baab1ea | view-tabs 42 测试通过（新增 2 用例：仅带状态视图有圆点、空白搜索不算）；typecheck/i18n/comments/style/hardcoded/size 通过；size 基线重照（zh-CN preview 502→503 行） |
| 2026-09-24 | G-12：视图级 `sumBy` 数值汇总——列头 Σ 胶囊（可见 Σ 数字 + sr-only 句子命名来源列），视图选项 Sum 选择器（仅 number 列、失效钉住同 swimlane 规则）；SumBySection 拆独立文件避免 size 豁免 | 见 git log | kanban+preview 107 文件 1335 用例全绿（新增 kanban-column-sum 5 用例：求和含数字字符串/跳过空值、页签胶囊、选择器双向）；typecheck/i18n/comments/style/hardcoded/size/deep-imports 通过（27 豁免无新增） |
| 2026-09-24 | G-13：卡片依赖徽标——`kanbanBlockedCounts` 全文档计等待者数，board 卡 footer 渲染 Link2+计数按钮（aria-label 双语句子），点击开本卡详情（依赖编辑器所在处）；纯结构计数不做完成态推断（遵 ADR-0006） | （本提交） | dependency-ui/dependencies 26 测试通过（新增 board 徽标场景：2 等待者计数、无等待者无徽标、点击开详情）；kanban+preview 107 文件 1336 用例全绿；typecheck/i18n（3529 keys）/comments/style/hardcoded/size 通过 |

## 固定验证

```bash
npm run typecheck
npx vitest run --config vitest.config.ts <相关文件>
npm run i18n:check && npm run comments:check && npm run hardcoded:check
npm run size:check && npm run tokens:check && npm run style:check
# 批次收尾 / 触碰视觉与交互断言时：
npm run test:unit
npm run test:e2e && node scripts/e2e-visual.mjs && npm run contrast:check
# 注释有增删时先重建白名单：
node scripts/sync-comments-allowlist.mjs
```
