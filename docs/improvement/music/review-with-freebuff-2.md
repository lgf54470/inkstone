# 音乐库模块二次复审报告 · 把音乐库当作独立音乐 app 审查（Freebuff · 2026-09-28）

> 范围：`src/client/features/music/`（含 `music-store/`、`providers/`、`music-share-page/`）与 `src/worker/routes/music/` 的全部能力，含 UI 规范符合性、信息与交互完整性、作为独立音乐 app 的功能完整度、性能与安全。
> 配套执行计划：`docs/improvement/music/plan-with-freebuff-2.md`（逐项提交 + 进度日志）。
> 与既有各线的关系：`review-with-freebuff.md`（首轮 38 项，已全部结案）、`docs/features/music/*`（对标缺失功能）、`docs/refactor/music/*`（UI 重构）均已收束。**本报告只登记首轮之后新出现、首轮未覆盖、以及首轮自己留下的盲区所掩盖的问题**，不重复已结案条目。
> 本轮共登记 **14 项**（P0 两项 + 一项同源落点、P1 五项、P2/P3 六项），其中两项 P0 都是「整条链路已经坏掉而门禁完全看不见」。
> 取证方式：源码逐行定位（下文每项带 `文件:行`）、本轮用户提供的四张截图、以及首轮 M8 验收记录里探针样本的复核。

---

## A. 结论摘要

音乐库仍是本仓库最完整的模块（113 个非测试源文件 / 17 323 行，客户端 + worker + 102 个测试文件）。播放内核（3 段 EQ + 预设、3s crossfade、RMS 响度归一化、A-B 循环、睡眠定时带 20s 淡出、视频曲目、20s 流看门狗 + 连续失败熔断）、曲库管理（拼音全拼与首字母搜索、标签树、sha256 重复检测、元数据编辑与补缺、iTunes 封面匹配、列表/网格双视图、回收站、播放历史、库健康扫描）、引用源体系（R2 / WebDAV / Alist / 直链 external / 在线聚合 provider / 自建 Subsonic・Jellyfin 家族 / 播客 RSS）都超过多数自托管方案。

但本轮的两项 P0 说明**「做完了」与「能用」之间仍有缺口，而这个缺口恰好落在自动化门禁照不到的位置**：

- **P0-1 · 在线曲目的「添加」与「试听」必然失败。** `worker/routes/music/provider.ts:206` 把 `import-provider` 的 body 上限设为 `JSON_BODY_LIMITS.small`（8 KiB），而同一个 schema（`worker/routes/music/schemas.ts:311`）允许 `coverDataUrl` 到 800 000 字符、`lyric` 到 `LIMITS.musicLyricMaxBytes`（128 KiB）；客户端 `music-store/providers.ts:190` 恰好把这两样塞进这个 body。请求在进入 schema 校验之前就被 413 拦掉 → `api.error.payload_too_large` → 界面上就是截图 3 右下角那条「内容过大」。**试听与添加共用同一个 `importHit`（`providers.ts:167`），所以「不可播放」与「不可添加」是同一个 bug 的两个症状。**
- **P0-2 · 文件夹上传触发浏览器原生确认框。** `music-transfer-dialog.tsx:97` 给 `<input type="file">` 动态加 `webkitdirectory`，Chrome 为此弹出截图 2 里那个「将 7 个文件上传到此网站？…请仅在您信任该网站的情况下执行此操作」。该弹框不可样式化、不可拦截、不可测。全仓没有任何一处 `window.confirm/alert/prompt`（grep 只命中 `AGENTS.md` 自身的禁条），所以这不是「调用了原生弹窗」，而是**触发了原生弹窗**——同样违反 AGENTS.md 铁律 11 的精神，且是读者最不安的那一类提示（「你信任这个网站吗」）。

其余高优先级问题集中在三类：**同一个队列在三个表面上能力不一致**（Hub 与浮窗都有搜索，沉浸层没有）、**布局的行模型是「涌现」而不是声明出来的**（工具栏换行后落单控件悬在左边、右侧一条空白）、以及**在线部分仍然只是一个搜索框**（没有可播性预判、时长恒为「未知」、封面缩略图还在吃播放额度）。

---

## B. 为什么会漏检（首轮验收的三重盲区）

这一节比逐项清单更值得留下：P0-1 在 M8 的验收里是**绿的**，原因不是「没测」，而是三件事叠在一起：

