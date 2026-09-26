# 音乐库对标执行计划 · 参考项目 otter-music 缺失功能（ZCode · GLM-5.3-Flash · 2026-09）

> 依据：`docs/features/music/review-with-zcode_glm53fmax.md`（2026-09-26 对标报告）。用户已拍板：外接内容源三类全部纳入。
> 分支：`dev` 直接逐项提交。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**，实现后跑回归再提交，**提交后立刻更新本文件**（勾选 + commit 短哈希 + 进度日志一行）。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 门禁备注：新增/修改注释后必须 `node scripts/sync-comments-allowlist.mjs`；UI 改动加跑 `scripts/e2e-visual.mjs` / `check-contrast.mjs`；新依赖须先评估（评估理由写进 commit，AGENTS.md 铁律 8）。

## 批次 F① · 速赢小项（S）

- [x] FEA-B2 文本批量导入歌单：复用 M3U 解析与匹配（裸文本每行一条，「歌手 - 标题」或仅标题）；工具栏新增「粘贴导入」对话框，入队或建歌单，未匹配行警告
- [x] FEA-B4 「已离线」视图：曲库 scope 新增 offline 视图（读取 SW 离线缓存清单 `offline-audio.ts` LIST），侧栏入口 + 计数
- [x] FEA-C1 下一首预加载：队列下一首提前 `preload`（audio-engine 双元素已就位，预载元数据/首块）
- [x] FEA-C4 歌词样式设置：对齐（左/中/右）+ 字号档位，偏好持久化（`music-store/state.ts`），沉浸层与现在播放列同步生效
- [x] FEA-B3 URL 直链添加歌曲：粘贴直链 + 标题 → 以 webdav/external 引用源入曲库（不计配额，沿用 WebDAV 引用行口径）
- [x] FEA-D2 歌单自定义封面（与 improvement IMP-10 合并实施，此处只登记）

## 批次 F② · 中型项（M）

- [x] FEA-B1 回收站：`music_trash` 迁移（只增不改）→ 删除曲目/歌单先移表（R2 对象延迟回收）→ 回收站视图 + 恢复/彻底删除 → cron 7 天清理 + 预算
- [x] FEA-D1 下载嵌 ID3：worker 或前端写入（mp3 ID3v2 优先：标题/歌手/专辑/封面 APIC/歌词 USLT），m4a/flac 后续评估；`tracks.ts` stream download 参数分流
- [x] FEA-C2 全屏背景模式：封面模糊（CSS backdrop，零依赖）→ 封面取色渐变（canvas 采样，参考 otter useCoverColors 思路）→ 设置三态（跟随主题/模糊/取色）
- [x] FEA-C3 歌词翻译行：LRC 译文时间戳就近合并（`parseLyric` 扩展），沉浸层/现在播放列双语行渲染；lrclib 译文源经既有 `lyric-lookup` 中继评估

## 批次 F③ · Alist 网盘源（M）

- [x] FEA-A3-1 Alist 服务器配置管理（名称/URL/token/根路径，存服务端设置，密钥只走服务端）
- [x] FEA-A3-2 Alist 目录浏览与音频导入（复用 WebDAV 引用行管线：登记元数据、不计配额）
- [x] FEA-A3-3 Alist 站内搜索导入

## 批次 F④ · 播客 RSS（L）

- [x] FEA-A2-1 播客订阅管理（RSS 源增删改、退订；服务端表迁移只增不改）
- [x] FEA-A2-2 RSS 解析与分集列表（服务端代抓 + 限长 + 缓存，参考 otter rss-parser 职责）
- [x] FEA-A2-3 OPML 批量导入导出
- [x] FEA-A2-4 分集播放打通（复用音频引擎与队列；分集封面/时长/已听进度）

## 批次 F⑤ · 在线多音源聚合（L，最后做）

