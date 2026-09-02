/** Offline-journal runtime: dirty-revision advancement, purge snapshots, rebase and settle helpers. */
import { ApiError, CLIENT_ID } from '../../lib/api';
import { localDb, publishBroadcast } from '../../lib/db';
import { adoptNote } from './adopt';
import { applyPendingNoteMutations, noteSummaryEqual } from './reconcile';
import { scheduleShellSave } from './shell-save';
import { useUi } from '../ui';
import { dirty, inheritedOutboxWrites, latestRequestedNoteIds, noteRequestEpochs, noteRequests, pendingSummaryDerivations, pendingNoteMutations, purgedNoteIds, validatedRevisions, type DirtyNoteWrite, type NotesState, type SetNotesState } from './model';
import type { Note, NoteSummary } from '@shared/types';
import type { OutboxItem } from '../../lib/db';

export function advanceDirtyRevision(id: string, expectedRev: number, nextRev: number, get: () => NotesState): void {
    const pending = dirty.get(id);
    if (!pending || pending.rev !== expectedRev)
        return;
    const persisted = pending.persisted.then(async (durable) => {
        if (!durable)
            return false;
        try {
            await localDb.updateOutboxRevision(pending.queueId, pending.writeId, nextRev);
            return true;
        }
        catch {
            return false;
        }
    });
    dirty.set(id, { ...pending, rev: nextRev, dependsOnWriteId: undefined, persisted });
    const summary = get().notes[id];
    void localDb.setContent(id, {
        content: pending.content,
        contentDirty: pending.contentDirty,
        ...(pending.title !== undefined ? { pendingTitle: pending.title } : {}),
        rev: nextRev,
        updatedAt: summary?.updatedAt ?? Date.now(),
        writeId: pending.writeId,
    });
}
export async function advanceDependentOutboxWrites(
    id: string,
    sourceWriteId: string,
    expectedRev: number,
    nextRev: number,
    get: () => NotesState,
    notifyTabs: boolean,
    visibleBatch?: OutboxItem[],
): Promise<void> {
    if (!Number.isInteger(expectedRev) || !Number.isInteger(nextRev) || nextRev <= expectedRev)
        return;
    if (inheritedOutboxWrites.get(id) === sourceWriteId)
        inheritedOutboxWrites.delete(id);
    await localDb.advanceOutboxDependents(id, sourceWriteId, expectedRev, nextRev).catch(() => { });
    if (visibleBatch) {
        for (const item of visibleBatch) {
            if (item.noteId !== id ||
                item.dependsOnWriteId !== sourceWriteId ||
                item.payload.rev !== expectedRev)
                continue;
            item.dependsOnWriteId = undefined;
            item.payload = { ...item.payload, rev: nextRev };
        }
    }
    const pending = dirty.get(id);
    if (pending?.dependsOnWriteId === sourceWriteId && pending.rev === expectedRev)
        advanceDirtyRevision(id, expectedRev, nextRev, get);
    if (notifyTabs) {
        publishBroadcast({
            type: 'outbox-base-advanced',
            clientId: CLIENT_ID,
            noteId: id,
            writeId: sourceWriteId,
            expectedRev,
            nextRev,
        });
    }
}

