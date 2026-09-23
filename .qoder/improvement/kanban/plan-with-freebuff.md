# 看板模块改进执行计划 · Freebuff 轮次

> 依据：`review-with-freebuff.md`（2026-09-22 复审台账，K-01…K-25）。
> 基线：`kanban-improvement-qoder-qwen38f`，HEAD `6c4a81ba`。
> 施工原则：逐项修复 → 先写能失败的复现测试 → 跑回归与门禁 → 单项提交（Conventional Commits，正文逐文件）→ **同一次提交内更新本文件进度日志**。
> 与旧计划的关系：`plan.md`（六批）已结案；本文件只承接 K-xx 增量，不重复旧条目。
> 每项收尾的验证命令见文末「固定验证」。

## 批次 1 · 止血（正确性 + 安全最小集）

- [x] K-01 单卡删除撤销提示（`toastWithUndo`，对齐批量删除与删视图）
- [x] K-02 删列撤销提示（受影响卡数进文案）
- [x] K-05 CSV 导出补 BOM（Windows Excel 非 ASCII 乱码）
- [x] K-06 CSV 导出公式注入前缀（OWASP 制表符方案，含全角变体）
- [x] K-07 封面/附件图片走外部图片策略 + `referrerpolicy`
- [x] K-08 文本附件预览补失败态（含 K-03 残留：已删对象的 404 与图像加载失败降级）
- [x] K-09 跨源附件不提供下载钮（改由新标签打开，判定正名为 `isCrossOriginUrl`）
- [x] K-10 上传体积预检（与服务端同一份限额常量；类型/配额按核实结论不预检）
- [x] K-03 附件删除改「确认 + 永久删除」语义（用户裁定，对齐笔记附件）
- [x] K-04 全屏期间实例失效自恢复（board 离开笔记时关闭覆盖层并说明）

## 批次 2 · 交互与移动

- [x] K-11 卡片「移动到…」菜单（分组/泳道两个子菜单，触屏长按即达）+ 移动快捷键由 Alt+方向键改绑 Shift+方向键（真机触屏验证未做，见 progress 行）
- [x] K-13 选择能力与批量字段
  - [x] K-13a 选择本组（列菜单勾选框）+ 选择当前视图全部（上下文菜单行）
  - [x] K-13b 批量标签/负责人/到期日（批量条新增一个菜单入口；字段写入保留选择）
- [x] K-14 附件「设为封面 / 移除封面」（详情面板接线；表格文件格不接，已登记取舍）
- [x] K-15 搜索筛选中 chip + 标签筛选归入视图状态（第三小项核实为不成立，改补护栏用例）
- [x] K-17 窄屏头部收敛与触控目标（`IconButton`；面板不被行裁剪已入测试）
- [x] K-25 覆盖层可访问名走 i18n（根因在 outline→JSON 升级时造的 `title: 'Kanban'`）

## 批次 3 · 视图完整度

- [x] K-12 时间线/甘特区间由数据推导 + 日/周/月缩放 + 「今天」 + 无日期单列
- [x] K-16 命令面板接入看板动作（新增卡片/切换视图/选择当前视图全部/清除选择/撤销/重做；卡片 roving tabindex 经复核不立项，见 review 条目）

## 批次 4 · 性能与门禁


