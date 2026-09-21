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
| 25 | D | SH-73 | 列表访客统计缺覆盖索引 + tags `LIKE '%"x"%'` | 中 | ✅ | ⏳ 下项回填 |
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
| SH-89 | `src/client/features/blog/blog-dashboard-view/*` + `components/dashboard-blocks.tsx` | 与 SH-55 同类：博客看板首次加载时 KPI 也把 `null` 画成 0（共用 KpiCard），同样没有加载态 | 与 SH-55 同法加 `isLoading` 分支；若要共用则给 KpiCard 加可选 loading 属性，并跑 blog 侧回归 |
| SH-90 | `scripts/e2e-visual.mjs` 的「slides editor: space and a drag pan the view」 | 同一份代码、同一实例连跑三次得到两种结果（1 绿 2 红，失败时 `scrollLeft` 停在 0），失败都在机器被另一条线程的浏览器门禁占满时出现——断言本身对环境负载敏感 | 定位后加大等待/改用「等到滚动量变化」的等待，而不是固定 sleep；不要靠重跑掩盖 |
| SH-91 | `src/client/features/workspace/workspace/workspace-views.tsx`（`workspace.share`）与 `src/client/features/sidebar/*`（`navigation.share`） | 两个入口在 zh-CN 下同名「分享」却通到不同表面：工作区头部按的是「单条笔记的分享设置」，侧栏按的是分享中心；当没有激活笔记时 `app-shell` 又把 `panel='share'` 回退成分享中心，于是同一个按钮在两种状态下打开两个不同表面 | 区分文案与图标（如「分享这条笔记」/「分享中心」），并把无激活笔记时的回退显式化（或在无笔记时禁用该按钮） |
| SH-94 | `src/client/lib/i18n.ts` 的 `initI18n()`（`void ensureLocaleLoaded(other)`） | 预加载另一语言是个**没有 catch 的游离 Promise**（AGENTS 铁律 2）：机器被占满时那个动态 import 会 reject，变成 vitest 的 `Errors 1` 并把退出码变成非 0——第 11 项第一次提交就是这样被 pre-commit 钩子拒掉（同一命令重跑即绿，实测 1176/1176 + 无 error） | 按铁律 2 给这个 best-effort 预加载加 catch ＋ 注释（必要时 `console.warn` 最低级别日志），使其失败不影响调用方；CI 里也可考虑 `dangerouslyIgnoreUnhandledErrors` 以外的显式处理 |
| SH-93 | `src/client/components/hub-folder-row.tsx`（内含 `role='button'` + `tabIndex` 的 div、`FolderMoreButton`）、`components/hub-tag-item.tsx`（`TagMoreButton`、`TagExpandAffordance`）、`components/overlay/submenu.tsx`（`RowButton` 之外的裸按钮） | SH-49 只清了 `features/share`，而它用的共用组件里还有同类写法——包括 AGENTS 铁律 10 明禁的「`div` ＋ `onClick` ＋ `role='button'` 假冒控件」（`FolderRow`/`HubTagRow` 的行本体是 `div role='button'`） | 把 SH-49 的守卫正则从 `features/share` 扩到 `src/client/components` 与其它 feature（分文件开口子、每个口子写理由），再逐处收；`div role='button'` 的行本体应换成真 `button` 或用项目组件，并补键盘路径回归 |
| SH-95 | `src/client/features/blog/blog-traffic-filter-popover.tsx` | SH-50 的同源孪生：博客看板的流量过滤面板同样是 `absolute right-0 top-full w-80`（320px）＋ 无 role、无名字的 `<div>`、打开/关闭都不动焦点，窄屏上会被推出视口。它现在可以直接复用已经抽出来的 `components/popover-placement.ts` | 按 SH-50 的做法整体迁移（portal ＋ `role='dialog'` ＋ 焦点入/还 ＋ 共用定位），跑 blog 侧回归；它属 blog 自己的范围，不在本轮 share 红线内 |
| SH-96 | `src/client/lib/markdown/kanban/ui/*`（`kanban-date-picker`/`kanban-column-menu`/`kanban-sort-popover`/`kanban-tag-picker`/`kanban-view-options`/`kanban-filter-popover`/`kanban-item-detail` 共 6+1 处）、`src/client/lib/markdown/slides/ui/slides-topbar.tsx`（2 处） | `absolute right-0/left-0 top-full` 这种自定位浮层在仓内仍是主流写法（分享中心本轮清完后还剩这些），且没有任何门禁要求它们走 `usePanelPlacement`——同样的窄屏裁切缺陷可以再长出来 | 先定一个门禁边界（允许清单 ＋ 理由）：新写的自定位浮层必须走 `components/popover-placement.ts`，已有清单分批迁移；或给一个统一的 `Popover` 原语把这些都收进去 |
| SH-99 | `scripts/e2e-visual.mjs` 的 `LABELS.share*` 与 `scripts/check-contrast.mjs` 的 `SHARE_LABELS` | 两个门禁各自保存了同一套「分享中心」文案对（打开同一个表面、按同一个控件），一旦一侧改了文案另一侧会以「找不到控件」失败而告终 | 把那两个打开器（含文案对与定位规则）提到 `scripts/e2e-harness.mjs`，两个门禁共用一份；顺便把 `openShareHub` 的手机路径也一并收进去 |
| SH-100 | `scripts/check-contrast.mjs` 的 `openMusicHubList` | 在 `scripts/e2e.mjs` 刚跑过（177/0）的全新临时实例上，该门禁停在「找不到 `列表视图/List view`」而崩掉；本轮把分享中心表面排在它前面、后面都试过，两次同样崩在这里，而分享中心表面在跳过这三个音乐表面后在两套主题下都能跑完并全绿。未确认是本机音乐种子缺失还是门禁与种子之间的隐式契约 | 先弄清该门禁对音乐库前置数据的真实依赖（种子里是否真有可播放曲目），再决定是让门禁自行备好前置数据、还是把它标为需要预置实例 |
| SH-98 | `src/worker/routes/blog/stats.ts`（`viewsPerDay: Math.round(views / daysSpan)`）、`src/client/features/blog/blog-dashboard-view/index.tsx` | SH-56 的博客倒影：同样是整数取整的日均值（24h 区间下等于总 PV）且同样把 `sparklineViews` 画在日均卡上（与总访问量卡同一条线）；博客侧还有 `sparklineViews = timeline.slice(-7)` 的隐式截断 | 把 `perDayRate()` 与 `viewsPerDayDelta` 同样接到 blog 的 compose 上（worker 侧共用 `computeDelta` 已有），日均卡去掉重复 sparkline；属 blog 自己的范围，不在本轮 share 红线内 |
| SH-97 | `scripts/e2e-visual.mjs` 的思维导图场景（`the node is selected before it is deleted`、`deleting the selected node leaves the note`、`undo kept the same instance`、`alt+arrow reorders the node in the note`、`reordering kept the same instance`） | 与 SH-90 同性质：同一份产品代码在一小时内的两次门禁里一次 5/5 全绿、一次 5/5 全红（失败读数都是「实例没被复用」`same:false`），而机器当时被另一条线程的浏览器门禁占满；这些断言现在直接拿实例身份/选中态当判据，没有等待窗口 | 把「等库自己把状态写下去」这层写进断言（如等 `selected` 类/等实例身份稳定），或在判失败前带上一次显式重试；不要靠重跑掩盖 |
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
