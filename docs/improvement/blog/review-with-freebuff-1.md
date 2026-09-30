# 「博客管理中心」审查报告（第三轮 · Freebuff · 2026-09-30）

> 范围：`src/client/features/blog/**`（58 文件 / 约 7,000 行）、`src/worker/routes/blog/**`（13 文件 / 约 2,700 行）、`src/shared/types/blog.ts`、`src/shared/locales/{en-US,zh-CN}/blog-*.ts`、`src/worker/db/schema/**` 的 blog 表与索引、`src/client/demo/backend/routes/blog*.ts`、以及作为公开端消费方的 `blog-frontend/**`。
> 方法：① 逐文件读源码；② 对前两轮报告的每一条结论在当前 `dev` 树上**重新核验**（含被判定为「已修」的两条）；③ 索引 / 查询计划错配、包体引用链、协议白名单、缓存键等按现状静态核对；④ 未做 profiling，量级均为明示假设下的推算（见第八节）。
> 关联文档：`.trae/blog-review-report.md`（第一轮，P0-1…P0-8 / P1 / P2 / BF 系列）、`.trae/blog-admin-review-round2.md`（第二轮，SB/B2/PB 系列）。两份报告均写于 2026-09-18～19，此后代码有变动，**本报告以当前树为准**，第三节列出三份报告的差异。
> 状态图例：`开放` = 当前代码中仍存在；`已修` = 本轮核验确认已不存在（附证据）；`过时` = 前轮报告的结论在当前树上不成立。

---

## 一、摘要与总体判断

形式上这个模块是仓库里做得较规范的一批：零中文 UI 字面量（文案走 message id）、无超 500 行文件、无 `window.alert/confirm/prompt`、大部分弹层复用 `Modal/Menu/overlay.confirm`、访问统计的指纹与保留期 sweep 有服务端实现。

但把它当成「一个独立完整的博客后台」看，四个底座仍是空的，这是本轮 52 项问题的共同来源：

1. **租户归属**：`/api/blog/public/*` 没有任何 `user_id` 过滤（SEC-01），而管理端是按 `user_id` 写的。多用户实例下所有作者的已发布内容合并进同一个公开站；`blog_posts.slug` 还是**全局** `UNIQUE`（SEC-08），与「每用户一个博客」的目标直接冲突，同时构成跨用户 slug 探测 oracle。
2. **统计可信**：`stats.ts` 在三处**编造**分析数据（SEC-01 之外的 COR-01），真实访客因为前台 SSR 取数不带 UA 又被 `isBot('')` 判成爬虫（COR-04），于是「PV 恒 0 而 UV 靠编造」——用户截图里「PV 0 / 独立访客 114 / 日均 0 / 中国 152 100% / 累计访问量 152」这组自相矛盾的数字，就是这两条合并的可视化结果。
3. **失败语义**：`blog-store/loaders.ts` 全部 `catch → console.error`，store 没有 error 通道，hub/评论/友链一律把失败渲染成「暂无数据」；若干 mutation 的 rejection 被 `void` 吞掉。这违反 AGENTS 铁律 2（禁止静默失败）。
4. **规模与分页**：文章列表 `SELECT p.*` 带全文正文且无 `LIMIT`（ENG-02，实测性质：100 篇 ≈1.2 MB，其中约 96% 是列表不用的字节）；友链接口完全不读客户端发来的筛选参数（ENG-03）；搜索每击键一次全量请求，无防抖、无 abort、无乱序守卫（ENG-04）。

另有两条**本轮新发现、前两轮未列**的缺陷，严重度不低：

- **SEC-13**：`blog_visits.is_self_referrer` 在写入时被**硬编码成字面量 `0`**（`src/worker/routes/blog/visits.ts:85-87`），而 share 侧有完整的 `isSelfReferrer()` 判定（`src/worker/routes/share/public.ts:288,300-306`）。后果是后台「排除自引荐」开关**永久无效**，`filterStats.selfReferrals` 恒为 0；再叠加仪表盘把 self/owner 参数硬编码 0 显示（`blog-dashboard-view/index.tsx:116-117`），界面上的「0 次自引荐与 0 次作者自身访问」是同一个数字的两次谎报。
- **SEC-10**：未认证访客可提交任意 `authorAvatar` URL，默认值是第三方 `api.dicebear.com`（`public-comments.ts:69-83`）；管理端的评论卡直接 `<img src={comment.authorAvatar}>` 渲染（`blog-comments-view.tsx:290-305`）。匿名访客因此可以让**管理员的浏览器**向任意外站发起请求（泄露管理员 IP/UA），而 dicebear 也把每条未审核评论的昵称外发第三方。

结论：**当前「可用」的边界是——单人使用、只看列表与发布、不信任仪表盘**。下面 52 项中，批次 1（安全与租户边界）与批次 2（统计可信）是把它变成「可信的后台」的必要条件。

---

## 二、审查范围与方法

- 管理端 UI：`blog-hub-modal`、`blog-hub-sidebar`、`blog-dashboard-view`（8 文件）、`blog-table-view`（2）、`blog-grid-view`（3）、`blog-publish-modal`（2）、`blog-settings-modal`（2）、`blog-categories-modal`、`blog-comments-view`、`blog-links-view`（10）、`blog-store`（8）、`blog-note-submenu`/`use-blog-note-submenu`、`blog-batch-bar`/`blog-batch-bar-actions`、`blog-traffic-filter-popover`、`blog-hub-toolbar`。
- 服务端：`posts.ts`、`links.ts`、`comments.ts`、`organizer.ts`、`settings.ts`、`stats.ts`、`visits.ts`、`public.ts`、`public-comments.ts`、`public-links.ts`、`schemas.ts`、`helpers.ts`、`link-checker.ts`、`index.ts`。
- 支撑层：`db/schema/{tables,indexes,migrations,checks}.ts`、`lib/{share-analytics,share-selection-sql,visit-aggregates,outbound-url,request,throttle,maintenance}.ts`、`client/components/{big-svg-chart,dashboard-blocks,form,overlay}`。
- 公开端：`blog-frontend/src/{middleware.ts,lib/api.ts,pages/**,components/**}`。
- 门禁：`scripts/check-{hardcoded,token-drift,i18n,size,deep-imports,surface-coverage,comments,escape-hatches,empty-catches,module-state}.mjs` 与本模块的相关性。

已运行/未运行：本轮**未运行** `npm run build`、e2e 与视觉门禁（结论均为静态读码与既有产物核对）；涉及「已修」判定的两条以现有测试文件为证（`src/client/features/blog/use-blog-settings-modal.test.ts`、`blog-settings-retention.test.ts`）。

---

## 三、与前两轮报告的差异（现状确认）

前两轮报告里被判为「开放」的条目，本轮逐条回到代码核验，结论如下。

| 前轮编号 | 前轮结论 | 本轮核验 | 证据 |
| --- | --- | --- | --- |
| P0-1 删博文级联删评论不带 owner | 仍存在 | **已修** | `posts.ts` 单删与批量删除的评论语句都带 `EXISTS (SELECT 1 FROM blog_posts bp WHERE bp.id = ?1 AND bp.user_id = ?2)` / 子查询带 `user_id` |
| P1 评论提交限流 | 已修 | **已修** | `public-comments.ts:80-95` 双预算（IP 5/10min + 单篇 100/10min） |
| P1-3 cron 不清理 `blog_visits` | 仍存在 | **已修** | `lib/maintenance.ts:133-139` `visitRetentionSweep(db,'blog_visits',…)`；`tests/blog-visit-retention.test.ts`、`blog-visit-cleanup.test.ts` |
| B2-01 保留期「永久保留」被换算成 30 天 | P0 仍存在 | **已修（前轮报告已过时）** | `use-blog-settings-modal.ts:191-206` `parseBlogCleanDays()` 对 0/负数/不可解析一律返回 `null`，`older_than` 在 `null` 时直接阻断并提示；`use-blog-settings-modal.test.ts`、`blog-settings-retention.test.ts` 均有断言 |
| SB-04 `range` 裸 cast（任意值等同 `all`） | 仍存在 | **已修** | `shareRangeFromQuery()`（`lib/share-analytics.ts:339-342`）对未识别值返回 `'30d'` |
| SB-04 / P1-6 `range='all'` 时时间轴落 1970 | 仍存在 | **已修** | `analyticsWindow()`（`share-analytics.ts:369-373`）用该用户的 `MIN(visited_at)` 作为起点，无数据时退回近 30 天 |
| B2-18 `DevicesCard` 缺空态 | 仍存在 | **已修** | `audience-cards.tsx:62-88` 有 `devices.length === 0 && osList.length === 0 ? <NoVisitData/>` |
| P2-1 图表 `svg` 缺 `role=img`/aria-label | 仍存在 | **已修** | `big-svg-chart.tsx:128` `role='img' aria-label={ariaLabel}`（刻度圆整问题仍开放，见 UI-12） |
| P0-2 / SB-01 公开路由无租户过滤 | 仍存在 | **本轮已修** | `routes/blog/owner.ts` 解析 `?owner=`，13 个公开端点全部改绑 `blogOwnerOf(c).userId`；`tests/blog-public-owner.test.ts`（9 条两账号契约） |
| P0-3 / SB-02 友链 upsert 无 owner 守卫 | 仍存在 | **本轮已修** | `routes/blog/owned-rows.ts` 的 id/引用归属判定接入两条 upsert、回读与批量 setCategory；`tests/blog-links-routes.test.ts`（+7 条） |
| P0-4 仪表盘伪造数据 | 仍存在 | **仍存在** | `stats.ts:297`、`:314`、`:335-352` |
| P0-6 / SB-09 设置写用户、读全站 | 仍存在 | **仍存在** | `settings.ts:38-39,64,88`、`public.ts:66`、`public-comments.ts:61` |
| P0-5 真实读者记为 bot / PV 恒 0 | 仍存在 | **仍存在** | `share-analytics.ts:78-81`、`visits.ts:52`、`blog-frontend/src/pages/posts/[slug].astro:24-27` |
| P0-7 store 无 error 态 | 仍存在 | **仍存在** | `blog-store/loaders.ts:38-110` |
| P0-8 blog 整块进主路径 | 仍存在 | **仍存在** | `features/blog/index.ts` 4 条 `export *`；`features/sidebar/sidebar.tsx:22` 静态 import |
| SB-03 批量 ids 无上限 | 仍存在 | **仍存在** | `schemas.ts:23,79,165,172,194,211` |
| SB-06 URL 无协议白名单 | 仍存在 | **仍存在** | `schemas.ts:117-129,184-190` |
| PB-04 搜索无防抖/无 abort | 仍存在 | **仍存在** | `blog-store/filters.ts:25-33`、`loaders.ts:34-53` |
| PB-16 包体：`icons` 全量 registry | 仍存在 | **仍存在** | `link-icon-selector.tsx:2,30`、`link-dynamic-icon.tsx:3` |
| B2-05 `text-white` 绕过令牌 | 仍存在 | **仍存在** | 本模块 13 处（清单见 UI-01） |

结论：**前两轮报告的条目约 8 条已被修复但未在两份报告里回填**，本轮已把状态订正；其余 20+ 条仍开放，构成本报告的基线。

---

## 四、问题台账

严重度：**P0** 数据破坏 / 必现故障 / 安全红线 · **P1** 高 · **P2** 中 · **P3** 低。
代价：**XS** <2h · **S** ≤0.5 天 · **M** 0.5～2 天 · **L** 2～5 天 · **XL** >5 天。

### 4.1 安全与租户边界（SEC）

