# 音乐库整改执行计划（第三轮 · Freebuff · 2026-09-28）

> 依据：`docs/improvement/music/review-with-freebuff-3.md`（三次复审报告：20 项 + otter-music 对标 + 全量纳入决定）。
> 分支：`dev` 直接逐项提交。约定与前两轮一致：每个条目 = 一个原子提交；先写能失败的复现测试（jsdom / worker 契约 / 门禁几何）；实现后跑回归再提交。
> **没有「本轮之外」分桶**：报告里登记的每一项都在下表里，逐条做。唯一不进表的是**规范红线项**（`AGENTS.md` 铁律 1 不允许降级的那一类，例如把第三方平台 Cookie 存进本系统），它们不是「本轮不做」，而是按规范禁止，理由写在 review §H。
> **每次提交都必须更新本文件**（勾选、commit 短哈希、进度日志一行）；发现新问题或结论变化时同步更新 review 文档；批次末一次 `docs(music)` 提交统一回填短哈希。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 门禁备注：新增 / 修改注释后必须 `node scripts/sync-comments-allowlist.mjs`（双向失败）；UI 与几何改动跑 `scripts/e2e-visual.mjs` / `npm run contrast:check`（实例：`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`，需要 `INKSTONE_CHROME_PATH`）；`git add` 只列本次文件，不用 `-A`。
> hash 回填约定：提交无法写入自己的短哈希，因此每条进度行的 hash 在**下一个提交**里回填。

## M0 · 文档基线

- [x] M0 写入 `review-with-freebuff-3.md`（20 项 + 对标 + 全量纳入）与 `plan-with-freebuff-3.md`（本跟踪表）—— **commit `6bb60132`**
- [x] M0b 按「全做」重写两份文档：取消「本轮之外 / 登记不做」分桶，把 FB3-F2/F4/F6/F7/F8/U7 全部纳入下表并排出批次 —— **commit `c59a3e5e`（报告）+ `6bb60132` 基础上**（计划文档的重写随 `c59a3e5e` 之后的第一批一并入库）

## M① · 点名症状（P0）

- [x] M1 FB3-U1 + FB3-U5 + FB3-C1 搜索框 × 不清查询（`clearAll` 语义错）→ 清查询（新增 `clearQuery`，与历史的 `clearAll` 分开）+ 焦点留在输入框；门禁新增 `assertMusicSearchClear` 四条（空态与筛选 / × 清查询且列表回来 / 焦点与历史未被触碰 / 弹出动作只清历史）—— **commit `75dec251`**
- [x] M2 FB3-U2 + FB3-U9 + FB3-C3 沉浸层队列默认态按形态分档（宽版默认展开、窄版默认折叠；读者按压后按读者的）+ 门禁补「队列至少一整行可见且左列不长出第二个滚动条」「375px 条带整行可见、歌词列不套第二滚动条」—— **commit `6ade04bc`**
- [x] M3 FB3-U3 + FB3-C2 设置面板三处：EQ 预设行容器查询换挡（`@sm:grid-cols-5`）、服务器表单标签列 subgrid 对齐、去掉重复说明并拆出动作向的表单说明（`music.server_form_hint`）—— **commit `958f5cdc`**
- [x] M1b 浏览器探针实测发现并修掉的一处：× 之后弹出没打开（`clearQuery` 显式 `setOpen(true)`）+ M1 门禁里的两处标签错误 —— **commit `958f5cdc`（混入 M3，见下「入库方式」）**
- [ ] M16（新增）FB3-C5 门禁自身：全新实例上音乐场景因客户端 60s 库缓存空读而提前返回，需在读数前强制一次库刷新（本轮只登记与取证，见下「浏览器实测」）

## M② · 信息与历史（P1）

- [ ] M4 FB3-U4 + FB3-U8 查询态空态改为「曲库中没有匹配的歌曲」并指向在线结果；空态动作文案与 × 区分
- [ ] M5 FB3-F5 搜索历史完整度：逐条删除 + 记录时机（提交落库、点历史项也算）+ 空态后仍能清历史

