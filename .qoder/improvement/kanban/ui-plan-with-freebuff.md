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
- [x] KU-04 卡片标题双击竞速守卫 + hover 铅笔 / F2（用户点⑤，方案 A）—— 按用户裁定保留双击改名、单击延迟 250ms 才开详情；另补铅笔与 F2 两个不需知道手势的入口
- [x] KU-05 内联紧凑头部：容器查询 + ⋯ 溢出菜单（用户点①）—— 「图标 + Tooltip」被否（理由在条目内）；顺带修掉宽条下标题被标签条挤到 56px 截断的真问题
- [x] KU-06 列不再拉满 + 画布高度自适应 + 滚动条可见性（用户点①的空白行）—— 列改 `items-start`（不再被拧到画布高），画布 480px 从固定高改为封顶；封顶值一处声明、笔记与全屏两种语义；顺带把「占位写死 480px」改成实测高度
- [x] KU-07 干掉原生 `<select>`，面板结构对齐设置面板（`SettingRow`/`Segmented`/`Select`）—— 10 处改走 `components/form` 的 `Select`，密度只在 `PANEL_FIELD` 里声明一次；卡尺寸/图表类型改 `Segmented`；表格标签芯片是唯一保留的原生元素（`appearance-none` 去箭头，理由写在旁边）
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

#### KU-04 卡片标题双击竞速守卫 + hover 铅笔 / F2（已修，用户裁定方案 A）

- **根因**：`CardTitle` 的标题钮上同挂 `onClick => onOpenDetail` 与 `onDoubleClick => startEditing`。第一次 click 已经把详情弹窗打开（遮罩铺满视口 + 焦点陷阱），第二次 click 落在遮罩上被当成「点外部」把弹窗关掉，`dblclick` 的目标已不是标题钮 —— 于是读者看到的是「双击 → 详情闪一下 → 弹窗关掉」，改名永远不会发生。
- **修法（实做）**：① 单击不再直接开详情，而是排一个 250ms 的定时器（`KANBAN_TITLE_OPEN_DELAY_MS`），双击时取消它并进入就地编辑；② `event.detail === 0`（键盘激活与程序化点击）没有第二击可等，直接开详情，所以 Enter/Space 仍即时；③ 新增 title 行右侧的 **铅笔**（悬停与 `focus-visible` 揭示，带可访问名）与标题钮上的 **F2** 两个不需知道手势的入口；④ 卡片在窗口内被卸载（筛选/切视图/搬卡）时清掉待开定时器，不为一张不在板上的卡开弹窗。
- **决策（自决）**：① 用定时器而不是「先开后关」——后者就是今天的病（弹窗闪一下），也治不好；Windows 资源管理器与各文件管理器同此；② 「无第二击」的判据取 `detail === 0`（键盘激活的规范值）而不是另设一个「键盘来源」标记；③ 铅笔放在 `h3` **旁边**而不是里面：标题就是浏览器读作卡片名字的那个盒子，也是揭示行几何断言度量的盒子 —— 画在它**内部**的控件会被读成「一个盖住自己标题的控件」（门禁首跑就实报了 `重命名卡片 16x16` 命中）；④ 卡片标题这一套（状态 + 手势 + 字段 + 两个视图）从 `kanban-card.tsx` 析出为 `ui/kanban-card-title.tsx`（仿 `kanban-fullscreen-title.tsx` 的 Editor/View 分法），否则该文件 501 行过不了 500 行硬限。
- **范围**：新增 `ui/kanban-card-title.tsx`、`ui/kanban-card.tsx`（改写导出的 `KANBAN_TITLE_OPEN_DELAY_MS` 等）、`ui/kanban-card.test.ts`（6 新例 + 抽出共用 helper）、双语新键 `preview.kanban_rename_card`、`scripts/e2e-visual.mjs`（新 `assertKanbanTitleGestures`）、`scripts/check-comments.mjs`（白名单按当前树重算）+ 本文件。
- **代价**：S–M。
- **验证**：① 6 例单测用假定时器与带 `detail` 的鼠标事件（单击要等窗口过完才开、双击就地改名且**从不**开详情、铅笔改名、F2 改名、无第二击的激活即时开、开窗期间卸载不补开）——实测只有程序化 `.click()`（`detail` 为 0）能同步开详情，既有用例因此全部原样通过；② 变异自检：双击不再取消待开 → 1 例红；改回「单击即开」→ 3 例红；两次均由 `/tmp` 备份字节相同还原；③ 浏览器门禁 `assertKanbanTitleGestures`（内联 + 全屏各 4 条）用**真实指针**双击：标题能点到、双击画出字段、双击不改对话框计数、事后 Escape 不写入（`data-owns-escape` 保证不连带关板）。首跑实测两个真问题并已修正：Puppeteer 的 `mouse.click({ clickCount: 2 })` 只发一次带计数的按压（根本不发 `dblclick`），改两次完整按下/抬起；铅笔需移到 `h3` 之外（见决策③）。④ 实跑全新实例（`INKSTONE_EPHEMERAL_DEV=1`，:7720）：`e2e-visual.mjs` **436/0**（= KU-03 的 428 + 本项 8 条）、`contrast:check` ✅（kanban 两主题 axe 0 违规）、全量 `test:unit` 438 文件 3942 通过 | 1 跳过、12 项静态门禁 + typecheck 全绿。
- **局限**：① 250ms 的等待对单击是真实延迟（相对旧行为），这是方案的代价；② 卡片标题行多一个悬停控件，悬停时右侧会多出 16px 按钮（已用 `gap` 与标题分开，且只有悬停/聚焦才出现）；③ 列表/画廊/表格视图的标题**没有**就地改名（从未有过），本项只修看板卡片标题；④ 无「触屏双击」专项断言（移动端无 `dblclick` 语义，铅笔是那里的入口，未另测）。

