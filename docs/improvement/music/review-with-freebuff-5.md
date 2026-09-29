# 音乐库模块复核报告 · 第五轮（Freebuff · 2026-09-29）

> 范围：用户在本轮点名的三件事（曲目列表的行操作、参考项目与部署实例的网址、沉浸层右键菜单），以及我对同一批表面的走查（音乐库各表面 + 播放器的每个载体）。
> 参考项目：本机 `/home/kubuntu/projects/reference/otter-music`（上游 `https://github.com/DJChanahCJD/otter-music`），部署后的实例 `https://otter-music.pages.dev`——本轮新增的两处出处（应用「设置 → 关于」与文档）说的就是它。
> 依据：逐行读代码 + 真实实例上的 DOM 实测（`http://127.0.0.1:7760`，Chromium 1440×900 与窄档各一次）、逐项先红后绿的 jsdom 用例、11 项静态门禁、预算门禁、整轮 `e2e.mjs` 与 `e2e-visual.mjs`。
> 配套计划：`plan-with-freebuff-5.md`。
> 结论先行：**三件事里有两件的主体已经在上一轮提交（`7c51b375`）里了**——行内置顶控件与沉浸层右键菜单都在，是**视图停在旧版本**；真正缺的是「菜单里没有播放/暂停」和「行内收藏的状态表达落后于置顶」。走查另外查出三处**不可达或不一致**：歌单的收藏与置顶有完整的服务端与 API 契约却没有任何写入口、迷你播放器只有收藏没有置顶、歌单的置顶徽标与曲目画法不同。全部按「登记 → 先红 → 实现 → 整轮门禁」处理。

## 一、用户点名的三件事

### 1) 曲目列表的行操作：**已经在 `7c51b375` 里了，缺的是收藏那一侧的表达**

实测（`http://127.0.0.1:7760`，列表视图，真实 DOM 读数）：行内一共 6 个按钮 —— 序号旁的播放/暂停、封面上的播放、标题、**置顶**、**收藏**、更多操作。属于行操作的三个（置顶、收藏、更多操作）共用一条揭示规则：md 起悬停/焦点出现，粗指针常驻（`music-track-row.tsx:357`）。

| 状态 | 静止时画什么（实测） | 悬停时 |
| --- | --- | --- |
| 未置顶、未收藏 | 三个都不画 | 三个都出现 |
| 已置顶 | **置顶控件常驻** + 标题行一枚实心图钉 | 三个都出现 |
| 已收藏 | **收藏控件常驻**（`取消收藏`） | 三个都出现 |

所以「列表右边鼠标悬停只显示收藏按钮」的来源是：**收藏的曲目在静止时就画着心**（这是刻意的，状态要看得见），而未置顶的行静止时一个行操作都不画。用户看到的是这一点，不是缺按钮。

剩下的是真缺口：**行内收藏没有 `aria-pressed`，并自己手写了 `text-[var(--accent)]`**，而置顶走 `active`（强调软底 + `aria-pressed`）、卡片上的收藏也走 `active` —— 同一个开关在三个地方三种表达。⇒ **P5-1**：两个开关收进同一个 `RowToggle`（`music-track-row.tsx:315`），从结构上让它们不能再分叉。

### 2) 参考项目与部署实例的网址

- 工作区里**已有另一位作者**对 5 份文档头部的改动，加的正是同一句话（`plan/review-with-zcode_glm53fmax.md`、`plan/review-with-freebuff-3.md`、`review-with-freebuff.md`）。那不是我的 hunk，本轮**没有动它们**（见「入库方式」）。
- 本轮补两个真实缺口：
  1. **第五轮的两份文档头部**（本报告与计划）写明同一个出处；
  2. **应用里终于有出处**：「设置 → 关于」新增「音乐库参考项目 / otter-music」一行，两个链接分别到上游仓库与部署实例（`about-settings.tsx:175`）。**本机的绝对路径只写进文档，不进界面**——开发机路径对使用者没有意义，而界面上的两条 URL 才是读者能点开的。
- 两个 URL 落成具名常量（`src/shared/constants.ts:10-11`），与既有的 `GITHUB_REPOSITORY_URL` 同处、同手法；文案走 i18n（`settings.music_library_reference*`、`settings.reference_*`，两语言齐全）。

### 3) 沉浸层的右键菜单：在，缺的是「播放/暂停」

