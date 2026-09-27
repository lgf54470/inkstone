# 音乐库整改执行计划（Freebuff · 2026-09-27）

> 依据：`docs/improvement/music/review-with-freebuff.md`（完整复审报告，38 项问题 + 对标缺失功能总表）。
> 分支：`dev` 直接逐项提交。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**（jsdom 契约或 worker 契约，几何 / 视觉类由浏览器门禁先红），实现后跑回归再提交。
> **每次提交都必须更新本文件**（勾选、commit 短哈希、进度日志一行）；发现新问题或结论变化时同步更新 review 文档；批次末一次 `docs(music)` 提交统一回填短哈希。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 门禁备注：新增 / 修改注释后必须 `node scripts/sync-comments-allowlist.mjs`（双向失败）；UI 与几何改动用 `scripts/e2e-visual.mjs` / `scripts/check-contrast.mjs`（`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` + `INKSTONE_CHROME_PATH`）；`git add` 只列本次文件，不用 `-A`。

> hash 回填约定：提交无法写入自己的短哈希，因此每条进度行的 hash 在**下一个提交**里回填（每次提交都更新本文件不变）。

## M0 · 文档基线

- [x] M0 写入 `review-with-freebuff.md`（完整报告）与 `plan-with-freebuff.md`（本跟踪表）—— **commit `fac9b655`**

## M① · P0/P1 可用性

- [x] M1 FB-F2 在线结果开关触发搜索 + 关闭 / 加载 / 无匹配 / 全源失败四态文案 —— **commit `23bd2805`**
- [x] M2 FB-F6 + FB-C1 + FB-C2 + FB-U5 每源状态与失败可见 + 重试 + catch 注释 + 字号与来源名本地化 —— **commit `d6b90f93`**
- [x] M3 FB-F3 来源筛选扩展（`MusicSourceFilter = 'all' | MusicSource`），选项按库中实际来源生成 —— **commit `327fa22d`**
- [x] M4 FB-F1 + FB-C4 Hub 拖动真修复（`anim-pop` 覆盖内联 `translate`）+ 几何浏览器断言 + 规则写入文档 —— **commit `543c3ee1`**
- [x] M5 FB-U1 窗口 chrome 强化：8 向缩放 / 可见把手 / 双击标题栏最大化 / `touch-action` / 视口变化重夹取 —— **commit `ae1beee0`**
- [x] M6 FB-S4 音源目录单一来源（client / worker 同源 + 契约测试）—— **commit `3ec70a46`**
- [x] M7 FB-F4 + FB-F7 + FB-S6 音乐设置分区（音源组 + 播放默认组 + 音质 + 风险告知）+ Hub 齿轮直达 —— **commit `8dfe9e9c`**
- [x] M8 FB-F5 + FB-PF5 在线曲目封面 / 歌词 / 时长 —— **commit `6e7be783`**

## M② · 移动端与门禁

- [x] M9 FB-C3 音乐三表面纳入 `TOOLBAR_SURFACES` 与手机断点 axe + 更新 `check-surface-coverage.mjs` 的 Modal 使用者枚举 —— **commit `ce7eafee`**
- [x] M9b FB-C5（M9 复跑对比度时暴露的既有门禁失败，非音乐）：手机断点的分享中心表格头让 axe 抛规则错，由该表面按名声明 —— **commit `8a79eeba`**
- [x] M10 FB-U2 + FB-R3 窄屏工具栏重排 + 矮视口内容高度预算 —— **commit `2333050b`**
- [x] M11 FB-U3 状态栏被隐藏控件的「更多」入口 —— **commit `861b7b7b`**
- [ ] M12 FB-R1 + FB-R2 + FB-U4 + FB-PF2 断点同源 + 窄屏卡片视图 + 网格窗口化 / 解除截断 + 分断点走查表（拆分执行，逐分项提交）
  - [x] M12a FB-R2 侧栏折叠改读 Hub 自身盒宽（视口只作无测量环境的回退）—— **commit `9cc4ba8c`**
  - [x] M12b FB-U4 曲表窄档的来源 / 专辑替代（改容器驱动，与 R2 同源）—— **commit `—`**（下一提交回填）
  - [x] M12c FB-PF2 网格 200 条截断改为可操作的「加载更多」—— 与 M12b 合并为同一提交（同一份「由页面自身尺度决定」的改动，白名单与门禁一次同步）
  - [ ] M12d FB-R1 分断点走查表 + 窄屏默认卡片视图 + 底部主 tab 评估
- [ ] M13 FB-U6 + FB-U7 子面板三态走查 + 「能力 × 表面」矩阵补齐

## M③ · 体验与能力补齐

- [ ] M14 FB-F10 在线结果行：试听 / 批量添加 / 封面专辑时长
- [ ] M15 FB-F8 手动指定音源 + 智能换源开关
- [ ] M16 FB-F9 引用行健康检查与批量修复
- [ ] M17 FB-F11 下载体验补齐（失败重试 / 取消 / 下载音质）
- [ ] M18 FB-F12 播放历史管理（删单条 / 清空）
- [ ] M19 FB-F13 歌词源选择（本地 / lrclib / 在线源）

