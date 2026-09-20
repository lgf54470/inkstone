# 分享中心（share）审查报告

- 审查日期：2026-09-19
- 审查范围：`src/client/features/share/**`（~4,600 行）、`src/worker/routes/share/**`（~1,400 行）、`src/worker/lib/share-analytics.ts`、附件通道 `src/worker/routes/files/library.ts`、公开页 `src/client/features/share/share-page/`、共用组件 `big-svg-chart.tsx` / `dashboard-blocks.tsx`、`share_visits` 索引与 cron 清理。
- 方法：三路并行审查（UI/规范、服务端安全、性能/状态）+ 主代理逐条复核高危结论。安全侧部分结论在本地 `INKSTONE_EPHEMERAL_DEV=1` workerd 实例（真实 D1）实测，标记 `[实测]`；其余为读码静态推断，标记 `[静态]`。
- 严重度：P0 数据/安全立即修 · P1 高 · P2 中 · P3 低。

---

## 一、总体结论

分享中心整体架构是健康的：口令走 scrypt + 常量时间比较、token 100-bit 随机、管理面全部按 session userId 收口（跨账号 IDOR 实测未发现）、SQL 全绑定无注入、公开页 markdown 走 DOMPurify 白名单且 CSP 逐响应 nonce、visit 写入用 `waitUntil` 不阻塞响应、日志分页下推 SQL。这些不需要动。

问题集中在三处：

1. **「暂停/撤销」不是真正的关闸**——附件通道与分析数据独立于分享状态，owner 的心智模型（暂停=对外不可见）与实现不符，属正确性+安全双缺陷。
2. **规模假设缺失**——列表/批量接口在 ≥100 条分享时必然 500（D1 变量上限，图谱模块已踩过同一坑并有测试基座常量，分享模块漏了）；`range=all` 让看板与列表两个接口退化为全历史扫描。
3. **看板是「口径事故多发区」**——截图里 5 个可疑现象全部有真实代码根因（见第三节对照表），本质是统计口径（区间/全时段、状态分类、空态渲染）没有单一真相源。

另有两条**破坏性数据风险**必须最先处理：保留期选「无限」后再点「清理早于保留期的日志」会误删 30 天前全部日志（`0 || 30` 兜底）；`share_visits` 服务端无任何自动清理与级联删除，笔记 purge 后访客数据永久残留且继续计入统计（违反 AGENTS 隐私「保留期限、删除/导出要求」）。

修复建议分 5 批（见第四节），批次 1/2 共 8 条建议合成本周工作；UI 层问题多数代价小但数量多，建议按批走并同步 blog 侧同构组件（第 25 条）。

---

## 二、问题台账

### A. 安全与数据正确性（服务端）

#### SH-01 [P0][实测] 「暂停分享」不切断附件下载通道
- 现象：owner 点「暂停」后正文 403，但匿名访客（及 12h 内持有旧口令 cookie 者）仍可下载该笔记全部附件。
- 根因：正文端点检查 `is_enabled = 0 → 403`（`src/worker/routes/share/public.ts:94-96`），而附件授权查询完全没有该条件——`loadAttachmentShare` 的 WHERE 只有 `deleted_at IS NULL` 与 `expires_at`（`src/worker/routes/files/library.ts:112-124`），无口令分享随即 `return true`（`:102`）。
- 修改方案：`loadAttachmentShare` 补 `AND s.is_enabled = 1`，与正文判定抽同一个 `loadLiveShareForAssets()`；暂停/撤销路径显式失效 `share_asset_sessions`。
- 涉及范围：`files/library.ts`、`share/public.ts`、`share/note.ts`。代价：小。
- 建议：连同回归测试（暂停→附件 403）放批次 1。

#### SH-02 [P0][实测] 分享数 ≥100 时列表与批量接口必然 500
- 现象：120 条分享时 `GET /api/share` → 500（`D1_ERROR: too many SQL variables`）；批量 disable/revoke 120 ids 同样 500。任何分享较多账号打不开分享中心。
- 根因：`loadNoteVisitStats` 把整页（`LIMIT 500`）`note_id` 展开成 `IN (?,?,…)` 绑定（`src/worker/routes/share/shares.ts:329-350`）；`batch.ts:17` 允许 `slice(0, 1000)`。D1 绑定参数上限 100 已被测试基座建模（`tests/d1-harness.ts:58`），且图谱模块同类问题已修过（commit `e668f20c`），分享模块漏了同一处理。
- 修改方案：复用图谱的分块聚合或改 `WHERE note_id IN (SELECT … LIMIT 500 子查询)`；批量接口对 >99 ids 显式 400 或分块执行；补 ≥120 分享规模回归。
- 涉及范围：`share/shares.ts`、`share/batch.ts`、`tests/share-routes.test.ts`。代价：中。

