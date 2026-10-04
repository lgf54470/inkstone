# 启动加载性能 · 修改方案与实施计划（第一轮）

依据：`review-with-qoder-1.md`（同目录）。本文件只写**改什么、按什么顺序、怎么验收**，不重复证据；每条都标它依据审查的哪一节。

## A. 总原则

1. **先修度量，再修体积。** 现在 `check-bundle-budget` 报 612 KiB 而真实首屏 1 153 KiB gz（审查 §8.1），在这种尺子上做任何优化都无法自证。B0 不做完，后面每条收益都不许写「省了 X」。
2. **收益只声明可静态证明的量**：字节、chunk 数、请求数、往返次数。毫秒必须来自 `scripts/measure-boot.mjs` 的同机前后两次实测。
3. **不要动重渲染器。** 审查 §3 逐库确认 echarts/excalidraw/mermaid/katex/mind-elixir/chart.js/pinyin/prism 语法全在懒层，`vite.config.ts:15-24` 的 `preservesOnDemandBoundary` 与 `check-vendor-isolation.mjs` 在守这条。**这一层是资产，不是问题。**
4. **不要靠绕 `deep-imports:check` 来拆桶。** 唯一合规手段是给可独立加载的面加**子桶**（审查 §4.3）。
5. 每批一个原子提交，scope 用 `infra`/`ui`/`i18n`/`db`/`api`；批内每条改动各自留证据。

## B. 批次表

| 批次 | 内容 | 依据 | 可证收益 | 风险 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| **B0** | 度量与尺子：`scripts/measure-boot.mjs` + 两条门禁的 eager 口径 | §8.1 §8.2 §9 | 建立基线（不改产物） | 低 | — |
| **B1** | IDB 遗留迁移每次启动重跑 | §7.2 | 去掉白屏前一次 **O(全库)** 读 | 中（迁移语义） | B0 |
| **B2** | FTS5 缺失时 schema 状态缓存键写不进去 | §7.3 | 冷 isolate 少 **~277 条语句 / ~68 次串行往返** | 中（正确性） | B0 |
| ~~B3~~ | ~~文档首字节前 2 次串行 D1~~ | §7.1 | **不做**：代价依赖未证的 `env.DB` 跨请求同一性，且那个 `await` 是有意的 schema 屏障 | — | — |
| **B4** | i18n 双语言包串行 + 模块期写 title | §5.3-5.4 §5.5 | 少 1 个串行往返；修一个可见缺陷 | 低 | B0 |
| **B5** | SW 核心预缓存名单 5/5 失配 + 预热节奏 | §9(审查) | 离线覆盖从 12 条扩到含 app/shell/locale | 低 | B0 |
| **B6** | 外壳六个桶改子桶/懒 | §4.2 §4.3 | 首屏 **−919 KiB gz 中可分离的部分** | **高** | B0 B4 |
| **B7** | `enhance` 四个家族桶按格式注册 | §4.2 | 块应用侧 UI 不再整批进 eager | **高** | B6 |
| **B8** | dev：lucide 依赖优化子块风暴 | §4.4 §6.3 | dev 少 ~1 700 个模块请求 | 中 | B0 |
| **B9** | dev：Tailwind 扫描集与 feature CSS | §6.2 | 少 2 676 文件全仓扫描与整页重出 CSS | 中 | B0 |
| **B10** | 会话与外壳并行、sync 分页与 outbox 并行 | §5.5 §5.7-5.9 | 少 1 个串行往返 + `ceil(N/500)` 次改并行 | 中高（一致性） | B4 |
| **B11** | @dicebear 退出 eager；`vendor-icons` 表/用表人分层 | §3 §4.5 | eager −（头像与 149 KiB 图标表的可分离部分） | 中 | B6 |

## C. 逐批实施说明

### B0 · 先修尺子（不改任何运行时代码）

