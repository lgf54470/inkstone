/** Coordinates the note cache, offline write-ahead log, optimistic updates, and server synchronization.
 *
 * This file is the composition root of the notes store: it owns the zustand store
 * instance (`useNotes`) and the store-level undo/toast helpers. The heavy lifting
 * lives in `store/notes/` — see `model.ts` (state), `persist.ts` (write staging),
 * `outbox.ts` (offline replay), `reconcile.ts` (merge), and `selectors.ts` (hooks).
 */
import { create } from 'zustand';
import { countText, deriveExcerpt, extractTags, setFrontMatterProperty } from '@shared/markdown-utils';
import { duplicateNoteTitle } from '@shared/text-utils';
import { LIMITS } from '@shared/constants';
import type { Folder, Note, NoteSummary, SyncResponse } from '@shared/types';
import { api, ApiError, CLIENT_ID } from '../lib/api';
import { localDb } from '../lib/db';
import { adoptNote, revalidateNote, requestNote } from './notes/adopt';
import { beginFolderMutation, commitFolderMutation, finishFolderMutation, rollbackFolderMutation } from './notes/folder-mutations';
import { applyOptimisticFolderPatch, applyPendingFolderMutations, availableLocalFolderName, insertionPositionForFolders, removeFolderAndPromoteChildren } from './notes/folder-ops';
import { beginNoteMutation, compactOptimisticPatch, finishNoteMutation, recoverNoteMutation, rollbackNoteMutation } from './notes/note-mutations';
import { buildNewNoteContent, currentFolderId, frontMatterTitleOf, pendingEditorCursors } from './notes/new-note';
import { pendingNoteCount, replayOutbox } from './notes/outbox';
import { enqueueFolderWrite, enqueueNoteWrite, stageNoteTextWrite } from './notes/persist';
import { folderEqual, mergeById, normalizeFolder, reconcileFolderUi, reconcileList, reconcileNotes, tagEqual } from './notes/reconcile';
import { advanceDirtyRevision, discardNoteRuntimeState, markNotesOptimisticallyPurged, restoreOptimisticallyPurgedNotes, restoreVersionSnapshot, saveDirtyBeforeDestructiveMutation } from './notes/runtime';
import { scheduleShellSave } from './notes/shell-save';
import { commitAllPendingSummaryDerivations, commitPendingSummaryDerivation, normalizeNoteSummaryTags } from './notes/summary';
import { collectFullSync, consolidateFullSync } from './notes/sync';
import { isVirtualFolderId } from '../lib/calendar-tree';
import { hasOwnContent, newLocalEntityId, outboxId } from './notes/util';
import { captureWorkspaceState, pickInitialNoteId, restoreWorkspaceState, workspaceContainsNote } from './notes/workspace';
import {
    dirty,
    inheritedOutboxWrites,
    latestRequestedNoteIds,
    notePersistCoalescer,
    noteRequestEpochs,
    noteState,
    openSequences,
    pendingNoteCreates,
    purgedNoteIds,
    STALE_NOTE_REQUEST,
    validatedRevisions,
    type NotesState,
    type PendingNoteMutation,
} from './notes/model';
import { useSession } from './session';
import { useUi, toastWithUndo, type WorkspacePane } from './ui';
import { t, type MessageKey } from '../lib/i18n';

/** Patch shape accepted by `patchNote` (summary flags plus folder moves). */
type NotePatch = Partial<Pick<NoteSummary, 'isPinned' | 'isStarred' | 'isArchived'>> & {
    folderId?: string | null;
};

/** Undo window for destructive actions (e.g. moving a note to the trash): longer than the default 3800ms. */
const DESTRUCTIVE_UNDO_TOAST_MS = 8000;
/** Batch toast title for a count-aware mutation (e.g. "Moved 3 notes"). */
function batchPatchTitle(key: MessageKey, count: number): string {
    return t("notes.value0_value1_notes", { value0: t(key), value1: count });
}

/**
 * The shared store-level undo contract for light mutations: apply `patch` to every id in
 * `undoPatches`, then offer one undo toast running each note's captured revert patch.
 * `notify: 'confirm'` turns the action into a silent revert that confirms with a plain
 * toast; `'none'` reverts without any toast (batch undos).
 */
