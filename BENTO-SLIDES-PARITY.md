# bento-slides 功能对照（parity ledger）

官方基准：`bento/slides` **v1.2.0**，commit `986fd53`（2026-09-16），本地参考检出 `/home/kubuntu/projects/reference/bento`。
本仓库形态：笔记里的 `bento-slides` / `ppt` / `slides` 围栏块（围栏正文是用户自己的文档，编辑后整体写回）。

本文件是这张对照表的**唯一出处**：每一项都写明状态、守卫它的测试或门禁、以及落地它的提交。新增能力必须同时补上守卫，否则下一次改动会把它悄悄拿掉。

---

## 一、已完成，且有回归守卫

| 能力 | 守卫 | 提交 |
| --- | --- | --- |
| 解析 → 编辑 → 写回无损（`present`/`assets`/`fonts`/`layouts`/`docId`/`modified`/`meta`/主题调色板/未知键） | `body.test.ts`（含官方形状第二页）、`tests/slides-interop.test.ts` | 既有 + `cd47be86` |
| 大纲体写回有损防护（写不进去的内容改走 JSON 体并提示） | `write.test.ts`、`outline.test.ts` | 既有 |
| HTML / SVG / 粘贴净化，且净化调用必须在注入表达式内 | `sanitize.test.ts`、`tests/slides-sanitize-policy.test.ts` | 既有 + `6e55f34b`（见下） |
| 顶栏保存 / 共享 / 设置 / 帮助接线与脏点 | `slides-topbar.test.ts`、`copy-link.test.ts` | 既有 |
| `doc.present` 全量生效（页码、进度、角落箭头、为隐藏页编号） | `slides-presenter.test.ts` | 既有 |
| 页面尺寸单一坐标系（缩略图 / 内联 / 放映 / 编辑同用 `doc.size`） | `page.test.ts`、`canvas-helpers.test.ts` | 既有 |
| 九种内置版式选择器 + `applyLayout` 角色搬运 | `layouts.test.ts`、`slides-dialogs.test.ts` | 既有 |
| 元素 / 幻灯片 / 空白三处右键菜单 | `slides-context-menu.test.ts` | 既有 |
| 代码语法高亮与 `theme.codePalette` | `code-block.test.ts`、`code-palette.test.ts` | 既有 |
| 图表 preset（bar/line/pie/scatter）与 `chartPalette` | `chart-block.test.ts`、`chart-geometry.test.ts` | 既有 |
| 媒体元素（video/audio）、来源白名单、自动播放遵守 reduced-motion 且自行静音 | `media.test.ts`、`media-block.test.ts` | `645d1eb7` |
| 嵌入元素（文件自带 view 绘制、地址只作新标签页链接） | `embed.test.ts`、`embed-block.test.ts` | `906ac9ba` |
| `path` 形状按自带 `d` 与 `pathBox` 绘制 | `shape-path.test.ts`、`element-renderer.test.ts` | `f473a62d` |
| 图片裁剪（cover + x/y/scale）、文本渐变与描边、元素 blur/blend/backdropFilter、空框占位符 | `crop.test.ts`、`element-renderer.test.ts` | `859c3f3a` |
| 不认识的元素/几何显示占位并告警，不再静默消失 | `element-renderer.test.ts` | `b67a1cd8` |
| 官方 1.2.0 形状文档的互操作回归（字段可读、往返无损、每个元素都画出东西） | `tests/slides-interop.test.ts` | `4ad2a7f5` |
| 侧栏拖拽重排（`order.ts` 纯函数 + 两个宿主接线） | `order.test.ts`、`slides-sidebar.test.ts` | `937ebe03` |
| 插入图片：本地选文件 → 优化 → 附件上传 → 按原图比例落框；取消/过大/上传失败/目标页已删各有提示 | `image-asset.test.ts`、`ui/insert-image.test.ts`、`ui/pick-image.test.ts`、`ui/element-factories.test.ts` | `5906a1ea` |
| 导出 PDF：顶栏打印入口可用；每页按 `doc.size` 1:1 离屏排版（`inert` + `aria-hidden`），图片/字体落定后开打印框，`afterprint` 收尾；全页隐藏时提示而不开空打印框 | `flow.test.ts`、`ui/slides-print.test.ts`、`ui/slides-topbar.test.ts` | `5012ff15` |
| 「放映与打印走哪几页」单一出处（`audienceSlides`，隐藏页既不上屏也不上纸） | `flow.test.ts`、`ui/slides-presenter.test.ts` | `5012ff15` |
| 系统剪贴板四路：元素（跨笔记的纯文本载荷、asset 一并走）、图片（粘贴进同一条附件上传路）、文本（转义成文本框）、整页 | `clipboard.test.ts`、`edits.test.ts`、`ui/use-slides-editing.test.ts`、`ui/slides-context-menu.test.ts` | `f72b7af2`、`3386f261` |
| 编辑器键盘：⌘C/⌘X/⌘V、⌘D 复制、Delete、方向键平移（⇧ 十像素）、⌘±/0 缩放；没有任何可微移的对象时 ←/→ 翻页（端头交还浏览器）；`F5` 放映、`⌘S` 保存、`?` 帮助；有高亮选区时把剪贴板还给浏览器 | `ui/use-slides-editing.test.ts` | `f72b7af2`、`3386f261`、`f624df05` |
| ⌘Z/⌘⇧Z 的历史键监听（`⌘Z` 归它而不是浏览器；输入框内让位） | `history.test.ts` | `f624df05` |
| 就地编辑文本框（双击进入、失焦提交、提交前净化；输入框内键盘与剪贴板让位） | `ui/slides-inplace-edit.test.ts`、`ui/use-slides-editing.test.ts` | `f72b7af2` |
| 放映的页面过渡（按 `transition` 画入场，`morph` 明说不画——避免把静态快照冒充变形） | `ui/slides-presenter.test.ts`、`ui/slides-dialogs.test.ts` | `0e77af38` |
| 多选与框选：⌘/⇧ 点击增删选中、背景按下拖出橡皮筋（满页背景层不被框选、未移动的按下仍是清选）、手柄只给主元素（末位选中的那个），删除/微移/⌘D 对整组生效 | `ui/slides-selection.test.ts`、`ui/canvas-helpers.test.ts` | `90c3d749` |
| 整组拖动：一次拖动的每个事件都按起点解算，整组因此不会越拖越歪；右键已在选中集合内的元素保留整组选择 | `ui/slides-selection.test.ts`、`edits.test.ts`（`placeElements`） | `90c3d749` |