## M③ · 在线音源（P1 / P2）

- [ ] M6 FB3-F1 + FB3-U6 + FB3-S1 单源检索范围：偏好 `providerScope`（白名单校验）+ 面板同排的范围选择器 + 只扇出选中源 + 契约测试（非法取值按未传入、不放宽出站白名单）
- [ ] M7 FB3-P1 检索成本：按 `(scope, keywords)` 的会话内短 TTL 记忆，改回一个字再改回来不再重新扇出
- [ ] M8 FB3-F2 逐源开关与顺序：设置页逐源开关 + 排序（聚合顺序同时被「合并顺序」与「换源候选」消费）
- [ ] M9 FB3-F8 在线检索建议：在线命中与本地建议并列呈现（优先给「已经在你库里/可直达的源」分组），不引入第三方接口

## M④ · 设置项补缺（P2）

- [ ] M10 FB3-F3 设置页补「音量」滑杆与睡眠 / 倍速入口（复用既有组件，不新造）
- [ ] M11 FB3-F4 下载设置：离线补齐音质选择 + 「嵌入封面/歌词」选项（含浏览器侧封装的技术选型与降级说明）
- [ ] M12 FB3-F6 设置页分组顺序：播放默认前置（服务器组后置），并补一条顺序断言

## M⑤ · 体验收尾（P3）

- [ ] M13 FB3-F7 为「最近播放 / 失效行」补一键在线补齐（复用 `openSourceSwitch` 与健康扫描的既有能力）
- [ ] M14 FB3-U7 沉浸层左列两行「多少」的行为分级复核（随 M2 的形态断言一起读）
- [ ] M15 报告定稿：逐项状态 + 已知限制 + 全量清单回填哈希

## 本轮交付状态（2026-09-28 收尾）

**已交付并验证**：M0 / M0b（文档）、M1 / M1b（搜索框清除按钮与历史形态）、M2（沉浸层队列默认态分档）、M3（设置页三处 UI）。四类证据齐备：jsdom 先红后绿（逐项有失败条数）、`npm run typecheck`、13 项静态门禁与 pre-commit 钩子（typecheck + vitest related）、以及浏览器实测（见下）。

**尚未开始**：M4–M14（内容与历史、在线音源粒度、设置项补缺、体验收尾）与 M16（门禁自身的 FB3-C5）。它们仍是本计划的待办项，逐条顺序与验收标准不变；本轮未动的原因只有一个——时间预算（每一项都要求「先红后绿 + 门禁」两轮验证，而单次 pre-commit 钩子在音乐相关文件上要跑 ~3 分钟，完整 `test:unit` ~7 分钟），不是结论改变或降级。

**入库方式**：`958f5cdc` 同时带上了 M3 与 M1b 的改动（M1b 的两个文件在先前一次被 i18n 门禁拦下的提交尝试里已进暂存区，而这次用了 pathspec 提交，于是它们跟着 M3 一起落库）。结果是对的、可追溯的（提交说明里写清了 M1b 的探针结论），但不符合「一项一提交」。按铁律不重写已提交历史，这里如实登记；后续条目仍按一项一提交，提交前先 `git status` 确认暂存区干净。

## 浏览器实测（M1b/M2/M3 的几何证据）

全新实例（`INKSTONE_EPHEMERAL_DEV=1` + `scripts/e2e.mjs` 播种）上一次浏览器探针的读数（读法与门禁里新增的场景完全相同；探针为一次性工具，已删除）：

