# Inkstone「关系图谱」唯一执行计划（合并版）

> **文档地位**：本目录只有两份文档——问题台账 [`review-with-freebuff.md`](./review-with-freebuff.md)（`G-01…G-48`）与本执行计划。被取代的六份中间文档（`review-with-agy-1.md`、`plan-with-agy-1.md`、`review-with-qoder-1.md`、`plan-with-qoder-1.md`、`review-with-buffy-2.md`、`verify-with-buffy-1.md`）已清退；其中两份 agy 文档原为 git 跟踪文件，由一次 `docs(graph)` 提交删除。它们的有效结论已全部并入台账：29 项 agy 全部关闭并登记 7 处残留、qoder 30 项中 1 项撤下 / 6 项前提改写 / 23 项并入、buffy 20 项全部并入，去重后即 `G-01…G-48`。
> **基线分支/提交**：`improvement/relationship-graph-agy` @ `ec916280480eb06d658cd4358ace9ba23b9c2806`。台账与本计划的行号、证据均以该树为准。
> **工程规范**：[`AGENTS.md`](../../../AGENTS.md)、[`ADR-0002`](../../../ADR-0002-renderer-theme-following.md)。
> **当前状态（如实说明）**：**已开工**。批次 1（P0）四项已全部落地并收尾：1.1 `d4d2e12e`、1.2 `b45dab64`、1.3 `24f2f22a`、1.4 `1358a374`；批次收尾门禁在同一棵树上实测——`test:unit` 620 文件 / 5452 通过 + 1 跳过、`budget:check` 退出码 0、`e2e` 177 passed / 0 failed、`e2e-visual` 682 passed / 0 failed、`check-contrast` 两套主题全绿（明细见 §4「批次 1 收尾门禁」）。批次 2 四项已全部落地并收尾：2.1（G-01）`17dc66de`、2.2（G-03）`023e1e7d`、2.3（G-04①）`6e3ed4c2`、2.4（G-09）`e21bde8c`；批次收尾门禁在同一棵树上实测——`test:unit` 624 文件 / 5460 通过 + 1 跳过、`budget:check` 退出码 0、`e2e` 177 passed / 0 failed、`e2e-visual` 682 passed / 0 failed、`check-contrast` 两套主题全绿（明细见 §4「批次 2 收尾门禁」）。批次 3 已开工：3.1（G-29）`4c24d686`——用户选定 B 方案，新增客户端私有 `--graph-tag-*` 令牌并删掉第二套回退色板，两套主题全部 ≥3:1；3.2（G-30）`50ea81cc`——tag 节点加双环，三类节点不依赖颜色可辨；3.3（G-31）`d4c40a6a`——`useIsDarkTheme()` 订阅 `data-theme`，预览卡随翻转重渲；3.4（G-40）`01a9df9f`（文档：ADR/AGENTS 与代码对齐、补 G-43① 口径）+ `4d00b9f3`（断言：`assertGraphThemeFollow` 读真实像素，先红时同一元素像素和不变、仅「新调色板」一条失败，绿后 `e2e-visual` 685 passed / 0 failed）；3.5（G-41）`fbb3d235`——对比度门禁增图谱场景，十枚 `--graph-tag-*` 与画布实际平色都在两套主题下对 `--bg-base` 按 3:1 量测，先红时 `--graph-tag-1` 改成表面色即 1.00:1 报红。批次 3 收尾门禁已在同一棵树上实测——`test:unit` 625 文件 / 5466 通过 + 1 跳过（1 条已登记 flake 单跑复核通过）、`budget:check` 退出码 0、`e2e` 177 / 0、`e2e-visual` 685 / 0、`check-contrast` 两套主题全绿（含图谱行，明细见 §4「批次 3 收尾门禁」）。批次 4 已开工：4.1（G-23）`4c4286dd`——方向键改按画布空间取邻居（半平面内距离/对齐度打分）、该方向无节点时保持原选中、无选中时从两端进入，键盘选中的节点平移相机保证可见；旧「按数组序环绕」的行为与断言一并推翻（`canvas-a11y.test.ts`、`canvas-selection-loop.test.ts` 同步改）。台账 §2 的 8 条失效条目仍禁止作为任务执行。任何 `[x]` 只由真实提交与真实门禁输出来填。

> **核心原则**：一项一次原子提交，正文按 `- 路径: 改动` 逐文件写；先红后绿；每落地一项即在本文档登记提交哈希与实测输出；不伪造、不夹带（铁律 14）；不静默假设、不静默失败、不静默降级。

> **4.1 的追加真实浏览器门禁**：jsdom 里那条「相机跟随」用例是手写 `state.width/height` 得来的，布局本身从未被验证，因此补 `a2e7acc2`——`scripts/e2e-visual.mjs` 新增场景 `assertGraphKeyboardWalk`（真实布局、真实相机、真实像素）。先红：临时删掉 `handleCanvasArrowKey` 的 `ensureNodeVisible(state, next)` 再跑整条 `e2e-visual` → 687 passed / 3 failed，失败的正是三条依赖相机的断言（走到窗口外的锚点框 `left=1407`、八步 `dx/dy` 全零、平移集合为空）；恢复后同树 **690 passed / 0 failed**，明细 `· graph walk: 12 presses over the graph, 2 of them panned — ArrowRight by (-124, 0)px at 0.953, ArrowRight by (-362, 0)px at 0.841`。

**编号与优先级**：唯一编号 `G-01…G-48`；分布 P0 4 条（G-06 / G-07 / G-22 / G-02）、P1 24 条、P2 17 条、候选 3 条（G-43 / G-46 / G-48），以台账 §6 为唯一来源。本计划不新增编号；落地过程中发现的新问题写进 §8「新增发现」，另开条目。

---

## 0. 怎么用这份计划

1. 每条任务的证据与方案取舍**不在此重复**，只注明台账小节号；动手前先读那一条的「判定 / 证据 / 方案」。
2. 每条给出：涉及文件 / 修改要点 / 验证命令 / 依赖 / 代价 / 提交建议 / 提交哈希 / 状态。
3. **先红后绿是硬要求**：行为变化的条目先让复现用例（或命令输出）变红，记录失败输出，再改实现转绿（AGENTS.md「修 bug 先写复现测试」）。
4. 提交哈希逐项登记进本表；`docs(graph): 登记 …` 提交与本仓库既有做法一致（`git log` 可见 `d5ec396b`、`ec916280` 等先例）。
5. 台账 §2 的 **8 条已失效条目禁止作为任务执行**。最容易踩的一条：`Q-UX-02` 主张「删除『以此笔记为中心』菜单项」——**不成立**，该入口是可达的（`onOpenNote` → 活动笔记变化 → 面板以新 id 重查）；正确判据应看 `mode`，见 §5 第 1 条。
6. 三条 🔬（G-08 / G-10 / G-47）在决策闸门里处理，不混进批次；批次 0 拿到数字前不动手。

---

## 1. 进展概览与统计

| 批次 | 涵盖编号 | 目标与完成判据 | 编号数 | 估计代价 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **批次 0（前置）｜先量后改** | V-01…V-03（无 G 编号） | 新增 `scripts/measure-graph.mjs` + 合成大库样本，拿到布局帧成本、单请求读行数、degree 聚合耗时；三个 🔬 条目据此进入决策闸门 | — | ≈0.5–1 人日 | ⬜ 未开始 |
| **批次 1｜P0 渲染连续性与红线** | G-06（含 G-07 步骤 1）、G-22、G-28、G-02、G-38 | 输入搜索词/切开关不再重建画布，拖过的坐标与 pin 存活；键盘可开节点菜单；标签边有预算；开启标签节点后截断读数不再自相矛盾 | 6 | ≈4–5 人日 | 🟢 6/6 已收尾（1.1 `d4d2e12e`、1.2 `b45dab64`、1.3 `24f2f22a`、1.4 `1358a374`；收尾门禁 test:unit 620 文件 / e2e 177 / e2e-visual 682 / contrast 全绿 / budget:check 退出码 0；G-07 步骤 2 属批次 6） |
| **批次 2｜请求与开销边界** | G-01、G-03、G-04（①）、G-09 | 一次请求读多少有明确上界；读端点有超时与节流；MCP 与 UI 的归档口径一致；拖拽不再逐事件强制布局 | 4 | ≈2 人日 | 🟢 4/4 已收尾（2.1 `17dc66de`、2.2 `023e1e7d`、2.3 `6e3ed4c2`、2.4 `e21bde8c`；收尾门禁 test:unit 624 文件 / e2e 177 / e2e-visual 682 / contrast 全绿 / budget:check 退出码 0） |
| **批次 3｜视觉、主题与门禁** | G-29、G-30、G-31、G-40、G-41（G-43① 顺手） | 调色板收敛为单一来源并达标；主题翻转预览卡同步；ADR/AGENTS 不再与代码相反且有像素断言；对比度门禁覆盖图谱表面 | 5 | ≈3.5–4 人日 | 🟢 5/5 已收尾（3.1 `4c24d686`、3.2 `50ea81cc`、3.3 `d4c40a6a`、3.4 `01a9df9f` + `4d00b9f3`、3.5 `fbb3d235`；收尾门禁 test:unit 625 文件 / e2e 177 / e2e-visual 685 / contrast 全绿（含图谱两套主题）/ budget:check 退出码 0；一条已登记 flake 已复核） |
| **批次 4｜无障碍关系与键盘语义** | G-23、G-24、G-25、G-26、G-27 | 方向键按空间序且选中可见；标签节点可辨、可操作；设置抽屉关系完整；色板热区达标；说明关联与取消播报补全 | 5 | ≈2 人日 | 🟡 1/5（4.1 `4c4286dd` 已登记，另补真实浏览器门禁 `a2e7acc2`） |
| **批次 5｜交互与检索语义** | G-14、G-15、G-16、G-18、G-19、G-20、G-21 | 搜索是定位不是重查；空态有出口；拖拽期间不悬停预览；窄屏不重叠、触屏提示到位；伴随图谱复用偏好；上限/深度可调 | 7 | ≈6 人日 | ⬜ 0/7 |
| **批次 6｜设置与工程卫生** | G-11 + G-32、G-35、G-36、G-37、G-39、G-07 步骤 2、G-33（两步两提交） | 滑块走组件库且不逐事件落盘；文案/默认值/常量单一来源；pin 跨会话持久；死重载与渲染期写 ref 清除 | 7 | ≈3 人日 | ⬜ 0/7 |
| **批次 7｜收尾与对标** | G-05 + G-45、G-12、G-13、G-17、G-34、G-42、G-44 | 导出有隐私选项；字体读取策略有据；绘制异常不静默停帧；滚轮非 passive；死键清零；单篇排除；方向过滤 | 8 | ≈4.5 人日 | ⬜ 0/8 |
| **决策闸门** | G-08、G-10、G-47 | 按批次 0 的数字定 G-08/G-10；G-47 需归属决策而非数字；结论（含「不做」）必须登记为以证据关闭 | 3 | 由证据决定 | ⬜ 未开始 |
| **不挂批次** | G-43 ②③、G-46、G-48 | 持久化契约变更 / 跨模块色板语义 / 候选清单 | 3 | 另立 | ⬜ 不排期 |
| **总计** | **G-01…G-48** | 图谱本体 45 条（42 挂批次 + 3 决策闸门） | **48** | ≈25–28 人日 + 门禁 | **🟡 16/48（批次 1–3 已收尾；批次 4 进行中 1/5）** |

> G-07 跨批次 1（步骤 1）与批次 6（步骤 2），编号只计一次（记在批次 1）。G-28 随 G-22 落地、不单独提交。G-04 的 ②（共享范围判定）与 G-43 的 ②③（`links` 增类型/附件节点）属**另立事项**，不进本计划排期。

### 1.1 编号定位索引（G-xx → 批次）

