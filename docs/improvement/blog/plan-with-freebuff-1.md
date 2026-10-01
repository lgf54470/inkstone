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
- [x] B3-08 **ENG-09 + ENG-10** 写操作 refetch 定向收敛；友链批量删除走 `batch` 端点 — 已提交 `1e0e81ea`
  - 实现（ENG-09）：`updatePost` 不再固定重拉四个 loader——列表与记事索引永远重读（每一列都可能出现在那里），stats/tags/categories 只在 patch 触及对应聚合时才问：`isPinned` → stats、`isPublished` → stats、`folderId` → stats、`tags` → stats + tags、`categoryId` → categories（`GET /categories` 的 `postsCount` 是逐分类子查询）；标题类 patch 只重读列表与索引，等于省下原来每次 patch 都跑的标签全扫。`batchPosts` 同规则：`setCategory` → categories、`delete` → stats + tags、其余（publish/unpublish/setPinned/setFolder）→ stats；`deletePost` 一并补上 tags 重读（删掉某标签的最后一篇后 `stats.tagCounts` 不再提它，侧栏会回落到标签列表里那个过期的 `postsCount`，这是删文章唯一会漏的计数）。
  - 与 review 的差异（订正）：review 写「pin/title 不需要 stats 与 tags」——标题成立，**pin 不成立**：侧栏「已置顶」计数取 `stats.pinnedPosts`（`use-blog-hub-sidebar.tsx:244`），pin 确实移动一个计数，故保留 pin → stats；本条真正省下的是每次 patch 都跑的 `GET /tags`（JSON 全扫）与本来就不该问的 categories。
  - 实现（ENG-10）：store 新增 `batchDeleteLinks(ids)`（一次 `links.batch('delete', ids)` + 一次 `loadLinks`）；检测器的 `handleBatchDeleteLinks` 从逐条 `deleteLink` 改调它——删 20 条从 20 DELETE + 20 次全量重拉降到 2 个请求。选择集仍由调用方在成功后才清空（失败保留选择的行为不变），`batchBusy` 防重复提交。
  - `onSaved` 已是定向的：B3-05 起它走非强制 `loadHubData()`，只补当前 tab 且超过 30 秒窗口的作用域；mutation 自己已经把相关作用域盖章，所以它通常什么都不问。
  - 复现测试：新增 `blog-store/targeted-refresh.test.ts` 10 条（pin 不拉 tags、标题不拉任何计数、publish 拉 stats 不拉 tags、tags 补拉 tags、categoryId 只拉 categories、批量 setPinned/setCategory/delete 各自的作用域、`batchDeleteLinks` 单请求与失败不重拉）。实现前实测 **7 failed / 2 passed**（另 2 条锁的是旧实现已成立的行为）；再做一次「作用域恒为三项」的变异得到 **4 failed**。
  - 回归：`typecheck` 绿（顺手清掉 B3-06 遗留的未用 import `BlogCommentStatus`，它让 `tsc -b` 报错）；`src/client/features/blog` 19 文件 68 条全绿；九项静态门禁绿（`size` 未动基线）。
  - 已知限制：`savePost`（新建）仍是结构性全量（posts/stats/tags/postIndex）——新文章可以带来新标签；单篇删除后分类的 `postsCount` 仍要等下一次 `loadCategories`（未在本条扩面）。
- [x] B3-09 **ENG-11 + ENG-12 + ENG-13 + ENG-15** barrel 拆瘦让 lazy 生效 + 去 `icons` 全量 registry + qrcode 懒载 + geo/device 纯函数下沉；列表 `memo`/`useMemo`/窗口化；图片 lazy + 尺寸；link checker 批次 15 / abort / TTL / updater 纯净 / progressbar — 已提交（ENG-11/12/13/15，见进度日志）
  - ENG-12（已提交）：`BlogGridCard`/`BlogTableRow` 包 `memo` 且 prop 全部变稳（`onToggleSelect` 传 store action、`onOpenEdit` 用 `useCallback`、`cat`/`folder` 来自 `useMemo` 的 Map）；`use-blog-post-card` 两份菜单只在打开时构造；侧栏标签计数改一次后序遍历（`buildTagNodeCounts`）；store 的 `publishedNoteIds` 投影只在索引数组替换时重建；评论/友链改渐进渲染（首屏 100 行 + 显示更多）。复现测试 3 条；窗口测试变异 1 failed。限制：评论/友链行级 `memo` 未做（内联箭头与 bundle API），窗口是渐进渲染非滚动虚拟化。
  - ENG-13（已提交）：`PostCoverImage` 与评论头像补 `loading='lazy'` + `decoding='async'`，头像另补 `width/height=32`；封面不再写 `width/height`（容器已固定盒尺寸，写死会与真实比例冲突）；36px 表格缩略图仍取原图字节（无 CDN 尺寸变体，部署侧能力）。复现测试 `blog-grid-view/cover-image.test.ts` 2 条。
  - ENG-15（已提交）：批次改 15（服务端上限）；一次运行一个 `AbortController`，`handlePause` 停止即 abort 在飞请求，catch 先判 `signal.aborted || stopRequested.current` 再决定是否写 `error`（被停止的批次保留 `checking`，不产出没人测过的结论）；`api.blog.links.check` 增 `AbortSignal`；缓存写移出 `setResults` updater（`applyResults` 先算 next、同步 ref、再 set + 写缓存，updater 回到纯函数，顺序批次也能看到上一批的值）；进度条补 `role='progressbar'` + `aria-valuemin/max/now` 与可访问名（新 key `blog.link_check_progress` 双语）。TTL 已在 B2-05 落地。复现测试 `link-checker-run.test.ts` 3 条；两处变异（批次回 8、去掉 abort 分支）各 1 failed。
  - ENG-11（已提交，三处来源分别收口）：① **barrel 拆瘦**——`features/blog/index.ts` 只留静态消费者需要的 `blog-store` 与 `blog-note-submenu`，hub 与发布弹窗改由 `blog-hub-lazy.ts`/`blog-publish-lazy.ts` 导出**懒组件**（`blog-hub-modal`/`blog-links-view` 不再从 barrel 再导出）；note list 与侧栏仍引同一个 barrel（store 的那个 import 一行未改），但不再连带 hub —— 此前正是它让 `app-shell.tsx` 的 `lazy(() => import('../blog'))` 形同虚设。shell 侧改为静态引 `BlogHubModal`/`BlogPublishModal`（与 music 的 `music-hub-lazy.ts` 同一惯例），note row 的发布弹窗补 Suspense。② **图标去全量 registry**——`link-icons.ts` 静态导入 32 个预设（行渲染与 picker 默认网格不发请求），其余存储名经 `lucideSlugOf`（PascalCase 存储名 → kebab-case 模块名，映射由 `lucide-react/dynamic` 的 thunk 表推导）交给 `DynamicIcon` 逐个按需加载；picker 搜索改为对名字列表过滤、命中 48 个才加载这 48 个模块，值仍以 PascalCase 存储（前台解析路径不变）。③ **qrcode 懒载**——`link-qr-modal` 在 `blog-links-view/index.tsx` 里 `lazy()` + Suspense（沿用 SH-20 的注记），二维码面板不再随 hub 一起下载。另把 `countryFlag`/`countryNameLocalized`/`localizeDeviceName` 下沉到 `lib/visitor-geo.ts`（博客看板原来从 `features/share` barrel 引两个纯函数，把 share 的模态一并拖入），`features/share/share-helpers.ts` 改为再导出以保持既有导入不破。
  - ENG-11 验收（构建产物实测，非推算）：eager 静态闭包 **931.4 KiB / 14 chunks → 596.7 KiB / 28 chunks**（`budget:check` 上限 976.6 KiB 通过；未做排除前一度 1107.8 KiB 超预算）；`vendor-icons` **507.3 KB → 149.0 KB**；hub 与发布弹窗各自成 chunk（176.4 KB / 14.6 KB），qrcode 的 `esm-*` 仍只在 lazy 链上（`vendor:check` 绿）。复现测试 3 组 11 条（`link-icons.test.ts` 4、`link-dynamic-icon.test.ts` 4、`link-icon-selector.test.ts` 3）；两处变异：`lucideSlugOf` 改成直接小写 → 4 failed，picker 搜索改回只搜预设 → 2 failed。
  - ENG-11 代价与限制（已同步 review）：`vendor-icons` 分组必须排除 lucide 的 `dist/esm/icons/`，否则分组把全部图标并进一个静态可达 chunk（实测 688.0 KB、eager 1107.8 KiB）；代价是产物多出约 1700 个图标小 chunk，`pwa.config.ts` 因此把纯图标 chunk 排除出离线清单（否则 sw.js 40 KB → 90 KB、每次预热多 1700 次串行请求），未在线使用过的自定义图标在纯离线场景下不保证可取；行级 `memo` 与滚动虚拟化仍按 ENG-12 的限制未做。

