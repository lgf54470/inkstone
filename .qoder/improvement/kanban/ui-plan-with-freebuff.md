# 看板（```kanban）UI/UX · 功能 · 性能 · 安全 全面审查报告 与 施工计划 · Freebuff 轮次

> 依据：用户 2026-09-23 的界面走查（4 张截图 + 5 条点名现象）与本次全模块代码走查（`src/client/lib/markdown/kanban/`，17,466 行非测试代码、77 个测试文件）。
> 基线：`dev`，HEAD `8df730b3`。
> 条目 ID：本轮用 `KU-nn`（既有 `K-nn`/`SH-nn`/`F-nn`/`L-nn` 属旧轮次台账，`UI-nn` 属 music 模块，均不复用）。
> 施工原则：逐项修复 → 先写能失败的复现测试 → 跑回归与门禁 → 单项提交（Conventional Commits，正文逐文件）→ **同一次提交内更新本文件**。
> 用户裁定：① 标题重命名保留双击 + 单击延迟守卫；② 全屏卡片详情改右侧 peek/Drawer；③ 报告先行落盘，随后在 `dev` 逐项修复并每次提交更新本文件。
> 每项收尾的验证命令见文末「固定验证」；旧轮的 K-xx 台账见 `plan-with-freebuff.md` / `review-with-freebuff.md`，本文件只承接 UI 轮。

## 勾选清单

### 批次 1 · P0 UI 结构（用户点名的 5 条全在这里）

- [x] KU-01 弹出面板统一锚定（用户点③；含新发现：图标选择器无锚点、详情内面板被对话框滚动区裁剪）—— 实做见下，「Portal 化」被否，理由在条目内
- [x] KU-02 活动视图标签指示器 + 标签条溢出可见性（用户点②）
- [x] KU-03 表面层级与列配色（用户点④）—— 阶梯 = 平面 `--bg-inset` → 列 `--bg-surface` → 卡片 `--bg-raised`；列头整条按分组色染色（不再只画 10px 圆点）；表格视图保留「整块面板」形态，理由在条目内
- [ ] KU-04 卡片标题双击竞速守卫 + hover 铅笔 / F2（用户点⑤，方案 A）
- [ ] KU-05 内联紧凑头部：容器查询 + 图标 / Tooltip + ⋯ 溢出菜单（用户点①）
- [ ] KU-06 列不再拉满 + 画布高度自适应 + 滚动条可见性（用户点①的空白行）
- [ ] KU-07 干掉原生 `<select>`，面板结构对齐设置面板（`SettingRow`/`Segmented`/`Select`）
- [ ] KU-08 内联模式显示看板真标题、去掉重复「看板」、canvas 名称随语言刷新

### 批次 2 · P1 功能（把全屏当独立 app 看）

- [ ] KU-11 全屏卡片详情改右侧 peek/Drawer（用户裁定）
- [ ] KU-12 卡片字段可配置（视图级 `cardFields`，卡片显示哪些属性）
- [ ] KU-13 列内快速添加（内联输入 + Enter 连加）
- [ ] KU-14 键盘导航 + 快捷键参考卡（方向键 / Enter / F2 / N / `/` / `?`；重新论证 K-16 的「不立项」结论）
- [ ] KU-15 逾期 / 今天 / 未指派 / 我的任务 快筛 chip
- [ ] KU-16 视图状态与撤销栈分离（搜索/筛选/标签/卡尺寸不压栈，仍写文档）

### 批次 3 · P2 功能与工程

- [ ] KU-21 其他视图拖拽（时间轴/甘特改期、日历拖拽、表格行排序）
- [ ] KU-22 多选拖拽整批移动
- [ ] KU-23 卡片依赖（数据模型 + 甘特/时间轴连线 + 环检测；需 ADR）
- [ ] KU-24 导出/打印（当前视图 → PNG/PDF，复用 `deck-image.ts` 栅格化范式）
- [ ] KU-25 视图级临时状态持久化口径（列折叠/滚动位置/甘特缩放）
- [ ] KU-26 大板护栏（`items` 上限与告警，与 CSV 的 1000 行口径对齐）+ 手动量测脚本

### 批次 4 · 性能（全屏）

- [ ] KU-31 头部每次 render 的 `kanbanActiveItems` / `countTags` / `people` 全量重算
- [ ] KU-32 dnd bundle 未记忆 → 列 `memo` 全线失效（K-19 只兑现到卡片层）
- [ ] KU-33 渲染预算测试（500 卡 × 8 视图）+ 真机量测脚本
- [ ] KU-34 写回成本复测（K-20 已裁定不取自适应静默期；KU-16 后复测视图类提交是否仍需写回）

