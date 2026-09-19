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
| 03 | SH-01 | 暂停分享不切断附件下载通道（files/library.ts + public.ts） | P0 | ✅ | 3d2dafd4 |
| 04 | SH-06+16 | `range` 白名单校验 + `all` 分桶起点（限 share 路由内，不碰 lib 行为） | P0/P1 | ✅ | 6a67f695 |
| 05 | SH-24 | 看板/单篇分析失败态（三态铁律） | P1 | ✅ | 898b087d |
| 06 | SH-25 | 列表首屏失败渲染成空态 → error + 重试 | P1 | ✅ | cfa6a88a |
| 07 | SH-26 | 文件夹/标签 CRUD 六处静默失败（content.ts） | P1 | ✅ | 8ad190ae |
| 08 | SH-27 | 「清理日志」hover-only 破坏性菜单 → `Menu` 组件 | P1 | ✅ | c95c052a |
| 09 | SH-15 | 行内开关首次发布无确认无反馈 | P1 | ✅ | 3e6b96eb |
| 10 | SH-03 | 无口令公开端点零限流 + visit 写预算 | P0 | ✅ | cf7fe149 |
| 11 | SH-08 | referrer 无 max/协议白名单，原文入库 | P2 | ✅ | 33085f09 |
| 12 | SH-04 | visitor fp HMAC 密钥注入（share 调用点传 env secret；lib 默认分支不动） | P1 | ✅ | ac043aef |
| 13 | SH-05 | share_visits 生命周期：cron 保留期清理 + 笔记 purge/撤销级联 | P1 | ✅ | dc8843b8 |
| 14 | SH-07 | 公开失败分支统一（防枚举）+ 自定义 slug 最短 6 + check-slug 混淆 | P2 | ✅ | c525c8c7 |
| 15 | SH-09 | 分享口令下限对齐 8、免费失败降 10、超长 400 不截断 | P2 | ✅ | e0b0e7cc |
| 16 | SH-10 | batch 回真实受影响行数 + enable 原子化 | P2 | ✅ | ea51cc59 |
| 17 | SH-11 | share 路由 LIKE 通配符转义（shares/visits/organizer 三处） | P3 | ✅ | 2ae84353 |
| 18 | SH-12 | `DELETE /visits?type=all` 加 requireRecentAuth | P3 | ✅ | bf2c2f35 |
| 19 | SH-13 | slug 一致性：抢注 409、撤销清 share_asset_sessions | P3 | ✅ | 7a6cf67c |
| 20 | SH-18 | 搜索防抖 + AbortSignal + 在途去重 | P1 | ✅ | 31a63d93 |
| 21 | SH-21 | hub 打开重复拉 folders/tags；写操作全量重拉 → 定向 patch | P2 | ✅ | 0c3ec8a4 |
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
| F5 | SH-05c | 🧊 share_visits「按保留期分批清理」需把 logRetentionDays 从浏览器 localStorage 持久化到服务端 settings（blog 侧同构缺陷共用改动面），等用户决定 | P2 | 🧊 | |

## 进度日志