> `6e55f34b` 是工作区里既有的在途改动（代码块净化移到渲染处），提交前只补了缺失的白名单条目——它的缺失会让仓库级 `comments:check` 为红、pre-commit 钩子拦下所有提交。

---

## 二、尚未对齐（按实施阶段）

### P2 编辑器核心

- 吸附与参考线、空格/中键平移、适合窗口（fit）——多选与框选已在上表。框选按轴对齐的包围盒取交集，旋转不折入；右键菜单的元素行仍只作用于被右键的那一个盒子。
- 图层真·置顶/置底已具备（`inspector-layers.tsx` 调 `reorderElement`）；图层列表内的拖拽排序仍缺。
- 右侧面板分区补齐：排版（字族/行高/字距）、填充与描边、图片（fit/圆角/裁剪）、图表数据与表格联动、表格就地编辑、媒体源与播放、代码语言与主题、嵌入、效果、放映、布局、备注、交互。
- 评论线程（元素/点/整页锚点、回复、已解决；仅编辑器可见，不进放映与打印）。
- 顶栏测量式折叠与手机端 Insert/More 菜单。
- 快捷键收口（剩余）：`[`/`]` 面板开关、`⌘G` 成组、`c` 评论模式尚未接线——成组与评论模式本身也还没有实现，所以帮助弹窗暂不列它们。

### P3 放映

