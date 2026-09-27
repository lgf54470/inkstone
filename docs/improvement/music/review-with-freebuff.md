# 音乐库模块复审报告 · 把音乐库当作独立音乐 app 审查（Freebuff · 2026-09-27）

> 范围：`src/client/features/music/`（含 `music-store/`、`providers/`）与 `src/worker/routes/music/` 的**全部**能力，含 UI 规范符合性、信息与交互完整性、作为独立音乐 app 的功能完整度、性能与安全。
> 参考项目：`/home/kubuntu/projects/reference/otter-music`（GD Studio API 多音源聚合播放器，React 19 + Zustand + Capacitor）。
> 配套执行计划：`docs/improvement/music/plan-with-freebuff.md`（逐项提交 + 进度日志）。
> 与既有三条线的关系：`docs/improvement/music/*-with-zcode_glm53fmax.md`（缺陷）、`docs/features/music/*`（对标缺失功能）、`docs/refactor/music/*`（UI 重构）均已收束；本报告只登记**残留、回归、以及它们未覆盖的面**，不重复其条目。
> 用户点名的三个症状（不能拖动/调宽高、移动端不适配、在线搜索不可用且不可设置）在 C 节给出定位结论，其中两项是 P0。

---

## A. 结论摘要

音乐库是本仓库最完整的模块之一：113 个非测试源文件 / 14 572 行，worker 侧 4 973 行，102 个测试文件。播放内核（3 段 EQ + 预设、3s crossfade、RMS 响度归一化、A-B 循环、睡眠定时带 20s 淡出、视频曲目、20s 流看门狗 + 连续失败熔断）、曲库管理（拼音全拼与首字母搜索、标签树、sha256 重复检测、元数据编辑与补缺、iTunes 封面匹配、列表/网格双视图）、引用源体系（R2 / WebDAV / Alist / 直链 external / 在线聚合 provider / 播客 RSS）都超过参考项目。

但当成独立 app 看，本轮共登记 **38 项问题**（P0 两项、P1 十二项、P2 十五项、P3 九项），其中两项 P0 恰好对应点名的症状：

- **P0 · Hub 窗口根本拖不动**：`Modal` 面板自带 `.anim-pop`（`animation: ink-pop var(--dur-base) var(--ease-out) both`），而 `@keyframes ink-pop` 的终点帧是 `transform: none`；按 CSS 层叠规则，**动画原点的声明优先于内联样式**，所以 `hubStyle()` 写入的 `transform: translate(dx, dy)` 永远被覆盖。拖动与键盘移动都只写进 store、从不绘制。jsdom 测试只断言 store（`music-hub-modal.test.ts` 三例），因此整条链路是绿的。
- **P0 · 在线搜索开关打开不触发搜索**：`MusicProviderResults` 的 effect 依赖是 `[query, searchProviders]`，`setProviderEnabled` 只改偏好并落盘；查询已存在时打开开关不会重新发起请求，必须先改一次输入。用户截图（开关开着、正文空着、下面是本地空态）正是该状态。上游实测正常：`types=search&source=netease&name=原点` 返回 12+ 条，`types=pic` 可取得封面。

其余高优先级问题集中在四类：来源筛选漏掉 4 类已存在的来源；全仓 0 处音乐设置面（音源开关埋在搜索结果里）；在线曲目无封面 / 无歌词 / 时长为 0；单源失败静默（实测 `source=kuwo` 上游返回 400，用户无从知晓）。工程面则有 music chunk 超体积预算 13 KiB、代理流无超时无字节上限、以及预算口径倒挂（一次搜索扣 5 个额度 → 约 24 次/小时即失败，而每首播放的上游解析与流代理完全不计数）。

**收尾状态（M26，2026-09-28）**：D 节 40 行（原始 38 项 + 审计中新发现的 FB-M17、FB-C5）已逐行结案——**26 行完整修复**，**14 行带显式残留**（FB-F8 批量换源、FB-F9 定时扫描与 WebDAV/R2 行、FB-F10 浏览器断言、FB-F11 排队态与断点续传、FB-F13 逐字歌词与分享图、FB-U1 最大宽度贴边、FB-U3 进度条展开、FB-R1 底部 tab、FB-PF3 流预算族、FB-PF4 拼音首键与网格渐进挂载、FB-PF5 批量解码、FB-C3 沉浸层手机 axe 单列、FB-S5 关键词走 URL 的残余暴露、FB-M16 真机验收与搜索路径的浏览器覆盖），残留全部写在各自行内并汇总到 H 节与执行计划的「已知限制 / 不做清单」，没有含糊条目。用户点名的三个症状全部已修复，证据见 C 节。

---

## B. 审查范围与证据

| 维度 | 证据来源 |
| --- | --- |
| 客户端 | `music-hub-modal.tsx`、`music-hub-window.tsx`、`music-hub-toolbar.tsx`、`music-hub-sidebar.tsx`、`music-provider-results.tsx`、`music-search-box.tsx`、`music-track-list.tsx`、`music-track-row.tsx`、`music-track-card.tsx`、`music-status-bar.tsx`、`music-floating-player.tsx`、`music-immersive-player.tsx`、`music-drag.ts`、`music-selection-bar.tsx`、`music-providers/`、`music-store/` |
| 服务端 | `worker/routes/music/{provider,stream,outbound,budget,alist,webdav}.ts`、`worker/lib/outbound-url.ts`、`shared/constants.ts` |
| 共享组件 | `components/overlay/modal.tsx`（面板样式与 `style` 透传）、`components/form.tsx`（`Segmented`）、`styles/motion.css`（`.anim-pop` / `@keyframes ink-pop`） |
| 门禁 | `scripts/e2e-visual.mjs`（`TOOLBAR_SURFACES`、`assertFullscreenToolbars`、`assertMusicSurface`）、`scripts/check-contrast.mjs`（`SURFACES` / `PHONE_SURFACES`、axe 注入）、`scripts/check-surface-coverage.mjs`（全屏表面名单）、`scripts/check-bundle-budget.mjs`（music 96 000 B） |
| 运行时探针 | `read_url` 实测 GD 上游：`types=search&source=netease` 返回 12+ 条且**无 duration 字段**；`types=pic` 返回可用封面 URL；`source=kuwo` 返回 400 |
| 对标 | otter `src/lib/music-provider/providers/*`、`src/components/settings/AggregatedSourceSelect.tsx`、`shared/src/types/music.ts`（`DEFAULT_SOURCE_CONFIGS`）、`src/store/source-quality-store.ts`、`src/components/SettingsPage.tsx`、`public/release/*` |
| 历史结论 | `docs/{improvement,features,refactor}/music/*-with-zcode_glm53fmax.md` |

---

## C. 用户点名三个问题的定位结论

### C-1 「不能调节宽高也不能拖动移动位置」

- **拖动**：真 bug，根因见 A 节。偏移值的计算、夹取（±240px，最小 720×420）、持久化（`hubGeometry`）与键盘路径都正确，唯独绘制被动画覆盖。
- **缩放**：`width`/`height` 不在关键帧内，因此内联值生效；但手柄是 `absolute right-0 bottom-0 size-4` 且内容只有 `aria-hidden` 的空 `span` —— **零视觉提示、16px 命中区**（低于 AGENTS.md 可访问性红线与 REF-3 反复确认的 44px 触控基线），且只有右下角单向、无边缘拖动、无 `touch-action: none`（触屏按压可能被识别为滚动/手势）、窗口几何在视口变小后不重新夹取（浮窗有 `useKeepInsideViewport`，Hub 没有）。
- **结论**：不是「没做」，而是「做了但看不见也用不了」。同时暴露一条门禁缺口：**几何能力必须有浏览器断言**，jsdom 测 store 等于没测。
- **已修复（M4 拖动真因 + M5 窗口 chrome）**：位移改写为独立 `translate` 属性（不再被 `ink-pop` 的 `transform: none` 覆盖），浏览器实测同一断言从 `dx/dy = 0/0` 变成 `120/60` 且能拖回原点；16px 隐形空 `span` 换成八向命中区 + 具名东南角控件（方向键两维缩放）+ 可见把手 + `touch-action: none` + 双击标题栏最大化（两态可切）+ 视口变化重夹取。规则 FB-C4 已写入 §G 第 1、4 条。

### C-2 「没有做响应式设计，不能完美适配移动端（手机、平板）」

断点体系只做了「折叠」，没做「移动形态」：

- 工具栏在 360–390px 上是「240px 固定搜索框 + 3 段来源筛选 + 4 个带文字主按钮（上传 / WebDAV 音乐 / Alist / 播客）+ 更多 + 刷新」全量换行；`folded` 只收低频动作，**主按钮从不折叠**。
- 状态栏 `hidden xl:inline-flex`（置顶）、`hidden lg:inline-flex`（EQ）、`hidden md:flex`（进度条）在窄屏**没有替代入口**——这是功能丢失，不是降级。
- 曲表 `<1280` 隐藏来源 / 专辑列且无替代信息（REF-3 明确留白）。
- 平板区间（768–1024）：侧栏按**视口 900** 折叠、工具栏按**容器 1040** 折叠，两套断点不同源。
- 矮视口（`HUB_SHORT_VIEWPORT = 700`）改为占满视口后，头部 / 工具栏 / 传输条仍 `shrink-0`，曲表可能只剩不到 100px。
- 门禁层面：手机断点下的音乐 Hub 与浮窗**不在** `check-contrast.mjs` 的 `PHONE_SURFACES`；Hub、沉浸层、浮窗**不在** `e2e-visual.mjs` 的 `TOOLBAR_SURFACES`；`check-surface-coverage.mjs` 中 `Modal` 全屏变体的使用者枚举（注释写「三个」却列了四个）**漏掉音乐 Hub**。移动端改动因此没有守护网。
- **已修复（M9 → M12d）**：断点收敛到「容器测量」——侧栏折叠读 Hub 自身盒宽（FB-R2 的 `hubColumnsWide`），曲表列密度读列表自身盒宽（FB-U4 的 `listDensity`），两侧同源；窄档工具栏 145px / 6 层控件 → **89px / 2 行带**（390×844 实测），四个主流程图标化、来源与排序改下拉；状态栏被 CSS 藏起的置顶与均衡器由「更多」入口承载（FB-U3）；窄档把歌手 · 专辑与来源角标写进行内；窄形 Hub 且读者未选过视图时默认卡片（FB-R1）；音乐三表面进入 `TOOLBAR_SURFACES`、手机断点进入 `PHONE_SURFACES`（两主题 axe），`check-surface-coverage.mjs` 的枚举改成如实的六个使用者（FB-C3）。**仍未做**：底部主 tab（§I 有评估结论与复核条件）。

