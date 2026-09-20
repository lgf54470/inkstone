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

> hash 回填约定：提交无法引用自身 hash，故「第 N 项」的 commit 列由**第 N+1 项的提交**回填（表中 ⏳ 表示待回填）。

| 序 | 批次 | 编号 | 标题 | 代价 | 状态 | commit |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | — | — | 落盘复评报告 `review-round2.md` + 本台账 | 小 | ✅ | ef056537 |
| 02 | A | SH-78 | `GET /api/share/visits` 的 `page`/`limit` 未校验 → NaN 绑定必现 500 | 极小 | ✅ | 76a1f76a |
| 03 | A | SH-79 | 日志 CSV 未做 RFC 4180 转义 + 无公式注入防护 | 极小 | ✅ | d7eadd4a |
| 04 | A | SH-84 | 自定义 slug 报错文案写 "3-64 chars"，实际 6–64 | 极小 | ✅ | ccfc69f7 |
| 05 | A | SH-80 | `loadTopNotes` 查笔记标题不带 `user_id` | 极小 | ✅ | 4d5cf737 |
| 06 | A | SH-82 | 日志接口下发完整指纹 + SELECT 从不返回的 `user_agent` | 极小 | ✅ | f95e92ef |
| 07 | A | SH-71 | 两个 analytics hook 无 abort/epoch → 慢请求覆盖新请求 | 小 | ✅ | 3cd48d9b |
| 08 | A | SH-55 | 首屏 `isLoading` 时 KPI 全渲染 0（缺"加载中"态） | 小 | ✅ | ⏳ 下项回填 |
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

### 02 — SH-78 `visits` 分页参数未校验 → NaN 绑定必现 500（2026-09-21）

- 根因：`src/worker/routes/share/visits.ts` 把查询参数交给 `Math.max(1, parseInt(raw, 10))`；`parseInt('abc')` 是 `NaN`，`Math.max(1, NaN)` 仍是 `NaN`，直接绑进 `LIMIT ?N OFFSET ?N+1`。本地 `node:sqlite` 实测该绑定报 `datatype mismatch`，D1 同样会是 500（同文件 `days` 分支有 `!(days >= 1)` 守卫，说明只是漏了这一处）。
- 复现（先红）：`tests/share-routes.test.ts` 新增用例「falls back to page/limit defaults for unparseable numbers instead of binding NaN」，修复前实测 500（`expected 500 to be 200`）。
- 改动面（2 文件）：`visits.ts` 的 page/limit 改走仓内既有的 `clampInt()`（`search/graph`、`search/query`、`notes/list`、`sync`、`dev` 同款约定），把 `1 / 1_000_000 / 10 / 100 / 50` 提为具名常量；`older_than` 的 days 换成显式的正整数字符串校验（`/^\d+$/` + 安全整数 + ≥1）并保留 400，避免“悄悄回退成 30 天”这种静默降级（AGENTS 铁律 2）。
- 验证：定向 `tests/share-routes.test.ts` 70/70 绿（修复前 69 绿 + 新用例红）；`npx tsc -b --force` exit 0；`comments:check` 首跑拦下 5 条新注释，按流程 `node scripts/sync-comments-allowlist.mjs` 登记后复绿（678 文件 / 4937 条，+5 全部来自本项，未吸收其它在途注释）。
- 局限（如实登记）：`page` 上限 `1_000_000` 属防呆值，远端 D1 的大 OFFSET 成本未实测；全量串行回归放在批次 A 收尾统一跑（本项只跑定向 + 类型 + 静态门禁）。

### 03 — SH-79 日志 CSV 未做 RFC 4180 转义 + 无公式注入防护（2026-09-21）

