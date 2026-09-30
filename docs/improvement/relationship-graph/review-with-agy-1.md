# Inkstone 笔记应用「关系图谱」功能模块深度审查与优化分析报告 (详细版)

> **审查人员**：全栈开发工程师（专注前端 UI/UX 设计、Web 安全、高性能渲染与服务端架构）  
> **审查对象**：`src/client/features/graph/`、`src/worker/routes/search/graph.ts`、`src/client/lib/graph-settings.ts` 及关联组件  
> **评估基线**：项目规范 [`AGENTS.md`](../../../AGENTS.md)、渲染主题规范 [`ADR-0002`](../../../ADR-0002-renderer-theme-following.md)、主流网状双链工具（Obsidian、Logseq）  
> **目标**：本文档详细记录了涉及的具体文件、函数/组件名称、行号、问题现象、根因机理与整改方案，后续开发者可直接根据此文档与计划表上手推进，无需重复全量通读源码。

---

## 1. 执行摘要 (Executive Summary)

Inkstone 的关系图谱模块具备良好的基础骨架（支持全局/局部图谱、力导向螺旋初始布局、未创建双链节点推导、文件夹与标签着色过滤等）。然而，在深入源码与交互实测后，我们发现图谱存在**数项破坏核心使用体验的“阻断级缺陷”**与**严重违反 AGENTS.md 工程规范的代码**：

1. **阻断级交互 Bug**：
   - **PERF-01**：在侧边栏调节“排斥力/连线距离/节点大小”滑块时，前端将视觉参数混入查询参数，导致重新请求 API、全屏白屏遮罩、并重新运行初始布局，所有节点瞬间被炸回螺旋线；
   - **UX-01**：在画布上单击任意节点，无条件触发 `onClose()` 并跳转打开笔记，彻底阻断了在图谱中持续漫游探索的核心体验；
   - **UX-02**：系统开启“减少动画”（`prefers-reduced-motion: reduce`）时，物理迭代直接跳过，所有节点永久堆叠死锁在螺旋线上。
2. **规范与 A11y 违背**：
   - **SPEC-01**：多处函数签名拥有 7~10 个位置参数，违反结构体传参规范；
   - **SPEC-02**：绕过统一组件库裸写原生 `div`、`button`、`input` 控件（违反 AGENTS.md 铁律 10）；
   - **SPEC-03**：多语言字符串动态拼接（`{notes}{t('graph.notes')}`），破坏英文复数与多语言语序；
   - **UX-03**：设置抽屉未注册自身的 ESC 栈，按 ESC 直接穿透导致整个图谱关闭；
   - **UI-01**：Canvas 内部渲染颜色仅在挂载时读取一次，系统切换主题时画布背景和线条冻结（违反 ADR-0002）。
3. **架构与性能瓶颈**：
   - **PERF-02**：每个 rAF 帧内强制调用 `canvas.getBoundingClientRect()` 触发 60fps 强制同步重排（Layout Thrashing）；
   - **PERF-03**：D1 数据库分块加载边和标签使用 `for` 循环串行 `await`，带来大量 RPC 网络往返延时；
   - **PERF-04**：当节点未达到分页上限时，仍然无条件执行带子查询的 `SELECT COUNT(*)` 全表扫描；
   - **SEC-01**：递归 CTE 环路由于 `(id, depth)` 联合判定，在双向环路中存在 $O(K^d)$ 指数路径爆炸风险；
   - **SEC-03**：笔记连接度统计未过滤已归档笔记，导致度数泄露与前端画布连线数量脱节。

---

## 2. 缺陷与优化清单（含文件、函数与代码级细节）

### 2.1 安全、数据一致性与存储隔离 (Security & Data Integrity)

#### 【SEC-01】递归 CTE 环路指数路径膨胀（局部图谱潜在 DoS 风险）
- **文件**：`src/worker/routes/search/graph.ts`
- **函数**：`runLocalGraphQuery(db, params, filters, filterBinds)`
- **行号**：第 199–211 行
- **缺陷代码**：
  ```sql
  WITH RECURSIVE neighborhood(id, depth) AS (
    SELECT ? AS id, 0 AS depth
    UNION
    SELECT CASE WHEN l.source_note_id = neighborhood.id THEN l.target_note_id ELSE l.source_note_id END,
      neighborhood.depth + 1
    FROM neighborhood
    JOIN links l ON l.user_id = ? AND l.target_note_id IS NOT NULL
      AND (l.source_note_id = neighborhood.id OR l.target_note_id = neighborhood.id)
    JOIN notes adjacent ON adjacent.id = CASE
      WHEN l.source_note_id = neighborhood.id THEN l.target_note_id ELSE l.source_note_id END
      AND adjacent.user_id = l.user_id AND adjacent.deleted_at IS NULL AND adjacent.is_archived = 0
    WHERE neighborhood.depth < ?
  ), nearby AS (SELECT id, MIN(depth) AS depth FROM neighborhood GROUP BY id)
  ```
