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
| 22 | SH-23 | store 派生 `Map<noteId, ShareRow>`，行订阅改原始值 | P2 | ✅ | d291a2be |
| 23 | SH-22 | 表格行 memo + 菜单 items 惰性构建 + folders Map | P2 | ✅ | 245c74ce |
| 24 | SH-19 | App 启动瘦身：`/api/share/summary` 轻量端点 | P1 | ✅ | 2b04d5cc |
| 25 | SH-20 | code-split：barrel 拆 store/modals 入口（保持 blog 现有 import 不破） | P1 | ✅ | 3d6496e0 |
| 26 | SH-17a | 列表接口 5 个统计查询 `db.batch` 并行化（第一步，不拆端点） | P0 部分 | ✅ | 79748dbf |
| 27 | SH-28 | 实时访问日志补时间窗 + 文案改「最近访问」 | P2 | ✅ | eca5e37b |
| 28 | SH-30 | 侧栏计数口径（软删过滤/expiring 互斥/全时段标注）+ LIMIT 500 truncated | P2 | ✅ | c495cfd7 |
| 29 | SH-31 | a11y 批量：Switch label、IconButton、hub ariaLabel、行「更多」键盘入口 | P2 | ✅ | 0526b88e |
| 30 | SH-32 | 调色板类 → 设计令牌（visit-logs/sidebar/qr/dashboard 等） | P2 | ✅ | ac3941fb |
| 31 | SH-33 | 裸控件换组件体系 + CSV 导出全量 + 复制失败 toast + 日志按分享过滤入口 | P2 | ✅ | c5824e95 |
| 32 | SH-34 | 英文字面量进 locale + 服务端回落值改 null + countryName locale 显式 | P2 | ✅ | 91a10c0f |
| 33 | SH-35 | 窄屏：侧栏折叠/宽模态 fullscreen/批量条换行/触控尺寸 | P2 | ✅ | b080398a |
| 34 | SH-36 | 小项集合（口令长度统一、effect 重开、子模态重置、th scope、role=status 等） | P3 | ✅ | 21cbdddc |
| T | SH-37 | 通病解冻：`--danger/warning/success-subtle` 全站引用无定义（渲染透明）→ 统一按 `-soft` 家族补定义并改名引用；三对色令牌按 AA 重校准 | P2 | ✅ | a5a02d38 |
| F1 | SH-29 | `big-svg-chart` 全 0 空态 / `dashboard-blocks` delta 0% / `computeDelta(0,0)` — blog 看板共用，双侧回归 | P2 | ✅ | 待回填 |
| F2 | SH-16b | range=all 行为改 `lib/share-analytics.ts` 的 `getRangeStartTimestamp`/`buildShareTimeline`（blog stats.ts 共用），并做 all 整表拉行 SQL 下推（26 号遗留） | P2 | 排队 | |
| F3 | SH-05b | `maintenance.ts` cron 与 blog 附件/清理共用调度中触碰 blog 语义的部分（排在 F5 之后） | — | 排队 | |
| F4 | SH-25b | blog `visits.ts` 同构缺陷（与 11、12 号对称）：指纹盐走 HMAC+`VISIT_FP_SECRET`、referrer 上限+scheme 白名单+origin/pathname 剥离 | P1 | 排队 | |
| F5 | SH-05c | 日志保留期持久化到服务端 share settings（现只在浏览器 localStorage），cron 按保留期分批清理 share_visits | P2 | 排队 | |
| G | SH-38 | `check-hardcoded` 扩展调色板类全站禁令（30 号以 share 测试代守，先量全站违规面再定采纳范围） | P3 | 排队 | |

> 2026-09-20 用户裁决「全做，按照你认为最优方案修改，顺序自己定义」：F1-F5 与通病全部解冻，
> 执行序 T→F1→F4→F2→F5→F3→G；跨模块共用件（blog/music/看板组件）改动均在本批准范围内。

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

## 22 — SH-23 分享行派生索引 + 逐行订阅（2026-09-19）

- 现象：每个笔记行 `useShareStore((s) => s.shares)` 订阅整个数组再线性 find（n 行 × m 记录，任一分享写操作让全列表行重渲）；列表层还额外 `useMemo` 造 `sharedNoteIds` 集合并以 `isShared` prop 逐行下发，写一次分享连列表组件本体都重渲。
- 修复：
  - 新增 `share-store/row-index.ts`：`shareRowIndex(shares)` 用 `WeakMap` 按数组身份缓存 `Map<noteId, ShareInfo>`；`selectShareRow(shares, noteId)` O(1) 取行（同数组重复选择返回同一行引用）；`useShareRowForNote(noteId)` 订阅选择器返回值而非数组。经 `share-store/index.ts` 具名再导出（走模块公开入口）。
  - `note-list/note-row-state.ts`：`useNoteRowShareState` 改走 `useShareRowForNote`，删 `isShared` prop（唯一来源即列表层，`computedIsShared` 语义不变 = 该行在 shares 中是否存在）。
  - `note-list.tsx` / `note-list/render-window.tsx`：删 `useShareStore` 订阅、`sharedNoteIds` 派生与整条 prop 透传链，列表本体不再因分享写而重渲。
  - `workspace/use-workspace.ts:68`：布尔选择器里的线性 `some` 换成 `selectShareRow` 查表（本就是原始值订阅，只去掉 O(m) 扫描）。
  - 测试 `row-index.test.ts` 4 例：selectShareRow 命中返回原对象/未命中 null；同数组复用同一 Map、新数组重建；双探针下写入他行不重渲本探针而行更新会重渲（变异验证：hook 退回整数组订阅即转红）；行从不存在到出现会重渲（变异验证：去掉 WeakMap 缓存则索引用例转红）。
- 遗留：`note-row-state.ts` 的 `useNoteRowShareState` 孪生 `useNoteRowBlogState` 是同款「整数组订阅+find」，属博客管理中心读侧，按约束③不动、等裁决；`use-workspace.ts` 的 `isBlogPublished` 同理。

## 23 — SH-22 表格行 memo + 菜单惰性 + folders Map（2026-09-19）