## 批次 4 · UI / a11y / i18n / 令牌

- [x] B4-01 **UI-01** `text-white` 与裸调色板收敛到令牌 + `--update-baseline` + `contrast:check` 实测两套主题 — 已提交 `07f9351f`
  - 实现：13 处 `text-white` → `text-[var(--accent-contrast)]`（accent 底），实体状态底新增 `--success-on`/`--danger-on`（浅色白字、深色深墨，与 `--accent-contrast` 同值同翻转；不加未使用的 `--warning-on`）。12 处裸调色板收敛：amber → `--warning`/`--warning-soft`、`bg-emerald-500/90` → `--success`/`--success-on`、`bg-stone-600/80` → `bg-[var(--bg-overlay)]/90`+`--text-secondary`、评论状态徽标改用共享 `Badge`（顺带消掉两处失效的 `dark:` 变体）、`bg-black/20` → `--accent-contrast`/20、二维码底板 → `--swatch-white`。
  - 验收：`check-hardcoded.palette-baseline.json` -11 条（模块内 11 文件归零）；`tokens:check` 未动共享契约（新令牌客户端私密，89 tokens 不变）；`contrast:check` 两套主题×桌面/手机宽度通过；视觉门禁 682 通过；`tsc -b` 绿；blog+share 81 文件 356 条全绿。
  - 限制：share 侧 SH-32 与本模块外的实体 warning 底（`attachments/attachment-grid-view.tsx:175` 浅色下 2.94:1）不在本条范围，已记在 review。

- [x] B4-02 **UI-02 + UI-03** 四处日期本地化 + 硬编码文案改 message id（含 `col_created_at` 表头语义修正）— 已提交 `7bd424f6`
  - 实现（UI-02）：`lib/time.ts` 新增 `formatDate(ts)`（本地化「月/日」，跨年才带年份；`0`/非有限值输出空串——草稿的 `publishedAt = 0` 因此不再渲染成 1970），`formatDateKey()` 改为复用同一条日规则。四处调用点：`pending-comments-card` → `shortTime`（与同页访问日志一致）、`blog-comments-view` → `fullTime`（原 `toLocaleString()` 的日期+时间语义不变）、网格卡与表格行的 `publishedAt` → `formatDate`。网格卡与表格行是 B3-09 的 `memo` 组件，props 全稳、语言切换本来到不了它们（行内其它 `t()` 文案同理），各自补 `useLocaleRepaint()`；卡片外壳类名顺带提为 `cardShellClass()`，函数从 53 行落到 48 行、不动 size 基线。
  - 订正（UI-02 的表头语义）：经 `git show` 核验，`blog.col_created_at` 的双语值在 review 基线（`ff2ab047`）与当前树上都是「发布时间 / Published At」，与 `row.tsx` 渲染的 `publishedAt` 一致——review 里「表头写创建时间」的前提不成立，本条不做文案改动（键名是历史遗留，重命名无用户可见收益）。
  - 实现（UI-03）：`'TOP 10'` → `blog.top_posts_limit`；`'PV'` → 复用既有 `blog.col_views`；`🤖` 徽标的 `'Bot'` → `blog.bot_fallback`；浏览器/OS 的 `'Other'/'other'` 与空列 → 新增 `blog.env_unknown`；`'Inkstone Blog'` → `blog.default_site_name`（仍只作为落库的站点名默认值）；分类树前缀 `'  └ '` 三处 → `blog.tree_branch_prefix`（结构字符，双语刻意同值，只做外置）。服务端语义值不再直出：`lib/visitor-geo.ts` 新增 `localizePlatformName(name, fallback)`——UA 解析器读不出时写 `'Other'` 哨兵，它不是名字；share 的 `localizeEnvName()` 改为调用同一实现，重复逻辑只剩一份。
  - 验收：`tsc -b` 绿；`test:unit` 588 文件 5281 通过 / 1 skipped；新增 5 条（`time.test.ts` 3 条 `formatDate`、`visit-logs-card.test.ts` 2 条设备标签）；两处变异分别实测 3 failed / 1 failed（`formatDate` 恒带年份、`localizePlatformName` 直接回值）；九项静态门禁 + `surfaces` 绿（`size` 未动基线，`i18n:check` 双语 5 键已补）。
  - 限制：`check-i18n.mjs` 仍拦不住「JSX 里新增裸英文」这类回归（review 建议的英文词表属独立改动，未夹带）。
- [x] B4-03 **UI-04 + UI-05** 表单迁移到 `Field`（htmlFor / aria-describedby）+ `Switch` 补 label + slug 不可用阻断 + 五套分段控件收敛 `Segmented` — 已提交 `bc9ca68c`
  - 实现（UI-04 发布弹窗）：自造 `FieldLabel`/`FieldNote`/`PublishSelect` 删除；标题、slug、封面、文件夹、分类、摘要迁 `Field`（自动 wire `htmlFor`/`aria-labelledby`/`aria-describedby`，`Input invalid` 同时给 `aria-invalid` 与红边）；slug 的「可用/不可用 + 预览地址」整体进 `Field` 的 `hint`，错误因此与输入框关联而不是并排一句；封面的「使用首图」从标签行移到字段下方（保留文字按钮）；标签区是多元件组（建议芯片 + 已选芯片 + 输入），改用 `fieldset`/`legend` 并给输入框自己的可访问名，而不是用一个 `Field` 只名中三者之一；两个 `Switch`（置顶、允许评论）补 `label`。
  - 实现（UI-04 设置弹窗）：`SettingsField` 删除改 `Field`（前端地址的提示文字改走 `Field` 的 `hint`）；裸 `<input type="number">` 改 `Input type='number'` 并用 `useId` + `aria-labelledby` 指向可见标题；4 个 `Switch`（3 个排除开关 + 评论审核）补 `label`。
  - 实现（UI-04 slug 阻断）：新增导出 `slugSaveNotice(slug, slugAvailable, slugReason)`（与 `parseBlogCleanDays` 同一惯例：规则可测，保存路径不测）；`savePublishedPost` 用它取代原来的「空 slug 提示 + 直接发请求」；`useSlugValidation` 在 slug 变化时把上次答案重置为 `null`，所以 `false` 永远属于当前值，阻断不会拿旧答案卡住新值。
  - 实现（UI-05）：五套手搓分段控件收敛到 `Segmented`（radio 语义 + 方向键）：hub 工具栏的状态筛选与视图切换（图标选项用 `option.title` 自带可访问名与 tooltip）、评论状态筛选（计数徽标进 label）、友链状态筛选（6 项）、链接检测结果筛选（5 项，分档颜色保留）；新增 5 个组名 key（`status_filter_label`/`view_mode_label`/`comment_status_filter_label`/`link_status_filter_label`/`link_check_filter_label`）。视觉变化：选中态由强调色实底改为 `Segmented` 的中性表面底；pending 徽标不再随选中变色（原来依赖 active 态的条件样式）。
  - 验收：`tsc -b` 绿；`test:unit` 591 文件 5287 通过 / 1 skipped；新增 6 条（slug 守卫 4、工具栏两个 radiogroup 与图标选项名 1、发布弹窗标签 wired 1）；三处变异分别实测 2 / 1 / 1 failed（去掉 slug 守卫、去掉状态组组名、`Field` 去掉 `htmlFor`）；九项静态门禁 + `surfaces` 绿（`size` 未动基线）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过（含 hub 的 axe 与对比度读数）、`check-contrast.mjs` 通过。
