# 博客管理中心整改执行计划（Freebuff · 2026-09-30）

> 依据：`docs/improvement/blog/review-with-freebuff-1.md`（第三轮完整审查报告，52 项问题 + 对标缺失功能总表）。
> 分支：`dev` 直接逐项提交。
> 约定：每个条目 = 一个原子提交；批次内按下方顺序执行；**先写能失败的复现测试**（worker/D1 契约用 `tests/d1-harness.ts`，前端用 jsdom 契约，几何 / 视觉类由浏览器门禁先红），实现后跑回归再提交。
> **每次提交都必须更新本文件**（勾选、commit 短哈希、进度日志一行）；发现新问题或结论变化时同步更新 review 文档；批次末一次 `docs(blog)` 提交统一回填短哈希。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash） · `[-]` 已证伪 / 已修（附证据）
> hash 回填约定：提交无法写入自己的短哈希，因此每条进度行的 hash 在**下一个提交**里回填（每次提交都更新本文件不变）。

## 0 · 已确认的设计决定（本轮）

1. **修复范围**：管理端 + 其 API + `blog-frontend` 前台一起修。
2. **公开侧形态**：**每个用户一个独立博客**（`users.username` 已是 `NOT NULL UNIQUE`，用作公开标识）。
3. **寻址**：先做查询参数 / 路径前缀，并把「请求 → owner」收敛成一个 resolver 接口，为将来子域 / 自定义域留口。
   - 公开 API：`/api/blog/public/...?owner=<username>`；缺省回退「实例默认 owner（最早注册用户）」+ `[blog]` 日志，属过渡窗口，到期删除。
   - 前台：`/u/<username>/...` 前缀由 `middleware.ts` 记入 `Astro.locals.owner` 并 rewrite 到现有路由；无前缀的旧 URL 在窗口内解析为默认 owner，canonical 指向新前缀。
4. **回归强度**：每个提交跑 `typecheck` + `test:unit` + 按改动面选静态门禁；每批收尾跑全套 e2e / e2e-visual / contrast。

---

## 批次 0 · 文档基线

- [x] B0 写入 `review-with-freebuff-1.md`（完整报告）与 `plan-with-freebuff-1.md`（本跟踪表）

## 批次 1 · 租户边界与安全

顺序固定，后项依赖前项。

- [x] B1-01 **SEC-01** 公开 API owner resolver（`?owner=` + 缺省回退默认 owner）+ 公开读全部绑定 `user_id` + 匿名响应去掉 `noteId` + 前台 `api.ts` 透传 owner — 已提交（hash 见下一提交）
  - 实现：新增 `src/worker/routes/blog/owner.ts`（`registerBlogOwnerMiddleware` + `blogOwnerOf`）；`/api/blog/public/*` 13 个公开端点全部改绑 `blogOwnerOf(c).userId`（音乐子树按自己的发布开关解析，中间件显式跳过）；每个公开响应带 `X-Inkstone-Blog-Owner`；匿名响应不再下发 `noteId`。
  - 前台形态取舍：单一部署即单一博客，`PUBLIC_BLOG_OWNER`（另有 `window.__INKSTONE_BLOG_OWNER__` / `<meta name="inkstone-blog-owner">`）在 `fetchWithTimeout` 这一个出口给全部公开请求补 `?owner=`；`/u/<username>/` 路径前缀属多租户前台路由，留待 FEA 批次单开（当前部署模型不需要）。
  - 复现测试：新增 `tests/blog-public-owner.test.ts`（9 条，真实 D1：两个账号各自的文章/友链/标签/时间轴/日历/设置/评论/友链申请/点击互不可见；缺省寻址钉最早注册账号；未开设的账号 404）；`tests/blog-routes.test.ts` 中原先把「跨 key 共享」钉成期望的 `/site` 断言已订正。
  - 回归：`typecheck` 绿；`test:unit` 5150 通过 / 1 失败（见进度日志的既有失败）；本批门禁（`comments:check`、`escape:check`、`empty-catch:check`、`module-state:check`、`deep-imports:check`、`style:check`、`hardcoded:check`）全绿；`blog-frontend`：`npm test` 295 通过（新增 3 条 owner 透传用例）、`npm run typecheck` 只有 3 条既有的 `astro check` 报错（见进度日志）。
- [x] B1-02 **SEC-02** 友链 / 分类 upsert 与 import 改「先判归属再写」，回读补 owner 条件 — 已提交（hash 见下一提交）
  - 实现：新增 `src/worker/routes/blog/owned-rows.ts`（`assertRowIdWritable` / `rowOwnersOf` / `importRowId` / `assertRefsMine`）；`links.ts` 的两条 upsert 加「id 已被他人持有则 404」+ 分类/父分类引用必须是自己所有 + 回读带 `user_id`；批量 `setCategory` 同校；导入路径拆到 `src/worker/routes/blog/link-import.ts`（`links.ts` 已接近 500 行上限）。
  - 导入的「不静默」取舍：文件里的 id 已被他人持有时**换新 id**（拒绝整个文件会让合法转让 / 第二个账号恢复成为不可能），引用到别人分类时**置空并 `console.warn` 报数**；另外修了导入路径一个真 bug：`parentId` 之前原样写入，文件里父项排在子项之后或父项被重编号时都会指向错处，现改为两趟：先定 id 映射，再写语句。
  - 复现测试：`tests/blog-links-routes.test.ts` 新增 7 条（两账号）：覆盖链接 / 分类 upsert 撞他人 id、父分类与链接分类引用他人、批量改归属、导入他人 id（不碰对方数据且引用指向自己的新分类）、导入孤立分类引用置空。
  - 回归：`typecheck` 绿；`test:unit` 5157 通过 / 1 失败（仍是那条既有 kanban 日期用例）；本批门禁全绿；`size:check` 1821 文件（新文件均 < 500 行）。
- [x] B1-03 **SEC-08** slug 唯一性下放到 per-user：`db/schema/blog-posts.ts` + 基线同步 + rebuild 迁移（RENAME → 建新表 → `INSERT…SELECT` → 重建索引 → DROP）+ 全部 slug 查询带 owner + 去掉 `/check-slug` oracle；**单独提交，要求先备份** — 已提交（hash 见下一提交）
  - 实现：新增 `src/worker/db/schema/blog-posts.ts`（表 DDL + 5 条索引 + `BLOG_POSTS_SLUG_REBUILD_STATEMENTS`）：`slug TEXT NOT NULL`（去 UNIQUE）、新增 `CREATE UNIQUE INDEX idx_blog_posts_user_slug ON blog_posts(user_id, slug)` 替代 `idx_blog_posts_slug`；`tables.ts` / `indexes.ts` 改为引用该模块（单一来源，重建建的就是当前形状），`checks.ts` 的 `REQUIRED_INDEXES` 同步换成新索引名；迁移 **version 52**（migrations.ts 末尾追加，满足 `version === index + 1` 连续性断言），**无 skip 守卫、无条件执行**（理由写在 `blog-posts.ts` 注释里：守卫信号可能被正常建表路径产生，一旦误跳会让遗留库继续保留全局 UNIQUE 而索引检查仍报健康；重建在空库上只是空拷贝）。
  - 查询侧：`posts.ts` 的 `assertSlugFree` 改带 `user_id`（同账号重复仍 409）；`settings.ts` 的 `GET /check-slug` 改按 `user_id` 查询（不再回答别人的博客），端点保留供发布弹窗实时反馈。公开详情/相邻篇/分类/日历在 B1-01 已按 owner 绑定。
  - 复现测试：新增 `tests/blog-slug-scope.test.ts`（4 条：两账号同名 slug 均可发布、同账号重复仍 409、`check-slug` 只答自己的帖子、公开详情各取各家）；`tests/schema-migrations.test.ts` 增一条遗留库重建用例（先建旧形状 + 旧索引 + 一行数据，删 `schema_migrations >= 52` 后重跑 `initializeDatabase`：数据保留、跨账号同名插入成功、同账号重复被 UNIQUE 拒、旧索引名消失、新索引存在）。
  - 回归：`typecheck` 绿；`test:unit` 5168 通过 / 1 失败（仍为既有 kanban 用例）；7 项静态门禁绿（`size:check` 因 migrations.ts 793→801 行重建基线，差异仅此一行）；已跑 `npm run deploy` 前置无涉（本批未部署）。
  - **部署要求（不可逆，必须遵守）**：上生产前先备份 D1（`wrangler d1 export` 或既有备份链路）；迁移在一个 D1 batch（事务）里完成，拷贝失败即整体回滚，回滚路径只能是「从备份恢复并回退代码」；本仓 fork 不自行部署。
