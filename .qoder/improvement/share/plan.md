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
| F1 | SH-29 | `big-svg-chart` 全 0 空态 / `dashboard-blocks` delta 0% / `computeDelta(0,0)` — blog 看板共用，双侧回归 | P2 | ✅ | 1b502776 |
| F2 | SH-16b | range=all 行为改 `lib/share-analytics.ts` 的 `getRangeStartTimestamp`/`buildShareTimeline`（blog stats.ts 共用） | P2 | ✅ | 9621ab0d |
| F2b | SH-16c | all 整表拉行 SQL 下推（26 号遗留）：`lib/visit-aggregates.ts` 聚合语句 + 行路/SQL 路同一 normalized 中间形态 + 等价测试 | P2 | ✅ | fd22e03b |
| F3 | SH-05b | `maintenance.ts` cron 与 blog 附件/清理共用调度中触碰 blog 语义的部分（排在 F5 之后）：blog_visits 级联 + 孤儿清扫 | P2 | ✅ | 79c25248 |
| F4 | SH-25b | blog `visits.ts` 同构缺陷（与 11、12 号对称）：指纹盐走 HMAC+`VISIT_FP_SECRET`、referrer 上限+scheme 白名单+origin/pathname 剥离 | P1 | ✅ | eff0a6b5 |
| F5 | SH-05c | 日志保留期持久化到服务端 share settings（现只在浏览器 localStorage），cron 按保留期分批清理 share_visits | P2 | ✅ | f812c7a7 |
| H1 | SH-39 | `maxLogRecords`（设置模态「最多记录数」）全仓无消费者，属假设置：接入日志列表取数上限或删除控件+文案+本地键 | P3 | ✅ | 446451be |
| H3 | SH-41 | 安全：`blog_posts` 删除的两条 `DELETE FROM blog_comments WHERE post_id …` 不带 user 限定——按 id 点名他人文章即可删其评论（跨账号写），须与同批 posts 语句同口径加 `user_id` | P1 | ✅ | 6cda419e |
| H4 | SH-42 | `POST /api/blog/posts/batch` 的 `postIds` 无长度上限，`IN (…)` 直接拼占位符——>100 个 id 必 500（share 侧 02 号同款 D1 变量上限），需分块或 schema 上限 | P1 | ✅ | 0e00fa6a |
| H5 | SH-43 | `blog_visits` 无保留期设置（share 已有 `share.visitLogRetentionDays`）：cron 只扫孤儿行，需要 blog settings 段落 + 模态接线，属产品决策 | P2 | ✅ | b1d358ad |
| H6 | SH-44 | 调色板类存量清偿：SH-38 门禁已按文件计数冻结 218 处/62 文件，各模块降到 0 后 `--update-baseline` 收账（attachments 77/7 文件、blog-frontend 48/17、blog 39/11、lib·markdown 24/12、preview 17/4、components 5/4、settings 4/3、folders 2、tags 2） | P3 | 排队 | |
| H7 | SH-45 | blog 侧同族假设置：`blog-store` 的 `maxLogRecords`/`setRetentionSettings` 与设置模态的「最多记录数」分段控件同样全仓无消费者（SH-39 在 share 侧删除的那一套，blog 侧是第二处），且 `blog-settings-modal.tsx:190-191` 跨模块读 `share.max_records_label`/`share.max_records_val` 两个键——故 share 侧本次保留键不删。修法：blog 侧删控件+删 store 字段，文案键随最后一处使用者一并迁到 blog 命名空间或删除 | P3 | ✅ | 28b175b6 |
| H2 | SH-40 | `RetentionField` 可见标签未关联 `Segmented` 的 `role=radiogroup`（两个控件均无可访问名称），`Segmented` 已具 `label`/`aria-labelledby`；执行时按同一口径扩到 share 全部 6 处 `Segmented` 并加静态门禁 | P2 | ✅ | 1a3e4dae |
| H8 | SH-46 | share 外的 `Segmented` 仍缺可访问名称（实测 5 处：`blog-dashboard-view/index.tsx:135,272`、`blog-settings-modal.tsx:31,228`、`settings/backup-settings/target-form.tsx:45`）：与 SH-40 同一缺陷族，按铁律14 不在本批夹带；各模块自行接入后把 `tests/share-radiogroup-names.test.ts` 的扫描根从 `features/share` 提到全站 | P2 | 排队 | |
| H9 | SH-47 | `/api/blog/visits` 的 DELETE 缺 share 侧那两道护栏（SH-14/SH-12 双生）：`older_than` 无 `days >= 1` 服务端校验（客户端已在 SH-43 拦住 0，信任边界仍裸），`type=all` 清空全站日志不要求当前密码重认证 | P1 | 排队 | |
| G | SH-38 | `check-hardcoded` 扩展调色板类全站禁令（30 号以 share 测试代守，先量全站违规面再定采纳范围） | P3 | ✅ | be162df2 |

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
- 验证：tsc -b 绿；11 静态门禁全绿；vitest 定向 26/26（F1 五文件）。全量回归 236 文件/1816 测试绿（REGRESSION_EXIT=0，串行无并行）。fix 提交 1b502776。

## 37 — F4（SH-25b）blog visits.ts 同构缺陷：指纹盐与 referrer 与 share 侧对称修复（2026-09-20）

- 现状与根因：blog `recordBlogVisit` 记录面与 share（11、12 号已修）漂移三处——①`computeVisitorFingerprint(rawIp, ua)` 把 UA 键进去：浏览器轮换 UA 即铸造新访客（去重失效、PV/UV 虚高），且与 share「去重键不含 UA」的注释化规则相悖；②不传 `VISIT_FP_SECRET` → 走公开日期盐回落路径（`inkstone-default-salt:UTC日期` 可被任何知道算法的人按天预计算碰撞），且盐未按 owner 域分离；③`referrer: rawReferrer` 把任意 `referer` 头原文入库：无 scheme 白名单（`javascript:` 等垃圾进分析列）、无长度上限（远超 512 的任意大小载荷）、query/fragment（可能含 token）原样持久化，违反数据最小化。
- 修法：lib/share-analytics.ts 新增导出 `sanitizeVisitReferrer(raw, dropSelfPath?)`（scheme 白名单 http/https/android-app/ios-app、http(s) 只存 origin+pathname、截断 `LIMITS.shareReferrerMaxLength`=512、解析失败→双 null），share `deriveShareReferrer` 的本地实现（`REFERRER_PROTOCOLS`+`storedReferrerValue` 约 15 行）改为复用该函数——同一逻辑第二次出现即抽取，DRY；share 行为不变（`/s/${slug}` 自路径排除经 `dropSelfPath` 参数保留）。blog visits.ts：fp 走 `VISIT_FP_SECRET ? \`${secret}:${row.user_id}\` : null`（缺 secret 记 null 指纹、宁缺毋滥，与 share 同裁定），UA 从去重键剔除（传 `''`），referrer 走 `sanitizeVisitReferrer`。`is_self_referrer` blog 侧仍为 0——不在本行范围，属 blog 独立缺陷。
- 测试（红先行）：blog-routes 5 例——去重测试反转为「同 IP 换 UA 仍去重、换 IP 才算新访客」（旧断言把「UA 轮换=新访客」这一缺陷当预期，属故意翻转并在此登记）、无 secret 时 `visitor_fp` 落 null 而非公开日期盐、referrer 三例（javascript: 丢弃、只存 origin+path 剥 query/fragment、512 截断）；新增 `requestWithIp` helper 经 `cf` 对象注入真实 IP（`requestClientIp` 无 cf 时返回 'local'）。share-routes 补 1 例钉住抽取后仍无人守的「referrer 指回本分享路径即丢弃」（否则 M4 变异存活=重构静默丢行为）。红 5 确认后修复转绿，blog 87/87 + share 67/67。
- 变异 5 全杀：fp 键回加 UA、referrer 回填原文、去掉 scheme 白名单、去掉自路径丢弃、去掉缺 secret→null 门。/tmp/mutF4 备份逐一还原。
- 部署注意：生产未 `wrangler secret put VISIT_FP_SECRET` 时，blog 与 share 同样记 null 指纹（UV 计数为 0、去重不生效）——这是 12 号已裁决的取向，非本次新增风险；上线前须确认 secret 已配。
- 验证：tsc -b 绿；11 静态门禁全绿；vitest 定向 105/105（blog-routes+share-routes+share-analytics）。全量回归 236 文件/1821 测试绿（REGRESSION_EXIT=0）。fix 提交 eff0a6b5。

