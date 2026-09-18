# 音乐库模块改进执行计划（music improvement plan）

> 依据：`review.md`（四路并行审查合并台账，SEC/UI/PERF/FEAT 编号）。分支：`music-improvement-qoder-qwen38f`（自 `dev` 53824e3c）。
> 约定：每个条目 = 一个原子提交；顺序执行；每项先写能失败的复现测试，修复后跑回归（typecheck + 相关单测 + 受影响门禁 + pre-commit 全量静态门禁）再提交，提交后更新本文件状态与进度日志。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> review 条目编号见 `.qoder/improvement/music/review.md`。

## 基线

- [x] BASE-0 创建 worktree + `node_modules`/`blog-frontend/node_modules` 软链 + 复制 review.md + 登记本计划
- [x] BASE-1 基线门禁全绿确认（typecheck / 全量 test:unit）

## 第一批 · 安全（SEC-1~14，路线图①）

- [x] M-01 SEC-1a `stream.ts` WebDAV 分支 Content-Type 只用 `row.mime` 并过格式允许列表，非白名单降级 `application/octet-stream` + attachment
- [x] M-02 SEC-1b `app.ts` nonce 盖章限定已知 HTML 文档路由（`/`、`/s/*`、`/authorize`），`/api/*` 的 `text/html` 响应拒绝盖章并强制降级；`lookup.ts` 响应类型限 png/jpeg/webp
- [x] M-03 SEC-2 `patchTrackSchema.coverUrl` 改走 `sanitizeCoverUrl`，显式拒绝 `MUSIC_OBJECT_PREFIX` 前缀
- [x] M-04 SEC-3 删除 R2 对象按行重算 key（`source==='r2'` 且派生匹配）；`importMusicSchema.path` 禁 `music/` 开头、绝对路径与控制字符（保留 Unicode 文件名）
- [x] M-05 SEC-4 `public-settings` 加 `role==='owner'` 判定，关闭时清 owner key
- [x] M-06 SEC-5 `GET /api/music/webdav` 移出 `ensureMusicDir` 写副作用（改显式 POST/写入时确保）
- [x] M-07 SEC-6 cover-lookup 出站 `isAllowedOutboundUrl` + `*.apple.com` 白名单 + `redirect:'manual'`
- [x] M-08 SEC-7 抽共享出站/写预算工具，`music-webdav:*`、`music-play:*`、`music-write:*`、`music-lookup:*` 设具名限额
- [x] M-09 SEC-9 导入 mime 过允许列表；`Content-Length` 仅 R2 分支设置
- [x] M-10 SEC-10 `music-flac.ts`/`music-mp4.ts` 越界返回 null；`scanTrackMetadata`/工具栏调用点补 catch + toast
- [x] M-11 SEC-11 `webdav-xml.ts` 实体解码 RangeError 防护 + parse 兜底
- [x] M-12 SEC-12+FEAT-4 `MusicTrack` 不再下发 `objectKey`（服务端下发 format/extension）；M3U 导出改文件名/签名 URL；封面 `http://` 走 sanitize

## 第二批 · 死控件与静默丢失（UI/FEAT P0-P1，路线图②）

- [x] M-13 UI-1 正在播放面板收藏/置顶按钮接线 `toggleFavorite`/`togglePin`
- [x] M-14 UI-2 歌单描述透传落库（新建+重命名+编辑态回填），store 与 API 同步
- [x] M-15 UI-3 沉浸式播放器与 Hub modal 补可见关闭入口与 `ariaLabel`
- [x] M-16 UI-4 加载失败态：`music.retry` 重试按钮 + 技术字符串不外泄
- [x] M-17 UI-5/UI-6 幽灵令牌 `--accent-subtle`→`--accent-soft`（全仓 21 文件）+ `--sp-12` 修复
- [x] M-18 UI-7 触屏不可达的 hover-only 控件三处改 hub-tags 姿势（默认可见 + md: 降级 + pointer-events）
- [x] M-19 UI-8+PERF-18 队列 `indexOf` 索引错位修复 + byId useMemo + key 稳定化
- [x] M-20 UI-18+FEAT-2 单曲/歌单删除统一 `confirm(tone:'danger')`；加入队列 toast 反馈
- [x] M-21 UI-12 浮动播放器把手 `span role=button` 改 `IconButton` + 正确 `aria-label`（键盘移动模式另项）

## 第三批 · 性能结构三件套（PERF-1~4，路线图③）

