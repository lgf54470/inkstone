# 看板（kanban）模块改进计划 — codebuddy/hy4preview

- 分支：`kanban-improvement-codebuddy-hy4preview`
- 工作区：`/home/kubuntu/code/cloudflare/inkstone-kanban-improvement-codebuddy-hy4preview`（git worktree，基线 `dev` @ cc09e4b3）
- 基線：typecheck 通过；`vitest run` 468 套件 / 4259 用例全绿（blog-frontend 依赖软链后 parity 套件也绿）
- 每完成一项：实现 → 相关测试 → 回归（pre-commit 门禁 + 全量 `test:unit`）→ 提交 → 更新本文件

## 进度总览

| # | 类别 | 条目 | 状态 | 提交 |
|---|---|---|---|---|
| 1 | 性能 P-1 | registry 每次挂载重建回调击穿 `KanbanRoot` memo；编辑器每次防抖提交全树重渲染 | ⬜ 待做 | — |
| 2 | 性能 P-3 | 勾选一张卡导致所有展开列重绘（`selectAll` 对象每渲染新建） | ⬜ 待做 | — |
| 3 | 性能 P-4 | 批量拖放 `moveKanbanItemsToCell` O(k·n) 串行 | ⬜ 待做 | — |
| 4 | 安全 S-2 | 打印导出 `dangerouslySetInnerHTML` 重解析已渲染 DOM | ⬜ 待做 | — |
| 5 | 样式 U-5 | `duration-300` 未随 `prefers-reduced-motion` 令牌归零 | ⬜ 待做 | — |
| 6 | 样式 U-1 | `.kanban-print-sheet { left: -100000px }` 魔法数字 | ⬜ 待做 | — |
| 7 | 样式 U-3 | 子任务复选框完成态内联样式 → `data-*` + CSS | ⬜ 待做 | — |
| 8 | 样式 U-7 | 卡片头部 `stopPropagation` 吞掉 onKeyDown，需确认并注释 | ⬜ 待做 | — |
| 9 | 安全 S-3 | 跨域文本预览 `res.text()` 无体积上限 | ⬜ 待做 | — |
| 10 | 安全 S-4 | `data:image/*` 白名单放行 `file.url` | ⬜ 待做 | — |
| 11 | 安全 S-6 | fence JSON 无字段长度约束 | ⬜ 待做 | — |
| 12 | 功能 F-1 | WIP 超限只提示不阻止落卡 | ⬜ 待做 | — |
| 13 | 功能 F-2 | 截止日临期/逾期提示 | ⬜ 待做 | — |
| 14 | 功能 F-8 | 新增 `url` 属性类型 | ⬜ 待做 | — |
| 15 | 功能 F-10 | JSON 一键导出 | ⬜ 待做 | — |
| 16 | 性能 P-2 | 渲染窗口只增不减（滚到底等效全量挂载） | ⬜ 待做 | — |
| 17 | 性能 P-5 | 时间轴/甘特条几何重复计算两遍 | ⬜ 待做 | — |

## 记录

### 1. 性能 P-1 — registry 击穿 memo

- 问题：`renderKanbanEntry` 每次调用新造 `onUpdateData/onRetryWrite/onDiscardWrite/onToggleFullscreen` 四个闭包，`KanbanRoot` 是 `memo`，浅比较必然失败；而 `mountBlock` 在每次预览提交（编辑器打字 90ms 防抖后）末尾无条件调用它，即使 fence body 一字未变。
- 方案：回调改为 entry 上按「是否可写」缓存的稳定处理器；`mountBlock` 增加渲染指纹，指纹未变则跳过 `root.render`。
- 风险点：`entry.data` / `unsaved` / `owner` / `editable` / `renderDescription` / `noteId` 任一项变化仍必须重渲染。
- 状态：⬜ 待做
