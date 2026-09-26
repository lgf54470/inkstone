# 音乐库 UI 重构执行计划（ZCode · GLM-5.3-Flash · 2026-09）

> 依据：`docs/refactor/music/review-with-zcode_glm53fmax.md`（2026-09-26 复审，截图红框①②③）。
> 分支：`dev` 直接逐项提交。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**（jsdom 断言类名契约/DOM 结构，几何与视觉由浏览器门禁兜底），实现后跑回归再提交，**提交后立刻更新本文件**。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 硬约束：不调 `requestFullscreen`（`tests/fullscreen-policy.test.ts`）；样式走令牌（`hardcoded:check`）；焦点陷阱/ESC/焦点归还不回退；新工具栏控件纳入 `assertFullscreenToolbars` 与 axe 断言；注释改动后 `node scripts/sync-comments-allowlist.mjs`。

## 批次 R① · 速修（S，先做）

- [x] REF-2 排序/来源 Segmented 文字不折行：共享 `Segmented`（`src/client/components/form.tsx`）选项按钮补 `whitespace-nowrap`；`music-hub-toolbar.tsx` ToolbarActions 补换行/收合策略（窄容器把低频动作收进「更多」菜单）——**commit `b830b8fd`**
  - ⚠️ 残留（转 REF-7）：折叠判定读的是视口宽度（`useMediaQuery`），而容器是中列 ~760px，视口 1240–1600px 区间收合不触发。
- [x] REF-7 **折叠判定改测容器宽度**：`music-hub-toolbar.tsx` 的 fold 判定从 `useMediaQuery(1240px)` 改为容器宽度（ResizeObserver / Hub 传入中列宽），断点按中列可用像素重算；`MUSIC_NARROW_BREAKPOINT` 的侧栏折叠同理核对 —— **commit `f9641ae3`**
- [ ] REF-6 沉浸层快捷键提示收进帮助触发器（图标 + 弹层），移除常驻两行文案
- [ ] REF-5 沉浸层队列改可折叠：默认收起为单行入口，展开浮出；保留当前曲定位断言

## 批次 R② · 窗口化与密度（M）

- [ ] REF-8 底部传输条分级收合：宽态整行 / 中态收音量滑块为弹层 + TrackSummary 收窄 / 窄态仅封面+标题+播放+进度，其余进「更多」；触控目标 ≥44px
- [ ] REF-9 Hub 移动/矮视口改全屏 sheet：窄屏用 `100dvh` 贴底 sheet 替代 84vh 居中，给内容区最小高度预算，高度不足时先牺牲装饰控件
- [ ] REF-1a Hub 最大化/还原：头部加最大化切换按钮，dialog↔fullscreen 状态驱动（复用 `modal.tsx` variant 能力，覆盖层内切换不重挂载；尺寸状态进偏好持久化；e2e-visual 补「最大化后工具栏高度稳定」断言）
- [ ] REF-10 沉浸层复用最大化 + 左栏宽度随容器收放（`IMMERSIVE_WIDTH=1000`/`w-96` 不再写死单一值）
- [ ] REF-4 字号与密度上调：曲表 `--text-11` 主体升一档、标题 ≥13、卡片同步；空态/汇总条利用剩余空间；axe 对比度复跑
- [ ] REF-12 补 REF-4 范围：传输条 `--text-12/11`、沉浸层文件信息 `--text-10`、队列浮层标题同步收敛到 ≥12（同屏不出现三档基线）
- [ ] REF-11 Hub 队列浮层高度可调（拖动手柄或三档）+ 曲表底部避让，键盘可达
- [ ] REF-3 移动端逐断点整改：走查 ≥1440 / 1240–1440 / 900–1240 / 640–900 / <640 五档三个表面，按清单收合控件、修触控目标与 Drawer 内布局（含 REF-8/REF-9 结果复核）

## 批次 R③ · 拖动与缩放（M–L，最后做）

- [ ] REF-1b Hub 可拖动移动 + 边缘调宽高：参考 `shell/resizer.tsx` 与 `music-drag.tsx` 既有指针拖拽实现（含 `isClickAfterDrag`），Modal 增加窗口化能力或音乐库专用窗口壳；位置/尺寸持久化；键盘可达（方向键微调）与焦点陷阱保持；`surfaces:check` 名单核对

## 每项验收标准（通用）

1. 复现测试先红（jsdom：类名/DOM 结构/aria 契约），实现后该测试绿
2. music 全量单测绿 + `npm run typecheck` + 12 项静态门禁绿
3. 每个触及 Hub/沉浸层/工具栏的条目：`scripts/e2e-visual.mjs` + `scripts/check-contrast.mjs` 对本地 `dev:kv` 实例全绿（含既有 380 条断言不回退）；不可跑时写「已知限制」并在有实例环境补跑
4. 新增用户可见文案双语（`npm run i18n:check`）；不夹带无关重构

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-27 | REF-7 折叠判定改按容器宽度（REF-2 根因残留） | `f9641ae3` | 先红 2 例（容器窄/视口宽应折叠、容器宽/视口窄应展开）；实现后 5 例 ✅（含 REF-2 既有 3 例）；typecheck ✅；music 目录 101 文件 / 685 例 ✅（另一次目录级跑出现 5 例失败，单独复跑与二次目录级跑均全绿，判定为并发 flaky，与改动无关）；静态门禁 12 项 ✅；`size:check` 首次因 `ToolbarActions` 超 50 行报 baseline drift，改为拆出 `useActionsFolded` + `PrimaryActions` 而非改基线，复跑 ✅ | 折叠阈值 `MUSIC_TOOLBAR_INLINE_MIN_WIDTH = 1040`（容器像素，约等于整行不折所需宽度）；无 ResizeObserver 的环境（jsdom/SSR）保留 `MUSIC_TOOLBAR_VIEWPORT_FALLBACK = 1240` 视口回退，旧测试契约不变；Hub 默认 1240 宽时中列 ~760px → 低频动作进「更多」菜单，最大化后自动展开（此项为 REF-1a 铺路）。`budget:check` 的 music chunk 超限经 HEAD 基线对照确认为既有问题（108.9/98.0 KiB vs 93.8 KiB），非本次引入 |
| 2026-09-27 | REF-2 Segmented 不折行 + 工具栏收合策略 | `b830b8fd` | 先红 4 例（nowrap 契约 1 + 折叠行为 3）；实现后 6 例 ✅；全量 521 文件 / 4619 例 ✅；typecheck ✅；静态门禁 ✅；浏览器门禁（触及工具栏）：e2e 177 ✅（全新实例单跑一次）、e2e-visual 534/535（唯一失败为已登记看板遗留，同参 canvas:480/needed:456）、check-contrast ✅ | Segmented 选项按钮 `whitespace-nowrap`（共享组件一次修对，全 app 的 Segmented 受益）；ToolbarActions 在 <1240px（MUSIC_TOOLBAR_FOLD_BREAKPOINT，与 Hub 弹窗最大宽度一致）把低频动作折进「更多」菜单——导入 M3U/文本/URL 与元数据三图标钮共 6 项，主流程（上传/WebDAV/Alist/播客/刷新）与排序控件保留原位；M3U 的隐藏 file input 上提 ToolbarActions 统一供宽/窄两态触发，宽态行内按钮改为纯触发器；元数据三动作抽 useMetadataActions hook 供图标钮与菜单项两态复用（禁用态/运行脉冲/force 确认弹窗全保留）；文本/URL 导入对话框导出复用，窄态由工具栏直接控制开关 |
