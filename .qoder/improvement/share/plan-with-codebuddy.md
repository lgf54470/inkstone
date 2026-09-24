# 分享中心修复台账（share-codebuddy-hy4preview）

- 来源：本轮对话产出的《分享中心完整分析报告》（22 项发现，10 项建议修复）+ `create_plan` 生成的执行计划
- 起点：`dev@cc09e4b3` ｜ 分支：`share-improvement-codebuddy-hy4preview`
- 工作区：`/home/kubuntu/code/cloudflare/inkstone-share-improvement-codebuddy-hy4preview`（主仓库不落改动；`node_modules` 软链主仓库）
- 上一轮台账：`.qoder/improvement/share/plan-freebuff.md`（SH-49…SH-85）、`plan.md`、`review.md`、`review-round2.md`
- 约定：**一项 = 一个原子提交**；每次提交同步更新本文件（勾选、回填 hash、追加进度日志）；修 bug 先写复现测试（先红后绿），守卫型改动如实标注「修复前后均绿」，并做缺陷回改变异验证

## 回归与验证标准（用户确认：标准强度）

- 类型：`npx tsc -b --force`（`npm run typecheck` 复用 build info 会假秒过）
- 定向测试：`npx vitest run --config vitest.config.ts <相关文件>`（本机并行会假超时，必要时 `--no-file-parallelism`）
- 全量收尾：`npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000`
- 静态门禁：`style:check`、`comments:check`、`size:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`empty-catch:check`、`escape:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`vendor:check`
- 提交：`.githooks/pre-commit` 必过，**禁止 `--no-verify`**；只 `git add <本项文件>`，绝不 `git add -A`
- 工作区纪律：提交前 `git status --porcelain` 核对；不动 lockfile / `node_modules`

## 范围红线

- 只改分享中心相关文件与最小必需的共用面；`blog-frontend/` 不动
- 不修改已应用 migration（只追加）；不碰历史台账文件内容
- 不做无关重构/格式化/依赖升级；不引入新 npm 依赖
- 不改判定为合规的安全实现（`public.ts` work-budget 前置顺序、枚举防护文案、指纹盐、CSP、CSV 注入防线）

## 队列

> hash 回填约定：提交无法引用自身 hash，故「第 N 项」的 commit 列由**第 N+1 项的提交**回填（表中 ⏳ 表示待回填）。
> 状态图例：✅ 已交付 · 🟡 部分交付（缺口写在对应小节）· 🛑 阻塞/回退 · ⏸ 暂缓

| 序 | 批次 | 编号 | 标题 | 代价 | 状态 | commit |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | — | — | 落盘本台账 + worktree 建支软链 | 极小 | ✅ | 未含代码改动 |
| 02 | P0 | #4 | 访问日志表失败态缺失（违反禁止静默失败红线） | 小 | ✅ | 5a8ac75f |
| 03 | P0 | #1 | 访问日志 CSV 表头硬编码英文 | 小 | ✅ | 7adb7e2c |
| 04 | P0 | #3 | 随机 slug 用 Math.random（非 CSPRNG） | 极小 | ✅ | 4d8d091d |
| 05 | P0 | #2 | 分享页静态内联样式 `maxWidth:'none'` 移入样式表 | 极小 | ✅ | ⏳ |
| 06 | P0 | #17/#18/#20 | worker 侧：日志 count+rows batch 化、页上限收紧、`/summary` 聚合化、error 日志脱敏 | 小 | ⬜ | — |
| 07 | P1 | #15 | 全站累计 UV 全史聚合每次列表重算 | 小 | ⬜ | — |
| 08 | P1 | #16 | 集合列表 N+1（每集合 2 查询） | 小 | ⬜ | — |
| 09 | P1 | #10 | 访问日志无时间范围筛选 | 小 | ⬜ | — |
| 10 | P1 | #9 | 渠道卡片不能下钻到该渠道明细 | 小-中 | ⬜ | — |
| 11 | P2 | #6 | 链接变更无审计历史（新迁移 v43） | 中 | ⬜ | — |
| 12 | P2 | #7 | 失效提醒/通知（看板判定 + app_meta 已读） | 中 | ⬜ | — |
| 13 | P2 | #13 | 集合成员自定义排序 | 中 | ⬜ | — |
| 14 | P2 | #14 | 手工精选集合 | 中-大 | ⬜ | — |
| 15 | — | — | 全量回归 + 全部门禁收尾 | 小 | ⬜ | — |

## 明确不动 / 已知限制（审计结论，登记备查）

- 访问白名单（#8）：需求未明，YAGNI，暂缓
- 地图可视化（#12）：包体积预算压力，暂缓
- 列表虚拟化（#19）：服务端已 500 行截断兜底，无规模证据，登记为已知限制
- 安全面（token 熵/节流/指纹/CSP/Zod/CSV 注入）经审计合规，不重复劳动

## 进度日志

### 2026-09-25 · 序 05 · P0 #2 分享页内联样式移入样式表

