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
| 05 | P0 | #2 | 分享页静态内联样式 `maxWidth:'none'` 移入样式表 | 极小 | ✅ | f59fe6f3 |
| 06 | P0 | #17/#20 | worker 侧：日志 count+rows batch 化、页上限收紧、error 日志脱敏 | 小 | ✅ | 1137a1a4 |
| 07 | P1 | #15 | 全站累计 UV 全史聚合每次列表重算 | 小 | ✅ | ccf59cc3 |
| 08 | P1 | #16 | 集合列表 N+1（每集合 2 查询） | 小 | ✅ | 1420b12d |
| 09 | P1 | #10 | 访问日志无时间范围筛选 | 小 | ✅ | cc07284c |
| 10 | P1 | #9 | 渠道卡片不能下钻到该渠道明细 | 小-中 | ✅ | 60ea2026 |
| 11 | P2 | #6 | 链接变更无审计历史（新迁移 v43） | 中 | ✅ | af544225 |
| 12 | P2 | #7 | 失效提醒/通知（看板判定 + app_meta 已读） | 中 | ✅ | dd4c7334 |
| 13 | P2 | #13 | 集合成员自定义排序 | 中 | ✅ | 4f01068d |
| 14 | P2 | #14 | 手工精选集合 | 中-大 | ✅ | 09dcc17d |
| 15 | — | — | 全量回归 + 全部门禁收尾 | 小 | ✅ | 见收尾小节 |

## 明确不动 / 已知限制（审计结论，登记备查）

- 访问白名单（#8）：需求未明，YAGNI，暂缓
- 地图可视化（#12）：包体积预算压力，暂缓
- 列表虚拟化（#19）：服务端已 500 行截断兜底，无规模证据，登记为已知限制
- 安全面（token 熵/节流/指纹/CSP/Zod/CSV 注入）经审计合规，不重复劳动

## 进度日志

### 2026-09-25 · 序 15 · 收尾：全量回归与门禁终验

- 全量测试：`npx vitest run --config vitest.config.ts` → **473 文件 / 4294 通过 / 1 skipped（既有设计）/ 0 失败**。首轮全量抓到序 14 引入的裸控件违规（对话框笔记勾选用了原生 `<input type=checkbox>`，违反 SH-33），已换用组件系统现成的 `Checkbox` 后复跑全绿。
- 类型：`npx tsc -b --force` 通过。
- 静态门禁 12 项全绿：style / comments / size / hardcoded / tokens / i18n / empty-catch / escape / module-state / deep-imports / surfaces / vendor。
- 迁移守卫：`tests/schema-migrations.test.ts` 通过（本轮追加 v43 审计、v44 member_sort、v45 成员表/标题列，未触碰已应用迁移）。
- 交付小结：14 个提交（5a8ac75f…437ed4da），覆盖审计建议修复的 10 项中的 10 项；#18（/summary 聚合化）经核实为审计误报、#8/#12/#19 按计划缓办，依据均登记于对应序节。序 14 的裸控件修复与 demo 类型扩展漏提交部分由收尾后的 `437ed4da` 补齐（提交前工作区已核干净）。
- 交接备注：worktree `inkstone-share-improvement-codebuddy-hy4preview`（分支同名），合并方式由维护者决定；台账随最后一个提交（本序）入库。

### 2026-09-25 · 序 14 · P2 #14 手工精选集合（成员表 + 发布/公开页/对话框/demo 全链路）