- 根因：`share-helpers.ts` 的 `exportVisitsToCsv()` 只给标题与来源两列手写 `"` 包裹，其余 10 列（slug/城市/设备/系统/浏览器…）原样 `join(',')`；含逗号或换行的值会把一条访问记录撑成多列/多行，含 `=`/`+`/`-`/`@` 开头的值会被 Excel / Sheets 当公式求值（CSV injection）。标题列还额外把控制字符原样写进单元格。
- 复现（先红）：新增 `share-visit-logs-csv.test.ts`（5 用例，先红 3 红 2 绿），断言「每列都引用、引号翻倍、逗号/引号/换行留在列内、`= + - @` 前缀被中和、Type 列标注不变」。
- 改动面（3 文件）：`share-helpers.ts` 新增 `csvCell()`——所有单元格一律引用并翻倍内部引号，C0 控制字符（含 CR/LF）替换为空格以保证「一条访问一行」，首字符为 `= + - @` 时前缀 `'` 中和公式；表头同样走该函数，行分隔符改用 RFC 4180 的 `CRLF`。`share-visit-logs-csv.test.ts` 新文件（含 12 列名的往返解析断言，证明没有单元格漏进下一列）。`scripts/check-comments.mjs` 同步登记本项新增注释。
- 验证：定向 5/5 绿；`npx vitest run src/client/features/share tests/share-routes.test.ts` 25 文件 / 185 用例全绿（含既有被 mock 的 `share-visit-logs-export.test.ts`，导出分页契约未破）；`npx tsc -b --force` exit 0；`comments:check`（4943 条 / 680 文件）、`style:check`、`escape:check`、`hardcoded:check`、`size:check` 全绿。
- 局限（如实登记）：`markdown/table-editor.ts` 的 `tableToCsv()` 与 `blog-links-view/link-import-export-modal.tsx` 的 `generateCsv()` 是同类 CSV 写入点、同样未做转义/中和，本项按「不顺手改无关模块」只记录不修改，只能另立条目跟踪（见文末新发现）。`URL.revokeObjectURL` 紧跟 `a.click()` 调用在部分浏览器上可能打断下载，同样登记为后续条目。全量串行回归放在批次 A 收尾。

### 04 — SH-84 自定义 slug 报错文案与实际规则不符（2026-09-21）

- 根因：`src/worker/routes/share/note.ts` 的拒绝文案写死 `(3-64 chars)`，而 `isValidCustomSlug()` 实际要求 6–64；同一文案还拿来解释“保留字”失败——`settings`/`dashboard` 这类 6 位以上的保留字会被指控长度不对。`6`/`64` 本身是散落在服务端校验、客户端正则、locales 三处的魔法数字。
- 复现（先红）：`tests/share-routes.test.ts` 新增 `custom slug rejection copy (SH-84)` 三条（修复前 3 红：文案仍含 `3-64`、保留字不提“reserved”、超长 slug 因 `LIMITS.shareSlugMaxLength` 未定义而误判为“没传 slug”并通过）。
- 改动面（7 文件）：`src/shared/constants.ts` 新增 `LIMITS.shareSlugMinLength/MaxLength`（与 `sharePasscodeMinLength` 同位置的单一真相源）；`share-analytics.ts` 的校验改读 LIMITS 并新增导出的 `isReservedSlug()`；`note.ts` 新增 `customSlugRejectionMessage()`——保留字与格式/长度各给各的文案；客户端 `share-form.ts` 新增 `isValidCustomSlugFormat()`（正则由 LIMITS 拼出，替换 `use-share-edit-modal.ts` 里写死的 `{6,64}`）；locales 的 `share.custom_slug_invalid` 改为 `{min}-{max}` 插值并在两个调用点传参；新增 `share-form.test.ts`（3 用例，含“文案里的数字必须来自 LIMITS”）。
- 验证：`tests/share-routes.test.ts` 73/73；`share-form.test.ts` 3/3；`npx tsc -b --force` exit 0；`i18n:check` 3139 键通过（首跑拦下测试里的中文字面量，已改为 `café-slug`）；`comments:check`（+1 条）、`style:check`、`size:check` 全绿；偏一起跑 `src/client/features/share` + `share-routes` + `share-analytics` + `i18n.test.ts` 共 28 文件 / 214 用例绿。
- 设计取舍（如实登记）：可用性检查端点 `organizer.ts` 仍只回 `available: false`，**故意**不区分“非法”与“已被占用”（避免成为探测接口），因此客户端在保留字上仍显示“已被占用”文案；这是原设计意图，本项未改。演示模式 `demo/backend/routes/share-admin.ts` 根本不校验 slug，登记为新发现 SH-88 待批入队。

## 新发现（本轮执行中登记，尚未并入已批准的 39 项队列）

> 按 AGENTS「不顺手修无关问题」，这些不在当前批次里顺手改；等批准后再入队，编号从 SH-86 起。

| 编号 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| SH-86 | `src/client/lib/markdown/table-editor.ts` 的 `tableToCsv()`、`src/client/features/blog/blog-links-view/link-import-export-modal.tsx` 的 `generateCsv()` | 与 SH-79 同类的 CSV 写入点：未做全列引用/引号翻倍，也未中和 `= + - @` 开头（复制表格为 CSV 与导出友链 CSV 都受影响） | 把 `csvCell()` 提到 `src/client/lib/csv.ts` 共享，三处共用同一实现与测试 |
| SH-87 | `src/client/features/share/share-helpers.ts` 的 `exportVisitsToCsv()` 尾部 | `URL.revokeObjectURL(url)` 紧跟 `a.click()` 同步执行，部分浏览器上会在下载开始前撤销 blob URL | 改到 `setTimeout(..., 0)` 或 `requestAnimationFrame` 后撤销，并加回归测试 |
| SH-88 | `src/client/demo/backend/routes/share-admin.ts` | 演示模式完全跳过 slug 校验（直接取 `body.customSlug`），真人可在体验版里设出真实 API 会拒绝的短链/保留字 | 复用 `isValidCustomSlug()` 与 `LIMITS.shareSlugMinLength/MaxLength`，行为与真实后端对齐 |

