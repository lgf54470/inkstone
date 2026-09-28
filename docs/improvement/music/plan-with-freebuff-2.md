# 音乐库整改执行计划（第二轮 · Freebuff · 2026-09-28）

> 依据：`docs/improvement/music/review-with-freebuff-2.md`（二次复审报告，14 项 + 三重盲区结论）。
> 分支：`dev` 直接逐项提交。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**（jsdom 契约 / worker 契约 / 收集器纯函数契约；几何与视觉类由浏览器门禁先红），实现后跑回归再提交。
> **每次提交都必须更新本文件**（勾选、commit 短哈希、进度日志一行）；发现新问题或结论变化时同步更新 review 文档；批次末一次 `docs(music)` 提交统一回填短哈希。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 门禁备注：新增 / 修改注释后必须 `node scripts/sync-comments-allowlist.mjs`（双向失败）；UI 与几何改动用 `scripts/e2e-visual.mjs` / `scripts/check-contrast.mjs`（`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` + `INKSTONE_CHROME_PATH`）；`git add` 只列本次文件，不用 `-A`。
> hash 回填约定：提交无法写入自己的短哈希，因此每条进度行的 hash 在**下一个提交**里回填（每次提交都更新本文件不变）。

## M0 · 文档基线

- [x] M0 写入 `review-with-freebuff-2.md`（完整报告：三重盲区结论 + 14 项清单 + 对标缺口 + 门禁缺口）与 `plan-with-freebuff-2.md`（本跟踪表）—— **commit `76eaf07c`**

## M① · P0 可用性

- [x] M1 FB2-F1 + FB2-F4 在线导入改由 worker 自取封面与歌词（body 只留元数据 + `coverId`/`lyricId`；`storeCoverBytes`；`resolveProviderLyric`/`resolveProviderCoverBytes`；换源候选同改）—— **commit `a95728f8`**
- [x] M2 FB2-F2 文件夹上传去掉 `webkitdirectory` 与原生确认框（递归拖放收集器 + `showDirectoryPicker` + 诚实降级）—— **commit `0bb7aaa9`**

## M② · 布局与信息

- [x] M3 FB2-U2 工具栏：先量后改（zh 674/738/1197、en 819/883/1357 内容盒实测），阈值改 840/900/1400 + 行由声明而非换行产生（`data-music-row`）+ 溢出行并入搜索行 + 门禁补中间档位与右缘贴合断言 —— **commit `待回填`**
- [x] M4 FB2-U1 沉浸层：播放队列搬到左列并复用带搜索的 `MusicQueueBrowser`（头部计数即开关；窄版保留底部条带；队列组件拆到 `music-immersive-queue.tsx`）—— **commit `待回填`**
- [x] M5 FB2-F3 时长口径：命中列表不再逐行重复「未知」（首次播放回填经取证**早已存在**，首稿误记为缺失，已订正）—— **commit `待回填`**
- [x] M6 FB2-PF1 封面抓取独立预算族（`providerArtwork` 600/小时；浏览器侧不加缓存层，理由已取证）—— **commit `待回填`**
- [ ] M7 FB2-C1 + FB2-C2 在线搜索 / 导入链路纳入浏览器门禁（请求拦截造桩）+ body 形状契约测试
- [ ] M8 FB2-U3 + FB2-U4 在线行三态（试听中 / 添加中 / 已在库中）+ 面板高度与嵌套滚动

## M④ · 复核与收尾

- [ ] M9 FB2-U6 窄版沉浸层复核（+ FB2-U5 侧栏留白判断后做或记理由不做）
- [ ] M10 FB2-C3 曲库面 axe 前提：徽标底衬可量测，或按表面具名声明该 incomplete（含 M7 不得把带封面的行留在共享实例）
- [ ] M11 收尾：报告定稿（逐项状态 + 已知限制 + 不做清单）+ 计划回填全部哈希
- [ ] M12（可选、独立、非音乐）FB2-F2b 备份文件夹还原复用同一个收集器

## 每项验收标准（通用）

