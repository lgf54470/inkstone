# ADR 0006: 观众侧同步放映（`/s/<slug>` 的跟随位置）

Status: Proposed（**未实现**；本 ADR 先于代码，按 `AGENTS.md`「公共契约与弃用策略」与台账 R2-7 的前置要求写在此处）

Date: 2026-10-04

## Context

放映目前是**一台设备上的一个画面**。分享模块已经把「把这篇笔记给不用 Inkstone 的人看」这条路走通了（`src/worker/routes/share/public.ts:72` 的 `POST /api/public/:slug` 返回 `{title, content, author, share}`，密码门与限速都在），但观众页只渲染静态正文：`src/client/features/share/share-page/use-share-page.ts:65-77` 把富媒体按 `slides: 'snapshot'` 画成静照，整个 `src/client/features/share/` 里没有 `location.hash`、没有 `hashchange`、没有 `#slide`。`?present=1` 这个参数**今天不存在**——`src/client/app.tsx:174` 之前没有任何分支读它，落到 `ShareRoute` 后无人认领（全仓 grep `present=1` 零命中）。

于是远程/混合场次只剩两种做法：演讲者开屏幕共享，或者演讲者口述「翻到第三页」。前者要额外的基础设施，后者在 20 人的会上不可用。reveal.js 把这件事叫 multiplex 并明写 "everyone will follow… on their own device"。

要把「位置」送到观众设备上，绕不开四件既有事实：

1. **没有观众身份，也不该造一个。** `ADR-0003` 的隐私姿态写死了：唯一访客标识是 `share_visits.visitor_fp`（按 UTC 日轮换盐的 HMAC），且「若将来有人想加 cookie / 设备 id 来实现跨日跨设备档案，那是一次隐私姿态的改变，必须新开 ADR」。本 ADR **不**改这条姿态：它不申请、不接受、不存储任何新的访客标识（见「决策·五」）。
2. **公共数据面是 POST + `no-store` + 限速。** `public.ts:60-63` 给分享页 HTML 上 `Cache-Control: no-store` 与 `X-Robots-Tag: noindex`；`enforceShareViewBudget`（`public.ts:96-116`）对 `(slug, ip)` 20 次 / 10 分钟、对 `ip` 60 次 / 10 分钟；密码尝试另有 `share-work:*` 8/60 次与 `throttle.ts` 的递增锁。观众侧的新端点必须落进同一套预算，而不是自成一个便宜的门。
3. **实时基座是登录世界的东西。** `SyncHub` Durable Object 的房间键是**所有者 userId**（`src/worker/routes/sync.ts:253` `get('/ws', requireAuth, …)`、`:266` `idFromName(userId)`），每房间 32 个 socket 上限、origin 钉住；降级轮询走 `GET /api/sync/`，同样 `requireAuth`（`routes/sync.ts:21`）。放映自己的演讲者窗用 `BroadcastChannel`（`presenter-view/use-presenter-channel.ts:7-15`），那是**同一台浏览器内**的两个文档，跨不了设备。
4. **新增持久化要走只增不改的迁移。** `src/worker/db/schema/migrations.ts` 当前到 version 53，受 `check-migration-immutability` 与 `tests/schema-migrations.test.ts` 守卫。

## 决策

### 一、口径：位置是一个数字三元组，观众**默认跟随、可自主脱离**