### 05 — SH-80 `loadTopNotes` 按 note id 查标题、不带 `user_id`（2026-09-21）

- 根因：`src/worker/routes/share/analytics.ts` 的 `loadTopNotes()` 用 `SELECT id, title FROM notes WHERE id IN (...)` 取「最受关注笔记」的标题，只按 id 过滤。`notes.id` 是主键，正常写入路径下 visit 行只会指向本人笔记，所以这是**纵深防御**缺口而非已知可触达的越权：任何将来丢掉归属校验的写路径都会让看板把别人笔记的标题画出来。
- 复现（先红）：`tests/share-routes.test.ts` 新增用例「does not resolve a top note title across accounts」——播种 `user-2` 的笔记 + 一条挂在当前账号名下、却指向该笔记 id 的 visit 行，修复前实测 `topNotes[0].noteTitle === 'Foreign secret'`（跨账号标题泄漏），修复后为 `null`。
- 改动面（3 文件）：`analytics.ts` 的 `loadTopNotes()` 增加 `userId` 入参，SQL 改为 `WHERE user_id = ?1 AND id IN (?2…?N)`（占位符显式编号，与同文件其它语句风格一致）；`tests/share-routes.test.ts` 新增 1 条用例；`scripts/check-comments.mjs` 登记用例里的说明注释（4946 条）。
- 验证：`tests/share-routes.test.ts` 74/74 绿（修复前 73 绿 + 新用例红）；`npx tsc -b --force` exit 0；`comments:check`（+2 条）通过。
- 局限（如实登记）：`WHERE deleted_at IS NULL` **故意没加**——软删除笔记的历史访问仍应能画出当年的热门标题，这是既有行为，本项不改；全量串行回归仍在批次 A 收尾统一跑。

### 06 — SH-82 访问日志下发完整访客指纹（2026-09-21）

- 根因：`src/worker/routes/share/visits.ts` 把 `visitor_fp`（SHA-256 摘要前 32 位，按 IP+UA+按日盐算出的假名标识）整条随日志列表下发；客户端只 `slice(0, 8)` 当标签显示。等于把假名标识的完整值交给浏览器与任何抓取日志的扩展，而产品只需要 8 位。
- 复现（先红）：`tests/share-routes.test.ts` 新增「ships only the display prefix of a fingerprint and nothing on non-bot rows」——修复前实测整条 32 位原样返回（`'fedcba98…'`），修复后为 `'fedcba98'`，并断言响应体里不存在被截掉的尾串。
- 改动面（5 文件）：`visits.ts` 新增 `VISITOR_FP_DISPLAY_CHARS = 8` 并在 `toVisitLogRow()` 截断；同一条 SELECT 里 `sv.user_agent` 改为 `CASE WHEN sv.is_bot = 1 THEN sv.user_agent END`（该列只用于推 bot 名称，非 bot 行不再把 UA 从 D1 搬进 worker），bot 行仍能得出 `Googlebot`；客户端 `share-visit-logs-modal.tsx` 去掉已冗余的 `.slice(0, 8)`；`src/shared/types/share.ts` 的 `visitorFp` 注释改为声明「这是展示标签而非存储摘要」；测试助手 `seedVisit` 增加可选 `user_agent` 列。
- 验证：`tests/share-routes.test.ts` 75/75 绿；`src/client/features/share` 25 文件 / 118 用例绿；`npx tsc -b --force` exit 0；`comments:check`（+5 条，4951 条）、`size:check`、`hardcoded:check` 通过。
- 局限（如实登记）：博客侧 `/api/blog/stats` 的最近访问**本来就不查** `visitor_fp`（只取最近 20 条），所以没有同类改动；截断只影响展示，去重与 UV 统计仍在 SQL 里对完整列做 `COUNT(DISTINCT)`。`CASE WHEN` 只减少跨进程传输，不减少 SQLite 读列的成本。

### 07 — SH-71 analytics hook 无 abort/epoch，慢请求覆盖新请求（2026-09-21）