#### SH-03 [P0][实测] 无口令公开端点零限流 + 每次访问无条件写库
- 现象：同一 IP 换 UA 连打 6 次 → 新增 6 行 visit、`shares.views` 3→8；400 次随机 slug 探测无任何 429。owner 统计可被单机线性灌水，D1 读写配额可被打穿。
- 根因：限流/锁定全部在 `authenticateShareAccess` 内，无口令分享直接 `return null`（`public.ts:107`）；visit 写入无条件执行（`public.ts:74,211-222`），去重只看 `visitor_fp`，而指纹输入含可伪造的 UA（`:195-201`）。博客同类公开写接口已有限流（`routes/blog/public-links.ts:106-113`），分享侧缺失。
- 修改方案：把 `consumeAttemptBudget` 提到 `POST /api/public/:slug` 入口（slug+IP 读预算）；去重命中/`is_bot=1` 时跳过 INSERT；去重键不依赖 UA。
- 涉及范围：`share/public.ts`、`lib/share-analytics.ts`、复用 `lib/throttle.ts`。代价：中。

#### SH-04 [P1][静态] 访客指纹用公开可推导的日盐，等于未加密钥的哈希
- 根因：`computeVisitorFingerprint` 的 `serverSecret` 形参默认 `undefined` → 盐为 `SHA-256("inkstone-default-salt:"+UTC日期)`，完全公开（`src/worker/lib/share-analytics.ts:227-256`）；两个调用点（`share/public.ts:184`、`blog/visits.ts:39`）都不传密钥。IPv4+有限 UA 可全域暴力反查，任何拿到 `share_visits` 的渠道可还原访客 IP+UA；同一天内可跨 owner 关联同一访客。
- 修改方案：从 env/`CREDENTIAL_VAULT` 取实例级密钥走已备好的 HMAC 分支；盐按 `user_id` 域分隔；密钥缺失时拒记 fp 而非退化。
- 涉及：`lib/share-analytics.ts`、两个调用点、`wrangler*.toml`。代价：小。

#### SH-05 [P1][实测] `share_visits` 无保留期执行、无级联删除，purge 笔记后孤儿行继续计入统计
- 根因：cron 清理集合不含 `share_visits`（`src/worker/lib/maintenance.ts:11-46`、`src/worker/index.ts:33-47`）；笔记 purge 路径（`notes/lifecycle.ts:233-254`、`trash.ts:40-59`）与 `DELETE /api/share/:noteId` 都只删 shares/asset_sessions 不删 visits。实测撤销分享、删除笔记后 visit 保留，`analytics/global?range=all` 仍把它算进 `totalViews`，日志列表显示 `noteTitle: "Untitled note"`。同时保留期设置只存浏览器 localStorage（见 SH-14），换设备即失效。
- 修改方案：cron 按服务端持久化的保留策略分批清理；purge/撤销路径同步删 visits（或提供按 note 粒度的删除入口）；`GET /api/share/visits` 与全局统计 join 存活分享。
- 涉及：`maintenance.ts`、`notes/lifecycle.ts`、`trash.ts`、`share/note.ts`、`visits.ts`。代价：中。

#### SH-06 [P1][静态] `range` 参数无白名单校验，任意串等价「全历史」
- 根因：`analytics.ts:148` 把 `range` 裸 cast 成 `ShareTimelineRange`；`getRangeStartTimestamp` 对任何非 `24h/7d/30d` 取值（含 `all` 与垃圾串）返回 0（`lib/share-analytics.ts:287-292`）。实测 `?range=zzz` → 200 且回显 `"zzz"`。与 SH-19（性能侧全表载入）同根。
- 修改方案：`z.enum(['24h','7d','30d','all'])`，非法回退 `30d`；`all` 走 SQL 聚合而非拉行（见 SH-19）。
- 涉及：`analytics.ts`、`schemas.ts`。代价：小。