### 批次 5 · 安全

- [ ] KU-41 文本附件预览的跨源 `fetch` 走外部资源策略 + `AbortController`/超时
- [ ] KU-42 分享/导入来源的 description 预览注入回归（把「宿主渲染器即净化器」钉成门禁）
- [ ] KU-43 护栏：栅栏来源的 URL 字段必须过 `safeKanbanUrl`（扫描测试，防新增渲染面回归）

---

## 0. 结论摘要（按用户 5 问映射）

| 用户提问 | 结论 | 条目 |
| --- | --- | --- |
| ① 内联模式拥挤、有多余空白行 | **成立**：头部用**视口断点**做响应式，但块宽由预览面板决定；画布固定 480px 高而列被 `stretch` 拉伸占满 → 2–3 行空白 | KU-05、KU-06、KU-08 |
| ② 全屏没有活动 tab 指示器 | **成立且比症状更严重**：活动 tab 用 `--bg-raised`，浅色主题下它**等于** `--bg-surface`（都是 `oklch(100% 0 0)` / `#ffffff`）→ 指示器在两种模式下都近乎不存在 | KU-02 |
| ③ 排序/筛选面板不出现在按钮下方 | **成立**：5 个头部面板 `absolute right-0 top-full` 挂在**整条动作行**（`relative`）上，`anchorRef` 只用于点击外部判定、从不参与定位；项目已有 `placePanel`/`usePanelPlacement`/`Menu` 却未使用。另发现：图标选择器没有任何锚点类（落静态位、压住标题行）；详情弹窗内的面板会被对话框滚动区裁剪 | KU-01 |
| ④ 每个看板背景色都一样 | **成立**：板面（`--bg-surface` 白）、列（`--bg-raised`＝白）、卡片（白）三层同色，只靠 1px 描边区分；列的颜色只画成 10px 圆点 | KU-03 |
| ⑤ 双击标题不能就地改名、标题没有置于最顶层 | **成立**：`CardTitle` 同一按钮上同挂 `onClick=onOpenDetail` 与 `onDoubleClick=onStartEditing`；第一次 click 已打开 Modal（遮罩铺满视口 + 焦点陷阱），第二次 click 落在遮罩 → 触发 `onClose`，`dblclick` 目标已变成遮罩 → 就地编辑永不触发 | KU-04 |
| 另：功能是否完整、视图关联 | 8 视图 + 分组/泳道 + WIP + 批量 + 归档 + 评论 + 附件 + CSV + 模板 + 命令面板已具备（体量真实），但卡片字段不可配置、列内不能连加快加、全屏无键盘导航/快捷键卡、时间轴·甘特·日历·表格无拖拽、依赖/导出/提醒缺位 | KU-11…KU-16、KU-21…KU-26 |
| 另：性能与安全 | 全屏无「双重挂载」（同一实例借走 ✅）；真问题是整树同步重渲染 + 视图状态进撤销栈 + 两处 memo 被击穿；安全上发现文本附件预览的跨源 `fetch` 绕过外部资源策略 | KU-16、KU-31…KU-34、KU-41 |

**已核实良好、不必改**（避免误伤）：CSV 公式注入前缀（含全角）✅、围栏加宽防注入 ✅、URL 协议白名单 ✅、外部图片策略覆盖封面/附件 ✅、每列 30 项渲染窗口 ✅、错误边界与「未保存·重试/放弃」✅、两套主题 axe 0 违规 ✅、i18n 键一致 ✅、全屏单实例 + Escape + 焦点归还 ✅。

---

## 1. 条目详情

### 批次 1 · P0 UI 结构

#### KU-01 弹出面板统一锚定（已修）

