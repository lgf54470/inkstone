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
- [ ] K-10 上传客户端预检（与服务端同一份限额常量）
- [x] K-03 附件删除改「确认 + 永久删除」语义（用户裁定，对齐笔记附件）
- [ ] K-04 全屏期间实例失效自恢复

## 批次 2 · 交互与移动

- [ ] K-11 卡片「移动到…」菜单（子菜单列出分组/泳道）+ 移动快捷键改绑并真机验证
- [ ] K-13 选择本列/选择可见全部 + 批量标签/负责人/日期
- [ ] K-14 附件「设为封面 / 移除封面」
- [ ] K-15 搜索筛选中 chip + 标签筛选持久化口径统一 + debounce 收起清理
- [ ] K-17 窄屏头部收敛与触控目标（`IconButton`）
- [ ] K-25 覆盖层可访问名走 i18n

## 批次 3 · 视图完整度

- [ ] K-12 时间线/甘特区间由数据推导 + 日/周/月缩放 + 「今天」 + 无日期单列
- [ ] K-16 命令面板接入看板动作

## 批次 4 · 性能与门禁

- [ ] K-19 writer 收进 `useCallback`（先写 locale 回归）+ 头部 props 收敛
- [ ] K-21 `e2e-visual.mjs` 逐个打开 8 个视图并断言内容已到
- [ ] K-20 连续编辑期间自适应写回静默期（含确定性量测）
- [ ] K-23/K-24 规范注释收敛

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-22 | 建立本轮台账与执行计划 | 0e2d673a | 文档提交，无代码改动 |
| 2026-09-22 | K-01 单卡删除撤销提示 | 66156734 | typecheck ✅；kanban+preview+tests/kanban 94 文件 1002 passed（3 例 `kanban-render-window` 5s 超时属 L-03 并发抖动，单跑 14/14 ✅）；`comments:check` 重算白名单 655 文件 / 4460 条 |
| 2026-09-22 | K-02 删列撤销提示（分组口径） | （本提交） | typecheck ✅；kanban+preview+tests/kanban 94 文件 1008 passed（首跑 1 例 render-window 超时属 L-03，重跑全绿）；`size:check`/`i18n:check` ✅；白名单 656 文件 / 4464 条 |
| 2026-09-22 | K-03 附件删除确认 + 永久删除语义 | c3f72b4a | typecheck ✅；kanban+preview+tests/kanban 88 文件 992 passed；`size:check`/`i18n:check`/`style:check`/`hardcoded:check` ✅；白名单 657 文件 / 4467 条；pre-commit 全量 test:unit 1443 passed |
| 2026-09-22 | K-05 CSV 导出补 BOM | 5e984d32 | typecheck ✅；kanban+preview+tests/kanban 88 文件 994 passed；`size:check`/`comments:check` ✅；白名单 657 文件 / 4470 条 |
| 2026-09-22 | K-09 跨源附件不再抢走应用标签页 | （本提交） | typecheck ✅；新增 1 例先红后绿；`renderer.test.ts`+画廊 39 例同跑绿证明正名无行为漂移；kanban+preview+tests/kanban 94 文件 **1032** passed；13 项静态门禁 exit=0；白名单 660 文件 / 4482 条 |
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
