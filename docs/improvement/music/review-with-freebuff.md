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

### C-2 「没有做响应式设计，不能完美适配移动端（手机、平板）」

断点体系只做了「折叠」，没做「移动形态」：

- 工具栏在 360–390px 上是「240px 固定搜索框 + 3 段来源筛选 + 4 个带文字主按钮（上传 / WebDAV 音乐 / Alist / 播客）+ 更多 + 刷新」全量换行；`folded` 只收低频动作，**主按钮从不折叠**。
- 状态栏 `hidden xl:inline-flex`（置顶）、`hidden lg:inline-flex`（EQ）、`hidden md:flex`（进度条）在窄屏**没有替代入口**——这是功能丢失，不是降级。
- 曲表 `<1280` 隐藏来源 / 专辑列且无替代信息（REF-3 明确留白）。
- 平板区间（768–1024）：侧栏按**视口 900** 折叠、工具栏按**容器 1040** 折叠，两套断点不同源。
- 矮视口（`HUB_SHORT_VIEWPORT = 700`）改为占满视口后，头部 / 工具栏 / 传输条仍 `shrink-0`，曲表可能只剩不到 100px。
- 门禁层面：手机断点下的音乐 Hub 与浮窗**不在** `check-contrast.mjs` 的 `PHONE_SURFACES`；Hub、沉浸层、浮窗**不在** `e2e-visual.mjs` 的 `TOOLBAR_SURFACES`；`check-surface-coverage.mjs` 中 `Modal` 全屏变体的使用者枚举（注释写「三个」却列了四个）**漏掉音乐 Hub**。移动端改动因此没有守护网。

### C-3 「在线搜索功能不可用，也不可以设置」

- **不可用**：P0 开关 bug + 单源失败静默（五源全挂与「无匹配」同形）+ 预算口径（一次搜索扣 5，约 24 次/小时即失败，且第 5 个请求可能被限流，表现为部分源为空）。
- **不能设置**：**全仓 0 处音乐设置面**（`grep music.settings` 无命中）。`MusicProvider` 接口只有 `id / labelKey / isEnabled`；`GDS_SOURCES` 五源写死、无逐源开关 / 排序 / 可见性；worker 侧还有第二份字面量 `GDS_UPSTREAM_SOURCES`（漂移即表现为「客户端提供、服务端 400」）。
- **数据不完整**：worker 归一化丢弃上游 `pic_id` / `lyric_id`（实测均可取），而 netease 搜索响应里根本没有 `duration` → 在线曲目**无封面、无歌词、时长为 0**。
- **死能力**：worker 白名单了音质 128/192/320/740/999，客户端从不发送，`quality=320` 三处硬编码。

---

## D. 完整问题清单（问题 → 修改方案 → 涉及范围 → 修改代价 → 修改建议）

代价图例：S（≤0.5 天）/ M（0.5–1.5 天）/ L（>1.5 天）；「范围」只列主要文件，不含测试与 i18n。