- **根因分析**：SQLite 递归 CTE 的 `UNION` 去重判定依赖行中全部列 `(id, depth)`。当知识库存在双向闭环结构（如 A 与 B 互链）时，A 在 `depth=0` 入表，在 `depth=2` 时会通过 B 再次作为新行 `(A, 2)` 入表。由于 `(A, 0) != (A, 2)`，`UNION` 无法去重。在 `depth=3` 且节点连接密集时，子网产生 $O(K^3)$ 路径爆炸，在 SQLite 临时表中生成海量重复行，极易耗尽 Workers 内存或引发 504 超时。
- **整改方案**：在 CTE 递推部分增加递归深度与防回环过滤，或限制 CTE 探索产生的分支上限（如 `LIMIT 1000`）；在 CTE 外部提前将邻接关系拉平，或在内存受限时控制最大深度的遍历集合。

#### 【SEC-02】传输层未解析标题无界长度风险
- **文件**：`src/worker/routes/search/graph.ts`
- **函数**：`buildGraphEdges(linkRows, includeUnresolved)`
- **行号**：第 337–340 行
- **缺陷代码**：
  ```ts
  const current = unresolved.get(link.target_key) ?? {
    title: wikiNoteTarget(link.target_title),
    sources: new Set<string>(),
  }
  ```
- **根因分析**：`wikiNoteTarget` 仅过滤了 `#` 锚点和 `|` 别名，但如果用户在笔记中输入畸形未闭合的双链（如 `[[` 之后跟随数千字符），`target_title` 会被原样放入 `unresolved` 节点中并通过 API 下发给前端，造成网络传输膨胀并在 Canvas 文本绘制时耗费过多计算。
- **整改方案**：使用 `@shared/text-utils` 中的 `truncateText(wikiNoteTarget(link.target_title), LIMITS.titleMaxLength)` 兜底截断，确保未解析节点标题长度受到严格约束。

#### 【SEC-03】归档笔记度数泄露与前端连线脱节
- **文件**：`src/worker/routes/search/graph.ts`
- **常量/SQL 片段**：`degreeJoin`
- **行号**：第 58–71 行
- **缺陷代码**：
  ```sql
  const degreeJoin = `
    LEFT JOIN (
      SELECT note_id,
             SUM(is_endpoint) AS degree,
             SUM(is_target) AS in_degree,
             SUM(is_source) AS out_degree
      FROM (
        SELECT source_note_id AS note_id, 1 AS is_endpoint, 0 AS is_target, 1 AS is_source
          FROM links WHERE user_id = ? AND target_note_id IS NOT NULL
        UNION ALL
        SELECT target_note_id AS note_id, 1, 1, 0
          FROM links WHERE user_id = ? AND target_note_id IS NOT NULL
      ) GROUP BY note_id
    ) d ON d.note_id = n.id`
  ```
- **根因分析**：`degreeJoin` 仅过滤了 `user_id = ? AND target_note_id IS NOT NULL`，并未联表检查对端笔记是否处于 `is_archived = 1` 或 `deleted_at IS NOT NULL`。而在图谱主体展示中，已归档笔记被显式排除在外。这导致前端显示的“入 5 · 出 3”与画布上实际画出的连线数量脱节，并在分享/导出场景下产生潜在信息泄露。
- **整改方案**：在 `degreeJoin` 内部联查对端 `notes target_note` 与 `source_note`，确保只有两端皆为有效且未归档笔记时才计入度数：
  `JOIN notes adjacent ON adjacent.id = (对端ID) AND adjacent.deleted_at IS NULL AND adjacent.is_archived = 0`。

#### 【SEC-04】LocalStorage 偏好缺少多用户/租户隔离
- **文件**：`src/client/features/graph/graph-panel/helpers.ts` 与 `constants.ts`
- **函数**：`loadPreferences()`、`useGraphPrefs()`
- **行号**：`helpers.ts:16`、`constants.ts:5`
- **缺陷代码**：
  ```ts
  export const GRAPH_PREFS_KEY = 'inkstone.graph.preferences.v1'
  ...
  const stored = JSON.parse(localStorage.getItem(GRAPH_PREFS_KEY) ?? '{}')
  ```