- [x] B4-04 **UI-06 + UI-07** 键盘可达（单击 / 回车）+ 排序 UI + 表 `caption`/`scope`；hover-only 改 `focus-visible`；批量条窄屏；四个 Modal 补可访问名 — 已提交 `cc066e7b`
  - 实现（UI-06 键盘与表语义）：标题在表格行与网格卡里都是真的 `<button>`（一次单击、或聚焦后回车，即进入编辑），两处的 `onDoubleClick` 一并删除——双击对键盘与触摸都不可达，而且不指向任何可命名的控件；表格补 `<caption className='sr-only'>`（新 key `blog.posts_table_caption`）与每个 `<th scope='col'>`；全仓此前无调用点的 `setSort` 接上工具栏新增的 `Select`，取值就是服务端 `postListOrderSql` 认得的三个（`published_desc`/`published_asc`/`views_desc`，新 key `blog.sort_label`/`sort_newest`/`sort_oldest`/`sort_views`）。
  - 实现（UI-07）：侧栏两个分区标题的「新建」按钮与网格卡的置顶按钮原本是 `opacity-0 group-hover:…`——聚焦时仍不可见（键盘能 Tab 到，却看不到）；改为同仓 `ROW_ACTION_CLASS` 的既有写法（`opacity-100 transition-opacity md:opacity-0 md:group-hover…:opacity-100 md:focus-visible:opacity-100`）：手机常显（那里没有 hover 可揭示）、桌面悬停显示、聚焦必然显示。批量条由 `left-1/2 -translate-x-1/2 … whitespace-nowrap` 改 `inset-x-4 mx-auto w-fit max-w-full flex-wrap`：仍在底栏之上（不是 AGENTS 明列需要改位置的场景），但窄屏换行而不是把后面几个控件推出屏外。四个自绘头部、自绘关闭按钮的弹窗给 `Modal` 传 `ariaLabel`（hub / publish / settings / categories，publish 随编辑态在「发布」「编辑」之间换名），读屏不再只听到通用 dialog 名。`BlogHubModal` 抽出 `HubSecondaryDialogs`（三个二级弹窗）把主函数保持在 50 行内，未动 `size` 基线；顺手补上 B4-03 留的口子——`blog-categories-modal.tsx` 自造的 `CategoryField`（`<label>` 无 `htmlFor`）改 `Field`，颜色选择器改 `fieldset`/`legend`（一组按钮只能由 legend 命名，`Field` 会把 label 指向包着它们的 `div`）。
  - 验收：`tsc -b` 绿；`test:unit` 595 文件 5298 通过 / 1 skipped；新增 11 条（表 caption/scope 与标题按钮 2、网格标题按钮与置顶可聚焦 2、侧栏新建可聚焦 1、工具栏排序落库 1、四个弹窗可访问名 5）；四处变异各实测 1 failed（排序 onChange 不回传取值、表首 `<th>` 去 `scope`、设置弹窗去 `ariaLabel`、侧栏去 `focus-visible` 臂）；九项静态门禁 + `surfaces` 绿（`size` 未动基线，`comments` 白名单重建 1323 文件 12636 条）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过（含 hub 的 axe 与命名读数）、`check-contrast.mjs` 通过。
  - 限制：双击打开是既有行为，本批按 review 的建议改成「单击标题进入」——手势只剩一个，且它落在有名字的控件上；排序入口在工具栏（表头点击式排序未做，网格视图没有表头）；批量条仍是覆盖在内容之上的一条浮条，只是允许换行，没有改成独立横条；置顶按钮在手机上现在常显（这是刻意的，而非 hover 的视觉偏好）。
- [x] B4-05 **UI-08 + UI-13** 单条评论审核与分类 CRUD 反馈 + `copyText()` 共享（含 QR 与列表复制）— 已提交 `39a3814a`
  - 实现（UI-13）：新增 `src/client/lib/clipboard.ts` 的 `copyText(text, toast, successTitle?)` —— 复制失败（权限被拒、非安全源、无 API）与成功一样出声：失败一条共用提示（`common.action_failed`），成功用调用方给的句子或 `common.copied`。三处收敛：`use-blog-post-card.tsx` 的 `copyPostLink` 改为调它（原本已是正解，现在只是复用）；`blog-links-view/index.tsx` 的右键复制由 `void navigator.clipboard.writeText(...)` 改为 `void copyText(...)`；`link-qr-modal.tsx` 的勾号只在复制**成功**后出现（原本失败也静默），`setTimeout` 句柄在卸载时清掉。
  - 实现（UI-08 评论）：`use-blog-comments-view.ts` 新增 `statusBusyIds` 与 `handleStatusChange`——写入期间该行三个状态按钮一起禁用，成功才出成功提示（失败提示依旧由 store 层的 `runBlogMutation` 发，那里持有错误本身，避免双 toast）；`blog-comments-view.tsx` 的 `CommentCardBundle` 从 `(id,status)=>void` 改为返回 `Promise<void>` 并带 `isStatusBusy`；`pending-comments-card.tsx` 的两颗按钮同样按状态行级 busy（`aria-busy`）且成功才报。新 key `blog.comment_status_updated`。
  - 实现（UI-08 友链分类）：`link-category-modal.tsx` 的删除确认不再复用「删除友链」的文案（新 key `blog.confirm_delete_link_category`，点名分类并说明子分类上移、友链变未分类，与服务端删分类的三条语句一致）；创建/保存/删除各自出成功提示；`busyId` 逐层传到根分类与子分类行，写入期间该行的编辑/删除与行内保存/取消一起禁用（保存按钮带 loading）。为守住函数行数，三个动作抽到模块级 `saveCategoryEdit`/`createCategoryFromForm`/`deleteCategoryFlow`（传 ctx），`useCategoryModalState` 回到 50 行内，`size` 基线未动。
  - 验收：`tsc -b` 绿；`test:unit` 600 文件 5309 通过 / 1 skipped（含本批新增的 5 个文件共 12 条，另有一条满负载下的 5s 超时——本轮落在 `tests/music-routes.test.ts`、上一轮落在 `blog-comments-window.test.ts`，两者单独运行均通过，与改动无关）；六处变异各实测（`copyText` 失败分支返回 true→1 failed+QR 1 failed、评论成功提示去掉→1 failed、待审卡 busy 去掉→1 failed、分类确认文案回退→1 failed、分类成功提示去掉→2 failed）；九项静态门禁 + `surfaces` 绿（`size` 未动基线）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过。
  - 限制：失败提示仍由 store 层统一发（因此这里只补成功侧，不是两个 toast）；批量审核与批量删除沿用原有的 `batchBusy` 整条禁用，未做行级；类别删除的角色只是确认框与提示，服务端的级联语义未变。
  - 附带（单独提交 `85702071`）：跑 `test:unit` 时发现 `kanban-day-move.test.ts` 看板写死在 2026-09、而日历开在 `new Date()` 所在月，时钟一进十月必然 6 条失败（已在 HEAD 上复现），按仓库惯例单独一个 `test(kanban)` 提交钉住时钟，不属本批。