- 现象：分享中心表格每次渲染为 500 行 × 20 目录无条件构建目录菜单（行内 `items={buildFolderMenuItems(...)}` 即使菜单关闭也建）；`RowTitleCell` 每行 `folders.find` O(行×目录)；容器 11 个内联回调 + hub 三个内联箭头使任一勾选全表重渲。
- 修复：
  - `share-table-view/row.tsx`：`ShareTableRow` 包 `React.memo`；props 契约改为携带 noteId 的稳定回调（`onToggleSelect(noteId)` / `onToggleShare(noteId, checked)` / `onMoveToFolder(noteId, folderId)` / `onRevoke(share)`），行内自己补 noteId；目录 Menu 改 `{isFolderMenuOpen && <Menu .../>}` 条件挂载（items 构建随挂载惰性化，与上下文菜单既有模式一致）；`RowTitleCell` 改用容器下发的 `folderById: Map` 查目录；PV/UV+最近访问两个 td 拆出 `RowStatsCells` 过 50 行 size 门禁。
  - `share-table-view/index.tsx`：`folderById` 用 `useMemo` 按 `list.folders` 建一次；行 props 全部换成稳定引用（store action + list.handleXxx + 容器透传的 onOpenQr/Analytics/Edit）。
  - `use-share-list.ts`：handleCopy/handleMoveToFolder/handleRevoke 包 `useCallback`（依赖均为稳定 store action）。
  - `use-share-hub-modal.ts`：新增稳定 `openQr/openAnalytics/openEdit`（useCallback 包 setState setter），initialNoteId 自动开编辑 effect 拆为 `useInitialNoteEdit`（对象传参）过 size 门禁；`share-hub-modal.tsx` 两视图改传这三个稳定回调（原为 HubContent 内联箭头）。
  - `share-grid-view/card.tsx`：目录 Menu 同样改条件挂载（同一惰性缺陷，一行）。网格卡 memo 未做（计划行只列表格）。
- 测试 `share-table-view/table-view.test.ts` 5 例：行处理器收到 noteId；memo 标记（$$typeof）；目录菜单挂载前 `buildFolderMenuItems` 零调用、打开后恰一次且移动回调带 (noteId, folderId)（`vi.mock` 包装真实构建器做 spy）；useShareList 三 handler 跨渲染同身份；hub 三回调跨渲染同身份。变异验证：去 memo / 退回 eager `<Menu open=...>` 各自转红（/tmp 备份还原）。
- 遗留：>100 行虚拟化未做——memo 后稳态重渲已是 O(脏行)，首挂载仍 O(n)，台账本就说「评估」，需要时另开项；`ShareGridCard` 的 `folders.find` 与内联回调同款问题留待网格行 memo 一并处理（本次只做台账点名的表格）。

## 24 — SH-19 App 启动瘦身：/api/share/summary 轻量端点（2026-09-19）

- 现象：`sidebar.tsx` mount 即 `loadShares()`，只为侧栏分享角标计数与笔记行「已共享」标记，却拖整个分析级列表（globalStats 5 串查询 + 最多 500 行 ShareInfo 常驻），99% 不开分享中心的会话白付这笔启动成本。
- 修复：
  - `src/shared/types/share.ts`：新增 `ShareSummaryResponse { totalShares, sharedNoteIds }`。
  - `src/worker/routes/share/shares.ts`：新增 `GET /api/share/summary`——单条 `SELECT note_id FROM shares WHERE user_id`，计数=集合长度，无 stats/visits 聚合；静态路由优先于 `/:noteId`，回归用例同时守住该点。
  - `src/client/lib/api/share.ts`：`share.summary(signal?)`。
  - `share-store/`：`types.ts` 增 `ShareSummaryState`（sharedNoteIds 存 Set）+ `summary` 字段 + `loadSummary` action；`loaders.ts` 新增 `loadSummary`（在途去重；shares 已有行或 globalStats 已载则跳过，防止过期集合复活）；`runShareLoad` 成功时置 `summary: null`——完整列表一旦到手就是唯一真源；`index.ts` 可见性快照 `sharedNoteIds` 改为 rows ∪ summary（启动期「共享」视图筛选靠集合驱动）。
  - `row-index.ts`：新增 `isNoteShared(state, noteId)`（行命中 ∪ summary 集合）与 `useNoteIsShared` 布尔订阅；`note-row-state.ts` 的 `computedIsShared` 换用它（noteShare 行订阅保留，供子菜单数据）；`use-workspace.ts` isShared 同换。
  - `sidebar.tsx`：启动预取 `loadShares()` → `loadSummary()`；角标 `globalStats ?? shares.length ?? summary.totalShares`。
  - `use-share-note-submenu.ts`：`ensureShare` 先 `api.share.getNoteShare(noteId)`（该 GET 端点此前无人使用）确认已有分享则直接用，确认未分享才走 create——否则启动瘦身后行内「复制链接」会把暂停中的分享静默 enable。
  - `src/client/demo/backend/routes/share.ts`：demo 镜像 `/api/share/summary`（state.shares 键集）。
- 测试：`tests/share-routes.test.ts` 2 例（跨用户隔离+精确响应体）；`share-store/summary-load.test.ts` 5 例（填充 Set/在途去重/列表到手丢集合/已载列表跳过/失败 warn+toast）；`row-index.test.ts` 增 `isNoteShared` 3 例；`use-share-note-submenu.test.ts` 2 例（有分享只 GET 不 create、真未分享仍 create）。变异四杀：不丢 summary / 删跳过守卫 / isNoteShared 去集合回退 / ensureShare 退回直接 create，各自转红（/tmp 备份还原）。
- 遗留：`refreshSummary` 失败与 loadShares 一样走 toast（启动离线会弹一次），行为与修前一致；行内 Switch 首发/applyServerShare 未知行仍回退整列表（SH-21 既定语义，未动）。

## 25 — SH-20 share modals 退出 shell 首载块（2026-09-19）