- 2026-09-19 worktree 建立（dev@53824e3c），台账复制入 `.qoder/improvement/share/review.md`，基线全量回归启动中。
- 2026-09-19 基线全量回归 ✅ 206 文件 / 1640 测试（串行，364s）。
- 2026-09-19 01 SH-14 ✅ worker：`DELETE /api/share/visits` 对 `type=older_than` 且 days 非正整数（0/负数/NaN）改抛 `ApiError.badRequest`（此前 `Math.max(1, days)` 把 0 兜成 1 天=几乎全删）；client：`cleanVisitsFlow` 在「永久保留」下 toast `share.clean_blocked_unlimited`（新键，en+zh）并停手不发请求，抽出纯函数 `parseCleanDays`；先红后绿：`tests/share-routes.test.ts` +2 例（红：days=0 返 200 且删行）、`use-share-settings-modal.test.ts` 新增 3 例。commit 01bfeef9（全量回归 207 文件 / 1645 测试 ✅，typecheck ✅，i18n/comments 门禁 ✅）。
- 2026-09-19 02 SH-02 ✅ worker：列表 `loadNoteVisitStats` 按 `VISIT_STATS_NOTE_CHUNK=50` 分块绑定 note_id（此前 120 条分享 → 120 变量 → 必 500）；`batch.ts` disable/revoke/expire/move 与 batch-folder/batch-tag 停用改走 `chunkNoteIds`+`placeholdersFor`（`setSharesField` 统一三种 UPDATE，列名收窄为字面量联合非用户输入）；enable 本就逐条无上限问题（其 N+1 属 16 号）。先红后绿：`tests/share-routes.test.ts` 新增 describe 3 例（红时 stderr 正是 `too many SQL variables — 120/121 bound`）。size:check 一度拦到 batch 处理器 >50 行，按职责拆出三个小函数后通过（未动基线）。commit 4ee9b55c（全量回归 207 文件 / 1648 测试 ✅，typecheck ✅）。
- 2026-09-19 03 SH-01 ✅ worker：`files/library.ts` `loadAttachmentShare` 的 WHERE 补 `s.is_enabled = 1`（暂停/撤销后匿名与旧口令 cookie 一律 401，正文端点本就有同一判定）；核查确认 `share/public.ts` 全部公开端点（含发 `share_asset_sessions` cookie 的口令端点）都经 `loadShareOrThrow` 挡住 is_enabled=0，无需改动；撤销路径清 session 属 19 号（SH-13）。先红后绿：`tests/files-routes.test.ts` 新增暂停分享→附件 401 一例（红时 200）。commit 3d2dafd4（全量回归 207 文件 / 1649 测试 ✅，typecheck ✅）。
- 2026-09-19 04 SH-06+16 ✅ worker（限 share 路由，未动 lib）：SH-06——`analyticsContext` 的 range 改走 `shareRangeFrom` 白名单（缺省 `7d`、非法回退 `30d`，响应回显净化后的值；此前 `zzz` 等任意串等价全历史载入）。SH-16 正确性一半——新增 `scopeAllRangeWindow`（global 与 per-note 两路共用）：`all` 以该用户（或该笔记）`MIN(visited_at)` 为分桶起点、真实跨度为 duration（下限 1 天，空历史回退近 30 天窗口），时间轴不再恒为空 1970；MIN 查询不带 clause，保住 filterStats 全量口径。先红后绿：`tests/share-routes.test.ts` 新增 3 例（zzz→30d 只读近窗、all 从最早访问分桶且总和=行数、空 all 不落 epoch）。**遗留**：`all` 仍整表拉行（SQL 下推聚合）与时序 await 并 `db.batch` 未做——前者是 SH-16 成本一半（路由内可做、代价中），并入 26 号（SH-17a 并行化）一起排。
- 2026-09-19 05 SH-24 ✅ client：看板与单篇分析补上失败态（三态铁律）。`use-share-dashboard-view` 新增 `error` 状态，catch 里清空 `analytics` 并置 error（不再以 0 卡冒充数据）；`use-share-note-analytics` 新增 `isLoading`+`error` 并导出 `loadData` 供重试；新共享组件 `share-analytics-error.tsx`（`AnalyticsLoadError`：`<p role='alert'>` + 语义 `Button` 重试，参照本模块合规面 share-page/page.tsx）；看板主体与笔记分析弹窗体在 error 时以该告警替换零数据（弹窗为满足 size:check 50 行限拆出 `StatsAndRangeRow` 与 `NoteAnalyticsBreakdowns` 两个子组件，未动基线）；新增文案键 `share.analytics_load_failed`（en+zh）。先红后绿：`share-analytics-error.test.ts` 5 例（hook 3 例：失败置 error+清数据、陈旧数据被清、note 加载态；视图 2 例：role=alert+无零卡+点重试恢复）。commit 898b087d（全量回归 208 文件 / 1657 测试 ✅，typecheck ✅，i18n/size/style/comments/empty-catch/deep-imports 门禁 ✅）。
- 2026-09-19 06 SH-25 ✅ client：分享列表首屏失败不再冒充「暂无分享」。store 新增 `error` 状态（types/index/loaders：`loadSharesImpl` 失败置 error、成功清零，danger toast 保留，epoch 守卫不变）；`use-share-hub-modal` 透出 `error`；`share-hub-modal.tsx` HubContent 在 `error && shares.length===0` 时渲染告警+重试（loading 分支优先）。05 号的 `AnalyticsLoadError` 泛化为 `LoadErrorState({label,onRetry})`，文件更名 `share-load-error.tsx`（两处分析面同 commit 改接线，DOM 契约不变）；新增文案键 `share.list_load_failed`（en+zh）。先红后绿：`share-store/shares.test.ts` +2 例（error 置位/重试清零）、新文件 `share-hub-list-error.test.ts` 2 例（红时正是假空态 `share.no_shares_hint` 渲染中；绿时 alert+重试点击恢复空态文案）。size:check 拦到 shares.test.ts describe 超 50 行，拆出 `share list error state` describe 后通过（未动基线）。commit cfa6a88a（全量回归 209 文件 / 1661 测试 ✅，typecheck ✅，i18n/size/style/comments/empty-catch/deep-imports/hardcoded 门禁 ✅）。
- 2026-09-19 07 SH-26 ✅ client：文件夹/标签 CRUD 六处 `catch { return null/false }` 不再静默。shares.ts 既有的 `notifyActionFailed()`（danger toast `common.action_failed`）提为共享内部模块 `share-store/notify.ts`（第二次出现即抽取，shares.ts 改 import 并删除本地副本与其 useUi/t 直引）；content.ts 六处 catch 逐处 `console.warn` 带上下文 + `notifyActionFailed()`，返回值契约不变（null/false，调用方如 createSubfolderFlow 本就以 falsy 停手，核查无双重 toast）。先红后绿：新文件 `share-store/content.test.ts` 6 例（逐 action 断言 falsy+danger toast；size:check 拦 describe 超 50 行后抽 `failsWithDangerToast` 助手，未动基线）。commit 8ad190ae（全量回归 210 文件 / 1667 测试 ✅，typecheck ✅，style/size/comments/empty-catch/deep-imports 门禁 ✅）。
- 2026-09-19 08 SH-27 ✅ client：访问日志「清理日志」下拉从 `group`/`group-hover:block` 的 hover-only 手写菜单改为 `Menu` 组件（Portal `role=menu` + `role=menuitem`，键盘/焦点/ESC 由组件体系接管，破坏性项走 `tone: 'danger'`）。触发按钮 `share-visit-logs-modal.tsx`：`ref` 锚点 + `aria-haspopup='menu'` + `aria-expanded`，`{open && <Menu … align='end' />}`；三个清理项 onSelect 语义不变（bots / older_than 30 / all，all 带 danger），确认对话框与 `api.share.cleanVisits` 调用仍在 hook 的 `cleanVisitsFlow`。先红后绿：新文件 `share-visit-logs-menu.test.ts` 2 例（点击打开后三项可读且 aria-expanded 翻转；点「清空全部」仍以 danger tone 走 confirm 且 `cleanVisits('all', 30)`）。typecheck 曾报 TS2339（复杂选择器返回 Element），改 `querySelectorAll<HTMLButtonElement>` 泛型解决（未用 as）。commit c95c052a（全量回归 211 文件 / 1669 测试 ✅，typecheck ✅，style/size/comments/escape/hardcoded/tokens/deep-imports 门禁 ✅）。
- 2026-09-19 09 SH-15 ✅ client：行内开关（表格/卡片行）首次对外公开前加确认、发布成功补反馈。`share-store/shares.ts` `toggleShareImpl` 启用方向先走 `publishConfirmedFor`：行存在、当前关闭且 `views === 0`（客户端能拿到的「从未公开过」唯一信号）时弹 `confirm`（新键 confirm_publish_title/desc，confirmLabel 复用 share.publish），取消即停手不发请求；关闭与重新启用（views>0）保持即时。成功启用后 `notify.ts` 新增 `notifySharePublished()`（default tone `share.publish_success`，含链接可见提示）；两处 `<Switch>` 补 `label={share_switch_aria}`（带笔记标题）修掉无名称开关。新增 4 个 i18n 键（en+zh，3057→3061）。先红后绿：`share-store/shares.test.ts` +4 例（overlay confirm 部分 mock + `shareRow()` 具形 fixture；原「stays silent」例按新契约改为断言 publish_success 且无 danger）。commit 3e6b96eb（全量回归 211 文件 / 1673 测试 ✅，typecheck ✅，style/size/comments(含白名单同步)/escape/empty-catch/hardcoded/tokens/deep-imports/module-state 门禁 ✅）。
- 2026-09-19 10 SH-03 ✅ worker（P0）：公开访问端点补上读预算与写预算。`share/public.ts` POST /:slug 入口新增 `enforceShareViewBudget`（复用 `lib/throttle` `consumeAttemptBudget`，键 `share-view:{slug}:ip:{ip}` 20 次/10min + `share-view:ip:{ip}` 60 次/10min，超限 429 带 retryAfter；同博客 `public-links` 先例），换 UA 连打与随机 slug 探测均被计预算（404 路径此前零消耗）；`recordShareVisit` 去重键改 `computeVisitorFingerprint(clientIp, '')`（fp 不再含 UA，UA 轮换不再伪造 PV/行），且 `is_bot=1` 或去重命中时整体跳过 `share_visits` INSERT（此前无条件写行，仅 views 计数去重），抽出 `isRecentlySeenVisit` 过 50 行限制。`tests/share-routes.test.ts`：旧「每 fp 计一次」例改为按 IP 去重断言（红：换 UA views 3→2 仍涨）、新增 bot 零写行例、新增 40 连打必 429 例。已知代价：30min 内回访不再产生新行（日志列表/referer 链只记首访）；部署后旧行 fp（含 UA）与新 fp 不匹配，会各多记一次首访。commit cf7fe149（全量回归 211 文件 / 1675 测试 ✅，typecheck ✅，size/comments(白名单同步)/style/escape/hardcoded/module-state 门禁 ✅）。
- 2026-09-19 11 SH-08 ✅ worker+client：referrer 全链路收口。`schemas.ts` referrer 加 `.max(LIMITS.shareReferrerMaxLength)`（新常量 512，`constants.ts`）；`public.ts` `deriveShareReferrer` 加协议白名单 `REFERRER_PROTOCOLS`（http/https/android-app/ios-app，白名单外原串不落库仅记 host 判定），新增 `storedReferrerValue`：http(s) 只存 `origin+pathname`（查询串/片段里的令牌不进库），截 512；client `api/share.ts` `read()` 发送前 `slice(0,512)`（合法页面超长 `document.referrer` 不该换来 400，服务端 `.max` 仍是信任边界）。先红后绿：`tests/share-routes.test.ts` 新增 `publicVisitAccess` 助手 + describe 3 例（红时 3 failed：javascript: 原样入库、带 token 查询串原样入库、600+ 字返 200；绿时 referrer 分别 null / `https://news.example.com/article/42` / 400）。commit 33085f09（全量回归 211 文件 / 1678 测试 ✅，typecheck ✅，style/size/comments(白名单同步 3534/512)/escape/empty-catch/hardcoded/tokens/module-state/deep-imports/i18n 门禁 ✅）。
- 2026-09-19 12 SH-04 ✅ worker（share 侧，lib 默认分支未动）：`env.ts` 新增可选绑定 `VISIT_FP_SECRET`（`wrangler secret put` 注入实例级密钥）；`share/public.ts` `recordShareVisit` 指纹改 `computeVisitorFingerprint(clientIp, '', `${secret}:${share.user_id}`)`——HMAC 分支启用、盐按 owner 域分隔（同一访客跨账号不可关联），密钥缺失时直接不记 fp（visitor_fp=null，拒退化到公开日盐）。已知代价：未配密钥的实例去重失效（每次浏览一行、views 连涨）且 `COUNT(DISTINCT visitor_fp)` 忽略 null 使 UV 统计归 0——部署方必须补 secret；blog/visits.ts 同构缺陷属 blog 任务（F4）。先红后绿：`tests/share-routes.test.ts` 新增 `visitAccess` 助手 + describe 3 例（红时 3 failed：fp 即公开日盐值、跨 owner fp 相同、无 secret 仍记 fp；10 号（SH-03）去重例与本例先给 DB_ENV 配 secret，makeDb 重置防泄漏），`seedNote` 支持 user_id。commit ac043aef（全量回归 211 文件 / 1681 测试 ✅，typecheck ✅，style/size/comments(白名单 3537/512)/escape/empty-catch/hardcoded/tokens/module-state/deep-imports/i18n 门禁 ✅）。
- 2026-09-19 13 SH-05 ✅ worker：share_visits 级联 + cron 兜底 + 统计/日志 join 存活分享。级联四处：`share/note.ts` DELETE /:noteId 改调 `batch.ts` 导出的 `revokeSharesForNotes`（每块 shares+share_visits 两条 DELETE 走 db.batch）；批量 revoke 同helper；`notes/lifecycle.ts` purge 与 `notes/trash.ts` 清空回收站在删 shares 后同批删 share_visits（lifecycle 用 guarded/TRASHED_GUARD 同款守卫）。`maintenance.ts` `purgeExpiredOperationalData` 新增 orphan 清扫（`NOT EXISTS shares.slug`，按 visited_at 分批 ≤capped，结果计数 orphanShareVisits）——历史脏行与 MCP revoke 工具（`mcp/library/shares.ts` 未动，mcp scope）由 cron 兜底。统计侧：`shares.ts` filteredGlobalStats 与 loadNoteVisitStats 各加 `EXISTS (SELECT 1 FROM shares s WHERE s.slug = share_visits.slug)`；`visits.ts` 日志列表 conditions 加同款 EXISTS（幽灵 "Untitled note" 行不再出现）。**遗留**：「按服务端持久化保留期分批清理」未做——保留期目前只存浏览器 localStorage，持久化要动 settings 体系且 blog 侧同构（防 F4 性质），记为待决策追加项。先红后绿：`tests/share-routes.test.ts` 新 describe 5 例（红时 5 failed；两处旧 fixture 的无 shares 行 visit 改配真 slug/补 seedShare）、`tests/notes-routes.test.ts` 新 describe 2 例（purge/清空回收站级联，红时 2 failed）。commit dc8843b8（全量回归 211 文件 / 1688 测试 ✅，typecheck ✅，style/size/comments(白名单 3538/513)/escape/empty-catch/hardcoded/tokens/module-state/deep-imports/i18n 门禁 ✅）。
- 2026-09-19 14 SH-07 ✅ worker+client：公开面防枚举。`share/public.ts` `loadShareOrThrow` 把不存在/已暂停/已过期三个分支合并为同一 404 响应体（分享状态不再是公开信息），`authenticateShareAccess` 口令错误的 401 响应体并入口令缺失（`password_required`；核查 `use-share-page.ts` 只按 HTTP status 分支并自备 `share.incorrect_passcode` 文案，无消费方受损）。`share-analytics.ts` `isValidCustomSlug` 下限 3→6（只动创建侧；`lib/id.ts` `isValidSlug` 保持 3，存量 3-5 位短链继续可读），client 编辑弹窗正则 `{3,64}`→`{6,64}`、en/zh `custom_slug_invalid` 同步。`organizer.ts` check-slug 不再回 `reason`（格式非法与已被占用同答 `{available:false}`，消除枚举预言机），并按用户加 30 次/10 分钟预算（超限 429 带 retryAfter）；api 类型 `reason?` 因 blog checkSlug 共用而保留，全仓无任何代码读它。demo 后端 check-slug 恒回 available:true，未动。先红后绿：`tests/share-routes.test.ts` 新 describe 2 例 + 改 2 例（红时 4 failed：404 三分支互异、口令错误体独立、abcde 可用、reason 泄露），fixture 自定义 slug 'taken'→'taken-slug'；`tests/share-analytics.test.ts` 按 6 字符新契约翻转（'doc' 移入拒绝侧、增 'abcde'→false）。排坑：过期例的 `H.now-1000` 在夹具钟（2033）下仍是未来，改 `Date.now()-1000`。commit c525c8c7（全量回归 211 文件 / 1690 测试 ✅，typecheck ✅，style/size/comments(白名单同步)/escape/empty-catch/hardcoded/tokens/module-state/deep-imports/i18n 门禁 ✅）。
- 2026-09-19 15 SH-09 ✅ worker+client：口令强度与爆破窗口收口。`share/note.ts` 创建侧口令下限 6→8（与账号口令一致；存量哈希不迁移，legacy 4 字符口令仍可验证——既有例已断言）；`share/schemas.ts` `shareAccessSchema.password` 加 `.max(128)`，`public.ts` 去掉 `slice(0,128)` 静默截断（>128 的正确口令此前必 401，现按 400 拒绝，输入长度属性不泄露分享状态；8KB 体上限场景 e2e 仍先行 413，不受影响）；每 slug 免费失败 40→10（`share-slug:{slug}` freeFails，第 10 次失败起锁 60s 递增，跨 IP 换源不再刷窗口；IP 级 8 次/10min scrypt 预算不变）。client：`saveEditShareFlow` 下限 6→8、en/zh `passcode_too_short` 同步。MCP 创建侧下限 4 未动（mcp scope，「口令长度统一」在册 34 号 SH-36）。先红后绿：`tests/share-routes.test.ts` 翻转 6 字符旧契约例 + 新 describe 2 例（红时 3 failed；新增 `postJsonWithIp` 助手给 Request 挂 `cf` 使 `requestClientIp` 采信 CF-Connecting-IP——无 cf 时一律 'local'，同 IP 键 freeFails=5 会在第 6 次抢先 429）。commit e0b0e7cc（全量回归 211 文件 / 1692 测试 ✅，typecheck ✅，style/size/comments(白名单 3545/514)/escape/empty-catch/hardcoded/tokens/module-state/deep-imports/i18n 门禁 ✅）。
- 2026-09-19 16 SH-10 ✅ worker：batch 计数改真实受影响行数 + enable 原子化。`share/batch.ts` 四个 helper 全部返回 `Promise<number>`（各块 `meta.changes` 求和），`/batch` 与 batch-folder/batch-tag 的 `count` 不再回请求条数/文件夹笔记数（非本人或不存在的 note id 此前也计入）；`enableNoteShares` 从「每笔记 SELECT+INSERT/UPDATE 两次往返、中途失败半完成、他人笔记 id 触发 UNIQUE 500」改写为逐笔记 owner-guarded UPSERT（`INSERT…SELECT FROM notes WHERE id AND user_id` + `ON CONFLICT(note_id) DO UPDATE SET is_enabled=1 WHERE shares.user_id=?`），按 50 分块包进 `db.batch`（整块一个隐式事务，≤20 往返/千条）——foreign note 两条臂都匹配不到行，静默跳过并计 0。`revokeSharesForNotes` 计数取 shares DELETE 的 changes（visits 行不计），note.ts 单篇撤销调用方忽略返回值不受影响。client 三处 api 类型本就是 `{ok,count:number}` 且无人读 count，未动。先红后绿：`tests/share-routes.test.ts` 新 describe 3 例（红时 3 failed：count 3≠1、他人笔记 enable 500、folder count 2≠1；folders 夹具需补 updated_at）。commit ea51cc59（全量回归 211 文件 / 1695 测试 ✅，typecheck ✅，style/size/comments(白名单 3548/515)/escape/empty-catch/hardcoded/tokens/module-state/deep-imports/i18n 门禁 ✅）。