- [x] B4-06 **UI-09 + UI-10** 复制 / 二维码 / 检测行内入口 + `link-context-menu` 改用共享 `Menu`；导入导出丢数据 / 英文报错 / CSV 回环 — 已提交 `4a13c62d`
  - 实现（UI-09）：每行新增「更多操作」`IconButton`（`aria-haspopup='menu'`、`aria-expanded` 随面板开合、打开时 `highlight`），它打开的就是右键那一张面板——复制 / 二维码 / 检测不再只能靠右键找到，键盘也能到（此前这三项对指针用户不可发现、对键盘用户完全不可达）。面板整体换成共享 `Menu`：`role='menu'` + 光标漫游 + 方向键打开子菜单 + ESC / 点击外部关闭 + 焦点归还，分类子菜单不再是「只靠 hover」的自绘层。新增导出 `linkMenuAnchorPoint(event)`：指针右键用事件坐标，键盘 `contextmenu`（上下文菜单键 / Shift+F10，部分浏览器报 0,0）回退到触发元素的盒子——原先这种事件会把面板钉在页面左上角。面板仍由 `use-blog-links-view.ts` 的状态打开（按钮与右键两个入口），没有换用 `useContextMenu`：那个 hook 只存一个坐标点，而这张面板还要带行数据与分类树。
  - 实现（UI-10）：文本处理整段外置为 `link-import-format.ts`（纯模块，可在 jsdom 里直接驱动），弹窗只剩控件。可选文件先过 `importFileRejection()`（扩展名 `.json/.csv/.html/.htm` + 2 MB 上限，`accept` 只是提示），读失败与格式不符各有本地化提示；`file.text()` 有 catch，且读取前先复位 input（同一文件选两次仍会触发 `change`）。JSON 解析包进 `ImportParseError`（携带 message id，不再把 `SyntaxError` 的英文原文塞进 toast）。缺名称或缺 URL 的条目在发送前丢弃并计数、随后单独提示跳过条数（服务端按整批 zod 校验，留下一条会让整批 400），全空则提示「没有可导入的条目」。CSV 读出改为引号感知（`parseCsvRows`，逗号 / 引号 / 换行 / CRLF 都按 RFC 4180 风格处理），因此能读回自己导出的含逗号字段（此前 `split(',')` 读自己的产物就错位）；HTML 导出改走全深度遍历 + 兜底写出未被任何分类认领的友链，导出说明里的计数与文件内容一致（原先只写 root 及其一层子分类，未分类与更深层被静默丢弃而成功提示仍报全量）。新键 8 个（`invalid_json`/`nothing_to_import`/`skipped`/`wrong_type`/`file_too_large`/`read_failed`/`more_actions`/`menu_label`，双语）。
  - 验收：`tsc -b` 绿；`test:unit` 602 文件 5327 通过 / 1 skipped；新增 3 个测试文件共 17 条（`link-import-format.test.ts` 8、`link-context-menu.test.ts` 7、`link-card-row.test.ts` +2，模块内 40 条全绿）；两处变异各实测 1 failed（CSV 读取关掉引号分支、跳过计数不再过滤空条目）；十一项静态门禁 + `surfaces` 绿（`size` 未动基线，`comments` 白名单重建 1335 文件 12705 条）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过（同一实例；起实例前先杀掉上一会话遗留的已初始化实例，否则 e2e 的「全新未初始化」前置必然失败）。
  - 限制：复制 / 二维码 / 检测在面板里而不是三颗独立行内图标（review 允许的两种做法之一）；面板是应用内 `Menu`，不是浏览器原生上下文菜单，右键长按（触屏）仍不会打开它；CSV 读取覆盖引号 / 嵌入逗号 / 嵌入引号 / CRLF，未处理转义引号外的其它边缘；导出的 JSON 形状不变（仍是服务端导入契约认得的字段）。
- [x] B4-07 **UI-11 + UI-12** 「实时访问日志」文案与时间窗 + 服务端语义值本地化 + 图表 nice-ceiling 与比例（共用于 share，双覆盖）— 已提交（hash 由下一提交回填，见进度日志）
  - 实现（UI-11 文案与时间窗）：取 review 的文案方案而不是给查询加区间——这张卡是新到旧的 `LIMIT 20`，既无区间也无轮询，所以标题从「实时访问日志 / Real-time Access Logs」改为 `blog.recent_visits_title`（最近访问 / Recent Visits），副标题 `blog.recent_visits_count` 改成「最新 20 条 · 不受上方时间范围影响」（它就在一张按区间过滤的看板里，读者得知道这一张不跟着变）；未给查询加区间与轮询，因为那会把一张概览卡变成第二个区间视图，而 review 两种做法都接受。
  - 实现（UI-11 语义值）：`localizeReferrerName()` 从 `share-helpers.ts` 移到 `lib/visitor-geo.ts`（与 `countryFlag`/`localizeDeviceName` 同处，share 侧改为再导出），博客的 `TrafficSourcesCard` 用它——`'Direct'` 是 worker 对「没有引荐来源」的哨兵，不是站点名，此前博客看板把它当渠道名直出；`audience-cards.tsx` 自带的 `deviceNameOf()` 改为直接调 `localizeDeviceName()`，重复映射去掉一份。
  - 实现（UI-11 借用的 key）：review 点名的两个迁到 `blog.*`——`share.filter_stats_summary` → `blog.filter_stats_summary`（看板过滤横幅）、`share.view_note_analytics` → `blog.view_note_analytics`（行/卡菜单）。仍留在 share 资源里的访问模型词汇（`share.direct_access`、`share.device_*`、设置弹窗与过滤浮层用的 `share.filter_*`/`share.retention_*`）**刻意不迁**：它们描述的是同一套访问模型与同一组控件，两个界面都要用；`visitor-geo.ts` 本来就在引同族 key（`share.country_unknown`/`share.device_*`），这是既有约定而非新债，已在本条记下。
  - 实现（UI-12 图表）：新增导出 `chartAxisTicks(peak)` —— 先取 1/2/5×10ⁿ 的天花板，再按 5 / 4 / 2 选一个能整除的等分（都能除不开时只画首尾两条），因此每条网格线都有不同的数字；旧画法把峰值四等分后四舍五入，峰值为 3 时读作 1/2/2/3、为 1 时整轴 1/1/1/0（用户截图）。几何改用该天花板，峰不再被拉到顶线；`ChartGridLines` 按刻度值作 key，`ChartDots` 按时间点标签作 key（原先两份都靠 index）；`preserveAspectRatio` 由 `none` 改 `xMidYMid meet`：前者按两轴不同比例拉伸，圆点被压成椭圆、字号也走形（容器是固定高度 + 全宽，改用 meet 后按比例居中，不再变形）。
  - 验收：`tsc -b` 绿；`test:unit` 602 文件 5332 通过 / 1 skipped；新增 5 条（图表 4：刻度唯一性 / 天花板取值 / 画出的标签无重复 / 比例属性，受众卡 1：`Direct` 本地化）；三处变异共实测 5 failed（网格回旧四舍五入、比例属性回 `none`、渠道名回原值）；十项静态门禁（含 `tokens:check`）+ `surfaces` 绿（`size` 未动基线，`comments` 白名单 1337 文件 12713 条）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过（同一实例）。
  - 限制：图表只是换比例，没有做滚动/缩放；`meet` 在极宽容器里会在两侧留白（不再拉伸）；`chartAxisTicks` 的刻度只到六条（五等分），高基数数据仍是同一条曲线；「最近访问」仍是固定 20 条、不随区间变化——这是刻意的（文案已说明）。

> 批次 4 完成：B4-01…B4-07 共 7 项全部提交（对应 review 的 UI-01…UI-13），各项落地与限制见上，逐次回归与 hash 见进度日志。

## 批次 5 · 功能补齐（roadmap）

按 `FEA-01 → 02 → 03 → 04 → 06 → 07 → 09 → 10 → 11 → 05 → 08 → 12` 顺序；每项开工前确认，触及公共契约或数据形态的（FEA-05 版本历史、FEA-10 分类/标签统一）各自单开 ADR。

- [x] B5-01 **FEA-01** 发布时间可设 + 定时发布 — 已提交 `a7febb96`
  - 实现（写入侧）：`schemas.ts` 的 `publishedAt`（int、0..3000-01-01，非法值 400）；新增 `publish-moment.ts` 集中两条规则：`resolvedPublishedAt(body, current, now)` —— 显式时间优先（定时与回填就是它），否则草稿发布盖「现在」、已发布行保持原时刻；`insertBlogPost` 用 UI 选定的时间、`updateBlogPost`（POST /posts 的 upsert）与补丁路由改用它；批量发布（`posts.ts` 与 `organizer.ts` 的按文件夹/标签发布）用 SQL `published_at = CASE WHEN is_published = 0 THEN ? ELSE published_at END`，因此草稿盖时间、已发布行不被重写。
  - 实现（读取侧）：`publicPostVisibleSql(alias)` 把「已发布且时刻已到」变成一段可复用 SQL（`publishReachedSql`），公开列表/详情/相邻篇/分类计数/标签/时间轴/日历与评论读写路径（提交评论、拉评论列表）全部改用它——定时中的文章对读者完全不存在。比较写进 SQL 而不是多传一个绑定，每个查询不用重编自己的占位符编号。**踩过的坑**：`strftime('%s','now')` 只到秒，直接与毫秒比会把「刚刚发布」的文章隐藏最多一秒（`blog-slug-scope` 的即时发布用例在改后先红），因此比较写成 `< (now_seconds + 1) * 1000`，并补了一条「刚发布即可见」的回归。
  - 实现（客户端）：`lib/time.ts` 新增 `toDateTimeLocalValue`/`fromDateTimeLocalValue`（控件说本地时间、存储说 epoch 毫秒）；发布弹窗新增「发布时间」`Field`（`datetime-local`），从 `postIndex` 的 `publishedAt` 预填（共享类型与 worker 索引列因此加上该字段，demo 后端同步），留空即交给服务端默认规则，选中未来时刻时提示改为「将定时发布」。新键 3 个（`publish_time_label`/`_hint`/`_scheduled`，双语）。
  - 验收：`tsc -b` 绿；`tests/blog-routes.test.ts` 62 条（含新 6 条：定时不可见、草稿发布盖时间/已发布不变/重新发布再盖、显式定时与回填、批量只盖草稿、非法值 400、刚发布即可见）；`blog-slug-scope` 与 `blog-public-owner` 的种子改为「真实过去」（阅读侧按真实时钟判定，`H.now` 是 2033 的确定性时间戳，规则会正确地把它当定时）；两处变异实测 1 / 3 failed；`test:unit` 复跑 602 文件 5341 通过 / 1 skipped（首轮 1 条满负载超时，后续两次全绿）；十项静态门禁（含 `tokens:check`）+ `surfaces` 绿（`size` 未动基线，comments 白名单 1338 文件 12744 条）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过。
  - 限制：作者的列表/统计仍把定时中的文章计入「已发布」（从作者视角它已经不在草稿状态），没有单独的「定时中」徽标或计数；定时不是后台任务（到点可见靠每次查询的实时比较，无需 cron）；弹窗的时间控件精度到分钟（与 `datetime-local` 一致），没有时区选择（按读者本地时区解释，存储为 UTC 时间戳）。