## 38 — F2（SH-16b）range=all 窗口与分桶行为收口：lib 单源 + blog 侧对称修复（2026-09-20）

- 现状与根因：share 侧 04 号已把 `all` 窗口修好，但修法留在路由里（`analyticsContext` 建可变 ctx + `applyAllRangeWindow` 事后改写），blog `routes/blog/stats.ts` 三处未跟——①`analyticsContext` 把原始 `range` 直接 cast 成 `ShareTimelineRange`，无白名单：`?range=zzz` 经 `getRangeStartTimestamp` 返回 0，等于任意客户端可请求全表；②无 `all` 窗口收口：`startTs=0` + `duration` 兜 30 天，于是 `buildShareTimeline` 的 12 个桶全落在 1970 年（时间轴恒空、标签 `1970-01`），而 totalViews 又按无上限的 `visited_at >= 0` 统计，两数对不上；③`viewsPerDay` 按 30 天摊，实际窗口是全部历史。
- 修法（单源，两路由共用）：lib/share-analytics.ts 新增 `shareRangeFromQuery`（白名单，未知→30d）、`parseAnalyticsRequest`（range+filters+clause+now，share/blog 两处逐行相同的查询解析自此一份）、`analyticsWindow(range, now, minVisitedAt?)`（非 all 照旧；all 以最早访问起算、无访问回落 30 天、窗口下限 1 天）、`timelineBucketCount`/`buildBucketedTimeline`（按下标零填充，缺失下标即 0 桶）/`bucketsFromVisitRows`（`Math.floor((visited_at-startTs)/bucketDuration)`，越界丢弃），`buildShareTimeline` 改为这两者的复合（行为不变，桶边界归属由「区间比较」改「下标取整」，两者在整数毫秒与均匀桶宽下等价）。share 路由删 `shareRangeFrom`/`applyAllRangeWindow`，`analyticsContext` 改 async：先按需查 `MIN(visited_at)`，再一次性构造不可变 ctx（不再有「建完再改」的中间态）。blog 路由同构接入：白名单 + `all` 窗口 + 复合时间轴。
- 测试（红先行）：blog-routes 新 3 例——未知区间被清洗成 30d 且不再回全表、`range=all` 从最早访问起算且桶内 views 求和==行数、无访问时窗口留在近期（`timeline[0].timestamp > 0`）；红 3 确认（`expected 'zzz' to be '30d'`、`expected +0 to be 1720724527116`、`expected 0 to be greater than 0`）后转绿。share-analytics 新 describe 4 例覆盖 `shareRangeFromQuery` 三态、`parseAnalyticsRequest` 过滤组合、`analyticsWindow` 四组取值、`buildBucketedTimeline`+`bucketsFromVisitRows` 与 `buildShareTimeline` 全等（含越界行不计、null 指纹不计数、空 buckets 零填充）。既有 share `all` 用例（`timeline[0].timestamp===oldTs`、求和==3、空态 12 桶）不动并继续为绿，证明分桶重构行为保持。
- 变异 8 发全杀（/tmp/mutF2a 备份还原）：未知区间→all、无访问回落改 epoch、去掉下标越界门、null 指纹计入 UV、`all` 桶数 12→24、两路由的 `min_ts` 传 null、查询解析回填裸 cast。
- 坑：①blog 测试夹具的 `H.now=2_000_000_000_000`（2033）与路由真实 `Date.now()` 不同源，新用例的 `visited_at` 必须用真实时钟种，否则「未来行」永远落在所有窗口之外（share 侧用例本就这么写）；②`buildShareTimeline` 语义改动会同时影响 share/blog 两看板，故等价性靠既有路由用例 + 新单元全等断言双重守住，不做「只测新函数」。
- 遗留拆行：`all` 仍整表拉行（下推 SQL 聚合），按批准范围另起 F2b（SH-16c）。
- 验证：tsc -b 绿；11 静态门禁全绿；vitest 定向 108/108（blog-routes+share-routes）+21/21（share-analytics）。全量回归 236 文件/1828 测试绿（REGRESSION_EXIT=0）。fix 提交 9621ab0d。

## 39 — F2b（SH-16c）range=all 整表拉行下推 SQL 聚合：行路与 SQL 路同一中间形态（2026-09-20）

- 现状与根因：38 号收口了窗口与分桶口径，但 `all` 的**取数**仍是整表拉行——`SELECT visited_at, visitor_fp, … FROM share_visits WHERE visited_at >= ?` 把 owner 全部历史行读进 Worker 再在 JS 里分组；blog 侧同一个形状（六个 await 串行 + 全表行）。分享历史可无限增长，这条查询的行数、字节数与内存都随历史线性上涨，且 24h/7d/30d 有窗口上限、唯独 `all` 没有，等于「越常用的看板越慢」。
- 修法（新增 `lib/visit-aggregates.ts` 一份，两表共用）：以 `source = { table, targetColumn, osFallback }` 参数化 `share_visits`/`blog_visits`，`visitAggregateStatements(db, source, scope, query)` 一次决定取数形态——非 `all` 返回 1 条行查询（`… , note_id AS target_id, slug`，聚合已不依赖顺序，故去掉 `ORDER BY`），`all` 返回 8 条聚合语句（totals / 按桶 `GROUP BY` / 五个维度 `GROUP BY` / 按 target `GROUP BY`），全部同一条 `WHERE`（targetId+userId+startTs+过滤 clause）由 `visitWhere` 单源生成，桶宽 `duration / timelineBucketCount(range)` 作参数下发。`visitAggregateFromResults` 把两条路折成同一个 normalized `VisitAggregate { views, visitors, buckets, countries, referrers, devices, osList, browsers, targets }`：行路走 `aggregateFromRows`，SQL 路按下标零填充桶、`COUNT(DISTINCT NULLIF(visitor_fp,''))` 对齐「空指纹不算 UV」、`COALESCE(NULLIF(UPPER(country),''),'UNKNOWN')` 对齐 JS 的 `(country||'Unknown').toUpperCase()`（客户端按 `UNKNOWN` 匹配国家名，见 share-helpers.ts:19）、`MAX(slug)` 对齐行路取字典序最大。路由侧自此不含 range 分支。
- 路由收口：share `analytics.ts` 删 `rangeVisitsStatement`/`VisitRow`/`currentVisitStats`/`aggregateVisitMaps`（434→356 行），全局与单笔记两个看板各自把 visit 语句接在 batch 尾部（全局 `[summary, prev, filterStats, recent, ...visit]`、单笔记 `[recent, ...visit]`），时间轴改喂 `buildBucketedTimeline(aggregate.buckets, …)`；`loadTopNotes` 改吃 `Map<string, VisitTargetStat>` 并补「同 views 按 noteId 升序」的确定性 tiebreaker（GROUP BY 无序，否则并列的第 10 名两路可不同）。blog `stats.ts` 删 `BlogVisitRow`/`loadBlogRangeVisits`/`aggregatePostVisits`/`aggregateBlogDistributions`（491→427 行），`breakdownStats(aggregate, postStoredViews)` 保留「零访问但有历史 views 时按存量 views 估算分布」的原语义，`loadBlogTopPosts` 改吃 targets；`loadBlogAnalyticsPayload` 拆出 `blogPostCounts`+`BlogPostsSummaryRow` 以守住 50 行函数上限（size:check 的 longFns）。
- 测试（红先行）：三条守卫先红——share 全局 `range=all`、share 单笔记 `range=all`、blog `range=all`，各断言响应数值（totalViews/totalVisitors/桶求和/topNotes[0].views）之外，还断言 `captureSql` 里出现了 `GROUP BY` 且**没有**任何以 `SELECT visited_at, visitor_fp` 开头的语句（红态：`expected [ Array(1) ] to deeply equal []`）；为此 `tests/d1-harness.ts` 新增 `captureSql(db)` 记录每条 prepare 的 SQL（含 batch 内语句，空白归一）。新增 `tests/visit-aggregates.test.ts`（注册进 node 工程）以 8 种边界行（null 与空串指纹、大小写国家、空 referrer、缺 device/os/browser、同 target 两个 slug、窗口外两侧、机器人、他人数据）做**两路全等**断言 + 逐维度显式取值（防「两路同错」），并含空结果集全零填充用例；per-note scope 亦做全等（覆盖 `?1` targetId 参数序）。
- 变异 12 发全杀（/tmp/mutF2b 备份还原）：all 强行走行路、桶语句去掉上界、`COUNT(DISTINCT visitor_fp)` 不做 NULLIF、国家回退值不升格（真错，实测发现并已修）、target slug 改 MIN、device 回退值改名、os 语句漏绑一个参数、桶下标 +1 位移、countries/referrers 结果顺序错位、单笔记 scope 丢 targetId、blog 估算分布条件取反（首轮存活→补第 5 条 blog 用例后杀）、行路 where 丢过滤 clause。
- 坑：①两条路的 `Map` 插入序天然不同，`toEqual` 对 Map 不比序，故全等断言可靠，但显式取值断言仍要逐维度写（否则「两路同错」测不出，国家回退值即由此暴露）；②`views` 上界只由 totals 约束、桶另加上界，「未来行」进总数不进时间轴是**既有行为**（行路 `rows.length` 同构），等价测试把它显式钉住而不是顺手改；③新测试文件必须同时进 `vitest.config.ts` 的 node include 与 jsdom exclude，否则 `node:sqlite` 走 jsdom 工程。
- 验证：tsc -b 绿；11 静态门禁全绿（size:check 先报 blog/stats.ts longFns=1，按拆分而非改基线处理）；vitest 定向 121/121（visit-aggregates+share-routes+blog-routes+share-analytics）。全量回归 237 文件/1837 测试绿（REGRESSION_EXIT=0）。fix 提交 fd22e03b。

