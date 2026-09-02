# notes store 模块地图

`src/client/store/notes.ts` 是笔记 store 的**组成根**（composition root）：它持有 zustand
`useNotes` 实例、store 级 undo/toast 辅助（`patchWithUndo`/`batchPatchTitle`/`toastError`）、
`NotePatch` 类型，并把全部状态与逻辑按职责委托给本目录的模块。任何新逻辑请先判断归属模块，
不要在 `notes.ts` 里继续堆积。

## 职责划分

| 模块 | 职责 | 依赖方向 |
| --- | --- | --- |
| `model.ts` | 类型（`NotesState`/`SaveStatus`/各类 pending 类型）+ 模块级单例状态；可写标量收在 `noteState` 容器 | 只依赖 shared/lib/`ui` 类型，**不依赖本目录任何模块** |
| `util.ts` | 本地 id/writeId 生成、outbox key、`hasOwnContent`/`equalStringArrays` | 仅 lib/api、lib/db 类型 |
| `sync.ts` | 全量同步分页收集与合并（`collectFullSync`/`consolidateFullSync`） | 仅 lib/api、lib/i18n |
| `new-note.ts` | 新建笔记模板展开、front-matter title 回读、光标记忆（`pendingEditorCursors`） | 叶子：shared/lib/`session`/`ui` |
| `workspace.ts` | 视图初始笔记选择、工作区状态快照/恢复、排序比较器 | 叶子：lib/*、`session`/`ui` |
| `shell-save.ts` | `scheduleShellSave`——shell 缓存落库调度 | model + lib/db |
| `reconcile.ts` | 远端（摘要/列表/目录/标签）与本地乐观状态的合并（纯函数为主） | model + `ui` |
| `folder-ops.ts` | 纯文件夹树操作：插入位置、删除提升、乐观补丁、`applyPendingFolderMutations` | model |
| `summary.ts` | 编辑期摘要延迟推导（excerpt/字数/tags）、`normalizeNoteSummaryTags` | model + shell-save + util + shared |
| `persist.ts` | 文本写阶段：`stageNoteTextWrite`（coalescer + outbox），`enqueueNoteWrite`/`enqueueFolderWrite` 每实体串行化 | model + util + summary + shell-save |
| `folder-mutations.ts` | 文件夹乐观变更 begin/commit/rollback | model + folder-ops + reconcile + shell-save |
| `note-mutations.ts` | 笔记乐观摘要变更 begin/finish/rollback + 冲突恢复 `recoverNoteMutation` | model + reconcile + adopt + shell-save |
| `adopt.ts` | `adoptNote`/`requestNote`/`revalidateNote`——采纳服务端笔记进 store 与内容缓存 | model + reconcile + shell-save |
| `runtime.ts` | 离线日志运行时：rev 前进、依赖出站写推进、purge 快照、rebase/settle/deletion cursor | model + adopt + reconcile + shell-save + `ui` |
| `outbox.ts` | 出站队列重放（依赖拓扑排序、冲突 rebase、404 恢复成副本）、`showOfflineRecoveryToast`、`pendingNoteCount` | model + runtime + adopt + util + workspace + shell-save |
| `acknowledge.ts` | 跨标签广播确认（`outbox-result`/`outbox-base-advanced`） | 单向引用 `../notes` 的 `useNotes` |
| `selectors.ts` | 读侧 hooks/选择器：可见列表、导航计数、文件夹树、活动笔记、`createContextualNote`、`setOptimisticTagCache` | 单向引用 `../notes` 的 `useNotes` |

## 依赖图

```
                        ┌────────────────────────────────────┐
                        │  store/notes.ts（组成根，usesNotes） │
                        └────────────────────────────────────┘
                          │          │          │          │
            ┌─────────────┘          │          │          └─────────────┐
            ▼                          ▼          ▼                        ▼
 ┌─────────────────────┐   ┌──────────────────────┐  ┌──────────────────────┐
 │ folder-mutations    │   │ note-mutations       │  │ persist              │
 │ summary             │   │ adopt                │  │                      │
 └─────────────────────┘   └──────────────────────┘  └──────────────────────┘
            │          │             │       │                 │     │
            ▼          ▼             ▼       ▼                 ▼     ▼
   ┌──────────────┐  ┌───────────────────────────────────────────────┐
   │ reconcile    │  │ runtime ──► outbox                            │
   │ folder-ops   │  └───────────────────────────────────────────────┘
   └──────────────┘           │        │        │        │
            │                 ▼        ▼        ▼        ▼
            └────────┬────────┴────────┴────────┴────────┴────────┐
                     ▼                                            ▼
        ┌─────────────────────────────┐        ┌──────────────────────────┐
        │  shell-save  ◄── summary     │        │  util    new-note        │
        │  sync       new-note         │        │  workspace  sync         │
        └─────────────────────────────┘        └──────────────────────────┘
                     │                                      │
                     ▼                                      ▼
        ┌─────────────────────────────┐        ┌──────────────────────────┐
        │            model            │        │（叶子 lib / shared /      │
        │  (types + noteState + maps) │        │  session / ui）           │
        └─────────────────────────────┘        └──────────────────────────┘
```

**store 下游（不被组成根导入）**：

```
 selectors.ts ──► store/notes.ts（useNotes）       acknowledge.ts ──► store/notes.ts（useNotes）
      ▲                                                     ▲
      └── workspace.ts（compare/compareTrash）               └── outbox.ts / runtime.ts / workspace.ts
```

## 无环约束（硬规则）

1. `model.ts` 是本目录唯一允许持有**可写模块级状态**的地方，且不得导入任何同级模块。
2. 涉及跨模块赋值/递增的标量（`saveTimer`、`*Generation`、promise 槽）必须走 `noteState` 容器——
   ESM 导入绑定只读，`import { x }` 后不能赋值。
3. 所有帮助函数都以 `set`/`get` 参数接收 store 访问，**不得**直接 `import { useNotes }`——
   这样除 `selectors.ts`/`acknowledge.ts` 外全部保持叶化。
4. 只有 `selectors.ts` 与 `acknowledge.ts` 被允许单向导入 `../notes` 的 `useNotes`；
   新增此类模块前先考虑能否改为参数传递，保持依赖图无环。

## 新增代码指南

- 读侧查询/hook → `selectors.ts`；写路径纯算法 → `reconcile.ts`/`folder-ops.ts`/`util.ts`；
  乐观变更生命周期 → `*-mutations.ts`；离线日志/重放 → `runtime.ts`/`outbox.ts`；持久化调度 → `persist.ts`/`shell-save.ts`。
- 模块间函数都必须 `export`；仅本文件使用的保持私有。
- 改动后跑 `npm run typecheck` 与 `npm run test:unit`（`notes.test.ts` 覆盖 store 集成行为）。