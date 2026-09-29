# 音乐库整改执行计划 · 第五轮（Freebuff · 2026-09-29）

> 依据：`docs/improvement/music/review-with-freebuff-5.md`（用户点名的三件事的核对 + 走查新登记的 7 项）。
> 参考项目：本机 `/home/kubuntu/projects/reference/otter-music`（上游 `https://github.com/DJChanahCJD/otter-music`），部署后的实例 `https://otter-music.pages.dev`。
> 上一轮 `plan-with-freebuff-4.md`（P4-1…P4-7）已全部交付并收束（`7c51b375` / `ee14a1cf` / `1a1d2dc3` / `46c2e231`）；本轮接着它的状态继续，不改写已提交历史。
> 分支：`dev`；约定与前几轮一致：每个条目 = 一个原子提交；**先写能失败的复现测试**（jsdom / 门禁断言），实现后跑回归再提交；**每次提交都更新本文件**（勾选 + commit 短哈希 + 进度日志一行）。
> **没有「本轮之外」分桶**：报告里登记的 7 项全部进表；F5-6 是「登记 + 不改」的收口（理由写在报告里），F5-7 初判相同、收口时改为已回填（见 P5-7）。

## 状态图例

`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）

## P5-1 · 行内的两个开关收进同一个组件，收藏补齐状态（F5-1，用户点名的第 1 件）

- [x] 抽出 `RowToggle`（`music-track-row.tsx:315`）：`active` → `aria-pressed` + 激活时常驻；置顶与收藏都经它渲染，行内收藏去掉手写的 `text-[var(--accent)]`。
- **先红**：`music-track-table.test.ts` 新增两例（收藏控件报 `aria-pressed`；收藏的行静止时仍画出来），对旧实现得 **1 failed / 24 passed**。
- **验收**：该文件 25 例全绿（连同卡片 34 例）；`row` 内两个开关的类名与状态表达一致；对比度沿用「强调色作为文字落在自身软底」（`check-contrast.mjs` 已按全部强调色量测）。
- **范围**：`music-track-row.tsx`、`music-track-table.test.ts`。

## P5-2 · 共享曲目菜单补 transport（F5-2，用户点名的第 3 件）

- [x] `baseMenuItems` 首位加 `playback`（`music-track-menu.tsx:190-197`）：开在正在播的那一首上是「暂停」并调 `togglePlay()`，开在别的曲目上是「播放」并调 `playTrack(id)`。
- [x] 门禁在沉浸层那一遍按**精确文本**断言它（`scripts/e2e-visual.mjs:5509`，`===` 而不是 `includes`，免得「播放全部」冒充）。
- **先红**：`music-track-menu.test.ts` 新增两例，对旧实现得 **2 failed / 17 passed**。
- **验收**：该文件 19 例全绿；整轮 `e2e-visual.mjs` 的音乐场景全绿（含新断言）。
- **范围**：`music-track-menu.tsx`、`music-track-menu.test.ts`、`scripts/e2e-visual.mjs`。

## P5-3 · 参考项目与部署实例的出处（用户点名的第 2 件）

- [x] `src/shared/constants.ts:10-11` 新增两个具名常量（与 `GITHUB_REPOSITORY_URL` 同处）。
- [x] 「设置 → 关于」新增「音乐库参考项目 / otter-music」一行，两个链接（上游仓库、部署实例），文案进两语言资源（`settings.music_library_reference*`、`settings.reference_*`）。
- [x] 第五轮的两份文档头部写明同一个出处（本机路径 + 上游 + 部署实例）。
- **验收**：`npm run i18n:check` ✅（两语言键一致）；`npm run hardcoded:check` ✅（JS 字符串里 `--text-11\.5` 的转义按门禁要求，改用与页脚同样的 JSX 属性写法）；在真实实例上打开「设置 → 关于」读一遍（见进度日志）。
- **范围**：`src/shared/constants.ts`、`src/shared/locales/{en-US,zh-CN}/settings-3.ts`、`src/client/features/settings/about-settings.tsx`、两份文档。
- **说明**：工作区里另一位作者对 5 份文档头部的同类改动**不在本提交内**（不是我的 hunk，按 AGENTS.md「分批与门禁」只暂存本批 hunk）。

## P5-4 · 歌单的收藏与置顶要有入口（F5-3）

- [x] `setPlaylistFlags`（`library-collections.ts:161`）经既有 PATCH 路由写两个标志，并按服务端同一条规则在本地重排（`is_pinned` 优先，稳定排序）。
- [x] store 契约与切片接线（`types.ts:370`、`library.ts:22,64,120`）。
- [x] 歌单行菜单加两项（`music-hub-playlists.tsx:152-153`），标签随状态在「收藏/取消收藏」「置顶/取消置顶」之间翻。
- **先红**：`music-hub-playlists.test.ts` 新增三例，对旧实现得 **3 failed / 10 passed**。
- **验收**：该文件 13 例全绿；`music-store/library-collections.test.ts` 23 例全绿（含重排与失败路径三例）；`typecheck` ✅。
- **范围**：`music-store/{types,library-collections,library}.ts`、`music-hub-playlists.tsx`、两个测试文件。

## P5-5 · 迷你播放器补齐置顶（F5-4、F5-5）

- [x] `FloatTrack` 补一枚置顶 `IconButton`（`music-floating-player.tsx:208-215`），与心同尺寸、同 `active`。
- [x] 歌单的置顶徽标补 `fill-current`（`music-hub-playlists.tsx:261`），与曲目行/卡片同一种画法。—— 这一处在 `music-hub-playlists.tsx` 里，与 P5-4 的菜单两项同文件、同一批 hunk，因此**随 P5-4 的提交入库**（按 AGENTS.md「分批与门禁」，一个文件的注释白名单块也是一个批次）。
- **先红**：`music-floating-player.test.ts` 新增两例，对旧实现得 **2 failed / 7 passed**。
- **验收**：该文件 9 例全绿；音乐目录全绿。
- **范围**：`music-floating-player.tsx`、`music-floating-player.test.ts`（徽标那半截的范围见上，落在 P5-4 的提交里）。

## P5-6 · 文档与回填（F5-6、F5-7 的登记落纸）

- [x] `review-with-freebuff-5.md`（本轮的复核与台账）、`plan-with-freebuff-5.md`（本文件）。
- [x] 在报告里登记「队列行没有常驻收藏/置顶」（F5-6：不改，理由见报告）与「`plan-with-freebuff-2.md` 的 5 处 `待回填`」（F5-7：初期同样登记）；F5-7 在收口时改为回填，见 P5-7。
- **验收**：两份文档的数字与整轮实测一致。

## P5-7 · 收口：回填第二轮执行计划遗留的五处哈希（F5-7 由「登记不改」改为「已回填」）

- [x] `plan-with-freebuff-2.md` 的进度日志里 M7…M11 五行的 `待回填` 换成真实短哈希：`e98cb077`（M7）、`522a5377`（M8）、`76e5d799`（M9）、`27c808b9`（M10）、`1ef010ad`（M11）。
- **取证方式**（逐条按「该行声称的改动 = 该提交的 diff」核对，不做猜测）：`git log --grep` 命中条目名后用 `git show --stat` 比对文件与日期（五个都是 2026-09-28）——M7 新建 `scripts/lib/music-provider-stub.mjs` 并改 `tests/music-provider.test.ts`；M8 改 `music-provider-results.tsx` 与其测试（含 `check-size` 基线）；M9 改 `music-search-box.tsx` 与其测试；M10 只在 `scripts/e2e-visual.mjs` 加 375px 队列断言；M11 改 `music-track-card.tsx` 与其测试。
- **先例**：第四轮已按同一口径回填过 `plan-with-freebuff-3.md:42` 的同类遗留（`review-with-freebuff-4.md` 有记），本条是同一个问题的第二处，因此口径照旧。
- **范围**：`plan-with-freebuff-2.md`，外加本轮的 `review-with-freebuff-5.md` / 本文件里对该条的收口记录。

## 验收标准（通用）

1. **行为**：每项都有可运行的验证——jsdom 用例（先红后绿，记录失败条数）或门禁断言（先复现、再转绿）。
2. **门禁**：`npm run typecheck`、`npx vitest run src/client/features/music`、11 项静态门禁、`npm run budget:check` 全绿；动了 `scripts/e2e-visual.mjs` 的条目要在**全新实例**上跑完整轮（`e2e.mjs` + `e2e-visual.mjs`）。
3. **规范**：改动最小化，不夹带无关重构；新注释进 `scripts/check-comments.mjs` 白名单（`node scripts/sync-comments-allowlist.mjs`）；行数基线按 `node scripts/check-size.mjs --update-baseline` 记档。
4. **原子性**：一项一提交，提交前确认暂存区只有本项文件。`scripts/check-comments.mjs` 被多个批次共用时，按 AGENTS.md「分批与门禁」只暂存本批的 hunk（`git apply --cached --recount`），工作区停在最终状态，并对暂存快照单独跑 `comments:check` / `size:check`。
5. **可访问性**：新交互必须键盘可达；开关必须报 `aria-pressed`（P5-1 是本轮的重点）。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 复核（真实实例上的 DOM 实测）：点名三件事的现状 | —（无提交，报告即产出） | 行内 6 个按钮、行操作 3 个；已收藏的行静止时画心、未置顶的行静止时什么都不画；沉浸层菜单已存在（门禁在断言）但无 transport | 用户的视图停在 `7c51b375` 之前，所以前两件的现象与现状不符 |
| 2026-09-29 | P5-1 行内两个开关同源（先红后改） | `5bd09635` | 先红：`music-track-table.test.ts` 新增「收藏控件报 `aria-pressed`」得 **1 failed / 24 passed**（属性为 `null`）。实现：抽出 `RowToggle`，置顶与收藏都经它渲染。回归：**3 文件 34 例** ✅ | 行内两个开关因此都走「强调软底 + 强调色文字」，与卡片不同（卡片按钮压在封面上，用 overlay 底，F4-7 已注释其理由）；`size:check` 因测试文件增长记入一处基线 |
| 2026-09-29 | P5-2 曲目菜单的 transport（先红后改） | `1b328bb9` | 先红：`music-track-menu.test.ts` 新增两例得 **2 failed / 17 passed**。实现：`playback` 项置首位，读 `queue[currentIndex]` 与 `isPlaying` 决定文案与动作。回归：该文件 **19 例** ✅；门禁新增一条精确文本断言 | 菜单全应用一份，所以这一项在行/卡片/队列/沉浸层同时出现；门禁只按沉浸层那一遍断言（其余表面共用同一个菜单实例） |
| 2026-09-29 | P5-3 参考项目与部署实例的出处 | `663e6715` | `i18n:check` ✅（**3830** 键两语言齐全）；`hardcoded:check` 先报 `about-settings.tsx:176` 的 `--text-11\.5` 转义（JS 字符串会被煮掉），改用与页脚同样的 JSX 属性写法后 ✅；`typecheck` ✅ | 本机绝对路径只写文档；界面只放两条公开 URL |
| 2026-09-29 | P5-4 歌单的收藏与置顶入口（先红后改）；同提交带上 P5-5 的徽标 `fill-current` | `895687f5` | 先红：`music-hub-playlists.test.ts` 新增三例得 **3 failed / 10 passed**。实现：`setPlaylistFlags` + 菜单两项 + 本地按服务端规则稳定重排。回归：该文件 **13 例** ✅、`library-collections.test.ts` **23 例** ✅（新增三例覆盖重排、只改收藏、服务端拒绝） | 重排只做「置顶优先」这一级，与 `ORDER BY is_pinned DESC, sort_order ASC` 同义；同一组内保持服务端给的顺序（稳定排序） |
| 2026-09-29 | P5-5 迷你播放器补齐置顶（先红后改） | `2c666e15` | 先红：`music-floating-player.test.ts` 新增两例得 **2 failed / 7 passed**。实现：`FloatTrack` 补一枚置顶（与心同尺寸、同 `active`）；歌单的置顶徽标补 `fill-current`。回归：该文件 **9 例** ✅ | 卡片宽度不变（两枚 12px 图标并排），已在窄档实测 |
| 2026-09-29 | P5-6 文档与登记 | `c63f8134`（定稿提交；本行原写 `本提交`，由紧接着这次的一行回填补上，同第四轮 P4-7 的做法） | 两份文档落纸；F5-6（队列行没有常驻开关）与 F5-7（`plan-with-freebuff-2.md` 的 5 处 `待回填`）先按「登记不改」写入 | F5-6 是明确的「本轮不做」；F5-7 随后由 P5-7 补做，不再是遗留 |
| 2026-09-29 | P5-7 收口：回填第二轮执行计划遗留的五处哈希 | `131d070d`（本行原写 `本提交`，由紧接着这次的一行回填） | `git show --stat` 逐条核对五个提交的文件与日期（均 2026-09-28），五处 `待回填` 全部换成真实短哈希；`grep -rn 待回填 docs/` 此后只剩说明性文字，无占位符 | 属可核对的回填而非猜测（同第四轮回填 `plan-with-freebuff-3.md:42` 的口径）；改的是第二轮的历史文档，故单独一个提交，不并入第五轮的代码提交 |

**入库方式（本轮）**：本轮 7 项（P5-1…P5-7）各自一个原子提交，`scripts/check-comments.mjs` 的白名单按文件块逐提交暂存（`git apply --cached`），工作区始终停在最终状态；每个提交的暂存快照另用 `git archive HEAD` + 暂存版本单独跑过 `comments:check` 与 `size:check`。