**C-B0.1 新增 `scripts/measure-boot.mjs`。** 手工脚本，不进 CI（与 `scripts/measure-*.mjs` 同族，AGENTS.md 已列该族可调环境变量与 `INKSTONE_VISUAL_USERNAME/PASSWORD`、`INKSTONE_CHROME_PATH`）。它要做的是本项目至今缺的那一件：**按真实路径点开，采墙钟与请求数**。

- 起临时实例（`INKSTONE_EPHEMERAL_DEV=1 npx vite --mode kv --port <free> --strictPort`；既有记录明确：ephemeral 状态在内存里，换端口才是干净实例，且 :7712/:7790 可能被别的 worktree 占）。
- 冷缓存下采三档：**未登录首开 / 登录到 shell 可用 / 打开一篇含全部块类型的笔记**。
- 每档记录：请求数、JS 传输字节、`FCP`、`domContentLoaded`、外壳可交互（自定义标记：笔记列表首行绘制）、`PerformanceObserver('longtask')` 总数与最长任务。
- 阈值放成可调常量（`SHELL_MS_MAX`、`REQUESTS_MAX`、`JS_BYTES_MAX`、`WORST_TASK_MAX`），**首跑只打印不判定**，第二次跑起才把实测值钉成预算——否则等于把一次噪声写进 CI。
- 探针必须落在 `scripts/`，不能再放 `/tmp`（上一轮的探针已经丢了，见审查 §9）。

**C-B0.2 修 `scripts/check-bundle-budget.mjs:84` 的种子。** 现在只播 `app-*`。改成「`index.html` 直引 + 所有**首帧必画**的 chunk」，即把 `shell-*`、`workspace-*` 一起当种子，并把这条判定写成显式名单而不是前缀猜测：

- 新增 `EAGER_SEEDS = ['app-', 'shell-', 'workspace-']`，注释写明理由：**「经过 `React.lazy`」不等于懒，首帧就挂载的 lazy 表面算 eager**（审查 §8.1 的根因一句话）。
- 名单不能靠人记：加一条自检——`scripts/check-surface-coverage.mjs` 已经在用 AST 找全屏表面根（AGENTS.md「工具栏展开」段），同一套 AST 里再扫一遍「`lazy(() => import(...))` 且其结果出现在该组件首次 `return` 的 `Suspense` 里」，命中的模块前缀必须出现在 `EAGER_SEEDS`，否则挂。
- 预算值按新口径重设：当前实测首屏并集 3 722 KiB 原文 / 1 153 KiB gz。**B0 这一步就是把 `EAGER_BUDGET` 从 1 000 000 提到能容住现状的那个值，并显式标注它是「记账起点」不是「达标线」**，然后 B6/B7 逐批往下压。预算只降不升，升要写理由（沿用 `:23-28` 那条 music 提额的注释格式）。

**C-B0.3 修 `scripts/check-vendor-isolation.mjs`。** 三件事（审查 §8.2）：

- `:16` 的 `DYNAMIC_LITERAL_RE` 加上反引号形式，并加一条**自检断言**：本次扫描到的动态边总数必须 > 0，否则报错退出（防止将来 rolldown 改输出风格后静默失效）。
- `firstScreen` 从「只跟 `index.html` 入口的静态边」改成与 B0.2 同一套种子，两条门禁共用一个 `scripts/lib/eager-graph.mjs`，**避免两处各自实现一遍「什么算首屏」**（AGENTS.md「同一逻辑第二次出现即评估抽取」）。
- needle 失真：`client-zip` 换 needle 或直接改成按 import 边判定；`@dicebear` 的 `micah` 命中版权字符串这条必须收紧（例如要求 needle 同时出现在 chunk 且该 chunk 有来自 `lib/avatar.ts` 的边）。**注意**：AGENTS.md 已有一条同类教训——按内容关键字判定会双向失真。

