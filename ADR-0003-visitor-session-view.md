# ADR 0003: 访客会话视角（把逐行日志聚合成"一次访问"）

Status: Accepted（已实现：`GET /api/share/sessions` + 日志弹窗的会话视角）

Date: 2026-09-21

## Context

分享模块现在只有**逐行**的访客日志（SH-66 提出）。看板回答"多少人看了、从哪里来"，日志回答"哪一条记录长什么样"，但没有人回答**"这个访客来过几次、都看了哪几篇"**——而这正是所有者最常问的那一个问题（"昨天那条链接被人从头看到尾了吗"）。现有材料与限制：

1. **唯一访客标识是 `share_visits.visitor_fp`**：`computeVisitorFingerprint(ip, userAgent, VISIT_FP_SECRET, now)` = `HMAC-SHA256(盐(UTC 日), ip + userAgent)`（`src/worker/lib/share-analytics.ts`）。盐**按 UTC 日轮换**，所以同一个真人跨 UTC 日会得到两个不同的指纹；同一指纹在**同一天内**稳定。
2. **一次"看"已经被去重过**：写入访客行之前按 `(slug, visitor_fp, now - 30 分钟)` 查重（`VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000`，`routes/share/public.ts`），即 30 分钟内同一指纹看同一篇只记一行。
3. **指纹是唯一的访客字段，且没有跨设备/跨会话的标识**：没有 cookie、没有 localStorage id、没有设备指纹拼接。这是刻意的隐私姿态（AGENTS「安全基线」、`share.visitor_count_note` 文案已向用户说明"同一 IP 的人算一个、按 UTC 日轮换"）。
4. **日志会按账号的保留期被清理**（`share_visits.visitLogRetentionDays`，0 = 永久），所以任何派生的"会话"都随底层行一起消失，不需要（也不应该）另存一份。
5. UI 现状：日志表格显示 `visitor_fp` 的前 8 位（SH-82 的下发裁剪），一列没有解释的哈希；`share_visits` 上现有四个索引都不含 `visitor_fp`（SH-73 的实测结论）。

## Decision

### 一、会话的定义（先定义，再实现）

**会话 = 同一 `visitor_fp` 的相邻访问，间隔不超过 `SESSION_GAP_MS`（建议 30 分钟，与既有的 `VIEW_DEDUPE_WINDOW_MS` 取同一个常量）。**

三条硬性推论，必须在实现与文案里同时成立：

1. **会话不能跨 UTC 日**。指纹的盐按 UTC 日轮换，跨日的两条记录属于两个不同的指纹，永远聚不到一起。这不是缺陷而是既有承诺的代价（"同一个人每天最多被当成一个访客"）；会话视角**不得**为了"看起来更完整"去猜跨日关联。
2. **一个会话不是一个人**。同一 NAT/CGNAT 下的多人在同一天可能是同一个指纹；同一人换浏览器或换 IP 就是另一个指纹。因此界面上不允许出现"访客"以外的名词（不出现"用户""客户""人"），并沿用 SH-83 已加的去重口径说明。
3. **会话随底层行一起消失**。派生不落库，保留期清理掉访客行之后会话自然不存在——这既是数据最小化，也是"删除即删除"的实现方式（SH-63 的链接级删除同样不需要额外处理）。

### 二、数据模型：派生，不新建表

| 方案 | 评述 |
| --- | --- |
| **A. 查询时用窗口函数派生（推荐）** | 在 `share_visits` 上按 `visitor_fp` 分区、按 `visited_at` 排序，`visited_at - LAG(visited_at) > SESSION_GAP_MS` 即为新会话起点，再按会话累积笔记与计数。一次查询、零新表、零双写；SH-70 已经在同一批语句里用过窗口函数（`COUNT(*) OVER ()`），D1 侧有先例。 |
| B. 新 `share_visits_sessions` 表，写入时维护 | 写入路径在公共页面上（最热、最需要便宜），每来一次访问都要读+写一张聚合表；且派生值与保留期清理必须成对维护，容易出现"删了行没删会话"。否决。 |
| C. 写宽表（把会话 id 写进访客行） | 同上，且会话 id 一旦写入就固定，无法随 `SESSION_GAP_MS` 调整而重算。否决。 |

