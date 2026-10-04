# 启动加载性能审查 · 第一轮（qoder）

> 提问：笔记 app 启动加载很慢（dev 启动慢、部署后打开也慢），是不是因为启动时把所有模块都加载了？
> 本文只记**实测或实读**到的事实。推断标「推断」，没量的标「未量」，全部集中在 §10。

## 0. 结论

原始假设**不成立**：echarts、excalidraw（含 1.78 MB 字体子集 wasm）、mermaid、katex、mind-elixir、chart.js、pinyin-pro、prismjs 语法包，**没有一个在首屏静态可达图里**，全在 `await import()` 之后。这条线项目已经做对了，别在这儿改。

真实原因是三层叠在一起，按证据强度排：

1. **懒边界建错了位置。** 外壳到笔记界面之间有三道 `React.lazy`（`app.tsx:12`、`app-shell.tsx:26`、`app-shell.tsx:40`），但每道后面紧跟的都是「首帧必画」的表面，所以对用户只是把一次大下载切成几段串行等待。实测并集 **300 请求 / 3.72 MiB 原文 / 1.15 MiB gzip**，其中 `AppShell` 自己的静态闭包就有 **240 chunk / 919 KiB gz**，`Workspace` 只再多 234 KiB。**贵的是外壳，不是工作区。**
2. **首屏前串行排着四道与体积无关的闸**：文档 TTFB 里有 2 次串行 D1 往返（§7.1）；`main.tsx:23` 在 `createRoot().render()` 之前 `await initI18n()`，而 `i18n.ts:65-66` 先等 `en-US` 再等目标语言，**中文用户串行下两份语言包（152 KiB gz）**；`app.tsx:162` 在会话接口返回前渲染的是空 `div`，外壳 919 KiB 要等一个 HTTP 往返 + 一次 IndexedDB 事务之后才开始取；而那个 IDB 事务里有一个**每次启动都跑的全库扫描**（§7.2）。
3. **dev 侧是同一结构问题的放大**：那 300 个 chunk 在 dev 里是 **878 个未打包源文件 / 5.25 MB 源码**，每文件一次请求一次 transform；外加 Vite 8 的依赖优化把 lucide 整族图标子块静态再导出（上一轮 CDP 实测，§6.3），以及 Tailwind 4 无 `@source` 时对整仓做 `**/*` 扫描并把每个文件挂成 `app.css` 的 watch 依赖（§6.2）。

一句话给决策：**「入口薄、外壳胖、门禁瞎、dev 无打包」**。上一轮已用 puppeteer 采到墙钟基线（§9），本轮补上了产物图口径与三条此前没发现的确定性缺陷（§7）。

## 1. 口径与方法

产物：`dist/`（2026-10-05 04:03 一次完整构建，本轮只读）。脚本写在 `/tmp`（不持久，口径写全可复现）：

- 从 `index.html` 的 `type="module"` 脚本出发，按 chunk 间**静态** `from"./x.js"` 边做传递闭包。
- **坑（本轮踩过）**：rolldown 静态边用双引号、动态边用**反引号** `` import(`./x.js`) ``。只匹配引号会漏掉或误判全部动态边，第一版因此把闭包算小。同一问题在 `scripts/check-vendor-isolation.mjs:16` 里现在仍然存在（§8.2）。
- 字节记原文与 gzip 两栏，gzip 用 `zlib.gzipSync` 默认级别、逐 chunk 独立压，未计 HTTP 头与连接。上一轮基线用 gzip -9，两处绝对值差约 ±10%，**比较时只看同一口径内的相对量**。
- dev 侧同一套图换到源码：从 `main.tsx` 按 `import` / `export … from` 建边，`import()` 与 `lazy(() => import())` 记为动态边。
- 本轮**没有**跑新构建、没起 dev server、没采任何网络时序（时序见 §9 的上一轮基线）。环境备注：本机有一个 `vite --mode kv --port 7722` 实例在跑（`ps` 实测 vite RSS 894 MB、workerd 397 MB），**不是本轮起的**，本轮未向它发过请求。