#### SEC-01 [P0][已修] 公开接口没有任何租户过滤
- **问题**：`/api/blog/public/*` 的每个读端点都只按「实例即本站」假设查询。`public.ts` 的文章列表/详情、分类、标签、时间线、日历，`public-comments.ts` 的评论列表，`public-links.ts` 的友链目录与分类，全部不带 `user_id`。对照管理端（`links.ts:57-63`、`posts.ts:57-64`）都带。
- **影响**：多用户实例（owner+member，`src/worker/routes/auth.ts` 允许 owner 开启注册）下，任一作者的已发布文章、标签、分类、slug、友链条目（含 `id`、`url`、`clicks`）都会被别人的博客站列出。泄露的 `id` 又是 SEC-02 的输入，两条连起来是完整的越权攻击链。此外 `public.ts:218` 把 `noteId` 一并发给匿名访客。
- **方案**：新增 `src/worker/routes/blog/owner.ts` 的 `resolveBlogOwner(c, db)`：按 `?owner=<username>` 查 `users`（`username` 已是唯一列），缺省回退「实例默认 owner = 最早注册用户」并打一条 `[blog]` 日志；所有公开查询绑定 `user_id = ?`；`/posts/:slug`、`/comments/:postSlug` 按 (owner, slug) 双条件，查不到即 404；匿名响应去掉 `noteId`。前台 `middleware.ts` 从 `/u/<username>` 前缀或 `?owner=` 解析 owner 写入 `Astro.locals.owner`，`lib/api.ts` 的所有公开取数带上它。
- **范围**：`worker/routes/blog/{public,public-comments,public-links,owner}.ts`、`blog-frontend/src/{middleware.ts,lib/api.ts,env.d.ts}`。代价 **M**（前台另计，见 COR-04）。
- **建议**：这是批次 1 的**第一个**落地项——SEC-02/08/09 与 COR-04 都以「请求 → owner」为共同前置。契约上把 `owner` 当公共 API 参数：过渡窗口内缺省回退默认 owner，窗口到期删除回退并同步文档与 `src/shared/types`。

#### SEC-02 [P0][已修] 友链 / 分类的 upsert 与 import 可越权改写他人行，且回读无 owner
- **问题**：`links.ts:86-142` 允许客户端指定 `body.id`，`INSERT ... ON CONFLICT(id) DO UPDATE SET …` 只按主键冲突就更新，`user_id` 只出现在 INSERT 值里；随后 `SELECT * FROM blog_links WHERE id = ?1`（`:89-92`）无 owner 条件，把受害者的行原样回显。分类 upsert（`:311-328`）、导入（`:393-464`）同型。
- **影响**：拿到他人 link id（SEC-01 已公开）即可改写其友链 URL——受害者博客前台的外链变成攻击者控制的钓鱼地址，并能读回确认。
- **方案**：改成「按 `id AND user_id` 先判归属，不存在则 INSERT、存在则 UPDATE」，或 `DO UPDATE … WHERE blog_links.user_id = excluded.user_id` 并检查 `meta.changes`；回读补 `AND user_id = ?`；导入侧忽略客户端 `id`，走 old→new 映射（该函数已有 `categoryIdMap` 等价机制可照抄）。
- **范围**：`links.ts` 四处。代价 **S**。
- **建议**：与 SEC-01 同批；先写复现测试（X 用户持 Y 用户的 id 调用 upsert，断言 404/403 且 Y 的行未变）。

#### SEC-03 [P1][已修] 批量请求无上限；评论批量改状态恒 500（占位符 ?2 既当 owner 又当首个 id）
- **问题**：`schemas.ts` 的 `postIds`（:23）、`commentIds`（:79）、`linkIds`（:165）、`orders`（:172）、`links`（:194）、`categories`（:211）只有类型或 `min(1)`，没有 `.max()`；请求体上限 `JSON_BODY_LIMITS.note ≈12.6 MB`。D1 单语句绑定变量上限 100，仓库在 `files/helpers.ts` 与图谱侧已确立「100 条/批」的分块约定，blog 是唯一漏网模块。叠加 `posts.ts:431-433` 是 `for` 循环逐条 `await` 非原子——第 2 条语句挂掉时第 1 条（删文章）已提交，是「500 + 部分提交」的合流点。
- **方案**：五个 schema 一律 `.max(100)`，超限 400 并给出可读文案；服务端复用既有分块范式（`files/helpers.ts:30,102-103`）与 `db.batch(chunk)`；批量删除改成单条带 owner 的语句，避免「先删评论后删文章」的中途失败。
- **范围**：`schemas.ts`、`posts.ts`、`comments.ts`、`links.ts`、`organizer.ts`；前端 `blog-store/actions.ts` 目前只校验非空，补超限提示。代价 **S**。
- **建议**：与 share 侧同根问题（SH-02）同批处理，避免两边再漂移。

#### SEC-04 [P1][已修] 用户可控 URL 无协议白名单，且直接落到 `href` / `<img src>` / `window.open`
- **问题**：`schemas.ts` 对 `link.url`（:117）、`link.avatar`、`publicLinkRequest.url/avatar`（:184-190）、`blogPublicCommentSchema.authorUrl/authorAvatar`（:125-128）只做长度限制；`blogSettingsSchema.frontendUrl/socialLinks` 同样只做长度。落点：`link-card-row.tsx:164` 渲染**匿名提交**的 `link.url`（在管理会话里）、`link-context-menu.tsx:151` `window.open(link.url)`、`link-checker-modal.tsx:299` `window.open(url)`、`blog-comments-view.tsx:290-305` `src={authorAvatar}`、`blog-dashboard-view/index.tsx:99` `<a href={frontendBase}>`。`link-checker.ts` 还会主动 fetch 存储的 URL。
- **影响**：React 19 会拦属性上的 `javascript:`，故当前不是直接 XSS；但服务端才是信任边界——同一份数据还被 RSS、导出、二维码、第三方（dicebear）与 link-checker 消费。`frontendUrl` 落到 `<a href>` 且用于拼接前台 URL，没有 scheme 与应用层校验。全仓没有 URL 净化辅助函数。
- **方案**：新增共享 `isSafeExternalUrl(raw, { allowRelative, allowMailto })`（http/https；avatar 允许站内相对路径；authorUrl 允许 mailto），schema 层 `refine` 强制并在失败时 400 说明；渲染侧统一兜底（不安全则不渲染为链接、图片退化为首字母/图标）；`frontendUrl` 额外要求是绝对 http(s) origin。
- **范围**：`schemas.ts`、`settings.ts`、`links.ts`、`public-links.ts`、`public-comments.ts`、`blog-frontend` 对应渲染点。代价 **S**。
- **建议**：与 `blog-frontend` 的 BF-2（前台 `window.open` 绕过 React 属性拦截）同一处缺口的另一端，一次修完并共用同一个函数。

#### SEC-05 [P1][开放] 博文 `content` 没有字节上限，可绕开笔记侧闸门并公开分发
- **问题**：`schemas.ts:6-8` 的 `title/content/excerpt` 无 `.max()`；`posts.ts:123,293` 用 `JSON_BODY_LIMITS.note`（≈12.6 MB）；`resolvePostSource`（`posts.ts:152-168`）允许 body 里同时给 `title`+`content` 而完全不回源笔记。`assertContentSize` 只在 `notes/create.ts:23`、`notes/edit.ts:146`、`mcp/writes/*`、`import/backup.ts:160` 调用（`grep` 确认 blog 侧零调用）。
- **影响**：单条博文可存约 12 MB，再由 `public.ts:218` 全量下发；写入侧与读取侧都没有上限，是低成本的内容型放大面。
- **方案**：blog 写入路径调 `assertContentSize(content)`，`title/excerpt` 加 `.max()`（对齐笔记侧既有上限常量）。
- **范围**：`posts.ts`、`schemas.ts`。代价 **S**。

#### SEC-06 [P1][开放] `POST /links/:id/click` 无限流、无状态校验、无归属校验
- **问题**：`public-links.ts:132-141` 对任意 `id` 无条件 `clicks = clicks + 1`，只要求 `is_active = 1`——不要求 `status = 'approved'`，也不校验该链接属于本站，每次请求一次 D1 写。对照 views 侧有 30 分钟去重（`visits.ts:95-99`）、评论侧有双预算（`public-comments.ts:80-95`）。
- **方案**：`consumeAttemptBudget`（键 `blog-link-click:<ip>:<id>`）+ `AND status='approved'` + 站点归属；重复点击在窗口内不计。
- **范围**：`public-links.ts`。代价 **S**。

#### SEC-07 [P1][部分开放] 公开端点的输入校验与 LIMIT 缺口
- **问题**（`range` 裸 cast 已修，见第三节，以下三条仍开放）：
  1. `stats.ts:437-446` 的 `days` 未校验：`?days=abc` → `NaN` → `Math.max(1, NaN) = NaN` → 绑定 `NaN`（负数兜得住，`NaN` 兜不住）。
  2. LIKE 未转义：`posts.ts:92`、`comments.ts:60`、`public.ts:130` 直接把用户输入拼进 `%…%`；同文件 `public.ts:114-117` 的 tag 分支**反而**用了 `escapeLike + ESCAPE '\\'`，说明仓库已有此约定，这三处是漏写。`?search=%` 会退化成全表扫。
  3. 公开列表端点全部无 `LIMIT`：`public-comments.ts:29-37`、`public-links.ts:27-33`、`public.ts:297-341`（标签、时间线、日历）。
- **方案**：`days` 走仓库已有的 `clampInt`；三处 LIKE 补 `escapeLike` + `ESCAPE`；公开列表补 `LIMIT`（评论/友链给上限，时间线/日历改聚合或分页）。
- **范围**：`stats.ts`、`posts.ts`、`comments.ts`、`public.ts`、`public-comments.ts`、`public-links.ts`。代价 **M**。
- **建议**：与 share 侧的 LIKE/分页条目同批，避免同一份 `escapeLike` 约定第三次漂移。

#### SEC-08 [P0][已修] `blog_posts.slug` 全局唯一，与「每用户一个博客」冲突且构成跨用户 oracle
- **问题**：`db/schema/tables.ts:371` 与 `migrations.ts:330` 都是 `slug TEXT NOT NULL UNIQUE`——SQLite 的列级 `UNIQUE` 生成的是 `sqlite_autoindex_*`，**无法用 `DROP INDEX` 去掉**，改唯一性必须重建表。所有 slug 查询也都不带 owner：`assertSlugFree()`（`posts.ts:210-216`）全局判重，`/check-slug`（`settings.ts:100-122`）全局查询并把「已被占用」回给任何登录用户。
- **影响**：① 用户 A 占用的 slug 用户 B 永远无法使用，且 B 能从错误信息推断出该 slug 属于别人（跨用户枚举 oracle）；② `note_id` 同为全局 `UNIQUE`，传他人的 noteId 并命中时会撞 UNIQUE 变成未映射的 500；③ 只要公开端按 owner 隔离（SEC-01）而 slug 仍全局唯一，就会出现「我的 slug 被别人的站占用」这种无法自解的状态。
- **方案**：① 新增 `db/schema/blog-posts.ts` 承载 `blog_posts` 的当前定义（`UNIQUE(user_id, slug)`，`note_id` 保持全局唯一——笔记 id 本身全局唯一，这是正确的）；② 基线 `tables.ts` 同步；③ 新增一条 rebuild 迁移，照 version 36（`board_library`）与 version 32（`MUSIC_LEGACY_REBUILD_STATEMENTS`）的既有范式：`ALTER TABLE blog_posts RENAME TO blog_posts_global_slug` → 建新表 → `INSERT … SELECT` → 重建索引 → `DROP TABLE`，并用 `skipIfColumnExists: { table:'blog_posts', column:'folder_id' }` 让全新实例跳过（基线已经是新形状）；④ 所有 slug 查询（`assertSlugFree`、`/check-slug`、`loadPublicPostBySlug`、`/note-post/:noteId`）带 `user_id`，`checks.ts` 与 `tests/schema-migrations.test.ts` 同步。
- **范围**：`db/schema/{tables,blog-posts,migrations,checks,indexes}.ts`、`posts.ts`、`settings.ts`、`public.ts`、`public-comments.ts`、`tests/schema-migrations.test.ts`。代价 **M**（DDL 部分 S，核验与测试 M）。
- **建议**：**单独一个提交**，且要求部署侧先备份——表重建不可逆，回滚只能从备份恢复；`check-migration-immutability` 与 schema 测试是这条的守卫。顺序上必须在 SEC-01 之后（per-user slug 需要 owner 身份），并与前台 `/u/<username>/` 路由同时上线，否则同一 slug 在旧 URL 上会歧义。