- 方案：照 `.wiki-hover-body .ink-prose` 的既有范式，公开分享页根节点加 `share-public` 作用域类，`content.css` 增 `.share-public .ink-prose { max-width: none; }`，`page.tsx` 删掉静态内联 `style={{maxWidth:'none'}}`。计算样式不变（作用域规则 0,2,0 胜过 `.ink-prose` 的 0,1,0）。
- 验证边界（如实说明）：CSS 级联无单测断言手段；本项为纯样式来源合规重构，`npx tsc -b --force` 与 10 道静态门禁全绿，视觉回归依赖既有 `scripts/e2e-visual.mjs` 场景（本轮未跑浏览器级，收尾时一并跑）。

### 2026-09-25 · 序 04 · P0 #3 随机 slug 改 CSPRNG

- 方案：`share-helpers.ts` 的 `generateRandomSlug` 改用 `crypto.getRandomValues`，字符集（30 字符）与位数（6）不变；按「最大 30 倍数以下字节才采值」的拒绝采样消掉取模偏置。服务端 `worker/lib/id.ts` 的 newSlug() 本就合规，未动。
- 回归：新建 `share-random-slug.test.ts` 4 例——断言只走 crypto 不走 Math.random、200 次抽样字符集/长度合规、固定字节序列验证无偏映射与 ≥240 拒绝、整批被拒后继续补抽。变异验证：临时改回 `Math.random` 实现 → 4 例中 3 红，恢复后全绿。`npx tsc -b --force` 通过，全部门禁绿（含 comments 白名单同步）。

### 2026-09-25 · 序 03 · P0 #1 访问日志 CSV 表头 i18n

- 方案：`share-helpers.ts` 的 `exportVisitsToCsv` 表头 13 项全部改走 `t('share.export_col_*')`，键名对齐看板导出既有命名（`export_col_section/item/value` 同族）；`Channel` 仍保持最后一列（ADR-0004 位置兼容注释保留）。`{zh-CN,en-US}/share-2.ts` 各补 13 键。
- 回归：`share-visit-logs-csv.test.ts` 既有 5 例改按键断言；新增双语守卫 describe（zh-CN 得「编号/时间/笔记标题…」、en-US 得「ID/Time/Note Title…」），防止英文表头回流。相关 4 个导出测试文件 34 例全绿；`npx tsc -b --force` 通过；`i18n:check`、`comments:check`（白名单同步）、`size:check` 等门禁全绿。
- 已知限制（如实登记）：Type 列的数据值（`Bot (…)/Author/Self/Real`）与仪表盘导出的部分数据值仍为英文常量——那是「数据值」而非「表头」，两处口径改动会波及既有按位置读文件的脚本，本次不夹带（铁律 14），登记为后续候选。
- 插曲：往 locale 文件插键时重复带上了 `export_col_section/value` 导致 TS1117，已删重复并复查两语言文件。

### 2026-09-25 · 序 02 · P0 #4 访问日志三态（失败/加载/空/数据）

- 方案：沿用看板既有的三态范式。`use-share-visit-logs-modal.ts` 的 `fetchVisitsFlow` 失败时 `setData(null)` + `setError(true)`（并保留 `console.warn`，去掉了唯一的 toast——由界面自己负责反馈）；弹层按 error / loading / empty / data 四分支渲染，错误态复用 `LoadErrorState`（`role="alert"` + 重试），加载态用五行 `Skeleton` 骨架，空态文案不变。
- 涉及：`use-share-visit-logs-modal.ts`、`share-visit-logs-modal.tsx`、`share-visit-logs-table.tsx`（新建）、`share-visit-logs-error-state.test.ts`（新建）、`{zh-CN,en-US}/share-2.ts`（新增 `share.logs_load_failed`）、`scripts/check-comments.mjs`（白名单）。
- 结构整改（体积门禁逼出来的，非无关重构）：老的 `share-visit-logs-modal.tsx` 加了错误分支后 523 行 / 顶层函数为 51 行，超 AGENTS.md 的 500 行与 50 行预算。把日志表格（表头、行、五个单元格、类型徽标、`deviceIcon`、骨架）原样迁到 `share-visit-logs-table.tsx`，弹层标题的计数块提成 `VisitLogsTitle`，两项都回到预算内，行为零变更。
- 回归：`npx vitest run --no-file-parallelism src/client/features/share` → **52 files / 257 tests 全绿**（改动前后均绿，属守卫型 + 新增用例）；`npx tsc -b --force` 通过；门禁 `size:check`、`style:check`、`comments:check`、`empty-catch:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`deep-imports:check`、`escape:check`、`module-state:check` 全绿。
- 变异验证（先红后绿已在写完用例后补做）：把 `bundle.error ?` 改成 false、把 `isLoading ?` 骨架分支改成 false 后，4 个用例中 3 个变红，改回后全绿。
- 遗留观察：该 hook 仍无 abort/epoch（多次快速切页慢请求竞态），属 SH-71 之外的另一条，本次未扩大范围，登记待定。

### 2026-09-25 · 序 01 · worktree 与台账落地

- `git worktree add -b share-improvement-codebuddy-hy4preview` 到指定目录，基线 `cc09e4b3`
- `node_modules` 软链主仓库（避免重复 `npm ci`）
- 基线抽检：`share-visit-logs-csv.test.ts` 5 passed（改动前绿）
- 本文件新建
