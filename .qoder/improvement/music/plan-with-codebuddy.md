# 音乐库模块改进执行计划（CodeBuddy · 2026-09）

> 依据：2026-09-25 音乐库模块第三轮复审报告（SEC/UI/A11Y/V/PERF/FEAT 编号）。
> 分支：`music-improvement-codebuddy-hy4`（自 `dev` `cc09e4b3`）。
> worktree：`/home/kubuntu/code/cloudflare/inkstone-music-improvement-codebuddy-hy4preview`（依赖已软链，软链写入 `info/exclude`）。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**，修复后跑回归（typecheck + 相关单测 + 受影响门禁）再提交，**提交后立刻更新本文件**。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）

## 基线

- [x] BASE-0 创建 worktree（`/home/kubuntu/code/cloudflare/inkstone-music-improvement-codebuddy-hy4preview`，分支 `music-improvement-codebuddy-hy4` @ `cc09e4b3`）+ 软链 `node_modules`、`blog-frontend/node_modules` 并登记 `info/exclude`
- [x] BASE-1 基线门禁确认：`npm run typecheck` ✅ exit 0（151.62s）
- [x] BASE-2 钩子确认：`core.hooksPath=.githooks` 生效，pre-commit 跑 12 项静态门禁 + `tsc -b` + `vitest related`（30s 超时）
- 门禁备注：新增/修改注释后必须 `node scripts/sync-comments-allowlist.mjs` 重建注释白名单（双向失败）
- 浏览器门禁（`scripts/e2e-visual.mjs` / `scripts/check-contrast.mjs`）需本机 Chrome 与本地实例（`npm run dev:kv`），跑不了时在「已知限制」列写明

## 条目清单

### 批次 ① · 一致性与可访问性速修（S，先做）

- [x] M-A11Y-2 `music-seek-bar.tsx` 去掉 `outline-none`（对齐共享 `Slider`），键盘焦点圈回归（`7a275122`）
- [x] M-UI-1 `music-hub-playlists.tsx` 新建/行菜单按钮改为默认可见、`md:` 起 hover 降级（触屏可发现）
- [x] M-UI-2 `music-player-controls.tsx` / `music-now-playing.tsx` 裸 `<img>` 改 `MusicArtwork`（封面 404 兜底）（`482e516e`）
- [x] M-A11Y-1 `music-hub-tags.tsx` / `music-hub-playlists.tsx` 自造 `<input>` 改共享 `Input`（恢复焦点圈）（`557a45d3`）
- [x] M-UI-4 浮动播放器「移动播放器」按钮补键盘/点击动作 + `aria-describedby` 提示方向键（`4f199136`）
- [x] M-UI-6 沉浸式播放器歌词空态复用三态判定（未播放≠没有歌词）（`36250742`）
- [x] M-UI-7 专辑/歌手分组视图补 `loading` 态（`d82238c5`）
- [x] M-UI-8 状态栏曲名按钮补 `aria-label`（动作语义）+ 去掉冗余原生 `title`（`9ace6706`）
- [x] M-UI-9 编辑曲目弹窗标题必填校验（或去掉 `required`），禁止静默回退（`a7b349f0`）
- [x] M-UI-10 睡眠定时菜单补 `aria-pressed` 与选中态（不得仅靠颜色）（`2ae43e16`）
- [x] M-A11Y-3 弹层触发器不再同时输出 `aria-pressed` 与 `aria-haspopup`/`aria-expanded`（`e9ca7919`）
- [x] M-A11Y-4 曲表表头占位列补语义（去 axe `empty-table-header` 面）（`4e05c0c7`）
- [x] M-A11Y-5 歌词/详情 `Segmented` 组名与选项重名，改用表达用途的键（`9eb82450`）
- [x] M-A11Y-6 `clear_queue` / `search_clear_history` 文字按钮触控目标提到 ≥24px（`5df503c4`）
- [x] M-UI-11 删除死文案键（两语言同步）（`df2ee5d2`）
- [x] M-UI-3 网格卡片 `div+onClick` 改为语义容器 + 卡片内既有控件承载动作（`a8f316e0`）
- [x] M-UI-5 `MusicPopover` 复用 `components/popover-placement`（`0a31e3f8`）
- [x] M-V-4 三处播放器职责收敛（Hub 打开时压制浮动/状态栏传输）（`a1465e13`）

### 批次 ④ · 安全纵深（S–M）