### 17 · SH-11 · share 路由 LIKE 通配符转义（2026-09-19）

- 转义点共四处：`shares.ts` 列表 search（4 个 LIKE）、`shares.ts` 列表 tag 过滤、`visits.ts` 日志 search（4 个 LIKE）、`organizer.ts` batch-toggle-group 的 tags 匹配。全部改为 `LIKE ?n ESCAPE '\'` 并绑定 `escapeLike` 处理过的 `%…%` 模式（复用 `lib/like.ts`，与 blog/search 先例一致）。台账写的「三处」低估了：shares.ts 里 search 与 tag 两个过滤器各自独立拼模式，缺一不可。
- `shares.ts:192` 的 `s.tags LIKE '%' || '"' || t.name || '"'` 刻意不动：模式来自数据库列拼接而非用户输入直插，且不在本行范围（铁律 14），如需处理另开条目。
- 测试：SH-11 describe 三个用例（列表 search `a_b` 只命中字面下划线笔记、访问日志 search 同理、tag 通配符不再误开关分组）。访问日志用例因 `shares.note_id UNIQUE` 把两条 visit 拆到两篇笔记上。对 visits.ts 做过变异核查（临时去掉 escapeLike → 用例变红 → 恢复）。
- 顺带修既有测试：SH-09 第十次猜口令用例加 `{ timeout: 30_000 }` 并注释原因——11 次 scrypt 校验在慢机上超过 vitest 默认 5s（npm run test:unit 与 pre-commit `vitest related` 都用默认值，此前处于临界）。
- 验证：红→绿 47/47；tsc=0；10 个静态门禁全绿（白名单已同步）；串行回归 211 文件 / 1698 用例全绿（REGRESSION_EXIT=0）。