### C-3 「在线搜索功能不可用，也不可以设置」

- **不可用**：P0 开关 bug + 单源失败静默（五源全挂与「无匹配」同形）+ 预算口径（一次搜索扣 5，约 24 次/小时即失败，且第 5 个请求可能被限流，表现为部分源为空）。
- **不能设置**：**全仓 0 处音乐设置面**（`grep music.settings` 无命中）。`MusicProvider` 接口只有 `id / labelKey / isEnabled`；`GDS_SOURCES` 五源写死、无逐源开关 / 排序 / 可见性；worker 侧还有第二份字面量 `GDS_UPSTREAM_SOURCES`（漂移即表现为「客户端提供、服务端 400」）。
- **数据不完整**：worker 归一化丢弃上游 `pic_id` / `lyric_id`（实测均可取），而 netease 搜索响应里根本没有 `duration` → 在线曲目**无封面、无歌词、时长为 0**。
- **死能力**：worker 白名单了音质 128/192/320/740/999，客户端从不发送，`quality=320` 三处硬编码。
- **静默丢失**（M7 顺带修复）：`providerEnabled` 一直随偏好写进 localStorage，但启动时被硬置为 `{}`——开关每次刷新都回到关闭，而持久化写的是它，两条路各自「看着正确」。
- **已修复（M1 + M2 + M6 + M7 + M8 + M9 + M25）**：开关打开即触发搜索，off / loading / ready / none 四态文案分开，逐源失败可见并可重试（kuwo 的 400 现在会说出口）；音源目录收敛到 `@shared/constants` 的单一来源（客户端与 worker 读同一数组，契约测试两头钉住）；设置面板新增「音乐」分区（逐源开关 / 音质档位 / 来源角标 / 一次性风险告知），Hub 头部齿轮直达同一分区；封面与歌词在**添加当刻**解析并落库、缺失时长显示「未知」而不是 `00:00`；预算口径由 M9 改为「聚合一次」（不再是每次搜索扣 5）；启动时 `providerEnabled` 从偏好恢复。M25 另外补上「注册自己的音乐服务器」这条来源（Subsonic 家族 / Jellyfin 家族），在线聚合不再是唯一的外部来源。**仍未做**：关键词仍走 URL 的残余暴露（§H 与 `SECURITY.md` 记明），消除它要同时改 3 个端点的 GET→POST，属另一个条目。

---

## D. 完整问题清单（问题 → 修改方案 → 涉及范围 → 修改代价 → 修改建议）

代价图例：S（≤0.5 天）/ M（0.5–1.5 天）/ L（>1.5 天）；「范围」只列主要文件，不含测试与 i18n。