- 方案：迁移 45 新增 `share_collection_members (collection_id, note_id, sort_order)`（note_id 索引）与 `share_collections.title`。`targetType: 'manual'`：target_value 存集合自己的 slug（不占用 folder/tag 的一址一页唯一索引），标题存 title 列。**成员是存储的选择、可见性仍是派生**——暂停/撤销某成员的分享即从页面消失，无需编辑集合；不拥有的 noteId 匹配不到任何分享（不计为错误）。发布为 `db.batch` 原子写（集合行 + 成员替换），上限 200 成员、须有标题与 ≥1 笔记；撤销级联删成员；所有者列表回读 title/targetType='manual'。公开页 manual 分支走专用成员语句（按存储顺序 + keyset 游标第 4 段 `#<sort_order>`，`t` 前缀表标题——encodeURIComponent 保证标题永不产生裸 `#`，无歧义）。发布对话框新增「手工精选」：标题输入 + 已分享笔记勾选列表（≤200，空态有文案）。
- 结构整改（体积门禁逼出，非无关重构）：demo `publishCollection`（62 行）拆出 `publishManualCollection`；对话框 `usePublishForm`（60 行）拆出 `publishBody`/`submitPublish`，`PublishFields`（52 行）拆出 `DerivedPickField`/`PolicyFields`；`collection-public.ts` 处理器（65 行）拆出 `resolveCollectionPage`（manual/派生两分支返回同构页）；`decodeCollectionCursor` 拆出 `applyCursorFourthField`。全部回到 50 行/3 层预算内，行为零变更。
- 回归：worker 新增 2 例（按存储顺序列出 + 暂停派生可见性 + 所有者列表回读 + 撤销级联；无标题/无笔记 400 + 不拥有者静默为空页）；迁移守卫通过；`tests/share-collections + share-routes + schema-migrations + src/client/features/share + src/client/demo` 共 **60 文件/440 用例全绿**；`npx tsc -b --force` 通过；全部门禁绿（体积基线 migrations.ts 679→700，迁移 45 固有增长）。
- 已知限制（如实登记）：UI 里手工集合不支持从行内「编辑」回填（打开空对话框重新创建；暂停/撤销在面板可用）——回填需要把成员读回对话框，属后续增强；游标按存储 sort_order，已发布集合重新勾选后旧光标退化页首（与 title 排序限制同族）。

### 2026-09-25 · 序 13 · P2 #13 集合成员排序（预设方案 + 分页适配）

- **方案变更（与计划差异，如实说明）**：计划提的「per-member sort_order + 拖拽」对派生集合（folder/tag）不可行——成员每次请求从 shares 派生，无成员行可挂 sort_order；存储的成员顺序会随成员变化静默失真；且 JSON 顺序列表与游标分页冲突。改为 **`share_collections.member_sort` 预设键**（迁移 44，`skipIfColumnExists` 照迁移 30 范式）：`default`（原顺序）/ `newest` / `oldest` / `title`，NULL = default，语义即「访客所见顺序的口径」，页/计数/所有者列表按构造一致。手工精选集（序 14）的成员表将带真实 `sort_order` 拖拽排序，两项合起来覆盖原审计诉求。
- 实现：`MEMBER_SORT_SPECS` 每个预设带自己的 ORDER BY 与 **keyset 游标谓词**（分页跟随排序；title 排序的游标扩展第 4 段 title，encodeURIComponent 转义分隔符，解码兼容旧 3 段光标）；发布接口/对话框（Select 下拉，文案即口径说明）与 owner 列表透传；demo 后端同构镜像（从 state.notes 取 updatedAt 排序）。
- 过程缺陷（被新测试当场抓住两次）：① 占位符索引起点算错（`binds.length - parts.length + 1` 应为 `+1`）；② 重复占位符（default 谓词 ?{p} 出现两次）被当多次绑定而 replaceAll 折叠到同一索引，以及映射用固定偏移而非 token 实际索引——两处都以临时插桩打印真实 SQL 定位后修复，`tests/share-collections.test.ts` 101 分页用例与 title 分页用例同时把守。
- 回归：新增 1 例覆盖三种断言（默认序保持、title 预设生效且重发布可改、游标分页跟随排序不重不漏 + owner 列表回读 memberSort）；17/17 全绿（一次 5s 超时为并行负载抖动，复跑通过）。`npx tsc -b --force` 与全部门禁绿（comments 白名单已同步）。体积基线 migrations.ts 667→679（迁移 44 固有增长，重拍）。pre-commit 的 vitest related 抓到 `share-collections-panel.test.ts` 断言缺 `memberSort`（对话框现在总是声明该字段），补齐后通过。
- 已知限制：title 排序下，owner 改排序后客户端手里的旧游标会退化为「接近页首」（可接受的边缘）。

### 2026-09-25 · 序 12 · P2 #7 过期链接提醒（看板判定 + 一次性忽略）