#### SEC-09 [P1][已修] 站点设置「写按用户、读全站」
- **问题**：`getBlogSettings(db, userId?)` 用 userId 是否存在决定键名（`settings.ts:38-39`），写入固定带 userId（`:64,88`），而公开侧 `public.ts:66`（`/site`）与 `public-comments.ts:61`（`requireCommentApproval`）都不传 → 永远读**没有任何写入方**的 `blog_settings_global`。
- **影响**：站点名/简介/社交链接/外观/每页条数对前台全部无效；最严重的是把「评论需审核」改成 `false` 后公开端点仍按默认 `true` 走（评论仍进 pending）。此外 `tests/blog-routes.test.ts` 里把这一错误行为当成了期望断言，需要一并订正。
- **方案**：删掉 `userId?` 的双键设计，统一为「一个 owner 一个键」（与 SEC-01 同源），公开侧按解析出的 owner 读；订正测试断言。
- **范围**：`settings.ts`、`public.ts`、`public-comments.ts`、`tests/blog-routes.test.ts`。代价 **M**。

#### SEC-10 [P2][本轮已修] 匿名可控的头像 URL 被管理端直接渲染；默认头像还走第三方
- **问题**：`public-comments.ts:69` 默认头像写死 `https://api.dicebear.com/7.x/micah/svg?seed=<authorName>`，且 `blogPublicCommentSchema.authorAvatar` 允许任意 ≤2048 字符的 URL；管理端 `blog-comments-view.tsx:290-305` 直接 `<img src={comment.authorAvatar}>`。
- **影响**：① 匿名访客提交一条评论即可让**管理员的浏览器**向任意外站发请求（IP/UA 泄露，可用于确认管理端何时被打开）；② dicebear 收到每条未审核评论的昵称（含中文个人昵称），是把第三方引入隐私链路的默认值；③ 若将来任何导出/邮件消费该字段，风险面扩大。
- **方案**：默认头像改本地生成（首字母 + `--bg-sunken` 底色，纯 CSS/内联 SVG，零外链）；`authorAvatar` 过 SEC-04 的 `isSafeExternalUrl`，非法值在服务端丢弃为 `null`；渲染端保留首字母降级。
- **范围**：`public-comments.ts`、`schemas.ts`、`blog-comments-view.tsx`、`src/shared/locales/*/blog-*.ts`（新增降级文案如需）。代价 **S**。

#### SEC-11 [P3][本轮已修] 鉴权链缺挂载级兜底，且 `loadSession` 双挂载
- **问题**：`blog/index.ts:16` 的 `blogManageRoutes.use('*', loadSession)` 与 `app.ts:116` 的 `app.use('/api/*', loadSession)` 重复，`/api/blog/*` 每请求跑两次会话查询/续期写；且不像 share 侧（`share/index.ts:18`）有 `requireAuth` 挂载级兜底——现在依赖每条路由自己记得写 `requireAuth`，漏一条即匿名可读。
- **方案**：去掉子应用的 `loadSession`，改为 `blogManageRoutes.use('*', requireAuth)`，逐路由的 `requireAuth` 随之删除。
- **范围**：`blog/index.ts` 与各 route 注册函数签名。代价 **S**。

#### SEC-12 [P2][已修] `getBlogSettings` JSON 解析失败静默回默认值
- **问题**：`settings.ts:44-52` 的 `catch { return DEFAULT_BLOG_SETTINGS }` 不记日志、不区分错误类型。存储被写坏时前台会静默显示默认站点信息，管理员无从知道自己的设置已失效——属 AGENTS 铁律 2 的「静默降级」。
- **方案**：catch 体加 `console.warn('[blog] blog settings JSON is unreadable; falling back to defaults', …)`（只记键名与错误类型，不记内容）。
- **范围**：`settings.ts`。代价 **XS**。

#### SEC-13 [P0][本轮已修] `is_self_referrer` 在写入时被硬编码为 0
- **问题**：`visits.ts:60-88` 的 INSERT 列清单含 `is_self_referrer`，而绑定列表对应位置是**字面量 `0`**（`:86`）。share 侧有完整实现可对照：`share/public.ts:288` 绑定 `referrerInfo.selfReferrer ? 1 : 0`，判定在 `:300-306` 的 `isSelfReferrer(candidateReferrer, requestHost, slug)`。
- **影响**：① 后台「排除自引荐」开关永久无效（`share-selection-sql.ts:175` 的 `is_self_referrer = 0` 条件永远成立）；② `filterStats.selfReferrals`（`stats.ts:276`）恒为 0；③ 仪表盘把该值显示成「0 次自引荐」，与 SEC-13 的服务端恒 0 叠成同一数字的两次谎报（客户端侧见 COR-03）。
- **方案**：把 `sanitizeVisitReferrer` 的返回扩展为「是否站内引荐」，blog 侧复用 share 的 `isSelfReferrer()` 并把真实值写入；补一条 worker 契约测试：带本站 referer 的请求落库 `is_self_referrer = 1`。
- **范围**：`routes/blog/visits.ts`、`lib/share-analytics.ts`（若需导出判定）、`tests/`。代价 **S**。

#### SEC-14 [P2][开放·本轮新发现] 流量过滤器有两份真值，且 store 那份不被任何查询消费
- **问题**：仪表盘用本地 `useState`（`use-blog-dashboard-view.ts:17-20`）驱动 `api.blog.analytics(range, { excludeBots })`；`blog-store` 里另一份 `excludeBots/excludeSelfReferrers/excludeOwner`（`index.ts:41-43`）只被 `blog-traffic-filter-popover` 与设置弹窗读写，而 `loadPosts()` / `loadStats()`（`filters.ts:44-58` 在 setFilters 后调用它们）**根本不把这三个值发给服务端**。
- **影响**：工具栏上的「真实访客」开关看起来在过滤，实际只改了 localStorage 与一处 UI 状态；开着 popover 改一次过滤，仪表盘没有任何变化，而 store 触发的两次请求纯属浪费。
- **方案**：二选一——① 删掉 store 里的那份与 popover 入口（铁律 5：死代码直接删）；② 让仪表盘读 store（单一真值）并把三个值透传给 `analytics()`，popover 与设置弹窗共用同一处。**建议 ②**，因为「真实访客」是产品的核心开关，用户期望它持久且全局生效。
- **范围**：`blog-store/{filters,types,state,index}.ts`、`blog-traffic-filter-popover.tsx`、`use-blog-dashboard-view.ts`、`blog-settings-modal`/`use-blog-settings-modal.ts`。代价 **S**。

#### SEC-15 [P3][本轮已修] 模块级读 localStorage + 在 `set` updater 内写 localStorage
- **问题**：`blog-store/state.ts:33` 的 `initialFilters = loadInitialFilters()` 在模块求值时读 localStorage（服务端渲染与测试环境都走一遍）；`filters.ts:44-58` 的 `persistTrafficFilters()` 写在 `set((state) => …)` 的 updater 内——updater 必须是纯函数，StrictMode 下双跑即双写。
- **方案**：改为惰性读取（首次 `setFilters`/订阅时）与「在 `set` 之外写副作用」；参考 `share-store` 若已有正解就照抄。
- **范围**：`blog-store/{state,filters}.ts`。代价 **XS**。

---

### 4.2 正确性与统计可信（COR）

#### COR-01 [P0][开放] `stats.ts` 在三处编造分析数据
- **问题**：
  - `stats.ts:297`：区间 PV 为 0 但存量 `views > 0` 时，访客数被编成 `Math.ceil(postStoredViews * 0.75)`——截图「独立访客 114」即 152×0.75 而来，而同一屏的「PV 0」「日均 0」是真实的区间值，三个数字口径互相矛盾。
  - `stats.ts:335-352` `fillFallbackDistributions()`：无样本时硬编码「中国 100%、Direct 100%、desktop 60%、macOS 50%、Chrome 60%」——截图「访客地域分布 中国 152 100%」即此。
  - `stats.ts:314`：单篇 `visitors` 无数据时编成 `Math.max(1, Math.round(views * 0.75))`。
  - 客户端放大一处：`blog-dashboard-view/index.tsx:196-212` 的 `analytics?.totalViews ?? stats?.totalViews` 把区间值兜底成全站累计，两种口径混显。
- **影响**：仪表盘的核心数字不可信，且是**静默降级**——用户无从知道看到的是编造值。这直接违反 AGENTS「不静默假设，不静默降级」。截图里「总访问量 0 / 独立访客 114 / 累计访问量 152 / 单篇 87 PV」四个数字互不相容，就是本条的可视化证据。
- **方案**：删除全部伪造分支；无样本返回 0 / 空数组；前端用 `KpiCard` 已有的 `unavailable` 文案（`components/dashboard-blocks.tsx:8-18` 已支持「未采集」）表达「本区间无数据」，而不是 `0`；`breakdown` 为空时渲染空态；`blogDisplayTotals` 去掉 `postStoredViews` 兜底，另以独立 KPI 标注「全站累计浏览」。
- **范围**：`stats.ts`、`blog-dashboard-view/*`、`components/dashboard-blocks.tsx`（如需要新文案）。代价 **M**。
- **建议**：与 COR-04 同批落地——只删伪造而不修计数，仪表盘会从「假数字」变成「永久 0」，用户体验上更糟。

#### COR-02 [P0][部分开放] `computeDelta` 在无基数时凭空报 +100%
- **问题**：`share-analytics.ts:321-325`：`previous === 0` 时返回 `current > 0 ? 100 : undefined`。首次有流量的区间会显示「+100%」，而不是「无可比基数」。（原文里的「`all` 区间落 1970」已修，见第三节。）
- **方案**：`previous === 0` 一律返回 `undefined`（前端不渲染 delta 徽标），或在 UI 上明确标注「无上期数据」。
- **范围**：`lib/share-analytics.ts` + blog/share 两侧看板的回归（共用层，必须双覆盖）。代价 **S**。

#### COR-03 [P0][开放] 仪表盘把「过滤掉的自引荐 / 作者自访」硬编码为 0
- **问题**：`blog-dashboard-view/index.tsx:108-129` 的 `BotsFilterBanner` 用 `t('share.filter_stats_summary', { bots: filteredBots, self: 0, owner: 0 })`——两个参数写死 0，而服务端 `filterStats` 已经回传了真实值（`stats.ts:270-281`），`use-blog-dashboard-view.ts` 只取了 `bots`。再叠加 SEC-13（服务端 self 恒 0），这条链路是双重谎报。
- **方案**：`use-blog-dashboard-view` 暴露完整 `filterStats`，banner 用真实三值；SEC-13 修完后 self 才有意义（两条必须同批或先后紧邻）。
- **范围**：`blog-dashboard-view/{index,use-blog-dashboard-view}.tsx`。代价 **XS**。

#### COR-04 [P0][开放] PV 恒 0 的根因链：前台 SSR 取数 + `isBot('')`
- **问题**：
  1. `share-analytics.ts:78-81` `isBot(ua)`：`if (!ua || ua.trim() === '') return true`——空 UA 即爬虫。
  2. `blog-frontend/src/pages/posts/[slug].astro:24-27` 明确注释「不转发客户端可控的 x-forwarded-for/user-agent/referer」，`api.getPostBySlug` 走服务端 fetch，**不带访客 UA**。
  3. `visits.ts:29-58` 因此把每次真实浏览落成 `is_bot = 1`；`visits.ts:92-101` 的返回值 `!params.isBot` 为 false，`public.ts` 不涨 `views`；而默认过滤 `is_bot = 0`（`share-selection-sql.ts:161`）又把明细全滤掉。
  4. `blog-frontend/src/lib/api.ts` 的 `requestJsonCached(...,300)` 还有 300 秒内存缓存，缓存命中时连一次上报都不会发生。
  5. 可选环境变量 `VISIT_FP_SECRET` 未配置时（AGENTS 记录为「可选」）不写指纹，去重窗口失效、独立访客无法统计。
- **影响**：PV 永远 0、UV 无法计算，统计功能整体失效——这正是 COR-01 伪造数据存在的动机，两条必须一起修。
- **方案**：转发头不是选项（`s-maxage` 缓存命中不回源仍会丢计数，且透传头让任何直连 API 者可伪造统计）。改为**浏览器侧上报**：文章页水合后向新增的公开端点 `POST /api/blog/public/visits` 发一次 beacon（`application/json`，字段仅 slug/referrer），服务端只读 CF 边缘注入的 `CF-Connecting-IP` / `cf-*` 头，配合「同源 + 每 (post, fingerprint) 在 30 分钟窗口内去重 + IP 维度限流」防伪造；服务端不再在 `/posts/:slug` 读取路径计数。同时删掉前台的 `FALLBACK_POSTS` 失败伪造（见第六节），失败就是失败。
- **范围**：`worker/routes/blog/{public,visits}.ts`、`blog-frontend/src/pages/posts/[slug].astro`、`blog-frontend/src/lib/api.ts`、`blog-frontend/src/lib/fallbacks.ts`。代价 **L**（跨两个 app，含防伪造与回归）。
- **建议**：这是批次 2 的枢轴项，单独提交；配套一条「beacon 落到 `is_bot=0` 且 `views` 递增」的 e2e 断言，以及一条「脚本直连端点不带 CF 头时被限流」的负向测试。