### D1 功能缺陷（F）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-F1 | **P0** | Hub 拖动无效：`anim-pop` 的 `transform: none` 永久覆盖内联 `translate` | 位移改用**独立 `translate` 属性**（CSS Transforms 2，不被 `transform` 动画覆盖；备选 `left/top`，均无需 `!important`）；补浏览器断言「真实按在标题栏拖 120px，窗口在屏幕上跟着走且能拖回」 | `music-hub-window.tsx`、`music-hub-modal.tsx`、`scripts/e2e-visual.mjs` | S 代码 + M 门禁 | **已修复（M4）**：实测同一断言——改前 dx/dy = 0/0（store 已写对、屏幕不动），改后 120/60，拖回后回到原点 |
| FB-F2 | **P0** | 在线开关打开不触发搜索；关闭 / 加载 / 无匹配 / 全源失败四态混同 | 开关纳入 effect 依赖（或订阅偏好变化重发）；四态文案分开，全源失败带「重试」 | `music-provider-results.tsx`、`music-store/providers.ts`、locales | S | 先做，用户可见收益最大 |
| FB-F3 | P1 | 来源筛选只有 `all/r2/webdav`，`alist/external/provider/podcast` 行无法筛选（角标已支持） | 扩展值域 + 工具栏按「库中实际存在的来源」动态生成 + `applySourceFilter` 兼容；未知旧值回落 `all`（已有逻辑） | `music-store/types.ts`、`state.ts`、`library-load.ts`、`music-hub-toolbar.tsx` | S–M | 顺手把来源名走 i18n（现为英文 slug） |
| FB-F4 | P1 | 全仓无音乐设置面；音源开关埋在搜索结果里，EQ / 响度 / 交叉淡入 / 歌词样式 / 背景模式 / 悬浮窗散落各弹层 | 全局设置面板新增「音乐」分区（唯一真源）+ Hub 头部齿轮直达同一分区 | `features/settings/*`、`features/music/*`、locales | L | 分两步：先壳 + 音源组，后播放默认组 |
| FB-F5 | P1 | 在线曲目无封面、无歌词、时长为 0（`pic_id`/`lyric_id` 被丢弃；netease 无 duration） | worker 新增 `types=pic` / `types=lyric` 代抓（复用既有 allowlist 主机）；封面经派生键落库、歌词入 `hasLyric` + `ensureTrackLyric` 链路；时长缺失显式显示「未知」 | `worker/routes/music/provider.ts`、`music-store/providers.ts`、`music-track-row.tsx`、`music-artwork.tsx` | L | 可拆「封面」「歌词 / 时长」两次提交 |
| FB-F6 | P2 | 单源失败静默：`searchGdsPages` 每源 `catch → []`，五源全挂与「无匹配」同形（实测 kuwo 400） | 返回每源状态（ok / empty / error），在线结果区显示「N 源失败 · 重试」；保留「一个死源不拖垮其余源」 | `providers/gds.ts`、`music-store/providers.ts`、`music-provider-results.tsx` | M | 与 FB-F2 同批，四态文案正好承接 |
| FB-F7 | P2 | 音质档位无 UI（worker 白名单 5 档，客户端永不发送，320 三处硬编码） | 设置里给在线音源音质档位，存偏好、随请求传（含流解析） | `music-store/state.ts`、`providers.ts`、`worker/routes/music/provider.ts` | S | 与 FB-F4 同批 |
| FB-F8 | P2 | 只有自动换源，无「把这首换成 X 源」；也没有智能换源开关 | 曲目菜单「切换音源」→ 复用 `matchScore` 列候选 → 复用 `swapFailedProviderTrack` 回写；设置给换源开关 | `music-track-menu.tsx`、`music-store/providers.ts` | M | 对齐 otter v2.4.12 |
| FB-F9 | P2 | 引用行（external/provider/alist）失效后只能逐首点播发现 | 库健康扫描：批量 Range 探测 → 结果视图 + 批量换源 / 移入回收站 | `music-store/*`、新 worker 端点、新面板 | L | 引用源变多后价值陡增 |
| FB-F10 | P2 | 在线结果行只能逐条「添加」：无试听、无批量、无封面 | 行内试听（登记 + 播放，已有 `playProviderTrack`）、行复选框 + 批量添加、封面 / 专辑 / 时长补全 | `music-provider-results.tsx` | M | 依赖 FB-F5 的封面 |
| FB-F11 | P2 | 下载只有「开始 / 进度 / 失败」，无失败重试、取消、下载音质 | transfers 增加重试 / 取消，接 FB-F7 的下载音质 | `music-store/transfers.ts`、`music-transfer-dialog.tsx` | M | 与 F7 合并提交可省一轮 |
| FB-F12 | P3 | 播放历史只有「最近播放」视图，不能删单条 / 清空 | 历史视图补逐条删除与清空（`last_played_at` 已有） | `music-store/*`、sidebar | S–M | 低优先，YAGNI 边界要守住 |
| FB-F13 | P3 | 歌词增强：无歌词源选择、无逐字、无分享图 | 歌词源选择（本地 / lrclib / 在线源）+ 逐字评估；分享图复用导出管线 | `music-lyrics.ts`、`library-lyrics.ts`、导出 | L | 先只做「源选择」，逐字另立条目 |