- morph（按 `morphId ?? id` 配对；页面过渡已做，见上表）、元素入场与交错、`countUp`、`kenburns`、`fx.loop`（motion-path / dash-march）。
- `fx.step` 逐条显示：→ 逐条、← 回收、画布上的顺序徽标、右键菜单的真实行为。
- 演讲者独立窗口（笔记 / 计时 / 当前与下一页预览 / `G` 全览 / 被拦截时的降级）。
- 激光笔、黑屏、减少动画、元素 `link` 跳转、`stateOf` 状态页导航、`hover{focusGroup|reveal}`、`{{page}}/{{date}}` 字段。`stateOf` 落地前，`audienceSlides`（`flow.ts`）刻意不把它移出线性流：没有状态导航时移出会让那些内容无处可达；两份过滤在同一处，改的时候一次改完。
- 触屏手势（点击/滑动翻页、双指缩放、长按菜单）。

### P4 输出

- 逐页 PNG/SVG 导出 + zip 打包（PDF 已走浏览器打印管线，见上表；栅格化可直接复用 `features/presentation/deck-image.ts`）。
- `.bento.html` / `.bento.json` 导出与导入（含官方文件），导入时给出 findings。
- 版本历史 / 恢复（与笔记历史、IndexedDB 快照打通）。

### P5 协作与广播（须先出 ADR）

- 实时共同编辑、在场头像、只读观看、放映广播与观众跟随、观众副本导出与失效。
- **必须基于 Inkstone 自己的实时栈（SyncHub Durable Object、笔记同步、share、MCP）重新设计**，不照搬 bento-sync 的中继协议与角色模型。

### P6 工具与治理

- compact 输入形式（agent 友好：省略默认值、`layout` 槽位、自动量高与重排、drop 报告）。
- `validate()`（未知键、文本溢出、出界、永不触发的效果、坏链接/坏 asset 引用）、`measure()`、发布用 JSON Schema。
- 把 bento-slides 全屏表面加入 `scripts/e2e-visual.mjs` 的逐表面工具栏扫描与 `scripts/check-surface-coverage.mjs` 名单（现在只被 `modal.tsx` 的思维导图断言间接覆盖），并补 axe 场景：右键菜单、版式选择器、演讲者窗口、帮助与设置弹窗。
- 收口 `slides.*` 里仍未接线的文案键（如字体/行高/字距、真·置顶置底、主题预设）。

---

## 三、有意偏离（不照搬，需评审确认）

| 官方行为 | 本仓库的选择 | 原因 |
| --- | --- | --- |
| `embed` 的 `live` 视图在页面内跑 iframe | 只画文件自带的 `view`；地址作为新标签页链接 | 笔记里运行他人脚本等于把笔记的源交给对方 |
| 9 种界面语言 + 语言包 | en-US / zh-CN，按本项目 i18n 现状 | 与应用其余部分共用同一套资源与门禁 |
| 自更新、密码信封加密文件、单文件应用外壳 | 不做（导出形态在 P4 决策） | 块活在笔记里，文件级能力由 Inkstone 的分享/备份/实时栈承担 |
| 媒体自动播放 | 遵守 `prefers-reduced-motion`，且自动播放一律静音 | 读者偏好优先；浏览器只允许静音自发播放 |
| charts-lite 的 `option` 图表（数据可来自表格） | 仅 `preset`/`data` 路径已绘制 | `option` 图表的引擎与表格联动属 P2 面板项 |

---

## 四、验证

```bash
npm run typecheck                       # tsc -b（client / worker / node 三项目）
npm run test:unit                       # Vitest 双工程；slides 相关在 jsdom 工程
npm run comments:check                  # 新增注释必须随提交登记
npm run size:check                      # 单文件 ≤500 行、单函数 ≤50 行、嵌套 ≤3
npm run i18n:check                      # en-US / zh-CN 键一致
npm run hardcoded:check                 # 视觉字面量走设计令牌
npm run --silent escape:check empty-catch:check module-state:check deep-imports:check
```

浏览器门禁（对全新本地实例，`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`）：`npm run test:e2e`、`node scripts/e2e-visual.mjs`、`npm run contrast:check`。