### D1 功能缺陷（F）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-F1 | **P0** | Hub 拖动无效：`anim-pop` 的 `transform: none` 永久覆盖内联 `translate` | 位移改用**独立 `translate` 属性**（CSS Transforms 2，不被 `transform` 动画覆盖；备选 `left/top`，均无需 `!important`）；补浏览器断言「真实按在标题栏拖 120px，窗口在屏幕上跟着走且能拖回」 | `music-hub-window.tsx`、`music-hub-modal.tsx`、`scripts/e2e-visual.mjs` | S 代码 + M 门禁 | **已修复（M4）**：实测同一断言——改前 dx/dy = 0/0（store 已写对、屏幕不动），改后 120/60，拖回后回到原点 |
| FB-F2 | **P0** | 在线开关打开不触发搜索；关闭 / 加载 / 无匹配 / 全源失败四态混同 | 开关纳入 effect 依赖（或订阅偏好变化重发）；四态文案分开，全源失败带「重试」 | `music-provider-results.tsx`、`music-store/providers.ts`、locales | S | **已修复（M1）**：开关纳入 effect 依赖（打开即重发）；面板状态提为纯函数 `providerPanelState`（off / loading / ready / none），四种状态各有文案，全源失败带「重试」 |
| FB-F3 | P1 | 来源筛选只有 `all/r2/webdav`，`alist/external/provider/podcast` 行无法筛选（角标已支持） | 扩展值域 + 工具栏按「库中实际存在的来源」动态生成 + `applySourceFilter` 兼容；未知旧值回落 `all`（已有逻辑） | `music-store/types.ts`、`state.ts`、`library-load.ts`、`music-hub-toolbar.tsx` | S–M | **已修复（M3，来源名随 M2 一并本地化）**：值域从三个写死的字面量扩为「`all` 加全部 `MusicSource` 成员」（类型即 `MusicSourceFilter`），选项由库中实际存在的来源生成（用库全量而非过滤后的视图，否则选中一项后其余选项会消失），来源名走 `providers/labels.ts`（未知 slug 回退显示 slug） |
| FB-F4 | P1 | 全仓无音乐设置面；音源开关埋在搜索结果里，EQ / 响度 / 交叉淡入 / 歌词样式 / 背景模式 / 悬浮窗散落各弹层 | 全局设置面板新增「音乐」分区（唯一真源）+ Hub 头部齿轮直达同一分区 | `features/settings/*`、`features/music/*`、locales | L | **已修复（M7）**：设置面板新增 `music` 分区（在线音源组 + 播放默认组；EQ 组直接渲染播放器弹层自己的 `MusicEqPanel`，不是副本）+ Hub 头部齿轮走 `ui.openSettings('music')`（请求按名转成该页面，用完即清）；浏览器断言：齿轮打开设置且导航停在「音乐」、正文有「在线音源」 |
| FB-F5 | P1 | 在线曲目无封面、无歌词、时长为 0（`pic_id`/`lyric_id` 被丢弃；netease 无 duration） | 搜索响应保留 `coverId`/`lyricId`（原 `pic_id`/`lyric_id` 被丢弃）；添加时由 worker 代抓封面与歌词并落库，时长缺失显示「未知」 | `worker/routes/music/provider.ts`、`music-store/providers.ts`、`music-track-row.tsx`、`music-artwork.tsx` | L | **已修复（M8）**：搜索响应带上 `coverId`/`lyricId`；添加时解析——worker 新增 `provider/lyric`（文本）与 `provider/cover`（图片字节，上游给的地址先过 `isAllowedOutboundUrl`），封面经 `storeCoverObject` 落 R2、歌词存行，两者失败只降级不阻断；时长缺失（实测 netease 搜索响应无 `duration`）在在线结果行与曲目行 / 卡片 / 队列 / 详情 / 沉浸层均显示「未知」，不再画 `00:00`；FB-PF5 的图片 `decoding='async'` 一并补上（封面为内联 data URL，本就无跨域缓存问题）；worker 新增 `types=pic` / `types=lyric` 代抓（复用既有 allowlist 主机）；封面经派生键落库、歌词入 `hasLyric` + `ensureTrackLyric` 链路；时长缺失显式显示「未知」 |
| FB-F6 | P2 | 单源失败静默：`searchGdsPages` 每源 `catch → []`，五源全挂与「无匹配」同形（实测 kuwo 400） | 返回每源状态（ok / empty / error），在线结果区显示「N 源失败 · 重试」；保留「一个死源不拖垮其余源」 | `providers/gds.ts`、`music-store/providers.ts`、`music-provider-results.tsx` | M | 与 FB-F2 同批，四态文案正好承接 |
| FB-F7 | P2 | 音质档位无 UI（worker 白名单 5 档，客户端永不发送，320 三处硬编码） | 设置里给在线音源音质档位，存偏好、随请求传（含流解析） | `music-store/state.ts`、`providers.ts`、`worker/routes/music/provider.ts` | S | **已修复（M7）**：档位表 `MUSIC_PROVIDER_QUALITIES` 单一来源（shared，`LIMITS` 指向同一元组）；偏好 `providerQuality` 持久化；provider 行的 stream URL 带 `?quality=`，worker 用 `readProviderQuality` 校验（非白名单 400，不静默降级）；播放 / 预载 / 交叉淡入三条路径都带该值，上传行不带 |
| FB-F8 | P2 | 只有自动换源，无「把这首换成 X 源」；也没有智能换源开关 | 曲目菜单「切换音源」→ 复用 `matchScore` 列候选 → 复用 `swapFailedProviderTrack` 回写；设置给换源开关 | `music-track-menu.tsx`、`music-store/providers.ts` | M | **已修复（M15）**：①自动修复成了偏好 `providerAutoSwap`（默认开，设置页「在线音源」组有开关）——门开在 `swapFailedProviderTrack` 这个动作里，关掉后任何调用路径都不会再静默换源；②在线行菜单新增「切换音源」，新面板列出**其他音源**的同名版本（同一套 `matchScore` 排名，排掉行自己那一版与零分命中，靠新增的 `MusicTrack.providerSource` / `providerSongId` 识别），四态（加载 / 失败 + 重试 / 列表 / 空）全有文案，选定后只改队列那个槽位（`switchTrackSource`）——**旧行不删**（读者没说要删），两条行为都写进了测试断言。**未做**：批量换源（无此需求场景，等有真实反馈再说） |
| FB-F9 | P2 | 引用行（external/provider/alist）失效后只能逐首点播发现 | 库健康扫描：批量 Range 探测 → 结果视图 + 批量换源 / 移入回收站 | `music-store/*`、新 worker 端点、新面板 | L | **已修复（M16）**：新 worker 端点 `POST /api/music/tracks/reference-health`（只认 external / alist / provider，批次上限 50，逐行串行，每行 `Range: bytes=0-0` 一个字节）把答案分成三档：`ok` / `dead`（404・410・401・403，以及地址规则拒绝的地址——那类**根本不发请求**）/ `unreachable`（超时・5xx・连不上）；客户端按上限分块扫描、一块失败保留已到的判定；面板 `music-health-modal.tsx` 只列没有响应的行并分两组（失效 / 暂时连不上），每行给「换源」（只对在线行可用）与「移入回收站」，底部还有「全部移入回收站」；入口在工具栏（宽档图标、窄档进「更多」）。**与手动换源的差别写在这里**：从这份刚被证明失效的清单上换源，成功后会顺手把失效行移入回收站（回收站可恢复）；菜单里的手动换源不删行（见 FB-F8）。**未做**：WebDAV 行与 R2 行没有扫（它们是我们自己的地址，另有各面板可查）；定时自动扫描未做（频率与成本需要先有量测，见 FB-PF4） |
| FB-F10 | P2 | 在线结果行只能逐条「添加」：无试听、无批量、无封面 | 行内试听（登记 + 播放，已有 `playProviderTrack`）、行复选框 + 批量添加、封面 / 专辑 / 时长补全 | `music-provider-results.tsx` | M | **已修复（M14）**：行内两个动作分开——**试听**（`playProviderTrack`：登记 + 交给播放器）与**添加**（新增 `addProviderTrack`：只写库，不抢当前播放），后者正是原行里那个「添加」按钮一直没说清的事（它其实会在添加后接管播放）；行首补共用 `Checkbox`（`role=checkbox`、名称「选择 {标题}」），列表上方出现选择条（已选 N / 添加所选 / 清除），批量走新增的 `addProviderTracks` **串行**导入并汇总 `{added, failed}`（一首先失败不拖垮其余）；封面经 `musicProviderCoverUrl` 代理取回（懒加载 + 异步解码，无 `coverId` 画音符占位）、第二行写「歌手 · 专辑」；时长仍按 FB-F5 的「未知」口径。**未做**：浏览器断言——这一屏需要真实第三方目录才能画出，门禁不为它引入外部依赖（临时探针可人工复跑） |
| FB-F11 | P2 | 下载只有「开始 / 进度 / 失败」，无失败重试、取消、下载音质；且行上的 X 只是把它从列表里抹掉，请求仍在跑、文件仍会落盘 | transfers 增加重试 / 取消 / 批量停止，接 FB-F7 的下载音质 | `music-store/transfers.ts`、`music-transfer-dialog.tsx` | M | **已修复（M17）**：**取消**——每行任务从列入时就带一个 `AbortController`（排队中的行也能取消），行上的 X 与「全部停止」都真的中止请求，而不是只把行从列表里拿走：被中止的那次运行按「行已不在 / 控制器已被换掉」静默收场，既不再保存文件也不再报「下载失败」（这条正是原来最糟的形态：点了 X，几秒后文件照样落进下载目录）。**重试**——失败的行就地重试（保持位置，读者能对上是哪一首），成功后照常保存；面板的下载分组标签上有「重试失败的」与「全部停止」（后者只在两首以上在跑时出现），长队列不必逐行点。**下载音质**——provider 引用行按设置里的音质档取值（`providerStreamQuality`，与播放共用同一条规则），上传 / WebDAV / Alist 行不发送该参数（它们按文件自身编码播放，档位对它们没有意义）。**10 分钟超时改成借用同一个控制器**（不再是 `AbortSignal.timeout`）：取消与超时走同一条信号，`finally` 释放定时器。**未做**：排队中的行仍显示「正在下载 0%」而不是单独的「排队中」——三态之外再引入一个状态会改到状态栏与浮窗的读取面，本轮按 YAGNI 留着；断点续传不做（上游不保证 `Range` 语义）。**覆盖**：jsdom 22 例（含「取消后不保存也不报错」与两档批量动作），无浏览器断言——传输面板不在 `scripts/e2e-visual.mjs` 的场景里，几何铁律（FB-C4）不适用于按钮语义 |
| FB-F12 | P3 | 播放历史只有「最近播放」视图，不能删单条 / 清空 | 历史视图补逐条删除与清空（`last_played_at` 已有） | `music-store/*`、sidebar | S–M | **已修复（M18）**：**逐条**——曲目菜单新增「从历史中移除」（只在 `lastPlayedAt !== null` 的行上出现，没播过的行不会摆一个空动作）；**清空**——「最近播放」列表头部本属于 m3u 导出的那个位置换成「清空历史」（这个列表里的行为都是可忘的），先问一句再去（`confirm` 叠加层，显示将要移除的首数与「播放次数与收藏不受影响」）。**语义选定了「只清时间戳」**：服务端 `POST /api/music/tracks/batch` 新增 `forget` 动作（`UPDATE music_tracks SET last_played_at = NULL`，按 `musicSqlIdChunkMax` 分块、以 `user_id` 限定），**不改 `play_count`**——它是一辈子听了几次的统计，也是「按播放次数」排序的依据，把历史清理当成抹去听过的证据会把两件事搞混；因此文案明说次数无关。**未做**：批量栏里没有「从历史中移除」（多选主要服务于打标签 / 回收站；清理整份历史有头部那一个按钮）；没有「按时间窗口清理」之类的选项（YAGNI）。**覆盖**：store 5 例（只清被点的行、保住播放次数、整份一次性清、空名单不发请求、服务端拒绝时不动本地）＋ worker 4 例（只清被点行、多行一次、不碰别人的行、未知动作 400）＋ UI 4 例（菜单项只在播过的行上、点了只传那一首、先问再清、其他地方仍是导出按钮）
| FB-F13 | P3 | 歌词增强：无歌词源选择、无逐字、无分享图 | 歌词源选择（lrclib / 在线曲库 / 智能）+ 逐字评估；分享图复用导出管线 | `music-lyrics.ts`、`library-lyrics.ts`、导出 | L | **源选择已修复（M19）**：新增偏好 `lyricSource`（`auto` 默认 / `lrclib` / `catalogue`，随音乐偏好持久化，设置页「歌词来源」下拉）。顺序是一个纯函数 `lyricSourceOrder(source, track)`：写了哪一源就只走哪一源；`auto` 下**在线行先问它自己那条目录项**（那首歌不需要猜），其余行先问 lrclib（名字就够）再拿搜索到的头部命中当候选——两条路都只取**评分 > 0 且带 lyricId** 的命中，不拿噪声敷衍。链上任何一个源失败（网络 / 5xx）不中断后续候选，只有全部走完都没有才报结果：全空 → `music.lyrics_not`（未匹配提示），auto 下有过失败 → 错误提示；**没打开的在线音源在 auto 里是「跳过」而不是「失败」**（读者没要求它，就不能算它的错）。行菜单的「在线搜索歌词」变成二级菜单：跟随设置 / 仅 lrclib / 仅在线曲库（一次性的源覆盖，因为「这行只有目录认得出」是关于那一行的事实）；已有歌词时的替换确认不变。**附带修掉的 a11y 缺口**：`SubmenuList` 的容器原来没有 `role`，于是它里面的 `menuitem` 不在任何 `menu` 里（文件自己的注释却写着「面板就是一个 menu」）——补上 `role='menu'` 与可访问名称（`overlay.submenu`），嵌套面板保持按行命名。**未做**：逐字歌词、歌词分享图（各自另立条目，不在本轮范围） |

