import type { NotesState, SetNotesState } from './model';
import type { SyncResponse } from '@shared/types';
import { api } from '../../lib/api';
import { localDb } from '../../lib/db';
import { replayOutbox } from './outbox';
import { applyCachedShell, advancePurgedNoteIds, discardSyncedAwayNotes, handlePullError, pullIncremental, pullWhileFull, reconcileFromPayload, restoreWorkspaceAfterBoot } from './boot-helpers';
import { noteState } from './model';
import { reconcileFolderUi } from './reconcile';
import { useSession } from '../session';

export const boot = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'bootstrap' | 'pull' | 'applySync' | 'setOnline'> => ({
    bootstrap: () => {
        if (noteState.bootstrapPromise)
            return noteState.bootstrapPromise;
        noteState.bootstrapPromise = runBootstrap(get, set).catch((err) => {
            noteState.bootstrapPromise = null;
            throw err;
        });
        return noteState.bootstrapPromise;
    },
    pull: (options) => {
        if (options?.force)
            noteState.forcePullQueued = true;
        if (noteState.pullPromise)
            return noteState.pullPromise;
        const tracked = runPull(get, set).finally(() => {
            if (noteState.pullPromise === tracked)
                noteState.pullPromise = null;
        });
        noteState.pullPromise = tracked;
        return tracked;
    },
    applySync: (payload) => runApplySync(payload, get, set),
    setOnline: (online) => runSetOnline(online, set, get),
});

async function runBootstrap(get: () => NotesState, set: SetNotesState): Promise<void> {
    set({ loading: true });
    try {
        const userId = useSession.getState().user?.id;
        if (!userId)
            return;
        await localDb.bindUser(userId);

        const cached = await localDb.loadShell();
        if (cached)
            await applyCachedShell(cached, set, get);

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

        await restoreWorkspaceAfterBoot(get, set);
    }
    finally {
        set({ loading: false, hydrated: true });
    }
}

async function runPull(get: () => NotesState, set: SetNotesState): Promise<void> {
    do {
        const force = noteState.forcePullQueued;
        noteState.forcePullQueued = false;
        const since = force ? 0 : get().cursor;
        try {
            let payload: SyncResponse | null = await api.sync(since);
            payload = await pullWhileFull(payload, get);
            if (!payload) {
                set({ online: true });
                continue;
            }
            get().applySync(payload);
            await pullIncremental(payload, get);
            set({ online: true });
        }
        catch (err) {
            await handlePullError(err, set);
        }
    } while (noteState.forcePullQueued);
}

function runApplySync(payload: SyncResponse, get: () => NotesState, set: SetNotesState): void {
    if (payload.settingsChanged)
        // Best-effort settings refresh; the next sync payload retries.
        void useSession.getState().refreshSettings().catch(() => { });
    if (payload.profileChanged || payload.siteChanged)
        // Best-effort profile/site refresh; the next sync payload retries.
        void useSession.getState().refresh().catch(() => { });
    const deletionIds = payload.deletions
        .filter((item) => item.entity === 'note')
        .map((item) => item.id);
    const deletedByPayload = new Set(deletionIds);
    const incomingIds = payload.full ? new Set(payload.notes.map((note) => note.id)) : null;
    advancePurgedNoteIds(payload, deletedByPayload, incomingIds);
    const previousNoteIds = payload.full ? Object.keys(get().notes) : [];
    const reconciled = reconcileFromPayload(get(), payload);
    if (reconciled)
        set(reconciled);
    reconcileFolderUi(get().folders);
    const candidates = payload.full ? [...previousNoteIds, ...deletionIds] : deletionIds;
    discardSyncedAwayNotes(candidates, get);
}

function runSetOnline(online: boolean, set: SetNotesState, get: () => NotesState): void {
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