## M④ · 性能与安全

- [ ] M20 FB-PF1 music chunk 预算（109 KiB → ≤96 000 B，不许改基线）
- [ ] M21 FB-PF4 音乐库性能测量脚本 + 按数据优化搜索链路
- [ ] M22 FB-S1 + FB-PF3 代理流超时 / 软上限 + 预算口径修正
- [ ] M23 FB-S2 + FB-S3 代抓逐跳白名单（复用 `fetchAllowedResource`）+ 播放 URL 过 `isAllowedOutboundUrl`
- [ ] M24 FB-S5 观测 / 隐私核对（搜索关键词是否入日志）

## M⑤ · 服务器型音源与收尾

- [ ] M25 FB-M16 服务器型音源（Subsonic / Navidrome / Jellyfin / Emby）
- [ ] M26 收尾：review 定稿 + plan 回填哈希、已知限制、不做清单

## 每项验收标准（通用）

1. 复现测试先红（新增 / 修改 `src/client/features/music/*.test.ts` 或 `src/worker/routes/music/*.test.ts`；几何与视觉类由 `scripts/e2e-visual.mjs` 先红）
2. 实现后：目标测试绿 + music / routes（视改动加 demo、schema-migrations）全量单测绿 + `npm run typecheck` + 12 项静态门禁绿
3. UI / 几何 / 对比度改动：`scripts/e2e-visual.mjs` + `scripts/check-contrast.mjs` 对 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` 实例全绿（不可跑时如实写「已知限制」并保留待补跑标记）
4. **几何类铁律（FB-C4）**：任何用户可拖动 / 缩放 / 定位的能力，验收必须含一条真实浏览器几何断言，jsdom 断言 store **不算**验收
5. 新用户可见文案双语（`npm run i18n:check`）；不夹带无关重构 / 格式化（铁律 14）

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-27 | M0 文档基线 | `fac9b655` | —（无代码改动，静态门禁与单测不适用） | 报告结论均落到文件 / 行或实测响应；浏览器门禁在 M4 起逐项补跑 |
| 2026-09-27 | M1 FB-F2 开关触发搜索与四态文案 | `23bd2805` | 先红：对着 HEAD 组件跑 `music-provider-results.test.ts` 得 6 failed / 2 passed（4 例 `providerPanelState` 不存在，1 例「开关打开后无请求」，1 例「开关与答案之间没有文案」）；实现后 8 例 ✅；music + routes 106 文件 / 741 例 ✅；`npm run typecheck` ✅；comments（同步白名单后 9491 条）/ size / style / i18n 门禁 ✅ | 面板状态提为纯函数 `providerPanelState`（total：off / loading / ready / none，任何情况都有文案）；开关纳入 effect 依赖；字号从 `--text-11/10` 提到 `--text-12`（FB-C2 的一半提前落地）；测试里的搜索词用 ASCII，避免触发 i18n 门禁的「中文只允许出现在 zh-CN 资源」 |

| 2026-09-27 | M2 FB-F6 逐源状态 + 重试、FB-C1 catch 注释、FB-U5 来源名本地化 | `d6b90f93` | 先红：`gds.test.ts` 按新 `ProviderPage` 形状重写、`providerPanelState` 新增 `failedSources` 入参、`music-provider-results.test.ts` 新增 5 例（空结果 + 有名失败 → failed、全挂与部分挂的文案分支、失败与命中并存 + 重试、本地化名）——旧实现下这些均无法通过；实现后 music + routes + locale-keys 107 文件 / 751 例 ✅；`npm run typecheck` ✅；13 项静态门禁 ✅（comments 白名单同步至 9522 条） | 每源状态用三态 `ok/empty/error`（「答了但没匹配」与「没答」是两件事）；`searchGds` 返回 `{results, failedSources}`，`searchGdsPages` 返回每源页（`swapFailedProviderTrack` 改为 `flatMap(page.results)`）；新增 `providerFailedSources` store 字段（不持久化，属会话态）；`providers/labels.ts` 新建本地化名映射并经 `providers/index.ts` 公开（未知 slug 回退显示 slug）；**大小写门禁**：`size:check` 先报组件与测试各 1 个 longFn，拆出 `ProviderPanelBody`/`ProviderFailureNotice`/`Notice` 与独立 describe 后 ✅（未改基线） |

| 2026-09-27 | M10 FB-U2 + FB-R3 窄屏工具栏重排 + 矮视口内容高度预算 | `2333050b` | 先红（浏览器，探针）：改前对 :7714 实测 390×844 的 Hub —— 工具栏 **145px / 6 层控件**、头部+工具栏 189px。**度量修正**：按「控件顶边去重」数行把改后的一行布局读成 4 行（32px 的下拉与 24px 图标同一行但顶边不同），故门禁改按**行带**计数（控件中心间距 > 10px 才算下一行），并在脚本注释里写下这件事。先红（单测）：新增 `toolbarShape` 契约 6 例（宽/中/窄容器、矮视口、两者叠加、无测量环境的回退）+ 工具栏 stacked/compact 渲染 5 例 + 来源下拉选项 1 例 —— 共 **11 failed**（`toolbarShape` 不存在、无 `data-shape`、无 `select`）；`music-view-toggles.test.ts` 的 UI-16 段因 jsdom 默认就是窄档而报 2 failed，给那两例补上「宽工具栏」的显式前提（UI-16 说的是分段控件，本身属于宽档形态）。实现后：music 全量 **107 文件 / 786 例 ✅**；`npm run test:unit` **531 文件 / 4745 例 + 1 skipped ✅**（M9 为 4731）；`npm run typecheck` ✅；12 项静态门禁 ✅（comments 白名单同步到 9980 条 / 1151 文件）；`scripts/e2e-visual.mjs` 对 :7714 **566 通过 / 1 失败**（唯一失败仍为已登记看板遗留），新增两条预算断言全绿；`npm run contrast:check -- http://localhost:7714` **全绿**（两主题、桌面 + 手机；手机音乐面 axe 25 项，FB-C5 的按名放行仍在）。改后探针：390×844 **89px / 2 行带**、列表 646px；375×667 **89px / 2 行带**、列表 469px；900×600（中心列仅 314px）93px / 2 行带、列表 313px；1440×900 仍是 inline 形状 / 89px / 列表 537px | 预算断言量的是队列面板关闭的默认态（面板占去的高度是读者自己给的，仍按设计）；排序在窄档改为搜索行里的下拉而非 review 建议的「进更多」——共用的 `Menu` 把带 `checked` 的行渲染成多选语义，已写进 review 的偏离记录；窄到 ~314px 时搜索框会被挤得很窄但仍不换行 |
| 2026-09-27 | M12c FB-PF2 网格的 200 条截断改为可操作的「加载更多」 | `—`（与 M12b 同一提交） | 先红（单测）：新增 `music-store/match-limit.test.ts` 6 例（预算起点 / 每次一页 / 计数按提高后的额度 / 新查询归零 / 换 scope 归零 / 列表视图不受影响）与 `music-track-table.test.ts` 的 UI 一例；实现前得 **5 failed / 1 passed**（`showMoreMatches` 不存在；起点一例在旧实现下平凡通过）与 UI 一例 `× offers the remainder instead of only counting it`。实现后：两个文件 **21 例 ✅**；music 全量 **108 文件 / 809 例 ✅**；`npm run test:unit` **532 文件 / 4768 例 + 1 skipped ✅**（M12a 为 4756，本轮 +12）；`npm run typecheck` ✅；11 项静态门禁 ✅（comments 白名单同步到 10089 条 / 1152 文件） | 截断从「只说剩下多少」改成「可以要下一页」：`matchLimit` 是会话态（不持久化），默认就是原来的 `SEARCH_RESULT_LIMIT`；`showMoreMatches()` 每次加一页，`setQuery` / `commitQuery` / `setScope` / `setSourceFilter` 都把它归零（新的搜索 / 新的范围不该继承上一个的额度）；`hiddenMatchCount` 与 `visibleTracks` 读同一个额度，所以通知与画的卡片数永远一致。视图对象里该字段是**可选**的——播放器与行菜单只问次序，不量卡片（`matchLimit ?? SEARCH_RESULT_LIMIT`）。文案改为「Top N of M matches」+「加载更多」按钮（原来的「请缩小搜索范围」不再是唯一出路）
| 2026-09-27 | M12b FB-U4 曲表的列改由列表自身盒宽决定，窄档把来源 / 专辑写进行内 | `—`（与 M12c 同一提交，下一提交回填） | 先红（单测）：`listDensity()` 契约 3 例 + 表头 / 单元格替代 2 例——把五个实现文件回到 HEAD 后跑 `music-utils.test.ts` 与 `music-track-table.test.ts` 得 **4 failed / 47 passed**（`listDensity` 不存在 3 例 + 窄档行内仍无专辑与来源 1 例；「宽档画列」在旧实现下平凡通过，它钉的是回归方向）。实现后：music 全量 **108 文件 / 809 例 ✅**；`npm run typecheck` ✅；`scripts/e2e-visual.mjs` 对 :7714 **569 通过 / 1 失败**，新增两条浏览器断言全绿：同一 1440 视口下 Hub 最大化前后，窄中心列（514px）不画歌手 / 专辑列且行内出现专辑与来源、比宽档少 3 个单元格，最大化后（960px）两列回来——同时验证了列密度确实读「被量的盒子」而不是视口。本轮末尾「收藏公开页」场景在导航处崩（`Execution context was destroyed`，非音乐，与上一轮全绿的差异记在此处，下轮复跑） | 列的可见性从视口媒体查询（`hidden xl:block`）改成 `listDensity({containerWidth, viewportWide})`——与 FB-R2 的侧栏折叠同源（都是 `MUSIC_NARROW_BREAKPOINT = 900`）；容器宽度由 `useElementWidth` 量列表根节点，视口只在无测量环境（jsdom / 首帧）当回退。列收起来时行必须把话说回来：行内第二行改为 `RowSubstitute`（歌手 · 专辑 + 来源角标），卡片也补上专辑行（只在有专辑时画，卡片不是表格单元格，空值不该画成 `—`）。**行为变化**：窄档下歌手文字从「可点击播放的按钮」变成普通文本（原来那个按钮只在 `xl:hidden` 出现，正好是现在被替代的那一档）；播放仍有一条完整路径（标题按钮 / 封面按钮 / 行双击），已在 review 记为可接受。**未做**：`MUSIC_LIST_FULL_MIN_WIDTH` 与表格的 `w-32/w-40` 列宽仍是常量，更窄的容器没有第三档
| 2026-09-27 | M12a FB-R2 侧栏折叠改读 Hub 自身盒宽 | `9cc4ba8c` | 先红（单测）：`hubColumnsWide()` 契约 3 例 + 门组件 2 例（宽视口 / 窄盒、窄视口 / 宽盒）共 **5 failed**（函数不存在）；**变异证明**：把组件里的测量值换成 `containerWidth: null`（退回视口答案）后恰好那 2 例变红，说明它们真在钉「盒决定、视口只做回退」。实现后：music 全量 **107 文件 / 797 例 ✅**；`npm run test:unit` **531 文件 / 4756 例 + 1 skipped ✅**；`npm run typecheck` ✅；12 项静态门禁 ✅（size 先报新测试把 UI-14 的 describe 体推到 50 行以上，拆出独立 describe 后未动基线；comments 白名单同步到 10039 条 / 1151 文件）；`scripts/e2e-visual.mjs` 对 :7714 **571 通过 / 1 失败**（唯一失败仍是已登记看板遗留，569 → 571 即本轮新增两条），新增两条全绿：桌面视口下把 Hub 拖到 860 宽 → **列折叠**（侧栏离开、头部出现抽屉入口）且视口仍 ≥1280 → 拖回原宽 → **列回来**；`npm run contrast:check -- http://localhost:7714` **全绿** | **自查发现并修掉一条反馈回路**：折叠一旦读「被量的盒子」，而盒子又由「是否铺满视口（`fillViewport`）」决定，两者会互相驱动（窄→折叠→铺满→变宽→不折叠→回到窄）无限翻转；现在把两种读法分开：「铺满与否」只问视口（那是关于屏幕的问题），「列数」只问盒子。**行为变化**：在宽屏上被拖窄的 Hub 不再跳回铺满全屏，而是在被给定的形状里折叠侧栏（这正是 FB-R2 要的）；手机 / 矮屏仍按视口铺满并折叠，行为不变。**未做**：沉浸层与状态栏的断点仍读视口（前者容器就是视口，后者本就是页脚），它们的「能力 × 表面」矩阵在 FB-U7 / M13 |
| 2026-09-27 | M11 FB-U3 状态栏被隐藏控件的「更多」入口 | `861b7b7b` | 先红（单测）：`barMore({eqInline,pinInline})` 契约 3 例在实现前全失败（函数不存在），`music-status-bar.test.ts` 新增 3 例得 **2 failed**（无入口、无面板；「两者都内联时不画入口」在旧实现下平凡通过）——共 **5 failed**。实现后：music 全量 **107 文件 / 792 例 ✅**；`npm run test:unit` **531 文件 / 4750 例 + 1 skipped**（另 `tests/check-hardcoded.test.ts` 一条 5s 超时：负载下扫 ~100 个分享源文件超限，单跑 873ms 全绿，不是断言失败）；`npm run typecheck` ✅；12 项静态门禁 ✅（comments 白名单同步到 10006 条 / 1151 文件）；`scripts/e2e-visual.mjs` 对 :7714 **569 通过 / 1 失败**（唯一失败仍是已登记的看板遗留，566 → 569 即本轮新增三条），新增三条全绿：1000×800 下入口在场且置顶 / 均衡器 `drawn:false` → 按下后面板里带 `role=switch` 的置顶与均衡器 → Escape 关闭；`npm run contrast:check -- http://localhost:7714` **全绿**（104 项，两主题、桌面 + 手机；手机音乐面 25 项 axe + 1 项按名放行仍为 FB-C5 的表头） | 阈值 `MUSIC_BAR_EQ_MIN_WIDTH=1024` / `MUSIC_BAR_PIN_MIN_WIDTH=1280` 与状态栏自身的 `hidden lg:inline-flex` / `hidden xl:inline-flex` 是同一份契约：jsdom 钉「入口该带什么」、浏览器门禁钉「CSS 真的藏了什么」（`useMediaQuery` 读的是真 `matchMedia`，单测用 `vi.stubGlobal` 给宽度前提）；**偏离**：review 建议的「进度条可点击展开」未做——状态栏本身只在 md 以上绘制，它的进度条也正好从 md 起，任何宽度下都不存在「被藏起来的进度条」；手机宽度（<md）没有状态栏，传输完整活在 Hub / 沉浸层 / 浮窗（FB-C3 覆盖）；面板的行写成带名字的行（状态栏里是裸图标，因为没地方写字） |
| 2026-09-27 | M9b FB-C5 手机断点分享中心表格头不再让 axe 抛规则错（既有门禁失败） | `8a79eeba` | 先红：同一命令（`npm run contrast:check -- http://localhost:7714`）在修前报 2 条未登记审查项（两主题各一条，目标均为 `th:nth-child(2)`，axe 报 `Axe encountered an error`）；探针实测触发条件——表格 940px 宽于 390px 视口（容器与窗口滚动位置均为 0/0、`thead` 改静态都不变，把表格改成 `width:100%` + 固定布局后错消失）。先红（单测）：新增 `tests/axe-review-share-header.test.ts` 3 例，在规则未存在时报 3 failed（缺导出）。实现后：两文件 7 例 ✅；`npm run typecheck` ✅；`comments` 白名单同步到 9904 条 / 1150 文件 ✅；`npm run contrast:check -- http://localhost:7714` **全绿**（两主题、桌面与手机宽度），结果行给出命中证据：`✓ axe: the share center (phone) … 27 checks passed, 1 reviewed items allowed, 1 of them allowed by name (…)` + `allowed by name: color-contrast ×1 (error-occurred) — …`；同一轮的桌面分享中心仍报 `0 reviewed items allowed`（那里表格放得下、单元格正常判定） | 放行只限该表面、只限 axe 自己的规则错（不是判定）：同一单元格上任何带 `messageKey` 的审查项、空 key、别的 id、别的节点仍会让门禁失败（由单测钉住）；若表头形状以后变了，规则不再命中会以「未登记项」的形式报失败而不是沉默 |
| 2026-09-27 | M9 FB-C3 音乐三表面纳入门禁名单 + 手机断点 axe + Modal 使用者枚举 | `ce7eafee` | 先红（浏览器）：工具栏扫捦的焦点归还断言在本轮早期运行里读成 `active: body` —— 打开者（状态栏传输行 / 浮窗卡片）在 hub 挂载的同一个提交里被 React 换掉，标记属性随之消失，`restoreFocusAfterClose` 捕获到的 `document.activeElement` 已是 `body`（不是断言写错，是产品缺口）；改成每次运行重置的 `window.__gateOpeners` 数组标记打开者，并给状态栏加 `useHubCloseFocus`（hub 由开到关且焦点在 `body` 时交回 `[data-music-opener="hub"]`）。实现后：`npm run typecheck` ✅；`npm run test:unit` **530 文件 / 4731 例 + 1 skipped ✅**（M8 为 4723，本轮 +8）；新增 / 扩展 `music-status-bar.test.ts` 10 例、`music-floating-player.test.ts` 7 例、`music-hub-window.test.ts` 16 例（含 `hub header disclosures (FB-C3)` 一组钉 `aria-haspopup` / `aria-expanded`），三文件 **33 例 ✅**；**变异证明**：注释掉 `useHubCloseFocus` 的焦点交还后该文件 1 failed / 9 passed（断言真的承重），恢复后全绿；12 项静态门禁 ✅（`comments` 白名单同步到 9889 条；`surfaces:check` 输出「all 8 full screen surfaces」）；三个改动脚本 `node --check` ✅；`scripts/e2e-visual.mjs` 对 :7714 **564 通过 / 1 失败**，唯一失败仍是已登记的看板遗留，本轮音乐行全绿（`toolbar stability: the music hub toolbar holds its height` / `toggles stay on the toolbar row` / `surface keyboard: the music hub hands focus back to the control it was opened from` / 浮窗条带 / 沉浸层最大化铺满）；`npm run contrast:check -- http://localhost:7714` 中新增的 `music library (phone)` 两主题 ✅（6 token 层级、4 强调软底对、5 期望色、axe 24 项无违规未登记项，1 项按名放行）。**同一轮另有 2 条失败，均为与本轮无关的既有门禁失败**：手机断点的分享中心表格头让 axe 抛规则错（FB-C5，下一提交 M9b 修）。**记账更正**：M8 行写的「两主题全绿」本轮未能复现 —— 同一序列（桌面轮按「全部分享」分类、手机轮再开同一个中心）就会命中该 axe 规则错，以本轮实测为准（详单见 review 的 FB-C5） | 沉浸层在手机断点的 axe 归属仍未单列（该宽度由 e2e-visual 的 375px 几何断言覆盖，见 M12）；浮窗不进 `TOOLBAR_SURFACES` —— 它不是覆盖层、没有 Escape 也没有可归还焦点的入口，按同一规则另立具名断言（条带里每个展开控件按下后自身位置不动）；`check-surface-coverage.mjs` 的 Modal 条目改成如实的六个使用者（含音乐 Hub 与沉浸层） |