- **根因分析**：偏好设置保存在全局固定的 LocalStorage Key 中，其中包含了特定的 `folderId`。当同一浏览器切换登录不同账号时，新账号会读取到旧账号的 `folderId`，导致图谱发起过滤不存在文件夹的请求，直接呈现“空图谱”，造成数据丢失的假象。
- **整改方案**：在读取和保存偏好时，加入用户标识隔离（或在读取 `folderId` 时，如果不在当前可用文件夹列表中，自动回退为空字符串）。

---

### 2.2 前端与后端性能及计算管线 (Performance Pipeline)

#### 【PERF-01】滑块拖动触发全量网络请求与白屏重置（恶性反模式）
- **文件**：`src/client/features/graph/graph-panel/index.tsx`
- **组件/Hook**：`GraphPanel`、`graphRequest`、`useGraphData`
- **行号**：`index.tsx:74-90, 92-120, 264-265, 283`
- **缺陷代码**：
  ```tsx
  // index.tsx:264
  const request: GraphQuery = useMemo(() => graphRequest(prefs, activeNoteId, query, selectedTags), [activeNoteId, prefs, query, selectedTags])
  const { data, loadError, setReload } = useGraphData(request)
  ```
  ```tsx
  // useGraphData 内部 (index.tsx:96-120)
  useEffect(() => {
    ...
    setData(null) // 清空数据，导致 GraphBody 卸载 GraphCanvas 渲染 LoadingBlock
    api.graph(request).then(...)
  }, [request, reload])
  ```
- **根因分析**：`prefs` 包含了视觉参数（`repulsion` 排斥力, `linkDistance` 连线距离, `nodeScale` 节点大小, `arrows`, `labels`, `groupBy`）和查询参数（`mode`, `depth`, `folderId`, `tag`, `tagsMatch`, `includeOrphans`, `includeUnresolved`）。
  `useMemo` 将全量 `prefs` 作为依赖项，用户拖拽排斥力滑块时，`request` 引用改变 -> `useGraphData` 将 `data` 置为 `null` -> 画布被卸载，出现全屏白屏加载遮罩 -> API 返回 -> 重新挂载 `GraphCanvas` -> 调用 `buildInitialLayout` 将所有节点炸回阿基米德螺旋线初始态！
- **整改方案**：
  1. 将查询参数（`GraphQueryParams`）与纯视觉样式/动力学参数（`GraphVisualPrefs`）彻底解耦；
  2. 只有查询参数改变时才重新生成 `request` 并请求 API；
  3. 动力学参数改变时，通过 `stateRef` 直接更新 Canvas 物理引擎参数，并唤醒物理退火（`state.frame = Math.min(state.frame, PHYSICS_FRAME_LIMIT - 90); state.schedule?.()`），画布不卸载、不发起网络请求、节点不重置坐标！

