# 看板模块改进执行计划 · Freebuff 轮次

> 依据：`review-with-freebuff.md`（2026-09-22 复审台账，K-01…K-25）。
> 基线：`kanban-improvement-qoder-qwen38f`，HEAD `6c4a81ba`。
> 施工原则：逐项修复 → 先写能失败的复现测试 → 跑回归与门禁 → 单项提交（Conventional Commits，正文逐文件）→ **同一次提交内更新本文件进度日志**。
> 与旧计划的关系：`plan.md`（六批）已结案；本文件只承接 K-xx 增量，不重复旧条目。
> 每项收尾的验证命令见文末「固定验证」。

## 批次 1 · 止血（正确性 + 安全最小集）

- [x] K-01 单卡删除撤销提示（`toastWithUndo`，对齐批量删除与删视图）
- [x] K-02 删列撤销提示（受影响卡数进文案）
- [x] K-05 CSV 导出补 BOM（Windows Excel 非 ASCII 乱码）
- [x] K-06 CSV 导出公式注入前缀（OWASP 制表符方案，含全角变体）
- [x] K-07 封面/附件图片走外部图片策略 + `referrerpolicy`
- [x] K-08 文本附件预览补失败态（含 K-03 残留：已删对象的 404 与图像加载失败降级）
- [x] K-09 跨源附件不提供下载钮（改由新标签打开，判定正名为 `isCrossOriginUrl`）
- [x] K-10 上传体积预检（与服务端同一份限额常量；类型/配额按核实结论不预检）
- [x] K-03 附件删除改「确认 + 永久删除」语义（用户裁定，对齐笔记附件）
- [x] K-04 全屏期间实例失效自恢复（board 离开笔记时关闭覆盖层并说明）

## 批次 2 · 交互与移动

- [x] K-11 卡片「移动到…」菜单（分组/泳道两个子菜单，触屏长按即达）+ 移动快捷键由 Alt+方向键改绑 Shift+方向键（真机触屏验证未做，见 progress 行）
- [ ] K-13 选择能力与批量字段
  - [x] K-13a 选择本组（列菜单勾选框）+ 选择当前视图全部（上下文菜单行）
  - [ ] K-13b 批量标签/负责人/到期日（批量条新增一个菜单入口）
- [x] K-14 附件「设为封面 / 移除封面」（详情面板接线；表格文件格不接，已登记取舍）
- [x] K-15 搜索筛选中 chip + 标签筛选归入视图状态（第三小项核实为不成立，改补护栏用例）
- [ ] K-17 窄屏头部收敛与触控目标（`IconButton`）
- [x] K-25 覆盖层可访问名走 i18n（根因在 outline→JSON 升级时造的 `title: 'Kanban'`）

## 批次 3 · 视图完整度

- [ ] K-12 时间线/甘特区间由数据推导 + 日/周/月缩放 + 「今天」 + 无日期单列
- [ ] K-16 命令面板接入看板动作

## 批次 4 · 性能与门禁