- [x] B1-04 **SEC-09** 站点设置单一键（per-user），公开侧按 owner 读；订正 `tests/blog-routes.test.ts` 里把错误行为钉成期望的断言 — 已提交 `00dbfa9d`
  - 实现：`settings.ts` 的 `getBlogSettings`/`saveBlogSettings` 的 `userId` 改为必填，键由 `blogSettingsKey(userId)` 唯一给出（删掉 `blog_settings_global` 分支）；解析失败改记日志；`/site` 断言已在 B1-01 订正。
  - 结论订正：公开侧「写按用户、读全站」实际由 B1-01 绑定 owner 后已闭合；本条实际清掉的是「缺账号则读全局键」这条死分支——它让任何忘记传 owner 的调用静默拿到默认值。新测试钉住「无人认领的 `blog_settings_global` 行不被读」。仓库历史上无人写过全局键（`git log -S` 可查），故不需数据迁移。
- [x] B1-05 **SEC-03** 批量请求上限 + 分块 + 分组原子化 — 已提交（hash 见下一提交）
  - 实现：`schemas.ts` 新增 `BATCH_ROW_LIMIT = 1000` 并加在 `postIds` / `commentIds` / `linkIds` / `orders` / 导入的 `links`、`categories` 上（超限 400 并带可读文案）；`comments.ts` 按 50 一条分块；`posts.ts` 的每组语句改走 `db.batch`（一次事务，不再「先删评论后删文章」中途失败）。
  - 与计划的差异（有意）：计划写「五个 schema 一律 `.max(100)`」，但 HEAD 上已有 `tests/blog-routes.test.ts` 的 SH-42 用例（120 篇文章批量删除/发布必须成功，靠分块达成），硬上限 100 会把既有行为改成 400。故上限取「一次请求的工作量上界」（1000），把平台限制交给分块。
  - **顺带修掉一个此前无覆盖的真 bug**：`comments.ts` 的批量改状态分支占位符从 `?2` 起编号，而 `?2` 同时是 owner，绑定数比占位符多一个 → 该接口对任何「批准/驳回/标垃圾邮件」调用都 500（只有 delete 分支正确）。已按分支各自起步编号，并补两条用例（单条 150 条）。
  - 复现测试：`tests/blog-routes.test.ts` 新增「单条改状态」「150 条改状态（分块）」「超过 1000 条一律 400（posts/comments/links/import 四处）」，共 3 条 describe。
- [x] B1-06 **SEC-04** 共享 `isSafeExternalUrl()`（http/https + 站内相对 + mailto），schema 强制 + 渲染侧兜底（含 `frontendUrl` / `socialLinks`） — 已提交（hash 见下一提交）
  - 实现：新增 `src/shared/url-safety.ts`（`isSafeExternalUrl(value, kind)` / `safeExternalUrl()`；先去掉 ASCII 控制字符再判 scheme，所以 `java\tscript:` 这类不会漏网；`//host` 不算站内相对；mailto 只对链接开放）；`schemas.ts` 用它约束链接 url/avatar、公开友链申请、公开评论 authorUrl/authorAvatar、导入行、`frontendUrl` 与 `socialLinks.*`（空串仍合法）。
  - 渲染侧兜底（存储里可能有旧行）：新增 `features/blog/frontend-base.ts` 把三处重复的 `frontendUrl` 取值收敛为一处并做安全回退；链接行无法渲染的地址只当文本显示（不再生成 `<a>`）；右键菜单 / 二维码弹窗 / 检测弹窗的「打开」控件仅当地址可用时存在；评论头像与链接图标对不可渲染的地址回退到首字母/地球图标；`link-dynamic-icon.tsx` 顺带把图片与 emoji 两个分支抽成子组件（改后主函数不再超行）。
  - 复现测试：新增 `src/shared/url-safety.test.ts`（8 条：允许/x 拒绝/控制字符走私/协议相对/空值/图片不放 mailto）与 `src/client/features/blog/blog-links-view/link-card-row.test.ts`（2 条 jsdom：可渲染地址生成带 `noopener` 的链、`javascript:` 只渲染为文本）——这也是 `features/blog` 目录下的第一批测试；`tests/blog-links-routes.test.ts` 新增 5 条契约（链接/申请/评论/设置/导入 均拒绝不可渲染地址，且不落库）。
  - 未纳入本批：前台（`blog-frontend`）的 `window.open(link.url)` 与旧行兼容（BF-2，批次 2）；demo 后端是单用户模拟，未同步该规则。
- [x] B1-07 **SEC-05** `assertContentSize` 接入 blog 写入 + `title/excerpt` 加 `.max()` — 已提交 `8df97f23`
  - 实现：`assertContentSize(content, subject='Note')` 增 subject，`posts.ts` 创建与 patch 两条写入路径调用（`'Blog post'`）；`schemas.ts` 的 `title` 用 `LIMITS.titleMaxLength`、`slug.max(200)`、`excerpt.max(2000)`；顺手把 `coverUrl` 接上 B1-06 的 `safeUrl('image')`（B1-06 漏了这一个字段）。
  - 复现测试：`tests/blog-routes.test.ts` 新增「两条写入路径都拒收超过笔记内容预算的正文」（413）。
- [x] B1-08 **SEC-06** `POST /links/:id/click` 加限流 + `status='approved'` + 站点归属 — 已提交 `1317e1d2`
  - 实现：先判归属/`status='approved'`/`is_active`（不合格的请求回 `counted:false` 且不花掉该访客在那条链接上的窗口），再按 `(访客 IP, 链接)` 半小时间隔计一次；超限的请求只回 `counted:false`，不写库、不报错（点击确实发生了，只是不再计数）；响应多一个 `counted` 字段，前台忽略响应体故无契约破坏。
  - 复现测试：`tests/blog-links-routes.test.ts` 新增「未获批不计、同一访客只计一次」；`tests/blog-public-owner.test.ts` 原有的跨博客点击用例继续通过（它正是「不合格请求不花窗口」的理由）。
- [x] B1-09 **SEC-07** `days` 走 `clampInt` + 三处 LIKE 补 `escapeLike` + 公开列表补 `LIMIT` — 已提交 `15ce276a`
  - 实现：`likeAny(columns, placeholder)` 抽进 `lib/like.ts`（三处调用点各自拼 `ESCAPE '\\'` 的写法正是这个 bug 的来源），`posts.ts`/`comments.ts`/`public.ts` 三处裸 LIKE 改为 `escapeLike` + `ESCAPE`；`days` 改为「必须是安全正整数，否则 400」再走 `clampInt` 收敛上界；公开列表补上限：时间轴/日历/标签 2000（取最新，日历外层再按渲染顺序排回来）、评论 500（取最新再反转成渲染顺序）、友链 500、友链分类 200。
  - `posts.ts` 因此触到 500 行上限，列表查询构建器拆到 `src/worker/routes/blog/post-list-query.ts`（`size:check` 是硬门槛，不是为拆分而拆分）。
  - 复现测试：`tests/blog-routes.test.ts` 新增「文章/评论列表与公开列表把 `_`、`%` 当字面量」「days 拒收 `abc`/`12.7`/`30abc`/`0`/`-5`」。
  - 已知限制：上限是「个人博客发文量的天花板」而非分页——超过 2000 篇时最旧的文章会从归档视图与标签计数里掉出（保留最新的那批），这是本条能诚实做的取舍；真正的分页属于前台条目（FEA-12）。
- [x] B1-10 **SEC-10 + SEC-11 + SEC-12 + SEC-13 + SEC-15** 小项打包 — 已提交 `d73bda36`
  - SEC-10：服务端不再写 `api.dicebear.com` 默认头像（空值即空值）；管理端评论卡改用 `resolveAvatarSource()`（允许列表内的图片 URL，或按昵称本地生成），于是匿名的表单再也不能让管理员的浏览器去请求任意外站。
  - SEC-11：`blog/index.ts` 的 `loadSession` 换成挂载级 `requireAuth`（会话加载本来就由 `app.use('/api/*', loadSession)` 做一次），六个 route 文件里 40 余处路由级 `requireAuth` 随之删除——漏写一条即匿名可读的那类隐患从此不存在。
  - SEC-12：**本轮核验为已修**（B1-04 已把解析失败改成 `console.error` 并保留默认值回退），本批不再改动。
  - SEC-13：`is_self_referrer` 改由 share 侧的 `isSelfReferrer()` 按请求 host 真实判定后写入（此前是字面量 `0`）。
  - SEC-15：`blog-store/state.ts` 去掉模块级 `initialFilters`，改 `hydrateTrafficFilters()` 在打开 hub 时读取；`persistTrafficFilters()` 移出 `set` updater（StrictMode 下不再双写）。
  - 复现测试：`tests/blog-routes.test.ts` 新增自引荐落库（同站 referer → 1，外站 → 0）与空头像两条；新增 `src/client/features/blog/blog-store/filters.test.ts`（`vi.resetModules()` 钉住「导入不读 localStorage」，及一次改动一次写入）。
  - 已知限制：前台 SSR 刻意不转发访客的 `referer`（`blog-frontend/src/pages/posts/[slug].astro` 的注释），所以走 SSR 取数路径的访问其 referer 仍是空的、`is_self_referrer` 也就仍是 0；真实的自引荐要等 B2-03 的浏览器 beacon（同源/浏览器直发才会带上 referer）。本批只保证「有 referer 到达 worker 时它是真值」。
