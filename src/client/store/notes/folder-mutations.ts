/** Optimistic folder mutations: begin/commit/rollback against pending-folder state. */
import { noteState, pendingFolderMutations, type NotesState, type PendingFolderMutation, type SetNotesState } from './model';
import { reconcileFolderUi } from './reconcile';
import { scheduleShellSave } from './shell-save';
import { replaceFolder } from './folder-ops';
import type { Folder } from '@shared/types';

export function beginFolderMutation(entityId: string, restoreMissingEntity: boolean, apply: (folders: Folder[]) => Folder[], set: SetNotesState, get: () => NotesState): PendingFolderMutation {
    const mutation: PendingFolderMutation = { entityId, restoreMissingEntity, before: get().folders, apply };
    pendingFolderMutations.push(mutation);
    noteState.folderStateGeneration++;
    set((state) => ({ folders: apply(state.folders) }));
    scheduleShellSave(get);
    return mutation;
}

export function finishFolderMutation(mutation: PendingFolderMutation): PendingFolderMutation[] {
    const index = pendingFolderMutations.indexOf(mutation);
    if (index < 0)
        return [];
    const later = pendingFolderMutations.slice(index + 1);
    pendingFolderMutations.splice(index, 1);
    return later;
}

export function commitFolderMutation(mutation: PendingFolderMutation, saved: Folder, set: SetNotesState, get: () => NotesState): void {
    const later = finishFolderMutation(mutation);
    for (const pending of later)
        pending.before = replaceFolder(pending.before, saved);
    noteState.folderStateGeneration++;
    set((state) => {
        const base = replaceFolder(state.folders, saved);
        return { folders: later.reduce((folders, pending) => pending.apply(folders), base) };
    });
    scheduleShellSave(get);
}

export function rollbackFolderMutation(mutation: PendingFolderMutation, set: SetNotesState, get: () => NotesState): void {
    const index = pendingFolderMutations.indexOf(mutation);
    if (index < 0)
        return;
    const later = pendingFolderMutations.slice(index + 1);
    pendingFolderMutations.splice(index, 1);
    noteState.folderStateGeneration++;
    const currentHasEntity = get().folders.some((folder) => folder.id === mutation.entityId);
    const before = !mutation.restoreMissingEntity && !currentHasEntity
        ? mutation.before.filter((folder) => folder.id !== mutation.entityId)
        : mutation.before;
    let next = before;
    for (const pending of later) {
        pending.before = next;
        next = pending.apply(next);
    }
    set({ folders: next });
    scheduleShellSave(get);
    reconcileFolderUi(get().folders);
}