- **现象**：筛选、排序、分组依据、CSV、归档 5 个面板都出现在动作行右下角同一位置；内联模式下面板可能被块/画布裁掉；详情里点图标钮，面板压住标题输入框。
- **根因**：`kanban-header.tsx` 的 `KanbanHeaderActions` 根 `relative`，5 个面板 `absolute right-0 top-full`（`kanban-filter-popover.tsx:300`、`kanban-sort-popover.tsx:154`、`kanban-view-options.tsx:444`、`kanban-archive.tsx:121`、`kanban-csv.tsx:102`）→ 最近定位祖先是**整行**而非触发按钮；`anchorRef` 只传给了 `useClickOutside`（`filter:279`/`sort:132`/`view-options:431`/`column-menu:267`）。`kanban-icon-picker.tsx:180` 的 `absolute z-[var(--z-popover)] mt-1 …` **既无 top 也无 left** → 落静态位。四处裁剪源：`.ink-prose .kanban-block{overflow:hidden}`、`.ink-prose .kanban-canvas{overflow:hidden}`（`styles/kanban.css:1-8,144`）、板根 `overflow-x-auto`（`overflow-y` 随之变 auto）、`overlay/modal.tsx` 内容区 `overflow-y-auto`。
- **修法（实做）**：新增 `ui/kanban-panel.tsx` —— 一个共用面板，**按自身测量**定位：把面板钉到 `0,0` 读一次它实际落在哪个包含块（`offsetParent` 在 `container-type` 祖先下不一定是那个块，KU-05 正要给头部加容器查询），再用项目既有的 `placePanel` 算出「与触发控件对齐、在其下方、下方不够则翻上、夹在可视盒内」，并同时写 `max-width`/`max-height`（超出即自身滚动）。可视盒 = 视口被所有 `overflow` 非 `visible` 的祖先依次削过（`clipPanelViewport`），所以笔记里 292px 宽的块内不会再有 320px 面板溢出。filter/sort/view-options/archive/csv/icon-picker/column-menu 七处全部改走它。
- **被否：Portal 化**。原计划是 `createPortal` 到 `document.body`，实做时否掉：① 全屏看板是 `Modal`，对话框焦点陷阱把 `Tab` 圈在**对话框自己的子树**里，面板搬到 body 就成了键盘不可达；② 搬进同一棵树改用 `position: fixed` 也不行——覆盖层外壳带 `anim-pop`，其定格 transform 会成为 fixed 子元素的包含块（导图嵌套模板面板正是记录在案的先例），头部的容器查询又往这条链上再加一层 `contain`。故保留 `absolute` + 自算坐标。jsdom 里 `role`/`id`/`aria-label`/触发钮的 `aria-controls` 位置一律不变，`kanban-popover-dismiss.test.ts`(18 例)/`kanban-popover-aria.test.ts` 原样通过。
- **附带**：`tests/client-raw-controls.test.ts` 的 click-container 例外表删掉 archive/csv 两条 —— 那两个文件不再自己写 `stopPropagation` div，该守卫改由 `kanban-panel.test.ts` 的行为断言承担（面板内的按压不冒泡到板子）。
- **范围**：新增 `ui/kanban-panel.tsx` + `ui/kanban-panel.test.ts` + 7 个面板文件 + `tests/client-raw-controls.test.ts` + `scripts/e2e-visual.mjs` + `scripts/check-comments.mjs`（白名单按当前树重算）+ 本文件。
- **代价**：M。
- **验证**：① `kanban-panel.test.ts` 21 例（几何数值、翻转、双向夹紧、包含块测量、按压不冒泡；先红后绿）；② 变异自检——把 `resolvePanelBox` 的锚点矩形换成 `anchor.parentElement`（即「回到挂在动作行上」那版行为）→ **12 例红**，由 `/tmp` 备份字节相同还原；③ 门禁新增 `assertKanbanPanelAnchoring`：逐个按真实指针按下工具栏里 4 个 `aria-haspopup=dialog` 控件，按 `aria-controls` 找到面板，断言「在自身控件下方」「整体在所属表面与窗口内」「在打开它的那棵树里」「空间够时与控件右缘对齐」（空间不够则不许硬判），并先断言指针真的落在控件上；④ 实跑全新实例（`INKSTONE_EPHEMERAL_DEV=1`，:7713）：`e2e.mjs` 177/0、`e2e-visual.mjs` **414/0**、全量 `test:unit` 436 文件 3923 例全绿、12 项静态门禁全绿、typecheck 绿。
- **局限**：① 非模态浮层按仓库约定不接管焦点、关闭后不归还触发钮（与既有 K2-03 登记一致，非本轮新增）；② 面板不跟随滚动容器滚动实时重定位（只在打开、自身尺寸变化与窗口 resize 时重算）——列宽拖拽等导致锚点移动的场景仍会偏移，未登记为缺陷前先留观察。

#### KU-02 活动视图标签指示器 + 标签条溢出可见性（已修）

