# 音乐库模块复审报告 · 现有功能不完整与逻辑缺陷（ZCode · GLM-5.3-Flash · 2026-09-26）

> 范围：只针对**当前已实现能力**的不完整点与逻辑缺陷，不含对标参考项目的新功能（见 `docs/features/music/review-with-zcode_glm53fmax.md`）与 UI 布局重构（见 `docs/refactor/music/review-with-zcode_glm53fmax.md`）。
> 依据：代码逐文件审查 + 上一轮 `.qoder/improvement/music/plan-with-codebuddy.md` 收尾时明示的「已知限制」。
> 配套执行计划：`docs/improvement/music/plan-with-zcode_glm53fmax.md`。
> 严重度：P1 影响正确性/核心体验 · P2 明显缺陷 · P3 限制说明（默认不升级，记录在案）。

## P1 · 功能不完整

### IMP-1 全库歌词搜索缺失：只能搜到「已加载进 store」的歌词

- 现状：`src/client/features/music/music-search.ts` 的歌词检索只扫 store 内的 `lyric` 字段；`/library` 有意不下发歌词正文（按需按 id 拉取，`music-store/library-tracks.ts` ensureTrackLyric），因此**从未播放过/未打开过详情的曲目，其歌词永远不参与搜索**。
- 影响：搜索「歌词里的一句话」结果集不稳定——播过的歌能搜到，没播过的搜不到，用户无从知道原因。
- 修复方向：服务端新增歌词检索（`lyric LIKE` 或 FTS5），客户端搜索结果异步合并 + 竞态处理（对应上一轮已知限制原文）。

### IMP-2 重复文件检测只认 contentHash，WebDAV 引用曲永不成组

- 现状：`src/client/features/music/music-duplicates.ts`（注释 M-53）按上传时 worker 计算的 `sha256 contentHash` 分组；WebDAV 路径导入的引用曲目与早期建库的行没有 contentHash，永远不成组。
- 影响：「重复文件」视图对 WebDAV 用户是永久空视图，与「重复文件」导航项的存在预期不符。
- 修复方向：对无 contentHash 的曲目补一档近似分组键（归一化 title + artist + duration 容差），与 contentHash 分组并列呈现并标注「近似判定」。

### IMP-3 曲库列表无虚拟滚动，搜索结果 200 条 DOM 截断

- 现状：`music-track-list.tsx` 把可见曲目全量渲染成行；`music-search.ts` 对搜索结果设 200 条 DOM 上限，超出只计数提示「还有 N 条未显示」。
- 影响：大曲库（千首级）滚动/选择卡顿；搜索超过 200 条的结果不可见也不可操作。
- 修复方向：行高恒定的最小窗口化渲染（不引新依赖），解除 200 条截断。

### IMP-4 A-B 循环只在沉浸式播放器有控件，进度条无区间高亮

- 现状：`music-store/player.ts` 的 markLoopStart/markLoopEnd 逻辑完整，但入口只在 `music-immersive-player.tsx`；共享 `MusicSeekBar` 是裸 `input[type=range]`，无可叠加的区间元素（上一轮已知限制原文）。
- 影响：Hub / 状态栏 / 浮窗里标记了循环区间后完全不可见，也无从清除。
- 修复方向：MusicSeekBar 增加可选区间轨道层（几何重排一次做对），Hub 与状态栏暴露循环控件入口。

### IMP-5 播放模式「随机」是随机换一首，无洗牌队列

- 现状：`music-utils.ts` computeNextIndex 的 shuffle 分支在切换时随机取下一首，不打乱队列、无「不重复历史」。
- 影响：曲多时随机可能连续命中同一首附近；用户预期（随机播放全部=洗牌队列）与实现不符。
- 修复方向：随机模式引入洗牌序列（保持当前曲首位、可还原原序，对齐 otter 的 reshuffle 语义）。

## P2 · 能力缺口（现有功能的参数/覆盖面过紧）

### IMP-6 睡眠定时只有 15/30/45/60 分钟预设

- 现状：`music-store/player.ts`（SLEEP 预设 + 播完当前停）。无自定义分钟数。
- 修复方向：预设菜单补自定义输入（1–480 分钟），持久化与恢复逻辑不变。

### IMP-7 歌词偏移上限 ±5s、最多 500 首

- 现状：`music-store/player.ts` nudgeLyricOffset 的 clamp 与 lyricOffsets 上限。
- 影响：口型对不齐超过 5s 的录音/朗诵类曲目无法校准；500 首之上的曲目静默不保存。
- 修复方向：放宽至 ±30s；500 首上限改为容量提示（达到后提示并要求清理），不静默丢弃。

### IMP-8 倍速固定 6 档，无细步进

- 现状：`music-store/state.ts` PLAYBACK_RATES = 0.5/0.75/1/1.25/1.5/2。
- 修复方向：档位间长按/加减按钮按 0.05–0.1 步进；preservesPitch 链路不变。