### D2 UI / UX（U）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-U1 | P1 | 窗口 chrome 发现性与能力（16px 隐形手柄、单向缩放、无双击最大化、无 `touch-action`、视口变化不重夹取） | 8 向边缘 / 角落命中区（真实 `<button>` + 方向键）、可见把手（令牌着色）、双击标题栏最大化（两态可切）、`touch-action: none`、`resize` 监听重夹取；七个非主手柄 `aria-hidden` + `tabIndex={-1}`（键盘通道是具名的东南角控件） | `music-hub-window.tsx`、`music-hub-modal.tsx` | M | **已修复（M5）**：实测两套断言——真实浏览器里按住东/西/下边分别验证「宽度与位置同变」（尺寸对但变错边同样算失败），并验证双击标题栏填满视口、二次双击还原；jsdom 契约 13 例钉住四向几何、偏移预算、`aria-hidden`/焦点、`touch-none`、视口重夹取。**未改**：窗口最大宽度仍为弹窗自身的 `max-width`（1240），框架内边距会把它再收窄一点，所以贴到最大时向外的边不再跟随指针——已在已知限制记明 |
| FB-U2 | P1 | 窄屏工具栏全量换行，头部吃掉半屏 | 窄档：搜索框占满一行、来源筛选改下拉、4 个主按钮图标化或进「更多」、排序进「更多」 | `music-hub-toolbar.tsx`、`music-search-box.tsx` | M | **已修复（M10）**：新增纯函数 `toolbarShape()`（容器宽度 + 视口高矮一份决定），宽窄与高矮不再各答一半——窄容器**堆叠**（搜索框占满一行，`flex-1`），高矮或窄容器**紧凑**（来源与排序改 `<select>` 下拉、4 个主流程改只留图标的 `IconButton` 并带 aria 名与 tooltip、低频动作进「更多」），两者可叠加但决定同源；工具栏根节点带 `data-music-toolbar`/`data-shape` 供门禁读。**实测（探针，390×844）**：改前工具栏 145px / 6 层控件（头部+工具栏 189px），改后 **89px / 2 行带**，列表 646px（预算 160px）；375×667 同样 2 行带 / 列表 469px。**偏离**：排序没进「更多」而是留在搜索那一行的下拉里——共用的 `Menu` 把带 `checked` 的行渲染成 `menuitemcheckbox`（多选语义），而原生 `select` 保持单选语义与自带键盘模型；已写进代码注释。**未改**：平板区间（768–1024）侧栏与工具栏仍按不同断点折叠，见 FB-R2（M12）。**未做**：更宽档（图标 + 文字均能放下时）不做额外精简，保持原样 |
| FB-U3 | P1 | 状态栏隐藏即不可达（置顶 / EQ / 进度条） | 窄档补「更多」弹层承载被隐藏控件；进度条可点击展开 | `music-status-bar.tsx`、`music-transport-widgets.tsx` | S–M | **已修复（M11）**：状态栏按 CSS 隐藏自己的控件（进度条从 md、均衡器从 lg、置顶从 xl），而被隐藏不是被降级——768–1280 之间置顶与均衡器在页面上无处可达。改为一个「更多」入口承载**该宽度真正藏起来的那部分**：纯函数 `barMore({eqInline,pinInline})` 决定入口是否存在与带什么（两者都内联时不画入口——空面板比没有入口更糟；lg–xl 只带置顶），阈值 `MUSIC_BAR_EQ_MIN_WIDTH=1024` / `MUSIC_BAR_PIN_MIN_WIDTH=1280` 与状态栏上的 `hidden lg:inline-flex` / `hidden xl:inline-flex` 是同一份契约（jsdom 钉入口该带什么，浏览器门禁钉 CSS 真藏了什么）。面板复用 `MusicPopover`（portal + 定位 + Escape + 焦点），行是带名字的行（状态栏里是裸图标，因为没地方写字），置顶用共用 `Switch`（`role=switch`）。**门禁**：1000×800 新增三条断言——入口在场且置顶 / 均衡器 `drawn:false`、按下后面板里带这两个控件、Escape 关闭。**偏离**：「进度条可点击展开」未做——状态栏本身只在 md 以上绘制，它的进度条也正好从 md 起，任何宽度下都不存在被藏起来的进度条；手机宽度（<md）根本没有状态栏，传输完整地活在 Hub / 沉浸层 / 浮窗三个表面里（FB-C3 已覆盖） |
| FB-U4 | P2 | 曲表 `<1280` 丢来源 / 专辑列且无替代 | 窄屏用卡片视图或次级行展示来源 / 专辑 | `music-track-row.tsx`、`music-track-card.tsx` | M | **已修复（M12b）**：列的可见性改由列表自身盒宽回答（`listDensity()`，与 FB-R2 同源），窄档把歌手 · 专辑与来源角标写进行内（`RowSubstitute`）、卡片补专辑行；浏览器断言实测同一视口下 Hub 最大化前后列数确实随盒子变化 |
| FB-U5 | P2 | 在线结果区信息与语义：无分组、来源显示英文 slug、字号 10/11 档 | 分组 + 来源名本地化 + 字号 ≥12（与 C2 合并） | `music-provider-results.tsx`、locales | S | **已修复（M2）**：字号提到 `--text-12`，来源名走 `providers/labels.ts` 本地化（未知 slug 回退），并按源给出三态状态 |
| FB-U6 | P2 | 三态一致性：加载 / 失败 / 空在 Alist、播客、WebDAV、传输等子面板是否齐 | 逐面板核对三态，缺的补空态与重试 | `music-{alist,podcast,webdav,transfer}-modal.tsx` | M | **已修复（M13）**：Alist 服务器列表、播客订阅与单集列表三处的失败改成状态并复用 `PanelFailure`（`role=status` + 重试），单集失败不再退回订阅列表；WebDAV 与传输面板本就有三态，未动（走查结论如此） |
| FB-U7 | P3 | 三表面（Hub / 沉浸层 / 浮窗）能力矩阵不一致，同一功能摆放不同 | 产出「能力 × 表面」矩阵，补齐缺口并记录「刻意不同」 | 三表面组件 | M | **已修复（M13）**：矩阵写入本报告 §J（四表面 × 十八项能力），含三条刻意差异；矩阵本身没有再发现能力缺失（真补的只是一处状态缺口，即 FB-U6） |

### D3 响应式（R）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-R1 | P1 | 移动端无独立形态（抽屉 + 底部传输条的桌面骨架） | 分断点走查表（≥1440 / 1240–1440 / 900–1240 / 640–900 / <640）+ 窄屏默认卡片视图 + 评估底部主 tab | `music-hub-modal.tsx`、`music-hub-toolbar.tsx`、`music-track-list.tsx`、e2e | L | **已修复（M12d，第一阶段）**：分断点走查表写入本报告 §I（含实测数据）；窄形 Hub 且读者未选过视图时默认卡片视图（`defaultViewMode`，一次点选即永久生效）；底部主 tab **评估结论：暂不做**，复核条件写在 §I |
| FB-R2 | P2 | 侧栏按视口 900、工具栏按容器 1040，断点不同源 | 统一到容器测量（`useElementWidth` 已有） | `music-hub-modal.tsx`、`music-utils.ts` | S–M | **已修复（M12a）**：侧栏的折叠过去读**视口**（`min-width: 900`），而工具栏读的是**容器**（1040）——在同一屏上两个答案可以不一致，而且在宽屏上被拖窄的 Hub（FB-U1 之后就真的能拖）里，视口自始至终没变，两列侧栏就一直挤列表。现在折叠由纯函数 `hubColumnsWide({containerWidth, viewportWide})` 回答：容器宽（`useElementWidth` 量 Hub 自身体）达到 `MUSIC_HUB_COLUMNS_MIN_WIDTH`（就是沉浸层折叠用的 `MUSIC_NARROW_BREAKPOINT`，三面同源）才画两列；视口只剩两个职责——无测量环境（jsdom / SSR）的回退，以及「Hub 是否浮在屏幕中央」这个本来就属于屏幕的问题。**门禁两条**（真实浏览器，1280 视口）：把 Hub 拖到 860 宽 → 侧栏离开、头部出现抽屉入口、视口仍 ≥1280（旧代码在这里会把列留着）；再拖回原宽 → 侧栏回来（折叠回不来是同一个 bug 的另一半）。**自查记录**：第一版把「是否铺满视口」也改读了被量的盒子，于是窄→折叠→铺满→变宽→不折叠→又窄地无限翻转；现在两种读法彻底分开（铺满问视口，列数问盒子），已写进代码注释。**未做**：沉浸层与状态栏仍读视口，但两者容器本来就是视口（沉浸层全屏、状态栏是页脚），不存在源不一致；跨表与卡片的列替代（FB-U4）与断点走查表（FB-R1）拆到 M12b / M12d |
| FB-R3 | P2 | 矮视口占满后曲表可能 <100px | 矮视口把排序 / 来源与部分传输控件收进菜单，给内容区最小高度预算 | `music-hub-modal.tsx`、工具栏 / 传输条 | S–M | **已修复（M10）**：新增 `MUSIC_CONTENT_MIN_HEIGHT = 160` 作为预算，列表容器以 CSS 变量形式声明该底线（单一来源，门禁从元素上读回而不是重复写一遍）；矮视口（<700px）走 `toolbarShape` 的紧凑形状、不再多花一行；模态体内边由 `overflow-hidden` 改 `overflow-y-auto`，让「预算 + 固定 chrome 高于视口」的极端窗口能滚动而不是把列表截掉。**门禁**：`scripts/e2e-visual.mjs` 新增 `readMusicToolbarBudget()` + 两条具名断言——手机 375×667 与矮视口 900×600 各读一次：控件行带 ≤ 2、形状名与列表高度 ≥ 它自己声明的预算（并另设 100px 的政策下限）。**实测**：375×667 列表 469px、900×600 列表 313px（该宽度两侧栏仍内联，中心列只有 314px），两者都是 2 行带。**未做**：队列面板打开时列表仍按设计被面板占去高度（预算断言量的是队列关闭的默认态）；传输条高度固定 64px、折叠内部控件不省高度，因此本轮不在那里动手脚 |

