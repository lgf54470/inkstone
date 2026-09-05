/** Coordinates the note cache, offline write-ahead log, optimistic updates, and server synchronization.
 *
 * This file is the composition root of the notes store: it owns the zustand store
 * instance (`useNotes`) and the store-level undo/toast helpers. The heavy lifting
 * lives in `store/notes/` — see `model.ts` (state), `persist.ts` (write staging),
 * `outbox.ts` (offline replay), `reconcile.ts` (merge), and `selectors.ts` (hooks).
 */

import { create } from 'zustand';
import { boot } from './boot';
import { open } from './open';
import { edit } from './edit';
import { noteActions } from './note-actions';
import { destructive } from './destructive';
import { folderActions } from './folder-actions';
import type { NotesState } from './model';

export const useNotes = create<NotesState>((set, get) => ({
notes: {},

    contents: {},

    folders: [],

    tags: [],

    cursor: 0,

    hydrated: false,

    loading: false,

    saveStatus: 'idle',

    lastSavedAt: 0,

    pendingCount: 0,

    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    ...boot(set, get),
    ...open(set, get),
    ...edit(set, get),
    ...noteActions(set, get),
    ...destructive(set, get),
    ...folderActions(set, get),
}));

export type { NotesState, SaveStatus } from './model';