### 18 · SH-12 · DELETE /api/share/visits?type=all 需当前密码重认证（2026-09-19）

- 服务端：`visits.ts` 清理路由在 `type==='all'` 时先 `readOptionalJsonValidated(shareVisitWipeSchema)` 读可选 JSON 体，再走 `lib/reauth.ts` 的 `requireCurrentPassword`（台账写的 requireRecentAuth 即此能力，仓库无该函数名）；缺体/错口令一律 401 wrong_password，删除不执行。bots/older_than 维持免口令。schema 里 password `.max(LIMITS.passwordMaxLength)` 可选。
- 客户端：`components/overlay/prompt.tsx` 新增 `type: 'password'` 与 `autoComplete`（密码值不走 trim，footer 抽成 PromptFooter 以过 size 门禁）；`api.share.cleanVisits` 增第三参 password（有值才带 JSON 体）；两处清理入口（设置弹窗/日志弹窗）在 type=all 时 danger confirm 之后链一步 `promptWipePassword()`（放 share-helpers.ts 共用，取消即中止）；catch 区分 ApiError 用已本地化的 message 提示（wrong_password 在 api 错误映射表内）。
- demo 后端 `routes/share.ts` clearShareVisits 对 type=all 比对 `state.password`，不一致回同样的 401 wrong_password，与 worker 行为镜像。
- 测试：SH-12 三个用例（无体/错口令 401 且行全保留、正确口令全清、bots/older_than 不受影响）；seedUser 增 passwordHash 形参；既有 days 验证用例的 all 段改带口令。日志弹窗菜单测试改 mock prompt（断言带 `type:'password'` 调用、cleanVisits 收到密码、取消即不调用）。变异核查：摘掉服务端守卫 → refuse 用例变红 → 恢复。
- 门禁：size 基线首次报 3 个新长函数，全部以真实拆分通过（helper 提取 + footer 组件 + 测试公共步骤 clickCleanAllItem），未使用 --update-baseline。
- 验证：定向 50/50、client 相关 89/89；tsc=0；10 门禁全绿；串行全量 211 文件 / 1702 用例绿（REGRESSION_EXIT=0）。

