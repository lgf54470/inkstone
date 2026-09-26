# 音乐库对标报告 · 参考项目 otter-music 缺失功能（ZCode · GLM-5.3-Flash · 2026-09-26）

> 参考项目：`/home/kubuntu/projects/reference/otter-music`（GD Studio API 多音源聚合播放器，Web PWA + Capacitor Android；React 19 + Zustand 5 + dnd-kit）。
> 对比对象：本仓库音乐库模块（`src/client/features/music/`、`src/worker/routes/music/`），把它当独立音乐 app 看待。
> 结论先行：**Inkstone 在播放内核与曲库管理上多处领先 otter**（见文末反向优势清单）；真正缺失集中在「外接内容源、曲库完整性、数据出口、播放体验细节」四类。
> 用户已拍板（2026-09-26）：在线多音源聚合、播客 RSS、Alist 网盘源**全部纳入**计划。
> 配套执行计划：`docs/features/music/plan-with-zcode_glm53fmax.md`。

## 一、缺失功能清单

### A 组 · 外接内容源（otter 的核心差异化）

| 编号 | 功能 | otter 证据 | Inkstone 现状 | 规模 |
| --- | --- | --- | --- | --- |
| FEA-A1 | 在线多音源聚合搜索/播放：netease(GD)/_netease/joox/bilibili/kuwo/migu/qq/higequ/jamendo 九源聚合，Provider 抽象 + 每源开关 | `src/lib/music-provider/`、`providers/*.ts`、`src/lib/music-api.ts` | 无在线源，仅自托管 R2/WebDAV | L |
| FEA-A1-1 | Provider 抽象 + 设置开关（默认全关） | `DEFAULT_SOURCE_CONFIGS`（`shared/src/types/music.ts`） | — | M |
| FEA-A1-2 | Worker 代理路由 + 小时预算限流 + 域名白名单 | `functions/` 代理路由 | 有 budget.ts 限流体系可复用 | M |
| FEA-A1-3 | 首批音源接入与聚合搜索（按源 rank 合并去重） | `src/lib/utils/search-helper.ts` | — | M |
| FEA-A1-4 | 音源角标/付费标记（可关） | `MusicTrackItem.tsx`、`ui-slice.ts` showSourceBadge | 已有「来源」列（云端/WebDAV），需扩展在线源 | S |
| FEA-A1-5 | 播放失败智能换源（简繁归一化跨源匹配，回写队列/歌单） | `src/lib/audio-match.ts`、`zh-t2s-map.json` | 有失败熔断+跳下一首，无跨源 | M |
| FEA-A1-6 | 搜索建议（歌手/专辑/歌单直达） | `SearchSuggestions.tsx` | 无 | S |
| FEA-A2 | 播客 RSS：订阅/退订/编辑、小宇宙链接解析、OPML 批量导入、分集列表播放 | `src/store/podcast-store.ts`、`src/components/Podcast/*`、`opml.ts`、`rss-parser.ts` | 无 | L |
| FEA-A3 | Alist 网盘源：多服务器配置（URL/token/根路径）、目录浏览、站内搜索 | `src/store/alist-store.ts`、`src/lib/alist/alist-api.ts` | 无（Alist 自带 WebDAV 端点，现有 WebDAV 可部分覆盖） | M |

**风险注记（FEA-A1）**：依赖第三方非官方 API，接口随时可能失效；播放流量经 Worker 代理产生成本；版权灰色地带。对策：默认全关、单源可开关、代理路由纳入 `budget.ts` 小时限额、解析失败快速熔断（复用既有 handlePlaybackFailure 链）。

### B 组 · 曲库完整性

| 编号 | 功能 | otter 证据 | Inkstone 现状 | 规模 |
| --- | --- | --- | --- | --- |
| FEA-B1 | 回收站：删除的曲目/歌单/收藏保留 7 天可恢复（tombstone + update_time） | `TrashPage.tsx`、`favorites-slice.ts`/`playlist-slice.ts` restore* | `tracks.ts:131-133` 硬删三表 + 对象回收，不可恢复 | M–L |
| FEA-B2 | 文本批量导入歌单：粘贴多行「标题 - 歌手」按规则建歌单 | `text-playlist-import.ts`、`PlaylistImportDrawer.tsx` | 仅 M3U 文件导入队列（`music-m3u.ts`），无文本导入、不建歌单 | S |
| FEA-B3 | URL 直链添加歌曲：粘贴直链+标题建曲 | `AddByUrlDrawer.tsx`、`createTrackFromUrl` | 无（WebDAV 导入仅限已配置服务器） | S |
| FEA-B4 | 离线内容聚合视图：断网时聚合「下载>流缓存>本地」为离线歌单 | `use-offline-playlist.ts` | 有 per-track 离线缓存（`offline-audio.ts`），无「已离线」视图/筛选 | S |