1. **探针样本太小。** M8 的真实上游验收记录写的是「`provider/cover` 返回 `image/jpg` 4880 字节」。4 880 字节的封面 base64 后约 6 500 字符，加上当时的歌词（2 247 字符）与 JSON 外壳刚好贴住 8 KiB 的边——**样本恰好没有越过阈值**，于是「导入返回 201」被记成了通过。现实中的封面是 320px JPEG @0.82（20–60 KB），base64 后 27–80 KB，必然失败。
2. **jsdom 测试把真实请求桩掉了。** `music-store/providers.test.ts` 与 `music-provider-results.test.ts` 都把 `api.music.importProviderTrack` 换成 `vi.fn()`，断言的是「调用形状」而不是「这个 body 真的能被服务端接受」。契约两侧的中介（`JSON_BODY_LIMITS` 与 zod schema 的上限）**从来没有任何测试把它们放在一起看**。
3. **这一屏没有任何浏览器断言。** M14 明确把它记为「已知限制：门禁不为它引入外部依赖」。于是「渲染对不对」「点了会发生什么」全线无人复核。

**结论与处置**：盲区不是靠「下次小心」解决的。本轮把三件事各自变成自动门禁——① 真实尺寸的 body 回归（30 KB 封面等价物 + 3 KB 歌词 → 201）；② 客户端请求体形状 ≤ worker body 档位的契约测试（FB2-C2）；③ 用请求拦截造桩、不依赖第三方目录的在线链路浏览器场景（FB2-C1）。

---

## C. 用户点名四条症状的定位结论

### C-1 「不符合 AGENTS.md 文档规范，使用原生确认弹窗」

- **定位**：`music-transfer-dialog.tsx:97`（`node?.setAttribute('webkitdirectory', '')`，紧邻还有 `directory`）。这是 Chrome 对目录上传的属性触发的浏览器级确认框，截图 2 与之一致。
- **性质**：不是 `window.confirm`（全仓无一处），但它就是「原生弹窗」：不可样式化、不可本地化、不可用 ESC 之外的键控、在无障碍树外。AGENTS.md 铁律 11 的落点是「禁止原生弹窗/提示」，其精神是**所有提示都必须是项目自己的 Toast/Modal/Dialog**。
- **同源落点**：`src/client/features/settings/data-settings.tsx:364` 用同一手法（备份文件夹还原）。非音乐模块，单独立项（FB2-F2b）。
- **处置**：FB2-F2 与 FB2-F2b。

### C-2 「沉浸式播放列表在歌词下方？左侧那么多空白区域为何不用？而且还没有搜索功能，悬浮控件就有搜索功能啊」

三条都成立，且第三条是「同一个队列三个表面两种能力」的不一致：

- **位置**：`music-immersive-player.tsx:291` 的 `ImmersiveQueue` 是一个 `flex max-h-40 shrink-0 flex-col border-t` 的**底部条带**（头部 32px + 列表 128px，约 3 行），挂在歌词列的下面。截图 1 的箭头正指向它。
- **左列空白**：`ImmersiveLeft`（`music-immersive-player.tsx:369`）在传输条与「时长 · 体积」之后不再放任何内容，而它在宽版是 `w-96/w-80/w-72` 的整列——封面 + 元数据 + 传输条通常只占到该列的上半部分。
- **无搜索**：沉浸层直接渲染 `MusicQueueList`；Hub 的底部队列面板与浮窗用的是 `MusicQueueBrowser`（`music-queue-browser.tsx`），它**自带搜索框、清除按钮与「没有匹配」的空态**。这是功能丢失，不是形态差异。
- **处置**：FB2-U1（宽版把队列搬进左列并复用 `MusicQueueBrowser`；窄/堆叠版保留底部条带）。

### C-3 「在线搜索歌曲不可播放和添加？显示内容过大？时长未知？」（三问同一屏）

- **不可播放 / 不可添加**：P0-1。413 发生在「登记那一行」这一步，因此两条路一起断。
- **「内容过大」**：就是 `api.error.payload_too_large` 的中文文案（`src/shared/locales/zh-CN/api.ts:12`），即 P0-1 的界面表现。
- **时长未知**：`provider.ts` 的归一化对缺失时长返回 `null`（如实），而 netease 的搜索响应确实**没有** `duration` 字段（首轮实测记录在案）。首轮把「00:00」改成「未知」是对的，但**没有任何回填路径**：目录不报长度的那一行永远停在「未知」，连真的播过之后也不会知道。截图 3 每一行都写着「时长未知」，逐行重复同一个「不知道」，读者得到的信息量是零。
- **处置**：FB2-F1（前两问）+ FB2-F3（第三问）。