- [x] B5-02 **FEA-02** 文章级 SEO 字段（metaTitle / description / ogImage / canonical / noindex）— 已提交 `dec6d254`
  - 实现（数据形状）：`blog_posts` 追加 5 列（`seo_title`/`seo_description`/`seo_image_url`/`seo_canonical_url`/`seo_noindex`，均 NOT NULL DEFAULT）。声明形状与迁移两处单一来源：新库由 `blog-posts.ts` 的建表语句带出，老库由迁移 **54**（`skipIfColumnExists: seo_title`）补列——**没有改迁移 52**：它已应用，且它的建表与拷贝都来自同一个声明常量（重建的 `INSERT … SELECT` 明确列出列名，追加的列自然取默认值）。`checks.ts` 的 `REQUIRED_COLUMNS.blog_posts` 同步，所以全新库与升级库都被 `assertFinalSchema` 检查。
  - 实现（写入）：`blogPostWriteSchema` 新增 5 个字段（标题/描述沿用既有上限，两个地址走共享 `safeUrl` 白名单，noindex 是布尔）；`PostWriteInput`、`postInputFromBody`、`insertBlogPost`、`updateBlogPost`（`POST /posts` 的 upsert）与 `blogPostPatchStatement` 全部带列。补丁只在**显式给了该字段**时改写（`body.seoImageUrl !== undefined`），因此「清空」是一次显式空串，而「不提及」保持原值。
  - 实现（读取）：`POST_LIST_COLUMNS`/`POST_INDEX_COLUMNS` 带上这 5 列，共享类型 `BlogPost`（及其派生的 summary/index）带上字段，映射统一走 `toBlogSeoFields()`（worker 侧唯一一处 `'' ↔ false` 约定），因此列表与 `/post-index` 都能预填发布弹窗。
  - 实现（公开侧）：文章详情答案（`GET /api/blog/public/posts/:slug`）带这 5 个字段，公开列表**刻意不带**（卡片不需要，列表保持瘦身）——已有断言钉住这条边界。
  - 实现（客户端）：发布弹窗新增「搜索与分享」分组（`blog-publish-modal/seo-fields.tsx`：标题/描述/分享图/规范链接四个 `Field` + 一个 noindex `Switch`），全部从被编辑的文章预填，留空即交给服务端按「用文章自己的值」处理；新键 7 个（双语）。
  - 实现（前台）：`blog-frontend` 文章页按同一优先级渲染。新增纯函数 `src/lib/seo.ts` 的 `resolvePostSeo(post, pageUrl)`（title/description/image 逐个回退到文章自身，canonical 缺省取当前地址，noindex 缺省关），`Layout.astro` 新增 `canonicalUrl`/`noindex` 两个可选属性（缺省行为与从前一致）。
  - 验收：`tsc -b` 绿；`tests/blog-routes.test.ts` 65 条（含新 3 条：写入→列表/索引/note-post/补丁的往返与「不提及即保持」、非法地址与超长的 400、公开详情有而公开列表无）；`tests/schema-migrations.test.ts` 新增 1 条（把 5 列从表上 DROP、删掉 v54 与状态指纹后重跑，断言列补回且原有文章不丢）；客户端 2 条（预填渲染 + 载荷映射，另抽 `postWritePayload()` 让映射可单测）；前台 `tests/seo.test.ts` 4 条；五处变异各实测 1/1/1/2/2 failed；`test:unit` 602 文件 5348 通过 / 1 skipped；十一项静态门禁 + `surfaces` 绿（`size` 仅 `migrations.ts` 810→827 重建基线，其余靠拆分：批量 SQL 抽成 `posts-batch.ts`、`SeoFields` 拆三段、发布表单的字段袋改为整对象传递；comments 白名单 1341 文件 12782 条）；`blog-frontend` `npm test` 299 通过、`lint` 通过、`astro check` 仍只有既有的 3 条 music 测试 ts(2345)；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过。
  - 限制：前台只有文章页吃这些字段——`sitemap.xml` 不排除 noindex 文章、也没有 `lastmod`（属 FEA-08/BF-6），RSS 与其余 OG 标签（og:type、twitter:card）未加；后台没有「已 noindex」的列表徽标或计数；SEO 描述与摘要共用同一上限（2000）；canonical 允许站内相对路径（多用户前缀落地后由 BF-4 决定缺省值）。
- [x] B5-03 **FEA-03** slug 变更 301 重定向表 — 已提交 `2d1d51de`
  - 实现（数据形状）：新增 `blog_post_slugs (post_id, user_id, slug, created_at)` + `idx_blog_post_slugs_user_slug`（唯一：一个退役地址在一个博客里只指向一篇）/`idx_blog_post_slugs_post`；声明形状与迁移 55 单一来源，`checks.ts` 的表/列/索引名单同步。
  - 实现（写入）：新增 `slug-history.ts`：`claimSlugStatements()` 负责「拿到一个 slug 就等于它又是一个活地址」——把该地址上任何重定向行删掉（另一篇早先退役的、本文自己改名回来留下的、以及**新建文章**直接占用一个退役地址）；`renameSlugStatements()` = 退役旧地址（`INSERT OR REPLACE`）+ 占用新地址。三条写入路径（`POST /posts` 的 upsert、新建、`PATCH /posts/:id`）把这对语句与写本身放进**同一个 batch**，因此不会出现「改了名但没有历史」或「历史指向一个从没释放的地址」。删除路径（单篇与批量）一并删掉该文章的历史行。
  - 实现（读取）：`GET /api/blog/public/resolve-slug/:slug` 回答该退役地址当前所属文章的 slug 或 null；查询 JOIN 文章并套用 `publicPostVisibleSql()`——目标未发布/定时中时回答 null（把读者送到一个「什么也没有」的页面比 404 更糟），且按 `user_id` 限定，别的博客的历史不影响本博客。
  - 实现（前台）：新增纯函数 `post-redirect.ts` 的 `redirectTargetFor(requested, current)`（同一地址或没有答案 → null，保持 404）；文章页在找不到文章时先问一次 resolve，拿到不同地址就 `Astro.redirect(target, 301)`，否则仍是真实 404；`api.resolveSlug()` 失败时返回 null，不猜目标。
  - 验收：`tsc -b` 绿；`tests/blog-routes.test.ts` 71 条（含新 6 条：退役地址指向当前地址、新文章占用退役地址后不再重定向、目标不可读时不重定向、upsert 路径也记录、跨账号不串、删除（单篇 + 批量）后历史清空）；前台 `tests/post-redirect.test.ts` 3 条；四处变异各实测 1/1/1/1 failed——**其中一处变异就是本轮真实踩到的 bug**：只删「改名时的新地址」而不删「新建文章占用退役地址」时，那条用例先红；`test:unit` 602 文件 5354 通过 / 1 skipped（另有一次满负载下 1 条超时，重跑全绿）；十一项静态门禁 + `surfaces` 绿（`size` 仅 `migrations.ts` 827→843）；`blog-frontend` `npm test` 302 通过、`lint` 通过、`astro check` 仅既有 3 条；**真机端到端验证**：本地 :7712 实例注册账号→建文（slug `alpha`）→改名 `beta`，直接查 API 得 `{"slug":"beta"}`；再用 `blog-frontend/.env` 把前台指向 :7712，`GET /posts/alpha` → **301，`location: /posts/beta`**，`/posts/beta` → 200，`/posts/never-existed` → 404（验证后已删除该 .env 并停掉全部 dev 进程）。
  - 限制：`/check-slug` 不会告诉作者「这个地址正指向另一篇文章」（占用后那条重定向会按设计消失）；历史只在改名/删除时维护，直接改库不受保护；前台只处理文章地址，分类/标签改名仍会 404。
