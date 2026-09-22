# 看板模块改进执行计划 · Freebuff 轮次

> 依据：`review-with-freebuff.md`（2026-09-22 复审台账，K-01…K-25）。
> 基线：`kanban-improvement-qoder-qwen38f`，HEAD `6c4a81ba`。
> 施工原则：逐项修复 → 先写能失败的复现测试 → 跑回归与门禁 → 单项提交（Conventional Commits，正文逐文件）→ **同一次提交内更新本文件进度日志**。
> 与旧计划的关系：`plan.md`（六批）已结案；本文件只承接 K-xx 增量，不重复旧条目。
> 每项收尾的验证命令见文末「固定验证」。

## 批次 1 · 止血（正确性 + 安全最小集）

- [x] K-01 单卡删除撤销提示（`toastWithUndo`，对齐批量删除与删视图）
- [x] K-02 删列撤销提示（受影响卡数进文案）
- [ ] K-05 CSV 导出补 BOM
- [ ] K-06 CSV 导出公式注入前缀
- [ ] K-07 封面/附件图片走外部图片策略 + `referrerpolicy`
- [ ] K-08 文本附件预览补失败态（并入 K-03 残留：已删对象/缺文件的降级显示）
- [ ] K-09 跨源附件链接改新标签打开
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
| 2026-09-22 | K-03 附件删除确认 + 永久删除语义 | （本提交） | typecheck ✅；kanban+preview+tests/kanban 88 文件 992 passed；`size:check`/`i18n:check`/`style:check`/`hardcoded:check` ✅；白名单 657 文件 / 4467 条；pre-commit 全量 test:unit 1440 passed |

## 固定验证

```bash
npm run typecheck && npm run test:unit
npm run comments:check && npm run i18n:check && npm run hardcoded:check
npm run tokens:check && npm run size:check && npm run surfaces:check
npm run test:e2e && npm run contrast:check      # 需本地实例，按条目决定是否进本批
node scripts/check-token-drift.mjs --update-baseline   # 仅当动共享令牌
```