- [x] 写预算：`playlists.ts` / `tags.ts` / `playback.ts` 补 `enforceMusicBudget('write')`（`cc1997b9`）
- [x] 孤儿封面：删除曲目/替换封面时回收 `music/cover/*` 对象（`77ee084e`）
- [x] 上游流式限长：`lookup.ts` / `lyrics.ts` 改 `readResponseBytesWithinLimit`（`fe96589d`）
- [x] CSP：`security-headers.ts` 外部图片排除名单补 `/c/` 与 `/playlist/`（`487ceef6`）
- [x] WebDAV 头信任：webdav 行不计入本地配额；回显 `Content-Length/Range` 校验（`26af16f7`）
- [x] 配额原子化：`upload.ts` 补插入后补偿校验（TOCTOU）（`c7ab225c`）

### 批次 ② · 性能结构（M）

- [x] PERF-1 行 `handlers` 引用稳定化（选择下沉），恢复行 `memo`（`8157794f` + `0dc94693`）
- [x] PERF-5/6 scope 派生记忆化 + `useVisibleTracks` 单例化（`4b02ba28`）
- [x] PERF-7 `id→Tag` 映射单 memo 下传（`d9d8d3e6`）
- [x] PERF-8 侧栏 `recentCount` 改 `stats`/memo 派生（`65494b60`）
- [x] PERF-9 队列列表 `useMemo` + `memo(QueueItem)`（`bae4f7a0`）

### 批次 ③ · 网络与存储（M–L）

- [ ] PERF-3 播放位置与队列分开持久化
- [ ] PERF-4 `/library` keyset 分页 + ETag/增量
- [ ] PERF-10 KV 无 Range 全量读改流式
- [ ] PERF-11 浮窗/沉浸层 `lazy` 化
- [ ] PERF-12 bundle 预算按 eager/lazy 分层

### 批次 ⑤ · 能力兑现（需产品决策）