### D4 性能（PF）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-PF1 | P1 | music chunk 超预算（`MUST_BE_LAZY = ['music']` 早已成立，漏的是 Hub **内部**）：同一命令实测报两条 —— `music-hub-modal-*.js` **132.2 KiB**、`music-transport-widgets-*.js` **108.5 KiB**，预算 93.8 KiB（96 000 B）；本仓库更早的记录写「109 KiB」，是分包形状变了而没人复跑，以本轮实测为准 | 核对 `MUST_BE_LAZY` 与分包边界：providers / podcast / alist / webdav / id3 / export 等「主动打开才用」的面板拆独立 lazy chunk | 懒加载入口与各面板 | M | **已修复（M20）**：Hub 自身早就是懒加载表面（`MUST_BE_LAZY = ['music']`），漏的是它内部——十三个「主动打开才用」的表面（编辑曲目 / 播放列表 / 标签管理 / 传输面板 / WebDAV / Alist / 播客 / 换源 / 健康扫描 / 分组浏览列表与详情头 / 在线结果 / 队列抽屉）过去都是静态 import，于是打开库只为按一次播放的人，也要把 alist 浏览器、标签管理器和播客列表一起下载。现在逐个改成 `lazy(() => import(...))`，各自成 chunk。**两处关键细节**：① 弹窗的挂载时机从「`open` 为真就挂」改成**首次 `open` 时闭锁并从此常驻**（`LazyPeer`）——关闭再打开仍能看到读者留在里面的草稿，与拆分前一致；等待被 `Suspense fallback={null}` 关在该子树里，开一个弹窗不会挂起整个 Hub。② `MUSIC_QUEUE_PANEL_HEIGHT = 288` 从 `music-queue-panel.tsx` 上移到 `music-utils.ts`：Hub 要在队列面板**还没被取下来时**就按它给列表预留高度，而跨模块读一个已被懒加载的模块里的常量会把那个 chunk 立刻拉回来（`music-queue-panel.tsx` 现在从 `music-utils` 转出这个名字，对外的 `QUEUE_PANEL_DEFAULT_HEIGHT` 不变）。**实测（同一命令，脚本与基线一字未改）**：改前 132.2 / 108.5 KiB 两条超限 → 改后剩下两个最大的音乐 chunk 是 `music-store` **89.5 KiB** 与 `music-hub-modal` **88.2 KiB**（`music-transport-widgets` 从 108.5 KiB 落到 15.25 kB），全部音乐 chunk 都在预算内。**未做**：预算没有细到「每个表面一个上限」（它只看音乐 chunk 里最大的几个，新版两个只余约 4 KiB 余量）；也没有拆 `music-store` 与播放器内核——那是「按下播放就用」的路径，懒了反而多一次等待 |
| FB-PF2 | P1 | 虚拟化只在 >60 首的表格视图；网格仍 200 条截断 + 「还有 N 条」不可操作 | 网格卡片行高恒定后窗口化，或改「加载更多」；解除截断 | `music-track-list.tsx`、`music-track-card.tsx` | M | **已修复（M12c）**：网格的 200 条截断改为可操作的「加载更多」（`matchLimit` 会话态、每次加一页、新查询 / 换范围归零），`hiddenMatchCount` 与画出的卡片数读同一额度；M21 起未搜索的网格也走同一预算 |
| FB-PF3 | P2 | 预算口径倒挂：一次搜索扣 5（≈24 次/小时失败），播放解析与流代理 0 计数（egress 无上限） | 搜索按「聚合一次」计数（或提高额度）；流代理加预算族与字节软上限 | `worker/routes/music/{provider,budget,stream}.ts`、`shared/constants.ts` | M | **已修复（M9 定口径 + M22 补字节护栏）**：搜索的计数口径已在 M9 定为「聚合一次」（见 M9 行）；流代理没有加按次预算族——一次播放天然是几分钟的传输，按次计数不能表达 egress 风险，改由 `musicStreamMaxBytes` 这类软上限兜住跑飞（M22），匿名公开库的计量另有一族 |
| FB-PF4 | P2 | 查询链路成本未实测（`visibleTracks` 含拼音 + 歌词扫描 + 远端合并；200ms/500ms 双定时器） | 仿 `scripts/measure-*.mjs` 写音乐库测量脚本；把重步骤移出渲染路径（必要时 `useDeferredValue` / worker 化） | `music-store/selectors.ts`、`library-load.ts`、新脚本 | M | **已修复（M21）**：新增手工测量脚本 `scripts/measure-music.mjs`（不进 CI，与 `measure-preflight.mjs` / `measure-kanban.mjs` 同类），在传输层应答一个 2000 行合成库、用真实指针打开 Hub 并逐字键入拉丁与 CJK 关键词。**实测（:7714）**：打开 Hub 758ms（首绘制 505ms），击键到榜单落地 244–688ms，切网格 962ms，读者手下的最坏提交 221ms（限 500），最坏挂载 671ms 在「切到网格」。**改前它先抓出三处测量自身的洞**：① 报告把离线缓存里剩下的两行当成被测库（fixture 落地前就采了首绘制）；② 击键探针挂在 `[role="table"]` 上，React 换掉该节点后它观察的是已脱离文档的旧节点，7 次击键里 5 次读成 `null`；③ **未搜索的网格一次挂 2000 张卡**——`SEARCH_RESULT_LIMIT` 只在 `filterByQuery` 里，没人搜过的库根本不经过它。③ 是真产品缺口，已修：`gridWindow()` 让网格的无查询路径也走同一预算，`hiddenMatchCount` 同样报出未搜索库里没装下的那些（页头的「加载更多」因此在未搜索状态下也有出路），播放列表同样受该预算。**约定**：提交预算只施加在 `typing*` 阶段，读者自己按下的一次性挂载只报告不判定（与 `measure-kanban.mjs` 的「切视图墙钟总账只报告不判定」同一惯例，不是放宽阈值）。**未做**：拼音首键（改前单次 688ms）未再切片，它在 800ms 预算内且 `ensureRomanized` 已按 200 条一批让出主线程；网格 200 张卡仍是一次提交，渐进挂载需要先解决「一页 = 200」这条既有契约 |
| FB-PF5 | P3 | 封面加载策略（懒加载 / SW 缓存 / 在线封面派生）需核对 | 核对 `MusicArtwork` 的 `loading` / `decoding` / 缓存命中；在线封面走派生键与 SW 缓存 | `music-artwork.tsx`、`music-cover.ts` | S | **已修复（M8，部分）**：`MusicArtwork` 补 `decoding='async'`（`loading='lazy'` 已有）——一屏新添加的封面不再占主线程解码；在线封面走与上传同一条派生键与 SW 缓存，不需要新策略。**未做**：大列表的一次性封面批量解码仍按浏览器默认，量测见 FB-PF4（M21） |

### D5 安全（S）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-S1 | P2 | 代理流无超时、无大小上限：`streamExternalTrack` / `streamProviderTrack` / `streamAlistTrack` 的 `fetch` 既无 `AbortSignal.timeout` 也无字节上限 → 上游挂起拖住请求，异常源可产生无界 egress | 加 12s 连接 / 首字节超时（**流式透传、不整体缓冲**）+ 每响应软上限 + 预算族 | `worker/routes/music/stream.ts`、`outbound.ts` | M | **已修复（M22）**：新增 `worker/routes/music/upstream.ts`——`withHeadTimeout()` 只给「等到响应头」设 `musicStreamConnectTimeoutMs = 12s`（定时器在拿到答案或失败时立即清掉，信号不会跟着体走，否则一首歌播到一半会被切断），`fetchMusicUpstream()` 在取出响应头之前先过地址规则，`capStreamBytes()` 用 `TransformStream` 计数，`musicStreamMaxBytes = 512 MiB` 是跑飞护栏而非配额（真实曲目远在这个量级之下）。**流式透传不变**：三个源（external / Alist / provider）都仍把上游体直接交出去，WebDAV 走 `fetchMusicObject(…, signal)` 的新可选参数。**FB-PF3 的「预算族」未做**：M9 已把搜索预算口径定为「聚合一次」，而流代理的预算是另一个量级的设计（一次播放就是几分钟的字节，按次计数无法表达），且匿名公开库已有自己的计量——本项只留字节护栏，理由记在此处 |
| FB-S2 | P2 | provider 代抓用默认 `redirect: 'follow'`，与 `outbound.ts` 明示的「每一跳都校验，因为 Worker 跟随的重定向仍是 Worker 在抓」不一致 | 改用已有 `fetchAllowedResource(url, ['music-api.gdstudio.xyz'], …)`（内含 `redirect: manual` + 逐跳校验 + 12s 超时） | `worker/routes/music/provider.ts` | S | **已修复（M23）**：catalogue 的代抓改成 `fetchProviderUpstream()`（包着 `fetchAllowedResource(target, GDS_ALLOWED_HOSTS, 'application/json')`，逐跳校验 + `redirect: manual`），搜索 / 歌词 / 封面解析 / 播放解析四个调用点全部改线。**一处偏离（写下来备查）**：封面**图片**代抓没有沿用固定主机白名单——图片主机是上游自己选的（`types=pic` 回答里的 `url`），钉死主机就抓不到封面；改为新增 `fetchPublicResource()`，逐跳只问地址规则（https + 非内网 + 公网 IP），这正是原条目说的「回忆已有走法，别新写」的精神落点 |
| FB-S3 | P2 | 用户 / 第三方给的播放 URL 未过 `isAllowedOutboundUrl`，仅靠 `global_fetch_strictly_public` 兜底（`wrangler.toml` / `kv.toml` 已声明；`wrangler.demo.toml` 是纯静态 assets 无 worker，不构成缺口） | 统一走 `isAllowedOutboundUrl(url, { allowHttp: true })` + 保留运行时标志（external 直链常为 http / 自建 HTTPS，需显式策略） | `worker/routes/music/stream.ts` | S | **已修复（M23）**：external 直链、Alist 签名链接、provider 播放地址三条都改走 `fetchMusicUpstream()`（先 `parseMusicUpstreamUrl(rawUrl, allowHttp)` → `isAllowedOutboundUrl`，拒绝抛 502 且不发出请求），运行时标志仍在（纵深防御，不是唯一防线）。三条路径都容忍 http（直链常为 http、自建 WebDAV 亦然），故显式 `allowHttp: true`，策略依据即本条。**测试**：`upstream.test.ts` 7 例地址规则（含 10.0.0.5 / localhost / nas.local / metadata.google.internal / `[::1]`）+ 3 例头超时 / 体上限；`provider.test.ts` 2 例跳到外部主机 / 内网地址的重定向被拒（断言「没有真的请求那个跳转目标」） |
| FB-S4 | P2 | 源枚举双份字面量：`GDS_SOURCES`（client）与 `GDS_UPSTREAM_SOURCES`（worker） | 单一来源（`@shared/constants` 或 provider catalog）+ 契约测试钉住两侧一致 | `shared/constants.ts`、`providers/gds.ts`、`worker/routes/music/provider.ts` | S | **已修复（M6）**：列表移到 `@shared/constants`，客户端与 worker 读同一数组；契约分两头（客户端钉身份、worker 钉收拒口径），并用变异（客户端改拷贝 / worker 收回本地字面量且缺 `bilibili`）实测两条断言都会报错 |
| FB-S5 | P3 | 搜索关键词是否进入观测 / 日志需核对（搜索词是敏感行为数据） | 核对 `[observability]` 是否记录 query string；必要时脱敏或不记 | `wrangler*.toml`、`provider.ts` | S | **已核对（M24）**。**Worker 侧：不记**——逐一读完 `src/worker/routes/music/**` 的全部 `console.*`（12 处），每一处只打印固定 `[inkstone] …` 标签与错误对象，关键词从 `c.req.query('keywords')` 取出后直接交给上游，没有任何一处写请求文本、URL 或 path；`src/worker` 里也没有请求日志中间件。**实测**：`[observability] enabled = true` 在三个 wrangler 配置里都开着，所以核对不能只读代码——又查了 `:7714` 临时实例的 dev 日志（163 行）里恰好 **0 条请求行**，本地确实不落 URL。**残余暴露在代码之外**：关键词走 URL（`provider/search?keywords=`、`lyric-search?q=`、`alist?keywords=`），凡记录请求元数据的 HTTP 日志层（含生产 Workers Logs 把请求挂在每条日志上）都会带上它。**结论按计划只核对不改行为**（改形状要动 3 个端点的 GET→POST 与契约），并把该残余写进 `SECURITY.md`；同时新增 `tests/music-log-privacy.test.ts` 把「谁都不能写进日志」变成自动门禁（扫全部日志调用，且断言扫到的调用数 > 5 以免空扫通过；变异证明：临时插一行打印 `c.req.query('keywords')` 后该例立即变红，恢复后全绿） |
| FB-S6 | P3 | 在线音源属版权灰色地带，无风险告知 | 首次开启给一次性告知 + 写入文档（otter 亦为自担风险） | 设置分区、locales、`SECURITY.md` | S | **已修复（M7）**：设置里的音源组带一次性告知（`providerNoticeAccepted` 持久化，未接受时开关 `disabled` 且正文可见，接受后方可开启）；`SECURITY.md` 新增「Online music sources」一节 |