#### COR-05 [P1][开放] 仪表盘与侧栏同一指标两种口径并列显示
- **问题**：KPI 卡显示区间 PV（`analytics.totalViews`），侧栏页脚显示 `stats.totalViews`（全站累计），两处都叫「访问量」：截图里 0 与 152 同时出现在一屏。`stats.ts:295-299` 的 `blogDisplayTotals` 又把两者混进同一个 `views`。
- **方案**：彻底分开命名与口径——区间 KPI 标「本区间」，累计值标「全站累计」，`blogDisplayTotals` 只做区间计算；侧栏页脚与 KPI 共用同一个口径的文案前缀。
- **范围**：`stats.ts`、`blog-dashboard-view/index.tsx`、`blog-hub-sidebar/index.tsx`、`locales/*/blog-*.ts`。代价 **S**。

#### COR-06 [P1][开放] 流量过滤器双真值（同 SEC-14）
- 见 SEC-14。此处只登记「产品语义」结论：单一真值，且必须真的影响查询。

#### COR-07 [–][已修] 保留期「永久保留」被换算成 30 天
- **已修**，见第三节。保留在本表是为了让后续读者不再重复翻这条（AGENTS 要求修复状态可检索）。

#### COR-08 [P1][开放] 链接检测把「请求失败」判为失效，且缓存永不过期
- **问题**：`use-link-checker.ts:141-150`（批量循环的 catch）对整批每条 URL 写入 `level: 'broken'`；`:98-100`（单条检测的 catch）同病。`loadCachedResults`（`:158-167`）只读 `parsed.results`，**从不校验 `:170-176` 写入的 `timestamp`**——数月前的 broken 判定仍然生效。`link-checker-modal` 的「批量删除失效」直接消费这个值，`use-blog-links-view.ts:76-91` 的批量删除确认文案还复用了单条文案（`blog.confirm_delete_link`），数字与事实不符。
- **影响**：一次网络抖动即可把整批健康友链标成失效，用户点「批量删除失效」就真的删了；陈旧缓存让「上周的健康度」被当作实时显示。
- **方案**：新增 `level: 'error'`（网络/超时，不可删除）与 `'unknown'`（未检测）语义，`computeStats` 与过滤、批量删除只认 `broken`（服务端明确判定的 HTTP 状态）；缓存加 TTL（建议 24h）并在过期后标记「陈旧」而不是直接丢弃；批量删除确认文案改成带真实条数的专用 key。
- **范围**：`use-link-checker.ts`、`link-checker-modal.tsx`、`use-blog-links-view.ts`、`locales/*/blog-*.ts`、新增测试。代价 **M**。

---

### 4.3 失败语义与性能（ENG）

#### ENG-01 [P0][已修] store 无 error 态，失败被渲染成「暂无数据」；多处 mutation 静默吞错
- **问题**：`blog-store/loaders.ts:38-110` 的 7 个 loader 全部 `catch (err) { console.error(...) }`；`types.ts:50-51` 只有 `loading/batchBusy`。渲染侧把失败当空态：`blog-hub-modal.tsx:119-122`（列表）、`blog-comments-view.tsx:46-50`、`blog-links-view/index.tsx` 的空态、`use-blog-dashboard-view.ts:61-63`（analytics 失败无任何提示）。mutation 侧：`blog-store/actions.ts:128-139`（`updatePost` 乐观改后 `await patch` 无 try/catch）、`links.ts` 的分类 CRUD、`blog-table-view/row.tsx` 与 `card.tsx` 的 `void updatePost(...)`、`pending-comments-card.tsx:82,85` 的 `void updateCommentStatus(...)`——失败即未处理的 rejection，UI 原地不动。另有 `use-link-checker.ts` 的 `saveCachedResults` 在 catch 里 `return false` 却不告知调用方。
- **影响**：典型症状是「断网后打开博客中心，看到的是空列表而不是错误」，用户会以为数据丢了。违反 AGENTS 铁律 2 的三态要求。
- **方案**：store 增 `error: { scope, message } | null` 与 `lastFailedLoad`，各 loader 落错并保留上一次数据；新增共享的 `LoadState` 组件渲染「加载中 / 失败 + 重试 / 空结果」三态；全部 mutation 包 `try/catch`（乐观更新失败回滚 + `danger` toast，参照 `use-blog-post-card.tsx:60-66` 的既有正解）。
- **范围**：`blog-store/*`、四个视图组件、`components/`（若需新组件）。代价 **M**。
- **建议**：先写复现测试（mock `api` 抛错 → 断言渲染错误态而非空态），再实现。
- **落地（B3-01，`ddfd54e7` 三态 + mutation 部分）**：store 增 `loadErrors: Set<'posts'|'comments'|'links'|'stats'>`，四个 loader 落错且成功清位、失败刷新保留上次数据；新增 `blog-load-failure.tsx`（`role='status'` + 重试）接入文章列表、评论、友链与仪表盘（`stats` + analytics）。mutation 侧新增 `blog-store/mutation.ts`：失败统一 `console.error` + danger toast，乐观更新回滚（`updatePost` 只回滚那一行；批量按快照回滚 `posts`/`stats`）并以 `false`/`null` 返回；`content.ts` 的 folders/tags CRUD 不再静默返回 null；所有成功提示改为按返回值判断，`void updatePost(...)` 这类未处理 rejection 消失；友链检测器的批量删除失败时不再清空选择。复现测试为 `blog-store/mutation-failures.test.ts`（6 条，含回滚变异证明 1 failed / 5 passed）。限制：`use-blog-note-submenu.ts` 直连 `api` 的两处写入沿用其自有的 catch/toast，未并入。


#### ENG-02 [P0][已修] 文章列表回传全文且无分页
- **问题**：`posts.ts:55-68` 的列表 SQL 是 `SELECT p.*, (SELECT COUNT(*) FROM blog_comments …)`，**没有列白名单、没有 LIMIT**；`helpers.ts:8-27` 的 `toBlogPost` 带 `content`；`filterPostsByTag`（`posts.ts:100-110`）在取回全部含正文的行之后于 JS 里过滤 tag。
- **量级**（明示假设：100 篇 × 12 KB 正文）：单次请求 ≈ **1.2 MB raw / ~340 KB gzip**，而列表真正需要的字段约 0.5 KB/行 → **≈96% 的字节是死重**；服务端另做 100 次相关子查询 COUNT + 100 次 `JSON.parse(tags)`。
- **方案**：列表 SQL 显式列白名单（去掉 `content`，`excerpt` 保留）→ 新增 `BlogPostSummary` 类型；`LIMIT/OFFSET`（或 keyset 分页）+ 总数走一条独立 `COUNT(*)`；tag 用 `EXISTS` / `LIKE` 下推（`public.ts` 已有 `blogTagNeedles()` 的正解可复用）。前端表格/网格补分页控件（当前无任何分页 UI）。
- **范围**：`posts.ts`、`helpers.ts`、`shared/types/blog.ts`、`blog-store/loaders.ts`、`blog-table-view`、`blog-grid-view`、demo backend 的对应实现。代价 **M**。
- **建议**：这是 ENG-04/ENG-05 的前置（列表变小以后，每次搜索的成本才可控）。
- **落地（B3-02）**：列表 SQL 改显式列白名单（`POST_LIST_COLUMNS` 去 `content`），`LIMIT/OFFSET`（页 ≥1，limit 1–200，默认 50）与独立 `COUNT(*)` 同用一段 `blogPostsWhere()`（分页与总数不可能是两套筛选）；tag 过滤下推 SQL——新增 `tag-needles.ts` 抽出 `blogTagNeedles`/`blogTagFilterSql`，公开端一并复用，原 `filterPostsByTag`（取回全文后 JS 过滤）删除。响应变为 `{ posts, pagination }`。新增 `GET /post-index`：全量、无正文的索引，供记事列表徽标与发布弹窗回填（这两问对不在当前页的记事也必须有一致答案，故刻意不分页）；侧栏挂载从「预取 `posts` 全量」改为预取该索引。前端补分页控件 `blog-post-pager.tsx`（>1 页才出现），store 持有 `postsPage/postsTotal/postsTotalPages`，筛选改变回第一页，当前页被删空自动退到最后一页。演示后端同步。复现测试：worker 4 条 + 客户端 store 4 条 + 分页控件 2 条；tag 短路与 offset 写死两处变异各实测 1 failed。

#### ENG-03 [P0][已修] `GET /api/blog/links` 忽略客户端发来的全部筛选参数
- **问题**：`links.ts:44-48` 的 handler 只取 `userId`，完全不读 `status/categoryId/search`；`:56-60` 无 `LIMIT`；`:64-79` 在 JS 里数 counts。客户端确实发了这些参数（`blog-store/links.ts` 与 `src/client/lib/api/share.ts` 的 blog 段），拿回全量后 `use-blog-links-view.ts:17-20` 再本地过滤一遍。
- **量级**（假设 300 条）：≈105 KB raw/次；搜索框输入 8 个字符 = 8 次 ≈840 KB，且每次都是全表取回。
- **方案**：服务端实现筛选 + `LIMIT`（推荐），并把 counts 改成一条 `GROUP BY status`；客户端的本地二次过滤随之删除（避免两份过滤逻辑漂移）。
- **范围**：`links.ts`、`blog-store/{links,loaders}.ts`、`use-blog-links-view.ts`、demo backend。代价 **S～M**。
- **落地（B3-03，60b83bcb）**：查询构建器拆到 `link-list-query.ts`（同 `post-list-query.ts` 先例）：两个标记页签 `pinned`/`favorite` 也从服务端筛，计数是一段**不带 status 条件**的 `GROUP BY status`（切页签时徽标不缩水，category/search 仍生效），`BlogLinkStats` 随之增 `pinned`/`favorite`。列表 `LIMIT 500`，超出不再静默：客户端按「徽标数 > 返回行数」在列表顶部提示「只显示前 N 条」。未知 `status` 回 400 而不是当 `all`。本地 `filterLinks` 与客户端兜底计数删除；`loadLinks` 另补 `AbortSignal` + 序号线（服务端筛选后迟到的答案必须丢弃，这是本地过滤不再兜底后的必要条件）。demo backend 本无 `/api/blog/links`，无需同步。

#### ENG-04 [P0][已修] 搜索无防抖、无 abort、无乱序守卫
- **问题**：`blog-hub-toolbar.tsx` 的 `SearchBox` 每次 `onChange` 直接 `setSearch` → `blog-store/filters.ts:25-33` 的 `applyPostFilter` 立即 `void get().loadPosts()` → `loaders.ts:34-53` 调用 API **未传 signal**（`transport` 已支持 `AbortSignal`）。全目录 `grep useDeferredValue` 为 0。
- **量级**（现状假设 100 篇 × 12 KB）：输入 13 个字符 = 13 次全量请求 ≈ **15 MB raw / 4.3 MB gzip** 下行 + 13 次全表扫；无序号守卫 → 后发先至时结果与输入框不一致。
- **方案**：输入防抖（250～300ms）+ `AbortController`（新一轮取消上一轮）+ 序号线（只接受最新一次的结果）；仓库正解可照抄 `features/graph/graph-panel/index.tsx`。`/check-slug` 的防抖已有但同样缺 abort 与最新守卫（`use-blog-publish-form.ts:220-240`），一并修。
- **范围**：`blog-store/{filters,loaders}.ts`、`blog-hub-toolbar.tsx`、`use-blog-publish-form.ts`、`src/client/lib/api` 的 blog 段。代价 **S**。
- **落地（B3-04，1ea6a399）**：搜索框改本地 draft + 250ms 防抖；`loadPosts` 带 `AbortController` 与 `postsRequestSeq`（被替换的请求取消、迟到答案丢弃、取消不算错误）；`/check-slug` 同步收 `AbortSignal` 并忽略迟到结果。

