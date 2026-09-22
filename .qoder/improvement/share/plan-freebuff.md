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
>
> 状态图例：✅ = 已交付；🟡 = **按决策的部分交付**——缺的那一半与重开条件写在 commit 列与对应小节里，**不是「还没做」**。

| 序 | 批次 | 编号 | 标题 | 代价 | 状态 | commit |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | — | — | 落盘复评报告 `review-round2.md` + 本台账 | 小 | ✅ | ef056537 |
| 02 | A | SH-78 | `GET /api/share/visits` 的 `page`/`limit` 未校验 → NaN 绑定必现 500 | 极小 | ✅ | 76a1f76a |
| 03 | A | SH-79 | 日志 CSV 未做 RFC 4180 转义 + 无公式注入防护 | 极小 | ✅ | d7eadd4a |
| 04 | A | SH-84 | 自定义 slug 报错文案写 "3-64 chars"，实际 6–64 | 极小 | ✅ | ccfc69f7 |
| 05 | A | SH-80 | `loadTopNotes` 查笔记标题不带 `user_id` | 极小 | ✅ | 4d5cf737 |
| 06 | A | SH-82 | 日志接口下发完整指纹 + SELECT 从不返回的 `user_agent` | 极小 | ✅ | f95e92ef |
| 07 | A | SH-71 | 两个 analytics hook 无 abort/epoch → 慢请求覆盖新请求 | 小 | ✅ | 3cd48d9b |
| 08 | A | SH-55 | 首屏 `isLoading` 时 KPI 全渲染 0（缺"加载中"态） | 小 | ✅ | 8a0cdfc7 |
| 09 | A | — | 批次 A 收尾：全量串行回归 | — | ✅ | c2749fda + afa9b286 |
| 10 | B | SH-85 | 分享中心浏览器级门禁（e2e-visual 场景 + surface coverage） | 中 | ✅ | c62c1635 |
| 11 | C | SH-49 | 裸 `<button>` 绕过组件体系 + 新守卫 | 中 | ✅ | aa0ca70b + 5ae18926 |
| 12 | C | SH-50 | 流量过滤浮层：焦点管理 / role / 窄屏裁切 | 小–中 | ✅ | bf09dbce |
| 13 | C | SH-51 | hover-only「新建文件夹/标签」键盘不可见、触屏不可发现 | 小 | ✅ | 3096be8a |
| 14 | C | SH-53 | `expiring` 语义与标签不符，缺 ≤7d「即将到期」桶 | 小 | ✅ | 4c84878f |
| 15 | C | SH-60 | 看板 468/500 行 + range 选项重复 → 拆分 | 小–中 | ✅ | 71d711be |
| 16 | C | SH-59 | 网格卡未 memo + 内联闭包 + 每卡 `folders.find` | 小 | ✅ | 8cda369d |
| 17 | C | SH-57 | `toLocaleString()` 跟随 OS / delta 无语义 / 图表无文本替代 | 小–中 | ✅ | 09a5c284 |
| 18 | C | SH-56 | 「日均访问量」口径错误 + sparkline 与 PV 卡重复 | 小 | ✅ | 7859ca3b |
| 19 | C | SH-58 | hub 分类徽标未走 `countBadgeTone`（且不在对比度门禁内） | 小 | ✅ | 54a2feb1 |
| 20 | C | SH-52 | 侧栏计数缺 password/expiring/permanent 三类 | 小 | ✅ | 92e20e4f |
| 21 | C | SH-54 | 看板不受侧栏范围影响且不标注作用域 | 中 | ✅ | 0f0058f4 |
| 22 | C | SH-61 | 设置「保存」一半 localStorage 一半服务端，语义未标注 | 小 | ✅ | 001f70f4 |
| 23 | C | SH-83 | UV 去重口径（IP+日盐 / 同 NAT 合并 / 跨日重复）不可见 | 极小 | ✅ | 530cc26c |
| 24 | D | SH-72 | 打开分享中心固定 4 请求 / ≈15 条 D1 语句 | 小–中 | ✅ | 704fb03b |
| 25 | D | SH-73 | 列表访客统计缺覆盖索引 + tags `LIKE '%"x"%'` | 中 | ✅ | 155e8c45 |
| 26 | D | SH-74 | `range=all` 无节流无缓存 | 中 | ✅ | 439597f1 |
| 27 | D | SH-81 | 读侧无限流（分析/日志对已认证会话全开放） | 小–中 | ✅ | b6ce939a |
| 28 | D | SH-75 | 全量导出串行分页无进度/无取消/无上限提示 | 小–中 | ✅ | 1976371e |
| 29 | D | SH-76 | `useShareStore.subscribe` 每次写入重建共享 id 快照 | 极小 | ✅ | 3a58c21d |
| 30 | D | SH-77 | 500 行全量渲染无虚拟化（无规模证据则关闭） | 中 | ✅ | 35cc631b（关闭 + 修正截断文案） |
| 31 | E | SH-62 | 到期治理：即将到期列表 + 批量续期 | 中 | ✅ | 24ee5937 |
| 32 | E | SH-63 | 单条分享的访客数据删除 / 导出 | 小–中 | ✅ | 0f220f28 |
| 33 | E | SH-69 | 批量二维码打印表 / 复制全部链接 | 小–中 | ✅ | 5ef9bb9d（链接清单）+ §54（打印表：离屏 sheet、打印放行、门禁 9 条断言） |
| 34 | E | SH-65 | 无自动刷新 / 无新鲜度标识 | 中 | ✅ | e2795d45 |
| 35 | E | SH-64 | 看板无法导出（区间 CSV / PNG / PDF） | 中 | 🟡 | 68063f54（CSV 已做；PNG/PDF 评估后不做并留重开条件） |
| 36 | E | SH-70 | 链接卫生巡检（长期 0 访问） | 小 | ✅ | 66e05336 |
| 37 | F | SH-66 | 访客会话视角（先出 ADR） | 中–大 | ✅ | 2f783cdf（ADR-0003）+ §42（实现已交付：逐行日志折成会话、UV 口径、演示孪生；键盘展开/收起的浏览器级场景未做，见 §42 局限） |
| 38 | F | SH-67 | 渠道标记 `?ref=`（先出 ADR） | 中 | ✅ | 见 §41（ADR-0004 已实现） |
| 39 | F | SH-68 | 文件夹/标签 → 公开集合落地页（先出 ADR） | 大 | 🟡 | 1da81ab5（ADR-0005）+ §43（三期实现已交付；**集合级资产会话按记录不做**，重开条件见 §43）；此后逐集合读数见 §47、浏览器级场景见 §48 |

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
| SH-89 | `src/client/features/blog/blog-dashboard-view/*` + `components/dashboard-blocks.tsx` | 与 SH-55 同类：博客看板首次加载时 KPI 也把 `null` 画成 0（共用 KpiCard），同样没有加载态 | 与 SH-55 同法加 `isLoading` 分支；若要共用则给 KpiCard 加可选 loading 属性，并跑 blog 侧回归 |
| SH-90 | `scripts/e2e-visual.mjs` 的「slides editor: space and a drag pan the view」 | 同一份代码、同一实例连跑三次得到两种结果（1 绿 2 红，失败时 `scrollLeft` 停在 0），失败都在机器被另一条线程的浏览器门禁占满时出现——断言本身对环境负载敏感 | 定位后加大等待/改用「等到滚动量变化」的等待，而不是固定 sleep；不要靠重跑掩盖 |
| SH-91 | `src/client/features/workspace/workspace/workspace-views.tsx`（`workspace.share`）与 `src/client/features/sidebar/*`（`navigation.share`） | 两个入口在 zh-CN 下同名「分享」却通到不同表面：工作区头部按的是「单条笔记的分享设置」，侧栏按的是分享中心；当没有激活笔记时 `app-shell` 又把 `panel='share'` 回退成分享中心，于是同一个按钮在两种状态下打开两个不同表面 | 区分文案与图标（如「分享这条笔记」/「分享中心」），并把无激活笔记时的回退显式化（或在无笔记时禁用该按钮） |
| SH-94 | `src/client/lib/i18n.ts` 的 `initI18n()`（`void ensureLocaleLoaded(other)`） | 预加载另一语言是个**没有 catch 的游离 Promise**（AGENTS 铁律 2）：机器被占满时那个动态 import 会 reject，变成 vitest 的 `Errors 1` 并把退出码变成非 0——第 11 项第一次提交就是这样被 pre-commit 钩子拒掉（同一命令重跑即绿，实测 1176/1176 + 无 error） | 按铁律 2 给这个 best-effort 预加载加 catch ＋ 注释（必要时 `console.warn` 最低级别日志），使其失败不影响调用方；CI 里也可考虑 `dangerouslyIgnoreUnhandledErrors` 以外的显式处理 |
| SH-93 | `src/client/components/hub-folder-row.tsx`（内含 `role='button'` + `tabIndex` 的 div、`FolderMoreButton`）、`components/hub-tag-item.tsx`（`TagMoreButton`、`TagExpandAffordance`）、`components/overlay/submenu.tsx`（`RowButton` 之外的裸按钮） | SH-49 只清了 `features/share`，而它用的共用组件里还有同类写法——包括 AGENTS 铁律 10 明禁的「`div` ＋ `onClick` ＋ `role='button'` 假冒控件」（`FolderRow`/`HubTagRow` 的行本体是 `div role='button'`）。第 48 项补了一条现场读数：账号一旦有标签，**分享中心自己的 axe 断言**就会以 `button-name`/`nested-interactive` 变红——CI 里那两条断言之所以是绿的，只是因为夹具账号既无标签也无访问（同源的还有 SH-102/103） | 把 SH-49 的守卫正则从 `features/share` 扩到 `src/client/components` 与其它 feature（分文件开口子、每个口子写理由），再逐处收；`div role='button'` 的行本体应换成真 `button` 或用项目组件，并补键盘路径回归。**§51 部分闭合**：`hub-tag-item.tsx`/`hub-folder-row.tsx` 两条共用行的行本体已改真 `button`、展开箭头与更多菜单按钮补上可访问名（新增 `src/client/components/hub-row-a11y.test.ts` 6 例守着形状）。**§53 闭合余下两半**：守卫改为 AST、扫整个 `src/client`（三条规则，见 §53），共用层 12 个文件逐条写明理由，`overlay/submenu.tsx` 与 `menu.tsx` 各自手写的菜单行合并为 `overlay/menu-row.tsx`；其余 feature 的 146 文件 / 397 处裸按钮只被要求“有可访问名、不是假控件”，**不要求**改走组件体系（理由与读数见 §53 局限①） |
| SH-95 | `src/client/features/blog/blog-traffic-filter-popover.tsx` | SH-50 的同源孪生：博客看板的流量过滤面板同样是 `absolute right-0 top-full w-80`（320px）＋ 无 role、无名字的 `<div>`、打开/关闭都不动焦点，窄屏上会被推出视口。它现在可以直接复用已经抽出来的 `components/popover-placement.ts` | 按 SH-50 的做法整体迁移（portal ＋ `role='dialog'` ＋ 焦点入/还 ＋ 共用定位），跑 blog 侧回归；它属 blog 自己的范围，不在本轮 share 红线内 |
| SH-96 | `src/client/lib/markdown/kanban/ui/*`（`kanban-date-picker`/`kanban-column-menu`/`kanban-sort-popover`/`kanban-tag-picker`/`kanban-view-options`/`kanban-filter-popover`/`kanban-item-detail` 共 6+1 处）、`src/client/lib/markdown/slides/ui/slides-topbar.tsx`（2 处） | `absolute right-0/left-0 top-full` 这种自定位浮层在仓内仍是主流写法（分享中心本轮清完后还剩这些），且没有任何门禁要求它们走 `usePanelPlacement`——同样的窄屏裁切缺陷可以再长出来 | 先定一个门禁边界（允许清单 ＋ 理由）：新写的自定位浮层必须走 `components/popover-placement.ts`，已有清单分批迁移；或给一个统一的 `Popover` 原语把这些都收进去 |
| SH-99 | `scripts/e2e-visual.mjs` 的 `LABELS.share*` 与 `scripts/check-contrast.mjs` 的 `SHARE_LABELS` | 两个门禁各自保存了同一套「分享中心」文案对（打开同一个表面、按同一个控件），一旦一侧改了文案另一侧会以「找不到控件」失败而告终 | 把那两个打开器（含文案对与定位规则）提到 `scripts/e2e-harness.mjs`，两个门禁共用一份；顺便把 `openShareHub` 的手机路径也一并收进去 |
| SH-100 | `scripts/check-contrast.mjs` 的 `openMusicHubList` | 在 `scripts/e2e.mjs` 刚跑过（177/0）的全新临时实例上，该门禁停在「找不到 `列表视图/List view`」而崩掉；本轮把分享中心表面排在它前面、后面都试过，两次同样崩在这里，而分享中心表面在跳过这三个音乐表面后在两套主题下都能跑完并全绿。未确认是本机音乐种子缺失还是门禁与种子之间的隐式契约 | 先弄清该门禁对音乐库前置数据的真实依赖（种子里是否真有可播放曲目），再决定是让门禁自行备好前置数据、还是把它标为需要预置实例 |
| SH-98 | `src/worker/routes/blog/stats.ts`（`viewsPerDay: Math.round(views / daysSpan)`）、`src/client/features/blog/blog-dashboard-view/index.tsx` | SH-56 的博客倒影：同样是整数取整的日均值（24h 区间下等于总 PV）且同样把 `sparklineViews` 画在日均卡上（与总访问量卡同一条线）；博客侧还有 `sparklineViews = timeline.slice(-7)` 的隐式截断 | 把 `perDayRate()` 与 `viewsPerDayDelta` 同样接到 blog 的 compose 上（worker 侧共用 `computeDelta` 已有），日均卡去掉重复 sparkline；属 blog 自己的范围，不在本轮 share 红线内 |
| SH-97 | `scripts/e2e-visual.mjs` 的思维导图场景（`the node is selected before it is deleted`、`deleting the selected node leaves the note`、`undo kept the same instance`、`alt+arrow reorders the node in the note`、`reordering kept the same instance`） | 与 SH-90 同性质：同一份产品代码在一小时内的两次门禁里一次 5/5 全绿、一次 5/5 全红（失败读数都是「实例没被复用」`same:false`），而机器当时被另一条线程的浏览器门禁占满；这些断言现在直接拿实例身份/选中态当判据，没有等待窗口 | 把「等库自己把状态写下去」这层写进断言（如等 `selected` 类/等实例身份稳定），或在判失败前带上一次显式重试；不要靠重跑掩盖 |
| SH-101 | `src/worker/routes/share/public.ts` 的 `deriveVisitRow()` / `isRecentlySeenVisit()` | 「同一访客在一个时间窗内只记一次」是**先查后写**：`isRecentlySeenVisit` 一次读，插入在随后的 `batch` 里，因此同一访客的两个并发请求都在途时可以各自读到「没来过」而各写一行。另：`visitorFp` 为空时该函数直接返回 `false`（未配置 `VISIT_FP_SECRET` 的实例就是这种），于是去重窗口**完全不生效**——实测 4 个并发请求写出 4 行，行里 `visitorFp: null`。（这条是第 47 项做集合页读数时量到的，不在该项范围内，未改代码。） | 去重要么落进库里（`INSERT OR IGNORE` ＋ 唯一键之类）而不靠读，要么把「没有指纹 ⇒ 每次访问都算一次」显式化（现在只是 `public.ts` 里的一句注释，界面上没有任何状态说明），并把 `VISIT_FP_SECRET` 写进部署清单与 `.dev.vars` 示例 |
| SH-102 | `src/client/components/dashboard-blocks.tsx` 的 `KpiCard`（`delta !== undefined` 时画出的那个 `span`） | 区间内一旦有访问量，KPI 卡就画出 delta 徽标，而那个 `span` 带 `aria-label` 却没有 role → axe `aria-prohibited-attr`（第 48 项实测：两条，`+100% 对比上一周期`）。分享中心自己的「无违规 / 无未复核项」两条断言**只在账号零访问时通过**（CI 的夹具账号正是如此），所以这条对**任何有流量的真实账号都成立**的缺陷一直没有被门禁看见 | 给徽标一个真实语义（`role='img'`，或把提示做成 `sr-only` 文本）并跑 share + blog 双侧回归；同时按 SH-103 让分享中心的 axe 断言在**有数据**的账号上也跑一遍，否则改完只是把盲区留在原地。**§51 已修**：取后者——`aria-label` 去掉，提示改为 `sr-only` 文本（仍读作「+12% 对比上一周期」），并由「有数据账号」上的 axe 断言守住 |
| SH-103 | `scripts/e2e-visual.mjs` 的 `assertShareCenter`（四条 axe 断言）与 `scripts/check-contrast.mjs` 里同一个表面 | 这些断言读的是**账号当前状态**画出来的表面：账号零标签、零访问时，hub 侧栏没有文件夹/标签行（SH-93），KPI 卡没有 delta 徽标（SH-102），于是两类违规都读不到。「分享中心没有 a11y 违规」这句话目前只在**空账号**上被证明过；第 48 项量到同一实例上第一次 230/0、紧接着第二次 222/7，红的正是这三条 | 与 SH-102 一起处理：断言前先用 API 给夹具账号造出一条标签与一次访问（各一条即可），或把这类表面拆成「空账号 / 有数据账号」两组断言，让两种状态都被读到。**§51 已修**：两个门禁共用的 `seedShareHubData()`（`e2e-harness.mjs`）在断言前把标签与访问放到夹具账号上，并断言「夹具到位」与「KPI 徽标已画出」两件事 |
| SH-104 | `src/worker/routes/blog/visits.ts` 的 `recordBlogVisit()` | SH-101 的博客倒影，且更宽一点：它同样是**先查后写**（`SELECT 1 AS seen FROM blog_visits …` 之后才 `insertBlogVisit`），所以同一访客的并发请求会写出两行；区别在于这里**每行都会写**（那个布尔只决定是否加计数），于是重复行直接进日志表。另：未配置 `VISIT_FP_SECRET` 时 `visitorFp` 为 null、那段读被跳过，对每次访问都返回 true——与分享侧同一个「无指纹 ⇒ 每次各算一次」的口径，但博客侧界面没有说明 | 与 SH-101 同法处理（窗口进 INSERT、计数跟着写入结果走），并复用 `SiteInfo.visitorFingerprints` 让博客看板与访客列表也说清楚；属 blog 自己的范围，不在本轮 share 红线内 |
| SH-105 | `src/client/components/overlay/tooltip.tsx`（`Tooltip` 渲染的 `role='tooltip'` 面板） | 提示与触发器**没有任何程序化关联**：面板没有 id，触发器上也没有 `aria-describedby`/`aria-labelledby`，所以屏幕阅读器听不到提示里的文字；而图标按钮在补名字之前，`title` 常是它唯一的名字来源（第 53 项一次量到全仓 25 处无名裸按钮，其中十几处就在 `<Tooltip>` 里） | 让 `Tooltip` 用 `useId` 给面板一个 id 并把它作为 `aria-describedby` 交给触发器（触发器的**名字**仍应由 `aria-label` 提供，提示只作描述）；属共用组件改动，要跑音乐/看板/侧栏等所有浮层回归 |
| SH-92 | `src/client/features/share/share-note-submenu.tsx`（296 行手搓面板）、`use-share-note-submenu.ts` | SH-49 唯一被白名单放行的文件：同样是菜单，却与 `buildShareMenuItems` ＋ `Menu` 那套并列存在（两套行样式、两套分隔线、两套键盘行为）。整体退役不是改名：① 它的行是 44px 触控目标（SH-35 守着的 `h-11 md:h-7.5`），而共用 `SubmenuList` 的行只有 40px（`h-10`），换过去要么降级触控目标、要么改共用行高影响音乐/看板/右键菜单；② 它的文件夹搜索与标签输入是 `role='menu'` 面板里的文本框，直接换成 `SubmenuList` 会撞 `aria-required-children`（首次试过会在新门禁里变红） | 先决定「菜单里能不能放输入框」（要么改成命令式选择、要么给面板一个非 menu 角色与自己的标签），同时把共用行高调到 44px 并跑音乐/看板/右键菜单回归；然后删掉该文件、`use-share-note-submenu` 与两处白名单条目 |

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
### 09 — 批次 A 收尾：全量串行回归（2026-09-21）

在批次 A 的 8 项（SH-78/79/84/80/82/71/55 + 文档）全部提交后，按 CI 的门禁顺序对工作区跑了一次完整回归，读数如下：

- 类型检查：`npx tsc -b --force` → exit 0（client/worker/node 三项目）。
- 静态门禁 12 项全绿：`style:check`（2 空格/无分号/单引号）、`size:check`（1417 文件扫描，20 处既存grandfather）、`comments:check`（682 文件 / 4954 条注释）、`escape:check`（无 `any`/`@ts-*`/非法断言）、`empty-catch:check`、`hardcoded:check`（218 处调色板类为既存豁免）、`tokens:check`（14 处既存 ghost 变量豁免）、`i18n:check`（3139 键，en-US/zh-CN 齐全）、`module-state:check`、`deep-imports:check`、`surfaces:check`（8 个全屏表面全部被浏览器门禁打开并读取）、`vendor:check`。
- 全量单元/集成测试：`npm run test:unit` → **314 文件 / 2568 通过，1 skipped，0 失败**（约 96s）。
- 构建与预算：`npm run budget:check`（先 `tsc -b` + `vite build`）→ 构建成功，9 个受监控分块全部在预算内（最大 `@excalidraw/excalidraw` 1081.8 KiB / 预算 1464.8 KiB）。
- 本批次累计改动：6 个提交（`76a1f76a`、`d7eadd4a`、`ccfc69f7`、`4d5cf737`、`f95e92ef`、`3cd48d9b`、`8a0cdfc7` + 文档 `afa9b286`），3 个新测试文件（`share-visit-logs-csv`、`share-form`、`share-dashboard-loading`）+ 既有文件里 9 条新用例，均按「先红后绿」。
- **未跑**（如实登记）：`test:e2e` 与 `scripts/e2e-visual.mjs` / `check-contrast.mjs`。原因：浏览器级门禁目前**没有任何分享中心场景**（这正是批次 B 的 SH-85 要补的），现在跑只能验证外壳未回归，且需要本地实例 + Puppeteer/Chrome，耗时远大于收益；批次 B 落地分享场景后会连同外壳一起跑这两个脚本，届时读数回填在 10 项里。

### 10 — SH-85 分享中心浏览器级门禁（2026-09-21）

