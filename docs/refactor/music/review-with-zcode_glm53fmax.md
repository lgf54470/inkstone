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

## REF-7 · 折叠断点读视口而非容器，宽屏区间收合不触发（REF-2 残留）

- 现状：`music-hub-toolbar.tsx:75` 用 `useMediaQuery('(min-width: 1240px)')`（`src/client/lib/hooks.ts:13` 走 `window.matchMedia`，即**视口**宽度）决定低频动作是否折叠；而工具栏真实容器是 Hub 中列 = `HUB_WIDTH 1240 − 侧栏 224 − 正在播放 256 ≈ 760px`（`music-hub-modal.tsx:32-37`）。
- 影响：视口 1240–1600px 的常见笔记本上 `folded === false`，刚体行塞进 760px；REF-2 的「更多」菜单在这些宽度**根本不会触发**，截图②红框①的挤压/换行原样存在。同理 `MUSIC_NARROW_BREAKPOINT`（900px，视口）判断侧栏折叠时也未考虑中列真实宽度。
- 修复方向：折叠判定改为测**容器**宽度（ResizeObserver 或 Hub 内传递的中列宽度），断点按中列可用像素重算；`useMediaQuery` 仅保留给沉浸层等真正的视口级布局。

## REF-8 · 底部传输条刚体一行，无收合策略（中列 ~760px 必然溢出）

- 现状：`music-player-controls.tsx:29-58` 是 `flex h-16 shrink-0 items-center gap-3`，左 `TrackSummary` 固定 `w-52`（208px，`:67`）、右 9 个控件含 `MusicVolumeSlider className='w-36'`（144px，`:41`），中间播放钮 + SeekBar 被两头挤压；无 `flex-wrap`、无折叠分支、无任何窄容器降级。
- 影响：中列 760px 时 SeekBar 退化为几十像素，进度无法拖；窄屏（Hub 宽 = 视口宽）该行横向溢出。
- 修复方向：按容器宽度分级——宽态保留整行；中态收起音量滑块为按钮弹层、TrackSummary 收窄；窄态只保留封面 + 标题 + 播放/下一曲 + 进度，其余进「更多」；触控目标 ≥44px。

## REF-9 · Hub 在移动端/横屏仍是 84vh 居中，内容区被固定条挤没

- 现状：`music-hub-modal.tsx:66` `h-[84vh] max-h-220`，`min-h-145` 仅宽屏生效（窄屏 `min-h-0`）；头部 `h-11`（:164）、工具栏（:34）、传输条 `h-16`（:29）均为 `shrink-0`。
- 影响：横屏 640×360 → 84vh ≈ 302px，三条固定区占约 148px，曲表仅剩 ~154px；竖屏移动端 Hub 悬浮居中而不是贴底全屏 sheet，与项目其他移动面板（Modal `items-end` + 圆角上沿）不一致。
- 修复方向：窄屏/矮视口改全屏 sheet（`100dvh` 或 `h-full`，贴底、圆角上沿），并给内容区设最小高度预算；高度不足时优先牺牲工具栏与传输条的装饰性控件。

## REF-10 · 沉浸层同样固定尺寸且无最大化，左栏占比过大

- 现状：`music-immersive-player.tsx:28` `IMMERSIVE_WIDTH = 1000`、`:62` `h-[86vh]` 写死，无最大化/还原入口（只有 `:178` 的关闭钮）；`:273` 左栏 `w-96`（384px）固定，窄于 `MUSIC_NARROW_BREAKPOINT`(900) 才切 `stacked`。
- 影响：视口 900–1100px 时左栏硬占 38%，歌词区只剩约 600px；大屏上沉浸层两侧同样留白，且「沉浸」语义下不是全屏。
- 修复方向：把 REF-1a 的最大化能力复用到沉浸层（同一尺寸偏好/同一入口语义），左栏宽度改为随容器收放（`clamp`/flex 比例），并与 REF-3 的断点走查合并验收。

## REF-11 · Hub 队列浮层遮挡曲表底部，高度写死

- 现状：`music-queue-panel.tsx:13` `absolute inset-x-0 bottom-0` + `max-h-72`，浮在中列内容之上，遮住曲表最后若干行；高度不可调，只能开/关。
- 影响：打开队列后看不到列表尾部，长队列与短列表都只能二选一；与「布局多余空白」相反地制造了压迫感。
- 修复方向：高度可调（拖动手柄或三档切换），或默认半高并让曲表 `padding-bottom` 随浮层高度避让；键盘可达 + 焦点不越出浮层。

## REF-12 · 字号基线覆盖面偏窄（补 REF-4 范围）

- 现状：REF-4 只点名曲表/卡片，但同类小字同样存在于——传输条标题 `--text-12` / 副标题 `--text-11`（`music-player-controls.tsx:70,73`）、沉浸层文件信息与快捷键 `--text-10`（`music-immersive-player.tsx:244-248`）、队列浮层标题 `--text-12`（`music-queue-panel.tsx:15`）。
- 修复方向：REF-4 一并收敛这些表面的 `--text-10/11` 到 ≥12，避免同一屏出现三档字号基线。

## 约束与回归基线

- 上述每个表面都被浏览器门禁覆盖：`scripts/e2e-visual.mjs`（工具栏稳定性 `assertFullscreenToolbars`、播放器/队列断言）与 `scripts/check-contrast.mjs`（外壳 axe 面）。重构不得回退既有断言；新增工具栏控件必须纳入对应断言与（如构成全屏表面）`scripts/check-surface-coverage.mjs` 名单。
- 全屏归属铁律：浏览器原生全屏只能由放映面板发起；音乐库「最大化」必须走应用内覆盖层尺寸切换（Modal variant），不得调用 `requestFullscreen`（`tests/fullscreen-policy.test.ts` 守卫）。