- [x] K-19 writer 收进 `useCallback`（先写 locale 回归）+ 头部 props 收敛 + 列/卡链路上的临时闭包（复核时发现比台账写得更深）
- [x] K-21 `e2e-visual.mjs` 逐个打开 8 个视图并断言内容已到（+ 每个视图不改变顶栏高度；看板场景改按栅栏序号定位自己写的那块板）
- [x] K-20 写回成本确定性量测（结论：不是缺陷；自适应静默期实测后裁定不取，改为预算 + 契约测试，见 review 条目）
- [x] K-23/K-24 规范注释收敛（卡片容器豁免登记 + 两处 `!important` 理由）
- [x] K-26 收尾后修 `check-contrast`：导图全屏判不了的项按名放行（L-01 结案；门禁语义 + `AGENTS.md` 同段改写，不改产品代码）
- [x] K-30 无标签卡片的悬停行压住标题（用户报告）：行回到流内、画廊只浮在真封面上（含浏览器门禁的几何断言与 `gate-c` 无标签卡 fixture）
- [x] K-31 prose 对块内元素的排版主张漏进看板（用户指定）：canvas 基准字型 + 元素主张交还 + 标题字型上移包裹 + prose 复选框皮肤只归 task list（含门禁的八视图两处逐元素比对）

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-23 | K-31 prose 对块内元素的排版主张漏进看板（用户指定） | （本提交） | 先量后改：一次性探针在同一实例上把八个视图逐个在笔记与覆盖层两处读一遍、按元素路径逐属性比对，修前 `board 139 条差异`、`table 1`、`calendar 102`（根因：块在笔记里画在 prose 之内、在全屏里画在 prose 之外，而 prose 按元素声称且**未进层**，故元素自身的 utility 在笔记里一律输给 prose）。修法：① `.kanban-canvas` 声明看板基准字型（`--font-ui`/`--text-13`/`--ui-line`/`letter-spacing: normal`，`--ui-line` 为新令牌，body 与看板共用）；② `.ink-prose [data-kanban-canvas]` 内交还 prose 对块自身标记的元素主张（标题 margin/字号/字重/行高/字距/`position`、段落 margin 与 `text-wrap`、列表 margin/padding/`list-style`/`li`、`img` 装饰），快照（画在 canvas 旁）不受影响；③ 8 处标题的字号字重上移到包裹元素，卡片标题/描述间距改由包裹 `gap-1`（描述去掉 `mt-1`）；④ `.kanban-cover` 声明封面盒子（prose 的 `img { height: auto }` 是 utility 拿不回的一类）；⑤ prose 的 task-list 复选框皮肤改为 `.contains-task-list` 作用域（`prose/lists.css` 六条），看板自带复选框随之回到原生盒子。门禁化：`assertKanbanCanvasBase`（canvas 基准字型 = body 的，不写死数字）+ `readKanbanViewsInline`/`readKanbanViewStyles`/`assertKanbanViewParity`（与 `assertKanbanViews` 扫描合流，八视图两处逐元素比对，只比决定「怎么排字」的属性）；`pressKanbanView` 改为验证落点（`elementFromPoint` 确认指针在标签上，否则换 `block: start/center` 重试并报「谁在上面」，不盲点）。修后探针八视图全 0 差异；`e2e-visual` **252 passed / 0 failed**；变异自检：删掉标题交还块 → **249/3**，恰好 `board`/`calendar`/`gallery` 三个画标题的视图（`15.96px → 14px`、`margin-top 23.142px → 0px`，= `1.14em × 14px`、`1.65 × 14px`），恢复字节相同。`typecheck` ✅；全量 `test:unit` 290 文件 **2705** ✅；14 项静态门禁 ✅（白名单 689 文件 / 4743 条）|
| 2026-09-23 | K-30 悬停行不再压住卡片标题（用户报告） | （本提交） | 先量后改：覆盖层里无标签卡的行（`absolute inset-x-3 top-3`）与标题同起点 `38,157`，「标签」按钮压住标题 `42×19`；有标签卡无重叠；笔记内联预览因 `.ink-prose h3` 的 26.4px 上边距看不出重叠（覆盖层把卡片画在笔记之外）。门禁先写复现（fixture 加无标签卡 `gate-c`、`KANBAN_FIXTURE` 改为要求三张卡、新增 `assertKanbanRevealRows` 按 `group-hover/card:opacity-100` 找控件并在笔记/看板/画廊各量一遍）→ 跑红 3 条（看板 `62×19`、画廊 `14×4`、新卡标题的 axe `bgOverlap`）；修 `kanban-card.tsx`（行回流入 + 删 `overlayClass`）与 `kanban-gallery-view.tsx`（抽 `galleryCoverUrl`，只浮在有封面时）后 **243 passed / 0 failed**；覆盖层无标签卡 `270×45` → `270×75`，行 `absolute` → `static`，三处重叠归零。单元：`kanban-card.test.ts` 两条旧用例（钉住旧设计）改为新结构，变异还原旧写法恰好杀对应两条；kanban+preview+tests/kanban 100 文件 **1131** passed；typecheck ✅ |
| 2026-09-23 | K-26 `check-contrast` 转绿：L-01 结案（surface 自声明 unjudgeable） | （本提交） | 先按 L-01 复核证据定因（卡不是遮挡者；条目在卡打开/收起/文字改回可命中三种状态下同样出现；`messageKey='bgOverlap'`）；改法：`check-contrast.mjs` 删掉「参考卡=遮挡者」的假设与第二遍读，改由表面声明 `unjudgeable`（`id` + `messageKey` + 目标正则三重命中，理由/条数打印，不供其他表面继承），规则与分类器落在新增 `scripts/lib/axe-review.mjs`，`e2e-harness.mjs` 的 `runAxe` 摘要补 `key`，`AGENTS.md` 同段改写。验证：`check-contrast` **exit=0**（浅/深各 23 项 axe 检查 + 层级与 7 强调色量测 0 低于 AA；各 1 条 `color-contrast ×2 (bgOverlap)` 按名放行）；新增 `tests/axe-review.test.ts` 4 例（三重各自承重；全局三类不入规则；同文案不同 target 仍失败）；变异自检两侧共 4 次（门禁把 key 换掉即变红，2 例入 review；测试侧不看 key / 正则去 `$` / 一律放行分别杀 2、1、2 例），两处备份原样还原；`typecheck` ✅；14 项静态门禁 exit=0 ✅；`comments:check` 白名单重生成 687 文件 / 4695 条 ✅；全量 `test:unit` 290 文件 **2704** 测试 ✅ |
| 2026-09-22 | K-20 写回成本量测与裁定 | （本提交） | 先写三层自适应静默期方案并实测：连续 5 秒编辑从 1 次写回变 1～3 次、单手势滞写 0.5s→3s → 判定“用数据安全换写回次数”，**回退未入库**；改交付确定性量测（假时钟数写回次数：滑块 12 步 1 次、连攞 12 格 1 次、无变化 0 次、隔 700ms 的 6 个手势 6 次）+ 栅栏体积预算（200 卡 53,385 B，≈256 B/卡；断言 <64 KiB 与 <320 B/卡）；`write.test.ts` 6→11 例；kanban+preview+tests/kanban 100 文件 **1130** passed；`size:check` 拦下 83 行 describe → 拆三段（helper 提到模块级），未 resnapshot |
| 2026-09-22 | K-21 浏览器门禁逐个打开 8 个视图 | （本提交） | `ui/kanban-root.tsx` 新增 `data-kanban-view-type`（面板上标出当前视图，多个视图都画卡片，「有卡片」不足以证明是哪个视图画的）；脚本新增 `KANBAN_VIEWS` 清单与 `assertKanbanViews`（每个视图：点页签 → 断言 **该视图面板内**有它自己的东西 → 再断言顶栏高度不变）；fixture 补 startDate/endDate/progress 并改用相对今天的日期，卡片 id 改 `gate-a/gate-b`；看板场景改为「先按卡片标记找到自己写的那块板 → 记下栅栏序号 → 之后按序号读」（覆盖层是**借**走内联画布而不是拷贝，一打开卡片就离开块，标记就再也匹配不上了——这一条是实跑撞出来的）；顺带修掉两处原先会误伤的全局计数（画布数与 reserve 改为按自己那块板计）。变异自检：把日历视图改成返回 null，恰好只杀「日历视图自己画了东西」一条。浏览器门禁：**234 passed / 0 failed**（看板 37 条，其中新增 17 条） |
| 2026-09-22 | K-19 看板不再为一次局部变化重画全板 | （本提交） | 先写复现（`ui/kanban-repaint-scope.test.ts` 用 `memo` 包住真实卡片计数）：旧实现下「打开一张卡的详情」重画 3/3 张卡，修复后 0 张；三次变异逐一被杀（去掉 `useColumnCellHandlers` 的 `useMemo`、把 `handleMoveCell` 改回每渲染新建、把 `handleUpdateSubtasks` 改回每渲染新建——后者杀 3 例）；kanban+preview+command+tests/kanban 102 文件 **1132** passed；`size:check` 拦下三个超长文件 → 拆出 `ui/kanban-cell-handlers.ts`（列内处理器）/`ui/kanban-value-writes.ts`（单卡字段写入），均未 resnapshot；11 项静态门禁 exit=0；白名单 685 文件 / 4655 条；locale 回归按既有 `tests/kanban-locale-repaint-policy.test.ts` + `registry-locale`/`kanban-memo-locale` 未改仍绿 |
| 2026-09-22 | K-16 命令面板接入看板动作 | （本提交） | typecheck ✅；新增 15 例（注册表 4 + 真实看板 6 + 面板条目 5）；两次变异逐一被杀（`selectAllVisible` 改扫整份文档、注册表去掉归属判定各杀 1 例，后者靠补一张被过滤掉的卡片先收紧了断言）；`size:check` 拦下 89 行 describe → 拆两个 describe + 共享 fixture，未 resnapshot；kanban+features/command+preview+tests/kanban 101 文件 **1126** passed；12 项静态门禁 exit=0；白名单 682 文件 / 4637 条 |
| 2026-09-22 | K-13b 批量指派/加标签/设到期日 | （本提交） | typecheck ✅；新增 15 例（单元 6 + 批量条 6 + 渲染级接线 2 + 空集护栏 1）；三次变异逐一被杀（标签改覆盖而非并集、去掉去重守卫、指派写死列 id）；`size:check` 拦下 `useKanbanBatchEdits` 与两个 describe 超长 → 拆三个组合 hook + 拆 describe（并将 `handleBatchGroupChange` 一并收进 `kanban-batch-edits.ts`，空集不再空提交），未 resnapshot；kanban+preview+components 95 文件 **1085** passed；12 项静态门禁 exit=0；白名单 671 文件 / 4575 条 |
| 2026-09-22 | K-13a 选择本组 + 选择当前视图全部 | （本提交） | typecheck ✅；新增 11 例（渲染级 7 + 单元 4）；三次变异逐一被杀（本组 id 取错、可见集合换成整份文档（靠批量条计数断言补上）、列菜单不接 selectAll）；`size:check` 拦下 `kanban-root.tsx` 超 500 行 → 两个覆盖层拆到 `kanban-overlays.tsx`，未 resnapshot；kanban+preview+components 94 文件 **1070** passed（3 例 render-window 5s 超时属 L-03，单跑 14/14 ✅）；12 项静态门禁 exit=0；白名单 668 文件 / 4561 条；另修 `menu.tsx` 选中标记的可访问名污染，并登记 K-29（标签筛选浮层同一写法） |
| 2026-09-22 | K-12 时间线/甘特区间由数据推导 + 缩放 | （本提交） | 先写复现（旧实现在固定 ±7/21 天窗口下：早于窗口的条 `left = -3260`；晚于窗口的条右边缘 `4556` 对齐 1392 的网格）→ 两例红；实现后 `timeline-helpers.test.ts` 18 例 + 新增 `ui/kanban-timeline-view.test.ts` 7 例全绿；变异自检：把区间改回固定窗口恰好杀 5 例（含视图级“条被截断”断言）；kanban 74 文件 **985** passed；kanban+preview+components+tests/kanban 106 文件 **1155** passed；`size:check` 拦下 1 个生产函数（51 行）+ 2 个测试 describe → 抽出 `useTimelineViewState`（两视图共用）/拆 describe，未 resnapshot；12 项静态门禁 exit=0；白名单 677 文件 / 4621 条；浏览器门禁 216 passed / 0 failed（本机实例） |
| 2026-09-22 | K-17 窄屏头部尺寸与面板不被裁剪 | 401ee48a | typecheck ✅；`kanban-header.test.ts` 12 例（4 例新写）+ 变异自检（把搜索钮改回 `size-7` 恰好杀 2 例）；kanban+preview+tests/kanban 97 文件 **1092** passed；`size:check` 拦下 header 517 行 + 测试 77 行 describe → 抽 `kanban-fullscreen-title.tsx`（127 行）/拆 describe，未 resnapshot；12 项静态门禁 exit=0；白名单 673 文件 / 4589 条；浏览器门禁见下一条（本轮已能完整跑通） |
| 2026-09-22 | 浏览器门禁基线（本机首次跑通） | 下一提交 | `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` + `node scripts/e2e.mjs` 后 `node scripts/e2e-visual.mjs`：**216 passed / 0 failed**（含看板 24 条：覆盖层命名与单实例、表格语义与值编辑器命名、面板 a11y/axe 两遍、语言切换重绘、Escape 与焦点归还、**头部高度稳定 + 各切换控件不位移**，以及“无页面错误”）；`e2e.mjs` 175 passed / 1 failed，失败项为 `reindex cannot overwrite an editor write with a stale FTS row`（worker 侧 reindex 与编辑器写入的竞态，两个全新实例上两次同结果），与看板无关，登记为 L-04 不本批夹带。本机环境：`node_modules` 为软链 + `/usr/bin/google-chrome`，故后续条目按需直接跑浏览器门禁，不再以“无浏览器”为由跳过。
| 2026-09-22 | K-11 长按搬卡（移动到分组/泳道）+ 快捷键改绑 | （本提交） | typecheck ✅；新增 12 例（菜单 3 组 + 渲染级长按 6 例 + 护栏 2 例 + 选项轴 1 例）与 4 个旧助手改绑；三次变异逐一被杀（分组写入带泳道键、换泳道不回显分组、去掉 shift/田输入护栏）；`size:check` 拦下 3 个超长 describe + `kanban-root-hooks.ts` 548 行 → 拆 describe + 抽出 `kanban-move-to-axes.ts`，未 resnapshot；kanban+preview 85 文件 **1012** passed；12 项静态门禁 exit=0；白名单 666 文件 / 4543 条；遗留：真机触屏未验证（本机无触屏设备） |
| 2026-09-22 | 建立本轮台账与执行计划 | 0e2d673a | 文档提交，无代码改动 |
| 2026-09-22 | K-01 单卡删除撤销提示 | 66156734 | typecheck ✅；kanban+preview+tests/kanban 94 文件 1002 passed（3 例 `kanban-render-window` 5s 超时属 L-03 并发抖动，单跑 14/14 ✅）；`comments:check` 重算白名单 655 文件 / 4460 条 |
| 2026-09-22 | K-02 删列撤销提示（分组口径） | （本提交） | typecheck ✅；kanban+preview+tests/kanban 94 文件 1008 passed（首跑 1 例 render-window 超时属 L-03，重跑全绿）；`size:check`/`i18n:check` ✅；白名单 656 文件 / 4464 条 |
| 2026-09-22 | K-03 附件删除确认 + 永久删除语义 | c3f72b4a | typecheck ✅；kanban+preview+tests/kanban 88 文件 992 passed；`size:check`/`i18n:check`/`style:check`/`hardcoded:check` ✅；白名单 657 文件 / 4467 条；pre-commit 全量 test:unit 1443 passed |
| 2026-09-22 | K-05 CSV 导出补 BOM | 5e984d32 | typecheck ✅；kanban+preview+tests/kanban 88 文件 994 passed；`size:check`/`comments:check` ✅；白名单 657 文件 / 4470 条 |
| 2026-09-22 | K-15 搜索筛选可见性与标签筛选口径 | （本提交） | typecheck ✅；+6 例（4 先红 + 2 护栏）+ 1 例旧断言改写；kanban+preview+tests/kanban 95 文件 **1050** passed；`size:check` 拦下生产与测试各 1 处超长函数→拆解未 resnapshot；13 项静态门禁 exit=0；白名单 664 文件 / 4527 条 |
| 2026-09-22 | K-14 封面可设可移 | 8a011040 | typecheck ✅；+3 例（2 先红 + 1 护栏）；kanban+preview+tests/kanban 95 文件 **1044** passed；`size:check` 拦下生产 54 行 + 测试 57 行 → 各拆而未 resnapshot；13 项静态门禁 exit=0；白名单 664 文件 / 4514 条 |
| 2026-09-22 | K-23/K-24 规范注释收敛 | 0e94ba65 | 注释型改动（无行为）；typecheck ✅；`comments:check` 重算白名单 664 文件 / 4517 条；无需新增测试（无行为变化） |
| 2026-09-22 | K-25 无标题看板不再自带英文名 | fbff8163 | typecheck ✅；+2 例（1 先红）+ 1 例旧断言改写（旧断言恰在钉旧行为）；kanban+preview+tests/kanban 95 文件 **1041** passed；13 项静态门禁 exit=0；白名单 663 文件 / 4507 条 |
| 2026-09-22 | K-04 全屏期间板子离开笔记的自恢复 | 9dd74c76 | typecheck ✅；新增 4 例（3 先红 + 1 护栏）+ 变异自检（去 disposed 守卫恰好杀 1 例）；`size:check` 拦下 67 行 describe → 拆三组而非 resnapshot；kanban+preview+tests/kanban 95 文件 **1039** passed；13 项静态门禁 exit=0；白名单 662 文件（第一次 4498 条，拆 describe 后重算 4496）；批次 1（止血与安全）全部结案 |
| 2026-09-22 | K-10 上传体积预检 | 30f3f9c3 | typecheck ✅；新增 3 例 + 变异自检（改判据恰好杀这 2 例）；`size:check` 拦下变长函数→拆助手而非 resnapshot；kanban+preview+tests/kanban 94 文件 **1035** passed；13 项静态门禁 exit=0；白名单 660 文件 / 4486 条 |
| 2026-09-22 | K-09 跨源附件不再抢走应用标签页 | 789a61ac | typecheck ✅；新增 1 例先红后绿；`renderer.test.ts`+画廊 39 例同跑绿证明正名无行为漂移；kanban+preview+tests/kanban 94 文件 **1032** passed；13 项静态门禁 exit=0；白名单 660 文件 / 4482 条 |
| 2026-09-22 | K-08 文本附件预览失败态 + 已删对象降级 | c06bcb0e | typecheck ✅；新增 6 例先红后绿；kanban+preview+tests/kanban 94 文件 **1030** passed；`size:check` 拦下 3 处超长函数（生产 1 / 测试 2）并拆解而非 resnapshot；13 项静态门禁 exit=0；白名单 660 文件 / 4479 条 |
| 2026-09-22 | K-07 封面/附件图片服从外部图片策略 | 992bca0d | typecheck ✅；新增用例先红 5 例后绿；kanban+preview+tests/kanban 94 文件 **1024** passed；`renderer.test.ts` 32 例未改仍绿；13 项静态门禁 exit=0（含 `deep-imports`：新叶模块无 index 遮蔽）；白名单 659 文件 / 4475 条；另登记 K-28（笔记附件预览图像同类问题，跨模块） |
| 2026-09-22 | K-06 CSV 导出公式注入防护 | 029f99a0 | typecheck ✅；`csv.test.ts`+`kanban-csv.test.ts` 53 passed（本线程独立复跑）；kanban+preview+tests/kanban 88 文件 997 passed；`size:check`/`comments:check`/`i18n:check`/`hardcoded:check` ✅；白名单 657 文件 / 4473 条；同时登记 K-27（分享访问日志 CSV 同类问题，跨模块） |