## 40 — F5（SH-05c）访问日志保留期持久化到服务端 settings + cron 按保留期分批清理（2026-09-20）

- 现状与根因：13 号留下「按服务端持久化保留期清理」这一半——设置模态里的「保留天数」只写 `localStorage['inkstone_share_retention']`，服务端从未收到该值，`maintenance.ts` 想清也无据可依；后果是保留期只对「这台浏览器看得见看板」生效，换设备/隐身窗口/从未打开过应用的账号，其 `share_visits` 无限增长（13 号的 orphan 清扫只管已删分享的行）。同一个 localStorage 键里的 `maxLogRecords` 顺带暴露：全仓无消费者（看板/日志列表的取数上限是各自写死的 SQL LIMIT），即 UI 里那个「最多记录数」是假设置。
- 修法（数据面）：`UserSettings` 新增 `share: ShareSettings { visitLogRetentionDays: number }`（`src/shared/types/settings.ts`），默认 30 天、上限 3650 天（`SHARE_VISIT_RETENTION_DEFAULT_DAYS`/`_MAX_DAYS`），0=永久保留；`mergeShare` 走 `integerInRange(0, MAX)`（字符串/负数/NaN/越界一律回退到已存值或截断，NaN 与 `'30'` 不会污染文档），`SETTINGS_SECTIONS` 加 `'share'`，`cloneDefaultSettings` 补 `share` 浅拷。新注册账号经 `settingsFor(locale)` 展开默认值即带 `share`，读路径 `parse(user.settingsRaw)`→`mergeSettings` 会补齐历史行的缺失 section，故 client `settings.share` 恒为对象（`session.ts` 全部写路径经 `mergeSettings`/`mergeSettingsPatch`）。
- 修法（cron）：`purgeExpiredOperationalData` 的既有 `db.batch` 尾部加一条分批 DELETE——保留期从 `users.settings` 里用 JSON1 直接取（`COALESCE(CASE WHEN json_valid(u.settings) THEN CAST(json_extract(u.settings,'$.share.visitLogRetentionDays') AS INTEGER) END, 30)`）：`json_valid` 守卫损坏文档（否则 `json_extract` 抛错会带走整个 sweep，连带备份/附件清理）；`LEFT JOIN users` 让已删账号的行仍拿默认保留期（不是永存）；`> 0` 让「永久保留」与解析不出来的取值（`CAST('last week' AS INTEGER)`=0）同向走「保留」——危险方向被关掉； cutoff 按各行自己的保留期逐行算（`visited_at < now - retention*DAY_MS`），`ORDER BY visited_at, id LIMIT ?3` 与 13 号 orphan 清扫同款有界语义（每 tick ≤capped 行，最旧先出，多个 tick 抽干）。返回计数新增 `shareVisitLogs`。索引 `idx_share_visits_user_time(user_id, visited_at DESC)` 已覆盖，无需迁移。
- 修法（client）：模态的「保留天数」改读 `useSession(s => s.settings.share.visitLogRetentionDays)`（账号值优先于浏览器缓存），保存走 `updateSettings({ share: { visitLogRetentionDays: days } })`（既有 420ms 防抖 + 服务端 CAS 合并）；`saveSettingsFlow` 新增 `setVisitLogRetentionDays` 注入点，`cleanVisitsFlow`（立即清理）不变。share-store 的 `logRetentionDays` 字段整个删除（唯一残留使用者即该模态），`state.ts` 的 `loadInitialRetention()` → `loadInitialMaxLogRecords()`，持久化只剩 `maxLogRecords` 一个键——保留期不再进浏览器存储，避免「两处真相」。
- 跨模块必要改动（500 行门禁逼迫，非顺手重构）：新增 `share` 段 + 其类型/校验使 `src/shared/constants.ts` 越限（552 行）。按职责把「settings 模型」整体移出为 `src/shared/user-settings.ts`（402 行：DEFAULT_SETTINGS、SETTINGS_SECTIONS、mergeSettings/mergeSettingsPatch/assertUnchangedSettingsSections、8 个 merge*、校验器），constants.ts 缩至 117 行只留真正的全局常量；12 个 importer 逐一改路径（worker app/auth/settings/scheduler/session-info/mcp ops/music webdav、client store/session、pinned-window-size、note-settings、demo state+backend routes），无 re-export 垫片（铁律5）。`check-escape-hatches.mjs` 的 `ALLOWED_DOUBLE_CASTS` 条目随之从 constants.ts 改键到 user-settings.ts（同一条理由，未新增逃逸）。
- 测试（红先行）：`tests/share-visit-retention.test.ts`（node 工程，注册进 vitest 双列表）8 例——按保留期删旧行且计数为 1、0 永久保留全留、无 share 段→默认 30、两账号各按自己的保留期、超上限时分批且最旧先出、已删账号的行照默认保留期清扫、损坏 JSON 文档→默认（不抛）、取值解析不出→保留。`src/shared/user-settings.test.ts` 16 例：原 constants.test.ts 的 merge/ sanitize/ assert/ round-trip 四组整体迁入，并补 `next.share` 引用稳定、不完整文档补 `share`、`share: { visitLogRetentionDays: 90 }` 全等回读 + 新增 SH-05c describe 6 例（默认值、0 不被兜成 30、100000→3650、-3→0、90.6→91、`'30'`→回退已存 90、JSON 往返 180）。`share-settings-retention.test.ts` 4 例（红：模态显示浏览器缓存值/保存写 localStorage）——显示账号值 90d/180d 而非缓存、保存发 `{ share: { visitLogRetentionDays: 7 } }`、保存后 `inkstone_share_retention` 仍为 null。`share-store/retention.test.ts` 3 例——读出缓存的记录数上限、`logRetentionDays` 不复存在、写盘只写 `{ maxLogRecords }`。
- 拆分（size:check 拦长函数）：新增 `share` 段后 `purgeExpiredOperationalData` 到 55 行，越过 50 行上限（且它给 maintenance.ts 记了 `baseline null -> longFns:1` 的漂移，按规则不得靠基线放行）。按职责拆成 `tokenSweeps`（自带过期列的四张表）与 `visitLogSweeps`（`share_visits` 两条：orphan 与按保留期），主函数只负责封顶参数、按序解构 batch 结果与映射计数；语句文本逐字未改，拆分后重跑 13 发变异仍全杀（M4/M5/M6/M7/M8 的锚点在新函数里唯一命中）。
- 变异 13 发全杀（/tmp/mutF5 备份还原）：`> 0` 改 `>= 0`、默认值改 0、去掉 `json_valid`、`LEFT JOIN` 改 `INNER JOIN`、cutoff 不看保留期、`ORDER BY` 改最新先出、cutoff 的 `-` 改 `+`、bind 参数序交换、`'share'` 移出 `SETTINGS_SECTIONS`、`Math.min(1_000, …)` 的 1 改 0、模态保存 `maxLogRecords`、模态写死 30、store 重新持久化 `logRetentionDays`。其中 M4/M13 首轮存活 → 补「已删账号行仍清扫」与 store 那 3 例后转杀。
- 遗留登记：SH-39（`maxLogRecords` 为无消费者的假设置——要么接进日志列表取数上限，要么删控件与文案）、SH-40（`RetentionField` 的可见标签未与 `Segmented` 的 `role=radiogroup` 关联，`Segmented` 已支持 `label`/`aria-labelledby`，两处控件同时缺名）。均按铁律14 不在本提交夹带。
- 验证：tsc -b 绿；11 静态门禁全绿（escape:check 先报 user-settings.ts 双 cast，按改键既有豁免条目处理）；vitest 定向 32/32（share-visit-retention + user-settings + constants + 两个 client 保留期用例）。全量回归 241 文件/1857 测试绿（REGRESSION_EXIT=0，串行 372s）。fix 提交 f812c7a7。