- 现象（2026-09-17 dist 实测）：`qrcode.react`（16.2KB）+ 分享 modal 群（143.6KB raw）全在 shell 块，登录后必载；根因是 `features/share/index.ts` 宽 barrel 同时导出 store 与 5 个 modal，`note-row-ui.tsx`/`note-row-items.tsx` 静态 import 让 `app-shell.tsx` 的两处 `lazy()` 退化为同块。
- 修复：
  - `features/share/modals/index.ts`：新增 lazy-only 入口，具名再导出 5 个 modal（ShareHubModal/ShareEditModal/ShareNoteAnalyticsModal/ShareNoteSubmenu/ShareQrModal）。
  - `features/share/index.ts`：只留静态安全面（share-helpers + share-store），blog 两处 `countryFlag/countryNameLocalized` 的 `from '../../share'` 原样不破。
  - `note-row-ui.tsx`：3 个行内 modal 改模块级 `lazy(() => import('../../share/modals'))` + 条件渲染处包 `<Suspense fallback={null}>`；`note-row-items.tsx` 的 ShareNoteSubmenu 同改（子菜单首次展开才拉块）；`app-shell.tsx` 两处 lazy 指向 `../share/modals`。
  - `qr-export.ts`：downloadQrSvg/downloadQrPng/copyQrImageToClipboard 从 share-helpers 迁出（只被 share-qr-modal 使用）——实测发现它们在静态 barrel 时，`QR_BG_COLOR` 常量边把整个 qrcode 库块拽进 shell 的静态闭包；share-helpers 删三函数与 qr-colors 依赖。
  - `tests/share-code-split.test.ts`：AST 静态闭包守卫（动态 import 视作边界）——share 之外任何模块不得静态触达 modal 图；3 个消费文件必须经 `share/modals` 动态入口且不得 dynamic-import 根 barrel（防再退化）；带「被禁面必须存在」防空转。
- 验证：红→绿；变异三杀（barrel 回流一个 modal / app-shell lazy 退回根 barrel——首版断言只数存在性被此变异漏过，加强为 barrel 禁止后杀死 / 删 modals 入口）。tsc+15 文件/138 测+十门禁全绿；`npm run build` 产物复核：qrcode 块（esm-*.js 15.8KB）不再出现在 shell 的 43 块静态闭包里，qr-colors 独立 0KB 块仅被 modals/account-settings/attachments 三个 lazy 块引用。
- 遗留（按约束③不动）：shell 闭包内唯一残留 qrcode 触达来自 `blog-*.js`（link-qr-modal 静态并进 blog 块），与 blog barrel 宽导出同构，归 blog 管理中心任务；`vendor:check` 只算 index.html 静态闭包的盲区本次由新守卫在源码层补住，未改门禁脚本。

## 26 — SH-17a 列表/分析接口 db.batch 并行化（2026-09-19）

- 现象：`GET /api/share` 串行 7+ 次 D1 往返（5 个 globalStats 查询 + 列表行 + 每 50 note 一轮 visits 统计）；`GET /analytics/global` 串行 6 次往返、`/analytics/note/:id` 3 次（04 号遗留登记的 analytics 并入本项）。D1 按查询收费且每次往返吃 Worker I/O 等待，同依赖层的查询没有理由排队。
- 修复：
  - `src/worker/routes/share/shares.ts`：列表路由把 folderCounts/tagCounts/globalSummary/filteredGlobalStats/pinStar 五个统计与列表行查询合成一次 `db.batch`（6 语句 1 往返）；`loadNoteVisitStats` 的分块统计从「每块一次 await .all()」改为一组语句进单个 `db.batch`（120 note 由 3 往返降到 1）。原 `loadShare*` 系列拆成语句构建器 + 纯解析函数（`folderCountsStatement`/`toFolderCounts` 等），响应组装走 `buildShareGlobalStats`，输出与改前逐字段一致。
  - `src/worker/routes/share/global-stats.ts`：新文件承接上述构建器/解析器与 `ShareGlobalStats`（shares.ts 借 size 门禁 500 行红线拆出）。
  - `src/worker/routes/share/read-results.ts`：新增 `rowsOf/firstOf`——batch 响应按语句顺序回填，替代 `.all()/.first()` 的最小解包。
  - `src/worker/routes/share/analytics.ts`：global 路由 range=all 的 MIN 扫描单独一次 batch，其余 summary/rangeVisits/prevStats/filterStats/recentVisits 五个互不依赖的查询并成第二次 batch，仅 `loadTopNotes`（依赖 visits 行）保持第二次之后直查——6 往返降到 2+1；note 路由 `loadNoteShare` 保持第一条直查（404 判定优先，不能让 ghost noteId 触发 visits 查询），其后 rangeVisits+recentVisits 一次 batch；`scopeAllRangeWindow` 拆为 `minVisitedAtStatement` + 纯函数 `applyAllRangeWindow`；响应字面量抽成 `composeGlobalAnalytics`（两处超 50 行函数红线）；五个 `load*` 改语句构建器。
- 测试 `tests/share-routes.test.ts` 新 describe 4 例：`instrumentRoundTrips()` 包装 `DB_ENV.env.DB` 计「直接 .all/.first 串行往返」与「db.batch 次数」——列表恰 2 batch 0 直查、global 1 batch+topNotes 1 直查（总往返 ≤2）、note 1 batch+404 门 1 直查、ghost noteId 必须 0 batch（守住「gate 先行」不被顺手 batch 掉）。变异两杀：visits 分块退回逐块 await → 列表红；recentVisits 拆独立 batch → global 红（/tmp 备份还原）。既有行为用例（列表筛选/120 note 分块/all 分桶/bot 过滤/404 语义）59 例全绿，响应体不变。
- 验证：红→绿；tsc + share 全套 13 文件/121 测 + 十门禁全绿（size 逼出 global-stats.ts 拆分与 compose 抽取）。
- 遗留：`all` 区间「整表拉行再内存分桶」的 SQL 下推未做——`buildShareTimeline` 的分桶语义属冻结共用件 `lib/share-analytics.ts`（约束③/F 清单），忠实下推须改其行为，等裁决；`GET /note-share/:noteId` 本就单查询，无可并行项未动。

## 27 — SH-28 最近访问日志补时间窗 + 去「实时」文案（2026-09-19）

- 现象：看板「实时访问日志」卡片在 7d 区间仍列出 14 天前的记录——`recentVisitsStatement` 只带过滤 clause 不带区间 `startTs`，与同页 timeline/KPI（`rangeVisitsStatement`）口径不一致；且「实时/Live」名不副实（无任何轮询/订阅，一次性 LIMIT 20）。
- 修复：
  - `src/worker/routes/share/analytics.ts`：`recentVisitsStatement` 新增 `startTs` 参数，两种 SQL（全局/note）各加 `sv.visited_at >= ?N`；两个调用点传 `ctx.startTs`。range=all 时 ctx.startTs 已由 `applyAllRangeWindow` 在主 batch 之前就位，故「全部」区间仍列全史，语义不变。
  - locales：`share.recent_activity_title` zh「实时访问日志」→「最近访问」、en「Live Activity Stream」→「Recent Visits」（键名不动；`share.realtime_stream`「最新 20 条访客记录」为事实描述，保留）。blog 侧 `blog.realtime_logs` 同款文案属 blog 管理中心，按约束③不动。
  - `share-note-analytics-modal.tsx`：笔记分析弹窗补手动刷新 IconButton（与看板头部同款 `common.refresh` + RefreshCw 旋转态），弹窗此前只能靠切区间/重开触发重拉；看板头部本就有刷新，未重复加。轮询（可见性门控）不做——文案已不再承诺实时。
