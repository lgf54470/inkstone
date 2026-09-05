import type { NotesState, SetNotesState } from './model';
import type { SyncResponse } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { localDb } from '../../lib/db';
import { revalidateNote } from './adopt';
import { applyPendingFolderMutations } from './folder-ops';
import { replayOutbox } from './outbox';
import { folderEqual, mergeById, normalizeFolder, reconcileFolderUi, reconcileList, reconcileNotes, tagEqual } from './reconcile';
import { discardNoteRuntimeState } from './runtime';
import { commitAllPendingSummaryDerivations, normalizeNoteSummaryTags } from './summary';
import { collectFullSync, consolidateFullSync } from './sync';
import { hasOwnContent } from './util';
import { pickInitialNoteId } from './workspace';
import { latestRequestedNoteIds, notePersistCoalescer, noteState, purgedNoteIds } from './model';
import { useSession } from '../session';
import { useUi, type WorkspacePane } from '../ui';
import { t } from '../../lib/i18n';

export const boot = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'bootstrap' | 'pull' | 'applySync' | 'setOnline'> => ({

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
    setOnline(online) {
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
    }
});