### D2 UI / UX（U）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-U1 | P1 | 窗口 chrome 发现性与能力（16px 隐形手柄、单向缩放、无双击最大化、无 `touch-action`、视口变化不重夹取） | 8 向边缘 / 角落命中区（真实 `<button>` + 方向键）、可见把手（令牌着色）、双击标题栏最大化（两态可切）、`touch-action: none`、`resize` 监听重夹取；七个非主手柄 `aria-hidden` + `tabIndex={-1}`（键盘通道是具名的东南角控件） | `music-hub-window.tsx`、`music-hub-modal.tsx` | M | **已修复（M5）**：实测两套断言——真实浏览器里按住东/西/下边分别验证「宽度与位置同变」（尺寸对但变错边同样算失败），并验证双击标题栏填满视口、二次双击还原；jsdom 契约 13 例钉住四向几何、偏移预算、`aria-hidden`/焦点、`touch-none`、视口重夹取。**未改**：窗口最大宽度仍为弹窗自身的 `max-width`（1240），框架内边距会把它再收窄一点，所以贴到最大时向外的边不再跟随指针——已在已知限制记明 |
| FB-U2 | P1 | 窄屏工具栏全量换行，头部吃掉半屏 | 窄档：搜索框占满一行、来源筛选改下拉、4 个主按钮图标化或进「更多」、排序进「更多」 | `music-hub-toolbar.tsx`、`music-search-box.tsx` | M | 先出断点表，再改布局 |
| FB-U3 | P1 | 状态栏隐藏即不可达（置顶 / EQ / 进度条） | 窄档补「更多」弹层承载被隐藏控件；进度条可点击展开 | `music-status-bar.tsx`、`music-transport-widgets.tsx` | S–M | 与 U2 同批 |
| FB-U4 | P2 | 曲表 `<1280` 丢来源 / 专辑列且无替代 | 窄屏用卡片视图或次级行展示来源 / 专辑 | `music-track-row.tsx`、`music-track-card.tsx` | M | 与 R1 的移动形态一起做 |
| FB-U5 | P2 | 在线结果区信息与语义：无分组、来源显示英文 slug、字号 10/11 档 | 分组 + 来源名本地化 + 字号 ≥12（与 C2 合并） | `music-provider-results.tsx`、locales | S | 与 FB-F2/F6 同批 |
| FB-U6 | P2 | 三态一致性：加载 / 失败 / 空在 Alist、播客、WebDAV、传输等子面板是否齐 | 逐面板核对三态，缺的补空态与重试 | `music-{alist,podcast,webdav,transfer}-modal.tsx` | M | 走查产出清单再改 |
| FB-U7 | P3 | 三表面（Hub / 沉浸层 / 浮窗）能力矩阵不一致，同一功能摆放不同 | 产出「能力 × 表面」矩阵，补齐缺口并记录「刻意不同」 | 三表面组件 | M | 矩阵先落文档再动代码 |