- 测试 `tests/share-routes.test.ts`：analytics describe 新增 3 例——global 7d 排除 14 天前记录、note 7d 同、range=all 仍含 800 天前记录（防未来把 all 也滤掉）。变异两杀：note SQL 删 `visited_at >= ?3` → note 例红；global 调用点 startTs 传 0 → global 例红（/tmp/mut27 备份还原）。
- 验证：红→绿；tsc + share 全套 14 文件/141 测 + 十门禁全绿（无新注释，allowlist 无变化）。弹窗刷新按钮为既有 IconButton 原语复用，键盘/焦点由组件自身保证，未在 jsdom 另测。

## 28 — SH-30 侧栏计数口径 + LIMIT 500 truncated（2026-09-19）

- 现象（三个叠加口径缺陷 + 一个静默截断）：(a) 徽章/目录/标签统计 `FROM shares` 不 join notes，分母含回收站笔记的分享，而列表强制 `n.deleted_at IS NULL`；(b) `status=expiring` 条件 `expires_at IS NOT NULL` 与 expired 重叠非互斥（已失效链接出现在「有效期限制」分类）；(c) 侧栏底部 PV/UV 是全时段值、看板同名标签是区间值，同屏近义混淆；(d) 列表 `LIMIT 500` 且 `total = shares.length`，超 500 静默截断无提示。
- 修复：
  - `routes/share/global-stats.ts`：`globalSummaryStatement` 改 `JOIN notes … AND n.deleted_at IS NULL`；`folderCountsStatement`/`tagCountsStatement` 各加 `LEFT JOIN notes n ON n.id = s.note_id`，计数谓词补 `s.slug IS NOT NULL AND n.deleted_at IS NULL`（空目录行 n 全 NULL 仍计 0，语义不变）。
  - `routes/share/shares.ts`：expiring 从静态 `STATUS_CONDITIONS` 表移出，改绑 `now` 的动态分支 `expires_at IS NOT NULL AND expires_at > ?N`，与 expired/permanent 三方互斥；行查询 `LIMIT 501`（常量 `SHARE_LIST_ROW_LIMIT`+1），路由比对多取的一行得出 `truncated` 并切片，响应新增 `truncated` 字段。
  - `shared/types/share.ts`：`ShareListResponse.truncated: boolean`（必填）；demo 后端镜像 `truncated: false`。
  - `share-store`（types/index/loaders）：`truncated` 随每次成功列表加载入库（`res.truncated === true`，失败路径不动）。
  - `share-hub-modal.tsx`：工具栏下方 `<ListTruncatedNotice/>`（`role='status'`，仅截断时渲染）；`HubContent` 因新行超 50 行红线，把列表主体拆成 `HubListBody`。
  - locales：`share.category_expiring` zh「有效期限制」→「有效期内」（新语义）；`share.total_pv_views`/`share.total_uv_visitors` 加「全部时间」限定；新键 `share.list_truncated`（en/zh）。blog 侧同名 key 不动（约束③）。
- 测试 `tests/share-routes.test.ts` 新 describe 3 例：软删笔记分享不进徽章/目录/标签分母（列表本就不含）且 `truncated:false`；expiring/expired/permanent 三分类互斥各只含自己那条；种 501 条后 `shares.length===500 && truncated===true`（per-test timeout 30s）。变异三杀：folder 计数退回 `COUNT(s.slug)` / expiring 退回静态 `IS NOT NULL` / `truncated` 恒 false（连带 501 行泄漏即红）（/tmp/mut28 备份还原）。
- 验证：红→绿；tsc + share 全套 + 十门禁全绿（size 逼出 HubListBody 拆分）。遗留：demo 的 `SHARE_STATUS_FILTERS` 本就没有 expiring/expired/permanent 三个谓词（演示数据小、口径缺失为既有缺口），未夹带补齐；「即将到期」提醒（台账第四节 4）不在本项。

## 29 — SH-31 a11y 批量（2026-09-19）

- 现象：Switch 无 label（traffic-filter-popover、edit-modal sections 三处、settings-modal）、批量条清空按钮是裸 `<button>`+图标无名称、hub 模态是六个模态里唯一无 title/ariaLabel 的（回落通用「对话框」）、行/卡片的复制-二维码-分析-撤销全套操作只有右键与 hover 图标可达（双击=编辑、拖拽=移动同样无键盘等价）、流量过滤触发器无 `aria-expanded`、编辑弹窗标签移除按钮无名称。
- 修复（row.tsx/card.tsx 各加「更多」入口 + 逐处补名称与状态）：
  - `share-table-view/row.tsx`、`share-grid-view/card.tsx`：`RowActions`/`CardActions` 末尾新增 `MoreHorizontal` 的 `IconButton`（`label=common.more_actions`、`aria-haspopup='menu'`、`aria-expanded` 随开合），打开的 `Menu` 与右键走同一份 `buildShareMenuItems`（编辑/移动目录本就在菜单内，双击与拖拽自此有了键盘等价）；目录按钮同步补 `aria-haspopup/aria-expanded`；右键打开时互斥关掉两个内联菜单。
  - `share-batch-bar.tsx`：清空按钮换 `IconButton`（`common.clear_selection`）；移动/有效期两个菜单触发器补 `hasPopup`/`ariaExpanded`。
  - `share-hub-modal.tsx`：`Modal` 补 `ariaLabel={t('share.hub_title')}`。
  - `share-traffic-filter-popover.tsx`：触发器 `aria-haspopup='true'`+`aria-expanded={isOpen}`；`TrafficFilterRow` 的 Switch `label={title}`。
  - `share-settings-modal.tsx`：`SettingsSwitchRow` Switch `label={title}`；`share-edit-modal/sections.tsx`：状态/自定义短链/口令三个 Switch 补 `label`，标签移除按钮补 `aria-label`。
  - locales：新键 `share.remove_tag`（en/zh）；`common.more_actions`、`common.clear_selection` 为既有键复用。
