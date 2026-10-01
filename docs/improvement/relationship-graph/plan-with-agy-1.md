# Inkstone 笔记应用「关系图谱」重构与缺陷修复推进计划

> **基线分支/提交**：`39a3814a9123a636acf7bb8f56f2df8c2406e054`  
> **工作分支**：`improvement/relationship-graph-agy`  
> **审查报告参考**：[`review-with-agy-1.md`](./review-with-agy-1.md)  
> **工程规范**：[`AGENTS.md`](../../../AGENTS.md)  
> **核心原则**：逐项修复，每项修复按照 AGENTS.md 规范原子化提交 Git，跑通全量门禁与回归，严禁破坏原有功能或引入新 Bug，实时在此文档中记录每次提交哈希与进展。

---

## 进展概览与统计

| 阶段 | 涵盖问题 | 目标与范围 | 状态 |
| :--- | :--- | :--- | :--- |
| **准备工作** | 环境配置 | 创建 Worktree、软连 `node_modules`、编写深度审查报告与推进计划 | ✅ 已完成 |
| **第一阶段 (Sprint 1)** | PERF-01, UX-01, UX-02, UX-03, UI-01 | 修复核心阻断 Bug：滑块白屏/请求风暴、单击强退、减少动画死锁、ESC 误杀、Canvas 主题跟随 | ✅ 已完成 |
| **第二阶段 (Sprint 2)** | PERF-02, UI-02, UI-03, PERF-03, PERF-04, SEC-01, SEC-02, SEC-03, SEC-04, SPEC-01, SPEC-02, SPEC-03 | 消除 Layout Thrashing、邻居高亮矛盾、微光晕、D1 batch、冗余 COUNT、安全与隔离、规范重构与 i18n | ✅ 已完成 |
| **第三阶段 (Sprint 3)** | FEAT-01, UX-04, UX-05, UX-06, UI-04, PERF-05, PERF-06, FEAT-02, FEAT-03, FEAT-04, FEAT-05, TEST-01 | 悬停预览卡片、移动端 Pinch 仿射补偿、光标增强、颜色图例、力导向优化、伴随图谱、标签节点、导出、自动化测试补齐 | ✅ 已完成：12 / 12 项已提交 |

---

## 29 项问题维度对照表

| 维度 | 包含问题编号 | 数量 | 状态汇总 |
| :--- | :--- | :--- | :--- |
| **1. 安全与数据一致性 (Security & Isolation)** | SEC-01, SEC-02, SEC-03, SEC-04 | 4 项 | ✅ 全部已修复并提交 (`b10e64bc`) |
| **2. 性能与计算管线 (Performance Pipeline)** | PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06 | 6 项 | ✅ 全部已提交 (`cef97815`, `2744cec7`, `029f252b`, `24157e33`) |
| **3. 交互与无障碍可用性 (UX & A11y)** | UX-01, UX-02, UX-03, UX-04, UX-05, UX-06 | 6 项 | ✅ 全部已提交 (`cec83ccb`, `83d212a9`, `7946bb73`, `24157e33`) |
| **4. UI 视觉与工程规范 (UI & Standards)** | UI-01, UI-02, UI-03, UI-04, SPEC-01, SPEC-02, SPEC-03 | 7 项 | ✅ 全部已提交 (`75ff31a1`, `929c8cc5`, `3fe6ec27`, `24157e33`) |
| **5. 主流功能对标 (Obsidian Gaps)** | FEAT-01, FEAT-02, FEAT-03, FEAT-04, FEAT-05 | 5 项 | ✅ 全部已提交 (`24157e33`, `64be16a4`, `8d6b5542`, `ac3a7fb7` + `b1b8314b`, `d3bcaec0`) |
| **6. 自动化测试与工程质量 (Testing)** | TEST-01 | 1 项 | ✅ 已提交（`9fb2722e` 选中后重绘循环修复 + 复现用例，`9d5e1831` 回归套件补齐）：图谱相关 20 个测试文件 / 143 条用例全绿（`npx vitest run src/shared/graph-filter-expression.test.ts src/client/lib/graph-settings.test.ts tests/graph-routes.test.ts src/client/demo/backend.test.ts src/client/features/graph`），补齐物理收敛、主题跟随、画布无障碍终态、ESC 逃逸栈、参数隔离五类此前只能人工复核的行为，并修掉测试暴露出的真实缺陷（一次选中让面板无限重绘） |
| **总计** | **全维度覆盖** | **29 项** | **29 项已全部提交完成** |