- [x] B1-11 **GATE-01** 修注释门禁扫描器（本轮动手时发现，已真实发生）：`check-comments.mjs` / `sync-comments-allowlist.mjs` 用正则找注释、只用 AST 字面量区间排除「落在字符串里的匹配」，于是字符串里的 `/*`（如 `'/api/blog/*'`）会与文件后面第一个 `*/` 组成幻觉块注释，**吞掉中间所有真注释**——正则不再产出它们，门禁也就不再要求它们被登记。实测仓内已 5 个文件 / 10 条注释对门禁不可见（`pick-image.ts`、`tests/blog-routes.test.ts`、`tests/share-routes.test.ts`、`tests/share-selection-parity.test.ts` 与 `tests/blog-links-routes.test.ts`，后者正是本轮 B1-01/B1-02 在这两个测试文件里加 `/** */` 后新暴露的）。  修法：两脚本统一改用 AST 注释区间（`getLeadingCommentRanges` / `getTrailingCommentRanges`，递归覆盖全部 token 含 `endOfFileToken`）并抽成共享模块 `scripts/lib/comment-scan.mjs`，`tests/comment-scan.test.ts` 钉住回归（字符串/模板/正则里的注释符不算注释、`'/api/blog/*'` 之后的注释仍被看见、文件末尾与模板插值里的注释都在）；重生成后这 6 条重新进入白名单（双向失败因此重新生效）。**不是本轮安全检查的附带改动，单独一个提交。** — 已提交 `e7cf3a8d`

## 批次 2 · 统计可信

- [x] B2-01 **COR-01 + COR-05** 删 `stats.ts` 全部伪造分支；区间值与全站累计分列标注；前端用 `KpiCard` 的 `unavailable` 与空态表达「未采集」 — 已提交 `091a39eb`（COR-03 的横幅真实值落在 B2-04 一并做，两条本就要求同批）
  - 实现：删除 `fillFallbackDistributions()`（硬编码的「中国 100% / Direct 100% / desktop 60% / macOS 50% / Chrome 60%」）与 `Math.ceil(postStoredViews * 0.75)` 两处编造；`blogDisplayTotals` 只回答本区间（不再取三个值里的最大）；单篇 visitors 不再编造；排行榜改为「本区间有访问的文章、按本区间访问排序」（原为按存量 views 排序再给无数据者编一个 visitors）；载荷新增 `storedViews`（存量计数器）与区间值并列；客户端 KPI 只读区间值、累计计数器降为卡片附注（`KpiCard` 新增可选 `hint`），未加载显示「未采集」；文案改为「本区间…」。
  - 复现测试：`tests/blog-routes.test.ts` 把「用存量视图估算分布」的旧断言**订正**为「未采集即空」（含 `storedViews` 仍为 20），并新增「排行榜只含本区间有数据的文章」。
- [x] B2-02 **COR-02** `computeDelta` 无基数不再报 +100%（共用于 share，双覆盖回归） — 已提交 `93cf290d`
  - 实现：`previous === 0` 一律返回 `undefined`（0→n 是从无到有，0/0 无从度量）；前端两处徽标因此不渲染。
  - 复现测试：`tests/share-analytics.test.ts` 订正 `computeDelta(50, 0)` 的旧断言；`tests/blog-routes.test.ts` 新增「上一窗口无流量时不画 delta」。
- [x] B2-03 **COR-04**（PV 计数根治，beacon 部分） — 已提交 `43243ee4`；**BF-1（前台失败伪造）仍未做，见下**
  - 实现：新增公开 `POST /api/blog/public/visits`（`visit-beacon.ts`）：按 `(文章, 访客指纹)` 30 分钟去重（复用既有 `recordBlogVisit`）、按 IP 120/10 分钟限流（超限 429）、只接受已发布且属于本站的文章（否则 404）、按真实 UA 判 bot（bot 不计也不写 views）；`GET /posts/:slug` **不再**写访问行、不再加计数（那次请求来自前台服务器，无 UA 无来源，记下的每一行都被判成爬虫——这正是「PV 恒 0」的根因）；`is_self_referrer` 改按博蝢自身配置的地址（`settings.frontendUrl`）判定，而不是 API 主机。
  - 前台：新增 `blog-frontend/src/lib/visit-beacon.ts`，文章页水合后以 `sendBeacon`（退化 `keepalive fetch`）带**真实 `document.referrer`** 上报一次；文章元素带上服务端认可的 slug。
  - 复现测试：`tests/blog-routes.test.ts` 的计数类用例改走 beacon（按指纹只计一次、第二个读者再计一次），并新增「未发布/不存在的文章 404」「bot 不计」「同站与外部来源的 self-referrer 判定」「取数路径不再留任何访问行」。
  - **未完成部分（BF-1）**：前台 `lib/api.ts` 的 `FALLBACK_POSTS` 失败伪造（`getPosts`/`getPostBySlug`/`getTimeline` 三处）与 feed/sitemap 的失败处理（应 5xx + `no-store`，不返回空文档）尚未改，`blog-frontend/src/lib/api.test.ts` 里还有一条把回退当期望的断言等着一并订正；下一步接 B2-03 的尾。
- [x] B2-04 **SEC-14 + COR-06 + COR-03** 流量过滤器单一真值 — 已提交 `25fa85bf`
  - 实现：三个开关只存在 store 里一份，仪表盘读 store 并把**三个值全部**透传 `analytics()`（原来自己拿一份 `excludeBots`，而 store 那份不被任何查询消费）；横幅改用服务端回传的真实 `bots/selfReferrals/owner`（原来两个参数写死 0）；`setFilters` 里白发的 `loadPosts`/`loadStats` 删除（它们从不带这三个值）。
  - 复现测试：新增 `blog-dashboard-view/traffic-switches.test.ts`（按 store 三值查询；别处改开关会重查）。
- [x] B2-05 **COR-08** 链接检测新增 `error` 语义 + 缓存 TTL + 批量删除确认带条数 — 已提交 `7dba4896`
  - 实现：新增 `error` 级别（请求根本没到达 ≠ 站点回答失效），统计/筛选/徽标各自分开，只有 `broken` 是可删的判定；缓存新增 24 小时 TTL，超时不再丢弃而是显示「陈旧」提示；批量删除确认改为带条数的专用文案。
  - 复现测试：新增 `blog-links-view/link-health.test.ts`（失败与失效分桶；TTL 边界与无时间戳的旧缓存算陈旧）。

## 批次 3 · 失败语义与性能

- [x] B3-01 **ENG-01** store 增 `error` 通道 + 四个视图的三态渲染（加载 / 失败 + 重试 / 空）+ 全部 mutation `try/catch` + 乐观回滚 + danger 提示 — 三态部分已提交 `ddfd54e7`，mutation 部分已提交 `7188ae3a`
  - 实现（三态）：`blog-store` 增 `loadErrors: Set<BlogLoadScope>`（`posts/comments/links/stats`）与 `markLoadFailed`/`markLoadSucceeded`；posts/comments/links/stats 四个 loader 落错，成功时清位（同一个 Set 不变则不改身份，避免多余重渲染）；失败刷新保留上次数据，只有「标志置位且手里没有数据」才渲染失败态。
  - 新增 `features/blog/blog-load-failure.tsx`（同一句话 + 重试，`role='status'`）与新 key `blog.load_failed`；四处接入：文章列表（hub）、评论、友链，仪表盘另外把 analytics 的本地失败态与 `stats` 一起接入（`useAnalyticsLoad` 抽出取数 effect，控制台仍记原因）。
  - 复现测试：新增 `blog-store/load-errors.test.ts`（4 条：置位与成功清位、失败刷新保留旧行、作用域互不污染、友链同规则）与 `blog-comments-view-failure.test.ts`（2 条 jsdom：失败画失败态而非空态且重试后恢复、失败刷新保留已有评论）。
  - 先红证据：把评论视图的失败分支短路成 `false ? ... : ...` 后，第一条渲染用例 **1 failed / 1 passed**，恢复后全绿（证明断言真的盯在失败态上）。
  - 实现（mutation）：新增 `blog-store/mutation.ts`——`reportBlogMutationError`（`console.error` 带上下文 + `errorMessage(error) || t('common.action_failed')` 的 danger toast）与 `runBlogMutation`（成功才刷新，失败只上报）；`actions.ts`/`links.ts`/`content.ts` 的全部写入改走它或自带的 try/catch：`updatePost` 只回滚被改的那一行、`batchToggleGroup`/`batchMoveToFolder` 按快照回滚 `posts`/`stats`，其余（删除、同步、评论状态与批量、分类、设置、友链全部写入）报错后返回 `false`/`null` 而非抛错。
  - 契约随之改为「mutation 自己报告失败」：调用点不再有人 `void` 一个会 reject 的 Promise，成功提示一律按返回值判断（文章卡片、评论、友链、批量条、分类/设置/发布/友链编辑/导入/友链分类树）；友链检测器的批量删除在失败时不再清空选择。
  - 复现测试：新增 `blog-store/mutation-failures.test.ts`（6 条：乐观 patch 被拒后回滚且提示、成功则不回滚也不提示、删除被拒返回 `false`、批量发布被拒回滚 `posts` + `stats`、文件夹创建失败不再静默、友链状态修改失败提示）。
  - 先红证据：把回滚那一行短路成 `previous ? previous : p` 不生效（`&& false`）后，第一条用例 **1 failed / 5 passed**，恢复后全绿。
  - 回归：`typecheck` 绿；blog 相关 16 文件 116 条全绿（含新 6 条）；`test:unit` 574 文件 5223 通过 / 1 skipped；九项静态门禁绿（`size` 未动基线：发布表单抽出 `readNoteContent`/`writePostFrontMatter`，测试拆成两个 describe）。
  - 已知限制：`use-blog-note-submenu.ts` 里两处直连 `api` 的写入（同步/取消发布）本来就有自己的 catch 与 toast，未并入本次改动。
  - 回归：`typecheck` 绿；`src/client/features/blog` 13 文件 39 条全绿；合并 `tests/blog-routes.test.ts` 共 14 文件 86 条全绿；九项静态门禁绿（`size` 未动基线，按门槛把 `useBlogHubModal` 的发布弹窗状态、评论列表的空/失败分支与仪表盘的 analytics 取数各自抽成小件）。