**验收**：`npm run budget:check` 与 `npm run vendor:check` 在**未改任何运行时代码**的情况下，报出的 eager 数字从 612 KiB 变成 ≈3.7 MiB 原文；`node scripts/measure-boot.mjs` 三档跑通并打印。
**风险**：门禁口径一变，CI 立刻红。这是**故意的**——但必须单独一个提交，且提交信息里写清「本提交只改尺子，红是记账不是回归」，否则后面任何一次改动都说不清是谁弄红的。

### B1 · 每次启动的全库 IDB 扫描

**改**：`src/client/lib/db/core.ts:35-58`。迁移完成后**清掉不带命名空间的 `'userId'` 键**（`:57` 现在只写不清），使 `legacyUserId === userId` 不再恒真；并把 `migrateLegacyData` 的判定从「读全库再过滤」改成「先探一个 legacy 键是否存在」。

**验收**：`src/client/lib/db` 下新增回归测试，用例名表达意图——「第二次启动不应读全部键」，断言方式是给 `idb-keyval` 的 `entries` 打计数桩（本项目已有共用 20D 上下文桩的先例：`lib/markdown/enhance.test-helpers.ts`），断言启动路径上 `entries` 调用次数为 0。**变异验证**：把清理那一行删掉，该测试必须红。
**风险**：真·遗留数据未迁完的用户。所以判定条件不能只看键在否，要保留一次「确实存在 legacy 键」的探测；这条探测本身必须是 O(1) 而不是 O(全库)。

### B2 · FTS5 缺失实例上的 schema 慢路径

**改**：`src/worker/db/schema/runtime.ts:53-58` 与 `:94`。把「状态缓存键」与「FTS 是否可用」解耦——缓存键记 `{schema, ftsEnabled: boolean}` 两个字段都参与匹配，`readStoredDatabaseState` 接受 `ftsEnabled === false` 的合法记录。

**验收**：`tests/schema-migrations.test.ts`（已存在）加一例：模拟 FTS5 不可用（`FTS_STATEMENT` 抛错）时，第二次 `initializeDatabase` 不再跑 `assertFinalSchema` 的 55 次 `PRAGMA`——断言方式是给 `db.prepare` 计数。
**风险**：**这条同时是一个真实的功能缺陷**（FTS 缺失时搜索走 LIKE，见 AGENTS.md 可观测性段），改之前先确认没有别处依赖「`database-state-v1` 只在 FTS 可用时存在」这个隐含语义。`grep DATABASE_STATE_KEY` 全部引用点。
**注意**：`migrations.ts` 是只增不改的（`check-migration-immutability` 守），本批**不碰迁移内容**，只碰收敛流程的缓存键。

### B3 · （已撤销）文档 TTFB 里的两次 D1

**改**：`src/worker/middleware/security-headers.ts:20,85-107`。`viewerAllowsExternalImages` 需要会话与用户设置，但**它的答案只影响 CSP 的一个来源**。两个可选做法，选后者：

1. 把这两次读并行（`Promise.all`）——省一个往返，仍留一个。
2. **把该设置从文档路径挪走**：文档的 CSP 用「与站点默认一致」的固定值，外部图片设置在首个 `/api` 响应或一个极小的 `/api/site-config`（可缓存、`s-maxage`）里下发，客户端拿到后再按需收紧。

**这条必须先确认安全语义**：AGENTS.md 铁律 1 要求「按风险配置 CSP」，且当前 CSP 是逐响应 nonce。**为速度放宽 CSP 属于安全降级，不允许**（冲突优先级：安全 > 交付速度）。所以 B3 只做「不放宽 CSP 的前提下少一次往返」：先并行（做法 1），做法 2 需要单独走「例外流程」并书面确认，**默认不做**。
**验收**：`tests/` 加一例断言文档响应仍带逐响应 nonce 与原 CSP 强度（不变），并记录 `/api` 之外的 D1 读次数从 2 降到 1。

### B4 · i18n：并行 + 修 title

**改两处**：