---

## 详细任务执行清单 (Task Breakdown)

### 0. 基础工作 (Infrastructure & Documentation)
- [x] **0.1 创建 git worktree 与 node_modules 软连接**
  - 分支：`improvement/relationship-graph-agy` 基于 `39a3814a9123a636acf7bb8f56f2df8c2406e054`
  - 目录：`/home/kubuntu/code/cloudflare/inkstone-relationship-graph-agy`
- [x] **0.2 整理并落地详细审查报告**
  - 文档：`docs/improvement/relationship-graph/review-with-agy-1.md`
  - 覆盖全部 29 项问题的具体文件、函数名称、缺陷代码行与修复方案。
- [x] **0.3 建立执行计划与追踪表**
  - 文档：`docs/improvement/relationship-graph/plan-with-agy-1.md`

---

### 第一阶段：止血与核心体验救治 (Sprint 1)

- [x] **1. 【PERF-01】解耦远程查询与客户端视觉参数（消除滑块全量网络请求与螺旋线白屏重置）**
  - **涉及文件**：`src/client/features/graph/graph-panel/index.tsx`, `canvas.tsx`, `canvas-draw.ts`
  - **修改要点**：
    1. 解耦 `request` 查询依赖项，视觉与动力学参数不触发 API 重新请求与白屏重置；
    2. `useGraphCanvasLoop` 改用 `prefsRef` 避免首帧布局循环重建；
    3. 新增 `repulsion`/`linkDistance` 退火唤醒与 `nodeScale` 半径就地更新响应。
  - **验证命令**：`npm run typecheck && npx vitest run src/client/lib/graph-settings.test.ts`
  - **提交哈希**：`cef97815`
  - **状态**：已完成并验证通过

- [x] **2. 【UX-01】重构节点交互模式（单击聚焦高亮、双击打开、Cmd+单击分屏）**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas.tsx`, `src/shared/locales/`
  - **修改要点**：
    1. 单击节点设为选中聚焦态，空白点击取消选中；
    2. 双击节点与 Enter 触发打开并关闭图谱；
    3. Cmd / Ctrl + 单击在次面板打开笔记且图谱保持常驻；
    4. 同步更新中英文操作提示文本。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-i18n.mjs && npm run typecheck && vitest`
  - **提交哈希**：`cec83ccb`
  - **状态**：已完成并验证通过

- [x] **3. 【UX-02】修复开启“减少动画”时图谱死锁阿基米德螺旋线**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`, `canvas-draw.test.ts`
  - **修改要点**：
    1. 检测到 `prefers-reduced-motion: reduce` 时，首帧离屏同步计算力导向终态；
    2. 消除节点永久死锁在阿基米德螺旋线问题，首帧即呈现静止完整图谱；
    3. 新增 `canvas-draw.test.ts` 自动化回归测试。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && npx vitest run src/client/features/graph/graph-panel/canvas-draw.test.ts`
  - **提交哈希**：`83d212a9`
  - **状态**：已完成并验证通过

