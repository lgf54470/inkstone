# 分享中心（share）复评报告 · 第二轮

- 审查日期：2026-09-21
- 起点：`dev@579bdf25`（工作区干净）
- 上一轮：`.qoder/improvement/share/review.md`（SH-01…36，2026-09-19）+ `plan.md`（含追加的 SH-37…48 与 H1…H10）
- 审查范围：`src/client/features/share/**`（71 文件、≈9.4k 行，其中 23 个测试）、`src/worker/routes/share/**`（12 文件、1982 行）、`src/worker/lib/share-analytics.ts`、`src/worker/lib/visit-aggregates.ts`、`src/worker/lib/maintenance.ts`、共用面 `components/dashboard-blocks.tsx` / `components/big-svg-chart.tsx` / `features/sidebar/sidebar/count-badge.ts`、门禁 `scripts/e2e.mjs` / `e2e-visual.mjs` / `check-contrast.mjs` / `check-surface-coverage.mjs` 与 `tests/share-*.test.ts`
- 方法：逐文件读码 + 对照 AGENTS.md 逐条核规 + 与上一轮台账做**差分复评**（只登记仍然成立与新发现的问题）+ 一次本地 `node:sqlite` 内存库实验（验证 NaN 绑定行为）
- 严重度：P0 必现故障/数据与安全 · P1 高 · P2 中 · P3 打磨
- 代价：极小 <1h · 小 ≤半天 · 中 1–3 天 · 大 ≥1 周
- 证据标记：`[实测]` 有可复现读数 · `[代码]` 读码可判定 · `[推断]` 需 profiling 或浏览器才能定量

## 编号说明（与首轮口头报告的映射）

本轮**不复用** SH-37…48（已被上一轮追加占用：T=SH-37 色令牌、H1=SH-39、H3=SH-41、H4=SH-42、H5=SH-43、§50=SH-46、§51=H10/SH-48），因此从 **SH-49** 续号，共 37 条（SH-49…SH-85）。映射如下：

| 首轮口头号 | 本轮号 | 首轮口头号 | 本轮号 | 首轮口头号 | 本轮号 |
| --- | --- | --- | --- | --- | --- |
| SH-37 | SH-49 | SH-47 | SH-59 | SH-59 | SH-71 |
| SH-38 | SH-50 | SH-48 | SH-60 | SH-60 | SH-72 |
| SH-39 | SH-51 | SH-74 | SH-61 | SH-61 | SH-73 |
| SH-40 | SH-52 | SH-50 | SH-62 | SH-62 | SH-74 |
| SH-41 | SH-53 | SH-51 | SH-63 | SH-63 | SH-75 |
| SH-42 | SH-54 | SH-52 | SH-64 | SH-64 | SH-76 |
| SH-43 | SH-55 | SH-53 | SH-65 | SH-65 | SH-77 |
| SH-44 | SH-56 | SH-54 | SH-66 | SH-66 | SH-78 |
| SH-45 | SH-57 | SH-55 | SH-67 | SH-67 | SH-79 |
| SH-46 | SH-58 | SH-56 | SH-68 | SH-68 | SH-80 |
| — | — | SH-57 | SH-69 | SH-69 | SH-81 |
| — | — | SH-58 | SH-70 | SH-70 | SH-82 |
| — | — | — | — | SH-71 | SH-83 |
| — | — | — | — | SH-72 | SH-84 |
| — | — | — | — | SH-73 | SH-85 |

---

## 一、总体结论

上一轮的 36 条（+追加 12 条）绝大多数已落地并带回归测试，本轮只登记**仍然成立**与**新发现**的问题。复评后的判断：

1. **架构与安全基线健康，不需要动**：口令 scrypt + 常量时间比较、管理端点全部按 session `userId` 收口、share 侧 SQL 全绑定且 `escapeLike` 全覆盖、公开访问有 view budget 与失败锁定、指纹盐已走 per-owner HMAC、`share_visits` 有保留期 + 孤儿清扫 + 撤销级联、`range` 已白名单化且 `all` 改走 SQL 聚合。
2. **问题性质变了**：不再是"缺规则"，而是**口径与状态的一致性**——看板与列表/侧栏的口径没有单一真相源（SH-52/54/56）、分析请求没有竞态防护（SH-71）、加载态与错误态不对称（SH-55）、列表与网格实现质量不一致（SH-59）。
3. **最结构性的一条**：整个分享中心 UI **在浏览器级门禁之外**（SH-85）——`e2e-visual.mjs` / `check-contrast.mjs` 覆盖侧栏、命令面板、设置、演示、导图，唯独没有分享中心；`e2e.mjs` 只打分享 API；`check-surface-coverage.mjs` 的名单里没有 hub（它是 `<Modal>`，不是 `fixed inset-0`）。结论是：hub 从未跑过 axe，`accent-soft` 上的文字层级对比度从未被量测，键盘路径无人守——本报告所有 UI 断言都只是读码推断。
4. **一条必现故障**：`GET /api/share/visits?page=abc` → 500（SH-78，[实测]）。
5. 规模指标健康：`features/share` 无文件进 `check-size` 基线；`share-dashboard-view.tsx` 468/500 行是最大的"最后一格"风险（SH-60）。

---

## 二、截图现象 ↔ 当前源码对照

首轮截图里的 5 个现象，当前源码已修掉 3 个（另有 1 个在现码下不可能出现），逐条给证据：