- [x] B5-04 **FEA-04** 文章回收站（软删 + 还原）— 已提交 `96a5574c`
  - 实现（数据形状）：`blog_posts` 追加 `deleted_at INTEGER`（NULL = 活着），迁移 **56**（`skipIfColumnExists: deleted_at` 守卫，只加列 + 回收站索引）；声明形状与 `idx_blog_posts_user_deleted` 同源，迁移 52 一字未改（它的 `INSERT … SELECT` 显式列名，追加列自然取 NULL）。`checks.ts` 的列名单同步。
  - 实现（写入）：`DELETE /posts/:id` 与批量删除都改为**软删**（只写 `deleted_at`，行、评论、退役地址、访问历史全部留下）；新增 `src/worker/routes/blog/trash.ts` 四条路由——列表（无分页、带 `deletedAt`、不带正文）、还原、彻底删除、清空。真正的删除只在回收站路径发生：`posts-batch.ts` 的 `blogPurgeStatements()` 按 `blog_comments` → `blog_visits` → `blog_post_slugs` → `blog_posts` 顺序一次 batch，且 purge 前先把 id 过滤成「仍在回收站」——活文章的 id 绝不能进这批语句（否则会先删掉它的评论）。
  - 实现（读取）：`publicPostVisibleSql()` 增加 `deleted_at IS NULL`，公开侧全部路径（列表/详情/相邻篇/分类/标签/时间轴/日历/评论/beacon/slug 解析）一并生效；作者侧文章列表与总数、`/post-index`、汇总计数、文件夹与标签计数、分类 `posts_count`、评论列表与计数、按文件夹/标签批量发布、`stats` 全部加活行过滤；`stats` 新增 `trashedPosts`，侧栏回收站徽标读它。补丁与同步对回收站里的文章一律 404；但按 `noteId` 再发布会**复活**同一篇（与 demo 后端同规则），不会让一条笔记留下两篇。
  - 实现（客户端）：store 增 `trashPosts` 与 `loadTrash`/`restorePost`/`purgePost`/`emptyTrash`（`BlogLoadScope`/`BlogDataScope` 增 `trash`，失败进 `loadErrors`）；hub 新增「回收站」tab 与 `blog-trash-view`（三态：加载 / 失败 + 重试 / 空；行内还原与彻底删除、工具栏清空，都走确认弹窗与成功提示）；删除、批量删除与复活后按作用域补刷回收站。demo 后端同步（`trash` 数组 + 三条路由 + 删除改移入 + 按 noteId 复活），`blog-smoke.test.ts` 覆盖新端点。
  - 验收：`tsc -b` 绿；`tests/blog-routes.test.ts` 77 条（新 8 条：删后离开全部活视图并可还原、作者路径与评论一起隐身且地址仍被占用、按 note 复活同一篇、purge 清评论/访问/退役地址并释放地址、清空只动回收站、跨账号四操作皆 404、120 篇批量入库再整批清空）；`tests/schema-migrations.test.ts` +1（老库删列与索引后重跑补回）；`blog-trash-view/index.test.ts` 7 条（jsdom 三态与三个动作的成功/取消）；两处变异实测 2 / 1 failed；详见进度日志。
  - 限制：回收站没有保留期与自动清理（不设 cron 删数据，作者自己决定）；清空是一次确认带条数、不是逐条确认；purge 是同步批处理，回收站极大时单次请求会变长；`/check-slug` 对回收站里的地址回答「不可用」（按设计，地址仍被那篇占着）；列表刻意无分页（理由同 B5-02 的 `/post-index`：作者要看到全部待处理项）。
- [x] B5-05 **FEA-06** 评论回复 + Webhook 通知 + 反垃圾 — 已提交 `d4b3e659`
  - 实现（数据形状）：`blog_comments` 追加 `is_owner`（这条评论是博主写的）与 `spam_score`（入库时规则给出的分数），迁移 **57**（`skipIfColumnExists` 守卫）；声明形状、`checks.ts` 列名单、行类型、共享 `BlogComment`（`isOwner`/`spamScore`）同步。
  - 实现（评论回复）：新增 `POST /api/blog/comments/:id/reply`——被回复的评论必须属于本账号且文章未进回收站（否则 404），回复是同一个 `blog_comments` 行：`parent_id` 指向被回复者、`status='approved'`（博主写的无需审核）、`is_owner=1`，作者名/头像/站点链接取设置里的作者资料。公开评论列表多带一个 `isOwner`；前台嵌套展示属 FEA-12。
  - 实现（通知）：新增 `comment-notify.ts`——设置里配置的 `commentWebhookUrl` 收到一条 JSON POST（`X-Inkstone-Event: blog.comment.created`，5 秒超时，payload 只含评论内容/作者名/文章标题，**不含邮箱与 IP**），经 `executionCtx.waitUntil` 交给运行时；失败只 `console.warn`，不影响读者提交（best-effort 已在代码注释里写明理由）。实例本身没有邮件通道，邮件需作者用该 webhook 接自己的服务，这一取舍已记录在限制里。
  - 实现（反垃圾）：新增 `comment-spam.ts` 的纯函数 `scoreComment()`——3 个链接 +3、黑名单命中 +3（第二个词再 +3，封顶）、正文无任何字母/数字/汉字 +2，阈值 3；达到阈值的提交一律存为 `spam`（不因「无需审核」而发布），分数落在行上供审核列表解释；设置新增 `commentSpamKeywords`（逗号/换行分隔，客户端 `parseSpamKeywords()` 归一，上限 50）。回应刻意只说「已提交待审」，不回显判定。
  - 实现（客户端）：审核列表新增行内回复（`blog-comment-reply.tsx` 的输入器 + 回复按钮，只对已通过与非作者评论出现；失败保留草稿）、作者/垃圾评分徽标；设置弹窗新增「评论：通知与反垃圾」分组（webhook 地址 + 关键词）；demo 后端同步（回复路由 + 回复行），`blog-smoke.test.ts` 覆盖新端点。
  - 验收：`tsc -b` 绿；`tests/blog-routes.test.ts` 82 条（新 5 条：作者回复落在父评论下且公开页标记作者、拒答不属于本账号或已在回收站的文章上的评论、多链接提交存为 spam 且单链接不误伤、黑名单命中、webhook 收到载荷与失败不阻断）；`tests/schema-migrations.test.ts` +1（老库缺两列时重跑补回）；客户端 +5 条（回复发送/失败留草稿、关键词归一化）；两处变异实测 2 / 1 failed；详见进度日志。
  - 限制：邮件发送不在仓内（只有 Webhook，邮件需作者自接）；通知只告知「有新评论」，没有已读/重试队列；反垃圾是确定性规则（链接数、黑名单、无文字），没有学习模型或验证码；前台尚未按 `parent_id` 缩进展示（FEA-12）、未使用 `isOwner` 样式。
