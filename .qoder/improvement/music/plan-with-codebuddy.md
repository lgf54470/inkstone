# 音乐库模块改进执行计划（CodeBuddy · 2026-09）

> 依据：2026-09-25 音乐库模块第三轮复审报告（SEC/UI/A11Y/V/PERF/FEAT 编号）。
> 分支：`music-improvement-codebuddy-hy4`（自 `dev` `cc09e4b3`）。
> worktree：`/home/kubuntu/code/cloudflare/inkstone-music-improvement-codebuddy-hy4preview`（依赖已软链，软链写入 `info/exclude`）。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**，修复后跑回归（typecheck + 相关单测 + 受影响门禁）再提交，**提交后立刻更新本文件**。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）

## 基线

- [x] BASE-0 创建 worktree（`/home/kubuntu/code/cloudflare/inkstone-music-improvement-codebuddy-hy4preview`，分支 `music-improvement-codebuddy-hy4` @ `cc09e4b3`）+ 软链 `node_modules`、`blog-frontend/node_modules` 并登记 `info/exclude`
- [x] BASE-1 基线门禁确认：`npm run typecheck` ✅ exit 0（151.62s）
- [x] BASE-2 钩子确认：`core.hooksPath=.githooks` 生效，pre-commit 跑 12 项静态门禁 + `tsc -b` + `vitest related`（30s 超时）
- 门禁备注：新增/修改注释后必须 `node scripts/sync-comments-allowlist.mjs` 重建注释白名单（双向失败）
- 浏览器门禁（`scripts/e2e-visual.mjs` / `scripts/check-contrast.mjs`）需本机 Chrome 与本地实例（`npm run dev:kv`），跑不了时在「已知限制」列写明

## 条目清单

### 批次 ① · 一致性与可访问性速修（S，先做）

- [x] M-A11Y-2 `music-seek-bar.tsx` 去掉 `outline-none`（对齐共享 `Slider`），键盘焦点圈回归（`7a275122`）
- [x] M-UI-1 `music-hub-playlists.tsx` 新建/行菜单按钮改为默认可见、`md:` 起 hover 降级（触屏可发现）
- [ ] M-UI-2 `music-player-controls.tsx` / `music-now-playing.tsx` 裸 `<img>` 改 `MusicArtwork`（封面 404 兜底）
- [ ] M-A11Y-1 `music-hub-tags.tsx` / `music-hub-playlists.tsx` 自造 `<input>` 改共享 `Input`（恢复焦点圈）
- [ ] M-UI-4 浮动播放器「移动播放器」按钮补键盘/点击动作 + `aria-describedby` 提示方向键
- [ ] M-UI-6 沉浸式播放器歌词空态复用三态判定（未播放≠没有歌词）
- [ ] M-UI-7 专辑/歌手分组视图补 `loading` 态
- [ ] M-UI-8 状态栏曲名按钮补 `aria-label`（动作语义）+ 去掉冗余原生 `title`
- [ ] M-UI-9 编辑曲目弹窗标题必填校验（或去掉 `required`），禁止静默回退
- [ ] M-UI-10 睡眠定时菜单补 `aria-pressed` 与选中态（不得仅靠颜色）
- [ ] M-A11Y-3 弹层触发器不再同时输出 `aria-pressed` 与 `aria-haspopup`/`aria-expanded`
- [ ] M-A11Y-4 曲表表头占位列补语义（去 axe `empty-table-header` 面）
- [ ] M-A11Y-5 歌词/详情 `Segmented` 组名与选项重名，改用表达用途的键
- [ ] M-A11Y-6 `clear_queue` / `search_clear_history` 文字按钮触控目标提到 ≥24px
- [ ] M-UI-11 删除死文案键（两语言同步）
- [ ] M-UI-3 网格卡片 `div+onClick` 改为语义容器 + 卡片内既有控件承载动作
- [ ] M-UI-5 `MusicPopover` 复用 `components/popover-placement`
- [ ] M-V-4 三处播放器职责收敛（Hub 打开时压制浮动/状态栏传输）

### 批次 ④ · 安全纵深（S–M）

- [ ] 写预算：`playlists.ts` / `tags.ts` / `playback.ts` 补 `enforceMusicBudget('write')`
- [ ] 孤儿封面：删除曲目/替换封面时回收 `music/cover/*` 对象
- [ ] 上游流式限长：`lookup.ts` / `lyrics.ts` 改 `readResponseBytesWithinLimit`
- [ ] CSP：`security-headers.ts` 外部图片排除名单补 `/c/` 与 `/playlist/`
- [ ] WebDAV 头信任：webdav 行不计入本地配额；回显 `Content-Length/Range` 校验
- [ ] 配额原子化：`upload.ts` 补插入后补偿校验（TOCTOU）

### 批次 ② · 性能结构（M）

- [ ] PERF-1 行 `handlers` 引用稳定化（选择下沉），恢复行 `memo`
- [ ] PERF-5/6 scope 派生记忆化 + `useVisibleTracks` 单例化
- [ ] PERF-7 `id→Tag` 映射单 memo 下传
- [ ] PERF-8 侧栏 `recentCount` 改 `stats`/memo 派生
- [ ] PERF-9 队列列表 `useMemo` + `memo(QueueItem)`

### 批次 ③ · 网络与存储（M–L）

- [ ] PERF-3 播放位置与队列分开持久化
- [ ] PERF-4 `/library` keyset 分页 + ETag/增量
- [ ] PERF-10 KV 无 Range 全量读改流式
- [ ] PERF-11 浮窗/沉浸层 `lazy` 化
- [ ] PERF-12 bundle 预算按 eager/lazy 分层

### 批次 ⑤ · 能力兑现（需产品决策）

- [ ] F-1 歌词逐行点击跳转 + 时间轴偏移校准
- [ ] F-7 EQ 预设
- [ ] F-5 M3U 导入
- [ ] F-9 A-B 循环 / 睡眠淡出
- [ ] F-10 搜索覆盖歌词与标签名

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-25 | BASE-0/1/2 worktree + 基线 + 钩子确认 | —（无提交） | typecheck ✅ exit 0（151.62s） | 依赖软链以 `info/exclude` 登记，不进提交 |
| 2026-09-25 | M-A11Y-2 进度条恢复键盘焦点圈 | `7a275122` | 先红：`classList.contains('outline-none')` 为 true；修复后 2 ✅；music 60 文件 / 461 例 ✅；12 项静态门禁 ✅（注释白名单 1047 文件 / 8330 条）；提交钩子 `vitest related` 7 文件 / 30 例 ✅ | jsdom 无法断言 `:focus-visible` 实际绘制，守卫的是「不抑制」这一契约；真实焦点圈由 `check-contrast`/`e2e-visual` 覆盖 |
| 2026-09-25 | M-UI-1 歌单控件触屏可见 | （本次） | 先红 2 例（`opacity-0` 为 true、`md:opacity-0` 缺失）；修复后该文件 10 ✅ | 媒体查询行为 jsdom 不可断言，断言守的是类名契约；375px 目视由 `e2e-visual` 既有 music 表面覆盖 |