## 2. 部署侧：首屏到底多重

| 图 | chunk | 原文 | gzip | 谁引 |
| --- | --- | --- | --- | --- |
| 文档直引（script + modulepreload） | 4 | 222 KiB | 72 KiB | `index.html` |
| `App` 子树 | 26 | 611 KiB | 185 KiB | `main.tsx:22` 动态 |
| **`AppShell` 子树** | **240** | **2 947 KiB** | **919 KiB** | `app.tsx:12` 动态，`status==='authed'` 即画 |
| `Workspace` 子树 | 296 | 3 446 KiB | 1 064 KiB | `app-shell.tsx:26` 动态，首帧即画 |
| 两份语言包 | 2 | 497 KiB | 152 KiB | `main.tsx:23` **await 在 render 前** |
| **首屏并集（真实传输）** | **300** | **3 722 KiB** | **1 153 KiB** | — |
| 整个应用（含所有懒层） | 2 091 | 14 493 KiB | 4 881 KiB | — |

两道 `lazy` 之间是**串行**的：外壳画出来之前拿不到 `AppShell`，`AppShell` 画出来之前拿不到 `Workspace`。用户感受不是「1.15 MiB 一次下完」，而是「白屏 → 转圈 → 骨架 → 内容」，每段各等一次往返 + 一次传输。`app.tsx:92` 那个 `setTimeout(() => dismissBootScreen(), 8000)` 是作者自己留的兜底——白屏最长可顶 8 秒，这本身就是「启动可能卡住」的自供。

## 3. 假设校正：重渲染器逐个查归属

| 库 | 产物 | 在首屏图 | 懒边界 |
| --- | --- | --- | --- |
| echarts | 1 092 KiB | **否** | `lib/markdown/echarts/loader.ts:15` |
| @excalidraw/excalidraw | 522 KiB + 1 778 KiB wasm | **否** | `excalidraw/loader.ts:69` |
| mermaid（core + 55 图种 + cytoscape/elk/dagre） | ~2 000 KiB | **否** | `enhance/mermaid.ts:17` |
| katex | 252 KiB + 20 字体 | **否** | `enhance/math.ts:14` → `lib/katex-loader.ts:1-2` |
| chart.js | 203 KiB | **否** | `enhance/chart.ts:33`、`kanban/ui/kanban-chart-view.tsx:163` |
| mind-elixir | 97 KiB | **否** | `mindmap/loader.ts:17` |
| pinyin-pro 词典 | 297 KiB / 144 KiB gz | **否** | `components/overlay/menu-search.ts:11-19`、`music/music-search.ts:26-32`，产物里只作为 `` import(`./esm-Deo0ult2.js`) `` 出现，无任何静态 `from` |
| prismjs 31 个语法 | 各 2–6 KiB | **否** | `lib/markdown/prism.ts:90-122`（core 静态，`:1`） |
| **CodeMirror** | 560 KiB / 194 KiB gz | **是** | `editor/editor-extensions.ts:1-14` 全静态 |
| **markdown-it 全家（12 插件）** | 162 KiB / 69 KiB gz | **是** | `renderer/index.ts:3-14` 全静态 |
| dompurify / yaml / json5 / client-zip | 27 / — / — / — KiB | **是** | `sanitize.ts:8`、`shared/markdown-utils/front-matter.ts:1`、`echarts/option.ts:9`、`lib/export-folder.ts:1` |
| @dicebear（头像） | 在 `ui-*.js` 140 KiB 内 | **是** | `app.tsx:6` → `components/primitives.tsx:4` → `lib/avatar.ts:1-2` |

即：**首屏付的是「编辑器 + markdown 管线 + 全部块的应用侧 UI + 一个头像库」，不付任何渲染引擎。** 前者是必要的（开 app 就是要编辑笔记），@dicebear 不是。