- **根因**：`kanban-view-tabs.tsx` 活动样式 `bg-[var(--bg-raised)] shadow-[var(--shadow-xs)]`，而 `tokens.css:292-293`（暖纸浅色）与 `:354-355`（纯白）里 `--bg-raised` 与 `--bg-surface` **同值** → 在头部（`bg-[var(--bg-surface)]`）上活动 tab 等于隐形；全屏与内联同病（用户只是在内联模式更容易看出）。实测确认：变异回旧样式后，浏览器门禁读到活动 tab 的背景与「其下方已有的颜色」完全相等（`oklch(1 0 0)` vs `oklch(1 0 0)`）。
- **修法（实做）**：活动 tab 改走全应用既有的「当前项」配对 `bg-[var(--accent-soft)] font-semibold text-[var(--accent)]`（侧栏歌单、放映列表都是这样画的，也是令牌层按 7 个强调色校准过的那一对），两套主题、两种模式同一实现；`font-medium` 下移到非活动态，使选中态不只靠底色。标签条新增 `useSelectedTabInView`：每次 commit 只改**标签条自己的 `scrollLeft`** 把选中标签带回可见区（不用 `scrollIntoView` —— 它会连带拖动上方所有滚动容器，而这行就坐在笔记里）。
- **被否**：① 加 `data-active` 属性 —— `aria-selected` 本就是可机读的选择标记，再造一个没人读的属性就是死代码；② 给标签条加两端渐隐 —— 溢出的真实痛点是「选中的那个跑出视野」，而渐隐不改这一点，且 KU-05 会把标签条收进容器查询布局，渐隐面会跟着重做。
- **范围**：`kanban-view-tabs.tsx`（`KanbanTabList` 拆出 `KanbanTab` 与 `useSelectedTabInView`，避开 50 行函数上限）、新 `kanban-view-tabs-selection.test.ts`（新用例超出单文件行数预算，按仓库「拆分而非 resnapshot」惯例另开一文件）、`scripts/check-contrast.mjs`（kanban 表面 `painted` 增 `accent`）、`scripts/e2e-visual.mjs`（新 `assertKanbanActiveTab`）、`scripts/check-comments.mjs` + 本文件。**未动任何令牌**（`tokens:check` / 漂移基线不变）。
- **代价**：S。
- **验证**：① 单测 7 新例（3 条令牌选择 + 4 条几何滚动），异动自检：把活动样式改回 `--bg-raised` → 2 例红；给 `useSelectedTabInView` 加一行 `if (strip) return` → 3 例红；均由 `/tmp` 备份字节相同还原；② 浏览器门禁：内联与全屏各 3 条（恰好一个活动 tab、活动 tab 的背景**不同于**其下方已有颜色、活动 tab 在标签条可见框内）；变异回旧样式实跑 → 两条「painted」如实报红（其余全绿）；③ `contrast:check` 实测 kanban 表面现在真的画了 accent（`accent 1/1`，两主题各 6/3 组强调底配对重算全过 AA）。
- **发现（登记）**：`element.focus()` 按规范会自带滚动到可见，所以**键盘**切换视图是「自揭示」的，不需要代码帮忙；真正需要 `useSelectedTabInView` 的是不移动焦点的程序化选中（从头部菜单新建/复制/删除/重排视图）——那类路径的断言放在单测（几何数值，已变异验证），因为浏览器门禁里没法在不动文档的前提下造出该状态。

#### KU-03 表面层级与列配色（已修）