- 方案：**看板加载时判定**而非 cron——`GET /analytics/global` 读 `app_meta` 的 `share:expired-ack:<userId>` 时间戳，`expiredLinksStatement` 只取「过期于该时间戳之后」的分享（`COUNT(*) OVER()` 同读总数，每页 5 条）；`POST /analytics/expired-ack` 写入新时间戳。 dismissed 一次即对全部旧失效免疫，之后再次过期的链接会重新出现——语义与「提醒的是新发生的事」一致。**无 cron、无新表、无新绑定**（app_meta 单键），写频仅限用户点击。
- UI：`share-dashboard-expired-notice.tsx` 提醒卡（`role="status"`、warning 语义色、列出前 5 条 + 隐藏计数 + 剩余提示），两个动作：「不再提醒」→ ack 后刷新看板（失败保留提醒并 toast，重复 dismiss 无害）；「查看已失效分类」→ `setCategory('expired')` 交给 hub 既有分类视图。`expiredLinks` 在类型上可选，旧 fixtures 与 demo 不破坏。
- 结构整改（体积门禁）：analytics.ts 加过期逻辑后 552 行且路由函数 56 行——把滞留/过期两份「卫生报告」（statements + compose + 类型，约 110 行）整体抽到 `worker/routes/share/hygiene.ts`，analytics.ts 回到 457 行，路由处理器瘦身并提取 `loadGlobalAnalytics`。
- 回归：worker 新增 1 例（初次列出全部失效含排序、ack 后 acknowledgedAt 落库且列表清空）；SH-17a 往返账目更新（+1 次串行 = ack 戳读取）。128/128 全绿；`npx tsc -b --force` 与全部门禁绿（comments 白名单已同步）。

### 2026-09-25 · 序 11 · P2 #6 链接变更审计（迁移 v43 + 变更历史入口）

- **迁移 v43**：新表 `share_audit_log(id, user_id, note_id, slug, action CHECK(create/update/revoke/batch), changed_json, created_at)` + 两个索引；只追加不改 1–42。`tests/schema-migrations.test.ts`（幂等/版本单调）通过。tables.ts/indexes.ts/checks.ts（REQUIRED_TABLES/COLUMNS/INDEXES）同步登记。
- **隐私边界（计划承诺兑现）**：只记「改了什么」，不记 IP/UA；口令只记 set/cleared 布尔（`shareAuditDiff` 对 password 做存在性比较），密码值任何形式不入日志（测试断言 `audit-pass-1` 不出现在任何 JSON 里）。
- **写入层**：`worker/lib/share-audit.ts`——`shareAuditDiff`（纯函数，6 字段稳定顺序）+ `recordShareAudit`（批量插入，best-effort：append 失败不把已完成的 owner 写入变 500，catch + warn 并注释缘由，符合规则 2 例外）。
- **写入点**：① note.ts upsert → create/update 全字段 diff；② 撤销（单笔记 DELETE 与批量 revoke）→ 先读 slug 快照再删，事后记 revoke；③ 批量 enable/disable/expire/extend/move → 每 chunk 前读/后读快照 diff，出现即记（create/batch），无变化不记。
- **读取与 UI**：`GET /api/share/:noteId/audit`（最新 50 条，`ORDER BY created_at DESC, rowid DESC` 保证同毫秒确定性）；`share-audit-history.tsx` 区块嵌入单笔记分析弹层——四态（骨架/错误+重试/空/列表），字段与取值全 i18n，`audit_truncated` 说明截断。
- 回归：worker 4 例（create/update diff 与口令脱敏、batch 单字段前后值、revoke 在行删除后仍记 slug、读取端点倒序）；client 3 例（空态、英文 locale 下 diff 行「Slug: old → new / Access passcode: Set → Cleared」、失败→重试恢复）。相关 5 文件 142/142 全绿。体积基线仅 migrations.ts 646→667（迁移文件固有增长，属有意变更后重拍）。`npx tsc -b --force` 与全部门禁绿。
- 已知限制：审计写入与业务写入非同一事务（best-effort 取舍，失败有 warn 日志）；`folder_id` 变更显示原始 id 而非文件夹名（诚实优先，暂不引入名称解析）。

### 2026-09-25 · 序 10 · P1 #9 渠道卡片下钻到该渠道明细