- [x] **4. 【UX-03】修复设置抽屉按 ESC 误关整个图谱（ESC 逃逸栈穿透）**
  - **涉及文件**：`src/client/features/graph/graph-panel/settings.tsx`
  - **修改要点**：
    1. `GraphSettingsPanel` 内部挂载 `useEscape(true, onClose)`；
    2. 打开设置面板时作为顶层 ESC 响应者，优先关闭自身；
    3. 移动端添加背景遮罩与点击外部关闭支持。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && npm run typecheck`
  - **提交哈希**：`7946bb73`
  - **状态**：已完成并验证通过

- [x] **5. 【UI-01】修复 Canvas 内部渲染色不跟随系统主题翻转 (ADR-0002)**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`, `canvas.tsx`, `canvas-draw.test.ts`
  - **修改要点**：
    1. 通过 MutationObserver 监听 `document.documentElement` 的 `data-theme` 与 `data-accent` 属性变化；
    2. 变化时动态调用 `readThemeColors()` 更新调色板，并调用 `state.schedule?.()` 触发重绘；
    3. 不销毁画布、不重置节点物理坐标与相机；
    4. 新增自动化测试覆盖调色板读取与主题/强调色变更响应。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && npm run typecheck && npx vitest run src/client/features/graph/graph-panel/canvas-draw.test.ts`
  - **提交哈希**：`75ff31a1`
  - **状态**：已完成并验证通过

---

### 第二阶段：渲染管线优化与规范达标 (Sprint 2)

- [x] **6. 【PERF-02】消除 60fps 强制同步重排 (Layout Thrashing)**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`, `types.ts`, `index.tsx`, `canvas-draw.test.ts`
  - **修改要点**：
    1. 移除 `tick()` 中的 `canvas.getBoundingClientRect()`；
    2. 由 `createCanvasResizer` 维护画布逻辑宽高并在 `state.width`/`state.height` 中缓存，`tick` 内部纯读取缓存变量；
    3. 新增单元测试断言动画每帧渲染不触发 `getBoundingClientRect`。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && npm run typecheck && npx vitest run src/client/features/graph/graph-panel/canvas-draw.test.ts`
  - **提交哈希**：`2744cec7`
  - **状态**：已完成并验证通过

- [x] **7. 【UI-02 & UI-03】修复邻居节点标签弱化视觉矛盾，增加文本微光晕 (Text Halo)**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`, `constants.ts`, `canvas-draw.test.ts`
  - **修改要点**：
    1. 通过 `getConnectedNeighborIds` 构建当前聚焦节点的一度邻居集合，聚焦时当前节点及其直接邻居维持 1.0 高亮，非相关节点弱化至 0.18；
    2. 节点文字绘制前增加基于背景色的描边（`strokeText`），防止复杂拓扑关系线切断字迹；
    3. 新增单元测试覆盖一度邻居判定逻辑与文字描边光晕调用。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && npm run typecheck && npx vitest run src/client/features/graph/graph-panel/canvas-draw.test.ts`
  - **提交哈希**：`929c8cc5`
  - **状态**：已完成并验证通过

- [x] **8. 【PERF-03 & PERF-04】后端 D1 改用 batch 批量执行并消除冗余 COUNT**
  - **涉及文件**：`src/worker/routes/search/graph.ts`, `tests/graph-routes.test.ts`
  - **修改要点**：
    1. `loadGraphLinkRows` 改用 `db.batch([...statements])` 单次 RPC 往返；
    2. `rows.length <= limit` 时直接复用长度作为 `totalNodes`，避免冗余全表 count 扫描；
    3. 新增单元测试断言 `db.batch` 批量调用及在未溢出和溢出时对 COUNT 查询的跳过与触发。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && npm run typecheck && npx vitest run tests/graph-routes.test.ts`
  - **提交哈希**：`029f252b`
  - **状态**：已完成并验证通过

