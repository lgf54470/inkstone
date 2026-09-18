# 看板模块改进执行计划（kanban improvement plan）

> 依据：`review.md`（合并版审查总报告，31 项台账）。分支：`kanban-improvement-qoder-qwen38f`（自 `dev` 53824e3c）。
> 约定：每个条目 = 一个原子提交；顺序执行；每项先写能失败的复现测试，修复后跑回归（typecheck + 相关单测 + 受影响门禁）再提交，提交后更新本文件状态。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）

## 基线

- [x] BASE-0 创建 worktree + `node_modules` 软链 + 复制 review.md
- [x] BASE-1 基线门禁全绿确认（typecheck / 全量 test:unit 1644 通过；首跑 1 个失败套件为 worktree 缺 blog-frontend/node_modules，软链后通过）

## 第一批 · 止血（P0 + 安全最小集，按风险从小到大）

- [x] K-01 日历「新建」把 dateStr 写进 status → 改传日期字段（review #4；`kanban-calendar-view.tsx:12,122,140`、`kanban-root-hooks.ts:240-258`）— 含 handleAddItem 去 string 联合、新增 handleAddItemInGroup 按 groupBy 归组（board 顺带修正 groupBy≠status 时误写 status）
- [x] K-02 详情弹窗早 return 后调 hooks → 拆外层判空 + Body（review #5；`kanban-item-detail.tsx:250-253`）
- [x] K-03 PDF 预览被 CSP（`object-src 'none'`）挡死 → 移除 `<object>`，新标签打开 + 图片/文本内联（review #12）
- [x] K-04 筛选开启时拖拽落点错位 → 落点契约改 pivot 锚定（review #6；`kanban-board-dnd.ts:35-53`）
- [x] K-05 子任务「复制名称」clipboard 无 catch → `?.` 守卫 + then/catch + toast（review #22c；`kanban-subtask-menu.tsx:81`）
- [x] K-06 「转换为项目」实现为提升子任务→顶级卡；「打开子任务」死路径移除（review #22a/b）
- [x] K-07 text/plain 拖拽兜底无校验 → 校验 data-item-id（review #18）
- [x] K-08 分组只按 id 匹配 → id/label 双匹配（review #20a；`filter-sort.ts:136`）
- [x] K-09 ID `Date.now()` 碰撞 → 不可碰撞生成（review #23）
- [x] K-10 头部进度条口径 → 传筛选后 items（review 共识#15）
- [x] K-11 undo 快捷键作用域 → 绑定实例容器、焦点归属判定（review #7；`kanban-history.ts:47-69`）
- [x] K-12 KanbanRoot ErrorBoundary（review #8；`registry.ts:143-151`）
- [x] K-13 全屏单根化四件套（review #1；moveInto + is-fullscreen 类 + 高度契约 + 内联占位 + 透传；含 Ctrl+Z 单实例化）
- [x] K-14 outline 写回升级 JSON + parse 正则吞标题修复（review #2）
- [ ] K-15 冲突写回保留 dirty + 「未保存 · 重试/放弃」（review #3）
- [ ] K-16 GET /api/kanban/file 鉴权 + DELETE metadata 缺失即拒（review #9；worker `kanban.ts:74,115`）
- [ ] K-17 `safeKanbanUrl()` 协议白名单 + normalize 清洗（review #11）
- [ ] K-18 附件删除接线 `deleteKanbanFile` + `kanbanName` 透传（review #10 删除侧）
- [ ] K-19 上传 MIME 白名单/配额/节流对齐 organizer（review #10 增量）
- [ ] K-20 甘特进度隐藏交互 → 可键盘进度控件（review #24b）
- [ ] K-21 排序与拖拽静默冲突 → 明确反馈（review #24a）
- [ ] K-22 详情标题每键提交 → 草稿 + Enter/blur（review #17）
- [ ] K-23 hover-only 控件空白行 → 绝对定位叠加/常显（review 共识16）
- [ ] K-24 子任务「复制名称」以外的 UI 微调（view-tabs timeline/gantt 图标区分）（review #29 局部）

## 第二批 · 持久化与性能

- [ ] K1-01 `commitData` 函数式更新去 `state.data` 依赖 + 回调稳定化（review #13）
- [ ] K1-02 dragover 同 cardId+position bail（review #13）
- [ ] K1-03 视图状态按 viewId 持久化 + 7 死字段接线或删除（review #19）
- [ ] K1-04 新建分组/批量泛化到 `activeView.groupBy`（review #20b）
- [ ] K1-05 图表 dataset memo + 主题跟随 + i18n + ARIA（review #14）
- [ ] K1-06 搜索 debounce/`useDeferredValue` + 表格全选一次 set（review #16）
- [ ] K1-07 `--kanban-tag-*`/chart 色板接令牌 + contrast 门禁（review #28；含 text-white×10、!important×2）
- [ ] K1-08 死代码清理（entry.dark/locale、useMemo[props]、files.remove）（review #27）
- [ ] K1-09 R2 存量孤儿回收（Cron 扫 kanban/ 前缀 + 删笔记联动）（review #10 存量）

## 第三批 · 完整度与规范收敛

