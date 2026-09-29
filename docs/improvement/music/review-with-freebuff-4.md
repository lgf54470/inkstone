# 音乐库模块复核报告 · 第四轮（Freebuff · 2026-09-29）

> 范围：**工作区里尚未提交的一轮改动**——沉浸层与队列的曲目菜单、粗指针下的行操作可见性、曲表序号列与置顶控件、以及视觉门禁的扩写。前三条线（`review-with-freebuff.md`、`*-2.md`、`*-3.md`）的结论不在此重复。
> 依据：逐行读 diff（27 个已改文件 + 5 个未跟踪文件）、**全新实例上的真实浏览器整轮实测**、全量单测、静态门禁与预算门禁。
> 配套计划：`plan-with-freebuff-4.md`（逐项提交 + 进度日志 + 哈希回填）。
> 结论先行：**这一轮的实现是对的、门禁是真的全绿**（`e2e.mjs` 177/0、`e2e-visual.mjs` 修前 650/0 / 收口后 651/0、全量单测 5065 例、11 项静态门禁、预算门禁），但它**留下了两处必须收口的问题**（一条整条失效的 `onEdit` 通道、一处与卡片不一致的开关状态表达），并引入了一处**只对指针可达的新交互**（键盘用户到不了），另有若干登记项。

## 一、这一轮做了什么

读 diff 得到的实际内容（不是提交说明里的转述）：

| 主题 | 落点 | 依据（本轮实测确认） |
| --- | --- | --- |
| 曲目菜单上移为全应用一份 | `music-track-menu.tsx` 新增 `trackMenuFromPointer()`（:19）与 `MusicTrackMenuHost`（:56）；`app-shell.tsx:20,64` 挂载；`music-track-list.tsx` 不再自持 | 沉浸层右键与队列行右键打开的确实是**同一个** store 请求；「编辑曲目」经 `requestTrackEdit`/`clearTrackEdit`（`music-store/library-load.ts:139-147`）交回 hub 的编辑器 |
| 沉浸层接受右键 | `music-immersive-player.tsx:141` 舞台 `onContextMenu` | 门禁实测：右键曲词面板 → `[role=menu]` 出现且含「编辑曲目」；按它 → 编辑器盖在播放器上；Esc → 关编辑器留播放器 |
| 队列行答自己的曲目 | `music-queue-list.tsx:158`（`stopPropagation` + 该行 track） | 单测 `music-immersive-context-menu.test.ts`「不是播放中的那首」 |
| 粗指针下行操作常驻 | 新增 `music-reveal.ts:12` 的 `REVEAL_ON_COARSE_POINTER`，用于行操作（`music-track-row.tsx:326`）、卡片操作（`music-track-card.tsx:66`）、队列行（`music-queue-list.tsx:21`）、序号旁的播放控件（`music-track-row.tsx:261`） | 门禁实测：`setViewport({hasTouch:true})` 下 `coarse=true`、三个控件 `hidden=0`；换回鼠标后 `hidden=3` |
| 序号与置顶进曲表 | `music-track-row.tsx:26` 的 `INDEX_COLUMN_CELL`、表头（`music-track-table.tsx:146,161`）与每个行单元共用；行与卡片各加一个置顶控件 | 表头 11 个 columnheader ↔ 行 11 个 cell 数量一致；`hidden` 的占位表头 4 个；密度两条断言通过 |
| 沉浸层重构 | `music-immersive-player.tsx` 的 15 个平铺参数收成 `ImmersiveSurface` 对象（:70-95，±205 行）；歌词两个 hook 移入 `music-lyrics.ts` | 行为等价：沉浸层既有断言（高度/滚动/默认态）与门禁场景全绿 |
| 门禁扩写 | `scripts/e2e-visual.mjs` +133 行：`assertMusicImmersiveMenu`（:5470）、`assertMusicTouchReveal`（:5530）、`sweptRowsForReveal`（:5556）、`readRowActionControls`（:5565）、场景收尾的「不留库打开」（:5461） | 整轮 650 通过 / 0 失败（上一轮定稿是 633/0，本轮净增 17 条）；F4-4 把那条容差断言按语义拆成两条后为 **651/0** |