## 41 — F3（SH-05b）blog 访问日志生命周期：删除文章级联 + 共用 cron 扫孤儿（2026-09-20）

- 现状与根因：13 号在 share 侧做的「级联 + cron 兜底」在 blog 侧完全没做——`DELETE /api/blog/posts/:id` 与 `POST /api/blog/posts/batch {action:'delete'}` 只删 `blog_posts`+`blog_comments`，`blog_visits` 永久留存；共用调度的 `purgeExpiredOperationalData` 也不碰 `blog_visits`（`maintenance.ts` 与 `runAttachmentCleanup` 同批被 blog 侧依赖，属当时冻结面）。后果与 share 侧同构：博客看板 `range=all` 的 `COUNT(*)`（`stats.ts` 按 user 统计，不 join posts）把已删文章的访问继续计入 totalViews，`loadBlogRecentVisits` 的 `LEFT JOIN blog_posts` 落空后以 `COALESCE(p.title, bv.slug)` 顶替，日志列表出现「只有 slug」的幽灵行。
- 修法（级联）：posts.ts 单篇删除从两条独立 `run()` 改为一次 `db.batch`（posts/comments/visits 三条，不再可能出现「文章在、日志没了」或反向的半删），新增 `DELETE FROM blog_visits WHERE post_id = ?1 AND user_id = ?2`；批量删除的 `blogBatchStatements('delete')` 同样补一条按 `user_id + post_id IN (…)` 限定的语句。两条新语句都带 owner 限定（`blog_visits.user_id` 本就存在），不复制评论删除那段的跨账号缺口（见 H3/SH-41）。
- 修法（cron）：`visitLogSweeps` 尾部加第三条——`blog_visits` 中 `NOT EXISTS (SELECT 1 FROM blog_posts bp WHERE bp.id = bv.post_id)` 的行按 `visited_at, id` 升序、`LIMIT ?1`（与 share 孤儿清扫同界），结果计数 `orphanBlogVisits`。索引 `idx_blog_visits_post_time(post_id, visited_at DESC)` 已在，无需迁移。**不做** blog 侧保留期：那需要新的 settings 段落 + 设置界面（产品决策），记 H5/SH-43。
- 看板计数不另加 `EXISTS` 过滤：share 侧需要它是因为 revoke 与笔记存活可以解耦，而 blog 侧文章一旦删除其日志即刻级联消失、历史脏行由同一 cron 兜底——两条路径合起来已保证聚合面不再有幽灵行，多一处 join 只增加每次看板的扫描成本。
- 测试（红先行）：`tests/blog-routes.test.ts` 新两个 describe 共 4 例——单篇删除带走该文 2 行且不动他文、批量删除带走被删两文而留下的那篇保有 1 行（红态 `expected { 'p-doomed': 2, 'p-kept': 1 } to deeply equal { 'p-kept': 1 }`）；隔离 2 例点名 `p-foreign`（他人文章+其 visit 行必须原样存活，钉住 owner 限定）。`tests/blog-visit-cleanup.test.ts`（新文件，注册进 vitest 双列表）2 例——cron 删孤儿留存活文并回计数 1、`limit=2` 两次 tick 由旧到新抽干（红态 `expected [ 'alive', 'ghost' ] to deeply equal [ 'alive' ]`）。
- 变异 9 发全杀（/tmp/mutF3 备份还原）：单篇/批量各去掉 visits 语句、两路各去掉 `user_id` 限定、cron 去掉 `NOT EXISTS`、join 列改错、去掉 `LIMIT`、`ORDER BY` 改最新优先、去掉 `bind(capped)`。
- 验证：tsc -b 绿；11 静态门禁全绿；vitest 定向 109/109（blog-routes 30 + blog-visit-cleanup 2 + share-visit-retention 8 + share-routes 69）。全量回归 242 文件/1863 测试绿（REGRESSION_EXIT=0，串行 466s，同机另有 slides 与 attachments 会话争 CPU）。fix 提交 79c25248。

## 42 — SH-41（H3）博客评论删除的跨账号写：owner 限定 + 子表先删（2026-09-20）

- 现状与根因：`blog_comments` 表**没有 owner 列**（只挂 `post_id`），而两条删除路径都按「拿到的 id」直接删评论——`DELETE /api/blog/posts/:id` 与 `POST /api/blog/posts/batch {action:'delete'}` 的 `DELETE FROM blog_comments WHERE post_id …` 均不带用户限定。`blog_posts` 那条本有 `AND user_id = ?`，于是形成缺口：点名他人的 postId，自己的文章没删掉，**他人的评论却被删干净**（跨账号写；share 侧 13/19 号的级联一开始就带 owner 守卫，blog 这段是本仓同族写法里唯一漏的）。F3（41 号）新加的 `blog_visits` 级联刻意带了 `user_id`，未复制该缺陷。
- 修法：`blog_comments` 加不了 user_id（不改既有迁移，已应用迁移只增不改），改为**经 owner 的 post 反查**并**把子表删除排在 posts 之前**：
  - 单篇：`db.batch` 顺序改 [comments, visits, posts]，comments 走 `WHERE post_id = ?1 AND EXISTS (SELECT 1 FROM blog_posts bp WHERE bp.id = ?1 AND bp.user_id = ?2)`（先删才查得到归属，D1 batch 按序执行，同 19 号「session 清理必须排在删 shares 之前」的教训）。
  - 批量：`blogBatchStatements('delete')` 返回顺序改 [comments, visits, posts]，comments 走 `post_id IN (SELECT id FROM blog_posts WHERE user_id = ? AND id IN (…))`。
  - 响应契约不动（非本人/不存在仍 200 `{ok:true}`，与改前一致；是否统一改 404 与 patch/sync 两路对齐属 blog 侧契约决策，本项不夹带）。
