# 看板模块改进执行计划 · Freebuff glm53f 轮次

> 依据：2026-09-24 全模块复审（`src/client/lib/markdown/kanban/**` 约 250 文件 + `src/worker/routes/kanban.ts` + `styles/kanban.css`）。
> 基线：`dev`，HEAD `6e9a030d`。
> 施工原则：逐项修复 → 先写能失败的复现测试 → 跑回归与门禁 → 单项提交（Conventional Commits，scope `kanban`/`api`，正文逐文件）→ **同一次提交内更新本文件进度日志**。
> 与旧计划的关系：`plan-with-freebuff.md`（K-01…K-31）已结案；本文件承接复审增量 G-01…G-19，编号独立，不重复旧条目。
> 每项收尾的验证命令见文末「固定验证」。

## 批次 1 · 止血（P1 小改）

- [ ] G-01 日历月份标题 Intl 本地化（zh-CN 显示「2026年9月」而非「2026 - 09」）
- [ ] G-02 卡片单击立即打开详情（移除 250ms 双击区分等待，重命名保留按钮 + F2）
- [ ] G-03 触屏悬停控件常显（pointer:coarse 下勾选框/菜单/重命名/加标签不再 opacity-0）
- [ ] G-04 时间轴/甘特侧栏接入渲染窗口（1000 卡上限下的最后一块全量渲染面）
- [ ] G-05 CSV 导入体积预拒（读文件前按大小拒绝，防超大文件冻结标签页）

## 批次 2 · 数据安全与服务端

- [ ] G-06 删除改为可恢复的软删除（归档面板分「已归档 / 已删除」，删除可恢复 + 可永久清除）
- [ ] G-07 键盘 Delete 移除聚焦卡片（走格焦点态，接 G-06 软删语义）
- [ ] G-08 附件配额改由 D1 核算（上传写 attachments 行，移除每次上传全量 list R2）
- [ ] G-09 删除接口节流（DELETE 复用 consumeAttemptBudget）
- [ ] G-10 搜索写放大核实结案（预期：不成立，写防抖已由 K-20 预算测试钉住；不改代码）

## 批次 3 · 功能增强

- [ ] G-11 页签标注视图自带筛选（带 filters/sorts/search/tags 的页签加圆点提示）
- [ ] G-12 列头数值汇总（视图可选 number 列求和，列头显示 Σ）
- [ ] G-13 卡片依赖徽标（board 卡 footer 显示被阻塞计数，点击开详情）
- [ ] G-14 图表点击下钻为过滤（点击柱/扇区写入 filters，与快捷过滤 chip 同路径）

## 批次 4 · 打磨收尾

- [ ] G-15 非法图标值截断（超长字符串不再撑破卡片）
- [ ] G-16 搜索框展开宽度自适应（聚焦加宽）
- [ ] G-17 表格列最小宽核实（column-width.ts 既有 clamp 是否已覆盖；已覆盖则不立项）
- [ ] G-18 日历周视图（月/周切换，复用 CalendarWeekRow）
- [ ] G-19 超限文件拆分（kanban-root / kanban-item-detail 纯移动，size:check 收尾）

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-24 | 建立本轮台账与执行计划 | （本提交） | 文档提交，无代码改动；工作区干净，分支 dev |

## 固定验证

```bash
npm run typecheck
npx vitest run --config vitest.config.ts <相关文件>
npm run i18n:check && npm run comments:check && npm run hardcoded:check
npm run size:check && npm run tokens:check && npm run style:check
# 批次收尾 / 触碰视觉与交互断言时：
npm run test:unit
npm run test:e2e && node scripts/e2e-visual.mjs && npm run contrast:check
```