- **位置 = `{slide, page, step}`**，与放映内部那三个轴逐字同名（`use-presentation-session.ts` 的 `usePresentationNav` 返回值、`deck-position.ts` 的 `DeckPosition`）。观众端**不重新发明页码**：它拿到同一篇已分享的 markdown，用同一套 `splitIntoSlidesWithNotes` + 已量测的计划切自己的 deck，位置只是「第几张、第几页、揭到第几步」。分页与步数依赖**观众自己设备上的量测**（手机上一张幻灯可能是 3 页，桌面上是 1 页），所以位置的语义是「演讲者走到他那一版的那一步」，观众端按 `presentation-state.ts` 现成的夹取规则 (`resolvePageIndex` / `planPageSteps`) 落到自己那版的最近位置——**这一条是刻意的不精确**，写在下面的「后果」里。
- **跟随是一个开关，不是一种强制。** 观众页顶部有一条与放映胶囊同一族语义的「跟随演讲者 / 自己浏览」开关，沿用应用内 `following` 这个词与它的行为（关掉之后位置更新不再改变画面，重新打开即回到现场）。理由与 N-31 那条「跳页落在这页的末态」同源：观众的手已经放在页面上，静默劫持滚动比不跟随更糟。
- **一条分享同时只有一个现场。** 位置的写入者是演讲者（拿到口令、通过 `authenticateShareAccess` 的那一方），写入需要**本场次的一次性能力令牌**（见「三」）。

### 二、传输：D1 上的位置行 + 观众短间隔轮询，不新建 DO 房间

| 方案 | 评述 |
| --- | --- |
| **A. D1 位置行 + 轮询（选定）** | 一次翻页 = 一次单行 UPDATE；观众每 2 s 读一次同一行。强一致（D1 读写同点）、无新绑定、无新 CSP 面、代码复用现成的 `share` 路由族与预算函数。代价是**最长 2 s 的滞后**与每次读取一条 SQL——用 `ETag`/`If-None-Match` 把「没翻页」的读压成 304（见「四」）。 |
| B. 复用 `SyncHub` DO，房间键换成 `slug + token` | 真推送、亚秒延迟。但它要求把**一个 DO 房间向匿名访客开放**：`routes/sync.ts:253` 的 `requireAuth` 与 `idFromName(userId)` 都要分叉，32-socket 上限要按房间重算，origin 钉要放开，`connect-src 'self'` 的 WebSocket 匹配要实测。这是把登录世界的信任边界挪到公共面上，代价远超「少 2 秒」。 |
| C. SSE over `text/event-stream` | 与 A 同样的读路径，但一条长连接挂在 Workers 上直到翻页；Hono 侧要新的流式路由与心跳，`connect-src` 覆盖 EventSource 也要实测。**留作 A 的重开路径**（见「重开条件」）。 |
| D. 位置写进 URL hash | 观众自己分享/hash 变更即跳转，但位置由**观众的设备**决定，演讲者的翻页无法送达；只作为**观众页的本地记忆**（刷新后停在自己那页），不作为同步通道。 |

选 A 的第二条理由是**故障形状**：A 的失败模式是「位置旧了」，B/C 的失败模式是「连接断了」——前者观众自己能看见（数字不动），后者需要额外播报，而且发生在演讲者最不想被打断的时刻。

### 三、令牌与有效期：跟着分享的生命周期走，且比它更短

- **演讲者侧**：在分享页/放映里按「让观众跟随」，服务端铸造 `presentToken`（`secureRandomId()`，与演讲者窗 `use-presentation-session.ts:162` 同一把发生器），**只存哈希**（`sha256`，与会话 token 的既有口径一致）。令牌是能力：没有它，观众端点连「这场正在放」都不该回答。
- **观众侧**：URL 携带 `?present=<token>`（**不是** `?present=1`——见「七」的兼容性裁定）。口令保护的分享必须先过 `authenticateShareAccess`，观众与演讲者走的是同一道门，不存在绕过密码的旁路。
- **有效期**：`expires_at = min(share.expires_at ?? ∞, now + PRESENCE_TTL_MS)`，`PRESENCE_TTL_MS = 2 小时`（一场报告的上限，超时即视为散场）。行只在同一 `(share, token)` 上被覆盖，不累积历史——**位置不落日志、不进 `share_visits`、不留「谁看过哪一页」**。
- **撤销**：分享被禁用 / 过期 / 删除时位置行随之失效（外键 + 与 `shares` 同级的 `is_enabled` 检查，复用 `loadShareOrThrow` 那句「未知、已撤销、已过期回答完全相同」的口径）。令牌被显式收回时删行。

### 四、公共契约（新增，全部加法）