#### SH-07 [P2][实测] 公开失败分支五种响应可枚举分享状态；自定义 slug 最低 3 字符
- 根因：404/403/401+不同 code 区分「不存在/暂停/过期/需口令/口令错」（`public.ts:64,93,95,97,109,141`），且 404 路径不消耗任何预算（SH-03 叠加）；`CUSTOM_SLUG_RE` 允许 3 字符（`lib/id.ts:29-33`），人类可读短 slug 可被词典爆破。`check-slug` 还是跨用户占用预言机（`organizer.ts:29-38`，登录态）。
- 修改方案：失败分支统一 404 体、口令分支统一 401 不区分 code；`/api/public/*` 全局 per-IP 预算；slug 最小长度提到 6 + 词典校验；`check-slug` 跨 owner 只回布尔。
- 涉及：`public.ts`、`id.ts`/`share-analytics.ts`、`organizer.ts`。代价：小。

#### SH-08 [P2][实测] `referrer` 无长度上限、任意 scheme 原文入库且全链路无人使用
- 根因：`schemas.ts:29-32` 无 `.max()`；`public.ts:233-248` 只做可解析性判定后整串入库。实测 `javascript:alert(...)` 与 7KB 长串均原样存下。展示层只用服务端解析的 `referrerHost`，原串是零业务价值的攻击者可控持久文本，未来任何人渲染成 `<a href>` 即成 owner 面板存储型 XSS。
- 修改方案：`.max(512)` + 协议白名单（http/https/android-app/ios-app）；只存 host（+path 摘要），原串不落库。
- 涉及：`schemas.ts`、`public.ts`。代价：小。

#### SH-09 [P2][静态] 分享口令强度与爆破窗口偏松；超长口令静默截断
- 根因：分享口令下限 6（`note.ts:133-135`，账号口令为 8）；每 slug 40 次免费失败/小时 + 每 IP 8 次/10min scrypt 预算（`public.ts:112-127`）；`public.ts:66-68` 把口令 `slice(0,128)` 截断，>128 的正确口令静默 401。
- 修改方案：下限对齐 8；免费失败降到 10；超长直接 400。代价：小。

#### SH-10 [P2][静态] 批量接口回「请求条数」而非受影响行数，`enable` 非原子
- 根因：`batch.ts:57,76,104` 回 `noteIds.length`（实测非本人笔记 id 也计入 count）；`enable` 逐条 2 次往返无事务（60 条 583ms 线性放大，中途失败半完成）。
- 修改方案：回 `meta.changes`；`enable` 分块 UPSERT 包 `db.batch()`。代价：中。

#### SH-11 [P3][静态] LIKE 通配符未转义
- 根因：`shares.ts:281-285`、`visits.ts:110-114`、`organizer.ts:91-93` 的搜索值里 `%`/`_` 仍是通配符（同账号作用域，无跨用户影响）。统一转义 + `ESCAPE '\'`。代价：小。

#### SH-12 [P3][静态] `DELETE /api/share/visits?type=all` 单次调用销毁全部分析，无重认证
- 根因：`visits.ts:76-84`；会话被盗即可清审计痕迹。`lib/reauth.ts` 已有能力，加 `requireRecentAuth`。代价：小。

#### SH-13 [P3][实测+静态] slug 一致性小缺口集合
- 并发抢注同 slug 撞主键返回 500 而非 409（`note.ts:115-123` 查重与写入非原子）；改 slug 后旧 `share_visits.slug` 悬空；`DELETE /api/share/:noteId` 不清 `share_asset_sessions`（旧行滞留 ≤12h，因分享行已删而实际失效）。逐项小修。代价：小。

### B. 破坏性操作与数据风险（客户端驱动）

#### SH-14 [P0][实测] 保留期选「无限」(0) → 清理时兜成 30 天 → 一键误删历史日志
- 现象：设置里把保留期选「无限」（选项值 `'0'`，`share-settings-modal.tsx:108,115`）保存后，点「清理早于保留期的日志」实际执行 `DELETE FROM share_visits WHERE visited_at < now-30d`，与所选策略完全相反且不可撤销。
- 根因：保存路径 `parseInt(retentionDays, 10)` 直存 0（`use-share-settings-modal.ts:51`），清理路径 `parseInt(...) || 30` 把 0 当假值兜底（`:64`）；worker `visits.ts:122-124` 再 `Math.max(1, days)`。三段各自「合理」，合起来语义翻转。
- 修改方案：用 `null`/判别联合显式表达「无限」；「无限」时禁用该清理项；确认弹窗文案与 DELETE 用同一个已解析常量。
- 涉及：`use-share-settings-modal.ts`、`share-settings-modal.tsx`、`visits.ts` 参数校验。代价：小。
- 备注：`maxLogRecords` 保存后服务端无任何实现（见 SH-19b），属「设置项是假的」同类问题，一并处理。