## 4. 外壳为什么这么胖（关键更正）

**4.1 chunk 名会骗人：`export-note-*.js`（675 KiB / 185 KiB gz）不是导出管线。**
本轮先按 chunk 名归因给「导出」，随后按内容复核，**归因作废**：该 chunk 里 `kanban` 出现 789 次、`slides` 386 次、`mindmap` 83 次、`echarts` 52 次、`prism` 31 次、`mermaid` 30 次，而 `Excalidraw`/`Excalifont` 为 0。它是 rolldown 按 `vite.config.ts:187-213` 的分组把 **markdown 渲染器 + `enhance` + 整套看板 UI + 整套幻灯片 UI + prism core 合并出来的产物**，名字只反映第一个塞进去的模块。

结论：**把 `use-workspace.ts:7` 的导出改成动态 import 省不下 185 KiB**——同一批模块从 `preview` 那侧仍是静态可达。这条若照直觉写进方案，会做一件没有收益的事。

**4.2 真正的入口是六个桶。** 实读的静态边（`app-shell.tsx` 一个文件里）：

| 行 | 静态 import | 代价 |
| --- | --- | --- |
| `:15` | `import { getActiveEditorView, insertNoteTemplate } from '../../editor/commands'` | 带出 `commands-*.js` 119 KiB → `export-note` 691 KiB + `vendor-editor` 573 KiB |
| `:24` | `import { PinnedWindowsLayer } from '../preview'` | 带出 `preview/index.ts` 全部 12 行 `export *`，其中 `:9` 又带出 `preview.tsx:12-13`（`KanbanFullscreen`、`SlidesFullscreen`）与 mindmap/excalidraw 全屏 |
| `:18` | `import { …, PresentationOverlay } from '../presentation'` | `presentation-*.js` 107 KiB + `client-zip` |
| `:21` | 音乐的若干非懒组件（`music/index.ts:4,8,10-12`） | `music-store-*.js` 98 KiB，含 audio-engine |
| — | list / sidebar / blog 各桶 | `calendar-prefs-*.js` 120 KiB 等 |

再往里一层：`lib/markdown/enhance/index.ts:16-19` 静态引 `'../mindmap'`、`'../excalidraw'`、`'../kanban'`、`'../slides'` 四个家族桶，各桶 `export … from './ui'` 把全部视图组件带出来（`kanban/ui/index.ts:1-15` 十五个视图模块）。

**4.3 门禁与规范在这里是反向的。** AGENTS.md 铁律 3 与 `deep-imports:check` 要求跨模块只走目录 `index.ts`（`scripts/check-deep-imports.mjs:6-10`：目标目录暴露 `index.ts` 时从外部引其内部文件即违规）。于是「想懒加载一个组件」的唯一合规写法是引那个桶，而引桶等于引整个功能。`app-shell.tsx:40` 专门给 `Lightbox` 写了 `lazy(() => import('../preview'))`，但同一文件 `:24` 已静态引了同一个桶——**这道 lazy 因此完全不起作用**。解法只能是给可独立加载的面加**子桶**（`features/preview/lightbox/index.ts` 这种，子目录一旦暴露 `index.ts` 就成为合法公开入口），不是绕开门禁。

**4.4 请求数问题：300 个 chunk 里 259 个（88%）小于 2 KiB，223 个小于 512 B。**
字节不占（50% 在前 5 块，95% 在前 27 块），但**请求数是 300**。这些是 lucide 逐图标 chunk（`workspace` 的 106 条静态边里约 90 条指向图标文件；`dist/client/assets` 共 2 122 个文件，约 1 450 个是图标 chunk）。`vite.config.ts:30-40` 的注释解释了生产侧为什么不合并（合并会把 688 KiB 全注册表放上启动路径）——**这个理由在生产成立，在 dev 不成立**（§6.3）。