### C 组 · 播放与歌词体验

| 编号 | 功能 | otter 证据 | Inkstone 现状 | 规模 |
| --- | --- | --- | --- | --- |
| FEA-C1 | 下一首预加载：预解析并预载队列下一首 | `useAudioPreloader.ts` | crossfade 双元素按切换时才加载，无预加载 | S–M |
| FEA-C2 | 全屏播放页背景三模式：主题取色渐变（Lab→sRGB）/封面模糊/纹理 | `FullScreenPlayer.tsx` BackgroundLayer、`useCoverColors.ts`、`soda-color.ts` | 沉浸层纯令牌底色，与封面无关 | M |
| FEA-C3 | 歌词翻译行：tlyric 按时间戳就近合并到原文行下方 | `src/lib/lyrics.ts` parseLrc、`LyricsPanel.tsx` | LRC 解析无译文行概念（`music-utils.ts` parseLyric） | S–M |
| FEA-C4 | 歌词样式设置：对齐（左/中/右）、字号滑条 | `LyricStyleSetting.tsx`、`ui-slice.ts` lyricAlign/lyricFontSize | 仅有逐曲时间偏移校准 | S |

### D 组 · 数据出口

| 编号 | 功能 | otter 证据 | Inkstone 现状 | 规模 |
| --- | --- | --- | --- | --- |
| FEA-D1 | 下载时嵌 ID3：歌名/歌手/专辑/封面/歌词写入文件 | `src/lib/utils/id3-embed.ts`、`download.ts` | 下载是原文件流（`streamTrackResponse` download 参数），不嵌任何标签 | M |
| FEA-D2 | 歌单自定义封面：设封面 URL 或从第一首歌取 | `PlaylistCover.tsx` | 纯派生（同 improvement IMP-10，两处合并实施） | S |

## 二、明确不适用清单（Web 端无对应能力或架构不同，不做）

| otter 功能 | 不适用原因 |
| --- | --- |
| 车载蓝牙歌词（AVRCP TITLE 覆写） | Capacitor 原生补丁（`useCarLyric.ts` + MediaSession patch），Web 无法覆写系统媒体通知字段 |
| 耳机拔出暂停（audio-became-noisy） | `audio-route` 原生插件事件，浏览器不暴露音频路由变更 |
| 「与其他应用同时播放」（音频焦点） | Android 音频焦点概念，Web 无对应 API |
| 横屏沉浸模式（锁横屏+隐藏状态栏） | `@capacitor/screen-orientation` 原生能力 |
| 本地音乐扫描（Android 文件系统） | `LocalMusicPlugin.java` 原生插件；Web 端由上传/WebDAV 覆盖同一需求 |
| 音质选择（128/192/320/无损） | Inkstone 播放原始文件，无转码码率概念 |
| 网易云/QQ/B站账号登录 | 依赖在线音源生态（FEA-A1 若落地可作后续子项评估） |
| 管理后台（SYNC_KEY 管理） | otter 多用户云同步架构；Inkstone 是多账户自托管应用，无此面 |
| Android 返回键逐层退出 | Capacitor backButton；Web 已有 ESC/焦点归还体系 |
| 应用内更新检查 | Inkstone 已有全局 `store/update` 更新体系 |

## 三、反向优势清单（Inkstone 已有、otter 没有——防止重复建设）

- 播放内核：3 段 EQ + 5 预设、3s crossfade、RMS 响度归一化、A-B 循环、睡眠定时带 20s 淡出、视频曲目支持、20s 流看门狗 + 连续失败熔断（otter 全无 EQ/crossfade/A-B/归一化）。
- 曲库：拼音全拼+首字母搜索、搜索历史、标签树、元数据编辑弹窗、sha256 重复检测+浪费字节摘要、播放次数统计、元数据补缺/强制扫描、iTunes 封面匹配、列表/网格双视图。
- 队列：拖拽重排（otter 队列无拖拽）、服务端跨设备持久化（队列+索引+位置分离保存）、play next 去重插入。
- 数据：M3U 导入+导出（otter 均无）、公开歌单分享页（otter 仅剪贴板链接）、备份快照已含音乐全量元数据（`src/worker/backup/snapshot/music-export.ts`）、离线音频 SW 缓存。
- 工程：zh-CN/en-US 双语（otter 仅中文）、MediaSession positionState、40+ 测试文件、全套门禁。

## 四、实施建议顺序

小项先行（B2/B3/B4/C1/C4/D2 → B1/D1/C2/C3），外接源按 A3 → A2 → A1 收尾（A1 拆 6 个子项各自成提交）。详见 plan 文档批次。