#### ENG-05 [P0][已修] 打开博客中心 = 11 个 HTTP / ~22 条 D1，且开窗期间可能反复重跑
- **问题**：`blog-store/loaders.ts:19-28` 的 `loadAll` 八连发（stats/posts/folders/tags/categories/comments/links/settings）；`use-blog-hub-modal.ts:98-111` 的复位 effect 依赖含 **`activeNote` 对象身份**，打开期间任何笔记变更都会再触发一次 8 并发；`use-blog-hub-sidebar.tsx:111-114` 的挂载 effect 又各发一次 `loadFolders/loadTags`（与 `loadAll` 重叠）；默认 tab 是 dashboard，`use-blog-dashboard-view.ts:32-34` 再发一次 analytics。两条串行链（stats 8 段、analytics 6 段）各 ≈120～160ms 纯 DB。
- **方案**：`loadAll` 收敛为「当前 tab 所需的最小集合」+ 30 秒 stale-while-revalidate 窗口（带 `fetchedAt` 时间戳）；删掉侧栏的重复 effect；复位 effect 的依赖改为 `open`/`initialNoteId`（`activeNote` 只用于取初值，不进依赖）。
- **范围**：`blog-store/loaders.ts`、`use-blog-hub-modal.ts`、`use-blog-hub-sidebar.tsx`。代价 **M**。
- **落地（B3-05）**：`loadAll` 改名 `loadHubData({ force? })`；`dataLoadedAt` 为九个作用域各记一枚成功时间戳，`BLOG_TAB_SCOPES` 给出每 tab 的最小集（公共 `folders/tags/categories/settings/stats` + 各自的内容），30s 窗口内不重问、显式刷新走 `force`；`setActiveTab` 本身触发按新 tab 补齐；打开/复位 effect 不再依赖 `activeNote`（拆出只做 `setTargetNoteId` 的第二个 effect），`onSaved` 走非强制刷新；侧栏删掉与 bootstrap 重叠的 folders/tags effect。仪表盘的 `posts.length` 在 B3-02 后不再等于总数，改为 `stats.totalPosts`（dashboard 作用域随之不含 `posts`）。复现测试 `blog-store/hub-data.test.ts` 3 条；作用域选择突变成全量后 links tab 用例 1 failed。

#### ENG-06 [P1][已修] 评论列表无 LIMIT；服务端 search 是死通道；tab 计数口径失真
- **问题**：`comments.ts:40-45` 的 `SELECT c.*, p.title, p.slug` 无 `LIMIT`，且带 `ip`/`user_agent` 文本列；`:59-63` 支持 `search` 而前端从不传——`setCommentSearch` 在 `blog-store/types.ts:66` 与 `filters.ts:18` 有定义，**全仓零调用点**（`grep` 确认），`loaders.ts:87` 的 `search` 永远是 `undefined`。而 `use-blog-comments-view.ts` 用自己的 `useState` + 本地 `filterComments`，tab 计数在**服务端已按 status 过滤**的数组上统计（`computeStatusCounts(comments)`）→ 选「待处理」后其它 tab 全显示 0。
- **方案**：评论列表加 `LIMIT`（+ 分页或「加载更多」）；搜索二选一并做到一致——**接服务端**（带防抖与 abort）并删掉本地过滤，或删掉 `setCommentSearch` 这条死通道；tab 计数改用 `stats.pendingComments/totalComments`（服务端已有，勿在过滤后的数组上数）。
- **范围**：`comments.ts`、`blog-store/*`、`use-blog-comments-view.ts`、`blog-comments-view.tsx`。代价 **S～M**。
- **落地（B3-06）**：列表加 `LIMIT 500`；计数改为接口内一条 `GROUP BY status`（与列表共用 `blogCommentsWhere()`，不带 status 条件、保留 search/postId），响应增 `counts`——比用 `stats` 更完整（stats 只有 total/pending，而界面有五个页签）；搜索真的接通：`setCommentSearch` 进 store，本地 draft + 250ms 防抖，`loadComments` 带 AbortSignal + 序号线，本地 `filterComments`/`computeStatusCounts` 删除；截断时顶部提示「只显示前 N 条」；侧栏评论徽标改读 `commentStats`。复现测试：worker 2 条（计数真实且搜索上下生效、501 只回 500 而计数 501）+ 客户端 `comments-request.test.ts` 3 条；两处先红变异各 1 failed。演示后端同步。

#### ENG-07 [P1][已修] `stats` 做七条串行查询 + 全表扫 + JS 端 `JSON.parse`
- **问题**：`stats.ts:48-62`：`:49-55` 是 7 个串行 `await`，`:57-60` 无 `LIMIT` 扫全 `blog_posts` 取 `folder_id/is_published/tags`，`:62` 在 JS 里汇总；`organizer.ts:56-65` 又扫一遍同样的数据。每次开窗、每次 pin 都触发两轮全表扫。
- **方案**：7 条计数合成 `db.batch`（并发）或 2～3 条 `GROUP BY`；tags 计数用 SQL（`json_each` 或一次取回后在一次遍历里同时算 folder/tag，去掉重复的全表扫）。
- **范围**：`stats.ts`、`organizer.ts`。代价 **M**。
- **落地（B3-07）**：`loadBlogStats` 改为一个 `db.batch` 五条聚合：文章总览一条（total/published/pinned/`SUM(views)`）、评论一条（total/pending）、分类一条、`GROUP BY folder_id` 一条、`json_each` 按标签分组一条（均带 published 拆分）；后两条落在新模块 `post-counts.ts`，`organizer.ts` 的 `GET /tags` 复用同一条标签计数，不再自己扫一遍 `SELECT tags FROM blog_posts`。损坏的 tags 行由嵌套 `CASE`（`json_valid` → `json_type = 'array'`，同 `share-selection-sql.ts` 的守卫）跳过而不是 500；trim/空成员/非字符串成员与旧 JS 累加器逐条一致。复现测试：`tests/blog-routes.test.ts` 两条（一次 batch/direct 往返数为 0 且不复现“取行”语句、损坏 tags 不影响其余计数），实现前 1 failed；`/tags` 的“不再取行”断言同样先红。

#### ENG-08 [P1][已修] analytics 六段串行；非 `all` 区间把明细行整片读进内存
- **问题**：`loadBlogAnalyticsPayload`（`stats.ts:227-268`）按 `posts → aggregate → prevStats → filterStats → topPosts → recentVisits` 六段串行；`visitAggregateStatements`（`visit-aggregates.ts:154-168`）在 `range !== 'all'` 时返回**一条取出所有明细行**（含 `country/referrer_host/device_type/os/browser`）的语句，由 Worker 在内存里分桶与聚合——`all` 反而走了 `GROUP BY`（正确方向）。
- **量级**：1 万 visits ≈1.5 MB 进 Worker 内存（128 MB 上限下属高风险），且 range 连切三次会并发放大。
- **方案**：把分桶与分布都改成 SQL 聚合（`GROUP BY bucket` / `GROUP BY country` …），与 `all` 分支统一；`prevStats`/`filterStats` 并入同一次 `db.batch`；前端 range 切换加 abort。
- **范围**：`lib/visit-aggregates.ts`、`routes/blog/stats.ts`、`use-blog-dashboard-view.ts`。代价 **M**。
- **建议**：与 share 侧共用 `visit-aggregates.ts`，改动需双覆盖回归。
- **落地（B3-07）**：`visitAggregateStatements` 对任何区间都返回同一组 8 条 SQL 聚合（总量、时间桶、五个分布、per-target），旧的「有界区间取明细行 + `aggregateFromRows` 内存分桶」分支删除；`visitAggregateFromResults` 同步去分支，`aggregateFromRows` 只留作对照实现（`tests/visit-aggregates.test.ts` 的自取行参考路径继续逐值对拍，含新增的有界区间等价用例）。`loadBlogAnalyticsPayload` 把 summary、上一窗口、过滤器计数、最近访问与 8 条聚合合并为一次 `db.batch`（只有 top-post 标题需第二跳），往返数计数测试钉住 batch=1、direct=1；仪表盘切区间时 abort 在飞请求（`api.blog.analytics` 收 signal），旧区间迟到不再覆盖新图。share 侧双覆盖已随 `tests/share-routes.test.ts` 189 条回归。

#### ENG-09 [P1][已修] 写操作后的全量重拉放大 3～12 倍，且乐观更新失败无回滚
- **问题**：`blog-store/actions.ts:128-139` 的 `updatePost` 先 `set` 乐观改 → `await api…patch` **无 try/catch** → `Promise.all([loadPosts, loadStats, loadTags])`。一次 pin 切换 = 1 PATCH + 全表 posts + stats(8 条 D1) + tags(全表扫) ≈ **4 请求 / 11 条 D1 / ~1.4 MB 下行**，实际变更 1 bit。一次发布保存 = create + 3 loader + `onSaved → loadAll`(8 loader) ≈ **12 请求 / ~2.6 MB**。
- **方案**：`try/catch` + 快照回滚 + toast；按变更内容定向失效（pin/title 不需要 stats 与 tags；`onSaved` 改为定向刷新当前 tab）；把「全量重拉」限制为结构性变更（增删文章/分类）。
- **范围**：`blog-store/actions.ts`、`blog-store/links.ts`、`use-blog-hub-modal.ts`。代价 **M**。
- **落地（B3-01 `7188ae3a` + B3-08）**：失败语义在 B3-01 完成（全部 mutation 包 `try/catch`、乐观更新失败快照回滚、`danger` toast，`void updatePost(...)` 不再产生未处理 rejection）。定向失效在 B3-08：`updatePost` 的列表与记事索引永远重读（每一列都可能出现在那里），stats/tags/categories 只在 patch 触及对应聚合时才问——`isPinned`/`isPublished`/`folderId` → stats，`tags` → stats + tags，`categoryId` → categories；标题类 patch 只重读两者。`batchPosts` 按 action 定：`setCategory` → categories、`delete` → stats + tags、其余 → stats。`deletePost` 顺带补上 tags 重读（删掉某标签的最后一篇后 `stats.tagCounts` 不再提它，侧栏会回落到标签列表里过期的 `postsCount`）。`onSaved` 自 ENG-05 起已走非强制 `loadHubData()`，只补当前 tab 且超 30 秒窗口的作用域，而 mutation 自己已盖章，所以它通常什么都不问。
  - **订正**：本条写「pin/title 不需要 stats 与 tags」——**pin 需要 stats**：侧栏「已置顶」计数取 `stats.pinnedPosts`（`blog-hub-sidebar/use-blog-hub-sidebar.tsx:244`），pin 确实移动一个计数。真正省下的是每次 patch 都跑的 `GET /tags`（JSON 全扫，B3-07 后仍是这一条最重）与本来就不该问的 categories。
  - 复现测试 `blog-store/targeted-refresh.test.ts` 10 条；实现前 **7 failed / 2 passed**，作用域变异后 **4 failed**。

#### ENG-10 [P1][已修] 友链批量删除退化为 N 次单删 + N 次全表重拉
- **问题**：`use-blog-links-view.ts:76-91` 的 `handleBatchDeleteLinks` 是 `for (const id of ids) await store.deleteLink(id)`，而 `blog-store/links.ts` 的每个 mutation 都 `await loadLinks()`。服务端已有 `batch` 端点且用单条 `db.batch` 实现（`links.ts:287-302`）。
- **量级**：删 20 条 = `20 × (DELETE + 全量 loadLinks)` = **40 请求 / ~2.1 MB**。
- **方案**：改走 `batch('delete', ids)` + 一次重拉；`handleBatch` 已经走对了，两处保持一致。
- **范围**：`use-blog-links-view.ts`、`blog-store/links.ts`。代价 **S**。
- **落地（B3-08）**：store 新增 `batchDeleteLinks(ids)`（一次 `links.batch('delete', ids)` + 一次 `loadLinks`），检测器的 `handleBatchDeleteLinks` 改调它：删 20 条从 20 次 DELETE + 20 次全量重拉（≈40 请求）降到 2 个请求。选择集仍由调用方在成功后才清空（失败保留选择的行为不变），store 的 `batchBusy` 防重复提交。复现测试 2 条（单请求 + 失败不重拉），实现前因 store 无此 action 而 `TypeError`（红）。