#### KU-05 内联紧凑头部：容器查询 + `⋯` 溢出菜单（已修）

- **根因**：`kanban-header.tsx` 的每一个响应式判断读的都是**视口**（`narrowLabel()` 用 `hidden md:inline` 之类），而块宽由预览面板决定 —— 1280px 视口 + 400px 面板照样画桌面行，工具条折成 2 行、右侧被裁，3–4 行 chrome 压在 480px 高的画布上（用户点①）。
- **修法（实做）**：① 头部成为 `@container`（`container-type: inline-size`，项目已在 `prose/widgets.css`/`js-example.css` 用过容器查询），`@4xl`（56rem）是整条**唯一**的断点 —— 标签、视图名、进度条、宽/紧凑两个簇、标签条全在这一个断点上切换；② 窄条只留「视图标签条 + 搜索 + 新建卡 + `⋯`」，其余动作收进新的 `ui/kanban-overflow-menu.tsx`；**菜单行打开的是同一批面板**（`KanbanFilterPopover`/`KanbanSortPopover`/`KanbanViewOptions`/`KanbanArchivePanel`/`KanbanCsvPanel`），锚定在 `⋯` 上（行本身在面板画出前已随菜单消失）；③ 一个动作在文档里只写一次（`WideOnly`/`CompactOnly` 各自成簇），不存在「写两遍、藏一遍」；④ 视图的「新建 / 重命名 / 复制 / 删除」行与视图类型清单从 `kanban-view-tabs.tsx` 导出给菜单复用，两处不可能漂移；⑤ 窄条里视图标签只画图标，标签条折成「标签 N」chip（disclosure 而不是 menu：条就在同一组件里），且折叠态仍报「有几个在筛」的计数；⑥ 进度条仅宽条显示。
- **被否**：① **图标 + Tooltip**（用户给的可选方案）—— 窄条里原本要 Tooltip 的那些动作现在是**菜单里的带字行**，裸图标只剩搜索与 `⋯` 两个，两者沿用全应用 `IconButton` 的约定（可访问名，不用 native `title`）；为两个控件在局部破例引入另一种风格不划算。② **JS 量宽度下发 `data-*`** —— 要 ResizeObserver + 首帧状态，容器查询是同一件事的更少活动件。③ 把 `@container` 挪到 `.kanban-canvas` —— 实测与放在头部**同样**出现下面那条 axe 审查项（因为病根不在容器，见「顺带修的真问题」），还会把面板的包含块从头部挪到画布；两者语义等价，故留在头部。
- **顺带修的真问题（门禁读出来，不是本项的假设）**：宽条下**看板标题被视图标签条挤到 56px 并用省略号截断**（1280px 的条里显示「Gate Boa…」）。原因：标题包裹层是 `min-w-0`（可被压到内容宽度以下），而标签条自己不缩，于是标题一个人吸收全部亏空。改法：包裹层 `shrink-0`，标题保有自己的宽度（上限仍是 `max-w-44`），让标签条去滚（`overflow-x-auto` 本就是它的职责）。这恰好也是 axe 报 `elmPartiallyObscuring` 的来源：文本真被截断时 `Range.getClientRects()` 给出**两个** rect（完整文本 + 可见片段），axe 逐 rect 比元素栈即判「部分遮挡」—— 所以「标题被压缩」是以 a11y 审查项的形式浮出水面的。标题不再被压后该审查项消失，**不需要**任何 allowlist 例外（若在这里加例外，就是拿放行去盖症状）。
- **范围**：`kanban-header.tsx`（498 行，析出 Identity/Actions/Toolbar/Wide/Compact）、新 `ui/kanban-overflow-menu.tsx`、新 `ui/kanban-header-compact.test.ts`、`kanban-fullscreen-title.tsx`、`kanban-tag-filter-bar.tsx`、`kanban-view-tabs.tsx`、`kanban-csv.tsx`/`kanban-archive.tsx`（面板与行导出以复用）、`kanban-header.test.ts`、双语 5 键、`scripts/e2e-visual.mjs`、`scripts/check-comments.mjs` 白名单、本文件。
- **代价**：M–L（本轮最大一项）。
- **验证**：① 新 `kanban-header-compact.test.ts`：两个簇按**簇内控件**定位（不按类名 —— 进度条包裹层带着同一组断点类，第一版 helper 正是被这一点骗过）、每个动作只出现一次、菜单行开的正是宽条那几个面板、宽条有的动作窄条里都有去处；② 变异自检：去掉宽簇的断点类 → 该用例红；但断言的第一版**不红**（匹配到了进度条包裹层），改按簇内控件定位后才红 —— 这条测试的第一次编写是无效的，实测记录在此；③ 浏览器门禁新增 `assertKanbanHeaderLayout`（内联 `compact` + 全屏 `wide`，含「窄条只占一行」「控件不越出条自己的盒子」）、`assertKanbanOverflowMenu`（内联 Filter/Sort 两行各 4 条：行与宽条控件同名、面板落在触发器下方、留在条自己的表面内、菜单在面板后关闭）、`assertKanbanPanelAnchoring` 改为只读**画出来的**触发器（容器查询把另一半留在文档里、盒子为 0，在它的「中心」按一下会打到视口角落）并新增「触发器可被指针命中」；④ 新增「视图标签条给标题让位、而不是把标题截断」（读 `scrollWidth <= clientWidth`）——本轮唯一能抓住上面那个真问题的断言；⑤ 实跑全新实例（`INKSTONE_EPHEMERAL_DEV=1`，:7845）：`e2e.mjs` 177/0、`e2e-visual.mjs` **435/0**、`contrast:check` ✅（kanban 两主题 axe 0 违规、25 项检查、11/9 条「层级 × 底色」全在 AA 之上）、全量 `test:unit` 439 文件 3956 通过 | 1 跳过、13 项静态门禁 + typecheck 全绿。
- **局限**：① 断点是**单一**的（56rem），没有为「中宽」另设一档；② 宽条在很窄的全屏窗口里仍允许换行（`flex-wrap`）—— 这是刻意的：抱怨从来不是关于全屏的；③ 窄条把 7 个动作收进菜单 = 多一次按压，换来画布上少 2 行 chrome；④ 标签条折叠态只报总数与计数，不列具体标签名（展开即见）；⑤ 没有对「比预览面板下限还窄」的宽度做断言（门禁读到的是 1280px 视口的笔记面板与全屏、以及手机断点的抽屉外壳）。