- 测试（红先行）：`tests/blog-routes.test.ts` 新 describe 4 例（`seedTwoOwners` 种「本人一篇 + 他人一篇 + 各带一条已审评论」，他人文章经 `UPDATE blog_posts SET user_id` 改主）——单篇点名他人文章：他人评论必须存活（红态 `expected { kept: +0, gone: 1 } to deeply equal { kept: 1, gone: 1 }`，即真删掉了）；批量点名他人文章：同上；删自己的文章仍能带走自己那条评论（单篇与批量各一例，防「为了安全把级联删空」）。红 2 确认后转绿，blog-routes 34/34。
- 变异 4 发全杀（/tmp/mutF3 备份还原，脚本 /tmp/mutf41.py）：单篇 comments 退回不带 owner、批量同退、单篇把 posts 删除排到最前（子表反查落空、评论删不掉）、批量同排错。后两发专杀「先删父表再靠父表判归属」这一顺序陷阱。
- 验证：tsc -b 绿；11 静态门禁全绿；vitest 定向 44/44（blog-routes 34 + blog-visit-cleanup 2 + share-visit-retention 8）。全量回归 242 文件/1867 测试绿（REGRESSION_EXIT=0，串行 502s）。fix 提交 6cda419e。

## 43 — SH-42（H4）博客批量删除的 D1 变量上限：按 50 个 id 分块执行（2026-09-20）

- 现状与根因：`blogBatchSchema.postIds` 只校验「字符串数组」而无长度上限，`blogBatchStatements` 又把每个 id 展开成一个 `?` 占位符（`postIds.map(() => '?').join(',')`），一条语句的绑定变量数 = id 数 + 该动作自带的参数（`user_id`、`categoryId`、`folderId`、`now`…）。D1 单语句绑定上限是 100 个变量（`tests/d1-harness.ts` 的 `D1_BOUND_PARAMETER_LIMIT` 正是模拟它），所以选中 100 篇以上文章点「删除/发布/置顶/移入分类」必然 500——share 侧 02 号（图谱 e668f20c 同款）已踩过一次，blog 侧是同一个坑的第二处。`{action:'delete'}` 在 F3/SH-41 之后一次组内有 3 条语句，其中 comments 那条走 `IN (SELECT id FROM blog_posts WHERE user_id = ? AND IN (…))`，实测 121 绑定、posts 那条 122 绑定。
- 修法：路由侧按 `BLOG_POST_ID_CHUNK = 50` 分块（`chunkPostIds`），每块独立生成并执行自己的语句组，`count` 仍回全量 id 数。取 50 与 `share/batch.ts` 的 `SHARE_NOTE_ID_CHUNK` 同界：分块后最宽的一条语句是 `setPinned`（取值 + `now` + `user_id` + 50 个 id = 54 绑定），距离 100 还有一屏余量，不必为每个动作各自换算。**不给 schema 加 max**——「全选 120 篇删除」是合法用户意图，把上限换成 400 只是把 500 变成另一种失败。
- 不做的事：不把 chunker 抽成跨模块共用工具（铁律3 跨模块只经公开入口，`deep-imports:check` 会拒；仓库惯例是各模块自带本地 chunker，两处 10 行不满足第三次出现的抽取条件）。
- 测试（红先行）：`tests/blog-routes.test.ts` 新 describe 2 例，`seedManyPosts` 种 120 篇（各带 1 行 visit）——120 个 id 的 `delete` 必须 200 且 `blog_posts`/`blog_visits` 归零；120 个 id 的 `publish` 必须 200 且 120 篇 `is_published=1`（钉住分块对所有动作生效，不只 delete 那条恰好加了子查询的路径）。红态实测 `D1_ERROR: too many SQL variables — 121 bound` / `— 122 bound`，响应 500。
- 变异 4 发全杀（/tmp/mutF3 备份还原）：块宽改 200（回到超上限）、去掉分块整个数组一把梭、只执行第一组（其余静默不删）、某组切掉第一个 id（部分删除）。
- 验证：tsc -b 绿；11 静态门禁全绿；vitest 定向 38/38（blog-routes 36 + blog-visit-cleanup 2）。全量回归 242 文件/1869 测试绿（REGRESSION_EXIT=0，串行 460s）。fix 提交 0e00fa6a。

## 44 — SH-38（G）调色板类全站门禁：AST 扫描 + 按文件计数基线 + share 零预算（2026-09-20）

- 现状与根因：调色板类（`text-amber-500`、`bg-white`）直接画 Tailwind 的一个固定色相，绕开 `src/client/styles/tokens.css`，暗色主题下不随 `--accent-contrast` 等层级反转。`check-hardcoded` 的 AST 扫描原本只有两族——hex 字面量与 JSX 任意值/魔法数，调色板族是盲区（30 号当时判定「门禁扩展另批」，先用 `tests/share-palette-tokens.test.ts` 在 share 目录代守）。G 的采纳范围必须先量违规面再定，故本项先量测后设计。
- 量测（走真实 AST 的字符串字面量，不是行匹配）：**218 处 / 62 文件 / 55 个不同类**。两类构成——white/black 114 处（`text-white` 73、`bg-black` 21、`bg-white` 17、`border-white` 2、`border-black` 1），具名色相 104 处（amber 系 38 最重，再 emerald/rose/blue/purple/zinc/…）。按模块：attachments 77/7 文件、blog-frontend 48/17、blog 39/11、`lib/markdown`（slides 13 + kanban 9 等）24/12、preview 17/4、components 5/4、settings 4/3、folders 2、tags 2。另有 6 处在 `.astro` 模板文本里，落在本门禁 `.ts/.tsx/.js` 的既有扫描边界之外（不为它另接一套解析器）。
- 采纳范围（决策）：**全站扫描 + 按文件计数基线**，照 `check-size.mjs` 的 grandfathered 语义（`scripts/check-hardcoded.palette-baseline.json`，`--update-baseline` 重生成）。**不做「立刻全站禁止」**：218 处分布在 attachments、blog、preview、slides、kanban、blog-frontend 六个各有在途台账的模块，一刀切既是夹带别模块的改动（铁律14），也要先把「分类色」与「媒体遮罩上的白」发明成令牌（设计裁决）。基线的两条性质钉死方向：任一文件计数只能降不能升；降了同样报 stale，必须显式 `--update-baseline` 收账，所以基线始终描述当前树而不是历史某天。
- share 零预算：share 在 30 号已清零，因此**不进基线**——`PALETTE_ZERO_TOLERANCE_PREFIXES` 使 `src/client/features/share/` 的命中直接硬失败，且重生成基线时把这些键过滤掉，否则一次 `--update-baseline` 就会把 share 的新债合法化。据此删除 `tests/share-palette-tokens.test.ts`，其两条断言（share 源集非空、share 零调色板类）迁入 `tests/check-hardcoded.test.ts`，改由门禁同一把扫描把守：覆盖面比原行匹配更准（注释里的类名不算数，常量表里的类名要算数）。
- 与 Part 3/4 的口径差（写在扫描里）：调色板族**不给具名常量表豁免**——把 `text-amber-500` 提出去只是给色相起了名字，并没有接进主题（与 Part 4 的令牌族规则同理）；且扫描所有字符串/模板字面量而不只看 `className`/`cn()`，因为 `attachment-helpers.ts` 这类 helper 直接 `return { bg: 'bg-blue-500/10 …' }`，只看 JSX 属性会漏掉最大的一处存量。
- 测试（红先行）：`tests/check-hardcoded.test.ts` 从 36 例扩到 52 例——Part 5 规则 8 例（内联色相、固定白底、常量表内的色相、非 JSX helper 返回值、token 引用放行、`bg-transparent`/`border-transparent` 放行、注释里的类名不算），基线漂移 6 例（等于预算放行、基线外新文件、超预算、缩小、归零、零容忍模块即便等于基线也失败），share 树 2 例（源集非空 + 零调色板）。红态实测 9 例失败（`paletteDriftProblems is not a function` 与 palette 断言取到空数组）。
- 场景三发（真门禁 + 真树，备份还原）：share 文件加一处色相 → 红（零预算文案）；attachments 加恰好一处 → 红（`28 grandfathered, 29 now`）；attachments 减恰好一处 → 红（stale，逼显式收账）。另验 `--update-baseline` 在当前树是幂等的（重生成的 JSON 与已提交基线逐字节相同）。
- 变异 8 发全杀（/tmp/mutG 备份还原）：预算判定改 `> budget + 1`（S2 静默放行，被「超预算」单例杀）、缩小不再报（S3 静默放行）、`isZeroTolerance` 恒 false（share 退化为普通基线文件，被零预算单例杀——注意此 mutants 下场景 S1 仍红，因为 share 不在基线里，两路只是文案不同）、常量表豁免重开、white/black 移出色名表、palette 问题路由写反、`visitPalette` 未挂载、基线失效条目扫描跳过。
- 遗留登记：H6/SH-44 存量清偿（218 处按模块分账，各模块自行降到 0 后收账）。其中 folders/tags/kanban 的「用户自选色」与 lightbox/slides 的「媒体之上的白」很可能该改成永久豁免而非清偿——那需要设计裁决，本项不替它们决定，只在基线里原样记账。
- 验证：tsc -b 绿；11 静态门禁全绿（`hardcoded:check` 现含 Part 5）；vitest 定向 52/52。全量回归 241 文件/1882 测试绿（REGRESSION_EXIT=0，串行 438s；较上轮少一个文件、多 13 例，即删掉的 share 专用测试与迁入门禁套的 16 例）。fix 提交 be162df2。