- 新增 **`POST /api/public/:slug/present`**（读位置，观众侧）：入参 `{token}`，返回 `{slide, page, step, updatedAt, title}`；`ETag` 为位置串的哈希，命中 `If-None-Match` 返回 304 且**不**记任何日志。`Cache-Control: no-store`、`X-Robots-Tag: noindex`，与 `public.ts:60-63` 同形。
- 新增 **`POST /api/share/:slug/present`**（写位置，所有者侧，`requireAuth`）与 **`POST /api/share/:slug/present/start|stop`**（铸造/收回令牌，返回明文令牌**一次**，之后只能收回）。所有者侧沿用 SH-81 的读预算语义与 `requireAuth`，不给匿名开放。
- 新增迁移 version 54：`share_presence(share_id, token_hash, slide, page, step, updated_at, expires_at, PRIMARY KEY(share_id))`。写路径每翻页 1 条 UPDATE，读路径每观众每 2 s 1 条 SELECT。
- **限速（新键，不共用浏览预算）**：`(slug:ip)` 30 次 / 10 分钟、`ip` 120 次 / 10 分钟用于**位置读**（2 s 心跳 = 10 分钟 300 次，因此**必须**配合 304 与 `follow=off` 时才降频；实测若超预算，先把心跳改成 4 s 而不是抬预算）。写侧 `(share_id)` 120 次 / 10 分钟（一次报告翻不过这么多页；超了是脚本，不是人）。令牌铸造 8 次 / 10 分钟 / 所有者。全部走 `worker/lib/throttle.ts` 的同一引擎与递增锁，键名前缀 `share-present:`。
- **访客分析口径不变**：进入观众页仍只记一条普通 `share_visits` 行（`recordShareVisit` 原样），**位置读不产生访客行**，`?present=` 不进入 `visitor_fp`、不进入去重键、不进入 `ADR-0004` 的 `channel` 字段（那条 ADR 的「新增参数不被写进任何分享链接的持久字段」同样适用于令牌——**令牌绝不落库为链接的一部分**，只存在于观众 URL 与会话内存里）。
- **不新增访客标识**：观众端不写 cookie、不写 localStorage id、不做设备指纹；令牌由演讲者铸造并**由观众自行携带**（URL 复制粘贴即入会），页面刷新时用 `sessionStorage` 保留**自己这一份**位置记忆，那不是标识（不含跨会话可关联的信息，且用户可随时清）。

### 五、数据最小化（把「谁在哪一页」明确排除在外）

服务端**不做**观众计数、不做逐页停留、不做「谁掉线了」。UI 上观众数只显示**当前连接数以外**的东西都没有——因此界面不得出现「38 人正在观看」这类需要新采集的数字；如果将来要显示，按 `ADR-0003` 的教训另开 ADR，不得作为本 ADR 的改进顺手做掉。

### 六、UI 与可访问性

- 观众页的放映模式复用放映模块的纯函数面（`slide-pagination.ts`、`slide-html.ts`、`deck-position.ts`、`slide-canvas.tsx` 的 `applySlidePage`）与 `presentation.css` 的令牌样式，**不复用** `usePresentationSession`（它绑定笔记 store 与所有者会话）。这是一条真实的拆分要求：现有 `PresentationOverlay` 从 `usePresentation` 与 `useNotes` 取数（`presentation-overlay.tsx:21-31`、`use-presented-note.ts:68-73`），观众页没有这两样。
- 位置到达要**能被听见**：观众端的 live region 播报「演讲者到了第 3 张第 2 页」（与放映同一句 `describeDeckPosition`），且脱离跟随后不再播报。
- 键盘：观众端的翻页键仍归观众（他自己也是使用者），跟随开关必须键盘可达、有可访问名称；三态（未开始 / 进行中 / 已结束）走 `role="status"`。

### 七、兼容与弃用