### D3 响应式（R）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-R1 | P1 | 移动端无独立形态（抽屉 + 底部传输条的桌面骨架） | 分断点走查表（≥1440 / 1240–1440 / 900–1240 / 640–900 / <640）+ 窄屏默认卡片视图 + 评估底部主 tab | `music-hub-modal.tsx`、`music-hub-toolbar.tsx`、`music-track-list.tsx`、e2e | L | 本轮给走查表 + 第一阶段实现，tab 结构单独评估 |
| FB-R2 | P2 | 侧栏按视口 900、工具栏按容器 1040，断点不同源 | 统一到容器测量（`useElementWidth` 已有） | `music-hub-modal.tsx`、`music-utils.ts` | S–M | 与 R1 同批 |
| FB-R3 | P2 | 矮视口占满后曲表可能 <100px | 矮视口把排序 / 来源与部分传输控件收进菜单，给内容区最小高度预算 | `music-hub-modal.tsx`、工具栏 / 传输条 | S–M | 加「内容高度 ≥ 预算」断言 |

### D4 性能（PF）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-PF1 | P1 | music chunk 109 KiB vs 预算 96 000 B（已登记为既有问题） | 核对 `MUST_BE_LAZY` 与分包边界：providers / podcast / alist / webdav / id3 / export 等「主动打开才用」的面板拆独立 lazy chunk | 懒加载入口与各面板 | M | 纳入验收，不许改基线 |
| FB-PF2 | P1 | 虚拟化只在 >60 首的表格视图；网格仍 200 条截断 + 「还有 N 条」不可操作 | 网格卡片行高恒定后窗口化，或改「加载更多」；解除截断 | `music-track-list.tsx`、`music-track-card.tsx` | M | 与 R1 卡片视图一起做 |
| FB-PF3 | P2 | 预算口径倒挂：一次搜索扣 5（≈24 次/小时失败），播放解析与流代理 0 计数（egress 无上限） | 搜索按「聚合一次」计数（或提高额度）；流代理加预算族与字节软上限 | `worker/routes/music/{provider,budget,stream}.ts`、`shared/constants.ts` | M | 与 S1 同批 |
| FB-PF4 | P2 | 查询链路成本未实测（`visibleTracks` 含拼音 + 歌词扫描 + 远端合并；200ms/500ms 双定时器） | 仿 `scripts/measure-*.mjs` 写音乐库测量脚本；把重步骤移出渲染路径（必要时 `useDeferredValue` / worker 化） | `music-store/selectors.ts`、`library-load.ts`、新脚本 | M | 先量后改，避免凭感觉优化 |
| FB-PF5 | P3 | 封面加载策略（懒加载 / SW 缓存 / 在线封面派生）需核对 | 核对 `MusicArtwork` 的 `loading` / `decoding` / 缓存命中；在线封面走派生键与 SW 缓存 | `music-artwork.tsx`、`music-cover.ts` | S | 与 F5 同批顺带 |

### D5 安全（S）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-S1 | P2 | 代理流无超时、无大小上限：`streamExternalTrack` / `streamProviderTrack` / `streamAlistTrack` 的 `fetch` 既无 `AbortSignal.timeout` 也无字节上限 → 上游挂起拖住请求，异常源可产生无界 egress | 加 12s 连接 / 首字节超时（**流式透传、不整体缓冲**）+ 每响应软上限 + 预算族 | `worker/routes/music/stream.ts`、`outbound.ts` | M | 与 PF3 同批 |
| FB-S2 | P2 | provider 代抓用默认 `redirect: 'follow'`，与 `outbound.ts` 明示的「每一跳都校验，因为 Worker 跟随的重定向仍是 Worker 在抓」不一致 | 改用已有 `fetchAllowedResource(url, ['music-api.gdstudio.xyz'], …)`（内含 `redirect: manual` + 逐跳校验 + 12s 超时） | `worker/routes/music/provider.ts` | S | 直接复用，别新写 |
| FB-S3 | P2 | 用户 / 第三方给的播放 URL 未过 `isAllowedOutboundUrl`，仅靠 `global_fetch_strictly_public` 兜底（`wrangler.toml` / `kv.toml` 已声明；`wrangler.demo.toml` 是纯静态 assets 无 worker，不构成缺口） | 统一走 `isAllowedOutboundUrl(url, { allowHttp: true })` + 保留运行时标志（external 直链常为 http / 自建 HTTPS，需显式策略） | `worker/routes/music/stream.ts` | S | 纵深防御，记录策略依据 |
| FB-S4 | P2 | 源枚举双份字面量：`GDS_SOURCES`（client）与 `GDS_UPSTREAM_SOURCES`（worker） | 单一来源（`@shared/constants` 或 provider catalog）+ 契约测试钉住两侧一致 | `shared/constants.ts`、`providers/gds.ts`、`worker/routes/music/provider.ts` | S | **已修复（M6）**：列表移到 `@shared/constants`，客户端与 worker 读同一数组；契约分两头（客户端钉身份、worker 钉收拒口径），并用变异（客户端改拷贝 / worker 收回本地字面量且缺 `bilibili`）实测两条断言都会报错 |
| FB-S5 | P3 | 搜索关键词是否进入观测 / 日志需核对（搜索词是敏感行为数据） | 核对 `[observability]` 是否记录 query string；必要时脱敏或不记 | `wrangler*.toml`、`provider.ts` | S | 只核对，不改行为 |
| FB-S6 | P3 | 在线音源属版权灰色地带，无风险告知 | 首次开启给一次性告知 + 写入文档（otter 亦为自担风险） | 设置分区、locales、`SECURITY.md` | S | 与 F4 同批 |

