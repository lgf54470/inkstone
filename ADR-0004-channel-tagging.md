# ADR 0004: 渠道标记（`?ref=`）的采集口径与隐私边界

Status: Proposed（未实现，待评审）

Date: 2026-09-21

## Context

所有者把同一个链接发到不同地方（邮件、群聊、二维码、博客页脚），但系统只能看到浏览器的 `Referer`：

1. **同源与 App 内打开一律是 Direct**：`isSelfReferrer()` 会把同源跳转标成 self-referrer（默认被排除），而微信、QQ、邮件客户端、扫码打开**根本不发 Referer**，所以"这条链接是我发的哪一份"无法回答。看板的 `topReferrers` 把这一大类压成一行 `Direct`（`localizeReferrerName('Direct') → share.direct_access`）。
2. **二维码是一等公民但来源不可分**：`qr-export` / `share.qr_code_title` 已经能把链接变成可扫的码，而扫描与"直接粘贴到浏览器"在数据上完全一样。
3. **写入路径与清洗已存在**：公共页 `POST /api/public/:slug` 校验 `shareAccessSchema`（`password?`、`referrer?`），`sanitizeVisitReferrer()` 负责把 referrer 规范化成 host 并判定 self-referrer；访客行有 `referrer`、`referrer_host`、`language`、`user_agent` 等字段，`share_visits` 是唯一写入表。
4. **隐私姿态是明确的**：只存聚合所需的字段、指纹按 UTC 日轮换（ADR-0003 记录了它的三条推论）、UV 口径对用户可见（SH-83）、日志按保留期清理、链接级删除（SH-63）必须能删干净。任何新采集字段都要在这套姿态下被论证。

本 ADR 要定的是**要不要采集、采什么、存哪里、谁能关掉、以及文案怎么说**——不是实现。

## Decision

### 一、采什么：一个受字符集约束的短标记，而不是任意字符串

- 允许在公开链接后附 `?ref=<token>`，`token` 必须匹配 `^[a-z0-9][a-z0-9_-]{0,31}$`（小写字母/数字/连字符/下划线，1–32 位）。
- **不匹配就不采**：既不落库、也不报错（访客不该因为所有者拼错参数而看到错误页），但**在所有者侧如实呈现**——看板的渠道分解里出现一行 `share.channel_unrecognized`（"未识别标记"）并**单独计数**，而不是静默并进 Direct。这正是 AGENTS 铁律 2「不静默降级」在这条路径上的落点。
- **绝不存储原始 `?ref=` 的原始串、query string 或任意 UTM 全家桶**：字符集约束就是数据最小化的实现方式（拒绝一切可能承载个人信息的自由文本）。
- 采集时**同时**把已有的 `referrer_host` 照常记录，两者不互相替代：`ref` 回答"哪一份发出物"，`referrer_host` 回答"浏览器从哪来"。

### 二、存哪里：访客表加一列，随保留期一起消失

- 方案 A（推荐）：`share_visits` 新增可空列 `channel TEXT`，在写入访客行时一并写入。
  - 迁移：**只增不改**（`ALTER TABLE ... ADD COLUMN`），新 migration 编号追加；`check-migration-immutability` 与 `schema-migrations.test.ts` 守卫。
  - 老行为 null，语义为"没有标记"（与"标记未识别"不同，两者在 UI 上必须区分）。
  - 清理：与访客行同生共死，保留期扫除与链接级删除（SH-63）无需新逻辑。
- 方案 B（新 `share_channels` 维表 + 外键）：为三个取值建一张表，收益是省几个字节，代价是一次 join 与一套孤儿清理。否决。
- 方案 C（只存进 `referrer_host` 合成一个伪 host，如 `ref:newsletter`）：复用现有列、零迁移，但把两种含义混进同一个字段，会让 `topReferrers` 的清洗与 self-referrer 判定多出一个特例分支。否决。

### 三、谁能关掉，以及默认值