#### SH-15 [P1][静态] 行内开关可把未分享笔记直接发布为公开链接，无确认无反馈
- 根因：表格/卡片行的 `Switch` 走 `api.share.create(noteId, { isEnabled })`（`share-store/shares.ts`），一次误点即对外公开；且该行开关无 `label`（见 SH-24）。
- 修改方案：从未分享过的笔记首次开启走确认 + 成功 toast（含链接可见提示）；关闭保持即时。代价：小。

### C. 性能与状态

#### SH-16 [P0][静态] `range=all` 看板：把整张 `share_visits` 拉进 Worker 内存，只为画一条恒为空的 1970 年时间轴
- 量级：`loadRangeVisits` 无 `LIMIT`（`analytics.ts:180-199`），`all`→`startTs=0` 即全历史；UV 在内存里 `new Set(rows.map(...))` 算（`:234`）。同时 `duration` 单独兜底 30 天（`:156`），分桶落在 1970-01-01~31（`lib/share-analytics.ts:304-331`），时间轴 100% 为空——全额成本、零收益。10 万行级账号一次请求即消耗 D1 月读配额 2%。
- 修改方案：时间轴/UV 下推 SQL（`strftime` 分桶 + `COUNT(DISTINCT visitor_fp)` GROUP BY）；`all` 以 `MIN(visited_at)` 为起点按粒度分桶；聚合查询强制行数上限。顺带把 `analytics.ts:64-71` 的 6 次串行 await 并入 `db.batch`。
- 涉及：`analytics.ts`、`lib/share-analytics.ts`。代价：中。
- 关联：与 SH-06（range 校验）、UI 侧「全部区间图表现为 1970 年」同根，必须同批修。

#### SH-17 [P0][静态] `/api/share` 列表接口本身是分析级聚合：7 次串行 D1 往返 + 无时间界 `COUNT(DISTINCT)` + tags JSON `LIKE`
- 根因：`shares.ts:109-127` 三段串行、`loadShareGlobalStats` 内再 5 次串行（`:203-245`）；`:217-223` 全时段 `COUNT(DISTINCT visitor_fp)` 无索引覆盖（`share_visits` 无任何含 `visitor_fp` 的索引，`indexes.ts:38-47`）；`:186-201` 标签匹配用 `s.tags LIKE '%'||name||'%'` 无索引扫描，O(标签×分享)。列表成本≈看板成本，但调用频率高一个数量级（见 SH-18/20/21）。
- 修改方案：列表与全局统计拆端点；统计走增量/物化；加 `(user_id, visited_at, visitor_fp)` 覆盖索引；tags 改关联表（此项偏大，可先做端点拆分+batch 化）。代价：大（可分期）。

#### SH-18 [P1][静态] 搜索框每次按键直发一个 SH-17 重请求：无防抖、无 abort、无缓存
- 根因：`share-hub-toolbar.tsx:22` → `filters.ts:19-22` 每次 `setSearch` 即 `void loadShares()`；`loaders.ts:32-62` 无 signal，乱序只靠 `loadEpoch` 屏蔽结果不取消请求。同仓已有正确范式：`note-list.tsx` 的 `useDeferredValue`、本模块 slug 校验的 300ms 防抖（`use-share-edit-modal.ts:136-148`）。
- 修改方案：250-300ms 防抖 + `AbortController` + 同参数在途去重。代价：小。

#### SH-19 [P1][静态] App 启动即为侧栏角标拉整个分享列表（重请求 ×1 + 最多 500 行常驻内存）
- 根因：`sidebar.tsx:43-46` mount 即 `loadShares()`，只为 `shareCount` 与行内「已共享」标记（`note-row-state.ts:23-28`）。99% 会话不使用分享中心。
- 修改方案：轻量 `/api/share/summary`（计数 + noteId 集合）；完整列表延迟到面板打开；或 notes 列表响应直接带 `isShared`。代价：中。