- [x] B5-06 **FEA-07** 媒体库 / 封面选择器 — 已提交（hash 由下一提交回填，见进度日志）
  - 实现（数据与存储）：媒体库**不新建表**——它就是 `attachments` 里 `mime LIKE 'image/%'` 的那些行，因此上传复用与附件完全相同的路径（`persistAttachmentWithinQuota`：配额租约、SHA-256、`safeAttachmentMime` 的字节嗅探、尺寸读取、文件名去重、R2/KV 选择），`note_id` 为 NULL，图片同时出现在附件库与媒体库（二者不是两套数据，删一处即都删）。
  - 实现（管理路由，`src/worker/routes/blog/media.ts`）：`GET /media` 列本账号最近 200 张图片（选择器而非归档）；`POST /media` 上传（复用 `attachment-upload:${userId}` 的小时节流与 25MB 上限；字节过不了图片嗅探一律 400，不静默存成 octet-stream）；`DELETE /media/:id` 两处拒绝——属于某条笔记的图请去附件库删，被某篇文章的 `cover_url`/`seo_image_url` 引用的图先改那篇文章（错误信息带上文章标题）；删除 = 写 `attachment_cleanup` + 删行 + best-effort drain，复用共享清理队列而不是自己删对象。
  - 实现（公开服务）：`GET /api/blog/public/media/:id` 只在「本账号有一篇已发布且未删的文章仍引用它」时按图片类型返回（`Cache-Control: public, max-age=86400` + nosniff），否则 404——封面地址读者可取，附件库其余图片不会因此公开；`user_id` 经 `blogOwnerOf()` 解析（多租户同路由），字节永不变（重传是新 id）。
  - 实现（客户端）：共享类型 `BlogMediaItem`（带 `previewUrl`（作者侧 `/api/files/:id?preview=1`）与 `publicUrl`）；API `blog.media.list/upload/remove`；发布弹窗的封面字段拆为 `cover-field.tsx`，新增「媒体库」按钮打开选择器（网格 + 上传 + 逐张删除 + 加载/失败可重试/空三态），选中即把 `publicUrl` 写回封面字段，原有「首图建议」与手工粘地址都保留；删除带确认，服务端拒绝时原文呈现（`errorMessage`）。
  - 实现（demo）：`blog-media.ts` 用内存附件镜像同一契约（列表 / 上传 / `/api/files/:id` 公开地址 / 两处拒绝），`blog-media.test.ts` 覆盖往返与拒绝（放 node 工程，因为 jsdom 的 `FormData` 不认 Node 的 `File`），`blog-smoke.test.ts` 把 media 列表并入路由覆盖名单。
  - 验收：`tsc -b` 绿；`tests/blog-routes.test.ts` 86 条（新 4 条：只列本账号图片且两地址正确、上传真 PNG 且伪图与文本被拒、删除的笔记图/在用封面/空闲图三态与清理队列回收对象、公开地址随发布状态与账号收放）；`cover-field.test.ts` 5 条（列与选、上传即入网格、删除确认与拒绝、失败可重试）；demo node 2 条；两处变异各实测 1 failed（公开判据去掉 `is_published = 1`、删除去掉在用检查）；详见进度日志。
  - 限制：没有裁剪/焦点选择（review 提到的「裁切」未做）；选择器只列最近 200 张、按上传时间倒序（搜索留给以后）；删除空闲图不设「撤回」；公开地址缓存固定 24h 且无 ETag（id 不可变，换图必换 id）；图片的宽高沿用附件嗅探结果，SVG 这类嗅探不出尺寸的图在网格里靠 CSS 固定盒高。
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
| 2026-10-01 | B5-06 FEA-07 媒体库 / 封面选择器 | （下一提交回填） | `tsc -b` 绿；`tests/blog-routes.test.ts` 86 条（新 4 条）；`cover-field.test.ts` 5 条；demo `blog-media.test.ts` 2 条 + `blog-smoke.test.ts` 4 条（目标 97 条全绿）；两处变异各实测 1 failed（公开判据去掉 `is_published = 1`、删除去掉在用检查）；`test:unit` 605 文件 5389 通过 / 1 skipped（全绿）；十二项静态门禁 + `surfaces` 绿（comments 白名单 1361 文件 12991 条）；pre-commit 全量 EXIT=0；e2e / 视觉 / 对比度留到批次收尾统一跑 | 未做裁剪；选择器只列最近 200 张且无搜索；删除无撤回；公开地址无 ETag |
| 2026-10-01 | B5-05 FEA-06 评论回复 + Webhook 通知 + 反垃圾 | d4b3e659 | `tsc -b` 绿；`tests/blog-routes.test.ts` 82 条（新 5 条）；`tests/schema-migrations.test.ts` +1；客户端 +5 条；两处变异实测 2 / 1 failed；`test:unit` 603 文件 5367 通过 / 11 failed / 1 skipped——11 条全部是满负载下的 5s 超时（逐文件重跑全绿，三条最慢的用 `--testTimeout=30000` 实测 6.9s / 6.0s / 3.9s）；十一项静态门禁 + `surfaces` 绿（comments 白名单 1355 文件 12942 条；size 基线仅 `migrations.ts` 857→869）；e2e / 视觉 / 对比度留到批次收尾统一跑 | 邮件不在仓内（只做 Webhook，邮件需作者自接）；通知无已读与重试队列；反垃圾是确定性规则（无模型/验证码）；前台尚未按 parent 缩进展示（FEA-12），也未用 `isOwner` 样式 |
| 2026-10-01 | B5-04 FEA-04 文章回收站（软删 + 还原 + 彻底删除） | 96a5574c | `tsc -b` 绿；`tests/blog-routes.test.ts` 77 条（新 8 条）；`tests/schema-migrations.test.ts` +1；`blog-trash-view/index.test.ts` 7 条；demo `blog-smoke.test.ts` +3；两处变异实测 2 / 1 failed；`test:unit` 603 文件 5363 通过 / 5 failed / 1 skipped——5 条全部是满负载下的 5s 超时（当时 load average ≈30，另一个检出在跑 vitest）：kanban-locale-repaint-policy、starter-deck-render、share-hub-views×2 单独重跑全绿，blog-comments-window 放宽到 20s 后 5.4s 通过；十一项静态门禁 + `surfaces` 绿（comments 白名单 1348 文件 12884 条；size 基线仅 `migrations.ts` 843→857）；未动 blog-frontend | 回收站无保留期与自动清理；清空是一次确认；purge 同步批处理；`/check-slug` 对回收站地址回「不可用」（按设计）；列表无分页 |
| 2026-10-01 | B5-03 FEA-03 slug 变更 301 重定向表 | 2d1d51de | `tsc -b` 绿；`tests/blog-routes.test.ts` 71 条（含新 6 条）；前台 +3 条；四处变异各 1 failed（其中一处复现了本轮真实 bug）；`test:unit` 602 文件 5354 通过 / 1 skipped（另一轮 1 条满负载超时，重跑全绿）；十一项静态门禁 + `surfaces` 绿（size 仅 `migrations.ts` 827→843）；`blog-frontend` test 302 / lint 通过、`astro check` 仅既有 3 条；真机：:7712 建文 alpha→改名 beta，前台 `/posts/alpha` → 301 `/posts/beta`、`/posts/beta` → 200、未知 → 404 | `/check-slug` 不提示「该地址正指向另一篇」；历史仅在改名/删除时维护；分类/标签改名仍 404 |
| 2026-10-01 | B5-02 FEA-02 文章级 SEO 字段（写入 / 读取 / 公开详情 / 客户端 / 前台渲染） | dec6d254 | `tsc -b` 绿；`tests/blog-routes.test.ts` 65 条（含新 3 条）；`tests/schema-migrations.test.ts` +1；客户端 +3；前台 +4；五处变异实测 1/1/1/2/2 failed；`test:unit` 602 文件 5348 通过 / 1 skipped；十一项静态门禁 + `surfaces` 绿（size 基线仅 `migrations.ts` 810→827，其余靠拆分）；`e2e.mjs` 177 / 视觉 682 / `check-contrast` 通过（同一实例）；`blog-frontend` test 299 / lint 通过、`astro check` 仅既有 3 条 | 公开列表刻意不带 SEO 字段；前台只有文章页消费（sitemap/RSS 未排除 noindex，见 FEA-08/BF-6）；后台无 noindex 徽标；SEO 描述与摘要共用上限；canonical 允许站内相对路径 |
| 2026-10-01 | B5-01 FEA-01 发布时间可设 + 定时发布 | a7febb96 | `tsc -b` 绿；`tests/blog-routes.test.ts` 62 条（含新 6 条）；两处变异实测 1 / 3 failed；`test:unit` 复跑 602 文件 5341 通过 / 1 skipped（首轮 1 条满负载超时）；十项静态门禁（含 `tokens:check`）+ `surfaces` 绿（`size` 未动基线，comments 白名单 1338 文件 12744 条）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过 | 作者侧计数仍把定时中的文章算已发布；无「定时中」徽标/计数；无时区选择（按本地时区解释、存 UTC 时间戳）；定时不靠 cron，靠查询时实时比较 |
| 2026-10-01 | B4-07 UI-11/UI-12 访问卡文案与 `Direct` 本地化 + 借用 key 归位 + 图表刻度与比例 | 4758620a | `tsc -b` 绿；`test:unit` 602 文件 5332 通过 / 1 skipped；新增 5 条（图表 4 + 受众卡 1）；三处变异共 5 failed（刻度回旧算法、比例属性回 `none`、渠道名回原值）；十一项静态门禁 + `surfaces` 绿（`size` 未动基线，comments 白名单 1337 文件 12713 条）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过 | 访问卡不给查询加区间（review 两种做法皆可，取文案）；共享访问词汇（`share.filter_*`/`retention_*`/`device_*`）仍在 share 资源，属刻意；图表 `meet` 在极宽容器会留白；B4-06 的 `4a13c62d` 已回填 |
| 2026-10-01 | B4-06 UI-09/UI-10 行内「更多操作」菜单 + 共享 `Menu` 面板 + 导入导出解析外置 | 4a13c62d | `tsc -b` 绿；`test:unit` 602 文件 5327 通过 / 1 skipped；新增 3 文件 17 条（解析 8 + 菜单 7 + 行按钮 2）；两处变异各 1 failed（CSV 引号分支关掉、跳过过滤移除）；十项静态门禁（含 `tokens:check`）+ `surfaces` 绿（`size` 未动基线，comments 白名单 1335 文件 12705 条）；本地实例 `e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过 | 复制/二维码/检测在面板里而非三颗独立行内图标；面板是应用内 `Menu`，触屏长按仍不打开；CSV 未处理引号外的其它边缘；遗留的已初始化 dev 实例必须先杀掉，否则 e2e 前提不成立 |
| 2026-10-01 | B4-05 UI-08/UI-13 审核与分类 CRUD 反馈 + 共享 copyText | 39a3814a | `tsc -b` 绿；`test:unit` 600 文件 5309 通过 / 1 skipped；新增 5 文件 12 条；六处变异各 1～2 failed；九项静态门禁 + `surfaces` 绿（`size` 未动基线，comments 白名单 1331 文件 12667 条）；`e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过（同一实例） | 失败提示仍由 store 层发（此处只补成功侧）；批量审核未做行级 busy；另修无关的 kanban 日历用例时钟（单独提交 85702071）；`blog-comments-window` 在满负载下曾 5s 超时，单独运行通过 |
| 2026-09-30 | B4-04 UI-06/UI-07 标题按钮与表语义 + 排序 UI + hover-only 改聚焦可见 + 批量条换行 + 四弹窗可访问名 | cc066e7b | `tsc -b` 绿；`test:unit` 595 文件 5298 通过 / 1 skipped；新增 11 条（表 2 + 卡 2 + 侧栏 1 + 排序 1 + 弹窗名 5）；四处变异各 1 failed（排序取值、`th` 去 scope、弹窗去 ariaLabel、侧栏去 focus-visible 臂）；九项静态门禁 + `surfaces` 绿（`size` 未动基线，comments 白名单 1323 文件 12636 条）；`e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过（同一实例） | 双击打开改单击标题（review 明确允许）；排序在工具栏而非表头；批量条仍为浮条、仅允许换行；手机上置顶按钮常显 |
| 2026-09-30 | B4-03 UI-04/UI-05 表单 Field 化 + slug 不可用阻断 + 五套分段控件收敛 Segmented | bc9ca68c | `tsc -b` 绿；`test:unit` 591 文件 5287 通过 / 1 skipped；新增 6 条（slug 守卫 4 + 工具栏 radiogroup 1 + 发布弹窗标签 1）；三处变异分别实测 2 / 1 / 1 failed；九项静态门禁 + `surfaces` 绿（`size` 未动基线）；`e2e.mjs` 177 通过、视觉门禁 682 通过、`check-contrast.mjs` 通过（同一实例） | 标签区用 fieldset/legend（`Field` 只能名中三元之一）；选中态由强调实底变中性底、pending 徽标不再随选中变色；评论/友链筛选的组名由 JSX 内联，未额外抽组件 |
| 2026-09-30 | B4-02 UI-02/UI-03 日期本地化 + 硬编码文案改 message id + UA 哨兵映射 | 7bd424f6 | `tsc -b` 绿；`test:unit` 588 文件 5281 通过 / 1 skipped；新增 5 条（`formatDate` 3 + 设备标签 2）；两处变异实测 3 / 1 failed；九项静态门禁 + `surfaces` 绿（`size` 未动基线） | `check-i18n` 的英文词表未做（独立改动）；树前缀双语同值；表头「创建时间」前提不成立已订正 |
| 2026-09-30 | B4-01 UI-01 `text-white`/裸调色板收敛到令牌 | 07f9351f | `tsc -b` 绿；blog+share 81 文件 356 条全绿；九项静态门禁绿（palette baseline -11 条）；`tokens:check` 89 tokens 值稳定；`contrast:check` 两套主题通过；视觉门禁 682 通过 | 两个新令牌（`--success-on`/`--danger-on`）仅客户端私有；share 侧 SH-32 与附件网格的实体 warning 底未动 |
| 2026-09-30 | B3-09d ENG-11 barrel 拆瘦 + 图标按需加载 + qrcode/geo 归位 | 35762135 | `typecheck` 绿；新增 11 条用例全绿（3 文件），两处变异各 4 failed / 2 failed；九项静态门禁绿（`comments` 白名单重建 1309 文件 12578 条）；`npm run build` + `budget:check` + `vendor:check`：eager 931.4 → 596.7 KiB、`vendor-icons` 507.3 → 149.0 KB；`test:unit` 587 文件 5276 通过 / 1 skipped；视觉门禁 682 通过、`e2e.mjs` 177 通过、`check-contrast.mjs` 通过（同一实例） | 产物多约 1700 个图标小 chunk，纯图标 chunk 已排除出离线清单，未在线用过的自定义图标离线不保证；`vendor-icons` 分组排除 lucide `icons/` 是前提，改动它会让 eager 反弹 |
| 2026-09-30 | B3-09c ENG-12 列表 memo/菜单懒构/计数一次遍历/渐进渲染 | 0bcc38b2 | `typecheck` 绿；blog 相关 23 文件 76 条 + 新 4 条全绿（含窗口用例）；窗口变异（步长 250）1 failed；`size` 绿（`blog-links-view/index.tsx` 拆出 `links-toolbar.tsx`） | 评论/友链行级 memo 未做（内联箭头/bundle API）；窗口为渐进渲染而非滚动虚拟化 |
| 2026-09-30 | B3-09b ENG-13 封面/头像懒加载与异步解码 | 6127201e | `typecheck` 绿；新 `cover-image.test.ts` 2 条绿；`size` 未动基线 | 表格 36px 缩略图仍取原图字节（无 CDN 尺寸变体）；封面不写死 width/height（容器已定盒尺寸） |
| 2026-09-30 | B3-09a ENG-15 检测器批次 15 + 停止即 abort + 缓存写移出 updater + progressbar | d2e16114 | `typecheck` 绿；`blog-links-view` 3 文件 7 条全绿（含新 3 条）；两处变异各 1 failed；`i18n:check` 双语新 key 已补 | 旧结果仍展示（按 B2-05 计划标注而不丢弃）；缓存写靠 ref 同步，未改成 reducer |
| 2026-09-30 | B3-08 ENG-09/ENG-10 写操作定向失效 + 友链批量删除走 `batch` | 1e0e81ea | `typecheck` 绿（顺手清 B3-06 未用 import）；`src/client/features/blog` 19 文件 68 条全绿（含新 10 条）；实现前 7 failed、作用域变异 4 failed；九项静态门禁绿（`size` 未动基线） | `savePost` 仍结构性全量；单篇删除不刷新分类 `postsCount`；review 的「pin 不需要 stats」按侧栏计数订正 |
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