| 2026-09-27 | M8 FB-F5 + FB-PF5 在线曲目封面 / 歌词 / 时长 | `6e7be783` | 先红（实现前跑新测试）：worker `tests/music-provider.test.ts` 改搜索归一化断言 + 新增歌词 / 封面 / 导入三例，客户端 `music-store/providers.test.ts` 新增两例（添加时的富化与失败降级），`music-provider-results.test.ts` 新增时长两例 —— 共 **8 failed**（搜索响应无 `coverId`/`lyricId`、无 `provider/lyric` 与 `provider/cover` 路由、导入响应里 `lyric` 仍硬编码 `null`、添加时不查封面与歌词、行内不画时长）。实现后 music + routes + shared + api + 路由集成测试 **123 文件 / 921 例 ✅**，`npm run test:unit` 全量 **530 文件 / 4723 例 + 1 skipped ✅**；`npm run typecheck` ✅；12 项静态门禁 ✅（size 先报新 describe 过长，拆出「provider add flow」后未动基线；comments 白名单同步到 9796 条） | **真实上游验收（临时探针，不进仓库）**：对 `:7714` 的临时实例用真浏览器登录后直连目录 API 跑通 11 项 —— 搜索响应带出 `coverId`/`lyricId`（netease 实测 `durationMs` 为 `null`）、`provider/lyric` 返回 2247 字符正文、`provider/cover` 返回 `image/jpg` 4880 字节、未知 source 与空 id 各 400、导入返回 201 且行上 `coverUrl` 与 `hasLyric` 均在、封面经 `/tracks/:id/cover` 读回为图片、`data:image/svg+xml` 这类不可用封面**降级为无封面但添加仍 201**（11/11 全绿；另一次运行里歌词请求撞上游 503 → 502，重跑即过，说明 502 是上游抖动而客户端按 best-effort 降级，符合设计）。**封面与歌词在「添加」当刻解析**（搜索命中的 `pic_id`/`lyric_id` 是唯一一次能拿到的机会）：worker 新增 `provider/lyric`（返回文本）与 `provider/cover`（代抓图片字节，长缓存），`import-provider` 接受 `coverDataUrl`（≤800 000 字符校验）与 `lyric`（≤`musicLyricMaxBytes`），封面走与上传同一条 `storeCoverObject` 落 R2、行里存派生键，歌词存行；两处解析失败只降级不阻断添加（各自有注释）；**安全**：封面地址来自上游，必须过 `isAllowedOutboundUrl`（https + 非内网），拒绝时 502；时长：搜索响应本就可能没有 duration（netease 实测无该字段），在线结果行与曲目行 / 卡片 / 队列 / 详情 / 沉浸层统一改为「未知」，不再画 `00:00`；`MusicArtwork` 补 `decoding='async'`（FB-PF5 的一半） |

