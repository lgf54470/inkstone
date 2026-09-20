# 分享中心复评修复台账（share-freebuff）

- 台账来源：`.qoder/improvement/share/review-round2.md`（SH-49…SH-85，37 条，2026-09-21 复评）
- 起点：`dev@579bdf25` ｜ 分支：`share-improvement-freebuff`（从 dev 切出，**不 push、不合并**，等用户指令）
- 上一轮：`.qoder/improvement/share/review.md`（SH-01…36）+ `plan.md`（含追加 SH-37…48 与 H1…H10）
- 约定：**一项 = 一个原子提交**；每次提交同步更新本文件（勾选、回填 hash、追加进度日志）；修 bug 先写复现测试（先红后绿），守卫型改动如实标注「修复前后均绿」；守卫型/断言型改动至少一发变异（把缺陷改回去看测试是否变红）。

## 回归与验证标准

- 类型：`npx tsc -b --force`（`npm run typecheck` 复用 build info 会假秒过）
- 定向测试：`npx vitest run --config vitest.config.ts <相关文件>`
- 全量（触碰共用面/服务端/SQL/migration 的项，以及每批收尾）：`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000`（本机并行会假超时，串行约 9 分钟/次）
- 静态门禁：`style:check`、`comments:check`、`size:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`empty-catch:check`、`escape:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`vendor:check`（触碰打包面时另跑 `budget:check`）
- 提交：`.githooks/pre-commit` 必过（镜像静态门禁 + 增量 tsc + `vitest related`）；**禁止 `--no-verify`**；新增 `//` 注释同提交跑 `node scripts/sync-comments-allowlist.mjs`
- 共用面（`components/dashboard-blocks.tsx`、`components/big-svg-chart.tsx`、`features/sidebar/sidebar/count-badge.ts`）改动：share + blog 双侧回归
- 浏览器级：`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`（若 7712 被占另起端口，不动别人进程）+ `INKSTONE_CHROME_PATH`
- 工作区纪律：提交前 `git status --porcelain` 核对；只 `git add <本项文件>`，绝不 `git add -A`；不动 lockfile / `node_modules`

## 范围红线

- 只改分享中心相关文件与共用面；`blog-frontend/` 不动；`blog` 侧只做"共用组件不破"的回归，不顺手修 blog 自己的口径问题（那是另一条 H 系列）
- 不修改已应用的 migration（只追加）；不碰 `plan.md` / `review.md` 的历史内容
- 不做无关重构/格式化/依赖升级；`SH-77`（虚拟化）无规模证据则登记为已知限制关闭

## 队列

