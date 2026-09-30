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

- [ ] B3-01 **ENG-01** store 增 `error` 通道 + 四个视图的三态渲染（加载 / 失败 + 重试 / 空）+ 全部 mutation `try/catch` + 乐观回滚 + 双 toast
- [ ] B3-02 **ENG-02** 文章列表去 `content`（列白名单）+ `LIMIT/OFFSET` + 总数独立查询 + tag 下推 + 前端分页控件
- [ ] B3-03 **ENG-03** `GET /links` 服务端真消费 `status/categoryId/search` + `LIMIT` + counts 改 `GROUP BY`
- [ ] B3-04 **ENG-04** 搜索防抖 + `AbortSignal` + 乱序守卫；`/check-slug` 同步修
- [ ] B3-05 **ENG-05** `loadAll` 按当前 tab 收敛 + 30s SWR + 删侧栏重复 effect + 复位 effect 去 `activeNote` 依赖
- [ ] B3-06 **ENG-06 + ENG-16** 评论列表 `LIMIT` + 服务端 search 接通（删本地过滤与死通道）+ tab 计数改 `stats` + 发布弹窗分类拉取两行修复
- [ ] B3-07 **ENG-07 + ENG-08 + ENG-14** stats 七条串行改 `db.batch`/`GROUP BY`；analytics 六段合并 + 分布改 SQL 聚合；补三条索引
- [ ] B3-08 **ENG-09 + ENG-10** 写操作 refetch 定向收敛 + 回滚；友链批量删除走 `batch` 端点
- [ ] B3-09 **ENG-11 + ENG-12 + ENG-13 + ENG-15** barrel 拆瘦让 lazy 生效 + 去 `icons` 全量 registry + qrcode 懒载 + geo/device 纯函数下沉；列表 `memo`/`useMemo`/窗口化；图片 lazy + 尺寸；link checker 批次 15 / abort / TTL / updater 纯净 / progressbar

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