| 项 | 读数 |
| --- | --- |
| FB3-U3 预设行 | `presets: 5, presetRows: 1, presetWidth: 128` |
| FB3-U3 表单对齐 | `fields: 5, lefts: [536, 873, 536, 873, 536], aligned: true` |
| FB3-U1 空态 | `value: 'zzzz no such track', library: false, emptyAction: true` |
| FB3-U1 × 清查询 | `pressed: true, value: '', library: true, emptyAction: false` |
| FB3-U1/U5 历史未被触碰 | `caretInBox: true, listboxes: ['搜索历史:1'], historyRows: 1` |
| FB3-U1 弹出动作只清历史 | `pressed: true, listboxes: [], historyRows: 0, value: ''` |
| FB3-U2 宽版队列默认就位 | `host: 'artwork', search: true, rows: 8` |
| FB3-U9 整行与滚动条 | `wholeRows: 8, artworkScrolls: false` |

**探针同时量出门禁本身的一个缺陷（FB3-C5）**：整轮 `scripts/e2e-visual.mjs` 在全新实例上会在「music: the hub lists the seeded tracks」提前返回——夹具刚上传的两条探针曲目，客户端因为 `LIBRARY_FRESH_MS = 60s` 的库缓存（早于上传的一次加载）而看不到，于是该轮音乐场景（含本轮新增的断言）全部未执行。既有各轮之所以绿，是因为它们跑在积留了探针曲目的长寿命实例上。修法（下一轮首选）：在读数前让门禁按自己的刷新控件强制一次库加载，或让夹具在客户端首次加载前完成上传。

## 每项验收标准（通用）