| 序 | 批次 | 编号 | 标题 | 代价 | 状态 | commit |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | — | — | 落盘复评报告 `review-round2.md` + 本台账 | 小 | ⬜ | |
| 02 | A | SH-78 | `GET /api/share/visits` 的 `page`/`limit` 未校验 → NaN 绑定必现 500 | 极小 | ⬜ | |
| 03 | A | SH-79 | 日志 CSV 未做 RFC 4180 转义 + 无公式注入防护 | 极小 | ⬜ | |
| 04 | A | SH-84 | 自定义 slug 报错文案写 "3-64 chars"，实际 6–64 | 极小 | ⬜ | |
| 05 | A | SH-80 | `loadTopNotes` 查笔记标题不带 `user_id` | 极小 | ⬜ | |
| 06 | A | SH-82 | 日志接口下发完整指纹 + SELECT 从不返回的 `user_agent` | 极小 | ⬜ | |
| 07 | A | SH-71 | 两个 analytics hook 无 abort/epoch → 慢请求覆盖新请求 | 小 | ⬜ | |
| 08 | A | SH-55 | 首屏 `isLoading` 时 KPI 全渲染 0（缺"加载中"态） | 小 | ⬜ | |
| 09 | A | — | 批次 A 收尾：全量串行回归 | — | ⬜ | |
| 10 | B | SH-85 | 分享中心浏览器级门禁（e2e-visual 场景 + surface coverage） | 中 | ⬜ | |
| 11 | C | SH-49 | 裸 `<button>` 绕过组件体系 + 新守卫 | 中 | ⬜ | |
| 12 | C | SH-50 | 流量过滤浮层：焦点管理 / role / 窄屏裁切 | 小–中 | ⬜ | |
| 13 | C | SH-51 | hover-only「新建文件夹/标签」键盘不可见、触屏不可发现 | 小 | ⬜ | |
| 14 | C | SH-53 | `expiring` 语义与标签不符，缺 ≤7d「即将到期」桶 | 小 | ⬜ | |
| 15 | C | SH-60 | 看板 468/500 行 + range 选项重复 → 拆分 | 小–中 | ⬜ | |
| 16 | C | SH-59 | 网格卡未 memo + 内联闭包 + 每卡 `folders.find` | 小 | ⬜ | |
| 17 | C | SH-57 | `toLocaleString()` 跟随 OS / delta 无语义 / 图表无文本替代 | 小–中 | ⬜ | |
| 18 | C | SH-56 | 「日均访问量」口径错误 + sparkline 与 PV 卡重复 | 小 | ⬜ | |
| 19 | C | SH-58 | hub 分类徽标未走 `countBadgeTone`（且不在对比度门禁内） | 小 | ⬜ | |
| 20 | C | SH-52 | 侧栏计数缺 password/expiring/permanent 三类 | 小 | ⬜ | |
| 21 | C | SH-54 | 看板不受侧栏范围影响且不标注作用域 | 中 | ⬜ | |
| 22 | C | SH-61 | 设置「保存」一半 localStorage 一半服务端，语义未标注 | 小 | ⬜ | |
| 23 | C | SH-83 | UV 去重口径（IP+日盐 / 同 NAT 合并 / 跨日重复）不可见 | 极小 | ⬜ | |
| 24 | D | SH-72 | 打开分享中心固定 4 请求 / ≈15 条 D1 语句 | 小–中 | ⬜ | |
| 25 | D | SH-73 | 列表访客统计缺覆盖索引 + tags `LIKE '%"x"%'` | 中 | ⬜ | |
| 26 | D | SH-74 | `range=all` 无节流无缓存 | 中 | ⬜ | |
| 27 | D | SH-81 | 读侧无限流（分析/日志对已认证会话全开放） | 小–中 | ⬜ | |
| 28 | D | SH-75 | 全量导出串行分页无进度/无取消/无上限提示 | 小–中 | ⬜ | |
| 29 | D | SH-76 | `useShareStore.subscribe` 每次写入重建共享 id 快照 | 极小 | ⬜ | |
| 30 | D | SH-77 | 500 行全量渲染无虚拟化（无规模证据则关闭） | 中 | ⬜ | |
| 31 | E | SH-62 | 到期治理：即将到期列表 + 批量续期 | 中 | ⬜ | |
| 32 | E | SH-63 | 单条分享的访客数据删除 / 导出 | 小–中 | ⬜ | |
| 33 | E | SH-69 | 批量二维码打印表 / 复制全部链接 | 小–中 | ⬜ | |
| 34 | E | SH-65 | 无自动刷新 / 无新鲜度标识 | 中 | ⬜ | |
| 35 | E | SH-64 | 看板无法导出（区间 CSV / PNG / PDF） | 中 | ⬜ | |
| 36 | E | SH-70 | 链接卫生巡检（长期 0 访问） | 小 | ⬜ | |
| 37 | F | SH-66 | 访客会话视角（先出 ADR） | 中–大 | ⬜ | |
| 38 | F | SH-67 | 渠道标记 `?ref=`（先出 ADR） | 中 | ⬜ | |
| 39 | F | SH-68 | 文件夹/标签 → 公开集合落地页（先出 ADR） | 大 | ⬜ | |

## 进度日志

（每完成一项追加一节：改动面 / 根因 / 测试与变异 / 验证读数 / 局限。）

### 01 — 落盘复评报告与台账（2026-09-21）

- 改动面（2 个新文件）：`.qoder/improvement/share/review-round2.md`（SH-49…SH-85 复评台账 + 截图对照 + 功能发散 + 批次与验收标准 + 编号映射表）、本文件（队列表 + 回归标准 + 范围红线）。
- 编号决策：首轮口头报告的 SH-37…SH-74 与上一轮追加的 SH-37…48 冲突，本轮统一从 **SH-49** 续号，映射表写在报告开头。
- 验证：纯文档提交，无生产代码改动；仍跑静态门禁里对文档无感的项与 pre-commit 钩子，不跑测试（工作区除本文件外与 `579bdf25` 一致）。