#### 【PERF-02】60fps 强制同步重排 (Layout Thrashing)
- **文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`
- **函数**：`createGraphTicker` 内部的 `tick()`
- **行号**：第 144–148 行
- **缺陷代码**：
  ```ts
  const tick = () => {
    state.raf = 0
    const rect = canvas.getBoundingClientRect() // <--- 强制主线程同步重排
    advancePhysics(state, prefs)
    ctx.clearRect(0, 0, rect.width, rect.height)
  ```
- **根因分析**：在每一帧 `requestAnimationFrame` 回调中调用 `canvas.getBoundingClientRect()` 会迫使浏览器主线程执行 Style Recalculation 与 Layout 计算。在 60fps 动画期间，每秒发生 60 次同步重排，导致低配设备严重掉帧卡顿。
- **整改方案**：画布的宽高由已存在的 `ResizeObserver` 维护在 `state.width` 与 `state.height`（或 `canvas.width / dpr`）中，`tick()` 内部直接读取数值，严禁在渲染循环中调用 DOM 几何查询 API。

#### 【PERF-03】D1 分块加载边和标签使用循环串行 await
- **文件**：`src/worker/routes/search/graph.ts`
- **函数**：`loadGraphLinkRows(db, userId, ids)`
- **行号**：第 278–304 行
- **缺陷代码**：
  ```ts
  for (let index = 0; index < ids.length; index += GRAPH_NOTE_ID_CHUNK) {
    const chunk = ids.slice(index, index + GRAPH_NOTE_ID_CHUNK)
    const [linkResult, tagResult] = await Promise.all([
      db.prepare(...).bind(userId, ...chunk).all<GraphLinkRow>(),
      db.prepare(...).bind(userId, ...chunk).all<GraphTagRow>(),
    ])
    ...
  }
  ```
- **根因分析**：在 350~600 节点的大图谱中，分块可达 9~15 个。`for` 循环内部逐块串行 `await`，导致 9~15 次 D1 网络 RTT 串行阻塞，显著增加了接口响应延迟。
- **整改方案**：利用 Cloudflare D1 提供的原生 `db.batch([...statements])` 特性，预先将所有分块的 statements 收集到一个数组中，单次提交完成批量查询，消除串行网络等待。

#### 【PERF-04】未溢出时冗余执行 `SELECT COUNT(*)` 全表扫描
- **文件**：`src/worker/routes/search/graph.ts`
- **函数**：`runLocalGraphQuery` 与 `runGlobalGraphQuery`
- **行号**：第 223–227 行、第 243–247 行
- **缺陷代码**：
  ```ts
  const result = await db.prepare(... LIMIT ?).bind(..., params.limit + 1).all<GraphRow>()
  const count = await db.prepare(
    `SELECT COUNT(*) AS count FROM notes n WHERE ${filters.join(' AND ')}`
  ).bind(...filterBinds).first<{ count: number }>()
  return { rows: result.results, totalNodes: Number(count?.count ?? result.results.length) }
  ```
- **根因分析**：当主查询返回的条数 `result.results.length <= params.limit` 时，说明当前用户符合条件的总节点数未达到上限，总数必然等于 `result.results.length`。此时依然发起一次带关联过滤的 `SELECT COUNT(*)` 是完全多余的。
- **整改方案**：当 `result.results.length <= params.limit` 时，直接复用 `result.results.length` 作为 `totalNodes`，只有在发生溢出截断（`result.results.length > params.limit`）时才执行单独的 count 语句。

#### 【PERF-05】排斥力 346px 截断引发无连接群落向心重叠
- **文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`
- **函数**：`applyRepulsion(state, repulsion)`
- **行号**：第 23–38 行
- **缺陷代码**：
  ```ts
  if (distanceSquared > 120000) continue
  ...
  a.vx -= a.x * 0.0022
  a.vy -= a.y * 0.0022
  ```
- **根因分析**：$\sqrt{120000} \approx 346.4\text{px}$。当两个不互连的子图聚类距离大于 346px 时，排斥力直接截断为 0，但向心引力（`0.0022`）持续起效，最终导致多个独立的连通块被持续拉扯向中心点叠加堆积。
- **整改方案**：采用平滑衰减模型（例如 $1 / (d + \epsilon)$）替代阶跃式硬截断，让群落之间保持基础的分离张力。

#### 【PERF-06】`fitGraph` 120ms 竞态开屏将节点弹飞出可视区
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`
- **组件/Hook**：`useGraphCanvasLoop`
- **行号**：第 78 行
- **缺陷代码**：
  ```ts
  const fitTimer = window.setTimeout(fitGraph, 120)
  ```
- **根因分析**：120ms 仅相当于 7~8 帧，此时节点仍挤在半径仅几十像素的螺旋线中心。此时计算边界盒极小，将 `scale` 强行拉大至上限（`2.5`）。随后的物理迭代将节点向外弹开，导致所有节点全部飞出屏幕视野，用户必须手动再点一次居中按钮。
- **整改方案**：在物理退火衰减到基本稳定（例如第 60~80 帧或单帧位移量低于稳定阈值）后，自动平滑执行一次居中自适应。

---

### 2.3 交互体验与无障碍可用性 (UX & A11y)

#### 【UX-01】单击节点强退图谱弹窗（破坏核心探索流）
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`
- **Hook**：`useGraphDrag` 中的 `endDrag`
- **行号**：第 138–147 行
- **缺陷代码**：
  ```ts
  const moved = Math.abs(clientX - drag.startX) + Math.abs(clientY - drag.startY)
  if (drag.node && moved < 5) {
    if (drag.node.kind === 'note') {
      if (usePinnedWindows.getState().focusPinnedByNote(drag.node.id)) return
      void onOpenNote(drag.node.id)
    }
    else void onCreateNote(drag.node.title)
    onClose()
  }
  ```
- **根因分析**：只要移动距离小于 5px（普通单击），直接调用 `onClose()` 并跳转打开笔记。用户在图谱中原本希望点击节点聚焦其相邻关系或查看信息，结果直接被踢出图谱，核心漫游体验被破坏。
- **整改方案**：
  - **单击（Click）**：聚焦选中节点（`selectedId`），锁定高亮其一度直接相连邻居网络，单击空白处取消选择；
  - **双击（Double Click）或 Enter 键**：打开笔记并关闭图谱；
  - **Cmd / Ctrl + 单击**：在分屏或后台打开笔记，图谱保持常驻；
  - **未创建节点（unresolved）**：单击选中，双击触发 `onCreateNote`。

#### 【UX-02】开启“减少动画”偏好导致图谱永久瘫痪
- **文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`
- **函数**：`buildInitialLayout(data, prefs, state)` 与 `advancePhysics`
- **行号**：第 68–69 行、第 183–185 行
- **缺陷代码**：
  ```ts
  state.frame = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? PHYSICS_FRAME_LIMIT
    : 0
  ```
  ```ts
  function advancePhysics(state: CanvasState, prefs: GraphPreferences): void {
    if (state.frame >= PHYSICS_FRAME_LIMIT) return
  ```
- **根因分析**：如果系统开启了减少动画，`state.frame` 被直接赋值为 360，物理计算迭代步数为 0。全部节点死锁在阿基米德螺旋线中，图谱完全无法阅读，造成严重的可访问性障碍。
- **整改方案**：“减少动画”是禁止逐帧动画，而非禁止布局算法！命中 `reduced-motion` 时，在首帧主线程直接以 `for` 循环同步运行 120 步物理计算（耗时仅十几毫秒），得到稳定布局后直接绘制单帧静止画面。

#### 【UX-03】设置抽屉按 ESC 误杀整个图谱（ESC 栈逃逸）
- **文件**：`src/client/features/graph/graph-panel/settings.tsx` 与 `index.tsx`
- **组件**：`GraphSettingsPanel`、`GraphPanel`
- **行号**：`index.tsx:255`、`settings.tsx:30`
- **缺陷代码**：
  - `index.tsx:255` 注册了 `useEscape(true, onClose)`；
  - `settings.tsx` 中打开抽屉时未注册 `useEscape`。
- **根因分析**：Inkstone 采用 LIFO 逃逸栈。设置抽屉打开时，用户按下 ESC 键预期是关闭侧边设置抽屉，但由于抽屉未入栈，外层的 `GraphPanel` 捕获了 ESC 事件，导致整个图谱直接关闭！
- **整改方案**：在 `GraphSettingsPanel` 内部挂载 `useEscape(true, onClose)`，使侧边抽屉在打开时成为栈顶，优先响应 ESC 关闭自己；并在移动端屏幕下增加半透明遮罩与点击外部关闭支持。

#### 【UX-04】移动端双指 Pinch 缩放偏心跳变
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`
- **函数**：`useCanvasPointerHandlers`
- **行号**：第 189–194 行
- **根因分析**：移动端双指捏合缩放时，仅根据指尖间距变化修改了 `state.scale`，未计算双指的几何中心点（centroid）并对 `offsetX` 和 `offsetY` 进行仿射变换补偿。导致在触摸屏上缩放时，视野朝屏幕左上方猛烈偏移跳动。
- **整改方案**：在 Pinch 开始时记录双指中点世界坐标，缩放过程中根据新的双指屏幕中心实时反向补偿 `offsetX` 与 `offsetY`，确保画面平滑地以双指手势中心为轴心缩放。

#### 【UX-05】鼠标指针状态与辅助导航缺失
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`
- **行号**：第 327 行
- **根因分析**：Canvas 元素硬编码 `cursor-grab`。当光标悬停在可点击的节点上方时，未切换为 `cursor-pointer`，缺少悬停反馈；同时不支持白板惯用的空格键（Space + 拖动）与鼠标中键平移。
- **整改方案**：当 `hover` 命中节点时，Canvas 样式动态切换为 `cursor-pointer`；支持空格长按平移与鼠标中键（button = 1）平移。

#### 【UX-06】无障碍屏幕阅读器盲区
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`
- **行号**：第 300 行附近
- **根因分析**：图谱仅使用纯 Canvas 绘制，节点选中、悬停、度数信息未向屏幕阅读器宣告。
- **整改方案**：底部状态与选中节点信息容器添加 `aria-live="polite"` 与 `aria-atomic="true"`，在选中节点时播报节点标题与连接度信息。

---

### 2.4 UI 视觉美学与 AGENTS.md 规范遵循 (Visuals & Standards)

#### 【UI-01】Canvas 内部色块不跟随系统主题翻转 (ADR-0002)
- **文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`、`canvas.tsx`
- **函数**：`readThemeColors()`、`useGraphCanvasLoop`
- **行号**：`canvas-draw.ts:188-196`
- **根因分析**：`readThemeColors()` 仅在组件初次挂载时执行一次。当用户在应用内切换深/浅色模式时，画布内部依然保留初始调色板，浅色模式下出现刺眼背景，深色模式下节点因低对比度看不清（被 [ADR-0002](../../../ADR-0002-renderer-theme-following.md) 记录为已知缺口）。
- **整改方案**：使用 `MutationObserver` 监听 `document.documentElement` 的 `data-theme` 属性变化（或利用主题 store），主题变化时重新调用 `readThemeColors()` 更新颜色对象，并触发 `state.schedule?.()` 重绘单帧画面（无需重置物理坐标）。

#### 【UI-02】悬停时相连邻居文本被错误弱化（视觉逻辑矛盾）
- **文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`
- **函数**：`drawNodes` 与 `drawLabels`
- **行号**：第 111 行、第 135–136 行
- **缺陷代码**：
  ```ts
  // drawLabels
  const emphasized = node.id === emphasizedId
  ctx.fillStyle = emphasized ? colors.accent : colors.text
  ctx.globalAlpha = emphasized ? 1 : emphasizedId ? 0.26 : 0.72
  ```
- **根因分析**：当某个节点高亮时，`drawEdges` 中与该节点相连的所有边高亮加粗。然而在 `drawLabels` 中，只要 `node.id !== emphasizedId`，包括直接相连的邻居节点文字透明度全部跌至 `0.26`，节点圈跌至 `0.34`，造成“边高亮了但端点文字被抹黑”的视觉矛盾。
- **整改方案**：维护当前高亮节点的直接邻居集合 `activeNeighbors`。当存在聚焦节点时，该节点自身及其直接相连的一度邻居节点透明度保持 `1.0`（高亮），只有非相关节点才弱化至 `0.18`。

#### 【UI-03】文字标签穿透线条且缺乏微光晕
- **文件**：`src/client/features/graph/graph-panel/canvas-draw.ts`
- **函数**：`drawLabels`
- **行号**：第 138 行
- **缺陷代码**：
  ```ts
  ctx.fillText(label, node.x, node.y + node.r + 12 / scale)
  ```
- **根因分析**：直接调用 `fillText` 绘制单层文字。当复杂的拓扑连线从文字后方或上方穿过时，笔画被线条切断，严重影响可读性。
- **整改方案**：在 `fillText` 前，使用当前背景色执行描边：
  ```ts
  ctx.lineWidth = 3 / scale
  ctx.strokeStyle = colors.bgBase
  ctx.strokeText(label, node.x, node.y + node.r + 12 / scale)
  ctx.fillText(label, node.x, node.y + node.r + 12 / scale)
  ```

#### 【UI-04】缺乏色彩图例（Color Legend）与标签色彩失效
- **文件**：`src/client/features/graph/graph-panel/helpers.ts`
- **函数**：`nodeColor(node, groupBy, fallback)`
- **行号**：第 51–55 行
- **缺陷代码**：
  ```ts
  if (groupBy === 'folder') return organizerColorOrNull(node.folderColor) ?? fallback
  if (groupBy === 'tag') return organizerColorOrNull(node.tags[0]?.color) ?? fallback
  ```
- **根因分析**：未设色标签的 `color` 为 `null`，导致开启标签分组后全部节点退化为单色；且开启文件夹/标签着色时，界面左下角没有任何图例指示颜色代表什么。
- **整改方案**：未设色标签引入基于名称哈希的内置柔和色板兜底分配；并在画布左下方增加半透明浮动图例展示当前着色映射。

#### 【SPEC-01】函数签名参数过多违背 AGENTS.md 规范
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`、`canvas-draw.ts`、`index.tsx`
- **函数/组件**：
  - `canvas.tsx:57`：`useGraphCanvasLoop`（10 个参数）
  - `canvas.tsx:105`：`useGraphDrag`（9 个参数）
  - `canvas-draw.ts:142`：`createGraphTicker`（9 个参数）
  - `canvas-draw.ts:105`：`drawNodes`（7 个参数）
  - `canvas-draw.ts:127`：`drawLabels`（7 个参数）
  - `index.tsx:196`：`GraphHeader`（14 个 props）
- **违反规则**：AGENTS.md SHOULD 明确规定：“参数超过 3 个或顺序易错时，改用对象/结构体传参”。
- **整改方案**：将散落位置参数重构为具名配置对象（如 `GraphLoopOptions`、`GraphDragContext`、`TickerOptions`、`DrawParams` 等）。

#### 【SPEC-02】绕过统一组件库裸写原生标签（AGENTS.md 铁律 10）
- **文件**：`src/client/features/graph/graph-panel/index.tsx` 与 `settings.tsx`
- **行号**：`index.tsx:138-148`、`index.tsx:157-172`、`settings.tsx:45, 47, 68`
- **违反规则**：AGENTS.md 铁律 10 规定：“所有交互元素使用项目 UI 组件库或项目内自定义组件，禁止绕过组件体系写裸样式控件”。
- **整改方案**：
  - `GraphScopeToggle` 替换为项目统一的 `Segmented` 组件（来自 `src/client/components/form.tsx`）；
  - `GraphSearchBox` 替换为统一的 `Input` 组件；
  - `settings.tsx` 中的原生 `<button>` 替换为 `Button` / `IconButton`。

#### 【SPEC-03】多语言硬编码拼接句子（AGENTS.md i18n 规范）
- **文件**：`src/client/features/graph/graph-panel/index.tsx`、`src/shared/locales/`
- **函数**：`GraphStats`
- **行号**：`index.tsx:126-128`
- **缺陷代码**：
  ```tsx
  {data.nodes.filter((node) => node.kind === 'note').length}{t('graph.notes')}{data.edges.length}{t('graph.links')}
  ```
  在 `en-US/graph.ts` 中配置为 `'graph.notes': ' notes · '`。
- **违反规则**：AGENTS.md i18n 规范要求：“翻译 key 保持稳定、可读、不拼接句子；复数按 locale 格式化”。拼接硬编码破坏了其他语言语法，且数量为 1 时出现 `1 notes` 错误。
- **整改方案**：统一提取为单条具名参数插值 key：`t('graph.stats_summary', { notes: noteCount, links: linkCount })`。

---

### 2.5 主流双链笔记功能差距对标 (Obsidian Gaps)

#### 【FEAT-01】缺失即时悬停卡片预览 (Page Preview)
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`
- **能力差距**：Obsidian 在悬停节点时可呼出小卡片阅读 Markdown 渲染正文；Inkstone 当前仅在底部显示单行度数纯文本。
- **整改方案**：复用既有的 `wiki-link-hover-card` 浮层组件，当用户悬停在某节点超过 300ms 或点击选中时，在节点附近呼出轻量 Markdown 预览卡片。

#### 【FEAT-02】缺失常驻分屏与伴随式局部图谱工作流
- **文件**：`src/client/features/graph/`
- **能力差距**：当前图谱为全屏 Modal 独占弹窗，打断写作；Obsidian 局部图谱可在侧边栏常驻，随着当前编辑的笔记实时联动。
- **整改方案**：将 `GraphCanvas` 解耦为支持嵌入式（embedded）形态的基础组件，允许作为辅助面板常驻在编辑区右侧。

#### 【FEAT-03】缺失“标签作为拓扑实体节点”能力
- **文件**：`src/worker/routes/search/graph.ts` 与前端渲染
- **能力差距**：Obsidian 支持将 `#tag` 转化为显式拓扑节点，将相同标签但未互链的笔记拉入同一网络簇。
- **整改方案**：增加选项“将标签显示为节点”，服务端返回虚拟标签节点及关系边。

#### 【FEAT-04】缺失高级排除过滤语法与自定义颜色规则
- **文件**：`src/worker/routes/search/graph.ts`、`settings.tsx`
- **能力差距**：Obsidian 支持 `-path:` 排除模板和归档，支持自定义多条颜色规则。
- **整改方案**：服务端支持排除语法；设置面板增加颜色分组规则列表。

#### 【FEAT-05】缺失节点坐标固定 (Pin) 与高清图片/矢量导出
- **文件**：`src/client/features/graph/graph-panel/canvas.tsx`、`index.tsx`
- **能力差距**：拖拽节点松开后无法固定坐标；无法导出当前图谱。
- **整改方案**：右键菜单增加“固定节点”（`pinned: true`，固定者不参与物理位移）；顶栏操作区新增“导出为 PNG / SVG”按钮。

---

### 2.6 工程质量与测试门禁 (Testing & Reliability)

#### 【TEST-01】前端图谱模块自动化测试覆盖率为 0% (AGENTS.md 铁律 6)
- **文件**：`src/client/features/graph/`、`tests/`
- **现状**：目前仅有 `graph-settings.test.ts` 测试配置 key，没有任何针对 Canvas 状态循环、物理退火收敛、主题跟随、无障碍终态、ESC 逃逸栈的自动化测试。
- **整改方案**：补充完整的 Vitest 自动化单元测试与组件测试，覆盖上述核心修复逻辑。

---

## 3. 全量 29 项问题决策矩阵汇总

| 编号 | 核心问题 | 涉及文件 | 严重程度 | 优先级 |
| :--- | :--- | :--- | :--- | :--- |
| **PERF-01** | 滑块拖动触发全量网络请求与白屏重置 | `graph-panel/index.tsx`, `canvas.tsx` | 阻断级 | **P0** |
| **UX-01** | 单击节点强退图谱弹窗阻断漫游探索 | `graph-panel/canvas.tsx` | 阻断级 | **P0** |
| **UX-02** | 开启减少动画导致所有节点永久死锁在螺旋线 | `graph-panel/canvas-draw.ts` | 阻断级 | **P0** |
| **UX-03** | 设置抽屉按 ESC 误杀整个图谱（ESC 栈逃逸） | `graph-panel/settings.tsx` | 严重 | **P1** |
| **UI-01** | Canvas 内部色块不跟随系统主题翻转 (ADR-0002) | `graph-panel/canvas-draw.ts`, `canvas.tsx` | 严重 | **P1** |
| **PERF-02** | 60fps 强制同步重排 (Layout Thrashing) | `graph-panel/canvas-draw.ts` | 严重 | **P1** |
| **UI-02** | 悬停时相连邻居文本被错误弱化（视觉逻辑矛盾） | `graph-panel/canvas-draw.ts` | 严重 | **P1** |
| **UI-03** | 文字标签穿透线条且缺乏微光晕 (Text Halo) | `graph-panel/canvas-draw.ts` | 中度 | **P1** |
| **SEC-01** | 递归 CTE 环路指数路径膨胀隐患 | `worker/routes/search/graph.ts` | 严重 | **P1** |
| **PERF-03** | D1 分块加载边和标签使用循环串行 await | `worker/routes/search/graph.ts` | 严重 | **P1** |
| **PERF-04** | 未溢出时冗余执行 `SELECT COUNT(*)` 全表扫描 | `worker/routes/search/graph.ts` | 中度 | **P1** |
| **TEST-01** | 前端图谱模块测试覆盖率几乎为零 | `src/client/features/graph/` | 严重 | **P1** |
| **SPEC-01** | 函数签名参数过多违背 AGENTS.md 结构体传参规范 | `canvas.tsx`, `canvas-draw.ts`, `index.tsx` | 规范 | **P2** |
| **SPEC-02** | 绕过统一组件库裸写原生标签（铁律 10） | `index.tsx`, `settings.tsx` | 规范 | **P2** |
| **SPEC-03** | 多语言硬编码拼接句子（i18n 规范） | `index.tsx`, `locales/` | 规范 | **P2** |
| **SEC-02** | 传输层未解析标题无界长度风险 | `worker/routes/search/graph.ts` | 安全 | **P2** |
| **SEC-03** | 归档笔记度数泄露与前端连线脱节 | `worker/routes/search/graph.ts` | 一致性 | **P2** |
| **SEC-04** | LocalStorage 偏好缺少多用户/租户隔离 | `graph-panel/helpers.ts` | 隔离性 | **P2** |
| **UX-04** | 移动端双指 Pinch 缩放偏心跳变 | `graph-panel/canvas.tsx` | 体验 | **P2** |
| **UX-05** | 鼠标指针状态与辅助导航缺失（Pointer, Space 平移） | `graph-panel/canvas.tsx` | 体验 | **P2** |
| **UX-06** | 无障碍屏幕阅读器盲区 | `graph-panel/canvas.tsx` | A11y | **P2** |
| **UI-04** | 缺乏色彩图例（Color Legend）与标签色彩失效 | `helpers.ts`, `graph-panel/` | 视觉 | **P2** |
| **PERF-05** | 排斥力 346px 截断引发无连接群落向心重叠 | `graph-panel/canvas-draw.ts` | 动力学 | **P2** |
| **PERF-06** | `fitGraph` 120ms 竞态开屏将节点弹飞出可视区 | `graph-panel/canvas.tsx` | 动力学 | **P2** |
| **FEAT-01** | 缺失即时悬停卡片预览 (Page Preview) | `canvas.tsx`, `graph-panel/` | 产品力 | **P1** |
| **FEAT-02** | 缺失常驻分屏与伴随式局部图谱工作流 | `src/client/features/graph/` | 产品力 | **P1** |
| **FEAT-03** | 缺失“标签作为拓扑实体节点”能力 | `worker/graph.ts`, 前端 | 产品力 | **P2** |
| **FEAT-04** | 缺失高级排除过滤语法与自定义颜色规则 | `worker/graph.ts`, `settings.tsx` | 产品力 | **P2** |
| **FEAT-05** | 缺失节点坐标固定 (Pin) 与高清图片/矢量导出 | `canvas.tsx`, `index.tsx` | 产品力 | **P3** |