### C-4 「工具栏布局有问题，有两行，而且下面一行有很多空白空间」

- **定位**：`music-hub-toolbar.tsx:51` 的外层是 `flex flex-wrap items-center justify-between`，它的第二个子元素 `ToolbarActions`（`:270`）**自己又是一层 `flex-wrap`**。两层嵌套 + `justify-between` 的结果是：行怎么分行完全由各控件 max-content 宽度「涌现」，换行之后**没有任何一组是右对齐的**，落在末尾的少数控件就悬在行首，右侧留出一条空白（截图 3/4 的红框）。
- **为什么折叠没能救它**：`toolbarShape()`（`music-utils.ts:131`）在 `560px ≤ 宽 < 1040px` 区间给出 `folded: true, compact: false`——低频动作进了「更多」菜单，但**该行仍然要求 1040px 才放得下**（`MUSIC_TOOLBAR_INLINE_MIN_WIDTH` 就是「不折所需宽度」的实测值），于是标签化主按钮 + 分段控件 + 搜索框在这个区间必然换行。折叠的档位与「能放下的宽度」不是同一个数，这才是根因。
- **处置**：FB2-U2。**先量后改**：用既有工具（`scripts/e2e-visual.mjs` 的 `readMusicToolbarBudget` 与行带计数）对 fill / 窄窗 / 最大化三档宽度记录行带数、`data-shape` 与每行末尾到容器右缘的间距，再改阈值与对齐，最后把测量固化成断言。

### C-5（本轮新增，不在点名之列但同源）自动换源的行必然没有封面与歌词

`providers.ts:252` 的 `importCandidate`（自动修复路径）只发 `source/sourceId/title/artist/album/durationMs`，**不带 `coverId`/`lyricId`**。于是「原链接失效 → 自动换到另一音源」成功之后，那一行既无封面也无歌词——与 P0-1 同处一改（FB2-F4）。

---

## D. 完整问题清单（问题 → 修改方案 → 涉及范围 → 修改代价 → 修改建议）

代价图例：S（≤0.5 天）/ M（0.5–1.5 天）/ L（>1.5 天）；「范围」只列主要文件，不含测试与 i18n。首轮编号沿用 `FB-*`，本轮为 `FB2-*`。

### D1 P0

| 编号 | 优先级 | 问题（含证据） | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB2-F1 | **P0** | 在线「添加 / 试听」必然 413。`provider.ts:206` 的 body 上限是 `JSON_BODY_LIMITS.small`（8 192 B），`schemas.ts:311` 允许 `coverDataUrl` ≤800 000 字符 + `lyric` ≤128 KiB；`providers.ts:190` 正好塞这两样；两条路共用 `importHit`（`providers.ts:167`），所以「不可播放」与「不可添加」同源。首轮 M8 的探针封面只有 4 880 B，恰好没有越过阈值 | **正解（已选定）**：body 只留元数据 + `coverId`/`lyricId`；worker 在 import 内自己解析——封面走既有 `resolveProviderCoverUrl`（`provider.ts:167`）+ 新增 `storeCoverBytes`（与 `storeCoverObject` 共用 `coverObjectKey`/`putMusicObject`，仍过 `isAllowedOutboundUrl` 与上游 `PROVIDER_COVER_SIZE` 缩放档），歌词把 `providerLyric`（`provider.ts:127`）的内核提为 `resolveProviderLyric`；两者**并行**、best-effort、失败仍 201；`JSON_BODY_LIMITS.small` 保持不变（元数据本就装得下）。删掉客户端的 `resolveImportInput` 抓取与 `music-provider-artwork.ts` | `worker/routes/music/{provider,schemas,cover}.ts`、`client/lib/api/music.ts`、`music-store/providers.ts`、删 `music-provider-artwork.ts` | M | 与 FB2-F4 同一批提交：两者改的是同一个请求形状。**不要**只把 body 上限抬高——那会让 800 KB base64 继续经过客户端、JSON 解析与 `atob`，是拿内存换懒惰 |
| FB2-F2 | **P0** | 文件夹上传触发 Chrome 原生确认框（`music-transfer-dialog.tsx:97` 的 `webkitdirectory`），见截图 2 | 去掉该属性与「目录 input」；**拖放**走 `DataTransferItem.webkitGetAsEntry()` 递归收集（提成纯函数 `music-folder-drop.ts`：无弹窗、可单测、有深度上限与「跳过不支持的文件」计数）；**「选择文件夹」**改用 File System Access 的 `showDirectoryPicker()`，特性检测不通过时**隐藏按钮**并把提示改成「把文件夹拖进来」；两处都反馈跳过了什么 | `music-transfer-dialog.tsx`、新 `music-folder-drop.ts`、locales | M | 浏览器差异要写在文案里而不是假装一致：`showDirectoryPicker` 只有 Chromium 有，Firefox/Safari 只保留拖放。门禁对拖放路径只能覆盖到收集器纯函数这一层 |
| FB2-F2b | P0（同源） | 同一条铁律的第二个落点：`features/settings/data-settings.tsx:364` 用同一手法还原备份文件夹 | 与 FB2-F2 同法，复用同一个收集器 | `features/settings/data-settings.tsx` | S–M | **不属于音乐模块**：单独立项、单独提交，可延后到音乐这批之后 |