| 2026-09-27 | M7 FB-F4 + FB-F7 + FB-S6 音乐设置分区 + Hub 齿轮 + 在线音质 + 风险告知 | `8dfe9e9c` | 先红（改实现前跑新测试）：`provider-prefs.test.ts` 6 例、`stream-quality.test.ts` 2 例、`music-settings.test.ts` 8 例、`settings-request.test.ts` 4 例、`music-hub-window.test.ts` 齿轮 1 例、worker `provider.test.ts` 档位 3 例 —— 5 个文件 **14 failed**（`musicStreamUrl` 不带档位、`providerStreamQuality` 不存在、设置分区 / `settingsSection` / `openSettings` 不存在）。实现后 music + routes + shared + store 123 文件 / 924 例 ✅；`npm run test:unit` **530 文件 / 4716 例 ✅**（过程里揪出一条真问题：`tests/merge-preflight.test.ts` 抓到新测试被写成 `.test.tsx`，而 vitest 两个工程的 include 只选 `*.test.ts` —— 那文件永远不会进全量套件；改名并改 `createElement` 后通过）；`npm run typecheck` ✅；11 项静态门禁 ✅（hardcoded 先报 `--text-11.5` 未转义点号；size 先报 2 处 longFn 与 2 处行数增长，拆出 `initialProviderState` 与两个 describe 后只为行数重快照：audio-engine 541→542、player.ts 511→518）；`scripts/e2e-visual.mjs`（对 :7714）**547 通过 / 1 失败**，唯一失败仍是已登记的看板遗留，本次新增的 5 条（齿轮存在、打开后导航停在「音乐」、正文有「在线音源」、该页 axe 无违规、无未登记审查项）全绿；`npm run contrast:check -- http://localhost:7714` 两主题全绿 | 设置面板新增 `music` 分区（在线音源组：逐源开关 + 一次性风险告知门 + 音质下拉 + 来源角标开关；播放默认组：直接复用播放器弹层的 `MusicEqPanel`，另加背景模式 / 歌词对齐 / 歌词字号 / 悬浮窗）；`ui.openSettings(section)` + `settingsSection` 一次性请求（采用即清）；Hub 头部齿轮；音质表收敛到 `@shared/constants` 的 `MUSIC_PROVIDER_QUALITIES`（`LIMITS` 指向同一元组），provider 行的 stream URL 带 `?quality=`，worker 用 `readProviderQuality` 校验（白名单外 400，不静默降级），播放 / 预载 / 交叉淡入三条路径都带该值而上传行不带；新偏好 `providerQuality` / `providerNoticeAccepted` / `showSourceBadge` 写入持久化；**顺带修复**：启动时 `providerEnabled` 从偏好恢复（此前硬置 `{}`，开关每次刷新都回到关闭）；`SECURITY.md` 新增「Online music sources」 |

