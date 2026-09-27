# 音乐库整改执行计划（第二轮 · Freebuff · 2026-09-28）

> 依据：`docs/improvement/music/review-with-freebuff-2.md`（二次复审报告，14 项 + 三重盲区结论）。
> 分支：`dev` 直接逐项提交。
> 约定：每个条目 = 一个原子提交；顺序执行；**先写能失败的复现测试**（jsdom 契约 / worker 契约 / 收集器纯函数契约；几何与视觉类由浏览器门禁先红），实现后跑回归再提交。
> **每次提交都必须更新本文件**（勾选、commit 短哈希、进度日志一行）；发现新问题或结论变化时同步更新 review 文档；批次末一次 `docs(music)` 提交统一回填短哈希。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 门禁备注：新增 / 修改注释后必须 `node scripts/sync-comments-allowlist.mjs`（双向失败）；UI 与几何改动用 `scripts/e2e-visual.mjs` / `scripts/check-contrast.mjs`（`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` + `INKSTONE_CHROME_PATH`）；`git add` 只列本次文件，不用 `-A`。
> hash 回填约定：提交无法写入自己的短哈希，因此每条进度行的 hash 在**下一个提交**里回填（每次提交都更新本文件不变）。

## M0 · 文档基线

- [x] M0 写入 `review-with-freebuff-2.md`（完整报告：三重盲区结论 + 14 项清单 + 对标缺口 + 门禁缺口）与 `plan-with-freebuff-2.md`（本跟踪表）

## M① · P0 可用性

- [ ] M1 FB2-F1 + FB2-F4 在线导入改由 worker 自取封面与歌词（body 只留元数据 + `coverId`/`lyricId`；`storeCoverBytes`；`resolveProviderLyric`；换源候选同改）
- [ ] M2 FB2-F2 文件夹上传去掉 `webkitdirectory` 与原生确认框（递归拖放收集器 + `showDirectoryPicker` + 诚实降级）

## M② · 布局与信息

- [ ] M3 FB2-U2 工具栏：先量后改，紧凑档阈值与「能放下的宽度」同源 + 溢出行右对齐 + 门禁补中间档位
- [ ] M4 FB2-U1 沉浸层：播放队列搬到左列并复用带搜索的 `MusicQueueBrowser`（窄版保留底部条带）
- [ ] M5 FB2-F3 时长口径：在线结果行不再逐行重复「未知」+ 首次播放回填真实长度
- [ ] M6 FB2-PF1 封面抓取独立预算族（翻页看图不再花播放额度）

## M③ · 在线链路门禁与行态

- [ ] M7 FB2-C1 + FB2-C2 在线搜索 / 导入链路纳入浏览器门禁（请求拦截造桩）+ body 形状契约测试
- [ ] M8 FB2-U3 + FB2-U4 在线行三态（试听中 / 添加中 / 已在库中）+ 面板高度与嵌套滚动

## M④ · 复核与收尾

- [ ] M9 FB2-U6 窄版沉浸层复核（+ FB2-U5 侧栏留白判断后做或记理由不做）
- [ ] M10 收尾：报告定稿（逐项状态 + 已知限制 + 不做清单）+ 计划回填全部哈希
- [ ] M11（可选、独立、非音乐）FB2-F2b 备份文件夹还原复用同一个收集器

## 每项验收标准（通用）

1. 复现测试先红（新增 / 修改 `src/client/features/music/*.test.ts`、`src/worker/routes/music/*.test.ts` 或 `tests/*.test.ts`；几何与视觉类由 `scripts/e2e-visual.mjs` 先红），进度日志里写下失败条数与原因。
2. 实现后：定向测试绿 + `npm run test:unit` 绿 + `npm run typecheck` 绿 + 静态门禁 13 项绿（`style:check`、`size:check`、`comments:check`、`escape:check`、`empty-catch:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`vendor:check`、`budget:check`）。
3. UI / 几何 / 对比度改动：`scripts/e2e-visual.mjs` + `npm run contrast:check` 对 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` 实例全绿（不可跑时如实写「已知限制」并保留待补跑标记）。
4. **几何类铁律**：任何用户可拖动 / 缩放 / 定位 / 布局的能力，验收必须含一条真实浏览器断言，jsdom 断言 store **不算**验收。
5. 新用户可见文案双语（`npm run i18n:check`）；不夹带无关重构 / 格式化（铁律 14）。
6. 每次提交都更新本文件；短哈希在下一个提交回填。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-28 | M0 文档基线（二次复审报告 + 执行计划） | `待回填` | —（无代码改动，静态门禁与单测不适用） | 报告结论均落到文件:行或实测量；浏览器门禁在 M1 起逐项补跑 |