**4.5 `vendor-icons-*.js`（149 KiB）在 eager 图里，而它的主要贡献者是懒加载的。**
它由 `vite.config.ts:205-207` 成组，同时装着逐图标 helper 和 `lucide-react/dynamic` 的完整 `dynamicIconImports` 表 + `DynamicIcon`；用这张表的只有博客链接选择器（`features/blog/blog-links-view/link-icons.ts:36`），而那个子树刻意留在桶外。**表在 eager、用表的人在 lazy。**（按 chunk 内容判定，未从源码边直接证，标推断。）

## 5. 首屏前的串行闸（时序）

1. `GET /` 走 Worker（`run_worker_first` 含 `/`、`/index.html`）→ **首字节之前有 2 次串行 D1 往返**，见 §7.1；文档 `Cache-Control: no-store`（`middleware/security-headers.ts:47-59`），HTTP 缓存也用不上。
2. `initial-2-wGJCzh.css` 阻塞渲染：283 KiB / **43.7 KiB gz**。字体是 `font-display: swap`（实测在初始 CSS 里），只有 2 个 Inter 变量字体，KaTeX 的 20 个在懒层——**字体这条是干净的**。
3. `main.tsx:22` 动态取 `App`（26 chunk / 185 KiB gz），`main.tsx:23` **`await initI18n()` 在 render 之前**。
4. `i18n.ts:65` `await ensureLocaleLoaded('en-US')` → `:66` 再 `await ensureLocaleLoaded(locale)`。**两份语言包串行**（72 + 80 KiB gz；源 `src/shared/locales/{en-US,zh-CN}` 各 44 个文件 / 384 KB / 368 KB，产物各是一个零依赖的叶子 chunk，**没有命名空间级切分**）。`:65` 那行本身是必需的（`t()` 回退与 `englishMessageKeys` 依赖它，`:57-59`、`:84`），**要改的是「串行」不是「多」**。
5. `app.tsx:158-171`：`status === 'loading'` 时 `AuthedShell` 渲染空 `div`（`:162`）。`AppShell` 的 240 chunk 要等 `useSession().load()`（`app.tsx:73` → `store/session.ts:77` 的 `await api.session()`）**并且** `await persistSession(info)`（`session.ts:79`，一次 IDB 事务，内含 §7.2 那个全库扫描）之后才开始取。
6. `app.tsx:86-88` 的 `dismissBootScreen()` 在 `status !== 'loading'` 就触发——**白屏在 `AppShell` 存在之前就撤掉了**，所以那 919 KiB 是在「转圈」状态下等的，不在白屏下。
7. 外壳挂载后才轮到笔记数据：`app-shell.tsx:48` → `lib/sync.ts:382` → `store/notes/boot.ts` 的 `await bootstrap()`，其中 `:45` `await loadShell()`（IDB 读 N 条摘要）、`:47` `await applyCachedShell(...)`（内部还 `await openNote()`）、`:51` 才 `await pull()`、`:57` `await replayOutbox()`、`:61` `await restoreWorkspaceAfterBoot()`。**缓存绘制与网络拉取是串行的**（`boot.ts:47` 在 `:51` 之前）。
8. `/api/sync` 全量分页是 `while (page.hasMore)` 里逐页 `await`（`store/notes/sync.ts:25-34`，批大小 500 见 `shared/constants.ts:90`），页与页之间其实互不依赖（keyset 分页 `worker/routes/sync.ts:284-288`）。outbox 重放是 `for … await` 逐条一个往返（`outbox-replay.ts:205-207`）。
9. 全量快照后服务器硬写 `settingsChanged/profileChanged/siteChanged = true`（`worker/routes/sync.ts:317-319`），客户端于是**再发一次 `/api/settings` 和第二次 `/api/auth/session`**（`boot.ts:91-96` → `session.ts:141,151`），而这三样数据在上一步的 session 响应里已经有了。
10. 与上面并行的非关键请求：`GET /api/update`（owner，`app-shell.tsx:86-89`），服务端为此**向 GitHub 发一次外部 fetch，上限 5 秒**（`worker/lib/update-check.ts:10,56-60`）；命中新版本还会**自动弹模态**（`store/update.ts:74-85`），其遮罩会吞掉用户紧随其后的第一次点击（既有记录：`scripts/e2e-visual.mjs:11455`）。