1. `src/client/lib/i18n.ts:65-66` → `await Promise.all([ensureLocaleLoaded('en-US'), locale !== 'en-US' ? ensureLocaleLoaded(locale) : Promise.resolve()])`。**两份都要，但不许多等一次往返。**
2. `i18n.ts:184-194`：`applyLocaleToDom()` 在模块求值期被调用，此时消息表还是空的，于是把 `index.html:50-54` 内联脚本刚写对的 `document.title` 与 description **覆盖成裸键 `app.document_title`**。改成消息表就绪后（即 `initI18n()` 末尾，`:78` 那一次）才写 DOM，模块期不调用。

**验收**：单测断言「zh-CN 启动后 `document.title` 不是任何以 `app.` 开头的键」；产物侧确认 `en-US-*.js` 与 `zh-CN-*.js` 的 `__vite__mapDeps` 预加载出现在同一批。
**风险**：低。但第 2 条要顺带确认 `applyLocaleToDom` 的其余副作用（`lang`、`data-*`）不依赖模块期时机——`index.html` 内联脚本已经先写过一遍，所以后写是安全的。
**不做**：命名空间级分包（44 个文件现在合成一个零依赖叶子 chunk）。那是更大的收益（首屏只需几十个键），但会牵动 `i18n:check` 与 `t()` 的回退链，**另开一轮**，本批不夹带（AGENTS.md 铁律 14）。

### B5 · 离线缓存名单与节奏

**改**：`pwa.config.ts:23-29` 的 `CORE_LAZY_MODULES` 全部失配（大小写与「语言是目录」两处，审查 §7.4）。改成**按 chunk 归属判定而不是按源文件后缀 `endsWith`**：`app`/`shell`/`workspace` 的 chunk 前缀 + locale chunk，或至少把五个后缀改成真实路径（`/src/client/app.tsx`、`/src/client/features/shell/index.ts`、`/src/client/features/workspace/index.ts`、`/src/shared/locales/en-US/index.ts`、`/src/shared/locales/zh-CN/index.ts`）。

**并且**：`:130-134` 那条 warning 现在每次构建打 5 次却没人拦。加一条门禁——**`CORE_LAZY_MODULES` 里有未命中项就构建失败**（能工具强制的不靠人记，AGENTS.md「自动化建议」）。
**节奏**：同审查 §7.5：`pwa.config.ts:505` 的 `forEachConcurrent(OPTIONAL_URLS, 1, …)` + 每条 `setTimeout(75)`，对 659 条意味着光让路 ≈49 秒。改成「首屏之后、且 `requestIdleCallback` 报剩余预算 > 阈值时才继续」的小批量并发（例如并发 4、每条不再固定睡 75 ms，而是每批之间让路一次）。**注意**：这条设计意图（`:503-504` 注释「不打扰前台」）是对的，改的是实现不是意图，改完要在 commit 里保留该注释的语义。
**验收**：产物侧断言 `CORE_URLS` 含 `app-*`、`shell-*`、`workspace-*` 与两个 locale chunk；`store/pwa.ts:72,105-111` 的重复触发（`online`/`visibilitychange` 各再踢一次）要有幂等保护，断言预热不会并发跑两遍。

### B6 · 外壳的六个桶（最大的一块，也最危险）

**目标**：让 `app-shell.tsx` 的静态 import 只剩「外壳首帧真的画的东西」。逐条对应审查 §4.2 的表：