| 截图现象 | 当前源码 | 判定 |
| --- | --- | --- |
| 7d 窗口 PV=0，趋势图仍有 1/1/1/0 刻度与"数据线" | `components/big-svg-chart.tsx`：`if (!values.some((v) => v > 0)) return <ChartEmptyState emptyLabel={emptyLabel} />` | **已修**（SH-29 轮次） |
| 「设备与操作系统」卡只剩两个小标题 | `share-dashboard-view.tsx` 的 `DevicesBreakdownCard` 已有 `devices.length === 0 && osList.length === 0` 的 `EmptyRow` 分支 | **已修**（SH-29 轮次） |
| PV=0 卡上仍显示「↗ 0%」 | `components/dashboard-blocks.tsx`：`delta === 0` 走 `Minus` + `text-[var(--text-tertiary)]` | **已修**（SH-29 轮次） |
| 全零状态下仍显示「已自动过滤 0 次爬虫、0 次自引荐与 0 次作者自身访问」横幅 | `share-dashboard-view.tsx`：`{totalFilteredCount > 0 && <FilterSummaryBanner bundle={bundle} />}` | **现码不可能出现**；截图早于该门槛 |
| 「实时访问日志」出现 14 天前记录 | `recentVisitsStatement` 已带 `startTs`；文案键 `share.realtime_stream` 已改为「最新 20 条访客记录 / Latest 20 visits」 | **已修**（SH-28 轮次；仍是一次性快照，见 SH-65） |
| 侧栏部分分类没有计数徽标 | 仍在：不是"0 被隐藏"这么简单——`globalStats` 根本不统计 password/expiring/permanent 三类 | **未修**（SH-52） |

> 结论：截图对应的构建早于当前 `dev`。复评的每一条都以下列台账为准，不以下列以外的截图读数为准。

---

## 三、问题台账

### A. UI / 交互 / 规范

#### SH-49 [P1][代码] 裸 `<button>` 绕过组件体系，而门禁只覆盖表单控件

- 现象：分享中心内大量交互控件是手写 Tailwind 的裸 `<button>`，违反 AGENTS 铁律 10（"所有交互元素使用项目 UI 组件库或项目内自定义组件，禁止绕过组件体系写裸样式控件"）。
- 根因：`tests/share-bare-controls.test.ts`（SH-33 轮次留下的守卫）用的正则只有 `<(?:input|select|textarea)`，**不覆盖 `button`**，所以门禁全绿不等于合规。具体站点：`share-dashboard-view.tsx`（`TopNoteRow` 的 chevron，名字只有 `title`；`RecentActivityCard` 的「查看全部访问日志」）、`share-hub-sidebar.tsx`（`CategoryList` 的分类行、`SidebarSection` 的折叠切换）、`share-visit-logs-modal.tsx`（`FilterTab`）、`share-item-common.tsx`（`PinStarButtons`、`CopySlugButton`、`MoveFolderSubmenu` 行——12px 图标、24–28px 命中区、只有 `title` 当可访问名）、`share-note-submenu.tsx`（整个手搓面板）。
- 修改方案：逐处换 `IconButton` / `Button` / `Menu`（`Menu` 已支持 `submenu`，`share-note-submenu` 的面板可以整体退役到 `buildShareMenuItems`）；新增守卫 `tests/share-bare-buttons.test.ts`（allowlist：公共只读页 `share-page/page.tsx`，它是访客侧页面，不在管理中心范围内）。
- 涉及范围：6 个生产文件 + 1 个新测试。代价：中。
- 建议：守卫与修复同批提交（先红后绿），并在守卫里扫描整个 `features/share`，避免只修一处。

#### SH-50 [P1][代码] 流量过滤浮层：无焦点管理、无 role、窄屏被裁切

- 现象：`share-traffic-filter-popover.tsx` 用 `useClickOutside` + `useEscape` 手搓面板，打开时焦点不进入面板、关闭后不归还、面板没有 `role`；面板类名 `absolute right-0 top-full w-80`，宿主是看板头部（`flex-wrap`）——在 ≤360px 视口下 320px 面板左边缘越出屏幕，内容不可达。
- 根因：没有走 `components/overlay` 的 `Popover`；绝对定位没有碰撞翻转（`right-0` 固定贴按钮右缘）。同一组件被看板头部与单篇分析模态复用，问题面 ×2。
- 修改方案：改走 `Popover`（自带碰撞与焦点行为）；若保留手搓，至少补 `role="dialog"` + 焦点进入/归还 + 碰撞翻转。
- 涉及范围：`share-traffic-filter-popover.tsx` + 2 个调用点。代价：小–中。
- 建议：与 SH-49 同批（同属"绕过组件体系"），一并补一条键盘路径断言（Tab 进入面板 → ESC 关闭 → 焦点回到触发按钮）。

#### SH-51 [P1][代码] hover-only 的「新建文件夹 / 标签」按钮键盘不可见、触屏不可发现

- 现象：`share-hub-sidebar.tsx` 的 `SidebarSection` 里 `+` 按钮是 `opacity-0 group-hover/head:opacity-100`；键盘可聚焦但**不可见**（WCAG 2.4.7 Focus Visible / 2.4.11 Focus Not Obscured 的等效失败），触屏无 hover 即不可发现——而它是**创建文件夹/标签的唯一入口**（设置模态没有别的入口）。
- 根因：用 hover 显隐代替了"次要但可达"的视觉层级。
- 修改方案：`focus-visible:opacity-100` + 触屏常显（`@media (hover: none)` 或粗指针）；并把「新建文件夹/标签」同时放进文件夹/标签区的菜单。
- 涉及范围：`share-hub-sidebar.tsx`（若与外壳 `hub-folder-item` 同源则一并核对）。代价：小。
- 建议：断言用"焦点后 `opacity === '1'`"而不是类名字符串，避免变成脆弱快照。

#### SH-52 [P2][代码] 侧栏计数不完整：三类永远没有徽标，0 又一律隐藏