- [x] FEA-A1-1 Provider 抽象 + 设置开关（默认全关；`src/client/features/music/providers/` 新目录，经 `index.ts` 公开入口）
- [x] FEA-A1-2 Worker 代理路由：域名白名单 + `budget.ts` 新限额族 + 响应限长（复用 `readResponseBytesWithinLimit`）
- [ ] FEA-A1-3 首批音源接入 + 聚合搜索（按源 rank 合并去重；来源角标扩展）
- [ ] FEA-A1-4 播放失败智能换源（归一化匹配打分，成功回写队列元数据）
- [ ] FEA-A1-5 搜索建议（歌手/专辑/歌单直达）
- [ ] FEA-A1-6 平台歌单/榜单导入（可选，视 API 稳定性决策）

## 每项验收标准（通用）

1. 复现测试先红；实现后测试绿 + music 全量单测绿 + `npm run typecheck` + 12 项静态门禁绿
2. 新端点必须有 Zod 校验、错误响应与预算限流；新表走只增不改迁移（`tests/schema-migrations.test.ts` 守卫）
3. UI 改动加跑 e2e-visual / check-contrast（不可跑时记已知限制）
4. 新用户可见文案双语（`npm run i18n:check`）；新依赖在 commit 说明评估理由
5. 外接源类功能在 demo 后端（`src/client/demo/backend/routes/music.ts`）有等价桩，不破坏 `dev:demo`

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-26 | FEA-B2 文本批量导入歌单 | `c70965c5` | 先红 1 例（组件不存在）；修复后 music + routes 85 文件 / 674 例 ✅；typecheck ✅；comments/i18n/size/deep-imports 门禁 ✅；check-contrast ✅；e2e-visual 534/535（仅剩已登记看板遗留） | 文本导入复用 M3U 的 parseM3u/matchM3uTracks（裸文本行天然是 target），两种导入共用同一套匹配键不会漂移；建歌单走新动作 createPlaylistWithTracks（一次创建 + 追加 + 单条提示），M3U 文件导入仍只入队 |
| 2026-09-26 | FEA-B4 「已离线」视图 | `c625af35` | 先红 4 例（offline scope 3 + 侧栏行 1）；实现后 music + routes 89 文件 / 723 例 ✅；typecheck ✅；静态门禁 ✅；e2e 177 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 离线清单是本机状态（SW 缓存 `offlineTrackIds`），不同设备各自统计，不随账号同步——与 IMP-12 决策同口径；排序与搜索沿用通用管线，未加特例 |
| 2026-09-26 | FEA-C1 下一首预加载 | `cbd785ac` | 先红 8 例（引擎 6 + store 决策 2）；实现后 music + routes 91 文件 / 735 例 ✅；typecheck ✅；静态门禁 ✅；e2e 177 ✅（无 UI 改动，未跑 e2e-visual/contrast） | 预载只覆盖音频（视频走硬切且带可见舞台，不进备胎）；mp3 之外的流由浏览器按 preload='auto' 自行取舍首块大小；audio-engine.ts 达 541 行（原 499），size 基线随本项更新——备胎/淡入淡出/预载共享模块私有状态，拆文件需把访问器穿进所有调用方 |
| 2026-09-26 | FEA-C4 歌词样式设置 | `663210bb` | 先红 5 例（store 2 + 组件 3，1 例为默认基线）；实现后 music + routes 93 文件 / 741 例 ✅；typecheck ✅；静态门禁 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 字号档位映射到既有 --text 令牌（列：11/12/14，沉浸层：13/15/18），不引入新令牌；对齐在沉浸层落在行按钮、列视图落在容器（行继承 text-align）；空态与校准控件不受样式影响 |
| 2026-09-26 | FEA-B3 URL 直链添加歌曲 | `be167c5d` | 先红 8 例（worker 5 + demo 1 + 组件 2）；实现后 music + routes + demo 97 文件 / 773 例 ✅；typecheck ✅；静态门禁 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 新增独立 source 值 `external`（沿用 webdav 引用行「不计配额」口径，但不吃 webdav 的删除/迁移/凭据路径）：流播放经 worker 代理（同源，绕开非 CORS 源 WebAudio 静音问题，IMP-9 合并项因此闭环）；运行时以 `global_fetch_strictly_public` 拦私网 SSRF，容器靠 URL 路径扩展名判定；demo 桩只钉契约形状，不出真实外链字节（演示环境无出网） |
| 2026-09-26 | FEA-D2 歌单自定义封面（含 IMP-10） | `15906586` | 先红 3 例（worker/public 2 + demo 1）；实现后 music + routes + demo + schema-migrations 98 文件 / 783 例 ✅；typecheck ✅；静态门禁 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 迁移 v46 只增不改（fresh 建表同步加列）；封面存储与曲目封面共用 cover.ts 管线（对象键 + 派生键删除规则）；备份导出固定 coverUrl: null（封面字节不属备份契约）；公开歌单页带专属公开封面路由，自定义封面优先于首曲目派生 |
| 2026-09-26 | FEA-B1 回收站 | `8ab9aee7` | 先红 6 例（worker 5 + demo 1）+ store 4 例；实现后 music + routes + demo + schema-migrations 99 文件 / 793 例 ✅；typecheck ✅；静态门禁 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 单删/批删/歌单删除三条路径统一移表，R2 字节延迟到 purge 或 7 天 cron 清理（派生键守卫随行迁移，伪造 key 无法借 purge 回收他人对象）；曲目恢复不重建歌单归属，歌单恢复只带回仍存活的成员（防悬空行）——两条都记在已知限制；回收站不是 scope，是侧栏独立入口 + Modal 面板 |
| 2026-09-26 | FEA-D1 下载嵌 ID3 | `c363453b` | 先红 1 例 + 守卫例 1；实现后 music + routes + demo + schema-migrations 99 文件 / 795 例 ✅；typecheck ✅；静态门禁 ✅（无 UI 改动，免浏览器门禁） | mp3 下载（无 Range 全量请求）在 worker 流前置 ID3v2.3 标签（TIT2/TPE1/TALB UTF-16 BOM、APIC 仅自有派生封面键、USLT 保留 LRC 原文），音频流不缓冲直通、Content-Length 覆盖标签；已有标签的文件直接排在其后（播放器取第一个标签）；m4a/flac 与 webdav/external 分流未覆盖，记为后续评估 |
| 2026-09-26 | FEA-C2 全屏背景模式 | `241882c9` | 先红 6 例（偏好 2 + 取色 2 + 组件 2）；实现后 music + routes + demo + schema-migrations 101 文件 / 803 例 ✅；typecheck ✅；静态门禁 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 三态偏好 immersiveBackground（theme/blur/gradient）随偏好持久化；模糊=封面图 blur+令牌遮罩，取色=16×16 canvas 采样均值加暗部渐变（纯函数 coverGradientFromPixels 可测，canvas 不可用时回退令牌渐变），遮罩保证文字令牌对比度不被背景破坏；无封面/主题态不渲染背景层 |
| 2026-09-26 | FEA-C3 歌词翻译行 | `11cbaac6` | 先红 4 例（合并规则）；实现后 music 全量 92 文件 / 641 例 ✅；typecheck ✅；静态门禁 ✅；e2e-visual 534/535（仅剩已登记看板遗留，另一次 2 failed 复跑回落，判定抖动）；check-contrast ✅ | 合并窗口 500ms（TRANSLATION_MERGE_MS）：窗口内后行吸收为 translation，文本相同则静默吸收（呼应式重复行），每行至多吸收一行；沉浸层译文随主行以次级字号渲染（active 跟随强调色），现在播放列同构；lrclib 译文源拉取未做（仅本地 LRC 双语合并），远端译文并入记为后续评估 |
| 2026-09-26 | FEA-A3-1 Alist 服务器配置管理 | `9dbb6eae` | 先红 4 例（加密不回传/列表脱敏/更新保留令牌/非法输入）；实现后 alist + music store 2 文件 11 例 ✅；typecheck ✅；静态门禁 ✅；e2e 177 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 新表 music_alist_servers（迁移 v48 + fresh 建表），token 走 CREDENTIAL_VAULT 加密列（复用 encryptSecret/decryptSecret，测试以可逆变换桩替），任何响应不回传令牌；PATCH 缺省 token 保留原值；工具栏新增 Alist 入口 + 服务器管理弹窗（A3-2/3 在此扩展） |
| 2026-09-26 | FEA-A3-2 Alist 目录浏览与导入 | `c69c1bf1` | 先红 4 例（浏览/导入/拒绝非媒体/流播放）；实现后 alist + demo 等 25 例 ✅；全量 103 文件 / 819 例 ✅；typecheck ✅；静态门禁 ✅；e2e-visual 534/535；check-contrast ✅ | 新 source 值 'alist'：object_key = alist:{serverId}:{path}，流播放时经 fs/get 取签名直链再代理（签名会过期故每次现取）；引用行 size 取上游目录数据，配额与库统计双口径排除（worker summarize 与 demo 同步修正——webdav 此前统计口径一并纠正）；demo 桩以内存树等价实现配置/浏览/导入 |
| 2026-09-27 | FEA-A3-3 Alist 站内搜索导入 | `ec659757` | 先红 2 例（路由 404）；实现后 worker + store 4 例 ✅；全量 511 文件 / 4558 例 ✅；typecheck ✅；静态门禁 ✅；e2e 177 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | worker GET /alist/:id/search 代理上游 fs/search（parent 锚定根路径），结果过滤只留媒体文件并剥回根相对路径（与浏览视图同口径）；搜索是视图态不进 store（结果存 modal 本地 state，导入复用 importAlistTrack 与 importingPaths 标记），搜索态隐藏「导入本目录全部」footer 避免语义错位；附带 fix 2d600539：来源角标按来源区分文案（external/alist 曾错显示 R2）、补渲染 A3-1 的令牌提示——全量键引用检查 tests/music-locale-keys.test.ts 暴露两个未引用键 |
| 2026-09-27 | FEA-A2-1 播客订阅管理 | `a400abc1` | 先红 3 例（路由缺失）；实现后 worker 4 例 + store 3 例 ✅；全量 513 文件 / 4566 例 ✅；typecheck ✅；静态门禁 ✅；F④ 浏览器门禁（A2-1..A2-4 合并一轮）见 A2-4 行 | 迁移 v49 music_podcast_feeds（fresh 建表同步）；创建时标题可选——缺省取主机名，A2-2 刷新后以频道标题覆盖；播客面板挂工具栏（Podcast 图标），订阅行带重命名/退订（退订确认走 confirm）；demo 桩以内存 Map 等价 CRUD |
| 2026-09-27 | FEA-A2-2 RSS 解析与分集列表 | `1805d4cb` | 先红 4 例（解析器 2 + 路由 2）；实现后 worker 8 例 ✅；全量 513 文件 / 4570 例 ✅；typecheck ✅；静态门禁 ✅；F④ 浏览器门禁（A2-1..A2-4 合并一轮）见 A2-4 行 | 解析器为务实版 RSS 2.0 + itunes 命名空间（无 Atom 支持，播客生态 RSS 2.0 占绝对主流，记为已知限制）；分集缓存即数据行——迁移 v50 给 feed 行加 episodes_json/fetched_at（skipIfColumnExists 兼容 fresh 建表），TTL 10 分钟内直接回缓存 JSON，刷新风暴最多每 feed 每窗口一次出网；首次抓取用频道标题覆盖主机名兜底，之后的刷新不再覆盖用户手动重命名；feed 代抓走限长流式读取（2MB 上限）+ 新预算族 podcast（60 次/时）+ 运行时 global_fetch_strictly_public 拦私网；客户端点订阅行进入分集视图（标题/时长/体积/描述），音频播放留给 A2-4 |
| 2026-09-27 | FEA-A2-3 OPML 批量导入导出 | `01efc8f5` | 先红 3 例（导出 1 + 导入 2）；实现后 worker 11 例 ✅；全量 513 文件 / 4573 例 ✅；typecheck ✅；静态门禁 ✅；F④ 浏览器门禁（A2-1..A2-4 合并一轮）见 A2-4 行 | 导出 GET /podcasts/opml 出标准 OPML 2.0 文档（text/x-opml+xml + attachment 文件名）；导入 POST /podcasts/opml（body 携带 OPML 文本，256KB 上限）逐条登记并以 feed URL 去重——重复导入导出文件报 skipped 而非重复建行；解析支持嵌套 folder outline 与无 xmlUrl 的非 feed outline（跳过）；客户端为「导入 OPML（文件选择）/导出 OPML（Blob 下载）」一行，demo 桩以同构正则等价往返 |
| 2026-09-27 | FEA-A1-1 Provider 抽象 + 设置开关 | 待回填 | 先红 2 例（registry 1 + 开关持久化 1）；实现后 4 例 ✅；全量 515 文件 / 4580 例 ✅；typecheck ✅；静态门禁 ✅（无 UI/网络改动，免浏览器门禁） | providers/ 新目录四文件（types/registry/gds/index），MusicProvider 接口本期只含身份与 isEnabled——搜索能力随 A1-3 落地，避免空实现；开关即偏好 providerEnabled（Record<providerId, boolean>，默认 {}，loadPreferences 剥离非法项），随既有偏好 debounce 持久化；首批聚合源 gds（netease/kuwo/migu/qq/bilibili 五源 rank 序）登记但默认全关——接入第三方目录是显式逐源决定 |
| 2026-09-27 | FEA-A1-2 Worker 代理路由 | 待回填 | 先红 4 例（路由缺失）；实现后 worker 4 例 ✅；全量 516 文件 / 4584 例 ✅；typecheck ✅；静态门禁 ✅（无 UI 改动，免浏览器门禁） | 两条具名代抓端点（GET /provider/search、/provider/url）而非通用开放代理——上游域名白名单收敛为 GD 聚合源单主机，浏览器永远不直连第三方（页面 CSP 亦禁止）；source 白名单枚举（与 A1-1 的 GDS_SOURCES 同列）+ keywords/id 非空 + 音质枚举校验；响应走限长流式读取（1MB 上限）+ 12s 超时 + 新预算族 provider（120 次/时）；播放地址按次解析不入库（上游直链会过期）——A1-3 的流分支消费该端点；上游字段类型漂移（artist 数组/字符串、duration 缺失）在 worker 侧统一归一化 |
| 2026-09-27 | FEA-A2-4 分集播放打通 | `8153f6f2` | 先红 3 例（登记端点）；实现后 worker 14 例 ✅；全量 513 文件 / 4576 例 ✅；typecheck ✅；静态门禁 ✅；F④ 浏览器门禁（A2-1..A2-4 合并一轮）：e2e 177 ✅；e2e-visual 534/535（仅剩已登记看板遗留）；check-contrast ✅ | 分集播放 = 幂等登记为 external 引用行（POST /podcasts/:id/episodes/import，feed 标题作 album、itunes 时长传 durationMs，重复登记返回既有行不撞 (user_id, object_key) 唯一索引）→ 客户端本地追加 + playTrack——队列/交叉淡入/进度持久化/收藏/下载全部复用 external 行既有管线，零新引擎代码；分集封面未做（feed 的 itunes:image 需要再迁移一列，记为后续评估）；已听进度由 external 行的 playback 管线自动持久化 |