- 根因：分享中心是仓内唯一没有任何浏览器级读者的大型表面——`scripts/e2e-visual.mjs` 的场景名单里没有它，`scripts/check-surface-coverage.mjs` 只把它算作共用 `Modal` 的一部分，而 `AGENTS.md` 当时写着「模态外壳全屏变体的唯一使用者就是思维导图覆盖层」。经核对这**不成立**：`share-hub-modal.tsx` 在手机断点用 `variant={isMobile ? 'fullscreen' : 'dialog'}`，是同一外壳的第二个使用者。于是本项补两件事：一条真实路径上打开、并读取真实数据的场景，以及把「共用外壳的每个使用者各出一条具名断言」变成门禁可强制的规则。
- 改动面（4 文件）：`scripts/e2e-visual.mjs` 新增 `assertShareCenter()`（9 条断言，接在音乐场景之后）：按人走的路径打开（侧栏「分享」入口→列表头部的「管理所有分享」→分享中心），断言「列表视图切到 shared 后，工具栏里的那个控件打开了中心」；等到 KPI 文案真的画出来（看板走 worker + D1 的真实请求，卡在加载骨架会失败，而不是在空壳上通过）；桌面宽度跑 axe（violations 为 0，且没有未复核的 incomplete）；Esc 关闭并把焦点交回打开它的那个控件；手机断点从底部导航进侧栏再开同一个中心，断言全屏变体**铺满手机视口**（实测 390×844 = 视口），再跑一遍 axe；最后断言 Esc 后中心消失、焦点回到打开它的控件、且该控件不在 `inert` 子树里。`scripts/check-surface-coverage.mjs` 的 `checkedBy` 从单条字符串改为**字符串数组**，`Modal` 条目登记两条具名断言（原思维导图那条 + 本项的全屏变体那条），并在脚本注释里写明「一个表面根被多个浮层共用时，每个使用者各出一条」；`AGENTS.md` 更正那句已经失效的「唯一使用者」说法，并把 `surfaces:check` 的说明改成「由属于它的那些具名断言代表（共用根每个使用者各出一条）」，两个方向失效的语义不变；`scripts/check-comments.mjs` 同步登记本项新增注释（4967 条）。
- 探测过程中的两个发现（写场景时的实证，不是猜的）：① 侧栏「分享」入口在**展开**侧栏时是四宫格里的 `BottomNavButton`（文案为「1分享」，计数在标签前，且没有 `aria-label`），**收起**时才是 `aria-label='分享'` 的 rail 图标；② 工作区头部那个 `workspace.share` 按钮在 zh-CN 下也叫「分享」，且就在同一个窗口右上角——第一次跑门禁时它被匹配到，于是打开了单条笔记的分享设置，而门禁在等列表头部那个控件，首条断言红。因此场景把入口查找**限定在 shell 自己的 `aside` 内**（手机断点限定在 `.mobile-pane-layer[data-active]`），并同时接受「可访问名称」与「计数 + 标签」两种画法。
- 验证读数（都在本机独立实例 `INKSTONE_EPHEMERAL_DEV=1 npx vite --mode kv --port 7722` 上）：
  - `scripts/e2e.mjs http://localhost:7722` → **177 通过 / 0 失败**（顺带把批次 A 的所有服务端改动跑了一遍真实 HTTP 回归）。
  - `scripts/e2e-visual.mjs http://localhost:7722` → **215 通过 / 1 失败**，9 条 share 断言**全绿**（含两侧 axe 与全屏铺设）；唯一失败是「slides editor: space and a drag pan the view」，与本项无关，且同一份代码的另一次运行是绿的——判为环境负载下的不稳定断言，登记为新发现 SH-90，未顺手改。
  - 变异测试（守卫型改动的必做项）：把 `e2e-visual.mjs` 里那条被 `Modal` 条目引用的断言文案改成别的字符串 → `surfaces:check` 立刻报 `modal.tsx is covered by an assertion … no longer prints`；还原后复绿。
  - 静态门禁：`node --check scripts/e2e-visual.mjs`、`surfaces:check`、`comments:check`（682 文件 / 4967 条）、`style:check`、`size:check`、`escape:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`deep-imports:check` 均绿。
  - 单元/集成：`npm run test:unit`（并行）→ 2 文件失败、5 文件失败各出现一次，单独串行复跑这两个文件 **10/10 绿**；失败项是 `share-code-split`（纯静态扫描）与 `music-hub-modal`（文案计数），都在机器被另一条线程的浏览器门禁占满时出现（一次运行里 transform 168s / environment 877s）。本项未碰任何产品代码，故按台账约定不跑全量串行回归，如实登记该读数为环境竞争所致。
- 局限（如实登记）：① axe 每次运行只读**一套主题**（浏览器门禁在该场景之前已经切过主题，具体是深色还是浅色取决于上一场景），分享中心的「层级 × 底色」还没进 `check-contrast.mjs` 那套两主题 × 全强调色的量测；② 场景读的是**看板分类**（默认分类）；列表视图那一半已在第 11 项里补上（同一场景多走一步：侧栏切到「全部分享」、断言工具栏画出来并读 axe），流量过滤浮层展开后的断言仍留给 SH-50；③ 「释放」的判定改成「打开它的控件回到键盘下且不在 `inert` 子树里」，不数页面上的 `inert` 数量——手机断点下 shell 自己的非活动窗格本来就带 `inert`（实测 2 个），数总量会把设计当回归；④ SH-91 是写场景时撞见的真实入口语义问题，本项只登记不改。

### 11 — SH-49 裸 `<button>` 绕过组件体系，而门禁只覆盖表单控件（2026-09-21）

- 根因：`features/share` 里有 15 处交互控件是手写 Tailwind 的裸 `<button>`——多数只有 `title` 当可访问名（屏幕阅读器读不到、触屏也看不到），没有共用焦点环与命中区（12px 图标 + 20–28px 命中区），pin/star 这种「按下态」控件也没有 `aria-pressed`；而 SH-33 留下的守卫正则只有 `<(input|select|textarea)`，**不覆盖 `button`**，所以门禁全绿并不代表合规。旁证是同一份「行菜单」有两套实现：`buildShareMenuItems` ＋ `Menu` 那套，与 `share-item-common`/`share-note-submenu` 里手搓的另一套（行高、分隔线、键盘行为都在分叉）。
- 复现（先红）：新增 `tests/share-bare-buttons.test.ts`（4 用例）——扫 `features/share` 全部 `ts/.tsx`，禁止裸 `<button>`、禁止 `div/span` ＋ `role='button'` 假冒控件，并要求白名单里的文件仍然真的需要它（两个方向都失败）。修复前实测列出 15 行：`share-dashboard-view.tsx:243/373`、`share-edit-modal/sections.tsx:118`、`share-grid-view/card.tsx:80`、`share-hub-sidebar.tsx:57/93`、`share-item-common.tsx:73/86/108/127/152`、`share-page/page.tsx:54`、`share-table-view/row.tsx:99`、`share-traffic-filter-popover.tsx:37`、`share-visit-logs-modal.tsx:112`；转换后 4/4 绿。
- 改动面（15 文件，均为既有组件，未新增共用抽象）：
  - `share-item-common.tsx`：pin/star 改 `IconButton`（`active` → `aria-pressed`，未按下时保留「悬停才亮」的 `opacity-45`），复制短链改 `IconButton`，并**删掉手搓的 `MoveFolderSubmenu`**，改走同文件早就有的 `buildFolderMenuItems` ＋ `submenuFor`（一次选择同时关菜单，与列表/网格的「移动到文件夹」入口行为对齐）；`PinStarButtons` 的 `compact` 参数随之成为死参数，同步从 `share-grid-view/card.tsx` 的调用点移除。
  - `share-hub-sidebar.tsx`：分类行走 `Button`（`ghost` ＋ `block` ＋ `icon` ＋ `trailing` 计数），分组折叠改 `Button`（`icon` 为方向箭头）。
  - `share-visit-logs-modal.tsx`：四个手搓 `FilterTab` 换成一个 `Segmented`（共用组件自带 `role='radiogroup'` 与方向键），`FilterTab` 组件删除。
  - `share-dashboard-view.tsx`：「最受关注笔记」的 chevron 改 `IconButton`（名字从 `title` 变成 `aria-label`），「查看全部访问日志」改 `Button`（`trailing` 放外链图标）。
  - `share-traffic-filter-popover.tsx`：触发器改 `Button`（保留 `aria-haspopup`/`aria-expanded` 与三种色调软底；面板本身与焦点行为属 SH-50，本项不动）。
  - `share-edit-modal/sections.tsx`、`share-grid-view/card.tsx`、`share-table-view/row.tsx`、`share-page/page.tsx`：标签删除、标题即按钮、访客页的主题开关，分别改 `IconButton`/`Button`（标题那两处用 `Button variant='ghost'` ＋ 覆盖成纯文本外观，保持既有的“像链接”视觉）。
  - `scripts/e2e-visual.mjs`：SH-85 的那条场景多走一步——侧栏切到「全部分享」，断言列表视图的工具栏真的画出来，并在这一视图上再读一遍 axe；这样本项改的表格行、pin/star、复制短链等控件才**有读者**（原先只有看板被读）。
  - `scripts/check-comments.mjs` 登记新增注释（684 文件 / 4974 条）。
- 门禁首跑即抓到一条真实缺陷（本项一并修）：列表视图 axe 报 `select-name` ×2——`share-hub-toolbar.tsx` 的状态筛选与排序两个 `<select>` 没有可访问名（`Select` 会透传 `aria-label`，只是没人给）。补 `share.status_filter_label` / `share.sort_label` 两条 i18n 键（en + zh）后复绿；同一类缺陷在 `share-edit-modal/sections.tsx` 的文件夹 `<select>` 上也存在（它有可见小标题但无程序化关联，而门禁不打开那个弹窗所以读不到），一并补 `aria-label={t('share.folders_isolation')}`。
- 验证读数：
  - 新守卫 `tests/share-bare-buttons.test.ts` 4/4（修复前 1 红）；`src/client/features/share` ＋ 三个 share 守卫共 **27 文件 / 128 用例**绿（含 `share-a11y`、`share-narrow-screen`、`share-small-defects`、`share-touch-targets`、`share-table-semantics`）。
  - `npx tsc -b --force` exit 0；`i18n:check` **3141 键**（+2）通过；`comments/style/size/hardcoded/escape/tokens/deep-imports/empty-catch/module-state/surfaces` 10 项静态门禁全绿。
  - 浏览器门禁（本地实例 + `node scripts/e2e.mjs` 建号后的同一实例）：`scripts/e2e.mjs` → **177 通过 / 0 失败**；`scripts/e2e-visual.mjs` → **218 通过 / 1 失败**，12 条 share 断言**全绿**（含列表视图与手机断点两次 axe）；唯一失败仍是 SH-90 那条与本项无关的不稳定断言（同一份代码上一轮绿、这一轮红）。
- 局限（如实登记）：① `share-note-submenu.tsx` 是**唯一**白名单放行的文件，理由与退役的前置条件写成 SH-92（共用 `SubmenuList` 行高 40px vs SH-35 的 44px 触控目标；菜单面板里放输入框会撞 `aria-required-children`），本项只把守卫与理由钉住；② 尺寸变化未经像素级核对：`IconButton size='sm'` 是 32px(手机)/24px(桌面)，比原先 20–28px 的命中区大，短链 chip 与标签 chip 会随之变高（浏览器门禁只读 a11y 与布局稳定性，不比对像素高度）；③ `Segmented` 把日志筛选从「自绘 tab」变成 `role='radiogroup'`，语义更准确但屏幕阅读器读法从 tab 列表变成单选组，属有意变更；④ 仅修了分享中心内的裸按钮，共用组件自身（`hub-folder-row.tsx`、`hub-tag-item.tsx`、`overlay/submenu.tsx` 里的 `FolderMoreButton`/`TagMoreButton`/`RowButton`）仍有同类写法，属仓级问题，另立条目跟踪（见 SH-93）。

### 12 — SH-50 流量过滤浮层：无 role/焦点契约、窄屏被裁到视口外（2026-09-21）

- 根因（三件事分开查证，不是一句「样式不对」）：
  - **裁切**：面板是 `absolute right-0 top-full w-80`（320px）挂在触发器上，而触发器在会换行的头部里可以贴在右边缘；360px 手机上面板左边缘落到视口外，第一个开关被裁掉。
  - **语义与焦点**：面板是个没有 `role`、没有可访问名的 `<div>`；打开时焦点留在触发器上，Escape 或点外部关掉后也没人把焦点交回去（键盘「站在原地」）。
  - **参考系**：面板可能开在带 transform 动画的 `Modal` 里（访问日志/看板就住在模态里），此时 `absolute` 以动画中的祖先为参照，位置会跟着动画抖。
- 复用而非新造：先读仓内另外两个自定位面板（`tag-filter-popover`、`use-date-range-popover`）——它们**各自**算一遍 `getBoundingClientRect()`，于是把这套数学提成共用模块 `src/client/components/popover-placement.ts`：纯函数 `computePanelPlacement()`（锚点下方、左右对齐、下方放不下就翻到上方、无论哪种都夹在视口内，留 8px 边距）＋ `usePanelPlacement()`（`apply` 要求稳定引用，尺寸变化时重算）。三处共用，删掉了各自的 position 状态与 `resize`/`scroll` 监听（`use-tag-filter-popover.ts` 因此少 22 行）。
- 改动面：
  - 新增 `components/popover-placement.ts`；`components/tag-filter-popover.tsx`、`components/use-tag-filter-popover.ts`、`components/use-date-range-popover.ts` 改走共用定位（日期面板的尺寸随预设编辑器开关变化，调用点显式传入）。
  - `features/share/share-traffic-filter-popover.tsx`：面板 `createPortal` 到 `document.body`，加 `role='dialog'` ＋ `aria-label` ＋ `tabIndex={-1}`，打开后焦点进面板，Escape/点外部关闭并把焦点交回触发器；触发器（SH-49 已换成 `Button`）保留 `aria-haspopup='dialog'`/`aria-expanded`。
  - `share-a11y.test.ts` 的断言从容器改到 document（面板已 portal，仍在子树里找就永远找不到）。
- 先红后绿（三个新测试文件都是本项首次为这些路径建的读者）：`components/popover-placement.test.ts`（7 例，按数字断言：320px 面板贴右边缘时左边缘 ≥ 边距、下方不足翻上、两边都不足保左边缘）、`components/tag-filter-popover.test.ts`（3 例：portaled、有名字、box 不落在负坐标）、`features/share/share-traffic-filter-popover.test.ts`（4 例：命名 dialog、焦点进入、Escape 关闭并归还焦点、点外部关闭）。
- 浏览器级（本项真正的读者）：`scripts/e2e-visual.mjs` 的分享场景在**手机断点**加三条具名断言——① 打开后量出的 box 完全落在 390×844 视口内（读 `getBoundingClientRect()`，不是读 class）；② 该面板 axe violations 为 0；③ Escape 关闭后焦点回到打开它的控件。`scripts/check-comments.mjs` 同步登记（5005 条 / 691 文件）。
- 验证读数：
  - `npx tsc -b --force` exit 0；`size:check` **通过**（1421 文件扫描、20 个 grandfathered）。中间一次红灯值得记下：拆分前 `useDateRangeCore` 53 行、`ShareTrafficFilterPopover` 87 行（都超 50），按职责拆出 `useRangePanelPosition` / `usePanelBox` / `useFocusOnOpen` / `filterBadge` / `FilterTrigger` / `FilterPanelSurface` 后归零——**没有**用 `--update-baseline` 把违规快照进去。
  - 定向测试：`popover-placement` 7 ＋ `tag-filter-popover` 3 ＋ `share-traffic-filter-popover` 4 ＋ `date-range-popover` 7 ＋ `share-a11y` 7 = **28/28**；连同分享守卫集合计 **8 文件 / 42 用例**绿。
  - 静态门禁 11 项全绿（`comments` 5005 条/691 文件、`hardcoded` 218 处/62 文件、`i18n` 3141 键、`size` 1421 文件）。
  - 浏览器门禁：重构前 `scripts/e2e-visual.mjs http://localhost:7722` → **222 通过 / 0 失败**（分享场景 15 条断言全绿）；拆分后同一门禁再跑一次 → **216 通过 / 6 失败**，分享场景 15/15 **仍全绿**，6 条失败全在与本项无关的场景（思维导图 5 条 + SH-90 的 slides pan 1 条），而这些场景在 40 分钟前的同门禁里全绿——同一台机器上另一条线程正跑自己的浏览器门禁（7799），如实登记为环境负载所致，未用重跑掩盖，也未顺手改；思维导图那组另立 SH-97。
- 局限（如实登记）：① 同源的 `features/blog/blog-traffic-filter-popover.tsx` 仍是旧写法（同样的 `absolute right-0 top-full` ＋ 无 role 面板），属 blog 自己的范围，登记为 SH-95；② `absolute … top-full` 的自定位浮层在 `lib/markdown/kanban/*`（7 处）与 `lib/markdown/slides/*`（2 处）还在，没有任何门禁要求改用 `usePanelPlacement`，登记为 SH-96；③ 面板高度仍是「先估后量」（首帧 `invisible`），理论上有一帧不可见；④ 视口夹取用 `left`＋8px 边距，未做 RTL 逻辑属性（与仓内其它面板一致）。

### 13 — SH-51「新建文件夹/标签」是 hover-only，键盘看不见、触屏摸不到（2026-09-21）

- 根因：分享中心侧栏分组标题上的「新建」按钮是 `opacity-0 group-hover/head:opacity-100`——① 键盘 Tab 到它时仍不可见（违反 WCAG 2.4.7 焦点可见）；② 触屏根本没有 hover，而它是**创建文件夹/标签的唯一入口**，于是这两个功能在手机与触屏设备上事实上不可达。
- 修法沿用仓内既有写法（不是新发明）：`opacity-100 md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100`，即 `features/list/note-list/header.tsx` 那套「`md` 以下常显；`md` 以上指针与键盘都能揭示」。
- 先红后绿：新增守卫 `tests/share-hidden-controls.test.ts`（4 例）——扫 `features/share` 里所有会隐藏的类，要求 ① 隐藏控件带 `focus-visible` 揭示、② 只在 `md:` 及以上隐藏（更窄的宽度没有 hover 可依赖）；两个方向都失败（新长出一处 hover-only 会红，白名单里留下已不再隐藏的条目也会红；白名单当前为空）。
- 验证读数：`tests/share-hidden-controls.test.ts` 4/4（修复前 1 红）；`npx tsc -b --force` exit 0；11 项静态门禁绿；浏览器门禁里分享场景会在两个宽度打开侧栏并跑 axe，因此这条修法在真实渲染中有读者（同第 12 项的两次读数，分享场景 15/15 全绿）。
- 局限：① 守卫只覆盖 `features/share`，共用组件里的同类写法属 SH-93；② 按钮常显后由既有 i18n 文案提供可访问名（`share.new_folder`/`share.new_tag`），未额外加图标名；③ 常显对标题行右侧宽度的像素影响未专门核对（门禁只读 a11y 与布局稳定性）。

### 14 — SH-53「即将到期」桶与「有到期时间」语义对齐（2026-09-21）

- 根因：列表查询与 `STATUS_CONDITIONS` 里 `expiring` 的条件是 `expires_at IS NOT NULL AND expires_at > now`——**任何**未来到期（含 200 天后）都落进这个桶，而中英标签（有效期内 / Expiring）都在暗示「快到期了」；真正可行动的「7 天内到期」桶不存在，侧栏与工具栏都没有入口。
- 决定（写进代码，不靠文案）：新增 `EXPIRING_SOON_DAYS = 7`（`src/shared/constants.ts`，分类、行的告警色、后续批量续期共读同一个数），新增分类 `expiring_soon`，并把旧分类正名为「有到期时间 / Has Expiry」。两者是**包含**而非互斥：`expiring` 保留所有未来到期（含即将到期的那些）——按「有到期时间」的字面意思，窄集里的行不该从这个更宽的桶里消失；与 `expired` 仍然互斥。（审查文档里写的是「与 expired 互斥」，本项按此实现并把「包含」写入测试与台账。）
- 改动面：
  - `src/shared/constants.ts`：`EXPIRING_SOON_DAYS`；`src/shared/types/share.ts`：`ShareCategory` 加 `'expiring_soon'`、`globalStats` 加 `expiringSoonShares?`。
  - `src/worker/routes/share/shares.ts`：四个读时钟的状态条件（active/expired/expiring/expiring_soon）从原来的 if/else-if 链提成 `statusTimeCondition()`（返回待编号的 SQL ＋ 待绑定值），列表查询只在 `bindIndex` 处编号——这样既是新分类的落点，也把嵌套降回阈值内（见验证读数）。
  - `src/worker/routes/share/global-stats.ts`：同一条 summary 语句加 `expiring_soon_shares` 计数（只多一个 `COUNT(CASE …)` 与一个绑定）并进 `buildShareGlobalStats`，侧栏徐章因此有真实数字。
  - `src/client/features/share/share-store/filters.ts`：分类→状态映射；`statusForCategory` 改为导出（让守卫能读）。
  - `src/client/features/share/use-share-hub-sidebar.tsx` 新增分类行（Timer ＋ warning 色 ＋ 计数）；`share-hub-toolbar.tsx` 状态筛选补上该选项；`share-table-view/row.tsx` 到期时间落在 7 天内时用 warning 色（同一个常量）。
  - `src/client/demo/backend/routes/share.ts`：体验版补 `expiringSoonShares` 与状态映射——同一张表原本还漏了 `expiring`/`permanent`/`expired` 三项（点这些分类会返回全部，即「筛选默默无效」），本项一并补齐（同类缺陷、同一张记录）。
  - 两个 locale：新增 `share.category_expiring_soon`；`share.category_expiring` 改为「有到期时间 / Has Expiry」。
- 先红后绿：`tests/share-routes.test.ts` 新增一例（3 天／30 天／已过期三行的划分、与 `expired` 互斥、`globalStats.expiringSoonShares === 1`），实现前红；新增守卫 `src/client/features/share/share-category-status.test.ts`（2 例）——用 `Record<ShareCategory, string>` 做**类型级穷举**（新增分类不登记就编译不过）＋ 逐项断言映射结果；变异测试：删掉映射里那一行，守卫立刻红（1 failed），还原复绿。
- 验证读数：`tests/share-routes.test.ts` **76/76**；新守卫 **2/2**；`npx tsc -b --force` exit 0；**全量串行回归 319 文件 / 2591 通过 + 1 skipped / 0 失败**（`--no-file-parallelism --testTimeout=30000`，本项碰了 worker SQL 与共享类型，故跑全量）；静态门禁 11 项全绿（`i18n` 3142 键，新增 1；`hardcoded` 无新增字面量）。中间红过一次值得记下：加上第四个 `else if` 后 `size:check` 报 `shares.ts ... {"deepFns":1}`（嵌套超 3 层）——提成 `statusTimeCondition()` 后归零，同样**没有**用 `--update-baseline` 遮盖。
- 局限：① `expiring_soon` 与 `expiring` 有意重叠（见上），UI 未额外标注这层包含关系；② 侧栏 `password`/`expiring`/`permanent` 三个分类仍无计数（属 SH-52，本项只补了新分类）；③ 到期提醒（通知/邮件）与批量续期（SH-62）仍未做，本项只把「看得见」补齐。

### 15 — SH-60 看板视图拆到「最后一格」之下 + range 选项收口（2026-09-21）

- 根因：`share-dashboard-view.tsx` 468 行 / 9 个子组件，而 `check-size` 的 `maxFileLines` 是 500——再加一张卡就撞墙（同构的 blog 看板早已拆成 7 个文件）；另一处重复：range 选项（24h/7d/30d/all）在看板与单篇分析里各写一份。
- 做法（纯搬家，零行为变化）：
  - 新增 6 个兄弟文件，沿用本 feature 已有的 `share-dashboard-loading.tsx` / `share-dashboard-timeline-card.tsx` 的命名与位置习惯——**没有**新建「子目录 + index.ts」，因为 `deep-imports:check` 禁止穿透带 `index.ts` 的目录，兄弟文件是同一目标下更贴合的形态：`share-dashboard-card-shell.tsx`（CardHeader/EmptyRow）、`share-dashboard-header.tsx`（DashboardHeader/FilterSummaryBanner）、`share-dashboard-kpis.tsx`（KpiGrid/ActiveSharesCard）、`share-dashboard-breakdown.tsx`（国家/来源/设备三张卡 ＋ `localizeDeviceName`）、`share-dashboard-top-notes.tsx`（TopNotesCard/TopNoteRow）、`share-dashboard-activity.tsx`（RecentActivityCard/RecentVisitRow/VisitBadges）。
  - `share-dashboard-view.tsx` 只剩外壳 48 行：三态判定（失败 / 首载 / 数据）与卡片编排。
  - `share-helpers.ts` 新增 `rangeOptions()`，看板头部与单篇分析弹窗共用（删掉弹窗里那份私有拷贝）。
  - `share-devices-empty.test.ts` 的 import 改指新的 breakdown 文件。
- 验收：`npx tsc -b --force` exit 0；`size:check` 通过（1428 文件扫描，拆分后最大一个 177 行）；`deep-imports:check`、`style`、`hardcoded`、`comments`（5032 条 / 702 文件）均绿；定向测试 17/17（devices-empty、dashboard-loading、analytics-error、note-analytics-logs、share-form）。
- 局限（如实登记）：① 只搬家 ＋ 一个共享函数，**没有**动看板的任何口径或样式，因此没有新增测试（SH-56/57/54 会继续在这些新文件上改）；② `DashboardHeader`/`FilterSummaryBanner` 仍整体收 `bundle`，没有顺手收窄成具体 props（无关重构，按「不顺手改无关问题」留待后续）；③ 与 blog 侧目录形态仍不完全一致（blog 是子目录 + index），本项按 deep-imports 约束取兄弟文件。

### 16 — SH-59 网格视图重渲成本与空态文案（2026-09-21）

- 根因：SH-22 轮次只修了表格路径（`ShareTableRow` 已 `memo` ＋ 稳定 handler ＋ `folderById` Map），网格路径全是遗留：`ShareGridCard` **未 memo**、每张卡现场收 12 个内联箭头闭包、每张卡还自己做 `folders.find`（O(行×目录)），于是勾选/复制任意一张卡都重渲整个网格；两个视图的空态文案也不一致（网格缺 hint）。
- 做法（向表格路径对齐，不新造抽象）：
  - `share-grid-view/card.tsx`：`ShareGridCard` 改 `memo(...)`；props 从「无参回调」改成 note 作用域回调（`onToggleSelect(noteId)` …），卡内再用 `cbs` 组装 `ShareItemCallbacks`；`folders.find` 改成 `folderById.get(...)`；`onDoubleClick` 也改成 `() => onOpenEdit(share)` 而不是直接传回调（它收参数，直接传会把事件对象当 share 传进去）。
  - `share-grid-view/index.tsx`：`folderById` 用 `useMemo` 建一次，并直接下发 store 的稳定 handler（不再逐个包成箭头）。
  - 新增 `share-list-empty.tsx`（空态块），网格与表格共用——表格原来有 hint、网格没有，现在两处一致（两处原本各写一份 DOM）。
  - `share-a11y.test.ts`：网格卡的夹具补 `folderById`。