| 行 | 现在 | 改成 |
| --- | --- | --- |
| `:15` `editor/commands` | 静态引 2 个函数 | 编辑器命令走 `editor/index.ts` 的公开入口 + 调用点改 `await import`；**注意** `:15` 这条同时是 `commands-*.js`(119 KiB) → `export-note`(691 KiB) + `vendor-editor`(573 KiB) 的入口，是本批收益最大的一条 |
| `:24` `preview` 的 `PinnedWindowsLayer` | 静态引桶 | 新建子桶 `features/preview/pinned-windows/index.ts`，或把 `PinnedWindowsLayer` 提到 `:40` 那道已有的 `lazy` 里（`:40` 已经 `lazy(() => import('../preview'))` 引 `Lightbox`，**同一文件里静态引同一个桶使那道 lazy 完全失效**——审查 §4.3） |
| `:18` `presentation` | 静态引 `PresentationOverlay` + 常量 | 常量（`PRESENTATION_HOTKEYS`）挪到 `shared` 常量文件，组件改子桶懒加载 |
| `:21` `music` | 静态引若干非懒组件 | 把 `music/index.ts:4,8,10-12` 那批也走 `music-overlays-lazy.tsx:3-4` 已有的 `lazy` 路子 |
| list / sidebar / blog 各桶 | 静态 | 同法：只保留首帧真画的部分静态，其余子桶 |

**关键约束（必须写进提交说明）**：**改完之后必须重跑 B0 的尺子，不能拿「我删了一条静态边」当收益**。审查 §4.1 已经证明：`export-note-*.js` 是被 rolldown 合并出来的 chunk，**单删一条边很可能一个字节都不省**，因为同一批模块从别的边仍然静态可达。所以 B6 的验收**只认产物数字**：`npm run budget:check` 的新口径 eager 必须实打实下降，且下降量在提交信息里写数字。若某条边删了而数字不动，**说明还有另一条静态边进同一批模块，要继续找，不能收工**。
**风险**：高。动 barrel 会牵动 `deep-imports:check`、`size:check`（单文件 ≤500 行）、`module-state:check`，以及大量测试的 import 路径。**做法：一次只改一个桶，每桶一个提交，每个提交后跑 `typecheck` + `test:unit` + `budget:check`。** 不要一上来六个桶一起改——那会把「哪个桶值多少」这笔账彻底弄丢。
**顺序建议**：`:15`（editor/commands）→ `:24`（preview）→ `:21`（music）→ `:18`（presentation）→ list/sidebar/blog。

### B7 · `enhance` 的四个家族桶

**改**：`lib/markdown/enhance/index.ts:16-19` 静态引 `'../mindmap'`、`'../excalidraw'`、`'../kanban'`、`'../slides'`，各桶 `export … from './ui'` 把全部视图组件带出来（`kanban/ui/index.ts` 十五个视图模块）。改成**注册表 + 按需取**：`enhance` 只登记「这个 fence 家族归哪个 loader」，实际模块在真的出现该 fence 时 `await import()`。

**注意与既有设计对齐**：本项目**已经有**这个形状的东西——`renderer/fence.ts:118-159` 按 info 串分发但只输出占位符，fence 正文走 `fence-bodies.ts:21-27` 的旁路；vendor 层也已经是 `*/loader.ts` + `*/vendor.ts` 的分层（审查 §3）。**B7 不是发明新架构，是把同一套 loader 形状从 vendor 层补到 UI 层。** 这个判断要写进提交说明，避免被读成一次无由头的重构。
**风险**：高，且与快照/导出/放映三条通道耦合（`enhance` 的 `snapshot` 通道要读 fence 正文，见 `:24-33` 的 `fences` 选项文档注释）。**必须先给「笔记里含全部五种块」这一条路径补一个可重跑的验证**（B0 的第三档正好是它），否则改完不知道有没有把导出弄坏。
**依赖 B6**：外壳不先瘦身，B7 的收益会被外壳的静态边吃掉，量不出归因。

### B8 · dev 的图标风暴

审查 §4.4 §6.3：生产侧不合并 lucide 图标是有理由的（`vite.config.ts:30-40`，合并会把 688 KiB 全注册表放上启动路径），但 **dev 侧没有 chunk 概念**，而上一轮 CDP 实测 rolldown 的依赖优化产物「按图标 code-split 且优化入口静态再导出全部子块」，于是一个图标拉 ~1 700 个模块。