- **根因**：三层表面同色 —— 板面无底色（继承 `--bg-surface`）、列 `bg-[var(--bg-raised)]`、卡片 `bg-[var(--bg-surface)]`；浅色主题里 `--bg-raised` 与 `--bg-surface` 同值（`tokens.css:292-293` 暖纸 / `:354-355` 纯白），所以「列 + 卡片」在浅色下是同一块白，只靠 1px 描边分家；列的颜色只画成 10px 圆点（`kanban-column-header.tsx` 的 `getKanbanDotColor`），十二种颜色在读者眼里就是十二个同款小圆点。
- **修法（实做）**：① 阶梯重排为 平面 → 列 → 卡片 = `--bg-inset` → `--bg-surface` → `--bg-raised`（板根、列壳、卡片；折叠列随列壳，画廊卡与列表行同卡片）；② 列头整条染色：`colors.ts` 新增 `getKanbanTintStyle`，给出该分组色自己的 `--kanban-tag-<c>-bg` 底 + `--kanban-tag-<c>-fg` 字——**这正是该调色板校准过的唯一配对**（见 `colors.ts` 顶部注释与 `tests/kanban-tag-contrast.test.ts`），标签与菜单钮因此不再各取层级（新配对没有人量过）；计数徽标保持不透明、染成 `--bg-inset`，于是染底上唯一的文字就是按该底校准出来的那一种；③ 头部不再画圆点（颜色已由整条承载）。
- **决策（自决）**：① **不新造限色令牌**：没有声明颜色的列拿到 `undefined`（不画染底），而不是一个中性灰——「没有这个颜色」与「这个颜色是灰的」是两句话，后者会替读者说一句他没说过的话；② **表格视图保持「整块面板」形态**（容器 `--bg-surface`，行与表头靠分隔线与悬停区分），因为表格是一张表而不是一叠卡；列表/画廊本来就与看板视图同属「卡」，故同行——这是本项有意的边界，不是漏改；③ `ColumnHeaderBand` 从 `KanbanColumnHeader` 里析出：染底那一行是读者看到的东西，菜单接线是另一件事，且析出后该函数体从 54 行降回 43 行（`size:check` 的 50 行硬限；按仓库惯例拆分而不是 resnapshot 基线）。
- **范围**：`colors.ts`、`kanban-board-view.tsx`、`kanban-card.tsx`、`kanban-gallery-view.tsx`、`kanban-list-view.tsx`、`kanban-column-header.tsx`、`kanban-root.tsx`、新增 `ui/kanban-surface-ladder.test.ts`、`scripts/e2e-visual.mjs`（新 `assertKanbanSurfaces`）、`scripts/check-comments.mjs` + 本文件。**未动任何令牌**（`tokens:check` 与漂移基线不变，`check-contrast.mjs` 未修改）。
- **代价**：M。
- **验证**：① 6 例单测（三层令牌各就各位、两条染底列互不相同、染底标签取该色前景、`undefined`/未知色一律不画、真实板子上每一列都有染底；先红后绿）；② 浏览器门禁 `assertKanbanSurfaces`（内联 + 全屏各 3 条）：平面 = `--bg-inset`、列 = `--bg-surface`、卡片 = `--bg-raised`；平面 ≠ 列；两条不同颜色的列画出来的色互不相同、也不等于列底色——读的是真实绘制的像素与令牌值，且在读之前**先按真实指针切回看板视图**（该断言前面有会切视图的步骤，读到一个没有列的视图就是空断言）；③ `contrast:check` 实测 kanban 表面两主题各 10/8 条「层级 × 底色」、6/3 组强调底配对按 7 个强调色重算、4 种背景变体各 12 条标签配对全过 AA，axe 两主题 0 违规；④ 实跑全新实例（`INKSTONE_EPHEMERAL_DEV=1`，:7720）：`e2e.mjs` 177/0、`e2e-visual.mjs` **428/0**（= KU-02 的 420 + 本项 6 条 + 2 条「读的是看板视图」守卫）、全量 `test:unit` 与 12 项静态门禁 + typecheck 全绿。
- **局限**：① 浅色主题里 `--bg-surface` 与 `--bg-raised` 仍是同一个白，列与卡片的区分靠描边 + 阴影，令牌阶梯只在深色主题直接可见——这是既有令牌层的事实，本项不改令牌；② 染底只覆盖看板视图的列头，表格分组行仍把颜色用在分组名与圆点上；③ 无「列宽拖拽后染底跟着变宽」的断言（几何随列壳而定，门禁不量宽度）。

#### KU-04 卡片标题双击竞速守卫

- **修法**：单击 → 250ms 后打开详情，`dblclick`（或 `event.detail >= 2`）取消定时器并进入就地编辑；补 hover 铅笔与 **F2** 显式入口；`data-owns-escape` 已有，Escape 取消、Enter 提交不变；键盘 Enter 仍开详情。
- **范围**：`kanban-card.tsx`、`kanban-card-header.tsx`、`kanban-card.test.ts`、双语键（如已存在则复用）。
- **代价**：S–M。

#### KU-05 内联紧凑头部

- **根因**：`kanban-header.tsx` 的 `narrowLabel()` 用 `hidden md:inline`（**视口**断点），但块宽由预览面板决定 —— 1280px 视口 + 700px 面板仍走桌面布局 → 工具条换两行、右侧被裁；头部共 3–4 行 chrome 压在 480px 画布上。
- **修法**：头部按**自身宽度**切换（`container-type: inline-size`，项目已在 `prose/widgets.css`/`js-example.css` 用过容器查询）；内联模式收到单行（标题 + 视图选择 + 搜索图标 + 常用项 + `⋯`），其余进溢出菜单或图标位，**图标一律走项目 `Tooltip`**；标签条默认折成「标签 N」chip；进度条仅宽容器显示；全屏走宽布局保留现有一排控件。
- **范围**：`kanban-header.tsx`（397 行 → 拆）、新 `ui/kanban-header-compact.tsx` 与/或 `ui/kanban-overflow-menu.tsx`、`styles/kanban.css`、`kanban-header.test.ts`(448 行)、`e2e-visual.mjs` 工具栏扫描。
- **代价**：M–L（本轮最大一项）。

#### KU-06 列不再拉满 + 画布高度自适应