- 现象：`密码加密 / 有效期内 / 永久有效` 即使有数据也永远不显示计数（截图里那三行是空的，与"0 个"无法区分）。
- 根因：服务端 `worker/routes/share/global-stats.ts` 的 `globalSummaryStatement` 只算 `total/active/paused/expired`，`pinStarStatement` 只算 pinned/starred；`ShareGlobalStats` 类型里没有 password/expiring/permanent 字段；客户端 `buildCategories` 又用 `cat.count > 0` 一律隐藏 0。
- 修改方案：同一张 `shares` 表再加 3 个 `COUNT(CASE ...)`（几乎零成本），或让 summary 语句直接输出 `status_counts`；统一"显示 0"策略（有该分类就给数，哪怕是 0）。
- 涉及范围：`global-stats.ts`、`share-store/types.ts`、`use-share-hub-sidebar.tsx`（+ 对应 worker 测试）。代价：小。
- 建议：与 SH-53 同批（两者都改分类语义，一起改只跑一次回归）。

#### SH-53 [P2][代码] `expiring` 语义与标签不符，缺真正可行动的「即将到期」桶

- 现象：`STATUS_CONDITIONS.expiring = expires_at IS NOT NULL AND expires_at > now`——任何未来到期（含 200 天后）都进这个桶，而中英标签（有效期内 / Expiring）都暗示"即将到期"；真正的 ≤7 天桶不存在，也没有任何到期提醒。
- 根因：分类按"有没有到期时间"划分，产品语义按"快到期了"理解，两者从未对齐。
- 修改方案：新增 `expiring_soon`（`expires_at BETWEEN now AND now+7d`，与 expired 互斥），7 天内行加 `--warning` 视觉；`expiring` 更名"有到期时间"；常数 `EXPIRING_SOON_DAYS` 外置。
- 涉及范围：`shares.ts`（STATUS_CONDITIONS）、`share-store/filters.ts`、`use-share-hub-sidebar.tsx`、两个 locale。代价：小。
- 建议：与 SH-62（批量续期）成对交付，形成"看到即将到期 → 一键延长"闭环。

#### SH-54 [P2][代码] 看板不受侧栏范围影响且不标注作用域

- 现象：选中文件夹/标签后切到「数据看板」，看到的仍是全站数字，标题只写"分享访问看板"——口径误读（上一轮 SH-30 的"近义标签同屏"是同一根因的另一面）。
- 根因：`use-share-dashboard-view.ts` 只订阅三个流量过滤开关，完全不读 `folderId` / `tag`；`/api/share/analytics/global` 也没有 scope 参数。
- 修改方案：最低限度在标题旁显式标注「全站 · 区间」；进一步支持 `scope=all|folder|tag|note`（`visitWhere` 已按 `user_id` 收口，加一个 `note_id IN (SELECT ...)` 条件即可）。
- 涉及范围：hook + 视图（+ 可选：analytics 路由与类型）。代价：中（仅标注为小）。
- 建议：标注先行（低风险），scope 参数随 SH-72（打开成本）一起做，避免两次改同一条路由。

#### SH-55 [P1][代码] 加载态缺失：首屏把"正在加载"画成 0

- 现象：`share-dashboard-view.tsx` 与 `share-note-analytics-modal.tsx` 在 `isLoading` 期间渲染 `analytics?.totalViews ?? 0`，KPI 全是 0、每张卡是"暂无访问数据"，只有刷新图标在转——慢网下与"确实没有流量"无法区分（AGENTS 铁律 2 的三态要求只落地了"失败"一态）。
- 根因：`KpiCard` 没有 loading 概念，视图用 `?? 0` 兜底。
- 修改方案：`KpiCard` 增加 `loading`（骨架块 + `aria-busy`），视图在 `isLoading && !analytics` 时走骨架；数据到达前不渲染 0。
- 涉及范围：`share-dashboard-view.tsx`、`share-note-analytics-modal.tsx`、`components/dashboard-blocks.tsx`（blog 看板共用 → 双侧回归）。代价：小–中。
- 建议：断言"加载中不出现 0"用 `aria-busy` + 文本查询，不要断言具体骨架 DOM。

#### SH-56 [P2][代码] 「日均访问量」口径错误 + sparkline 与 PV 卡重复

- 现象：`viewsPerDay = Math.round(totalViews / daysSpan)`；24h 区间下 `duration` 恰好 1 天，于是它等于总 PV 却仍叫"日均"；sparkline 直接复用 `sparklineViews`，与「总访问量」卡画同一条线（零信息量），并且没有 delta。
- 根因：KPI 复用 `sparklineViews` 省事，标签沿用英文 `Visits / Day` 的字面翻译。
- 修改方案：给它独立的环比（日均对齐上一周期，需要 worker 输出 `prevViewsPerDay` 或前端按 `prev` 算）或直接去掉 sparkline；标签改「平均每日（选定区间）」；`viewsPerDay` 改为保留一位小数或明确取整规则。
- 涉及范围：`analytics.ts`（compose）、`dashboard-blocks.tsx`、locale。代价：小。
- 建议：不要为了"对齐三个 KPI 的视觉"强行编一个 delta；无基线时用中性态（与 SH-29 的 delta=0 处理一致）。

#### SH-57 [P2][代码] 数字与图表的本地化 / 可访问性

- 现象：① `KpiCard` 用 `value.toLocaleString()`，跟随 OS 而非应用 locale（`i18n:check` 抓不到，靠 `NumberFormat` 走 OS 默认）；② delta 只有裸文本 `+12%`，没有"对比上一周期"的可访问语义；③ `BigSvgChart` 没有 `role="img"` / `aria-label` / 文本替代，唯一信息载体是每个点的 8px `<title>`（hover 才有）。
- 根因：共用组件按"看起来对"实现，没有按"读得出来"实现。
- 修改方案：数字走 `formatNumber()`（`lib/time.ts` 已有，内部用 `localeTag()`）；delta 容器加可访问名（含"对比上一周期"）或改用 `aria-label`；图表加 `role="img"` + `aria-label`（区间、总量、峰值），并补一处视觉隐藏的极值摘要。
- 涉及范围：`dashboard-blocks.tsx`、`big-svg-chart.tsx`（blog 看板共用）。代价：小–中。
- 建议：保留 `<title>` 作为指针用户的兜底，但断言以 `aria-label` 为准。