- 测试 `src/client/features/share/share-a11y.test.ts` 新文件 7 例（jsdom，行为断言：行/卡片「更多」开菜单并派发编辑回调、清空按钮名称与点击、hub dialog 可访问名称、popover aria-expanded 开合、三处 Switch 名称逐断言、移除标签按钮名称）。变异七杀：逐处删 label/ariaLabel/IconButton 替换回裸 button/删「更多」按钮块（/tmp/mut29 备份还原）。
- 验证：红→绿；tsc + share 全套（13 文件/69 例）+ 十门禁全绿（size 逼出测试文件按表面拆 4 个 describe 与夹具提模块作用域）。
- 决策记录：台账方案里的 `useContextMenu 增 openAtElement` 未做——行/卡片「更多」按钮已提供同一菜单的键盘入口，再给 `useContextMenu` 加无调用方的 API 违反禁止死代码；`share-note-submenu.tsx` 的手搓菜单面板与 `buildShareMenuItems` 双份实现未合并（改动面大且非本项验收点），登记为遗留。全站其他手搓 popover 的 `aria-expanded` 通病按台账只修本模块。

## 30 — SH-32 调色板类 → 设计令牌（2026-09-19）

- 现象：share 有 12 处直接写 Tailwind 调色板类绕过令牌——日志/看板选中态与 TOP3 徽章 `text-white`（暗色主题下白字压 accent 尚可、亮色主题不随 `--accent-contrast` 反转）、访问类型四徽章 amber/blue/purple/emerald-500、星标三处 amber-500、QR 卡片 `bg-white`。`check-hardcoded` 只扫 hex 与任意值，调色板类是门禁盲区（台账预判，本项以测试补上）。
- 修复（全部换成已定义令牌，`tokens.css` 一字未动）：
  - `share-visit-logs-modal.tsx` / `share-dashboard-view.tsx`：`bg-[var(--accent)] text-white` → `text-[var(--accent-contrast)]`（亮 #99% 白、暗 #16% 深，两主题各自校准过）。
  - `share-visit-logs-modal.tsx` `VisitTypeBadge`：bot→`--warning`、human→`--success`（含 `/10` `/20` 透明度修饰符，等价原 `bg-amber-500/10` 结构）；owner→`--accent` 系；self-referrer→中性（`--bg-hover`/`--text-secondary`/`--border-default`）。
  - `share-item-common.tsx` / `use-share-hub-sidebar.tsx`：星标 `text-amber-500 fill-amber-500` → `text-[var(--warning)] fill-current`（fill-current 与行内星标既有写法一致）。
  - `share-qr-modal.tsx`：卡片 `bg-white` → `bg-[var(--swatch-white)]`，附注释——QR 底不随主题（`qr-colors.ts` 固定白码点），深色框会侵入静区。
- 测试 `tests/share-palette-tokens.test.ts` 新文件（静态扫描，先红后绿）：遍历 `features/share/**`（排除测试）断言零调色板类；`bg-transparent`/`border-transparent` 属结构用途不在黑名单。变异：把 human 徽章退回 `bg-emerald-500/10` → 红（/tmp 备份还原）。
- 决策记录：台账方案预设 `--info` 系令牌，实际 `tokens.css` 无 `--info`/`--purple`，且 `--*-subtle`（danger/warning/success）系令牌全站被引用却无一处定义（`bg-[var(--danger-subtle)]` 实际渲染为透明）——新增/补定义属共享设计令牌层，超出本任务「只动 share」红线，登记为通病遗留待裁决；owner/self 徽章按现成令牌就近映射（accent/中性）而非发明新色相。门禁补调色板扫描（`check-hardcoded` 扩展）按台账另批。

## 31 — SH-33 裸控件换组件体系 + CSV 导出全量 + 复制失败 toast + 日志按分享过滤入口（2026-09-19）

- 裸控件（`tests/share-bare-controls.test.ts` 静态扫描，先红 5 处后绿）：`share-hub-toolbar.tsx` SearchField、`share-visit-logs-modal.tsx` SearchBox、`share-edit-modal/sections.tsx` 链接只读框/新标签输入/slug 复合框共 5 处 `<input>` → `Input`（leading 图标插槽、aria-label 齐），dice 按钮 → `Button variant='ghost'`；`share-note-submenu.tsx` 2 处内嵌搜索框进白名单（属第 29 项子菜单去重遗留，随该批处理）。
- CSV 导出全量（`use-share-visit-logs-modal.ts`）：旧实现只导当前页 25 条；新 `collectAllVisits` 按服务端上限 `EXPORT_PAGE_SIZE=100` 逐页拉齐再导出，带当前 filter/search/note 作用域；`isExporting` 期间按钮禁用；成功 toast 改带 `{count}`（en/zh `share.export_success` 同步改写）；`share-visit-logs-export.test.ts` 三例：260 条按 [1,2,3] 页收集、过滤+笔记作用域、失败 toast 且按钮恢复。
- 复制失败不再静默（`use-share-list.ts`）：`copyShareLink` catch 增 `preview.could_not_copy` danger toast（console.warn 保留为开发者侧上下文）；`handleCopy` 依赖 toast（store action 引用稳定，行 memo 不受影响）。
- 日志按分享过滤入口：`use-share-hub-modal.ts` 新增 `logsNoteId` + `openLogs(noteId?)`（关日志时清空），hub 三处入口改走 `openLogs`（`() => hub.openLogs()` 包裹，防事件对象误作 noteId）；`share-note-analytics-modal.tsx` RecentActivityCard 头部新增 `share.view_all_logs` 按钮（仅宿主传入 `onOpenLogs` 时渲染），hub 里传 `openLogs(analyticsNoteId)`——`ShareVisitLogsModal` 的 `initialNoteId` prop 由死参转正。
- 新增 locale 键 `share.share_link`（en/zh）。尺寸门禁 6 个新超 50 行函数全部真实拆分（RecentVisitRow / HubInsightOverlays / SlugEditorRow / 两 hook 压缩 + 测试 mount/export 公共步骤），未动基线。
- 变异：`<Input`→`<input` → 守护红；`EXPORT_PAGE_SIZE`→25 → 导出两例红；删 copy toast → 静默断言红；`onOpenLogs&&`→`false&&` → 入口断言红（均 /tmp/mut31 还原）。