- **根因**：`.ink-prose .kanban-canvas{height:480px}` + 板根 `h-full`（`flex` 默认 stretch）→ 每列被拉到 448px，卡片与「+ 新建项目」只占头部，余下 2–3 行空白；`overflow-x-auto` 又恒出横向滚动条。
- **修法**：列 `self-start`（+ 最小高度）而非拉满；画布高度取 `min(480px, 内容高)`（保留 480px 上限以免动 F-14 渲染窗口语义与既有门禁前提）；横向滚动条仅在溢出时可见并贴列底部。
- **范围**：`kanban-board-view.tsx`、`kanban-column-*`、`styles/kanban.css`、`kanban-render-window.test.ts`、`e2e-visual.mjs`。
- **代价**：M。

#### KU-07 干掉原生 `<select>`

- **根因**：11 处原生 `<select>`（`kanban-filter-popover.tsx`×3、`kanban-sort-popover.tsx`×2、`kanban-view-options.tsx`×3、`kanban-property-cell.tsx`×1、`kanban-batch-bar.tsx`×1、`kanban-chart-view.tsx`×1）未走项目组件，展开列表是 OS 原生样式；面板行布局与设置面板不一致。
- **修法**：换 `components/form` 的 `Select`（已带自绘箭头）或与 `StatusOptionList` 同款自绘 listbox；面板行改 `SettingRow`（标题 + 描述 + 右侧控件），卡尺寸/图表类型改 `Segmented`；标题行/分隔/内边距对齐设置面板。
- **范围**：上述 6 文件 + `kanban-item-detail-fields.tsx`；`kanban-filter-popover.test.ts`/`kanban-sort-popover*` 等按 `select` 查询的断言。
- **代价**：M。

#### KU-08 内联显示看板真标题 / 去掉重复「看板」/ canvas 名随语言刷新

- **根因**：`data.title` 只在 `isFullscreen` 时渲染（`kanban-header.tsx` 的 `KanbanFullscreenTitle`），内联只有 renderer 的「看板 / JSON」块头（`renderer/fence.ts:209-217`）→ 同屏两个「看板」字样、看不到 `"title"`；`registry.ts` 的 `createKanbanCanvas` 用**创建时语言**写 `aria-label`，切语言后区域名僵化。
- **修法**：内联头部显示 `data.title`（空时回落 `t('preview.kanban')`），块头只保留模式徽标/全屏钮；canvas 的 `aria-label` 在挂载/重绘时按当前语言刷新。
- **范围**：`kanban-header.tsx`、`registry.ts`/`view.ts`、`registry-locale.test.ts`、`kanban-header.test.ts`。
- **代价**：S。

### 批次 2 · P1 功能

- **KU-11** 全屏卡片详情改右侧 peek/Drawer（`Drawer` 已有）。范围：`kanban-item-detail.tsx`、`kanban-overlays.tsx`、`check-surface-coverage.mjs` + `e2e-visual.mjs` 具名断言。代价 M。
- **KU-12** 卡片字段可配置：视图增 `cardFields?: string[]`（缺键＝现状，JSON 向后兼容；outline 仍重建默认），视图选项面板加多选行，卡片/画廊/列表共用 reader。范围：`types.ts`、`kanban-view-options.tsx`、`kanban-card.tsx`、`kanban-gallery-view.tsx`、`kanban-list-view.tsx`、`view-ops.ts`、双语键。代价 M–L。
- **KU-13** 列内快速添加：内联真 `input`（Enter 提交并保持焦点连加，Esc 退出，Shift+Enter 开详情）。范围：`kanban-board-view.tsx`、`kanban-add-operations.test.ts`、双语键。代价 M。
- **KU-14** 键盘导航 + 快捷键卡：卡片 roving tabindex、方向键移动焦点、Enter 开详情、F2 改名、`N` 新建、`/` 搜索、`?` 帮助卡（固定画在内容区，不内联进工具栏）。范围：`kanban-card.tsx`/`kanban-board-view.tsx`、`lib/hotkeys` 注册、新 `ui/kanban-shortcuts.tsx`、`e2e-visual.mjs`。代价 L。**注**：旧台账 K-16 曾把「卡片 roving tabindex」判为不立项，本项需重新论证（用户明确要求对齐主流）。
- **KU-15** 逾期/今天/未指派/我的任务 快筛 chip（落到同一 `filters` 数据结构，可撤销、可持久化）。范围：`kanban-header.tsx`、`filter-sort.ts`、双语键。代价 S–M。
- **KU-16** 视图状态与撤销栈分离：`commitData` 增提交语义（`push`/`replace`/`merge`），「看图方式」类提交不压栈（仍写文档，保持 K-15 口径）；连续同类提交合并。范围：`kanban-history.ts`、`kanban-view-state.ts`、`kanban-root-hooks.ts` + 测试；属对外行为变化 → 同步 `CHANGELOG`/`ADR`。代价 M。