#### ENG-11 [P1][开放] barrel 让 lazy 失效，`lucide` 全量 registry 被拖进主路径
- **问题**：`features/blog/index.ts` 是 4 条 `export *`，而 `features/sidebar/sidebar.tsx:22`、`features/list/note-list/note-row-items.tsx:23` 从该 barrel 静态 import → `app-shell.tsx:31` 的 `lazy(() => import('../blog'))` 形同虚设。`link-icon-selector.tsx:2,30`（`import { icons }` + `Object.keys(allIcons)`）与 `link-dynamic-icon.tsx:3` 把 lucide 的完整图标映射表（前轮实测 1,755 个绑定）拉进 blog chunk；`link-qr-modal.tsx:3` 的 `qrcode.react` 同样随静态链进入。
- **方案**：barrel 拆成「瘦入口（store + note submenu）」与「hub 专用入口」，让 shell 只引瘦入口（仓库有 `check-deep-imports.mjs` 的白名单机制可承载）；图标改 `lucide-react/dynamic` 或自建 name→动态 import 表，仅在图标选择器打开时加载；qrcode 懒载（`check-vendor-isolation.mjs` 是同类守卫的范式）。`audience-cards.tsx:5` 从 `../../share` 的 barrel 只要两个纯函数却把 share 的模态一起拖入（`B2-22`），把 geo/device 纯函数下沉到 `src/client/lib/`。
- **范围**：`features/blog/index.ts`、`features/sidebar/sidebar.tsx`、`features/list/note-list/note-row-items.tsx`、`blog-links-view/{link-icon-selector,link-dynamic-icon,link-qr-modal}.tsx`、`blog-dashboard-view/audience-cards.tsx`。代价 **M～L**（需构建产物前后对比）。
- **建议**：用 `npm run size:check` + `budget:check` 做前后对比作为验收证据。

#### ENG-12 [P1][开放] 列表渲染零优化：未 memo、每行重建菜单、无虚拟化
- **问题**：`blog-grid-view/card.tsx`、`blog-comments-view.tsx`、`blog-links-view/link-card-row.tsx` 均无 `memo`（`grep` 确认）；`blog-comments-view.tsx:52` 每行 `bundle={commentCardBundle(view, comment)}` 新建对象；`use-blog-post-card.tsx:49-56` 每次渲染无条件构造 `folderMenuItems`（O(帖子 × 文件夹)）与 `contextMenuItems` 两份 MenuItem 数组；`blog-table-view/index.tsx:25-26` 每渲染新建两个 Map；`use-blog-hub-sidebar.tsx` 的 `getTagNodeCounts` 对每个标签节点递归求和（无 memo 时 O(T²)），`:215` 用 `comments.filter().length` 而 `stats.pendingComments` 已存在；`blog-store/index.ts:64-69` 的模块级 subscribe 每次 `set` 都重建一个 Set。
- **量级**（假设 100 行 × 11 文件夹）：每渲染 ≈2,900 个 JSX 对象 + 200 个 `<Menu>` 实例；搜索每击键 ≈200 次 React 提交。
- **方案**：`memo` + `useCallback`/`useMemo`；Map 与菜单项提 `useMemo`，菜单项延迟到打开时构造；长列表接窗口化（仓库有 `features/list/note-list/render-window.tsx` 可复用）；store 的 subscribe 加键过滤并在无变化时跳过。
- **范围**：四个视图 + `use-blog-post-card.tsx` + `use-blog-hub-sidebar.tsx` + `blog-store/index.ts`。代价 **M**。

#### ENG-13 [P1][已修] 封面/头像图片无懒加载、无宽高
- **问题**：`blog-grid-view/cover-image.tsx:35-39` 的 `<img>` 无 `loading`/`decoding`/宽高，`blog-comments-view.tsx:296-302` 的头像同病；表格行用 36px 的框加载原图。
- **量级**（假设 30 张有封面的卡片，原图 1200×630 ≈200～400 KB）：≈**6～12 MB** 未延迟下载，且无 `width/height` 导致 CLS。
- **方案**：补 `loading='lazy' decoding='async'` 与宽高（或 `aspect-ratio`）；表格缩略图走尺寸变体（若部署有 `/cdn-cgi/image/`）或至少限制请求尺寸。仓库正解可照抄 `link-dynamic-icon.tsx:56-64`。
- **范围**：`cover-image.tsx`、`blog-comments-view.tsx`。代价 **S**。
- **落地（B3-09）**：`PostCoverImage` 与评论头像补 `loading='lazy'` + `decoding='async'`，评论头像另补 `width/height=32`。封面没有再加 `width/height`：调用方的容器本来就各自固定了盒尺寸（网格 `h-36 w-full`、表格 `size-9`），写死的属性反而会与真实图片比例冲突。表格 36px 缩略图仍取原图字节——全仓无 `/cdn-cgi/image/`，部署未配置 Cloudflare Image Resizing，尺寸变体属部署侧能力，不在本批。复现测试 `blog-grid-view/cover-image.test.ts` 2 条（懒加载/异步解码属性存在、不可渲染地址画占位符而不发请求）。

#### ENG-14 [P1][已修] 索引与实际 `ORDER BY` / `WHERE` 错配，且缺两条
- **问题**：① 友链主列表排序是 `is_pinned DESC, pinned_order ASC, sort_order ASC, created_at DESC`（`links.ts:56-60`），而现有索引 `idx_blog_links_user(user_id, status, is_pinned DESC, sort_order ASC, created_at ASC)` 的 `status` 卡在中间且方向不符 → 无索引可覆盖，每次全排序；② 评论查询 `WHERE p.user_id` + `ORDER BY c.created_at DESC` 命中 `idx_blog_comments_status(status, created_at DESC)`（该索引无 `user_id` 前缀）→ 扫全用户同状态行；③ 缺 `(user_id, is_pinned)`（`posts` 排序含 `is_pinned DESC`）与 `(user_id, views)`（`/stats` 与 top posts 都按 views 排序）。
- **方案**：新增 `idx_blog_links_user_order`、`idx_blog_posts_user_pinned`、`idx_blog_posts_user_views`；评论加 `user_id` 属表结构级改动（`blog_comments` 无 `user_id` 列），建议单开一项评估是否需要反范式化，不在本批夹带。
- **范围**：`db/schema/indexes.ts` + 一条迁移 + `checks.ts`。代价 **S**（索引）/ **M**（评论）。
- **落地（B3-07）**：新增 `idx_blog_posts_user_pinned (user_id, is_pinned DESC, published_at DESC)`、`idx_blog_posts_user_views (user_id, views DESC)`、`idx_blog_links_user_order (user_id, is_pinned DESC, pinned_order ASC, sort_order ASC, created_at DESC)`。两条 posts 索引放在新常量 `BLOG_POSTS_ORDER_INDEX_STATEMENTS`（不进 `BLOG_POSTS_INDEX_STATEMENTS`，避免改变已应用的迁移 52 的语句集），连 links 那条一起由 `BLOG_ORDER_INDEX_STATEMENTS` 同时供给 schema 路径与追加的迁移 **53**；`REQUIRED_INDEXES` 加名，由 `tests/schema-migrations.test.ts` 的收敛用例守住「fresh 库」与「已有库补迁移」两条路径。评论索引的 `user_id` 前缀仍未做（`blog_comments` 无该列，表结构级改动），建议单开一项评估。

#### ENG-15 [P1][已修] link checker：批次未用满、停止不中断在飞请求、缓存无 TTL、updater 不纯
- **问题**：`use-link-checker.ts:13` `BATCH_SIZE = 8`，而服务端 `blogLinkCheckSchema` 允许 15（`schemas.ts:182`）→ 100 条要 13 批而非 7 批；`stopRequested`（`RunCheckerLoop:120`）只在批间检查，不传给 `fetch`，进行中的一批无法取消；缓存只写 `timestamp` 从不校验（见 COR-08）；`saveCachedResults` 在 `setResults` 的 updater 内调用（`:136,147`）——updater 必须纯，StrictMode 下双写；进度条无 `role="progressbar"`（`grep` 确认 `link-checker-modal.tsx` 无该 role）。
- **方案**：批次改 15；接入 `AbortController`（停止即 abort 在飞的 fetch）；缓存加 24h TTL；把写缓存移出 updater（在 `set` 之后或 `useEffect` 里）；进度条补 `role="progressbar"` + `aria-valuenow/min/max`。
- **范围**：`use-link-checker.ts`、`link-checker-modal.tsx`。代价 **S～M**。
- **落地（B3-09）**：批次改 15（服务端 `blogLinkCheckSchema` 的上限，35 条从 5 次调用降到 3 次）；一次运行持一个 `AbortController`，停止即 abort 在飞请求，循环的 catch 先判 `signal.aborted || stopRequested.current` 再决定是否写 `error`——被停止的批次保留 `checking` 标记，不产生没人测过的结论；`api.blog.links.check` 增可选 `AbortSignal`。缓存写入移出 `setResults` 的 updater：新增 `applyResults`（先算 next、同步写进 ref、再 `setResults` + `saveCachedResults`），updater 回到纯函数，StrictMode 不再双写，同时让顺序批次能看到上一批刚写的值（这是缓存写入搬出去后的必要条件）。进度条补 `role='progressbar'` + `aria-valuemin/max/now` 与可访问名（新 key `blog.link_check_progress`，双语）。TTL 已在 B2-05 落地（`CACHE_TTL_MS` + `isCacheStale` + 陈旧提示，按计划刻意不丢弃旧结果）。复现测试 `link-checker-run.test.ts` 3 条：批次 15/15/5、停止即 abort 且该批不写 verdict、未停止的失败批次仍记 `error`；两处变异（`BATCH_SIZE` 回 8、去掉 abort 分支）各实测 1 failed。

#### ENG-16 [P2][已修] 发布弹窗每次会话多拉 2～3 次分类
- **问题**：`use-blog-publish-form.ts:48-51`——`peekContent` 在 `if (open && noteId && !content)` 内（正确），而 `void loadCategories()` 在其**之后无条件**执行，且 deps 含 `content` → 挂载时（`open=false`）一次、`open→true` 再一次、`content` 变非空又一次。
- **方案**：把 `loadCategories()` 移进 `if (!open) return` 之后，并从 deps 去掉 `content`。**两行**。
- **落地（B3-06）**：取数 effect 抽成 `usePublishDialogData(open, noteId, loadCategories)`：`if (!open) return` 后先按 `useNotes.getState().contents[noteId]` 判一次 `peekContent`、再 `loadCategories()`，deps 只有 `[open, noteId, loadCategories]`（去掉 `content`）。抽成函数同时为 `size:check` 的 50 行门槛让位。
- **范围**：`use-blog-publish-form.ts`。代价 **XS**。

---

### 4.4 UI / 交互 / 可访问性 / 规范（UI）

#### UI-01 [P1][开放] `text-white` 与裸调色板绕过令牌，深色主题下 AA 可能不达标
- **问题**：`--accent-contrast` 随主题翻转，深色下 `--accent` 是 L≈72-80% 的亮色，写死 `text-white` 等于亮色底叠白字。清单（`grep` 实测，本模块共 13 处 `text-white` 与 12 处裸调色板）：
  - `text-white`：`blog-hub-sidebar/index.tsx:88`、`blog-categories-modal.tsx:218`、`top-posts-card.tsx:47`、`blog-links-view/index.tsx:410,419,421`、`link-icon-selector.tsx:84,93,145`、`blog-grid-view/card.tsx:154,158`、`blog-comments-view.tsx:166`。
  - 裸调色板：`link-context-menu.tsx:172`、`link-card-row.tsx:118,220`、`link-checker-modal.tsx:152,344`、`blog-comments-view.tsx:326,328,330,332`（其中两处还带 `dark:` 变体——本项目按 `data-theme` 切主题，Tailwind v4 的 `dark:` 走 `prefers-color-scheme`，在「深色主题 + 浅色系统偏好」下整体失效）、`blog-comments-view.tsx:164` `bg-black/20`、`link-qr-modal.tsx:47` `bg-white`（QR 底板，需保留但应走具名常量）。