### 19 · SH-13 · slug 一致性三小修（2026-09-19）

- 抢注竞态：`note.ts` upsert 写 shares 处包 try/catch，命中 `UNIQUE constraint failed: shares.slug` 转 409（与预检查同文案）；预检查本身不动。并发双 POST 同 customSlug 用例断言状态集合 [200,409]，修复前实测为 [200,500]。
- 改 slug 悬空：UPDATE 分支改 `db.batch`，targetSlug 变化时同事务追加 `UPDATE share_visits SET slug=新 WHERE slug=旧 AND user_id AND note_id`（带 note_id 限定，别家孤儿行留给 13 号的 cron 收）。日志 search 用新 slug 能命中该 visit。
- 撤销残留：`revokeSharesForNotes` 事务内第一条改为按 shares 子查询删 `share_asset_sessions`（子查询必须在 shares 删除前读，故置首），其后 shares/visits 不变；count 仍只算 shares 行（解构占位 `[, sharesDeleted]`）。单篇 DELETE 路由、批量 revoke、lifecycle 共用此 helper，一处覆盖三入口。
- 未做（超出行范围）：note_id 双建竞态（同笔记并发首建仍 500）台账未列，不夹带。
- 验证：SH-13 三用例红→绿 53/53；tsc=0；10 门禁全绿（白名单同步）；串行全量 211 文件 / 1705 用例绿（REGRESSION_EXIT=0）。