#### SH-20 [P1][实测产物] share 特性实际未 code-split：`qrcode.react` + 5 个 modal 全部打进 shell 块，两处 `lazy()` 无效
- 量级（`dist/client` 2026-09-17 实测）：`share-*.js` 143.6KB raw/30.5KB gz + `qrcode.react` 16.2KB，合计约为 shell 块的 70%（raw），登录后首屏必载。
- 根因：`features/share/index.ts` 宽 barrel 同时导出 store 与全部 modal；`note-row-ui.tsx:11`、`note-row-items.tsx:24` 静态 import modal 组件，使 `app-shell.tsx:29-30` 的 `lazy(() => import('../share'))` 与 shell 同块。门禁盲区：`check-vendor-isolation.mjs` 只算 `index.html` 静态闭包，报 OK 但 shell 路由块实际携带。
- 修改方案：barrel 拆 `share/store`（可静态）与 `share/modals`（只允许 lazy）；行内 modal 改点击时动态 import；门禁改按路由块检查。代价：中。

#### SH-21 [P2][静态] 打开分享中心固定 6 请求，folders/tags 各重复 1 次；任何写操作全量重拉列表
- 根因：`loaders.ts:47-48` 隐式 `loadFolders/loadTags` 与 `use-share-hub-sidebar.tsx:81-83` 的 effect 重复（Modal 关闭即卸载子树，每次开合重跑）；`shares.ts` 各 toggle/batch 成功后 `loadShares()` 全量重拉（一次 pin = 1 PUT + 7 次 D1 往返），失败路径还再拉一次。
- 修改方案：加载守卫（TTL+在途去重）；写成功用响应体 patch 单行，仅冲突时重拉。代价：小-中。

#### SH-22 [P2][静态] 列表渲染无 memo/虚拟化，每行无条件构建目录菜单
- 量级：500 行 × 20 目录 ≈ 1 万 JSX 元素/渲染；`folders.find` O(行×目录)；11 个内联回调使 memo 失效；任一勾选即全表重渲。
- 根因：`share-table-view/index.tsx:41-59`、`row.tsx:74`（`items={buildFolderMenuItems(...)}` 每次渲染都构建）、`share-item-common.tsx:19-40`。
- 修改方案：`Menu` items 惰性化；folders 建 Map；行组件 `React.memo` + 容器 `useMemo` handler；>100 行评估虚拟化。代价：中。

#### SH-23 [P2][静态] 每个笔记行订阅整个 `shares` 数组线性 find：O(n²) + 分享写操作重渲整个笔记列表
- 根因：`note-row-state.ts:23-28`、`note-list.tsx:309`、`use-workspace.ts:68`。store 派生 `Map<noteId, ShareRow>` 后选择器改原始值订阅即可。代价：小。

### D. UI / 交互 / 规范

#### SH-24 [P1][静态] 看板与单篇分析无失败态，故障静默显示 0（违反三态铁律）
- 根因：`use-share-dashboard-view.ts:27-31` catch 只 `console.warn` 不 setError 不清数据；视图无条件 `analytics?.totalViews ?? 0`（`share-dashboard-view.tsx:121-127`）；`use-share-note-analytics.ts:25-27` 连 loading 分支都没有。网络失败会被读成「没有流量」。
- 修改方案：hook 返回 `{data, loading, error}`，视图走 `role='alert'` + 重试。参照本模块唯一合规面 `share-page/page.tsx`。代价：小。

#### SH-25 [P1][静态] 分享列表首屏失败渲染成「暂无分享」空态（数据恐慌）
- 根因：`loaders.ts:56-61` 失败只 `set({loading:false})`，`shares` 保持空数组；`share-hub-modal.tsx:88-90` 渲染门只看 loading+length，无 error 分支。
- 修改方案：store 增 `error`，首屏失败态+重试按钮，toast 保留。代价：中。

#### SH-26 [P1][静态] 文件夹/标签 CRUD 六处 `catch { return null }` 静默失败（铁律 2）
- 根因：`share-store/content.ts:35,51,65,90,106,121`。同模块 `shares.ts` 已有 `notifyActionFailed()` 范式。代价：小。

#### SH-27 [P1][静态] 「清理日志」菜单仅 hover 可达，且触发按钮没有 onClick——内含「清空全部日志」破坏性操作
- 根因：`share-visit-logs-modal.tsx:152-161` 手搓 `hidden group-hover:block` 下拉，主按钮无 onClick，无 `role=menu`/`aria-expanded`；键盘/触屏完全不可达。仓库已有 `components/overlay/menu.tsx` 全套行为。代价：小。