- **影响**：深色主题下若干状态徽标与「accent 底 + 白字」组合的对比度不达标（AGENTS 可访问性红线）。`scripts/check-hardcoded.palette-baseline.json` 已按文件记了这些计数，只允许下调。
- **方案**：`text-white` → `text-[var(--accent-contrast)]`；状态色收敛到共享 `Badge` 组件（`link-card-row.tsx:245-253` 已是正解）；语义色补 `--success-on/--danger-on`；QR 底板的白色提为具名常量；`--update-baseline` 更新 palette baseline 并跑 `npm run contrast:check` 实测两套主题。
- **范围**：上述 14 个文件 + `src/client/styles/tokens.css`（如需新令牌）。代价 **S**。
- **建议**：与 share 侧同型问题（SH-32）同批，避免同一份令牌约定再分叉。

#### UI-02 [P1][开放] 四处日期格式化未传 locale
- **问题**：`pending-comments-card.tsx:75`、`blog-grid-view/card.tsx:196`、`blog-comments-view.tsx:280`、`blog-table-view/row.tsx:69` 用裸 `toLocaleDateString()/toLocaleString()`，同模块其余位置已用 `useLocale()`/`formatDate`。另外 `row.tsx:69` 渲染的是 `publishedAt` 而表头写「创建时间」`blog.col_created_at`。
- **影响**：中文/英文界面下日期格式随浏览器而非应用语言变化；表头与数据语义不符。AGENTS 要求日期按 locale 格式化。
- **方案**：统一走 `lib/time` 的 `formatDate`/`relativeTime` + `useLocale()`；表头文案改为「发布时间」或改渲染 `createdAt`（二选一，建议前者，与排序口径一致）。
- **范围**：四处 + `locales/*/blog-*.ts`。代价 **S**。

#### UI-03 [P2][开放] 硬编码 UI 文案（i18n 门禁的盲区）
- **问题**：`top-posts-card.tsx:20` `{'TOP 10'}`、`:56` `{'PV'}`、`visit-logs-card.tsx:61` `🤖 {visit.botName || 'Bot'}`、`:68` `{visit.browser || 'Other'} / {visit.os || 'other'}`、`use-blog-settings-modal.ts:167` `'Inkstone Blog'`、`blog-hub-sidebar` 的树前缀。`scripts/check-i18n.mjs` 只拦中文字面量，英文硬编码是盲区（前轮 P2-3 已指出）。
- **方案**：全部改 message id 并补 en-US/zh-CN 两份资源；把 `'Bot'/'Other'/'other'` 这类服务端语义值改由服务端返回本地化 key 或前端映射表。
- **范围**：4 个组件 + `use-blog-settings-modal.ts` + 两份 locales。代价 **S**。
- **建议**：可选增强——给 `check-i18n.mjs` 加一条「JSX 文本节点中的裸英文短语」词表，把这类回归变成门禁。属独立改动，勿夹带。

#### UI-04 [P1][开放] 表单可访问性缺口
- **问题**：`blog-publish-modal/index.tsx:15-19` 自造 `FieldLabel`（`<label>` 无 `htmlFor`，全模块 7 处），slug 的错误提示未通过 `aria-describedby` 关联（`:56-70`）；`use-blog-publish-form.ts:272-276` 保存时不检查 `slugAvailable === false`（校验为「不可用」仍可提交，失败在服务端）；`blog-settings-modal.tsx:330-338` 是裸 `<input type="number">`（绕开组件体系）；`Switch` 在 `:160,339` 等 4 处无 label 关联。
- **方案**：迁移到 `components/form` 的 `Field`（`:370-400` 已自动 wire `htmlFor`/`aria-describedby`/错误态）；`Switch` 补 `label`/`aria-labelledby`；`number` 输入改用组件；保存前阻断不可用 slug 并给出原因。
- **范围**：`blog-publish-modal/*`、`blog-settings-modal.tsx`、`blog-categories-modal.tsx`。代价 **M**。

#### UI-05 [P1][开放] 五套手搓分段控件，零 `aria-pressed` / `role`
- **问题**：`blog-hub-toolbar.tsx:24-36`（状态 tab）与 `:112-125`（视图切换）、`blog-comments-view.tsx:146-166`、`blog-links-view/index.tsx:404-428`、`link-checker-modal.tsx:148-165` 都是 `<button>` + 类名模拟选中态，没有 `aria-pressed`/`role="tab"`/`aria-selected`；`components/form` 的 `Segmented`（`:155-231`）已经带 radio 语义与方向键。
- **方案**：全部收敛到 `Segmented`（视图切换用 `Segmented` 的紧凑变体）；确实需要「多选筛选」的地方补 `aria-pressed`。
- **范围**：5 个文件 + 可能给 `form.tsx` 加一个紧凑尺寸。代价 **M**。

#### UI-06 [P1][开放] 仅双击可开编辑；表头语义错位；store 有 `sort` 却无排序 UI
- **问题**：`blog-table-view/row.tsx:47` 与 `blog-grid-view/card.tsx:38` 只在 `onDoubleClick` 上打开编辑（键盘与触摸不可达，`<tr>`/`<div>` 无 `tabIndex`/`role`）；表头 `blog.col_created_at`（`table-view/index.tsx:93`）实际渲染 `publishedAt`（`row.tsx:69`）；`setSort`（`filters.ts:12`）全仓无调用点，用户无法排序；`<table>` 缺 `caption`、`<th>` 缺 `scope`。
- **方案**：主操作按钮已存在（`TableRowActionsCell` 的「文章设置」），把双击改/加为「单击标题进入」或给行补 `tabIndex=0` + `onKeyDown(Enter)`；表头文案与字段对齐；补排序按钮（下拉或表头点击，接入已有 `setSort`）；表补 `caption`（可 `sr-only`）与 `scope`。
- **范围**：`blog-table-view/*`、`blog-grid-view/card.tsx`、`locales/*/blog-*.ts`。代价 **M**。

#### UI-07 [P1][开放] hover-only 控件、批量条窄屏溢出、四个 Modal 无可访问名
- **问题**：`blog-hub-sidebar/index.tsx:132,183` 与 `blog-grid-view/card.tsx:137` 用 `opacity-0 group-hover:opacity-100`——**聚焦时仍不可见**（AGENTS 可访问性红线，键盘用户看不到「新建文件夹/标签」「置顶」）；`blog-batch-bar.tsx:34` 是 `absolute left-1/2 -translate-x-1/2 whitespace-nowrap` 排 8 个控件，窄屏必然溢出；`blog-hub-modal.tsx:33-40`、`blog-publish-modal/index.tsx:349`、`blog-settings-modal.tsx:22`、`blog-categories-modal.tsx:33` 自绘头部，`Modal` 未拿到 `title`/`ariaLabel`，读屏只得通用 dialog 名（同模块 `link-*-modal` 是正解，传了 `title`）。
- **方案**：hover-only 改 `focus-visible:opacity-100`（或常显低对比、悬停增强）；批量条改工具栏下方的独立横条（AGENTS 明列的四种合格去处之一）或允许换行；四个 Modal 传 `ariaLabel`（或改用 `title`）。
- **范围**：4 个组件 + `blog-batch-bar.tsx`。代价 **M**。

#### UI-08 [P1][开放] 单条评论审核与友链分类 CRUD 零反馈
- **问题**：`blog-comments-view.tsx` 把 store action 当同步 `void` 用（bundle 类型 `(id,status)=>void`），失败即未处理 rejection，UI 原地不动，无 pending/disabled 可连点（`pending-comments-card.tsx:82,85` 同病）；友链分类侧 `blog-store/links.ts` 的 `createLinkCategory` 失败 `console.error + return null`，`update/deleteLinkCategory` 抛错被调用点 `void` 吞掉 → 失败时 `setEditingCatId(null)` 不执行，行内编辑态打结；分类删除的确认框复用了「删除友链」的文案。
- **方案**：统一 `handleStatusChange`/`handleCategoryAction`（行级 busy + `try/catch` + 成功/失败双 toast + 失败回滚）；补分类专用确认文案。
- **范围**：`blog-comments-view.tsx`、`use-blog-comments-view.ts`、`pending-comments-card.tsx`、`blog-links-view/link-category-modal.tsx`、`blog-store/links.ts`、locales。代价 **S～M**。

#### UI-09 [P1][开放] 复制 / 二维码 / 检测只在右键菜单内，键盘无入口
- **问题**：`link-card-row.tsx:186-242` 的行内 IconButton 只有批准/拒绝/收藏/置顶/编辑/删除，`复制`/`二维码`/`检测` 只在 `LinkContextMenu` 内（`link-context-menu.tsx:178-181`）；`link-context-menu.tsx` 还是自绘 portal 弹层（无 `role="menu"`、子菜单只靠 `onMouseEnter`、键盘 `contextmenu` 时菜单开在左上角），而同模块 `use-blog-post-card.tsx:31` 已在用 `useContextMenu` + `Menu`。
- **方案**：把这三个动作提到行内（或加「更多」`Menu`）；`link-context-menu` 整体改用共享 `Menu` + `useContextMenu`（与前轮 P1-17 同一处）。
- **范围**：`link-card-row.tsx`、`link-context-menu.tsx`。代价 **M**。

#### UI-10 [P2][开放] 友链导入/导出：静默丢数据、英文报错上屏、CSV 回环自破
- **问题**：HTML 导出只遍历 root 分类及其一层子分类（`link-import-export-modal.tsx:366-386`），未分类/更深层被丢弃，界面计数与成功 toast 仍报全量；JSON 解析无 try（`:128` 直接把 `SyntaxError` 的英文原文塞进 toast，`'Import failed'` 也是英文字面量）；空 `name/url` 条目照样入 payload（服务端 zod `min(1)` 会让整批 400）；上传无大小/类型校验、`file.text()` 无 catch、input 不复位；CSV 用 `split(',')`（`:276`）读不回自己导出时加引号的含逗号字段（`:396-408`）。
- **方案**：导出前先算并显示真实条数、把丢数据的过滤条件写进导出说明；解析包 `try/catch` 并映射为本地化文案；条目级校验后过滤并报告跳过的条数；上传校验类型与大小；CSV 换成引号感知的解析（或改用 JSON 为唯一导出格式）。
- **范围**：`link-import-export-modal.tsx`、locales。代价 **M**。

#### UI-11 [P2][开放] 「实时访问日志」既不实时，也不随所选时间窗变化
- **问题**：文案是「实时访问日志」（`visit-logs-card.tsx:19`），服务端是 `ORDER BY visited_at DESC LIMIT 20` 且只带 `exclude*` 过滤、不含时间窗（`stats.ts:368-378`），前端无轮询；同一张卡把服务端语义值 `'Direct'/'Other'` 与 `visit.browser || 'Other'`、`botName || 'Bot'` 当业务数据直出；看板卡还借用了 `share.*` 文案（`index.tsx:114`）、`use-blog-post-card.tsx:147` 借 `share.view_note_analytics`。（`DevicesCard` 缺空态已修，见第三节。）
- **方案**：文案改为「最近访问」并把时间窗写进副标题，或让查询真的带上区间；服务端语义值改由前端映射表本地化；把借用的 `share.*` key 迁到 `blog.*`（或明确升格为共享 key 并去掉误导性的 `share.` 前缀）。
- **范围**：`visit-logs-card.tsx`、`stats.ts`、`locales/*/blog-*.ts`。代价 **S～M**。

#### UI-12 [P2][开放] 图表小值刻度全被圆整成 1/1/1/0
- **问题**：`big-svg-chart.tsx:34` `Math.max(...values, 1)` + `:64` `Math.round(maxVal * g)`——当最大值为 1～3 时五条网格线全部显示 1/1/1/1/0（用户截图可见）。`preserveAspectRatio='none'`（`:128`）会把数据点与圆拉变形（宽高比随容器变化）。`role='img'` 与 `aria-label` 已补（第三节），但 `ChartDots`/`ChartGridLines` 仍用 index 作 key。
- **方案**：nice-ceiling（把 maxVal 提到 1/2/5×10ⁿ 的刻度）或 `maxVal < 5` 时改用整数刻度并去重标签；`preserveAspectRatio='none'` 改成固定比例或让容器跟随比例；key 改用有意义的标签。
- **范围**：`components/big-svg-chart.tsx`（与 share 共用，双覆盖回归）。代价 **S**。