## 6. dev 侧

| 度量 | 值 | 口径 |
| --- | --- | --- |
| `src/client` 源文件（不含 test） | 1 100 | `find` |
| `src` 总行数（不含 test） | 231 144 | `wc -l` |
| `main.tsx` 静态闭包 | 7 模块 | 源码图 |
| `app.tsx` 静态闭包 | 78 模块 / 427 KiB | 源码图 |
| `app-shell.tsx` 静态闭包 | **726 模块 / 4 254 KiB** | 源码图 |
| `features/workspace/index.ts` 静态闭包 | **878 模块 / 5 253 KiB**（`lib` 360 + `features` 335 + `components` 44 + `shared/locales` 44 + `store` 38 + `editor` 25） | 源码图 |
| 依赖预打包 | 79 条 optimized，`.vite/deps` **4 030 文件 / 68 MB**，其中 **1 760 个来自 lucide** | 读 `_metadata.json` |
| `tsc -b` 编译面 | client 工程 **1 877 文件 / 284 037 行**，其中 621 个是测试文件（34%）；`src/shared` 156 文件在 client/worker 两个工程各编一遍 | 读三个 tsconfig |

**6.1 无打包放大。** 首屏 878 个模块，每个一次请求 + 一次 transform。生产里这 878 个被打成 300 个 chunk，dev 一个都不合。这是「dev 打开笔记界面慢」的直接原因，与依赖重不重关系不大。

**6.2 Tailwind 4 在 dev 里扫整仓。** `src/client/styles/app.css:1` 只有 `@import 'tailwindcss'`，全仓**没有任何 `@source`/`@config`/`tailwind.config.*`**（实读 grep）。读 `@tailwindcss/vite` 产物：无 `@source` 时扫描源变成 `{ base: <root>, pattern: "**/*" }`，且对每个扫到的文件调 `addWatchFile`。存活集 **2 676 个受版本管理文件 / 29 MiB**（含 68 个 `.md`、47 个 `.mjs`、整个 `blog-frontend`、`.qoder/**` 台账 1.4 MiB），最重的两个被扫文件是 `scripts/check-comments.mjs`（2.27 MB）与 `scripts/e2e-visual.mjs`（678 KB）。这与既有记录里「门禁期间不能改文件，否则 Tailwind 重扫重出 `app.css`、页面在 `page.evaluate` 中途跳转」是同一件事的因与果。另外 `app.css` 无条件 `@import` 全部 feature CSS（上一轮量得 277 KiB），所以首屏样式表体积与「这台机器上有没有开过音乐/看板/放映」无关。

**6.3 dev 独有的图标风暴（上一轮 CDP 实测，本轮未复现）。** 记录在案：Vite 8 rolldown 的依赖优化把 `lucide-react` 按图标 code-split，**而优化后的入口又静态再导出全部子块**，于是任何用到一个图标的页面会拉 **~1 700 个图标模块**；`.vite/deps` 里 1 760 个 lucide 文件与此吻合。同一条记录还量到「`optimizeDeps.include` 只写 react 族导致中途再优化 3.2 s 停顿」。本轮补一个一致的事实：`vite.config.ts:126-135` 那份 include 基本是装饰——实测 79 条 optimized 里 mermaid/echarts/excalidraw/mind-elixir/全部 codemirror/31 个 prism 语法/pinyin-pro 都在，是自动发现补进去的。**它解释「删缓存或换分支后第一次慢」，不解释「每次都慢」；每次都慢的那部分是 6.1 与 6.3。**