#### SH-58 [P3][代码] hub 分类徽标未走 `countBadgeTone`，且 hub 不在对比度门禁内

- 现象：`CategoryList` 自写徽标（`bg-[var(--bg-card)]` + `text-[var(--text-tertiary)]`），而外壳 `features/sidebar/sidebar/count-badge.ts` 明确规定"选中行（accent-soft）必须用上一层级文字"（该规则由 `npm run contrast:check` 按令牌名 + 全部强调色两重守住）。
- 根因：hub 侧另起了一套徽标实现；徽标自带不透明底色，**当前大概率过 AA**，属于规则漂移而非现成对比度失败——但 hub 不在门禁覆盖面内（SH-85），漂移无人守。
- 修改方案：复用 `countBadgeTone`（或抽 `HubCountBadge`）；把 hub 的徽标纳入 SH-85 的对比度读数。
- 涉及范围：`share-hub-sidebar.tsx`（+ 可能 `components/hub-*-item.tsx`）。代价：小。
- 建议：改动前先用 SH-85 的门禁量一次现值，改后复量，两次读数都记进台账。

#### SH-59 [P3][代码] 表格行与网格卡的实现质量不一致

- 现象：`ShareTableRow` 已 `memo` + 稳定 handler + `folderById` Map；`ShareGridCard` **未 memo**、每次渲染收 12 个内联箭头闭包、每张卡还做 `folders.find`（O(行×目录)）。切到网格视图后，任何勾选/复制状态变化都会重渲全部卡片；两视图空态文案也不一致（网格缺 hint）。
- 根因：SH-22 轮次只修了表格路径，网格路径遗留。
- 修改方案：网格卡 `memo` + 传 `folderById` Map + 收敛内联闭包（`useShareList` 已有稳定 handler）；统一空态。
- 涉及范围：`share-grid-view/index.tsx`、`card.tsx`。代价：小。
- 建议：断言用"选择态变化时未选中卡片的渲染次数"（可用渲染计数桩），不要只断言 `memo` 存在。

#### SH-60 [P3][代码] 看板文件已到"最后一格"预算，且与 blog 同构面重复

- 现象：`share-dashboard-view.tsx` 468 行 / 9 个子组件（blog 的同构面拆成 7 个文件、648 行），离 `check-size` 的 `maxFileLines: 500` 只差 32 行；range 选项（`'24h'|'7d'|'30d'` + `share.range_all`）在看板与单篇分析各写一份。
- 根因：视图文件按"一个 dashboard"组织，后续每加一张卡都在累积。
- 修改方案：拆成 `share-dashboard-view/` 目录（纯搬家，零行为变化），抽 `rangeOptions()` 与共享 KPI/Breakdown 组件；与 blog 侧的 `blog-dashboard-view/` 结构对齐。
- 涉及范围：`share-dashboard-view.tsx` → 新目录（+ 测试 import 路径）。代价：小–中。
- 建议：纯搬家提交里不要夹带任何行为改动，方便用"测试全绿 + 行数下降"验收。

### B. 功能完整性（把分享中心当一个 app 看）

#### SH-61 [P3][代码] 设置模态一个「保存」一半本地一半服务端，语义未标注

- 现象：`use-share-settings-modal.ts` 的 `handleSave` 同时 `setFilters`（三个流量过滤写 `localStorage: inkstone_share_filters_v2`）与 `updateSettings({ share: { visitLogRetentionDays } })`（写账号 settings），成功后只有一个「设置已保存」toast。换设备后**看板数字口径不一致且无提示**，而保留期已是账号级（SH-14/05 轮次修的）。
- 根因：保存路径按"设置"整体处理，但两半的持久化层级与作用域不同。
- 修改方案：把三个过滤开关也放进 user settings 文档（服务端已有该文档），或在行内明确标注「本设备」；toast 区分两种作用域。
- 涉及范围：`use-share-settings-modal.ts`、`share-settings-modal.tsx`、`share-traffic-filter-popover.tsx`（文案 `share.filter_persist_hint` 已在但只覆盖 popover）。代价：小。
- 建议：优选服务端化（口径跨设备一致才是用户预期），但要处理"账号 settings 写入失败"的回滚与三态。

#### SH-62 [P1][代码] 到期治理缺最后一环：即将到期列表 + 批量续期

- 现象：批量动作只有「启用 / 暂停 / 移入文件夹 / 设置绝对到期(1d/7d/30d/永久) / 撤销」；**没有"再延长 N 天"**。到期前最高频的动作恰恰是续期，而绝对时间会意外缩短一个本来更长的到期。
- 根因：`batch.ts` 的 `expire` 分支只支持 `now + expiresIn`，且 `folder_id/is_enabled/expires_at` 共用 `setSharesField` 的绝对赋值语义。
- 修改方案：新增 `extend` 动作（`expires_at = COALESCE(expires_at, now) + N 天`，永久链接保持永久），批量条加「延长 7 / 30 天」；配合 SH-53 的 `expiring_soon` 形成闭环；可选"N 天 0 访问自动暂停"（另开）。
- 涉及范围：`hono` 路由 `batch.ts`、`schemas.ts`（action enum）、`lib/api/share.ts`、`share-batch-bar-actions.tsx`、`share-store/shares.ts`、i18n、worker 测试。代价：中。
- 建议：worker 侧先写断言（含"永不过期保持 null"与"已过期链接从 now 起算"两个边界），UI 随后。

#### SH-63 [P1][代码] 缺"单条分享"的访客数据删除 / 导出（隐私删除权）