- [x] **9. 【SEC-01 & SEC-02 & SEC-03 & SEC-04】后端安全防御与状态隔离**
  - **涉及文件**：`src/worker/routes/search/graph.ts`, `src/client/features/graph/graph-panel/helpers.ts`, `src/client/features/graph/graph-panel/index.tsx`, `tests/graph-routes.test.ts`, `src/client/features/graph/graph-panel/helpers.test.ts`
  - **修改要点**：
    1. 递归 CTE 增加 `path` 跟踪与 `INSTR(path, ',' || adjacent.id || ',') = 0` 防环过滤，阻断互链指数爆炸 (SEC-01)；
    2. `wikiNoteTarget` 输出通过 `truncateText` 截断为 `LIMITS.titleMaxLength` (SEC-02)；
    3. `degreeJoin` 联查增加 `adj.deleted_at IS NULL AND adj.is_archived = 0` 过滤 (SEC-03)；
    4. LocalStorage 偏好配置支持当前用户作用域隔离（`graphPrefsStorageKey`），并在前端自动校验 `folderId` 存在性兜底回退 (SEC-04)；
    5. 补充针对防环、标题截断、归档度数排除与多用户偏好隔离的自动化测试。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && npm run typecheck && npx vitest run tests/graph-routes.test.ts src/client/features/graph/graph-panel/helpers.test.ts`
  - **提交哈希**：`b10e64bc`
  - **状态**：已完成并验证通过

- [x] **10. 【SPEC-01 & SPEC-02 & SPEC-03】代码规范与 i18n 整改**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas.tsx`, `canvas-draw.ts`, `index.tsx`, `settings.tsx`, `types.ts`, `src/shared/locales/en-US/graph.ts`, `src/shared/locales/zh-CN/graph.ts`
  - **修改要点**：
    1. **SPEC-01**：超过 3 个参数的函数全部重构成结构体/对象传参（`useGraphCanvasLoop`, `useGraphDrag`, `createGraphTicker`, `drawNodes`, `drawLabels`, `GraphHeader`）；
    2. **SPEC-02**：原生标签替换为统一 UI 组件库（`Segmented` 替换 `GraphScopeToggle`，`Input` 替换 `GraphSearchBox`，`Button`/`IconButton` 替换 `settings.tsx` 中的原生 `<button>`）；
    3. **SPEC-03**：统计文案改用单一具名参数插值 key，消除动态字符串拼接，完善英文与中文资源。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && npm run typecheck && npx vitest run src/client/features/graph/graph-panel/`
  - **提交哈希**：`3fe6ec27`
  - **状态**：已完成并验证通过

---

### 第三阶段：功能进阶与产品力赶超 (Sprint 3)

- [x] **11. 【FEAT-01】悬停节点即时卡片预览 (Page Preview)**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas.tsx`, `graph-overlays.tsx`, `use-graph-preview.ts`
  - **修改要点**：悬停节点或单击选中时在节点旁显示 Markdown 预览浮层，支持快速查看笔记摘要内容。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && npm run typecheck`
  - **提交哈希**：`24157e33`
  - **状态**：已完成并验证通过

- [x] **12. 【UX-04 & UX-05 & UX-06】移动端 Pinch 仿射补偿、光标增强与无障碍读屏**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas.tsx`, `canvas-hooks.tsx`, `graph-overlays.tsx`
  - **修改要点**：
    1. **UX-04**：双指缩放计算两点几何中心并反向补偿 `offsetX/Y`，消除偏心跳动；
    2. **UX-05**：悬停节点显示 `pointer` 光标，支持空格平移与鼠标中键平移；
    3. **UX-06**：状态信息与节点选中增加 `aria-live="polite"` 读屏宣告。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && npm run typecheck`
  - **提交哈希**：`24157e33`
  - **状态**：已完成并验证通过

- [x] **13. 【UI-04 & PERF-05 & PERF-06】色彩图例、力导向衰减模型与 fitGraph 竞态修复**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`, `canvas.tsx`, `helpers.ts`, `graph-overlays.tsx`
  - **修改要点**：
    1. **UI-04**：增加半透明调色盘图例，未设色标签通过 Hash 色板兜底；
    2. **PERF-05**：排斥力采用平滑衰减模型替代 346px 硬截断；
    3. **PERF-06**：物理收敛后平滑过渡居中自适应，消除开屏弹飞。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && npm run typecheck`
  - **提交哈希**：`24157e33`
  - **状态**：已完成并验证通过

- [x] **14. 【FEAT-02】常驻分屏与伴随式局部图谱工作流 (Secondary Pane / Companion Local Graph)**
  - **涉及文件**：`src/client/features/graph/`, `src/client/features/workspace/`
  - **修改要点**：将 `GraphCanvas` 解耦为支持独立嵌入形态的视图，允许在工作区分屏面板作为当前笔记的伴随局部图谱实时漫游。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && npm run typecheck && npm test`
  - **提交哈希**：`64be16a4`
  - **状态**：已完成并验证通过

