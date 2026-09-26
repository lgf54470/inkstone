# 音乐库模块改进执行计划 · 现有功能不完整与逻辑缺陷（ZCode · GLM-5.3-Flash · 2026-09）

> 依据：`docs/improvement/music/review-with-zcode_glm53fmax.md`（2026-09-26 复审）。
> 分支：`dev` 直接逐项提交。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**，实现后跑回归（typecheck + music 相关 vitest + 静态门禁）再提交，**提交后立刻更新本文件**（勾选 + commit 短哈希 + 进度日志一行）。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 门禁备注：新增/修改注释后必须 `node scripts/sync-comments-allowlist.mjs` 重建注释白名单（双向失败）；UI 相关改动需 `scripts/e2e-visual.mjs` / `scripts/check-contrast.mjs`（需本机 Chrome 与 `npm run dev:kv` 实例，跑不了写进「已知限制」）。

## 批次 ① · P1 缺陷（S–M，先做）

- [x] IMP-5 随机模式洗牌队列：打乱序列、当前曲置首、可还原原序、再次打乱（`music-utils.ts` computeNextIndex 改为洗牌序列驱动）
- [x] IMP-4 A-B 循环控件补面：`MusicSeekBar` 可选区间轨道层（四表面可见；标记/清除入口 Hub 与沉浸层）
- [ ] IMP-2 重复检测补近似分组：无 contentHash 曲目按归一化 title+artist+duration 容差分组，UI 标注「近似」
- [ ] IMP-1 全库歌词搜索：服务端歌词检索端点（LIKE 或 FTS，带预算限流）+ 客户端异步合并与竞态守卫
- [ ] IMP-3 列表窗口化：行高恒定最小虚拟滚动，解除搜索 200 条 DOM 截断

## 批次 ② · P2 缺口（S）

- [ ] IMP-6 睡眠定时自定义分钟（1–480 输入，持久化与恢复不变）
- [ ] IMP-7 歌词偏移放宽 ±30s；500 首达上限时提示清理而非静默丢弃
- [ ] IMP-8 倍速细步进（档位间 ±0.05/0.1，preservesPitch 不变）
- [ ] IMP-9 M3U 远程 URL 条目直接入队为临时播放项
- [ ] IMP-11 歌词搜索阈值随 IMP-1 评估放宽（2 字符/分词）

## 批次 ③ · P2 增强（M，需独立评审）

- [ ] IMP-10 歌单自定义封面（复用曲目换封面管线，迁移只增不改）
- [ ] IMP-12 播放偏好跨设备（可选，默认不做；若做并入服务端 playback 偏好）

## 不做清单（P3，记录在案）

- IMP-13 RMS→LUFS：成本收益不成比例，保持 RMS 近似
- IMP-14 10 段 EQ：独立产品决策，本轮不做
- IMP-15 crossfade 视频化：画面重影，保持硬切
- IMP-16 KV 25MB：平台限制
- IMP-17 WebDAV 后台缓冲：浏览器约束

## 每项验收标准（通用）

1. 复现测试先红（新增/修改 `src/client/features/music/*.test.ts` 或 `src/worker/routes/music/*.test.ts`）
2. 实现后该测试绿 + music 全量单测绿 + `npm run typecheck` 绿 + 12 项静态门禁绿
3. UI 改动（IMP-4 SeekBar、IMP-3 列表）加跑 e2e-visual / check-contrast（不可跑时记已知限制）
4. 无关重构/格式化不夹带；对外行为变化同步 locales（zh-CN 与 en-US 键一致，`npm run i18n:check`）

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-26 | IMP-5 随机洗牌队列 | `fae38130` | 先红 6 例（新模块与 store 用例）；修复后 music 80 文件 / 570 例 ✅（首跑 1 例 progress.test 偶发，复跑两次全绿）；typecheck ✅；comments/style/module-state/deep-imports/i18n/size 门禁 ✅ | 「再次打乱」= 关/开随机重建序列，未加队列面板按钮（YAGNI）；洗牌序列仅会话内存不持久化（刷新后按当前曲重建）；shuffleOrder 非空 ⟺ mode 为 shuffle，由 queue-ops/crossfade/library-tracks 各写入方维持 |
| 2026-09-26 | IMP-4 A-B 循环控件补面 | 见提交（哈希回填于后续 docs 提交） | 先红 4 例（seek-bar 3 + controls 2 中先红 4）；修复后 music 81 文件 / 575 例 ✅；typecheck ✅；全部静态门禁 ✅；check-contrast ✅（双主题全表面 AA）；e2e-visual 534/535——唯一失败为「kanban in the note 板块高度」（stash 对照证实与音乐改动无关、为 dev 历史遗留，见下） | e2e-visual 遗留失败：`kanban in the note: the block is no taller…`（canvas 480 vs needed 456，确定性复现，暂存音乐改动后同样失败，属看板模块问题，另立条目处理，不在本线夹带）；状态栏/浮窗不加循环标记按钮（空间限制），区间条可见、清除走 Hub/沉浸层 |