- 现象：只能整账号按天清空或全清；撤销分享会连带删 visits（`revokeSharesForNotes` 已实现），但"链接还活着，把这个链接的历史访客数据清掉/带走"没有入口。
- 根因：`DELETE /api/share/visits` 只有 `type`（bots/older_than/all），`noteId` 目前仅是列表筛选参数；CSV 导出内部已支持 `noteId`，但没有分享级入口。
- 修改方案：`DELETE /api/share/visits?noteId=…`（权限口径与 `type=all` 同级，即要求重新验证当前账号口令）；单条分享菜单加「清除此链接的访问记录」；导出入口补「导出此分享的访客数据」。
- 涉及范围：`visits.ts`、`share-item-common.tsx`/`share-note-submenu.tsx`（菜单）、`lib/api/share.ts`、i18n、worker 测试。代价：小–中。
- 建议：与 SH-62 同批（都改同一个菜单与同一批文案）。

#### SH-64 [P2][代码] 看板无法导出（报告 / 快照）

- 现象：日志能导 CSV，看板不能导出区间数据或图片；项目已有 `deck-image.ts`（SVG→PNG + `client-zip`）与打印管线可复用。
- 根因：导出能力只做在"日志"这一个出口上。
- 修改方案：先做"区间数据 CSV"（纯前端，成本最低，列与口径要和看板一致），再评估 PNG/PDF 快照（复用 deck 管线）。
- 涉及范围：新 hook + `share-dashboard-view` 头部按钮 + i18n（+ 可能 `share-helpers.ts`）。代价：中。
- 建议：CSV 的列名与"区间"要写进表头，避免导出文件脱离上下文后口径不明。

#### SH-65 [P2][代码] 无自动刷新 / 无新鲜度标识

- 现象：「最近访问」是打开瞬间的一次性快照，看板也没有自动刷新；文案已不再宣称"实时"（上一轮修的），但看板天然期待新鲜度。
- 根因：没有任何轮询或订阅；`SyncHub` DO 与轮询降级已有基础设施可复用。
- 修改方案：可见性门控的低频轮询（30–60s，页面隐藏即停）或订阅 DO 的"新访客"事件；头部显示"更新于 X 分钟前"。
- 涉及范围：两个 analytics hook + 头部组件（+ 若走 DO，则 worker 侧）。代价：中。
- 建议：优先轮询（改动面小、可预测）；把"自动刷新开关"作为用户可见开关，别强制。

#### SH-66 [P2][推断] 缺访客 / 会话视角（现在只有逐行日志）

- 现象：`visitorFp` 是唯一访客标识，UI 只显示 8 位哈希且没有解释；无法回答"这个访客来过几次、都看了哪几篇"。
- 修改方案：按 `visitorFp` 聚合成会话（首次/最近、次数、跨笔记路径）；日志行的 FP 列加 tooltip 说明"同 IP + 同一 UTC 日去重指纹"。
- 涉及范围：新接口 + 索引 + UI。代价：中–大。
- 建议：**先出 ADR**（数据模型、隐私影响、索引与保留期交互），评审后再实现。

#### SH-67 [P2][推断] 缺渠道标记（UTM / ref）

- 现象：只能依赖浏览器 referrer，同源或 App 内打开常常是 Direct；无法区分"邮件 / 微信 / 二维码"发出的同一链接。
- 修改方案：可选 `?ref=` 采集（写入 visit，带隐私开关与说明）+ 渠道分解卡。
- 涉及范围：公共读取路由、schema、visit 表字段、看板。代价：中。
- 建议：**先出 ADR**（隐私开关、数据最小化、与现有 referrer 清洗的关系）。

#### SH-68 [P3][推断] 集合落地页（文件夹 / 标签 → 公开目录页）

- 现象：「按文件夹批量公开」已有，但访客拿到的是一堆散链；缺"一个包含 N 篇笔记的目录页"。
- 修改方案：复用公共阅读页渲染 + 单一口令，新增公共路由与权限模型。
- 涉及范围：新公共路由 + 权限 + 元数据 + SEO（`noindex` 口径要与现有 `renderShareShell` 一致）。代价：大。
- 建议：**先出 ADR / 方案评审**，不静默实现。

#### SH-69 [P2][代码] 批量二维码 / 链接清单

- 现象：逐条分享有 QR（PNG/SVG/复制）与单条复制；批量选中后没有"二维码打印表"或"复制全部链接"。
- 修改方案：批量条加「导出二维码表（PNG 网格 / PDF）」「复制全部链接」，复用 `qr-export.ts` + `client-zip`。
- 涉及范围：`share-batch-bar*.tsx` + 新导出工具 + i18n。代价：小–中。
- 建议：大批量（>50）要给出分批或"仅导出前 N 个"的明确提示，不要静默截断。

#### SH-70 [P3][代码] 链接卫生巡检

- 现象：长期 0 访问的分享会永久躺在列表里；没有"90 天未访问 → 建议暂停/撤销"的报告（撤销级联删 visits 已实现，因此卫生成本很低）。
- 修改方案：看板加一张「长期未访问」卡（阈值常量外置）+ 一键暂停。
- 涉及范围：analytics 路由（一次聚合）+ 看板卡片 + i18n。代价：小。
- 建议：把阈值放进 settings 而不是写死。

### C. 性能与成本

#### SH-71 [P1][代码] 分析请求无取消、无竞态防护（会显示错口径数据）

- 现象：慢的"全部区间"请求后到会覆盖快的"24h"结果——区间控件显示 24h、卡片却是全部区间数字。
- 根因：`use-share-dashboard-view.ts` 与 `use-share-note-analytics.ts` 都是裸 `setState` + `useEffect`，没有 `AbortController`/epoch；同一模式在 `share-store/loaders.ts` 已经是正确范式（abort + `loadEpoch` + 同参在途去重），两个 analytics hook 漏了。
- 修改方案：照抄 epoch + abort 模式（含"同参数在途复用"）；补一条"慢请求乱序到达不覆盖新结果"的回归（先红后绿）。
- 涉及范围：2 个 hook + 1 个测试文件。代价：小。
- 建议：把这条模式抽成小工具（`useAbortableLoad`）供两个 hook 共用，避免第三次复制。