## 45 — SH-39（H1）删除无消费者的「最多记录数」假设置（2026-09-20）

- 现状与根因：设置模态的第二个分段控件（1K/5K/10K/50K/不限）经 `useShareStore` 的 `maxLogRecords` 存进 `localStorage.inkstone_share_retention`，但**全仓没有任何读端**——访问日志列表走服务端分页（SH-33 导出按 100 行翻页拉全量），实时日志与看板统计由 SQL 聚合，条数上界只有 F5/SH-05c 之后那条**服务端账号保留期**。于是该控件唯一效果是往浏览器写一个没人看的数字，且 `persistMaxLogRecords` 写的是整个 key（`{ maxLogRecords }`），会把 SH-05c 遗留在同一 key 里的旧 `logRetentionDays` 一并抹掉——假设置顺带真清掉了别处的缓存。删除，不接线：把「最多记录数」接进取数上限会与刚建立的服务端保留期口径打架（两个上界、两处真相），而账号级「记录数上限」本不是产品语义。
- 改动面（生产代码净删 73 行，8 文件总 -107/+55）：`share-store/state.ts` 删 `DEFAULT_MAX_LOG_RECORDS`/`loadInitialMaxLogRecords()`/`initialMaxLogRecords`（share 侧自此不再读写 `inkstone_share_retention`）；`types.ts` 删 `maxLogRecords` 字段与 `setRetentionSettings` 动作；`filters.ts` 删 `setRetentionSettingsImpl`/`persistMaxLogRecords` 及其 Pick 项；`index.ts` 删初值一行；`use-share-settings-modal.ts` 删两处 store 订阅、`maxRecords` 草稿态、`SaveSettingsFlow` 的两个字段与 `saveSettingsFlow` 的那次写入；`share-settings-modal.tsx` 删 `recordOptions` 与第二个 `RetentionField`。`ShareSettingsModal` 的 `SettingsBundle` 由 `ReturnType<typeof useShareSettingsModal>` 派生，故控件删除后类型自动收紧（漏删一处解构即 tsc 红）。
- 保留项：`share.max_records_label`/`share.max_records_val` 两个 locale 键**不删**——`src/client/features/blog/blog-settings-modal.tsx:190-191` 仍引用它们。据此登记 H7/SH-45：blog 侧有同一套假设置（`blog-store` 的 `maxLogRecords`/`setRetentionSettings` 亦无消费者），本项按铁律14 不夹带。
- 测试（红先行）：`share-store/retention.test.ts` 重写为 2 例（缓存里放着 `{maxLogRecords:5000}` 时 store 初值既无该字段也无 `setRetentionSettings`；改流量过滤不再写 `inkstone_share_retention`），`share-settings-retention.test.ts` 由 4 例扩到 6 例（保留期成为模态里唯一的 `role=radiogroup`、正文不再出现 `10K`；点保存仍按剩下的两项落地——`setFilters` 与 `updateSettings` 各恰好一次且取值正确）。红态实测 `expected …(2) to have a length of 1 but got 2` 与 `expected true to be false`。
- 变异 6 发全杀（/tmp/mutH1 备份还原，全部 `cmp` 逐字节复核）：store 初值重挂 `maxLogRecords: 5000`、`setFiltersImpl` 重新回写 retention key、模态重新挂上带 `10K` 的 `RetentionField`、重挂一个不含 `10K` 字样的第二分段控件（证明长度断言独立承载，不靠文案）、`saveSettingsFlow` 不再写流量过滤、`setVisitLogRetentionDays(0)` 忽略所选天数。后两发是本次动了保存路径后补的守卫——先前它们无人断言（`setFilters` mock 只 reset 不 assert）。
- 踩坑（同机负载下的假绿/假红）：初版 store 测试用 `vi.resetModules()` + 测试体内 `await import('./index')` 来构造「先种缓存再建 store」，把整条 store 依赖链的冷转译算进了 5s 用例超时——空闲 1.1s，load average 12 时 1.7s，人为压到 18 即 `Error: Test timed out in 5000ms`（同目录其余 22 文件全绿，只它红）。改为顶层静态 import + `vi.hoisted` 在 import 之前种 key：vitest 的文件级模块注册表本就保证「本文件首次 import 即冷建 store」，缓存种得更早而不必重转依赖链，用例耗时降到 10ms，压测 load 18 下 108/108 绿。教训：`resetModules` 式隔离在共享机器上不是免费的，能在文件级拿到的顺序保证就别在测试体里重付。
- 验证：tsc -b 绿；13 项静态门禁全绿；vitest 定向 8/8，share 目录全量 23 文件/108 测试绿（含压测复跑）。全量回归 241 文件/1883 测试绿（REGRESSION_EXIT=0，串行 449s；较上轮 1882 多 1 例，即本次新增的保存落地断言）。fix 提交 446451be。

## 46 — SH-40（H2）share 的每个 `Segmented` 都要有可访问名称（2026-09-20）