- `7c51b375` 已经把沉浸层舞台的右键接到**全应用唯一的曲目菜单**上（`music-immersive-player.tsx` 的 `ImmersiveStage`），门禁 `assertMusicImmersiveMenu` 每轮都在断言它（`scripts/e2e-visual.mjs:5493`）。
- 菜单里当时有：加入队列、下一首播放、播放全部、加入歌单、加标签、收藏、置顶、编辑、搜歌词、下载、离线、换源、删除 —— **唯独没有开始/停止**。⇒ **P5-2**：共享菜单的第一项是 transport；开在**正在播的那一首**上时读作「暂停」并调 `togglePlay`，开在别的曲目上读作「播放」并调 `playTrack(id)`。
- 因为菜单全应用一份，这一项在**行、卡片、队列、沉浸层**四处同时出现，而不是只补沉浸层；门禁在沉浸层那一遍按**精确文本**断言它（`scripts/e2e-visual.mjs:5509`，用 `===` 而不是 `includes`，免得「播放全部」冒充它）。

## 二、走查新登记

### F5-1 · 必改（已修）· a11y/一致性：行内收藏的状态表达与置顶、与卡片都不同

- **证据**：`IconButton` 把 `active` 映射成 `aria-pressed`（`components/primitives.tsx:131`）。行内置顶传了 `active={isPinned}`，行内收藏**没传**，只靠 label 在「收藏/取消收藏」之间翻，并手写 `text-[var(--accent)]` 当选中样式。
- **为什么是问题**：同一个概念（曲目收藏）在卡片上可被读屏读成开关，在行上读不出来；行内两个开关又长得不一样。AGENTS.md 13 要求 ARIA 状态正确且一致。
- **方案**：抽出 `RowToggle`（`music-track-row.tsx:315`）——置顶与收藏都经它渲染：`active` → `aria-pressed` + `md:opacity-100 md:pointer-events-auto`（激活时常驻）。行内收藏因此与置顶、与卡片同源。
- **先红**：`music-track-table.test.ts` 新增「reports the favourite as a pressed toggle, the way the card does」对旧实现得 **1 failed / 24 passed**（`aria-pressed` 为 `null`）。

### F5-2 · 必改（已修）· 功能：曲目菜单没有 transport

- **证据**：`baseMenuItems`（`music-track-menu.tsx`）的条目清单里没有任何播放/暂停。
- **为什么是问题**：沉浸层现在**只能**靠这个菜单操作当前曲目（舞台没有别的常驻控件），而「播放/暂停」恰好是右键一个正在播放的曲目最常想要的动作；少了它，菜单只覆盖了「怎么处置这首歌」，没覆盖「开始/停止」。
- **方案**：`playback` 项置于首位（`music-track-menu.tsx:190-197`），读 store 的 `queue[currentIndex]` 与 `isPlaying` 决定文案与动作。
- **先红**：`music-track-menu.test.ts` 新增两例（在播的那首读作「暂停」并调 `togglePlay`；另一首读作「播放」并调 `playTrack`）对旧实现得 **2 failed / 17 passed**。

### F5-3 · 必改（已修）· 不可达状态：歌单的收藏与置顶没有任何入口

- **证据**：服务端列表按 `ORDER BY is_pinned DESC, sort_order ASC` 排序（`src/worker/routes/music/playlists.ts:44`）；PATCH 接受 `isPinned` / `isFavorite`（`:290-302`）；客户端 API 的 `MusicPlaylistPatch` 有这两个字段（`src/client/lib/api/music.ts:34-35`）；`MusicPlaylistDetail` 带这两个字段；歌单行也真的按它们画徽标（`music-hub-playlists.tsx:259-261`）。但客户端**从来没有**把这两个字段传给 `patchPlaylist`（只有 rename 与 cover 两处调用），也没有任何 store 动作 —— 于是**两枚徽标与那半句排序永远不可能成立**。
- **为什么是问题**：AGENTS.md 铁律 5（禁止死代码）与「不静默」的精神——一个功能的服务端、契约、界面三处都在，只差入口，比缺功能更坏：读代码的人会以为它能用。
- **方案**：新增 `setPlaylistFlags`（`library-collections.ts:161`），经 `api.music.patchPlaylist` 写两个标志，**并在本地按服务端同一条规则重排**（置顶优先；`Array#sort` 是稳定排序，所以没被碰过的歌单保持服务端给的相对顺序——徽标动了而行不动，读起来像写失败）。行菜单加两项（`music-hub-playlists.tsx:152-153`）。
- **先红**：`music-hub-playlists.test.ts` 新增三例对旧实现得 **3 failed / 10 passed**；store 侧另加三例（写标志并置顶到首位 / 只改收藏时顺序不变 / 服务端拒绝时报错且不移动行）覆盖重排与失败路径。

### F5-4 · 已修 · 一致性：迷你播放器只有收藏没有置顶