- [x] B3-02 **ENG-02** 文章列表去 `content`（列白名单）+ `LIMIT/OFFSET` + 总数独立查询 + tag 下推 + 前端分页控件 — 已提交（hash 由下一提交回填，见进度日志）
  - 实现（服务端）：`post-list-query.ts` 列白名单拆成两层——`POST_LIST_COLUMNS`（列表，无 `content`）与 `POST_INDEX_COLUMNS`（记事列表用的无正文索引）；`blogPostsWhere()` 一段 WHERE 同时喂分页查询与 `COUNT(*)`（同一筛选的两问，翻页器不会按另一套条件画总页数）；`blogPostsListQuery` 加 `LIMIT/OFFSET`，`blogPostsCountQuery` 是独立总数，`blogPostIndexQuery` 是全量无正文索引；tag 过滤下推 SQL（新增 `tag-needles.ts` 抽出 `blogTagNeedles`/`blogTagFilterSql`，`public.ts` 改为复用，管理端与公开端共享同一段父子标签语义），删掉原先取回全文后在 JS 里过滤的 `filterPostsByTag`。
  - 路由：`GET /posts` 读 `page`/`limit`（`clampInt`：页 ≥1，limit 1–200，默认 50），响应 `{ posts, pagination: { page, limit, total, totalPages } }`；新增 `GET /post-index`（body-free 全量，供记事列表徽标与发布弹窗回填——这两问对不在当前页的记事也必须有一致答案）。
  - 共享类型：`BlogPostSummary = Omit<BlogPost, 'content'>`、`BlogPostIndexEntry`；`db/rows.ts` 对应两个行型；`helpers.ts` 的 `toBlogPostSummary` / `toBlogPostIndexEntry` / `toBlogPost`（最后一个在 summary 上叠回正文）。
  - 客户端：store 增 `postIndex` 与 `postsPage`/`postsTotal`/`postsTotalPages` + `setPostsPage`（按服务端给的总页数夹紧，同页不重复请求）；`loadPosts` 带 `page`，筛选改变一律回第 1 页；当前页被删空（`posts.length === 0 && total > 0 && page > totalPages`）自动退到最后一页而不是画「暂无文章」；`loadAll` 与全部文章 mutation 一并刷新 `postIndex`；新增 `blog-post-pager.tsx`（>1 页才出现，上一页/下一页 + 位置与总数）；侧栏挂载改预取 `loadPostIndex()`（原来取整份 `posts`——分页后一页装不下每篇记事的徽标）；记事列表与子菜单改读 `postIndex`（`note-row-state.ts`、`use-blog-note-submenu.ts`，发布弹窗收 `BlogPostIndexEntry`）。
  - demo backend 同步：`/api/blog/posts` 分页 + `pagination`、`/api/blog/post-index`；列表与索引分别去掉正文与统计字段。
  - 复现测试：`tests/blog-routes.test.ts` 新增 4 条（分页与 `content` 缺席；tag 在 SQL 里下推且跨页可命中；总数跟随筛选；`/post-index` 全量无正文）；客户端新增 `blog-store/posts-pagination.test.ts` 4 条（查询带页、夹紧与同页不重发、筛选回第一页、删空当前页回退）与 `blog-post-pager.test.ts` 2 条（单页不渲染、位置与两端禁用）。
  - 先红证据：把 tag 分支短路为 `false && tag` 后 tag 用例 **1 failed / 50 skipped**；把 offset 写死 0 后分页用例 **1 failed / 50 skipped**（均恢复后全绿）。
  - 回归：`typecheck` 绿；blog 相关 18 文件 62 条全绿；`test:unit` 576 文件 5233 通过 / 1 skipped；九项静态门禁绿（`size` 未动基线；`comments` 白名单随新注释重生）。
  - 已知限制：`post-index` 刻意不分页（每篇记事都要一个答案），代价是账号文章很多时这份无正文索引本身也不小；请求 `limit` 上限 200。
- [x] B3-03 **ENG-03** `GET /links` 服务端真消费 `status/categoryId/search` + `LIMIT` + counts 改 `GROUP BY` — 已提交 `60b83bcb`
  - 实现：新增 `src/worker/routes/blog/link-list-query.ts`（列表与计数共用一段 WHERE）：`status` 映射 `pending/approved/rejected` 或两个标记页签 `pinned/favorite`（片段是常量表，请求只能选不能写）、`categoryId` 精确匹配、`search` 走 `escapeLike` + `ESCAPE`；列表 `LIMIT 500`；计数一条 `GROUP BY status`，**不带 status 条件**（切页签时徽标不缩水）、带 category/search（徽标描述眼前这批）；未知 `status` 回 400 而不是静默当 `all`。`links.ts` 因 500 行门槛把查询构建器拆出（同 `post-list-query.ts` 先例）。
  - `BlogLinkStats` 增 `pinned`/`favorite`：这两个页签的计数原本由客户端在数组上数，服务端一次 GROUP BY 即可给出，且不必受 LIMIT 影响。
  - 截断不静默：客户端用「徽标数 > 返回行数」识别命中上限，列表顶部显示「只显示前 N 条」（新 key `blog.link_list_truncated`，双语文案）。
  - 客户端删掉本地二次过滤（`use-blog-links-view.ts` 的 `filterLinks` 与 `computeStatusCounts` 的兜底数法），徽标只读服务端；`loadLinks` 补 `AbortSignal` + 序号线——服务端筛选后迟到的答案不再能自我纠正（以前浏览器会重新过滤刚到的数组），必须只认最新一发；配套 3 条 jsdom 用例。
  - 复现测试：`tests/blog-links-routes.test.ts` 新增 3 条（四筛选与计数、通配符按字符处理与非法 status、501 行只回 500 而计数 501）；三条已实测在旧实现上先红（全回 501 行、筛选不生效）。
  - 回归：`typecheck` 绿；`test:unit` 571 文件 5211 通过 / 1 skipped（全绿）；`comments/escape-hatches/empty-catches/module-state/deep-imports/code-style/hardcoded/size/i18n` 九项静态门禁绿（`size` 无需动基线）。
  - 已知限制：500 是上限而非分页——超过时靠筛选收敛，界面明说「只显示前 N 条」；demo 后端本就没有 `/api/blog/links`，无需同步。
- [x] B3-04 **ENG-04** 搜索防抖 + `AbortSignal` + 乱序守卫；`/check-slug` 同步修 — 已提交 `1ea6a399`
  - 实现：`blog-hub-toolbar.tsx` 的搜索框改本地 draft + 250ms 防抖（打字即显示，只把停下的那次问出去）；`loaders.ts` 的 `loadPosts` 带 `AbortController` 与 `postsRequestSeq` 序号线（迟到答案丢弃、被取消的请求不算错误）；`api/share.ts` 的 `checkSlug` 收 `AbortSignal`，`use-blog-publish-form.ts` 忽略迟到的校验结果。
  - 复现测试：新增 `blog-store/posts-request.test.ts`（被替换的请求确实被取消；只认最新一发；取消不写 console.error）。