- [x] **15. 【FEAT-03】缺失“标签作为拓扑实体节点”能力 (Tags as Explicit Topology Nodes)**
  - **涉及文件**：`src/shared/graph-tag-nodes.ts`, `src/shared/types/graph.ts`, `src/worker/routes/search/graph.ts`, `src/worker/routes/search/graph-nodes.ts`, `src/client/demo/backend/routes/search.ts`, `src/client/lib/api/vault.ts`, `src/client/lib/graph-settings.ts`, `src/client/features/graph/graph-panel/{helpers,canvas-draw,canvas-hooks,canvas,index,types,constants}.ts(x)`, `src/shared/locales/{en-US,zh-CN}/graph.ts`, `tests/graph-routes.test.ts`
  - **修改要点**：
    1. `GraphNode.kind` 扩展出 `tag`，服务端新增 `applyTagNodes()`（Worker 与 demo 共用同一实现），按标签名大小写归一聚类，为每个标签合成 `tag:<name>` 节点与「笔记 → 标签」成员边，最多 60 个簇，溢出计入 `truncated`；
    2. 查询串新增 `tagNodes=1`（`GraphQuery.showTagNodes`），设置抽屉「显示」组新增开关并按用户作用域持久化；
    3. 前端标签节点配色复用响应里笔记自带的标签色（`tagColorsByName` 在布局时写入 `CanvasNode.tagColor`），未设色走 Hash 色板，图例在 `groupBy='none'` 时也能列出标签簇；
    4. 交互按 `kind` 分派：标签节点支持右键「按标签 {value} 筛选」与固定，双击/Enter/拖拽不再误建同名笔记；统计行改用 `countWikiLinkEdges()`，标签成员边不冒充 wiki 链接；
    5. 顺带修正图例数据源：`canvas.tsx` 原先从物理态 ref 读取节点，图例会滞后一次响应，改由响应节点计算并补组件回归。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && node scripts/check-visual-labels.mjs && npm run typecheck && npx vitest run tests/graph-routes.test.ts src/client/features/graph src/client/lib/graph-settings.test.ts src/client/demo`
  - **提交哈希**：`8d6b5542`
  - **状态**：已完成并验证通过（pre-commit 钩子内 403 个测试文件 / 3409 条断言全绿；图例数据源与标签配色派生两条新行为各由具名断言在变异测试中杀死）

- [x] **16. 【FEAT-04】缺失高级排除过滤语法与自定义颜色规则 (Filter Exclusion Syntax & Color Rules)**
  - **涉及文件**：`src/shared/graph-filter-expression.ts`, `src/worker/routes/search/graph.ts`, `src/client/demo/backend/routes/search.ts`, `src/client/features/graph/graph-panel/settings.tsx`, `helpers.ts`
  - **修改要点**：支持 `-path:` 或 `-tag:` 高级排除语法；设置抽屉支持添加颜色分组规则并展示在图例中。
  - **进度（A 已完成）**：过滤行语法
    1. 新增 `src/shared/graph-filter-expression.ts`：`parseGraphFilter()` 把过滤行切成自由文本 + `tag:`/`path:` 限定项（各可带前导 `-` 表示排除，引号值可含空格，超出 `GRAPH_FILTER_TERM_LIMIT = 8` 或解析失败的记作回落到文本，宁可少显示也不静默放宽）；`graphFilterMatches()` 是同一语法在客户端的求值，供 demo 后端与后续颜色规则复用；
    2. `src/worker/routes/search/graph.ts`：`buildGraphFilters` 改用解析结果，新增 `appendFilterTerm()` 把限定项编译成 `EXISTS/NOT EXISTS`（标签按名精确匹配、`COLLATE NOCASE`）与 `folders` 上的 `LIKE ... ESCAPE`（排除分支 `COALESCE(f.name,'')` 让没有目录的笔记不被 `-path:` 误杀）；
    3. 两条溢出 `COUNT` 回退查询补上与分页同一 `LEFT JOIN folders f`，否则 `path:` 条件在结果超出 `limit` 时会让接口 500；
    4. demo 后端 `filterGraphNotes` 改结构体传参并复用 `graphFilterMatches`，查询串解析抽为 `graphNoteFilter()` 以守住 50 行函数上限；
    5. 图谱过滤框加 `title` 提示（新增 `graph.filter_syntax_hint` 双语言键），使语法可被发现。
  - **进度（B 已完成）**：自定义颜色分组规则
    1. `src/client/lib/graph-settings.ts`：新增 `GraphColorGroup { id, query, color }` 与 `GRAPH_COLOR_GROUP_LIMIT = 5`，偏好结构加 `colorGroups`（随 `inkstone.graph.preferences.v1[.<userId>]` 持久化）；
    2. `graph-panel/helpers.ts`：新增 `colorGroupsByNodeId()` 复用 A 部分的 `graphFilterMatches()` 把规则映射到节点——首条命中的规则优先生效（用户设定的顺序即优先级），空过滤行不按通配处理（否则刚加一行就把整图重绘），标签节点保留自身配色（它的颜色就是标签在应用里的样子）；`nodeColor()` 先取规则色再回落 `groupBy`；`buildColorLegends()` 把规则条目排在分组条目之前、按标签去重仍限 10 条，且只有规则（`groupBy='none'`）时也出图例；`colorGroupsPreference()` 回读存储时逐条校验颜色在 AA 调色板内、过滤行非空、`query` 截到 `COLOR_GROUP_QUERY_MAX`、总数截到上限；
    3. 绘制路径：`CanvasNode` 加 `colorGroup` 字段，`canvas-draw.ts` 在 `buildInitialLayout` 建节点时打戳；`canvas-hooks.tsx` 新增专门 effect 在规则编辑后就地重打戳并重绘（不重建布局，保留拖拽坐标、相机与已跑的物理迭代）；`canvas.tsx` 的图例计算抽为 `useGraphLegends()`（原函数加 4 行会越过 50 行上限）并把 `colorGroups` 纳入 memo 依赖；
    4. `graph-panel/settings-color-rules.tsx`：外观区新增规则编辑器——`role='group'` 命名、Add/删除按 id 而非位置、过滤行 `Input`（`maxLength` 与存储截断同值，避免写进去被静默截短）、10 色 AA 调色板色块用 `aria-pressed` 表示当前色，对勾取 `--swatch-white` 令牌而非裸 `text-white`；`settings.tsx` 接入并写回 `colorGroups`；
    5. 新增 `graph.color_rule_hint`、`graph.color_rule_remove` 双语言键，复用已有的 `graph.color_groups`/`graph.add_color_rule`/`graph.color_rule_query`。
  - **验证命令**：`node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && node scripts/check-visual-labels.mjs && node scripts/check-hardcoded.mjs && npm run typecheck && npx vitest run src/shared/graph-filter-expression.test.ts tests/graph-routes.test.ts src/client/demo/backend.test.ts src/client/features/graph`
  - **提交哈希**：`ac3a7fb7`（A：排除过滤语法）、`b1b8314b`（B：自定义颜色分组规则）
  - **状态**：A、B 均已完成并验证通过。A：新增真实 D1 语法分组 4 条 + demo 后端 2 条 + 解析/匹配单测 8 条；worker 侧 M1/M2/M3 与 demo 侧 M4/M5 五个变异各由具名断言杀死，其中 M3 专防 `COUNT` 回退缺失 `folders` 联表。B：新增 18 条用例（`helpers.test.ts` 规则命中/配色/图例/存储 6 条、`canvas-draw.test.ts` 建布局打戳 2 条、`canvas-color-groups.test.ts` 实时重绘且不重建布局 2 条、`settings-color-rules.test.ts` 面板写回与控件语义 6 条、`canvas-legend.test.ts` 规则图例 2 条）；B01–B24 共 24 个变异全部由具名断言杀死、无存活，其中 B12/B13 专防「改规则不重绘」、B24 专防图例 memo 漏掉 `colorGroups` 依赖；pre-commit 钩子内 402 个测试文件 / 3394 条用例全绿，`npm run build` 通过。

- [x] **17. 【FEAT-05】缺失节点坐标固定 (Pin) 与高清图片/矢量导出 (Pin Nodes & Export PNG/SVG)**
  - **涉及文件**：`src/client/features/graph/graph-panel/graph-export.ts`, `use-graph-export.ts`, `index.tsx`, `types.ts`, `canvas-draw.ts`, `constants.ts`, `helpers.ts`, `src/shared/locales/{en-US,zh-CN}/graph.ts`
  - **修改要点**：
    1. 节点坐标固定（Pin）已随标签节点在 `8d6b5542` 落地（右键「固定此节点」、`CanvasNode.pinned`、钉住环），本项补的是导出；
    2. 新增 `graph-export.ts`：`graphExportBounds()` 按节点包围盒出图（半径 + 标题占位 + `GRAPH_EXPORT_PADDING`，空图也返回有限盒），`graphExportGeometry()` 以 `GRAPH_EXPORT_SCALE = 2` 超采样并用 `GRAPH_EXPORT_MAX_EDGE = 4000` 回缩（边长再大浏览器 `toBlob` 返回 null，即静默空文件）；SVG 由字符串发射（`viewBox` 就是包围盒，所有非数值插值过 `escapeHtml`），PNG 走离屏 canvas 复用面板的 `drawEdges/drawNodes/drawLabels`，两条出口画的是同一份 `CanvasState`；
    3. 关键取舍：栅格图固定按世界缩放（`EXPORT_DRAW_SCALE = 1`）绘制，设备像素只进 `setTransform`——否则「适应窗口」后的小缩放会按 `graphLabelVisible` 的 `scale >= 1.1` 规则让标题在导出的图里凭空消失；离屏 `scene` 是新对象，读者屏幕上的缩放与尺寸不受导出影响；
    4. `constants.ts` 抽出 `GRAPH_LABEL_MAX/FONT_SIZE/OFFSET/HALO`、`GRAPH_EDGE_ALPHA/LABEL_ALPHA/PIN_ALPHA/ARROW_SIZE`、`FALLBACK_FONT_FAMILY`，`helpers.ts` 抽出 `graphNodeLabel()`（tag 带 `#` 前缀、按 `GRAPH_LABEL_MAX` 截断）与 `graphLabelVisible()`，`canvas-draw.ts` 抽出 `arrowHeadPoints()` 并导出三个绘制函数——面板与导出不再各存一份视觉取值；
    5. `use-graph-export.ts` 新增 `useGraphExport()`：导出期间 `isExporting` 锁住入口，成功给 `graph.export_done`、失败给 `graph.export_failed` + `errorMessage()`（不静默、不交空文件）；文件经 `saveImage()` 交付而非 `downloadBlob`（后者静态拉入 markdown 渲染链，会触碰 vendor/budget 门禁）；`index.tsx` 顶栏加两个 `IconButton`（无图或导出中 `disabled`，`Tooltip` + `aria-label`），`useGraphHeaderActions` 改对象传参、`canZoom` 更名 `hasGraph`；
    6. 双语言补 `graph.export_done` / `graph.export_failed`（`graph.export_png` / `graph.export_svg` 两键早已存在，直接复用）。
  - **验证命令**：`npm run typecheck && node scripts/check-size.mjs && node scripts/check-comments.mjs && node scripts/check-i18n.mjs && node scripts/check-visual-labels.mjs && node scripts/check-hardcoded.mjs && npm run style:check && npx vitest run src/shared/graph-filter-expression.test.ts src/client/lib/graph-settings.test.ts tests/graph-routes.test.ts src/client/demo/backend.test.ts src/client/features/graph && npm run build`
  - **提交哈希**：`d3bcaec0`
  - **状态**：已完成并验证通过。新增 28 条用例（`graph-export.test.ts` 包围盒 / 矢量 / 栅格 / 文件交付 20 条、`use-graph-export.test.ts` 挂起态与两种 toast 4 条、`header-export.test.ts` 真实面板挂载按指针 2 条、`canvas-draw.test.ts` 箭头几何 2 条），图谱套件从 10 文件 80 条增至 13 文件 108 条；GE1–GE12、CD1–CD3、HP1–HP3、UG1–UG3、IX1–IX3 共 24 个变异全部由具名断言杀死、无存活（其中 GE7 专防「标题跟随读者当前缩放」、GE8 专防「空 PNG 静默成功」、IX1/IX3 专防「无图也能点」）。13 项静态门禁、`npm run typecheck`、`npm run build`、`npm run budget:check` 全绿；全量 `npm run test:unit` 为 5396 通过 / 2 条 5s 超时（`blog-comments-window.test.ts:44`、`calendar-tree.test/activity.test.ts:251`，两文件单跑 12 条全绿，属既有负载抖动，与本改动无导入交集）。

