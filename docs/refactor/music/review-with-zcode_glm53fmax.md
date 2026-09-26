# 音乐库 UI 布局复审报告 · 重构项（ZCode · GLM-5.3-Flash · 2026-09-26）

> 范围：音乐库三个表面（Hub 主界面、沉浸式播放器、状态栏/浮窗）的布局与视觉密度问题。行为缺陷见 `docs/improvement/music/`，功能缺失见 `docs/features/music/`。
> 证据：用户提供的 2026-09-26 截图三张（红框标注）+ 代码定位。
> 配套执行计划：`docs/refactor/music/plan-with-zcode_glm53fmax.md`。
> 硬约束（AGENTS.md）：样式一律走设计令牌（`hardcoded:check`）；交互控件基于语义元素；弹窗焦点陷阱/ESC/焦点归还不回退（`check-contrast.mjs` 的 axe 面与 `e2e-visual.mjs` 的 `assertFullscreenToolbars` 必须保持绿）。

## REF-1 · Hub 窗口固定：无最大化、不可调宽高、不可拖动（截图①红框）

- 现状：音乐库是固定尺寸居中弹窗——`music-hub-modal.tsx:29` `HUB_WIDTH = 1240`，`:63` 高度写死 `h-[84vh] max-h-220`；头部（`:145-173` HubHeader）只有关闭按钮（窄屏多两个抽屉按钮）。
- 影响：大屏上白白浪费两侧空间，曲表列宽被压窄；用户无法把窗口拉到全屏浏览大曲库，也无法挪动/缩放窗口。
- 共享组件现状：`src/client/components/overlay/modal.tsx` 只有 `dialog | fullscreen` 两个 variant（`:22-27`），无最大化切换、无拖拽、无 resize；思维导图全屏走 `variant='fullscreen'` 是现成先例。
- 修复方向：REF-1a 头部加「最大化/还原」切换（dialog↔fullscreen 状态驱动，覆盖层内部切换不重挂载）；REF-1b 拖动移动 + 边缘调宽高（参考 `src/client/features/shell/resizer.tsx` 面板缩放先例与浮窗 `music-drag.tsx` 的指针拖拽 + `isClickAfterDrag` 经验；位置/尺寸进偏好持久化；保留焦点陷阱与键盘可达）。

## REF-2 · 工具栏排序控件文字换行（截图②红框①）

- 现状：排序 `Segmented` 的选项按钮在容器挤压下按字折行——「最近添加」折成「最近添/加」、「标题」折成「标/题」（截图②）。根因：`music-hub-toolbar.tsx:70` ToolbarActions 是 `flex items-center gap-2` 无换行/收合策略，外层（`:27-28`）虽 `flex-wrap` 但动作行整体是刚体；`src/client/components/form.tsx:308` 的 Segmented 按钮文字未 nowrap。
- 影响：控件高度参差、可读性差、触控目标变形。
- 修复方向：Segmented 选项文字 `whitespace-nowrap`（共享组件一次修对，全 app 受益）；ToolbarActions 拆行/收合策略——窄容器把低频动作（导入 M3U、元数据三个图标钮）收进「更多」菜单，排序控件保留原位。

## REF-3 · 移动端适配不足（用户口述 + 既有断点走查）

- 现状：<900px 有折叠体系（`music-utils.ts` MUSIC_NARROW_BREAKPOINT，侧栏/现在播放列折成 Drawer），但工具栏在窄屏仍是「搜索框+来源筛选+排序+上传+WebDAV+导入+3 个图标钮」全量平铺，按钮文字多行、触控目标变形；曲表来源/专辑列 `hidden xl:block`（`music-track-row.tsx:172,187`）在中间断点整体消失无替代信息。
- 修复方向：逐断点（≥1440 / 1240–1440 / 900–1240 / 640–900 / <640）走查三个表面，产出整改清单执行（控件收合优先级、Drawer 内布局、触控目标 ≥44px 逐项核对）。

## REF-4 · 字号偏小与密度/空白

- 现状：曲表主体文字大量使用 `--text-11`（11px：歌手/专辑/来源/时长列，`music-track-row.tsx:172,178,187,195,286`），行标题也仅 `--text-12.5`（`:282`）；网格卡片 `--text-12`/`--text-10`（`music-track-card.tsx:39,103`）。Hub 高 84vh，曲目少时中列大片空白，小字号放大了空旷感（截图①③）。
- 修复方向：曲表/卡片字号对照令牌基准上调一档（标题 ≥13、次要文字 ≥12，对齐应用正文基准）；行高/内边距随之核对 axe 对比度不回退；空态与「占用空间/总时长」汇总条的排布利用剩余空间，不新增无信息量的填充块。

## REF-5 · 沉浸层队列条常驻，遮挡/挤压歌词区（截图③红框②）

- 现状：`music-immersive-player.tsx:111-113` 队列是歌词下方常驻区块（`max-h-40 shrink-0 border-t`），总是占据底部约 160px；歌词滚动区被压短，长歌词需要两处滚动。
- 修复方向：队列改「可折叠」——默认收起为单行入口（对齐顶部 `queue_count` 按钮），展开时浮出或按需占位；当前曲在队列内的定位逻辑保留。

## REF-6 · 沉浸层快捷键提示常驻且换行（截图③红框①）

- 现状：`music-immersive-player.tsx:161` 直接渲染 `music.keyboard_hint` 长句（「空格播放或暂停，Alt+方向键快退快进十秒，Ctrl/⌘+方向键切换上一首/下一首」，`src/shared/locales/zh-CN/music.ts:206`），在左栏宽度下折成两行常驻。
- 修复方向：收进「键盘帮助」触发器（图标按钮 + 弹层，或折叠为单行可展开），避免常驻占位。

## 约束与回归基线

- 上述每个表面都被浏览器门禁覆盖：`scripts/e2e-visual.mjs`（工具栏稳定性 `assertFullscreenToolbars`、播放器/队列断言）与 `scripts/check-contrast.mjs`（外壳 axe 面）。重构不得回退既有断言；新增工具栏控件必须纳入对应断言与（如构成全屏表面）`scripts/check-surface-coverage.mjs` 名单。
- 全屏归属铁律：浏览器原生全屏只能由放映面板发起；音乐库「最大化」必须走应用内覆盖层尺寸切换（Modal variant），不得调用 `requestFullscreen`（`tests/fullscreen-policy.test.ts` 守卫）。
