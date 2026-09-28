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
- [x] M16（新增）FB3-C5 门禁自身：全新实例上音乐场景因客户端 60s 库缓存空读而提前返回，需在读数前强制一次库刷新（本轮只登记与取证，见下「浏览器实测」）—— **commit `951223c3`（混入 M6，见「入库方式」）**
- [x] M17（新增，同一次实测暴露）门禁自身另两处读数缺陷：`assertMusicListDensity` 的两次读数会撞上列表自己对宽度的那一次测量（ResizeObserver 的首次回调），把上一版布局当成读数（实测在窄窗上读到全列）；`assertMusicSearchClear` 的「曲库已过滤」读的是整个 hub 的文本，而侧栏的最近播放与队列面板本来就会写出曲名（实测 `library: true`、`rows: 0`）—— **commit `951223c3`（与 M16 同批）**

## M② · 信息与历史（P1）

- [x] M4 FB3-U4 + FB3-U8 查询态空态改为「曲库中没有匹配的歌曲」并指向在线结果（在线命中数>0 时补一句「上方在线结果里有 N 条」）；空态动作改为「显示全部歌曲」，与 × 区分 —— **commit `e667efbb`**
- [x] M5b（随 M6 复核时发现）门禁里 `musicSearchHistory` 的标签仍写「搜索历史」，而 M5 已把它改成「最近搜索」——`assertMusicSearchClear` 用该标签拼 `[role="listbox"][aria-label=...]` 选择器，改后必然选不到历史列，那条断言会假失败 —— **commit `f9a69a0a`**（标签改为「最近搜索 / Recent searches」与资源对齐后，整轮里三条读历史的断言实测通过：`scripts/e2e-visual.mjs` **633 通过 / 0 失败**，见进度日志）
- [x] M5 FB3-F5 + FB3-C4 搜索历史完整度：新增 `recordSearchQuery`（停手 1.2s 且 ≥2 字符才落库，`SEARCH_HISTORY_SETTLE_MS`）与 `removeSearchHistory`（逐条删除，行尾一行一个 ×，与行本身是兄弟节点而非嵌套按钮）；`music.search_history` 中文改「最近搜索」与 en 对齐 —— **commit `1342d548`**

## M③ · 在线音源（P1 / P2）

- [x] M6 FB3-F1 + FB3-U6 + FB3-S1 单源检索范围：偏好 `providerScope`（白名单校验）+ 面板同排的范围选择器 + 只扇出选中源 + 契约测试（非法取值按未传入、不放宽出站白名单）—— **commit `951223c3`**（该提交同时带上了 M16/M17 的门禁修复，见「入库方式」）
- [x] M7 FB3-P1 检索成本：按 `(scope, keywords)` 的会话内短 TTL 记忆，改回一个字再改回来不再重新扇出 —— **commit `ed6d3d6d`**
- [x] M8 FB3-F2 逐源开关与顺序：设置页逐源开关 + 排序（聚合顺序同时被「合并顺序」与「换源候选」消费）—— **commit `041f7e2f`**
- [x] M9 FB3-F8 在线检索建议：在线命中与本地建议并列呈现（优先给「已经在你库里/可直达的源」分组），不引入第三方接口 —— **commit `d0e9acff`**

## M④ · 设置项补缺（P2）

- [x] M10 FB3-F3 设置页补「音量」滑杆与睡眠 / 倍速入口（复用既有组件，不新造）—— **commit `d54ef06d`**
- [x] M11 FB3-F4 下载设置：离线补齐音质选择（`downloadQuality`，与播放档位分开）+ 「保留封面/保留歌词」两项（离线副本连同封面与歌词一起进同一个缓存）—— **commit `待回填`**
- [x] M12 FB3-F6 设置页分组顺序：播放默认前置（服务器组后置），并补一条顺序断言 —— **commit `a9c93e6a`**

## M⑤ · 体验收尾（P3）

- [x] M13 FB3-F7 为「最近播放 / 失效行」补一键在线补齐（复用 `openSourceSwitch` 与健康扫描的既有能力）—— **commit `b7725175`**

- [x] M14 FB3-U7 沉浸层左列两行「多少」的行为分级复核（随 M2 的形态断言一起读）—— **commit `a9c93e6a`（随 M12 入库，同日两提交）**
- [x] M15 报告定稿：逐项状态 + 已知限制 + 全量清单回填哈希 —— **commit `db6e4776`**
- [x] M18 / M18b / M18c FB3-C6 + FB3-C7 命中行的两个动作语义（建议行按字面去搜、建议条搬进面板、门禁读数按列表来源取）—— `24d8f573` / `c1ab73ae` / `916c10f0`
- [x] M19 FB3-C9 曲表密度的测量分层（本轮整轮实测揪出的产品缺陷）—— **commit `25aa4016`**
- [x] M20 FB3-C10 工具栏扫描的音乐库条目自备夹具（同轮揪出的门禁缺陷）—— **commit `4b8063be`**
- [x] M21 收尾整轮最后两处失败（看板块高度、分享中心）查清并修掉，连带两处产品缺陷（块的上限写在画布上、打印 sheet 的图表带动画）—— **commit `dbd44721`（看板块）/ `0fbe397c`（打印图表）/ `63e1c63c`（分享与音乐场景收尾）**

## 本轮交付状态（2026-09-29 收尾 · 全部条目已交付）

