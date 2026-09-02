/** Notes store model: shared types plus module-level mutable state (single browser-tab singletons). */
import type { StoreApi } from 'zustand';
import type { Folder, Note, NoteSummary, SyncResponse, Tag } from '@shared/types';
import type { BroadcastPayload } from '../../lib/db';
import { localDb } from '../../lib/db';
import { NotePersistCoalescer } from '../../lib/note-persist';
import type { WorkspacePane } from '../ui';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'synced' | 'offline';
export interface NotesState {
    notes: Record<string, NoteSummary>;
    contents: Record<string, string>;
    folders: Folder[];
    tags: Tag[];
    cursor: number;
    hydrated: boolean;
    loading: boolean;
    saveStatus: SaveStatus;
    lastSavedAt: number;
    pendingCount: number;
    online: boolean;
    bootstrap: () => Promise<void>;
    pull: (options?: {
        force?: boolean;
    }) => Promise<void>;
    openNote: (id: string, options?: {
        pane?: WorkspacePane;
        activate?: boolean;
    }) => Promise<void>;
    peekContent: (id: string) => Promise<string | null>;
    editTitle: (id: string, title: string) => void;
    editContent: (id: string, content: string) => void;
    flush: (options?: {
        immediate?: boolean;
    }) => Promise<void>;
    createNote: (input?: {
        id?: string;
        title?: string;
        content?: string;
        /** Tags when creating from a tag view: added to the front matter tags and available as the `{{tags}}` context. */
        tags?: string[];
        folderId?: string | null;
        isStarred?: boolean;
        open?: boolean;
    }) => Promise<string | null>;
    patchNote: (id: string, patch: Partial<Pick<NoteSummary, 'isPinned' | 'isStarred' | 'isArchived'>> & {
        folderId?: string | null;
    }) => Promise<void>;
    /** Archive or unarchive a note, posting a store-level undo toast (`notify: 'confirm'` confirms a silent revert, `'none'` reverts silently for batch undos). */
    setArchived: (id: string, archived: boolean, options?: {
        notify?: 'undo' | 'confirm' | 'none';
    }) => Promise<void>;
    /** Archive or unarchive many notes with one shared undo toast that reverts the whole batch. */
    setArchivedMany: (ids: string[], archived: boolean) => Promise<void>;
    /** Star or unstar a note, posting a store-level undo toast (`notify` mirrors `setArchived`). */
    setStarred: (id: string, starred: boolean, options?: {
        notify?: 'undo' | 'confirm' | 'none';
    }) => Promise<void>;
    /** Star or unstar many notes with one shared undo toast. */
    setStarredMany: (ids: string[], starred: boolean) => Promise<void>;
    /** Pin or unpin a note, posting a store-level undo toast (`notify` mirrors `setArchived`). */
    setPinned: (id: string, pinned: boolean, options?: {
        notify?: 'undo' | 'confirm' | 'none';
    }) => Promise<void>;
    /** Pin or unpin many notes with one shared undo toast. */
    setPinnedMany: (ids: string[], pinned: boolean) => Promise<void>;
    /** Move notes to a folder (null = unfiled) with one undo toast restoring each note's previous folder. */
    moveNotes: (ids: string[], folderId: string | null) => Promise<void>;
    deleteNote: (id: string) => Promise<void>;
    restoreNote: (id: string) => Promise<void>;
    restoreVersion: (id: string, versionId: string, content: string, title?: string) => Promise<boolean>;
    purgeNote: (id: string) => Promise<void>;
    emptyTrash: () => Promise<number | null>;
    duplicateNote: (id: string) => Promise<void>;
    createFolder: (input?: {
        name?: string;
        parentId?: string | null;
        icon?: string | null;
        color?: string | null;
    }) => string | null;
    patchFolder: (id: string, patch: {
        name?: string;
        parentId?: string | null;
        beforeId?: string | null;
        icon?: string | null;
        color?: string | null;
    }) => boolean;
    deleteFolder: (id: string) => boolean;
    refreshFolders: () => Promise<void>;
    refreshTags: () => Promise<void>;
    replayPending: () => Promise<void>;
    setOnline: (online: boolean) => void;
    applySync: (payload: SyncResponse) => void;
}
export type SetNotesState = StoreApi<NotesState>['setState'];
export const SUMMARY_DERIVE_DELAY_MS = 400;
export interface PendingSummaryDerivation {
    content: string;
    updatedAt: number;
    timer: number;
    set: SetNotesState;
    get: () => NotesState;
}
/** Mutable scalar state shared across modules. Imported ESM bindings are read-only,
 * so assigned-through singletons (timers, generations, promise slots) live in this object. */
export const noteState = {
    saveTimer: undefined as number | undefined,
    bootstrapPromise: null as Promise<void> | null,
    pullPromise: null as Promise<void> | null,
    forcePullQueued: false,
    outboxReplayPromise: null as Promise<void> | null,
    folderStateGeneration: 0,
    tagStateGeneration: 0,
    folderRefreshSequence: 0,
    tagRefreshSequence: 0,
};

export const pendingSummaryDerivations = new Map<string, PendingSummaryDerivation>();
export const openSequences: Record<WorkspacePane, number> = { primary: 0, secondary: 0 };
export const latestRequestedNoteIds: Record<WorkspacePane, string | null> = { primary: null, secondary: null };

export const noteWriteTails = new Map<string, Promise<void>>();
export type OptimisticNotePatch = Partial<Pick<NoteSummary, 'folderId' | 'isPinned' | 'isStarred' | 'isArchived' | 'deletedAt' | 'updatedAt'>>;
export interface PendingNoteMutation {
    patch: OptimisticNotePatch;
    before: NoteSummary;
}

export const pendingNoteMutations = new Map<string, PendingNoteMutation[]>();
export const pendingNoteCreates = new Map<string, Promise<Note>>();

export interface PendingFolderMutation {
    entityId: string;
    restoreMissingEntity: boolean;
    before: Folder[];
    apply: (folders: Folder[]) => Folder[];
}
export const pendingFolderMutations: PendingFolderMutation[] = [];
export const folderWriteTails = new Map<string, Promise<void>>();

export interface DirtyNoteWrite {
    title?: string;
    content: string;
    contentDirty: boolean;
    rev: number;
    writeId: string;
    queueId: string;
    dependsOnWriteId?: string;
    updatedAt: number;
    persisted: Promise<boolean>;
}
export const dirty = new Map<string, DirtyNoteWrite>();

export const notePersistCoalescer = new NotePersistCoalescer(localDb);

export const inheritedOutboxWrites = new Map<string, string>();
export type RecoveryResult = Pick<
    Extract<BroadcastPayload, { type: 'outbox-result' }>,
    'outcome' | 'recoveryReason' | 'rev' | 'updatedAt' | 'copyId'
>;

export const recoveredOutboxWrites = new Map<string, RecoveryResult>();

export const noteRequests = new Map<string, Promise<Note>>();

export const validatedRevisions = new Map<string, number>();

export const purgedNoteIds = new Map<string, number | null>();
export const noteRequestEpochs = new Map<string, number>();
export const STALE_NOTE_REQUEST = Symbol('stale-note-request');