- 根因：`use-share-dashboard-view.ts` 与 `use-share-note-analytics.ts` 的 `loadData()` 直接 `await api.share.*Analytics(...)` 后写状态，既没把 `AbortSignal` 传下去（`api.share.globalAnalytics/noteAnalytics` 早有该形参），也没有“最新请求才是权威”的判定。连续切换区间（7d→24h）时，先发的慢响应后到会覆盖新数据，并且它自己的 `finally` 会把仍在进行的新请求的加载态提前清掉。
- 复现（先红）：`share-analytics-error.test.ts` 新增两条排序用例（dashboard + note 弹窗）。断言：旧请求的 signal 已被 abort、旧响应到达后 `analytics` 仍为 null 且 `isLoading` 仍为 true、新响应到达才写入；并补一条「已被替换的请求失败时不得清空最新数据、不得置错误态」。
- 改动面（5 文件）：新增 `src/client/features/share/analytics-request.ts`——`runLatestAnalyticsRequest()`（先 abort 前一个、只有最新 controller 才能写数据与收尾加载态、AbortError 静默返回并记 `console.warn`）与 `cancelLatestAnalyticsRequest()`；两个 hook 改为调用它并下传 signal，卸载/关闭时取消在途请求；`loadData` 仍返回 Promise（重试按钮照旧 `await`）。形状与仓内既有的 `share-page/use-share-page.ts: loadShare()` 一致（同一 feature 内的既有约定，未新造抽象）。
- 验证：`share-analytics-error.test.ts` 8/8 绿（新增 3 条，修复前 2 红）；`src/client/features/share` + `share-routes` 共 26 文件 / 196 用例绿；`npx tsc -b --force` exit 0；`size:check` 首跑因两个 hook 函数体 65/54 行超 50 行而失败，因此把重复的请求编排抽到共享模块、并把派生值留在 hook 内，复跑通过；`comments:check`（681 文件 / 4953 条，共享模块的注释取代了 hook 里那两条重复注释，总数 -2）、`style:check` 通过。
- 局限（如实登记）：共享模块本身没有再写单元测试，它的行为由两个 hook 的用例（真实 React 渲染 + 延迟 Promise）间接覆盖；`console.warn` 在用例里会打印预期内的堆栈。全量串行回归仍在批次 A 收尾统一跑。

### 08 — SH-55 首屏加载时 KPI 与各卡片渲染成 0 与「暂无数据」（2026-09-21）

- 根因：`share-dashboard-view.tsx` 只在 `error` 与正常两条分支里二选一；`analytics === null && isLoading`（首次加载、刷新）时 KpiGrid 用 `analytics?.totalViews ?? 0` 画出 **0**、活跃分享卡画 `0 / 0 篇`、四个分析卡画「统计周期内暂无访问数据」。对用户而言这是**关于数据的断言**（该窗口没有访问），而不是请求状态——用户截图里的全零看板正是这一态。
- 复现（先红）：新增 `share-dashboard-loading.test.ts`（3 用例）：首屏未返回时必须出现 `role="status"` 且页面上不得出现 `share.total_views_pv` / `share.no_data_yet`；返回后骨架换成真卡片；已加载数据时点刷新（在途）**不得**退回骨架。
- 改动面（4 文件）：新增 `share-dashboard-loading.tsx`（复用 `components/feedback` 的 `Skeleton`，`.skeleton` 的 shimmer 在 `prefers-reduced-motion` 下由 `motion.css` 关闭；`role="status" aria-busy="true"` + `common.loading` 文案，与音乐、模板库的既有加载写法一致）；`share-dashboard-view.tsx` 在 error 分支后插入 `isLoading && !analytics` 分支（区间切换时保留旧卡片，不闪骨架）；新增测试文件；`scripts/check-comments.mjs` 登记新注释（682 文件 / 4954 条）。
- 验证：新文件 3/3 绿（修复前 1 红）；共享面回归 `src/client/features/share` + `src/client/features/blog` 共 31 文件 / 144 用例绿；`npx tsc -b --force` exit 0；`size:check`、`hardcoded:check`、`comments:check`、`i18n:check`（3139 键）通过。
- 局限（如实登记）：看板仍复用 `components/dashboard-blocks.tsx` 的 KpiCard（与博客看板共用），本项**没有**动共用组件，因此博客看板的同类「加载即 0」问题仍在，登记为新发现 SH-89；骨架用固定高度近似卡片高度（不做真实测量），故首屏切换有一处轻微跳变。
| SH-89 | `src/client/features/blog/blog-dashboard-view/*` + `components/dashboard-blocks.tsx` | 与 SH-55 同类：博客看板首次加载时 KPI 也把 `null` 画成 0（共用 KpiCard），同样没有加载态 | 与 SH-55 同法加 `isLoading` 分支；若要共用则给 KpiCard 加可选 loading 属性，并跑 blog 侧回归 |