1. 复现测试先红（新增 / 修改 `src/client/features/music/*.test.ts`、`src/worker/routes/music/*.test.ts` 或 `tests/*.test.ts`；几何与视觉类由 `scripts/e2e-visual.mjs` 先红），进度日志里写下失败条数与原因。
2. 实现后：定向测试绿 + `npm run test:unit` 绿 + `npm run typecheck` 绿 + 静态门禁 13 项绿（`style:check`、`size:check`、`comments:check`、`escape:check`、`empty-catch:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`vendor:check`、`budget:check`）。
3. UI / 几何 / 对比度改动：`scripts/e2e-visual.mjs` + `npm run contrast:check` 对 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` 实例全绿（不可跑时如实写「已知限制」并保留待补跑标记）。
4. **几何类铁律**：任何用户可拖动 / 缩放 / 定位 / 布局的能力，验收必须含一条真实浏览器断言，jsdom 断言 store **不算**验收。
5. 新用户可见文案双语（`npm run i18n:check`）；不夹带无关重构 / 格式化（铁律 14）。
6. 每次提交都更新本文件；短哈希在下一个提交回填。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-28 | M0 文档基线（二次复审报告 + 执行计划） | `76eaf07c` | —（无代码改动，静态门禁与单测不适用） | 报告结论均落到文件:行或实测量；浏览器门禁在 M1 起逐项补跑 |
| 2026-09-28 | M2 FB2-F2 文件夹上传不再触发浏览器原生确认框 | `0bb7aaa9` | 先红（单测）：新建 `music-folder-drop.test.ts` 10 例（嵌套目录按批读完 / 浏览器拒读的条目跳过并计数 / 深度上限两侧 / 文件数上限 / 无 entry API 时回退到文件列表 / 拖放里的文本条目被忽略 / picker 只在有它的浏览器可见 / 句柄走同一套上限 / 关闭选择器不算失败），并把 `music-transfer-dialog.test.ts` 旧断言（`input[webkitdirectory]` 必须存在）改成相反的事实——实现前两文件 **3 failed**（新模块不存在、旧实现仍画目录 input、无 picker 时仍画文件夹按钮）。实现后：两文件 **19 例 ✅**；music + `worker/routes/music` + 音乐跨模块 **132 文件 / 1123 例 ✅**；`npm run typecheck` ✅；13 项静态门禁 ✅（size 先报新测试的 describe 过长，把 `mountPicker`/`folderButton` 提到模块级并拆出第二个 describe 后未动基线；escape 先报 `as unknown as`，改成一个窄的 `DirectoryPickerWindow` 类型；comments 白名单同步 10784 条 / 1192 文件）；`npm run build` ✅ + `budget:check` exit 0；`scripts/e2e-visual.mjs` 对 :7714 **583 通过 / 1 失败**（580 → 583 即本轮新增三条：上传入口打开传输面板 / 面板里没有目录 input 且只有一个文件 input / 文件夹门只在浏览器有 picker 时出现；唯一失败仍是已登记的看板高度遗留），`npm run contrast:check` 未跑（本轮无颜色或层级改动，M3/M4 的布局改动处一并复跑） | **一个收集器两扇门**：拖放走 `DataTransferItem.webkitGetAsEntry()` 递归（`readEntries` 按批读到空为止），「选择文件夹」走 Chromium 的 `showDirectoryPicker()` 并把句柄适配成同一个 entry 形状，所以深度/数量上限与「跳过了多少」在两扇门上不可能漂移。**上限是给家庭目录的**：深度 8 层、500 个文件，被拦下的都计数并通过已有的 `music.upload_skipped_count` 报出。**降级是诚实的**：`showDirectoryPicker` 不存在时按钮隐藏，提示文案补上「或整个文件夹拖进来」。**浏览器断言选错了 dialog 的修正**：Hub 工具栏自己带一个 m3u 的 file input，而断言原来取「第一个带 file input 的 dialog」，实际量到的是 Hub；改为按面板自己的标题定位（先用临时探针确认了应用侧本来就画出了「选择文件夹」且目录 input 为 0） | 真实拖放无法在门禁里构造 `DataTransfer` 的 entry 列表，所以拖放路径只有收集器纯函数这一层覆盖，浏览器只断言「不存在目录 input」与「文件夹门的存在与 picker 一致」；Firefox/Safari 上没有「选择文件夹」按钮（只保留拖放），这条差异写在文案里而不是假装跨浏览器一致。**一次运行记录**：同一命令第一次跑时 `surface keyboard: the kanban board hands focus back…` 失败、第二次通过，该断言位于工具栏扫描（在音乐场景之前），与本次改动无交集，判定为该表面既有几何竞态（与已登记的看板高度缺陷同源），已如实记下未做降级 |
| 2026-09-28 | M1 FB2-F1 + FB2-F4 在线导入改由 worker 自取封面与歌词 | `a95728f8` | 先红（单测）：worker `tests/music-provider.test.ts` 新增 3 例（歌词由 worker 解析而不接受 body 传入 / 退休字段 `coverDataUrl`・`lyric` 被拒 / 封面由 worker 抓取并按派生键落库且向上游要 `size=300`），客户端 `music-store/providers.test.ts` 新增 3 例（请求体带 `coverId`/`lyricId` 且不含 `coverDataUrl`/`lyric`、不再调用 `providerLyric` / 无 ids 的命中照样入库 / 换源候选带 ids）——对 HEAD 跑两文件得 **6 failed / 21 passed**。实现后：两文件 **49 例 ✅**；music + `worker/routes/music` + 音乐跨模块回归 **131 文件 / 1110 例 ✅**；`npm run test:unit` **550 文件 / 4929 passed + 1 skipped**（1 例 `tests/blog-visit-guards.test.ts > SH-47` 在并行负载下失败，单跑 4 例 ✅，判定为负载 flaky，与本次改动无关）；`npm run typecheck` ✅；13 项静态门禁 ✅（comments 白名单同步到 10740 条 / 1189 文件）；`npm run build` ✅ + `budget:check` **exit 0**（最大的音乐 chunk 91.8 KiB，预算 93.8）；`scripts/e2e-visual.mjs` 对 :7714 **579 通过 / 1 失败**（唯一失败仍是已登记的看板高度遗留，音乐场景全绿）；`npm run contrast:check` **全绿** | **形状**：body = 元数据 + `coverId`/`lyricId`，`.strict()` 所以旧客户端的 `coverDataUrl`/`lyric` 被 400 拒而不是静默丢弃（「禁止静默降级」）。**两次上游查找**在 worker 内并行、best-effort，失败只丢那一半且记日志；`provider` 预算族按「一次添加 = 一次」记，不按两次抓取记两笔。**封面**走新增的 `storeCoverBytes`（与上传路径共用 `coverObjectKey`/`putMusicObject`），超过 `COVER_MAX_BYTES` 按上游不认 `size` 处理：记 warn 并降级为无封面。**删除**：`music-provider-artwork.ts`（含三处测试桩）与客户端两次抓取，`importCandidate` 改用同一 `importInput`（FB2-F4） | 上游不认 `size=PROVIDER_COVER_SIZE` 而回原图时按字节上限拒绝并降级，只有单测覆盖，没有真实上游矩阵；在线结果屏仍无浏览器断言（M7 补）；`npm run test:unit` 里那 1 例 flaky 未在本次提交内复跑第二次全量以证明「非本次引入」之外的更多信息 |
| 2026-09-28 | M6 FB2-PF1 封面抓取独立预算族 | `待回填` | 先红（worker 契约）：`tests/music-provider.test.ts` 新增一例「封面记账在 `music-providerArtwork:user-1`，且不在 `music-provider:user-1`」（直接读 `login_attempts` 的 key），把 `provider.ts` 回退到 HEAD 跑得 **1 failed**；实现后 **12 例 ✅**。实现：`shared/constants.ts` 加 `musicProviderArtworkPerHour: 600`（注释写明「一页命中一张图，浏览不该花播放解析的额度」）、`budget.ts` 加族与文案、`provider.ts` 的 cover 路由改用它 | review 里「客户端按 `source:id` 加一层会话缓存」**经复核不需要**：封面 URL 是 `(source,id)` 的纯函数、路由自带 `Cache-Control: public, max-age=86400`，而中间件的 `no-store` 只在路由未给值时才加（`security-headers.ts:51`），所以重挂载读的是浏览器缓存——再加一层缓存只会是第二份真相。本项因此只改服务端记账 |
| 2026-09-28 | M5 FB2-F3 命中列表的时长口径（先红后改） | `166bb742` | 先红（单测）：`music-provider-results.test.ts` 的 FB-F5 两例改为 FB2-F3 口径（不报长度就不画该格），`music-server-modal.test.ts` 新增一例（报了就画 `03:34`、没报就无格也无「未知」）——把两个源文件回到 HEAD 跑得 **2 failed**。实现后两文件 **29 例 ✅**。**取证订正**：首稿说「没有任何回填路径」不成立——`player.ts:49` 的 `onDuration` → `recordLearnedDuration`（`player.ts:76-79`，仅在 `durationMs === 0` 时 `patchTrack` 一次），事件源 `audio-engine.ts:199`/`:525`，所以 M5 缩到只修口径 | 源切换候选（`music-source-switch-modal.tsx`）**故意不改**：那一屏是在几条候选里挑一条替换失效行，长度对比是决策依据，故照旧写明「未知」；lrclib 的 duration（③）不做，理由记在 review 的不做清单（需改 API 契约，只盖到「取过歌词未播过」的行） |
| 2026-09-28 | M4 FB2-U1 沉浸层队列搬到左列并带回搜索 | `8e8f3f22` | 先红（单测）：新建 `music-immersive-queue.test.ts` 三例（宽版队列在左列且带搜索 / 搜索真的收窄行 / 堆叠版仍在歌词下方），对 HEAD 跑得 **2 failed**（宽版两例：旧实现把队列画在歌词下方、且没有 `MusicQueueBrowser` 的搜索框），实现后 3 例 ✅。拆分（size 先报 `music-immersive-player.test.ts` 564 行、源文件 556 行 + 1 长函数）：`music-immersive-player.tsx` **491** 行 / `.test.ts` **481** 行 / 新 `music-immersive-queue.tsx` 76 行 / `music-immersive-queue.test.ts` 130 行，全部回到限内且无长函数。回归：music **119 文件 / 943 例 ✅**；`npm run test:unit` **551 文件 / 4955 passed + 1 skipped ✅**；`npm run typecheck` ✅；13 项静态门禁 ✅；`scripts/e2e-visual.mjs` 对 :7714 **591 通过 / 1 失败**（+6：起手折叠 / 宽版开在左列且带搜索 / 头部高度不变 / 队列打开时封面让出空间 / 搜索真的收窄 / 收回到位；唯一失败仍是已登记的看板高度遗留）；`scripts/check-contrast.mjs` 对 :7714（承载状态、库内无封面行）**全绿**（两主题 × 桌面/手机，含沉浸层 21 项检查、0 审查项）→ M3 留下的对比度遗留同时关闭 | 队列开合状态随表面存活（与 `useImmersiveWindow` 的最大化同规，不随重开复位），浏览器门禁因此先归一化再量；宽版队列由 `MusicQueueBrowser` 提供搜索与空态，窄版底部条带仍是 `MusicQueueList`（无搜索，这是窄屏高度换来的）。**一次实测修正**：门禁首次跑时报选择器无效（把中英两个 label 插进同一个选择器），修正为在 Node 侧拼好逗号选择器再传入 |
| 2026-09-28 | M3 FB2-U2 工具栏阈值与行模型（先量后改） | `300461f7` | 先红（单测）：`music-hub-toolbar.test.ts` 补 4 例行契约（`data-music-row` 命名；尾部只在动作行放不下时上提）与 `music-utils.test.ts` 补阈值契约（840/900/1400 两侧 + 单调不变式）—— 实现前 **13 例失败**（10 shape + 3 row）。实测（先量，两种语言）：内容盒下五个标签流 + 排序段 = zh 674 / en 819，同行带刷新与「更多」= 738 / 883，把六个导入 / 元数据 / 健康控件放回 = 1197 / 1357，故阈值取宽语言的十位（840 / 900 / 1400）。实现后：music **119 文件 / 940 例 ✅**；`npm run typecheck` ✅；13 项静态门禁 ✅（size 先报 3 个文件新增长函数：`MusicHubToolbar` 53 行、`SearchBox` 51 行、`music-utils.test.ts` 的 describe 81 行 → 抽出 `SearchRow` / `SearchPopupFromState` 并拆 describe 后复绿）；`scripts/e2e-visual.mjs` 对 :7714 **585 通过 / 1 失败**（+2：工具栏中间档位行带数与每行右缘贴合；唯一失败仍是已登记的看板高度遗留） | 对比度门禁：`:7712` **4 个音乐表面红**（axe `color-contrast` incomplete ×6/×3，目标 `button[aria-label="播放: 心之逆鳞"] > .bottom-1.5…`），定位为该实例库里 7 条带封面在线行（`/api/music/library` 实测 9 条中 7 条有 `coverUrl`，上一轮手工验证留下的数据）；对全新实例 `:7716` 跑同一门禁，音乐三面**全绿**（网格 25 项检查 / 0 审查项），即 CI 形态不受影响，该缺口已登记为 **FB2-C3**（M10 处置）。另：`:7716` 的全量运行在手机档停在「无预览面板可打开大纲」，因为门禁需要 `e2e.mjs` 先建笔记状态，孤立的裸实例跑不完——如实记录，未降级为通过 |