- [ ] F-1 歌词逐行点击跳转 + 时间轴偏移校准
- [ ] F-7 EQ 预设
- [ ] F-5 M3U 导入
- [ ] F-9 A-B 循环 / 睡眠淡出
- [ ] F-10 搜索覆盖歌词与标签名

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-25 | BASE-0/1/2 worktree + 基线 + 钩子确认 | —（无提交） | typecheck ✅ exit 0（151.62s） | 依赖软链以 `info/exclude` 登记，不进提交 |
| 2026-09-25 | M-A11Y-2 进度条恢复键盘焦点圈 | `7a275122` | 先红：`classList.contains('outline-none')` 为 true；修复后 2 ✅；music 60 文件 / 461 例 ✅；12 项静态门禁 ✅（注释白名单 1047 文件 / 8330 条）；提交钩子 `vitest related` 7 文件 / 30 例 ✅ | jsdom 无法断言 `:focus-visible` 实际绘制，守卫的是「不抑制」这一契约；真实焦点圈由 `check-contrast`/`e2e-visual` 覆盖 |
| 2026-09-25 | M-UI-2 封面 404 兜底（两处裸 img 改 MusicArtwork） | `482e516e` | 先红 2 例（修复前实测 error 事件后 img 仍在、图标未出现）；修复后 2 ✅；music 61 文件 / 465 例 ✅；12 项静态门禁 ✅（注释白名单 1049 文件 / 8339 条）；提交钩子 `vitest related` 6 文件 / 36 例 ✅ | 兜底契约由 jsdom 的 error 事件断言；真实网络 404 的行为与既有 `MusicArtwork` 表面一致 |
| 2026-09-25 | M-UI-1 歌单控件触屏可见 | `cdfd75c5` | 先红 2 例（`opacity-0` 为 true、`md:opacity-0` 缺失）；修复后该文件 10 ✅；12 项静态门禁 ✅（注释白名单 1048 文件 / 8336 条）；提交钩子 `vitest related` 5 文件 / 33 例 ✅ | 媒体查询行为 jsdom 不可断言，断言守的是类名契约；375px 目视由 `e2e-visual` 既有 music 表面覆盖 |
| 2026-09-25 | M-A11Y-1 中枢两处裸 input 改共享 Input | `557a45d3` | 先红 2 例（两字段无共享焦点圈）；修复后 2 ✅ + hub-playlists 10 ✅；music 62 文件 / 467 例 ✅；提交钩子全绿 | 首提交钩子因夹具 Tag 类型报 TS2739，改 MusicTag 夹具后过 |
| 2026-09-25 | M-UI-4 移动播放器把手补激活动作与方向键提示 | `4f199136` | 先红 2 例（激活零调用、无 aria-describedby）；修复后 4 ✅；提交钩子全量 2593 ✅ | 点击=回默认角落（拖拽后的点击经 isClickAfterDrag 吞掉），提示文案进 sr-only |
| 2026-09-25 | M-UI-6 沉浸式歌词空态三态 | `36250742` | 先红 2 例；修复后 music 三文件 44 ✅ | lyricsEmptyKey/lyricsPending 抽入 music-utils，now-playing 同步换用 |
| 2026-09-25 | M-UI-7 分组浏览 loading 态 | `d82238c5` | 先红 1 例；修复后 11 ✅ | — |
| 2026-09-25 | M-UI-8 状态栏曲名按钮动作语义 | `9ace6706` | 先红 2 例（回退 HEAD 实测）；修复后 3 ✅ | 新键 music.open_hub_track |
| 2026-09-25 | M-UI-9 编辑曲目标题必填校验 | `a7b349f0` | 先红 1 例；修复后 7 ✅；提交钩子全量绿 | 空标题禁用保存 + 字段级 hint + aria-invalid，删除静默回退 |
| 2026-09-25 | M-UI-10 睡眠菜单选中态 | `2ae43e16` | 新增 4 例（分钟档修复前无 aria-pressed）；music 64 文件 482 ✅ | store 新增随偏好持久化的 sleepMinutes；index.ts 初始状态按库/播放拆分过 size 门禁 |
| 2026-09-25 | M-A11Y-3 弹层触发器去 aria-pressed | `e9ca7919` | 先红 6 例（回退 HEAD 实测）；修复后 7 ✅ | IconButton 新增 highlight（只画强调不出 pressed） |
| 2026-09-25 | M-A11Y-4 曲表占位列补语义 | `4e05c0c7` | 先红 1 例；修复后 8 ✅ | 占位列 columnheader + aria-hidden（行子级全为 cell 的 axe 面收紧，不播报空表头） |
| 2026-09-25 | M-A11Y-5 Segmented 组名 | `9eb82450` | 先红 1 例；修复后 16 ✅ | 组名复用既有 music.now_playing 键，无新增 i18n |
| 2026-09-25 | M-A11Y-6 文字按钮触控目标 | `5df503c4` | 先红 2 例（回退 HEAD 实测）；修复后 14 ✅ | min-h-6（24px）+ px-1.5，类名契约断言（jsdom 不可量像素） |
| 2026-09-25 | M-UI-11 删除死文案键 | `df2ee5d2` | 新增门禁测试：16 个零引用键删除后全库扫描 0 残留 | 扫描排除 locales 目录本身；动态拼键未来若出现需显式放行 |
| 2026-09-25 | M-UI-3 网格卡片语义容器 | `a8f316e0` | 先红 2 例；修复后 music 66 文件 495 ✅ | 卡片根 role=group+曲名；选择走复选框、播放走封面按钮、右键菜单保留 |
| 2026-09-25 | M-UI-5 MusicPopover 复用共享定位 | `0a31e3f8` | 先红 1 例（placePanel 桩）；修复后绿 | 面板自测尺寸后喂共享 placePanel，未用 usePanelPlacement（其需预知尺寸） |
| 2026-09-25 | M-V-4 三处播放器职责收敛 | `a1465e13` | 新增 4 例（让位/恢复）；music 67 文件 500 ✅ | e2e-visual 断言重排：不相交量测移到开中枢前，另加「中枢在场浮动播放器让位」；浏览器门禁待本机实例复跑（见已知限制） |
| 2026-09-26 | 批次④-写预算 歌单/标签/播放进度写入账 | `cc1997b9` | 三族入账断言 ✅；music + routes 门禁 ✅；提交钩子全绿 | playback 族单列（心跳高频，不与 library-write 共键以免互相挤占）；原 2000/h 常量新增于 constants.ts |
| 2026-09-26 | 批次④-孤儿封面 删曲目/换封面回收封面对象 | `77ee084e` | 先红 2 例（删曲目、换封面后对象仍在）；修复后 music-routes 60 ✅；12 项静态门禁 ✅（注释白名单 1060 文件 / 8414 条）；提交钩子 11 文件 / 173 例 ✅ | 回收只认 `isDerivedCoverKey`（trackId+createdAt 派生），继承/伪造的 `cover_url` 不删；fakeR2 delete 改为真移除，断言改看桶内残留 |
| 2026-09-26 | 批次④-上游限长 封面/目录/歌词响应边读边裁 | `fe96589d` | 先红 9 例（回退 src 实测，含流式例 `artworkPulled` 为 0）；修复后 music-routes 64 ✅；typecheck ✅；12 项静态门禁 ✅（8429 条）；提交钩子 10 文件 / 173 例 ✅ | fetch 桩统一改带真实 `body`（stubbedResponse/bodyOf/jsonBody）；「声明超限」例特地留 `arrayBuffer`，否则旧实现也会因缺方法而 500，属假绿 |
| 2026-09-26 | 批次④-CSP 公开集合/歌单页排除外部图片 | `487ceef6` | 先红 1 例（`/c/probe` 实测带 `https:`）；修复后 security-headers 5 ✅；typecheck ✅；12 项静态门禁 ✅（8433 条） | 排除名单抽为 PUBLIC_PAGE_PREFIXES/EXACT；新增「已登录且开启外部图片」对照例，证明红灯来自放行分支而非没登录 |
| 2026-09-26 | 批次④-WebDAV 头信任 配额口径 + 长度回显校验 | `26af16f7` | 先红 4 例（还原 upload/stream/bundle 实测：413→201、`'sixteen'`、`'bytes 0-99'`、导入跳过 1 首）；修复后 music-routes 65 + webdav 17 + bundle 8 ✅；typecheck ✅；12 项静态门禁 ✅（8451 条）；提交钩子 11 文件 / 181 例 ✅ | 新增 quota.ts 作配额唯一口径，upload 与 bundle 共用；非 206 不再带 Content-Range。注：验证红灯时误弹出别人的 kanban WIP stash，已用 HEAD 版本复位，改动仍在 `stash@{0}` |
| 2026-09-26 | 批次④-配额原子化 插入后复核并回滚 | `c7ab225c` | 先红 1 例（禁用补偿分支实测 201→413）；修复后 music-routes 66 ✅；typecheck ✅；12 项静态门禁 ✅（8461 条）；提交钩子 11 文件 / 182 例 ✅ | 为过 size 门禁把上传拆成 storeUploadedTrack + commitUpload；竞态用 staleQuotaDb 代理注入（首次配额读返回陈旧值），非靠 sleep |
| 2026-09-26 | PERF-1 行 handlers 稳定化 | `8157794f` `0dc94693` | 先红 3 例（改选中/切曲/暂停均为 3 行重画）；修复后各 1 行；music 68 文件 / 503 例 ✅；12 项静态门禁 ✅（8475 条） | 新增 music-row-render.test.ts：用同构 `memo` 包装计数，守住 memo 边界而非断言内部实现；播放态只给当前行 |
| 2026-09-26 | PERF-5/6 派生列表单例化 | `4b02ba28` | 先红 2 例（visibleTracks 实测 2 / 5 次）；修复后均 1 次；music 69 文件 / 505 例 ✅；typecheck ✅；12 项静态门禁 ✅（8478 条） | 工具栏与分组详情头改收 `tracks` prop；计数器忘了在 beforeEach 归零，一度误报 2 次 |
| 2026-09-26 | PERF-7 id→Tag 映射整表共享 | `d9d8d3e6` | 先红 6 次着色（每行解析一次）→ 修复后 2 次；music 70 文件 ✅；typecheck ✅；12 项静态门禁 ✅（8488 条）；提交钩子 15 文件 / 74 例 ✅ | 计数改打在 `tagColorValue`（跨模块、可拦截），先试 `toTagRows` 因同模块内部调用拿不到数；无 provider 时行内兜底自解析，标签不静默消失；为过 size 门禁把 handlers 抽成 useRowHandlers |
| 2026-09-26 | PERF-8 侧栏最近播放计数按库记忆化 | `65494b60` | 先红 15 次读（无关更新各重扫一次）→ 修复后 9 次；music 71 文件 ✅；typecheck ✅；12 项静态门禁 ✅（8494 条） | 用 `lastPlayedAt` getter 计数，不靠 mock 内部函数；导航项抽 useNavItems、行抽 NavRow 以守住函数行数 |
| 2026-09-26 | PERF-9 队列行只随队列重画 | `bae4f7a0` | 先红 3 次行重画（重渲染列表但队列不变）→ 修复后 0 次；music 72 文件 ✅；typecheck ✅；12 项静态门禁 ✅（8500 条）；提交钩子 16 文件 / 79 例 ✅ | `rows` useMemo + `QueueRowItem` memo + 拖拽回调 useCallback；`onDropRow` 改收 (from,to) 由行内给出目标位 |