| 编号 | 批次 | 编号 | 批次 | 编号 | 批次 | 编号 | 批次 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| G-01 | 2 | G-13 | 7 | G-25 | 4 | G-37 | 6 |
| G-02 | 1 | G-14 | 5 | G-26 | 4 | G-38 | 1 |
| G-03 | 2 | G-15 | 5 | G-27 | 4 | G-39 | 6 |
| G-04 | 2（①） | G-16 | 5 | G-28 | 1（随 G-22） | G-40 | 3 |
| G-05 | 7 | G-17 | 7 | G-29 | 3 | G-41 | 3 |
| G-06 | 1 | G-18 | 5 | G-30 | 3 | G-42 | 7 |
| G-07 | 1 + 6 | G-19 | 5 | G-31 | 3 | G-43 | ① 3；②③ 另立 |
| G-08 | 闸门 | G-20 | 5 | G-32 | 6 | G-44 | 7 |
| G-09 | 2 | G-21 | 5 | G-33 | 6 | G-45 | 7 |
| G-10 | 闸门 | G-22 | 1 | G-34 | 7 | G-46 | 另立 |
| G-11 | 6 | G-23 | 4 | G-35 | 6 | G-47 | 闸门 |
| G-12 | 7 | G-24 | 4 | G-36 | 6 | G-48 | 候选不排期 |

---

## 2. 批次依赖与合并约束（动手前必读）

这些约束是从代码里读出来的，违反会产生比原缺陷更糟的中间态：

1. **G-06 ⇄ G-07 步骤 1 必须同批同提交**。坐标与 pin 丢失大半是画布整体重建的下游症状；只修其一会出现「画布没重建但坐标被 reset」的更怪现象。G-06 的坐标继承天然保住 pin，步骤 1 约 12 行、不动共享契约。
2. **G-11 + G-32 合并为一次提交**。两处改的是同一个 `GraphRange` 组件（换 `Slider` 与去掉逐事件副作用）；拆开会出现「新组件里仍带旧副作用」的中间版本。
3. **G-22 先于 G-24 与 G-07 步骤 2**。菜单独占「固定节点 / 按标签筛选 / 右侧打开 / 以此笔记为中心」四个功能；键盘入口不修，后续给标签节点绑的「按标签筛选」与 pin 持久化对键盘用户同样不可达。
4. **G-34（死键清理）排在 G-35 与 G-24 之后**。`graph.reset` 由 G-35 一并删除；`graph.tag_node` 被 G-24 使用必须保留——提前删会让两项的文案来源断裂。
5. **G-41 的四条功能断言各归入其功能项的同一提交**（跨查询 pin 存活 → G-07；标签边预算 → G-02；键盘开菜单 → G-22；筛选空态出口 → G-15），**不单开测试批次**，否则又变成「先实现后补测」。G-41 本身只做对比度门禁的图谱场景与核对。
6. **G-29 若走 B 方案（新增 `--graph-tag-*` 令牌）**：改共享令牌后必须 `node scripts/check-token-drift.mjs --update-baseline`，且 G-41 的图谱场景同批跟上（色板改了才需要门禁守住）。
7. **G-21 若把 `limit` 上界提到数千**，`canvas-hooks.tsx` 的 `Math.min(...xs)` 必须同步改循环求极值——当前不溢出只是因为服务端 `clampInt` 上限 600（见台账 V-04）。在 600 以内则只需一条注释说明前提。
8. **G-02 与 G-38 共用 `buildGraphBody` 的标签边与 `truncated`/`totalEdges` 判定**，排同批、相邻提交（避免两次改同一段），但仍是两个提交：一个是预算，一个是读数口径。
9. **G-33 必须两步两提交**：先删零调用者的位置重载与 `!` 断言；再把 `canvas-draw.test.ts` / `canvas-physics.test.ts` 改成传 `{ current }` 后删 `'current' in` 双形态判断。合成一步会让「先红后绿」把测试失败误读成回归。
10. **G-40 的文档部分先单独 `docs(graph)` 提交**，并**保留 `ADR-0002:59` 的「修复方向」段**——它顺带记录了「这条 effect 会重建布局」，正是 G-06 的根因，删掉会丢失为什么坐标继承要存在。
11. **G-46 不挂图谱批次**（五处调用点同改，只改图谱会制造局部偏离，铁律 14）；**G-43 ②③ 不挂图谱批次**（`links` 表增类型属持久化契约变更，须走 expand-contract + 迁移不可变门禁 + 部署前备份）。
12. **同一文件被多提交共享时**（`canvas-draw.ts`、`canvas.tsx`、`index.tsx`、`graph.ts` 会各被多项触碰）：按 AGENTS.md「分批与门禁」执行——工作区停在最终态，只把本批 hunk 暂存（`git diff <file> > /tmp/all.patch` 后按块切分），每个暂存快照单独用 `git archive` 快照验证；**不得为凑中间态回退工作区**。

---

## 3. 执行前提与门禁操作（本工程实测，避免误判回归）

- **统一命令（每条提交前）**，下表各条目的「验证命令」在此之上叠加：

```bash
npm run typecheck && npm run style:check && npm run comments:check && npm run empty-catch:check \
  && npm run escape:check && npm run hardcoded:check && npm run tokens:check && npm run i18n:check \
  && npm run size:check && npm run module-state:check && npm run deep-imports:check \
  && npm run surfaces:check \
  && npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts \
     src/shared/graph-filter-expression.test.ts tests/graph-routes.test.ts src/client/demo/backend.test.ts
```

  改到 i18n 文案或视觉文案的条目（G-15 / G-19 / G-24 / G-27 / G-34 / G-35 等）另跑 `npm run labels:check`。

