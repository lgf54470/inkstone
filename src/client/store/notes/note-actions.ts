import type { NotesState, SetNotesState } from './model';
import { countText, deriveExcerpt, extractTags } from '@shared/markdown-utils';
import { LIMITS } from '@shared/constants';
import type { Note } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { localDb } from '../../lib/db';
import { adoptNote } from './adopt';
import { beginNoteMutation, compactOptimisticPatch, finishNoteMutation, recoverNoteMutation } from './note-mutations';
import { buildNewNoteContent, currentFolderId, pendingEditorCursors } from './new-note';
import { enqueueNoteWrite } from './persist';
import { advanceDirtyRevision } from './runtime';
import { scheduleShellSave } from './shell-save';
import { commitPendingSummaryDerivation } from './summary';
import { isVirtualFolderId } from '../../lib/calendar-tree';
import { newLocalEntityId } from './util';
import { captureWorkspaceState, restoreWorkspaceState, workspaceContainsNote } from './workspace';
import { dirty, pendingNoteCreates } from './model';
import { useUi } from '../ui';
import { t, type MessageKey } from '../../lib/i18n';
import { toastError, patchWithUndo, batchPatchTitle, type NotePatch } from './undo';

export const noteActions = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'createNote' | 'patchNote' | 'setArchived' | 'setArchivedMany' | 'setStarred' | 'setStarredMany' | 'setPinned' | 'setPinnedMany' | 'moveNotes'> => ({

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
    }
});