### D2 P1

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB2-U1 | P1 | 沉浸层队列是歌词下方的 160px 条带（`music-immersive-player.tsx:291`），左列传输条以下大片空白（`ImmersiveLeft` `:369`），且该队列**没有搜索**——Hub 与浮窗用的是自带搜索的 `MusicQueueBrowser` | 宽版（容器 ≥ `IMMERSIVE_MID_PANE_WIDTH`）在左列传输条之下放可折叠队列区，**复用 `MusicQueueBrowser`**（搜索 + 空态），左列成为「正在播放 + 传输 + 队列」；窄/堆叠版保留底部条带；队列计数与折叠开关仍在歌词头部 | `music-immersive-player.tsx`、`music-queue-browser.tsx`、locales | L | 布局必须落在 AGENTS.md 允许的「独立一列或抽屉」这一种去处，**不能**做成头部的内联展开（该表面在 `TOOLBAR_SURFACES` 里，头部高度是被断言的） |
| FB2-U2 | P1 | 工具栏两行且下方一行大片留白（`music-hub-toolbar.tsx:51` 两层 `flex-wrap` + `justify-between`）；根因是折叠档位（`folded`，`music-utils.ts:131`）与「能放下的宽度」（`MUSIC_TOOLBAR_INLINE_MIN_WIDTH = 1040`）不是同一个数，560–1040 区间必然换行且无人右对齐 | **先量后改**：三档宽度记录行带数 / `data-shape` / 每行末尾到右缘的间距，然后 ① `compact` 与「能放下的宽度」同源；② 紧凑档搜索框可收缩（`min-w-0 flex-1`）而非固定 240px；③ 溢出行右对齐（`ml-auto`），任何一行末尾都贴右缘；④ 「更多」与刷新并入溢出行 | `music-hub-toolbar.tsx`、`music-utils.ts`、`scripts/e2e-visual.mjs` | M | 会改既有 `toolbarShape` 契约——这是设计变更，同批更新契约并写明原因，不要偷偷放宽断言 |
| FB2-F3 | P1 | 在线时长恒为「未知」（netease 搜索响应无 `duration`），且**没有任何回填路径**；截图 3 逐行重复同一句「时长未知」 | ① 在线结果行在目录未报长度时**不画该格**（逐行重复「不知道」的信息量是零）；② 库里保留「未知」这个事实，但**首次真的播过之后回写**：`loadedmetadata` 得到真实长度，仅在行上为 0 时 best-effort PATCH 一次（去重、失败静默但记日志）；③ lrclib 命中时顺带回填（其响应自带 duration） | `music-provider-results.tsx`、`music-store/player.ts`、`music-store/library-tracks.ts` | S–M | 「未知」在曲库里是有意义的事实（它是一行你确实不知道长度的数据），在搜索结果里是噪声——两处口径要分开写清楚 |
| FB2-PF1 | P1 | 封面缩略图吃掉播放额度：`provider/cover`（`provider.ts:143`）每次请求都进 `provider` 族，而 `LIMITS.musicProviderRequestsPerHour = 120`（`shared/constants.ts:124`），与搜索、取流解析**同族**。一页 20 条命中 = 20 个单位，两次搜索就能把「解析播放地址」拖进 429 | 新增 `providerArtwork` 预算族（上限按「一页结果 × 若干页/小时」定，理由写进常量注释：翻页看图不该花播放解析的额度）；客户端按 `source:id` 加一层会话缓存，避免重挂载重取 | `worker/routes/music/{budget,provider}.ts`、`shared/constants.ts` | S–M | 这不是「安全漏洞」而是**配额设计错位**：同一小时里，浏览一张图和开始播放一首歌的价值完全不同 |
| FB2-C1 | P1 | 在线链路零浏览器断言（M14 明确记为已知限制），P0-1 正是从这里漏检 | 在 `scripts/e2e-visual.mjs` 新增音乐在线场景，用**请求拦截造桩**（不引入第三方依赖）：命中列表、封面字节、歌词、import 成功与 502 降级。断言：勾选/试听/添加/批量添加的可见结果、封面真的解码、失败只降级不报错、库里行数 +N | `scripts/e2e-visual.mjs`、新增 `scripts/lib/music-provider-stub.mjs` | M | 这是本轮**最重要的新增项**：它不是为了覆盖这一屏，而是为了让下一个同类事故必须先把门禁改绿才能进主干 |