- [x] B3-05 **ENG-05** `loadAll` 按当前 tab 收敛 + 30s SWR + 删侧栏重复 effect + 复位 effect 去 `activeNote` 依赖 — 已提交（hash 由下一提交回填，见进度日志）
  - 实现：`loadAll` 改名 `loadHubData({ force? })`（名字不再声称“全部”）；store 新增 `dataLoadedAt: Partial<Record<BlogDataScope, number>>`（九个作用域各一枚时间戳，只在成功时盖章——失败的作用域下次仍会被重试）；`BLOG_TAB_SCOPES` 给出每个 tab 真正绘制的最小集合：公共部分是 `folders/tags/categories/settings/stats`（侧栏与导航计数四项每个 tab 都画），dashboard 另加 `comments`（待审评论卡），posts 另加 `posts/postIndex`，comments 另加 `comments`，links 另加 `links`。30 秒 `BLOG_HUB_SWR_MS` 窗口内的作用域不再重问；显式刷新（工具栏、仪表盘重试、刷新按钮）传 `force`。
  - `setActiveTab` 改为 `setActiveTabImpl`：切 tab 本身触发 `loadHubData()`，因此「打开中心」不再预载所有 tab，而是「哪个 tab 缺什么补什么」。
  - `use-blog-hub-modal.ts` 拆成两个 effect：开启/关闭复位 effect 的依赖里**不再有 `activeNote`**（开启时编辑记事不再重跑整套 bootstrap），打开来源记事由另一个只做 `setTargetNoteId` 的 effect 在可读时应用；`onSaved` 走非强制 `loadHubData`（保存流程自己已经定向刷新了相关作用域）。
  - 侧栏删掉挂载时与 `loadHubData` 重叠的 `loadFolders`/`loadTags` effect（`useBlogHubSidebarEffects` 收窄成只管理标签展开状态的 `useExpandedParentTagPaths`，`useBlogHubSidebarStore` 不再持有这两个 loader）。
  - 顺手纠正 B3-02 分页带来的回归：仪表盘的 `posts.length` 不再等于文章总数，KPI 与待审评论卡的「管理文章 (N)」改用 `stats.totalPosts`，hook 不再读 `posts`（dashboard 作用域因此不含 `posts`）。
  - 复现测试：新增 `blog-store/hub-data.test.ts` 3 条（当前 tab 只拉自己的作用域；窗口内不重问、`force` 才重问；切 tab 只补缺的——folders 不重拉、posts 首次拉）。
  - 先红证据：把作用域选择突变成「所有作用域」后，links tab 用例 **1 failed / 2 skipped**（恢复后全绿）。
  - 回归：`typecheck` 绿；blog 相关 19 文件 65 条全绿；`test:unit` 577 文件 5236 通过 / 1 skipped；九项静态门禁绿（`size` 未动基线）。
  - 已知限制：未访问过的 tab 的侧栏徽标（评论/友链计数）在首次切到该 tab 前可能为 0 或旧值（计数改由 `stats` 直接提供属 B3-06）；仪表盘不再预载 `posts`。
- [x] B3-06 **ENG-06 + ENG-16** 评论列表 `LIMIT` + 服务端 search 接通（删本地过滤与死通道）+ tab 计数改服务端计数 + 发布弹窗分类拉取修复 — 已提交 `3d7c6d9e`
  - 实现（服务端）：`GET /comments` 新增 `LIMIT 500`（`BLOG_COMMENTS_LIST_LIMIT`）与一条 `GROUP BY status` 计数，二者共用一段 WHERE（`blogCommentsWhere()`）；计数**不带 status 条件**（保留 search/postId 上下文），因此五个页签显示的计数都是真实规模；响应变为 `{ comments, counts }`。
  - 与计划的差异（有意）：计划写「tab 计数改 `stats.pendingComments/totalComments`」，但 `BlogStats` 只有 total/pending 两个数，支撑不了 approved/rejected/spam 五个页签；改为在评论接口用一条 GROUP BY 返回全量计数（同 B3-03 友链的做法），搜索上下文一并保留。`stats` 本批不改。
  - 客户端：`comments.list` 契约加 `counts`；store 新增 `commentStats` 与 `commentsRequestSeq`/`commentsAbort`（`loadComments` 带 AbortSignal 与序号线——搜索改问服务端后，迟到的答案必须先发后至丢弃）；`use-blog-comments-view.ts` 删本地 `filterComments`/`computeStatusCounts`，搜索改 store（本地 draft + 250ms 防抖，同文章列表），tab 计数只读 `commentStats`（未加载时不再画 0），列表被截断时提示「只显示前 N 条」；侧栏评论徽标改用 `commentStats.pending/all`。
  - ENG-16：发布弹窗的取数 effect 抽成 `usePublishDialogData`——只在 `open` 时执行、deps 去 `content`（原来挂载时（open=false）一次、打开时一次、内容变非空再一次）。
  - demo backend 同步（响应加 counts、列表加 500 上限）。
  - 复现测试：`tests/blog-routes.test.ts` 新增 2 条（五个页签计数真实且搜索上下生效；501 条只回 500 而计数 501）；客户端新增 `blog-store/comments-request.test.ts` 3 条（搜索进查询且服务端计数入 store、取消前一发、取消不算错误）。
  - 先红证据：把计数查询改回带 status 条件后计数用例 **1 failed / 52 skipped**；把 search 写死为 undefined 后客户端用例 **1 failed / 2 skipped**（均恢复后全绿）。
  - 回归：`typecheck` 绿；blog 相关 21 文件 121 条全绿；`test:unit` 578 文件 5241 通过 / 1 skipped；九项静态门禁绿（`size` 未动基线：按门槛把评论列表滚区抽成 `CommentsList`、搜索抽成 `useCommentSearchBox`、发布弹窗取数抽成 `usePublishDialogData`）。
  - 已知限制：`counts` 描述的是「当前搜索词下的全站评论」，不是全局——搜索时页签计数随搜索收敛是刻意的。
- [x] B3-07 **ENG-07 + ENG-08 + ENG-14** stats 七条串行改 `db.batch`/`GROUP BY`；analytics 六段合并 + 分布改 SQL 聚合；补三条索引 — 已提交 `8fec693d`
  - 实现（ENG-07）：`loadBlogStats` 由「7 条串行计数 + 一次无 LIMIT 全表扫 + JS `JSON.parse`」改为**一个 `db.batch` 五条聚合**：文章总览一条（total/published/pinned/`SUM(views)`）、评论一条（total/pending）、分类一条、文件夹一条（`GROUP BY folder_id`，带 published 拆分）、标签一条（`json_each` 分组，带 published 拆分）。新模块 `post-counts.ts` 承载后两条与行→值的映射，`GET /tags` 改为复用标签计数（它原来自己又扫一遍同一批行），`summarizePostTagCounts` 仅剩公开标签端点还在用（那里带着 2000 篇的窗口语义，不在本批改）。tags 的解析全部下推 SQL：损坏行用嵌套 `CASE`（`json_valid` → `json_type = 'array'`，同 `lib/share-selection-sql.ts` 的守卫）跳过而不是让整个面板 500；trim、空成员、非字符串成员的语义与旧 JS 累加器一致（后者按 JSON 文本字符串化）。
  - 实现（ENG-08）：`loadBlogAnalyticsPayload` 的 summary、上一窗口、过滤器计数、最近访问与**八条访问聚合**合并为**一次 `db.batch`**（只剩 topPosts 的标题查询需要第二跳）；`lib/visit-aggregates.ts` 的有界区间不再取明细行，与 `all` 一样走 8 条 SQL 聚合（总量、时间桶、五个分布、per-target），`visitAggregateFromResults` 去掉按区间分支；仪表盘切区间时 abort 在飞请求（`api.blog.analytics` 本就收 signal），迟到的旧区间不再覆盖新图，快速切换也不再并发放大。
  - 实现（ENG-14）：三条索引——`idx_blog_posts_user_pinned (user_id, is_pinned DESC, published_at DESC)`（列表默认序与 pinned 筛选）、`idx_blog_posts_user_views (user_id, views DESC)`（`sort=views_desc`）、`idx_blog_links_user_order (user_id, is_pinned DESC, pinned_order ASC, sort_order ASC, created_at DESC)`（友链主列表真实 ORDER BY；旧索引中间卡着 `status` 且方向不符）。两条 posts 索引放在新常量 `BLOG_POSTS_ORDER_INDEX_STATEMENTS`（刻意不进 `BLOG_POSTS_INDEX_STATEMENTS`，避免改动已应用的迁移 52 的语句集），与 links 那条一起由 `BLOG_ORDER_INDEX_STATEMENTS` 同时供给 schema 路径与迁移 **53**；`REQUIRED_INDEXES` 同步。评论索引缺 `user_id` 前缀一条（`blog_comments` 无该列）按 review 的建议不在本批夹带，属表结构级改动。
  - 复现测试：`tests/blog-routes.test.ts` 新增 3 条（stats 一次 batch 且不取原始 `tags` 行、损坏 tags 不 500、`/tags` 不再取行解析、有界区间不取明细行且只剩一跳）；`tests/visit-aggregates.test.ts` 新增/改写 2 条（有界区间同为八条语句、有界区间与行路径逐值等价）；`traffic-switches.test.ts` 新增 1 条（切区间取消前一发）。实现前实测 **4 failed**（有界区间取明细行、`SELECT tags FROM blog_posts`、`/stats` 的 batch/direct 往返数、八条语句预算），实现后全绿。
  - 回归：`typecheck` 绿；目标 10 文件 263 条全绿（含 share 双覆盖 189 条）；`test:unit` 578 文件 5246 通过 / 1 skipped；九项静态门禁绿（`size` 因 `migrations.ts` 801→810 重建基线，差异仅此一行；`traffic-switches.test.ts` 的 describe 主体超 50 行靠拆分两个 describe 首修，未进基线）。
  - 已知限制：分享侧的有界区间同样改为 8 条聚合语句（语句数变多，但不再把整个窗口读进内存）；`json_each` 只在 SQLite 的 JSON 支持可用时成立（D1/本地 sqlite 均内置）；`/stats` 的标签计数现在遵循 SQL 侧的字符串化规则。