## 二、验证矩阵（本轮实测，全部在全新实例 `:7740`）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npx vitest run src/client/features/music` | ✅ **123 文件 / 1027 例** |
| `npm run test:unit` | ✅ **556 文件 / 5065 通过 + 1 跳过** |
| 11 项静态门禁（style / comments / i18n / size / hardcoded / tokens / deep-imports / module-state / surfaces / empty-catch / escape） | ✅ 全绿 |
| `npm run budget:check` | ✅ music 各 chunk ≤ 97.7 KiB 预算 |
| `node scripts/e2e.mjs http://127.0.0.1:7740` | ✅ **177 通过 / 0 失败** |
| `node scripts/e2e-visual.mjs http://127.0.0.1:7740`（收口前基线） | ✅ **650 通过 / 0 失败** |
| 同上，在 F4-1…F4-4、F4-7 落地后的同一实例上重跑（本轮定稿数字） | ✅ **651 通过 / 0 失败**（净 +1：F4-4 把「鼠标下至少藏 2 个」拆成「非置顶行全藏 + 置顶行只留取消置顶」两条） |

> 这一张表的意义：**上一轮遗留的两条门禁红（看板块高度、分享中心）没有回来，本轮新增的音乐读数全部通过**。下面登记的问题都不是「跑起来才现形」的行为缺陷，而是读 diff 才看得出的收口项——正因为门禁绿，才不会有人回头再看它们。

## 三、台账

### F4-1 · 必改 · 死代码：`onEdit` 通道已整条失去调用方

- **证据**：`music-track-row.tsx:43` 声明 `TrackRowHandlers.onEdit`，但**没有任何地方读它**（`grep -rn "handlers\.onEdit" src/` 只命中 `music-track-menu.tsx:164` 的 `actions.onEdit`——那是菜单自己的 prop；`templates/template-card.tsx:50` 是另一个模块）。整条链是：`music-hub-modal.tsx:150`（`HubCentre.onEditTrack`）→ `:284`（prop 类型）→ `:334`（传给 `MusicTrackList`）→ `music-track-list.tsx:26,32,43`（props）→ `:57,91,94,109,112`（进 `handlers`）→ 空转；另一支 `use-track-list.ts:21,40,41`（`useTrackListActions(tracks, onEdit)` 把它放进 `actions`）同样没人读。
- **为什么是这一轮造成的**：HEAD 上这条通道**唯一**的消费者是 `music-track-list.tsx:72` 的 `<MusicTrackMenuHost onEdit={onEdit} />`——菜单上移到 shell 后（改用 store 的 `requestTrackEdit`），列表这个 prop 也彻底没了用。（`handlers.onEdit` 本身在 HEAD 时已是空转，属既有问题，但与列表 prop 是同一根通道，一起删才不会留下半截。）
- **方案**：删掉 `TrackRowHandlers.onEdit`、`useTrackListActions` 的 `onEdit` 形参与返回项、`MusicTrackList` 的 `onEdit` prop、`HubCentre.onEditTrack`/`music-hub-modal.tsx` 的传参，并同步 12 处测试夹具（`music-empty-states` / `music-playlist-drag` / `music-row-render` / `music-tag-map` / `music-track-card` / `music-track-menu` / `music-track-table` / `music-view-toggles` 等）。
- **涉及范围**：4 个源文件 + 约 10 个测试文件（机械改动）。
- **代价**：小（30–40 分钟，含回归）。
- **建议**：必做。铁律 5 不允许留下「声明了但没人读」的通道；留着它，下一位读者会以为行上还有一个编辑入口。

### F4-2 · 必改 · a11y：行内的置顶控件不报告状态，卡片报告

- **证据**：`IconButton` 把 `active` 映射成 `aria-pressed`（`components/primitives.tsx:131`）。卡片的置顶传了 `active={isPinned}`（`music-track-card.tsx:57-58`）→ 有 `aria-pressed`，卡片测试也在断言它（`music-track-card.test.ts` 新增两例）。行内的置顶**没传** `active`（`music-track-row.tsx:331-334` 只有 `label` + `className`）→ **完全没有 `aria-pressed`**，只靠 label 在「置顶 / 取消置顶」之间翻。
- **为什么是问题**：同一个概念（置顶开关）在两个表面用了两套表达，且行内那个是「按下去会改状态、但读不出来当前状态」的开关。AGENTS.md 13 要求 ARIA 使用恰当、状态正确；`tokens.css` 的对比度体系也是围绕 `--accent-soft` 软底建立的，而这里走的是另一条路（`--warning` 文字色）。
- **方案**：行内也传 `active={isPinned}`（与卡片同一句话），`className` 只留揭示/常驻相关的类（`revealActions` + 置顶时的 `md:opacity-100 md:pointer-events-auto`），去掉 `text-[var(--warning)]`——`IconButton` 自己会给 `bg-[var(--accent-soft)] text-[var(--accent)]`，与卡片、与全应用其它 `active` 控件一致。行内测试补一条 `aria-pressed` 断言。
- **涉及范围**：`music-track-row.tsx`、`music-track-table.test.ts`（1 个文件 + 1 条测试）。
- **代价**：小（20 分钟）。
- **建议**：必做。顺带把 F4-7 一起定案（见下）。