- 先红后绿 ＋ 变异：新增 `share-grid-render-count.test.ts`（1 例，按行为不是按「有没有写 memo」）：把 `PinStarButtons` 桩成渲染计数器（每张卡每次渲染正好调一次），三张卡渲染后计数各为 1，把选择切到中间那张后断言 **a/c 仍为 1、b 为 2**；变异测试：把 `memo` 去掉后守卫立刻红（`expected 2 to be 1`，证明它真的在守 memo 与稳定 handler），还原复绿。
- 验证读数：`npx tsc -b --force` exit 0；**`features/share` 全目录 + `tests/share-table-semantics.test.ts` 共 30 文件 / 134 用例全绿**（含新守卫与 a11y）；11 项静态门禁全绿（`comments` 5035 条 / 705 文件，`size` 通过）。
- 局限：① 网格与表格的**卡片/行**已对齐，但两者仍各有一套 DOM（没有合并成一个组件）——形态差异（列表行 vs 卡片）真实存在，不强行合并；② 空态文案统一为表格那句 hint，网格侧此前从未有过自己的 hint，属新增可见文案（复用既有 i18n 键，无需新翻译）；③ 未做虚拟化（SH-77，无规模证据）。

### 17 — SH-57 数字本地化 / delta 语义 / 图表文本替代（2026-09-21）

- 根因（三件事同一类：组件按「看起来对」写，没按「读得出来」写）：
  ① `KpiCard` 用 `value.toLocaleString()`——**跟随 OS 而不是应用 locale**（应用可切语言，`i18n:check` 抳不到这类；仓内 `lib/time.ts` 早有 `formatNumber()`，内部走 `localeTag()`）；`BreakdownRow` 的计数与百分比则连格式化都没有。
  ② delta 只有裸文本 `+12%`，没有「对比上一周期」这层可访问语义，箭头图标也无 `aria-hidden`（屏幕阅读器会读成图标名）。
  ③ `BigSvgChart` 没有 `role`/`aria-label`/文本替代，唯一信息载体是每个点的 8px `<title>`（只有指针悬停才看得到）。
- 改动面：
  - `src/client/components/dashboard-blocks.tsx`：`KpiCard` 改 `formatNumber()`；新增可选 `deltaHint`（调用方传入本语言文案），delta 容器据此得到 `aria-label` ＝「屏幕上的百分比 ＋ 对比口径」，箭头图标 `aria-hidden`；sparkline 容器加 `aria-hidden`（它只是上方数字的图形回声，不应进阅读顺序）；`BreakdownRow` 的计数与百分比走 `formatNumber()`。
  - `src/client/components/big-svg-chart.tsx`：新增 `export function chartSummary(values, labels)`（区间总量、峰值、峰值所在标签）与必填 `ariaLabel`，图表本体变 `role='img'` ＋ `aria-label` ＋ `focusable='false'`；每个点的 `<title>` 保留给指针用户。
  - 三个调用点各自把数字与口径填进自己的文案：`share-dashboard-timeline-card.tsx`、`share-note-analytics-modal.tsx`（`share.timeline_chart_aria`）、blog 的 `trend-chart-card.tsx`（`blog.timeline_chart_aria`）；KPI 的 6 个调用点（share 三张卡中两张 ＋ blog 两张）传入 `deltaHint`。
  - 两个 locale 各新增 `*.timeline_chart_aria`（带 `{total}/{peak}/{at}` 参数）与 `*.delta_vs_previous`（share + blog 各一套，en + zh）。
- 先红后绿：新增两个测试文件——`components/dashboard-blocks.test.ts`（4 例：按应用 locale 格式化（断言 `Intl.NumberFormat('en-US')` 的结果而不是 OS 默认）、delta 的可访问名等于「+12% + 该语言的口径」、sparkline 容器 `aria-hidden` 且里面有 svg、breakdown 计数也格式化；两段 describe 分开以免撞 `size:check` 的 50 行上限）与 `components/big-svg-chart.test.ts`（3 例：`chartSummary` 的总量/峰值/峰值标签（含空数组）、`svg[role='img']` 的可访问名就是调用方传的那句、空数据时画空态而不是无名图表）。
- 验证读数：`npx tsc -b --force` exit 0；**共用面双侧回归 `features/share` ＋ `features/blog` ＋ `components`：47 文件 / 217 用例全绿**；11 项静态门禁全绿（`i18n` 3146 键，新增 4；`size` 通过，`comments` 5040 条 / 707 文件）。中间 `dashboard-blocks.test.ts` 被 `size:check` 报过一次 `longFns`（describe 体超 50 行），拆成两段后归零。
- 局限（如实登记）：① `deltaHint` 是可选的（不传就没有可访问名），没有加类型强制——现六个调用点都传了，但新写的 KPI 卡可以忘记，这层需要 review 把关（也可后续改成必填）；② `BreakdownRow` 的百分比仍是整数取整展示（未加小数位），与 SH-56 的「日均取整规则」是两件事；③ 图表的“文本替代”是 `aria-label` 一句话，没有另做视觉隐藏的极值列表（审查曾提到可补，但 `aria-label` 已能完整读出区间与峰值，先不加冗余隐藏文本）；④ sparkline 标为装饰，因此它自身的形态信息（单点、阶梯）对屏幕阅读器不可得——有意取舍：上方数字已是同一信息的精确形式。

### 18 — SH-56「日均访问量」口径与重复 sparkline（2026-09-21）

- 根因（两个独立问题叠在同一张卡上）：
  ① `viewsPerDay: Math.round(aggregate.views / daysSpan)`——取整规则未说明，且 24h 区间下 `daysSpan` 恰好为 1，这张卡于是等于「总访问量」，却仍叫日均。
  ② 客户端把 `sparkline={analytics?.sparklineViews}` 直接给了日均卡——与「总访问量」卡画的是**同一条线**，一行四张卡里出现两条一模一样的曲线（零信息量），而且这张卡根本没有任何 delta。
- 改动面：
  - `src/worker/lib/share-analytics.ts`：新增 `perDayRate(views, daysSpan)`（保留一位小数，窗口短于一天也按一天计，附取整规则的理由）。
  - `src/worker/routes/share/analytics.ts`：`viewsPerDay` 改走 `perDayRate`；新增 `viewsPerDayDelta`——用**同一长度**的上一窗口的日均值做比较（`computeDelta(viewsPerDay, prevViewsPerDay)`），因此这张卡回答了「速率有没有变」而不是「窗口是不是变长了」；无上一窗口时不下发 delta（不编造 0%）。
  - `src/shared/types/share.ts`：`ShareGlobalAnalytics` 加 `viewsPerDayDelta?: number`。
  - `src/client/features/share/share-dashboard-kpis.tsx`：日均卡去掉重复 sparkline，改传 `delta` ＋ `deltaHint`。
  - 两个 locale：`share.views_per_day` 改为「区间日均访问量 / Average per Day (range)」，把口径写进标签本身。
- 先红后绿：`tests/share-analytics.test.ts` 新增 `perDayRate` 一例（24h 区间等于总量、7 天区间得 42.9 保留一位小数、0 不要变成 NaN、`daysSpan` 为 0 也不除零），实现前红；另新增 `src/client/features/share/share-dashboard-kpis.test.ts`（3 例）：四张卡里**只有两条** sparkline（多画一条就红）、日均卡显示 42.9 且带「对比上一周期」的可访问名、没有上一窗口时不得凭空出 delta。
- 验证读数：`npx tsc -b --force` exit 0；定向测试 36/36（share-analytics ＋ 三份看板测试）；**全量 `npm run test:unit`：321 文件通过 / 2597 用例通过 + 1 skipped，唯一的 1 例失败是 `tests/share-code-split.test.ts` 的 5s 超时**（它要遍历模块图，并行下跑了 6.8s；单独串行复跑 **4/4 绿**）——与本项无关，登记为环境负载所致（同第 10 项时的读数）；静态门禁全部通过（`i18n` 3146 键、`comments` 5048 条 / 708 文件、`size` 通过）。
- 局限：① 日报日均值保留一位小数后，24h 区间下它就是总量（口径如此，已在测试里固定），没有额外的「区间天数」提示；② 博客看板有同名缺陷（整数取整 ＋ 重复 sparkline），属 blog 自己的范围，登记为 SH-98；③ 演示模式 `demo/backend/routes/share.ts` 的 `viewsPerDay: 56` 是写死的示例值，未动（演示数据本来就是常数）。

### 19 — SH-58 hub 分类徽标复用外壳规则并被对比度门禁看见（2026-09-21）

- 根因：外壳侧早有一条明写的规则——`count-badge.ts` 的注释记着「选中行坐在 accent 软底上，最暗那一层文字在那上面只有 3.86:1，所以选中行取上一层」；而分享中心侧徐标是**另一套实现**（自带不透明 `bg-[var(--bg-card)]` 盘面 ＋ `text-[var(--text-tertiary)]`），它用「画一层不透明底」绕开了那条规则，而不是遵守它；同时分享中心根本不在 `scripts/check-contrast.mjs` 的表面名单里，所以这条漂移没有任何读数在守。
- 改动面：
  - `src/client/components/count-badge.ts`（由 `features/sidebar/sidebar/count-badge.ts` 移动而来）：它是跨 feature 的**共用视觉规则**（外壳侧栏、日历树、文件夹/标签行、分享中心分类栏都用），放在 `components/` 比放在侧栏特性内部更诚实；5 处引用同步改路径（含分享中心），注释补上「谁在用它」。
  - `src/client/features/share/share-hub-sidebar.tsx`：分类行的徐标改走 `countBadgeTone(isSelected)`，去掉那层不透明盘面——选中行的徐标因此取上一层文字层级，与外壳同一规则。
  - `scripts/check-contrast.mjs`：新增 `share center` 表面，打开器走人真走的路径（侧栏「分享」→ 列表工具栏的「管理所有分享」→「全部分享」），最后一步是**故意**的：只有选中一个带计数的分类行，徽标才会坐在 accent 软底上，也就是这条规则真正谈的那对像素。该表面排在名单最后，因为它会把 shell 自己的窗格切到分享列表。
- 验证读数（全新临时实例 `INKSTONE_EPHEMERAL_DEV=1 npx vite --mode kv --port 7723`，先 `node scripts/e2e.mjs` 177/0 建号）：
  - `light · share center`：**3 个层级落在软底上，0 个低于 AA**（另 20 个普通对交给调色板门禁）；`3 个强调底色对 × 7 个强调色 = 21 次量测，0 个低于 AA`；`axe: 29 checks passed, 0 violations, 1 reviewed item`。
  - `dark · share center`：同样 **0 低于 AA**（25 个普通对交给调色板门禁）；`21 次强调量测 0 低于 AA`；`axe: 29 checks passed, 0 violations, 1 reviewed item`。
  - 整个门禁：`contrast gate passed: every text tier, accent and status color painted on a tint clears AA in both themes`（rc=0）。
  - **如实说明**：上面这次通过是在「跳过三个音乐表面」的临时副本上跑的——原脚本在本机这个实例上会停在音乐的 `列表视图/List view` 找不到而崩（改前先跑过一次、把分享中心排在前后各试过一次，都崩在同一点）。该崩溃与本项无关（本项没碰音乐代码），登记为 SH-100；临时副本与临时实例都已删除。
  - 单元与静态：`npx tsc -b --force` exit 0；`features/share` ＋ `features/sidebar` 共 **31 文件 / 139 用例全绿**；8 项静态门禁全绿（`comments` 5058 条 / 708 文件，`deep-imports` 在移动后复验通过）。
- 局限：① hub 里**文件夹行与标签行**的计数由共用组件（`hub-folder-row.tsx`/`hub-tag-item.tsx`）自己画，属 SH-93 的范围，本项只收了分类栏；② 量测统计的是「落在软底上的层级数」，不是「徐标」这个组件本身，因此它守的是规则而不是那一个 `span`；③ 两个门禁各自保存了同一套分享中心文案对（登记为 SH-99，后续提到 `e2e-harness.mjs` 共用）；④ 本机对比度门禁尚不能完整跑完（SH-100）。

### 20 — SH-52 侧栏三个分类连计数都没有（2026-09-21）

- 根因：`globalSummaryStatement` 只算 `total/active/paused/expired`，`ShareGlobalStats` 里也没有 `password/expiring/permanent` 三个字段，于是「口令加密 / 有到期时间 / 永久有效」三行永远空着——与「0 个」在视觉上无法区分（截图里那三行就是这么来的）。
- 改动面（同一条 D1 语句、零新增往返）：`src/worker/routes/share/global-stats.ts` 的 summary 再多三个 `COUNT(CASE …)`（`password_hash IS NOT NULL`、`expires_at > now`、`expires_at IS NULL`）并进 `buildShareGlobalStats`；`src/shared/types/share.ts` 的 `globalStats` 补三个可选字段；`use-share-hub-sidebar.tsx` 的三行接上计数；`src/client/demo/backend/routes/share.ts` 同步补三项（体验版同一张表也要对得上）。
- 先红后绿（含变异）：`tests/share-routes.test.ts` 新增一例断言 `[passwordShares, expiringShares, permanentShares] === [1, 1, 2]`（口令 1 条、30 天后到期 1 条、无到期 2 条）；变异测试：把 `password_shares` 的 `COUNT` 条件改成永远不成立，断言立刻红（`expected [0, 1, 2]`），还原复绿——证明它真的在守这三个数，而不是碰巧通过。
- 验证读数：`tests/share-routes.test.ts` **77/77**；`npx tsc -b --force` exit 0；11 项静态门禁全绿（`comments` 5058 条 / 708 文件）。
- 局限：① 现在三个分类都能显示 0（`count: 0` 也渲染）——这正是「与空着可区分」的意图，但侧栏因此更满，视觉密度未做核对；② 计数与列表查询是两条独立的 SQL 条件，改了一侧忘另一侧不会自动报警（本项的测试只钉住计数侧，桶的划分在第 14 项的测试里）——把两者抽成同一份谓词是后续可选的重构；③ 博客侧栏有自己的 `blog-*` 计数路径，不在本项范围。

### 21 — SH-54 看板说清自己的作用域（2026-09-21）

- 根因：选中文件夹或标签后切到「数据看板」，看到的仍是全站数字，而标题只写「分享访问看板」——同一个页面上，左边的筛选器说一套、右边的数字说另一套（上一轮 SH-30 的「近义标签同屏」是同一根因的另一面）；`use-share-dashboard-view.ts` 只订阅三个流量过滤开关，完全不读 `folderId`/`tag`，`/api/share/analytics/global` 也没有 scope 参数。
- 本项取审查里「标注先行（低风险）」的那一半：在标题下方显式写出作用域（「全部分享（含所有文件夹与标签），不随左侧筛选变化 / All shares, all folders and tags — the sidebar filters do not narrow these numbers」），两处 locale 各一条键；真正的 scope 参数留给第 24 项（SH-72，那条路由同一批改，避免两次动同一个查询）。
- 先红后绿：新增 `src/client/features/share/share-dashboard-scope.test.ts`（1 例）断言标题旁确实画出了这句作用域文案（断言的是「话」而不是「标记」，只在设计稿里存在的作用域就是原来的 bug）。
- 验证读数：`npx tsc -b --force` exit 0；定向测试 4/4（scope ＋ 首屏加载态）；7 项静态门禁全绿（`i18n` 新增 2 键，`comments` 5060 条 / 709 文件）。
- 局限：① 只标注、不缩小范围——看板数字仍是全站的，这是有意的中间态，真正的 `scope=all|folder|tag` 参数随 SH-72 落地；② 作用域文案是静态的，没有随左侧选择的文件夹名变化（它陈述的是「本页不受筛选影响」，因此不需要动态文案）；③ 未给看板加「应用到筛选」之类的交互入口（那是 SH-54 的后半部分，属功能补齐）。

### 22 — SH-61 设置面板标明每组设置存在哪里（2026-09-21）

- 根因：设置面板底部只有一个「保存」，但它写两处——流量过滤三项落在浏览器 store（`share-settings-storage`，本机本账号），保留策略落在账号（服务端清理任务读它）。界面完全不说这件事，于是「在另一台设备上还生效吗」只能靠猜；把「保存在哪」当成实现细节，用户就无从判断哪些设置在换设备后还在。
- 改动面：`share-settings-modal.tsx` 的两个分组各加一行说明（`TrafficFilterSection` 下写「保存在本浏览器」、`RetentionSection` 下写「保存在账号上」），复用 `--text-11`/`--text-quaternary` 令牌；`src/shared/locales/{en-US,zh-CN}/share-2.ts` 各加 `settings_stored_local` / `settings_stored_account` 两键。这里只声明事实，不改任何读写路径（把两组真正拆开、或把过滤项也搬到账号，是另一件事）。
- 先红后绿：新增 `share-settings-storage.test.ts`（1 例）断言两句说明都在屏幕上。注意面板经 portal 挂到 `document`，断言因此写在 `document.body` 上——写在渲染容器里会「绿在看不见的东西上」。
- 验证读数：定向测试 **2/2**（本项 ＋ UV 说明那条）；`features/share` **33 文件 / 137 用例全绿**；`npx tsc -b --force` exit 0；`i18n:check` **3150 键**；`comments:check` **5065 条 / 713 文件**。
- 局限：① 两组设置物理上仍分存两处，本项只是让它可见（真正合并需要决定过滤规则是否该按账号同步，属功能决策，未做）；② 说明是静态文案，没有「本机已保存 / 账号已保存」的状态区分，因此用户仍看不到「上一次保存到底写了哪一半」；③ 面板没有「仅保存本机」的独立动作，共用同一个按钮。

### 23 — SH-83 日志弹窗说明独立访客的口径（2026-09-21）

- 根因：UV 由「地址 + 浏览器 + 每 UTC 日更换的盐」散列而来，于是同一个人当天只计一次、同一 NAT/CGNAT 后的多人合并为一个、跨 UTC 日会重复计数。看板把 UV 呈现为「独立访客」，日志表只列指纹前缀，屏幕上看不出这个口径，用户会把它当成真实人数。
- 改动面：`share-visit-logs-modal.tsx` 在日志表下加一行说明（`share.visitor_count_note`），复用 `--text-11`/`--text-quaternary` 令牌；`locales/{en-US,zh-CN}/share-2.ts` 各加一键。只声明口径，不改任何统计实现。
- 先红后绿：新增 `share-visitor-count-note.test.ts`（1 例）断言这句话确实渲染在页面上（同 portal 约定，断言写在 `document.body`）。
- **接管说明**：本项与第 22 项由上一条并行 run 在工作区完成但未提交；用户确认该 run 已停后由本轮接管。接管时先复核改动面、重跑用例（2/2）再提交，未改动其实现；两处共用的文件（locale、`check-comments.mjs`）按 hunk 切分，保证每项的快照只带自己那份白名单与文案键。
- 验证读数：定向 2/2；`npx tsc -b --force` exit 0；`i18n:check` 键数一致；pre-commit 钩子（静态门禁 + 增量 tsc + `vitest related`）通过。
- 局限：① 说明只挂在日志弹窗，看板上的 UV 卡片本身没有同样提示（同一句话在两处出现会挤占 KPI 视觉面积，未做）；② 文案是静态的，没有按当前区间动态说明「本区间内盐轮换了几次」；③ 未提供「查看原始指纹」入口，指纹前缀仍不可解释。

### 24 — SH-72 打开分享中心不再为看板预付整张列表（2026-09-21）

- 现状与根因：`useShareHubModal` 在 `open` 时无条件 `loadShares()`，而看板落地时屏幕上一个列表行都不读——这次调用要跑 6 条 batch 语句（5 条聚合 + 1 条行查询），再加每 50 篇一条的访客统计；只想看数字时白付一次列表成本，反之亦然。
- 改动面（7 文件）：① `worker/routes/share/shares.ts` 抽出 `globalStatsStatements()` / `parseGlobalStats()` 作为那 5 条聚合的唯一描述（列表拼进原有的一次 batch，仍是单次往返），新增 `GET /api/share/stats` 只回答这 5 条，行查询下标提为 `QUERY_COUNT_FOR_LIST_ROWS`；② `shared/types/share.ts` + `shared/types/index.ts` 新增 `ShareStatsResponse`（`globalStats` 复用 `ShareListResponse['globalStats']`）；③ `client/lib/api/share.ts` 新增 `share.stats(params?, signal?)`（带三个流量过滤开关）；④ `share-store/{types,loaders}.ts` 新增 `loadStats()`（`statsEpoch` + `AbortController`），失败只 `console.warn` 并保留上一次读数——侧栏计数是列表周围的装饰，不该把一个错误态铺满整屏；⑤ `use-share-hub-modal.ts` 把开合生命周期提成 `useHubOpenLifecycle()`（顺带把 6 个浮层的重置收进一个 `closeOverlays`），落地看板且无 `initialNoteId` 时只 `loadStats()`；切分类仍由 `setCategory` 走 `loadShares()`。
- 先红后绿：新增 `share-hub-open-loads.test.ts`（3 例：看板只问计数、列表分类问列表、带 `initialNoteId` 问列表）+ `tests/share-routes.test.ts` 的 SH-72 两例（计数正确，且语句里既没有 `as share_tags_json` 也没有 `COUNT(DISTINCT visitor_fp) as uvs`；`/stats` 恰好一次 batch、零次串行查询）。
- 变异 2 发全杀（`/tmp` 备份 + 逐字节校验还原）：M1 把 `useHubOpenLifecycle` 的条件改回无条件 `loadShares()` → 第 1 例红；M2 去掉 `registerShareStatsRoute` → 服务端两例红（404）。
- 验证读数：`tsc -b --force` exit 0（**首跑拦下 `ShareStatsResponse` 未从 `@shared/types` 导出**，补 barrel 后绿——barrel 是手写名单而不是 `export *`，新类型会静默漏掉）；定向 share 相关 **37 文件 / 246 用例** + share 客户端 **3 文件 / 15 用例**全绿；12 项静态门禁全绿（**`size:check` 首跑报 `use-share-hub-modal.ts` 新增 1 个超长函数**，按职责把开合生命周期抽成 `useHubOpenLifecycle` 修掉，未改 size 基线）；`comments:check` 714 文件 / 5075 条。
- 局限：① 未实测 D1 语句数与时延的真实下降（断言的是「语句形状」而不是计时），要读数得在 workerd 上量；② 看板的三个流量过滤开关改动后 `globalStats` 不会自动重取（看板路径没有重取入口），与 SH-74 的缓存、看板作用域一并处理；③ 侧栏文件夹/标签徽标仍依赖一次列表或统计请求，没有增量更新。

### 25 — SH-73 访客统计收紧作用域；覆盖索引实测后**不加**（2026-09-21）

- 现状：列表为可见行取每篇 PV/UV 要跑 `COUNT(*) / COUNT(DISTINCT visitor_fp) ... WHERE note_id IN (50 个) AND EXISTS(SELECT 1 FROM shares WHERE slug=...)`，四个既有索引都不含 `visitor_fp`。台账要求「落地后要用 `EXPLAIN QUERY PLAN` 或等价证据说明命中」，所以先实测再决定。
- **实测结论（本项最重要的一段，免得下轮再提同一方案）**：用 `node:sqlite` 复现真实语句与默认过滤子句（`AND is_bot = 0`）逐个体检候选索引：

  | 候选索引 | 规划器计划 |
  | --- | --- |
  | 现状（只有 `(note_id, visited_at DESC)`） | `SEARCH ... USING INDEX idx_share_visits_note_time` + 回表取 slug |
  | `(note_id, visitor_fp)` | 同上，无效 |
  | `(user_id, note_id, visitor_fp)`（**台账原方案**） | 同上，**完全用不上**（查询里根本没有 `user_id` 谓词） |
  | `(note_id, is_bot, visitor_fp, slug)` | **COVERING INDEX**，`(note_id=? AND is_bot=?)` |

  即：台账写的 `(user_id, note_id, visitor_fp)` 对这条查询毫无作用；唯一能去掉回表的形态是四列索引。那是给**每次公开页访问都要 INSERT 的热表**多维护一个四列索引，而这条查询只在账号本人打开分享中心时跑——写放大换不划算的读，因此**不加**，读数留在上表里。`tags LIKE '%"x"%'` 的关联表改造属大改，同样留待单开一期。
- 本轮实际落地的小改动（1 处、零写成本）：`loadNoteVisitStats()` 加 `user_id = ?1`。`share_visits.user_id` 就是该分享的属主（`public.ts` 写入时 bind 的是 `share.user_id`），所以这是语义上的空操作，但补齐了本模块「每条分享查询都带 user 作用域」的不变量（与 SH-80 同族）；函数入参相应加上 `userId`。
- 先红后绿：`tests/share-routes.test.ts` 新增 SH-73 一例——断言捕获到的统计 SQL 含 `user_id = ?1`、UV 计数正确，并对同一条捕获语句用**真实绑定参数**跑 `EXPLAIN QUERY PLAN`，断言它是 `SEARCH share_visits USING ...` 且不含 `SCAN share_visits`。
- 变异 1 发即杀：去掉 `user_id = ?1`（同时改回 `.bind(...chunk)`）→ 该例红。
- **一条被自己纠正的读数**：同一条语句用**字面值** `user_id = 'u'` 探针时规划器选 `idx_share_visits_filter_time`，而应用实际发的是**绑定参数** `?1`、规划器选 `idx_share_visits_note_time`。两者都是索引检索，但探针读数与线上读数**不是同一个计划**——我最初那条「必须命中 filter_time」的用例首跑就红了。教训：凡靠规划器选索引的断言，探针必须用与生产一致的绑定形态，且最好只锁「不因统计信息变化而翻转」的性质（如无全表扫描）。
- 验证读数：`tsc -b --force` exit 0；定向 share 相关 **37 文件 / 247 用例**全绿；11 项静态门禁全绿。
- 局限：① 没有新索引，「列表接口最贵的一步」仍然存在，只是不再被误认为可以用三列索引解决；② 未在真实 D1 上用种子数据量测耗时，结论限于 `node:sqlite` 的规划器读数；③ 计划受表统计信息影响（无 `ANALYZE` 时可能变化），所以断言只锁「无全表扫描」这类稳定性质。

