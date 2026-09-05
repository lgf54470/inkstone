import type { NotesState, SetNotesState } from './model';
import type { Folder } from '@shared/types';
import { api } from '../../lib/api';
import { beginFolderMutation, commitFolderMutation, finishFolderMutation, rollbackFolderMutation } from './folder-mutations';
import { applyOptimisticFolderPatch, applyPendingFolderMutations, availableLocalFolderName, insertionPositionForFolders, removeFolderAndPromoteChildren } from './folder-ops';
import { beginNoteMutation, finishNoteMutation, rollbackNoteMutation } from './note-mutations';
import { enqueueFolderWrite } from './persist';
import { folderEqual, reconcileFolderUi, reconcileList, tagEqual } from './reconcile';
import { scheduleShellSave } from './shell-save';
import { newLocalEntityId } from './util';
import { noteState, type PendingNoteMutation } from './model';
import { t } from '../../lib/i18n';
import { toastError } from './undo';

export const folderActions = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'createFolder' | 'patchFolder' | 'deleteFolder' | 'refreshFolders' | 'refreshTags'> => ({

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
    }
});