**6.4 其它 dev 启动动作。** `[observability] enabled = true` 在两个 wrangler toml 里都开着，且 `persistState` 默认开（`vite.config.ts:147`），实测 `.wrangler/state/v3/observability/` 已 **16 MiB** trace store。`inkstone:excalidraw-fonts` 在 `configureServer` 里跑 `materialize`（`vite.config.ts:104`）：当前版本戳一致所以只读两个文件就返回，但 excalidraw 一升版就会在 dev 启动时删拷 **14 MiB / 235 个字体文件**进 `publicDir`。

## 7. 本轮新发现的五条确定性缺陷（此前未记录）

这五条不是「设计取舍」，是**写漏了**，每条都能单独定位、单独验。

**7.1 文档首字节前做 2 次串行 D1 往返。**
`src/worker/app.ts` 的 `registerSecurityHeaders` 会 `await viewerAllowsExternalImages`（`src/worker/middleware/security-headers.ts:20,85-107`），而它内部先 `initializeDatabase()`（1 次 `getMeta` 读）再一条 `sessions ⋈ users` SELECT（1 次读），**两次串行**，然后才 HTMLRewriter 注 nonce（`:110-122`）。也就是说**每一次页面导航、包括未登录用户打开首页，都在等两次数据库往返之后才拿到第一个字节**，而拿到的文档还是 `no-store`（`:47-59`），下次再来一遍。这条与前端体积完全无关，是纯 TTFB。

**7.2 每次启动都跑一次 IndexedDB 全库扫描，而且它挡在白屏撤销之前。**
`src/client/lib/db/core.ts:35-58` 的 `bindLocalUser` 在每次启动都写入不带命名空间的 `'userId'` 键且**从不清理**（`:41,50,57`），于是从第二次启动起 `legacyUserId === userId` 恒成立 → `:55-56` `await migrateLegacyData(userId)` → `store-io.ts:66-79` 的 `entries(store)` **读出并结构化克隆反序列化整个 IDB 键空间**（每一条 `note:*` 正文与 `note-summary:*`），再过滤、`getMany`、`delMany`。早退分支 `if (!legacy.length) return`（`:69`）**仍然先付了那次全读**。而这条链被 `session.ts:79` 的 `await persistSession(info)` 挡在 `dismissBootScreen()` 之前。**库越大越慢，且永远不会变快**——它是一次性的迁移，却每次启动都重跑。

**7.3 不支持 FTS5 的 D1 上，每次冷 isolate 都重跑整套 schema 收敛。**
`runtime.ts:53-58` 只在 `state.ftsEnabled` 为真时才 `setMeta(DATABASE_STATE_KEY, …)`，而 `readStoredDatabaseState`（`:94`）要求 `value.ftsEnabled === true` 才走快路径。所以在任何不支持 FTS5 的 D1 上（`:46-52` 的 catch 分支），**缓存键永远写不进去，每个冷 isolate 的第一个请求都要重跑慢路径**：`sqlite_master` 探测 + `db.batch(TABLE_SCHEMA_STATEMENTS)`（47 条）+ `applyMigrations`（60 条迁移，逐条一个 `db.batch` 往返，另加 25 个 `PRAGMA table_info`）+ `db.batch(INDEX_SCHEMA_STATEMENTS)`（81 条）+ `assertFinalSchema`（2 次 `sqlite_master` + **55 次 `PRAGMA table_info`**，见 `checks.ts:13-69`）。合计约 **277 条语句、约 68 次串行 batch/all 调用**，全在用户那一次请求上等。稳态（FTS5 可用）是干净的：`WeakMap` 记忆 + 快路径 1 次读（`runtime.ts:7-19,89-99`）——**这条要修的是那个不对称**。