- **批次收尾（每批一次）**：`npm run test:unit`、`npm run build`、`npm run budget:check`，以及三个浏览器门禁。浏览器门禁**只对全新实例有效**：以当前树新起 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`（用 `setsid nohup … </dev/null &` 启动，避免超时调用杀掉进程组）后依次 `node scripts/e2e.mjs`、`INKSTONE_CHROME_PATH=… node scripts/e2e-visual.mjs`、`INKSTONE_CHROME_PATH=… node scripts/check-contrast.mjs`；复用上一轮实例会累积账号/面板状态并产出假失败。判定「是否我引入的」用 `git archive HEAD~N` 快照跑同一条门禁对比。
- **浏览器门禁运行期间不改任何文件**：Tailwind 会重扫 `.md`/`.mjs` 并重出 `app.css`，页面会在 `page.evaluate` 期间跳转。文档编辑与门禁串行。
- **`npm run test:unit` 有已登记的负载敏感 flake**（`tests/starter-deck-render.test.ts`、`blog-comments-window.test.ts`、`calendar-tree.test/activity.test.ts`、`radiogroup-names*.test.ts`、`music-hub-modal.test.ts`，以及 `music-store/eq.test.ts:164` 的取值断言）。全量红时先看失败块是否为 `Test timed out`，再单独重跑那几个文件并核对 import；按 flake 如实报告，不得写「全绿」，也不得顺手修（铁律 14）。
- **`check-size.mjs` 把 `describe`/`it` 的回调也计为函数**：在既有 describe 里加用例可能被报成长函数并让基线从 `null` 变 `{"longFns":1}`。做法是拆分 describe 或把 setup 提出去，**不用 `--update-baseline` 吸收自己造的长函数**。
- **`check-hardcoded.mjs` 按文件粒度 grandfathering**：从别的组件原样复制一行 `text-white` 到新文件仍是新违规，用令牌（如 `--swatch-white`）。
- **本仓库禁止运行 prettier**（无配置，其默认风格与 `style:check` 冲突）。格式以一提交前的门禁为准。
- `.githooks/pre-commit` 镜像大部分静态门禁，并对暂存 TS 跑增量 `tsc -b` 与 `vitest related`；它检查的是**工作区**而非暂存快照，多提交共享文件时按 §2 第 12 条处理。

---

## 4. 详细任务执行清单

### 批次 0：先量后改（V-01…V-03）

> 目标：把三条 🔬 从「推断」变成「实测」。完成判据：三个数字写进台账 §5 的 V 表，并作为 §6 决策闸门的输入。本批不碰产品代码，可与批次 1 并行。

- [ ] **0.1 新增 `scripts/measure-graph.mjs`：布局帧成本、单请求读行数、degree 聚合耗时**
  - 台账：§5 V-01 / V-02 / V-03
  - 文件：`scripts/measure-graph.mjs`（新增）；合成样本写入方式沿用既有脚本（写笔记/栅栏或直接对本地 D1 造库），不改 `src/`
  - 要点：① 按仓库既有手动验收脚本惯例——`node scripts/measure-graph.mjs [baseUrl] [nodes]`，`NODES`/推帧上限可调，账号用 `INKSTONE_VISUAL_USERNAME/PASSWORD`、浏览器用 `INKSTONE_CHROME_PATH`，**只报告不判定**（帧时序在共享 runner 上是噪声）；② 采样项：布局期物理 vs 绘制占比、单次布局最长提交、每次请求耗时与返回的节点/边数（配合 `wrangler d1 execute --local` 的 `EXPLAIN QUERY PLAN` 与 10k 笔记 / 50k 链接量级合成库）；③ 结论以数据 + 判读两段打印，与 `measure-preflight.mjs` / `measure-kanban.mjs` / `measure-music.mjs` 同风格
  - 验证：在全新 `dev:kv` 实例上跑通脚本（`node scripts/measure-graph.mjs`），把三组数字与本机配置一并贴进台账 §5
  - 依赖：无。G-08 / G-10 / G-01 阈值 / G-03 必要性引用它的输出
  - 代价：S（0.5–1 人日）｜提交建议：`perf(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

### 批次 1：P0 渲染连续性与红线（6 项编号 / 4 次提交）

> 完成判据：输入搜索词、切换六个开关、重试时画布**不重建**，读者拖过的坐标与 pin 原样保留；键盘能打开节点菜单；`tagNodes=1` 时边数落在预算内；开启标签节点后截断徽标与顶部统计不再互相矛盾。

- [x] **1.1 G-06（含 G-07 步骤 1）｜画布不再整体重建，坐标与 pin 跨查询存活** ★P0
  - 台账：§3.2 G-06 / G-07
  - 文件：`graph-panel/index.tsx`、`canvas.tsx`、`canvas-draw.ts`、`canvas-hooks.tsx`、`types.ts`；`canvas-physics.test.ts`、`panel-parameter-isolation.test.ts`
  - 要点：① `buildInitialLayout` 增 `previous` 参数，按 id 建 Map 继承 `x/y/vx/vy/pinned`，未命中才螺线播种；② `GraphBody` 只在**首次加载**与硬错误时替换内容，刷新中保留画布并在角落挂 `role='status'` 指示器；③ `useGraphCanvasLoop` 的数据依赖收敛，数据变更走显式 `applyData()` 通道；④ `fitGraph` 只在首次载入、节点集合实质变化、用户 Fit/Home 时执行；⑤ `createCanvasResizer` 的 `if (!state.offsetX && !state.offsetY)` 改按「是否已有过布局」判定，避免旧相机套新坐标
  - 先红后绿：新增 `canvas-refresh-continuity.test.ts` 3 条用例，改动前分别红在「继承坐标被重置为 (0,0)」「onSettled 只调用 1 次」「刷新期间 `panelCanvas()` 为 null」
  - 验证命令（已跑）：图谱聚合 **22 文件 / 148 条全绿**；`typecheck` 与 12 项静态门禁全绿。批次收尾的 `test:unit` 与三个浏览器门禁不属本项提交，已在「批次 1 收尾门禁」登记
  - 依赖：无（全表第一项）。G-07 步骤 2、G-14、G-47② 依赖本项
  - 代价：M（本项实际约 0.5 人日 + 用例）｜提交建议：`fix(graph)`
  - 提交哈希：`d4d2e12e`｜状态：✅ 已完成（2026-10-01）。注意：本项只交付 **G-07 步骤 1**（pin 随坐标继承、同会话存活），跨会话持久化（步骤 2）仍在批次 6，G-07 编号整体未完成

- [x] **1.2 G-22 + G-28｜节点菜单的键盘入口（WCAG 2.1.1 Level A）** ★P0
  - 台账：§3.4 G-22 / G-28
  - 文件：`canvas.tsx`、`use-graph-preview.ts`、`canvas-a11y.test.ts`、`graph-canvas-mount.test-helpers.ts`（pressKey 支持修饰键）、`features/command/shortcuts-panel.tsx` + `shortcuts-panel.test.ts`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点（落地口径）：① `handleCanvasKeyDown` 增 `ContextMenu` 键与 `Shift+F10` 分支，复用导出的 `computeNodeAnchor` 把选中节点换算成屏幕锚点后 `setContext`；② 无选中时不打开空菜单；③ `graph_canvas_accessible` 补「菜单键或 Shift+F10 打开节点操作」承诺；④ G-28 的 `?` 面板登记落在 `shortcuts-panel.tsx` 新增图谱画布一节（移动/缩放/适应/打开/节点操作五行）+ 5 个双语键，不新开提交；菜单锚点与固定回调抽成 `useGraphNodeActions`（否则 `useGraphCanvasController` 越过 50 行）
  - 先红后绿（已跑）：`canvas-a11y.test.ts` 4 条 + `shortcuts-panel.test.ts` 1 条，改动前分别红在菜单不存在 / aria-label 不含 `Shift+F10` / 图谱行不在面板里
  - 验证命令（已跑）：图谱 + command + overlay 聚合 **30 文件 / 183 条全绿**；提交钩子的增量 `vitest related` 在同一工作区跑出 **410 文件 / 3411 条全绿**；typecheck 与 13 项静态门禁全绿（i18n 3905 键）
  - 依赖：无。G-24 与 G-07 步骤 2 依赖本项；G-41 的第三条断言随本提交落地
  - 代价：S（本项实际约 0.3 人日 + 用例）｜提交建议：`fix(graph)`
  - 提交哈希：`b45dab64`｜状态：✅ 已完成（2026-10-01）

- [x] **1.3 G-02｜标签边预算：`applyTagNodes` 不再无上限 push** ★P0
  - 台账：§3.1 G-02
  - 文件：`src/shared/graph-tag-nodes.ts`、`src/worker/routes/search/graph.ts`；`tests/graph-routes.test.ts`（demo 后端与 Worker 共用该共享函数，改一处两端同步）
  - 要点（落地口径）：① `GRAPH_TAG_EDGE_LIMIT = 2000`，簇按大小降序展开、累加成员预算，装不下的簇**整个跳过**（同小的后续簇仍可装入），返回值 `dropped` 计入所有未展开簇；② `truncated` 与 `meta.totalEdges` 仍在标签边落定后判定（`buildGraphBody` 已是该顺序，本项未改 server 侧）；③ `tagNodes=1` 的边数断言落在两处：纯函数套件与 `graph-routes.test.ts` 的 61 笔记 × 61 标签场景
  - 先红后绿（已跑）：`src/shared/graph-tag-nodes.test.ts` 4 条，改动前分别红在常量不存在（TypeError）、预算被突破、单个超大簇仍被展开
  - 验证命令（已跑）：`src/shared/graph-tag-nodes.test.ts` + `tests/graph-routes.test.ts` + `src/client/demo/backend.test.ts` + 图谱套件 **21 文件 / 144 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1362 文件 / 12748 条）
  - 依赖：与 1.4 同批（相邻提交，1.4 改的是 `buildGraphBody` 的读数口径；本项只改共享函数与断言，未动 server 侧）；默认关闭 `showTagNodes` 只降低触发概率，踩到的是界面卡死
  - 代价：S（本项实际约 0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`24f2f22a`｜状态：✅ 已完成（2026-10-01）

- [x] **1.4 G-38｜截断徽标与顶部统计的口径统一（标签节点计「篇」的矛盾）**
  - 台账：§3.6 G-38
  - 文件：`graph-overlays.tsx`、`index.tsx`、`helpers.ts`、`src/worker/routes/search/graph.ts`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点（落地口径）：① 新增 `graphNodeCounts(nodes)` 纯函数，`GraphStats` 改用它，删掉三处各写一遍的 `filter`（徽标与顶部统计同源）；② 采纳「量词中立」而非改用 `notes`：`showing_limit` 英文补 `nodes`、中文把「篇」改为「个节点」（服务端 `totalNodes` 本就含标签与未创建节点，改用 `notes` 反而会与 `total` 对不上）；③ 服务端 `totalEdges`/`truncated` 已在 1.3 确认是标签边落定后判定，本项未动 server；④ unresolved 计「篇」与全应用一致，未改
  - 先红后绿（已跑）：`helpers.test.ts` 的 `graphNodeCounts` 用例（改动前函数不存在）与 `canvas-a11y.test.ts` 的文案断言（改动前英文不含 `nodes`）两条先红
  - 验证命令（已跑）：图谱聚合 **23 文件 / 157 条全绿**；typecheck 与 13 项静态门禁全绿
  - 依赖：1.3（相邻提交，同一段 `buildGraphBody` 读数）
  - 代价：XS（本项实际约 0.2 人日）｜提交建议：`fix(graph)`
  - 提交哈希：`1358a374`｜状态：✅ 已完成（2026-10-01）

#### 批次 1 收尾门禁（已跑，2026-10-01）

> 四项全部落地后在同一棵树（1.4 提交 `1358a374`）上跑完。`test:unit` 与 `budget:check` 直接在开发机跑；三个浏览器门禁先以 `setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv > /tmp/inkstone-graph-dev.log 2>&1 < /dev/null &` 新起 :7712 实例（`curl http://localhost:7712/api/health` 返回 `{"ok":true}`），门禁期间未改任何文件（避免 Tailwind 重扫跳页）。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **620 文件全部通过 / 5452 通过 + 1 跳过（5453），225.72s** | ✅ 无回归 |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0；music 相关各 chunk ≤ 97.7 KiB，excalidraw 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs` | **177 passed / 0 failed** | ✅ |
| 视觉与交互 | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs` | **682 passed / 0 failed**（含 G-22/G-28 落地后的画布快捷键与菜单路径） | ✅ |
| 对比度与外壳 a11y | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/check-contrast.mjs` | 全部 ✓，结尾 `contrast gate passed`（两套主题均达 AA） | ✅ |

- 门禁结束后已停掉临时实例，:7712 释放；`:7770` 上另一 worktree 的 vite 与本轮无关，全程未触碰。
- `npm run build` **未单独运行**：`budget:check` 内含构建且退出码 0；如需单列，按此口径记为「由 `budget:check` 覆盖」而非「未运行」。
- 本轮无负载敏感 flake（首轮即全绿），故未触发 §3 的 flake 复核流程。

### 批次 2：请求与开销边界（4 项）

> 完成判据：大库请求读行数有明确上界且超时可回退；服务端读端点有节流；MCP 与 UI 的归档口径一致；拖拽路径不再逐 pointermove 强制布局。

- [x] **2.1 G-01｜边查询补回逐语句 `LIMIT`，读满即报截断**
  - 台账：§3.1 G-01
  - 文件：`src/worker/routes/search/graph.ts`；`tests/graph-routes.test.ts`；注释门禁 `scripts/check-comments.mjs`
  - 要点（落地口径）：① 每条边语句绑定 `LIMIT GRAPH_EDGE_CANDIDATE_LIMIT + 1`——**与计划的 ② 有出入**：没有采用「`chunk.length × 每篇上限 + 1`」，因为单篇出链没有真实上界（2 MiB 笔记里每个 `[[…]]` 都会入库），人为的每篇上限会在正常密度的笔记上提前丢边；用请求自己的候选预算当单条语句的天花板，与分块前的单语句 `LIMIT` 同形；② 多出来的那一行就是「语句读满 = 被截断」的判据，`loadGraphEdgesAndTags` 把它并入响应 `meta.truncated`（未读到的行可能含页内边，不能看起来完整）；③ `collectGraphLinkRows` 承担「按页内目标过滤 + 截断判定」，`loadGraphLinkRows` 只备语句与排序（否则其函数体 54 行越过 `size:check` 的 50 行）；④ 语句仍全部走一次 `db.batch`（保住 `029f252b` 的单次往返），所以**一次请求的读上界是「分块数 × (候选上限 + 1)」**：默认 `limit=350` 为 9 × 10001 = 90,009 行；⑤ 计划 ① 的「达到上限即停止追加后续语句」在单次 batch 里省不下 I/O（语句在执行前已全部备好），故以「每条语句有界 + 截断显式上报」落地；⑥ 阈值待批次 0 的 V-02 实测校准（本次未跑批 0，按合理常量落地）
  - 先红后绿（已跑）：`tests/graph-routes.test.ts` 新增用例（递归 CTE 一次插入 `上限 + 2` 行链接，目标是归档笔记，页内边为 0），改动前分别红在 `expected 10002 to be less than or equal to 10001`（单条语句把 10,002 行全搬过来）与 `expected false to be true`（读被截断却报 `truncated: false`）
  - 验证命令（已跑）：图谱聚合 **23 文件 / 158 条全绿**；`tests/graph-routes.test.ts` 单跑 20 条全绿；typecheck 与 13 项静态门禁全绿（comments 1362 文件 / 12758 条）
  - 依赖：批次 0 的 V-02（阈值校准）；与 2.2 同批（同属端点成本）
  - 代价：S（本项实际约 0.3 人日 + 用例）｜提交建议：`fix(graph)`
  - 提交哈希：`17dc66de`｜状态：✅ 已完成（2026-10-01）

- [x] **2.2 G-03｜图谱读请求：客户端加超时，服务端挂读预算**
  - 台账：§3.1 G-03
  - 文件：`src/worker/routes/search/read-budget.ts`（新增）、`src/worker/routes/search/graph.ts`、`src/client/lib/api/vault.ts`；`tests/graph-routes.test.ts`、`src/client/lib/api/vault.test.ts`（新增）、`src/client/features/graph/graph-panel/panel-throttle.test.ts`（新增）；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 预算挂在**新文件** `read-budget.ts` 而不是 `graph.ts` 里（后者已 483 行，逼近 `size:check` 的 500 行文件上限）；形状与窗口照 `share/read-budget.ts`：`graph-read:${userId}`、120 次 / 5 分钟、超预算锁 60 秒、`ApiError(429, 'too_many_attempts', …, { retryAfter })`；② 扣预算的位置在 `parseGraphParams` 之后、查询之前——坏参数回 400 不花预算，卡在重试循环里的读才是 429；③ `api.graph` 补 `timeoutMs: 15_000`，挂起的读走既有 `request_timeout` 三态（本地化文案 + Retry），不再是永不落定的 Promise；④ 既有「边语句一次 batch」用例改为断言批次形态 `[1, 4]`：读预算自身是一次单语句 batch，这就是「每个读请求多一次 D1 写」的可见代价，已登记；⑤ `G-10` 闸门若采纳物化方案，按计划只保留客户端超时
  - 先红后绿（已跑）：服务端两条改动前分别红在 `expected 200 to be 429` 与 `expected null to deeply equal { fails: 1 }`；客户端超时用例改动前红在 `fetch` 拿不到可中止的 `signal`（stub 的 fetch 只被 abort 结束，与真实 fetch 同形）。面板级 429 用例是**守卫**：改动前后都应为绿，未为它虚构先红
  - 验证命令（已跑）：图谱 + api 聚合 **25 文件 / 162 条全绿**；提交钩子的 `vitest related` 在同一工作区跑出 **310 文件 / 2420 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1365 文件 / 12768 条）
  - 边界（如实登记）：`details.retryAfter` 的秒数未接进错误文案——`translateApiError` 对已知码返回本地化通稿，逐码带参数的文案属全应用错误口径，另立事项；本项只保证「不静默 + 可重试」
  - 依赖：批次 0 的 V-02（预算必要性）；G-10 的闸门结论（若物化则本条只留客户端超时）
  - 代价：S（本项实际约 0.4 人日 + 三个测试文件）｜提交建议：`fix(graph)`
  - 提交哈希：`023e1e7d`｜状态：✅ 已完成（2026-10-01）

- [x] **2.3 G-04（①）｜MCP 图谱补上归档过滤，工具说明写清范围**
  - 台账：§3.1 G-04
  - 文件：`src/worker/mcp/library/graph.ts`、`src/worker/mcp/server/assets.ts`；`tests/mcp-graph.test.ts`（新增）；`scripts/check-comments.mjs`
  - 要点（落地口径）：① `loadMcpNotesByIds` 补 `AND is_archived = 0`，与 UI 侧 `filters` 同口径：归档笔记不进节点集，穿过它的边随 `nodes.has` 过滤消失（答案不再连同标题与摘要返回归档笔记）；② 工具 `description` 补「Archived and deleted notes stay out of the graph」；③ 归档笔记当 root 时两侧都答空图（UI 的 local CTE 同样把归档中心过滤掉），故**未改** `requireOwnedNote`（它还服务附件/分享/笔记工具，改它会夹带）；④ ②（抽 `shared/graph-scope.ts`）属另立事项，未做
  - 先红后绿（已跑）：`tests/mcp-graph.test.ts` 两条用例，改动前分别红在节点列表多出 `cccc…`（归档笔记）与 description 不含 archived/deleted 字样
  - 验证命令（已跑）：MCP + 图谱容器 **29 文件 / 193 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1366 文件 / 12769 条）
  - 依赖：无
  - 代价：① XS（本项实际约 0.3 人日，含新建 MCP 图谱测试文件）｜提交建议：`fix(mcp)`
  - 提交哈希：`6e3ed4c2`｜状态：✅ 已完成（2026-10-01）

- [x] **2.4 G-09｜`toWorld` 缓存画布 rect，去掉逐 pointermove 的强制同步布局**
  - 台账：§3.2 G-09
  - 文件：`types.ts`、`canvas-draw.ts`、`canvas-hooks.tsx`、`canvas.tsx`；10 个既有 `CanvasState` 字面量（测试夹具与存档状态）、`canvas-draw.test.ts`、`canvas-pointer-layout.test.ts`（新增）；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 画布盒的视口偏移缓存进 `CanvasState`（`viewLeft`/`viewTop`），由既有 `createCanvasResizer` 回调写入；② **resizer 构建时先量一次**——`ResizeObserver` 首回调是异步的，早到的指针否则会读到零偏移；③ `toWorld` 改读缓存并删掉 `canvasRef` 参数与非空断言（`!` 是防御性写法，「卸载瞬间抛 TypeError」无复现路径，未单独断言）；④ `canvas.tsx` 双指捏合的两处读取同属拖拽热路径，一并改读缓存（若只改 `toWorld` 会留下第二处逐事件量测）；⑤ 测试夹具的 10 处 `CanvasState` 字面量补两字段（TS 必填字段，漏改无法通过 typecheck）
  - 先红后绿（已跑）：`canvas-pointer-layout.test.ts` 改动前红在 `expected 9 to be 3`——3 = 1 次按下 + 2 次选中时预览锚点，6 次 `pointermove` 各量一次；`canvas-draw.test.ts` 的「tick 不测量」用例改为记录**新次数**（构建时 1 次 + 显式 `resize` 2 次，tick 之后不变）并断言 `viewLeft=32`/`viewTop=18`，改动前红（次数与缓存字段都不存在）
  - 验证命令（已跑）：图谱聚合 **25 文件 / 162 条全绿**；提交钩子的 `vitest related` 在同一工作区跑出 **18 文件 / 94 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1367 文件 / 12783 条）
  - 边界（如实登记）：① `wheel` 与本面板预览锚点仍在离散事件上读画布盒——不属 `pointermove` 热点，未动以免夹带；② 缓存随 `resize` 失效的前提是**本面板为 `app-viewport-fixed`、画布尺寸只随内部布局变化**，会移动画布的情形都伴随一次 `resize`，已写进注释
  - 依赖：1.1（同改 `CanvasState` 与 resizer，排在它之后少一次改写）
  - 代价：XS（本项实际约 0.3 人日 + 两个测试文件）｜提交建议：`perf(graph)`
  - 提交哈希：`e21bde8c`｜状态：✅ 已完成（2026-10-01）

#### 批次 2 收尾门禁（已跑，2026-10-01）

> 四项全部落地后在同一棵树（2.4 提交 `e21bde8c`）上跑完。起止同批次 1：`test:unit` 与 `budget:check` 直接在开发机跑；三个浏览器门禁先以 `setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv > /tmp/inkstone-graph-dev.log 2>&1 < /dev/null &` 新起 :7712 实例（`curl http://localhost:7712/api/health` 返回 `{"ok":true}`），门禁期间未改任何文件（避免 Tailwind 重扫跳页）；结束时停掉临时实例释放 :7712。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **624 文件全部通过 / 5460 通过 + 1 跳过（5461），170.32s** | ✅ 无回归 |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0；music 各 chunk ≤ 97.7 KiB，excalidraw 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs` | **177 passed / 0 failed** | ✅ |
| 视觉与交互 | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs` | **682 passed / 0 failed** | ✅ |
| 对比度与外壳 a11y | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/check-contrast.mjs` | 全部 ✓，结尾 `contrast gate passed`（两套主题均达 AA） | ✅ |

- 与批次 1 相比，`test:unit` 由 620 文件 / 5452 条增至 624 文件 / 5460 条：批次 2 新增了 `tests/graph-routes.test.ts` 的截断与读预算用例、`src/client/lib/api/vault.test.ts`、`src/client/features/graph/graph-panel/panel-throttle.test.ts`、`tests/mcp-graph.test.ts`、`src/client/features/graph/graph-panel/canvas-pointer-layout.test.ts` 这些文件与用例。
- 三个浏览器门禁的条数与批次 1 完全相同（177 / 682）——批次 2 未改对外交互行为，符合预期；`e2e-visual` 末行 `console: no page errors` 说明 2.2 的客户端超时没有在正常路径上误触发。
- `npm run build` 同样**未单独运行**：`budget:check` 内含构建且退出码 0，按批次 1 口径记为「由 `budget:check` 覆盖」。
- 本轮无负载敏感 flake（首轮即全绿），故未触发 §3 的 flake 复核流程。
- 运维备注（如实登记）：收尾时按 `pgrep -f "vite --mode kv"` 停进程，该模式同时命中了另一 worktree 在 `:7770` 上的 vite（同命令启动），已一并停掉；未触碰其工作区文件，重启由该 worktree 的负责人自行决定。

### 批次 3：视觉、主题与门禁（5 项 + G-43① 顺手）

> 完成判据：调色板收敛为单一来源且两套主题达标（A/B 见下）；主题翻转后预览卡与画布同步；`ADR-0002` / `AGENTS.md` 不再与代码相反、且 ADR 点名要的浏览器像素断言存在；`npm run contrast:check` 覆盖图谱表面。

- [x] **3.1 G-29｜消除第二套回退色板；浅色底不达标的 6/10 收敛（B 方案）**
  - 台账：§3.5 G-29
  - 文件：`src/client/styles/tokens.css`、`constants.ts`、`helpers.ts`、`canvas-draw.ts`、`graph-export.ts`、`types.ts`；`helpers.test.ts`、`canvas-theme.test.ts`、`canvas-legend.test.ts`；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 经用户决策走 **B 方案并一次做对**：删掉 `TAG_FALLBACK_PALETTE`，新增客户端私有令牌 `--graph-tag-1…10`（浅色取 600/700 阶、暗色取 400 阶，两套值全部 ≥3:1——实测最低 4.44:1 / 6.52:1，已含 `data-background='white'` 的 `#ffffff` 与 `#151617` 变体；这也正是 A 方案做不到的两条：`ORGANIZER_COLORS` 浅色 2/10、暗色 1/10 不达标）；② `tagHashColor` 改 `tagHashIndex`——槽位与主题无关，`nodeColor` 改对象传参接 `tagPalette`（`{ groupBy, fallback, tagPalette }`，守住 ≤3 参数规则）；③ 图例里未赋色的标签改指 `var(--graph-tag-N)`：DOM 侧由 CSS 变量解析，**主题翻转不必重算图例**；画布与导出走 `readThemeColors().tagPalette`（SVG/PNG 需要解析后的值）；④ 样式表尚未就位（jsdom、首帧）时退回共享 `ORGANIZER_COLORS`——不引入第三套板；⑤ **未改令牌漂移基线**：`--graph-tag-*` 只声明在应用侧、不属两棵树共享层，门禁输出仍是「89 tokens, values stable」，与「改共享令牌才需 `--update-baseline`」的口径一致
  - 先红后绿（已跑）：`helpers.test.ts` 五处改新口径（改动前红在 `TypeError: tagHashIndex is not a function` 与 `expected [ { label: 'idea', color: '#ec4899' } ] to deeply equal [ { … color: 'var(--graph-tag-4)' } ]`）；`canvas-theme.test.ts` 两条（`readThemeColors()` 少 `tagPalette` 键；无令牌时 `expected undefined to deeply equal [ '#dc2626', … ]`）；`canvas-legend.test.ts` 一条（`expected 'background-color: rgb(236, 72, 153);' to contain 'background-color: var(--graph-tag-4)'`）
  - 验证命令（已跑）：图谱聚合 **25 文件 / 165 条全绿**（较 2.4 的 162 条多出本项新增的 3 条）；typecheck 与 13 项静态门禁全绿（comments 1368 文件 / 12795 条）；提交钩子 `vitest related` **20 文件 / 118 条全绿**
  - 边界（如实登记）：① 用户**已赋色**的标签仍旧走共享 `ORGANIZER_COLORS`（标签管理器里选的颜色属用户数据），其中浅色 2/10、暗色 1/10 低于 3:1 的问题因此仍在——那是共享色板的语义问题（G-46 另立），本项只保证「没有颜色时」的槽位达标；② 同一标签在浅/暗两套主题下取值不同（这就是「跟随主题」），槽位不变；③ 浏览器侧守住属 3.5（G-41）的对比度场景，本项只落地令牌与接线
  - 依赖：3.5（门禁守住）；与 3.3 可并行
  - 代价：S（本项实际约 0.4 人日 + 三个测试文件）｜提交建议：`fix(graph)`
  - 提交哈希：`4c24d686`｜状态：✅ 已完成（2026-10-02）

- [x] **3.2 G-30｜默认 `groupBy: 'none'` 下信息密度偏低（采纳方案 ③）**
  - 台账：§3.5 G-30
  - 文件：`constants.ts`、`canvas-draw.ts`、`graph-export.ts`；`canvas-draw.test.ts`、`graph-export.test.ts`；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 三选一中采纳 **③「三类节点不依赖颜色也能区分」**：tag 节点在实心点上补一圈同色外环（`r + 2`、线宽 1.5 随缩放，与 unresolved 的空心圈、note 的实心点组成三态）；② 几何提为 `GRAPH_TAG_RING_GAP` / `GRAPH_TAG_RING_WIDTH`，画布与 SVG 导出共用（导出侧同步出环，pinned 描边环顺序不变）；③ **未采纳** ① 默认 `groupBy: 'folder'`（用户可感知变化，且需同步 README 设置表）与 ② 首次打开一次性提示（需新增文案与一次性状态，且不解决「颜色本就是分组语义」的重叠）；④ 未改任何默认值与设置项，故 README 无需同步
  - 先红后绿（已跑）：`canvas-draw.test.ts` 新增「三类节点形态」用例，改动前红在 `expected [ Array(3) ] to have a length of 4 but got 3`；`graph-export.test.ts` 新增导出环用例，改动前红在 `expected '<svg …>' to contain '<circle cx="0" cy="0" r="12" …'`
  - 验证命令（已跑）：图谱聚合 **25 文件 / 167 条全绿**（较 3.1 多 2 条）；typecheck 与静态门禁全绿（comments 1368 文件 / 12797 条）；提交钩子 `vitest related` **120 条全绿**
  - 边界（如实登记）：双环与 pinned 环（`r + 2.5`、强调色）在同一 tag 上会同时出现，两环半径相差 0.5、颜色不同（标签色 vs 强调色），未做合并；形态差异只在画布与导出可见，图例（DOM 圆点）不区分种类
  - 依赖：3.1（同改 `drawNodes` 与导出侧，紧接其后少一次改写）
  - 代价：XS（本项实际约 0.3 人日 + 两个测试文件）｜提交建议：`feat(graph)`
  - 提交哈希：`50ea81cc`｜状态：✅ 已完成（2026-10-02）

- [x] **3.3 G-31｜`isDark` 不再在渲染期直读 DOM，预览卡跟随主题**
  - 台账：§3.5 G-31
  - 文件：`canvas-hooks.tsx`、`canvas.tsx`、`graph-overlays.tsx`；`canvas-preview-theme.test.ts`（新增）、`preview-stub.test-helpers.ts`；`scripts/check-comments.mjs`
  - 要点（落地口径）：① 在 `canvas-hooks.tsx` 新增 `useIsDarkTheme()`（useState + MutationObserver 订阅 `html[data-theme]`，与 `presentation-theme.ts` / `pinned-windows-layer.tsx` 同形）——翻转既触发 React 重渲、也覆盖「账号跟随系统时 OS 偏好变化」这条不写 store 的路径；② `GraphCanvas` 改调该 hook，删掉渲染期 `document.documentElement` 直读与 `typeof document !== 'undefined'` 守卫；③ `GraphOverlays` 的 `isDark` 由「可选 + 默认 true」改为**必填 prop**；④ 预览桩记录收到的 `dark`，用例读「已打开的卡片拿到了什么」而不是组件内部值；⑤ 浏览器侧复核（V-05）归 3.5
  - 先红后绿（已跑）：新增 `canvas-preview-theme.test.ts` 两条（亮→暗、暗→亮），改动前分别红在 `expected false to be true` 与 `expected true to be false`
  - 验证命令（已跑）：图谱聚合 **26 文件 / 169 条全绿**（较 3.2 多 1 文件 / 2 条）；typecheck 与 13 项静态门禁全绿（comments 1370 文件 / 12800 条）；提交钩子 `vitest related` 全绿
  - 边界（如实登记）：① 同类「读 DOM 主题」的副本在 editor / preview / presentation 仍各有一份，合并它们是跨模块重构（铁律 14），未在本项夹带；② 卡片内容的重渲只在 `dark` 值变化时发生，卡片若已关闭则无对象可重渲（用例在卡片打开时可翻转）
  - 依赖：无（可与 3.1/3.2 并行）
  - 代价：XS（本项实际约 0.3 人日 + 一个新测试文件）｜提交建议：`fix(graph)`
  - 提交哈希：`d4c40a6a`｜状态：✅ 已完成（2026-10-02）

- [x] **3.4 G-40｜ADR/AGENTS 与代码对齐（先独立 `docs` 提交）+ ADR 点名要的浏览器像素断言**
  - 台账：§3.7 G-40（G-43① 顺手）
  - 文件：`ADR-0002-renderer-theme-following.md`、`AGENTS.md`、`README.md`、`scripts/e2e-visual.mjs`、`scripts/check-comments.mjs`
  - 要点（落地口径）：① 文档提交：渲染物表该行改 ✅ 并写清机制（`createThemeObserver` 只换 `colorsRef.current` + `state.schedule?.()`，不重建布局，坐标与相机原地保留）、删除「已知缺口」段与复现证据表、**保留 :59「修复方向」**（它记录了「这条 effect 会重建布局」，是 G-06 的根因）；`AGENTS.md`「设计令牌位置」删掉「图谱面板 canvas 是当前已知缺口」；同批写 G-43① 的口径（图谱画 wiki 关系、`![[嵌入]]` 与普通链接同权、附件既不是节点也不是边）进 `README.md` 的 Graph tag filtering；② 断言提交：新增 `assertGraphThemeFollow(page)`——账号主题设「跟随系统」→ 系统偏好 `light` → 开图谱（`pressOpener` 设置 / Ctrl+Shift+G）→ 连续三帧像素和相同（物理收敛）后给 canvas 打 `data-gate-graph-canvas` → 翻 `dark` → 断言 **marker 还在**（同一张元素）**且像素和变了**（新调色板），退场清 marker、复位媒体特性、Escape 关图谱并交还浅色；③ 断言只读真实像素（`getContext('2d').getImageData`，按 400 字节步长采样），不复用内联色断言，故与 3.1/3.3 的 jsdom 用例互补
  - 先红后绿（已跑）：把 `canvas.tsx` 的 `createThemeObserver(colorsRef, () => state.schedule?.())` 临时换成冻结调色板的桩后跑整条门禁，**同一元素像素和 `72232 → 72232`、仅「新调色板」一条失败（684 passed / 1 failed）**；恢复后 **685 passed / 0 failed**（较批次 2 的 682 多 3 条，全部为新增 `graph:` 断言）
  - 验证命令（已跑）：断言提交跑全新实例的 `node scripts/e2e-visual.mjs`（全新实例由 `scripts/e2e.mjs` 先注册 Owner-1，与 CI 顺序一致）；文档提交跑统一命令的静态门禁；两提交的提交钩子（13 项静态门禁 + `typecheck`）全绿，comments 1370 文件 / 12804 条
  - 边界（如实登记）：① 该场景只证明「同一元素重画了新调色板」，不覆盖 G-31 的预览卡与 G-30 的节点形态（各归其项）；② 像素和为采样值，只用于「变了 / 没变」的判定，不当作颜色断言；③ 场景依赖图谱表面在门禁里已有内容（前序场景创建的笔记），空库下 `before.sum > 0` 会先失败并说明原因
  - 依赖：无（文档部分可与 3.1/3.3 并行）；断言依赖图谱表面的启动路径（`pressOpener` + `e2e-harness.mjs` 的登录与主题动作）
  - 代价：文档 XS + 断言 S（本项实际约 0.6 人日 + 两次整条浏览器门禁）｜提交建议：`docs(graph)` + `test(graph)`
  - 提交哈希：`01a9df9f`（文档）+ `4d00b9f3`（断言）｜状态：✅ 已完成（2026-10-02）

- [x] **3.5 G-41｜对比度门禁覆盖图谱表面；核对四条功能断言已随功能项落地**
  - 台账：§3.7 G-41
  - 文件：`scripts/check-contrast.mjs`、`scripts/check-comments.mjs`
  - 要点（落地口径）：① 新增图谱场景 `readGraphPalette(page, theme, colors)`，插在每套主题的 `SURFACES` 循环之后（图例/节点色不是文字与底色的一对，所以不是 `SURFACES` 条目）：用应用自己的快捷键开面板（`Control+Shift+G`，先 blur 编辑器——热键表让编辑器有焦点时把组合键留给页面）、读画布像素、Escape 关闭，两套主题各一遍；② 判定分两层：**声明层**把样式表里每一枚 `--graph-tag-*` 解析出来后对图谱自己的表面（面板根元素的背景，要求按值回认到 `--bg-base`）按 **3:1**（`AA_MARK`，WCAG 1.4.11 非文字）量——这正是 G-29 手工复算的那一步；**画布层**把画布上不透明的平色（≥24 px）按令牌值回认，能回认的同样按 3:1 量，回认不到（用户自己的标签色）只报告不判定，与看板读者的口径一致；一枚都回认不到、或表面不是 `--bg-base`，都直接失败；③ 逐条核对四条功能断言：**G-07 跨查询 pin** 已在 1.1（`canvas-refresh-continuity.test.ts:93`「carries the position, velocity and pin of every node the new response still holds」）、**G-02 标签边预算** 已在 1.3（`tests/graph-routes.test.ts:434-438` 断言 `edges.length <= GRAPH_TAG_EDGE_LIMIT`）、**G-22 键盘开菜单** 已在 1.2（`canvas-a11y.test.ts:165-176` 的 `ContextMenu` 与 `Shift+F10` 用例）、**G-15 筛选空态出口** 尚未落地（归 5.2，本项不代做）；④ 3.1 的 B 方案令牌已全覆盖（十枚逐枚声明量测）
  - 先红后绿（已跑）：把浅色 `--graph-tag-1` 临时改成表面色 `#f7f5f1` 后，门禁红在 `✗ graph (light): 10 declared tag colours + 3 colours the canvas painted measured against --bg-base, 1 below 3:1` + `1.00:1 (needs 3) --graph-tag-1 on --bg-base — #f7f5f1 on #f7f5f1`，整条 `contrast gate failed: 1 tier/surface pairs below AA`；恢复后两套主题 `✓ graph (light): 10 declared tag colours + 3 colours the canvas painted … 0 below 3:1`、`✓ graph (dark): 10 declared tag colours + 2 colours …`，整条 `contrast gate passed`
  - 验证命令（已跑）：全新实例上 `node scripts/check-contrast.mjs`（两套主题全绿）与 `npm run surfaces:check`（8 个全屏表面仍有门禁）；图谱聚合 **26 文件 / 169 条全绿**；typecheck 与 13 项静态门禁全绿（comments 1370 文件 / 12831 条）；提交钩子全绿
  - 边界（如实登记）：① 画布只读**不透明**平色（边 42%、标签 72%、非邻居节点 18% 都是混合色，回认它们就是猜），所以这一层守的是节点圆点；② 图例 DOM 圆点与画布同源（`tagLegendColor` 与 `nodeColor` 共用同一 `tagPalette`），其取值已由 `canvas-legend.test.ts` 在 jsdom 断言 `var(--graph-tag-N)`，本场景不按不稳定的 DOM 形状选元素；③ 图谱默认 `showTagNodes: false`，画布里是否出现标签色取决于库里有没有标签，所以「十枚令牌都在屏幕上被画过」不是本项的前提——它们是**声明层**逐枚量测的；④ 本场景不给图谱加 axe 读者（那不是本项范围，图谱的 a11y 归行为门禁的全屏扫描）
  - 依赖：3.1（色板改完才守得住）
  - 代价：M（本项实际约 1 人日 + 两次整条对比度门禁）｜提交建议：`test(graph)`
  - 提交哈希：`fbb3d235`｜状态：✅ 已完成（2026-10-02）

#### 批次 3 收尾门禁（已跑，2026-10-02）

> 五项全部落地后在同一棵树（3.5 提交 `fbb3d235`）上跑完。起止同批次 1/2：`test:unit` 与 `budget:check` 直接在开发机跑；三个浏览器门禁先以 `setsid nohup env INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv > /tmp/inkstone-graph-dev.log 2>&1 < /dev/null &` 新起 :7712 实例（`curl http://localhost:7712/api/health` 返回 `{"ok":true}`），门禁期间未改任何文件（避免 Tailwind 重扫跳页）；结束时停掉临时实例释放 :7712。

| 门禁 | 命令 | 实测输出 | 结论 |
| :--- | :--- | :--- | :--- |
| 全量单元/集成 | `npm run test:unit` | **625 文件 / 5466 通过 + 1 跳过，1 条失败（`blog-comments-window.test.ts` 超时）；单跑该文件 4.55s 通过**——属 §3 已登记的负载敏感 flake，已复核 | ⚠️ 无回归（flake 已复核） |
| 包体积预算（含构建） | `npm run budget:check` | 退出码 0；`bundle budget check passed (eager + 9 lazy prefixes)`（含 `tsc -b && vite build`）；music 各 chunk ≤ 97.7 KiB，excalidraw 1081.8 KiB / 预算 1464.8 KiB | ✅ |
| 端到端 | `node scripts/e2e.mjs` | **177 passed / 0 failed** | ✅ |
| 视觉与交互 | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs` | **685 passed / 0 failed**（含 3.4 新增的 3 条 `graph:` 像素断言） | ✅ |
| 对比度与外壳 a11y | `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/check-contrast.mjs` | 全部 ✓，结尾 `contrast gate passed`；图谱两套主题：`✓ graph (light): 10 declared tag colours + 3 colours the canvas painted … 0 below 3:1`、`✓ graph (dark): 10 declared tag colours + 1 colours … 0 below 3:1` | ✅ |

- 条数变化：`test:unit` 624 → 625 文件、5460 → 5466 条（3.1/3.2/3.3 新增的图形本测试）；`e2e-visual` 682 → **685**，多出的 3 条全部是 3.4 的 `graph:` 断言；`e2e` 仍 177（本批未动对外接口）。
- 本批唯一红点是 §3 已登记的负载敏感 flake（`blog-comments-window.test.ts` 的 5s 超时），按 §3 口径先看 `Test timed out` 再单跑核实：单跑 4.55s 通过。**没有写成「全绿」**，也没有顺手修它（铁律 14）。
- `npm run build` 同样**未单独运行**：`budget:check` 内含构建且退出码 0，按批次 1/2 口径记为「由 `budget:check` 覆盖」。
- 运维备注（如实登记）：本轮停实例改用 `pkill -f '[v]ite'` 的方括号写法——无括号的 `pkill -f vite` 会命中它自己那条命令行（命令里含有 `vite`），把调用它的 shell 一起杀掉，表现为「静默无输出且后台任务从未启动」；本次已因此白跑一次 `test:unit` 的启动。另：3.4/3.5 的两次先红都用「临时改产品/令牌 + 跑整条浏览器门禁 + `git` 校对工作区」的方式取得，工作区在提交前已逐次确认干净（`git status` 只剩当次要提交的两个脚本）。

### 批次 4：无障碍关系与键盘语义（5 项，依赖批次 1 的 G-22）

> 完成判据：方向键按空间序移动且选中节点可见；标签节点对读屏可辨、Enter 有明确行为；设置抽屉的 ARIA 关系与焦点迁移完整；色板热区达标；画布说明与取消选择播报补全。

- [x] **4.1 G-23｜方向键按空间序取邻居，选中节点进入视口**
  - 台账：§3.4 G-23
  - 文件：`helpers.ts`、`canvas.tsx`、`constants.ts`；`helpers.test.ts`、`canvas-a11y.test.ts`、`canvas-selection-loop.test.ts`；`scripts/check-comments.mjs`（**与计划的文件清单有出入**：两个提纯函数放进 `helpers.ts`（客户端纯函数层，`graphScaleAfterWheel` 也在那）而不是 `canvas-hooks.tsx`，因为它们是可直接单测的纯函数、不需要 React；相机也没复用 `useGraphFit` 的整套拟合，而是只在需要时平移 offset，读者的缩放不被改）
  - 要点（落地口径）：① `pickNeighborInDirection(nodes, fromIndex, direction)`：只取箭头半平面内的候选（`ahead > 0`），得分 = 距离 ÷ 对齐度（`ahead / 距离`，下限 0.25），正前方胜于侧面近邻，同分按距离、再按响应序；没有任何候选时返回 `-1`；② `ensureNodeVisible(state, node)`：屏幕坐标 = `x * scale + offsetX`，越界时只把 offset 平移刚好的距离（边距 `GRAPH_CAMERA_PADDING + r * scale`），画布未量出尺寸时不动；③ 无选中时 `→`/`↓` 取第一个节点、`←`/`↑` 取最后一个（计划只点名了 →/←，↑/↓ 对称处理并登记）；④ 该方向无节点时**保持原选中**，不再环绕到与箭头无关的节点（这正是旧行为的一半问题）；⑤ `handleCanvasArrowKey` 单独成函数——不拆的话 `handleCanvasKeyDown` 会越过 `size:check` 的 50 行
  - 先红后绿（已跑）：两个测试文件先写后跑，红在 `TypeError: pickNeighborInDirection is not a function` / `ensureNodeVisible` 同类错误（6 条）与旧实现下的子集断言 10 条，其中包括把旧行为钉死的证据 `expected 'Gamma, 2 in · 0 out' to contain 'Alpha'`（首按 `→` 在旧代码里落到 `nodes[1]`、两次就走到 `nodes[2]`）与 `expected 0 to be less than 0`（相机从不跟随）
  - 验证命令（已跑）：图谱聚合 **26 文件 / 177 条全绿**（较 3.5 的 169 多 8 条：helpers 6 + a11y 3 − 旧环绕用例 1）；`npm run typecheck` 与 13 项静态门禁全绿（comments 1370 文件 / 12848 条）；提交钩子 `vitest related` 130 条全绿
  - 边界（如实登记）：① `canvas-selection-loop.test.ts` 的「一次选中一次重绘」必须同步改——首按现在落在第一个节点（Alpha）而不是第二个；② 相机只保证节点进入视口（带 `GRAPH_CAMERA_PADDING` 边距），不做动画也不改缩放；③ 方向键不再环绕：沿某个方向走到尽头后需要换方向或 Home 拟合
  - 依赖：1.2（同改 `handleCanvasKeyDown`）
  - 代价：S（本项实际约 0.6 人日）｜提交建议：`fix(graph)`
  - **追加门禁（真实浏览器，`a2e7acc2`，同属本项）**：jsdom 里那条相机用例是手写 `state.width/height` 得来的，布局从未被验证，所以 `scripts/e2e-visual.mjs` 补场景 `assertGraphKeyboardWalk`（插在 `assertGraphThemeFollow` 之后，与它同样走 `pressOpener` 的 `Control+Shift+G` 路径）；只改测试脚本，产品代码不动
  - 追加门禁·口径：① 先等物理 settle：`waitForStillGraphCanvas(page, 80)`（实测 53 个节点的图要 ~7s；默认的 24 × 250ms 不够），因为 settle 回调里的 `fitGraph` 会把之后按的缩放撤销，且未静止的节点会被当成「相机在动」；② 用画布自己的缩放键 `=` 按 20 次（0.2 → 4.0，每次 +0.2），已拟合的图每个节点都在屏内、那样的走位什么都证明不了；③ 12 次方向键走位 `→×5 → ←×3 → ↓ → ↑ → → ←`：先走出窗口再走回来（原地转圈的走法实测只平移 1 次，走出再回来的走法平移 2 次）；④ 每次按后读两样——**选中节点在哪**用预览锚点框（面板 `computeNodeAnchor` 用与平移同一套相机算出它，也是预览卡真实挂靠的位置），**相机动没动**用画布 alpha 掩码的列/行直方图互相关（选中只改颜色、不改哪些像素被画，只有平移能整体搬动这组指纹；未平移时读数为 `dx/dy=0`、分数 0.98–1.00）
  - 追加门禁·四条断言：settle 后再开始；走到的每个节点都在窗口内（锚点框完全落入画布框）；首个方向键必须播报出落点节点（读 live region）；至少一步平移（位移 ≥ 24px = `GRAPH_CAMERA_PADDING` 且两轴余弦相似度 ≥ 0.75）且其中有一步的节点「正好停在被带进来那条边内侧 24px」——后者由 `broughtNodeToEdge` 把平移方向（画布内容向相机反向移动）与夹取数学绑在一起：锚点框半宽就是节点半径，`GRAPH_CAMERA_PADDING + r·scale` 抵消后只剩 24
  - 追加门禁·先红后绿（已跑）：先临时删掉 `handleCanvasArrowKey` 的 `ensureNodeVisible(state, next)`（不新增注释），跑整条 `e2e-visual` → **687 passed / 3 failed**；失败正是「每个走到的节点都画在窗口内」（锚点框 `left=1407` 在 1280 宽窗口外）、「相机确实平移」（八步 `dx/dy` 全 0、分数 0.98–0.99）、「平移把节点带进来」（空集）——同一文件其余场景（含 3.4 的主题断言）全绿；恢复后同树 **690 passed / 0 failed**，明细行 `· graph walk: 12 presses over the graph, 2 of them panned — ArrowRight by (-124, 0)px at 0.953, ArrowRight by (-362, 0)px at 0.841`。**如实说明**：先红那次用的是初版 8 键走法（上表那套混合转向），绿跑前才改成 12 键的右向主导走法以提高平移发生率（见下方边界 ①）；被打破的行为、断言形状与运行命令两者一致
  - 追加门禁·验证命令（已跑）：本地实例因另一棵 worktree 的 vite 占用 7712 而跑在 `:7713`，命令 `node scripts/e2e.mjs http://localhost:7713` 先铺账号（53 个笔记）→ `INKSTONE_CHROME_PATH=/usr/bin/google-chrome node scripts/e2e-visual.mjs http://localhost:7713` 得 690/0；`node scripts/check-comments.mjs` 12863 条 / 1370 文件；12 项静态门禁与提交钩子全绿
  - 追加门禁·边界（如实登记）：① 实例规模决定平移是否会发生：图越大走位越可能真的越过窗口；走位到尽头后方向上无候选时按键是空操作（选中不动、不平移），断言允许这种步；② 标签节点不走 `showPreview`（锚点会停在上一个节点），本门禁不覆盖这一支——`showTagNodes` 默认关，且 4.2 正好补这条语义；③ 平移读数是统计量（余弦相似度），阈值 0.75 来自实测 0.82–0.96；若日后画布改为填满背景而非 `clearRect`，这组指纹会失效（像素全部“不透明”）而平移断言也会随之失效；④ `waitForStillGraphCanvas` 的 `attempts`/`stable` 是兼容扩展（默认 24、原返回形状照旧），主题场景仍用默认耐心，故 §8 新登记的 settle 观察对它仍然成立
  - 提交哈希：`4c4286dd`（实现）+ `a2e7acc2`（追加真实浏览器门禁）｜状态：✅ 已完成（2026-10-02）

- [ ] **4.2 G-24｜标签节点的 kind 播报与 Enter 行为（复用 `graph.tag_node`）**
  - 台账：§3.4 G-24
  - 文件：`canvas.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`；`canvas-a11y.test.ts`
  - 要点：① 播报里带 kind（复用现成但 0 引用的 `graph.tag_node`）；② 标签节点的 `Enter` 改绑「按标签筛选」（与 1.2 的菜单入口同源）；③ **`graph.tag_node` 必须保留**，G-34 清理时注意
  - 先红后绿：补「标签节点选中播报含 kind」与「Enter 触发按标签筛选」用例
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npx vitest run …/canvas-a11y.test.ts`
  - 依赖：1.2
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **4.3 G-25｜设置抽屉的四项无障碍关系补齐**
  - 台账：§3.4 G-25
  - 文件：`settings.tsx`、`index.tsx`；`panel-disclosure-state.test.ts`
  - 要点：① `aside` 加 `id` + `role='region'`，移动端条件改 `role='dialog' aria-modal='true'`；② 触发器加 `aria-controls`，桌面端撤下错误的 `aria-haspopup='dialog'`；③ `Switch` 接 `aria-describedby` 指向 `hintId`；④ 开合各补一次焦点迁移；⑤ 移动端遮罩不再用裸 `<div onClick>`（走既有 Overlay 语义，铁律 10）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/panel-disclosure-state.test.ts`
  - 依赖：无
  - 代价：S（0.5 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **4.4 G-26｜颜色规则色板热区从 20px 提到全仓既有尺寸**
  - 台账：§3.4 G-26
  - 文件：`settings-color-rules.tsx`
  - 要点：升到 `size-6`（24px），或保持视觉尺寸而用 padding 扩大命中面积；色名与单选语义属跨模块 G-46，**不在本提交里做**
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/settings-color-rules.test.ts`
  - 依赖：无
  - 代价：XS（0.1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **4.5 G-27｜画布说明与控件关联、取消选择时播报**
  - 台账：§3.4 G-27
  - 文件：`canvas.tsx`、`graph-overlays.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`；`canvas-a11y.test.ts`
  - 要点：① 给画布加 `aria-describedby`（hint 保持视觉层 + 另建 `sr-only`，或用同一节点 id）；② 取消选择时把 live region 设为新增文案 `graph.selection_cleared`（双语言，不拼接句子）
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npx vitest run …/canvas-a11y.test.ts`
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

### 批次 5：交互与检索语义（7 项）

> 完成判据：搜索输入不再白屏/重排，未命中只变暗且可跳到首个命中；筛选致空有出口；拖拽期间预览卡消失、松手后重锚；窄屏图例与徽标不重叠；触屏能看到「长按」等价提示；伴随图谱与全屏图谱偏好一致；上限与局部深度可调。

- [ ] **5.1 G-14｜搜索从「重新查询」升级为「定位」（客户端变暗 + 图例可交互）**
  - 台账：§3.3 G-14
  - 文件：`index.tsx`、`canvas-draw.ts`（dim 集合入参）、`helpers.ts`、`graph-overlays.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：① 引入「变暗模式」：命中集合在客户端算（复用已有 `graphFilterMatches`），未命中节点/边降透明度，**不发起请求**（因此绕开 G-06）；② 保留服务端过滤作为「仅显示匹配」开关（默认关）；③ 命中数 > 0 时提供「跳到第一个命中」；④ 图例改为可聚焦的 `button`（点击高亮 / 双击过滤），补键盘路径
  - 先红后绿：补「输入搜索词不触发第二次请求且未命中节点变暗」与「图例可键盘聚焦并触发高亮」用例
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph`
  - 依赖：1.1（坐标继承与不重建是它的前提）
  - 代价：M（2–3 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **5.2 G-15｜筛选致空时的文案分流与「清除全部筛选」出口**
  - 台账：§3.3 G-15
  - 文件：`index.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：① 按 `query || prefs.tag || prefs.folderId || selectedTags.length` 分流到「没有匹配的笔记」+ 一个清空全部筛选的 `Button`；② 新增 2 个 locale key × 2 语言（不拼接句子）；③ 空库场景仍保留原「还没有可以画的东西」文案
  - 先红后绿：`graph-routes` 之外的组件级用例：筛选致空时渲染「没有匹配」与清除按钮（这是 G-41 的第四条断言，随本提交落地）
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npx vitest run src/client/features/graph`
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **5.3 G-16｜拖拽节点时关掉预览卡，松手后重新锚定**
  - 台账：§3.3 G-16
  - 文件：`canvas-hooks.tsx`、`canvas.tsx`、`use-graph-preview.ts`；`canvas-selection-loop.test.ts`
  - 要点：`applyDragMove` 在节点位移超过 4px 时 `preview.closePreview()`；松手后重新 `showPreview`（拖动**期间**不该有悬浮卡，也不要靠「位移 ≥5 直接 return」的既有分支兜底）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/canvas-selection-loop.test.ts`
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **5.4 G-18｜窄屏图例与节点详情徽标不再落在同一水平带**
  - 台账：§3.3 G-18
  - 文件：`graph-overlays.tsx`
  - 要点：图例存在时徽标下移一档（如 `bottom-14`），或图例改右上与 `TruncatedBadge` 错开；断点与尺寸用既有令牌，不散写视觉字面量
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph`；批次收尾在 375px 下人工确认
  - 依赖：无
  - 代价：XS（0.2 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **5.5 G-19｜窄屏交互提示与触屏的「长按」等价说明**
  - 台账：§3.3 G-19
  - 文件：`graph-overlays.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：窄屏改为可折叠的一行简版提示，或首次进入时一次性 `role='status'` 播报；文案按 `pointer: coarse` 分流（触屏写「长按查看更多」），不改变桌面文案
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npx vitest run src/client/features/graph`
  - 依赖：无
  - 代价：S（0.5 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **5.6 G-20｜伴随式局部图谱复用用户偏好**
  - 台账：§3.3 G-20
  - 文件：`index.tsx`、`local-graph.tsx`；`local-graph.test.ts`
  - 要点：① 把 `useGraphPrefs` 提升为共享 hook 供两处使用；② 伴随面板只覆写 `mode: 'local'` 与自己的深度（默认取用户值，下限 1）；③ 头部加「打开图谱设置」入口；④ 两处写同一 localStorage key 的竞态策略：只在全屏面板持久化、伴随面板只读，并把该策略写进注释
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/local-graph.test.ts src/client/lib/graph-settings.test.ts`
  - 依赖：无
  - 代价：S（1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **5.7 G-21｜节点上限与局部深度可调（服务端能力不再被界面埋掉）**
  - 台账：§3.3 G-21
  - 文件：`index.tsx`、`local-graph.tsx`、`settings.tsx`、`src/client/lib/graph-settings.ts`、`src/worker/routes/search/graph.ts`
  - 要点：① `limit` 提为 prefs 项 + `Slider`，界值与服务端 `clampInt` 共享常量（避免两处定义）；② 伴随面板补深度切换（至少 1/2 两档）；③ 若上界突破 600，同步把 `canvas-hooks.tsx` 的 `Math.min(...xs)` 改循环求极值（当前不溢出的前提只是服务端 clamp），否则补一条注释说明前提（台账 V-04）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts tests/graph-routes.test.ts`
  - 依赖：5.6（伴随面板的偏好通路）
  - 代价：S（1 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

### 批次 6：设置与工程卫生（7 项）

> 完成判据：全仓裸 `input[type=range]` 只剩既有注释例外；三处默认值有守卫；滑块不逐事件落盘；pin 跨会话存活；死重载与渲染期写 ref 清除。

- [ ] **6.1 G-11 + G-32｜力滑块换用组件库 `Slider`，界值单一来源，副作用移出输入路径（同一提交）**
  - 台账：§3.2 G-11 / §3.6 G-32
  - 文件：`settings.tsx`、`index.tsx`、`canvas-hooks.tsx`、`helpers.ts`、`constants.ts`
  - 要点：① `GraphRange` 内部换用 `Slider`（`label` 给可访问名称、`suffix` 给单位，`aria-valuetext` 由组件提供）；② 新增 `GRAPH_FORCE_RANGES` 常量表，面板与 `loadPreferences` 同读一份；③ 滑块值先落组件本地 state 做即时反馈，`onPointerUp`/rAF 边界提交进 `prefs`；④ `localStorage` 写入 debounce 300ms 并移出渲染路径；⑤ 既有 `catch` 内补 `console.warn`（保留注释，铁律 2 的 best-effort 例外形式）
  - 先红后绿：补「一次拖动只产生 ≤1 次存储写入与 ≤1 次物理唤醒」用例
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts`
  - 依赖：无（合并约束 2）
  - 代价：S（1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.2 G-35｜Tooltip 可见文案与可访问名称统一为 `graph.fit`**
  - 台账：§3.6 G-35
  - 文件：`index.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：`Tooltip label` 与 `IconButton label` 统一为 `graph.fit`；`graph.reset` 随本提交一并删除（G-34 的前置）
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npx vitest run src/client/features/graph`
  - 依赖：无
  - 代价：XS（0.1 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.3 G-36｜默认值的唯一来源与守卫**
  - 台账：§3.6 G-36
  - 文件：`src/client/lib/graph-settings.ts`、`constants.ts`、`graph-settings.test.ts`
  - 要点：测试改断言 `DEFAULT_PREFERENCES[control.prefKey] === control.default`；或让 `DEFAULT_PREFERENCES` 的布尔项由 manifest 派生，使 `default` 成为唯一来源（两者 7 个布尔值目前一致，是「无守卫的重复」而非已漂移）
  - 先红后绿：把测试改成对 `constants.ts` 求值后，先把 `includeOrphans` 翻转验证会红，再恢复
  - 验证命令：统一命令 + `npx vitest run src/client/lib/graph-settings.test.ts`
  - 依赖：无
  - 代价：XS（0.2 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.4 G-37｜魔法数字提具名常量（跨端共享的放共享层）**
  - 台账：§3.6 G-37
  - 文件：`index.tsx`、`local-graph.tsx`、`src/worker/routes/search/graph.ts`、`use-graph-preview.ts`、`constants.ts`
  - 要点：逐项提常量——`limit: 350`、防抖 `220`、伴随图谱 `depth:1`/`limit:100`、`params.limit - 50` 与 `50`（同一数字两种含义）、查询长度 `200`、悬停 `300`/隐藏 `200`；`graph.ts` 的 `!a || b && c` 补显式括号
  - 注意：ULID 正则重复是全仓级现象（10+ 处），**不在图谱批次里做**（§5 第 8 条）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph tests/graph-routes.test.ts`
  - 依赖：无
  - 代价：S（0.5 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.5 G-39｜`useGraphControls` 不在 render 阶段写 ref**
  - 台账：§3.6 G-39
  - 文件：`canvas-hooks.tsx`；`header-export.test.ts`
  - 要点：改成 `useEffect(() => { controlsRef.current = {...} }, [stateRef, fitGraph])`；调用点只在 `onClick` 时读，effect 时序足够。若既有测试依赖渲染期写入，那正是该修的时序假设
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/header-export.test.ts`
  - 依赖：无
  - 代价：XS（0.2 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.6 G-07 步骤 2｜pin 跨会话持久化（步骤 1 已随 1.1 落地）**
  - 台账：§3.2 G-07
  - 文件：`helpers.ts`、`src/client/lib/graph-settings.ts`、`types.ts`、`canvas-draw.ts`、`canvas.tsx`（`shared/types/graph.ts` 仅在需要把 pin 语义外显时同步）
  - 要点：`pinned` 提升为 `GraphPreferences.pinnedNodeIds: string[]`；`loadPreferences` 按 `/^[0-9a-hjkmnp-tv-z]{26}$|^tag:.+$/` 白名单逐项校验（沿用 agy SEC-04 的偏好加固形状）；加载时把命中的节点的 `pinned` 置回
  - 先红后绿：补「重载后 pin 仍在」与「非法 id 被丢弃」用例
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph src/client/lib/graph-settings.test.ts`
  - 依赖：1.1（坐标继承）与 1.2（键盘入口；否则 pin 对键盘用户仍不可达）
  - 代价：S（0.5 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **6.7 G-33｜`createGraphTicker` 双形态签名清理（两步两提交）**
  - 台账：§3.6 G-33
  - 文件：`canvas-draw.ts`、`canvas-draw.test.ts`、`canvas-physics.test.ts`
  - 要点：**步骤 ①** 删位置重载与一串 `!` 断言（grep 已确认全部调用点都是对象形态，零调用者）；**步骤 ②** 先把两个测试文件改成传 `{ current: … }` 并确认仍绿，再删 `'current' in colorsRef/prefsRef` 双形态判断（`canvas-physics.test.ts` 传的是朴素 `readThemeColors()`/`DEFAULT_PREFERENCES`，是这条判断的真实调用者）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/{canvas-draw,canvas-physics}.test.ts`
  - 依赖：无；**不得合并两步**（合并约束 9）
  - 代价：XS（0.3 + 0.2 人日）｜提交建议：`refactor(graph)` ×2
  - 提交哈希：待登记（两个）｜状态：⬜ 待开始

### 批次 7：收尾与对标（7 项 / 8 个编号）

> 完成判据：导出面板能去掉标题（隐私）与背景；绘制异常不再静默停帧；滚轮监听不再被动；死键清零；单篇排除与方向过滤落地。

- [ ] **7.1 G-05 + G-45｜导出选项：「不含标题」「背景透明/纯色」（含隐私维度）**
  - 台账：§3.1 G-05 / §3.8 G-45
  - 文件：`graph-export.ts`、`use-graph-export.ts`、`src/client/lib/graph-settings.ts`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：`prefs` 新增两个布尔项（绘制路径已按 `prefs.labels` 分支）；导出面板提供开关；文件名固定 `graph-<mode>.<ext>` 的现状在提交信息里说明是否保留；导出的 PNG 常被贴到外部，标题即笔记名，属隐私项
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/graph-export.test.ts src/client/features/graph/graph-panel/use-graph-export.test.ts`
  - 依赖：无
  - 代价：S（0.5 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.2 G-12｜`--font-ui` 每帧读取的处理（缓存必须显式跟随变更）**
  - 台账：§3.2 G-12
  - 文件：`canvas-draw.ts`、`canvas.tsx`
  - 要点：择一——并入「由主题/字体变更观察器刷新的引用」（现有 `createThemeObserver` 扩一个观察对象），或保留每帧读但**写明理由**（它正是「换字体后自愈」的机制）。若改缓存，必须补「换 UI 字体后画布文字用新字体」用例；**不要**简单 `useMemo` 缓存（ADR-0002 警告的「冻在创建时刻」）
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph`
  - 依赖：3.3（同一处主题订阅收敛后改，避免两次改同一段）
  - 代价：XS（0.3 人日）｜提交建议：`refactor(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.3 G-13｜绘制路径错误边界：异常不静默停帧**
  - 台账：§3.2 G-13
  - 文件：`canvas-draw.ts`、`canvas.tsx`；`canvas-draw.test.ts`
  - 要点：`tick()` 内 try/catch：`console.error('[inkstone] graph paint failed', error)`（带 message、不带数据）、复位 `state.raf = 0`、停止循环，并经可选 `onPaintError` 让面板显示 `Empty` + 重试（复用 `graph.could_not_load_graph` 文案）
  - 先红后绿：用上下文替身注入抛错，断言不会永久停帧且错误被记录
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph/graph-panel/canvas-draw.test.ts`
  - 依赖：3.3
  - 代价：XS（0.5 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.4 G-17｜滚轮缩放换非 passive 原生监听**
  - 台账：§3.3 G-17
  - 文件：`canvas.tsx`
  - 要点：仿 `features/preview/lightbox.tsx` 的做法在画布容器上注册 `{ passive: false }` 原生监听（React 19 在 root 上被动注册，现有 `preventDefault` 是空调用，并会在 Chrome 打印警告）；或至少给面板加 `overscroll-behavior: none` 并去掉误导性的 `preventDefault`。低危但一旦图谱进可滚动容器会真的带着页面滚
  - 验证命令：统一命令 + `npx vitest run src/client/features/graph`
  - 依赖：无
  - 代价：XS（0.3 人日）｜提交建议：`fix(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.5 G-34｜死 i18n 键清理（排在 6.2 与 4.2 之后）**
  - 台账：§3.6 G-34
  - 文件：`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：删 7 项（`graph.drag_to_pan_…_abov` 截断 key、`graph.graph_canvas_drag_…_note`、`graph.choose_a_note`、`graph.open_a_note_from_the_graph`、`graph.links`、`graph.notes`、`graph.unresolved_short`）；`graph.tag_node` **保留**（4.2 在用）；`graph.reset` 已随 6.2 删除；zh-CN 正确行号 `6,12,13,14,31,35,60,71`（:21 是活键 `graph_canvas_accessible`，不在其列）
  - 注意：不去改 `i18n:check` 增零引用报告（§5 第 7 条）
  - 验证命令：统一命令（含 `npm run labels:check`）+ `npm run i18n:check`
  - 依赖：6.2 + 4.2（合并约束 4）
  - 代价：XS（0.2 人日）｜提交建议：`chore(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.6 G-42｜单篇「从图谱中排除」**
  - 台账：§3.8 G-42
  - 文件：`src/client/lib/graph-settings.ts`、`helpers.ts`、`src/worker/routes/search/graph.ts`、`settings.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：prefs 新增 `excludedNoteIds`（复用 6.6 的白名单校验机制）；服务端 `filters` 加 `NOT IN`——注意 D1 绑定变量预算与既有 `GRAPH_NOTE_ID_CHUNK`，需分块或改用临时表；设置面板提供移除入口
  - 先红后绿：补「排除的笔记不出现在结果里（且现有文件夹/标签过滤不受影响）」用例
  - 验证命令：统一命令 + `npx vitest run tests/graph-routes.test.ts src/client/lib/graph-settings.test.ts src/client/features/graph`
  - 依赖：6.6（校验机制形状）
  - 代价：M（1–1.5 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

- [ ] **7.7 G-44｜局部图谱的方向过滤（仅入 / 仅出 / 双向）**
  - 台账：§3.8 G-44
  - 文件：`src/worker/routes/search/graph.ts`（递归 CTE 方向分支）、`src/client/lib/graph-settings.ts`、`settings.tsx`、`src/shared/locales/{en-US,zh-CN}/graph.ts`
  - 要点：局部图谱加三选一（全局图谱语义上无意义，不渲染）；服务端只需在 CTE 的方向分支上加条件；默认「双向」，保持现有行为
  - 验证命令：统一命令 + `npx vitest run tests/graph-routes.test.ts src/client/lib/graph-settings.test.ts`
  - 依赖：5.7（同行设置区块）
  - 代价：S–M（1 人日）｜提交建议：`feat(graph)`
  - 提交哈希：待登记｜状态：⬜ 待开始

---

## 5. 不做清单（明确不做，避免反复讨论）

1. **不删「以此笔记为中心」菜单项**（台账 §2 Q-UX-02 整体不成立）。该功能经「打开笔记 → 活动笔记变化 → 面板以新 id 重查」可达；若要去掉 `onMakeLocal={() => {}}` 的异味，正确判据是看 `mode === 'local'`，且这属于可选打磨（需产品确认），不在 48 条内。
2. **不上 Barnes-Hut**。节点上限 410 时收益不抵复杂度（G-08 只考虑「每 2 帧物理 / 光晕降级 / 远端团簇跳过」三档）。
3. **不合并 MCP 与 UI 两套图谱遍历实现**。形状差异大（BFS+摘要 vs 聚合+合成节点），只共享「范围」判定（G-04②，另立）。
4. **不在本计划排期内改 `links` 表**。G-43 ②③（附件节点 / 边类型）是持久化契约变更，须走 expand-contract + 迁移不可变门禁 + 部署前备份，另立事项。
5. **G-46（色板可访问名与单选语义，5 个调用点）不挂图谱批次**。只改图谱会制造局部偏离（铁律 14）。
6. **G-48 候选里只保留两项**：「按路径分组着色（含祖先目录）」与「从笔记自身打开全屏图谱」；其余（小地图、缩放百分比读数、冻结物理开关、图谱前进后退、节点尺寸公式可调、框选、未链接的提及）明确不做。
7. **不给 `i18n:check` 增零引用报告**。属全仓性收益，单独立项（铁律 14）。
8. **不在图谱批次里抽 ULID 正则共享**。该重复是全仓 10+ 处的现象，另立。
9. **不顺手修已登记的音乐/日历 flake**（铁律 14，见 §3）；不用 `--update-baseline` 吸收自己造的长函数。
10. **不做无证据的持久化契约变更**。G-10 先量后决定；量测结论为「无压力」时登记为以证据关闭。

---

## 6. 待量测与决策闸门

### 6.1 待量测（批次 0 产出，写入台账 §5 的 V 表）

| 编号 | 待量测 | 手段 | 解锁 |
| :--- | :--- | :--- | :--- |
| V-01 | 布局期真实帧成本（物理 vs 绘制各占多少） | `measure-graph.mjs` 帧采样 | G-08 的 ①②③ 取舍 |
| V-02 | 一次请求实际读多少行 links（大库样本） | 脚本采样 + `EXPLAIN QUERY PLAN` | G-01 的提前退出阈值与 G-03 服务端预算必要性 |
| V-03 | 全局图谱 degree 聚合真实耗时 | `EXPLAIN QUERY PLAN` + 10k 笔记 / 50k 链接样本 | G-10 的 A/B/撤销 |
| V-04 | `Math.min(...xs)` 的安全上界 | 文档层已确认（服务端 clamp 600 + 标签 60 → ≤410）；G-21 若放开上限须同步改循环求极值 | G-21 的前置 |
| V-05 | 主题翻转时预览卡的像素/内联色是否真的陈旧 | 浏览器断言（先设账号「跟随系统」再翻系统偏好） | G-31 的验收条件 |

### 6.2 决策闸门（拿到证据后必须登记结论，含「不做」）

| 闸门 | 决策 | 判据 |
| :--- | :--- | :--- |
| D-1（G-08） | 做「每 2 帧物理」「标签光晕降级」「远端团簇跳过」的哪几档，或全部不做 | V-01：单次布局最长提交与绘制占比；不做 Barnes-Hut |
| D-2（G-10） | A 物化 `link_degree`（持久化契约变更，须 expand-contract + 备份 + 迁移门禁）/ B 请求内 memo + 短缓存（须为 `no-store` 开例外并注明理由、不得引入模块级可变状态）/ 撤销 | V-03 的 `EXPLAIN QUERY PLAN` 与实测耗时 |
| D-3（G-47） | ① 底部徽标升级为可点开的邻居清单（M）；② 节点菜单「展开相邻笔记」合并进当前图（M，依赖 G-06） | **不需要数字**，需要归属决策（是否算图谱模块该做的事）；建议 ① 先做、② 待 1.1 落地后评估 |

---

## 7. 完成定义（每项都按此验收，不满足不得勾 `[x]`）

1. **先红后绿**：行为变化先有复现用例并记录失败输出，再改代码转绿。
2. **原子提交**：一次提交只做一件事，正文按 `- 路径: 改动` 逐文件写；§2 指定的同批项在提交信息中互相引用。
3. **门禁**：统一命令 + 该项「验证命令」全绿；批次收尾跑 `test:unit`、`build`、`budget:check` 与三个浏览器门禁（全新实例）；负载 flake 按证据标注而不得写成「全绿」。
4. **文档同步**：对外行为变化（键盘承诺、空态文案、可调上限、默认分组、导出选项）同步 `AGENTS.md` 相关条目、`ADR-0002`、`README.md` 设置表、locale 资源与本表；本表每落地一项即登记提交哈希。
5. **不夹带**：过程中的新问题写进 §8 并另开条目，不在当前提交里顺手修（铁律 14）。
6. **不伪造**：无法运行的验证必须在「状态」列写明「未验证 + 原因 + 风险」。首轮文档落地时 `typecheck` / `style:check` / `build` / 三个浏览器门禁均未运行；批次 1 开工后 `typecheck`、静态门禁与图谱聚合测试已按条登记实测输出，批次收尾门禁（`test:unit` / `budget:check` / `e2e` / `e2e-visual` / `check-contrast`）已在「批次 1 收尾门禁」「批次 2 收尾门禁」与「批次 3 收尾门禁」登记实测数字；批次 3 那条唯一红点是 §3 已登记的负载敏感 flake，已单跑复核并如实标注，未写成「全绿」。`build` 未单独运行，由 `budget:check` 内含的构建覆盖。

---

## 8. 新增发现（待登记，本表落地过程中随时追加）

| 编号 | 现象 | 涉及文件 | 严重程度 | 归属批次 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| F-01 | 图谱物理在 53 个节点时 settle 要 ~7s，超出 `waitForStillGraphCanvas` 默认的 24 × 250ms；主题场景只用 `sum > 0` 判据，等不够也不会报红 | `scripts/e2e-visual.mjs`、`src/client/features/graph/graph-panel/canvas-draw.ts` | 低（门禁耐心，不是产品缺陷） | 批次 4 | 部分处理：`a2e7acc2` 给该 helper 加了 `attempts`/`stable`，走位场景用 80；主题场景仍用默认值（待批次 7 收尾时再看） |