- **无既有行为被改变**：`?present=` 之前无人读取，观众页仍按原样渲染静态正文；不加参数即与今天完全一致。**因此没有 deprecation 窗口要开**——台账 R2-7 那句「须走弃用周期」在这里的落法是：本 ADR 承诺的对外形状（URL 参数、端点、位置三元组）按公共契约对待，将来任何一次**破坏性**改动（例如位置从三元组改成不透明游标）才走「deprecation 标记 + 迁移窗口 + 到期删除」。
- 明确写下**已知的不精确**，供日后判定是否可以改口径：观众端的分页由自己的设备量测决定，所以「第 2 页」在小屏上可能对应演讲者的第 1 页。若这需要收敛，方案是**演讲者端把已量测的页边界随位置一起下发**（多一份数据、少一分自由），本 ADR 先不做，留待真实场次反馈。
- 撤销路径：`stop` 收回令牌后，观众端在下一次读（≤2 s）看到 404 并把画面停在原地、说明「放映已结束」。**不**要求观众刷新，也**不**把观众重定向到别处。

## 重开条件（什么时候才允许换成推送）

1. 真实场次里出现「2 s 滞后被明确指出」的诉求，或
2. 位置读的频率把 `throttle` 打到需要抬预算（那时抬预算之前应先做 304 命中率实测），或
3. 需要「观众举手 / 问答」这类**双向**通道——那已经不是同步位置，是新的公共契约，另开 ADR。

满足任一条时，按本 ADR「二·C」的 SSE 或「二·B」的 DO 房间重新评审，并把「匿名可达的 DO 房间」单独当作安全面变更来写。

## 验证（实现时必须逐条落地的证据）

1. **迁移**：version 54 只新增、不改既有语句；`check-migration-immutability` 与 `tests/schema-migrations.test.ts` 绿。
2. **一致性**：单测钉「写后立即读一定读到」（同进程 D1 基座）；观众端夹取规则与放映同源（`resolvePageIndex` 越界回归）。
3. **权限**：无令牌 / 错令牌 / 令牌过期 / 分享被撤销 四种情况回答完全相同（与 `loadShareOrThrow` 同一口径），且**不**泄漏「这场存在过」。
4. **口令分享**：观众必须先通过 `authenticateShareAccess`；带正确令牌但没过口令的请求必须被拒（测试要同时覆盖 `inkstone_share_<slug>` cookie 的 path 边界）。
5. **限速**：位置读、位置写、令牌铸造各自的键在预算耗尽时 429 + `retryAfter`；断言键名不与 `share-view:` 串用。
6. **数据最小化**：断言位置读**不写** `share_visits`、响应体不含任何访客标识字段、`Set-Cookie` 不因位置读而出现（这一条是对 ADR-0003 承诺的代码化）。
7. **缓存**：位置响应必须 `no-store`；304 路径必须 0 次 DB 写。
8. **UI / a11y**：跟随开关的键盘路径、播报的三态、脱离跟随后不再被拽回——jsdom 行为层各一条，必要时补 `scripts/e2e-visual.mjs` 场景（两标签页：一个当演讲者写位置，一个当观众读，断言数字落到同一处）。
9. **demo 模式**：`src/client/demo/backend/routes/share.ts` 与真实后端同一行为，否则演示版要**显式说明**没有观众同步，不得静默缺失（铁律 2）。

## 涉及文件（实现时）

- 新增：`src/worker/routes/share/presence.ts`、`src/worker/routes/share/public-presence.ts`、`src/shared/types/share-presence.ts`、迁移 version 54、`src/client/features/share/share-present/*`（观众端宿主）、本 ADR 的实现记录段。
- 修改：`src/client/app.tsx`（`?present=` 读取与观众端路由分支）、`src/worker/app.ts`（挂公共子路由，注意 `PUBLIC_PAGE_PREFIXES` 与安全头）、`src/worker/routes/share/index.ts`（所有者侧）、`src/client/features/share/share-page/*`（跟随开关）、`src/shared/locales/{en-US,zh-CN}/*`（文案两语）。
- 不动：`SyncHub`、`/api/sync/*`、`share_visits` 的写路径与指纹口径。