### F4-3 · 必改 · a11y：新菜单只有指针到得了

- **证据**：`music-immersive-player.tsx:141` 只挂了 `onContextMenu`；`music-queue-list.tsx:158` 同样只有 `onContextMenu`（`grep -n "onKeyDown\|onContextMenu"` 两个文件只有这两处）。队列行本身**没有菜单按钮**（`:197-207` 只有上移/下移/移出队列），沉浸层的舞台也不是可聚焦元素。
- **为什么是问题**：这不是「旧缺口」——**在这一轮之前，这两处的右键交给浏览器，等于什么也没提供**；本轮把它们变成了「能打开全应用曲目菜单」的交互，于是键盘与读屏用户在这两个表面上**到不了**菜单里那些只在这里和曲表提供的动作（置顶、加入歌单、下载离线、编辑、删除、搜歌词）。AGENTS.md 13 是 MUST（不允许例外）：新引入的交互必须键盘可达。
- **方案**：在两个表面上补键盘等价——`Shift+F10` 与 `ContextMenu` 键（`event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')`），复用同一条 `openTrackMenu` 请求，锚点取该元素（队列行取行本身，沉浸层取舞台）。事件从已聚焦的按钮冒泡到行/舞台即可，无需新增可聚焦元素。jsdom 用例覆盖两处（派发 keydown，读 `trackMenu.target.track.id`）。
- **涉及范围**：`music-track-menu.tsx`（新增一个 `trackMenuFromKey`）、`music-immersive-player.tsx`、`music-queue-list.tsx`、`music-immersive-context-menu.test.ts`。
- **代价**：中（40–60 分钟，含两处测试）。
- **建议**：必做。规范红线项不允许降级；而且这两处的实现成本都很低（同一条 store 请求 + 一个键判定）。

### F4-4 · 必改 · 门禁：行操作读数根本没在读行（更严重的一类「假绿」）

写报告时这一项只被记成「阈值靠容差」；收口时**证明它比那更糟——那条断言一直没在看行**。

- **证据一（读数的范围）**：`readRowActionControls`（`scripts/e2e-visual.mjs`，写报告时 :5565）拼的是 `` `${MUSIC_HUB_ROOT} [role="rowgroup"] > [role="row"]` ``。而 `MUSIC_HUB_ROOT` 是一个**选择器列表**（每种语言一个分支），逗号后面的后代组合子只作用于**最后一个**分支——第一个分支单独就能匹配整个音乐库对话框。于是这条读数取到的「第一行」其实是那个 `[role="dialog"]` 自己。
  - **实测**：把读数改成能分辨真假之后，同一轮里它对「一行」报出 `found: 8`，标签 `更多操作 ×3 / 置顶 ×2 / 收藏 ×2 / 取消置顶 ×1`——那正是**整个对话框**（工具栏的菜单键 + 两行的控件）。真行有 6 个按钮（序号旁的播放、封面上的播放、标题、置顶、收藏、菜单），属于行操作的是 **3** 个。