### 26 — SH-74 `range=all` 实测：不缓存，改为钉住语句预算（2026-09-21）

- 落地方式说明：台账对这一项写明「先在 workerd 本地实测一次 `range=all` 的 CPU/行数读数，再决定 TTL 与阈值」。按这个门槛先实测，结论是**本项不该引入缓存**，于是把它改成「实测 + 钉住预算」，并把缓存的阻塞点写清楚。
- 实测（`node:sqlite`，单账号 200,000 条 `share_visits`，默认过滤子句 `AND is_bot = 0`，逐条语句计时）：

  | 语句 | 耗时 | 返回行 |
  | --- | --- | --- |
  | totals | 131.5 ms | 1 |
  | timeline buckets | 181.3 ms | 3,334 |
  | country / referrer / device / os / browser dist | 141.9 / 158.2 / 125.8 / 131.1 / 133.3 ms | 各 1–4 |
  | per-target `GROUP BY` | 245.8 ms | 60 |
  | **合计** | **1,248.9 ms** | |

  即 `range=all` 一次约 **1.25 s CPU**，随账号历史**线性增长**（5k 条约 30 ms 量级），最重的一遍是 per-target。顺带纠正报告里的一句：「外加 `MIN(visited_at)` 全扫」不成立——那条探测走 `idx_share_visits_user_time` 的索引定位，代价可忽略，真正贵的是上面这 8 遍。
- **为什么没加缓存**（阻塞点是硬的，不是图省事）：① `scripts/check-module-state.mjs` 明令 worker 不得有模块级可变绑定（同一 isolate 跨请求复用，会串数据），进程内缓存被门禁直接挡掉；② 仓库里没有任何 Cache API / KV 缓存先例（只有响应头 `Cache-Control`），新增要么加绑定、要么用 `caches.default` 这种在 node 测试基座里不存在、只能静默降级的形态；③ 「新访问是否立刻作废缓存」是产品决策（接受陈旧 60 s 还是写时失效），台账自己要求写进文档而不是默认。
- 本轮实际落地：`tests/visit-aggregates.test.ts` 新增一节把预算钉住——`range=all` 恰好 **8 条语句、0 条取行、7 个 `GROUP BY`**；有界区间恰好 **1 条取行**。这样第 9 遍全量扫描（或退回取行）必须是显式动作，而不是悄悄发生。
- 变异 1 发即杀：把 `visitAggregateStatements` 的 `if (query.range !== 'all')` 改成恒真（退回 SH-16c 之前「拉行」的形态）→ 新增用例与既有等价性用例一起红。
- 验证读数：`tests/visit-aggregates.test.ts` **7/7** 绿。
- 建议（留给下轮，带阈值）：若单账号 `share_visits` 超过约 5 万行且 `range=all` 成为常用视图，再上缓存；届时优先 `caches.default` + `Cache-Control: max-age=60`（key 含 userId / range / 三个过滤开关），并把「最多陈旧 60 s」写进文档；**同时**先落下第 27 项的读侧预算——真正防「单账号自伤」的是它。
- 局限：① 缓存未落地，本轮把成本「钉住」而不是降低；② 计时来自本地 `node:sqlite`，D1 的引擎与网络不在内，绝对值不可直接当线上读数；③ 未做 `ANALYZE`，规划器行为可能随数据分布变化（与本项断言无关，它只数语句条数）。

### 27 — SH-81 读侧加 per-user 预算（2026-09-21）

- 动机：第 26 项实测到 `range=all` 一次约 **1.25 s CPU**（200k 行），而写入侧有 budget、读侧完全开放——一个卡在重试循环里的会话（或被盗会话）可以只读就把账号配额烧掉。本项补上读侧，复用仓库已有的 `consumeAttemptBudget`（D1 滑窗 + 锁定 + 429 映射），不新造限流器。
- 改动面（3 文件，恰 1 新增）：
  - 新增 `routes/share/read-budget.ts`：`consumeShareReadBudget(db, userId)`，键 `share-read:<userId>`，额度 **120 次 / 5 分钟**，越线锁 60 s；`ThrottleError` 统一转 `ApiError(429, 'too_many_attempts', …, { retryAfter })`（与 `lib/reauth.ts` 同一形态）。额度故意宽：打开看板、切区间、翻日志页、切过滤开关各算一次，人手动达不到 120 次/5 分钟，失控循环几秒就到。
  - `routes/share/analytics.ts`：两个分析端点只在 ** `ctx.range === 'all'` ** 时计费，且都放在「请求已知有效」之后（note 端点在 `loadNoteShare` 通过之后）——不收被拒请求的钱。
  - `routes/share/visits.ts`：日志分页每次计费（单请求有 LIMIT，无界的是翻页）。
- **一次被既有门禁纠正的设计错误**（本项最有价值的一段）：最初我把预算加在三条读路径的**入口**，`tests/share-routes.test.ts` 三条 SH-17a 往返数用例立刻红了——`expected 3 to be 1` / `expected 1 to be +0`。原因是 `consumeAttemptBudget` 自身要跑 3 条语句（两次 `assertNotLocked` 串行查询 + 一次 batch），等于给**常用路径**（`range=30d` 的看板打开）凭空加 2–3 次 D1 往返，而它防的是罕见失控——拿常用路径的延迟换罕见滥用是坏交换。改成「只对无界区间计费 + 有效请求才计费」后，那三条既有用例全绿。**它们抓的是真缺陷，不是过时的断言。**
- 先红后绿：`tests/share-routes.test.ts` 新增 SH-81 三例——① 越线后 `/analytics/global?range=all`、`/analytics/note/:id?range=all`、`/visits` 三者都 429 且带 `details.retryAfter > 0`；② 额度内单次 `range=all` 仍 200；③ **有界区间（`range=30d`）即使已越线也 200**（把「只对无界计费」这条设计决策钉住）。
- 变异 2 发全杀：M4 去掉 `/visits` 的计费 → 第 ① 例红；M5 把 `if (ctx.range === 'all')` 改成无条件计费 → 第 ③ 例红。
- 验证读数：`tsc -b --force` exit 0；`tests/share-routes.test.ts` **83/83**；定向 share 相关 **38 文件 / 260 用例**全绿；11 项静态门禁全绿。
- 局限：① 计费自身要 3 条语句 / 2–3 次往返，在**无界**路径上可忽略（对比 1.25 s），在 `/visits` 上相对成本偏高（该端点单次只取 100 行），若将来发现翻页被误伤，可改成「每 N 页计一次」；② 额度是常量，没有 per-account 覆盖；③ 锁定语义借自登录节流表（`login_attempts`），越线会把该账号的**读**锁 60 s——正常使用到不了，但确实是用户可见的硬拒绝，且没有单独的「读额度」文案；④ 未在真实 D1 上验证 429 的延迟与锁竞争。

### 29 — SH-76 可见性投影只在输入引用变化时重建（2026-09-21）

- 根因：`share-store/index.ts` 的模块级订阅从 `shares` + `summary` 派生「已分享笔记 id」投影，但它挂在**每次** store 写入上——包括每次键入、每次勾选——先 `new Set([...shares, ...summary])` 全量分配，再交给 `pushVisibilitySnapshot` 做 O(n) 比较得出「没变」。`pushVisibilitySnapshot` 自家的短路是对的（它只能省掉通知，省不掉调用方的分配），浪费在调用方。
- 改动面（1 文件）：把两个输入引用记住（`projectedShares` / `projectedSummary`），引用都未变直接 return；注释说明为何只有这两片状态能改变答案。
- 先红后绿：新增 `share-store/visibility-subscribe.test.ts` 两例，用 `vi.mock` 替换 `pushVisibilitySnapshot` 做计数器——① 换 `shares` 引用要推一次，而 `setViewMode` / `toggleSelect` / `clearSelection` 这三次无关写入一次都不能推，再换 `shares` 引用（内容相同、引用不同）要再推一次；② 只有 `summary` 变化时也要推。选这三类写入是有原因的：它们是纯 `set`，不触发防抖计时器也不发请求，测试不必跟 timer/网络纠缠。
- 变异 1 发即杀：去掉那行引用比较 → 第 ① 例红（无关写入开始推），第 ② 例仍绿——即用例区分的是「该推/不该推」，不是「推了没有」。
- 验证读数：`tsc -b --force` exit 0；定向 `src/client/store` + `src/client/features/share` + `src/client/features/notes` **39 文件 / 172 用例**全绿（这层改动会影响 notes 的可见性投影，所以连 notes 一起跑）；11 项静态门禁全绿。
- 局限：① 优化的是**分配与比较**，n ≤ 500 时可忽略，价值在于它每次按键都在跑（属「纯浪费」而非「卡顿」），没有基准数据；② 模块级 `let` 缓存在客户端是允许的（`module-state:check` 只禁 worker），但它确实是模块级状态，多标签页各自独立、不会互相污染；③ 未测 500 行 + 快速输入的帧时间变化。

### 28 — SH-75 全量导出：进度 / 取消 / 上限（2026-09-21）

- 根因：导出走「按 100 行串行翻页」的循环（上一轮为修「只导出当前 25 行」而加），但循环没有出口条件之外的东西：接口在跑、界面只有一个变灰的按钮，人不知道还剩多少；关掉弹窗后循环继续（已下载的页会继续累加），随时写出半个文件；历史很长时它会把账号**全部**记录拉进标签页内存，且不吭声。三件事同一根源——一个长任务没有任何「进行中」的表示。
- 改动面（6 文件，恰 1 新增）：
  - 新增 `use-visit-export.ts`：把导出这件事从「读日志」的 hook 里整个搬出来（`useVisitExport`），它自己拥有进度状态、单飞（同一时刻一次导出，重复点击先中止前一次）与 `AbortController`；`collectAllVisits` 逐页检查 `signal.aborted`（不靠 reject 传达取消——在途请求仍会 resolve），`runExport` 在写文件前再看一次 flag。
  - `use-share-visit-logs-modal.ts`：只剩列表的职责（取数 / 过滤 / 清理），导出经 `useVisitExport` 委托；返回值形状不变，弹窗侧无需改动。`VisitFilter` 上移到 `share-helpers.ts`（浏览与导出必须对「bot 是什么意思」有同一个答案，两边各写一份类型就会漂）。
  - 上限：`EXPORT_MAX_ROWS = 5000`（单页 100 → 50 次请求封顶），到顶以 `truncated` 上报，文案说「已导出 5000 行、历史更长」而不是假装导全了。
  - `share-visit-logs-modal.tsx`：工具栏下方新增进度行（`role='status'`，`loaded/total` 用 `formatNumber`），**刻意放在工具栏下面而不是里面**——按 AGENTS 的工具栏展开规则，内联面板会把头撑高、把刚点下的按钮推离指针。
  - 两个 locale 各 +3 键（`export_progress` / `export_truncated` / 已有的 `no_logs_to_export` 复用）。
- 先红后绿：`share-visit-logs-export.test.ts` 新增两段 describe（上限与进度 / 取消）共 3 例——① 1.2 万行历史只发 50 次请求、写出的文件恰好 5000 行、toast 是 `export_truncated`；② 第 2 页被 gate 挂起时 `role='status'` 已含 `export_progress` 且**还没写文件**；③ 关闭弹窗后 `exportVisitsToCsv` 一次都没被调用、进度回到 idle。
- 变异 1 发即杀（抽取之后再验一次，证明剥离没把取消接丢）：把 `useVisitExport` 里 close effect 的 `abort()` 去掉 → 第 ③ 例红，其余 5 例仍绿。
- **一次被 `size:check` 纠正的形状**：原先把进度/取消/上限都塞进 `useShareVisitLogs`，该函数从 ≤50 行涨到 75 行。没有 resnapshot 基线（那正是门禁说的「不要手改」），而是把导出拆成独立 hook——它本来就是另一个职责（长任务 vs 列表浏览），拆完两个函数都在限额内，`size:check` 归零。同理，新加的 describe 体超 50 行，按「上限+进度」与「取消」拆成两段。
- 验证读数：`tsc -b --force` exit 0；`features/share` 全目录 + `tests/share-english-literals.test.ts` + `tests/share-visit-retention.test.ts` **37 文件 / 156 用例全绿**；11 项静态门禁全绿（`size:check` 通过、1438 文件扫描、`comments` 5107 条 / 717 文件）。
- 局限：① 上限 5000 是常量，没有设置项，也没有「继续导出剩余部分」的分段导出；② 进度是「已取行 / 接口给的 total」，当过滤条件在两次翻页之间变化时 total 可能微调（导出用的是一次快照的查询条件，不会中途换条件）；③ 取消只在页面切换/弹窗关闭时触发，没有单独的「停止」按钮（导出通常几秒内结束，加按钮会把工具栏再塞满）；④ 未在真实 D1 上验证 50 次串行请求的耗时。

### 30 — SH-77 关闭虚拟化（有界列表）并把截断文案从写死的 500 改成模板（2026-09-21）

- **规模证据（正向）：天花板是硬的、服务端定的、不随历史增长。** `routes/share/shares.ts` 用 `LIMIT ${SHARE_LIST_ROW_LIMIT + 1}`（`SHARE_LIST_ROW_LIMIT = 500`）探测：超过就 `truncated: true` 并 `slice(0, 500)`，即**列表永远不可能超过 500 行**；且行的选择粒度已由上一轮 SH-59 做到「选中变化只重绘一行」（表格行与网格卡各自 memo + 稳定 handler + `folderById` 映射）。500 行固定上限 + 行级重绘，虚拟化换不来可观测收益，代价是行的测量/回收逻辑。**故按台账的预设关闭**。
- **关闭必须有代价：它把「500」这个数变成了两个真相。** 服务端的 `SHARE_LIST_ROW_LIMIT` 与 `share.list_truncated` 文案里的「500」是两处独立写死——这正是关闭虚拟化的**前提条件**（列表有上限）变得不可见的地方：把服务端上限调到 2000，文案会继续告诉人「只显示前 500 条」，而屏幕上其实是 2000 条。这不是虚拟化问题，是「上限必须被说出来，而且要说对」。
- 改动面（4 文件，恰 1 新增）：
  - `shared/locales/{en-US,zh-CN}/share-1.ts`：`share.list_truncated` 改为带 `{count}` 的模板（en：`Showing the first {count} shares — more exist.`；zh：`当前仅显示前 {count} 条分享，还有更多未显示。`）。
  - `share-hub-modal.tsx` 的 `ListTruncatedNotice`：计数取 `shares.length`（截断时它等于服务端上限），经 `formatNumber()` 按应用 locale 格式化（与 SH-57 同一规则）。
  - 新增 `share-list-truncated.test.ts`（3 例）：① 截断时文案里的数字等于**实际显示的**行数（用 3 行而非 500，使「跟着数据走」与「跟着字面量走」区分开）；② 该句必须是模板——两个不同计数必须得出两句不同的话（把「把数字写回句子」的行为本身钉住）；③ 未截断时不得出现该提示。
- **一次自我纠错（与第 27 项同一类型）**：第 ① 例最初用 `t(key, { count })` 互相比较，而它**无论如何都绿**——变异把组件里的计数改成写死 500 仍然通过。原因是 jsdom 里 `t()` 返回的是 message id 本身（locale 按需加载，测试未初始化），两边都得到 `'share.list_truncated'`，参数差异根本不可见。改为在 `beforeEach` 里 `await initI18n()`（仓库已有 25 处测试这样写，如 `share-visitor-count-note.test.ts`）后，计数才能从**句子里**读出来。
- 变异 3 发，各自只杀一条：M1 组件不再传实际计数（改 `formatNumber(500)`）→ 第 ① 例红；M2 文案退回写死的「the first 500 only」→ 第 ② 例红（第 ① 例仍绿——因为两边都读同一份 locale，只有「是不是模板」这条能看见它）；M3 去掉 `truncated` 判断→ 第 ③ 例红。
- 验证读数：`tsc -b --force` exit 0；`features/share` 全目录 + `tests/share-routes.test.ts` + `tests/share-english-literals.test.ts` **38 文件 / 234 用例全绿**（服务端一侧本就有 `truncated` 的真假两例：`tests/share-routes.test.ts:441/498`）；12 项静态门禁全绿（`i18n` 键位一致、`size` 通过、`comments` 5114 条 / 719 文件）。
- 局限与重开条件：① `shares.length` 作为计数是准确的**因为**截断时服务端恰好给满 500 行（若将来服务端改成稀疏截断，这句要改成读 `total`）；② 关闭虚拟化的前提是「列表有上限」，因此**重开条件写死**：服务端上限提到 2000 以上、或列表被嵌进不通向 modal 的更长表面（需要无限滚动）时，重新评估；③ 提示不是可关闭的（消息本身是「你现在看到的不全」，关闭它等于藏信息）；④ 未用真实浏览器测 500 行的滚动帧率——本项结论建立在「上限固定 + 行级重绘」的代码事实上，不建立在一个没量过的帧率数字上。

### 31 — SH-62 批量续期：相对延长与绝对到期的区分（2026-09-21）

- 根因：批量菜单只有绝对赋值——`batch.ts` 的 `expire` 分支把 `now + expiresIn` 写进 `expires_at`（且 `folder_id`/`is_enabled`/`expires_at` 共用同一个 `setSharesField` 的绝对赋值语义）。于是到期前最高频的动作「再续一段」只能靠「设置有效期」冒充，而它会**缩短**一个本来更长的链接（剩 300 天的链接选「7 天」→ 只剩 7 天）。
- 两个边界就是全部语义（也是本项按台账要求先写成断言的两条）：
  - **永久链接没有钟可拨**：`expires_at IS NULL` 的行不参与更新，且数量在响应里单独回报（`permanent`），不当作「已延长 0 条」；
  - **已过期链接从 now 起算**：`MAX(expires_at, now) + N 天`——若从它自己的过去起算（`COALESCE`），给一个已停用 30 天的链接续 7 天会依旧停用，而界面会报「已延长 1 条」。
- 改动面（7 文件，恰 1 新增）：
  - `routes/share/schemas.ts` + `batch.ts`：新增 `extend` 动作与 `extendDays`（缺省/非法回退 7 天，上限 365）；`extendSharesForNotes()` 按块先数永久的、再 `UPDATE ... WHERE expires_at IS NOT NULL`。
  - **一次被既有断言拦下的响应形状错误**：我最初给所有动作都加上 `permanent: 0`，`tests/share-routes.test.ts` 的 SH-10 两例（`toEqual({ ok: true, count: N })`）立刻红。改为**只有 `extend` 回报 `permanent`**——其他动作不可能「留下没动的链接」，一个恒为 0 的字段反而会被读成「答案」。这又一次说明严格相等断言在守「响应契约长什么样」。
  - `lib/api/share.ts` 新增 `extend(noteIds, days)`；store 新增 `batchExtend`（返回 `{extended, permanent} | null`，失败走既有 `notifyActionFailed`）；**不动 `batchToggle` 的签名**，续期这条路径自带自己的诚实反馈。
  - 新增 `buildRenewalMenuItems()` 接在既有 `buildExpiryMenuItems()` 后面（第一项带 `separatorBefore`，把绝对/相对两组在视觉上也分开）；选中条交回三种结果：延成了（success + 「其中 N 个永不过期」描述）、全是永久（warning，不说延了 0 条）、没一个带到期（warning）。
- 先红后绿：worker 侧先写断言后实现（未改 schema 前实测 400，即 `extend` 被拒），一条用例同时钉三个断言：`{count: 2, permanent: 1}`、活的链接 ≈ now+9d、已过期约为 now+7d、永久的仍为 null。客户端新增 `share-batch-extend.test.ts` 5 例（菜单里两组共 6 项、`aria-expanded` 真假、成功反馈、全永久警告、无到期警告）。
- 变异 5 发全杀（3 服务端 + 3 客户端去掉重复那发）：M1 去掉 `expires_at IS NOT NULL` → 永久链接被上钟（`count: 3`）；M2 `MAX(expires_at, now)` 改 `COALESCE` → 已过期链接仍停在过去（`2592000000 to be less than 5000`）；客户端 M1 恒走成功分支 → 后两例红；M2 去掉「其中 N 个永不过期」描述 → 成功例红；M3 把天数写成固定 30 → 成功例红。
- 验证读数：`tsc -b --force` exit 0；`features/share` 全目录 + `tests/share-routes.test.ts` + `tests/share-english-literals.test.ts` **39 文件 / 240 用例全绿**；12 项静态门禁全绿（`i18n` 3157 键，±5；`comments` 5126 条 / 723 文件）。中间 `size:check` 报过两处 `longFns`（`ShareBatchBar` 59 行、新测试的 describe 体），按门禁意见拆出 `useShareBatchBarBundle()` 与两段 describe 归零，未 resnapshot 基线。
- 局限：① `extend` 不重新启用被暂停的链接，也不改 `is_enabled`（两件事，“续期”不隐含“开启”）；② 上限 365 天与 `expire` 的 365 天一致，但两个分支各写一份常量，未提取共用常量（差异会各自被测试发现，暂不抽象）；③ 「N 天 0 访问自动暂停」（报告里的可选项）未做；④ 每条链接的续期是同一段天数（不能按行不同）；⑤ 未在真实 D1 上验证 `MAX()` 标量函数与多块并发（本地 `node:sqlite` 同引擎，但索引/并发行为不等价）。

### 32 — SH-63 单条分享的访客数据删除（2026-09-21）

- 根因：`DELETE /api/share/visits` 只有三种范围（bots / older_than / all），**没有任何按链接收窄的口径**。于是「链接还活着，只把这个链接的访客记录清掉」只能拿全量清空冒充，而后者会连带清掉账号下所有其它链接的审计记录。导出侧早已支持 `noteId`（日志弹窗的 `initialNoteId`），缺的只有删。
- **一个被测出错暴露出来的真问题**：实现前，`?type=all&noteId=`（空值）走的是 `type === 'all'` 分支，即**把空作用域当成了无作用域**——一个想「只删这一个链接」的请求会静默变成全量清空（测试实测：期望 400，实得 401，即已进入全量路径，只差一个口令就会删光）。这正是 AGENTS 铁律 2（不静默降级）与铁律 1（权限最小化）交叉处的那类缺陷，已用 400 封死。
- 改动面（6 文件，恰 1 新增）：
  - `routes/share/visits.ts`：新增 `scopedNoteId()` —— 参数**存在但为空** ⇒ 400（不得回落成全量）、`noteId` 配非 `all` 的 `type` ⇒ 400（否则删的就不是调用方描述的东西）；口令层级与 `type=all` 同级（同样不可恢复）；`deleteVisitLogs()` 多一个 `noteId` 分支，按 `user_id + note_id` 收口。
  - `lib/api/share.ts` 新增 `cleanVisitsForNote(noteId, password)`（不扩 `cleanVisits` 的位置参数，避免第 4 个位置参数让人写错顺序）。
  - `lib/wipe-password-prompt.ts`：`promptWipePassword(description?)` —— 标题/输入类型/确认按钮仍是共用的一份，**只有描述改成可传**：在链接级删除面前说「清空全部访问日志」是假话。
  - `use-share-note-submenu.ts`：新增 `clearNoteVisitsFlow()`，二次确认（danger）→ 口令提示 → 删除 → 报数 → **重拉列表**（行上的访问计数就是刚被删掉的那些行，不重拉就是屏幕上撒谎）；顺手把八条命令从 hook 里拆到 `noteSubmenuActions()`（派生 vs 命令，与仓内 `*-actions` 形状一致）。
  - `share-note-submenu.tsx`：末尾危险区在「取消分享」之上加「清除该链接的访问记录」（Eraser，非 danger 色：它不动链接本身）。
  - 两个 locale 各 +6 键（菜单/确认题/确认正文/口令描述/成功/无记录）。
