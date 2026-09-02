# Notes Store Module Map

`src/client/store/notes.ts` is the **composition root** of the notes store: it holds the zustand
`useNotes` instance, store-level undo/toast helpers (`patchWithUndo`/`batchPatchTitle`/`toastError`),
the `NotePatch` type, and delegates all state and business logic by responsibility to the modules in this directory.
When introducing new logic, determine its owning module first rather than accumulating it in `notes.ts`.

## Responsibilities

| Module | Responsibility | Dependency Direction |
| --- | --- | --- |
| `model.ts` | Types (`NotesState`/`SaveStatus`/pending types) + module-level singleton state; mutable scalars are held in the `noteState` container | Depends only on shared/lib/`ui` types, **never depends on sibling modules** |
| `util.ts` | Local id/writeId generation, outbox key, `hasOwnContent`/`equalStringArrays` | Only lib/api, lib/db types |
| `sync.ts` | Full sync page collection and consolidation (`collectFullSync`/`consolidateFullSync`) | Only lib/api, lib/i18n |
| `new-note.ts` | New note template expansion, front-matter title readback, cursor memory (`pendingEditorCursors`) | Leaf: shared/lib/`session`/`ui` |
| `workspace.ts` | View initial note selection, workspace state snapshot/restore, sorting comparators | Leaf: lib/*, `session`/`ui` |
| `shell-save.ts` | `scheduleShellSave` — shell cache persistence scheduling | model + lib/db |
| `reconcile.ts` | Merging remote (summary/list/folder/tag) with local optimistic state (pure functions) | model + `ui` |
| `folder-ops.ts` | Pure folder tree operations: insertion position, delete promotion, optimistic patches, `applyPendingFolderMutations` | model |
| `summary.ts` | Delayed summary derivation during editing (excerpt/words/tags), `normalizeNoteSummaryTags` | model + shell-save + util + shared |
| `persist.ts` | Text write staging: `stageNoteTextWrite` (coalescer + outbox), `enqueueNoteWrite`/`enqueueFolderWrite` per-entity serialization | model + util + summary + shell-save |
| `folder-mutations.ts` | Folder optimistic mutations begin/commit/rollback | model + folder-ops + reconcile + shell-save |
| `note-mutations.ts` | Note optimistic summary mutations begin/finish/rollback + conflict recovery `recoverNoteMutation` | model + reconcile + adopt + shell-save |
| `adopt.ts` | `adoptNote`/`requestNote`/`revalidateNote` — adopt server notes into store and content cache | model + reconcile + shell-save |
| `runtime.ts` | Offline log runtime: rev advancement, dependent outbox write progression, purge snapshot, rebase/settle/deletion cursor | model + adopt + reconcile + shell-save + `ui` |
| `outbox.ts` | Outbox replay (topological dependency ordering, conflict rebase, 404 recovery to copy), `showOfflineRecoveryToast`, `pendingNoteCount` | model + runtime + adopt + util + workspace + shell-save |
| `acknowledge.ts` | Cross-tab broadcast acknowledgement (`outbox-result`/`outbox-base-advanced`) | Unidirectional import of `useNotes` from `../notes` |
| `selectors.ts` | Read-side hooks/selectors: visible list, navigation counts, folder tree, active note, `createContextualNote`, `setOptimisticTagCache` | Unidirectional import of `useNotes` from `../notes` |

## Dependency Graph

```
                        ┌────────────────────────────────────┐
                        │  store/notes.ts (composition root) │
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
         │  shell-save  ◄── summary    │        │  util    new-note        │
         │  sync       new-note        │        │  workspace  sync         │
         └─────────────────────────────┘        └──────────────────────────┘
                      │                                      │
                      ▼                                      ▼
         ┌─────────────────────────────┐        ┌──────────────────────────┐
         │            model            │        │ (leaf lib / shared /     │
         │  (types + noteState + maps) │        │  session / ui)           │
         └─────────────────────────────┘        └──────────────────────────┘
```

**Store downstream (not imported by composition root)**:

```
 selectors.ts ──► store/notes.ts (useNotes)       acknowledge.ts ──► store/notes.ts (useNotes)
      ▲                                                     ▲
      └── workspace.ts (compare/compareTrash)               └── outbox.ts / runtime.ts / workspace.ts
```

## Acyclic Invariants (Hard Rules)

1. `model.ts` is the only module in this directory permitted to hold **mutable module-level state**, and must never import any sibling modules.
2. Scalars involved in cross-module assignment/increment (`saveTimer`, `*Generation`, promise slots) must live in the `noteState` container — ESM import bindings are read-only, and cannot be reassigned after `import { x }`.
3. All helper functions receive store access via `set`/`get` arguments and **must not** directly `import { useNotes }` — keeping all modules leaf-like except `selectors.ts`/`acknowledge.ts`.
4. Only `selectors.ts` and `acknowledge.ts` are allowed to import `useNotes` from `../notes` unidirectionally; consider parameter passing before introducing any new module of this kind.

## Guidelines for New Code

- Read-side queries/hooks → `selectors.ts`; write-path pure algorithms → `reconcile.ts`/`folder-ops.ts`/`util.ts`; optimistic mutation lifecycle → `*-mutations.ts`; offline logging/replay → `runtime.ts`/`outbox.ts`; persistence scheduling → `persist.ts`/`shell-save.ts`.
- Functions shared across modules must be exported; internal helpers must stay private.
- Always run `npm run typecheck` and `npm run test:unit` (`notes.test.ts` covers store integration behavior).