**做法（按代价从低到高，逐个试，量了才留）**：
1. `optimizeDeps.include` 显式写 `'lucide-react'`（**不带** `/dynamic`），看能否让它整体预打包成单文件而不是逐图标。
2. 若不行，把 `lucide-react` 加进 `optimizeDeps.exclude` 的反面试验前先确认 `link-icons.ts:36` 的 `lucide-react/dynamic` 是否就是逐图标 split 的来源；若是，dev 侧单独把 `DynamicIcon` 那条路径换成固定图标集（36 个预设已在 `PRESET_LINK_ICONS`）。
3. 最后手段：dev 专用的 `resolve.alias` 把 `lucide-react` 指到它的单文件 bundle。

**验收**：`measure-boot.mjs` 的 dev 档请求数（上一轮基线 1 941 / 2 775）必须显著下降，且**prod 档数字不许变差**（改了 alias 很容易把生产的图标分组一起弄坏，那会把 §4.4 刻意保留的性质弄丢）。
**风险**：中。这是「dev 慢」最可能的单一主因，但也是**最容易把生产体积弄坏**的一处，所以必须 B0 之后做，且两档都量。

### B9 · dev 的 Tailwind 扫描集

**改**：给 `src/client/styles/app.css` 加显式 `@source` 限定，把扫描集从整仓 `**/*`（2 676 文件 / 29 MiB）收到真正的 class 来源：`@source ../../client`、`@source ../../shared`，以及需要扫的 `.mjs` 门禁脚本**明确排除**（`scripts/check-comments.mjs` 2.27 MB、`e2e-visual.mjs` 678 KB 是最重的两个被扫文件）。

**这条同时解决一个既有工程痛点**：AGENTS.md 与多处记忆里反复出现「门禁期间不能改文件，否则 Tailwind 重扫重出 `app.css`、页面在 `page.evaluate` 中途跳转」。**扫描集收窄后，改 `.md` 台账不再触发重扫**——那是白捡的收益。
**本批实际采用的验收（已跑通，记下来供复现）**：不靠肉眼看 CSS 体积，而是拿产物证明没掉样式——
① 取改动前全部 `*.css` 的 class 选择器集合为基线（3 249 条）；② 收窄后重建，逐条比对：
`src/client` + `src/shared` 里非测试 `.tsx/.ts` 的 1 561 个 `className` token 中，
「基线有、新产物没有」的为 **0 条**；③ 被丢的 146 条里挑 11 个可疑项（`mb-8`、`h-22`、`w-8`、
`scale-95`、`cursor-not-allowed`、`bg-black/60`、`p-8`、`border-white` 等）在 `src/` 里按
带引号的独立 class 串 grep，**零命中**——它们来自 `blog-frontend` 的 `.astro`（那边有自己的
Tailwind 构建）与文档正文。结果 initial CSS 283 474 → 270 924 raw、43 683 → 41 724 gzip。
④ 尾注：`@source` 的 rationale 不能写在 `app.css` 里——`comments:check` 全面禁止 CSS 注释
（整个 `src/client/styles/` 零注释），理由只能活在提交信息与本文件里。
**后续可自动化**：把上面 ② 那条「src 内 className token 必须全部仍被生成」做成门禁脚本，
`@source` 被人改宽或改窄时即失败，而不是靠下次有人重跑这套比对。

**风险**：**把 `@source` 写窄了会掉样式**（生产产物里用到的 class 若来自被排除的文件，就会不生成）。所以必须：改完 `npm run build` 后比对 CSS 产物（项目已有 `check-token-drift.mjs --update-baseline` 的同类机制可借鉴），并跑 `scripts/e2e-visual.mjs` 与 `check-contrast.mjs` 确认没有元素失去样式。**这条要在提交信息里写清「扫描集收窄的判据是产物 class 数不降」**。
**顺带**：`app.css` 无条件 `@import` 全部 feature CSS（审查 §6.2，上一轮量得 277 KiB）。首屏样式表 43.7 KiB gz 里有多少属于「这台机器根本没开过音乐/看板/放映」，B9 顺手量一次；真要拆是另一批，本批只记账。