- [x] B3-08 **ENG-09 + ENG-10** 写操作 refetch 定向收敛；友链批量删除走 `batch` 端点 — 已提交（hash 由下一提交回填，见进度日志）
  - 实现（ENG-09）：`updatePost` 不再固定重拉四个 loader——列表与记事索引永远重读（每一列都可能出现在那里），stats/tags/categories 只在 patch 触及对应聚合时才问：`isPinned` → stats、`isPublished` → stats、`folderId` → stats、`tags` → stats + tags、`categoryId` → categories（`GET /categories` 的 `postsCount` 是逐分类子查询）；标题类 patch 只重读列表与索引，等于省下原来每次 patch 都跑的标签全扫。`batchPosts` 同规则：`setCategory` → categories、`delete` → stats + tags、其余（publish/unpublish/setPinned/setFolder）→ stats；`deletePost` 一并补上 tags 重读（删掉某标签的最后一篇后 `stats.tagCounts` 不再提它，侧栏会回落到标签列表里那个过期的 `postsCount`，这是删文章唯一会漏的计数）。
  - 与 review 的差异（订正）：review 写「pin/title 不需要 stats 与 tags」——标题成立，**pin 不成立**：侧栏「已置顶」计数取 `stats.pinnedPosts`（`use-blog-hub-sidebar.tsx:244`），pin 确实移动一个计数，故保留 pin → stats；本条真正省下的是每次 patch 都跑的 `GET /tags`（JSON 全扫）与本来就不该问的 categories。
  - 实现（ENG-10）：store 新增 `batchDeleteLinks(ids)`（一次 `links.batch('delete', ids)` + 一次 `loadLinks`）；检测器的 `handleBatchDeleteLinks` 从逐条 `deleteLink` 改调它——删 20 条从 20 DELETE + 20 次全量重拉降到 2 个请求。选择集仍由调用方在成功后才清空（失败保留选择的行为不变），`batchBusy` 防重复提交。
  - `onSaved` 已是定向的：B3-05 起它走非强制 `loadHubData()`，只补当前 tab 且超过 30 秒窗口的作用域；mutation 自己已经把相关作用域盖章，所以它通常什么都不问。
  - 复现测试：新增 `blog-store/targeted-refresh.test.ts` 10 条（pin 不拉 tags、标题不拉任何计数、publish 拉 stats 不拉 tags、tags 补拉 tags、categoryId 只拉 categories、批量 setPinned/setCategory/delete 各自的作用域、`batchDeleteLinks` 单请求与失败不重拉）。实现前实测 **7 failed / 2 passed**（另 2 条锁的是旧实现已成立的行为）；再做一次「作用域恒为三项」的变异得到 **4 failed**。
  - 回归：`typecheck` 绿（顺手清掉 B3-06 遗留的未用 import `BlogCommentStatus`，它让 `tsc -b` 报错）；`src/client/features/blog` 19 文件 68 条全绿；九项静态门禁绿（`size` 未动基线）。
  - 已知限制：`savePost`（新建）仍是结构性全量（posts/stats/tags/postIndex）——新文章可以带来新标签；单篇删除后分类的 `postsCount` 仍要等下一次 `loadCategories`（未在本条扩面）。
- [~] B3-09 **ENG-11 + ENG-12 + ENG-13 + ENG-15** barrel 拆瘦让 lazy 生效 + 去 `icons` 全量 registry + qrcode 懒载 + geo/device 纯函数下沉；列表 `memo`/`useMemo`/窗口化；图片 lazy + 尺寸；link checker 批次 15 / abort / TTL / updater 纯净 / progressbar — 进行中（ENG-12/13/15 已提交，见进度日志；ENG-11 待做）
  - ENG-12（已提交）：`BlogGridCard`/`BlogTableRow` 包 `memo` 且 prop 全部变稳（`onToggleSelect` 传 store action、`onOpenEdit` 用 `useCallback`、`cat`/`folder` 来自 `useMemo` 的 Map）；`use-blog-post-card` 两份菜单只在打开时构造；侧栏标签计数改一次后序遍历（`buildTagNodeCounts`）；store 的 `publishedNoteIds` 投影只在索引数组替换时重建；评论/友链改渐进渲染（首屏 100 行 + 显示更多）。复现测试 3 条；窗口测试变异 1 failed。限制：评论/友链行级 `memo` 未做（内联箭头与 bundle API），窗口是渐进渲染非滚动虚拟化。
  - ENG-13（已提交）：`PostCoverImage` 与评论头像补 `loading='lazy'` + `decoding='async'`，头像另补 `width/height=32`；封面不再写 `width/height`（容器已固定盒尺寸，写死会与真实比例冲突）；36px 表格缩略图仍取原图字节（无 CDN 尺寸变体，部署侧能力）。复现测试 `blog-grid-view/cover-image.test.ts` 2 条。
  - ENG-15（已提交）：批次改 15（服务端上限）；一次运行一个 `AbortController`，`handlePause` 停止即 abort 在飞请求，catch 先判 `signal.aborted || stopRequested.current` 再决定是否写 `error`（被停止的批次保留 `checking`，不产出没人测过的结论）；`api.blog.links.check` 增 `AbortSignal`；缓存写移出 `setResults` updater（`applyResults` 先算 next、同步 ref、再 set + 写缓存，updater 回到纯函数，顺序批次也能看到上一批的值）；进度条补 `role='progressbar'` + `aria-valuemin/max/now` 与可访问名（新 key `blog.link_check_progress` 双语）。TTL 已在 B2-05 落地。复现测试 `link-checker-run.test.ts` 3 条；两处变异（批次回 8、去掉 abort 分支）各 1 failed。

## 批次 4 · UI / a11y / i18n / 令牌

- [ ] B4-01 **UI-01** `text-white` 与裸调色板收敛到令牌 + `--update-baseline` + `contrast:check` 实测两套主题
- [ ] B4-02 **UI-02 + UI-03** 四处日期本地化 + 硬编码文案改 message id（含 `col_created_at` 表头语义修正）
- [ ] B4-03 **UI-04 + UI-05** 表单迁移到 `Field`（htmlFor / aria-describedby）+ `Switch` 补 label + slug 不可用阻断 + 五套分段控件收敛 `Segmented`
- [ ] B4-04 **UI-06 + UI-07** 键盘可达（单击 / 回车）+ 排序 UI + 表 `caption`/`scope`；hover-only 改 `focus-visible`；批量条窄屏；四个 Modal 补可访问名
- [ ] B4-05 **UI-08 + UI-13** 单条评论审核与分类 CRUD 反馈 + `copyText()` 共享（含 QR 与列表复制）
- [ ] B4-06 **UI-09 + UI-10** 复制 / 二维码 / 检测行内入口 + `link-context-menu` 改用共享 `Menu`；导入导出丢数据 / 英文报错 / CSV 回环
- [ ] B4-07 **UI-11 + UI-12** 「实时访问日志」文案与时间窗 + 服务端语义值本地化 + 图表 nice-ceiling 与比例（共用于 share，双覆盖）

## 批次 5 · 功能补齐（roadmap）

按 `FEA-01 → 02 → 03 → 04 → 06 → 07 → 09 → 10 → 11 → 05 → 08 → 12` 顺序；每项开工前确认，触及公共契约或数据形态的（FEA-05 版本历史、FEA-10 分类/标签统一）各自单开 ADR。