| 2026-09-27 | M6 FB-S4 音源目录单一来源 | `3ec70a46` | 先红：客户端 `gds.test.ts` 新增身份断言得 1 failed（本地字面量不是共享列表），worker 新增 `provider.test.ts` 得 1 failed、1 passed（共享列表尚不存在）；实现后两侧 7 例 ✅；music + routes + constants 110 文件 / 776 例 ✅；`npm run typecheck` ✅；静态门禁在提交钩里全绿 | 目录清单移到 `@shared/constants` 的 `GDS_UPSTREAM_SOURCES`（带 `GdsUpstreamSource` 类型），客户端 `GDS_SOURCES` 直接指向它（身份相同，不是拷贝），worker 的 `isProviderSource` 改读同一数组；契约两头各钉一半：客户端钉「是同一数组」，worker 钉「共享表里的名字全收、其余全拒（含大小写 / 空白 / 路径穿越串）」；**变异证明**：把客户端断言改成 `[...GDS_UPSTREAM_SOURCES]`、把 worker 收回本地字面量并少写 `bilibili`，两条断言分别报错（牙口实测，非推断） |

| 2026-09-27 | M5 FB-U1 窗口 chrome | `ae1beee0` | 先红：新增 `music-hub-window.test.ts` 13 例在旧实现下 12 失败（`resizeHubGeometry` 不存在、无八向手柄、无 `touch-action`、无双击、无视口重夹取）。实现后 music 全量 105 文件 / 752 例 ✅；music + routes 108 文件 / 772 例 ✅；`npm run typecheck` ✅；静态门禁 ✅（size 先报 2 处 longFn：`HubResizeZones` 与测试描述块，各拆出子组件 / 独立 describe 后过，comments 白名单同步到 9627 条）；`scripts/e2e-visual.mjs` 对 :7714 **542 通过 / 1 失败**（唯一失败仍为已登记看板遗留）；`npm run contrast:check -- http://localhost:7714` ✅（两主题、桌面与手机宽度全表面 AA + 外壳与 Hub 的 axe 全绿） | 八个命中区一份表驱动，东南角是唯一具名可聚焦控件（方向键两维缩放），其余七个 `aria-hidden` + `tabIndex={-1}` 只服务指针——先测护栏：`axe` 的 `aria-hidden-focus` 不报 `tabindex="-1"`（用 jsdom + axe-core 实测确认后才落笔）；居中窗口按住一条边时须同时平移“一半的变化量”，否则被按住的那条边不会跟着指针走（`resizeHubGeometry` 的纯函数契约 6 例钉住四个方向与两个夹取）；手势起点从**屏幕上的盒子**量取（`closest('[role=\"dialog\"]').getBoundingClientRect()`），不再用回退值（jsdom 量到 0 时才回落）；双击标题栏两态都走（最大化后同一个手势还原）；`resize` 监听重夹取宽度/高度/偏移。**类型事故记录**：键盘路径把 `{dx,dy}` 当 `{x,y}` 传进 `resizeHubGeometry`，`vitest` 只看到 NaN 与死循环（`Maximum update depth exceeded`：NaN !== NaN 使重夹取不断写回），`tsc -b` 能一眼报出参数形状不符——本轮起每项改动都先跑 typecheck 再跑测试 |