## 20 — SH-18 搜索防抖 + AbortSignal + 在途去重（2026-09-19）

- 现象：`setSearch` 每次按键立即 `loadShares()`；旧请求不取消，只靠 `loadEpoch` 丢弃结果；同参数并发会重复打网络。
- 修复：
  - `share-store/loaders.ts`：`loadSharesImpl` 先按参数 JSON 去重（在途同参直接复用同一 promise），异参则 `abort()` 上一个 `AbortController` 并把 `signal` 传给 `api.share.list`（该参数早已存在，无需改 transport）；`runShareLoad` 拆出以过 50 行函数门禁，结束时按 key 释放在途槽位。
  - `share-store/filters.ts`：`setSearch` 立即写 state（输入框保持受控响应）但 300ms 防抖后再 `loadShares`；`applyShareFilter`/`setFiltersImpl`/`setCategoryImpl`/`setFolderIdImpl`/`setTagImpl` 五条即时加载路径先 `cancelPendingSearchReload()`，避免类别/状态切换后泄漏的定时器再补一刀重复请求。
  - 新增 `share-store/search-load.test.ts` 5 例：连打只发一次且带最终词；即时筛选替换待触发搜索（变异验证：去掉 cancel 该用例转红；初版同步 `advanceTimersByTime` 被在途去重掩盖，改 `advanceTimersByTimeAsync` 先结算首载）；异参顶替时旧 signal 已 abort 且其 reject 不弹 toast 不落 error；同参并发只发一次；完成后再查同参正常发出（防去重过紧）。
