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

- [x] M1 FB-F2 在线结果开关触发搜索 + 关闭 / 加载 / 无匹配 / 全源失败四态文案 —— **commit `—`**（下一提交回填）
- [ ] M2 FB-F6 + FB-C1 + FB-C2 + FB-U5 每源状态与失败可见 + 重试 + catch 注释 + 字号与来源名本地化
- [ ] M3 FB-F3 来源筛选扩展（alist / external / provider / podcast），未知旧值回落 `all`
- [ ] M4 FB-F1 + FB-C4 Hub 拖动真修复（`anim-pop` 覆盖内联 `translate`）+ 几何浏览器断言 + 规则写入文档
- [ ] M5 FB-U1 窗口 chrome 强化：8 向缩放 / 可见把手 / 双击标题栏最大化 / `touch-action` / 视口变化重夹取
- [ ] M6 FB-S4 音源目录单一来源（client / worker 同源 + 契约测试）
- [ ] M7 FB-F4 + FB-F7 + FB-S6 音乐设置分区（音源组 + 播放默认组 + 音质 + 风险告知）+ Hub 齿轮直达
- [ ] M8 FB-F5 + FB-PF5 在线曲目封面 / 歌词 / 时长

## M② · 移动端与门禁

- [ ] M9 FB-C3 音乐三表面纳入 `TOOLBAR_SURFACES` 与手机断点 axe + 更新 `check-surface-coverage.mjs` 的 Modal 使用者枚举
- [ ] M10 FB-U2 + FB-R3 窄屏工具栏重排 + 矮视口内容高度预算
- [ ] M11 FB-U3 状态栏隐藏控件补「更多」入口
- [ ] M12 FB-R1 + FB-R2 + FB-U4 + FB-PF2 断点同源 + 窄屏卡片视图 + 网格窗口化 / 解除截断 + 分断点走查表
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
| 2026-09-27 | M1 FB-F2 开关触发搜索与四态文案 | `—` | 先红：对着 HEAD 组件跑 `music-provider-results.test.ts` 得 6 failed / 2 passed（4 例 `providerPanelState` 不存在，1 例「开关打开后无请求」，1 例「开关与答案之间没有文案」）；实现后 8 例 ✅；music + routes 106 文件 / 741 例 ✅；`npm run typecheck` ✅；comments（同步白名单后 9491 条）/ size / style / i18n 门禁 ✅ | 面板状态提为纯函数 `providerPanelState`（total：off / loading / ready / none，任何情况都有文案）；开关纳入 effect 依赖；字号从 `--text-11/10` 提到 `--text-12`（FB-C2 的一半提前落地）；测试里的搜索词用 ASCII，避免触发 i18n 门禁的「中文只允许出现在 zh-CN 资源」 |

## 已知限制（滚动更新）

- `budget:check` 的 music chunk 超限（109 KiB vs 96 000 B）为既有问题，计划在 M20 处理，本轮不提高预算。
- kuwo 源当前上游 400（实测），属上游状态；本仓库只保证「失败可见 + 可关闭」。
- 服务器型音源受 `global_fetch_strictly_public` 约束，只能指向公网 HTTPS；LAN 自建服务需反向代理 / 隧道（Alist 今天同样受限），该限制写进文档而非绕过。
- `blog-frontend/src/components/music/` 与 app 版不共享代码（独立实现），本轮不动。

## 不做清单（保留既有决策）

榜单 / 平台歌单导入（FEA-A1-6）、跨设备偏好同步（IMP-12）、RMS→LUFS（IMP-13）、10 段 EQ（IMP-14）、视频 crossfade（IMP-15）、KV 单文件 25MB（IMP-16）、WebDAV 后台缓冲（IMP-17）。