派生方案的关键是**成本可控**：会话聚合按 `(user_id, 时间窗口)` 取行，`range` 与筛选条件与现有分析接口一致（复用 `buildVisitFilterSql`），窗口大小由区间决定。索引结论**留待实测**（见"验证"一节）；不要照抄 SH-73 的教训之外的猜测——`(user_id, is_bot, …)` 那类前缀对 `PARTITION BY visitor_fp` 没有帮助，而 `(user_id, visitor_fp, visited_at)` 会为一次只有所有者才发起的读取在最热的写入表上付写放大。

### 三、公共契约

- **新增只读接口**（不扩 `GET /api/share/visits` 的既有形状，那是分页日志，语义不同）：
  `GET /api/share/sessions?range=…&excludeBots=…&excludeSelf=…&excludeOwner=…&limit=…&cursor=…`
  返回 `{ sessions: [{ fingerprint, startedAt, lastSeenAt, visits, notes: [{noteId, noteTitle, slug, visits}], countries, devices }], nextCursor }`。
- **指纹字段与其他接口同口径**：只下发前 8 位（SH-82 已确立），且这 8 位前缀**在同一账号、同一天内可跨接口比对**（日志行 → 会话），不得出现同一行在两个接口下显示不同前缀的情况。
- **排序与游标**：按会话起点倒序；游标为不透明的 `startedAt + fingerprint` 复合键（不用 offset，避免新增访问时错位）。
- **读预算**：套用 SH-81 的读侧预算（无界区间 + 会话聚合是同一类昂贵读取，走同一个 `consumeShareReadBudget` 语义）。
- **不新增写路径、不新增公共路由**。会话对匿名访客完全不可见，只有所有者会话可读（`requireAuth`）。

### 四、UI 与可访问性

- 日志弹窗（`share-visit-logs-modal.tsx`）作为入口：指纹列加一行说明（8 位前缀是什么、按 UTC 日轮换、同一 IP 去重），点击展开该指纹在**当前区间内**的会话轨迹。展开区是表格（`<table>` 语义 + `scope`），不是 `div` 网格；键盘可达，`aria-live` 报告加载/失败/空三态。
- 会话明细里**不得出现**"身份""画像"这类措辞，且必须带上"同一指纹 ≠ 同一个人"的说明（沿用 SH-83 的文案位）。
- 空/失败/加载三态照 AGENTS 铁律 2。

## Consequences

- **没有跨日、跨设备的"访客档案"**，这是本设计的要点而非未完成的缺口。若将来有人想加 cookie/设备 id 来实现它，那是一次隐私姿态的改变，必须新开 ADR 并同步 `share.visitor_count_note` 与文档，不能作为本 ADR 的"改进"顺手做掉。
- 会话数在 UTC 日边界处会**人为偏高**（同一个人被切成两个指纹）。文案要承认这一点；不要用"修正系数"去补，那会把不确定性包装成精度。
- 保留期短的账号（如 30 天）能看到的历史会话就更短——与日志一致，不需要额外说明，但导出与会话两个入口的空态文案要说清"是没有数据还是被清理了"（前者可判，后者要靠保留期设置推断，不得静默）。
- 实现顺序建议：先落 **指纹列的说明与 tooltip**（纯文案 + i18n，价值/成本比最高），再落会话接口与展开区，最后再考虑按会话导出 CSV。
- 索引与 `SESSION_GAP_MS` 的最终取值需要真实数据读数后再定（见下）。

## 验证

1. **纯逻辑**（`src/worker/lib/*.test.ts` 或 `tests/share-routes.test.ts`）：给定一串 `visited_at`，会话切分必须精确落在 `SESSION_GAP_MS` 的边界上（恰好 30 分钟算同一会话、30 分钟 + 1 ms 算两个），且跨 UTC 日的两条记录**不得**合并。
2. **接口**：一个指纹两个会话、两个指纹互相不串、筛选开关（bot/self/owner）同时作用于会话与其中的行数；游标分页不漏不重。
3. **数据最小化**：响应里指纹不超过 8 位（对全文匹配断言），且响应类型里没有 IP/UA 字段。
4. **成本**：在种子数据上量一次（行数、语句数、`EXPLAIN QUERY PLAN`），把读数写回本节；没有读数不得合并索引改动。
5. **可访问性**：键盘展开/收起、表格语义、`aria-live` 三态各一条断言（jsdom 行为层），必要时补浏览器门禁场景。

## 已定的取值（实现时裁定，取代原先的"待评审的问题"）