- 先红后绿：worker 侧先写断言（未改路由前实测 401 而非 400，即空作用域确实回落到了全量路径），一条用例钉四件事：空 `noteId` 400、无口令 401 且一行未删、`bots`+`noteId` 400、带口令只删该笔记的两行且另一笔记的行还在。
- 变异 7 发全杀（3 服务端 + 4 客户端）：M1 空值当无作用域 → ①红；M2 允许过滤类型带 `noteId` → 空值例红；M3 收了 `noteId` 却不生效 → 删除断言红（`expected 3 to be 2`）；客户端 M1 不问确认 → 取消例红；M2 口令被取消仍删 → 口令例红；M3 空删除报成功 → 0 记录例红；M4 口令提示用全量文案 → 描述断言红；M5 不重拉列表 → 新增的 `list` 断言红。
- 验证读数：`tsc -b --force` exit 0；`features/share` 全目录 + `tests/share-routes.test.ts` + `tests/share-english-literals.test.ts` **40 文件 / 245 用例全绿**；12 项静态门禁全绿（`i18n` 3163 键，±6；`comments` 5137 条 / 724 文件；`size` 通过——中间被报过一次 `longFns`，按“不 resnapshot”的原则抽了 `noteSubmenuActions()` 归零）。
- 局限：① 客户端 `toQuery` 会丢弃空值，所以「空作用域」这个危险形状只能由外部/手写请求产生，服务端守卫仍是必需的（它就是入口）；② 未提供「导出此链接访客数据」的独立入口——日志弹窗已能按 `initialNoteId` 打开并在内部导出 CSV，因此没有再添一个重复入口（与 SH-64 的看板导出不是同一件事）；③ 删除不可撤销，也没有「删除最近 N 天」的更细粒度（粒度就是「这条链接的全部记录」）；④ 博客侧（`/api/blog/visits`）有同名缺口，登记为新编号待办；⑤ 未在真实 D1 上验证 `note_id` 上的删除计划（现有索引是 `idx_share_visits_user_time`），属小量行删除。

### 33 — SH-69 批量链接清单（二维码表登记待办）（2026-09-21）

- 现象与拆分：原项是「批量二维码 / 链接清单」两半。**链接清单已做，二维码表未做**——项目里唯一可用的二维码依赖是 `qrcode.react`（只提供 `QRCodeSVG` React 组件，**没有字符串/离屏 API**），而批量的 N 张码要变成可打印/可打包的产物，得住三选一：① 新引入 `qrcode` 包（AGENTS 铁律 8：新依赖必须证明现有依赖解决不了，且要留理由）；② 在客户端引入 `react-dom/server` 的 `renderToStaticMarkup` 把组件渲成字符串（把一个服务端渲染器塞进浏览器包）；③ 走打印管线挂一棵真实 React 树。三者的代价都超过 P2 的价值，因此**不做，但登记在案**（不静默丢弃——见下面的重开条件）。
- 本项实际交付（4 文件，恰 1 新增）：
  - 新增 `share-batch-links.ts`：`selectedShareRows()`（选中集是 note id，而行是列表当前持有的——过滤后二者可能对不上，**差额必须说出来**）、`buildShareLinkList()`（Markdown 一行一条，标题里的 `[`/`]` 转义，否则标签提前结束、后面变成正文）、以及复制/导出两条流程。
  - `share-batch-bar.tsx`：工具栏加「复制全部链接」与「导出链接清单」两个按钮（文案与图标都进既有 `ShareBatchActionButton`，不新造控件）。
  - 导出用仓内既有的 `downloadTextFile()`（`lib/export-note.ts`），文件名带日期；复制走 `navigator.clipboard`，失败**必须报错而不是安静**（AGENTS 铁律 2）。
  - 两个 locale 各 +6 键。
- 先红后绿与变异：新增 `share-batch-links.test.ts` 7 例（两段 describe，避开 `size:check` 的 50 行上限），4 发变异各自只杀一条：M1 去掉标签转义 → 转义例红；M2 不再报「漏在外面」的条数 → 差额例红；M3 选中集与行集不交时仍写出空文件 → 空集例红；M4 吞掉剪贴板失败 → 失败反馈例红。
- 验证读数：`tsc -b --force` exit 0；`features/share` 全目录 + `tests/share-english-literals.test.ts` **167 用例全绿**；12 项静态门禁全绿（`i18n` 3169 键，±6；`comments` 5143 条 / 726 文件；`size` 通过）。
- 局限与重开条件：① **二维码表未做**，重开条件写成：若后续要交付它，优先方案是复用导出面板已有的「离屏真实 DOM + canvas 栅格化」管线（`deck-image.ts` 那条），因为那里已经有“元素必须有真实尺寸”的现成结论，且不需要新依赖；② 链接清单是 Markdown（给人看/粘贴），没有同时给 CSV；③ 清单不含到期时间与状态，因为一列「链接」里混进元信息会让人不能直接粘贴使用；④ 未测 500 条选中的剪贴板体积（纯文本，约几十 KB 量级，不足以触发限制，但没有实测读数）。

### 34 — SH-65 看板新鲜度：可见时轮询 + 「更新于」+ 开关（2026-09-21）

- 根因：看板是一次性快照，刷新只能手点，而界面上没有任何东西告诉人「这是什么时候的数字」——一个安静的星期与一个午饭前打开的标签页长得一模一样。
- 做法（4 文件，恰 1 新增）——按台账建议优先轮询（可预测、改动面小），不碰 DO：
  - 新增 `share-auto-refresh.ts`：`useShareAutoRefresh({ enabled, refresh })`。**45 s** 是具名常量（`AUTO_REFRESH_MS`，落在台账建议的 30–60 s 内），刻意偏慢：访问数按分钟变化，更快只会花掉账号的读预算（SH-81）重画同一组数字。页面隐藏即停、回到前台**先立即读一次**再重新起表（回来那一刻正是快照最旧的时候）。回调放 `ref` 里：调用方闭包每次渲染都是新的，用依赖驱动会让计时器每次渲染都被重建（结果是一次都不会触发）。
  - 开关偏好存本地存储（键 `inkstone_share_auto_refresh`，默认**关**）——节奏是设备属性，不是账号策略；读不出来（无痕模式）当作关，并记一条 warn，不因读不到偏好而拒给界面。
  - `use-share-dashboard-view.ts`：拆出 `useDashboardAnalytics(range, filters)` 作为数据层（请求、在途取消、**落地时间戳**、可选节奏），视图 hook 只留绘制相关的状态与派生（`timelinePoints`/`chartValues`/三个过滤计数）。时间戳与数据**同一次**写入：年龄描述的是屏幕上的数字，不能自己单独动。
  - `share-dashboard-header.tsx`：标题下设「更新于 {time}」（走仓内 `relativeTime`，与 SH-57 同一格式化规则），刷新按钮旁一个具名 `Switch`（`role='switch'` + `aria-label`，基于原生 `button`）作为用户可见开关。右侧控件簇抽成 `DashboardControls`，避免头部函数超 `size:check` 上限。
- 先红后绿：`share-auto-refresh.test.ts` 8 例（三段 describe：偏好的默认/回环/脏值；节奏与可见性；头部新鲜度与开关）。其中“开关默认关但能记住”一例通过真实渲染 `ShareDashboardView` + 点真实控件完成，不是断言“有没有接这个 prop”。
- 变异 5 发全杀，且第 5 发值得记一笔：前四次（去掉隐藏暂停、去掉开关判断、回来后不立即读、不再时间戳）各自只杀一条；第五次我写的替换因为**缩进不对而没匹配上**，跑出“8 例全绿”的假象——发现后打上匹配确认重跑，才看到它真的杀两条（点开关不生效 + 偏好未落盘）。**一次没匹配上的变异等于没做变异**，记在这里以免下次把自己的绿色当成证据。
- 验证读数：`tsc -b --force` exit 0；`features/share` 全目录 + `tests/share-english-literals.test.ts` **175 用例全绿**；12 项静态门禁全绿（`i18n` 3171 键，±2；`comments` 5160 条 / 729 文件；`size` 通过——中间被报过两次 `longFns`（头部组件、新测试的 describe），按“不 resnapshot”原则各拆一层后归零）。
- 局限：① 单条分享的分析弹窗仍是手刷（它是一个短命弹窗，看板才是长时间停留处）；② 轮询间隔是常量，不可配（台账建议的“用户可见开关”已交付，节奏本身不必再开一个口子）；③ 本地偏好与账号不同步（有意，已在上文说明）；④ 未在真实浏览器验证 45 s 周期的请求数与隐藏标签页的实际停顿（jsdom 用假计时器，验证的是调度逻辑）；⑤ 回来后立即读一次会在“刚看过就切走再切回”时多发一次请求，属可接受的保守选择，未做最短间隔去抖。

### 35 — SH-64 看板区间导出（CSV 交付，PNG/PDF 评估后不做）（2026-09-21）

- 根因：导出能力只长在「日志」这一个出口上。看板能描述一个区间却不能把它交出去，而它恰恰是唯一适合对外汇报的界面。台账的顺序是「先做区间 CSV（纯前端、成本最低，**列与口径要和看板一致**），再评估 PNG/PDF 快照」。
- 做法（4 文件，恰 2 新增）：
  - 新增 `share-dashboard-export.ts`：`buildDashboardCsv()` 纯函数 + `exportDashboardCsv()`（写文件 + 反馈）。表头是 `Section / Item / Value` 三列，行按看板自己的卡片分区。
  - **上下文块是这一项真正的交付**：区间（用区间控件的原词，`all` 读作「全部时间」）、导出时间（ISO）、统计范围（看板那句「所有分享，不受侧栏筛选影响」）、过滤状态（复用控制条徽标的措辞）、以及**实际排除了多少**（复用横幅那句 `filter_stats_summary`，只在真有过滤时出现——否则一行「filtered 0 bot hits」会被读成对流量的断言，而不是「没开过滤」）。台账说的「列名与区间要写进表头，避免文件脱离上下文后口径不明」即指此。
  - 分区标题与列名全部取看板自己的文案键；名字也走同一批 `localize*` 助手——为此把 `localizeDeviceName` 从 breakdown 卡片移进 `share-helpers.ts` 并让卡片改为引用（同一份措辞不可能两处漂移）。过滤状态标签同理抽成 `trafficFilterLabel()`，徽标与 CSV 共用。
  - 一处**刻意不与看板一致**：系统卡片为放得下面只画 5 行，导出写出全部行。为排版设的上限不是关于数据的陈述。
  - 变化量单列成行并带上「与上一周期相比」的措辞：文件里没有上一周期，紧挨绝对值放一个没有前提的差值就是让人误读。
- 接线：`use-share-dashboard-view` 暴露 `filters` 与 `exportCsv`（toast 由 store 取，纯函数只收依赖，与仓内 `use-visit-export` 形状一致）；头部刷新按钮旁加一个具名 `IconButton`，`disabled={!analytics}`。
- 先红后绿 + 变异：`share-dashboard-export.test.ts` 17 例（四段 describe，避开 50 行上限），5 发变异各自只杀目标（删上下文块 → 7 红；过滤状态写死为「全部流量」→ 1 红；系统列表按卡片截 5 行 → 1 红；设备名不走本地化 → 1 红；去掉空数据显示守卫 → 1 红）。接线另有一支 `share-dashboard-export-button.test.ts` 2 例（真实渲染看板、点真实按钮、断言产出一个文件；第二例用「永不 resolve 的请求」把视图钉在首载态，断言按钮确实是禁用的），2 发变异：去掉 `disabled` → 1 红；`onClick` 换成空函数 → 2 红。
- 验证读数：`tsc -b --force` exit 0；`features/share` 全目录 + `tests/share-routes.test.ts` + `lib/markdown` **117 文件 / 865 用例全绿**（首轮出现过一次 `lib/markdown` 内的 jsdom 失败，重跑不复现，判为既有 flake，与本项无关）；静态门禁全绿（`i18n` ±9 键；`comments` +34 行全属本项文件；`size` 通过——新测试的 describe 被报 `longFns`，**没有 resnapshot**，拆成三段后归零，`check-size.baseline.json` 回到原状）。
- 局限：① **PNG/PDF 快照不做**，台账的「评估」结论是：`deck-image.ts` 那条管线服务的是「同一分页结果的静态产物」，而看板是活的交互界面（区间控件、分段切换、工具提示），栅格化它得到的是一张口径无法自证与人所看同一的图；重开条件：若确有「发给别人看」的需求，正确做法是复用导出面板的「离屏真实 DOM + canvas 栅格化」，而不是截屏。② CSV 是「当前区间一次请求」的快照，没有分页（看板的聚合本身不分页）。③ 「最近访问」按看板自己的尾部条数导出，与日志弹窗的导出（SH-75，带过滤、进度与上限）不是同一件事，两者并存不重复。④ 新增 9 个文案键，其中 3 个是进文件的表头列名——表头是用户可见文案，仍按规范走 i18n。

### 36 — SH-70 链接卫生巡检：阈值进设置，看板报「长期未访问」并可一键暂停（2026-09-21）

- 根因：公开链接一旦长期没人看就永远躺在列表里，没有任何一处会把它们挑出来；撤销级联删 visits 已经实现，所以「发现」是唯一缺的环节。台账要求「阈值放进 settings 而不是写死」，并明确「analytics 路由（一次聚合）+ 看板卡片」。
- **阈值放在账号设置，而不是请求参数**——这是本项唯一一个真正的设计选择。若走查询参数，(a) `api.share.globalAnalytics(range, filters, signal)` 就变成四个位置参数，按 AGENTS 得改成对象传参，而 SH-71 的乱序回归正好断言了这三个位置参数（`firstCall[0] === '7d'`、`firstCall[2]?.aborted`），改动会连坐那个守卫；(b) 更重要的是，读的是「这个账号认为多久算没人看」，它本身就该是账号文档里的一个数。于是：`ShareSettings.staleLinkDays`（0 = 关闭），worker 用与保留期同源的 `userSettingsNumberSql('$.share.staleLinkDays', 90)` 在 SQL 里读——请求里没有它，那条守卫一行未动。
- 做法（worker + 客户端 + 共享设置，共 3 个新文件）：
  - `analytics.ts`：新增两条语句进**同一个 batch**——`staleThresholdStatement` 读账号阈值（0 也要读得到，否则「关闭」与「一条都没安静」会被混成同一个 0），`staleLinksStatement` 一条查询给出「已启用且未过期、`last_viewed_at` 为空或早于 `now - 阈值`」的链接：`COUNT(*) OVER ()` 给出总数（`LIMIT` 只决定列几行）、`SUM(...) OVER ()` 给出从未被打开过的条数，按 `COALESCE(last_viewed_at,0)` 升序取前 5。阈值表达式由 `staleThresholdSql()` 一处提供，两条语句不可能各说各话。
  - `lib/maintenance.ts`：把保留期那句 `COALESCE(json_valid…json_extract…)` 提成导出的 `userSettingsNumberSql(path, fallback)`，保留期改为调用它——否则同一段「怎么从 settings 文档里安全取一个数」的 SQL 会有第二份拷贝，而 `json_valid` 那个守卫正是维护清扫不被损坏文档带崩的原因。
  - 新 `share-stale-links-actions.ts`：`daysSinceVisit()`（卡片与测试共用同一个取整）+ `pauseStaleLinksFlow()`——先确认（措辞说明「只暂停列出的这些」），再走已有的 `batchToggle('disable', …)`（它在失败时会自行提示），成功才报数，**最后重拉报告**（卡片的行就是刚被暂停的那些）。
  - 新 `share-dashboard-stale-card.tsx` + `share-dashboard-view.tsx` 挂载：徽标写「已 {days}+ 天未读」（阈值可见），正文写「{count} 个长期无人访问，其中 {never} 个从未被打开过」，每行给 slug 与「从未被打开 / 最近访问于 N 天前」；`thresholdDays === 0` 时整卡不画（关闭 ≠ 一颗清白的 0）。
  - 设置弹窗新增第三段「链接卫生」（一个 `Segmented`：关闭/30/90/180/365）——**它撞上了 SH-39 的守卫**「保留期是弹窗里唯一的 segmented control」，该断言按实情改成「两个都被可见标签命名，且仍然没有记录上限控件」；`retentionGroup()` 也从「按选项文本找」改成「按 `aria-labelledby` 的名字找」，否则第二个控件进来时它会挑错组。
  - **一处我自己写出来的坏味道被现有断言抓住**：先把 retention 与阈值写成两次 `updateSettings` 调用，SH-61 的「一次保存 = 一次账号补丁」立刻红（`toHaveBeenCalledTimes(1)`）。改成一次 `{share: {visitLogRetentionDays, staleLinkDays}}` 之后，那条断言与它的期望值（`{...DEFAULT_SETTINGS.share, …}`）都不需要改——因为它们描述的本来就是「同一份文档一次写完」。
  - 看板 CSV 也跟着加了一行（`stale_links_title` + 阈值 + 总数），关闭时不写：SH-64 的契约是「分区就是看板的卡片」，新卡片不能悄悄漏掉；而「关闭」写成「0 个安静链接」等于拿没测过的清白当结论。
  - 演示后端按同一口径算（`demoStaleLinks`），否则纯前端体验版永远看不到这张卡。
- 共享契约变更：`ShareSettings` 增一个必填字段 → 3 个测试夹具（`share-settings-retention`、`blog-settings-retention`、用户设置）从 `share: {visitLogRetentionDays}` 改为 `share: {...DEFAULT_SETTINGS.share, …}`（又是「文档里只有这一段」的写法，下次再加字段也不会连坐）；`ShareGlobalAnalytics` 增必填 `staleLinks` → 3 个分析夹具各补一行（分析夹具用 `thresholdDays: 0`，即该文件不涉及卫生）。
- 先红后绿 + 变异：
  - worker 8 例先红（`staleLinks` 为 undefined）：阈值来自账号、从未打开计入、总数 ≠ 列出的行数、关闭时整个为零、暂停与过期的链接不算、损坏的 settings 文档仍回退到默认阈值、以及「多少个链接变安静都只问数据库一次」（`last_viewed_at` 语句恰好一条 + `batch` 恰好一次）。5 发变异各自只杀目标：去掉 `> 0` 关闭守卫 → 1 红；把判定改成 `created_at` → 7 红；行查询写死 90 → 8 红；去掉「已启用且未过期」→ 1 红；`COUNT(*) OVER ()` 改 `COUNT(*)` → 3 红。
  - 客户端 9 例（三段 describe）：阈值写进徽标、逐行说明最后访问时间、关闭时整卡不画、无安静链接时说清白的实情、确认后只暂停列出的两条（`['a','b']`）、拒绝确认则一次不调、失败不得报成功、成功后悔重拉报告，外加 `daysSinceVisit` 的取整/未知/时钟倒流。5 发变异各自只杀目标（徽标写死 90、忽略关闭开关、跳过确认、把失败当成功、不重拉）。**其中「把失败当成功」第一发没有杀死**——因为 `useUi` 的 `toast` 是渲染时按值取走的一个函数引用，渲染之后再 `spyOn` 拿到的是另一个东西；把 spy 挪到挂载之前，那一发才真的杀掉（此类「变异没匹配上/没作用到真实对象」的假绿上一轮已经记过一次，这是第二次，同样留在台账里）。
- 验证读数：`tsc -b --force` exit 0；`features/share` + `features/blog` + `demo` + `tests/share-routes.test.ts` + `share-visit-retention` + `blog-visit-retention` + `settings-stats` + `src/shared` **61 文件 / 443 用例全绿**；12 项静态门禁全绿（`i18n` 3195 键，±16；`comments` 736 文件 / 5248 条，diff 全属本项；`size` 通过——被报过三次 `longFns`（看板 hook、两个新测试的 describe），都按「不 resnapshot」拆开，`check-size.baseline.json` 回到原状）。
- 局限：① 只报「已启用且未过期」的链接——暂停/过期的本来就没有访客，列出来只会稀释这张卡；② 卡片是「当前区间一次请求」的附带结论，不随区间变化（卫生是相对现在的，与看哪个区间无关），行数固定 5，**暂停按钮只覆盖列出的这些**并在 UI 上写明；③ 「长期」由账号阈值定义，阈值改动要等下一次看板请求才生效（没有推送）；④ 未做「批量撤销」入口——台账只要求暂停，撤销会连带删除访客记录，属不可逆动作，不放在一键里；⑤ 未在真实 D1 上量 `last_viewed_at` 那条排序的成本（`shares` 每账号行数小，且语句与列表接口同表同条件，索引 `idx_shares_user_enabled` 可覆盖筛选）。

### 37 — SH-66 访客会话视角：先交 ADR（2026-09-21）

- 交付物：根目录 `ADR-0003-visitor-session-view.md`（Status: Proposed）。台账对 F 批的要求是「先交付方案文档（数据模型/隐私/索引/公共契约），评审后再实现」，因此本项**不改任何生产代码**，只把决策点钉死。
- 文档里的三个实质结论（都不是"随便选一个"）：
  - **会话 = 同一 `visitor_fp`、相邻间隔不超过 `SESSION_GAP_MS`（建议 30 分钟，与既有 `VIEW_DEDUPE_WINDOW_MS` 同值）**，并明写三条推论：会话**不能跨 UTC 日**（指纹的盐按 UTC 日轮换，同一个人跨日就是两个指纹）、**一个会话不是一个人**（NAT 下多人同一天同一指纹）、**会话不落库**（派生值随保留期与 SH-63 的删除一同消失，不需要第二份要维护的数据）。
  - **数据模型选"查询时窗口函数派生"，否决新表**：写入路径在公共页上（最热），维护聚合表要双写并让清理成对；而 SH-70 刚刚在同一批语句里用过 `COUNT(*) OVER ()`，D1 侧有先例。索引结论**留待实测**，并写明不要照猜——`PARTITION BY visitor_fp` 用不上现有四个索引的任何前缀，而会加的那个索引要在最热的写入表上付写放大（SH-73 的同类教训）。
  - **公共契约**：新增 `GET /api/share/sessions`（不扩既有 `/api/share/visits` 的形状，两者语义不同），指纹只下发 8 位（SH-82 口径）且必须在日志与会话两个接口下**一致**，游标为 `startedAt + fingerprint` 复合键而非 offset，读预算套用 SH-81 的同一套语义。
- 隐私边界写成了"未来的护栏"：如果有人想做 cookie/设备 id 级的"访客档案"，那是一次隐私姿态变更，必须新开 ADR 并同步 `share.visitor_count_note` 文案，**不能当作本 ADR 的改进顺手做掉**。
- 局限（诚实标注）：① 只写方案，未实现、未跑任何验证；索引与 `SESSION_GAP_MS` 的最终取值要在有真实数据读数后定，本文只给判据与验证步骤；② 待评审问题 4 条（间隔取值是否与去重窗口解耦、会话明细是否显示地理位置、是否要按会话导出、指纹说明做成常驻还是 tooltip）留给评审，不自行拍板。

### 38 — SH-67 渠道标记 `?ref=`：先交 ADR（2026-09-21）

- 交付物：`ADR-0004-channel-tagging.md`（Status: Proposed），同样不改生产代码。
- 关键决策：**采集一个受字符集约束的短标记**（`^[a-z0-9][a-z0-9_-]{0,31}$`），不匹配就**不采**但也不报错（访客不该因为所有者拼错参数看到错误页），并在渠道分解里**单独计一行"未识别标记"**——不静默并进 Direct，这正是铁律 2 在这条路径上的落点。存储选 `share_visits` 加一列可空 `channel`（只增迁移，随保留期与 SH-63 的删除一同消失），否决"新维表"（一次 join + 孤儿清理换来几个字节）与"塞进 referrer_host"（把两种含义混进同字段，给 self-referrer 判定加特例）。
- 开关与默认值写清了理由：`ShareSettings.collectChannel` 默认**开**（采的是所有者自己写进链接的东西，不是访客隐私），关闭时**不落库**（不是落了不展示）。
- 也钉住了两条容易被忽略的边界：`?ref=` **不得**进入任何持久字段（`shares` 存 slug，不带 query）与缓存键；标记是**分发归属不是身份**，任何人都能改，文案不得暗示可信。
- 局限：① 未实现、未验证；② 4 条待评审问题（默认开还是关、是否按链接分别配置、无效标记是否单独计数、二维码面上是否印出标记）留给评审；③ 与 ADR-0003 的边界写明了——要做"渠道→转化"的跨会话关联必须新开 ADR，不能在本 ADR 上叠加。

### 39 — SH-68 公开集合落地页：先交 ADR（2026-09-21）