- 方案：**不扩 `VisitLogFilter` 词表**（那会波及 `visitMatchesLogFilter` 与 demo 镜像的谓词），新增独立 `channel` 查询参数与维度：`@shared/share-channel` 新增 `parseChannelDrillDown`，保留名映射到列语义（`__unmarked__`→`IS NULL`、`__unrecognized__`→`=''`）、合法 token 映射自身、畸形名 `invalid`。worker 对 invalid 显式 400（「畸形渠道静默返回全部行」= 看起来像该渠道发了全部流量）；demo 后端同构镜像。占位符编号在 IS NULL 分支不消耗 bind，保持 D1 位置绑定对齐。
- 前端：看板渠道拆分卡每行变为原生 `<button>`（键盘可达 + `focus-visible` 描边 + aria-label），经 `ShareHubViewProps.onOpenChannelLogs` → hub 打开日志弹层并预置 `initialChannel`；日志工具条出现可移除的渠道 chip（`channel_filter_chip`，aria 文案齐全）。CSV 导出同步携带 channel。
- 回归：worker 新增 1 例（token/unmarked/unrecognized 三种取值 + 畸形 400）；client 新增 1 例（下钻→浏览与导出请求带 channel→清除后不发），ExportProbe 扩两个动作按钮。相关 6 个测试文件 141/141 全绿。
- 结构整改（体积门禁）：渠道两 handlers 并入 `useVisitLogRefetchHandlers`；导出测试 describe 再拆（时间窗口/渠道各一个）。`npx tsc -b --force` 与全部门禁绿（comments 白名单已同步）。
- 已知限制：下钻 chip 的标签用 `localizeChannelName`，collection 渠道在 worker 侧才解析得出标题，chip 里只显示 token 本身（与拆分卡降级行为一致）。

### 2026-09-25 · 序 09 · P1 #10 访问日志时间范围筛选

- 方案：`GET /visits` 新增 `range` 参数，复用分析面板的 `24h/7d/30d/all` 词表（`getRangeStartTimestamp`），两处口径统一；**未知 range 显式 400**（与日志 filter 的处理一致，不做 analytics 那种静默回退 30d）；缺省 = all，保持既有调用方行为不变。条件 `sv.visited_at >= ?` 走既有 `(user_id, visited_at DESC)` 索引，无需新索引。
- 前端：日志工具条新增时间范围 `Segmented`（复用 `rangeOptions()`），hook 新增 `range` 状态与 `handleRangeChange`；CSV 导出同步携带 range（`all` 不发参，保持端点旧形态）。新增文案 `share.logs_range_label`。
- 回归：worker 侧新增 1 例（24h 只见近访、缺省全量、未知 400）；client 侧新增 1 例（选 7d 后导出请求带 range、切回全部后不发）。相关 5 个测试文件 138/138 全绿。
- 结构整改（体积门禁要求）：`useShareVisitLogs` 加 range 后超 50 行——拆出 `useVisitLogQueryState`（查询状态）与 `useVisitLogRefetchHandlers`（改维度→回第一页）两个子 hook；`registerShareVisitsListRoute` 语句对拆出 `visitLogPageStatements`；导出测试 describe 一拆为二。均无行为变更。
- `npx tsc -b --force` 与全部门禁绿（comments 白名单已同步）。

### 2026-09-25 · 序 08 · P1 #16 集合列表去 N+1（2N 次往返 → 2 次）

- 方案：`share_collections` 列表查询直接 LEFT JOIN 文件夹/标签带出 `target_name`（提取 `collectionTargetNameJoin/Select` 片段，与渠道标签查询共用一份 JOIN 定义，防两处口径分叉）；成员数改为「每集合一条 count 语句 + 一次 `db.batch`」。往返从 2N（N≤20 → 40 次）降到 2 次；**count 语句本身一字未改**（仍走 `collectionMemberCountStatement` 的共享成员规则），计数语义按构造等价；「count 现读不存储」的行为不变。
- 过程缺陷：新 round-trip 用例首跑暴露测试插桩的 wrapper 缺 `run`（harness 的 batch 逐语句调 run），补齐后通过——插桩结构对齐 share-routes 的 `instrumentRoundTrips`。
- 回归：`tests/share-collections.test.ts` 新增 1 例（2 folder + 1 tag 集合，断言 title/count 正确且 direct=1、batch=1），16/16 全绿；`npx tsc -b --force` 与 12 道门禁绿（comments 白名单已同步）。