> **并发写者交接（2026-09-22）**：本轮清单一度由第二个 Freebuff 线程（作者 `lgf5090`）在同一工作区并行施工，它已提交 K-02（`11dc3fca`）、K-03（`c3f72b4a`）、K-05（`5e984d32`），其中 `11dc3fca` 夹带了本线程**未完成的** K-02 在途改动（`useKanbanGroupDeletion`/`dataRef` 守卫/`kanban_view-state.test.ts` 三例/`kanban_group_deleted` 双语键）。用户裁定由本线程接管全部剩余条目后：
> 1. 本线程把 K-06 的**在途代码**（`csv.ts`/`csv.test.ts`，作者为并行线程）独立复核（跑测试 + 逐条核 OWASP 方案与往返不变形）后接收并提交，未改动其实现；
> 2. 此后所有条目由本线程串行施工，每次提交前先 `git status` 确认工作区无他人未完成改动；
> 3. 共享文件 `scripts/check-comments.mjs` 只按当前树重算（`sync-comments-allowlist.mjs`），不夹带在途注释；
> 4. 遗留：K-02 的 commit 号归并行线程，其 plan 行以 `（本提交）` 收尾，本线程不再回填（避免改动他人在途文档）。

## 固定验证

```bash
npm run typecheck && npm run test:unit
npm run comments:check && npm run i18n:check && npm run hardcoded:check
npm run tokens:check && npm run size:check && npm run surfaces:check
npm run test:e2e && npm run contrast:check      # 需本地实例，按条目决定是否进本批
node scripts/check-token-drift.mjs --update-baseline   # 仅当动共享令牌
```