- 交付物：`ADR-0005-public-collection-pages.md`（Status: Proposed）。台账对 F 批的统一要求是方案先行，因此同样零生产代码。
- 核心决策：**一条"发布记录"（新表 `share_collections`） + 成员实时派生**。地址、口令、有效期、启用状态必须落库（否则无法吊销/改口令），而"包含哪些分享"从 `shares.folder_id`/`tags` 现算——发布因此是一次写入，成员永远与列表一致。否决了成员快照表（要双写、会静默过期）、签名 URL（不可吊销）、以及"借用某条分享的 slug"（语义混装且暂停会连坐）。
- 两个必须写进实现前置条件的结论：**未通过口令前不泄露任何成员信息**（目录、篇数、标题），且口令错误与"不存在"必须返回**同一种**响应（否则集合地址会成为枚举探针）；**撤销集合 ≠ 撤销分享**（散页仍在），这处最容易误解，要靠文案与 UI 区分而不是靠文档。
- 也把"实时派生"的代价写成明面语义：改动文件夹/标签会立刻改变目录内容——**集合是视图不是快照**；若将来要冻结，那是另一个功能，不能悄悄改变这条语义。
- 交付分期写进文档：一期只读页（无口令 + 成员派生 + 上限 + 与单篇完全相同的 `noindex`/`no-store` 口径），二期集合级口令与资产会话作用域（复用 scrypt 与既有锁定/限流），三期接 SH-67 的 `?ref=collection` 做归属。资产会话按**集合**签发而非每篇一次，避免打开一页签 N 次。
- 局限：① 未实现、未验证；② 5 条待评审问题（一条集合记录是否够用、目录是否显示成员口令角标、默认排序、是否灰显未公开成员、撤销确认的强度）留给评审；③ 上线前置条件（错误响应一致性、限流、`noindex`）明确写成了前置而不是后续优化。

### 40 — 批次 D/E 收尾：全量串行回归（2026-09-21）

- 口径：台账「全局验收口径」第 5 条——触碰共用面/服务端/SQL/migration 的批次必须在**全量串行**下全绿（本机并行会假超时）。
- 读数（`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000`）：**335 文件 / 2688 用例通过，1 skipped，0 失败**；耗时 721.93s（transform 18.65s，import 121.88s，tests 110.34s，environment 401.42s）。
- 过程记录（诚实标注）：第一次串行尝试在 60 秒的调用窗口里被中断，日志停在 `slide-remount.test.ts` 之后不再推进——它随发起它的进程组一起被杀，而不是测试挂住；改成 `setsid nohup … &` 脱离进程组后完整跑完。另外这台机器上还有**别的会话遗留的 vitest worker**（PID 15xxxx/16xxxxx，启动于 01:59–02:14，父进程 2473），与本次运行无关，未去动它们（共享检出，不碰别人的进程）。
- 本批次 D/E 涉及的三处"会用错的方法"都在这一轮被守住：SH-73 提议的索引被 `EXPLAIN QUERY PLAN` 推翻、SH-74 的缓存被实测数字否掉、SH-77 的虚拟化被服务端上限关闭；本轮新增的 SH-70 又给同一类判断加了正面案例——阈值走账号设置而不是请求参数，因此没有动 SH-71 的位置参数守卫。

### 41 — SH-67 / ADR-0004 落地：渠道标记 `?ref=` 的采集、开关、分解与生成端（2026-09-21）

- 交付物：ADR-0004 从 Proposed 翻为 Accepted（4 条待评审问题在文档内定稿并写了理由），代码落点见该文档的「实现落点」段。新增 5 个文件（`share-channel.ts` 与三组测试、`channel-split.ts`），迁移 41（`share_visits.channel TEXT`，只增、`skipIfColumnExists`）。
- 关键决策：**存储值用 `''` 区分「带了标记但被拒」与 `NULL`（没带）**，而不是加布尔列或存原文——有效 token 至少 1 字符，空串不可能与合法标记相撞，且原文从不落库。两个保留名（`__unmarked__`/`__unrecognized__`）以 `_` 开头，落在 token 正则之外，因此**访客无法用 `?ref=__unmarked__` 冒名**（有断言把这条不变量钉住）。
- 三条容易漏的边界都落到实现里：① 被拒标记**仍写行**（不返回 4xx，访客不替所有者的笔误付代价），只在渠道分解里单独计一行；② 账号开关关闭时**完全不落**（不是落了不展示），而访问照常计数；③ 标记**不进入** `referrer`/`referrer_host`（否决过的方案 C 用断言封住入口）。
- 生成端收敛到一个 `withChannelParam`：二维码面板的标记字段同时作用于码、展示链接、复制与外链（四处同源，有断言），批量条的字段作用于「复制全部」与「导出清单」两个动作。无效值**不修补**——输入框报 `aria-invalid` 并把链接原样交出，而不是把标记悄悄削成合法值。
- 写入路径的成本选择：`collectChannel` 由**既有那次 share 查询**一并读出（`SELECT s.*, userSettingsBooleanSql('$.share.collectChannel', true)`），不给最热的公共路径加第二条语句；布尔表达式与 `userSettingsNumberSql` 同住 `maintenance.ts`，共用 `json_valid` 守卫。
- 分解语句放在 **share 专属**的 `channel-split.ts`：`visitAggregateStatements` 的语句列表被看板与博客看板按位置共读，而 `blog_visits` 没有标记列，塞进去会改双方的下标契约。
- 验证：新增 4 个测试文件（token 边界/写入与分解/二维码与看板/批量标记），改 8 个既有测试文件（CSV 表头与首行、a11y 开关名、两处分析夹具、看板夹具、批量条目拆分）。**6 次变异全部命中**：忽略 `collectChannel`、放宽 token 正则、把两个保留名合并、二维码改用未标记 URL、把 `unrecognized` 文案换成 `none`、批量清单不走 `withChannelParam`——各自都让对应断言变红。
- 全量单测读数：`338 文件 / 2713 通过 + 1 skipped`，其中两处超时（`share-code-split` 的模块图遍历、`music-hub-modal` 的重渲染）是**机器负载导致的 5s 超时**，单独复跑两个文件均通过，与本项无关（同一现象在 §40 的串行回归里也出现过）。
- 局限：① 「带了标记但被拒」与「开关关闭」在旧数据里都表现为 NULL，看板上无法回溯区分（新写入的可用 `''` 区分）；② 30 分钟去重窗口内的后续访问不产生行，因此那次访问的标记不会被记录——这是去重口径的既有推论，已在代码注脚与 ADR「后果」写明，不做补偿；③ 标记的索引代价没有真实 D1 读数（列可空、只在已收窄区间内读，故未建索引），不预估。

### 42 — SH-66 / ADR-0003 落地：访客会话视角（2026-09-21）

- 交付物：ADR-0003 从 Proposed 翻为 Accepted（4 条待评审问题在文档内定稿并写了理由，另加「实现记录」与「成本读数」两段），代码落点见该文档。新增 6 个文件（`shared/visitor-session.ts`、worker 的 `lib/share-sessions.ts` 与 `routes/share/sessions.ts`、客户端的 `use-share-sessions.ts` 与 `share-sessions-panel.tsx` 及其测试），接口 `GET /api/share/sessions`（`requireAuth`，只读，派生、不落库）。
- 关键决策：① `SESSION_GAP_MS` 作为**独立**共享常量，刻意不与 `VIEW_DEDUPE_WINDOW_MS` 绑定（同值不同义，绑定会让改一个改掉另一个）；② 会话明细**不含**城市/设备，只给时间、时长、次数与读过的笔记；③ 不做按会话导出（日志 CSV 不变，重开条件写进 ADR）；④ 指纹说明做成**常驻说明**而非 tooltip——那句「不要把这个哈希当人」是全部防线，不能挂在 hover 上。
- 派生语句按 `(fingerprint, UTC 日)` 分区：盐在 UTC 午夜轮换这一事实因此**写在 SQL 里**而不是只写在文档里。变异 M2 一开始**没被杀死**——因为 `utc_day` 同时出现在分区和 session_key 里，只改一处仍会给出同样的会话；两处一起改才红。这条记进台账，因为它说明「按结构写的保证」也要被断言真正压住。
- 正确性读数：worker 8 例先红后绿（恰好 30 分钟算同一会话、+1 ms 算两个、跨 UTC 日的两条不合并、两个指纹不串、筛选同时作用于会话与内部行数、游标不漏不重、响应里指纹 ≤ 8 位且类型中没有 IP/UA、`range=all` 才计读预算），客户端 8 例（表格语义与 `scope`、阅读顺序、CSV/搜索/清理在会话视角下不可见、区间与「只看真人」开关、三态各自的文案、加载更多只在有时出现）。**客户端 3 发变异全部命中**（表格改 div 堆、阅读顺序倒序、会话视角仍渲染行专用控件）。
- 成本读数（诚实标注口径）：在测试基座（进程内 sqlite）种 **20 万行 / 4000 指纹 / 30 天窗口**，整条语句 2.1–3.4 s、只折叠不连笔记 1.6–2.7 s、返回 25 个会话；结论是**成本由窗口决定而非页大小**（限 25 条也要先看遍窗口里的行），这正是读预算只对无界区间计费的理由。其间试过把笔记分组从「整个窗口」收窄到「页内 25 个会话」，单轮内看似快 ~10%，但重复交替测量后差异落进运行间噪声（±10% 以上），因此**不写成提速百分比**，只保留「工作量确实更小」的写法——原稿那句「~10% of the statement」被我自己撤掉了。**索引：本次不改动任何索引**；计划已用既有 `idx_share_visits_user_time`，剩下的 `TEMP B-TREE` 来自窗口函数与分组，能消掉它的覆盖索引会落在最热的写入表上（与 SH-73 结论一致）。
- 尺寸：新增/改动触发了两次 `size:check` 真实超限，都按拆分而不是 resnapshot 解决——日志弹窗的工具条按模式拆成行/会话两套控件，演示后端的样例数据提成 `share-fixtures.ts`（数据与处理器分开），会话测试的两段 describe 拆开。
- 验证：`tsc -b` exit 0；`tests/share-routes.test.ts` + `share-sessions-view.test.ts` 117 例通过；`features/share` + `lib/api` + `src/shared` + `tests/share-routes` **54 文件 / 424 用例全绿**；13 项静态门禁全绿（含 `size`、`comments`、`surfaces`、`budget`）。临时量测脚本跑完即删，未留在仓库。
- 局限：① 会话不能跨 UTC 日（指纹盐轮换的固有推论），日界处会话数会**人为偏高**，ADR 写明不得用修正系数掩盖；② 成本读数来自进程内 sqlite，只回答「随什么增长」，不代表 D1 绝对值；③ 未在真实浏览器里跑键盘展开/收起的端到端场景（表格语义与三态由 jsdom 行为层断言覆盖）。

### 43 — SH-68 / ADR-0005 落地：公开集合落地页（2026-09-21）

- 交付物：ADR-0005 从 Proposed 翻为 Accepted（5 条待评审问题定稿，「交付分期」改为实际交付情况，另加「实现记录」「验证读数」两段）；迁移 42 建 `share_collections`（只增，含部分唯一索引 `WHERE is_enabled = 1`）；公共路由 `POST /api/public/collection/:slug` 与页面壳 `GET /c/:slug`；所有者路由 `/api/share/collections`（列表/发布/暂停恢复/撤销）；演示后端同一套路由 + 一份种子集合；客户端新增侧栏「集合」类别、集表面板、发布对话框与访客侧懒加载块 `collection-page/`。三期全部完成，唯二期中的「集合级资产会话」**未做**并写明理由（目录页不渲染附件，先建用不上的凭证不如留到需要时）。
- 关键决策（都由实现时的判断定下，不含糊）：① **一个目标一条启用记录**，重复发布 = 改写同一地址的策略，这就是「改口令/改截止时间」的实现方式——因此 PATCH 只做暂停与恢复，口令只走发布路径，不给自己留两个口径可能不同的写入口；② 成员口令角标**显示**（通过集合口令之后才出现，诚实反映点进去会遇到的事）；③ 排序沿用分享列表（`is_pinned` 优先），游标为 `(is_pinned, updated_at, slug)` 复合键，不用 offset；④ 未公开成员既不显示也不计数（灰显等于公布「这里曾有一篇」）；⑤ 撤销走 confirm，**文案写明散页不受影响**，并为这句文案写了断言。
- 一处实现时真撞上的坑：`/collections` 是单段路由，注册在 `/:noteId` 之后会被笔记路由吃掉，答的是「笔记不存在」。修法是把集合路由移到笔记路由**之前**，并把原因写在 `index.ts` 的注释里（这条规则对同目录后续任何单段路由都成立）。
- 成员关系只写一次：`collectionMemberPredicate()` 同时供目录查询与 live count 拼接 WHERE，因此面板数字与访客看到的条数不可能不一致（这一点由「发布后再添一篇，两处同时变化」的用例压住）。
- 验证：worker 14 例先红后绿；**8 发变异全部命中**，其中**标签前缀匹配那一发第一轮没杀掉**——夹具里的「近似 id」互不为前缀，把近似值改成真正的包含关系后才杀掉。这条与 ADR-0003 的 M2（按结构写的保证也要被断言压住）是同一类教训：**假绿常常不是断言写错，而是夹具选得不够近**。客户端 10 例 + 6 发变异全中；两处测试写法教训记进 ADR：弹窗落在 portal 上必须**逐例清空 body**（否则后一个用例会点到前一个弹窗的按钮，曾让「发布按钮应禁用」读到上一个弹窗的启用按钮），受控 `select` 在 portal 里无法用派发事件改写，改测**编辑既有集合**（对话框的 `initialTarget`）这条面板真实走的路径，覆盖等价而不再靠 DOM 把戏。
- 静态门禁共发现 5 类真问题并逐一修掉，没有一条靠放宽：`--text-28` 不是已声明令牌（改用 `--text-30`）、小数令牌引用未双反斜杠（`--text-12\.5`）、`width={420}` 魔法数（提成 `PUBLISH_DIALOG_WIDTH`）、中文注释落在 `zh-CN` 资源里被判 i18n 违规（说明留在 en-US，资源文件只放译文）、六个新文件触发 `longFns`（全部按职责拆分：面板→头部/表格体/行/行内动作，对话框→表单 hook/字段/按钮，访客页→口令门/不可用/空/目录，hook→列表/变更，测试的三个 describe 各拆一段）。`check-size.baseline.json` 只对 `migrations.ts` 的行数重新快照（新增一条迁移，属预期增长），**没有为任何新文件开豁免**。
- 验证读数：`tsc -b` exit 0；`tests/share-collections.test.ts` + `features/share` + `lib/api` + `demo` + `tests/share-routes` + `src/shared` **59 文件 / 472 用例全绿**；13 项静态门禁全绿。
- 局限：① 集合级资产会话未做（见上）；② 演示模式的口令是内存明文比对（不假装有 scrypt）；③ 未在真实 D1 上量目录查询与计数的成本，也未加新索引（分页上限 + 账号上限约束规模，成员谓词用得到既有的 `idx_shares_folder`）；④ 访客侧页面只有 jsdom 行为断言，没有浏览器端到端场景（`scripts/e2e-visual.mjs` 未加集合页场景）。

### 44 — 批次 F 收尾：三份 ADR 落地后的全量串行回归（2026-09-21）

- 口径与第 40 节相同：本批触碰共用的服务端面、SQL 与 migration（迁移 40/41/42、`share_visits.channel`、`share_collections`），必须在**全量串行**下全绿。
- 读数（`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000`）：**341 文件 / 2755 用例通过 + 1 skipped，0 失败**；耗时 760.74s（transform 21.35s，import 127.50s，tests 128.30s，environment 415.11s）。相比第 40 节的 335 文件 / 2688 用例，增量正好是本批新增的 6 个测试文件与 24 个用例（会话 8 例、集合 14 例、客户端集合面板 10 例中的新增部分——其余为既有文件内的补充断言）。
- 过程：与第 40 节同样的 `setsid nohup … &` 脱离进程组后一次跑完，未被调用窗口打断；共享机器上其它工作树（`inkstone-slides-improvement-…`）的 vitest 进程照旧未去动。
- 台账闭合情况：SH-64（CSV 已交付；PNG/PDF 经评估后不做，重开条件写在台账）、SH-69（链接清单已交付；二维码选择表登记重开条件）、三份 ADR（0003/0004/0005）均已从 Proposed 翻为 Accepted 并写入实现记录与局限；`AGENTS.md` 项目信息新增指向三份 ADR 的一段。工作树干净，全部改动已提交。

### 45 — 选中规则收进单一共享谓词层（2026-09-21）

- 交付物：新增 `src/shared/share-selection.ts`（词表 + 纯谓词：`SHARE_STATUS_FILTERS` / `SHARE_CATEGORY_STATUS` / `resolveShareTarget` / `shareMatchesStatus|Target|Selection` / `visitMatchesTraffic` / `VISIT_LOG_FILTERS` / `visitMatchesLogFilter`）与 `src/worker/lib/share-selection-sql.ts`（同一套规则的 SQL 片段：`shareStatusSql` / `shareTagElementSql` / `shareTargetSql` / `shareSelectionSql` / `visitTrafficSql` / `visitLogFilterSql`）。原先「哪些分享被一个文件夹、标签、筛选或集合覆盖」被分别写在：列表查询（`shares.ts`）、侧栏计数（`global-stats.ts` 的四个 COUNT 与标签 JOIN）、集合成员谓词（`share-collections.ts`）、批量开关（`organizer.ts`）、日志筛选（`visits.ts`）、以及客户端孪生（demo 后端的 `SHARE_STATUS_FILTERS` 表、`filterShares`、`membersOf`、日志 filter 链）。现在这些点全部改为调用同一层；`?status=` 与 `?filter=` 的未知名词从「静默当 all」改为 400（原来一个不认识的筛选看起来就像「筛完没结果」）。
- 顺带修掉一个真 bug：标签集合把 tag **id** 拿去比 `shares.tags` 里的 tag **名字**，所以线上每个「标签集合」页面都是空的，而面板上的计数和它一致地空着（两者都由同一个错谓词算）。修法是 `resolveShareTarget()` 做唯一一次「记录 id → 存储值」转换：文件夹存 id（同名），标签存名字。演示后端的 `membersOf` 反过来也有一份自己的读法，同一处修掉。原 ADR-0005 那条用例之所以没抓到，是因为**夹具里把 id 写进了 `shares.tags`**——与上一批「近似 id 选得不够近」是同一类教训：**夹具不是生产写入的形状，断言就只是在给自己发合格证**；本次夹具改成生产形状（`["Research"]`），并补了「页面与 `?tag=` 过滤结果必须相同」的跨面断言。
- 标签元素匹配从 `LIKE '%"name"%'` 改为 JSON 元素测试（`json_each` + `json_valid`/`json_type` 双 CASE 守卫）。理由有两条：一是 LIKE 需要名字里没有引号/反斜杠/通配符才正确（侧栏计数那条 JOIN 根本没有转义，`100% done` 会数进 `100 plus done`、`a_b` 会数进 `axb`，本次由 parity 用例压住）；二是「这个标签是数组的一个元素」本来就该按元素判定，而不是按文本。守卫刻意用嵌套 `CASE`（`AND` 不保证短路，`json_type`/`json_each` 对畸形 JSON 会抛），畸形行只应回答「没有这个标签」，不应让整张列表 500。
- parity 夹具（`tests/share-selection-parity.test.ts`）：26 行分享覆盖每个时钟边界两侧、每个 JSON 形状（数组/标量/对象/畸形/空）、标签名互为前缀、名字里带 `%` 与 `_`，然后逐 status × 逐 target 比较「SQL 选中的集合」与「共享谓词选中的集合」，并对**路由**再比一遍；另有一组用 8 个真假组合压住日志 filter 的五个取值与「`real` = 三个排除同时生效」。这就是「不可能漂移」的可执行形式。
- 变异：7 发**全部命中**——元素测试退化为子串、守卫被删、`active` 的启用条件被删、标签记录解析成 id、窗口宽一天、`real` 不再排除所有者、标签目标按子串匹配。其中两发第一轮**存活**，原因值得记：① M3 存活是因为夹具用 `fixture.isEnabled ?? 1` 把故意写的 `null` 变成了 `1`——夹具没有真正产出那个状态；改判定后才发现**该状态根本无法存在**（`is_enabled INTEGER NOT NULL DEFAULT 1`，迁移也是这么加的），于是那处 `OR is_enabled IS NULL` 属于**不可能出现的兼容分支**，本次直接删掉，并把原先三处（列表、侧栏计数、集合页）里只有两处带的这条 arm 一并收成一处；② M5（窗口宽一天）在 parity 里**不可能被杀**——SQL 与谓词都读同一个 `expiringSoonCutoff`，两边一起变；这条由共享单测直接钉住数字，教训记在这里：**共享同一函数的两侧，parity 看不见这个函数本身的取值**。
- 验证：`tsc -b` exit 0；共享单测 10 例 + parity 6 例 + 集合 15 例 + `tests/share-routes` 109 例等 **67 文件 / 569 用例全绿**（含 demo 与 blog 访问统计，因为 `visitTrafficSql` 从 `share-analytics.ts` 挪了家）；13 项静态门禁全绿（`comments` 用 `sync-comments-allowlist.mjs` 重建，diff 为 116 增 18 删，删的正是被改写/删除的旧注释条目）。`organizer.ts` 的别名遗漏被既有 SH-11 用例（`_` 字面量）当场抓住，改 3 行修好。
- 局限：① MCP 视图 `mcp/retrieval/read.ts` 里还有一份 `(s.is_enabled = 1 OR s.is_enabled IS NULL)` 的「已分享」谓词未收口，另立台账项（它属于另一条读路径，本次不夹带）；② `?tag=` 仍携带**存储值**（名字）而集合携带 **id**：两种地址形式已在共享层命名并只有一处转换，但把 `?tag=` 也改成 id（存储域迁移，或改名时重写数组）是独立决策，已登记；③ demo 侧筛选是靠复用共享函数获得一致性的，没有独立的 demo 侧 parity 用例；④ 未在真实 D1 上量 `json_each` 与 LIKE 的成本差（同样无法用索引，筛选都在账号已收窄的集合上）。
- 登记的标签陈旧性（与上一条同源）：改名不会重写既有分享的标签数组，因此改名后列表 `?tag=` 过滤与标签集合都会空——本条已在测试里显式压住（改名后页面只剩新名字、成员为空），不静默。

### 46 — hub 每个分类一个自洽视图（2026-09-21）

- 交付物：新增 `share-hub-views.tsx`（分类 → 视图注册表：`ShareHubViewProps` 只含外壳能兑现的意图回调、`ShareHubView.preload` 声明「画之前要先有什么」）、`share-list-view.tsx` + `use-share-list-view.ts`（列表分类的完整一屏：工具条、截断提示、表格/网格体、批量条，自带数据 hook）。外壳 `share-hub-modal.tsx` 不再认识任何分类：`HubContent` 变成 `const View = hub.view.Component; <View {...hub.viewProps} />`；打开时先取什么由注册表声明决定（`preload`），不再由外壳里的 `category === 'dashboard' || category === 'collections'` 决定。`use-share-hub-modal` 拆出 `useHubOverlays()`（覆盖层状态与稳定回调），主 hook 只剩「选哪个视图 + 打开/关闭时做什么」。
- 关键决策：① 视图 props 说的是**外壳的意图**（按分享打开二维码/编辑、按笔记 id 打开分析、打开日志/设置），所以列表行与看板卡片能共用同一组回调，视图也不去读 hub 的 state；② `viewProps` 整体 `useMemo`——行是 memo 的，每次渲染换一个新对象等于换一组新 prop；③ 十个状态分类共用同一个列表视图（十个组件就是十处会让工具条走样的地方），由 `Record<ShareStatusCategory, ShareHubView>` 与 `Record<ShareCategory, ShareHubView>` 两层 record 保证「加了分类不写视图就编译不过」。dashboard 与 collections 本来就是自洽的（各自有 hook），本次只是让外壳不再特判它们。
- 变异：6 发中 5 发直接命中（collections 路由到列表视图、dashboard 路由到列表视图、collections 声明成 `preload: 'list'`、viewProps 不再 memo、注册表声明被换成写死的分类判断）；其中最后一条（也是同一发重跑的第 4 条）第一轮**存活**——因为「注册表声明」与「外壳里写死的两个分类名」在现有 12 个分类上**行为完全等价**，任何渲染都分不出来。这正是「结构保证也要有断言」的又一例：单独加一个 `share-hub-preload.test.ts`，把注册表 mock 成一条**故意与旧写法冲突**的声明（dashboard 声明 `list`），断言外壳照声明取数——旧写法在此必红。记在这里，因为「等价变异存活」与「覆盖不足」看起来一样，处置方式却相反。
- 验证：`tsc -b` exit 0；`src/client/features/share` **49 文件 / 234 用例全绿**（新增 `share-hub-views.test.ts` 3 例：逐分类断言「只调用了自己那一族的数据」与「打开的取数与声明一致」；新增 `share-hub-preload.test.ts` 1 例）；13 项静态门禁全绿。`size:check` 两次真超限都按拆分解决而非 resnapshot：主 hook 拆出 `useHubOverlays`，新测试里的长用例体提成 `callsWhenOpened` / `viewFamilyOf`。
- 局限：① `share-hub-open-loads.test.ts` 里原有两条分类用例与新循环重叠（保留：那条是 SH-72 的原始现场记录，重构不该顺手删掉别人的回归）；② `ShareHubSidebar` 仍自己维护分类清单（导航，不是视图），因此「侧栏列出的分类」与注册表之间只有类型层的保证（`ShareCategory` 联合 + 两层 record），没有运行时比对。

### 47 — 每个目录一个读数：目录项带各自集合的标记（2026-09-21）

