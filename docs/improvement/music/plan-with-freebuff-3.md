# 音乐库整改执行计划（第三轮 · Freebuff · 2026-09-28）

> 依据：`docs/improvement/music/review-with-freebuff-3.md`（三次复审报告：20 项清单 + otter-music 对标 + 分级判断）。
> 分支：`dev` 直接逐项提交。约定与前两轮一致：每个条目 = 一个原子提交；先写能失败的复现测试（jsdom / worker 契约 / 门禁几何）；实现后跑回归再提交。
> **每次提交都必须更新本文件**（勾选、commit 短哈希、进度日志一行）；发现新问题或结论变化时同步更新 review 文档；批次末一次 `docs(music)` 提交统一回填短哈希。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）· `[⏸]` 本轮不做
> 门禁备注：新增 / 修改注释后必须 `node scripts/sync-comments-allowlist.mjs`（双向失败）；UI 与几何改动跑 `scripts/e2e-visual.mjs` / `npm run contrast:check`（实例：`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`）；`git add` 只列本次文件，不用 `-A`。
> hash 回填约定：提交无法写入自己的短哈希，因此每条进度行的 hash 在**下一个提交**里回填。

## M0 · 文档基线

- [ ] M0 写入 `review-with-freebuff-3.md`（20 项 + 对标 + 不做清单）与 `plan-with-freebuff-3.md`（本跟踪表）

## M① · 点名症状（P0）

- [ ] M1 FB3-U1 + FB3-U5 + FB3-C1 搜索框 × 不清查询（`clearAll` 语义错）→ 清查询 + 收起浮层 + 焦点留在输入框；门禁补「有字时 × 清查询」「历史形态只清历史」两条
- [ ] M2 FB3-U2 + FB3-U9 + FB3-C3 沉浸层队列默认态按形态分档（宽版默认展开、窄版默认折叠；读者按压后按读者的）+ 门禁补「宽版刚打开即展开」「窄版默认折叠」「展开后队列至少一行可见」三条
- [ ] M3 FB3-U3 + FB3-C2 设置面板三处：EQ 预设行容器查询换挡（`@[24rem]:grid-cols-5`）、服务器表单标签列 subgrid 对齐、去掉重复说明并拆出动作向的表单说明

## M② · 信息与历史（P1）

- [ ] M4 FB3-U4 + FB3-U8 查询态空态改为「曲库中没有匹配的歌曲」并指向在线结果；空态动作文案与 × 区分
- [ ] M5 FB3-F5 搜索历史：逐条删除 + 记录时机与示例清理

## M③ · 在线音源粒度（P1，本轮核心产品项）

- [ ] M6 FB3-F1 + FB3-U6 + FB3-S1 + FB3-P1 单源检索范围：偏好 `providerScope`（白名单）+ 面板同排的范围选择器 + 只扇出选中源 + 契约测试（非法取值按未传入）+ 会话内短 TTL 记忆

## M④ · 设置项补缺（P2）

- [ ] M7 FB3-F3 设置页补「音量」滑杆与睡眠/倍速入口（复用既有组件，不新造）

## M⑤ · 本轮之外（下一轮候选，登记不做）

- [ ] M8 ⏸ FB3-F2 逐源开关与顺序（需与 worker 逐源预算、失败源提示、聚合顺序一起设计）
- [ ] M9 ⏸ FB3-F4 下载设置（先做技术选型：浏览器侧能否把封面/歌词写进容器）
- [ ] M10 ⏸ FB3-F6 设置页分组顺序（信息架构判断，交维护者）
- [ ] M11 ⏸ FB3-F7 / FB3-F8（为最近播放补齐在线源、在线搜索建议）
- [ ] M12 ⏸ FB3-U7（两行「多少」行为不同级的观察项）

## 每项验收标准（通用）

1. 复现测试先红（新增 / 修改 `src/client/features/music/*.test.ts`、`src/worker/routes/music/*.test.ts` 或 `tests/*.test.ts`；几何与默认态类由 `scripts/e2e-visual.mjs` 先红），进度日志里写下失败条数与原因。
2. 实现后：定向测试绿 + `npm run test:unit` 绿 + `npm run typecheck` 绿 + 静态门禁 13 项绿（`style:check`、`size:check`、`comments:check`、`escape:check`、`empty-catch:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`module-state:check`、`deep-imports:check`、`surfaces:check`、`vendor:check`、`budget:check`）。
3. UI / 几何 / 对比度改动：`scripts/e2e-visual.mjs` + `npm run contrast:check` 对本地实例全绿（不可跑时如实写「已知限制」并保留待补跑标记）。
4. **几何类铁律**：任何用户可拖动 / 缩放 / 定位 / 布局 / 默认态的能力，验收必须含一条真实浏览器断言，jsdom 断言 store **不算**验收。
5. 新用户可见文案双语（`npm run i18n:check`）；不夹带无关重构 / 格式化（铁律 14）。
6. 每次提交都更新本文件；短哈希在下一个提交回填。

## 进度日志

| 日期 | 条目 | commit | 回归结果 | 已知限制 |
| --- | --- | --- | --- | --- |
| 2026-09-28 | M0 文档基线（三次复审报告 + 执行计划） | `待回填` | —（无代码改动） | 报告中的对标结论以参考项目源码/README 为据，未运行参考项目 |