#### SH-28 [P2][静态] 「实时访问日志」无时间窗过滤——7d 看板里出现 14 天前记录
- 根因：`loadRecentVisits` 只带过滤 clause 不带 `startTs`（`analytics.ts:349-351`），与区间数据 `loadRangeVisits`（`:65`）口径不同；「实时」文案（`realtime_stream`）也不成立（无任何轮询/订阅，一次性 LIMIT 20）。
- 修改方案：`loadRecentVisits` 接受 `startTs`；文案改「最近访问」+手动刷新按钮（或可见性门控的低频轮询）。代价：小。

#### SH-29 [P2][静态] 「设备与操作系统」卡缺空态分支；趋势图把全 0 序列画成「有数据」；PV=0 显示「↗ 0%」
- 三个截图直接肇因，一次修：
  - `DevicesBreakdownCard` 是唯一没写 `EmptyRow` 分支的分解卡（`share-dashboard-view.tsx:332-359`，对照兄弟卡 `:285`）；
  - `big-svg-chart.tsx:24` `Math.max(...values, 1)` 造 1 量程，刻度 `Math.round` 出重复「1」（即截图 1/1/1/0），`:72` 无条件描点使 7 个 0 点贴基线成「数据线」；
  - `computeDelta(0,0)` 返回 0（`lib/share-analytics.ts:282-285`），`dashboard-blocks.tsx:28-35` 对 `delta>=0` 一律配上箭头+success 色。
- 修改方案：全 0 序列走 `ChartEmptyState`；delta 无意义时返回 null，0 渲染中性「持平」；设备卡补空态。注意这三件是 share/blog 看板共用组件，修一次两处受益，回归需同时覆盖 blog（`blog-dashboard-view/audience-cards.tsx:62-88` 同缺空态）。代价：中（共用组件回归面）。

#### SH-30 [P2][静态] 侧栏计数与看板 KPI 口径不一致（三个叠加缺陷）
- 根因：(a) 徽章统计 `FROM shares` 不 join notes，分母含软删笔记的分享，而列表强制 `n.deleted_at IS NULL`（`shares.ts:203-245` vs `:256-279`）；(b) `STATUS_CONDITIONS.expiring` 与 `expired` 重叠，分类非互斥，徽章之和≠全部；(c) 侧栏底部「累计访问量」是全时段、看板「总访问量」是区间值，同屏近义标签。另有服务端 `LIMIT 500` 且 `total = shares.length`，超 500 无截断提示（`:311-327`）。
- 修改方案：stats 与列表共用 conditions；expiring 排除已过期；标签加「（全部时间）」；截断时回 `truncated` 标记并显示。代价：中。

#### SH-31 [P2][静态] 可访问性批量缺口：Switch 全部无 label、图标按钮无名、hub 模态无标题、右键/双击/拖拽无键盘等价
- 根因：`share-table-view/row.tsx:51`、`card.tsx:81`、`share-settings-modal.tsx:80-99`、`share-traffic-filter-popover.tsx:113-116` 等所有 `<Switch>` 省略 `label`（`form.tsx:117-152` 支持）；`share-batch-bar.tsx:58` 等手写 `<button>`+title；`share-hub-modal.tsx:33-39` 是六个模态里唯一不传 title/ariaLabel 的（回落成通用「对话框」）；`useContextMenu` 只从鼠标事件取坐标（`overlay/menu.tsx:165-169`），键盘用户摸不到复制/二维码/分析/撤销全套行操作；`share-note-submenu.tsx:232-296` 还有第二个手搓菜单面板与 `buildShareMenuItems` 双份实现。
- 修改方案：逐处补 label/`IconButton`；hub 模态补 `ariaLabel`；每行加「更多」`IconButton`（`aria-haspopup`）走同一份菜单构建；`useContextMenu` 增 `openAtElement`。流量过滤面板补 `aria-expanded`（全站手搓 popover 通病，本模块先修，其余另开批次）。代价：中。