1. **`SESSION_GAP_MS` = 30 分钟，独立常量**（`src/shared/visitor-session.ts`）。刻意**不**与 `VIEW_DEDUPE_WINDOW_MS` 共用一个常量：两者今天数值相同，但一个回答"这次浏览别记两遍"，另一个回答"这是不是同一次坐着看"，绑定会让改任一个悄悄改掉另一个的语义。常量放共享层，因为它是产品口径：worker 用它派生、demo 模式用它折叠样例、文案引用的也是同一个 30 分钟。
2. **会话明细不显示城市/设备**。一行会话给出开始时间、时长、访问次数与该次读过的笔记（标题 + slug + 条数），不含地理位置与设备——那两列会把"这个人是谁"的暗示放大到与"同一指纹 ≠ 同一个人"的说明相冲突。字段留在类型外，将来要加需按本 ADR 的隐私姿态重新评审。
3. **不新增"按会话导出 CSV"**，维持只有逐行日志 CSV（SH-75）。重开条件：出现"需要离线比较会话"的真实诉求，且届时同时决定导出哪些列（上面第 2 条同样适用）。
4. **指纹说明做成常驻说明**，不给 tooltip。日志弹窗切到会话视角时，面板自身带一行说明（`share.sessions_hint`）并复用 SH-83 的口径说明（`share.visitor_count_note`）；tooltip 依赖 hover、键盘与触屏可发现性差，而这句说明正是"不要把这个哈希当人"的全部防线。

## 实现记录

- 共享：`src/shared/visitor-session.ts`（`SESSION_GAP_MS`）；类型 `ShareSession`/`ShareSessionNote`/`ShareSessionsResponse` 进 `src/shared/types/share.ts`。
- worker：`src/worker/lib/share-sessions.ts`（单条语句派生 + 折叠 + 游标编解码）、`src/worker/routes/share/sessions.ts`（`GET /api/share/sessions`，复用 `analyticsContext` 的区间与筛选解析、`requireAuth`、SH-81 的读预算：仅无界区间 `range=all` 计费）。会话**不落库**，随底层访客行一起被保留期清理与链接级删除带走。
- 派生按 `(fingerprint, UTC 日)` 分区：盐在 UTC 午夜轮换这一事实因此写在语句里而不是文档里——即使将来盐的轮换改了，跨日也不会被悄悄合并。
- 客户端：`use-share-sessions.ts`（游标分页）、`share-sessions-panel.tsx`（真表格 + `scope` 表头 + 三态），日志弹窗顶部加视图切换；切到会话时撤掉搜索、CSV 导出与日志清理（它们作用于行，会话既不能搜也不能导出），并换成区间与"只看真人"两个开关。
- demo 模式：`src/client/demo/backend/routes/share.ts` 用同一份样例行按同一规则折叠，三种状态（空 / 单会话 / 多会话）都能看到。

## 成本读数（2026-09-21，实现后实测）

在测试基座（node:sqlite，进程内）上种 20 万条访客行（4000 个指纹、30 天窗口、单账号），跑真实语句：

| 项 | 读数 |
| --- | --- |
| 窗口行数 | 200000（`idx_share_visits_user_time`，`SEARCH ... USING INDEX`） |
| 语句数 | 每页 1 条（`range=all` 时另有 1 条读预算语句） |
| 整条语句 | 2.1–3.4 s（同一台机器重复运行间波动 ±10% 以上） |
| 只折叠、不连笔记 | 1.6–2.7 s |
| 返回 | 25 个会话 |

结论：**成本由窗口决定，不由页大小决定**（限 25 条也要先看遍窗口内的行）——这是派生方案的固有代价，也正是读预算只对无界区间计费的原因。语句的其余部分已把笔记分组限制在页内（`note_totals` 连 `page`），但这一点**无法从读数里分辨**出来（差异落在运行间噪声内），因此不写成"提速百分比"。

**索引：不新增**（本次未做任何索引改动）。计划已经用到既有的 `idx_share_visits_user_time`；计划里的 `USE TEMP B-TREE FOR ORDER BY / GROUP BY` 来自窗口函数与分组，靠索引消不掉，而能消掉它的覆盖索引会落在最热的写入表上——这与 SH-73 的结论一致。

> 读数来自进程内 sqlite，不等于 D1 上的绝对值；它回答的是"成本随什么增长"，即本 ADR 需要的那个问题。