### B10 · 会话与外壳并行、sync 并行

**改**（审查 §5.5 §5.7-5.9）：

1. `app.tsx:162`：`status === 'loading'` 时渲染空 `div`，外壳代码要等 session 返回才开始取。改成**loading 分支也发起 `import('./features/shell')` 的预取**（`modulepreload` 或直接 `void import(...)`），让 919 KiB 与那次 HTTP 往返重叠。这是**纯重叠，不改任何渲染条件**，风险最低、收益确定。
2. `store/notes/boot.ts:47` 的 `applyCachedShell`（内部 `await openNote`）与 `:51` 的 `pull()` 串行 → 缓存绘制不该挡住网络拉取。
3. `store/notes/sync.ts:25-34` 的 `while (page.hasMore)` 逐页 `await` → 页是 keyset 独立分页（`worker/routes/sync.ts:284-288`），可并发。
4. `outbox-replay.ts:205-207` 逐条 `await` → 同一条笔记的写必须保序，不同笔记可并发；**这条要小心幂等与顺序语义**，是本批唯一有正确性风险的一项。
5. 全量快照后 `boot.ts:91-96` 重复拉 `/api/settings` 与第二次 `/api/auth/session`，而数据在 session 响应里已有 → 去掉这两个请求（服务器侧 `routes/sync.ts:317-319` 硬写 `changed=true` 是它的触发条件）。

**验收**：`measure-boot.mjs` 的「shell 可用」时间与 `/api` 请求数（第 5 项是明确的 −2 请求）；第 4 项必须有并发下的保序测试。
**风险**：中高。sync/outbox 是离线一致性的核心（AGENTS.md「数据、API 与持久化」段），**逐条改、逐条测，不要打包**。建议 1 与 5 先行（几乎无风险），2/3/4 各自单独提交。

### B11 · @dicebear 与图标表分层

审查 §3 §4.5：`app.tsx:6` → `components/primitives.tsx:4` → `lib/avatar.ts:1-2`，把 `@dicebear/core` + `@dicebear/micah` 放进 eager；`vendor-icons-*.js`（149 KiB）装着 `lucide-react/dynamic` 全表，而用表的人（博客链接选择器）自己在懒层。

**改**：`lib/avatar.ts` 的生成路径改 `await import`（头像是装饰性、可延迟的，且已有 `avatarUrl` 真图优先）；图标表那条**先确认再动**——它依赖 B0.3 把 needle 判定改成按 import 边判定，否则「表在 eager」这件事本身量不准。
**风险**：低（头像）/ 中（图标表，涉及 `vite.config.ts:205-207` 的分组策略）。

## D. 明确不做

| 项 | 为什么不做 |
| --- | --- |
| 把 echarts/mermaid/excalidraw/katex/mind-elixir/chart.js 再拆细 | 审查 §3 逐库确认它们**已经不在首屏图里**。按原始假设去改这里，是本轮最可能浪费的一批工时 |
| 「让 `use-workspace.ts:7` 的导出改懒」 | 审查 §4.1：那个 chunk 是合并产物，单删一条静态边很可能 0 收益。**除非 B6 的新尺子证明它省了字节** |
| 命名空间级 i18n 分包 | 收益真实但牵动 `i18n:check` 与 `t()` 回退链，另开一轮（B4 只做并行与 title） |
| 放宽 CSP 换 TTFB | 安全 > 交付速度，AGENTS.md 冲突优先级明定；B3 只做「不放宽前提下的少一次往返」 |
| 升级依赖或改 lockfile 来换打包器行为 | 铁律 8；B8 优先用现有 `optimizeDeps` 配置解决 |

## E. 顺序与提交策略