### D6 规范符合性（C）

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB-C1 | P2 | 静默失败边界：`searchGdsPages` 的 `catch { return [] }`、`importCandidate` 的 `catch { return null }`，注释在函数上方而非紧邻 catch（铁律 2） | catch 体首行补原因注释；或由 FB-F6 在 UI 层暴露（更好） | `providers/gds.ts`、`music-store/providers.ts` | S | 与 F6 同批 |
| FB-C2 | P2 | 在线结果区仍用 `--text-10/11`（REF-4 / REF-12 已收敛其它表面）；来源显示英文 slug | 字号 ≥12、来源名走 i18n | `music-provider-results.tsx`、locales | S | 与 F2 / F6 同批 |
| FB-C3 | P2 | 门禁名单缺口：`TOOLBAR_SURFACES` 无音乐三表面（Hub 最大化 / 沉浸层 / 浮窗）；`PHONE_SURFACES` 无手机断点下的音乐面；`check-surface-coverage.mjs` 对 `Modal` 全屏变体的使用者枚举漏掉音乐 Hub（注释说「三个」却列了四个） | 音乐三表面纳入工具栏扫描与手机断点 axe；更新 `Modal` 条目的使用者枚举与理由文本 | `scripts/e2e-visual.mjs`、`check-contrast.mjs`、`check-surface-coverage.mjs` | M | 这是 FB-U1 / U2 / R1 的守护网，必须做 |
| FB-C4 | P1 | 教训规则化：jsdom 断言 store ≠ 用户看得见 | 每位移动 / 缩放 / 几何能力必须带浏览器断言；规矩写进两份音乐文档 | 文档 + 门禁脚本 | S | 与 FB-F1 同批落地 |

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
| 16 | 服务器型音源（本轮新增需求） | 无 | 无 | **做**（FB-M16） |
| — | Inkstone 领先项（勿重复建设） | — | EQ / crossfade / 响度归一化 / A-B 循环 / 睡眠淡出 / 视频 / 看门狗熔断 / 拼音搜索 / 标签树 / 重复检测 / M3U / 公开歌单页 / 备份含音乐 / 离线 SW 缓存 / 双语 / 100+ 测试 | **保留** |

---

## F. 残留与回归说明（既有三条线的收尾状态）