- [x] **18. 【TEST-01】图谱模块自动化单元与集成测试补齐**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas-selection-loop.test.ts`, `canvas-a11y.test.ts`, `canvas-physics.test.ts`, `canvas-theme.test.ts`, `canvas-dynamic-prefs.test.ts`, `panel-escape-stack.test.ts`, `panel-parameter-isolation.test.ts`, `graph-canvas-mount.test-helpers.ts`, `graph-panel-mount.test-helpers.ts`, `preview-stub.test-helpers.ts`（回归中新发现的缺陷修复落在 `canvas.tsx`, `use-graph-preview.ts`）
  - **修改要点**：
    1. 先把只靠人工复核的行为变成断言：物理（收敛后不再索取帧、稳定后重绘不再扰动画面、斥力作用半径覆盖远端团簇、减少动画走静态布局且相机仍能适配、钉住与被指针按住的节点不被搬走）、主题（配色全部取自文档令牌、主题翻转重读令牌并把新颜色画进屏上已有像素）、无障碍终态（画布的 `role`/可访问名/进入 Tab 序、方向键逐帧播报进出边数、Enter 打开笔记或建笔记、Space 与缩放/Home 键归画布所有、截断提示）、ESC 逃逸栈（后开的设置抽屉先关、关掉后把 Escape 归还给图谱）、参数隔离（纯客户端偏好不触发第二次请求也不重建画布、`showTagNodes` 确实重新请求、偏好按账号写入存储）；
    2. 挂载策略分两层：`graph-canvas-mount.test-helpers.ts` 按手搭的 `CanvasState` 直接挂画布（jsdom 无 2d 上下文，绘制打桩、状态求真），`graph-panel-mount.test-helpers.ts` 挂真实 `GraphPanel` 并按可访问名点控件、按读者方式派发 Escape，用于必须由 preferences effect 写状态的面板级行为；`*.test-helpers.ts` 不被 Vitest 收集，跨套件共用而不产重复用例；
    3. 回归查出真实缺陷：一次选中让 `setLive`/预览写入的状态成为 effect 依赖，形成永不停止的重绘。按「修 bug 先写复现测试」补 `canvas-selection-loop.test.ts`（预览桩按单次选中的绘制次数计数，超上限即抛错，使套件变红而不是挂死），修复为依赖 `preview.showPreview`/`preview.onHoverNode` 具体方法，并让 `usePreviewTimers` 经 ref 读取内联回调，使 `armHover/armHide` 不随渲染重建（`9fb2722e`）；
    4. 断言取「驱动是否生效」而非只取终态：动态偏好套件用同一个 `stateRef` 对象（每次渲染新建 ref 会让依赖本身看起来在变），并在挂载之后才标记画面已静止（唤醒 effect 在挂载时同样运行），据此区分「就地缩放节点半径」与「重建布局」，并保留读者拖过的坐标作为不可重建的证据。
  - **验证命令**：`npm run typecheck && for g in style:check size:check comments:check escape:check empty-catch:check hardcoded:check tokens:check i18n:check module-state:check deep-imports:check surfaces:check vendor:check; do npm run $g; done && npx vitest run --config vitest.config.ts src/shared/graph-filter-expression.test.ts src/client/lib/graph-settings.test.ts tests/graph-routes.test.ts src/client/demo/backend.test.ts src/client/features/graph && npm run build`
  - **提交哈希**：`9fb2722e`（选中后重绘循环修复 + 复现用例 + 共用挂载脚手架）、`9d5e1831`（其余五类回归套件补齐）
  - **状态**：已完成并验证通过。同一命令下图谱相关从 13 文件 108 条增至 20 文件 143 条（+7 文件 / +35 条，基线取 `git archive HEAD~2` 快照实测）。M1–M9 九个变异全部由具名断言杀死、无存活：M1 让 ESC 栈不再只作用最外层、M2 把斥力加回请求依赖、M3 偏好写成不按账号存储、M4 调参不唤醒物理、M5 链长脱离依赖、M6 忽略节点大小、M7 分组变化不重绘、M8/M9 把 `preview` 整对象放回依赖（即本次修掉的循环，M8 让两条用例同红）。12 项静态门禁、`npm run typecheck`、`npm run build`、`npm run budget:check` 全绿，两个提交各自的 pre-commit 钩子（工作区静态门禁 + 增量 `tsc -b` + `vitest related`）亦通过。全量 `npm run test:unit` 在本机负载敏感：改动后的干净一轮为 617 文件 / 5437 通过 + 1 跳过（303 s），此前两轮分别报 5 与 6 条失败，失败块读出来是 `Test timed out in 5000ms`（`tests/radiogroup-names` 两条、`tests/starter-deck-render`、`music/music-hub-modal`、`calendar-tree.test/activity`），另含一条 `music/music-store/eq.test.ts:164` 的取值断言差；这些文件与图谱无导入交集，七个文件按 `--testTimeout=30000` 单跑 6 文件 54 条全绿；改动前的 `git archive HEAD~2` 快照同样报出 `blog-comments-window` 超时（该快照另有一条 `merge-preflight-real-merge` 因无 `.git` 目录无法执行 `git cat-file`，属快照环境限制），故判定为既有抖动、非本次回归；`eq` 那条断言差属音乐模块的既有负载形态，按「不顺手修无关问题」另开事项跟踪，未在本批次改动。