- 根因：三期把目录项统一写成 `?ref=collection`（所有集合共用同一个字符串），于是看板只能得到一行「来自某个目录」——**读不出哪个目录**。通道本身早就存在（ADR-0004），缺的是把标记做成逐集合的，并在看板上把它读回人认识的名字。
- 改动面（10 生产文件 + 2 测试文件，其中 1 新增）：
  - `src/shared/share-channel.ts`：`COLLECTION_CHANNEL_PREFIX` + `collectionChannelToken(slug)`——全仓唯一构造点；集合 slug 是 `newSlug()` 的 20 位，标记因此 31 字符，正好在 32 上限内（shared 单测把这组数字钉住）。
  - `src/client/features/share/share-collections.ts`：`collectionNoteLink(noteSlug, collectionSlug)` 走既有 `withChannelParam`；`collection-page/page.tsx` 的目录项改用它（集合 slug 一路传进 `CollectionBody`/`CollectionDirectory`/`DirectoryNote`），删掉原来的 `/s/<slug>?ref=collection` 字符串。
  - `src/worker/lib/share-collections.ts`：`collectionChannelLabelsStatement()`（一条按账号收窄的语句，把集合 join 回文件夹/标签名）+ `collectionChannelLabels()`（经同一个构造点做成「标记 → 标题」）。
  - `src/worker/routes/share/analytics.ts`：global 与 note 两条批处理各加一条 labels 语句（放在 channel 语句旁、聚合语句之前——后者按位置解包），`composeChannels(rows, total, labels)` 给行附 `label`。
  - `src/shared/types/share.ts`：`ShareBreakdownItem.label?`（worker 解析出的显示名；是用户数据，不是本地化文案）。
  - 客户端：`localizeChannelName(name, label?)`，看板渠道分解与单篇分析弹窗都传 `label`；locales 各 +1 键（`share.channel_collection_row`）。
  - 演示后端：`SHARE_CHANNELS` 增加一行由 `SHARE_DEMO_COLLECTION_CHANNEL` 构造的集合标记（并重新配平百分比），`demoChannels(state)` 从种子集合读出标题补 `label`，与 worker 同形。
  - ADR-0005：三处 `?ref=collection` 的描述改为逐集合标记；「实现记录」新增逐集合读数一节；「局限」补一条（撤销后历史标记回到原始文本）。
- 一处**刻意的设计选择**（不是遗漏）：没有在集合面板里再加一列「目录访问」。看板的渠道分解本来就有区间与流量过滤两重作用域，再把同一问题搬进面板就是第二个口径不同的数字；**同一个问题只留一个答案**——面板继续只回答「这条目录现在收录了什么」。
- 先红后绿：4 例新断言先红（shared 的构造与字符集、目录链接、看板渲染 `Collection · <标题>`、worker 两条路由的 label）。修复后：`src/shared` 10 例、`tests/share-routes.test.ts` 111 例（+2）、`features/share` + `src/shared` + demo 等 **61 文件 / 474 用例全绿**。
- 变异 3 发**全部命中**：labels 的键改成裸 slug（worker 那两例红）、`localizeChannelName` 忽略 label（看板断言红）、目录链接退回 `?ref=collection`（链接断言红）。
- 浏览器读数：见第 48 项——同一次门禁运行同时覆盖了这两件事（目录项带的标记、看板把它读成集合名）。
- 验证读数：`tsc -b --force` exit 0；13 项静态门禁全绿（`comments` 用 `sync-comments-allowlist.mjs` 重建；`size` 首跑报 `share-dashboard-channels.test.ts` 的 describe 体超 50 行，按「不 resnapshot」把新用例提成独立 describe 后归零；`i18n` 3271 键，+1）。
- 局限：① 撤销集合会删除记录，历史访问仍在分解里，但回到原始标记、没有名字可查（ADR 已写明）；② 解析是每条 analytics 请求多一条语句（按账号收窄、上限 20 条），未在真实 D1 上量；③ 集合页本身的访问不写访客行（沿用 ADR-0005），读数只覆盖「从目录进入单篇」那一段；④ 演示模式的集合行是静态夹具（标题从种子集合读出），不随体验版里的点击变化。
- 新发现（登记、不在本项改，见 SH-101）：同一访客对同一链接的并发请求会写出两行（去重是「先查后写」）；本机实例未配置 `VISIT_FP_SECRET`，那种情况下这个去重窗口**根本不生效**（实测 4 个并发请求写出 4 行，`visitorFp: null`）。

### 48 — SH-68 的浏览器级场景：公开集合落地页从口令门走到通道读数（2026-09-21）

- 交付物：`scripts/e2e-visual.mjs` 新增 `assertPublicCollectionPage(browser, page, consoleErrors)`（9 条断言，挂在分享中心场景之后、console 检查之前）与五个零件：`COLLECTION_PROBE`（本次运行的探针夹具）、`REAL_VISITOR_UA`、`apiCall`（在 owner 自己的页面里用应用自己的请求头调 API）、`waitForVisitChannel`（轮询）、`removeCollectionProbe`（收尾）。断言链就是任务描述的那条路：owner 经自己的 API 建笔记 + 标签 + 分享 + **带口令的标签集合**；一个**从未登录过的全新浏览器上下文**（真访客）打开 `/c/:slug`；口令门前什么也看不到 → 错口令被拒且仍什么也看不到 → 对口令解锁；目录项链接带**本集合自己的标记** → 点进去落在 `/s/<slug>?ref=collection-<slug>` → owner 读回访问行里就是这个标记 → 看板用**集合标题**（`集合 · <名字>`）而不是原始标记呈现它。两处文案对（`数据看板`/`Dashboard`、`Collection ·`/`集合 ·`）进 `LABELS`，与该文件其它文案对同处一处。
- 两处**必须如此**的决定（都不是随手写的）：
  - 探针的标签名带**每次运行的戳**。集合的口令门与单篇分享是同一套节流（`collection-slug:<slug>` 10 次免费 + `collection:<slug>:ip:<ip>` 5 次），而「同一目标重复发布 = 改写同一地址」意味着固定名字会让每次运行都打在**同一个** slug 计数器上；本场景又故意花掉一次错口令（那正是「错口令被拒」这条断言的代价），于是地址迟早被锁——而**被锁的地址连正确口令一起拒**（产品行为，与单篇分享门一致，不是缺陷）。固定名字的绿会取决于「上次运行是多久之前」，那是靠运气。
  - 访客必须**换一个 User-Agent**。产品自己的 bot 名单把 `HeadlessChrome` 判为爬虫（判得对），而爬虫访问不写行——不换 UA，这条场景要读的那一行根本不会出现。
- 一处**本项自己撞上、必须修的门禁副作用**：探针会在**同一个账号**上留下标签与访问行，而分享中心的 axe 断言跑在它前面（同一次运行内）以及**下一次**运行里：账号一旦有标签，hub 侧栏就画出文件夹/标签行（共享组件里的无名图标按钮 ＋ `div[role=button]`，即 SH-93），一旦有访问量，KPI 卡就画出 delta 徽标（`span` 上带 `aria-label`，即 SH-102）。实测：同一实例上第一次全量运行 230/0，紧接着第二次 222/7，红的正是这三条 axe 断言——**第二次的红与被改的东西无关**。修法是让探针**收回自己的痕迹**：`DELETE /api/share/visits?type=all&noteId=…`（产品自己的审计删除，按笔记收窄，带当前口令）＋ `DELETE /api/share/collections/:id` ＋ `DELETE /api/share/tags/:id`；并且**把收尾也当成断言**（`collection: the probe clears the visits, directory and tag it made`）——静默失败的收尾会在下一次运行里以那条莫名其妙的红回来。
- 先红后绿（这条场景的「红」是把产品缺陷改回去）：把 `collectionNoteLink` 退回 `?ref=collection`（即第 47 项修之前的形状）→ 三条断言变红（目录项链接读出 `/s/<slug>?ref=collection`、访问行的通道读不到、看板认不出集合名），其余全绿；改回即全绿。这条场景守的是**产品链路**而不是断言本身，所以变异就是「把上一项修好的东西改回去」——它正是这两个批次的接缝。
- 浏览器读数（`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`，端口 7763，`node scripts/e2e.mjs` 建号后的同一实例）：
  - `node scripts/e2e.mjs http://localhost:7763` → **177 通过 / 0 失败**；
  - `node scripts/e2e-visual.mjs http://localhost:7763` → **231 通过 / 0 失败**，耗时 192s（比第 47 项那次多的 1 条就是上面的收尾断言；9 条 collection 断言全绿、分享中心 4 条 axe 断言全绿）；
  - 可重跑性（本项的关键读数）：该实例在本轮先后被探针跑过 5 次，最后一次**全量**门禁仍是 231/0（分享中心那 4 条 axe 断言在探针跑过之后**不再**随运行次数变红）。其中两次是「分享中心 ＋ 探针」的**压缩重跑**：临时副本（只留这两个场景，用后即删，未留在仓库）连续两次 27 通过 / 0 失败。
- 一处**如实说明**：最终树第一次全量跑（端口 7762）在第 5 个场景「思维导图」处以 `Waiting failed: 30000ms exceeded` 崩掉，`collection:` 断言一条都没跑；同时该实例（以及更早的 7761）在几分钟内被**别的线程的清理**停掉了（`ss` 里三个端口全消失、`ps` 里只剩另一条线程的 vite）。这次崩溃没有被算作绿、也没有被当成读数；换端口重跑后上述读数成立。它与 SH-90/SH-97 同性质（环境负载与进程被别人收走），本项不顺手改。
- 验证读数：`tsc -b --force` exit 0；11 项静态门禁全绿（`comments` 用 `sync-comments-allowlist.mjs` 重建，新增 2 条）；`src/client/features/share` + `src/shared` + `tests/share-routes.test.ts` + `src/client/demo/backend` **61 文件 / 473 用例全绿**；提交前另按文档流程把**暂存快照**单独验证过（`git archive HEAD` ＋ 暂存补丁，`comments`/`style`/`size`/`i18n`/`surfaces` 全绿），确认 `check-comments.mjs` 被两个提交切开后各自自洽。
- 局限：① 收尾用的是产品自己的删除接口（访问日志那条需要当前口令），因此「门禁知道账号口令」这件事又深了一层；口令策略若变化，收尾会先红——这是有意的（见上）；② 探针**留下笔记与它的分享行**（只收回标签、集合与访问行）：它们与 `e2e.mjs` 自己留下的笔记同性质，实测不影响下一次运行；③ 场景只在桌面视口跑，手机断点下 `/c/:slug` 的口令门落版没有断言；④ 本轮量到的两条产品缺陷（SH-102 的 delta 徽标、SH-93 的 hub 行）只登记不修：前者在共用 `dashboard-blocks.tsx`，改了要跑 blog 双侧回归；后者是 SH-93 的既定范围。

### 49 — 四项任务（§45–§48）收尾：全量串行回归（2026-09-22）

- 触发条件（与 §40/§44 同一口径）：本批触碰了**共用的服务端面与 SQL**——`share-selection`/`share-selection-sql` 被列表、侧栏计数、集合成员谓词、批量开关与日志筛选共用，`share-channel` 被写路径与读路径共用，analytics 的两条批处理里新增了 labels 语句——因此必须在**全量串行**下全绿才算收尾。本批**没有**新 migration（无 schema 变更）、没有动 lockfile 或依赖。
- 读数：`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000` → **346 文件 / 2781 用例通过 ＋ 1 skipped，0 失败**；耗时 623.91s（transform 14.35s、import 104.82s、tests 100.28s、environment 344.30s）。
- 与 §44（341 文件 / 2755 用例）对账，增量 **+5 文件 / +26 用例**，逐项可核：
  - 新增 5 个测试文件合计 **21 例**：`src/shared/share-selection.test.ts` 10、`tests/share-selection-parity.test.ts` 6、`share-hub-views.test.ts` 3、`share-hub-preload.test.ts` 1、`share-collection-link.test.ts` 1（文件数 341 → 346 正好等于这 5 个）。
  - 既有文件内 **+5 例**：`tests/share-routes.test.ts` 109 → 111、`share-dashboard-channels.test.ts` 4 → 5、`src/shared/share-channel.test.ts` 9 → 10、`tests/share-collections.test.ts` 14 → 15。
  - 其余被动过的测试文件（`share-category-status.test.ts`、`table-view.test.ts`、`tests/share-analytics.test.ts`）只有夹具或断言内容变化，用例数不变，因此不计入增量。
- 规模：本批从 §45 到本节之前共 **50 文件、+2398 / −499 行**（`git diff cbe3d9de..HEAD --shortstat`）。
- 过程：与 §40/§44 相同的 `setsid nohup … &` 脱离进程组后一次跑完，未被调用窗口打断；跑的时候同机另一条线程（`inkstone-blog-improvement-…`）正在跑自己的 vite，未去动它；本线程自己的临时实例在收尾时已停掉（`ss` 无遗留监听）。
- 台账闭合情况：四项任务全部交付并各自成一次提交——§45 共享谓词层 `9b8b7644`、§46 hub 视图自洽 `4cae175b`、§47 逐集合读数 `49ec94d6`、§48 浏览器级场景 `483418c8`；队列表状态列更正为「SH-66 ✅、SH-68 🟡 但写明三期已交付／集合级资产会话按记录不做」并补了一行状态图例（`02e74108`）；本轮新登记的 SH-101（并发访问去重是先查后写，无 `VISIT_FP_SECRET` 时去重窗口不生效）、SH-102（KPI delta 徽标的 `aria-label` 违规）、SH-103（分享中心的 axe 断言只在空账号上成立）与 SH-93 的现场补充都已写进「新发现」表，**未夹带修复**。
- 局限（如实登记）：① 本次比 §44 快（623.91s vs 760.74s），但两次的机器负载不同（§44 当时别的线程正在跑浏览器门禁），**这不构成性能对比**，只当「全绿」这一件事的证据；② 全量跑的是本机 `node:sqlite` 测试基座，不代表真实 D1 上的行为与成本；③ 浏览器级门禁没有在这一次里重跑（§47 与 §48 各自报了同一实例上的 231/0 与可重跑性读数），本节只回答「单元／集成层在全量串行下是否全绿」；④ 仍有未闭合的登记项：SH-69 的二维码打印表、SH-64 的 PNG/PDF（重开条件已写）、SH-90/SH-97 的负载敏感断言、SH-100 的音乐夹具契约、SH-93/SH-102/SH-103 的 a11y、SH-101 的访问去重——它们都不在本批范围内。

### 50 — SH-101 访问去重落进写入本身，无指纹的实例界面明说（2026-09-22）

- 根因（同一处代码的两面）：①「同一访客在一个时间窗内只记一次」是**先查后写**——`isRecentlySeenVisit()` 一次读，插入在随后的 `batch` 里，所以同一访客的两个请求都在途时都能读到「没来过」，于是各写一行、各给 `shares.views` 加一。②`visitorFp` 为 null 时那个函数直接返回 `false`，于是去重窗口**完全不生效**（未配置 `VISIT_FP_SECRET` 的实例就是这种），并且这一点在**界面上没有任何说明**：看板的「独立访客」会稳定显示 0（`COUNT(DISTINCT NULLIF(visitor_fp,''))`），看上去像「没有人来过」，而不是「这里不统计」。
- 修法（**不加 migration**，没有 schema 变更）：让去重窗口**进入 INSERT 本身**——`INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM share_visits WHERE slug = ?3 AND visited_at > ?20 AND visitor_fp = ?5)`，并把 `shares.views` 的递增改为**跟着这次写入的 `meta.changes`**（写进去了才加），同时删掉 `isRecentlySeenVisit`。两个重叠请求不再有两个可以各自作答的「读」，也就没有可陈旧的答案。代价写在代码注释里：这两条语句不再是一个 batch，中途崩溃会少算一次 view——这是可以丢的那一侧。
- `visitor_fp = ?5` 在指纹为 null 时恒不成立，这正是无密钥实例应有的行为（没有可比对的东西 ⇒ 每次访问各是一行）；它和「界面必须说出来」一起交付：`SiteInfo.visitorFingerprints` 由 `VISIT_FP_SECRET` 决定，不采集指纹时 UV 卡写「未采集」而不是 0，日志表与会话面板的口径说明也换成对应的那一句（`visitorCountNote()` 一处决定，两个面板共用）。`src/worker/env.ts` 与 `AGENTS.md` 的环境变量清单补上这个密钥（本仓没有可提交的 `.dev.vars` 示例，部署清单就是 `AGENTS.md` 的这一节）。
- 先红后绿：`tests/share-routes.test.ts` 两条。①「陈旧窗口」那条**先红后绿**——先让访客的第一次访问正常写入，再把「窗口读」换成答「没见过」的替身（即另一个请求的行恰好落在那次读之后的那一刻）：旧实现多写一行并把 view 记成 2（实测 `expected 2 to be 1`），新实现根本读不到那一行，也就没有可被作假的答案。替身按**旧读自己的 SQL** 匹配，因此它只可能对「仍然先查后写」的实现生效（替身在 `bind` 之后仍要生效，本轮先写错了一次、被实测纠正）。②「无指纹实例」那条固定的是**既有行为**（默认隐私：行里不带指纹）：两次访问两行、两行 `visitor_fp` 皆为 null、view 为 2；它的价值是防止有人为了让 UV 好看而退回公开盐哈希。
- 变异 2 发**全部命中**：`visitorFingerprints` 写死 `false` → `tests/auth-routes.test.ts` 的「配置了密钥」那条红；`KpiCard` 忽略 `unavailable` → KPI 那条红。加上上面那条先红后绿，本项共 3 处行为差异各有断言守着。
- 验证读数：`tsc -b --force` exit 0；11 项静态门禁全绿（`comments` 用 `sync-comments-allowlist.mjs` 重建，5679 条 / 781 文件）；`tests/share-routes.test.ts`（113 例）＋ `tests/auth-routes.test.ts` ＋ `src/client/features/share` ＋ `src/client/lib/db` ＋ `src/shared` **64 文件 / 489 用例全绿**。全量串行回归见第 52 项。
- 局限：① 两条语句不再原子（见上）：崩溃窗口会少算一次 view；② 缓存会话的校验新增必填字段，升级后第一次打开会因旧缓存不合法而重新取一次会话（自愈，无用户可见失败）；③ 只做了分享侧——博客访问（`blog_visits`）是同一个先查后写的形状，**且更宽**（每行都写，重复行直接进日志表），登记为 SH-104，属 blog 自己的范围；④ 演示模式报告「采集指纹」的常态，不演示缺密钥的样子；⑤ 未在真实 D1 上量 `INSERT ... WHERE NOT EXISTS` 与原来「读＋写」的成本差。

### 51 — 分享中心的读法带上真实账号的数据（SH-102 / SH-103，SH-93 部分闭合）（2026-09-22）

- 根因（两件事互为因果，必须一起做）：分享中心那两条 axe 断言读的是**账号当前状态画出来的表面**，而 CI 的夹具账号既无访问也无标签——没有访问就画不出 KPI 的 delta 徽标，没有标签就画不出 hub 侧栏的标签行。第 48 项量到的「同一实例第一次 230/0、紧接着第二次 222/7」正是这件事的现场：第二次的红（`button-name`、`nested-interactive`）与被改的东西无关，而是**第一次探针留下的标签和访问**把那两个表面画出来了。只修组件（SH-93/SH-102）而不把数据放进夹具，等于把盲区留在原地；只放数据而不修组件，门禁会稳定地红。
- 修法一（夹具，`scripts/e2e-harness.mjs`）：新增 `seedShareHubData()`，把「一条带标签的分享 ＋ 一次访问」放到夹具账号上，并**把结果返回给调用方去断言**（一个没落到位的夹具正是它要关掉的盲区，不该穿着同样的绿）。它是**幂等**的：探针笔记按标题找回或新建、标签用 keep-existing 策略、分享是按笔记 upsert，访问只在**账号完全没有流量时**记一次——所以它对同一实例反复跑不会一行一行地堆日志。访问走 `POST /api/public/<slug>`：分享页的**外壳不记访问**（该路由只服务 HTML），行是页面自己的客户端请求笔记时才写的，我第一版就是取外壳而得到 `views: 0`；又因为「访问是为**请求方的 user-agent** 记的」，这个请求从 **node 侧**发出——从浏览器发就等于所有者自己回访自己的链接（并且 `HeadlessChrome` 会被产品的爬虫名单正确地拦住，那一行根本不会写）。读回用的是看板自己的接口（`/api/share/analytics/global?range=7d`），不是背后的表。
- 修法二（门禁）：`scripts/e2e-visual.mjs` 的分享中心场景先播种并断言播种成功，**再断言 KPI 的 delta 徽标确实画出来了**（按画出来的文本形状 `[+-]?\d+%` 判，而不是按组件标记），然后才跑两条 axe；`scripts/check-contrast.mjs` 的同一个表面在 `openShareCenter()` 里同样先播种，播种失败**直接报错**——与上一个表面（音乐库）要求预置探测曲目是同一个口径。多出的那条断言是有意的：一次访问没落地的运行会读到更安静的看板，本该报错而不是继续「无违规」。
- 修法三（量出来的两条产品缺陷）：
  - **SH-102**：`KpiCard` 的 delta 徽标把提示挂在无 role 的 `span` 的 `aria-label` 上，axe 报 `aria-prohibited-attr` 并丢弃该属性（徽标于是只读出百分比）。改为**读在它所在的位置**：提示成为 `sr-only` 文本，屏幕阅读器听到的仍是「+12% 对比上一周期」，而不再需要有 role 才能带名字。
  - **SH-93（两条共用行）**：`components/hub-tag-item.tsx` 与 `components/hub-folder-row.tsx` 的行本体是 `div[role=button]` ＋ `tabIndex`，里面又嵌着 Switch、重命名输入框和一个**无名字的悬停图标按钮**（`button-name` / `nested-interactive` 两类）。改为：行本体是**真 `<button>`**（可访问名就是标签名/文件夹名，Enter/Space 原生），展开箭头补 `sidebar.expand`/`sidebar.collapse`，更多菜单按钮改用项目自己的 `IconButton` ＋ `common.more_actions`，悬停才显形的控件在桌面断点补 `focus-visible` 显形、手机断点常显（`opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100`，与 `features/tags/tag-row.tsx`、侧栏自己的行同一串）；随 `div` 的 `role`/`onKeyDown` 一起删掉失效的 `rowKeyDown`，拖放与右键仍留在行容器上。这同时是**共用组件**，博客 hub 侧栏与附件/标签侧栏跟着受益。
- 先红后绿（现场读数）：夹具与断言先落地、组件未改时，同一实例上的分享中心读法从「16 条全绿」变成 **229 通过 / 3 失败**，红的正是夹具那条与两条 axe（`button-name` 指向 `.p-0.5` 的悬停图标按钮、`nested-interactive` 指向 `div[role=button]` 的行本体）；改完后同一实例 **231 通过 / 1 失败**（唯一失败是 SH-90 那条负载敏感的 slides pan），换一台全新实例（7782）重跑给出本节读数。
- 验证读数：
  - 浏览器门禁（全新实例 7782，`e2e.mjs` 建号后同一实例）：`scripts/e2e.mjs` → **177 通过 / 0 失败**；`scripts/e2e-visual.mjs` → **233 通过 / 0 失败**（16 条分享断言全绿，含播种成功、徽标已画出、两处 axe 各「无违规且无未复核项」）；`scripts/check-contrast.mjs` → **整门禁通过**（54 行 ✓、0 行 ✗，两套主题；分享中心：3 个落在软底上的层级、0 个低于 AA，按全部 7 个强调色重算 21 次、0 个低于 AA，axe 29 项通过 / 1 项按 id ＋ 原因放行）。
  - 那一条「按原因放行」查清了是什么（一次性探针，跑完已删）：`color-contrast` 的 incomplete ×12，目标是仪表盘折线图上的 `<text>` 轴标签，axe 的理由是「内容太短，无法判定是否真的是文本」——`isReviewedIncomplete` 里既有的放行类别，**不是本次改动引入**；该表面当时 `violations: []`。
  - 静态门禁与构建：`tsc -b` exit 0；10 项静态门禁 ＋ `i18n:check` ＋ `vendor:check` 全绿；`budget:check`（含构建）通过。
  - 单元／集成：`src/client/components` ＋ `features/share` ＋ `features/blog` ＋ `features/sidebar` ＋ `features/tags` ＋ `features/attachments` ＋ `features/folders` → **70 文件 / 335 用例全绿**（含新增的 `hub-row-a11y.test.ts` 6 例）；`blog-frontend` → `astro check` 0 error / 0 warning / 0 hint、`agents-lint` 通过、`vitest` **34 文件 / 292 用例全绿**。
  - 变异 2 发**全部命中**：把 `role='button'` ＋ `tabIndex` 放回标签行 → 只有「行本体是真控件而非 div」那条红；把更多菜单按钮换回无名图标按钮 → 只有「行内每个控件都有名字」那条红。