```
B0（尺子，单独提交，允许把 CI 弄红并写明理由）
 ├─ B1 B2 B5        三条确定性缺陷，互不依赖，可并行
 ├─ B3 B4           低风险，紧随 B0
 └─ B6 一桶一提交 → B7 → B11
    B8 B9           dev 侧，与 B6/B7 正交，可并行推进
    B10 内部再拆 1/5 先，2/3/4 后
```

每批收尾三件事：① 重跑 `measure-boot.mjs` 三档并贴数字；② `npm run budget:check` 新口径的 eager 必须不升；③ 若某批的实测收益为 0，**如实记 0 并回滚或改判**，不许用「结构更清晰了」代替数字。

## F. 本轮计划的自认局限

1. **收益全部是静态口径**（字节 / chunk 数 / 请求数 / 往返次数）。B0 之前，本文件里没有任何一条「省了几秒」的说法。
2. **B6/B7 的实际收益无法预先承诺**。审查 §4.1 已经证明「删一条静态边 ≠ 少一批字节」，因为 rolldown 会合并；所以 B6 的验收只认产物数字，且允许「做完发现只省了 40 KiB」这种结果。
3. **分享页 / 集合页 / 放映页 / 播放列表页没量过**（审查 §10.2）。如果用户报的慢发生在 `/s/xxx`，本计划的 B6-B11 全部不适用，需要先补那四条路径的闭包。
4. **B8 依赖对 rolldown 依赖优化产物行为的判断**，该判断来自上一轮的 CDP 实测，本轮未复现（本轮只确认 `.vite/deps` 里 1 760 个 lucide 文件这一吻合的事实）。做 B8 时先复现再改。

## G. B6 的实测否决（2026-10-05，写在实施之后）

B6 的第一条边——`app-shell.tsx:15` 的 `editor/commands`——按本文件「只认产物数字」的规矩先做了
一次真实构建测量：把它改成 handler 内 `void import('../../editor/commands').then(...)`，重建后
`check-bundle-budget` 报的 eager 从 **3475.2 KiB / 303 chunk 变成 3475.9 KiB / 303 chunk**，
即 **0 收益，还略增**（多出一个动态边依赖表）。实验已回滚，未提交。

原因不是这条边不重要，而是**首屏图是一张密网，不是链**：

- `vendor-editor`（CodeMirror）除了经 `commands-*` 之外，还从 `workspace-*` 直接静态可达；
  而 workspace 是首帧必画的根之一。所以只要「打开笔记 app 就是要编辑笔记」成立，CodeMirror
  就在首屏里，断外壳那条边不会把它移出去。
- 同理，`export-note-*.js` 那 12 条静态入边（`preview`、`commands`、`presentation`、
  `calendar-prefs`、`graph`、`workspace`、`account-settings`、`blog-hub-modal`、`modals`、
  `command`、`share-page`、`vendor-DPMrAtxx`）**必须一起断**才有 −279 KiB；逐条断的中间态
  每条都是 0。

**因此 B6 从「逐桶断静态边」重排为下面两件事**，按性价比排：

1. **B7 提前**：`lib/markdown/enhance/index.ts:16-19` 四个家族桶改成按格式注册 + 按需 `import()`。
   这是唯一能同时断掉那 12 条入边的改动，也是那 279 KiB 的真正所在。它比 B6 危险（牵动快照/
   导出/放映三条通道），所以必须先用 B0 的第三档（含全部五种块的笔记）建一条可重跑的验证。
2. **接受一个结论**：`vendor-editor` 与 markdown 管线在首屏是**正确的**，不该再想办法挪。
   首屏 3.4 MB 里约 380 KiB gz 是「编辑器 + 渲染器」，这部分不是浪费。

**B10 与 B8 的优先级因此高于 B6**：首屏剩下的可动量不在字节，而在 §5 那几道串行闸
（会话与外壳预取重叠、sync 分页与 outbox 并行、去掉全量快照后的 2 个冗余请求）与 dev 侧的
图标子块。这两处都不需要动模块边界。