- [ ] K2-01 表格 columns schema 驱动列（review #20c）
- [ ] K2-02 分享/导出/放映 kanban 快照通道（review #21）
- [ ] K2-03 浮层/控件迁移 overlay + a11y 专项（review #26/#29）
- [ ] K2-04 i18n 平台键/周起始/句子拼接/借键清理（review #30）
- [ ] K2-05 surfaces/e2e-visual/axe 纳入全屏看板场景（review #31）

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-18 | BASE-0/BASE-1 + plan/review 登记 | 9b282dce | typecheck ✅，kanban 61 测试 ✅ |
| 2026-09-18 | K-01 日历/分组新建落字段 | 980c9926（软链误入库由 a7c5444d 移除） | 新增 kanban-add-operations.test.ts 5/5 ✅（先红后绿），全量 test:unit 1644 ✅，typecheck ✅ |
| 2026-09-18 | K-02 详情弹窗 hooks 早退 | e3f09756 | 新增 kanban-item-detail.test.ts 2/2 ✅（修复前捕获 "Internal React error: Expected static flag was missing"，修复后归零），kanban 68 测试 ✅，typecheck/size/escape ✅ |
| 2026-09-18 | K-03 PDF 预览去 `<object>` | b365a151 | 新增 kanban-file-preview-modal.test.ts 2/2 ✅（修复前 object 存在为红），typecheck/tokens/hardcoded ✅ |
| 2026-09-18 | K-04 拖拽落点 pivot 锚定 | 572bf9b8 | dnd.test.ts 重写为 pivot 契约 + 筛选/after/自拖 3 条回归 ✅（先红后绿），kanban 73 测试 ✅，全量 test:unit 1652 ✅，typecheck ✅ |
| 2026-09-18 | K-05 复制名称 clipboard 兜底 | 1e934632 | 新增 kanban-subtask-menu.test.ts 3/3 ✅（修复前无 clipboard 即同步抛错为红），kanban 76 测试 ✅，全量 test:unit 1655 ✅，typecheck/size ✅ |
| 2026-09-18 | K-06 子任务死操作 | a45ddda2 | 新增 kanban-convert-subtask.test.ts 7/7 ✅（先红后绿），kanban 83 测试 ✅，全量 test:unit 1662 ✅，typecheck/size/i18n ✅ |
| 2026-09-18 | K-07 拖拽落点归属校验 | 889d584c | 新增 kanban-board-dnd.test.ts 5/5 ✅（3 例外部拖入先红后绿），kanban 88 测试 ✅，全量 test:unit 1667 ✅，typecheck/size/escape/comments/i18n ✅ |
| 2026-09-18 | K-08 分组 id/label 双匹配 | 67feb0e6 | filter-sort.test.ts 新增 1 例 ✅（先红后绿：label 存值归 in_progress 组、乱值仍进 No Status），kanban 89 测试 ✅，全量 test:unit 212 文件 ✅，typecheck/size/comments ✅ |
| 2026-09-18 | K-09 ID 防碰撞生成 | 70dffabc | 新增 id.test.ts 2/2 ✅（先红：模块不存在即失败；2000 连击无重复），9 处 Date.now 生成点全部接线，kanban 91 测试 ✅，全量 test:unit 213 文件 ✅，typecheck/size/comments ✅ |
| 2026-09-18 | K-10 进度条改可见口径 | 451d8bfc | 新增 kanban-header.test.ts 2/2 ✅（先红：筛选态仍按全量算 50%），header 增 visibleItems 并由 root 传 viewData.items，kanban 93 测试 ✅，全量 test:unit 214 文件 ✅，typecheck/size/escape/comments ✅ |
| 2026-09-18 | K-11 undo 快捷键绑实例容器 | 73b05d10 | 新增 kanban-history.test.ts 3/3 ✅（先红 2：body 触发与他板隔离；修复后全绿），keydown 从 window 改绑 containerRef，root 容器 tabIndex=-1 承接空白点击焦点，kanban 96 测试 ✅，preview 套件 149 ✅，全量 test:unit 215 文件 ✅，typecheck/size/comments ✅ |
| 2026-09-18 | K-12 实例 ErrorBoundary | 02d3cc3b | 新增 registry-error-boundary.test.ts 2/2 ✅（先红 1：注入抛错后无错误态；修复后显示源码+提示、健康板不受影响），registry 渲染统一包 KanbanRootBoundary，kanban 98 测试 ✅，全量 test:unit 216 文件 ✅，typecheck/size/escape/hardcoded/comments ✅ |
| 2026-09-18 | K-13 全屏单根化四件套 | 9329eced | 新增 2 例单根测试（先红：overlay 内无活 canvas/内联无 h2；修复后 moveInto/moveBack、is-fullscreen 类、占位不塌、退出钮走 onCloseFullscreen、撤销栈跨搬移）✅，全屏二次根删除，搬移后重渲染走微任务防与 commit 抢跑，kanban 98+preview 153 ✅，全量 test:unit 216 文件 1679 测试 ✅，typecheck/size/comments/i18n/全部门禁 ✅ |
| 2026-09-18 | K-14 outline 写回升级 JSON + 方括号标题转义 | 本次提交（hash 由下一次提交回填） | 新增 write.test.ts 2 例 + outline.test.ts 转义往返 1 例（先红后绿）：flushKanbanEntry 首次写回把 outline 栅栏升级为 JSON，子任务/附件/views/标题不再静默丢弃；parse 两处正则加 (?<!\\) 反向断言并在 cleanText 还原 \[ \]，serialize 对标题转义方括号。mindmap 式「转换为 JSON/大纲」菜单动作与 undo toast 未纳入本提交（另项跟进）。kanban+preview 30 文件 156 ✅，全量 test:unit 217 文件 1682 测试 ✅，typecheck/size/comments/全部门禁 ✅ |