| 2026-09-27 | M4 FB-F1 拖动真修复 + FB-C4 规则化 | `543c3ee1` | 先红（浏览器）：同一脚本对改前的 `music-hub-window.tsx` 实测 `dx/dy = 0/0`（`translate` 换成旧 `transform` 写法，store 已写对而屏幕不动）；改后 `120/60`，拖回后回到原点；三条断言（可拖窗口 / 跟着指针走 / 拖回原点）均 ✅。回归：music + routes 107 文件 / 759 例 ✅；`npm run typecheck` ✅；comments（白名单同步到 9565 条）/ style 门禁 ✅；`scripts/e2e-visual.mjs` 对 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`（:7714）实例 **537 通过 / 1 失败**，唯一失败为已登记的看板遗留「笔记里的看板块不高于它绘制的头与板」（与 F④ 轮同参 canvas:480/needed:456，音乐无关） | 位移改写为独立 `translate` 属性（不再与 `.anim-pop` 的 `transform: none` 争层叠）；`hubStyle` 提为导出纯函数，新增 2 例 jsdom 契约钉住「写在动画碰不到的那个属性上」；断言从把手的 `closest('header')` 找抓手、每次拖拽重读位置（按旧位置的按压会落到遮窗外，一次误点就关掉整个窗口——这是本轮门禁先报的 4 条失败里的 3 条）；本轮不改对比度令牌，未重跑 `check-contrast`（几何位移不参与颜色绘制） |

| 2026-09-27 | M3 FB-F3 来源筛选扩展 | `327fa22d` | 先红：把四个实现文件回到 HEAD 后跑测试得 5 failed（`buildSourceFilterOptions` 不存在 3 例 + 工具栏不画 alist 选项 + 点不到 alist 单选）；实现后 music + routes 107 文件 / 757 例 ✅；`npm run typecheck` ✅；13 项静态门禁 ✅ | `MusicSourceFilter` 从写死的 `'all'|'r2'|'webdav'` 改为 `'all' | MusicSource`（新增 alist/external/provider）；`SOURCE_FILTERS` 白名单同步；选项由 `buildSourceFilterOptions(库全量, 当前值)` 按固定次序生成，**用库全量而非过滤后视图**（否则选中 alist 后其余选项会消失、无法切回），当前值若不在库中也保留在行内（否则会出现「有筛选却无控件可清」）；工具栏新增 `libraryTracks` 属性（只读 `Pick<MusicTrack,'source'>[]`），`HubCentre` 传 `state.tracks`；`library-load.test.ts` 因新增用例越过 500 行，改把来源筛选作用域测试放进新文件 `music-store/source-filter.test.ts`（`visibleTracks` 的按来源过滤在 HEAD 本就正确，这两例是值域扩展的回归网而非首红） |

## 已知限制（滚动更新）

- `budget:check` 的 music chunk 超限（109 KiB vs 96 000 B）为既有问题，计划在 M20 处理，本轮不提高预算。
- 浏览器门禁 `scripts/e2e-visual.mjs` 当前为 569 ✓ / 1 ✗（另有末尾一个采集类场景在导航处崩溃，见 M12b 行）：唯一失败是已登记的看板遗留「笔记里的看板块不高于它绘制的头与板」（canvas:480 / needed:456，`board 353 + header 103`），与音乐无关，也不在本轮范围内（铁律 14）。
- **两个门禁都必须对同一个临时实例跑**：`npm run contrast:check` 不带参数时默认打 `http://localhost:7712`，而那是本地常年留数据的实例——它的音乐库里有带封面的真实曲目，网格卡上的时长徽标（`--text-inverse` on `--scrim`）叠在封面图上时 axe 判不出底色，于是「音乐库网格视图」两主题各报 6 条 `color-contrast` 待审项而失败。对 `:7714`（`INKSTONE_EPHEMERAL_DEV=1`，只跑探针曲目）同一份代码全绿。本轮按后者执行，并把「默认基址不保证与视觉门禁同实例」记在此处。
- kuwo 源当前上游 400（实测），属上游状态；本仓库只保证「失败可见 + 可关闭」。
- 服务器型音源受 `global_fetch_strictly_public` 约束，只能指向公网 HTTPS；LAN 自建服务需反向代理 / 隧道（Alist 今天同样受限），该限制写进文档而非绕过。
- `blog-frontend/src/components/music/` 与 app 版不共享代码（独立实现），本轮不动。
- **M7 的齿轮会替换 Hub**：单面板 UI 里打开设置即关掉音乐库，关掉设置后不会自动回到音乐库（再开一次即可）；如需「关掉设置回到库」，属跨面板返回栈，另立条目。
- **音质档位只对 provider 引用行生效**：上传 / WebDAV / Alist 行按文件自身编码播放，档位对它们没有意义（也不发送）。
- **风险告知是每浏览器一次**：`providerNoticeAccepted` 存偏好；清空站点数据后会再问一次，这是有意的（告知是给「第一次决定的人」看的）。
- **`providerEnabled` 现在从偏好恢复**（M7 顺带修掉启动时硬置 `{}` 导致的「刷新即回到关闭」）；缺键仍视为关闭，与「每源默认关闭」不冲突。
- **播放默认组与播放器弹层是同一份 store**：EQ 面板直接复用 `MusicEqPanel`（不是副本），其余开关各自写同一个偏好字段。
- 设置分区里没有库级批量操作（清理、去重、导出等留在音乐库自身），避免跨层重复入口。

## 不做清单（保留既有决策）

榜单 / 平台歌单导入（FEA-A1-6）、跨设备偏好同步（IMP-12）、RMS→LUFS（IMP-13）、10 段 EQ（IMP-14）、视频 crossfade（IMP-15）、KV 单文件 25MB（IMP-16）、WebDAV 后台缓冲（IMP-17）。
