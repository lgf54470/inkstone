/** Optimistic note-summary mutations (move/star/pin/archive/trash/restore) with conflict recovery. */
import type { Note, NoteSummary } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { adoptNote } from './adopt';
import { scheduleShellSave } from './shell-save';
import { applyPendingNoteMutations, noteSummaryEqual } from './reconcile';
import { pendingNoteMutations, type NotesState, type OptimisticNotePatch, type PendingNoteMutation, type SetNotesState } from './model';

export function compactOptimisticPatch(patch: OptimisticNotePatch): OptimisticNotePatch {
    const compact: OptimisticNotePatch = {};
    for (const key of ['folderId', 'isPinned', 'isStarred', 'isArchived', 'deletedAt', 'updatedAt'] as const) {
        if (patch[key] !== undefined)
            Object.assign(compact, { [key]: patch[key] });
    }
    return compact;
}
export function beginNoteMutation(id: string, patch: OptimisticNotePatch, set: SetNotesState, get: () => NotesState): PendingNoteMutation | null {
    const before = get().notes[id];
    if (!before || !Object.keys(patch).length)
        return null;
    const mutation: PendingNoteMutation = { patch, before };
    const pending = pendingNoteMutations.get(id);
    if (pending)
        pending.push(mutation);
    else
        pendingNoteMutations.set(id, [mutation]);
    set((state) => {
        const current = state.notes[id];
        return current
            ? { notes: { ...state.notes, [id]: { ...current, ...patch } } }
            : state;
    });
    scheduleShellSave(get);
    return mutation;
}
export function finishNoteMutation(id: string, mutation: PendingNoteMutation): void {
    const pending = pendingNoteMutations.get(id);
    if (!pending)
        return;
    const index = pending.indexOf(mutation);
    if (index >= 0)
        pending.splice(index, 1);
    if (!pending.length)
        pendingNoteMutations.delete(id);
}

export function rollbackNoteMutation(id: string, mutation: PendingNoteMutation, set: SetNotesState, get: () => NotesState): void {
    let hasChanged = false;
    set((state) => {
        const current = state.notes[id];
        if (!current)
            return state;
        const reverted: NoteSummary = { ...current };
        for (const key of Object.keys(mutation.patch) as (keyof OptimisticNotePatch)[]) {
            Object.assign(reverted, { [key]: mutation.before[key] });
        }
        const next = applyPendingNoteMutations(id, reverted);
        if (noteSummaryEqual(current, next))
            return state;
        hasChanged = true;
        return { notes: { ...state.notes, [id]: next } };
    });
    if (hasChanged)
        scheduleShellSave(get);
}
export async function recoverNoteMutation(id: string, mutation: PendingNoteMutation, err: unknown, set: SetNotesState, get: () => NotesState): Promise<void> {
    finishNoteMutation(id, mutation);
    const server = err instanceof ApiError && err.isConflict
        ? (err.details as { server?: Note } | undefined)?.server
        : undefined;
    if (server) {
        adoptNote(server, set, get);
        return;
    }
    if (err instanceof ApiError && err.isAuth) {
        rollbackNoteMutation(id, mutation, set, get);
        location.reload();
        return;
    }
    if (!(err instanceof ApiError && err.isOffline)) {
        try {
            adoptNote(await api.notes.get(id), set, get);
            return;
        }
        catch {
        }
    }
    else {
        set({ online: false });
    }
    rollbackNoteMutation(id, mutation, set, get);
}