- [x] M-22 PERF-1 曲目菜单全局单例化（store `menuTarget`），行内删 `useVisibleTracks` 与重复订阅
- [x] M-23 PERF-2 播放心跳出全局 store（独立 progress 订阅源），歌词高亮按 index 变化更新
- [x] M-24 PERF-3 `/library` 去 lyric 字段 + mutation 单条 merge + loadLibrary in-flight 去重/新鲜度
- [x] M-25 PERF-4 KV 分支 Range 请求窗口对齐（或文档化限制 + 禁尾部 range）

## 第四批 · IO 模型与批量任务（PERF-5~13/22~24，路线图④）

- [ ] M-26 PERF-8+PERF-5 `mapWithConcurrency` 工具；WebDAV 批量导入本地 append、尾一次 reload、并发 4–6
- [ ] M-27 PERF-12 搜索 debounce + `useDeferredValue`；罗马化分片
- [ ] M-28 PERF-9+PERF-14+PERF-15 批量元数据/封面并入 transfers 任务模型；PATCH 去重复查询；歌单路由 db.batch
- [ ] M-29 PERF-10 可视器 rAF 随暂停/隐藏停帧；AudioContext suspend/resume
- [ ] M-30 PERF-11 playback-sync 量化条件修复 + 服务端队列保存去串行往返
- [ ] M-31 PERF-13 WebDAV 目录超限具名错误 + truncated 显式标记
- [ ] M-32 PERF-6+PERF-7 元数据解析精确长度一次取 + Worker 化评估；下载流式 Blob + 进度节流
- [ ] M-33 PERF-21~24 MediaSession positionState/seekto；probe 超时；指针事件直写 DOM；prefs 落盘 debounce

## 第五批 · 能力兑现（后端就绪只差 UI，路线图⑤）

- [ ] M-34 UI-15 歌单拖拽/上下移接 `reorderPlaylist`；playlist scope 按 items 顺序短路排序
- [ ] M-35 UI-9 表头点击排序 + `aria-sort` + 升降序 + 艺人列（含 grid ARIA 结构整改）
- [ ] M-36 FEAT-1 播放失败自动跳下一首 + 连续失败熔断
- [ ] M-37 FEAT-6 元数据扫描「强制覆盖」开关
- [ ] M-38 FEAT-8 播放快捷键（空格/←→/上下曲）+ 命令面板条目
- [ ] M-39 UI-10/UI-11 空搜索结果与 WebDAV 失败态文案/出口接线
- [ ] M-40 FEAT-3+UI-24 上传：文件夹支持 + AbortController 真取消 + 类型预检 + 聚合反馈
- [ ] M-41 UI-16~22 剩余 a11y：Segmented 替换手写 radiogroup、timer aria-live、滚动容器 tabIndex、popover→Menu 语义

## 第六批 · 门禁补位（路线图⑥）

- [ ] M-42 token 反向校验门禁（使用未定义 var 即失败）
- [ ] M-43 bundle budget 增 music chunk 条目；music barrel 静态引入链懒化评估
- [ ] M-44 music 纳入 e2e-visual / check-contrast / surfaces 覆盖（含 375px 与 reduced-motion）

## 暂缓（需产品决策，见 review 路线图⑦）