### D3 P2 / P3

| 编号 | 优先级 | 问题 | 修改方案 | 涉及范围 | 代价 | 修改建议 |
| --- | --- | --- | --- | --- | --- | --- |
| FB2-F4 | P2 | 自动换源的行必然无封面无歌词：`providers.ts:252` 的 `importCandidate` 不带 `coverId`/`lyricId` | 与 FB2-F1 同批：候选也带上两个 id，由 worker 侧解析 | `music-store/providers.ts` | S | 与 F1 同一个请求形状，分开改两次等于把同一处返工两遍 |
| FB2-U3 | P2 | 在线行没有「正在试听这一行 / 添加中 / 已在库中」三态；添加按钮可连点且无反馈（幂等所以不会重复，但读者看不出发生了什么） | 三态：当前播放登记的正是该 hit 时行内显示播放态；添加中按钮 `loading` + 禁用；库中已有同 `providerSource`+`providerSongId` 的行显示「已在库中」（复用幂等三元组判定） | `music-provider-results.tsx`、`music-store/providers.ts`、locales | M | 「已在库中」把幂等这个事实**说给读者听**，是这一屏最便宜的可信度提升 |
| FB2-U4 | P2 | 结果面板 `max-h-56` 内滚动叠加外层曲库列表滚动；8 条命中只看得到 4 条 | 面板高度自适应（`min(45vh, …)`）+ 超过一屏给「展开/收起」，至少消除内滚动套外滚动 | `music-provider-results.tsx` | S–M | 嵌套滚动是触屏上的陷阱：在手机上一滑就滑错层 |
| FB2-C2 | P2 | 与 P0-1 同类的隐患没有任何守卫 | 契约测试：客户端请求体形状的上限必须 ≤ worker 的 body 档位（由类型/常量推导，不硬编码数字），任一侧单独改动立刻变红 | `tests/`、`worker/lib/request.ts` 注释 | S | 把「两个数字必须一起改」变成编译器之外的自动门禁 |
| FB2-U5 | P3 | Hub 侧栏中段大片空白（歌单之后直接跳到页脚统计） | 加「置顶 / 最近播放（5）」短段，或把这些短列表上移 | `music-hub-sidebar.tsx` | S | **可选项**：若判断该留白是留给后续分区的，就写明理由不做，不要为了填满而塞无意义内容 |
| FB2-U6 | P3 | 堆叠（窄）版左列被压成一行横排、控件拥挤；本轮改左列队列后需复核窄版 | 复核 375/390：底部条带保留、左列不出现队列、传输条不溢出 | `music-immersive-player.tsx` | S | 与 FB2-U1 同批复核，避免宽版改好窄版变坏 |
| FB2-PF2 | P3 | 新引入的 `MusicQueueBrowser` 进入沉浸层后的 chunk 与预算 | `npm run build` + `node scripts/check-bundle-budget.mjs` | — | S | 不为了省体积把它塞回静态图（队列是即时可用的高频能力） |

### D4 已核对、确认无需改动的部分（避免下一轮重复怀疑）

- **状态栏**：被 CSS 藏起的置顶 / 均衡器已有「更多」入口（FB-U3/M11），`barMore()` 与 CSS 类同源，阈值与断言都写明了。
- **浮窗（mini player）**：拖动、吸附、折叠、队列（含搜索）、EQ/音量/速率/睡眠、沉浸层入口齐全；`useKeepInsideViewport` 处理了窗口变小后的越界。
- **无原生弹窗调用**：全仓 grep `window.confirm|alert|prompt` 只命中 `AGENTS.md` 自身。
- **主题跟随**：`ADR-0002` 的渲染物清单覆盖了图谱画布这类非 CSS 渲染物，音乐侧没有新增例外。
- **搜索关键词隐私**：M24 已把「Worker 不记关键词」变成自动门禁（`tests/music-log-privacy.test.ts`）。

