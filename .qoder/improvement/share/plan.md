# 分享中心修复计划（share-improvement-qoder-qwen38f）

- 台账：`.qoder/improvement/share/review.md`（SH-01…36，源自 2026-09-19 审查）
- 起点：dev@53824e3c ｜ 分支：`share-improvement-qoder-qwen38f`
- 约定：**一项 = 一个原子提交**；每次提交同步更新本文件（勾选、回填 hash、追加进度日志）；修 bug 先写复现测试（先红后绿），守卫型改动如实标注「修复前后均绿」。
- 回归标准（本机高负载约定）：
  - 全量单测：`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000`（串行，并行会假超时）
  - 类型：`npx tsc -b --force`（软链复用 build info，`npm run typecheck` 会假秒过）
  - 门禁：pre-commit hook 镜像静态门禁 + 增量 tsc + `vitest related`；新增 `//` 注释同提交跑 `node scripts/sync-comments-allowlist.mjs`；绝不 `--no-verify`
- **范围红线（用户指令）**：只修分享中心相关文件；博客管理中心有单独任务（worktree inkstone-blog-improvement-qoder-qwen38f）。与 blog 共用之代码（`components/big-svg-chart.tsx`、`components/dashboard-blocks.tsx`、`worker/lib/share-analytics.ts` 中 blog 也调用的函数行为）一律 🧊 冻结到最后，等用户决定。node_modules 两个软链永不进暂存区。

## 队列（按依赖与风险排序）

| # | 台账 | 标题 | 严重度 | 状态 | commit |
| --- | --- | --- | --- | --- | --- |
| 01 | SH-14 | 保留期「无限」(0) 被 `\|\| 30` 兜底 → 误删日志（client + worker 参数校验） | P0 | ✅ | 01bfeef9 |
| 02 | SH-02 | 分享 ≥100 条时列表/批量必 500（D1 变量上限，分块 + 上限 400） | P0 | ✅ | 4ee9b55c |
| 03 | SH-01 | 暂停分享不切断附件下载通道（files/library.ts + public.ts） | P0 | ✅ | 待回填 |
| 04 | SH-06+16 | `range` 白名单校验 + `all` 分桶起点（限 share 路由内，不碰 lib 行为） | P0/P1 | ⬜ | |
| 05 | SH-24 | 看板/单篇分析失败态（三态铁律） | P1 | ⬜ | |
| 06 | SH-25 | 列表首屏失败渲染成空态 → error + 重试 | P1 | ⬜ | |
| 07 | SH-26 | 文件夹/标签 CRUD 六处静默失败（content.ts） | P1 | ⬜ | |
| 08 | SH-27 | 「清理日志」hover-only 破坏性菜单 → `Menu` 组件 | P1 | ⬜ | |
| 09 | SH-15 | 行内开关首次发布无确认无反馈 | P1 | ⬜ | |
| 10 | SH-03 | 无口令公开端点零限流 + visit 写预算 | P0 | ⬜ | |
| 11 | SH-08 | referrer 无 max/协议白名单，原文入库 | P2 | ⬜ | |
| 12 | SH-04 | visitor fp HMAC 密钥注入（share 调用点传 env secret；lib 默认分支不动） | P1 | ⬜ | |
| 13 | SH-05 | share_visits 生命周期：cron 保留期清理 + 笔记 purge/撤销级联 | P1 | ⬜ | |
| 14 | SH-07 | 公开失败分支统一（防枚举）+ 自定义 slug 最短 6 + check-slug 混淆 | P2 | ⬜ | |
| 15 | SH-09 | 分享口令下限对齐 8、超长 400 不截断 | P2 | ⬜ | |
| 16 | SH-10 | batch 回真实受影响行数 + enable 原子化 | P2 | ⬜ | |
| 17 | SH-11 | share 路由 LIKE 通配符转义（shares/visits/organizer 三处） | P3 | ⬜ | |
| 18 | SH-12 | `DELETE /visits?type=all` 加 requireRecentAuth | P3 | ⬜ | |
| 19 | SH-13 | slug 一致性：抢注 409、撤销清 share_asset_sessions | P3 | ⬜ | |
| 20 | SH-18 | 搜索防抖 + AbortSignal + 在途去重 | P1 | ⬜ | |
| 21 | SH-21 | hub 打开重复拉 folders/tags；写操作全量重拉 → 定向 patch | P2 | ⬜ | |
| 22 | SH-23 | store 派生 `Map<noteId, ShareRow>`，行订阅改原始值 | P2 | ⬜ | |
| 23 | SH-22 | 表格行 memo + 菜单 items 惰性构建 + folders Map | P2 | ⬜ | |
| 24 | SH-19 | App 启动瘦身：`/api/share/summary` 轻量端点 | P1 | ⬜ | |
| 25 | SH-20 | code-split：barrel 拆 store/modals 入口（保持 blog 现有 import 不破） | P1 | ⬜ | |
| 26 | SH-17a | 列表接口 5 个统计查询 `db.batch` 并行化（第一步，不拆端点） | P0 部分 | ⬜ | |
| 27 | SH-28 | 实时访问日志补时间窗 + 文案改「最近访问」 | P2 | ⬜ | |
| 28 | SH-30 | 侧栏计数口径（软删过滤/expiring 互斥/全时段标注）+ LIMIT 500 truncated | P2 | ⬜ | |
| 29 | SH-31 | a11y 批量：Switch label、IconButton、hub ariaLabel、行「更多」键盘入口 | P2 | ⬜ | |
| 30 | SH-32 | 调色板类 → 设计令牌（visit-logs/sidebar/qr/dashboard 等） | P2 | ⬜ | |
| 31 | SH-33 | 裸控件换组件体系 + CSV 导出全量 + 复制失败 toast + 日志按分享过滤入口 | P2 | ⬜ | |
| 32 | SH-34 | 英文字面量进 locale + 服务端回落值改 null + countryName locale 显式 | P2 | ⬜ | |
| 33 | SH-35 | 窄屏：侧栏折叠/宽模态 fullscreen/批量条换行/触控尺寸 | P2 | ⬜ | |
| 34 | SH-36 | 小项集合（口令长度统一、effect 重开、子模态重置、th scope、role=status 等） | P3 | ⬜ | |
| F1 | SH-29 | 🧊 `big-svg-chart` 全 0 空态 / `dashboard-blocks` delta 0% / `computeDelta(0,0)` — blog 看板共用，等用户决定 | P2 | 🧊 | |
| F2 | SH-16b | 🧊 若 range=all 分桶必须改 `lib/share-analytics.ts` 的 `getRangeStartTimestamp`/`buildShareTimeline` 行为（blog stats.ts 共用）——04 号做不完的部分挪到这里 | — | 🧊 | |
| F3 | SH-05b | 🧊 `maintenance.ts` cron 若与 blog 附件/清理共用调度需触碰 blog 语义的部分 | — | 🧊 | |
| F4 | SH-25b | 🧊 blog 侧同构缺陷同步（B2-01 等）——属博客任务 | — | 🧊 | |