export async function saveDirtyBeforeDestructiveMutation(id: string, set: SetNotesState, get: () => NotesState): Promise<boolean> {
    await get().flush({ immediate: true });
    if (dirty.has(id)) {
        set((state) => ({ saveStatus: state.online ? 'dirty' : 'offline' }));
        return false;
    }
    const remaining = await localDb.getOutbox();
    return !remaining.some((item) => item.noteId === id);
}
export function markNotesOptimisticallyPurged(ids: string[], set: SetNotesState, get: () => NotesState): void {
    const idSet = new Set(ids);
    for (const id of ids) {
        purgedNoteIds.set(id, null);
        noteRequestEpochs.set(id, (noteRequestEpochs.get(id) ?? 0) + 1);
    }
    set((state) => {
        const notes = { ...state.notes };
        const contents = { ...state.contents };
        for (const id of ids) {
            delete notes[id];
            delete contents[id];
        }
        return { notes, contents };
    });
    for (const id of idSet)
        useUi.getState().removeWorkspaceNote(id);
    scheduleShellSave(get);
}
export function restoreOptimisticallyPurgedNotes(snapshots: Array<{
    note: NoteSummary;
    content: string | undefined;
    hadContent: boolean;
}>, set: SetNotesState, get: () => NotesState): void {
    for (const snapshot of snapshots)
        purgedNoteIds.delete(snapshot.note.id);
    set((state) => {
        const notes = { ...state.notes };
        const contents = { ...state.contents };
        for (const snapshot of snapshots) {
            notes[snapshot.note.id] = applyPendingNoteMutations(snapshot.note.id, snapshot.note);
            if (snapshot.hadContent)
                contents[snapshot.note.id] = snapshot.content!;
        }
        return { notes, contents };
    });
    scheduleShellSave(get);
}
export function restoreVersionSnapshot(id: string, optimistic: NoteSummary, before: NoteSummary, optimisticContent: string, beforeContent: string, set: SetNotesState, get: () => NotesState): void {
    let restored = false;
    set((state) => {
        const current = state.notes[id];
        if (!current || !noteSummaryEqual(current, optimistic) || state.contents[id] !== optimisticContent)
            return state;
        restored = true;
        return {
            notes: { ...state.notes, [id]: applyPendingNoteMutations(id, before) },
            contents: { ...state.contents, [id]: beforeContent },
        };
    });
    if (!restored)
        return;
    scheduleShellSave(get);
    void localDb.setContent(id, { content: beforeContent, rev: before.rev, updatedAt: before.updatedAt });
}
export function discardNoteRuntimeState(id: string, tombstoneCursor?: number | null): void {
    noteRequestEpochs.set(id, (noteRequestEpochs.get(id) ?? 0) + 1);
    if (tombstoneCursor !== undefined)
        purgedNoteIds.set(id, tombstoneCursor);
    if (purgedNoteIds.size > 1000) {
        const oldest = purgedNoteIds.keys().next().value as string | undefined;
        if (oldest)
            purgedNoteIds.delete(oldest);
    }
    dirty.delete(id);
    inheritedOutboxWrites.delete(id);
    validatedRevisions.delete(id);
    noteRequests.delete(id);
    pendingNoteMutations.delete(id);
    const pendingDerivation = pendingSummaryDerivations.get(id);
    if (pendingDerivation)
        window.clearTimeout(pendingDerivation.timer);
    pendingSummaryDerivations.delete(id);
    for (const pane of ['primary', 'secondary'] as const) {
        if (latestRequestedNoteIds[pane] === id)
            latestRequestedNoteIds[pane] = null;
    }
}

export async function settleSavedPatch(id: string, submitted: Pick<DirtyNoteWrite, 'content' | 'writeId'>, saved: Note, set: SetNotesState, get: () => NotesState): Promise<void> {
    const latest = dirty.get(id);
    if (latest && latest.writeId !== submitted.writeId) {
        advanceDirtyRevision(id, latest.rev, saved.rev, get);
        await dirty.get(id)?.persisted;
        adoptNote(saved, set, get);
        return;
    }
    dirty.delete(id);
    adoptNote(saved, set, get);
}
export async function rebaseQueuedWrite(
    item: OutboxItem,
    pending: DirtyNoteWrite | undefined,
    server: Note,
    set: SetNotesState,
    get: () => NotesState,
): Promise<boolean> {
    const queueId = pending?.queueId ?? item.id;
    const writeId = pending?.writeId ?? item.writeId;
    try {
        await localDb.updateOutboxRevision(queueId, writeId, server.rev, true);
    }
    catch {
        await localDb.markOutboxFailure(item.id, item.writeId, 'could not rebase the offline journal').catch(() => { });
        return false;
    }
    if (pending && dirty.get(item.noteId)?.writeId === pending.writeId) {
        const rebased: DirtyNoteWrite = {
            ...pending,
            rev: server.rev,
            dependsOnWriteId: undefined,
            persisted: Promise.resolve(true),
        };
        dirty.set(item.noteId, rebased);
        void localDb.setContent(item.noteId, {
            content: rebased.content,
            contentDirty: rebased.contentDirty,
            ...(rebased.title !== undefined ? { pendingTitle: rebased.title } : {}),
            rev: rebased.rev,
            updatedAt: rebased.updatedAt,
            writeId: rebased.writeId,
        });
    }
    if (inheritedOutboxWrites.get(item.noteId) === item.writeId)
        inheritedOutboxWrites.delete(item.noteId);
    adoptNote(server, set, get);
    set({ online: true });
    return true;
}

export function deletionCursorFrom(err: ApiError): number | null {
    const value = (err.details as { deletionCursor?: unknown } | undefined)?.deletionCursor;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
