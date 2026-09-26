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

- [ ] FEA-A3-1 Alist 服务器配置管理（名称/URL/token/根路径，存服务端设置，密钥只走服务端）
- [ ] FEA-A3-2 Alist 目录浏览与音频导入（复用 WebDAV 引用行管线：登记元数据、不计配额）
- [ ] FEA-A3-3 Alist 站内搜索导入

## 批次 F④ · 播客 RSS（L）

- [ ] FEA-A2-1 播客订阅管理（RSS 源增删改、退订；服务端表迁移只增不改）
- [ ] FEA-A2-2 RSS 解析与分集列表（服务端代抓 + 限长 + 缓存，参考 otter rss-parser 职责）
- [ ] FEA-A2-3 OPML 批量导入导出
- [ ] FEA-A2-4 分集播放打通（复用音频引擎与队列；分集封面/时长/已听进度）

## 批次 F⑤ · 在线多音源聚合（L，最后做）

- [ ] FEA-A1-1 Provider 抽象 + 设置开关（默认全关；`src/client/features/music/providers/` 新目录，经 `index.ts` 公开入口）
- [ ] FEA-A1-2 Worker 代理路由：域名白名单 + `budget.ts` 新限额族 + 响应限长（复用 `readResponseBytesWithinLimit`）
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