- **证据二（同一个 bug 还在用行数的两处）**：`sweptRowsForReveal` 用 `page.$(MUSIC_HUB_ROOT + ' [role="row"]')` 判断「有没有行」——对话框本身匹配第一个分支，于是**永远为真**，那条「没有行就按列表视图」的兜底一次也没生效；紧随其后的 `waitForTruth` 同样被它满足（交回的是对话框）。
- **证据三（阈值为什么看不出来）**：鼠标态断言是 `mouse.hidden.length >= 2`（写报告时 :5546）。整对话框的读法里永远能找到 ≥3 个这类控件、且其中 ≥2 个在鼠标下是收起的，所以**这条断言在它读错东西的前提下照样全绿**。容差不是「为了容忍置顶行」，而是这个错读法的产物。
- **证据四（夹具状态）**：`wanted` 只收「收藏」一个方向（`LABELS.musicFavorite` ← `music.favorite`），但探针曲目在同一场景更早的卡片读数里已经被按下收藏，所以那一行的控件读出来是**取消收藏**，不在 `wanted` 里——「一行三个控件」实际只数到 2 个，恒等式 `hidden.length === found` 也就无从成立。
- **方案（已实施）**：① 行改由「从每一行向外找」取得（`row.closest(MUSIC_HUB_ROOT)`），并新增 `hubRowCount(page)` 用同一手法数行，替换那两处拼字符串的兜底；② 标签收两个方向（新增 `LABELS.musicUnfavorite` ← `music.unfavorite`）；③ 读数前先 `parkPointer(page)` 把指针移开行——揭示规则问的是「指针不在行上」时的样子，而最后一次按压往往把指针留在那一行里，量到的是悬浮；④ 断言按语义拆两条：非置顶行的三个控件全藏、置顶行只留「取消置顶」并藏起其余两个（置顶行由门禁在触屏那一遍真的按一次造成，不再依赖夹具里有没有）。
- **涉及范围**：`scripts/e2e-visual.mjs`（读数、行数兜底、标签表与三条断言）。
- **代价**：中（写报告时估 30 分钟；实测因要反复在真实实例上验证读数，落在 2 小时量级）。
- **建议**：必做。价值不只是「修一条断言」：它说明这套门禁里**凡把 `MUSIC_HUB_ROOT` 与后代组合子拼起来的地方都不可信**——同一个 bug 在 M18c 已以「建议条读成命中行」的形式出现过一次（见 `review-with-freebuff-3.md` §H）。修完的读法对「在读什么」是可验证的：真行的 `found` 是 **3**。

### F4-5 · 必改 · 三个一次性探针必须删

- **证据**：仓库根未跟踪的 `grid-view.probe.mjs`、`music-menu.probe.mjs`、`touch-viewport.probe.mjs`，文件头自述 `// Throwaway:`。三者诊断的问题（网格视图读数崩溃、宽触屏、沉浸层右键菜单）**现已在门禁里有了正式断言**（651/0 通过），探针已完成使命。
- **方案**：删除三个文件。
- **代价**：极小。
- **建议**：必做。铁律 5：不用的代码直接删，历史在 git。

### F4-6 · 必改 · 缺文档与数字回填

- **证据**：这一轮没有对应的计划/复核文档；`plan-with-freebuff-3.md` 的 M0–M21 已收束（全部 `[x]`），`review-with-freebuff-3.md` §G 记的是上一轮的 **633/0**，而本轮实测已是 **651/0**（净增 18 条：工作区那一轮 +17、F4-4 拆条 +1）。
- **方案**：本报告 + `plan-with-freebuff-4.md`；并在 `review-with-freebuff-3.md` 的收尾数字旁注明「续增到 651/0，见第四轮报告」，避免两份文档的数字互相矛盾。**收口时又发现同类漏网一处**：`plan-with-freebuff-3.md:42` 的 M11 条目还写着 `待回填`，而同一文件的进度日志（:114）早已记下 `19bc5836`——纯回填，无判断成分，一并补上。
- **涉及范围**：3 个文档（+ `plan-with-freebuff-3.md` 的一行回填）。
- **代价**：小。
- **建议**：必做（本报告的产出即此项的一半）。

### F4-7 · 登记 · 卡片置顶态的软底被同一次 `className` 覆盖

- **证据**：`IconButton` 在 `active` 时给 `bg-[var(--accent-soft)] text-[var(--accent)]`（`primitives.tsx:137-139`），而卡片同时传 `className='bg-[var(--bg-overlay)] shadow-[var(--shadow-sm)]'`（`music-track-card.tsx:63`）。`cn` 是 `clsx` + `tailwind-merge`（`lib/cn.ts`），同一组 `bg-*` 取后者 → **置顶卡片实际是「overlay 底 + accent 文字 + 实心图钉」**，不是「accent 软底」。
- **判断**：视觉上说得通（卡片上的按钮都压在封面上，需要 overlay 底才看得清），且 F4-2 若让行也走 `active`，行内会是「accent 软底」（行底是 `--bg-*`，不需要 overlay）。两处**刻意不同**是有理由的。
- **方案**：不改成一样；把理由写进卡片那行的注释（一行），免下一位读者当它是疏漏。行内按 F4-2 走 `active` 的标准外观。
- **代价**：极小。
- **建议**：登记 + 一行注释即可。