### D6 规范符合性（C）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-M17 | **P0（本轮审计中发现，既存缺陷，非音乐新代码引入）** | 音乐库的凭证金库路径失效：`decryptSecret` 会把解出来的值按 `isBackupCredentialRecord` 的形状白名单（`password` / `accessKeyId` / `secretAccessKey`）过一遍，而 **Alist 服务器存的是 `{ token }`**——`token` 不在白名单里，于是 `decryptSecret` 一律返回 `null`，`resolveAlistServer()` 随即抛 `503 storage_unavailable（The Alist token is unreadable）`。后果：**Alist 的浏览、搜索、导入与所有 Alist 参考行的播放全部坏掉**（添加服务器能成功，因为那一半只加密不解密）；WebDAV 目标存 `{ password }`、S3 备份存两个 key，都不受影响 | 把 `token` 加进白名单——已经写进库里的行就是用这个字段名加密的，所以不能改写入侧（改字段名要先解开旧行，而解开正是坏掉的那一步）；白名单继续闭合，仍拒绝空记录与多带字段的记录 | `src/worker/lib/crypto.ts`、`tests/credential-vault-records.test.ts` | S | **已修复（M24b，独立提交，不夹带进音乐新功能）**：白名单加 `token` 并把每种消费者的字段名与「为什么必须闭合」写进注释；新增 `tests/credential-vault-records.test.ts` 5 例同时钉两侧——四种记录形状的**金库往返**（WebDAV 密码 / S3 两个 key / Alist token / 整份非凭证记录仍被拒）与一条**症状级**用例（建行 → `resolveAlistServer()` 交出 token 与 rootPath）。**先红**：修前那条 token 用例与症状用例全红（`expected null to deeply equal { token: 'alist-token' }`），修后 5 例全绿；**变异证明**：把白名单改回去，恰好这两例变红（3 passed / 2 failed），恢复即全绿。**为什么算 P0**：一个已交付的功能整条链路不可用，且失败方式会读到「凭证不可读」——读者会以为是自己填错了 token |
| FB-C1 | P2 | 静默失败边界：`searchGdsPages` 的 `catch { return [] }`、`importCandidate` 的 `catch { return null }`，注释在函数上方而非紧邻 catch（铁律 2） | catch 体首行补原因注释；或由 FB-F6 在 UI 层暴露（更好） | `providers/gds.ts`、`music-store/providers.ts` | S | **已修复（M2）**：catch 体首行写明原因（一个源失败不拖垮其余源）并把失败源交给 UI，`swapFailedProviderTrack` 改为 `flatMap(page.results)`；加上 `music-log-privacy.test.ts` 这类门禁后，「静默吞掉」不再只能在 review 里靠人看出来 |
| FB-C2 | P2 | 在线结果区仍用 `--text-10/11`（REF-4 / REF-12 已收敛其它表面）；来源显示英文 slug | 字号 ≥12、来源名走 i18n | `music-provider-results.tsx`、locales | S | **已修复（M2）**：字号从 `--text-11/10` 提到 `--text-12`，来源名走 i18n（中文只出现在 zh-CN 资源，`i18n:check` 校验键齐） |
| FB-C3 | P2 | 门禁名单缺口：`TOOLBAR_SURFACES` 无音乐三表面（Hub 最大化 / 沉浸层 / 浮窗）；`PHONE_SURFACES` 无手机断点下的音乐面；`check-surface-coverage.mjs` 对 `Modal` 全屏变体的使用者枚举漏掉音乐 Hub（注释说「三个」却列了四个） | 音乐三表面纳入工具栏扫描与手机断点 axe；更新 `Modal` 条目的使用者枚举与理由文本 | `scripts/e2e-visual.mjs`、`check-contrast.mjs`、`check-surface-coverage.mjs` | M | **已修复（M9）**：`TOOLBAR_SURFACES` 新增 `music hub`（根＝modal 壳的 dialog，工具栏＝`[data-hub-header]`，经状态栏「打开音乐库」进入，Escape 关窗并把焦点交回该控件）与 `music immersive player`（根＝沉浸层 dialog，工具栏＝`[data-immersive-header]`）；浮窗不进扫描名单——它不是覆盖层，没有 Escape 也没有可归还焦点的入口，按同一规则另立具名断言（卡片里每个展开控件按下后自身位置不动，队列画在条带之下）；新增两条读 modal 壳的断言（最大化 Hub 铺满视口、最大化沉浸层铺满视口）；`PHONE_SURFACES` 新增 `music library (phone)`（390×844：视口内铺满 + 折叠侧栏的导航抽屉一起读数，两套主题各一遍）；`check-surface-coverage.mjs` 的 `Modal` 条目改成如实的六个使用者（原先说「三个」却列了四个，音乐两个都不在里面），`checkedBy` 补上两条音乐断言。**未做**：沉浸层在手机断点的 axe 归属仍未单列（该宽度下由 e2e-visual 的 375px 几何断言覆盖，见 M12） |
| FB-C4 | P1 | 教训规则化：jsdom 断言 store ≠ 用户看得见 | 每位移动 / 缩放 / 几何能力必须带浏览器断言；规矩写进两份音乐文档 | 文档 + 门禁脚本 | S | **已修复（M4）**：规则写入 §G 第 1、4 条与执行计划的通用验收标准第 4 条；`scripts/e2e-visual.mjs` 的拖动 / 缩放 / 最大化断言按它写（真实 boundingBox、每次拖拽重读把手位置、双击必须发两对 press/release） |
| FB-C5 | P2 | 门禁既有失败（与音乐无关，M9 复跑对比度时暴露）：手机断点（390×844）下分享中心列表表格实测 940px 宽、宽于视口，axe 自己的 `color-contrast` 规则在该 `th` 上抛 `Element midpoint exceeds the grid bounds`（以 `error-occurred` 检查返回），整条规则不再给出任何判定；`PHONE_SURFACES` 的 `share center (phone)` 因此各主题报 1 条未登记审查项。探针实测：同一实例把表格改成适配宽度（`width:100%` + 固定表格布局）后该错消失，容器滚动位置（0/0）与 `thead` 的 `position: sticky` 都不是触发条件 | 由该表面按名声明这一项（`id` + axe 的 `error-occurred` + 目标形状三重），理由与命中条数照旧打印在结果行里；同一单元格上任何**带判定**的项仍会让门禁失败 | `scripts/lib/axe-review.mjs`、`scripts/e2e-harness.mjs`、`scripts/check-contrast.mjs` | S | **已修复（M9b，独立提交，不夹带进音乐改动）**：`lib/axe-review.mjs` 新增 `SHARE_TABLE_HEADER_RULE`（`id` + axe 的 `error-occurred` + 表头形状三重），只在手机断点的分享中心条目上声明；`e2e-harness.mjs` 的 `runAxe` 把 axe 抛规则错时记在 `error-occurred` 检查上的 id 当作 `key` 暴露（之前与「axe 没给 key」同为 `''`，两者必须分开）；`tests/axe-review-share-header.test.ts` 3 例钉住三重各自承重——同一单元格上有判定的项（`shortTextContent`/`bgOverlap`）、空 key、别的 id、别的节点全部仍然失败。门禁实测：修前同一命令报 2 条未登记项，修后 `contrast gate passed`（两主题），结果行打印 `1 of them allowed by name` 与 `allowed by name: color-contrast ×1 (error-occurred) — …`；桌面轮的同一表面仍报「0 reviewed items allowed」（那里表格放得下、单元格正常判定） |