### IMP-9 M3U 导入丢弃远程 URL 条目

- 现状：`music-m3u.ts` matchM3uTracks 只按文件名/标题/artist-title 三种键匹配本地曲库，`http(s)://` 行只能落进「未匹配」警告。
- 修复方向：URL 条目直接入队为临时播放项（不进曲库、不入歌单），警告只报真正无法解析的行。

### IMP-10 歌单封面纯派生，无法自定义

- 现状：`music-utils.ts` playlistCoverUrl 取手动顺序第一个有封面的曲目；无上传/选择封面入口（otter 可设封面）。
- 修复方向：与曲目换封面同管线（R2 派生对象 + 回收），歌单结构已有 share_slug 等列，迁移只增不改。

### IMP-11 歌词搜索需 ≥3 字符且为普通子串

- 现状：`music-search.ts`（避免误命中 + 性能的取舍）。
- 修复方向：随 IMP-1 的服务端歌词检索一并评估（FTS 后可放宽到 2 字符/分词）。

### IMP-12 歌词偏移、浮窗位置等偏好仅本地，不跨设备

- 现状：`music-store/persist.ts` 走 localStorage；服务端只持久化队列/索引/位置（`music_playback` 表）。
- 修复方向：可选——把这些偏好并入服务端 playback 偏好列或独立键值；属增强而非缺陷，默认不做，记录在案。

## P3 · 限制说明（有意的取舍，默认不升级）

### IMP-13 响度归一化是 RMS 近似，非 LUFS

- `audio-engine.ts` 注释明示（目标 -16dBFS、最大 ±12dB、平滑 0.25）。LUFS 需 ITU-R BS.1770 前向增益历史，成本与收益不成比例。**判定：不升级。**

### IMP-14 EQ 仅 3 段，预设刻意粗糙

- `music-eq-presets.ts`（"not a voicing claim"）。10 段 EQ 需要重排 BiquadFilter 链与预设体系，属独立产品决策。**判定：可选，不进本轮。**

### IMP-15 crossfade 仅音频，视频切换为硬切

- `audio-engine.ts` startCrossfade 注释（双 `<video>` 元素渐变会有画面重影）。**判定：不升级。**

### IMP-16 KV 部署单文件 25MB 上限（R2 为 64MB）

- `storage.ts`/`range.ts`（KV 值大小限制所致，Range 为对齐整窗读取）。**判定：平台限制，不做。**

### IMP-17 WebDAV 慢流 20s 看门狗暂停，不做后台缓冲

- `music-store/player.ts` armStreamWatchdog（浏览器无磁盘级缓冲控制，后台预取受 CORS/缓存策略约束）。**判定：不升级。**

## 缺陷登记汇总

| 编号 | 严重度 | 摘要 | 证据 |
| --- | --- | --- | --- |
| IMP-1 | P1 | 全库歌词搜索缺失 | `music-search.ts`、`library-tracks.ts` ensureTrackLyric |
| IMP-2 | P1 | 重复检测漏掉无 contentHash 曲目 | `music-duplicates.ts`（M-53 注释） |
| IMP-3 | P1 | 无虚拟滚动 + 搜索 200 条截断 | `music-track-list.tsx`、`music-search.ts` |
| IMP-4 | P1 | A-B 循环控件/区间高亮仅沉浸层 | `music-immersive-player.tsx`、`MusicSeekBar` |
| IMP-5 | P1 | 随机=随机换一首，无洗牌队列 | `music-utils.ts` computeNextIndex |
| IMP-6 | P2 | 睡眠定时无自定义分钟 | `music-store/player.ts` |
| IMP-7 | P2 | 歌词偏移 ±5s/500 首上限 | `music-store/player.ts` nudgeLyricOffset |
| IMP-8 | P2 | 倍速固定 6 档 | `music-store/state.ts` PLAYBACK_RATES |
| IMP-9 | P2 | M3U 导入丢弃 URL 条目 | `music-m3u.ts` matchM3uTracks |
| IMP-10 | P2 | 歌单封面不可自定义 | `music-utils.ts` playlistCoverUrl |
| IMP-11 | P2 | 歌词搜索 ≥3 字符子串限制 | `music-search.ts` |
| IMP-12 | P2 | 播放偏好不跨设备 | `music-store/persist.ts`、`music_playback` |
| IMP-13 | P3 | RMS 非 LUFS | `audio-engine.ts` 注释 |
| IMP-14 | P3 | EQ 仅 3 段 | `music-eq-presets.ts` |
| IMP-15 | P3 | crossfade 视频硬切 | `audio-engine.ts` 注释 |
| IMP-16 | P3 | KV 25MB 单文件上限 | `storage.ts`、`range.ts` |
| IMP-17 | P3 | WebDAV 慢流看门狗不缓冲 | `music-store/player.ts` armStreamWatchdog |