- 提交与快照：产品修复 `4df146ef`（`fix(ui)`，含 6 例新回归），门禁夹具 `6ec9b313`（`test(share)`）。按 AGENTS「分批与门禁」：先 `git archive HEAD` 出快照 A，只覆盖本批产品文件并在快照里重建**中间态**注释白名单（`sync-comments-allowlist.mjs` 只认这份树），在快照里跑静态门禁全绿后才提交 A，再把两个门禁与白名单的其余部分作为 B 提交。
- 局限（如实登记）：① SH-93 只是**部分闭合**：两条共用行的行本体与图标按钮已改，但该行的其余建议（把 SH-49 的守卫正则从 `features/share` 扩到 `src/client/components` 与其它 feature、逐文件写理由）与 `components/overlay/submenu.tsx` 里的裸按钮都**没做**，仍留在该行；② 夹具给的是**最小数据**（一个标签、一次访问、一条分享行），看板的访问日志表、长期无人访问卡片等更“厚”的状态仍没有被 axe 读过；③ 夹具**有意留着**那条笔记/分享/标签（收敛而不是累积），因此分享中心的列表视图从此至少有一行是夹具画的——将来若有断言依赖「列表为空」，得自己说出来；④ 本机没有 `VISIT_FP_SECRET`，所以读到的是「无指纹」那条分支（UV 卡写「未采集」，徽标读的是 PV 的），有密钥的实例上第二次运行的访问落在去重窗口内、不会新增行，而夹具只在**零流量**时才记访问，所以断言两处都成立；⑤ 徽标断言按**画出来的文本形状**匹配而非组件标记，徽标换一种画法会让它变红（响亮地失败，不是静默跳过）——这是有意的；⑥ `KpiCard` 同时供博客看板使用，主应用两边的单测都跑到了，但博客**路由**的出数没有浏览器级读法（`blog-frontend` 没有 axe 门禁）；⑦ 本次 `check-contrast` 全跑通（SH-100 在这台实例上没复现）只是**这一台实例的读数**，不等于 SH-100 已消失。

### 52 — 第 50/51 项的批次收尾：全量串行回归（2026-09-22）

- 触发条件（与 §40/§44/§49 同一口径）：两份改动都触碰了**共用的服务端面、共用组件与门禁基础设施**——§50 改了 `share/public.ts` 的写入语句（`share_visits` 的去重窗口进了 INSERT），§51 改了`src/client/components/` 里的共用 hub 行与 `KpiCard`（分享看板、博客看板、附件/标签侧栏都用），并把两个浏览器门禁共用的夹具搬进了 `e2e-harness.mjs`。因此必须在**全量串行**下全绿才算收尾。
- 读数：`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000` → **347 文件 / 2792 用例通过 ＋ 1 skipped，0 失败**；耗时 630.44s（transform 14.91s、import 104.83s、tests 99.59s、environment 349.98s）。
- 与 §49 的读数（**346 文件 / 2781 用例 ＋ 1 skipped**）对账，增量 **+1 文件 / +11 用例**，逐项可核（每个右侧数字都在当前树上重跑对应文件核过）：
  - 新增 1 个测试文件：`src/client/components/hub-row-a11y.test.ts` **6 例**（§51）；文件数 346 → 347 正好等于它。
  - 既有文件内 +5 例，**全部来自 §50**：`tests/share-routes.test.ts` 111 → 113（并发去重与无指纹两条）、`tests/auth-routes.test.ts` 10 → 11（能力报文）、`src/client/features/share/share-dashboard-kpis.test.ts` 3 → 4（UV 卡写「未采集」）、`src/client/features/share/share-visitor-count-note.test.ts` 1 → 2（口径文案两种分支）。
  - §51 对既有测试文件只**改断言**（`dashboard-blocks.test.ts` 4 → 4、`share-dashboard-kpis.test.ts` 的用例数不变），因此不计入增量；`1 skipped` 与 §49 一致。
- 规模：§50 ＋ §51 共 **27 文件、+697 / −126 行**（`git diff bebc393c..HEAD --shortstat`），其中 §51 单独为 **10 文件、+418 / −78 行**。
- 过程：`setsid nohup … &` 脱离进程组后一次跑完，未被调用窗口打断；跑的时候同机的另一条线程有自己的实例（其端口不在本节使用的范围）；本线程自己的两个临时实例（7781/7782）在回归前已停掉（`ss` 无遗留监听，也没有残留的 headless Chrome）；一次性探针脚本两个（`tmp-share-visit-probe.mjs`、`tmp-share-axe.mjs`）已删，注释白名单里它们的条目也随之重新生成（785 文件 / 5736 条，无对不存在文件的残留条目）。
- 浏览器级门禁不在本节重复：三个（`e2e.mjs`、`e2e-visual.mjs`、`check-contrast.mjs`）都在 §51 里对**同一个全新实例**跑过并全绿，本节只回答「单元／集成层在全量串行下是否全绿」。
- 局限（如实登记）：① 本次比 §49 略慢（630.44s vs 623.91s），两次的机器负载不同（同机另一条线程当时在跑自己的实例），**不构成性能对比**；② 全量跑的是本机 `node:sqlite` 测试基座，不代表真实 D1 上的行为与成本；③ 仍有未闭合的登记项：SH-69 的二维码打印表、SH-64 的 PNG/PDF（重开条件已写）、SH-90/SH-97 的负载敏感断言、SH-100 的音乐夹具契约、SH-99 的两套分享中心文案对、SH-104（博客访问的同形缺陷，属 blog 范围）、以及 SH-93 未做完的那一半（守卫正则扩容与 `overlay/submenu.tsx` 的裸按钮）——它们都不在本批范围内。

### 53 — SH-93 的后半：守卫改为 AST 并扫整个 client，共用层逐条写明理由（2026-09-22）

- 根因（先把它说清，而不是「守卫太小」）：SH-49 的守卫只读 `features/share`，而它用正则守的东西其实是两件不同的事，混在一起互相掩护：**(a)** 一个控件必须带可访问名——这是 axe 的 `button-name`，哪里都该零容忍；**(b)** 控件应当来自组件体系（AGENTS 铁律 10）——这是取向，但对「按网格几何画的行/格」和「菜单里的行」并不成立：`Button` 固定尺寸并把 children 包进一个不伸展的 `span`，日历格、日期格、菜单行都不是这个形状。把 (b) 无差别地施加到全仓 397 处裸 `<button>` 上，得到的是一张 146 行的白名单——那不是理由，是坟场。§51 已经证明 (a) 是真实伤害：账号一有标签，分享中心自己的 axe 断言就以 `button-name`/`nested-interactive` 变红。
- 做法：`tests/share-bare-buttons.test.ts` → **`tests/client-raw-controls.test.ts`**（`git mv` 语义上是删旧建新），改用 TypeScript AST（不再正则）扫整个 `src/client`，三条规则：
  1. **任何 `div`/`span` 写 `role='button'` 即失败**（零容忍；今天的例外只有三个看板卡片根，逐条在脚本内写了理由，两个方向都失败）。
  2. **每个裸 `<button>` 必须有可访问名**：`aria-label`/`aria-labelledby`/`title`，或子树里的可见文本（表达式算文本、内嵌元素不算——那是图标）。
  3. **`src/client/components/**`（所有 feature 共用的那一层）里出现裸 `<button>` 必须在脚本里有一条带理由的条目**，且条目对应的文件必须**仍然真的**写裸按钮（两个方向都失败）。
- 规则 2 的边界写进了脚本头（不藏着）：wrapper 组件注入的名字、`{...rest}` 展开进来的名字**读不到**，所以不会拿它冤枉人；反过来，一个「其实是靠 wrapper 才有名字」的裸按钮也读不到——这条静态规则比 axe 松，真实渲染与 AT 由浏览器门禁读。
- 先红后绿（守卫落地时的现场读数，3 红）：`div role=button` **2 处**（`kanban/ui/kanban-card-subtasks.tsx:154`、`kanban/ui/kanban-column-header.tsx:107`）、无名裸 `<button>` **25 处（13 文件）**、共用层无条目 **2 文件**（`components/error-boundary.tsx`、`components/feedback.tsx`）。
- 改动面：
  - **两处假控件换成真 `<button>`**：卡片上的子任务进度条（补 `aria-expanded` ＋ 既有 `preview.kanban_expand_subtasks`/`collapse_subtasks`）、折叠列的竖条（保留原有 `aria-label`，原生键盘即可；两种写法里手写的 `onKeyDown`/`tabIndex` 一并删掉）。看板上真正「一个卡片根要同时当点击目标又装着自己的控件」的三处（`kanban-card.tsx`、`kanban-gallery-view.tsx`、`kanban-list-view.tsx`）**不换成按钮**（那就是控件套控件），按规则 1 的白名单逐条写明理由——它们本来就是「点任意处打开详情」的卡片面，另立改造。
  - **25 处补可访问名，优先复用既有词表**：`common.more_actions` 6 处（附件/看板行菜单）、`sidebar.expand`/`collapse` 4 处（展开箭头，并补 `aria-expanded`）、`common.clear`（搜索框清除、博客筛选清除）、`attachments.view_grid`/`view_list`（＋`aria-pressed`）、`attachments.star`/`unstar`（＋`aria-pressed`）、`blog.link_menu_open`（链接检查器「新标签打开」）、`preview.kanban_delete_subitem`、`preview.kanban_card_details`、`slides.bring_forward`/`send_backward`（这两个键**本来就在 locales 里、却没有任何调用点**——图层上下移按钮正是它们的用武之地）。语言侧只新增 3 个键（`common.add`/`common.remove`/`common.remove_value0`，`{value0}` 插值），en ＋ zh 同补。
  - **共用层两个文件回到组件体系**：崩溃页的「重新加载」改 `Button variant='primary' size='sm'`（注释写明为什么两个断点都留手机高度），Toast 的关闭按钮改 `IconButton size='sm' variant='ghost'` 并把 `-my-1` 留给行高。命中区随之从约 20px 变成 32(手机)/24(桌面)px——与 §11 同类的尺寸变化，如实登记。
  - **`overlay/submenu.tsx` 的裸按钮**：它其实就是**菜单行本身**，而下拉菜单（`overlay/menu.tsx`）与子菜单列表各手写了一份（两份的行样式、勾选标记、箭头对齐都在分叉）。抽出 **`components/overlay/menu-row.tsx`** 作为唯一的行原语：形状与「行对自己声明的 ARIA」一处写；两种键盘模型（菜单的游标 `data-menu-index` vs 列表的 DOM 焦点 `data-submenu-row`）仍各由调用方接自己的线；菜单行与列表行的视觉差异（`gap-2.5` vs `gap-2`、`✓` vs Check 图标、箭头是否 `ml-auto`）**按原样保留**，用 `tight`/`check`/`arrowClassName` 三个 props 表达。
- **这次重构的验证方式（不是「看着没变」）**：把两个表面各 5 种行（普通/带图标/选中/组合键/禁用/危险色）在抽前抽后各渲染一次，规范化成（属性映射 ＋ **排序后的 class 集合** ＋ 子树）再比对 → **10/10 行一致**（差异只有 class 在属性串里的书写顺序，集合完全相同，而 Tailwind 的结果由样式表顺序决定、与属性顺序无关）；这个比对脚本用完即删。
- 新增的读者：**`src/client/components/overlay/menu-row.test.ts`**（5 例：名字来自 item、`role`/`aria-checked` 随 `checked` 变、勾选标记只画在选中行、子菜单画箭头而组合键画 `Kbd`、禁用行点了不触发、调用方的色调与 `tight` 确实落位）。
- **变异检查（4 个，各自被一条指名断言杀死）**：① 摘掉一处 `aria-label` → 规则 2 ✗（报出 `file:line`）；② 把行本体改回 `div role=button` → 「条目对应的文件必须仍然真的写裸按钮」 ✗（这条同时说明白名单不会留下过时条目）；③ 在 feature 里种一个 `div role=button` → 规则 1 ✗；④ 在未登记的共用文件里种一个**带名字**的裸 `<button>` → 规则 3 ✗（提示「用组件体系，或带理由登记」）。
- 验证读数：守卫 **6/6**；相关目录 **134 文件 / 779 用例**全绿（含 `overlay/submenu.test.ts` 6 例与新的 `menu-row.test.ts` 5 例）；`npx tsc -b --force` exit 0；**12 项静态门禁全绿**（comments 789 文件 / 5762 条；i18n 新增 3 键并过键一致；size 1488 文件 / 20 个 grandfathered；hardcoded 基线因摘掉一处写死的 `text-white` 而少一条，按门禁提示 `--update-baseline`）；浏览器级（全新实例 **7910**，`e2e.mjs` 建号后的同一实例）：`e2e.mjs` **177 / 0**、`e2e-visual.mjs` **233 / 0**、`check-contrast.mjs` **两套主题全绿**（每题「层级 × 底色」与全部强调色都量过）。
- **全量串行回归**（`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000`）：**348 文件 / 2799 通过 ＋ 1 skipped / 0 失败**，649.38s（transform 18.23s、import 112.91s、tests 117.15s、environment 343s）。对 §52 的 347/2792 为 **＋1 文件 / ＋7 用例**，可核对：删掉 1 个文件（`tests/share-bare-buttons.test.ts`，4 例）、新增 2 个（`tests/client-raw-controls.test.ts` 6 例 → 净 ＋2；`src/client/components/overlay/menu-row.test.ts` 5 例），合计正好 ＋1 文件 / ＋7 用例；`1 skipped` 与 §52 一致。
- 局限（如实登记）：① 规则 3 只到 `src/client/components/**`；其余 feature 仍是 **146 文件 / 397 处**裸按钮，守卫只要求它们「有名字、不是假控件」，**没有**要求改走组件体系，也**不**把这条登记成队列项——那是一次跨 30+ 模块的改造，用白名单形式「收敛」等于把问题藏起来；② 规则 2 读不到 wrapper 注入的名字与展开进来的 props（见上），因此它比 axe 松；③ 新补的 25 个名字里，**只有分享子菜单那两处**可能被浏览器门禁读到（`e2e-visual` 会开笔记的分享子菜单），附件、博客、看板、幻灯片上的其余各处**没有浏览器级读者**——它们的读者就是这条静态规则，这也是为什么规则 2 要零容忍：这些表面本来就没有别的门禁；④ Toast 关闭按钮与崩溃页按钮的尺寸变了（约 20 → 32/24px；崩溃页保持 36px，但文字从写死的 `text-white` 换成令牌 `--accent-contrast`、并多了 `Button` 自带的按钮阴影，这是 hardcoded 基线少掉一条的原因），未经像素核对（门禁只读 a11y 与布局稳定性）；⑤ 抽出 `menu-row.tsx` 的收益是「一份形状、一处理由」，**不是行为修复**：两种键盘模型仍并存，代价是那个小 API 带着两种变体（`tight`/`check`/`arrowClassName`）；⑥ 顺手撞见、只登记不改：**SH-105**（`overlay/tooltip.tsx` 的提示面板没有与触发器做任何程序化关联——没有 id、没有 `aria-describedby`，而图标按钮在补名字之前常常只有 `title` 充当名字）；⑦ 全量串行回归跑的时候，同机的另一条线程有自己的实例（端口不在本节使用的范围），所以 649.38s 这个数**只当「全绿」的证据，不作性能对比**（§49 623.91s、§52 630.44s，三次负载都不同）。
### 54 — SH-69 批量二维码打印表：离屏 sheet ＋ 打印放行 ＋ 门禁断言（2026-09-22）

- 前情：SH-69 的链接清单（复制/导出 Markdown）在 §33 交付，剩下的「批量二维码打印表」当时以「仓库里唯一的二维码库 `qrcode.react` 只出 `QRCodeSVG`，没有字符串或离屏 API；N 个码要变成可打印物，得新增依赖、或把 `react-dom/server` 拉进浏览器包、或给打印管线塞一棵真 React 树」为由登记待办，重开路线写成「复用导出面板的离屏真实 DOM ＋ canvas 栅格化」。
- 重开时先复核那条理由：**结论不成立**。既不用新增依赖，也不必栅格化——打印管线本来就是「离屏真实 DOM ＋ `window.print()`」（`deck-print-sheet` 与 `bento-print-sheet` 走的就是这条），而 `QRCodeSVG` 在真实 DOM 里画出来的是真 SVG：打印时是**矢量**，比栅格化更好（任意打印机分辨率都清晰）。于是要做的只有三件：一张离屏 sheet、一条打印放行规则、一个入口。
- 做法：
  - `src/client/features/share/share-qr-sheet.tsx`：`ShareQrSheet` 把选中的行渲染成 3 列网格（每格：码 ＋ 笔记标题 ＋ 完整 URL），`createPortal` 到 `document.body`，带 `aria-hidden` 与 `inert`（离屏真实布局，不是 `display:none`——隐藏子树没有盒子）。生命周期照抄既有两张 sheet 的形状：等字体（`settleWithin`，上限 3s）→ 再给一次绘制节拍（250ms）→ `window.print()`，`afterprint` 让调用方卸载。
  - 单独抽出两个纯函数 `buildQrSheetEntries`（行 → 打印用标题 ＋ 绝对 URL）与 `qrSheetChannelLabel`：它们才是能被断言按住的两件事。相对分享地址按单链接面板的同一条规则解析成绝对地址（二维码里放得下的只有绝对地址）。
  - `useShareQrSheet()`：请求在飞时才挂载 sheet，与 `useSlidesPrint` 同形——文档里平时没有这张 sheet。
  - `printShareQrSheetFlow` 与另外两个「把链接发出去」的动作**共用同一个守卫**（`hasRows`）：选中的行一条都不在列表里时，三个动作说得一样。它是三者里唯一不能把「漏掉的条数」放进 toast 的（打印对话框会盖住 toast），所以那个数字印在纸上（复用 `share.batch_links_missing` 同一句话）。
  - 样式 `src/client/styles/share.css`（新文件，按 `slides.css`/`kanban.css` 的「每 feature 一份」惯例）：白纸黑字**不走主题令牌**（理由是单链接面板那块白底板早写下的：扫码要黑白对比，深色主题的纸会把二维码的纠错余量花在页面上）；每格 `break-inside: avoid`；离屏用 `position: fixed; left: -100000px`，宽度取 A4 减掉 `@page` 边距（186mm），所以离屏排出来的就是印出来的。
  - `styles/presentation.css` 的打印放行规则加一个类名（`.share-qr-sheet`）：那条规则把 body 下除三张 sheet 之外的一切 `display:none`，忘了加就是**打出空白页**。这句「为什么」写不进 CSS——本仓 CSS 禁止注释（`comments:check` 直接拒 CSS 注释），因此写在 sheet 的 TSX 头注释里，两个失败方向都写明。
- 尺寸不是「看着顺眼」定的：在同一实例上用探针量 pitch 与行高，再算 A4/Letter 各能放几行——**160px（印出约 42mm）在 A4 上放 4 行＝12 个码**；180px（单链接面板 220px 按比例缩小会得到的值）只能放 3 行、第 4 行单独占一张纸；Letter 两种都只放 3 行。因此 sheet 是「随纸流下去」，不承诺张数（`@page` 只设 12mm 边距，不设纸型）。
- 验证：
  - **单元/组件**：`share-qr-sheet.test.ts` 13 例、`share-batch-links.test.ts` 12 例（含 2 例新流程）。断言的是行为：marker 落在每个码编码的 URL 上、标题缺省回落到 slug、非法 marker 既不进 URL 也不进表头、每行一个**不同**的码、漏掉的条数印在纸上、离屏且不在 Tab 序、等到画好才 `print()` 且只一次、`afterprint` 卸载、未请求时文档里没有 sheet。
  - **探针（真实实例，用完即删）**：按人的路径打开分享中心 → 切「全部分享」→ 表头全选 → 输入 marker `launch` → 按「打印二维码表」。读到：sheet 在 `-100000`、宽 703px（＝186mm）、3 列、每码 160×160；`emulateMediaType('print')` 下 `#root` 为 `none`、sheet 转 `static`；`page.pdf()` 出真 PDF——`pdftotext` 读到表头/标题/URL（`?ref=launch` 出现 12 次 ＝ 11 个码 ＋ 1 行表头），`pdftoppm` 栅格化成 ASCII 密度图后**肉眼可见 3×3 个码块、每块紧邻自己的标题与 URL、单页**；11 个码时第 2 页只有完整的两格（没有码被断开）。
  - **门禁**：`scripts/e2e-visual.mjs` 新增 `assertShareQrSheet`（9 条断言，走人打开的路径：侧栏 Share → 管理所有分享 → 列表 → 表头全选 → 在 marker 字段输入 `gate-sheet` → 按打印控件）。首次读数 **242 passed / 0 failed**（该实例上整条门禁全绿，含新增 9 条）。补上 `sheetShown` 后在同实例再跑一次：**241 passed / 1 failed**，**9 条二维码表断言全绿**；那 1 条红是 `slides editor: space and a drag pan the view`（舞台 `scrollLeft` 未变化），与本节改动无关，且在同实例的上一次完整读数里是绿的——归入 SH-90/SH-97 那一类负载/时序敏感断言，如实记下而不是当噪声抹掉。
  - **变异（4 个单元级，各自被一条指名断言杀死）**：① 码上不带 marker → 「carries the batch marker in the code itself」＋「draws one code per share」红；② 表头对码上不成立的 marker 照写 → 「states nothing for a value the codes themselves would refuse」红；③ 空选也开表 → 「refuses to open an empty sheet…」红；④ 去掉 `aria-hidden`/`inert` → 「off-screen and out of the tab order」红。
  - **变异（门禁级，1 个）——以及它先暴露了我自己的断言缺陷**：把 `.share-qr-sheet` 从打印放行规则里摘掉，用同一探针读同一批事实：`sheetShown` 由 `true` 翻成 `false`（被摘掉之后**消失的是 sheet 本身**，`#root` 两种状态下都是 `none`），恢复后哈希与摘除前完全一致、`sheetShown` 回到 `true`。这条变异第一次跑时**没被杀死**，因为门禁那条断言当时只读了 `rootHidden`——而「app 被隐藏」在放行写错时同样为真：**空白页与印好的页读出来一样**。已把断言补成同时读 `sheetShown`（且断言名改成「lets the sheet through, laid out in the page flow, and hides the app around it」），这就是它现在能杀死这条变异的原因。另外第一次跑变异时读数是假阴性：改完 CSS 立刻起探针，Vite 的 watcher 还没重新构建，浏览器拿到的是旧样式——第二次在改完后等 8s，并在同一次读数里**读出放行规则本身是否还写着这个类**（`namesTheSheet`）来证明变异真的落到浏览器里了；这条「先证明变异生效，再读它的后果」的教训按上面的形状留在本节。
- **全量串行回归**（`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000`）：**349 文件 / 2814 通过 ＋ 1 skipped / 0 失败**，622.58s（transform 14.21s、import 105.93s、tests 99.45s、environment 341.70s）。对 §53 的 348/2799 为 **＋1 文件 / ＋15 用例**，可核对：新增 `share-qr-sheet.test.ts` 13 例（＋1 文件）；`share-batch-links.test.ts` 由 10 例增至 12 例（＋2），合计正好 ＋1 文件 / ＋15 用例；`1 skipped` 与 §53 一致。
- 静态门禁：`typecheck` exit 0；`comments`（5797 条 / 791 文件）、`i18n`（3281 键，新增 5 键 en/zh 同补）、`size`（1491 文件 / 20 个 grandfathered，**未改基线**：两个测试文件的 describe 拆到 50 行以内，而不是去动基线）、`style`、`hardcoded`、`tokens`、`surfaces`、`deep-imports`、`escape`、`empty-catch`、`module-state` 全绿；`build` ＋ `vendor:check` 绿（`qrcode.react` 仍在懒加载边界内）。
- 局限（如实登记）：① 只读过 Chrome 的打印管线：`@page` 用打印机自己的纸型，Safari/Firefox 的 `break-inside`/`print-color-adjust` 行为未验证，真机出纸也没有真的打印过一张（只到 PDF 与栅格图）；② 表头 `Printed {time}` 用 `fullTime()`（`Intl`，随界面语言），**不带时区标注**——跨时区收件人读到那一刻的含义未定义；③ 这张表**不含**访问统计，它是另一个物件（SH-64 的 CSV 与登记不做的 PNG/PDF）；④ `qrcode.react` 仍只在分享中心那条懒加载闭包里（`vendor:check` 绿），sheet 没有为它再开一个边界；⑤ 门禁的 9 条断言里，「一个码一个格」用批处理条的选中条数做交叉读数——批处理条本身的计数若坏掉，这条会跟着坏（不静默放行，但失败会指向两处）；⑥ 本节修改了 `scripts/e2e-visual.mjs`，而该门禁在本机是**负载敏感**的：第 3 次（变异那次）在无关的思维导图场景 `Waiting for selector .mindmap-fullscreen-canvas .mindmap-canvas` 崩掉（同为 SH-90/SH-97 那一类），所以门禁级变异是通过**探针读同一事实**完成的，并经第二次完整门禁读数确认（见下）；⑦ 单元层的 4 个变异与门禁级的 1 个变异都是我一个人跑的，读数与命令都留在本节，可复跑。