- 现状与根因：`Segmented` 渲染 `role='radiogroup'`，而它的可访问名称只来自 `label`（写成 `aria-label`）或 `aria-labelledby` 两个 prop（`src/client/components/form.tsx` 的 `SegmentedInner`）。share 里 6 处 `Segmented` 只有工具栏的 `ViewToggle` 传了 `label`，其余 5 处把名字寄托在「旁边有一行可见标题」上——radiogroup 与那行字**没有任何关联**，屏幕阅读器读到的是一组无名单选钮（键盘用户还能靠方向键走，读屏用户不知道这组是干什么的）。台账原本只记 `RetentionField` 一处，执行时按同一口径把 share 全部 6 处一起收口，并加静态门禁守住，避免「修一个漏五个」。
- 命名取法（两条规则，不是一刀切）：**旁边就是可见标签文本**的用 `aria-labelledby` 指向那个节点（保留期字段的 `<span>` 标签、看板与笔记弹窗的「访问趋势」标题、编辑弹窗的「分享有效期」标题）——名字与眼睛读到的同一份文本，不会各说各话；** toolbar 上本就没有可见标签**的区间选择器用 `label`（与新键 `share.range_label`「Analytics time range / 分析时间范围」，同 `ViewToggle` 既有做法）。刻意不给已被 `aria-labelledby` 命名的控件再补 `aria-label`：两者同在时 `labelledby` 赢，多出来的隐藏名字只会与可见文案漂移，故行为用例明确断言 `aria-label` 为空。
- 尺寸逼出的真拆分：`share-dashboard-view.tsx` 原本 498 行（`measure = wc + 1`，上限 500），加 `useId` 与 `id`/`aria-labelledby` 三行即越线。按本台账既有处置（真拆不刷基线）把 `TimelineCard` 整体移到新文件 `share-dashboard-timeline-card.tsx`（40 行），主文件回到 468 行、重新有余量；`src/client/features/share/share-settings-retention.test.ts` 同样因 `describe` 回调超 50 行被 `size:check` 拒（`longFns:1`），按表面把 SH-40 两例拆成独立 describe。
- 守卫：新 `tests/share-radiogroup-names.test.ts`（AST 扫 `features/share` 全部非测试 `.tsx`，含子目录如 `share-edit-modal/`），断言每处 `<Segmented>` 都带 `label` 或 `aria-labelledby`，报 `文件:行`。它只查「有没有名字」，不查「名字对不对」——后者由行为用例把守（见下），两者分工由变异 A2 钉死。
- 测试（红先行）：守卫首红实测 6 处（`share-dashboard-view.tsx:84,193`、`share-note-analytics-modal.tsx:116,174`、`share-settings-modal.tsx:144`、`share-edit-modal/sections.tsx:252`）。行为用例两例（`share-settings-retention.test.ts`）：`aria-labelledby` 解出来的节点文本必须等于 `share.retention_days_label`（红态 `expected null to be truthy`），以及方向键 ArrowRight 从 30d 走到 90d 且焦点落在新选项上（键盘路径此前无人断言）。修后 share 目录 24 文件/112 测试全绿。
- 变异 7 发全杀（/tmp/mutH2 备份还原，逐文件 `cmp` 复核）：A1 去掉保留期 `aria-labelledby`（守卫 + 行为双杀）、A2 把 `aria-labelledby` 接到「当前值」那个 span（只被行为用例杀，`expected 'share.retention_days_val' to be 'share.retention_days_label'`，即守卫与行为的确互补）、A3 去掉看板区间 `label`、A4 去掉编辑弹窗有效期名字（验子目录被扫到）、A5 去掉新文件里看板趋势的名字（验新文件在扫描范围内）、A6 把 `SegmentedButton` 的方向键处理改成只 `preventDefault`（键盘用例杀）、A7 同时给 `label` 与 `aria-labelledby`（`aria-label` 断言杀）。
- 局限（如实登记）：live axe 门禁（`scripts/check-contrast.mjs` 的场景是外壳 aside、命令面板、应用设置对话框）不打开分享中心模态，`scripts/e2e-visual.mjs` 亦无看板块卡场景，本次命名的正确性只由 jsdom 断言把守，未在真实浏览器读一遍；share 外的 5 处同缺陷（blog 4 + settings 备份目标 1）已量测并登记 H8/SH-46，未在本批动（铁律14）。
- 验证：tsc -b 绿；13 项静态门禁全绿；vitest 定向 10/10，share 目录 24 文件/112 测试绿。全量回归 242 文件/1887 测试绿（REGRESSION_EXIT=0，串行 422s；较 SH-39 轮次 241/1883 多 1 文件/4 例，即新守卫 `tests/share-radiogroup-names.test.ts` 两例 + SH-40 行为两例）。fix 提交 1a3e4dae。

## 47 — SH-43（H5）博客访问日志按账号保留期清理（2026-09-20）

- 现状与根因：F5/SH-05c 只给 `share_visits` 建立了服务端保留期（`users.settings.$.share.visitLogRetentionDays`），`blog_visits` 的 cron 扫描到本批前仍只有「帖子已删才清」这一条（SH-05b 的孤儿清扫），也就是说实名用户的博客流量记录按账号设置永不过期，同一种表两套口径。设置模态里那个「保留期」分段控件是假设置：`blog-store` 把它写进 `localStorage.inkstone_blog_retention_settings`，服务端与 cron 都读不到，换设备或清浏览器缓存即失效。
- 取舍（为什么落在账号 settings 而不是博客自己的文档）：博客自身的站点设置存在 meta/KV 文档里，而 maintenance cron 是纯 SQL 批处理，`DELETE … WHERE` 里没法联到那份文档取值；share 侧 F5 已经确立「`users.settings` 段落 + `json_extract` + `json_valid` 兜底」的口径。于是新增 `blog` 段落（`$.blog.visitLogRetentionDays`），与 share 共用 `VISIT_LOG_RETENTION_DEFAULT_DAYS`/`VISIT_LOG_RETENTION_MAX_DAYS`（原 `SHARE_VISIT_RETENTION_*` 更名——两处同一枚旋钮、同一个语义：0 = 永久保留），合并器 `mergeVisitLogRetention` 也按 section 复用。
- 服务端：`maintenance.ts` 把原来那条 share 专用 SQL 抽成 `visitLogRetentionDaysSql(section)` + `visitRetentionSweep(table, alias, section)`（同一逻辑第二次出现即抽，不留两份会漂移的副本），清扫批次由 3 条变 4 条（share 孤儿、share 按龄、blog 孤儿、blog 按龄），结果计数新增 `blogVisitLogs`。
- 客户端：`use-blog-settings-modal.ts` 改读 `useSession((s) => s.settings.blog.visitLogRetentionDays)`，保存走 `updateSettings({ blog: { visitLogRetentionDays: days } })`；`blog-store` 的 `logRetentionDays` 字段、初值加载与持久化整体删除（`maxLogRecords` 留给 H7/SH-45），SH-39 的教训不重犯——同一份真相不在浏览器再存一份。`type=older_than` 的清理此前是 `parseInt(retentionDays, 10) || 30`，账号选「永久保留」（0）时**静默按 30 天删日志**，现与 share 同口径：`parseBlogCleanDays` 返回 null 即 toast 警告（`share.clean_blocked_unlimited`）且不发请求、不弹确认。
- 计划外必要修正：`tests/blog-visit-cleanup.test.ts`（SH-05b 孤儿清扫）的样本是 400 天前的访问行，博客保留期一落实，默认 30 天会把「帖子还在」那行一并清掉，该例由绿转红。把样本改近（1 天前）并注明按龄清理归保留期那条语句负责——孤儿语义本身未动，两例仍绿。这是新语义应有的后果，不是回归。
- 测试（红先行）：新 `tests/blog-visit-retention.test.ts`（node 工程 9 例：按设置删旧留新、0=永久保留、缺 `blog` 段落走默认、逐账号各自判定、oldest-first 分两批扫完、无主行按默认扫、settings 非 JSON 走默认、值解析不出来不动行、保留期为 0 时孤儿清扫照跑），照 F5 的做法登记进 `vitest.config.ts` 两处（jsdom `exclude` + node `include`）；`src/shared/user-settings.test.ts` 由 16 例扩到 20 例（默认、0 保留、钳制与非数字回落、写 blog 不扰动 share，另在引用稳定性与回填两例里补 `blog` 断言）；新 `blog-store/retention.test.ts` 2 例、新 `use-blog-settings-modal.test.ts` 3 例（`parseBlogCleanDays`）、新 `blog-settings-retention.test.ts` 5 例（模态显示账号保留期而非浏览器缓存、保存落到 `updateSettings` 且 `setRetentionSettings` 只拿 `{ maxLogRecords }`、保存后不再缓存该 key、0 时拒绝按龄清理、30 时按 30 清理）。首红实测：服务端 7 failed/2 passed，客户端 9 failed/2 passed。
- 变异（/tmp/sh43 备份还原，逐文件 `cmp` 复核 RESTORED_EXACTLY）：A 博客按龄清扫改读 share 字段（杀 5 例）、B share 按龄清扫改读 blog 字段（杀 5 例，证明重构没把两条 SQL 混为一谈）、C 去掉 `retention > 0` 守卫（两个保留期文件共 4 例红）、D 客户端把 0 当清理窗口（2 例）、E store 回写保留期（1 例）、H 表单喂死值 "30"（2 例）、I 保存不写账号（2 例）、J 保存顺手回写浏览器缓存（首发生还，见下一条）。
- 踩坑三条：其一，模态用例第一轮 5 例红里有 3 例是**污染级联**——某例断言失败就跳过了 `unmount()`，残留在 document 里的旧模态让下一例点到 stale 按钮（表现为读到上一例选的 7d），改成 `openModal()` 自持有句柄 + `afterEach` 卸载后才可解释；其二，`useState(String(visitLogRetentionDays))` 那行是**等价变异体**（G：钉死 "30" 全绿），因为挂载后的 `applySettingsToForm` effect 立刻覆盖它，真正的账号来源由 H 那发守住，记此以免后人把断言目标错认成初值行；其三，J 的第一版断言（`expect(localStorage.getItem(key)).not.toContain('logRetentionDays')`）在 store 被 mock 的文件里是空断言（key 根本不存在，`null` 配 `toContain` 直接被 vitest 判无效），补成「保存后该 key 仍为 null」才真正杀住（J3）。
- 局限（如实登记）：本批未跑真实浏览器，博客设置模态的保留期落地只由 jsdom 断言把守（`scripts/e2e-visual.mjs` 与 `scripts/check-contrast.mjs` 都不开博客设置模态），SH-40 那条模态的可访问名称缺陷也仍挂在 H8/SH-46；服务端 `/api/blog/visits` 的两道 share 护栏（`older_than` 的 400 校验、`type=all` 的口令重认证）按铁律14 不夹带，登记 H9/SH-47。
- 验证：tsc -b 绿；13 项静态门禁全绿（`size:check` 因 `useBlogSettingsModal` 破 50 行拦下一次，按真拆处置——`applySettingsToForm`/`saveSettingsFlow` 改 `...fields` 传参、返回值同样展开，函数回到 39 行、文件 246 行，不刷基线）；vitest 定向 blog 4 文件/11 测试绿，share + shared + worker + blog D1 相关 35 文件/269 测试绿。全量回归 246 文件/1910 测试绿（REGRESSION_EXIT=0，串行 58s，本轮同机无争用，故远快于前几轮的 420–500s；较 SH-40 轮次 242/1887 多 4 文件/23 例，即本批新增的 blog D1 9 例 + blog 客户端 3 文件 10 例 + `user-settings.test.ts` 4 例）。fix 提交 b1d358ad。