**已交付并验证**：M0 / M0b（文档）、M1 / M1b（搜索框清除按钮与历史形态）、M2（沉浸层队列默认态分档）、M3（设置页三处 UI）、M4（空态措辞）、M5 + FB3-C4（搜索历史完整性）、M5b（门禁标签随措辞，`f9a69a0a`）、M6 + M16 + M17（单源检索范围与门禁自身的三处读数缺陷）、M7 + M7b（会话内检索记忆与一处过度失效）、M8（逐源开关与顺序）、M9（在线建议）、M10（设置页音量/倍速/睡眠入口）、M11 + M11b（下载设置与离线媒体、偏好回填）、M12（设置页分组顺序）、M13（失效行一键补齐）、M14（沉浸层两行「多少」的分级）、M18 / M18b / M18c（命中行动作语义与建议条落点）、M19（曲表密度的测量分层）、M20（工具栏扫描的音乐库夹具）、M15（本报告与定稿）。四类证据齐备：jsdom 先红后绿（逐项有失败条数）、`npm run typecheck`、静态门禁与 pre-commit 钩子（typecheck + vitest related）、以及整轮浏览器实测（见下）。

**收尾整轮实测（全新实例 `:7728`，`INKSTONE_EPHEMERAL_DEV=1`）**：`scripts/e2e.mjs` **177 通过 / 0 失败**；`scripts/e2e-visual.mjs` **633 通过 / 0 失败**（上一轮的两条红——看板块高度、分享中心——已查清根因并修掉，见 M21）。音乐场景零失败，包含本轮修掉的四处（FB3-C9 的密度两读、FB3-C10 的扫描前置、以及音乐场景自己的收尾缺陷）。

**M21 的入库方式**：三个原子提交，`dbd44721`（看板块的上限与门禁读数）、`0fbe397c`（打印 sheet 的图表去掉入场动画）、`63e1c63c`（分享场景与音乐场景收尾）。前两个与第三个共用 `scripts/check-comments.mjs` 与 `scripts/e2e-visual.mjs`：按 AGENTS.md「分批与门禁」的做法，工作区停在最终状态、只把本批的 hunk 放进暂存区（`git apply --cached --recount`），并用 `git archive HEAD` + 暂存版本重放出三个快照，各自单独跑过 `comments:check`（A 11 596 条 / B 11 616 条 / C 11 620 条，均 1205 文件 ✅）与 `size:check`。

**M13–M20 的入库方式**：M13/M18/M18b/M18c/M7b/M11b 各一次原子提交（`b7725175` / `24d8f573` / `c1ab73ae` / `916c10f0` / `fd706ae5` / `e9b52c6a`）；M19 与 M20 各一次原子提交（`25aa4016` / `4b8063be`）。这两次都改了 `scripts/check-comments.mjs` 的白名单——同一文件、两个批次，按 AGENTS.md「分批与门禁」的做法只暂存本批的 hunk（`git apply --cached --recount`），并用 `git archive HEAD` + 暂存版本重放的快照单独跑过 `comments:check`（快照 A：11 585 条 / 1205 文件 ✅），工作区始终停在最终状态。

**入库方式（第二批）**：`951223c3` 同时带上了 M6 与 M16/M17 的改动——M16/M17 是同一份 `scripts/e2e-visual.mjs` 里的修复，而 M6 那一提交用路径法一次性暂存了整份文件（含 `check-comments.mjs` 的白名单重建），于是它们跟着一起落库。顺序上这反而较合理：先落能读到东西的门禁，再落依赖它的范围断言（三条新断言的通过证据就来自同一工作区的那一轮实测）。与 M3/M1b 一样，不重写已提交历史，这里如实登记；后续条目恢复「一项一提交」，提交前先 `git status` 确认暂存区只有本项文件。

**入库方式（第一批）**：`958f5cdc` 同时带上了 M3 与 M1b 的改动（M1b 的两个文件在先前一次被 i18n 门禁拦下的提交尝试里已进暂存区，而这次用了 pathspec 提交，于是它们跟着 M3 一起落库）。结果是对的、可追溯的（提交说明里写清了 M1b 的探针结论），但不符合「一项一提交」。按铁律不重写已提交历史，这里如实登记；后续条目仍按一项一提交，提交前先 `git status` 确认暂存区干净。

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

**探针同时量出门禁本身的一个缺陷（FB3-C5）**：整轮 `scripts/e2e-visual.mjs` 在全新实例上会在「music: the hub lists the seeded tracks」提前返回——夹具刚上传的两条探针曲目，客户端因为 `LIBRARY_FRESH_MS = 60s` 的库缓存（早于上传的一次加载）而看不到，于是该轮音乐场景（含本轮新增的断言）全部未执行。既有各轮之所以绿，是因为跑在积留了探针曲目的长寿命实例上。**已修**（`951223c3`，随 M6）：音乐场景在读数前按工具栏自带的刷新控件强制一次库加载，并先断言「两条探针曲目已进入客户端库」。