## 进度日志

- 2026-09-19 worktree 建立（dev@53824e3c），台账复制入 `.qoder/improvement/share/review.md`，基线全量回归启动中。
- 2026-09-19 基线全量回归 ✅ 206 文件 / 1640 测试（串行，364s）。
- 2026-09-19 01 SH-14 ✅ worker：`DELETE /api/share/visits` 对 `type=older_than` 且 days 非正整数（0/负数/NaN）改抛 `ApiError.badRequest`（此前 `Math.max(1, days)` 把 0 兜成 1 天=几乎全删）；client：`cleanVisitsFlow` 在「永久保留」下 toast `share.clean_blocked_unlimited`（新键，en+zh）并停手不发请求，抽出纯函数 `parseCleanDays`；先红后绿：`tests/share-routes.test.ts` +2 例（红：days=0 返 200 且删行）、`use-share-settings-modal.test.ts` 新增 3 例。commit 01bfeef9（全量回归 207 文件 / 1645 测试 ✅，typecheck ✅，i18n/comments 门禁 ✅）。
- 2026-09-19 02 SH-02 ✅ worker：列表 `loadNoteVisitStats` 按 `VISIT_STATS_NOTE_CHUNK=50` 分块绑定 note_id（此前 120 条分享 → 120 变量 → 必 500）；`batch.ts` disable/revoke/expire/move 与 batch-folder/batch-tag 停用改走 `chunkNoteIds`+`placeholdersFor`（`setSharesField` 统一三种 UPDATE，列名收窄为字面量联合非用户输入）；enable 本就逐条无上限问题（其 N+1 属 16 号）。先红后绿：`tests/share-routes.test.ts` 新增 describe 3 例（红时 stderr 正是 `too many SQL variables — 120/121 bound`）。size:check 一度拦到 batch 处理器 >50 行，按职责拆出三个小函数后通过（未动基线）。commit 4ee9b55c（全量回归 207 文件 / 1648 测试 ✅，typecheck ✅）。
- 2026-09-19 03 SH-01 ✅ worker：`files/library.ts` `loadAttachmentShare` 的 WHERE 补 `s.is_enabled = 1`（暂停/撤销后匿名与旧口令 cookie 一律 401，正文端点本就有同一判定）；核查确认 `share/public.ts` 全部公开端点（含发 `share_asset_sessions` cookie 的口令端点）都经 `loadShareOrThrow` 挡住 is_enabled=0，无需改动；撤销路径清 session 属 19 号（SH-13）。先红后绿：`tests/files-routes.test.ts` 新增暂停分享→附件 401 一例（红时 200）。
