# 看板（```kanban）UI/UX · 功能 · 性能 · 安全 全面审查报告 与 施工计划 · Freebuff 轮次

> 依据：用户 2026-09-23 的界面走查（4 张截图 + 5 条点名现象）与本次全模块代码走查（`src/client/lib/markdown/kanban/`，17,466 行非测试代码、77 个测试文件）。
> 基线：`dev`，HEAD `8df730b3`。
> 条目 ID：本轮用 `KU-nn`（既有 `K-nn`/`SH-nn`/`F-nn`/`L-nn` 属旧轮次台账，`UI-nn` 属 music 模块，均不复用）。
> 施工原则：逐项修复 → 先写能失败的复现测试 → 跑回归与门禁 → 单项提交（Conventional Commits，正文逐文件）→ **同一次提交内更新本文件**。
> 用户裁定：① 标题重命名保留双击 + 单击延迟守卫；② 全屏卡片详情改右侧 peek/Drawer；③ 报告先行落盘，随后在 `dev` 逐项修复并每次提交更新本文件。
> 每项收尾的验证命令见文末「固定验证」；旧轮的 K-xx 台账见 `plan-with-freebuff.md` / `review-with-freebuff.md`，本文件只承接 UI 轮。

## 勾选清单

### 批次 1 · P0 UI 结构（用户点名的 5 条全在这里）

- [ ] KU-01 弹出面板统一锚定 / Portal 化（用户点③；含新发现：图标选择器无锚点、详情内面板被对话框滚动区裁剪）
- [ ] KU-02 活动视图标签指示器 + 标签条溢出可见性（用户点②）
- [ ] KU-03 表面层级与列配色（用户点④）
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

#### KU-01 弹出面板统一锚定 / Portal 化

- **现象**：筛选、排序、分组依据、CSV、归档 5 个面板都出现在动作行右下角同一位置；内联模式下面板可能被块/画布裁掉；详情里点图标钮，面板压住标题输入框。
- **根因**：`kanban-header.tsx` 的 `KanbanHeaderActions` 根 `relative`，5 个面板 `absolute right-0 top-full`（`kanban-filter-popover.tsx:300`、`kanban-sort-popover.tsx:154`、`kanban-view-options.tsx:444`、`kanban-archive.tsx:121`、`kanban-csv.tsx:102`）→ 最近定位祖先是**整行**而非触发按钮；`anchorRef` 只传给了 `useClickOutside`（`filter:279`/`sort:132`/`view-options:431`/`column-menu:267`）。`kanban-icon-picker.tsx:180` 的 `absolute z-[var(--z-popover)] mt-1 …` **既无 top 也无 left** → 落静态位。四处裁剪源：`.ink-prose .kanban-block{overflow:hidden}`、`.ink-prose .kanban-canvas{overflow:hidden}`（`styles/kanban.css:1-8,144`）、板根 `overflow-x-auto`（`overflow-y` 随之变 auto）、`overlay/modal.tsx` 内容区 `overflow-y-auto`。
- **修法**：新增 `ui/kanban-panel.tsx`（`createPortal` + `usePanelPlacement`，`align='end'`、随触发按钮对齐、翻转避让、`role='dialog'`、沿用 `useEscape`/`useClickOutside`、关闭后焦点归还触发钮）；filter/sort/view-options/archive/csv/icon-picker 全部改走它；列菜单（已在列头 `relative` 内定位正确）同样改走 Portal 以摆脱滚动容器裁剪。顺带统一 `--z-menu`/`--z-popover` 的用法。
- **范围**：新增 1 文件 + 6 个面板文件 + `kanban-header.tsx`；`kanban-popover-dismiss.test.ts`(18 例)/`kanban-popover-aria.test.ts`/`kanban-date-picker.test.ts`；`e2e-visual.mjs`。
- **代价**：M。
- **验证**：新增 `kanban-panel-placement.test.ts`（复用 `placePanel` 的数值断言范式）；浏览器门禁给工具栏扫描补一条 —— **面板左/右边缘与触发按钮对齐且顶边在按钮下方**（现有扫描只断言「不撑高头部」，故该 bug 一直未被拦住；`e2e-visual.mjs` 里「portaled dialog」的注释与实现不符，一并改正）。

#### KU-02 活动视图标签指示器 + 标签条溢出可见性

- **根因**：`kanban-view-tabs.tsx` 活动样式 `bg-[var(--bg-raised)] shadow-[var(--shadow-xs)]`，而 `tokens.css:292-293`（暖纸浅色）与 `:354-355`（纯白）里 `--bg-raised` 与 `--bg-surface` **同值** → 在头部（`bg-[var(--bg-surface)]`）上活动 tab 等于隐形。标签条 `overflow-x-auto` 无溢出提示。
- **修法**：显式指示器（`--accent` 下划线或 `--accent-soft` 底 + accent 文字 + 字重），两模式同一实现；溢出时两端渐隐；活动态加 `data-active` 供门禁断言。
- **范围**：`kanban-view-tabs.tsx`、（如需）`tokens.css` + 漂移基线、`check-contrast.mjs` 的 kanban 表面；`kanban-view-tabs.test.ts`、`e2e-visual.mjs`。
- **代价**：S。

#### KU-03 表面层级与列配色

- **根因**：板面无底色（继承 `--bg-surface`）、列 `bg-[var(--bg-raised)]`、卡片 `bg-[var(--bg-surface)]`，浅色下三层全白；列颜色只用于圆点（`kanban-column-header.tsx` 的 `getKanbanDotColor`）。
- **修法**：表面阶梯 —— 板 `--bg-inset`、列 `--bg-surface` + `--border-subtle`、卡片保留白 + `--shadow-xs`；列头按分组色做低强度染色条/底（复用已校准的 `--kanban-tag-*-bg` 系，或新增 `--kanban-col-*`）；空列与空板底色统一。一律走令牌，不新增魔法值。
- **范围**：`kanban-board-view.tsx`（493 行，接近 500 上限 → 先拆）、`kanban-column-header.tsx`、`kanban-empty-board.tsx`、`styles/kanban.css`、（如需）`tokens.css` + `check-token-drift.baseline.json`、`check-contrast.mjs`。
- **代价**：M。

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
| 2026-09-23 | 建立 UI 轮报告与执行计划（用户评审通过） | （本提交） | 文档提交，无产品代码改动；清单 KU-01…KU-43 入库，批次 1（用户点名的 5 条）排最前 |