- [ ] K-19 writer 收进 `useCallback`（先写 locale 回归）+ 头部 props 收敛
- [ ] K-21 `e2e-visual.mjs` 逐个打开 8 个视图并断言内容已到
- [ ] K-20 连续编辑期间自适应写回静默期（含确定性量测）
- [x] K-23/K-24 规范注释收敛（卡片容器豁免登记 + 两处 `!important` 理由）

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-22 | K-13a 选择本组 + 选择当前视图全部 | （本提交） | typecheck ✅；新增 11 例（渲染级 7 + 单元 4）；三次变异逐一被杀（本组 id 取错、可见集合换成整份文档（靠批量条计数断言补上）、列菜单不接 selectAll）；`size:check` 拦下 `kanban-root.tsx` 超 500 行 → 两个覆盖层拆到 `kanban-overlays.tsx`，未 resnapshot；kanban+preview+components 94 文件 **1070** passed（3 例 render-window 5s 超时属 L-03，单跑 14/14 ✅）；12 项静态门禁 exit=0；白名单 668 文件 / 4561 条；另修 `menu.tsx` 选中标记的可访问名污染，并登记 K-29（标签筛选浮层同一写法） |
| 2026-09-22 | K-11 长按搬卡（移动到分组/泳道）+ 快捷键改绑 | （本提交） | typecheck ✅；新增 12 例（菜单 3 组 + 渲染级长按 6 例 + 护栏 2 例 + 选项轴 1 例）与 4 个旧助手改绑；三次变异逐一被杀（分组写入带泳道键、换泳道不回显分组、去掉 shift/田输入护栏）；`size:check` 拦下 3 个超长 describe + `kanban-root-hooks.ts` 548 行 → 拆 describe + 抽出 `kanban-move-to-axes.ts`，未 resnapshot；kanban+preview 85 文件 **1012** passed；12 项静态门禁 exit=0；白名单 666 文件 / 4543 条；遗留：真机触屏未验证（本机无触屏设备） |
| 2026-09-22 | 建立本轮台账与执行计划 | 0e2d673a | 文档提交，无代码改动 |
| 2026-09-22 | K-01 单卡删除撤销提示 | 66156734 | typecheck ✅；kanban+preview+tests/kanban 94 文件 1002 passed（3 例 `kanban-render-window` 5s 超时属 L-03 并发抖动，单跑 14/14 ✅）；`comments:check` 重算白名单 655 文件 / 4460 条 |
| 2026-09-22 | K-02 删列撤销提示（分组口径） | （本提交） | typecheck ✅；kanban+preview+tests/kanban 94 文件 1008 passed（首跑 1 例 render-window 超时属 L-03，重跑全绿）；`size:check`/`i18n:check` ✅；白名单 656 文件 / 4464 条 |
| 2026-09-22 | K-03 附件删除确认 + 永久删除语义 | c3f72b4a | typecheck ✅；kanban+preview+tests/kanban 88 文件 992 passed；`size:check`/`i18n:check`/`style:check`/`hardcoded:check` ✅；白名单 657 文件 / 4467 条；pre-commit 全量 test:unit 1443 passed |
| 2026-09-22 | K-05 CSV 导出补 BOM | 5e984d32 | typecheck ✅；kanban+preview+tests/kanban 88 文件 994 passed；`size:check`/`comments:check` ✅；白名单 657 文件 / 4470 条 |
| 2026-09-22 | K-15 搜索筛选可见性与标签筛选口径 | （本提交） | typecheck ✅；+6 例（4 先红 + 2 护栏）+ 1 例旧断言改写；kanban+preview+tests/kanban 95 文件 **1050** passed；`size:check` 拦下生产与测试各 1 处超长函数→拆解未 resnapshot；13 项静态门禁 exit=0；白名单 664 文件 / 4527 条 |
| 2026-09-22 | K-14 封面可设可移 | 8a011040 | typecheck ✅；+3 例（2 先红 + 1 护栏）；kanban+preview+tests/kanban 95 文件 **1044** passed；`size:check` 拦下生产 54 行 + 测试 57 行 → 各拆而未 resnapshot；13 项静态门禁 exit=0；白名单 664 文件 / 4514 条 |
| 2026-09-22 | K-23/K-24 规范注释收敛 | 0e94ba65 | 注释型改动（无行为）；typecheck ✅；`comments:check` 重算白名单 664 文件 / 4517 条；无需新增测试（无行为变化） |
| 2026-09-22 | K-25 无标题看板不再自带英文名 | fbff8163 | typecheck ✅；+2 例（1 先红）+ 1 例旧断言改写（旧断言恰在钉旧行为）；kanban+preview+tests/kanban 95 文件 **1041** passed；13 项静态门禁 exit=0；白名单 663 文件 / 4507 条 |
| 2026-09-22 | K-04 全屏期间板子离开笔记的自恢复 | 9dd74c76 | typecheck ✅；新增 4 例（3 先红 + 1 护栏）+ 变异自检（去 disposed 守卫恰好杀 1 例）；`size:check` 拦下 67 行 describe → 拆三组而非 resnapshot；kanban+preview+tests/kanban 95 文件 **1039** passed；13 项静态门禁 exit=0；白名单 662 文件（第一次 4498 条，拆 describe 后重算 4496）；批次 1（止血与安全）全部结案 |
| 2026-09-22 | K-10 上传体积预检 | 30f3f9c3 | typecheck ✅；新增 3 例 + 变异自检（改判据恰好杀这 2 例）；`size:check` 拦下变长函数→拆助手而非 resnapshot；kanban+preview+tests/kanban 94 文件 **1035** passed；13 项静态门禁 exit=0；白名单 660 文件 / 4486 条 |
| 2026-09-22 | K-09 跨源附件不再抢走应用标签页 | 789a61ac | typecheck ✅；新增 1 例先红后绿；`renderer.test.ts`+画廊 39 例同跑绿证明正名无行为漂移；kanban+preview+tests/kanban 94 文件 **1032** passed；13 项静态门禁 exit=0；白名单 660 文件 / 4482 条 |
| 2026-09-22 | K-08 文本附件预览失败态 + 已删对象降级 | c06bcb0e | typecheck ✅；新增 6 例先红后绿；kanban+preview+tests/kanban 94 文件 **1030** passed；`size:check` 拦下 3 处超长函数（生产 1 / 测试 2）并拆解而非 resnapshot；13 项静态门禁 exit=0；白名单 660 文件 / 4479 条 |
| 2026-09-22 | K-07 封面/附件图片服从外部图片策略 | 992bca0d | typecheck ✅；新增用例先红 5 例后绿；kanban+preview+tests/kanban 94 文件 **1024** passed；`renderer.test.ts` 32 例未改仍绿；13 项静态门禁 exit=0（含 `deep-imports`：新叶模块无 index 遮蔽）；白名单 659 文件 / 4475 条；另登记 K-28（笔记附件预览图像同类问题，跨模块） |
| 2026-09-22 | K-06 CSV 导出公式注入防护 | 029f99a0 | typecheck ✅；`csv.test.ts`+`kanban-csv.test.ts` 53 passed（本线程独立复跑）；kanban+preview+tests/kanban 88 文件 997 passed；`size:check`/`comments:check`/`i18n:check`/`hardcoded:check` ✅；白名单 657 文件 / 4473 条；同时登记 K-27（分享访问日志 CSV 同类问题，跨模块） |