#### KU-06 列不再拉满 + 画布高度自适应（已修，用户点①的空白行）

- **根因**：`.ink-prose .kanban-canvas{height:480px}` 是**固定高度**，而板根 `h-full` 让画布成为定高包含块；`flex` 行默认 `align-items: stretch` → 每列被拉到 448px。卡片与「+ 新建项目」只占头部，余下 2–3 行全是列自己的底色（截图里那几行空白），横向滚动条也被放到那块空白的底部而不是列下面。
- **修法（实做）**：① 板根改 `items-start` —— 列不再被拉伸，各自**内容高**（这就是用户看到的空白行的全部来源）；② 画布 480px 从 `height` 改为 `max-height: var(--kanban-canvas-cap)`，板根同样以它封顶：短板子把空间还给笔记，长板子的滚动归板根（滚动条因此落在列下面）；③ 列在笔记里以 `calc(var(--kanban-canvas-cap) - var(--sp-4) * 2)` 封顶（板根内边距的两倍），长列仍在**自己内部**滚动、列头留在视野里 —— 固定高度画布原本的排布，只是不再有固定高度；④ 全屏（`is-fullscreen`）把两条都复原成 `height: 100%` / `max-height: none`：画布被 flex 定高，列在那里仍吃 `100%`。
- **决策（自决）**：① 用 CSS 变量 + 定长 `calc` 而不是 React 量测下发高度 —— 量测方案要在「跟随时变」与「全屏时不生效」之间做状态同步（画布被借走时 React 收不到那个 class 变化），而两层 CSS 表达的是同一个事实、零活动件，也不会有量测↔重排的回环；② 全屏不复用 `--kanban-canvas-cap`：覆盖层给的正是一个**定高**舞台，此时「封顶」是错的语义；③ 列的封顶写成**长度**而不是 `max-h-full`：笔记里板根的高度是内容高（不定），百分比 `max-height` 会退化成 `none`，`max-h-full` 看着对而实际不生效；④ `ColumnCardsList` 与它的 props 拆到新 `ui/kanban-column-cards.tsx` —— `kanban-board-view.tsx` 原本 497 行，本项加完注释即越过 500 行硬限，按职责拆（板子说列放哪，列说卡怎么排）而不是 resnapshot 基线；⑤ 全屏占位在借走画布**之前**量高（`entry.reserveHeight`）—— 块高不再固定，占位若还写死 480px，开全屏会把笔记跳一下。
- **范围**：`ui/kanban-board-view.tsx`、新 `ui/kanban-column-cards.tsx`、`styles/kanban.css`、`view.ts`（`createKanbanReserve(height)`）、`registry.ts`/`entry.ts`（占位量高）、`kanban-fullscreen.test.ts`（2 新例）、新 `tests/kanban-canvas-height.test.ts`（8 例）、`scripts/e2e-visual.mjs`（新 `assertKanbanColumnHeights`）、`scripts/check-comments.mjs` 白名单、本文件。
- **代价**：M。
- **验证**：① `tests/kanban-canvas-height.test.ts` 8 例：四条 CSS 契约（画布是 `max-height` 而非 `height`、板根同顶、列矮一个内边距步长、封顶值全仓只有一处声明）+ 占位有高 + 全屏两条复原 + 渲染出的板根带 `items-start` 而不带 `h-full`。变异自检两次（改回 `h-full`/`overflow-x-auto`；把画布改回 `height`）各杀 3 例与 1 例，均由 `/tmp` 备份还原；② `kanban-fullscreen.test.ts` 2 新例：占位拿到画布的**实测**高度（jsdom 不布局，量测值由测试提供）、量为 0 时回落到 CSS 封顶（不把块钉成 0 高，那正是占位要防的塌陷）。变异把量测值从 `attachKanbanToOverlay` 拆掉 → 具名例红，还原字节相同；③ 浏览器门禁新增 `assertKanbanColumnHeights`（内联 + 全屏各 3 条，按**真实像素**读）：没有列被拉伸到卡片之外、块不比「头部 + 板子」更高、块不低于两者之和。**这里的量法是本轮最有价值的一条经验**：`scrollHeight` **永远不会小于** `clientHeight`，所以第一版「内容比盒子小就是被拉伸」的断言在突变下照样全绿（等于白写），改成量「盒子底部 − 最后一个子元素底部 − 自身下内边距」的**空带像素数**后才真正生效 —— 实测空白行被读成 86/196/169px，与用户截图一致；另有一条对板根做同法量测的断言被**删掉**（板根最后一个是「加列」按钮，它本来就矮，不是有富余的列）；④ 突变对照（把 `items-start` 与 `max-height` 一起改回原样）实跑：`no column is stretched` 两条如实报红（439/2），其余断言不动 —— 证明该断言的区分力就在这几条上；⑤ 实跑全新实例（`INKSTONE_EPHEMERAL_DEV=1`，:7712）：`e2e.mjs` 177/0、`e2e-visual.mjs` **441/0**（= KU-05 的 435 + 本项 6 条）、`contrast:check` ✅、全量 `test:unit` 440 文件 3966 通过 | 1 跳过、12 项静态门禁 + typecheck 全绿。
- **局限**：① 板根仍是横向滚动容器，窄面板里横向滚动条只在溢出时出现（未做渐隐提示 —— 与 KU-02 的标签条同类问题，仅标签条立了项）；② 列的封顶是**长度**，与板根内边距耦合：若有人把板根的 `p-4` 改掉，必须同改这条 `calc`（`tests/kanban-canvas-height.test.ts` 断言了这两个数字的对应关系，改一处即红）；③ 全屏下板根仍是 `h-full` + 列 `100%`，换句话说全屏的列依旧等高（看板应用的常规形态），本项只改笔记里的比例；④ 折叠列（`CollapsedColumn`）没有 `flex-1` 列表，不参与封顶断言；⑤ 时间轴/甘特/日历三个表面仍各自全量挂载，与 F-14 同一遗留。