---

## E. 对标 otter-music：缺失功能总表（当成独立音乐 app 看）

| # | 功能 | otter 证据 | Inkstone 现状 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 音源管理面板：逐源开关 + 拖拽排序（影响换源与聚合顺序）+ 是否出现在下拉 | `AggregatedSourceSelect.tsx`、`sourceConfigs` | 只有 1 个聚合 provider、5 源写死、单一开关 | **做**（FB-F4 / F7） |
| 2 | 添加音源 | otter 无（README 明确不接插件生态）；其「添加」= Alist / WebDAV / 播客服务器 | WebDAV / Alist / 播客已有；缺通用服务器型音源 | **做**（FB-M16：Subsonic / Navidrome / Jellyfin / Emby） |
| 3 | 手动指定音源（单曲换源） | `MusicTrackMobileMenu` 切换音源（v2.4.12） | 只有播放失败自动换源 | **做**（FB-F8） |
| 4 | 智能音源自动匹配开关 | `AutoMatchSetting.tsx` | 隐式总是开 | **做**（FB-F8 附带） |
| 5 | 音质选择（在线 br / 下载音质） | `source-quality-store.ts`、`DownloadQualitySelect.tsx` | worker 白名单 5 档，客户端不发 | **做**（FB-F7） |
| 6 | 在线音源封面 / 歌词 | 各 provider `getPic` / `getLyric` | 丢弃 `pic_id` / `lyric_id` | **做**（FB-F5） |
| 7 | 显示音源标签开关 | `SettingsPage` showSourceBadge | 来源列 / 角标常开 | **做**（并入 FB-F4，小项） |
| 8 | 下载管理（队列 / 进度 / 失败重试 / 取消 / 批量） | `download-store.ts` | transfers 有进度与批量下载，缺重试 / 取消 / 音质 | **部分做**（FB-F11） |
| 9 | 播放历史页（删单条 / 清空） | `history-store.ts` | 只有「最近播放」scope | **低优先**（FB-F12） |
| 10 | 歌词：源选择 / 逐字 / 分享图 | `LyricsPanel`、tlyric | 有翻译行（FEA-C3）与歌词搜索；缺源选择 / 逐字 / 分享图 | **部分做**（FB-F13） |
| 11 | 榜单 / 平台歌单导入 | platform playlists | 已决策不做（FEA-A1-6）：上游无此端点且触碰安全边界 | **不做**（保留决策 + 记复核条件） |
| 12 | 跨设备偏好同步 | otter 云同步 | 已决策不做（IMP-12）：本机显示状态 | **不做** |
| 13 | 本地文件扫描 / 车载歌词 / 耳机拔出暂停 / 横屏锁 / Android 返回键 / 应用内更新 | Capacitor 原生能力 | Web 无对应或已有等价物（上传、MediaSession、全局更新体系） | **不适用**（已记录） |
| 14 | 曲库健康检查与批量修复（坏链、缺封面、缺歌词、重复） | 无（Inkstone 已有重复 / 元数据 / 封面） | 有重复与元数据，缺**引用行坏链** | **做**（FB-F9） |
| 15 | 多选批量操作 | 有限 | 已有 selection bar；缺批量换源 / 批量离线入口 | **补齐**（并入 FB-F9 / F11） |
| 16 | 服务器型音源（本轮新增需求） | 无 | 无 | **已做完（M25a 服务端 + M25b 客户端）**：注册自己的音乐服务器（Subsonic / Navidrome / Airsonic / Nextcloud 走 Subsonic API；Jellyfin / Emby 走 Jellyfin API），密码或会话 token 入加密金库且不回前端，可搜索、可把命中添加成参考行（元数据入库、播放时解析）、可测试连通、旧行可被健康扫描。两个家族而非四个品牌，因为品牌不是协议。**客户端（M25b）**：设置页「音乐服务器」分组负责注册（新增 / 测试 / 删除，与 Alist 面板同一形状），音乐库工具栏的第五个主流程负责搜索与添加（默认选中第一台已注册的服务器，结果行带`歌手 · 专辑`与时长，支持单条添加与一次性添加全部结果，四态文案齐全）——两处共用同一个管理组件，不存在两份表单。**未做 / 已知限制**：真机验收（本地无 Subsonic / Jellyfin 实例，且平台 `global_fetch_strictly_public` 拦下 LAN 地址），且 worker 落库前先拿真服务器验证，所以浏览器门禁只覆盖首次路径，搜索 / 添加由契约测试钉住 |
| — | Inkstone 领先项（勿重复建设） | — | EQ / crossfade / 响度归一化 / A-B 循环 / 睡眠淡出 / 视频 / 看门狗熔断 / 拼音搜索 / 标签树 / 重复检测 / M3U / 公开歌单页 / 备份含音乐 / 离线 SW 缓存 / 双语 / 100+ 测试 | **保留** |

---

## F. 残留与回归说明（既有三条线的收尾状态）

- `docs/improvement/music/`：P1 五项、P2 六项全部落地或改判并记录（`plan-with-zcode_glm53fmax.md` 进度日志）。
- `docs/features/music/`：FEA-A1 ~ A3、B1 ~ B4、C1 ~ C4、D1 ~ D2 全部落地；A1-6（平台歌单导入）与 IMP-12 为决策不做。
- `docs/refactor/music/`：REF-1a ~ REF-12 全部提交；**但本轮发现 REF-1b 的拖动在浏览器中从未生效**（FB-F1），REF-3 只完成第一阶段（触控尺寸），五档视觉走查未做，且其验收依赖的浏览器门禁在无实例环境下被记为「已知限制」——这条「已知限制」正是 FB-F1 漏过的原因之一。`budget:check` 的 music chunk 超限同为既有问题（FB-PF1），M20 已修（实测 132.2 KiB / 108.5 KiB → 最大的两个音乐 chunk 89.5 KiB / 88.2 KiB，脚本与基线一字未改）；REF-3 的第一阶段（触控尺寸）由 FB-U1 的八向手柄补全，但 REF-3 的**五档视觉走查**仍未做——§I 的走查表是音乐自己的断点表，不是 REF-3 那张（范围与粒度都不同，不能相互顶替）。

## G. 门禁缺口与规则化建议

1. **几何必须有浏览器断言**（FB-C4）：`hubGeometry` / `floatingPosition` 这类值 jsdom 只能证明「写进了 store」。凡是用户能拖动、缩放、定位的能力，验收必须包含一条真实浏览器断言（读 `boundingBox` 或 `getBoundingClientRect`），否则视为未验收。FB-F1 就是这条规则的来历：REF-1b 的 store 断言全绿、浏览器里却一动不动。断言本身也要按「人怎么找到把手」来写——从把手往上找它的 `header`，别从弹窗往下写子选择器（`aria-label` 在弹窗上，不在被命名的条上）；每次拖拽都要重读把手位置，按旧位置去按会落到弹窗外，一次点在遮罩上的按压会关掉整个窗口。
2. **门禁名单需要跟着表面增长**（FB-C3）：`TOOLBAR_SURFACES`（工具栏稳定性）、`PHONE_SURFACES`（手机断点 axe / 对比度）、`check-surface-coverage.mjs`（全屏根与使用者）三处都缺音乐的部分表面；`Modal` 条目的使用者枚举文本已与事实不符（说三个、列四个、实际五个）。**已结案（M9）**：音乐三表面已进名单，`Modal` 条目改成如实的六个使用者并补上两条音乐断言的 `checkedBy`；`scripts/check-surface-coverage.mjs` 自此对新表面（或共用表面根的新使用者）与已消失的名单项**双向**失败。
3. **静默降级的可见性**（FB-C1 / FB-F6）：允许「一个源失败不拖垮其余源」，但不允许「用户看不出失败」。best-effort 分支的 catch 体要有紧邻注释，UI 层要能区分「没有匹配」与「源不可用」。
4. **手势断言要发出真手势**（FB-C4 的孪生规则）：合成双击必须是两对 press/release 且 clickCount 递增；给一次点击写上 `clickCount: 2` 在浏览器里仍然是**一次点击**，`dblclick` 根本不触发——门禁会显示通过而实际什么都没验证。本轮先写探针确认了这一点，才把双击断言改为两对事件。
5. **门禁的实例状态是断言的一部分**：`npm run contrast:check` 不带参数默认打 `http://localhost:7712`，本地那个实例常年留着真实曲目（含封面），网格卡上的时长徽标叠在封面图上时 axe 判不出底色，会把「音乐库网格视图」报成 6 条待审项失败；换成 `INKSTONE_EPHEMERAL_DEV=1` 的 `:7714`（只跑探针曲目）同一份代码全绿。两个门禁必须指向同一个临时实例，否则量到的是别人的书架。

## J. 「能力 × 表面」矩阵（FB-U7，2026-09-27 逐个读源码）

四个表面：**Hub**（库管理的窗口，页脚是 `MusicPlayerControls`）、**沉浸层**（应用内铺满的播放页）、**浮窗**（可拖可折叠的小卡）、**页脚状态栏**（Hub 关闭时的传输行，随断点隐藏控件——见 M11 的「更多」）。