## 32 — SH-34 英文字面量进 locale + 服务端回落值改 null + countryName locale 显式（2026-09-19）

- 静态守护 `tests/share-english-literals.test.ts`（先红 client 10 处 + worker 4 处，后绿）：client 侧 ban `{'PV'}/{'UV'}/{'CUSTOM'}/'TOP 10'/'Untitled note'/|| 'Bot'/|| 'Unknown'/|| 'Other'/|| 'other'/= 'zh-CN'`；worker 侧只 ban 行级 `'Untitled note'`（聚合桶 'Direct'/'UNKNOWN'/'desktop'/'other' 等是 Map 键，保留机器令牌由客户端本地化——台账「回落值改 null」按此解释执行）；`public.ts` 进白名单（公开阅读页无 i18n 运行时，另行处理）。
- 服务端（`analytics.ts`/`visits.ts`）：topNotes/recentVisits/visits 三处 `'Untitled note'` 回落与 COALESCE 全删，笔记已删的访问行 `noteTitle` 返回 null；契约 `ShareVisitLog.noteTitle` 与 `topNotes[].noteTitle` 改 `string | null`（types/share.ts 注释说明语义）。`tests/share-routes.test.ts` 新 describe：seed→DELETE notes→三端点断言 null（先红后绿）。
- 客户端字面量：PV/UV → `share.unit_pv`/`unit_uv`（表格行 + 看板 TOP 行），`TOP 10` 徽章 → `share.top_notes_badge`，CUSTOM 徽章 → `share.custom_slug_badge`，`Untitled note`/`Bot`/`Unknown` 回落 → 既有 `common.untitled_note`/`share.badge_bot` + 新 `share.env_unknown`。
- `share-helpers.ts`：`countryNameLocalized` locale 改必传（无默认 zh-CN；blog 两处调用点本就显式传 locale，编译面强制），`UNKNOWN`/null 令牌改回 `share.country_unknown`（顺带影响 blog 看板未知国行由回显 'UNKNOWN' 变为本地化标签，属该 helper 既定职责）；`Intl.DisplayNames` 加 `Map<locale, DisplayNames>` 缓存；新增 `localizeReferrerName`（'Direct'→direct_access）与 `localizeEnvName`（缺失/'other'→env_unknown），沿用 `localizeDeviceName` 的桶令牌本地化模式；看板来源/系统两卡与最近活动行、日志表格 LogRow（`useLocale()` 下发）全部改走这四个本地化器。`share-fallback-labels.test.ts` 6 例：locale 显式解析、UNKNOWN 哨兵、DisplayNames 每 locale 只构造一次（子类计数）、Direct/other 令牌、null 字段整表渲染无英文字面量。
- 新增 6 个 locale 键（en/zh `share-2.ts`）。变异 5 发：去缓存读 → 计数例红；visits COALESCE 回填 → D1 visits 断言红；topNotes `|| 'Untitled note'` 回填 → D1 topNotes 断言红（recentVisits 断言不受扰，三条各守一路径）；`{'PV'}` 回填 → 守护红；UNKNOWN 哨兵回显回填 → 单测+渲染双红（均 /tmp/mut32 还原）。

## 33 — SH-35 窄屏四件套：侧栏抽屉 / fullscreen 宽模态 / 批量条换行 / 44px 触控（2026-09-19）

- 侧栏折叠（`share-hub-modal.tsx`/`share-hub-sidebar.tsx`/`use-share-hub-sidebar.tsx`）：`useBreakpoint()==='mobile'` 时 hub 不再内联渲染 `ShareHubSidebar`，Header 出现 `share.open_sidebar` IconButton（PanelLeft 图标），打开左 `Drawer`（宽 260 与桌面侧栏同、`zIndex=Z_INDEX.menuHigh` 压在 hub modal(--z-modal:250) 之上，先例 template-gallery 的 Menu）。抽屉内选中分类/文件夹/标签即关闭：hook 新增可选 `onNavigate`，store 的 `setCategory/setFolderId/setTag` 包成 `selectCategory/selectFolder/selectTag` 一并回调；桌面调用点不传，行为不变。
- 宽模态（`share-hub-modal.tsx`）：mobile 下 `variant='fullscreen'` 且 className 换 `MOBILE_MODAL_CLASS`（去掉 `h-[84vh] min-h-145 max-h-220`）——Modal 面板类是 `cn(..., className)` 后置合并（tailwind-merge），不剥掉固定高度就会盖掉 fullscreen 的 `h-full max-h-none`；桌面保持 1300px dialog。顺手把原先卡在 import 中间的 `MODAL_WIDTH` 归位到常量区。
- 批量条（`share-batch-bar.tsx`）：容器去 `shrink-0 whitespace-nowrap`，加 `flex-wrap justify-center`（max-w-[calc(100%-2rem)] 保留）——5 个动作按钮窄屏下换行而非溢出/裁切。按钮自身 `shrink-0 whitespace-nowrap` 不变，保证单个按钮不被拦腰折。
- 触控尺寸（`share-note-submenu.tsx`）：`ShareMenuButton` 基准高 `h-7.5`(30px) → `h-11 … md:h-7.5`（移动端 44px，桌面不变）。守护拆到 `tests/share-touch-targets.test.ts`（node 工程静态扫描；client 工程无 node:fs 类型，`share-english-literals` 同款 `path.join('src',…)` 约定）。
- 基础设施缺口（`src/client/lib/hooks.ts`）：`useMediaQuery` 未防 `window.matchMedia` 缺失——jsdom 不实现 matchMedia，任何挂载 `useBreakpoint` 消费者的测试直接 throw（share 三处既有测试实测炸出）。补 `typeof window.matchMedia === 'function'` 守卫（与 `motion.ts`/`link-hover.ts`/`tooltip.tsx` 全站既有惯例一致，浏览器行为零变化），缺失时读数与 SSR 回落同为 false。这是修 share 窄屏的必要前提，改动一行守卫、不动任何语义。
- 测试 `share-narrow-screen.test.ts` 6 例（stub matchMedia 控制断点；afterEach 统一 unmount——断言失败不得把 portal 漏给下一个用例，变异跑时曾因此串扰误报）：mobile 无内联侧栏+有触发器、抽屉开→选 starred→store 生效且抽屉关、desktop 内联侧栏无触发器、mobile 面板无 `h-[84vh]` 且 maxWidth 空、desktop 面板 `h-[84vh]`+1300px、批量条 flex-wrap 且容器无 whitespace-nowrap；+ 静态 1 例触控高度。变异 6 发全杀（常渲染侧栏 / 删 onNavigate 调用 / 钉死 dialog variant / 钉死桌面 className / 批量条回填 nowrap / 子菜单回填 h-7.5），各杀各测试不串扰（/tmp/mut33 还原）。
- 决策记录：台账标注「需人工确认是否有移动端设计稿」——本实现按 Modal/Drawer 现成移动形态（bottom-sheet 圆角、抽屉左侧滑入、全屏 dialog）落地，未发明新视觉；后续若有设计稿只需替换常量与断点判定。

