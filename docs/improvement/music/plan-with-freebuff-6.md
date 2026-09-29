# 音乐库整改执行计划 · 第六轮（Freebuff · 2026-09-29）

> 依据：`docs/improvement/music/review-with-freebuff-6.md`（用户点名的四件改造 + 交付过程中自检出的三处）。
> 参考项目：本机 `/home/kubuntu/projects/reference/otter-music`（上游 `https://github.com/DJChanahCJD/otter-music`），部署后的实例 `https://otter-music.pages.dev`。
> 上一轮 `plan-with-freebuff-5.md`（P5-1…P5-7）已全部交付并收口（`5bd09635`…`f0c6d255`），工作区清零；本轮接着它的状态继续，不改写已提交历史。
> 分支：`dev`；约定与前几轮一致：每个条目 = 一个原子提交；**先写能失败的复现测试**（jsdom / 门禁断言），实现后跑回归再提交；**每次提交都更新本文件**（勾选 + commit 短哈希 + 进度日志一行）。
> 本轮的三个自检条目（P6-5…P6-7）不是「顺手修无关问题」：前两处的现场都在第六轮新写的代码里（回访提示），第三处是第六轮新引进的死代码。

## 状态图例

`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）

## P6-1 · 收藏、置顶与歌单旗标断网时先落地，联网后按序重放（用户点名的第 1 件）

- [x] `localDb` 上开第二条队列（`MusicPendingWrite` 的存 / 取 / 完成 / 记失败；键为单数队列键），与笔记 outbox 共用同一个 IndexedDB 层而不是同一张表。
- [x] `pending-writes.ts`（新）：`isOfflineError`（只认 status 0）、`queueMusicWrite`（一目标一条、载荷合并、入队即提示「已先存本机」）、`flushMusicWrites`（按 `createdAt` 旧到新重放；仍离线则停下整队，服务端拒绝则记一次失败后丢弃该条）。
- [x] 三处可写状态接上它：`library-tracks.ts`（收藏、置顶）、`library-collections.ts`（歌单旗标）。**只有 `isOffline` 走队列**，其余错误保持原有的回滚 + 提示。
- [x] 两个触发边界：`library-load.ts` 在拉库之前先重放；`music-hub-modal.tsx` 监听 `online`，并按丢弃条数决定是否重拉（拒收的条目已不在队里，乐观状态要靠重拉修正）。
- **先红**：`pending-writes.test.ts` 为新增模块（用例先写，实现前全红）；`library-tracks.test.ts`、`library-collections.test.ts` 各新增数例，对旧实现为红（旧路径在离线时不入队、直接回滚）。
- **验收**：`pending-writes.test.ts` 7 例、`library-tracks.test.ts` 20 例、`library-collections.test.ts` 24 例、`library-load.test.ts` 34 例全绿；`typecheck` ✅；`budget:check` ✅（懒加载切分后 hub 分块不涨）。
- **范围**：`src/client/lib/db/{types,keys,index,store-io,core}.ts`、`music-store/pending-writes.ts`（新）+ 用例、`music-store/{library-tracks,library-collections,library-load,index}.ts`、`music-hub-modal.tsx`、两语言资源、`scripts/check-comments.mjs`。

## P6-2 · 音乐库统计面板（用户点名的第 2 件）

- [x] `music-insights.ts`（新）：纯推导——`weekStart`（本地时区的周一零点）、`buildInsights`（按周 / 艺人 / 标签三个维度）、`hasListening`（区分「没有数据」与「全 0」）。只吃 `tracks` 与 `tags`，不碰 store。
- [x] `music-insights-modal.tsx`（新）：复用 `Modal` 与既有图表原语；工具栏入口 + store 开关（`openInsightsScan` / `closeInsightsScan`）与既有健康扫描同一套接线。
- [x] 按需加载：面板为懒加载覆盖层，hub 主分块保持 97.1 KiB（+0.1）。
- **先红**：`music-insights.test.ts` 为新增模块；`music-insights-modal.test.ts` 3 例（新）。
- **验收**：两个新文件的用例全绿；`budget:check` ✅；真实浏览器上打开面板读一遍（见复核文档的验证矩阵）。
- **范围**：`music-insights.ts` + 用例、`music-insights-modal.tsx` + 用例、`music-store/{types,index,library}.ts`、`music-hub-toolbar.tsx`、`music-hub-modal.tsx`、两语言资源。

## P6-3 · 均衡器改十段（用户点名的第 3 件）

- [x] `music-eq-bands.ts`（新，叶子模块、零 import）：十段频段表（31 Hz 低架 → 16 kHz 高架，中间八个 peaking，Q=1.41 即一个倍频程宽）、增益范围、`readEqDb` / `readEqBands` 的容错读法、`eqBandLabel`。
- [x] 三处读同一份：音频图按表建滤波器（`audio-engine.ts`）、预设按表写值（`music-eq-presets.ts`）、滑杆标签按表取中心频率（`music-transport-widgets.tsx`）。
- [x] 旧的三段按**覆盖范围**迁移：低架 180 Hz / 中频 1 kHz / 高架 4.5 kHz 的值抄到各自覆盖的每个频段，读者调过的声音不因换实现变平。
- [x] 存储与状态：`state.ts` 按表读写十个值、`persist.ts` 与 `player.ts` 接线、`types.ts` 契约、store `index.ts` 公开面。
- **先红**：`music-eq-bands.test.ts` 为新增模块；`music-store/eq.test.ts`、`music-eq-presets.test.ts`、`audio-engine.test.ts`、`audio-engine-crossfade.test.ts` 按旧三段改写成十段后先行失败。
- **验收**：EQ 相关 80 例全绿；整目录 128 文件 / 1096 例全绿；`size:check`（两个超长用例块拆成四个 describe，而不是记基线）。
- **范围**：`music-eq-bands.ts`（新）+ 用例、`music-eq-presets.ts` + 用例、`audio-engine.ts` + 两个用例、`music-store/{state,persist,player,types,index}.ts`、`music-store/eq.test.ts`、`music-transport-widgets.tsx`、两语言资源、`scripts/check-size.baseline.json`。

## P6-4 · 公开歌单记住上次访问（用户点名的第 4 件）

- [x] `visit-memory.ts`（新）：按 slug 一个键（`inkstone.playlist-visit.<slug>`）、`readPlaylistVisit` / `rememberPlaylistVisit` / `forgetPlaylistVisit` / `tracksSinceVisit`（严格大于，首次访问返回空）。
- [x] 页面接线：歌单与回访提示一起取（提示读的就是 fetch 解出的那一份载荷，拆开就会变成「取两次」或「对着已经动过的时间戳比」）。
- [x] 提示条：`role="status"` 让屏幕阅读器也收到；一枚「新增」徽标落在新曲目行上；一个「不再提示更新」清掉时间戳并当次隐藏。
- **先红**：`visit-memory.test.ts`（新，9 例）、`page.test.ts` 新增数例，对旧实现为红。
- **验收**：分享页 23 例全绿；真实浏览器上走通「首访无提示 → 加歌刷新后有提示与徽标 → 点不再提示后消失」（见复核文档）。
- **范围**：`music-share-page/visit-memory.ts`（新）+ 用例、`music-share-page/page.tsx`、`music-share-page/page.test.ts`、两语言资源。

## P6-5 · 回访提示不再用强调软底承载暗文字层级（自检，F6-5）

- [x] 去掉整条 `--accent-soft` 填充，改成左侧强调色竖线 + 页面底色：强调色的计数文字与暗层级的说明文字各自落在已校准的底色上（强调软底上只有最高层级达标，暗层级实测不足 AA 且无法靠调令牌补救）。
- [x] 行内「新增」徽标保留 `--accent` on `--accent-soft`（按全部 7 个强调色量测过的配对）。
- **验收**：真实浏览器上读计算样式（左侧竖线为强调色、说明文字为暗层级落在页面底色上）；`comments:check` / `size:check` ✅。
- **范围**：`music-share-page/page.tsx`。

## P6-6 · 回访提示在 StrictMode 的双次副作用下不再丢失（自检，F6-6）

- [x] 上次访问时刻按 slug 捕获进 `ref`，比较只读捕获值、只有写入推进它 → 两次跑出同一个答案（此前第二次读到第一次刚写下的值，报出的新增为空，而读者看到的正是第二次的结果）。
- [x] `forgetPlaylistVisit` 同步把捕获值置空，保持「忘记之后不再比较」的不变量。
- **先红**：`page.test.ts` 新增 StrictMode 用例，**对旧实现得 1 failed / 22 passed**（失败的正是这一条）；修后 23 例全绿。
- **验收**：`typecheck` ✅；分享页 23 例 ✅；同一轮里另在真实浏览器上以「回拨时间戳」的方式复现并确认修复。
- **范围**：`music-share-page/page.tsx`、`music-share-page/page.test.ts`。

## P6-7 · 删掉没有使用者的待写计数访问器（自检，F6-7）

- [x] `pendingMusicWriteCount()` 除自己的用例之外全库没有调用方，注释里声称的「设置行与离线提示」从未实现 → 删除（AGENTS.md「禁止死代码」），而不是为它造一个使用者。
- **验收**：`pending-writes.test.ts` 7 例全绿（原 8 例）；`typecheck` / `comments:check` / `size:check` ✅。
- **范围**：`music-store/pending-writes.ts`、`music-store/pending-writes.test.ts`。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-29 | P6-1 离线写队列 | `c54ab73b` | `pending-writes.test.ts` 8 例（后删 1 例）、`library-tracks.test.ts` 20 例、`library-collections.test.ts` 24 例、`library-load.test.ts` 34 例全绿；store 目录 39 文件 / 347 例 ✅；`typecheck` ✅ | 队列是「后写生效」：同目标上更晚的意图覆盖更早的（同字段合并），不做字段级合并；重放只在「打开音乐库」与「窗口重新上线」两个边界触发，断网期间不探活 |
| 2026-09-29 | P6-2 统计面板 | `3158af8d` | `music-insights.test.ts` + `music-insights-modal.test.ts`（3 例）全绿 ✅ | 只有 `playCount` 与 `lastPlayedAt` 两个累计字段，所以「按周」是「最近播放时间落在该周」的直方图，不是逐次播放次数；要精确回看需新增播放事件表 |
| 2026-09-29 | P6-3 均衡器十段（refactor） | `b7e4a04e` | EQ 相关 80 例全绿 ✅；`size:check` 记入两处测试文件的用例拆分（不是记基线） | 三段→十段的迁移按覆盖范围复制，做不到「还原成读者当初想要的声音」；响度归一化算法本身未动 |
| 2026-09-29 | P6-4 公开歌单回访 | `042199d8` | `visit-memory.test.ts` 9 例、`page.test.ts` 13 例（新增后 14）✅；真实浏览器走通首访 → 有新增 → 不再提示 | 只记在本机（换设备就重新算首次）；首次访问不报「全部是新的」；没有端到端门禁（分享页不在应用外壳里），登记为下一轮候选 |
| 2026-09-29 | P6-5 提示条对比度（自检） | `adf689cf` | `comments:check` / `size:check` ✅；真实浏览器读计算样式确认竖线与文字各落在已校准底色上 | 强调色作为文字落在**自身软底**的规则仍由 `check-contrast.mjs` 按全部强调色量测（行内徽标属这一类） |
| 2026-09-29 | P6-6 StrictMode 双跑（自检） | `9cfc4760` | 先红：**1 failed / 22 passed**（新增的 StrictMode 用例）；修后 `page.test.ts` 23 例全绿 ✅；`typecheck` ✅ | 症状只在开发模式出现（生产构建不双跑），所以它是「门禁绿着、功能在 dev 里没有」的那一类；补齐的办法是在 StrictMode 下问同一个问题 |
| 2026-09-29 | P6-8 公开歌单的端到端门禁 + 四处修正（补做） | `7954e6bd`、`deaa6ac9`、`64dfd0ea` | 分享页 27 例 ✅、`tests/music-playlist-share.test.ts` 15 例 ✅、`test:unit` 561 文件 / 5139 通过 + 1 跳过 ✅、`e2e-visual.mjs` **674 / 0**（`+22` 全是新场景）、`e2e.mjs` **177 / 0** ✅ | 门禁只跑浅色（与其余视觉场景一致）；`api/music.ts` 的尺寸基线因此上移 |
| 2026-09-29 | P6-7 删死代码（自检） | `83ac8f96` | `pending-writes.test.ts` 7 例 ✅；提交时钩子跑相关回归 90 文件 / 763 例 ✅ | 队列因此没有「还有几条待同步」的读数；若以后要做这个读数，应在真实需求出现时连同界面一起加 |

**入库方式（本轮）**：7 项各自一个原子提交，共 7 个提交；`scripts/check-comments.mjs` 的白名单按文件块随各批暂存，工作区始终停在最终状态；`size:check` 只在用例文件因新增用例而增长时记入基线，超长用例块则拆开而不是记基线。

## 收口读数（2026-09-29）

- `npm run typecheck` ✅ · 音乐目录 **128 文件 / 1096 例** ✅ · `npm run test:unit` **561 文件 / 5134 通过 + 1 跳过** ✅
- 13 项静态门禁全绿（含 `budget:check` 与 `vendor:check`；`i18n:check` **3849** 键；注释白名单 **12053** 条 / 1222 文件）
- `scripts/e2e.mjs` **177 / 0** ✅ · `scripts/e2e-visual.mjs` **652 / 0** ✅（两者都在收口后的最终树上、对一个 `:7762` 的全新临时实例复跑得到——最后一次提交只删了一处死代码，但那条死代码在视觉门禁会走到的音乐 store 模块里，所以不沿用更早那次的读数）

## 下一轮候选（登记，不在本轮）

1. ~~**公开歌单回访的端到端门禁**~~ → 已做，见 P6-8。
2. **播放事件表**：让统计面板从「最近播放时间的直方图」升级为真正的按周收听次数。
3. **音乐写队列的可见读数**：待同步条数若真要显示，应与界面一并购入，而不是先留一个没有使用者的访问器。
4. **`PublicPlaylist`／`PublicPlaylistTrack` 的位置**：这两个契约现在住在 `src/client/lib/api/music.ts`（该文件因此越过 500 行预算，记在基线里）。按 AGENTS.md「公共接口类型集中定义」，它们应搬到 `src/shared/types/`。

## P6-8 · 匿名公开歌单页的端到端门禁，以及它为这件事查出的四处（补做）

- [x] `scripts/e2e-visual.mjs` 新增 `assertPublicPlaylistPage`（7000 行附近）：以访客身份（独立浏览器上下文、真实 UA、无会话）打开 `/playlist/:slug`，把「上次访问以来新增了什么」按两次访问来量——首访与「无变化的重开」都必须报不出东西，然后在访客背后往歌单里加一首曲子再重开。加的是 **已存在** 的曲目（真实读者的常见情形），所以它同时钉住了基准必须是入单时间这一点。
- [x] 断言含：面板与提示各跑一遍 axe（无违规、无未审阅项）、曲目行是真正的 `button`、Tab 能到「不再提示更新」与曲目行、Enter 播放该行自己的流（`audio` 元素、公共 stream URL、且确实在播）、点「不再提示更新」后重开回到「首次访问」。场景自带建歌单、分享与收尾（删除歌单）。
- **发现并修掉四处**（每一处都是门禁真正跑起来才暴露的，单测全绿时都在）：

| # | 症状 | 根因 | 处置 |
| --- | --- | --- | --- |
| F6-8 | 提示读作「新增 1 首」后又自行消失，徽标一起消失 | 回访比对顺手把时间戳推进了，而 React 在 StrictMode 下跑两次 effect，第二次读回的正是第一次刚写下的值（读者看到的正是第二次的结果） | 比对改成纯读；时间戳改由 `useRememberVisit` 在 `pagehide` 写下读者实际看到的最新一条 |
| F6-9 | 面板列出的曲目数落后于歌单实际内容（加歌后重开仍是旧列表） | 服务端列表 `Cache-Control: public, max-age=15`，而页面用同一个 URL 取数据决定「有没有新东西」 | transport 新增 `cache` 选项，`publicPlaylist` 用 `no-store` |
| F6-10 | 把一首**早已在库里**的歌加进歌单，永远报不出「新增」 | 载荷里的 `createdAt` 是曲目自己的创建时间，不是它进这个歌单的时间 | 歌单详情多取 `pi.created_at` 作为 `addedAt`，比对改用它 |
| F6-11 | axe 报 `aria-prohibited-attr`（`span[aria-label]` 无有效 role） | 头部 logo 外层 span 挂了无障碍名，而 Logo 自身已是 `aria-hidden` 装饰 | 去掉该属性（与分享笔记页头部写法一致） |

- [x] `transport.ts` 的 `cache` 选项、`api/music.ts` 的 `PublicPlaylistTrack.addedAt`、`public.ts` 的 `addedAt`、页面的纯读比对与 `useRememberVisit`、两侧测试跟改；`tests/music-playlist-share.test.ts` 新增一例：把曲目 `created_at` 改成 1 后入单，断言下发的 `createdAt` 为 1 而 `addedAt` 远大于它。
- **验收**：`typecheck` ✅；分享页 27 例 ✅（新增 4 例）；`tests/music-playlist-share.test.ts` 15 例 ✅；`test:unit` **561 文件 / 5139 通过 + 1 跳过** ✅；13 项静态门禁 ✅；`e2e.mjs` **177 / 0** ✅；`e2e-visual.mjs` **674 / 0**（`+22` 全部是新场景的断言）✅ —— 两个端到端都是对一个 `:7763` 的全新实例、按 CI 的顺序（先 e2e 再视觉）跑出来的。
- **尺寸**：`page.test.ts` 因新增用例撑大的 describe 被拆成两个（不记基线）；`api/music.ts` 因新增字段与注释越过其 533 行基线，按「有意增长」记入基线（该文件本来就已超 500 行预算，见下一轮候选 4）。
- **入库**：`7954e6bd`（基准与新鲜度）、`deaa6ac9`（无障碍名）、`64dfd0ea`（门禁）——按 AGENTS.md「分批与门禁」拆 hunk：`page.tsx` 的无障碍名 hunk 单独一个提交，白名单条目随各批暂存，每批快照都用 `git checkout-index` 导出后单独跑过 `comments/size/i18n/code-style/visual-labels`。