#### SH-32 [P2][静态] 硬编码 Tailwind 调色板类与 `text-white`/`bg-white` 绕过令牌（tokens 门禁盲区）
- 根因：`share-visit-logs-modal.tsx:330-359`（amber/blue/purple/emerald-500 徽标）、`:104-122`（选中态 `text-white`）、`use-share-hub-sidebar.tsx:138`、`share-item-common.tsx:104-148`、`share-dashboard-view.tsx:238`、`share-qr-modal.tsx:104`（外层 HTML `bg-white`；画布内 `qr-colors.ts` 是已注释合法例外）。`scripts/check-hardcoded.mjs` 只扫 hex 与任意值，不覆盖调色板类，门禁绿不代表合规。
- 修改方案：改 `--accent-contrast`/`--warning`/`--success`/`--info` 系令牌；门禁补调色板类扫描（另批）。代价：小。

#### SH-33 [P2][静态] 裸 `<input>`/`<button>` 绕过组件体系；导出 CSV 只含当前页 25 条却提示成功
- 根因：`share-hub-toolbar.tsx:46-61`、`share-visit-logs-modal.tsx:124-144`、`share-edit-modal/sections.tsx:16-21,124-179` 多处裸控件；`use-share-visit-logs-modal.ts:83` `limit: 25`，`:130-137` 直接序列化当前页 toast 成功；「按分享筛选日志」的 `initialNoteId` prop 存在但 `share-hub-modal.tsx` 从不传（看板「查看全部日志」永远全量）。复制链接失败静默（`use-share-list.ts:35-48` 只 console.warn）。
- 修改方案：换 `Input/Select/Field`；导出走服务端全量或分页循环并在 toast 写条数；`onOpenLogs` 传 noteId；复制失败统一 toast。代价：中。

#### SH-34 [P2][静态] 未本地化英文字面量与服务端回落值混入中文界面
- 根因：JSX 直写 `{'PV'}`/`{'UV'}`（`row.tsx:66-67`）、`badge='TOP 10'`（`dashboard-view:210`）、`{'CUSTOM'}`（`share-item-common.tsx:188-193`）；worker 回落值 `'Unknown'/'Direct'/'Other'/'Untitled note'` 当数据渲染（`analytics.ts:262-271,297,346,362`）；`countryNameLocalized` 默认 `locale='zh-CN'` 且调用点不传（`share-helpers.ts:12-20`、`share-visit-logs-modal.tsx:234`）——英文用户看到中文国家名。`i18n:check` 只禁汉字所以全绿。
- 修改方案：回落值改 null + 客户端 message id 渲染；调用点传当前 locale；英文字面量进资源。`countryNameLocalized` 顺带加 `Map<locale, DisplayNames>` 缓存（每次调用 new 一个）。代价：中。

#### SH-35 [P2][静态] 窄屏无适配：固定 260px 侧栏、1300px 模态、批量条溢出、30px 触控目标
- 根因：`share-hub-sidebar.tsx:13` `w-65` 无断点折叠；`share-hub-modal.tsx:16` `MODAL_WIDTH=1300`；`share-batch-bar.tsx:43-54` `whitespace-nowrap`+5 个 `shrink-0`；`share-note-submenu.tsx:30` `h-7.5` 低于 44px。
- 修改方案：侧栏 `hidden md:flex`+小屏抽屉；宽模态 `sm` 下走 `variant='fullscreen'`（Modal 已支持）；批量条 `flex-wrap`。需人工确认是否有移动端设计稿。代价：中。

#### SH-36 [P3][静态] 小缺陷集合
- 口令长度客户端 ≥6 / 服务端 ≥4 双重标准且无可见性切换（`use-share-edit-modal.ts:238` vs `share-form.ts:9-19`）；保存后编辑模态被 `shares` 依赖的 effect 自动重开、关 hub 不重置 logs/settings 子模态（`use-share-hub-modal.ts:30-49`）；`loadNoteShare().catch(()=>null)` 静默（`use-share-edit-modal.ts:183-186`）；表头无 `scope`、批量「已选 N」无 `role=status`、视图切换未用 Segmented、`toLocaleString()` 未传 locale（`share-table-view/index.tsx:69-73` 等）；`loadSession` 在 share 子应用重复挂载（`share/index.ts:17` + `app.ts:116`，多一次会话查询）。逐条小修。代价：小。

---

## 三、截图现象 → 代码根因对照