## 34 — SH-36 小缺陷集合：口令标准统一 / 编辑弹窗重开 / 子浮层重置 / 表格语义 / 播报（2026-09-20）

- 口令最小长度统一（新 `LIMITS.sharePasscodeMinLength = 8`，`src/shared/constants.ts`）：五处校验改引用常量——client `share-form.ts`（原 <4，注释「服务端同」为虚言）、`use-share-edit-modal.ts` 保存流（原裸 8）、worker `note.ts`（原裸 8，错误文案改常量插值）、demo `share-admin.ts`（原 <4）、MCP `library/shares.ts`（原 <4，15 号遗留的「MCP 侧下限留给 34 号统一」在此收口）。台账写的「客户端 ≥6/服务端 ≥4」是审查时点快照，按实况（4/8 混杂）执行。
- 编辑弹窗自动重开（`use-share-hub-modal.ts`）：`useInitialNoteEdit` 加 `consumedRef`，每次打开 hub 只自动开一次编辑弹窗——此前 effect 依赖 `shares`，保存/手动刷新后引用换新，把用户刚关掉的弹窗重新弹开（app-shell 传 `initialNoteId` 的真实路径可复现）。`open` 回 false 时消费位复位。
- 关 hub 重置子浮层：close 分支补 `setIsLogsOpen(false)/setIsSettingsOpen(false)`（logs/settings 渲染在 hub Modal 之外，不随模态关闭自行卸载）；`share-hub-modal.tsx` 抽屉改 `open && isSidebarOpen` 门控（33 号自引入的同类状态）。
- 静默 catch（`use-share-edit-modal.ts` `loadNoteShare`）：失败补 `console.warn('[share] …', { noteId, error })`——弹窗停留在「新建」表单是既定 best-effort，但日志必须能区分「本无分享」与「加载失败」（catch 带注释说明）。
- 表格语义与播报：table-view 8 个 + visit-logs 7 个 `<th>` 补 `scope='col'`；批量条「已选 N」span 补 `role='status'`（选择数变化对读屏播报）；`VisitTimeCell` 的 `toLocaleTimeString([], …)` 改显式传 `useLocale()`（与同文件 LogRow 的 countryName 同口径，不随运行时默认 locale 漂移）。
- 视图切换（`share-hub-toolbar.tsx`）：`ViewToggle` 两个 IconButton 对（手写 active 态）换 `Segmented size='sm'`（radiogroup + `aria-checked` + 方向键，组件体系收口），新增 `share.view_mode` en/zh 键作组标签。
- 测试：`share-small-defects.test.ts` 7 例（口令 7/8 字符对、重开守护、hub 开关重置、warn、radiogroup、status；`mounts`+afterEach 统一卸载）。坑：重开守护用例首跑不红——`mockResolvedValue` 同一对象引用让 `shares` 依赖根本不触发 effect，必须 `mockImplementation` 每次产新数组，这条写进测试内注释。静态守护 `tests/share-table-semantics.test.ts` 3 例（scope 扫描的 `<th(?=[\s>])` 负向前瞻防 `<thead>` 误报；`toLocaleTimeString([]` 禁令）。
- 变异 9 发全杀（/tmp/mut34 还原）：min 回填 4 / 删 consumed 门 / 删两行 close 重置 / 删 warn / 删 Segmented label / 删 role / 删一个 scope / worker 回填 4——各杀各测试零串扰。`saveEditShareFlow` 的常量引用未单设变异：该函数未导出，其判定与被单测的 `needsNewSharePasscode` 共用同一常量。
- 台账条目核销判定：「loadSession 在 share 子应用重复挂载」不存在于当前代码（`useAppBoot`/session load 全 client 仅 `app.tsx:29` 一个调用方，shareSlug 路径本就跳过——grep 证据），不修即销；口令可见性切换（eye toggle）全站无先例组件，登记暂缓不夹带；其余 hub 的视图切换统一不在本项范围。

## 35 — T（SH-37）通病解冻：*-subtle 引用无定义 → -soft 家族统一 + 三对色 AA 重校准（2026-09-20）