#### SH-72 [P1][推断] 打开分享中心固定 4 个请求 / ≈15 条 D1 语句

- 现象：默认落在「数据看板」，但 `use-share-hub-modal.ts` 在 `open` 时仍无条件 `loadShares()`（列表 6 条 batch + 每 50 note 一条访客统计），看板自身再拉聚合（4 条 batch + 1 条聚合 + top notes），侧栏还要 folders/tags。用户只想看列表时白付一次分析成本，反之亦然。`range=all` 时聚合自身变成 8 条全表 GROUP BY，合计 >20 条。
- 根因：面板打开即"预热所有面"，没有按落地视图区分。
- 修改方案：按落地视图懒加载（`category === 'dashboard'` 时不拉列表，列表视图不拉分析）；侧栏计数改用已有的 `/api/share/summary`；中期把列表的 `globalStats` 拆到独立端点。
- 涉及范围：`use-share-hub-modal.ts`、`share-hub-modal.tsx`、`share-store/loaders.ts`（+ 测试）。代价：小–中。
- 建议：验收用"打开后发出的请求数/语句数"做断言（可 mock `api` 计数），别只靠肉眼。

#### SH-73 [P2][推断] 列表接口最贵的一步是访客统计，且 tags 无法走索引

- 现象：`loadNoteVisitStats` 每 50 个 note 一条 `COUNT(DISTINCT visitor_fp)` + `EXISTS(SELECT 1 FROM shares WHERE slug = ...)` 关联子查询；`share_visits` 的四个索引（user_time / slug_time / note_time / filter_time）都不含 `visitor_fp`，无法覆盖。`tagCountsStatement` 与列表的标签条件仍是 `tags LIKE '%"x"%'`，O(标签×分享)。
- 修改方案：先加 `(user_id, note_id, visitor_fp)` 覆盖索引（新 migration，只增不改）；tags 关联表改造单开一期（大）。
- 涉及范围：`worker/db/schema/migrations.ts`、`shares.ts`、`global-stats.ts`（+ `check-migration-immutability` 与迁移测试）。代价：中–大（可分期）。
- 建议：索引增量小、收益需要实测；本项落地后要用 `EXPLAIN QUERY PLAN` 或等价证据说明命中。

#### SH-74 [P2][推断] `range=all` 无节流、无缓存

- 现象：无论数据量多少都跑 8 条全表 GROUP BY（外加 `MIN(visited_at)` 全扫），每个筛选开关切换都会重跑；单账号即可自伤 D1 read units / CPU。
- 根因：读侧没有任何预算或缓存，只有公开写入路径有 throttle。
- 修改方案：聚合结果 60s TTL 缓存（Cache API / KV，key 含 userId + range + filters）+ 读侧 per-user 预算（复用 `lib/throttle.ts`）；缓存必须随写入（新 visit）失效或接受 60s 陈旧并写进文档。
- 涉及范围：`analytics.ts` + 可能的 KV 绑定与本地测试基座。代价：中。
- 建议：先在 workerd 本地实测一次 `range=all` 的 CPU/行数读数，再决定 TTL 与阈值。

#### SH-75 [P3][代码] 全量导出是串行分页，无进度、无取消、无上限提示

- 现象：`collectAllVisits` 以 `limit=100` 顺序翻页，10 万行 = 1000 次串行往返，期间只有按钮禁用；modal 关闭不中止，内存里攒整份数组。
- 修改方案：进度 `aria-live`、上限 + "仅导出前 N 条"提示、AbortController 随 modal 关闭取消（或后端流式导出）。
- 涉及范围：`use-share-visit-logs-modal.ts`、`share-visit-logs-modal.tsx`（+ 测试）。代价：小–中。
- 建议：上限值与 toast 文案都要能解释"为什么不是全部"。

#### SH-76 [P3][代码] `useShareStore.subscribe` 每次写入都重建共享 id 快照

- 现象：模块级订阅在**每次** store 写入（含每次搜索键击、每次勾选）都 `new Set(...)` 全量 shares + `sameSet` O(n) 比较。n ≤ 500 时可忽略，但它始终在跑。
- 修改方案：按 `shares`（+ `summary`）引用记忆化，引用未变直接 return。
- 涉及范围：`share-store/index.ts`（+ 一条订阅行为测试）。代价：极小。
- 建议：与 SH-72 同批（都动 store 装配）。

#### SH-77 [P3][推断] 500 行上限全量渲染、无虚拟化

- 说明：表格已 memo，成本集中在首屏而非每次交互（网格见 SH-59）；列表上限 500 + 截断提示已实现。
- 修改方案：仅在出现规模证据（真实 500 行账号的首屏耗时读数）时做虚拟化；否则登记为"已知限制"关闭。
- 代价：中（暂不做）。

### D. 安全 / 隐私

#### SH-78 [P0][实测] `GET /api/share/visits` 的 `page` / `limit` 未做数值校验 → 必现 500

- 现象：`?page=abc` 或 `?limit=abc` 会 500。
- 根因：`visits.ts` 用 `Math.max(1, parseInt(raw, 10))`；`parseInt('abc')` → `NaN`，`Math.max(1, NaN)` 仍是 `NaN`，直接绑进 `LIMIT ?/OFFSET ?`。本地 `node:sqlite` 实测该绑定报 `datatype mismatch`（D1 同样会是 500，而不是回退默认值）。同类参数 `days`（`older_than` 路径）有 `!(days >= 1)` 守卫，说明只是漏了这一处。
- 修改方案：一个 `parsePositiveInt(raw, { min, max, fallback })`（或 zod `coerce`），非法 → 400；`limit` 上限 100、默认 25 不变。
- 涉及范围：`worker/routes/share/visits.ts`（+ 复用给 `days`）、`tests/share-routes.test.ts`。代价：极小。
- 建议：先写复现测试（断言 400），再改实现；回归要覆盖合法分页（第 1/2 页）不回归。