### 批次 3 · P2 功能与工程

- **KU-21** 其他视图拖拽（时间轴/甘特改期、日历拖拽改日、表格行拖拽排序；现仅看板有 `draggable`）。代价 L。
- **KU-22** 多选拖拽整批移动（现只移动被拖那张）。代价 M。
- **KU-23** 卡片依赖（甘特/时间轴连线 + 环检测；需 ADR + JSON schema 扩展，outline 不往返）。代价 XL。
- **KU-24** 导出/打印当前视图 → PNG/PDF（复用 `deck-image.ts` 的 SVG + canvas 与 `client-zip` 范式）。代价 L。
- **KU-25** 视图级临时状态持久化口径（列折叠=组件 state 切视图即丢；滚动位置/甘特缩放同样不落盘）。代价 M。
- **KU-26** 大板护栏（手写栅栏可塞任意条卡，解析无上限；补 `items` 上限与告警）+ 手动量测脚本（对齐 `measure-preflight.mjs`）。代价 M。

### 批次 4 · 性能

- **KU-31** 头部每次 render 调 `kanbanActiveItems(data.items)`（新数组）→ `KanbanTagFilterBar` 的 `countTags` memo 失效 → 每次提交全量 O(n)；`people` 名册同源。修法：`useMemo` 于 `data.items`。代价 S。
- **KU-32** `useKanbanBoardDndState` 每次返回新对象、`isDragOverCell` 每次新闭包，且 `ExpandedBoardColumn` 把 `dnd` 透传给 memo 的 `KanbanBoardColumn` → **列 memo 全线失效**。修法：`useMemo` 打包 + `useCallback(isDragOverCell)`（或改传 `dragOverCellKey`）。代价 S。
- **KU-33** 渲染预算测试（500 卡 × 8 视图；对齐 F-14 的 jsdom 计数范式）+ 真机量测脚本。代价 M。
- **KU-34** 写回成本复测（K-20 已裁定不取自适应静默期；KU-16 后复测视图类提交是否仍需写回）。代价 S。

### 批次 5 · 安全

- **KU-41（中）** `kanban-file-preview-modal.tsx` 的 `useKanbanTextRead` 对 `file.url` 直接 `fetch`：不受外部资源开关约束、无 `AbortController`、无超时。修法：套用与 `<img>` 同一条策略（或服务端代理），补超时/取消。范围：`kanban-file-preview-modal.tsx`、`external-images.ts`、`kanban-image-policy.tsx` + 测试。代价 S。
- **KU-42（低）** 分享/导入来源的 description 预览注入回归（把「宿主渲染器即净化器」钉成门禁）。代价 S。
- **KU-43（低）** 护栏：新增渲染面出现前，扫描测试要求栅栏来源的 URL 字段（`cover`/`files[].url`）都经 `safeKanbanUrl`（现状已做到，防回归）。代价 S。

---

## 2. 固定验证

```bash
npm run typecheck && npm run test:unit
npm run size:check && npm run comments:check && npm run i18n:check
npm run hardcoded:check && npm run tokens:check && npm run style:check
npm run escape:check && npm run empty-catch:check && npm run module-state:check
npm run deep-imports:check && npm run surfaces:check
npm run test:e2e && node scripts/e2e-visual.mjs   # 需本地实例（INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv）
npm run contrast:check                            # 动配色/绘制面/强调色时必跑
node scripts/check-token-drift.mjs --update-baseline   # 仅当动共享令牌
```

## 3. 风险、取舍与「不做」

- **不改共享令牌优先**：KU-03 先只调整看板表层组合与列染色，尽量不新造令牌；若必须新增，同步漂移基线 + 对比度门禁。
- **480px 上限保留**：KU-06 只让「内容少于 480px 时收缩」，不动 F-14 渲染窗口与既有浏览器断言的前提。
- **KU-01 会解除 K-17 的既有理由**：`data-kanban-actions` 当初必须 `flex-wrap`（否则面板被行裁剪）正是因为未 Portal —— 改完 Portal 后 KU-05 才能收成单行/溢出菜单，该因果关系写进提交说明。
- **KU-14/KU-16 属行为变更**：需 ADR/CHANGELOG 记录，并同步 `AGENTS.md` 中描述看板撤销/快捷键的段落（如有）。
- **不做**：不顺手重命名/重构无关模块、不动 lockfile 与依赖、不引入新的第三方库、不改已应用迁移、不动 `plan-with-freebuff.md`（K-xx 台账）的历史行。

