# 音乐库整改执行计划 · 第四轮（Freebuff · 2026-09-29）

> 依据：`docs/improvement/music/review-with-freebuff-4.md`（对**工作区未提交改动**的逐行复核：3 项必改 + 1 项门禁必改 + 3 项登记）。
> 上一轮 `plan-with-freebuff-3.md`（M0–M21）已全部交付并收束；本轮接着它的工作区状态继续，不改写已提交历史。
> 分支：`dev` 直接逐项提交。约定与前几轮一致：每个条目 = 一个原子提交；先写能失败的复现测试（jsdom / 门禁几何），实现后跑回归再提交；**每次提交都更新本文件**（勾选 + commit 短哈希 + 进度日志一行）。
> **没有「本轮之外」分桶**：本报告登记的 10 项全部进表；F4-7～F4-10 是「登记 + 一句话注释/一处 teardown」的收口，也照做。

## 状态图例

`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）

## P4-1 · 行内置顶控件与卡片用同一套状态表达（F4-2）

- [x] 行内 `IconButton` 传 `active={isPinned}`，去掉 `text-[var(--warning)]`；`aria-pressed` 与卡片一致。
- **先红**：`music-track-table.test.ts` 新增一例，读行内 `button[aria-label=置顶]` 的 `aria-pressed`——对当前实现跑必红（属性缺失）。
- **验收**：行内与卡片的置顶控件都报 `aria-pressed`；置顶行在 md+ 仍常驻（既有断言保持绿）；对比度沿用 `--accent` on `--accent-soft`（`check-contrast.mjs` 已按全部强调色量测）。
- **范围**：`src/client/features/music/music-track-row.tsx`、`src/client/features/music/music-track-table.test.ts`。

## P4-2 · 沉浸层与队列的曲目菜单也键盘可达（F4-3，含 F4-9、F4-10 的收口）

- [x] `music-track-menu.tsx` 新增 `trackMenuFromKey(event, track, openTrackMenu)`：认 `ContextMenu` 键与 `Shift+F10`，锚点取事件目标，与指针版共用同一条 `openTrackMenu` 请求。
- [x] `music-immersive-player.tsx` 舞台与 `music-queue-list.tsx` 行各挂 `onKeyDown`（事件从已聚焦按钮冒泡上来）。
- [x] `music-immersive-context-menu.test.ts` 的 teardown 一并重置 `trackEditRequest`（F4-9）。
- [x] `trackMenuFromPointer` 的注释与守卫粒度对齐：表单控件（含滑杆）一律留给浏览器（F4-10，不改行为）。
- **先红**：`music-immersive-context-menu.test.ts` 新增两例（沉浸层聚焦播放键后派发 `ContextMenu` 键 → 菜单为该曲目打开；队列行聚焦其移出按钮后 `Shift+F10` → 菜单为该行的曲目），对当前实现跑必红。
- **验收**：两例转绿；既有三个指针用例保持绿；`trackEditRequest` 在用例之间不残留。
- **范围**：`music-track-menu.tsx`、`music-immersive-player.tsx`、`music-queue-list.tsx`、`music-immersive-context-menu.test.ts`。

## P4-3 · 删掉随菜单上移而失去调用方的 `onEdit` 通道（F4-1）

- [x] 删 `TrackRowHandlers.onEdit`、`useTrackListActions` 的 `onEdit` 形参与返回项、`MusicTrackList` 的 `onEdit` prop、`HubCentre.onEditTrack` 与 `music-hub-modal.tsx:334` 的传参；同步约 10 个测试夹具。
- **先红**：无（删死代码不改变行为）。改前先取证：`grep -rn "handlers\.onEdit" src/` 只命中菜单自己的 prop；改后 `grep -rn "onEdit" src/client/features/music/` 只剩 `music-now-playing.tsx` 的 `onEditTags` 与菜单自己的 `onEdit`。
- **验收**：`npm run typecheck` ✅；音乐目录与设置目录单测全绿；`deep-imports:check` / `size:check`（基线可能因行数下降需要 `--update-baseline`）。
- **范围**：4 个源文件 + 测试夹具。

## P4-4 · 门禁的行操作读数按语义而不是容差（F4-4）

- [x] `readRowActionControls` 同时读「首行」与「首个非置顶行」；鼠标态断言拆成两条：非置顶行的置顶/收藏/菜单三个都藏，置顶行的置顶控件在、另两个藏。
- **验收**：`scripts/e2e-visual.mjs` 语法检查通过；整轮 `e2e-visual.mjs` 的音乐场景全绿（含改动后的这两条）。
- **范围**：`scripts/e2e-visual.mjs`。

## P4-5 · 删掉三个一次性探针（F4-5）

- [x] 删除 `grid-view.probe.mjs`、`music-menu.probe.mjs`、`touch-viewport.probe.mjs`（诊断过的问题现已在门禁里有正式断言）。
- **验收**：`git status` 不再有未跟踪探针；三个文件不在工作区。
- **范围**：3 个未跟踪文件。

## P4-6 · 卡片置顶态软底的理由落一行注释（F4-7）

- [x] `music-track-card.tsx` 的置顶 `IconButton` 上注明：卡片按钮压在封面上，所以用 overlay 底而不是 `active` 的 accent 软底（行内没有封面压力，走标准 `active` 外观）。
- **验收**：`comments:check` 通过（白名单同步）。
- **范围**：1 个源文件。

## P4-7 · 文档与数字回填（F4-6）

- [x] `review-with-freebuff-4.md`（本报告的定稿）、`plan-with-freebuff-4.md`（本文件的哈希回填与进度日志）。
- [x] `review-with-freebuff-3.md` 的收尾数字旁注明「续增到 651/0，见第四轮报告」（连同随手回填 `plan-with-freebuff-3.md` 里 M11 漏写的 `19bc5836`）。
- **验收**：三份文档的数字互不矛盾；`git status` 干净。
- **范围**：3 个文档。

## 验收标准（通用）

1. **行为**：每项都有可运行的验证——jsdom 用例（先红后绿，记录失败条数）或门禁几何断言（先复现红，再转绿）。
2. **门禁**：`npm run typecheck`、音乐/设置目录单测、11 项静态门禁、`npm run budget:check` 全绿；动了 `scripts/e2e-visual.mjs` 的条目要在全新实例上跑完整轮。
3. **规范**：改动最小化，不夹带无关重构；新注释进 `scripts/check-comments.mjs` 白名单（`node scripts/sync-comments-allowlist.mjs`）；行数/尺寸基线按需 `--update-baseline`。
4. **原子性**：一项一提交，提交前 `git status` 确认暂存区只有本项文件。`scripts/check-comments.mjs` 被多个批次共用时，按 AGENTS.md「分批与门禁」只暂存本批的 hunk（`git apply --cached --recount`），工作区停在最终状态。
5. **可访问性**：新交互必须键盘可达（F4-3 是本轮的重点）；改动控件后 `aria-pressed`/`aria-label` 与状态一致。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 复核（零提交）：读全量 diff + 全新实例整轮实测 | —（无提交，本报告即产出） | `typecheck` ✅；音乐目录 **123 文件 / 1027 例** ✅；`test:unit` **556 文件 / 5065 通过 + 1 跳过** ✅；11 项静态门禁 ✅；`budget:check` ✅；`e2e.mjs` **177/0** ✅；`e2e-visual.mjs` **650/0** ✅（上一轮 633/0，本轮净增 17 条） | 浏览器证据来自 `INKSTONE_EPHEMERAL_DEV=1` 的全新实例；在线音源仍靠请求拦截，沙箱到不了真实上游 |
| 2026-09-29 | P4-1 行内置顶与卡片同一套状态表达（先红后改） | `7c51b375` | 先红：`music-track-table.test.ts` 新增一例读行内 `aria-pressed`，对当前实现得 **1 failed / 22 passed**（属性为 `null`）。实现：`music-track-row.tsx` 的置顶控件传 `active={isPinned}`（`IconButton` 由它写 `aria-pressed`），去掉手写的 `text-[var(--warning)]`——与卡片、与全应用其它 `active` 控件一致。回归：该文件 **23 通过**，连同卡片文件 **29 通过**。`size:check` 记入一处基线（见「入库方式」） | 行内因此走「accent 软底 + accent 文字」，与卡片刻意不同（卡片按钮压在封面上，需要 overlay 底）；两者都注释在代码里（P4-6）。`check-contrast.mjs` 已按全部强调色量测「强调色作为文字落在自身软底」 |
| 2026-09-29 | P4-2 沉浸层与队列的曲目菜单键盘可达（先红后改，含 F4-9/F4-10） | `7c51b375` | 先红：`music-immersive-context-menu.test.ts` 新增两例（菜单键、`Shift+F10`）得 **2 failed / 4 passed**。实现：`music-track-menu.tsx` 新增 `trackMenuFromKey`（认两个键、交回是否已处理），沉浸层舞台与队列行各挂 `onKeyDown`（事件从已聚焦控件冒泡即可，不新增 Tab 停靠点）；队列行在已处理时 `stopPropagation`，免得外层替「正在播的那首」作答。同时：teardown 重置 `trackEditRequest`（F4-9），`trackMenuFromPointer` 的注释与「表单控件一律留给浏览器」的粒度对齐（F4-10，不改行为）。回归：该文件 **6 通过** | 指针与键盘共用同一条 `openTrackMenu` 请求，所以锚点不同（指针取坐标、键盘取元素中心）而菜单是同一个；锚点在 jsdom 里退化为 0 尺寸盒子，用例只钉曲目与「已处理」 |
| 2026-09-29 | P4-3 删掉失效的 `onEdit` 通道（无先红） | `7c51b375` | 无先红（删死代码不改行为）。改前取证：`grep -rn "handlers\.onEdit" src/` 只命中菜单自己的 prop；改后音乐目录里只剩 `music-now-playing.tsx` 的 `onEditTags` 与菜单自己的 `onEdit`。实现：删 `TrackRowHandlers.onEdit`、`useTrackListActions` 的形参与返回项、`MusicTrackList` 的 prop、`HubCentre.onEditTrack` 与其传参，并同步 9 个测试夹具。回归：`npm run typecheck` ✅；音乐 + 设置 **127 文件 / 1061 例** ✅ | HEAD 上 `handlers.onEdit` 本就空转，是同一根通道的前半截；本轮把后半截（列表 prop）也变成空转，所以整条一起删而不是留半截 |
| 2026-09-29 | P4-4 门禁的行操作读数按行读（先复现、后重做） | `7c51b375` | 先复现（两次，在真实实例上）：① 原读数取到的是**整个对话框**——`MUSIC_HUB_ROOT` 是选择器列表，逗号后的后代组合子只作用于最后一个分支，实测对「一行」报出 `found: 8`（`更多操作 ×3 / 置顶 ×2 / 收藏 ×2 / 取消置顶 ×1`），而真行是 3 个（含两向收藏标签后）；`sweptRowsForReveal` 的「有没有行」判定同样被这个 bug 满足。② 标签表只收「收藏」一个方向，而夹具曲目在同一场景更早的卡片读数里已被按下收藏，于是 `found` 只数到 2。重做：行由 `closest` 取得 + 新增 `hubRowCount`、标签收两向（新增 `LABELS.musicUnfavorite`）、读数前 `parkPointer` 把指针移开行、断言改按「哪个控件」而不是「几个控件」（已收藏的行也会把收藏留着，与置顶同一条规则）。回归：端到端整轮 `e2e-visual.mjs` **651/0**（同一实例修前 650/0；净 +1 条 = 那一条容差断言按语义拆成两条），`e2e.mjs` **177/0** | 断言按成员判定而非计数，是为了不把「本场景更早留下的收藏状态」当成揭示规则；两条断言的名字也改成它们真正在断言的东西 |
| 2026-09-29 | P4-5 删掉三个一次性探针 | —（未跟踪文件，无提交） | `rm` 后 `git status` 不含 `grid-view.probe.mjs` / `music-menu.probe.mjs` / `touch-viewport.probe.mjs`；它们诊断的三件事现在都有正式门禁断言 | 未跟踪文件不进历史，所以这一项没有对应 commit（也不该有） |
| 2026-09-29 | P4-6 卡片置顶态软底的理由落注释 | `7c51b375` | `comments:check` ✅（白名单同步重建）。注释写清：卡片的置顶保留 overlay 底是有意，行内走标准 `active` 外观 | 无行为变化 |
| 2026-09-29 | P4-7 文档与数字回填 | `ee14a1cf`（定稿提交；本行原写 `本提交`，由紧接着这次的一行回填补上，同第三轮 `52d7566d` 的做法） | 本文件 + `review-with-freebuff-4.md` 定稿；`review-with-freebuff-3.md` 的收尾数字旁注明「续增到 651，最新以第四轮为准」；顺手回填 `plan-with-freebuff-3.md` 里 M11 那条**上一轮漏回填**的 `待回填`（进度日志同一文件第 114 行已记 `19bc5836`，属可核对的回填而非猜测）。本提交只带本轮文档与上述两处回填 hunk，不含工作区里另一位作者对五份文档的头部链接改动的 hunk（按 AGENTS.md「分批与门禁」只暂存本批 hunk） | 三份文档的数字此后以第四轮的整轮实测为准；行数/断言数均以 `e2e-visual.mjs` 651/0 为准 |

**入库方式（本轮）**：工作区里的这一轮改动（沉浸层/队列曲目菜单、粗指针行操作、序号与置顶）与本次复核的修复**落在同一个提交**（`7c51b375`），因为两者在同一批函数里逐 hunk 交错：`music-immersive-player.tsx` 的 import 段同时带着该轮的重构改写与本次的 `trackMenuFromKey`、`music-track-card.tsx` 的置顶控件、`music-track-menu.tsx` 的指针函数区、`scripts/e2e-visual.mjs` 的音乐场景函数都是同一段代码的前后两半。按 AGENTS.md「分批与门禁」，要拆开就得手工切分**不是本次作者写的**那些 hunk，从而在工作区里造出一个只存在于补丁里的中间态——那正是规范点名要避免的事。因此本轮**一项一提交不成立**，如实登记；提交正文按 AGENTS.md 的逐文件格式写清每一项的落点，逐项的先红证据留在本表。