#### UI-13 [P2][开放] 复制链接 / 二维码复制静默失败
- **问题**：`link-qr-modal.tsx:24-32` 的 `handleCopy` 把失败压成 `setCopied(false)`（用户看到的是「没反应」），且 `setTimeout` 未在卸载时清理；`blog-links-view/index.tsx` 的复制按钮也是 `void navigator.clipboard.writeText(...)`。仓库在 `use-blog-post-card.tsx:60-66` 有正解（try/catch + 双 toast）。
- **方案**：抽共享 `copyText(text, toast)`，统一成功/失败提示；`setTimeout` 句柄在卸载时清除。
- **范围**：`link-qr-modal.tsx`、`blog-links-view/index.tsx`、`use-blog-post-card.tsx`（改为调用共享函数）。代价 **S**。

### 4.5 门禁与工程化（GATE）

本轮开工后新增发现，不在前两轮报告中。

#### GATE-01 [P1][已修] 注释门禁的扫描器会被字符串里的 `/*` 骗过，从而不再要求其后的注释被登记
- **问题**：`scripts/check-comments.mjs` 的 `scanScript` 用正则 `/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g` 找注释，只用 AST 字面量区间排除「匹配起点落在字符串里」的那些（`insideLiteral`）。于是字符串里的 `/*`（本仓就有：`app.use('/api/blog/*', …)`）会与文件中**后面第一个** `*/` 配成一段幻觉块注释，正则跳过了这段区间里的所有真注释——注释从未被 `check()` 看到，门禁也就**不再要求**它们出现在白名单里。这个失败方向最危险：正则少看到一条注释，门禁就少一条约束，而输出仍然是「passed」。
- **实证**：用与 `insideLiteral` 同一套判定跑全仓（`src`/`scripts`/`tests` + 根配置），正则可见 12 191 条、AST 可见 12 197 条——`src/client/lib/markdown/slides/ui/pick-image.ts`、`tests/blog-routes.test.ts`（本轮改到这里才暴露）、`tests/share-routes.test.ts`、`tests/share-selection-parity.test.ts`、`tests/blog-links-routes.test.ts` 共 6 条注释对门禁不可见。反向（正则看得到、AST 看不到）为 0，因此换成 AST 不会丢条目。
- **影响面**：注释白名单是仓库的核心不变量（每个注释都必须是已登记的英文架构说明），`scripts/sync-comments-allowlist.mjs` 与 `check-comments.mjs` 互为镜像；镜像错的后果是**双向失败里少了一个方向**（新注释漏登记不会报错）。本轮 B1-01/B1-02 在这两个测试文件里加 `/** */` 后，旧注释被吞、白名单条目随 `sync` 消失而门禁仍显示 passed——是实际发生的，不是理论风险。
- **方案**：两脚本统一改用 AST 注释区间（对每个节点取 `getLeadingCommentRanges(text, node.pos)` 与 `getTrailingCommentRanges(text, node.end)`，递归覆盖全部 token 含 `endOfFileToken`）并抽成共享模块 `scripts/lib/comment-scan.mjs`，两处不再各自实现；补 `tests/comment-scan.test.ts` 钉住三个回归：字符串 / 模板 / 正则里的 `//` `/*` 不算注释、`'/api/blog/*'` 之后的块注释与其后的 `//` 仍被看见、文件末尾注释与模板插值里的注释都在。
- **范围**：`scripts/lib/comment-scan.mjs`（新）、`scripts/check-comments.mjs`、`scripts/sync-comments-allowlist.mjs`、`tests/comment-scan.test.ts`（新）。代价 **S**（已完成；白名单重生成后 6 条重新纳入，总数 12 176 → 12 201）。

---

## 五、功能完整度：作为独立博客后台对比主流

以下能力经 `grep` 确认在代码中不存在（本轮核验）。

| ID | 能力 | 现状 | 主流参照 | 建议优先级 |
| --- | --- | --- | --- | --- |
| FEA-01 | 发布时间可设 + 定时发布 | 创建即写 `published_at = now`（`posts.ts:265-283`），发布动作不更新它，`schemas.ts` 无该字段 | Ghost `published_at`、WordPress | **高**（FEA-02/03/08 的共同前置） |
| FEA-02 | 文章级 SEO（metaTitle / description / ogImage / canonical / noindex） | 表无字段 | 全部主流 | 高 |
| FEA-03 | slug 改名 301 重定向表 | 无 → 换 slug 必 404，直接损伤 SEO | Ghost redirects | 高 |
| FEA-04 | 文章回收站（软删 + 还原） | 硬删（`posts.ts:361-378`） | WordPress / Ghost | 中 |
| FEA-05 | 版本历史 / 草稿恢复 | 无 `blog_revisions`；`/sync` 是单向覆盖 | WordPress revisions | 中 |
| FEA-06 | 评论回复 + 通知（邮件/Webhook）+ 反垃圾 | 仅 status 人工 + IP/篇级限流；无 smtp/webhook 痕迹 | 全部主流 | 中 |
| FEA-07 | 独立媒体库 / 封面选择器 | 只能粘贴 URL（`blog-publish-modal` 的 CoverField），无上传与裁切 | Ghost 媒体库 | 中 |
| FEA-08 | RSS 自动发现 / WebSub ping；sitemap 覆盖分类与标签 | 前台有 `feed.xml`/`sitemap.xml`，服务端无推送；sitemap 缺 `/links`、`/categories/*`、`/tags/*` 与 `lastmod` | 全部主流 | 中 |
| FEA-09 | 分析导出 CSV；单篇文章分析下钻 | 无（`top-posts-card` 的外链是唯一「下钻」） | Ghost / Plausible | 中 |
| FEA-10 | 分类与标签体系统一 | `blog_tags.name` 与 `blog_posts.tags`（JSON）两套数据，改名后计数与筛选分裂；无排序/合并端点 | WordPress | 中（触及数据形态，建议单开 ADR） |
| FEA-11 | 多作者归属 | 友链申请固定挂到最早注册用户（`public-links.ts:71-72`） | 主流后台 | 低 |
| FEA-12 | 前台：相关文章 / 上下篇（有）/ 可分享搜索页 / PWA / 嵌套评论 | 相关文章、搜索页、PWA、嵌套评论均缺 | 主流公开博客 | 低 |

**结论**：功能面铺得很宽（文章/评论/分类标签/文件夹/友链目录与健康检测/导入导出/看板/设置），但**发布流程本身（发布时间、SEO、slug 迁移、回收站）这条最基础的主线是缺的**。建议 FEA-01 排在最前。

---

## 六、前台（blog-frontend）——与主应用耦合的部分

本轮范围包含前台，但只列与博客后台**数据契约耦合**的部分（前台的独立问题见第一轮报告 BF 系列，其中多数仍开放）。

- **BF-1 [P0][开放] 失败即伪造**：`blog-frontend/src/lib/api.ts` 的 `getPosts`/`getPostBySlug`/`getTimeline`/`getCalendar` 在 catch 里回填 `FALLBACK_POSTS`（`:188-206`、`:213-218`、`:264`、`:302`），`normalize.ts` 还把成功响应里的空字段也兜成 `FALLBACK_SITE_INFO`；`feed.xml.ts` 与 `sitemap.xml.ts` 走同一条 API → **爬虫与 RSS 阅读器会把假文章当真内容收录**，真实访客在网络抖动时会读到一整篇不存在的博文。这与主应用 COR-01 是同一病灶的两个器官。
- **BF-2 [P1][开放] 前台 `window.open` 绕过 React 属性拦截**：`components/links/link-card.tsx`、`link-context-menu.tsx` 对匿名提交的 `link.url` 直接 `window.open`，与 SEC-04 是同一处缺口的两端。
- **BF-3 [P0][开放] PV 计数路径**：见 COR-04。
- **BF-4 [P1][开放] 路由与 owner**：本轮决定「每用户一个博客」后，前台需要 `/u/<username>/…` 前缀 + `Astro.locals.owner`（`env.d.ts` 的 `App.Locals` 目前只有 `locale`），并把 owner 透传进 `api.ts` 的每一次取数；`canonical`/OG/feed/sitemap 都要带前缀，否则多用户下会互相覆盖索引。
- **BF-5 [P1][开放] 缓存键**：`middleware.ts:52-58` 的 `pageCacheControl` 对 `/posts/` 给 `s-maxage=300`，公开 API 侧给 `public, max-age=15, s-maxage=60`。引入 owner 后必须确认 owner 进入缓存键（query 形式天然满足），并复核 `Vary`。
- **BF-6 [P2][开放] sitemap/feed 的覆盖与 lastmod**：见 FEA-08。

---

## 七、修复路线图建议

| 批次 | 内容 | 条数 | 代价 |
| --- | --- | --- | --- |
| 0 | 两份文档（本报告 + 执行计划） | 1 | XS |
| 1 | 租户边界与安全：SEC-01 → SEC-02 → SEC-08 → SEC-09 → SEC-03 → SEC-04 → SEC-05 → SEC-06 → SEC-07 → SEC-10..15；另加 GATE-01（动手时发现，见 §4.5） | 16 | M |
| 2 | 统计可信：COR-01（含 COR-03/05）→ COR-02 → COR-04（含 BF-1/3）→ COR-06 → COR-08 | 6 | L |
| 3 | 失败语义与性能：ENG-01 → ENG-02 → ENG-03 → ENG-04 → ENG-05 → ENG-06/16 → ENG-07/08/14 → ENG-09/10 → ENG-11/12/13/15 | 9 | M～L |
| 4 | UI / a11y / i18n / 令牌：UI-01 → UI-02/03 → UI-04/05 → UI-06/07 → UI-08/13 → UI-09/10 → UI-11/12 | 7 | M |
| 5 | 功能补齐：FEA-01 → 02 → 03 → 04 → 06 → 07 → 09 → 10 → 11 → 05 → 08 → 12 | 12 | XL |

顺序理由：安全 > 正确性 > 可访问性（AGENTS 冲突优先级）。SEC-01 是所有公开侧问题的共同前置；SEC-08 的表重建不可逆，必须在公开契约定型、且能单独回滚时做；COR-04 排在 COR-01 之后（只删伪造会让仪表盘从「假数字」变成「永久 0」）。

---

## 八、诚实限制

- **统计与性能数字为静态推算**：ENG-02 的 1.2 MB、ENG-04 的 15 MB、ENG-12 的 2,900 个 JSX 对象、ENG-13 的 6～12 MB 均基于明示假设（100 篇 × 12 KB、300 条友链、100 行 × 11 文件夹、30 张原图 1200×630）。本轮**未做 profiling**，也**未跑** `npm run build` / `npm run test:unit` / e2e / 视觉门禁（避免在审查阶段改动工作区产物）。
- **包体数字来自第一轮报告对 `dist/client` 的实测**（`blog-*.js` ≈200 KB raw、`vendor-icons-*.js` ≈507 KB 含 1,755 个 icon 绑定），本轮未重新构建核对；ENG-11 落地时必须用 `npm run size:check` 与 `budget:check` 做前后对比。
- **SEC-03 的「≥100 即 500」是依据仓库既有约定与图谱侧先例的推断**（D1 单语句绑定上限 100），blog 侧尚无生产触发记录；落地时用 D1 测试基座（`tests/d1-harness.ts`）补一条真触发用例。
- **【安全】SEC-08 的表重建不可逆**：SQLite 无法 `DROP` 列级 `UNIQUE` 生成的自动索引，必须走 `RENAME → 建新表 → 复制 → DROP`。这条**要求部署侧先备份**；回滚只能从备份恢复。`check-migration-immutability` 与 `tests/schema-migrations.test.ts` 是守卫。
- **SEC-10 / SEC-13 为本轮新发现**，未在前两轮报告中出现；SEC-13 的影响范围（多少现有行会是错误的 `is_self_referrer`）取决于历史写入，本轮未做数据统计。
- **前台（blog-frontend）本轮未做完整复审**，第六节只覆盖与后台数据契约耦合的部分；前台的 a11y、CSP、DoSS 面请以第一轮报告与后续专项为准。
- **多用户归属的产品语义是本轮确认的设计决定**（每用户一个独立博客 + 公开端 `?owner=` / 前台 `/u/<username>/`），不是既有行为；因此 SEC-01/SEC-08/SEC-09 的方案里包含契约变更，需要过渡窗口并在实现时同步文档与 `src/shared/types`。
- 本轮核验订正了前两轮报告的 8 条结论（第三节），说明**报告与代码之间存在时间差**；后续以执行计划文档（`plan-with-freebuff-1.md`）的进度表为唯一追踪源。