- [ ] B5-01 **FEA-01** 发布时间可设 + 定时发布
- [ ] B5-02 **FEA-02** 文章级 SEO 字段（metaTitle / description / ogImage / canonical / noindex）
- [ ] B5-03 **FEA-03** slug 变更 301 重定向表
- [ ] B5-04 **FEA-04** 文章回收站（软删 + 还原）
- [ ] B5-05 **FEA-06** 评论回复 + 通知（Webhook / 邮件）+ 反垃圾
- [ ] B5-06 **FEA-07** 媒体库 / 封面选择器
- [ ] B5-07 **FEA-09** 分析导出 CSV + 单篇下钻
- [ ] B5-08 **FEA-10** 分类与标签体系统一（需 ADR）
- [ ] B5-09 **FEA-11** 多作者归属修正
- [ ] B5-10 **FEA-05** 版本历史（需 ADR）
- [ ] B5-11 **FEA-08** RSS 自动发现 / WebSub ping + sitemap 覆盖与 `lastmod`
- [ ] B5-12 **FEA-12** 前台：相关文章 / 搜索页 / PWA / 嵌套评论

---

## 每项验收标准（通用）

1. **复现测试先红**：worker / D1 契约放 `tests/blog-*.test.ts`（基座 `tests/d1-harness.ts`）；前端放 `src/client/features/blog/**/*.test.ts`（该目录目前零测试，是本轮要补的空白）；几何 / 视觉 / 对比度类由 `scripts/e2e-visual.mjs`、`scripts/check-contrast.mjs` 先红。
2. 实现后：目标测试绿 + `npm run typecheck` + `npm run test:unit` 全绿。
3. 静态门禁按改动面挑选：`comments:check`、`escape:check`、`empty-catch:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`style:check`、`hardcoded:check`、`tokens:check`、`size:check`、`i18n:check`。
   - 新增 / 修改注释后必须 `node scripts/sync-comments-allowlist.mjs`（双向失败）。
   - 调色板计数只能下调，且下调必须 `--update-baseline`。
   - 共享令牌改动必须 `node scripts/check-token-drift.mjs --update-baseline` 并由 `npm run contrast:check` 实测。
4. 改动 `blog-frontend` 时额外跑：`cd blog-frontend && npm run typecheck && npm test && npm run lint && npm run size:check:blog && npm run deep-imports:check:blog`。
5. 批次收尾：`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` 起 :7712 → `npm run test:e2e` → `node scripts/e2e-visual.mjs`（需 `INKSTONE_CHROME_PATH`）→ `npm run contrast:check`；涉及包体时另跑 `npm run budget:check`。
6. 环境缺失（如无 Chrome）时**如实记录为未验证**并说明风险，不伪造结果。
7. 迁移只增不改；破坏性变更（SEC-08 表重建）单独提交 + 要求部署侧先备份 + 写明回滚路径。
8. `git add` 只列本次文件，不用 `-A`；不夹带无关格式化与重构。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-30 | B3-09c ENG-12 列表 memo/菜单懒构/计数一次遍历/渐进渲染 | （下一提交回填） | `typecheck` 绿；blog 相关 23 文件 76 条 + 新 4 条全绿（含窗口用例）；窗口变异（步长 250）1 failed；`size` 绿（`blog-links-view/index.tsx` 拆出 `links-toolbar.tsx`） | 评论/友链行级 memo 未做（内联箭头/bundle API）；窗口为渐进渲染而非滚动虚拟化 |
| 2026-09-30 | B3-09b ENG-13 封面/头像懒加载与异步解码 | 6127201e | `typecheck` 绿；新 `cover-image.test.ts` 2 条绿；`size` 未动基线 | 表格 36px 缩略图仍取原图字节（无 CDN 尺寸变体）；封面不写死 width/height（容器已定盒尺寸） |
| 2026-09-30 | B3-09a ENG-15 检测器批次 15 + 停止即 abort + 缓存写移出 updater + progressbar | d2e16114 | `typecheck` 绿；`blog-links-view` 3 文件 7 条全绿（含新 3 条）；两处变异各 1 failed；`i18n:check` 双语新 key 已补 | 旧结果仍展示（按 B2-05 计划标注而不丢弃）；缓存写靠 ref 同步，未改成 reducer |
| 2026-09-30 | B3-08 ENG-09/ENG-10 写操作定向失效 + 友链批量删除走 `batch` | （下一提交回填） | `typecheck` 绿（顺手清 B3-06 未用 import）；`src/client/features/blog` 19 文件 68 条全绿（含新 10 条）；实现前 7 failed、作用域变异 4 failed；九项静态门禁绿（`size` 未动基线） | `savePost` 仍结构性全量；单篇删除不刷新分类 `postsCount`；review 的「pin 不需要 stats」按侧栏计数订正 |
| 2026-09-30 | B3-07 ENG-07/ENG-08/ENG-14 stats 计数并批 + 访问聚合统一 SQL + 三条顺序索引 | 8fec693d | `typecheck` 绿；目标 10 文件 263 条全绿（含 share 双覆盖 189 条）；先红 4 failed；`test:unit` 578 文件 5246 通过 / 1 skipped；九项静态门禁绿（`size` 重建基线：仅 `migrations.ts` 801→810） | 评论 `user_id` 前缀未做（表结构级，另开）；share 有界区间同为 8 条语句；`json_each` 依赖 SQLite JSON1 |
| 2026-09-30 | B3-06 ENG-06/ENG-16 评论限页 + 服务端搜索 + 服务端计数 + 发布弹窗取数修复 | 3d7c6d9e | `typecheck` 绿；blog 相关 21 文件 121 条全绿（含新 5 条）；两处先红变异各 1 failed；`test:unit` 578 文件 5241 通过 / 1 skipped；九项静态门禁绿（`size` 未动基线） | 计数随搜索上下文收敛（刻意）；与计划的「用 stats 计数」有差异（stats 只有 total/pending） |
| 2026-09-30 | B3-05 ENG-05 hub 数据按 tab 收敛 + 30s SWR + 删重复 effect | f74e68e1 | `typecheck` 绿；blog 相关 19 文件 65 条全绿（含新 3 条）；作用域突变先红 1 failed；`test:unit` 577 文件 5236 通过 / 1 skipped；九项静态门禁绿 | 未访问 tab 的侧栏徽标可能滞后（待 B3-06 的 stats 计数）；dashboard 不再预载 posts |
| 2026-09-30 | B3-02 ENG-02 文章列表去正文 + LIMIT/OFFSET + 独立总数 + tag 下推 + 分页控件 | 9b39fc57 | `typecheck` 绿；`tests/blog-routes.test.ts` 51 条（含新 4 条）+ 客户端新 6 条全绿；两处先红变异各 1 failed；`test:unit` 576 文件 5233 通过 / 1 skipped；九项静态门禁绿（`size` 未动基线） | `post-index` 刻意不分页（每篇记事都要答案）；`limit` 上限 200；demo 后端已同步 |
| 2026-09-30 | B3-01 ENG-01（mutation 部分）写入自带失败提示与乐观回滚 | 7188ae3a | `typecheck` 绿；blog 相关 16 文件 116 条全绿（含新 6 条）；回滚变异证明 1 failed / 5 passed；九项静态门禁绿（`size` 未动基线）；`test:unit` 574 文件 5223 通过 / 1 skipped | 直连 `api` 的两处笔记侧写入未并入；folders/tags/categories/settings 的 loader 仍只记日志 |
| 2026-09-30 | B3-01 ENG-01（三态部分）加载失败成为独立状态 + 失败可重试 | ddfd54e7 | `typecheck` 绿；`src/client/features/blog` 13 文件 39 条 + `tests/blog-routes.test.ts` 47 条全绿（含新 6 条）；失败分支短路的变异证明 1 failed；九项静态门禁绿 | mutation 的 catch/回滚/提示尚未做（进行中）；folders/tags/categories/settings 的 loader 仍只记日志（本条只覆盖四个视图） |
| 2026-09-30 | B3-03 ENG-03 友链列表服务端筛选 + 限页 + `GROUP BY` 计数 | 60b83bcb | `typecheck` 绿；`tests/blog-links-routes.test.ts` 24 条（含新 3 条）+ `blog-store/links-request.test.ts` 新 3 条全绿；三条新用例已实测在旧实现上先红；九项静态门禁绿（`size` 无需动基线）；`test:unit` 571 文件 5211 通过 / 1 skipped | 500 是上限而非分页，界面提示「只显示前 N 条」；demo 后端本无该端点 |
| 2026-09-30 | B3-04 ENG-04 搜索防抖 + 取消/序号线（含 `/check-slug`） | 1ea6a399 | `typecheck` 绿；`blog-store/posts-request.test.ts` 新 2 条绿；收尾 `test:unit` 571 文件 5211 通过 / 1 skipped（全绿） | 本条只覆盖文章列表；友链搜索的取消/序号线随 B3-03 补上，未加防抖 |
| 2026-09-30 | B2-05 COR-08 链接检测失败≠失效 + 缓存时效 + 批量删除条数 | 7dba4896 | `typecheck` 绿；`src/client/features/blog` 9 文件 28 条全绿（含新 2 条）；`i18n:check`/`hardcoded:check`/`comments:check` 绿 | 陈旧结果仍会展示（按计划要求标注而不丢弃） |
| 2026-09-30 | B2-03 COR-04 浏览计数改浏览器 beacon（前台 BF-1 待做） | 43243ee4 | `typecheck` 绿；`tests/blog-routes.test.ts` 47 条全绿；7 项静态门禁绿；`blog-frontend`：`npm test` 295 通过、`astro check` 仅 3 条既有报错 | 访客侧浏览器未执行 JS 时不再计数（取数路径不再代计）；作者自身访问的 `is_owner` 目前仍为 0（beacon 不带会话）；BF-1 未做 |
| 2026-09-30 | B2-04 SEC-14/COR-06/COR-03 流量开关单一真值 | 25fa85bf | `typecheck` 绿；`src/client/features/blog` 26 条全绿（含新 2 条）；`size:check` 因抽出派生值函数后通过 | 无 |
| 2026-09-30 | B2-02 COR-02 无基数不报 +100% | 93cf290d | `typecheck` 绿；`share-analytics`/`blog-routes`/`share-routes` 191 条全绿（含新 1 条） | 共用于 share，两侧回归都在跑 |
| 2026-09-30 | （附带）kanban 日历用例按日期定位格子 | 099adc59 | 该文件 7 条全绿；此前它是「既有失败」，且会随月末在本地门禁里反复变红 | 与本轮博客工作无关，单独提交 |
| 2026-09-30 | B2-01 COR-01/COR-05 删伪造统计 + 区间/累计分列 | 091a39eb | `typecheck` 绿；`tests/blog-routes.test.ts` 45 条全绿（含订正 1 条 + 新 1 条）；`i18n/hardcoded/comments` 绿 | 只删伪造而不修计数会让看板变「永久 0」，故与 B2-03 同批收尾 |
| 2026-09-30 | B1-10 SEC-10/11/12/13/15 头像不外发 + 鉴权兜底 + 自引荐真实值 + store 副作用 | d73bda36 | `typecheck` 绿；`test:unit` 5195 通过 / 1 失败（仍为既有 kanban 日期用例）；新增 2 条（自引荐、空头像）+ 新建 `blog-store/filters.test.ts` 2 条全绿；12 项静态门禁绿 | SEC-12 经核验在 B1-04 已修；SSR 不转发 referer，故该路径的 `is_self_referrer` 仍为 0（等 B2-03 的浏览器 beacon）；同左的既有 kanban 失败 |
| 2026-09-30 | B1-09 SEC-07 LIKE 转义 + 公开列表上限 + days 校验 | 15ce276a | `typecheck` 绿；本批 4 个 blog 测试文件 74 条全绿（含新 5 条）；12 项静态门禁绿；`size:check` 因 `posts.ts` 拆出 `post-list-query.ts` 通过 | 上限是天花板不是分页：超过 2000 篇时最旧文章从归档/标签计数掉出，已在条目内写明 |
| 2026-09-30 | B1-08 SEC-06 友链点击限流与状态守卫 | 1317e1d2 | `typecheck` 绿；`tests/blog-links-routes.test.ts` 21 条 + `tests/blog-public-owner.test.ts` 10 条全绿；12 项静态门禁绿 | 同一访客在同一链接上半小时只计一次，之后回 `counted:false` 而非 429（点击确实发生） |
| 2026-09-30 | B1-07 SEC-05 博文正文与标题的内容预算 | 8df97f23 | `typecheck` 绿；`tests/blog-routes.test.ts` 40 条全绿（含新 1 条）；8 项静态门禁绿 | 顺手补上 B1-06 漏掉的 `coverUrl` 协议白名单 |
| 2026-09-30 | B0 文档基线（review + plan） | — | —（无代码改动，静态门禁与单测不适用） | 报告结论全部落到 file:line；统计与性能量级为明示假设下的推算，未做 profiling；订正了前两轮报告的 8 条过时结论（review §三） |
| 2026-09-30 | B1-06 SEC-04 URL 协议白名单（共享谓词 + schema + 渲染兜底） | 已提交（见下一条回填） | `typecheck` 绿；`test:unit` 5187 通过 / 1 失败（仍为既有 kanban 用例）；新增 15 条（8 谓词 + 2 组件 + 5 契约）全绿；`comments/escape/empty-catch/module-state/deep-imports/style/size/hardcoded` 八项门禁绿（未动 size 基线） | 前台 BF-2 与 demo 后端不在本批；已有行里的不可渲染地址靠渲染兜底而非数据清理 |
| 2026-09-30 | B1-05 SEC-03 批量上限/分块/分组原子化（+ 修好评论批量改状态的编号 bug） | 已提交（见下一条回填） | `typecheck` 绿；本批四个 blog 测试文件 68 条全绿（含新 3 条）；`comments/escape/empty-catch/module-state/deep-imports/style/size` 七项门禁绿 | 与计划的 `.max(100)` 有意偏离（见条目内理由：SH-42 已有 120 条必须成功的用例）；同左的既有 kanban 失败 |
| 2026-09-30 | B1-04 SEC-09 站点设置单一键 | 00dbfa9d | `typecheck` 绿；`tests/blog-public-owner.test.ts` 10 条 + 相关 blog 测试全绿；七项门禁绿；同提交按 AGENTS「分批与门禁」只暂存了本批白名单分块（工作区保持最终态） | 已核实“全局键从未被写过”，故无数据迁移；B1-04 与 B1-05 的注释白名单同属一个文件，B1-05 一行在下一个提交回填 |
| 2026-09-30 | B1-03 SEC-08 slug 唯一性下放到 per-user（含表重建迁移 52） | 已提交（见下一条回填） | `typecheck` 绿；`test:unit` 5168 通过 / 1 失败（仍为既有 kanban 用例）；`tests/blog-slug-scope.test.ts` 4 条 + `tests/schema-migrations.test.ts` 新增遗留库重建用例全绿；6 个 blog/schema 测试文件共 75 条全绿；`comments/escape/empty-catch/module-state/deep-imports/style/size` 七项门禁绿 | **不可逆迁移**：部署侧必须先备份；`size:check` 基线只动了 `migrations.ts` 一行（793→801）；同左的既有 kanban 失败 |
| 2026-09-30 | B1-11 GATE-01 注释门禁扫描器改用 token 树 | 已提交（见下一条回填） | `npm run comments:check` 绿且总数 12191 → 12201（6 条被吞的重新纳入）；反向探针：往 `owned-rows.ts` 加一条未登记注释后门禁**报错**（非静默通过），移除后恢复绿；`typecheck` 绿；`test:unit` 5163 通过 / 1 失败（仍为既有 kanban 用例）；`tests/comment-scan.test.ts` 6 条全绿；七项静态门禁绿 | 修的是扫描器本身，不是博客模块；影响面为全仓注释白名单（已实测“正则可见 ⊆ AST 可见”，因此不会丢条目） |
| 2026-09-30 | B1-02 SEC-02 友链/分类归属守卫与导入重编号 | 已提交（见下一条回填） | `typecheck` 绿；`test:unit` 5157 通过 / 1 失败（仍为既有 kanban 用例）；`tests/blog-links-routes.test.ts` 15 条（8 旧 + 7 新）全绿；`comments/escape/empty-catch/module-state/deep-imports/style/size` 七项门禁绿 | 同左：那条 kanban 既有失败；另发现并记录 **GATE-01**（注释门禁扫描器被字符串里的 `/*` 骗过，仓内 10 条注释对门禁不可见），单独提交修 |
| 2026-09-30 | B1-01 SEC-01 公开 API owner resolver | 见下一条回填 | `typecheck` 绿；`test:unit` 5150 通过 / 1 失败；新增 45 条 blog 契约测试全绿；`blog-frontend` 295 通过；7 项静态门禁绿 | **两处既有失败，与本批改动无关，已核实非本轮引入**：① `src/client/lib/markdown/kanban/ui/kanban-view-rows.test.ts:156` 日历视图「新增于该日」产出 `2026-08-30` 而用例期望今天的 key（该文件与 kanban 源码均为未修改的 HEAD 状态，且与本批改动的 blog 模块无任何交集）；② `blog-frontend` 的 `astro check` 在 HEAD 上就有 3 条 `ts(2345)`（`music-player-video.test.ts:53/84`、`music-video-stage.test.ts:43` 的 `document.body.append(container)`），同为未修改文件。两者按 AGENTS.md §14 不夹带进本批，另开 issue 处理 |