- **证据**：`music-floating-player.tsx` 的 `FloatTrack` 只画心；而沉浸层（`music-immersive-player.tsx:322-326`）、正在播放面板（`music-now-playing.tsx:156-160`）、状态栏（`music-status-bar.tsx:110-114`）都是成对画。
- **为什么是问题**：这张卡片是手机上的整个音乐表面（FB-C3），少一个的状态在读屏与视觉上都不成组。
- **方案**：补一枚置顶（`music-floating-player.tsx:208-215`），与心同尺寸、同揭示、同 `active`。**先红**：`music-floating-player.test.ts` 新增两例得 **2 failed / 7 passed**。

### F5-5 · 已修 · 一致性：歌单的置顶徽标与曲目画法不同

- **证据**：`music-hub-playlists.tsx:261` 的图钉没有 `fill-current`，而曲目行与卡片的置顶徽标是实心的（`music-track-row.tsx`、`music-track-card.tsx`）。
- **方案**：补 `fill-current`，让「已置顶」在所有列表里是同一种画法。

### F5-6 · 登记（未改）· 队列行没有收藏/置顶的常驻控件

- **证据**：`music-queue-list.tsx` 行内只有上移/下移/移出，加上本轮的右键与菜单键。
- **判断**：队列的语义是顺序，右键与菜单键已经到得了收藏/置顶；行内再加两枚常驻控件会把一条 36px 的行挤满。按 YAGNI 登记；将来要加，走同一套 `RowToggle` 形态。

### F5-7 · 已收口（本轮末尾补做）· `plan-with-freebuff-2.md` 的 5 处 `待回填`

- **初判**：与第四轮修掉的 `plan-with-freebuff-3.md:42` 同类，属第二轮的历史文档，按「不顺手修无关问题」只登记，等它那一轮的人收口。
- **收口**：用户追问「全部任务都做完了吗」时把这条重新打开——五行的哈希其实都能核对出来，于是按第四轮同一口径回填（取证见 `plan-with-freebuff-5.md` 的 P5-7）：M7 `e98cb077`、M8 `522a5377`、M9 `76e5d799`、M10 `27c808b9`、M11 `1ef010ad`。改后 `grep -rn 待回填 docs/` 只剩说明性引用，不再有占位符。
- **边界没变**：仍不为凑格式去改第二轮其它已定稿的表述。

## 三、验证矩阵（本轮实测，全新实例 `:7760`）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npx vitest run src/client/features/music` | ✅ **123 文件 / 1043 例** |
| 11 项静态门禁（style / comments / i18n / size / hardcoded / tokens / deep-imports / module-state / surfaces / empty-catch / escape） | ✅ 全绿 |
| `npm run budget:check` | ✅ music 各 chunk ≤ 97.7 KiB |
| `node scripts/e2e.mjs http://127.0.0.1:7760` | ✅ **177 通过 / 0 失败** |
| `node scripts/e2e-visual.mjs http://127.0.0.1:7760` | ✅ **652 通过 / 0 失败**（上一轮定稿 651；新增 1 条 = 沉浸层菜单的 transport 断言） |

> 逐项的先红条数留在 `plan-with-freebuff-5.md` 的进度日志里；本表是收口那一刻的整轮读数。

## 四、已知限制与不做项

- **本轮没有改动服务端、数据迁移或 API 契约**：F5-3 用的是既有 PATCH 路由与既有字段，所以没有兼容性与回滚面。
- **不做**：队列行的常驻收藏/置顶（F5-6）。`plan-with-freebuff-2.md` 的历史回填（F5-7）原也在此列，收口时补做，改登记为已收口。
- **界面出处的边界**：应用里只放两条公开 URL；`/home/kubuntu/projects/reference/otter-music` 是本机路径，只出现在文档里。
- **环境限制**：全部浏览器证据来自 `INKSTONE_EPHEMERAL_DEV=1` 的全新实例；在线音源断言仍靠请求拦截，沙箱里到不了真实上游。

## 五、复现命令

```bash
npm run typecheck
npx vitest run src/client/features/music --testTimeout=30000
for s in style:check comments:check i18n:check size:check hardcoded:check tokens:check \
         deep-imports:check module-state:check surfaces:check empty-catch:check escape:check; do
  npm run --silent "$s" || echo "FAIL $s"
done
npm run budget:check
# 浏览器（先 e2e 注册并轮换密码，再跑视觉门禁）
INKSTONE_EPHEMERAL_DEV=1 npx vite --mode kv --port 7760 --strictPort --host 0.0.0.0 &
node scripts/e2e.mjs http://127.0.0.1:7760
node scripts/e2e-visual.mjs http://127.0.0.1:7760
```