- 新增账号设置 `ShareSettings.collectChannel: boolean`（默认 **true**，因为它采集的是所有者自己写进链接的东西，不是访客的隐私数据），控制面板与 `share.visitor_count_note` 的同一位说明它采什么。
- 关闭时**写入端不落任何 channel 值**（不是"落了但不展示"——不采集就是不采集），且设置随账号同步（与 `visitLogRetentionDays`、`staleLinkDays` 同层，因为它同样是"服务端行为"）。
- 生成端：二维码与"复制链接"面板提供一个可选的"标记"输入（`share.channel_prompt`），把标记写进 URL；批量为 N 条链接加标记时同样走这一处，避免出现两套拼 URL 的代码。

### 四、读出来：分解卡 + 导出列

- `ShareGlobalAnalytics` 增加 `channels: ShareBreakdownItem[]`（与 `topReferrers` 同形状、同百分比口径），看板在其旁新增一张卡（或在现有 Referrers 卡内加一节）。**null 与"未识别"分开计**：`share.channel_none`（未标记）与 `share.channel_unrecognized`（标记无效）。
- 访客 CSV（SH-79 的 `exportVisitsToCsv`）增加一列 `Channel`；导出文件名与既有列顺序不变，新列追加在末尾（避免破坏依赖列序的脚本）。
- 单条分享的分析弹窗同样显示渠道分解（看板与单篇两个分析接口共用的合成路径要保持一致，否则同一个链接在两个界面给出不同的渠道统计）。

## Consequences

- 采集是可选的、有界的、随保留期消失的；**它不会**让系统知道"谁"看了——指纹的日轮换、无 cookie 姿态都不变（本 ADR 不触碰 ADR-0003 的三条推论）。
- 标记是**所有者可控的**：任何人手动把 `?ref=` 改成别的合法 token 都会改变归属（这不是防伪）。文案不得暗示它是可信来源；它是分发归属，不是身份。
- `?ref=` 必须**不参与**公共页的缓存键与资源会话：URL 带查询串时静态资源与 `/s/:slug` 页面仍返回同一份内容（`Cache-Control: no-store` 已确立），但要确保新增参数不被写进任何"分享链接"的持久字段（`shares` 表存的是 slug，不带 query，保持不变）。
- 若将来要做"渠道 → 转化"这类分析，需要跨会话关联，会撞上 ADR-0003 的边界；那时必须新开 ADR，不能在本 ADR 上叠加。

## 验证

1. **字符集与边界**：32 位合法 token 通过、33 位被拒、含空格/中文/大写/`%2e`/控制字符被拒；被拒时访客行**仍写入**（日志不断），但 channel 为 null。断言"无效标记不会让公共页返回 4xx"（用一条参数化用例钉死）。
2. **设置开关**：`collectChannel: false` 时不写入任何 channel；打开后写入；开关是账号级（另一个浏览器打开同账号读到同样的值）。
3. **删除与保留**：链接级删除（SH-63）与保留期扫除之后，渠道分解里不再出现这些行（派生自访客行，天然满足，但要有断言）。
4. **UI 三态**：渠道卡的空/有数据/未识别并存三种状态；`unrecognized` 与 `none` 的文案不得相同（断言两个 message id 不同）。
5. **CSP/注入**：token 只以文本节点渲染（不使用 `dangerouslySetInnerHTML`），并补一条"标记内容不会进入 HTML 属性"的断言。
6. **i18n**：新增键双语齐全（`i18n:check`），中文只在 zh-CN 资源里出现。

## 待评审的问题

1. 默认开启还是默认关闭？本文倾向开启（采的是所有者自己写的东西），但若认为"任何新采集默认应关闭"，改默认值即可，代价是绝大多数账号看不到这个功能。
2. 标记是否需要按链接分别配置（同一个 note 发到两个渠道需要两条分享）？当前模型里一条分享一个 slug，多渠道需要多条分享或一个标记维度；后者会显著扩大范围，暂不做。
3. 无效标记是"单独计数"还是"直接忽略"？本文取前者（可见的不静默），但它会让渠道卡多出一行恒为 0 / 非 0 的状态，需要确认视觉上可接受。
4. 二维码上是否需要把标记印成可见文字（便于人手核对），还是在生成端只写进 URL（码面更干净）？