## 48 — SH-45（H7）删除 blog 侧「最多记录数」假设置并清掉跨模块文案键（2026-09-20）

- 现状与根因：SH-39 在 share 侧删掉的那套东西，blog 侧原样还有第二份。`blog-store` 把 `maxLogRecords` 存进 `localStorage.inkstone_blog_retention_settings`（`state.ts` 的 `loadInitialRetention()` + `filters.ts` 的 `setRetentionSettingsImpl`/`persistRetentionSettings`），**全仓无读端**：博客看板与访问日志的取数上界各自写死在服务端 SQL 的 LIMIT，条数口径自 F5/SH-05c 与 SH-43 之后只剩「账号级保留期」这一条。控件唯一效果是往浏览器写一个没人看的数字。更糟的是 `blog-settings-modal.tsx:190-191` 直接引用 `share.max_records_label`/`share.max_records_val`——跨模块读别的域的文案键（SH-39 当时正因它而保留那两个键）。
- 取舍（删除，不接线）：与 SH-39 同一判断——把「最多记录数」接进取数上限会跟刚建立的服务端保留期口径打架（两个上界、两处真相），账号级「记录数上限」本不是产品语义。文案键走**删除**而非迁移 blog 命名空间：本批之后全仓零使用者，为一个不存在的控件造新键即预留死代码（铁律5）。
- 改动面（生产代码净删 74 行，10 文件总 -109/+56）：`blog-store/state.ts` 删 `RETENTION_SETTINGS_KEY`/`loadInitialRetention()`/`initialRetention`（blog-store 自此不再碰该 key）；`types.ts` 删 `maxLogRecords` 字段与 `setRetentionSettings` 动作；`filters.ts` 删 `setRetentionSettingsImpl`/`persistRetentionSettings` 及 `Pick` 里的 `'setRetentionSettings'` 与 `RETENTION_SETTINGS_KEY` 引用；`index.ts` 删初值一行；`use-blog-settings-modal.ts` 删两处 store 订阅、`maxRecords` 草稿态、`SettingsFormCtx.maxLogRecords`、`SettingsFormSetters.setMaxRecords`、`SaveSettingsCtx.maxRecords`/`setRetentionSettings` 与 `saveSettingsFlow` 里那次写入；`blog-settings-modal.tsx` 删第二个 `RetentionField` 与 `SettingsFormBundle` 的两个字段；`src/shared/locales/{en-US,zh-CN}/share-2.ts` 各删两键。`blog-store` 仍保留 `inkstone_blog_traffic_filters`（流量过滤三开关照旧，属 H7 范围外）。
- 测试（红先行）：`blog-store/retention.test.ts` 按 SH-39 那份守卫重写为 2 例——浏览器缓存里放着 `{ logRetentionDays: 7, maxLogRecords: 5000 }` 时 store 初值三样都没有（`maxLogRecords`/`logRetentionDays`/`setRetentionSettings`），以及 `setFilters` 不再回写 `inkstone_blog_retention_settings`（key 保持 null）；`blog-settings-retention.test.ts` 的 store mock 摘掉 `maxLogRecords`/`setRetentionSettings`，SH-43 那条保存用例改为「保存后该 key 仍为 null」，并新增 SH-45 describe 2 例（流量页只剩 2 个 `role=radiogroup`（tab 切换器 + 保留期）且正文不含 `10K`；点保存剩下的两项照旧落地——`setFilters` 与 `updateSettings` 各恰好一次且取值正确）。首红实测 `Test Files 2 failed | 2 passed · Tests 5 failed | 8 passed`。修后 blog + share 两侧 retention 5 文件/22 测试全绿（share 那 10 例一字未动，即本次删除未外溢的证明）。
- 变异 6 发全杀（/tmp/mutH7 备份还原）：M1 store 初值重挂 `maxLogRecords: 5000`、M2 `persistTrafficFilters` 顺手回写 retention key、M3 模态重挂带 `10K` 的第二个 `RetentionField`、M4 重挂一个措辞不含 `10K` 的等效第二分段控件（证明「计数」断言独立承载，不靠文案命中）、M5 `saveSettingsFlow` 不再写流量过滤、M6 保存忽略所选天数钉死 30。后两发是删掉一次写入后补的守卫——先前无人断言保存路径的另两项。
- 踩坑一条：还原校验第一版用 `bash -c` 里的 `cmp -q` 比较，四个文件报 MISMATCH，而文件大小与内容其实一致（改用进程内 `read_bytes()` 逐字节比对后为 clean，六发变异随后都跑在干净基线上）。教训是校验手段出错时先怀疑校验，别拿它当证据；本轮因此重跑了一次全序列。
- 局限（如实登记）：未跑真实浏览器（`scripts/e2e-visual.mjs`/`check-contrast.mjs` 都不开博客设置模态），控件消失与保存路径只由 jsdom 断言把守；老用户浏览器里残留的 `inkstone_blog_retention_settings` 不做清理迁移——纯客户端缓存、读端已全删即无害（与 SH-39 同口径）；同模态里那 2 处无名 `Segmented` 仍挂 H8/SH-46，`/api/blog/visits` 的服务端护栏仍挂 H9/SH-47（铁律14 不夹带）。
- 验证：tsc -b 绿；13 项静态门禁全绿（含 `i18n:check`——两语言同步删键、键数仍对齐）；vitest 定向 blog + share retention 5 文件/22 测试绿（pre-commit 钩子另跑相关 117 文件/776 测试绿）。全量回归 246 文件/1912 测试绿（REGRESSION_EXIT=0，串行 364.94s；较 SH-43 轮次 246/1910 多 2 例，即 SH-45 在 `blog-settings-retention.test.ts` 补的那两例）。fix 提交 28b175b6。