> **并发写者交接（2026-09-22）**：本轮清单一度由第二个 Freebuff 线程（作者 `lgf5090`）在同一工作区并行施工，它已提交 K-02（`11dc3fca`）、K-03（`c3f72b4a`）、K-05（`5e984d32`），其中 `11dc3fca` 夹带了本线程**未完成的** K-02 在途改动（`useKanbanGroupDeletion`/`dataRef` 守卫/`kanban_view-state.test.ts` 三例/`kanban_group_deleted` 双语键）。用户裁定由本线程接管全部剩余条目后：
> 1. 本线程把 K-06 的**在途代码**（`csv.ts`/`csv.test.ts`，作者为并行线程）独立复核（跑测试 + 逐条核 OWASP 方案与往返不变形）后接收并提交，未改动其实现；
> 2. 此后所有条目由本线程串行施工，每次提交前先 `git status` 确认工作区无他人未完成改动；
> 3. 共享文件 `scripts/check-comments.mjs` 只按当前树重算（`sync-comments-allowlist.mjs`），不夹带在途注释；
> 4. 遗留：K-02 的 commit 号归并行线程，其 plan 行以 `（本提交）` 收尾，本线程不再回填（避免改动他人在途文档）。

## 固定验证

```bash
npm run typecheck && npm run test:unit
npm run comments:check && npm run i18n:check && npm run hardcoded:check
npm run tokens:check && npm run size:check && npm run surfaces:check
npm run test:e2e && npm run contrast:check      # 需本地实例，按条目决定是否进本批
node scripts/check-token-drift.mjs --update-baseline   # 仅当动共享令牌
```