#### SH-79 [P1][代码] 日志 CSV 未做 RFC 4180 转义，也没有公式注入防护

- 现象：`exportVisitsToCsv` 只给 `noteTitle` / `referrer` 加引号，`city` / `deviceType` / `os` / `browser` / `country` / `referrerHost` 直接 `join(',')`——任一值含逗号、引号或换行即列错位；且没有任何字段做 `=` / `+` / `-` / `@` 前缀净化，笔记标题是用户可控内容，`=HYPERLINK(...)` 这类标题会在 owner 打开导出文件时被表格软件执行（AGENTS 铁律 1：输出按上下文编码）。
- 修改方案：统一 `csvField(value)`（总是加引号、`"` → `""`、剥 CR/LF、公式前缀补 `'`），所有字段都走它；补单测覆盖"逗号 / 双引号 / 换行 / 公式前缀"四类输入。
- 涉及范围：`share-helpers.ts`（+ `share-visit-logs-export.test.ts`）；blog 侧若有同构导出，按同一手法核对（另批）。代价：极小。
- 建议：把 `csvField` 放到模块级导出，方便将来 blog 侧复用而不是复制。

#### SH-80 [P2][代码] `loadTopNotes` 的笔记标题查询没有 user 作用域

- 现象：`SELECT id, title FROM notes WHERE id IN (...)` 缺 `user_id = ?`。当前不可跨租户到达（id 来自调用者自己的 visit 行），但破坏了本模块"每条分享查询都带 user_id"的不变量——后续任何一次改动都可能把它变成 IDOR。
- 修改方案：加 `AND user_id = ?`（或 `JOIN shares` 收口）。
- 涉及范围：`worker/routes/share/analytics.ts`（+ 测试）。代价：极小。
- 建议：与 SH-82 同批（同一文件同一批断言）。

#### SH-81 [P2][代码] 读侧无限流：分析 / 日志端点对已认证会话完全开放

- 现象：只有"清空全部日志"要求重输密码（SH-12 轮次修的），但 `analytics/global?range=all`（全表 8 次 GROUP BY）与 `visits`（100 条/页翻页）没有 per-user 预算；会话被盗即可拉走全部访客元数据并烧配额。
- 修改方案：复用 `lib/throttle.ts` 给读侧加宽松预算（例如 60 次 / 5 分钟 / 账号），配合 SH-74 的短缓存；429 的文案与 `retryAfter` 走既有错误结构。
- 涉及范围：`analytics.ts` / `visits.ts`、`lib/api`（错误展示）、e2e 场景（不能误伤 CI）。代价：小–中。
- 建议：阈值必须让正常使用（含 e2e 的连续调用）不触发；先量一遍 e2e 实际调用次数再定。

#### SH-82 [P2][代码] 数据最小化：日志接口下发完整指纹与从不使用的列

- 现象：`visitorFp` 完整 32 位下发（UI 只显示 8 位）；`SELECT` 里带 `sv.user_agent` 但 `toVisitLogRow` 从不返回它（死列，白传）。
- 修改方案：只返回 8 位前缀（或另派生前缀），删 `user_agent` 列；日志 FP 列加说明性 tooltip（与 SH-66 的会话视角协同）。
- 涉及范围：`visits.ts`、`shared/types/share.ts`、`share-visit-logs-modal.tsx`（+ 测试）。代价：极小。
- 建议：类型改动会牵动消费方，一次改完并全量回归。

#### SH-83 [P2][代码] UV 去重口径对用户不可见

- 现象：指纹 = IP + per-owner 日盐，因此"同一 NAT/CGNAT 下多人同一天算 1 个 UV、跨 UTC 日重复计数"；看板把 UV 呈现为"独立访客 / 受众画像"，没有任何口径说明。这不是漏洞，是**产品语义风险**（用户会据此判断受众规模）。
- 修改方案：UV 卡片加一行 hint（去重口径 + 日轮换）+ `docs/` 说明。
- 涉及范围：`share-dashboard-view.tsx` + i18n（+ 可选 docs）。代价：极小。
- 建议：文案要短，放在卡片的次级文字位，不占 KPI 视觉面积。

### E. 门禁与验证

#### SH-85 [P1][代码] 分享中心 UI 完全在浏览器级门禁之外

- 事实：`scripts/e2e-visual.mjs` 与 `scripts/check-contrast.mjs` 覆盖侧栏、命令面板、设置对话框、演示浮层、思维导图全屏，**没有分享中心**；`scripts/e2e.mjs` 只打分享 **API**（附件通道、口令轮换、Cookie 属性等）；`scripts/check-surface-coverage.mjs` 的名单里没有 hub（它是 `<Modal>`，不是 `fixed inset-0`，因此 AST 扫描不认它）。结果：hub 从未跑过 axe，`accent-soft` 上的文字层级对比度从未被量测，键盘路径无人守。
- 修改方案：① 在 `e2e-visual.mjs` 增加一条分享中心场景（打开 → 看板（含种子流量）→ 切换区间/指标 → 列表（表格/网格）→ 行菜单 → 单篇分析 → 日志弹窗），断言 axe 违规为 0、键盘走查可用、选中行徽标对比度达标、工具栏高度不变量为 0；② 把分享 hub 的全屏变体（移动断点）与对话框纳入 `check-surface-coverage.mjs` 的具名断言；③ 与 SH-49 的静态守卫一起构成分享中心的三层防线（静态扫描 / jsdom 行为 / 真实浏览器 + axe）。
- 涉及范围：`scripts/e2e-visual.mjs`、`scripts/check-surface-coverage.mjs`（+ 复用 `scripts/e2e-harness.mjs`）。代价：中。
- 建议：先补门禁再改 UI（已与用户确认的顺序），否则 SH-49…SH-58 的改动没有任何自动防线。