async function patchWithUndo(
    get: () => NotesState,
    undoPatches: ReadonlyMap<string, NotePatch>,
    patch: NotePatch,
    title: string,
    revertTitle: string,
    notify: 'undo' | 'confirm' | 'none' = 'undo',
): Promise<void> {
    if (!undoPatches.size)
        return;
    await Promise.all([...undoPatches.keys()].map((id) => get().patchNote(id, patch)));
    if (notify === 'undo') {
        toastWithUndo(title, () => {
            for (const [id, undoPatch] of undoPatches)
                void get().patchNote(id, undoPatch);
            // Single-note reverts confirm with a plain toast describing the reverted state; batch reverts stay silent.
            if (undoPatches.size === 1)
                useUi.getState().toast({ title: revertTitle, tone: 'success' });
        });
        return;
    }
    if (notify === 'confirm')
        useUi.getState().toast({ title: revertTitle, tone: 'success' });
}
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
    bootstrap() {

        if (noteState.bootstrapPromise)
            return noteState.bootstrapPromise;
        const run = async () => {
            set({ loading: true });
            try {
                const userId = useSession.getState().user?.id;
                if (!userId)
                    return;
                await localDb.bindUser(userId);

                const cached = await localDb.loadShell();
                if (cached) {
                    set({
                        notes: Object.fromEntries(cached.notes.map((note) => {
                            const normalized = normalizeNoteSummaryTags(note);
                            return [normalized.id, normalized];
                        })),
                        folders: cached.folders.map(normalizeFolder),
                        tags: cached.tags,
                        cursor: cached.cursor,
                        hydrated: true,
                    });
                    const initialId = pickInitialNoteId(get().notes, get().folders);
                    if (initialId)
                        await get().openNote(initialId);
                }
                let pullError: unknown;
                try {
                    await get().pull({ force: !cached });
                }
                catch (err) {
                    pullError = err;
                }

                await replayOutbox(get, set);
                if (pullError)
                    throw pullError;

                const state = get();
                const notes = state.notes;
                let workspace = useUi.getState();
                for (const openId of [workspace.workspacePrimaryNoteId, workspace.workspaceSecondaryNoteId]) {
                    if (openId && !notes[openId])
                        workspace.removeWorkspaceNote(openId);
                }
                workspace = useUi.getState();
                const activePane = workspace.workspaceSecondaryNoteId
                    ? workspace.activeWorkspacePane
                    : 'primary';
                const activeId = workspace.activeNoteId;
                const latestRequestedNoteId = latestRequestedNoteIds[activePane];
                const targetId = (latestRequestedNoteId && notes[latestRequestedNoteId]
                    ? latestRequestedNoteId
                    : null) ??
                    (activeId && notes[activeId] ? activeId : pickInitialNoteId(notes, state.folders));
                if (targetId) {
                    if (activeId !== targetId || !hasOwnContent(state.contents, targetId)) {
                        await get().openNote(targetId, { pane: activePane });
                    }
                    else {
                        revalidateNote(targetId, notes[targetId]!.rev, set, get);
                    }
                }
                else if (activeId) {
                    useUi.getState().setActiveNote(null);
                }
                workspace = useUi.getState();
                if (workspace.workspaceSecondaryNoteId) {
                    const backgroundPane: WorkspacePane = workspace.activeWorkspacePane === 'primary'
                        ? 'secondary'
                        : 'primary';
                    const backgroundId = backgroundPane === 'primary'
                        ? workspace.workspacePrimaryNoteId
                        : workspace.workspaceSecondaryNoteId;
                    if (backgroundId && notes[backgroundId] && !hasOwnContent(get().contents, backgroundId)) {
                        await get().openNote(backgroundId, { pane: backgroundPane, activate: false });
                    }
                }
            }
            finally {
                set({ loading: false, hydrated: true });
            }
        };
        noteState.bootstrapPromise = run().catch((err) => {

            noteState.bootstrapPromise = null;
            throw err;
        });
        return noteState.bootstrapPromise;
    },
    pull(options) {
        if (options?.force)
            noteState.forcePullQueued = true;
        if (noteState.pullPromise)
            return noteState.pullPromise;
        const run = async () => {
            do {
                const force = noteState.forcePullQueued;
                noteState.forcePullQueued = false;
                const since = force ? 0 : get().cursor;
                try {
                    let payload: SyncResponse | null = await api.sync(since);
                    let fullRounds = 0;
                    while (payload?.full) {
                        if (fullRounds++ >= 2)
                            throw new Error(t("notes.data_kept_changing_during_the_full_sync_try_again_later"));
                        const snapshot = await collectFullSync(payload);


                        let catchup = snapshot.cursor > 0 ? await api.sync(snapshot.cursor) : null;
                        const increments: SyncResponse[] = [];
                        const catchupCursors = new Set<number>();
                        while (catchup && !catchup.full) {
                            increments.push(catchup);
                            if (!catchup.hasMore)
                                break;
                            if (catchupCursors.has(catchup.cursor))
                                throw new Error(t("notes.sync_pagination_data_is_incomplete"));
                            catchupCursors.add(catchup.cursor);
                            catchup = await api.sync(catchup.cursor);
                        }
                        if (catchup?.full) {
                            payload = catchup;
                            continue;
                        }
                        const consolidated = consolidateFullSync(snapshot, increments);
                        get().applySync(consolidated);
                        payload = catchup?.hasMore ? await api.sync(consolidated.cursor) : null;
                    }
                    if (!payload) {
                        set({ online: true });
                        continue;
                    }
                    get().applySync(payload);

                    const incrementalCursors = new Set<number>();
                    while (payload.hasMore) {
                        if (incrementalCursors.has(payload.cursor))
                            throw new Error(t("notes.sync_pagination_data_is_incomplete"));
                        incrementalCursors.add(payload.cursor);
                        const next = await api.sync(payload.cursor);
                        if (next.full) {
                            noteState.forcePullQueued = true;
                            break;
                        }
                        payload = next;
                        get().applySync(payload);
                    }
                    set({ online: true });
                }
                catch (err) {
                    if (err instanceof ApiError && err.isOffline)
                        set({ online: false });
                    else if (err instanceof ApiError && err.isAuth) {
                        await notePersistCoalescer.flush().catch(() => {});
                        commitAllPendingSummaryDerivations();
                        useSession.setState({ status: 'anonymous' });
                    }
                    else
                        throw err;
                }
            } while (noteState.forcePullQueued);
        };
        const tracked = run().finally(() => {
            if (noteState.pullPromise === tracked)
                noteState.pullPromise = null;
        });
        noteState.pullPromise = tracked;
        return tracked;
    },
    applySync(payload) {
        if (payload.settingsChanged)
            void useSession.getState().refreshSettings().catch(() => { });
        if (payload.profileChanged || payload.siteChanged)
            void useSession.getState().refresh().catch(() => { });
        const deletionIds = payload.deletions
            .filter((item) => item.entity === 'note')
            .map((item) => item.id);
        const deletedByPayload = new Set(deletionIds);
        const incomingIds = payload.full ? new Set(payload.notes.map((note) => note.id)) : null;
        for (const [id, cursor] of purgedNoteIds) {


            if (cursor !== null && payload.cursor > cursor) {
                purgedNoteIds.delete(id);
            }
            else if (cursor === null &&
                (deletedByPayload.has(id) || (incomingIds && !incomingIds.has(id)))) {


                purgedNoteIds.set(id, payload.cursor);
            }
        }
        const previousNoteIds = payload.full ? Object.keys(get().notes) : [];
        set((state) => {
            const notes = reconcileNotes(state.notes, payload.notes, payload.deletions, payload.full);
            const replaceFacets = payload.full || payload.facetsFull;
            const remoteFolders = replaceFacets
                ? reconcileList(state.folders, payload.folders, folderEqual)
                : mergeById(state.folders, payload.folders, payload.deletions, 'folder', folderEqual);
            const folders = applyPendingFolderMutations(remoteFolders);
            const tags = replaceFacets
                ? reconcileList(state.tags, payload.tags, tagEqual)
                : mergeById(state.tags, payload.tags, payload.deletions, 'tag', tagEqual);
            if (notes === state.notes &&
                folders === state.folders &&
                tags === state.tags &&
                payload.cursor === state.cursor) {
                return state;
            }
            if (folders !== state.folders)
                noteState.folderStateGeneration++;
            if (tags !== state.tags)
                noteState.tagStateGeneration++;
            localDb.scheduleShellSave({
                notes: Object.values(notes),
                folders,
                tags,
                cursor: payload.cursor,
            });
            return { notes, folders, tags, cursor: payload.cursor };
        });
        reconcileFolderUi(get().folders);
        const candidates = payload.full ? [...previousNoteIds, ...deletionIds] : deletionIds;
        for (const id of new Set(candidates)) {
            if (get().notes[id])
                continue;
            discardNoteRuntimeState(id);
            useUi.getState().removeWorkspaceNote(id);
            void localDb.dropContent(id);
        }
    },
    async peekContent(id) {
        const summary = get().notes[id];
        if (!summary || summary.deletedAt !== null)
            return null;
        if (hasOwnContent(get().contents, id))
            return get().contents[id]!;
        try {
            const cached = await localDb.getContent(id);
            if (cached && cached.rev === summary.rev && !dirty.has(id)) {
                set((state) => state.contents[id] !== undefined
                    ? state
                    : { contents: { ...state.contents, [id]: cached.content } });
                return cached.content;
            }
        }
        catch {
            // Cache read failed (IndexedDB hiccup); fall through to the server fetch below.
        }
        try {
            const note = await requestNote(id);
            adoptNote(note, set, get);
            return note.content;
        }
        catch {
            return null;
        }
    },
    async openNote(id, options) {
        const uiAtRequest = useUi.getState();
        const targetPane = options?.pane ?? (uiAtRequest.workspaceSecondaryNoteId
            ? uiAtRequest.activeWorkspacePane
            : 'primary');
        const activate = options?.activate !== false;
        latestRequestedNoteIds[targetPane] = id;
        const requestSequence = ++openSequences[targetPane];
        const requestEpoch = noteRequestEpochs.get(id) ?? 0;
        const state = get();
        const summary = state.notes[id];
        if (!summary)
            return;
        if (hasOwnContent(state.contents, id)) {
            useUi.getState().setWorkspaceNote(targetPane, id, activate);
            revalidateNote(id, summary.rev, set, get);
            return;
        }
        const cached = await localDb.getContent(id);
        let currentSummary = get().notes[id];
        if (requestSequence !== openSequences[targetPane] ||
            (noteRequestEpochs.get(id) ?? 0) !== requestEpoch ||
            !currentSummary)
            return;
        if (cached) {
            let hasRestoredPending = false;
            let hasForeignPending = false;
            let visibleContent = cached.content;
            let visibleTitle: string | undefined;
            if (cached.writeId) {
                const outbox = await localDb.getOutbox();
                currentSummary = get().notes[id];
                if (requestSequence !== openSequences[targetPane] ||
                    (noteRequestEpochs.get(id) ?? 0) !== requestEpoch ||
                    !currentSummary)
                    return;
                const existing = outbox.find((item) => item.writeId === cached.writeId && item.noteId === id);
                const currentId = outboxId(id);
                const existingContent = existing?.payload.content;
                const existingTitle = existing?.payload.title;
                const existingRev = existing?.payload.rev;
                const validExisting = existing &&
                    typeof existingContent === 'string' &&
                    Number.isInteger(existingRev) &&
                    (existingRev as number) >= 1;
                if (validExisting) {


                    visibleContent = existingContent as string;
                    visibleTitle = typeof existingTitle === 'string' ? existingTitle : undefined;
                    if (existing.clientId === CLIENT_ID) {
                        inheritedOutboxWrites.delete(id);
                        dirty.set(id, {
                            ...(typeof existingTitle === 'string' ? { title: existingTitle } : {}),
                            content: visibleContent,
                            contentDirty: existing.payload.contentDirty !== false,
                            rev: existingRev as number,
                            writeId: existing.writeId,
                            queueId: existing.id,
                            dependsOnWriteId: existing.dependsOnWriteId,
                            updatedAt: cached.updatedAt,
                            persisted: Promise.resolve(true),
                        });
                    }
                    else {
                        inheritedOutboxWrites.set(id, existing.writeId);
                        hasForeignPending = true;
                    }
                    hasRestoredPending = true;
                }
                else {
                    inheritedOutboxWrites.delete(id);
                    const recoveredTitle = cached.pendingTitle;
                    const recoveredContentDirty = cached.contentDirty !== false;
                    visibleTitle = recoveredTitle;
                    const queueId = outbox.some((item) => item.id === currentId)
                        ? `patch-recovery:${CLIENT_ID}:${id}:${cached.writeId}`
                        : currentId;
                    const persisted = localDb.enqueueOutbox({
                        id: queueId,
                        clientId: CLIENT_ID,
                        writeId: cached.writeId,
                        noteId: id,
                        payload: {
                            content: cached.content,
                            contentDirty: recoveredContentDirty,
                            rev: cached.rev,
                            ...(recoveredTitle !== undefined ? { title: recoveredTitle } : {}),
                        },
                        attempts: 0,
                        createdAt: cached.updatedAt,
                    }).then(async () => {
                        if (existing)
                            await localDb.completeOutboxItem(existing.id, existing.writeId).catch(() => { });
                        return true;
                    }, () => false);
                    dirty.set(id, {
                        ...(recoveredTitle !== undefined ? { title: recoveredTitle } : {}),
                        content: cached.content,
                        contentDirty: recoveredContentDirty,
                        rev: cached.rev,
                        writeId: cached.writeId,
                        queueId,
                        updatedAt: cached.updatedAt,
                        persisted,
                    });
                    hasRestoredPending = true;
                    void (async () => {
                        const durable = await persisted;
                        if (!durable) {
                            useUi.getState().toast({
                                title: t("notes.the_browser_could_not_save_your_offline_changes"),
                                description: t("notes.keep_this_page_open_and_reconnect_as_soon_as_possible_closing_it_may_mak"),
                                tone: 'danger',
                                duration: 12_000,
                            });
                        }
                    });
                }
                if (hasRestoredPending) {
                    const pendingIds = new Set(outbox.map((item) => item.noteId));
                    for (const noteId of dirty.keys())
                        pendingIds.add(noteId);
                    set({ pendingCount: pendingIds.size });
                }
            }
            set((s) => ({
                notes: visibleTitle !== undefined && s.notes[id]?.title !== visibleTitle
                    ? { ...s.notes, [id]: { ...s.notes[id]!, title: visibleTitle } }
                    : s.notes,
                contents: { ...s.contents, [id]: visibleContent },
                ...(hasRestoredPending
                    ? { saveStatus: s.online ? 'dirty' as const : 'offline' as const }
                    : {}),
            }));
            if (visibleTitle !== undefined)
                scheduleShellSave(get);
            useUi.getState().setWorkspaceNote(targetPane, id, activate);
            if (hasRestoredPending) {
                if (hasForeignPending && get().online)
                    void replayOutbox(get, set);
                return;
            }
            if (cached.rev === currentSummary.rev)
                validatedRevisions.set(id, currentSummary.rev);
            else
                revalidateNote(id, currentSummary.rev, set, get);
            return;
        }
        try {
            const note = await requestNote(id);
            adoptNote(note, set, get);
            validatedRevisions.set(id, note.rev);
            if (requestSequence === openSequences[targetPane] && get().notes[id]) {
                useUi.getState().setWorkspaceNote(targetPane, id, activate);
            }
        }
        catch (err) {
            if (err === STALE_NOTE_REQUEST)
                return;
            if (err instanceof ApiError && err.isOffline) {
                useUi.getState().toast({ title: t("notes.this_note_cannot_be_opened_offline"), tone: 'warning' });
                return;
            }
            if (err instanceof ApiError && err.status === 404) {
                useUi.getState().toast({ title: t("notes.this_note_no_longer_exists"), tone: 'danger' });
                if (latestRequestedNoteIds[targetPane] === id)
                    latestRequestedNoteIds[targetPane] = null;
                useUi.getState().removeWorkspaceNote(id);
                set((s) => {
                    const notes = { ...s.notes };
                    delete notes[id];
                    return { notes };
                });
                return;
            }
            toastError(err, t("notes.failed_to_open_note"));
        }
    },
    editTitle(id, title) {
        const state = get();
        const summary = state.notes[id];
        const content = state.contents[id];
        if (!summary || content === undefined)
            return;
        const nextTitle = title.slice(0, LIMITS.titleMaxLength);
        if (summary.title === nextTitle)
            return;
        // Keep the front matter `title` property in sync with the note title
        // whenever the note already declares one (opt-out per settings).
        const syncedContent = useSession.getState().settings.notes?.syncTitleToFrontMatter
            ? setFrontMatterProperty(content, 'title', nextTitle || null)
            : null;
        stageNoteTextWrite(id, syncedContent ?? content, nextTitle, set, get);
    },
    editContent(id, content) {
        const state = get();
        const summary = state.notes[id];
        if (!summary || !hasOwnContent(state.contents, id) || state.contents[id] === content)
            return;
        // Reverse sync: when the body's front matter `title` property changes,
        // adopt it as the note title so both stay in agreement (opt-out per
        // settings).
        let nextTitle = dirty.get(id)?.title;
        if (useSession.getState().settings.notes?.syncFrontMatterTitle) {
            const nextFrontMatterTitle = frontMatterTitleOf(content);
            const previousFrontMatterTitle = frontMatterTitleOf(state.contents[id]);
            if (nextFrontMatterTitle !== undefined && nextFrontMatterTitle !== previousFrontMatterTitle)
                nextTitle = nextFrontMatterTitle.slice(0, LIMITS.titleMaxLength);
        }
        stageNoteTextWrite(id, content, nextTitle, set, get);
    },
    async flush(options) {
        await notePersistCoalescer.flush();
        commitAllPendingSummaryDerivations();
        if (options?.immediate)
            window.clearTimeout(noteState.saveTimer);
        if (dirty.size)
            set((state) => ({ saveStatus: state.online ? 'saving' : 'offline' }));
        await replayOutbox(get, set);
        commitAllPendingSummaryDerivations();
        const remaining = await localDb.getOutbox();
        const pendingCount = pendingNoteCount(remaining);
        set((state) => ({
            saveStatus: pendingCount ? (state.online ? 'dirty' : 'offline') : 'synced',
            pendingCount,
        }));
    },
    async createNote(input) {
        const id = input?.id ?? newLocalEntityId();
        const existing = get().notes[id];
        const title = (input?.title ?? '').trim().slice(0, LIMITS.titleMaxLength);
        const folderId = input?.folderId && !isVirtualFolderId(input.folderId) ? input.folderId : currentFolderId();
        let content: string;
        let cursor: number | null = null;
        if (input?.content !== undefined) {
            content = input.content;
        }
        else {
            const built = buildNewNoteContent(title, input?.tags, folderId, get().folders);
            content = built.content;
            cursor = built.cursor;
            if (cursor !== null)
                pendingEditorCursors.set(id, cursor);
        }
        const isStarred = input?.isStarred ?? false;
        if (existing) {
            const request = api.notes.create({ id, title, content, folderId, ...(isStarred ? { isStarred: true } : {}) });
            pendingNoteCreates.set(id, request);
            try {
                const note = await request;
                adoptNote(note, set, get);
                if (isStarred && !note.isStarred)
                    await get().patchNote(note.id, { isStarred: true });
                return note.id;
            }
            catch (err) {
                toastError(err, t("notes.could_not_create_note"));
                return null;
            }
            finally {
                if (pendingNoteCreates.get(id) === request)
                    pendingNoteCreates.delete(id);
            }
        }
        const now = Date.now();
        const { words, chars } = countText(content);
        const optimistic: Note = {
            id,
            title,
            excerpt: deriveExcerpt(content),
            content,
            folderId,
            tags: extractTags(content),
            isPinned: false,
            isStarred,
            isArchived: false,
            wordCount: words,
            charCount: chars,
            rev: 1,
            position: now,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        const previousWorkspace = captureWorkspaceState();
        adoptNote(optimistic, set, get);
        if (input?.open !== false)
            useUi.getState().setActiveNote(id);
        const request = api.notes.create({ id, title, content, folderId, ...(isStarred ? { isStarred: true } : {}) });
        pendingNoteCreates.set(id, request);
        try {
            const note = await request;
            adoptNote(note, set, get);
            if (isStarred && !note.isStarred)
                await get().patchNote(note.id, { isStarred: true });
            return note.id;
        }
        catch (err) {
            if (!dirty.has(id)) {
                set((state) => {
                    const notes = { ...state.notes };
                    const contents = { ...state.contents };
                    delete notes[id];
                    delete contents[id];
                    return { notes, contents };
                });
                void localDb.dropContent(id);
                if (workspaceContainsNote(id))
                    restoreWorkspaceState(previousWorkspace);
                scheduleShellSave(get);
            }
            toastError(err, t("notes.could_not_create_note"));
            return null;
        }
        finally {
            if (pendingNoteCreates.get(id) === request)
                pendingNoteCreates.delete(id);
        }
    },
    async patchNote(id, patch) {
        commitPendingSummaryDerivation(id);
        const mutation = beginNoteMutation(id, compactOptimisticPatch(patch), set, get);
        if (!mutation)
            return;
        await enqueueNoteWrite(id, async () => {
            const summary = get().notes[id];
            if (!summary) {
                finishNoteMutation(id, mutation);
                return;
            }
            let rev = dirty.get(id)?.rev ?? summary.rev;
            for (let attempt = 0; attempt < 4; attempt++) {
                try {
                    const saved = await api.notes.patch(id, { rev, ...patch });
                    finishNoteMutation(id, mutation);
                    advanceDirtyRevision(id, rev, saved.rev, get);
                    adoptNote(saved, set, get);
                    return;
                }
                catch (err) {
                    const server = err instanceof ApiError && err.isConflict
                        ? (err.details as { server?: Note } | undefined)?.server
                        : undefined;
                    if (server?.id === id && server.rev > rev && attempt < 3) {
                        adoptNote(server, set, get);
                        rev = server.rev;
                        continue;
                    }
                    await recoverNoteMutation(id, mutation, err, set, get);
                    toastError(err, t("common.action_failed"));
                    return;
                }
            }
        });
    },
    async setArchived(id, archived, options) {
        const before = get().notes[id];
        if (!before || before.isArchived === archived)
            return;
        await patchWithUndo(
            get,
            new Map([[id, { isArchived: before.isArchived }]]),
            { isArchived: archived },
            t(archived ? "notes.archived" : "common.unarchive"),
            t(archived ? "notes.unarchived" : "notes.archived"),
            options?.notify,
        );
    },
    async setArchivedMany(ids, archived) {
        const undoPatches = new Map<string, NotePatch>();
        for (const id of ids) {
            const note = get().notes[id];
            if (note && note.isArchived !== archived)
                undoPatches.set(id, { isArchived: note.isArchived });
        }
        await patchWithUndo(
            get,
            undoPatches,
            { isArchived: archived },
            batchPatchTitle(archived ? "notes.archived" : "common.unarchive", undoPatches.size),
            batchPatchTitle(archived ? "notes.unarchived" : "notes.archived", undoPatches.size),
        );
    },
    async setStarred(id, starred, options) {
        const before = get().notes[id];
        if (!before || before.isStarred === starred)
            return;
        await patchWithUndo(
            get,
            new Map([[id, { isStarred: before.isStarred }]]),
            { isStarred: starred },
            t(starred ? "notes.added_to_favorites" : "notes.removed_from_favorites"),
            t(starred ? "notes.removed_from_favorites" : "notes.added_to_favorites"),
            options?.notify,
        );
    },
    async setStarredMany(ids, starred) {
        const undoPatches = new Map<string, NotePatch>();
        for (const id of ids) {
            const note = get().notes[id];
            if (note && note.isStarred !== starred)
                undoPatches.set(id, { isStarred: note.isStarred });
        }
        const titleKey: MessageKey = starred ? "notes.added_to_favorites" : "notes.removed_from_favorites";
        const revertKey: MessageKey = starred ? "notes.removed_from_favorites" : "notes.added_to_favorites";
        await patchWithUndo(get, undoPatches, { isStarred: starred }, batchPatchTitle(titleKey, undoPatches.size), batchPatchTitle(revertKey, undoPatches.size));
    },
    async setPinned(id, pinned, options) {
        const before = get().notes[id];
        if (!before || before.isPinned === pinned)
            return;
        await patchWithUndo(
            get,
            new Map([[id, { isPinned: before.isPinned }]]),
            { isPinned: pinned },
            t(pinned ? "notes.pinned" : "notes.unpinned"),
            t(pinned ? "notes.unpinned" : "notes.pinned"),
            options?.notify,
        );
    },
    async setPinnedMany(ids, pinned) {
        const undoPatches = new Map<string, NotePatch>();
        for (const id of ids) {
            const note = get().notes[id];
            if (note && note.isPinned !== pinned)
                undoPatches.set(id, { isPinned: note.isPinned });
        }
        const titleKey: MessageKey = pinned ? "notes.pinned" : "notes.unpinned";
        const revertKey: MessageKey = pinned ? "notes.unpinned" : "notes.pinned";
        await patchWithUndo(get, undoPatches, { isPinned: pinned }, batchPatchTitle(titleKey, undoPatches.size), batchPatchTitle(revertKey, undoPatches.size));
    },
    async moveNotes(ids, folderId) {
        const undoPatches = new Map<string, NotePatch>();
        for (const id of ids) {
            const note = get().notes[id];
            if (note && note.folderId !== folderId)
                undoPatches.set(id, { folderId: note.folderId });
        }
        const titleKey: MessageKey = folderId ? "notes.moved" : "notes.moved_out";
        const revertKey: MessageKey = folderId ? "notes.moved_out" : "notes.moved";
        await patchWithUndo(get, undoPatches, { folderId }, batchPatchTitle(titleKey, undoPatches.size), batchPatchTitle(revertKey, undoPatches.size));
    },
    async deleteNote(id) {
        commitPendingSummaryDerivation(id);
        const before = get().notes[id];
        if (!before)
            return;
        const workspaceBefore = captureWorkspaceState();
        const wasOpen = workspaceContainsNote(id);
        const deletedAt = Date.now();
        const mutation = beginNoteMutation(id, { deletedAt, updatedAt: deletedAt }, set, get);
        if (!mutation)
            return;
        if (wasOpen)
            useUi.getState().removeWorkspaceNote(id);
        await enqueueNoteWrite(id, async () => {
            if (!(await saveDirtyBeforeDestructiveMutation(id, set, get))) {
                finishNoteMutation(id, mutation);
                rollbackNoteMutation(id, mutation, set, get);
                if (wasOpen && get().notes[id])
                    restoreWorkspaceState(workspaceBefore);
                useUi.getState().toast({
                    title: t("notes.deletion_was_canceled_because_the_note_body_is_not_safely_synced"),
                    tone: 'warning',
                });
                return;
            }
            try {
                const removed = await api.notes.remove(id);
                finishNoteMutation(id, mutation);
                adoptNote(removed, set, get);
                toastWithUndo(t("notes.moved_to_trash"), () => void get().restoreNote(id), { duration: DESTRUCTIVE_UNDO_TOAST_MS });
            }
            catch (err) {
                await recoverNoteMutation(id, mutation, err, set, get);
                if (wasOpen && get().notes[id]?.deletedAt === null)
                    restoreWorkspaceState(workspaceBefore);
                toastError(err, t("common.delete_failed"));
            }
        });
    },
    async restoreNote(id) {
        const mutation = beginNoteMutation(id, { deletedAt: null }, set, get);
        if (!mutation)
            return;
        await enqueueNoteWrite(id, async () => {
            try {
                const note = await api.notes.restore(id);
                finishNoteMutation(id, mutation);
                adoptNote(note, set, get);
                useUi.getState().toast({ title: t("notes.restored"), tone: 'success' });
            }
            catch (err) {
                await recoverNoteMutation(id, mutation, err, set, get);
                toastError(err, t("common.restore_failed"));
            }
        });
    },
    async restoreVersion(id, versionId, content, title) {
        commitPendingSummaryDerivation(id);
        const before = get().notes[id];
        if (!before || !hasOwnContent(get().contents, id))
            return false;
        const beforeContent = get().contents[id]!;
        const updatedAt = Math.max(Date.now(), before.updatedAt + 1);
        const { words, chars } = countText(content);
        const optimistic: NoteSummary = {
            ...before,
            ...(title !== undefined ? { title: title.slice(0, LIMITS.titleMaxLength) } : {}),
            excerpt: deriveExcerpt(content),
            tags: extractTags(content),
            wordCount: words,
            charCount: chars,
            updatedAt,
        };
        set((state) => ({
            notes: { ...state.notes, [id]: optimistic },
            contents: { ...state.contents, [id]: content },
        }));
        scheduleShellSave(get);
        void localDb.setContent(id, { content, rev: before.rev, updatedAt });
        return enqueueNoteWrite(id, async () => {
            if (!(await saveDirtyBeforeDestructiveMutation(id, set, get))) {
                restoreVersionSnapshot(id, optimistic, before, content, beforeContent, set, get);
                return false;
            }
            try {
                const saved = await api.notes.restoreVersion(id, versionId);
                adoptNote(saved, set, get);
                useUi.getState().toast({ title: t("workspace.restored_to_selected_version"), tone: 'success' });
                return true;
            }
            catch (err) {
                restoreVersionSnapshot(id, optimistic, before, content, beforeContent, set, get);
                toastError(err, t("common.restore_failed"));
                return false;
            }
        });
    },
    async purgeNote(id) {
        const before = get().notes[id];
        if (!before)
            return;
        const hadContent = hasOwnContent(get().contents, id);
        const beforeContent = get().contents[id];
        const workspaceBefore = captureWorkspaceState();
        const wasOpen = workspaceContainsNote(id);
        markNotesOptimisticallyPurged([id], set, get);
        await enqueueNoteWrite(id, async () => {
            if (!(await saveDirtyBeforeDestructiveMutation(id, set, get))) {
                restoreOptimisticallyPurgedNotes([{ note: before, content: beforeContent, hadContent }], set, get);
                if (wasOpen)
                    restoreWorkspaceState(workspaceBefore);
                useUi.getState().toast({
                    title: t("notes.permanent_deletion_was_canceled_because_the_note_body_is_not_safely_sync"),
                    tone: 'warning',
                });
                return;
            }
            try {
                const result = await api.notes.purge(id);
                discardNoteRuntimeState(id, result.cursor);
                set((s) => {
                    const notes = { ...s.notes };
                    const contents = { ...s.contents };
                    delete notes[id];
                    delete contents[id];
                    return { notes, contents };
                });
                scheduleShellSave(get);
                void localDb.dropContent(id);
            }
            catch (err) {
                restoreOptimisticallyPurgedNotes([{ note: before, content: beforeContent, hadContent }], set, get);
                if (wasOpen)
                    restoreWorkspaceState(workspaceBefore);
                toastError(err, t("notes.permanent_deletion_failed"));
            }
        });
    },
    async emptyTrash() {
        const snapshots = Object.values(get().notes)
            .filter((note) => note.deletedAt !== null)
            .map((note) => ({
            note,
            content: get().contents[note.id],
            hadContent: hasOwnContent(get().contents, note.id),
        }));
        if (!snapshots.length)
            return 0;
        const workspaceBefore = captureWorkspaceState();
        const ids = snapshots.map((snapshot) => snapshot.note.id);
        markNotesOptimisticallyPurged(ids, set, get);
        for (const id of ids) {
            if (!(await saveDirtyBeforeDestructiveMutation(id, set, get))) {
                restoreOptimisticallyPurgedNotes(snapshots, set, get);
                restoreWorkspaceState(workspaceBefore);
                useUi.getState().toast({
                    title: t("notes.permanent_deletion_was_canceled_because_the_note_body_is_not_safely_sync"),
                    tone: 'warning',
                });
                return null;
            }
        }
        try {
            const result = await api.notes.emptyTrash();
            for (const id of ids) {
                discardNoteRuntimeState(id);
                void localDb.dropContent(id);
            }
            void get().pull().catch(() => { });
            return result.purged;
        }
        catch (err) {
            restoreOptimisticallyPurgedNotes(snapshots, set, get);
            restoreWorkspaceState(workspaceBefore);
            toastError(err, t("notes.clearing_failed"));
            return null;
        }
    },
    async duplicateNote(id) {
        const source = get().notes[id];
        if (!source)
            return;
        const copyId = newLocalEntityId();
        const now = Date.now();
        const hasContent = hasOwnContent(get().contents, id);
        const optimistic: NoteSummary = {
            ...source,
            id: copyId,
            title: duplicateNoteTitle(source.title, LIMITS.titleMaxLength),
            isPinned: false,
            isStarred: false,
            rev: 1,
            position: now,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        set((state) => ({
            notes: { ...state.notes, [copyId]: optimistic },
            contents: hasContent ? { ...state.contents, [copyId]: state.contents[id]! } : state.contents,
        }));
        scheduleShellSave(get);
        if (hasContent) {
            void localDb.setContent(copyId, {
                content: get().contents[id]!,
                rev: 1,
                updatedAt: now,
            });
            useUi.getState().setActiveNote(copyId);
        }
        const request = enqueueNoteWrite(id, async () => {
            if (!(await saveDirtyBeforeDestructiveMutation(id, set, get))) {
                throw new Error(t("notes.the_note_body_is_not_safely_synced_so_a_complete_copy_cannot_be_created"));
            }
            return api.notes.duplicate(id, { id: copyId });
        });
        pendingNoteCreates.set(copyId, request);
        try {
            const note = await request;
            adoptNote(note, set, get);
            useUi.getState().setActiveNote(note.id);
        }
        catch (err) {
            if (!dirty.has(copyId)) {
                set((state) => {
                    const notes = { ...state.notes };
                    const contents = { ...state.contents };
                    delete notes[copyId];
                    delete contents[copyId];
                    return { notes, contents };
                });
                void localDb.dropContent(copyId);
                if (useUi.getState().activeNoteId === copyId)
                    useUi.getState().setActiveNote(id);
                scheduleShellSave(get);
            }
            toastError(err, t("notes.failed_to_create_copy"));
        }
        finally {
            if (pendingNoteCreates.get(copyId) === request)
                pendingNoteCreates.delete(copyId);
        }
    },
    createFolder(input) {
        const parentId = input?.parentId ?? null;
        const current = get().folders;
        if (parentId && !current.some((folder) => folder.id === parentId))
            return null;
        const id = newLocalEntityId();
        const now = Date.now();
        const name = availableLocalFolderName(current, parentId, input?.name?.trim() || t("common.new_folder"));
        const folder: Folder = {
            id,
            parentId,
            name,
            icon: input?.icon ?? null,
            color: input?.color ?? null,
            position: insertionPositionForFolders(current, id, parentId, null),
            createdAt: now,
            updatedAt: now,
            noteCount: 0,
        };
        const mutation = beginFolderMutation(id, false, (folders) => folders.some((item) => item.id === id) ? folders : [...folders, folder], set, get);
        void (async () => {
            try {
                const saved = await enqueueFolderWrite(id, () => api.folders.create({
                    id,
                    name,
                    parentId,
                    icon: folder.icon,
                    ...(folder.color ? { color: folder.color } : {}),
                }));
                commitFolderMutation(mutation, saved, set, get);
            } catch (err) {
                rollbackFolderMutation(mutation, set, get);
                toastError(err, t("sidebar.failed_to_create_folder"));
            }
        })();
        return id;
    },
    patchFolder(id, patch) {
        const current = get().folders.find((folder) => folder.id === id);
        if (!current)
            return false;
        const normalized = {
            ...patch,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        };
        if (normalized.name === '' || normalized.parentId === id)
            return false;
        const mutation = beginFolderMutation(id, false, (folders) => applyOptimisticFolderPatch(folders, id, normalized), set, get);
        void (async () => {
            try {
                const saved = await enqueueFolderWrite(id, () => api.folders.patch(id, normalized));
                commitFolderMutation(mutation, saved, set, get);
            } catch (err) {
                rollbackFolderMutation(mutation, set, get);
                toastError(err, normalized.name !== undefined ? t("sidebar.rename_failed") : t("sidebar.move_failed"));
            }
        })();
        return true;
    },
    deleteFolder(id) {
        const folder = get().folders.find((item) => item.id === id);
        if (!folder)
            return false;
        const noteMutations: Array<[string, PendingNoteMutation]> = [];
        const movedAt = Date.now();
        for (const note of Object.values(get().notes)) {
            if (note.folderId !== id)
                continue;
            const mutation = beginNoteMutation(note.id, { folderId: folder.parentId, updatedAt: movedAt }, set, get);
            if (mutation)
                noteMutations.push([note.id, mutation]);
        }
        const mutation = beginFolderMutation(id, true, (folders) => removeFolderAndPromoteChildren(folders, id), set, get);
        reconcileFolderUi(get().folders);
        void (async () => {
            try {
                await enqueueFolderWrite(id, () => api.folders.remove(id, 'move-up'));
                finishFolderMutation(mutation);
                for (const [noteId, noteMutation] of noteMutations)
                    finishNoteMutation(noteId, noteMutation);
                scheduleShellSave(get);
                void get().pull().catch(() => { });
            } catch (err) {
                rollbackFolderMutation(mutation, set, get);
                for (const [noteId, noteMutation] of noteMutations) {
                    finishNoteMutation(noteId, noteMutation);
                    rollbackNoteMutation(noteId, noteMutation, set, get);
                }
                toastError(err, t("common.delete_failed"));
            }
        })();
        return true;
    },
    async refreshFolders() {
        const sequence = ++noteState.folderRefreshSequence;
        const generation = noteState.folderStateGeneration;
        try {
            const { folders } = await api.folders.list();
            let hasChanged = false;
            set((state) => {
                if (sequence !== noteState.folderRefreshSequence || generation !== noteState.folderStateGeneration)
                    return state;
                const next = applyPendingFolderMutations(reconcileList(state.folders, folders, folderEqual));
                if (next === state.folders)
                    return state;
                noteState.folderStateGeneration++;
                hasChanged = true;
                return { folders: next };
            });
            if (hasChanged)
                scheduleShellSave(get);
            reconcileFolderUi(get().folders);
        }
        catch (err) {
            console.error('[notes] refreshFolders failed:', err);
        }
    },
    async refreshTags() {
        const sequence = ++noteState.tagRefreshSequence;
        const generation = noteState.tagStateGeneration;
        try {
            const { tags } = await api.tags.list();
            let hasChanged = false;
            set((state) => {
                if (sequence !== noteState.tagRefreshSequence || generation !== noteState.tagStateGeneration)
                    return state;
                const next = reconcileList(state.tags, tags, tagEqual);
                if (next === state.tags)
                    return state;
                noteState.tagStateGeneration++;
                hasChanged = true;
                return { tags: next };
            });
            if (hasChanged)
                scheduleShellSave(get);
        }
        catch (error) {
            throw error;
        }
    },
    replayPending() {
        return replayOutbox(get, set);
    },    setOnline(online) {
        set({ online });
        if (online) {
            void (async () => {
                try {
                    await get().pull();
                } catch {
                    // Reconnect pulls race with the connection coming up; the next event or manual refresh retries.
                }
                try {
                    await replayOutbox(get, set);
                } catch {
                    // Outbox replay is retried on the next pull; keep the UI responsive meanwhile.
                }
            })();
        }
    },
}));
function toastError(err: unknown, fallback: string): void {
    useUi.getState().toast({
        title: fallback,
        description: err instanceof ApiError ? err.message : String(err),
        tone: 'danger',
    });
}

export type { NotesState, SaveStatus } from './notes/model';