**收尾轮的几何证据（FB3-C9 的整轮读数，不再是探针）**：同一台机器上的一次性探针把「窗口被拖窄」这一路读穿（读法与门禁 `readMusicListDensity` 相同）：修前 `hub 1060 / 中心列 538 / 表宽 572`（行比盒子宽，10 格），修后同一情形 `538 → 7 格、表宽 538`（无溢出），最大化后 `960 → 10 格`；窗口态 1240（中心列 718）也从 10 格收到 7 格。整轮门禁里那两条密度断言由红转绿（run12：611 通过 / 5 失败 → run13：615 通过 / 2 失败，音乐场景零失败 → 收尾定稿轮：**633 通过 / 0 失败**）。

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
| 2026-09-29 | M21c 分享场景从干净外壳开始（音乐场景收尾真的关上音乐库） | `63e1c63c` | 先用探针复现整轮那条红：音乐库开着时按侧栏「分享」→ 管理控件 15s 不出现（与门禁同一句报错）；关掉库后同一调用 `opened:true`。根因是音乐场景收尾只按一次 Escape，而它刚按过的「清除搜索」会把历史浮层重新打开，那一层按设计先吃掉这次 Escape（FB2-U8），于是库留在屏幕上，下个场景按的是它的遮罩。实现：`closeMusicHub`（按到窗口消失，至多 3 次）+ 场景末尾一条「外壳干净」断言；`openShareCenter` 改为回报停在哪一步（附侧栏当时画了哪些按钮），`check-contrast.mjs` 两处调用点跟随 | 音乐场景的收尾因此多了一条断言（库不再留到下一个场景）；这三个探针（看板块高度、分享路径、打印 sheet 图表）已在提交前删除 |
| 2026-09-29 | M21b 打印与导出的图表不再带入场动画 | `0fbe397c` | 探针按 20ms 采样出根因：sheet 标好 ready 之后 t+932ms `painted` 从 1569 掉到 203 再爬回——一次 reflow 的 resize 把画布清掉并重播动画，门禁因此偶发报 `live=1 painted=0`。实现：`renderChartJs` 收 `instant`（写 `animation:false`），`enhancePreview` 收 `instantCharts`，打印 sheet 声明它；`enhance.test.ts` 新增一例钉住契约（instant 的表 animation 为 false、默认表保持 fence 自己的写法）。回归：`npx vitest run src/client/lib/markdown src/client/features/presentation` 绿；探针复测首个采样即 1569 且不再波动；pre-commit 的 `vitest related` 96 文件 / 842 例 ✅ | jsdom 里库拒绝桩 canvas，单测只能钉住交给库的配置；像素由视觉门禁读（同一轮 633 通过 / 0 失败）。导出的笔记 PDF 走的是另一条路（画完即把 canvas 转图片），同样受益于这个选项，但本次未改它的调用点 |
| 2026-09-29 | M21a 看板块的上限改由板自己承担（门禁读数同时改为「覆盖画出来的那棵树」） | `dbd44721` | 整轮那条红暴露的是两件事：门禁只把「头部 + 板」算作画布该覆盖的东西（漏了板根里那条逾期提示条，31px），而更深的缺陷是上限写在画布上——画布是整块的盒子，头部 103 与提示条 31 都在吃板自己的 480 预算。探针用 30 张卡的板量出 `canvas 480 / 树内 614 / boardClip 134`（横向滚动条整条被切），把上限移到板上后 `canvas 614 / boardClip 0 / scrollClip -16`。实现：`styles/kanban.css` 的画布去掉 `max-height`（上限仍在板上）；`tests/kanban-canvas-height.test.ts` 的文档头与此处同步；门禁的读数改为画布内那层的子元素高度之和，留空与被切两个方向都报红。回归：`tests/kanban-canvas-height.test.ts` 8 例 ✅、`size:check` ✅、整轮 `scripts/e2e-visual.mjs` 633 通过 / 0 失败 | 上限现在只约束板（滚动的那一半），所以一块满板在笔记里的块高是「头部 + 提示条 + 480」，比过去高出一个头部；这是有意的——过去那一个头部的高度是直接切掉的 |
| 2026-09-29 | M18b 补：旧建议浮层的四个分组键随浮层一起删掉 | `c51e83f4` | 收尾跑全量单测时 `tests/music-locale-keys.test.ts`（「每个音乐键都要被说出」）报出 `music.suggest_{artist,album,playlist,online}` 已无人引用——M18b 把建议搬进面板后，面板按行给标签（库内 / 音源名），不再画分组标题。处理：四个键从两侧语言文件删掉（死代码，铁律 5），`i18n:check` 3829 → 3825 键、两侧齐平；白名单与 size 基线跟着重建（两个语言文件短 6/4 行）。回归：该测试文件 ✅、`i18n:check` ✅、`comments:check` ✅、`size:check` ✅ | 旧浮层的分组语义（歌手 / 专辑 / 歌单 / 在线）在面板里由每行自己的元信息承担，不再需要分组标题；以后若要分组再按新形态新增键（不复活旧键） |
| 2026-09-29 | M20 FB3-C10 工具栏扫描的音乐库条目自备夹具 | `4b8063be` | 先在整轮里读到缺陷：全新实例上 `toolbar stability: the music hub opened with its content, not an error state` 报 `{"count":0,"settled":0}`（同一检查在长期实例上因上一轮残留的行而通过）。实测也确认了它是先于音乐场景跑的——接口门禁 `scripts/e2e.mjs` 一条音乐都不碰，所以全新实例的库在那一刻确实是空的。实现：扫描条目可声明 `fixture`，音乐库这条先 `seedMusicProbeTracks` 并把「内容到位」记成一条断言；内容读数提为 `readSweepContent`，在 15s 期限内等到自己那一行出现（不是放宽断言——空表面仍会在下面的检查里报红）。回归：全新实例整轮 `scripts/e2e-visual.mjs` **615 通过 / 2 失败**（两条皆非本模块），扫描六条全绿（含新增的前置断言） | 重试次数与内容无关：等不到就是报红，不会被包装成通过；目前只有音乐库这条需要夹具，其余表面画的是页面已有的东西 |
| 2026-09-29 | M19 FB3-C9 曲表密度的测量分层（先红后改） | `25aa4016` | 先在浏览器里量出根因：`hub 1060 / 中心列 538 / 表宽 572`（全 10 列，行比盒子宽 34px），而 `useElementWidth` 只有一个挂载时挂一次观察者的 effect——列表先画加载态（`MusicTrackList` 的早返回），它要量的那个盒子是行到之后才挂上的，于是观察者永远没挂上，`containerWidth` 永远是 `null`，密度一直回退到视口答案（1440 视口 → 三列全开）。先红（单测）：`music-track-table.test.ts` 新增 FB3-C9 一例（先加载态、后到行，盒子 520、视口说宽）对 HEAD 跑 **1 failed / 16 passed**；`src/client/lib/hooks.test.ts` 新增 3 例（后出现的盒子也能量 / 挂上即读 / 无尺寸的盒子保持未测），变异证明：去掉「挂载即读」→ 第 2 例红，去掉 `observe` → 第 1、3 例红。实现：`useElementWidth` 改为交回 ref（callback ref），节点出现即挂上观察者，并在同一次提交里读一次内容盒宽（与观察者报的同一口径）；5 个调用方改为解构 `{ ref, width }`。回归：`npx vitest run src/client/features/music src/client/lib` **321 文件 / 3 126 例 ✅**；`npm run typecheck` ✅；10 项静态门禁 ✅；整轮 `e2e-visual.mjs` 上两条密度断言由红转绿 | 面板在测量前的首帧仍按回退答案画（现在那一刻是「盒子刚挂上、同一次提交已读到」）——真正未变的是 jsdom：那里 `clientWidth` 恒为 0，所以保持 `null` 并继续用回退答案（这正是既有的契约，不是新缺口）。行内替代文字的样式随密度切换，未做第三档（更窄的容器没有更细的形态） |
| 2026-09-29 | M18c 门禁两处读数按列表来源取 | `916c10f0` | 建议条进面板后，`heldRead` 按 `li` 找行会先撞上同名的建议行（其按钮文本是「名字 + 元信息」），改为从 `[data-provider-results] > li` 取；建议条改为从面板元素内部取（逗号分隔的作用域 `a, b [x]` 其实是两个选择器，第一个就会命中）。浏览器探针按同一读法复测：`stripNamed: true`、该命中行按钮 `["","","已在库中"]`、两次指针按压各自勾上、批量 201/200/201 且库中两首俱在 | 这是门禁自己的读法缺陷（不是产品行为）；同批把「压中就勾上」写成断言，替代原先「浮层挡着面板」的那对读数 |
| 2026-09-29 | M18b FB3-C7 搜索建议搬进在线面板（先红后改） | `c1ab73ae` | 探针先量出根因：建议浮层的盒子 x298..886 / y191..314，而首行勾选框在 x297、首行动作按钮在 x689..807——浮层正压在这些控件上，指向勾选框的按压落在建议行上（旧实现还会因此把播放器带走）。处理：把「库内跳转目标 + 音源命中」做成面板自己的行（新模块 `music-provider-suggestions.tsx`，`data-provider-suggestions`，词与答案直接从 store 读），搜索框浮层回到只剩历史（词非空即不画），音源行改为把标题交给搜索，`music-search-suggestions.ts` 建分组前滤掉没有艺术家/专辑的缓存行（面板每次在线答案都会调它，一行坏数据不该把面板带崩）。先红：`music-search-box.test.ts` 的在线建议用例改为「按字面去搜、播放器未被触碰」（旧实现 1 failed），新模块 4 例。回归：`npx vitest run src/client/features/music src/client/features/settings/music-settings.test.ts` **1034 例 ✅**、`npm run typecheck` ✅、静态门禁 ✅（面板一度 566 行超 500，拆出建议条模块后回到限内，未动 size 基线） | 建议行的「已在库中在先」随 `buildSearchSuggestions` 的既有规则，与命中列表的排序是两条规则；同一首曲子既出现在建议行又出现在命中行是刻意的（建议行按字面改词、命中行是动作面），门禁读数已按列表来源限定 |
| 2026-09-29 | M18 FB3-C6 建议行按字面去搜，不接管播放器（先红后改） | `24d8f573` | 先红：把实现 stash 只留测试，`music-search-box.test.ts` 的在线建议用例 **1 failed**（旧实现按下去确实播放了）。实现：在线建议行改为写入并提交该行标题，删掉随之不再需要的 `play` 管道。门禁：勾选改用真实指针按压并读回 `aria-checked`（压中即收起建议浮层）；删掉探针期的调试输出 | 本项当时的落点还在浮层里；M18b 把同一规则搬到面板的建议条上（那里按字面改词仍是它的语义） |
| 2026-09-29 | M11b FB3-F4 声明过的下载偏好会真的带进新会话 | `e9b52c6a` | 设置页的 axe 检查报出两个 `role=switch` 没有 `aria-checked`：`downloadQuality` / `offlineWithCover` / `offlineWithLyric` 三项被读回却没写进会话初始状态（于是开关没有 `checked`，下载也会去问一个没人指定的音质）。实现：`initialLibraryState` 增加 `initialDownloadState(prefs)`。先红：`provider-prefs.test.ts` 新增「从已存偏好构建的新 store 就带上这三项」（旧实现重导出后三项为 undefined） | M11 的补丁项；同一屏的其它偏好（在线音质、逐源开关）此前已各自落地 |
| 2026-09-29 | M7b FB3-P1 绕道单源再回聚合不再重问 | `fd706ae5` | `setProviderScope` 不再清会话检索记忆：记忆按 `(范围,关键词)` 键控，窄范围的答案本来就不可能顶替聚合的答案，而聚合已付过的代价仍是同一个问题的代价（开关与顺序变更仍清，那才是另一个答案）。先红：`providers.test.ts` 新增「绕道 migu 后回到 all，仍由会话作答」，旧实现下第 3 次检索会再扇出 5 次 | M7 的 TTL（30s）与会话上限（20 条）不变，本项只去掉一处过度的失效 |
| 2026-09-29 | M13 FB3-F7 坏链可一次全部补齐（先红后改） | `b7725175` | 先红：把实现（health/library/types/modal/locales）逐个 stash 只留测试，六个文件得 **15 failed / 76 passed**。实现：`health.ts` 抽出 `repointDeadTrack`（问别的音源 → 移入回收站 → 从结果里摘掉该行），新增 `repairDeadReferences(ids)` 按 3 并发跑整份死链清单、只报一句汇总；`music-health-modal.tsx` 页脚抽出 `HealthFooter`，新增「为 N 行换源补齐」（计数只含 provider 行，其它行没有音源可问）；双语补 `health_repair_all` / `health_repaired`。回归：`npx vitest run src/client/features/music` **122 文件 / 1032 例 ✅**、`npm run typecheck` ✅、13 项静态门禁 ✅；pre-commit 钩子当轮跑全量单测 **359 文件 / 3192 例 ✅** | 修复只作用在「扫描已判定失效」的行上；没有任何别的音源可问的行留在列表里并给出既有文案（`source_switch_none`），不静默删行 |
| 2026-09-28 | M11 FB3-F4 下载设置与离线媒体（先红后改） | `19bc5836` | 先红：把实现（state/types/persist/transfers/offline/library/offline-audio/music-settings/locales/pwa.config）逐个 stash 出去、只留测试，跑六个文件得 **15 failed / 76 passed**（SW 的新协议 3 例、offline-audio 的 extra 3 例、设置页 3 例、offline store 2 例、provider-prefs 3 例、transfers 1 例）。实现：偏好加 `downloadQuality` + `offlineWithCover`/`offlineWithLyric`（落库与读取白名单同一处）；`downloadTracks`/`retryDownload` 改读 `downloadQuality`；保存前把两项开关作为 `OfflineExtras` 交到 `saveTrackOffline`，由它在同一个 store 消息里带上封面与歌词（取不到的封面或歌词只少那一样，不连累音频）；service worker 侧新增 `AUDIO_MEDIA_PATTERN`（stream/cover/lyric 同一套网络优先 + 离线回源规则）、`readOfflineExtras`（只认本曲自己的两个媒体路径）、预算把 extras 计入、淘汰与删除都按曲目整体进行。设置页新增「下载与离线」组（下载音质选择器 + 两个开关，用的是与在线音质同一个 `Select`/`Switch`）。回归：`npx vitest run src/client/features/music src/client/features/settings tests/offline-audio-sw.test.ts src/client/lib/offline-audio.test.ts` **127 文件 / 1066 例 ✅**；`npm run typecheck` ✅；13 项静态门禁 ✅ | 门禁的 `assertMusicSettingsLayout` 里那条顺序读数从三组改成四组（多出「下载与离线」），断言与 `LABELS.musicSettingsGroups` 同步；本轮未在真实浏览器里量这一组的位置（见下） |
| 2026-09-28 | M14 FB3-U7 沉浸层两行「多少」的行为分级 | `本轮 M14 提交` | 先红：新增一例对 HEAD 跑得 **1 failed / 26 passed**（计数行没有把「可展开」画出来）。读出的结论：两行确实不同级——队列计数行是 discloseditor（有 `aria-expanded`、有悬浮变色），而「时长 · 体积」是事实；但前者只靠悬浮色表达可点，静止时与下面那行长得一样（且悬浮在触屏上不存在）。处置取「可视指示」：三处队列计数控件（沉浸头部行、折合条带入口、已展开面板的收起键）的谢夫龙加 `data-queue-chevron` 与 `aria-hidden`，头部那枚随开合旋转，于是静止态也能区分；「时长 · 体积」保持纯文本（断言它既不在按钮里、里面也没有按钮）。回归：`npx vitest run src/client/features/music/music-immersive-player.test.ts src/client/features/music/music-immersive-queue.test.ts` **33 例 ✅** | 门禁的沉浸层场景本轮只读高度/滚动/默认态，未新加几何断言（本次只加了装饰性图标，不改变布局高度——头部高度断言仍在同一场景里守住） |
| 2026-09-28 | M12 FB3-F6 设置页分组顺序 | `a9c93e6a` | 实现：`MusicSettings` 的三个分组改为「播放默认 → 在线音源 → 音乐服务器」，并把「为什么是这个顺序」写在注释里（读者抵达时的提问顺序）。测试：`music-settings.test.ts` 新增一例，读渲染后 `h3` 的顺序断言三个分组标题的相对位置；门禁在 `assertMusicSettingsLayout` 里新增一读（三个分组标题的位置递增，每项允许多种拼写所以中英皆可），与布局两读同一次打开、同一主题。回归：`npx vitest run src/client/features/settings` **18 例 ✅**；`npm run typecheck` ✅ | 门禁新读数与设置页布局读数同批（本项只动顺序，不动布局，两者互不影响） |
| 2026-09-28 | M10 FB3-F3 设置页补音量/倍速/睡眠入口 | `d54ef06d` | 无先红（新增入口与既有能力同源，不改变任何现有断言的预期）：`music-settings.test.ts` 新增两例，对 HEAD 跑为红（行不存在），实现后转绿——包含一条真实拖动：`input[type=range]` 置 35 后 `volume` 为 0.35。实现：设置页「播放」组前插三行（`MusicVolumeSlider` / `MusicRateButton` / `MusicSleepButton`，均为播放器弹层与传输菜单的同一组件），音乐 barrel 透出这三个组件。回归：`npx vitest run src/client/features/settings` **17 例 ✅**；`npm run typecheck` ✅ | 未新造控件（铁律 10：全部复用既有组件，滑杆就是播放器里那一个）；睡眠定时入口在设置页与传输菜单上是同一个 Menu，状态互通 |
| 2026-09-28 | M9 FB3-F8 在线建议进搜索弹出层（先红后改） | `d0e9acff` | 先红：`music-search-suggestions.test.ts` 新增五例对 HEAD 跑得 **3 failed / 5 passed**（在线行不存在、库中命中不排前、封顶不正确）；弹出层两例后加（先红由类型断言缺失阶段覆盖，已记入上表该批）。实现：`MusicSearchSuggestion` 加 `kind: 'online'` 与可选的 `hit`/`inLibrary`（`scope` 变可选），`buildSearchSuggestions` 收 `online?: { hits, keywords }`：只在 `keywords` 仍等于当前输入时列入，按标题/歌手匹配、库中已有的排在前、封顶 3 条；弹出层给在线行第二行文字（已在库中 / 音源名）与 `music.suggest_online` 的可访问名称，选中即 `playProviderTrack` 并清空关闭（在线命中可能还不在库里，「跳转」无目标可跳）；`SearchBox` 的本地/在线建议抽成 `useSearchSuggestions`。回归：`npx vitest run src/client/features/music` **121 文件 / 999 例 ✅**；`npm run typecheck` ✅；i18n/注释/尺寸/预算四项门禁 ✅ | 未新增第三方接口（只用面板已有的聚合命中）；在线建议的行数与面板的 max-h-96 列表相互独立，但两者同源所以不会不一致 |
| 2026-09-28 | M8 FB3-F2 逐源开关与顺序（先红后改） | `041f7e2f` | 先红：把实现回退后跑新测试，**8 failed / 53 passed**（`selection.test.ts` 新模块不存在整文件红；设置表 3 例、面板 2 例、`gds` 扇出 3 例）+ 经窄范围回退再测偏好组 **3 failed / 7 passed**（逐源开关、排序落库、脏值读取）。实现：新增 `providers/selection.ts`（`orderedSources` / `enabledSources` / `scopeSources(scope, selection)` / `moveSource`，均对未知名、重复名与越界移动做归一）；扇出决策从 `searchGdsPages` 移到调用方（现收 `sources` 列表），`gds.ts` 在请求边界上继续过滤非共享列表名（FB3-S1）；偏好加 `providerSourceEnabled`（只存 `false`，缺省即开）与 `providerSourceOrder`（读者序在前、共享序在后），读取时丢弃非法名，并把指向已关闭音源的 scope 归一为聚合；`setProviderSourceEnabled`/`moveProviderSource` 落库并清检索记忆；设置页新增 `SourceTable`（每源一行：上移/下移 + 自己的开关，端点上按钮禁用）；面板的范围选项只列已开启的源，无源可问时显示专门文案而不是「没有在线匹配」。回归：`npx vitest run src/client/features/music src/client/features/settings` **125 文件 / 1017 例 ✅**；`npm run typecheck` ✅；13 项静态门禁 ✅ | 合并顺序（`mergeProviderResults`）与换源候选（`rankAlternatives`）都读同一张表，因为两者都是「更希望这首歌出自哪个源」；`budget:check` 的 `music` 上限 96_000 → 100_000（共享 store chunk 实测 96.8 KiB，本轮三个特性都在里面；理由与实测写在 `scripts/check-bundle-budget.mjs` 注释里，属 SHOULD 例外，已登记） |
| 2026-09-28 | M7 FB3-P1 检索成本的会话记忆（先红后改） | `ed6d3d6d` | 先红：把实现回退后跑 `providers.test.ts`，该文件 **22 failed**（新导入的 `PROVIDER_SEARCH_MEMO_MS` / `clearProviderSearchCache` 不存在，整文件失败；其中五例是 M7 新增：重复查询仍扇出 5 次、换范围不复问、TTL 过期不复问、`force` 不复问、关开关不清记忆）。实现：`music-store/providers.ts` 加模块级 `Map` 记忆（键 `scope\nkeywords`，`PROVIDER_SEARCH_MEMO_MS = 30s`，上限 20 条，只活在本会话、不落库）+ `clearProviderSearchCache()`；`searchProviders` 收 `{ force }`，命中记忆则不置 `providerSearching` 直接回填结果与失败源；`setProviderEnabled(gds, false)` 清记忆（读者已离开该答案的状态）；面板的重试按钮走 `{ force: true }`（重试是「再问一次」而不是「翻记忆」）；`types.ts`/`library.ts` 同步签名。回归：`npx vitest run src/client/features/music` **120 文件 / 980 例 ✅**；`npm run typecheck` ✅；13 项静态门禁 ✅（注释白名单与 size 基线同步重建）。门禁：把 M6 新增的第三条读数改成更强的版本——回到聚合时**不再新增任何上游请求**（`searches - beforeNarrow === 1`）而命中仍重新列出 | 记忆不落库：上一次访问的目录状态不能当成当前事实。上限 20 条只约束单会话内存；未做主动失效（上游曲库变化），TTL 到期即自然重问 |
| 2026-09-28 | M6 FB3-F1 + FB3-U6 + FB3-S1 单源检索范围（先红后改） | `951223c3` | 先红（单测）四个文件八例：`gds.test.ts` 新增「单源只问一个上游」（对 HEAD 仍返回 5 页）、`scopeSources` 尚不存在；`providers.test.ts` 新增「只问 scope 指名的那几个」（对 HEAD 仍是 5 次请求）；`provider-prefs.test.ts` 新增两例（偏好不落库 / 非法值不回退）；`music-provider-results.test.ts` 新增两例（头部同排的选择器不存在 / 改范围不再扇出）与一条改写的失败文案用例（`providerFailureKey` 改为带「本次问源数」）——对 HEAD **8 failed / 54 passed**。实现：`providers/gds.ts` 加 `PROVIDER_SCOPE_ALL` / `PROVIDER_SCOPES` / `isProviderScope` / `scopeSources`（聚合回的是 `GDS_SOURCES` **本身**，非法值同样走聚合，所以未列名的 slug 不可能进 URL），`searchGdsPages/searchGds` 收 `scope`；`music-store/state.ts` 加 `providerScope` 偏好与白名单校验（`readListed`）；`providers.ts` 加 `setProviderScope`，`searchProviders` 把 `get().providerScope` 传给 `searchGds`（换源/自动补齐**不**走 scope，它们的意义就是找别的源，已写在注释里）；`music-provider-results.tsx` 把选择器与开关放进同一行（`data-provider-header` / `data-provider-scope`），撤销搜索的 `useEffect` 抽成 `useProviderSearch` 并把 scope 列入依赖（换范围即重新问，不等下一次击键）；失败文案按「本次问源数」分档。回归：`npx vitest run src/client/features/music` **120 文件 / 975 例 ✅**；`npm run typecheck` ✅；13 项静态门禁 ✅。门禁新增三读（选择器与开关同排、六项取值、收窄后只剩一个上游、还原聚合） | 范围是客户端减少请求的手段，不是服务端信任的输入（FB3-S1）——本轮没有给 worker 传任何新参数，出站白名单一字未改；换源/自动补齐仍固定向全部上游问（见上）。三条新门禁读数的整轮实测见 M16/M17 行 |
| 2026-09-28 | M16 + M17 FB3-C5 与本次实测暴露的另两处门禁读数缺陷 | `951223c3`（随 M6 入库，见「入库方式」） | 先在浏览器里复现：`assertMusicSearchClear` 的读数在列表已空时仍报 `library: true`，逐元素摸到两个写出曲名的元素分别属于侧栏（`p < header < aside`）与队列面板，证实读得太宽；把该读数改为只读列表自己那一列（`[data-music-content]`）后同一状态下本报 `false`。`assertMusicListDensity` 的两处读数则实测会被测量滞后污染（窄窗上读到 10 列，而手动把窗口由最大化还原后 1 秒内稳定到 7 列，列表自身宽度与中心列同宽、无溢出，排除「内容撑宽导致自锁」），改为「三份相同读数才算定稿」的 `readSettled`。整轮 `e2e-visual.mjs`：**611 passed / 2 failed**（两者皆与本模块无关：看板块高度、分享中心），音乐场景全部断言绿，包括 M16 的新前置断言（`music: the toolbar reload control hands the just-uploaded fixture to the client library` / `music: the hub lists the seeded tracks`）与 M17 的两处 | 测量滞后本身（窗口刚改大小后的前几帧仍按旧宽度画）未在 app 侧处理，登记为已知限制：门禁改读稳定态，而 app 侧该瞬态需要一次真正的测量分层才能消除（见下「已知限制」） |
| 2026-09-28 | M5b 门禁里搜索历史的标签跟随 M5 的新措辞 | `f9a69a0a` | 无需先红：这是门禁自己的字符串与已交付文案不一致（M5 把 `music.search_history` 的 zh 改为「最近搜索」）。M6 复核门禁时读到 `assertMusicSearchClear` 用它拼 `[role="listbox"][aria-label="搜索历史"]`，改后必然选不到历史列，于是「清空查询后焦点留在输入框、历史未被触碰」会假失败 | 这属于「门禁的字符串靠人手抄资源文件」这一整类风险；本项只修当前的错，类级护栏（让标签从资源文件派生，或加一条比对）登记为 **FB3-C11**，**本轮未做**（理由与两条候选路径写在报告 §H）——原先误记为 FB3-C6，那是 M18 的「建议行语义」条目，一个号码不能指两件事；同一次复核还发现两个只存在于代码注释与计划日志里的号码（FB3-C7 门禁读数按列表来源取、FB3-C8「曲库已过滤」的读数范围），落点一并在报告 §H 点名 |
| 2026-09-28 | M5 FB3-F5 + FB3-C4 搜索历史完整度与措辞对齐（先红后改） | `1342d548` | 先红（单测）：`music-search-box.test.ts` 新增三例（停手后落库 / 单字符不落库 / 逐条删除只删那一条），对 HEAD 跑得 **2 failed / 18 passed**（第三条因动作不存在而红，第二条是按规则绿）。实现：`state.ts` 加 `SEARCH_HISTORY_MIN_LENGTH = 2`；`library-load.ts` 加 `recordSearchQuery`（跳过首位重复、persist）与 `removeSearchHistory`；`types.ts`/`library.ts` 暴露；`music-search-box.tsx` 加 `SEARCH_HISTORY_SETTLE_MS = 1200` 与 `useSettledSearch`，历史行渲染为「行（role=option，占满除删除键外的宽度）+ 兄弟删除键」（按钮里套按钮浏览器不会把按压交给内层）；`music.search_history` 中文改「最近搜索」。回归：`npx vitest run src/client/features/music` **120 文件 / 965 例 ✅** | 落库规则依赖「读者停手」，所以快速改词不会留下半截前缀；这与「提交即落库」并存，两者都幂等（同一条会提到最前） |
| 2026-09-28 | M4 FB3-U4 + FB3-U8 搜索空态措辞与动作名（先红后改） | `e667efbb` | 先红（单测）：`music-empty-states.test.ts` 新增三例（库内无命中且在线有两条时说明上方有两条 / 动作叫「显示全部歌曲」而不再叫「清除搜索」/ 在线面板没有结果时不承诺），对 HEAD 跑得 **2 failed / 6 passed**；同时改掉一条既有用例（它按旧动作名点击）。实现：`music.no_results` 改为「曲库中没有匹配的歌曲」、新增 `music.no_results_online` 与 `music.search_show_all`（双语）；`music-track-list.tsx` 的 `NoTracks` 读 `providerResults.length`，有命中才补那一句。回归：相关三个测试文件 **46 例 ✅** | 在线命中数是本地渲染态（不是服务端事实），但它正是画面上方列着的东西，所以这句话跟着实况走 |
| 2026-09-28 | M3 FB3-U3 + FB3-C2 设置面板三处（先红后改） | `958f5cdc` | 先红（单测）：`music-settings.test.ts` 新增两例（服务器说明只出现一次且表单换成动作向的说明 / 五个字段共用一组标签列）+ `music-eq-presets.test.ts` 新增一例（预设行向自身容器换挡），对 HEAD 跑得 **3 failed**。实现：`MusicEqPanel` 根加 `@container`、预设行加 `@sm:grid-cols-5`（弹层 224px 仍是三列）；`ServerFields` 改 `grid-cols-[auto_1fr_auto_1fr]` 且每个字段 `col-span-2 grid-cols-subgrid`（标签列由整个表单共有，不再各自量字）；表单去掉与小节重复的那句 `music.server_hint`、改为新增的 `music.server_form_hint`（双语），并去掉与按钮同名的表单小标题。回归：`npx vitest run src/client/features/settings src/client/features/music/music-eq-presets.test.ts` **5 文件 / 29 例 ✅**；`npm run typecheck` ✅。门禁：新增 `assertMusicSettingsLayout`（五个预设同一顶边 / 五个字段的两列左缘各对齐）+ `LABELS.musicEqPresets` | 门禁场景本身随 FB3-C5（全新实例上的音乐空读）尚不能在整轮里跑到，实测证据来自同读法的浏览器探针（见下） |
| 2026-09-28 | M1b 探针实测修掉的一处：× 之后弹出没打开 | `958f5cdc` | 浏览器探针首次跑出：点完 × 后弹出是关的（`historyRows: 0`）——因为「提交搜索」的 Enter 已经把弹出收起来（`close()`），而按下 × 在 Chrome 里 `activeElement` 仍是输入框（按钮不取焦），于是 `onFocus` 不再触发，仅靠交回焦点恢复不了历史形态。实现：`clearQuery` 显式 `setOpen(true)`（“清空后回到历史形态”不再依赖焦点事件）。同时修掉 M1 门禁里的两处标签错误（`musicSearchHistory` 不存在、`search_clear_history` 的中文是「清空历史」）。探针重跑 **13/13 全绿** | 代码层修正，jsdom 用例本来就绿（jsdom 会移焦，所以旧机制在那里看起来是对的） |
| 2026-09-28 | M2 FB3-U2 + FB3-U9 + FB3-C3 沉浸层队列默认态分档（先红后改） | `6ade04bc` | 先红（单测）：`music-immersive-queue.test.ts` 新增 FB3-U2 组三例（宽版刚挂载即已在封面列且带搜索 / 堆叠形状仍默认折叠且入口行在位 / 读者折合后重渲染仍保持），对 HEAD 跑得 **4 failed / 2 passed**（连同两个按旧默认写的既有用例）。实现：`useQueueFold(stacked)` 用 `chosen: boolean | null` 表示「读者还没选」，未选时按形状给默认（`!stacked`），调用点改为 `useQueueFold(stacked)`。`music-immersive-player.test.ts` 的四处按旧默认更新（队列焦点停靠改为「宽版默认出场、折合后消失」；看板视频舞台的「无封面图」改为排除队列自己的行封面）。回归：`npx vitest run src/client/features/music` **120 文件 / 958 例 ✅**。门禁：`assertMusicImmersiveQueue` 重写为「宽版就位（已开）/ 整行可见且左列不长出第二滚动条 / 折合 / 头部高度不变 / 封面让位 / 搜索收窄 / 用过后再折合」，`readNarrowQueue` 补 `rows` 与 `lyricsScrolls`，375px 场景补一条 | 门禁未跑（与 M1/M3 一起在同一实例上跑一次）；「窄版默认折叠」在门禁里读不到纯粹的默认态（折合状态随表面存活，先前的宽版场景已经写过一次），因此该默认由 jsdom 的新挂载用例钉住，门禁只断言窄版折合后的行为与成本 |
| 2026-09-28 | M1 FB3-U1 + FB3-U5 + FB3-C1 搜索框 × 清查询（先红后改） | `75dec251` | 先红（单测）：`music-search-box.test.ts` 新增 3 例（× 清空输入与 store 查询且不动历史 / 清空后焦点仍在输入框并回到历史形态 / 弹出里的动作仍只清历史），对 HEAD 跑得 **2 failed / 15 passed**——× 走的是 `clearAll`（清历史），输入框文本与 store 查询都没动。实现：`useSearchPopup` 新增 `clearQuery`（`setText('')` + `flush('')` + 收起高亮），`SearchBox` 给输入框持有 ref 并在 × 后把焦点交回。回归：`npx vitest run src/client/features/music` **120 文件 / 955 例 ✅**；`npm run typecheck` ✅。门禁：新增 `assertMusicSearchClear`（四读：无命中即空态 / × 清查询且列表回来 / 焦点在框内且历史未被触碰 / 弹出动作只清历史），`LABELS` 补 `musicSearchClearHistory` 与 `musicSearchEmptyAction` | 门禁四条断言与 M2/M3 的门禁改动一并跑（同一实例一次运行），结果记在 M3 的进度行；只跑单测时这四条未被执行 |
| 2026-09-28 | M0b 按「全做」重写两份文档 | `c59a3e5e` | —（无代码改动） | — |
| 2026-09-28 | M0 文档基线（三次复审报告 + 执行计划） | `6bb60132` | —（无代码改动） | 报告中的对标结论以参考项目源码/README 为据，未运行参考项目 |
