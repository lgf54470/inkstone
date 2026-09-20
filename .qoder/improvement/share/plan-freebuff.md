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
| 03 | A | SH-79 | 日志 CSV 未做 RFC 4180 转义 + 无公式注入防护 | 极小 | ✅ | ⏳ 下项回填 |
| 04 | A | SH-84 | 自定义 slug 报错文案写 "3-64 chars"，实际 6–64 | 极小 | ⬜ | |
| 05 | A | SH-80 | `loadTopNotes` 查笔记标题不带 `user_id` | 极小 | ⬜ | |
| 06 | A | SH-82 | 日志接口下发完整指纹 + SELECT 从不返回的 `user_agent` | 极小 | ⬜ | |
| 07 | A | SH-71 | 两个 analytics hook 无 abort/epoch → 慢请求覆盖新请求 | 小 | ⬜ | |
| 08 | A | SH-55 | 首屏 `isLoading` 时 KPI 全渲染 0（缺"加载中"态） | 小 | ⬜ | |
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
- 局限（如实登记）：`markdown/table-editor.ts` 的 `tableToCsv()` 与 `blog-links-view/link-import-export-modal.tsx` 的 `generateCsv()` 是同类 CSV 写入点、同样未做转义/中和，本项按「不顺手改无关模块」只记录不修改，另立条目跟踪。`URL.revokeObjectURL` 紧跟 `a.click()` 调用在部分浏览器上可能打断下载，同样登记为后续条目。全量串行回归放在批次 A 收尾。