### F4-8 · 登记 · `MusicTrackMenuHost` 进入首屏依赖图

- **证据**：`app-shell.tsx:20` 从 barrel 同步 import、`:64` 直接渲染；在此之前该模块只被懒加载的 hub chunk 引用（`music-track-list.tsx` 里）。
- **实测**：`npm run budget:check` ✅（music 各 chunk 最大 95.7 KiB，预算 97.7 KiB），所以**不是违规**；但它把 `Menu` 与 `useTrackMenuItems`（含 playlists/tags 订阅、lucide 图标）从按需带进主包。
- **判断**：这是「一份菜单、全应用共用」这个正确决定的必然代价（否则沉浸层永远打不开它），且预算有余量。
- **建议**：登记；若将来首屏预算吃紧，再考虑把菜单本身也做成懒加载包装（`LazyPeer` 的既有手法）。

### F4-9 · 登记 · 新测试文件的 teardown 没清 `trackEditRequest`

- **证据**：`music-immersive-context-menu.test.ts:38` 的 `useMusic.setState({ tracks: [], queue: [], currentIndex: 0, trackMenu: null })` 没有重置本轮新增的 `trackEditRequest`。
- **判断**：该文件当前不读它，无害；但下一个在此文件加用例的人会踩到上一条用例留下的请求。
- **方案**：teardown 里一并置 `null`（一处）。
- **建议**：随手改掉（并入 F4-3 的提交即可）。

### F4-10 · 登记 · `trackMenuFromPointer` 对滑杆也放行浏览器菜单

- **证据**：`music-track-menu.tsx:20` 的守卫是 `closest('input, textarea, [contenteditable="true"]')`，而音量/进度是 `input[type=range]`。于是右键滑杆得到的是浏览器菜单（因为提前 return，未 `preventDefault`），与「右键播放器任意处得到曲目菜单」不一致。
- **判断**：注释说的是「读者正在输入的字段，其浏览器菜单是关于文字的」——range 不是这种字段，注释与实现的粒度不完全对齐。
- **方案**：两种都说得通。(a) 把守卫收紧到文本类（`input:not([type=range])` 等），让滑杆也答曲目菜单；(b) 保持现状，把注释改成「表单控件一律留给浏览器」。倾向 (b)：滑杆上偶尔要用浏览器菜单缩放/检查，且改动面更小。
- **建议**：登记，随 F4-3 一并把注释对齐（一句话），不改行为。

## 四、已知限制与不做项

- **本轮没有改动服务端、数据迁移、API 契约或缓存策略**：diff 全在 `src/client/features/music/`、`src/client/features/shell/app-shell.tsx`、`scripts/` 与文档；因此没有兼容性与回滚面。
- **未做**：`MusicTrackMenuHost` 的按需加载（F4-8，预算有余量时不值得增复杂度）；把置顶状态提到更多表面（YAGNI）。
- **环境限制**：本报告的全部浏览器证据来自 `INKSTONE_EPHEMERAL_DEV=1` 的全新实例；在线音源断言仍靠请求拦截（`scripts/lib/music-provider-stub.mjs`），沙箱里到不了真实上游。
- **`scripts/check-comments.mjs` 的白名单**：本轮若拆成多个提交，允许表按 AGENTS.md「分批与门禁」只暂存本批的 hunk，不要退回工作区。

## 五、复现命令

```bash
npm run typecheck
npx vitest run src/client/features/music --testTimeout=30000
npm run test:unit
for s in style:check comments:check i18n:check size:check hardcoded:check tokens:check \
         deep-imports:check module-state:check surfaces:check empty-catch:check escape:check; do
  npm run --silent "$s" || echo "FAIL $s"
done
npm run budget:check
# 浏览器（先 e2e 注册并轮换密码，再跑视觉门禁）
INKSTONE_EPHEMERAL_DEV=1 npx vite --mode kv --port 7740 --strictPort --host 0.0.0.0 &
node scripts/e2e.mjs http://127.0.0.1:7740
node scripts/e2e-visual.mjs http://127.0.0.1:7740
```