#### KU-07 干掉原生 `<select>`（已修）

- **根因**：11 处原生 `<select>`（`kanban-filter-popover.tsx`×3、`kanban-sort-popover.tsx`×2、`kanban-view-options.tsx`×3、`kanban-property-cell.tsx`×1、`kanban-batch-bar.tsx`×1、`kanban-chart-view.tsx`×1）各自手搓边框/圆角/高度，颜色与描边于是与设置面板同义词不同值；没有 `appearance-none`，OS 箭头直接画在手搓边框上（两套视觉叠在一起）。另有卡尺寸选择器是裸按钮组，选中态只是一个颜色，浏览器与读屏都读不出来。
- **修法（实做）**：① 10 处改走 `components/form` 的 `Select` —— 箭头、焦点环、令牌配色都由共享组件给；密度**只在 `kanban-panel.tsx` 的 `PANEL_FIELD` 声明一次**（`h-7 md:h-7 pl-1.5 text-[11px]`），面板控件与设置控件因此不可能各走一路；② 需要横向撑满的 select 外面套一层 `min-w-0 flex-1`（`Select` 自带 `relative` 包裹层，`flex-1` 加在内部的 `<select>` 上不会生效）；③ 卡尺寸（视图选项）与图表类型改 `Segmented` —— 一个 radio group，选中是**状态**而不是颜色；④ 批量操作条的「改分组」用 `Select` 的 8px 高度档（`h-8 text-12`），底色回到共享的 `--bg-inset`（原本手写 `--bg-surface`，在 `--bg-overlay` 的浮条上几乎无填充差）；⑤ 表格视图的**标签芯片**是唯一保留的原生元素，但补了 `appearance-none` 去掉 OS 箭头 —— 它整块按选项色染色，换成 `Select` 会在那个颜色上压一层描边字段与三级色箭头，而该表其余单元格（日期、成员、标签、附件）本来就都是颜色/图标型亲和控件、没有箭头；理由同时写在代码旁与白名单注释里。
- **决策（自决）**：① 不把面板改成自绘 listbox：项目自身的 `Select` 就是「原生 `<select>` + `appearance-none` + 自绘箭头」，面板要的是与项目一致而不是比项目更进一步，自绘 listbox 会把键盘/读屏行为从浏览器手里接管过来，收益只有展开列表的样子；② 不把面板行改成 `SettingRow`：那套是「标题 + 描述 + 右侧控件」的**设置页**行，面板一行要塞 3–4 个控件（字段/运算符/值/删除），套上去只会把行撑成两行 —— 对齐的是**控件**而不是行容器，密度差异经 `PANEL_FIELD` 显式声明；③ 标签芯片保留原生：见 ⑤，降级只在「去掉箭头」这一项上，语义与键盘不动。
- **范围**：`ui/kanban-filter-popover.tsx`、`ui/kanban-sort-popover.tsx`、`ui/kanban-view-options.tsx`、`ui/kanban-chart-view.tsx`、`ui/kanban-batch-bar.tsx`、`ui/kanban-property-cell.tsx`、`ui/kanban-panel.tsx`（新增 `PANEL_FIELD`）、`scripts/check-comments.mjs` 白名单、新 `tests/kanban-panel-controls.test.ts`。
- **代价**：S（改动量小，但「哪些 select 允许留」的口径需要写清）。
- **验证**：① 新 `tests/kanban-panel-controls.test.ts` 两条规则、彼此互补：**渲染面**——把每个带控件的面板按它自己的开法打开、逐个断言面板内每个 `<select>` 都带 `appearance-none` 且旁边有自绘箭头（回退成裸 `<select>` 即红）；**源码面**——渲染面只能看到测试恰好打开的面板，所以另外对 `ui/` 下每个 `.tsx` 数 `<select`，每个都必须按「文件 + 条数 + 理由」登记，**多一条会红、少一条也会红**（方向相反的两种失败都拦）。变异自检：把排序面板的 property 选择器改回裸 `<select>`，两组断言如实报红后由 `/tmp` 备份还原；② `npx vitest run` 本模块 + 新文件 82 文件 / 1082 例全过，`npm run typecheck` 干净；③ 11 项静态门禁（style/size/comments/escape/empty-catch/hardcoded/tokens/i18n/module-state/deep-imports/surfaces）全绿；④ 门禁实例实跑 `e2e-visual.mjs` **441/0**；⑤ 浏览器实看（全屏看板 → 筛选 → 添加条件）：面板落在按钮正下方（KU-01），行内「标题/包含/值」三个控件已是应用自己的描边与箭头，`appearance-none` 已生效（`getComputedStyle` 实测），行高 28px 与面板密度一致。
- **局限**：① **展开后的列表仍是浏览器/系统的原生菜单** —— `appearance-none` 只能改关闭态的控件，展开态归 OS 管。这是项目 `Select` 的既有性质（设置页同样如此），本项与项目保持一致；要换掉展开态就得换成自绘 listbox，那是全仓决策、不是看板一家的事；② 表格标签芯片仍是原生 `<select>`（去掉箭头），若将来给它做自绘菜单，`tests/kanban-panel-controls.test.ts` 的白名单会以「多了一条/少了一条」逼人显式改口径；③ 本项跑 `contrast:check` 时该门禁在**手机端分享中心**报 2 条 axe 未登记项（`th:nth-child(2)`，`color-contrast`/「Axe encountered an error」），用 `git stash` 把本项全部改动移走后**同样报同 2 条**，故与看板无关，已单独追查（见「进度日志」末尾一行），未夹带在本提交里。

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
| 2026-09-23 | KU-07 干掉原生 `<select>`（面板控件走项目组件） | （本提交） | 10 处 select 改走 `components/form` 的 `Select`（自绘箭头 + 焦点环 + 令牌），密度只在 `kanban-panel.tsx` 的 `PANEL_FIELD` 声明一次；需横向撑满的外面套 `min-w-0 flex-1`（`Select` 自带 `relative` 包裹层）；卡尺寸/图表类型改 `Segmented`（选中是状态而非颜色）；批量条用 8px 高度档、底色回到共享 `--bg-inset`；表格标签芯片是唯一保留的原生元素，补 `appearance-none` 去箭头（理由写代码旁 + 白名单）。新 `tests/kanban-panel-controls.test.ts` 双面守卫：渲染面断言每个面板里每个 `<select>` 都 `appearance-none` 且有自绘箭头，源码面对 `ui/` 下每个 `<select` 按「文件 + 条数 + 理由」登记（多一条/少一条都红）；变异回退排序面板的 select 两组如实报红。实跑：本模块 + 新文件 82 文件 1082 例、`typecheck`、11 项静态门禁、`e2e-visual.mjs` 441/0 全绿；浏览器实看筛选面板控件外观与行高。展开态仍是 OS 原生菜单（项目 `Select` 的既有性质，已记入局限） |
| 2026-09-23 | KU-06 列不再拉满 + 画布高度封顶（用户点①的空白行） | （本提交） | 板根改 `items-start`（列不再被拉伸，各自内容高），画布 480px 由 `height` 改为 `max-height: var(--kanban-canvas-cap)`、板根同顶、列矮一个内边距步长（长列仍在自身内部滚动），全屏两条复原为 `100%`；`ColumnCardsList` 拆到 `ui/kanban-column-cards.tsx` 守 500 行硬限；占位改吃实测高度（`entry.reserveHeight`）。新增 `tests/kanban-canvas-height.test.ts` 8 例 + `kanban-fullscreen.test.ts` 2 例（先红后绿），变异 3 次各杀具名例并字节还原；门禁新增 `assertKanbanColumnHeights`（内联 + 全屏各 3 条）——**`scrollHeight` 恒不小于 `clientHeight`，第一版断言是无效的**，改成量「盒子底部 − 末子元素底部 − 下内边距」的空带像素后才生效，突变对照如实报红。实跑全新实例：`e2e.mjs` 177/0、`e2e-visual.mjs` 441/0、`contrast:check` ✅、全量 `test:unit` 440 文件 3966 通过、12 项静态门禁 + typecheck ✅ |
| 2026-09-23 | KU-05 内联紧凑头部：容器查询 + ⋯ 溢出菜单（用户点①） | `2729dce4` | 头部成为 `@container`（56rem 是唯一断点），窄条只留视图标签条 + 搜索 + 新建 + `⋯`，其余动作收进 `ui/kanban-overflow-menu.tsx` 并复用同一批面板与视图清单；「图标 + Tooltip」被否（动作在菜单里是带字行）。门禁新增 `assertKanbanHeaderLayout`/`assertKanbanOverflowMenu`、`assertKanbanPanelAnchoring` 改读画出来的触发器。顺带修掉宽条下标题被标签条挤到 56px 截断的真问题（axe 的 `elmPartiallyObscuring` 正是它浮出水面的形式，未加任何放行） |
| 2026-09-23 | KU-04 卡片标题双击竞速守卫 + 铅笔/F2（用户点⑤） | `28f1ad84` | 单击改排 250ms 定时器（双击取消它并就地改名），`detail === 0` 的键盘激活仍即时开详情；新增铅笔（悬停/聚焦揭示，放在 `h3` 之外）与 F2 两个入口；卡片卸载时清定时器。标题一套析出为 `ui/kanban-card-title.tsx`（`kanban-card.tsx` 501 行过不了 500 行硬限）。6 例单测（假定时器 + 带 `detail` 的事件）先红后绿，变异 1/3 例红两次字节还原；门禁新增 `assertKanbanTitleGestures`（内联 + 全屏各 4 条，真实指针双击），首跑报出 Puppeteer `clickCount:2` 不发 `dblclick` 与铅笔落在 `h3` 内两处真问题并已修正。实跑：`e2e-visual.mjs` 436/0、`contrast:check` ✅、全量 `test:unit` 438 文件 3942 通过、12 项静态门禁 + typecheck ✅ |
| 2026-09-23 | 清理 KU-01/KU-02 留下的一行死导入 | `dca0505b` | `kanban-root-hooks.ts` 已不再引用 `KanbanFile`，类型导入会被擦除所以 typecheck 不报；琐碎提交不另记条目 |
| 2026-09-23 | KU-03 表面层级与列配色（用户点④） | `7a756460` | 阶梯重排为 平面 `--bg-inset` → 列 `--bg-surface` → 卡片 `--bg-raised`（板根/列壳/卡片/画廊卡/列表行，折叠列随列壳），列头整条按分组色染色（新增 `getKanbanTintStyle`，取该调色板校准过的唯一配对）不再只画 10px 圆点；表格视图保持「整块面板」形态（有意边界，见条目内）。`ColumnHeaderBand` 析出以守住 50 行函数上限。6 例单测先红后绿；门禁新增 `assertKanbanSurfaces`（内联 + 全屏各 3 条，按真实像素读三层令牌与两条染底列互不相同），并在读之前按真实指针切回看板视图。实跑全新实例：`e2e.mjs` 177/0、`e2e-visual.mjs` 428/0、`contrast:check` ✅（两主题层级×底色 + 7 强调色重算 + axe 0 违规）、全量 `test:unit` ✅、12 项静态门禁 + typecheck ✅ |
| 2026-09-23 | KU-02 活动视图标签指示器 + 标签条跟随选中（用户点②） | `12133c3b` | 活动 tab 改走应用既有强调配对（旧 `--bg-raised` 在两套浅色主题下等于头部自己的 `--bg-surface`，指示器形同不存在），标签条每次 commit 把自己的 `scrollLeft` 跟上选中项；`KanbanTabList` 拆出 `KanbanTab`/`useSelectedTabInView`（50 行函数上限），新用例另开 `kanban-view-tabs-selection.test.ts`（行数预算）。7 新例先红后绿；变异（改回 `--bg-raised` / 中性滚动）分别杀 2 例、3 例并字节还原；`check-contrast` 的 kanban 表面增声明 `accent` 并实测两主题各 6/3 组强调底配对全过 AA；`e2e-visual` 新增 `assertKanbanActiveTab`（内联 + 全屏各 3 条），变异实跑如实报红。实跑：`e2e-visual.mjs` 420/0、`contrast:check` ✅、`test:unit` 437 文件 3930 例、12 项静态门禁 + typecheck 全绿 |
| 2026-09-23 | KU-01 弹出面板统一锚定（用户点③） | `88dcf6c0` | 新增共用面板 `ui/kanban-panel.tsx`（自测包含块 + `placePanel` + 双侧夹紧），7 处面板改走它，图标选择器不再落静态位、详情内面板不再被对话框滚动区裁掉；Portal 化被否（焦点陷阱 + `anim-pop` 包含块），理由在条目内。`kanban-panel.test.ts` 21 例先红后绿；变异（锚点换成父元素）杀 12 例并字节还原；门禁新增 `assertKanbanPanelAnchoring`（内联 + 全屏各逐控件断言）。实跑：`e2e.mjs` 177/0、`e2e-visual.mjs` 414/0、`test:unit` 436 文件 3923 例、12 项静态门禁 + typecheck 全绿 |
| 2026-09-23 | 建立 UI 轮报告与执行计划（用户评审通过） | `ee174a69` | 文档提交，无产品代码改动；清单 KU-01…KU-43 入库，批次 1（用户点名的 5 条）排最前 |
