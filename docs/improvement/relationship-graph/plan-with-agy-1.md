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
| **第三阶段 (Sprint 3)** | FEAT-01, UX-04, UX-05, UX-06, UI-04, PERF-05, PERF-06, FEAT-02, FEAT-03, FEAT-04, FEAT-05, TEST-01 | 悬停预览卡片、移动端 Pinch 仿射补偿、光标增强、颜色图例、力导向优化、伴随图谱、标签节点、导出、自动化测试补齐 | ⏳ 待开始 |

---

## 29 项问题维度对照表

| 维度 | 包含问题编号 | 数量 | 状态汇总 |
| :--- | :--- | :--- | :--- |
| **1. 安全与数据一致性 (Security & Isolation)** | SEC-01, SEC-02, SEC-03, SEC-04 | 4 项 | ✅ 全部已修复并提交 (`b10e64bc`) |
| **2. 性能与计算管线 (Performance Pipeline)** | PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06 | 6 项 | ✅ 4 项已提交 (`cef97815`, `2744cec7`, `029f252b`), ⏳ 2 项待推进 |
| **3. 交互与无障碍可用性 (UX & A11y)** | UX-01, UX-02, UX-03, UX-04, UX-05, UX-06 | 6 项 | ✅ 3 项已提交 (`cec83ccb`, `83d212a9`, `7946bb73`), ⏳ 3 项待推进 |
| **4. UI 视觉与工程规范 (UI & Standards)** | UI-01, UI-02, UI-03, UI-04, SPEC-01, SPEC-02, SPEC-03 | 7 项 | ✅ 6 项已提交 (`75ff31a1`, `929c8cc5`, `3fe6ec27`), ⏳ 1 项待推进 (UI-04) |
| **5. 主流功能对标 (Obsidian Gaps)** | FEAT-01, FEAT-02, FEAT-03, FEAT-04, FEAT-05 | 5 项 | ⏳ 5 项待推进 |
| **6. 自动化测试与工程质量 (Testing)** | TEST-01 | 1 项 | ⏳ 持续编写回归测试，终态收敛 |
| **总计** | **全维度覆盖** | **29 项** | **17 项已提交完成，12 项推进中** |

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

- [ ] **11. 【FEAT-01】悬停节点即时卡片预览 (Page Preview)**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas.tsx`, `graph-overlays.tsx`
  - **修改要点**：悬停节点或单击选中时在节点旁显示 Markdown 预览浮层，支持快速查看笔记摘要内容。
  - **提交哈希**：`待提交`

- [ ] **12. 【UX-04 & UX-05 & UX-06】移动端 Pinch 仿射补偿、光标增强与无障碍读屏**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas.tsx`
  - **修改要点**：
    1. **UX-04**：双指缩放计算两点几何中心并反向补偿 `offsetX/Y`，消除偏心跳动；
    2. **UX-05**：悬停节点显示 `pointer` 光标，支持空格平移与鼠标中键平移；
    3. **UX-06**：状态信息与节点选中增加 `aria-live="polite"` 读屏宣告。
  - **提交哈希**：`待提交`

- [ ] **13. 【UI-04 & PERF-05 & PERF-06】色彩图例、力导向衰减模型与 fitGraph 竞态修复**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`, `canvas.tsx`, `helpers.ts`
  - **修改要点**：
    1. **UI-04**：增加半透明调色盘图例，未设色标签通过 Hash 色板兜底；
    2. **PERF-05**：排斥力采用平滑衰减模型替代 346px 硬截断；
    3. **PERF-06**：物理收敛后平滑过渡居中自适应，消除开屏弹飞。
  - **提交哈希**：`待提交`

- [ ] **14. 【FEAT-02】常驻分屏与伴随式局部图谱工作流 (Secondary Pane / Companion Local Graph)**
  - **涉及文件**：`src/client/features/graph/`, `src/client/features/workspace/`
  - **修改要点**：将 `GraphCanvas` 解耦为支持独立嵌入形态的视图，允许在工作区分屏面板作为当前笔记的伴随局部图谱实时漫游。
  - **提交哈希**：`待提交`

- [ ] **15. 【FEAT-03】缺失“标签作为拓扑实体节点”能力 (Tags as Explicit Topology Nodes)**
  - **涉及文件**：`src/worker/routes/search/graph.ts`, `src/client/features/graph/graph-panel/types.ts`, `canvas-draw.ts`
  - **修改要点**：后端与前端支持将 `#tag` 转化为显式图节点拉扯聚类，通过标签将无直接互链的笔记拉入同一网络簇。
  - **提交哈希**：`待提交`

- [ ] **16. 【FEAT-04】缺失高级排除过滤语法与自定义颜色规则 (Filter Exclusion Syntax & Color Rules)**
  - **涉及文件**：`src/worker/routes/search/graph.ts`, `src/client/features/graph/graph-panel/settings.tsx`, `helpers.ts`
  - **修改要点**：支持 `-path:` 或 `-tag:` 高级排除语法；设置抽屉支持添加颜色分组规则并展示在图例中。
  - **提交哈希**：`待提交`

- [ ] **17. 【FEAT-05】缺失节点坐标固定 (Pin) 与高清图片/矢量导出 (Pin Nodes & Export PNG/SVG)**
  - **涉及文件**：`src/client/features/graph/graph-panel/canvas.tsx`, `index.tsx`, `canvas-draw.ts`
  - **修改要点**：右键菜单支持“固定此节点”；顶栏新增“导出为 PNG / 矢量 SVG”操作。
  - **提交哈希**：`待提交`

- [ ] **18. 【TEST-01】图谱模块自动化单元与集成测试补齐**
  - **涉及文件**：`src/client/features/graph/graph-panel/` 测试套件
  - **修改要点**：编写 Vitest 测试覆盖物理计算收敛、主题跟随、无障碍终态、ESC 逃逸栈与参数隔离。
  - **提交哈希**：`待提交`