| 能力 | Hub | 沉浸层 | 浮窗 | 页脚状态栏 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 播放 / 暂停 / 上下一首 | ✓ | ✓ | ✓ | ✓ | 四处共用 `MusicPlayButtons` |
| 进度条跳转 | ✓ | ✓ | ✓ | ✓ | 状态栏从 md 起才画 |
| 音量 | ✓ | ✓ | ✓ | ✓ | Hub / 浮窗是滑块，沉浸层与状态栏是按钮（各自的宽度预算） |
| 播放模式 | ✓ | ✓ | ✓ | ✓ | `MusicModeButton` |
| 播放速率 | ✓ | ✓ | ✓ | ✓ | `MusicRateButton` |
| 睡眠定时 | ✓ | ✓ | ✓ | ✓ | 浮窗与状态栏额外画剩余时间（`MusicSleepStatus`） |
| EQ 开关 | ✓ | ✓ | ✓ | ✓ | 状态栏从 lg 起（FB-U3 的「更多」在 1024–1280 里承载它） |
| A-B 循环 | ✓ | ✓ | ✗ | ✓ | **刻意**：浮窗只有一行，标记与清除需要两个动作；它属于沉浸层 / Hub |
| ±5s 微调 | ✗ | ✓ | ✓ | ✓ | **刻意（记录，不补）**：Hub 页脚的宽度预算已到顶（REF-8 的分档就是为这个排的），且 ←/→ 快捷键在任何表面都可用 |
| 收藏 / 置顶 | ✓ | ✓ | ✓ | ✓ | 状态栏的置顶从 xl 起（同上进「更多」） |
| 歌词 | ✓（详情页签） | ✓ | ✓（浮动歌词） | ✗ | 状态栏没地方放歌词；点开就是一个带歌词的表面 |
| 队列 | ✓（面板） | ✓ | ✓（浏览器） | ✗ | 同上 |
| 可视化 | ✗ | ✓ | ✓ | ✗ | 只有两个整块播放表面有画布的位置 |
| 背景模式（主题 / 模糊 / 渐变） | ✗ | ✓ | ✗ | ✗ | 它改的就是沉浸层的背景 |
| 视频舞台 | ✓（详情页） | ✓ | ✗ | ✗ | `<video controls>` 需要一块舞台 |
| 歌词样式 / 对齐 / 字号 | ✓ | ✓ | ✗ | ✗ | 全局偏好，两处详情面各给一个入口 |
| 窗口最大化 / 铺满 | ✓（窗口态） | ✓（应用内铺满） | ✗ | ✗ | **原生全屏仍只能由放映面板发起**（见 `tests/fullscreen-policy.test.ts`） |
| 拖拽 / 缩放 / 折叠 | ✓（窗口态） | ✗ | ✓（拖拽 + 折叠） | ✗ | 各自的几何进偏好；浮窗的位置是全局坐标 |
| 库管理（上传 / 导入 / 歌单 / 标签 / 回收站 / 批量 / 搜索 / 排序 / 筛选 / 视图） | ✓ | ✗ | ✗ | ✗ | **刻意**：管理属于库，不在播放页重复一遍 |

**本轮补齐的缺口（FB-U6，不是能力而是状态）**：Alist 服务器列表、播客订阅列表与单集列表三处的「加载失败」原本与「（你没有）」同形——失败只拨一条几秒后消失的 toast，面板正文继续说「还没有服务器」/「还没有订阅」。现在三者都把失败写成状态（`alistServersError` / `podcastFeedsError` / `podcastEpisodesError`），面板就地说明并提供重试；单集失败不再退回订阅列表（退回去就把读者刚离开的面板重新盖在失败上面）。**未做**：WebDAV 与传输面板本就有三态（`NotConfigured` / `Empty` / 任务状态行），本轮未动。

## I. 分断点走查表与手机形态（FB-R1，2026-09-27 实测）

音乐库的断点不再各问各的：`MUSIC_NARROW_BREAKPOINT = 900` 是 Hub 侧栏折叠、沉浸层堆叠与曲表列密度共用的同一个数；工具栏自己两档（`MUSIC_TOOLBAR_INLINE_MIN_WIDTH = 1040` 单行 / `MUSIC_TOOLBAR_NARROW_MAX_WIDTH = 560` 两行）；状态栏两档（`MUSIC_BAR_EQ_MIN_WIDTH = 1024` / `MUSIC_BAR_PIN_MIN_WIDTH = 1280`）——后两者是 CSS 类与 JS 阈值同一份契约，由门禁从元素上读回。下表把「每一档该看到什么」与实测证据放在一起，未实测的一律标注。

| 档位 | 中心列 | 曲表 | 工具栏 | 侧栏 / 状态栏 | 证据 |
| --- | --- | --- | --- | --- | --- |
| ≥1440 | 窗口态 ~760；最大化后 ~960 | 歌手 / 专辑 / 来源三列全开 | 单行全量 | 两列侧栏内联；状态栏置顶 + EQ + 进度条全内联 | `e2e-visual` 实测 514 / 960（同一 1440 视口，窗口 vs 最大化） |
| 1240–1440 | 窗口态 ~760 | 三列全开 | 单行 | 两列内联 | 同上（Hub 默认宽 1240） |
| 1000–1240 | 两列内联后中心列 ~314（900 宽时） | 列收起，行内显示「歌手 · 专辑 + 来源」 | 宽档（容器 ≥1040 才单行；否则两行叠放） | 状态栏出现「更多」入口（EQ <1024）；置顶 <1280 也进该面板 | `e2e-visual` 900×600 实测列表 313px / 2 行带；1000×800 实测「更多」入口与面板 |
| 640–1000 | Hub 铺满视口，侧栏进抽屉 | 同上（compact） | 窄档两行（容器 <1040） | 状态栏仍可见（≥768） | `e2e-visual` 700×900 卡片与行操作可点；`contrast:check` 桌面轮 axe 全绿 |
| <640（手机） | 铺满，抽屉导航 | compact：行内替代；**未选视图时默认网格卡片** | 窄档两行；主流程图标化 | 无状态栏（传输在 Hub / 沉浸层 / 浮窗）；音乐面 axe 由 `check-contrast` 手机轮跑 | `e2e-visual` 375×667 与 390×844 实测：工具栏 89px / 2 行带，列表 469 / 646px；手机默认视图由 jsdom 契约钉（新 profile 才能看到，见下） |

**本轮的实现（FB-R1 第一阶段）**：Hub 处于窄形（它自己的盒宽 < `MUSIC_NARROW_BREAKPOINT`，就是侧栏折叠用的那个数）且读者**未明确选择过视图**时默认开卡片——`viewModeChosen` 持久化，一次点选即永久生效；Hub 把「我是不是窄形」作为属性交给列表，列表自己不读视口、也不打量中心列。**修正记录（门禁揭出来的一版错法）**：第一版把这个问题问成「列表中心列够不够宽」——同一个 1440 屏、窗口态的 Hub 中心列只有 ~760px，于是**桌面默认变成了卡片**，`e2e-visual` 的「hub lists the seeded tracks」找不到行（三个后续场景跟着退）。中心列窄不等于屏幕窄：问错了盒，答错了人。**未做**：底部主 tab。

**底部主 tab 评估结论：暂不做**。理由：① 音乐库在本应用里是「笔记上的窗口」而不是独立 app，桌面端可拖可缩放（FB-U1），底部 tab 是手机专属导航模型，两套模型同栈会让返回键与 Escape（FB-C3 的「关窗把焦点交还入口」）都无从定义；② 应用自身已有固定底栏（笔记滚动区从其下方穿过），音乐再占一条会与之叠；③ 手机上的传输已经有三条可达路径（Hub / 沉浸层 / 浮窗），tab 增加的是**导航**而不是能力，而当前缺口不是导航。**重新评估的条件**：若 Hub 将来变成手机上的独立全屏表面且目的地超过 5 个，再按该表面的导航做一次评估，而不是现在预埋。

**手机默认视图的验收边界（诚实声明）**：`scripts/e2e-visual.mjs` 无法证明「新用户第一次在手机上打开看到的是卡片」——该脚本在同一轮运行里已经点过视图切换（显式选择），所以它断言的是另一半：375px 下**仍然是读者选的列表**（而不是被窄档默认复写）。默认那一半由 `music-utils.test.ts` 的 `defaultViewMode` 契约与 `music-view-toggles.test.ts` 的挂载测试（量到 600px 未选择 → 切到网格；已选择 → 不动；量到 1100px → 回列表）钉住，并非未验证。

## H. 已知限制与不做清单

- **保留已决策不做**：榜单 / 平台歌单导入（FEA-A1-6）、跨设备偏好同步（IMP-12）、RMS→LUFS（IMP-13）、10 段 EQ（IMP-14）、视频 crossfade（IMP-15）、KV 单文件 25MB（IMP-16）、WebDAV 后台缓冲（IMP-17）。
- **本轮新增限制**：窄档默认卡片视图只在「读者从未选过视图」时生效（`viewModeChosen` 持久化）；想再看一次默认需清站点数据（与风险告知的「每浏览器一次」同为有意设计）。服务器型音源受 `global_fetch_strictly_public` 约束，只能指向公网 HTTPS（LAN 自建需反向代理 / 隧道；Alist 今天同样受限），且浏览器门禁只能读到它的首次路径（CI 无真服务器，而 worker 落库前先验证是安全边界），搜索 / 添加那一半由契约测试钉住；kuwo 源当前上游 400，属上游状态，本仓库只做到「失败可见 + 可关」；`blog-frontend/src/components/music/` 是另一份独立实现（与 app 版不共享代码），属刻意分离，本轮不动（铁律 14）。
- **三个点名症状的收尾（M26）**：C-1 / C-2 / C-3 均已修复并各自在行内写明残留；D 节 40 行每行带状态标记（26 行完整修复、14 行带显式残留），不存在「疑似完成」的条目。本报告自本行起**定稿**。
- **诚实声明**：本报告全部结论均落到具体文件 / 行或实测响应；无法在当前环境验证的部分会在 `plan-with-freebuff.md` 的对应条目显著标注，不伪造结果。