**7.4 离线外壳的预缓存名单 5 条全部失配。**
`pwa.config.ts:23-29` 的 `CORE_LAZY_MODULES` 写的是 `/src/client/App.tsx`、`/src/client/features/shell/AppShell.tsx`、`/src/client/features/workspace/Workspace.tsx`、`/src/shared/locales/en-US.ts`、`/src/shared/locales/zh-CN.ts`。真实路径是 `src/client/app.tsx`（小写）、`features/shell/index.ts`、`features/workspace/index.ts`，而语言是**目录**（`locales/en-US/index.ts`）。匹配逻辑 `pwa.config.ts:120` 是大小写敏感的 `moduleId?.endsWith(suffix)`，**五条全落空**，`:130-134` 每次构建各打一条 warning 而无人拦。后果读产物即见：`dist/client/sw.js` 的 `CORE_URLS` 只有 **12 条**（入口闭包 + `index.html` + 图标 + 那一张 CSS），**`app-*`、`shell-*`、`workspace-*`、两个 locale chunk 一个都不在**。也就是说离线只覆盖到 §2 表里那 72 KiB，之后每一跳都得走网络。

**7.5 离线预热是单并发 + 每条固定睡 75 ms。**
`pwa.config.ts:505` `forEachConcurrent(OPTIONAL_URLS, 1, …)`，循环体末尾 `:530` 调 `:589-591` 的 `pauseBackgroundWarmup()` → `setTimeout(75)`。实测产物 `ALL_OFFLINE_URLS` **671 条 / 14.6 MiB**（634 个 JS），`OPTIONAL_URLS` 659 条 → **光让路就 ≈49 秒**，再加 659 次请求。触发点 `app.tsx:82-84` → `store/pwa.ts:117-132`（`requestIdleCallback`，timeout 3 s），且 `:72,105-111` 在每次 `online` / `visibilitychange` 时再踢一遍。设计意图（`:503-504` 注释「quietly after the app is ready，单并发 + 短让路以保持前台响应」）是对的，**但它启动的时机正是首屏刚结束、外壳那 919 KiB 与 `/api/sync` 链最忙的时候**，而且与 7.4 是同一问题的两面：核心资源没进 `CORE_URLS`，于是它们也只能排在这条 49 秒的队伍里被顺带缓存。

顺带两条同源的（不算缺陷，算未量过的开销）：`worker/index.ts:26-34` 每个请求都 `createOAuthProvider(...)` 再 `provider.fetch(...)`，即所有请求（含纯静态回退与全部 `/api`）都套在 OAuth 包装里，构造开销**未量**；`wrangler.toml:57` 的 cron 每 15 分钟在同一块 D1 上串行跑 11 个任务（含 `drainAllFtsQueues` 最多 20 用户 × 250 条、`auditFtsIndexes` 20 用户），落在整点边界上的首次请求可能被拖慢（**推断，未量**）。

## 8. 门禁为什么全程绿灯（口径盲区）

本轮实跑 `node scripts/check-bundle-budget.mjs` → `eager: 612.3 KiB across 29 chunks (budget 976.6 KiB)`，**rc=0**。

**8.1 两条门禁的「eager」都不是用户的首屏。**
`check-bundle-budget.mjs:84` 只把 `app-` 前缀当种子，而外壳 chunk 叫 `shell-*` → **3.0 MiB 原文 / 919 KiB gz 不进 `EAGER_BUDGET`（`:35`）**。`check-vendor-isolation.mjs:42-53` 的 `firstScreen` 更窄：只从 `index.html` 的入口脚本跟静态边，**连 `main.tsx:22` 那一次动态跳都不跟**，算出来首屏只有 4 个 chunk，于是 `@dicebear` 被判 `isolated` 通过，而它实际在 `ui-*.js` 里、两跳之后 eager 加载。**门禁眼里的 eager 是 612 KiB，用户眼里的首屏是 3 722 KiB 原文 / 1 153 KiB gz，差 6 倍，而预算还剩 37% 余量。**
根因一句话：**「经过 `React.lazy`」在现有门禁里等于「懒」，在用户那里不等于。**