- 现状与根因：`--danger/warning/success/accent-subtle` 全站 49 处 `var()` 引用（share/blog/music/components），tokens.css 从无定义——`bg-[var(--danger-subtle)]` 实际渲染透明，hover 底色与软底徽章背景整体失效。30 号登记待裁决，本次解冻。
- 方案（改名而非加别名）：tokens.css `:root` 软底家族补 `--success-soft/--warning-soft/--danger-soft`（14% color-mix，与 `--accent-soft` 同族同比例；后置于主题块所以两主题各自解析）；49 处引用机械改名 `*-subtle→*-soft`。`-subtle` 词义保留给边框（`--border-subtle`），不留双词汇。
- 连带修复（改名使原本「不可见」的引用真实生效后暴露）：share 侧栏 `bg-[var(--bg-sidebar)]`（亦无定义）→`--bg-sunken`（blog/music 侧栏先例）；visit-logs 表头 `bg-[var(--bg-muted)]`（无定义）→`--bg-card`（share 表头先例）；big-svg-chart `var(--font-family-mono)`（无定义）→`var(--font-mono)`。
- AA 重校准（可访问性红线，soft 底可见后必须）：小字号状态色文字落在自身 14% 软底上原先 light success/warning/danger=2.0/1.7/2.7、dark danger=4.0，全部不达 AA。按 `--accent-soft` 既定规则以离线复算（与 check-contrast.mjs 同一套色数学）取最小改动：light 默认 `:root` 三对色 `--success oklch(70%…→45%)、--warning 76%→48%、--danger 64%→49%`（复算最坏对 4.72-4.77）；dark 主题块 `--danger 68%→73%`（4.52，success/warning 原值已过不动）。blog-frontend tokens.css 镜像同值（共享契约），`check-token-drift.baseline.json` 重生成（89 令牌）。副带效应：light 主题原先不可读的 `text-[var(--success)]`-on-white（约 2:1）与 solid 底白字一并入 AA 区；dark solid danger 上的 `text-white`（primitives 危险按钮）3.14→2.70 仍属既有未达标组合，门禁现状不判（未入册），登记遗留。
- 门禁自动化（能工具强制的不靠人记）：`scripts/check-contrast.mjs` 新增 `SEMANTIC_TINTS` 采集 + `judgeAccentMatrix(…, 'status color')` 复用同一判定，三对色×两主题×全表面自此由 CI 判（本地无干净 :7712 实例——attachments worktree 占用——离线复算先行，实时判定以 CI 为准，此点如实登记）。
- 新守护 `tests/token-definitions.test.ts`（node 工程，3 例）：扫 `src/client` 全部 `var(--x)` 引用，定义=CSS 声明或 TS 引号字面量；断言无任何 `--*-subtle` 别名残留、无白名单外悬空引用。白名单 27 项=他任务欠账登记（kanban 6、preview 8、deck/excalidraw 注入 6、music/slides/attachments 等；`--bento-code-*` 6 项为守护首跑抓出、探针漏报的 slides 模板注入族）。变异两杀：删 `--danger-soft` 定义→19 处悬空报红；一处引用回填 `--danger-subtle`→别名报红（/tmp/mutT 还原）。
- 通病登记（白名单归属，供各任务认领）：`--text-8/--text-20`（preview/kanban 字阶）、`--border-focus`（hub 行/attachments）、`--bg-subtle`（attachments）、`--sp-0/--sp-11/--sp-12`（preview/slides/music 私有间距）、`--surface-*` 四件与 `--danger-softer`（preview 属性编辑器）、`--bg-surface-subtle/--accent-fg/--kanban-tag-`（kanban）、`--code-font-size/--code-line-height`（JS 注入）、`--deck-*` 四件（presentation.css 注入）、`--bento-code-c/k/n/p/s/f`（slides code-palette 模板注入）。
- 坑：①i18n:check 连测试文件里注释/字符串中的中文都拦（首挂 `通病` 二字），白名单理由与 describe 标题一律英文；②comments:check 不收 tokens.css 的 `/* */`（该文件历史上零注释），校准依据写本日志不写 CSS；③zsh 循环里 `npm run ${g}:check` 会把 `$g:c` 当修饰符吃掉，必须写 `"${g}:check"`；④悬空探针只扫 tokens.css 会漏报（第三方 css/JS 注入），首版守护即抓到 6 个探针漏项。
- 验证：tsc -b 绿；11 静态门禁全绿（含 blog 两项）；vitest 定向 249/249（share/blog/music/components/token-drift/新守护）。全量回归 232 文件/1807 测试绿（REGRESSION_EXIT=0），fix 提交 a5a02d38。

## 36 — F1（SH-29）看板「假装有数据」五连修：全 0 图表 / 0% 趋势徽标 / 0-0 环比 / 设备空卡壳（2026-09-20）

- 现状与根因：零流量在四个渲染面上被画成有信号——①`big-svg-chart` 只在 `values.length===0` 时空态，全 0 序列照常画出贴底折线+满格网格；②`dashboard-blocks` KpiCard 徽标 `delta>=0` 走 success+上升箭头，「↗0%」被读成正向趋势；③worker `computeDelta(0,0)` 返回 0，两个看板（share `analytics.ts` / blog `stats.ts` 共用）在无基期数据时下发 0% 而非缺省；④⑤share `DevicesBreakdownCard` 与 blog `DevicesCard` 无空态守卫，devices 与 osList 皆空时只剩两行小标题空壳（同文件其余卡片均有 EmptyRow/NoVisitData，唯独此卡漏掉）。另 KpiCard 迷你 sparkline 全 0 也画平线，同族问题一并修。
- 修法：①图表守卫改 `!values.some((v) => v > 0)`（空数组时 some=false，原空态语义保留）；②delta===0 → 中性 `Minus` 图标 + `--text-tertiary`，涨跌分支与配色不动；③`computeDelta` (0,0) → `undefined`（签名本就是 `number|undefined`，两处响应类型 `viewsDelta?/visitorsDelta?` 已是可选，KpiCard 对 undefined 已有「整体隐藏徽标」路径，无契约变更），0→正 仍报 +100%；④⑤两卡在 devices 与 osList 皆空时渲染各自文件既有的空态行（`share.no_data_yet`/`blog.no_visit_data`，零新增文案键）。demo 后端（share.ts/blog-seed.ts）delta 为硬编码正数，不经 computeDelta，不受影响。
- 测试（红先行）：新 4 文件 `src/client/components/big-svg-chart.test.ts`、`dashboard-blocks.test.ts`（徽标三态+隐藏+sparkline 两态）、`features/share/share-devices-empty.test.ts`、`features/blog/blog-dashboard-view/audience-cards.test.ts`（无流量时三卡齐报空，原只有 2），改 `tests/share-analytics.test.ts` computeDelta 断言 undefined。红确认 6 失败/无收集错误后修复转绿（26/26）。`DevicesBreakdownCard` 提升为导出以供直测（仅测试脚手架，无行为变化）。
- 变异 6 全杀：图表守卫回退 length===0、sparkline 门去掉 some、徽标 flat 分支失效、computeDelta 回填 0、两卡空态条件失效（share 侧 sed 因 JSX 换行未匹配=未变异，单独用 `{false ? (` 注入后杀掉）。/tmp/mutF1 备份逐一还原。
- 坑：①lucide-react 本版本无 `TrendingFlat` 导出（React「Element type is invalid」红测抓出），中性趋势改 `Minus`（测试断言同步 `svg.lucide-minus`）；②`.test.ts` 不能含 JSX（rolldown PARSE_ERROR，且收集错误伪装成 1 failed 假象），一律 `createElement`；③`share-dashboard-view.tsx` 原 496 行贴着 size:check 的 500 上限（measure=wc+1），初版分支把文件顶到 503 触发基线漂移——把三元塞进既有 body div 内（对齐同文件 EmptyRow 先例）压回 498 行，未动基线。
- 验证：tsc -b 绿；11 静态门禁全绿；vitest 定向 26/26（F1 五文件）。全量回归待补（REGRESSION_EXIT 回填后以 docs 提交为准）。fix 提交待回填。