---

## E. 作为独立 app 的功能完整度对标

音乐库的**本地**能力已经超过主流自托管方案：本地文件 + 三种外部引用源 + 自建服务器 + 在线聚合 + 播客，配播放内核与库管理（去重、补元数据、封面匹配、健康扫描、回收站、播放历史、标签树、双视图、共享播放列表页、媒体会话、沉浸层、悬浮窗、状态栏、可视化器、离线缓存与 outbox）都是齐全的。

**真实缺口集中在「在线部分仍然只是一个搜索框」**：

1. **不可浏览**：只有搜索，没有专辑/歌手/榜单/分类入口。读者知道歌名才有用，想逛一逛没有路。
2. **不可预判可播性**：时长缺失（本轮修）、没有码率/音质提示、没有「这一版是翻唱/伴奏/合集」的区分（去重按「标题 + 歌手」归一，翻唱与伴奏因此可能被合并）。
3. **不能直达播放列表**：在线命中只能先进库，再进歌单；主流 app 是「加入歌单」一步到位。
4. **没有「离线可播」**：已添加的在线行断网即不可播（引用行按次解析上游直链）。
5. **移动端**：底部主 tab 在首轮评估后推迟（结论与复核条件写在首轮报告 §I），窄屏默认卡片视图已做。

以上五条都是**产品方向**而不是本轮的缺陷，因此写进「不做清单」，留给下一轮——本轮的原则是先把「已经做出来的东西真的能用」补齐（AGENTS.md：不牺牲当前可用性去换未来可能的复杂性）。

---

## F. 门禁缺口（本轮要补的守护网）

| 缺口 | 现状 | 本轮处置 |
| --- | --- | --- |
| 在线搜索 / 添加链路无浏览器断言 | M14 记为已知限制（「需要真实第三方目录」） | FB2-C1：请求拦截造桩，不依赖第三方 |
| 客户端请求体形状 vs worker body 档位 | 两侧各自有测试，**从不放在一起看** | FB2-C2 契约测试 |
| 工具栏行模型 | 只断言「手机两行带 + 内容地板」（`e2e-visual.mjs`），中间档位（560–1040）与「右缘留白」无人看 | FB2-U2 补 900/1024/1280/1440 的行带与留白断言 |
| 沉浸层队列 | axe 与头部高度有断言，**队列能力（有无搜索）没有** | FB2-U1 补「左列队列可见且可搜索」 |
| 文件夹上传 | `music-transfer-dialog.test.ts:89` 反而在断言 `input[webkitdirectory]` 存在——**门禁在保护缺陷** | FB2-F2 把它改成断言相反的事实 |

最后一行值得单独说：`music-transfer-dialog.test.ts` 目前的断言方向是「目录 input 在不在」，也就是**门禁本身在为要修掉的行为背书**。改这个测试不是「让步」，而是把断言的方向掰回它应该管的事（收集到的文件）。

---

## G. 已知限制与不做清单（本轮）

**已知限制**（本轮如实记录，不假装覆盖）：

- `showDirectoryPicker` 只有 Chromium 有；Firefox/Safari 上「选择文件夹」按钮隐藏，只保留拖放。门禁只能覆盖到收集器纯函数的这一层，真实拖放的浏览器断言能力有限。
- FB2-F1 之后，封面由 worker 按上游 `size=PROVIDER_COVER_SIZE` 给出的缩放图落库；若某源不认这个参数、回了原图，按字节上限拒绝并降级为无封面（不静默存超大对象）。这条只有单测，没有真实上游矩阵。
- 时长回填依赖「真的播过一次」；目录不报长度且从未播放的行仍然显示「未知」——这是诚实的状态，不是缺陷。
- 在线链路的浏览器场景基于请求拦截造桩，**证明的是渲染与交互**，不证明上游行为；上游真实性仍由人工探针负责（首轮 M8/M22/M23 的先例）。

**不做清单**（写下来是为了下一轮不重复讨论）：

- 在线目录升级为可浏览（专辑/歌手/榜单）：独立产品方向，见 §E。
- 在线曲目直达歌单、离线可播预取：同上。
- 逐字歌词与歌词分享图：首轮已记为残留。
- 移动端底部主 tab：首轮 §I 已有结论与复核条件。
- 侧栏中段留白若判断为「留给后续分区」，则记录理由不做（FB2-U5）。