## 4. 验收标准（每条都要能被自动化或实测守住）

1. 五个头部面板与图标选择器：**打开后与触发按钮右对齐、位于其下方**，且在任何滚动容器内都**不被裁剪**（浏览器断言，内联 + 全屏各一遍）。
2. 活动视图标签在**两套主题、两种模式**下与头部背景存在可测量的差异，并带 `data-active`。
3. 板面/列/卡片三层合成背景互不相同；`check-contrast` 两主题 + 7 强调色全绿。
4. 双击卡片标题 → 出现就地输入框且**详情从未打开**；单击 → 250ms 后详情打开。
5. 内联头部在窄面板下**单行不换行、无横向溢出**；列高 == 内容高，块底无空白带。
6. 全屏：卡片详情为右侧 peek，看板仍可见；Escape 关闭并把焦点还给卡片；键盘可完成「新建 → 改名 → 移动到下一列」。
7. KU-16 后：连续筛选 10 次，Ctrl+Z 撤销的是**上一次卡片编辑**。
8. KU-41 后：外部资源开关关闭时，打开文本附件**不产生**任何跨源请求。
9. 全量 `test:unit`、12+ 静态门禁、`test:e2e`、`e2e-visual`、`contrast:check` 全部通过；`size:check` 通过。

---

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-23 | 建立 UI 轮报告与执行计划（用户评审通过） | `ee174a69` | 文档提交，无产品代码改动；清单 KU-01…KU-43 入库，批次 1（用户点名的 5 条）排最前 |
| 2026-09-23 | KU-03 表面层级与列配色（用户点④） | （本提交） | 阶梯重排为 平面 `--bg-inset` → 列 `--bg-surface` → 卡片 `--bg-raised`（板根/列壳/卡片/画廊卡/列表行，折叠列随列壳），列头整条按分组色染色（新增 `getKanbanTintStyle`，取该调色板校准过的唯一配对）不再只画 10px 圆点；表格视图保持「整块面板」形态（有意边界，见条目内）。`ColumnHeaderBand` 析出以守住 50 行函数上限。6 例单测先红后绿；门禁新增 `assertKanbanSurfaces`（内联 + 全屏各 3 条，按真实像素读三层令牌与两条染底列互不相同），并在读之前按真实指针切回看板视图。实跑全新实例：`e2e.mjs` 177/0、`e2e-visual.mjs` 428/0、`contrast:check` ✅（两主题层级×底色 + 7 强调色重算 + axe 0 违规）、全量 `test:unit` ✅、12 项静态门禁 + typecheck ✅ |
| 2026-09-23 | KU-02 活动视图标签指示器 + 标签条跟随选中（用户点②） | `12133c3b` | 活动 tab 改走应用既有强调配对（旧 `--bg-raised` 在两套浅色主题下等于头部自己的 `--bg-surface`，指示器形同不存在），标签条每次 commit 把自己的 `scrollLeft` 跟上选中项；`KanbanTabList` 拆出 `KanbanTab`/`useSelectedTabInView`（50 行函数上限），新用例另开 `kanban-view-tabs-selection.test.ts`（行数预算）。7 新例先红后绿；变异（改回 `--bg-raised` / 中性滚动）分别杀 2 例、3 例并字节还原；`check-contrast` 的 kanban 表面增声明 `accent` 并实测两主题各 6/3 组强调底配对全过 AA；`e2e-visual` 新增 `assertKanbanActiveTab`（内联 + 全屏各 3 条），变异实跑如实报红。实跑：`e2e-visual.mjs` 420/0、`contrast:check` ✅、`test:unit` 437 文件 3930 例、12 项静态门禁 + typecheck 全绿 |
| 2026-09-23 | KU-01 弹出面板统一锚定（用户点③） | `88dcf6c0` | 新增共用面板 `ui/kanban-panel.tsx`（自测包含块 + `placePanel` + 双侧夹紧），7 处面板改走它，图标选择器不再落静态位、详情内面板不再被对话框滚动区裁掉；Portal 化被否（焦点陷阱 + `anim-pop` 包含块），理由在条目内。`kanban-panel.test.ts` 21 例先红后绿；变异（锚点换成父元素）杀 12 例并字节还原；门禁新增 `assertKanbanPanelAnchoring`（内联 + 全屏各逐控件断言）。实跑：`e2e.mjs` 177/0、`e2e-visual.mjs` 414/0、`test:unit` 436 文件 3923 例、12 项静态门禁 + typecheck 全绿 |