- 验证：目标 20/20 绿；`tsc=0`；十门禁全 0（含 size 拆分两个 describe 回调后）。全量串行回归见下方提交记录。
- 补：`runShareLoad` 参数收敛为单对象（AGENTS「参数超过 3 个改对象传参」）；释放在途槽位改按 `controller` 身份而非 key 比对——被中止的同参旧 run 不得释放继任 run 的槽位，新增第 6 例「an aborted run does not free the dedup slot of its replacement」锁住（变异验证：改回 key 比对即转红）。
- 事故记录：验证变异时用 `git checkout --` 还原，误将未提交的 loaders.ts 整体退回 HEAD，第一次全量回归（1710/1711）唯一失败即此竞态产物；重写后以 `/tmp` 备份做变异还原，并跑第二次干净回归。

## 21 — SH-21 folders/tags 加载守卫 + 写成功定向 patch（2026-09-19）

- 现象：开一次 hub 固定 6 请求（folders/tags 各 2 份：runShareLoad 隐式 + sidebar effect；edit-modal/submenu 打开再各 1 份）；pin/toggle 等行级写成功后又 `loadShares()` 全量重拉（叠加隐式 folders/tags = 台账「1 PUT + 7 往返」）。
- 修复：
  - `share-store/loaders.ts`：loadFolders/loadTags 加 `guardCollection`（在途去重 + 30s TTL，失败不记 lastLoadedAt 故下次开 hub 重试）；删掉 runShareLoad 成功后的两行隐式 fetch（四个 UI 表面各自 mount 时已显式加载，sidebar 启动预取也不再捎带 2 请求，为 24 号 SH-19 减负）。
  - `share-store/shares.ts`：新增 `applyServerShare(share)`（types 同步）——命中当前列表则整行换成服务端响应（含新建 slug），未命中（行被筛选器挡住）回退一次 loadShares；toggleShare 成功走 applyServerShare；togglePin/toggleStar/batchToggleGroup/batchMoveToFolder 的乐观 patch 已是服务器真相，删成功路径重拉，失败路径保留 loadShares 重同步；batchToggle/batchFolderToggle/batchTagToggle 影响不可见行与统计，刻意保留一次重拉。
  - 特性层 create 响应体即完整 ShareInfo 的流程改走 patch：`use-share-edit-modal.ts` 保存、`use-share-note-submenu.ts` 的 ensureShare/selectFolder(新建分支)/addTag/removeTag；两处 revoke 后行形状未知仍 loadShares。
  - 测试：新增 `guards-writes.test.ts` 9 例（TTL 去重与到期重取、loadShares 不再拉集合、toggleShare 成功不重拉且换行、失败重同步 ×3、乐观组写不重拉、bulk batch 保留重拉、applyServerShare 回退）；SH-15 三个用例的 create 桩从 `{}` 改为完整 `{share}`（行为契约变化，桩随迁）。
  - 变异验证：删 TTL 早退或 applyServerShare 回退各自转红（/tmp 备份还原，不用 git checkout）。
- 遗留：hub 开合跨 TTL 仍会重拉集合，属预期刷新。