### 2026-09-25 · 序 07 · P1 #15 全站 UV/Views 聚合的 app_meta 短 TTL 记忆

- **方案变更（与计划的差异，如实说明）**：计划选 per-isolate `Map` 60s 缓存，但 `scripts/check-module-state.mjs` 明确禁止 worker 模块级可变集合（防跨请求数据泄漏），为缓存开豁免等于绕门禁。改为 **`app_meta` 键值短 TTL 记忆**：键 `share:filtered-stats:<userId>:<fnv1a(clause)>`，值 `{v,u,at}` JSON，TTL 60s。新鲜路径只多一次单行 PK 读、省掉整史聚合；过期路径照旧聚合并回填（`setMeta` 的 `WHERE value IS NOT excluded.value` 天然去重写）。跨 isolate 生效，写频 ≤1 次/分钟/账号，副作用可控；「脚注本就不是实时口径」的权衡不变。
- 涉及：`global-stats.ts`（键构造/编解码/纯函数解析，可注入时钟）、`shares.ts`（list 与 /stats 两条路由改为条件化 batch：命中则 3 条语句，未命中 4 条并回填）；`QUERY_COUNT_FOR_LIST_ROWS` 常量随动态 batch 移除。
- 过程缺陷（已被新测试抓住）：首版把缓存命中路径的 filtered 值传成 null，导致脚注显示 0——集成用例「命中后仍为 2」当场变红，修复为 `cachedFiltered ?? 批内聚合`。
- 回归：新增 `tests/share-global-stats-cache.test.ts` 5 例（往返、窗口边缘、时钟回拨、坏数据当 miss、键按账号+流量子句隔离）；`share-routes.test.ts` 新增 2 例集成（命中→新访问不计入→过期后重算+1；不同 excludeBots 各自记忆），并更新 SH-72/SH-17a 两例 round-trip 账目（新增的 1 次串行读即 memo 读，注释说明）。121/121 全绿；`npx tsc -b --force` 与全部 12 道门禁绿（comments 白名单已同步）。
- 已知限制：60s 窗口内新访问不进脚注（与看板 KPI 的口径差异属于设计）；不同 excludeBots 组合各占一条 app_meta 键（上限 8 条/账号）。

### 2026-09-25 · 序 06 · P0 #17/#20 worker 侧小修（含 #18 审计结论修正）

- **#18 结论修正（如实登记，不改代码）**：原审计判 `/summary` 无界返回为问题、建议改聚合计数。落地前核实 `src/client/features/share/share-store/loaders.ts`（SH-19 启动预取）与 `row-index.ts` 的 `isNoteShared`——客户端确实需要 `sharedNoteIds` **集合本身**做任意笔记的「是否已分享」判定，聚合成计数会破坏公共契约；且该请求仅启动期一次、有并行合并与「列表加载后不再调用」的既有护栏。故按「禁止静默脑补/公共契约走 deprecation」原则不改动，登记为审计误报。
- **#17**：`visits.ts` 的 count+rows 两条同过滤查询合并进一次 `db.batch`（省一次串行往返）；`VISITS_PAGE_MAX` 1,000,000 → 10,000（最坏 OFFSET 从九位降到五位数级；100/页的分页遍历与 CSV 导出步进均不受影响）。
- **#20**：`public.ts` 访问记录失败与 `shares.ts` 标签解析失败的 `console.warn` 改记 `errorMessage(error)`（新增于 `worker/lib/errors.ts`），原始 error 对象可能携带语句形状与绑定值，不再进日志。
- 回归：`tests/share-routes.test.ts`（真实 D1 基座）新增 1 例「count+page 一次 batch 往返」并用 `instrumentRoundTrips` 钉住 round-trip 账目（batch=2/direct=2，其中各 1 次属读预算），wild-page 用例补 `page===10_000` 钉住新上限；114/114 全绿。`npx tsc -b --force` 与全部门禁绿（comments 白名单已同步）。

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