| 截图现象 | 根因 | 台账 |
| --- | --- | --- |
| 7d 窗口 PV=0，趋势图却有 1/1/1/0 刻度与「数据线」 | 不是数据源不一致（已核对同一 `rows` 喂两处）：`Math.max(...values,1)` 造 1 量程 + `Math.round` 刻度重复 + 全 0 点无条件描点 | SH-29 |
| 「设备与操作系统」只剩两个小标题 | 该卡是唯一没写 `EmptyRow` 分支的分解卡，区间内 devices/osList 为空即空白 | SH-29 |
| 「实时访问日志」出现 14 天前记录 | `loadRecentVisits` 无 `startTs`，与区间数据口径不同；「实时」无轮询 | SH-28 |
| PV=0 卡上「↗ 0%」 | `computeDelta(0,0)` 返回 0，`KpiCard` 对 0 配绿色上箭头 | SH-29 |
| 「已失效 2 / 全部 3」vs「活跃 1/3 篇」 | 数字自洽但三处口径缺陷：徽章未过滤软删、expiring/expired 重叠非互斥、侧栏全时段 PV 与看板区间 PV 近义同屏 | SH-30 |

补充：分享 PV 由公开页 `recordShareVisit` 客户端触发计数（30 分钟指纹去重），不像 blog 那样结构性为 0（见记忆 [[blog-frontend-ssr-fetch-breaks-visitor-analytics]]）；截图 7d PV=0 与「14 天前有记录」一致，窗口内确实无访问——但正因如此，空态渲染缺陷全部暴露。

---

## 四、功能完整性（把分享中心当一个 app 看）

现有闭环：创建/口令/有效期/自定义 slug/暂停/撤销/批量/置顶加星/目录标签/二维码/看板/日志/清理。缺的关键能力按实用度排序：

1. **单条分享的访客数据删除入口**（隐私「删除/导出」要求；现在只有全清/按天清，SH-05 的 note 粒度一并解决）。
2. **保留期/过滤设置服务端化 + cron 自动执行**（现在设置是客户端 localStorage，换设备即失效，`maxLogRecords` 是假设置，SH-05/14）。
3. **分析数据导出**（看板 CSV 只有日志当前页，SH-33；至少应有按区间全量导出）。
4. **链接健康检查/失效提醒**：过期分享无通知、无「即将到期」列表动作（侧栏有 expiring 分类但条件与 expired 重叠，SH-30b）。
5. **访问日志按分享过滤**的可达入口（prop 已存在，SH-33）。
6. 次要：口令可见性切换（SH-36）、复制失败反馈（SH-33）、批量撤销的 undo（现依赖 toast，未验证是否有）。

---

## 五、修复批次建议

| 批次 | 内容 | 条数 | 代价 | 说明 |
| --- | --- | --- | --- | --- |
| 1 立即 | SH-14 误删日志、SH-01 暂停附件通道、SH-02 D1 500、SH-16+SH-06 range=all | 4 | 小-中 | 数据破坏 + 必现故障 + 配额事故，每条带回归测试 |
| 2 短期安全 | SH-03 公开限流、SH-04 fp 密钥、SH-05 visits 生命周期、SH-07/08 | 5 | 中 | 与 SH-16 的 SQL 下推共用改动面，宜同周 |
| 3 性能 | SH-18 防抖、SH-19 启动瘦身、SH-20 code-split、SH-21/22/23、SH-17 分期第一步 | 6 | 小-中 | SH-17 tags 关联表改造单开 |
| 4 看板口径与共用组件 | SH-24/25/28/29/30 | 5 | 中 | 共用组件修复需同步 blog 侧回归（铁律 14 分批） |
| 5 a11y/规范/功能补齐 | SH-26/27/31/32/33/34/35/36 + 第四节 1/2/5 | 9 | 中 | SH-27 虽在批次 5 但内含破坏性操作不可达，可提前 |

---

## 六、诚实的限制

- 安全侧 P1 三条与 range 校验、referrer、fp 反查成本等经本地 workerd + 真实 D1 实例实测；**未跑** e2e/视觉门禁与 `npm run build`（避免动工作区产物），包体积数字取自仓库现存 `dist/client`（2026-09-17，share 源文件其后无改动）。
- 性能量级（1 万~10 万 visit 行、500 行渲染耗时、D1 RTT）为按代码结构+明示假设的推算，未 profiling；定量需种子数据计时。
- SH-35 的移动端方案需人工确认设计稿；SH-31 中全站手搓 popover 的 `aria-expanded` 通病是否连带 tag/date 两处，标「需人工确认」。
- 未审查 blog 管理中心侧对共用看板组件的调用方行为（仅确认缺陷同构存在）。
