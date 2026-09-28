# 音乐库整改执行计划（第三轮 · Freebuff · 2026-09-28）

> 依据：`docs/improvement/music/review-with-freebuff-3.md`（三次复审报告：20 项 + otter-music 对标 + 全量纳入决定）。
> 分支：`dev` 直接逐项提交。约定与前两轮一致：每个条目 = 一个原子提交；先写能失败的复现测试（jsdom / worker 契约 / 门禁几何）；实现后跑回归再提交。
> **没有「本轮之外」分桶**：报告里登记的每一项都在下表里，逐条做。唯一不进表的是**规范红线项**（`AGENTS.md` 铁律 1 不允许降级的那一类，例如把第三方平台 Cookie 存进本系统），它们不是「本轮不做」，而是按规范禁止，理由写在 review §H。
> **每次提交都必须更新本文件**（勾选、commit 短哈希、进度日志一行）；发现新问题或结论变化时同步更新 review 文档；批次末一次 `docs(music)` 提交统一回填短哈希。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> 门禁备注：新增 / 修改注释后必须 `node scripts/sync-comments-allowlist.mjs`（双向失败）；UI 与几何改动跑 `scripts/e2e-visual.mjs` / `npm run contrast:check`（实例：`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`，需要 `INKSTONE_CHROME_PATH`）；`git add` 只列本次文件，不用 `-A`。
> hash 回填约定：提交无法写入自己的短哈希，因此每条进度行的 hash 在**下一个提交**里回填。

## M0 · 文档基线

- [x] M0 写入 `review-with-freebuff-3.md`（20 项 + 对标 + 全量纳入）与 `plan-with-freebuff-3.md`（本跟踪表）—— **commit `6bb60132`**
- [x] M0b 按「全做」重写两份文档：取消「本轮之外 / 登记不做」分桶，把 FB3-F2/F4/F6/F7/F8/U7 全部纳入下表并排出批次

## M① · 点名症状（P0）

- [x] M1 FB3-U1 + FB3-U5 + FB3-C1 搜索框 × 不清查询（`clearAll` 语义错）→ 清查询（新增 `clearQuery`，与历史的 `clearAll` 分开）+ 焦点留在输入框；门禁新增 `assertMusicSearchClear` 四条（空态与筛选 / × 清查询且列表回来 / 焦点与历史未被触碰 / 弹出动作只清历史）—— **commit `待回填`**
- [ ] M2 FB3-U2 + FB3-U9 + FB3-C3 沉浸层队列默认态按形态分档（宽版默认展开、窄版默认折叠；读者按压后按读者的）+ 门禁补「宽版刚打开即展开」「窄版默认折叠」「展开后队列至少一行可见且不出现第二滚动条」
- [ ] M3 FB3-U3 + FB3-C2 设置面板三处：EQ 预设行容器查询换挡（`@[24rem]:grid-cols-5`）、服务器表单标签列 subgrid 对齐、去掉重复说明并拆出动作向的表单说明

## M② · 信息与历史（P1）

- [ ] M4 FB3-U4 + FB3-U8 查询态空态改为「曲库中没有匹配的歌曲」并指向在线结果；空态动作文案与 × 区分
- [ ] M5 FB3-F5 搜索历史完整度：逐条删除 + 记录时机（提交落库、点历史项也算）+ 空态后仍能清历史

## M③ · 在线音源（P1 / P2）

- [ ] M6 FB3-F1 + FB3-U6 + FB3-S1 单源检索范围：偏好 `providerScope`（白名单校验）+ 面板同排的范围选择器 + 只扇出选中源 + 契约测试（非法取值按未传入、不放宽出站白名单）
- [ ] M7 FB3-P1 检索成本：按 `(scope, keywords)` 的会话内短 TTL 记忆，改回一个字再改回来不再重新扇出
- [ ] M8 FB3-F2 逐源开关与顺序：设置页逐源开关 + 排序（聚合顺序同时被「合并顺序」与「换源候选」消费）
- [ ] M9 FB3-F8 在线检索建议：在线命中与本地建议并列呈现（优先给「已经在你库里/可直达的源」分组），不引入第三方接口

## M④ · 设置项补缺（P2）

- [ ] M10 FB3-F3 设置页补「音量」滑杆与睡眠 / 倍速入口（复用既有组件，不新造）
- [ ] M11 FB3-F4 下载设置：离线补齐音质选择 + 「嵌入封面/歌词」选项（含浏览器侧封装的技术选型与降级说明）
- [ ] M12 FB3-F6 设置页分组顺序：播放默认前置（服务器组后置），并补一条顺序断言

## M⑤ · 体验收尾（P3）

- [ ] M13 FB3-F7 为「最近播放 / 失效行」补一键在线补齐（复用 `openSourceSwitch` 与健康扫描的既有能力）
- [ ] M14 FB3-U7 沉浸层左列两行「多少」的行为分级复核（随 M2 的形态断言一起读）
- [ ] M15 报告定稿：逐项状态 + 已知限制 + 全量清单回填哈希

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
| 2026-09-28 | M1 FB3-U1 + FB3-U5 + FB3-C1 搜索框 × 清查询（先红后改） | `待回填` | 先红（单测）：`music-search-box.test.ts` 新增 3 例（× 清空输入与 store 查询且不动历史 / 清空后焦点仍在输入框并回到历史形态 / 弹出里的动作仍只清历史），对 HEAD 跑得 **2 failed / 15 passed**——× 走的是 `clearAll`（清历史），输入框文本与 store 查询都没动。实现：`useSearchPopup` 新增 `clearQuery`（`setText('')` + `flush('')` + 收起高亮），`SearchBox` 给输入框持有 ref 并在 × 后把焦点交回。回归：`npx vitest run src/client/features/music` **120 文件 / 955 例 ✅**；`npm run typecheck` ✅。门禁：新增 `assertMusicSearchClear`（四读：无命中即空态 / × 清查询且列表回来 / 焦点在框内且历史未被触碰 / 弹出动作只清历史），`LABELS` 补 `musicSearchClearHistory` 与 `musicSearchEmptyAction` | 门禁四条断言与 M2/M3 的门禁改动一并跑（同一实例一次运行），结果记在 M3 的进度行；只跑单测时这四条未被执行 |
| 2026-09-28 | M0b 按「全做」重写两份文档 | `待回填` | —（无代码改动） | — |
| 2026-09-28 | M0 文档基线（三次复审报告 + 执行计划） | `6bb60132` | —（无代码改动） | 报告中的对标结论以参考项目源码/README 为据，未运行参考项目 |