- 离线播放（FEAT-10）、专辑/艺人分组视图、最近播放服务端化（FEAT-9）、EQ/ReplayGain/gapless/重复检测/视频/歌词搜索/歌单分享

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-18 | BASE-0/BASE-1 worktree+计划登记 | be5e08cd | typecheck ✅，全量 test:unit exit 0 ✅ |
| 2026-09-18 | M-01 流端点 Content-Type 白名单（SEC-1a） | 1700b4e3 | 新增 2 例先红后绿（text/html 回显证实），music 3 套件 27 ✅，pre-commit 全部门禁+增量测试 ✅ |
| 2026-09-18 | M-02b cover-lookup 响应类型白名单（SEC-1c） | 85f7eb4f | 新增 1 例先红后绿（上游 text/html 回显证实→500 拒绝），music-routes 16 ✅，typecheck ✅ |
| 2026-09-18 | M-02 nonce 盖章限定非 /api（SEC-1b） | 3053d51b | 新增 tests/security-headers.test.ts 3 ✅（/api 不盖章、/s 与 / 盖章一致）；中间件抽至 src/worker/middleware/security-headers.ts；全量 test:unit 207 文件 1645 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-03 PATCH coverUrl 走 sanitizeCoverUrl 白名单（SEC-2） | b5e7f15f | 新增 2 例先红后绿（内部 music/cover key 被接受并代理证实→null+404；https 保留且省略字段不清空），music 2 套件 27 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-04 删除按行派生 key + 导入路径命名空间隔离（SEC-3） | c372c1f1 | 新增 2 例先红后绿（伪造 victim key 被删证实→不删；music/ 前缀导入 201 证实→400），music 3 套件 32 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-05 public-settings 限 owner 且关闭清 key（SEC-4） | 5bd5f6fc | 新增 1 例先红后绿（member PUT 曾 200 证实→403；关闭后 owner meta 为空），music 3 套件 33 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-06 webdav 浏览去掉 GET 期 MKCOL（SEC-5） | 7681d1e2 | 新增 1 例先红后绿（缺目录时 GET 曾 404/发 MKCOL→现 200 空列表且零 MKCOL），music 3 套件 34 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-07 cover-lookup 出站主机白名单+手动重定向（SEC-6） | f8bcd60d | 新增 2 例先红后绿（非 Apple 主机 artwork 曾被直取、302 曾被当 200 回显→均 500 且零内部请求），music-routes 21 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-08 音乐四类端点具名小时预算（SEC-7） | a0f0dcac | 新增 2 例先红后绿（lookup 60 次后曾无限 200→现 429 带 retryAfter 且 play 家族不受影响；write/play key 曾不记账→现各自 fails=1），music 3 套件 38 ✅，typecheck/size（constants.ts 501 行入 grandfather 基线，常量表豁免）/comments ✅ |
| 2026-09-19 | M-09 导入 mime 过允许列表 + 代理不再伪造 Content-Length（SEC-9） | 692d6a61 | 新增 2 例先红后绿（audio/mpegurl 曾被原样入库→现按格式规范为 audio/mpeg；上游省略时曾用 size_bytes 造出 Content-Length:16 而正文仅 8 字节→现不再伪造），music 3 套件 40 ✅，typecheck/size/comments ✅ |
| 2026-09-19 | M-10 FLAC/MP4 解析越界返 null + 扫描调用点 catch（SEC-10） | e3cc0b7e | 新增 5 例先红后绿（picture 块 4 字节/vendor 2 字节/mvhd 截断曾抛 RangeError→现返回 null/0；scan 抛错曾中断整轮→现跳该曲计 unreadable 并 toast），music 客户端 5 套件 38 ✅，typecheck/size/comments ✅ |
| 2026-09-19 | M-11 multistatus 数字实体越界防护 + 逐块兜底（SEC-11） | 547a8302 | 新增 1 例先红后绿（&#99999999999; 曾致 parseMultistatus 抛 RangeError→现保留原文且正常实体照常解码），webdav 2 套件 20 ✅，typecheck/size/comments ✅；逐块 try 兜底为边界防御（守卫后当前无可触达抛点，已在注释说明） |
| 2026-09-19 | M-12 曲目契约不下发内部对象键 + M3U 可播放 + 封面 https 升级（SEC-12+FEAT-4） | 88dddcf6 | 4 处契约断言先红后绿（objectKey 曾随库下发→现 undefined 并以 format/webdavPath 代替，webdav 删除走 webdavPath；http 封面曾原样回显→现读时升级 https；M3U 曾写内部键不可播放→现写文件名），新增 music-export.test.ts 锁定 M3U 逐行输出；全量 test:unit 209 文件 1667 例 ✅，typecheck/size/comments ✅ |
| 2026-09-19 | M-13 正在播放面板收藏/置顶按钮接线 store toggle（UI-1） | d475c695 | 新增 2 例先红后绿（收藏/置顶按钮曾无 onClick 点击零调用→现调用 toggleFavorite/togglePin 且带当前曲 id），jsdom createRoot 真实挂载断言语义标签定位，typecheck ✅ |
| 2026-09-19 | M-14 歌单描述随新建/重命名落库并在编辑态回填（UI-2） | f0b4f136 | 新增 4 例（其中 2 例先红后绿：描述曾被 store 丢弃→现 trim 后随 createPlaylist/patchPlaylist 下发；无描述的重命名曾会清空→现 patch 不含 description 键），模态框描述框对已有歌单同样可见并预填，lib/api 桶补出 MusicPlaylistPatch，music 17 套件 115 ✅，typecheck/size/comments ✅ |
| 2026-09-19 | M-15 沉浸式播放器补可见关闭按钮与对话框可访问名（UI-3） | b9fc0bcb | 新增 2 例先红后绿（dialog 曾挂通用 overlay.dialog 且无可点关闭→现 aria-label=music.immersive 且 exit_immersive 按钮点击调用 onClose 一次；修复前断言实测收到 'overlay.dialog'），hub modal 同法补 ariaLabel=music.hub_title（其关闭按钮原本已在），typecheck ✅ |
| 2026-09-19 | M-16 加载失败态补重试按钮且技术字符串不外泄（UI-4） | 88bdd5c1 | 新增 2 例（1 例先红后绿：修复前 dialog 实测渲染出 'fetch failed' 且无重试按钮→现仅显示 music.load_failed + Retry 接 loadLibrary，另 1 例守住成功态不出现失败面板）；原始 error 改由 library-load catch console.warn 记录；播放路径 toast 沿用模块统一 toastMusicError 形态未动（已记录）；music 18 套件 119 ✅，typecheck ✅ |
| 2026-09-19 | M-17 幽灵令牌 --accent-subtle 全量替换为 --accent-soft 并补 --sp-12（UI-5/UI-6） | 04acd7c8 | 修复前实测：tokens.css 定义 0 处、var 引用 27 处横跨 22 文件（选中态底色实际透明）；现全量替换并 grep 余 0，含 music/share/blog/components 与 blog-frontend 1 文件；tokens.css 补 --sp-12:48px（行高预留 containIntrinsicSize 生效，非共享令牌故漂移基线仍 88）；主仓 557 例 + blog 270 例 ✅，typecheck/tokens:check ✅；反向校验门禁按计划留待 M-42，视觉断言留待 M-44 |
| 2026-09-19 | M-18 触屏可达：行/卡片/队列操作改 hub-tags 姿势（UI-7） | 2c5c914d | 三处控件由无条件 opacity-0（触屏不可见且透明钮反向拦截点击）改为默认可见、md: 起 hover/focus 降级并配 pointer-events-none/auto；收藏曲目的心形按钮全断点常显。无自动化红：媒体查询行为 jsdom 不可断言，手动验证=窄窗(<768px)三处按钮直接可见可点、宽窗悬停行才显形；375px 视觉断言随 M-44 入门禁。music 17 套件 91 ✅，typecheck ✅ |
| 2026-09-19 | M-19 重复入队曲目按自身位次播放/移除 + byId 记忆化（UI-8+PERF-18） | 526737b3 | 新增 2 例先红后绿（修复前 queue.indexOf 恒返回首个下标：第二次出现的 a 曾 removeFromQueue(0)/playQueueAt(0)→现均为 2，React 同时实测报出 duplicate key `a-0` 告警；修复后告警消失），O(Q²)→O(Q+S)，byId 以 useMemo 随 tracks 缓存，music 18 套件 93 ✅，typecheck/size/comments ✅ |
| 2026-09-19 | M-20 单曲/歌单删除统一 danger 确认 + 加入队列 toast 反馈（UI-18+FEAT-2） | 3d57ecce | 新增 3 例先红后绿（三个入队分支曾全部静默→现均 toast music.added_to_queue，含去重换位分支）；删除确认复用既有 delete_track_confirm/delete_playlist_confirm 未引用键（歌单文案注明曲目保留），与批量/远端删除同 confirm({tone:'danger'}) 形态；确认弹窗为 overlay 门控，键盘路径手测（打开焦点入对话框/ESC 取消），视觉门禁随 M-44；music 19 套件 96 ✅，typecheck ✅ |
| 2026-09-19 | M-21 浮动播放器把手换 IconButton 且文案改移动语义（UI-12） | 248ea804 | 新增 2 例先红后绿（修复前实测捕获 span[role=button] 且 ArrowRight 零调用→现为原生 button（aria-label=music.move_player 新键，en/zh 同步，删无引用的 drag_to_reorder 误导键）且 ArrowRight 提交 {x:116,y:100} 即 16px 键盘步长；键盘方向移动本就在 drag.onKeyDown，无需新行为），music 20 套件 98 ✅，typecheck/i18n ✅ |
| 2026-09-19 | M-22 曲目菜单全局单例化：菜单请求入 store，行内不再各挂一份（PERF-1） | e06460ce | 新增 5 例（4 例先红后绿：修复前每行各挂一份 MusicTrackMenu 且第二行开启时实测同时存在 2 个 role=menu、store 无 trackMenu 可用→现按钮/右键均只投递 {target,anchor} 请求，全 hub 唯一实例，条目执行后自动关闭）；useTrackMenuItems 删去每实例一次的 useVisibleTracks（9 订阅+整库派生），play-all 改为点击时对 getState() 惰性派生；行/卡删局部 isMenuOpen/menuButtonRef 与内联 target={{track}} 字面量；TrackGrid 与表格视图共用的 use-track-menu.ts 随死代码删除；handlers 仍在列表层构一次保持行 memo 生效。music 21 套件 103 ✅，typecheck/size/comments ✅ |
| 2026-09-19 | M-23 播放心跳移出全局 store：独立 progress 订阅源，歌词高亮按 index 变化更新（PERF-2） | 896b0ffe | 新增 6 例全部先红后绿（修复前 progress 模块不存在即红；现 heartbeat/seek 只写 progress store，主 store 状态对象身份实测不变，切歌清零进度，位置保存仍由进度心跳按 >4s 步长触发）；新增 music-store/progress.ts（zustand 小 store + setProgressTime/progressTimeMs），types/index 删 currentTimeMs；player.ts onTime/seek/playTrack/playCollection/playQueueAt/removeFromQueue/clearQueue/loadAndPlay 断点续播改走 progress；playback-sync restore/save 读写 progress，session-sync 双订阅合并快照保住原保存节奏；7 处 UI 订阅（悬浮条/进度环、控制条、状态栏、迷你与沉浸与侧栏歌词）改 useProgress，歌词高亮选择器返回行号数值→仅换行才重渲染；useSeekNudge 改点击时读 progressTimeMs() 不再每拍重渲染。music 22 套件 109 ✅，全量单测 218 套件 1695 ✅，typecheck/size/comments ✅ |
| 2026-09-19 | M-24 库负载去 lyric：/library 只发 hasLyric 标志 + GET /tracks/:id/lyric 懒取，mutation 单条本地 merge 不再整库 reload，loadLibrary in-flight 去重 + 60s 新鲜度（PERF-3） | a293667a | 9 例先红后绿（worker 路由断言库内 lyric 为 null/hasLyric 为真且懒取端点返回全文、PATCH 清空后标志回落；store 断言并发共享一次请求/新鲜期跳过/60s 后重取/失败立即可重试/force 绕过；单条删除与批量收藏实测不再触发 library()）；MusicTrack 新增 hasLyric，rows.ts 出 toLightTrack（SQL CASE 出 has_lyric 列，不再 SELECT lyric 大字段），library.ts 走轻负载；tracks.ts 注册 GET /tracks/:id/lyric；客户端 api.music.trackLyric + 存储层 ensureTrackLyric（hasLyric 且 lyric===null 才取，pending 去重，失败仅告警）；deleteTrack/batchTracks/create/rename/deletePlaylist/addToPlaylist/removeFromPlaylist 全部本地 merge + summarizeLibrary 客户端重算 stats，上传/webdav 导入/移标签失败兜底改 loadLibrary(true)；loadLibrary(set,get,force) 模块级 in-flight 共享 + store 字段 lastLoadedAt 60s 新鲜度（失败不记时间）；工具栏刷新按钮显式 force；三处歌词消费点挂 useTrackLyric，编辑曲目标题弹窗在歌词在途时禁用保存且回填不丢用户已编辑内容；demo 后端同步轻负载 + 懒取端点 + patchTrack 维护 hasLyric。music/demo 28 套件 175 ✅，全量单测 219 套件 1707 ✅，typecheck 与全部静态门禁（size 无新增豁免）✅ |
| 2026-09-19 | M-25 KV Range 改 1MB 对齐窗口流式读取（PERF-4） | 本次提交（hash 由下一次提交回填） | 6 例先红后绿（3MB 对象取 100 字节：206 Content-Range 为对齐窗口 bytes 1048576-2097151/3145728、Content-Length=窗口 1MiB、fake KV 实测 arrayBuffer 读取 0 次、stream 拉取 ≤2MiB+64KiB 且提前 cancel；16 字节小文件窗口按 size 截断为 0-15/16；≥1MiB 请求不改动原样透传；跨窗口边界请求扩到下一边界 0-2097151；无 Range 仍走 arrayBuffer 恰 1 次）。range.ts 新增 KV_RANGE_WINDOW_BYTES+alignKvRangeWindow（length≥窗口直通，否则 floor/ceil 对齐并保证包含被请求区间、按 size 截断）；storage.ts KV 有 range 分支改 get(key,'stream')+sliceKvStream 逐块跳读，命中窗口尾 reader.cancel() 且 controller.close()，isolate 不再物化整段 ≤25MiB 值，无 range 保持 arrayBuffer（需真实 byteLength 出 Content-Length）；stream.ts 仅当 backend 为 kv 时把 range 对齐为窗口，Content-Range 如实描述被服务的窗口（nginx slice 先例，浏览器可接受超集 206）。R2 路径与既有精确 Content-Range 断言未动。music-routes 31 ✅，全量单测 219 套件 1712 用例两轮 ✅（首轮 1 例负载抖动超时、复跑两轮全绿），typecheck 与全部静态门禁（escape 双改单经一次修正、size 无新增豁免）✅ |