- `docs/improvement/music/`：P1 五项、P2 六项全部落地或改判并记录（`plan-with-zcode_glm53fmax.md` 进度日志）。
- `docs/features/music/`：FEA-A1 ~ A3、B1 ~ B4、C1 ~ C4、D1 ~ D2 全部落地；A1-6（平台歌单导入）与 IMP-12 为决策不做。
- `docs/refactor/music/`：REF-1a ~ REF-12 全部提交；**但本轮发现 REF-1b 的拖动在浏览器中从未生效**（FB-F1），REF-3 只完成第一阶段（触控尺寸），五档视觉走查未做，且其验收依赖的浏览器门禁在无实例环境下被记为「已知限制」——这条「已知限制」正是 FB-F1 漏过的原因之一。`budget:check` 的 music chunk 超限同为既有问题（FB-PF1）。

## G. 门禁缺口与规则化建议

1. **几何必须有浏览器断言**（FB-C4）：`hubGeometry` / `floatingPosition` 这类值 jsdom 只能证明「写进了 store」。凡是用户能拖动、缩放、定位的能力，验收必须包含一条真实浏览器断言（读 `boundingBox` 或 `getBoundingClientRect`），否则视为未验收。FB-F1 就是这条规则的来历：REF-1b 的 store 断言全绿、浏览器里却一动不动。断言本身也要按「人怎么找到把手」来写——从把手往上找它的 `header`，别从弹窗往下写子选择器（`aria-label` 在弹窗上，不在被命名的条上）；每次拖拽都要重读把手位置，按旧位置去按会落到弹窗外，一次点在遮罩上的按压会关掉整个窗口。
2. **门禁名单需要跟着表面增长**（FB-C3）：`TOOLBAR_SURFACES`（工具栏稳定性）、`PHONE_SURFACES`（手机断点 axe / 对比度）、`check-surface-coverage.mjs`（全屏根与使用者）三处都缺音乐的部分表面；`Modal` 条目的使用者枚举文本已与事实不符（说三个、列四个、实际五个）。
3. **静默降级的可见性**（FB-C1 / FB-F6）：允许「一个源失败不拖垮其余源」，但不允许「用户看不出失败」。best-effort 分支的 catch 体要有紧邻注释，UI 层要能区分「没有匹配」与「源不可用」。
4. **手势断言要发出真手势**（FB-C4 的孪生规则）：合成双击必须是两对 press/release 且 clickCount 递增；给一次点击写上 `clickCount: 2` 在浏览器里仍然是**一次点击**，`dblclick` 根本不触发——门禁会显示通过而实际什么都没验证。本轮先写探针确认了这一点，才把双击断言改为两对事件。
5. **门禁的实例状态是断言的一部分**：`npm run contrast:check` 不带参数默认打 `http://localhost:7712`，本地那个实例常年留着真实曲目（含封面），网格卡上的时长徽标叠在封面图上时 axe 判不出底色，会把「音乐库网格视图」报成 6 条待审项失败；换成 `INKSTONE_EPHEMERAL_DEV=1` 的 `:7714`（只跑探针曲目）同一份代码全绿。两个门禁必须指向同一个临时实例，否则量到的是别人的书架。

## H. 已知限制与不做清单

- **保留已决策不做**：榜单 / 平台歌单导入（FEA-A1-6）、跨设备偏好同步（IMP-12）、RMS→LUFS（IMP-13）、10 段 EQ（IMP-14）、视频 crossfade（IMP-15）、KV 单文件 25MB（IMP-16）、WebDAV 后台缓冲（IMP-17）。
- **本轮新增限制**：服务器型音源受 `global_fetch_strictly_public` 约束，只能指向公网 HTTPS（LAN 自建需反向代理 / 隧道；Alist 今天同样受限）；kuwo 源当前上游 400，属上游状态，本仓库只做到「失败可见 + 可关」；`blog-frontend/src/components/music/` 是另一份独立实现（与 app 版不共享代码），属刻意分离，本轮不动（铁律 14）。
- **诚实声明**：本报告全部结论均落到具体文件 / 行或实测响应；无法在当前环境验证的部分会在 `plan-with-freebuff.md` 的对应条目显著标注，不伪造结果。