**8.2 `check-vendor-isolation.mjs` 的判定是内容关键字而非 import 边，本轮实测三处失真。**
`client-zip` 的两个 needle（`predictLength`/`makeZip`）在当前 minifier 下不存在 → 报「不在浏览器产物里」，而它静态引自 `lib/export-folder.ts:1`；`@dicebear` 的 needle `micah` 命中的是版权字符串 `creator: 'Micah Lanier'`；`mind-elixir` 的 needle 把 675 KiB 的合并 chunk 整个归给 mind-elixir。另外 `:16` 的 `DYNAMIC_LITERAL_RE` 匹配 `import("./x.js")`，而 rolldown 输出的是反引号形式 → **该正则当前匹配不到任何动态边**，动态识别全靠 `:17` 的 `"assets/x.js"` 依赖表兜住。表在所以没出事，但这是隐式依赖，rolldown 改输出风格就会静默失效。

## 9. 上一轮已采到的墙钟基线（引用，非本轮实测）

同日更早一轮用 puppeteer 冷缓存实测（dev 新 ephemeral 实例 / prod 新 build 的 preview），数字记录在项目记忆中，探针脚本在 `/tmp` 已不持久：

- dev 未登录首开 **1 941 请求 / JS 11.2 MB / 瀑布 5.9 s**
- dev 登录态 **2 775 请求 / JS 39.2 MB / shell 可用 6.3 s / 长任务 2.1 s（max 1 136 ms）**
- prod 未登录 **33 请求 / 1.39 MB raw**
- prod 登录态 **363 请求 / 5.26 MB raw（shell 之前 266 请求 3.9 MB）/ shell 可用 1.85 s / 长任务 1.45 s**

本轮的静态闭包口径与之独立同向：prod 363 请求 ↔ 本轮首屏并集 300 chunk；shell 层 256 chunk / 3 116 KiB / 967 KiB gz ↔ 本轮 240 / 2 947 KiB / 919 KiB gz（差异来自 gzip 级别与动态边去重规则）。**注意：这些是「上一轮某一次」的样本，不是当前基线；任何改动前后都必须按方案 B0 重测，不要引用本节数字当最新值。**

## 10. 未验证与局限

**10.1 本轮完全没量的**：任何墙钟（本轮零时序采样，§9 是上一轮的）、`createOAuthProvider` 每请求开销、`migrateLegacyData` 在真实库上的耗时、FTS5 缺失实例的实际发生比例、300 个请求在 HTTP/2 下的真实并发表现、`/api/*` 各请求的串并行总账（§5 只标了「串行」这一结构性事实，没算毫秒）。**因此方案里的收益一律标成「字节 / 请求数 / 往返次数」而不是「毫秒」**；B0 之前不接受任何「省了几秒」的说法。

**10.2 口径粗糙处**：「首屏 = 外壳 ∪ workspace 静态闭包」依据实读 `app.tsx:158-171`、`app-shell.tsx:112/157-161`，**没有在浏览器里按真实路径点开确认**。分享页 / 集合页 / 放映页 / 播放列表页各有独立 lazy 分支（`app.tsx:182-211`），它们的闭包本轮**一个都没量**——若用户说的「打开慢」其实发生在 `/s/xxx`，本文结论不适用。

**10.3 本轮已明确作废的两个归因**（记下来防重犯）：
- 「`export-note-*.js` 675 KiB 是导出管线，改懒就省 185 KiB」——内容复核后作废，见 §4.1。
- 「首屏 1.06 MiB 主要是 workspace 造成的」——`AppShell` 自己就是 919 KiB gz，见 §2。

**10.4 明确不成立的原始假设**：「因为支持的格式多，所以启动时把所有格式模块都加载了」。§3 逐库查完，一个都不在首屏图里。按这条假设去改，会把力气花在本项目已经做对的地方。