---

## 四、作为独立 app 的功能视图

**现有闭环**：创建/口令/有效期/自定义 slug/暂停/撤销/批量/置顶加星/目录标签/二维码/看板/日志/清理/设置/导出日志。

**缺的关键能力，按实用度排序**：

1. 即将到期列表 + 批量续期（SH-62）——到期前最高频动作。
2. 单条分享的访客数据删除 / 导出（SH-63）——隐私删除权。
3. 看板作用域（文件夹/标签/单篇）（SH-54）——让看板与侧栏口径一致。
4. 看板导出（区间 CSV / PNG）（SH-64）——对外汇报。
5. 自动刷新与新鲜度（SH-65）——看板可用性。
6. 批量二维码打印表 / 复制全部链接（SH-69）——分发效率。
7. 访客会话视角（SH-66）——从"流量"到"谁在看"。
8. 渠道标记（SH-67）——知道链接发到哪里有效。
9. 集合落地页（SH-68）——把"批量公开"变成给客户的一页。
10. 链接卫生巡检（SH-70）——长期维护成本。

**明确的非目标**（本轮不做）：多人协作/权限模型、评论与回复、A/B 文案测试、独立于笔记的第二内容源。

---

## 五、批次与验收标准

| 批次 | 内容 | 条数 | 代价 | 门禁/回归口径 |
| --- | --- | --- | --- | --- |
| A 必现与极小正确性 | SH-78、SH-79、SH-84、SH-80、SH-82、SH-71、SH-55 | 7 | 极小–小 | 每项：定向测试 + `tsc -b --force` + 13 项静态门禁 + pre-commit；服务端项额外全量串行 |
| B 门禁 | SH-85 | 1 | 中 | 真实浏览器（Chrome + 独立端口 workerd），axe 0 违规读数入库 |
| C 规范与交互 | SH-49、SH-50、SH-51、SH-53、SH-60、SH-59、SH-57、SH-56、SH-58、SH-52、SH-54、SH-61、SH-83 | 13 | 小–中 | 共用面（dashboard-blocks / big-svg-chart / count-badge）逐项双侧回归（share + blog） |
| D 性能与成本 | SH-72、SH-73、SH-74、SH-81、SH-75、SH-76、SH-77 | 7 | 极小–中 | SQL/索引项：迁移测试 + `check-migration-immutability` + 全量串行；SH-77 无规模证据则关闭 |
| E 功能补齐 | SH-62、SH-63、SH-69、SH-65、SH-64、SH-70 | 6 | 小–中 | 新接口先写 worker 断言再写 UI；i18n 双语同步 |
| F 需先出 ADR | SH-66、SH-67、SH-68 | 3 | 中–大 | 先交付方案文档（数据模型/隐私/索引/公共契约），评审后再实现 |

**全局验收口径（每项都适用）**：

1. `npx tsc -b --force` exit 0（`npm run typecheck` 在复用 build info 时会假过）。
2. 定向 `npx vitest run --config vitest.config.ts <相关文件>` 全绿；修 bug 类**先红后绿**，守卫型如实标注"前后均绿"。
3. 13 项静态门禁全绿（`style:check`/`comments:check`/`size:check`/`hardcoded:check`/`tokens:check`/`i18n:check`/`empty-catch:check`/`escape:check`/`module-state:check`/`deep-imports:check`/`surfaces:check`/`vendor:check`）；触碰打包面时另跑 `budget:check`。
4. `.githooks/pre-commit` 通过（镜像静态门禁 + 增量 tsc + `vitest related`）；**禁止 `--no-verify`**；新增 `//` 注释同提交跑 `node scripts/sync-comments-allowlist.mjs`。
5. 触碰共用面/服务端/SQL/migration 的项：全量串行 `npx vitest run --config vitest.config.ts --no-file-parallelism --testTimeout=30000` 全绿（本机并行会假超时）。
6. 至少一发变异（把缺陷改回去 → 测试变红）用于守卫型/断言型改动，读数写进台账。
7. 每项 = 一个原子提交（Conventional Commits + 逐文件正文），并同提交更新 `plan-freebuff.md`。
8. 任何无法执行的验证（缺 Chrome、端口占用、缺依赖）如实标注"未验证 + 风险"，不伪造读数（铁律 6/15）。

---

## 六、诚实的限制

1. **本报告未执行任何验证命令**（撰写时为只读计划模式）：typecheck / test:unit / build / e2e / 对比度与 axe 门禁均未跑。除 SH-78 的 NaN 绑定有本地 `node:sqlite` 实测读数外，其余为读码判定或结构推断（`[代码]` / `[推断]`）。
2. **性能量级未 profiling**：SH-72/73/74/81 的"语句数/成本"是按路由与 SQL 结构推算，未用种子数据计时；落地各项时需补读数。
3. **UI 断言未经真实浏览器**：SH-49…SH-58 的键盘/焦点/对比度结论来自读码，SH-85 落地后才有第一份真实读数——届时若与本文冲突，以门禁读数为准并回改本文。
4. **截图与源码有差异**：第二节列出 3 处已修 + 1 处现码不可能出现，说明截图早于当前 `dev`。
5. **SH-66/67/68 未做数据模型评估**：会话聚合、`?ref=` 采集、集合落地页都涉及新表或新公共路由与隐私契约，必须走 ADR。
6. **未审查分享模块之外的调用方**（MCP 分享工具、公共阅读页）与本轮 UI 改动的交叉影响，仅确认它们复用同一套 `share_*` / `visit-aggregates` 代码路径。

---

## 七、进度追踪

本报告的逐项落地进度、提交 hash、验证读数与局限登记在 `.qoder/improvement/share/plan-freebuff.md`。