1. 复现测试先红（新增 / 修改 `src/client/features/music/*.test.ts`、`src/worker/routes/music/*.test.ts` 或 `tests/*.test.ts`；几何与默认态类由 `scripts/e2e-visual.mjs` 先红），进度日志里写下失败条数与原因。
2. 实现后：定向测试绿 + `npm run test:unit` 绿 + `npm run typecheck` 绿 + 静态门禁 13 项绿（`style:check`、`size:check`、`comments:check`、`escape:check`、`empty-catch:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`vendor:check`、`budget:check`）。
3. UI / 几何 / 对比度改动：`scripts/e2e-visual.mjs` + `npm run contrast:check` 对本地实例全绿（不可跑时如实写「已知限制」并保留待补跑标记）。
4. **几何类铁律**：任何用户可拖动 / 缩放 / 定位 / 布局 / 默认态的能力，验收必须含一条真实浏览器断言，jsdom 断言 store **不算**验收。
5. 新用户可见文案双语（`npm run i18n:check`）；不夹带无关重构 / 格式化（铁律 14）。
6. 每次提交都更新本文件；短哈希在下一个提交回填。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-28 | M3 FB3-U3 + FB3-C2 设置面板三处（先红后改） | `958f5cdc` | 先红（单测）：`music-settings.test.ts` 新增两例（服务器说明只出现一次且表单换成动作向的说明 / 五个字段共用一组标签列）+ `music-eq-presets.test.ts` 新增一例（预设行向自身容器换挡），对 HEAD 跑得 **3 failed**。实现：`MusicEqPanel` 根加 `@container`、预设行加 `@sm:grid-cols-5`（弹层 224px 仍是三列）；`ServerFields` 改 `grid-cols-[auto_1fr_auto_1fr]` 且每个字段 `col-span-2 grid-cols-subgrid`（标签列由整个表单共有，不再各自量字）；表单去掉与小节重复的那句 `music.server_hint`、改为新增的 `music.server_form_hint`（双语），并去掉与按钮同名的表单小标题。回归：`npx vitest run src/client/features/settings src/client/features/music/music-eq-presets.test.ts` **5 文件 / 29 例 ✅**；`npm run typecheck` ✅。门禁：新增 `assertMusicSettingsLayout`（五个预设同一顶边 / 五个字段的两列左缘各对齐）+ `LABELS.musicEqPresets` | 门禁场景本身随 FB3-C5（全新实例上的音乐空读）尚不能在整轮里跑到，实测证据来自同读法的浏览器探针（见下） |
| 2026-09-28 | M1b 探针实测修掉的一处：× 之后弹出没打开 | `958f5cdc` | 浏览器探针首次跑出：点完 × 后弹出是关的（`historyRows: 0`）——因为「提交搜索」的 Enter 已经把弹出收起来（`close()`），而按下 × 在 Chrome 里 `activeElement` 仍是输入框（按钮不取焦），于是 `onFocus` 不再触发，仅靠交回焦点恢复不了历史形态。实现：`clearQuery` 显式 `setOpen(true)`（“清空后回到历史形态”不再依赖焦点事件）。同时修掉 M1 门禁里的两处标签错误（`musicSearchHistory` 不存在、`search_clear_history` 的中文是「清空历史」）。探针重跑 **13/13 全绿** | 代码层修正，jsdom 用例本来就绿（jsdom 会移焦，所以旧机制在那里看起来是对的） |
| 2026-09-28 | M2 FB3-U2 + FB3-U9 + FB3-C3 沉浸层队列默认态分档（先红后改） | `6ade04bc` | 先红（单测）：`music-immersive-queue.test.ts` 新增 FB3-U2 组三例（宽版刚挂载即已在封面列且带搜索 / 堆叠形状仍默认折叠且入口行在位 / 读者折合后重渲染仍保持），对 HEAD 跑得 **4 failed / 2 passed**（连同两个按旧默认写的既有用例）。实现：`useQueueFold(stacked)` 用 `chosen: boolean | null` 表示「读者还没选」，未选时按形状给默认（`!stacked`），调用点改为 `useQueueFold(stacked)`。`music-immersive-player.test.ts` 的四处按旧默认更新（队列焦点停靠改为「宽版默认出场、折合后消失」；看板视频舞台的「无封面图」改为排除队列自己的行封面）。回归：`npx vitest run src/client/features/music` **120 文件 / 958 例 ✅**。门禁：`assertMusicImmersiveQueue` 重写为「宽版就位（已开）/ 整行可见且左列不长出第二滚动条 / 折合 / 头部高度不变 / 封面让位 / 搜索收窄 / 用过后再折合」，`readNarrowQueue` 补 `rows` 与 `lyricsScrolls`，375px 场景补一条 | 门禁未跑（与 M1/M3 一起在同一实例上跑一次）；「窄版默认折叠」在门禁里读不到纯粹的默认态（折合状态随表面存活，先前的宽版场景已经写过一次），因此该默认由 jsdom 的新挂载用例钉住，门禁只断言窄版折合后的行为与成本 |
| 2026-09-28 | M1 FB3-U1 + FB3-U5 + FB3-C1 搜索框 × 清查询（先红后改） | `75dec251` | 先红（单测）：`music-search-box.test.ts` 新增 3 例（× 清空输入与 store 查询且不动历史 / 清空后焦点仍在输入框并回到历史形态 / 弹出里的动作仍只清历史），对 HEAD 跑得 **2 failed / 15 passed**——× 走的是 `clearAll`（清历史），输入框文本与 store 查询都没动。实现：`useSearchPopup` 新增 `clearQuery`（`setText('')` + `flush('')` + 收起高亮），`SearchBox` 给输入框持有 ref 并在 × 后把焦点交回。回归：`npx vitest run src/client/features/music` **120 文件 / 955 例 ✅**；`npm run typecheck` ✅。门禁：新增 `assertMusicSearchClear`（四读：无命中即空态 / × 清查询且列表回来 / 焦点在框内且历史未被触碰 / 弹出动作只清历史），`LABELS` 补 `musicSearchClearHistory` 与 `musicSearchEmptyAction` | 门禁四条断言与 M2/M3 的门禁改动一并跑（同一实例一次运行），结果记在 M3 的进度行；只跑单测时这四条未被执行 |
| 2026-09-28 | M0b 按「全做」重写两份文档 | `c59a3e5e` | —（无代码改动） | — |
| 2026-09-28 | M0 文档基线（三次复审报告 + 执行计划） | `6bb60132` | —（无代码改动） | 报告中的对标结论以参考项目源码/README 为据，未运行参考项目 |
