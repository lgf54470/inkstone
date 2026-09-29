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
- [ ] B1-03 **SEC-08** slug 唯一性下放到 per-user：`db/schema/blog-posts.ts` + 基线同步 + rebuild 迁移（RENAME → 建新表 → `INSERT…SELECT` → 重建索引 → DROP）+ 全部 slug 查询带 owner + 去掉 `/check-slug` oracle；**单独提交，要求先备份**
- [ ] B1-04 **SEC-09** 站点设置单一键（per-user），公开侧按 owner 读；订正 `tests/blog-routes.test.ts` 里把错误行为钉成期望的断言
- [ ] B1-05 **SEC-03** 五个批量 schema `.max(100)` + 分块（复用 `files/helpers.ts` 约定）+ 批量删除改单条带 owner 的语句
- [ ] B1-06 **SEC-04** 共享 `isSafeExternalUrl()`（http/https + 站内相对 + mailto），schema 强制 + 渲染侧兜底（含 `frontendUrl` / `socialLinks`）
- [ ] B1-07 **SEC-05** `assertContentSize` 接入 blog 写入 + `title/excerpt` 加 `.max()`
- [ ] B1-08 **SEC-06** `POST /links/:id/click` 加限流 + `status='approved'` + 站点归属
- [ ] B1-09 **SEC-07** `days` 走 `clampInt` + 三处 LIKE 补 `escapeLike` + 公开列表补 `LIMIT`
- [x] B1-11 **GATE-01** 修注释门禁扫描器（本轮动手时发现，已真实发生）：`check-comments.mjs` / `sync-comments-allowlist.mjs` 用正则找注释、只用 AST 字面量区间排除「落在字符串里的匹配」，于是字符串里的 `/*`（如 `'/api/blog/*'`）会与文件后面第一个 `*/` 组成幻觉块注释，**吞掉中间所有真注释**——正则不再产出它们，门禁也就不再要求它们被登记。实测仓内已 5 个文件 / 10 条注释对门禁不可见（`pick-image.ts`、`tests/blog-routes.test.ts`、`tests/share-routes.test.ts`、`tests/share-selection-parity.test.ts` 与 `tests/blog-links-routes.test.ts`，后者正是本轮 B1-01/B1-02 在这两个测试文件里加 `/** */` 后新暴露的）。  修法：两脚本统一改用 AST 注释区间（`getLeadingCommentRanges` / `getTrailingCommentRanges`，递归覆盖全部 token 含 `endOfFileToken`）并抽成共享模块 `scripts/lib/comment-scan.mjs`，`tests/comment-scan.test.ts` 钉住回归（字符串/模板/正则里的注释符不算注释、`'/api/blog/*'` 之后的注释仍被看见、文件末尾与模板插值里的注释都在）；重生成后这 6 条重新进入白名单（双向失败因此重新生效）。**不是本轮安全检查的附带改动，单独一个提交。** — 已提交（hash 见下一提交）
- [ ] B1-10 **SEC-10 + SEC-11 + SEC-12 + SEC-13 + SEC-15** 小项打包：头像本地生成（去 dicebear）+ 协议校验；去重 `loadSession` 改挂载级 `requireAuth`；`getBlogSettings` 解析失败记日志；`is_self_referrer` 真实计算；模块级 localStorage 取值与 updater 内副作用收敛

## 批次 2 · 统计可信

- [ ] B2-01 **COR-01 + COR-03 + COR-05** 删 `stats.ts` 全部伪造分支（fallback 分布 / 0.75 UV / 单篇伪造 visitors / `blogDisplayTotals` 兜底）；`BotsFilterBanner` 用真实 `filterStats`；区间值与全站累计分列标注；前端用 `KpiCard` 的 `unavailable` 与空态表达「未采集」
- [ ] B2-02 **COR-02** `computeDelta` 无基数不再报 +100%（共用于 share，双覆盖回归）
- [ ] B2-03 **COR-04 + BF-1** PV 计数根治：新增公开 beacon 端点（同源 + CF 头 + 每 (post, fp) 30 分钟去重 + IP 限流），服务端不再在 SSR 取数路径计数；前台删 `FALLBACK_POSTS` 失败伪造、feed/sitemap 失败 5xx + `no-store`
- [ ] B2-04 **SEC-14 + COR-06** 流量过滤器单一真值：仪表盘读 store 并把三值透传 `analytics()`；popover / 设置弹窗共用同一处
- [ ] B2-05 **COR-08** 链接检测新增 `error` 语义（失败 ≠ 失效）+ 缓存 TTL + 批量删除确认文案带真实条数

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
| 2026-09-30 | B0 文档基线（review + plan） | — | —（无代码改动，静态门禁与单测不适用） | 报告结论全部落到 file:line；统计与性能量级为明示假设下的推算，未做 profiling；订正了前两轮报告的 8 条过时结论（review §三） |
| 2026-09-30 | B1-11 GATE-01 注释门禁扫描器改用 token 树 | 已提交（见下一条回填） | `npm run comments:check` 绿且总数 12191 → 12201（6 条被吞的重新纳入）；反向探针：往 `owned-rows.ts` 加一条未登记注释后门禁**报错**（非静默通过），移除后恢复绿；`typecheck` 绿；`test:unit` 5163 通过 / 1 失败（仍为既有 kanban 用例）；`tests/comment-scan.test.ts` 6 条全绿；七项静态门禁绿 | 修的是扫描器本身，不是博客模块；影响面为全仓注释白名单（已实测“正则可见 ⊆ AST 可见”，因此不会丢条目） |
| 2026-09-30 | B1-02 SEC-02 友链/分类归属守卫与导入重编号 | 已提交（见下一条回填） | `typecheck` 绿；`test:unit` 5157 通过 / 1 失败（仍为既有 kanban 用例）；`tests/blog-links-routes.test.ts` 15 条（8 旧 + 7 新）全绿；`comments/escape/empty-catch/module-state/deep-imports/style/size` 七项门禁绿 | 同左：那条 kanban 既有失败；另发现并记录 **GATE-01**（注释门禁扫描器被字符串里的 `/*` 骗过，仓内 10 条注释对门禁不可见），单独提交修 |
| 2026-09-30 | B1-01 SEC-01 公开 API owner resolver | 见下一条回填 | `typecheck` 绿；`test:unit` 5150 通过 / 1 失败；新增 45 条 blog 契约测试全绿；`blog-frontend` 295 通过；7 项静态门禁绿 | **两处既有失败，与本批改动无关，已核实非本轮引入**：① `src/client/lib/markdown/kanban/ui/kanban-view-rows.test.ts:156` 日历视图「新增于该日」产出 `2026-08-30` 而用例期望今天的 key（该文件与 kanban 源码均为未修改的 HEAD 状态，且与本批改动的 blog 模块无任何交集）；② `blog-frontend` 的 `astro check` 在 HEAD 上就有 3 条 `ts(2345)`（`music-player-video.test.ts:53/84`、`music-video-stage.test.ts:43` 的 `document.body.append(container)`），同为未修改文件。两者按 AGENTS.md §14 不夹带进本批，另开 issue 处理 |
