import type { NotesState, SetNotesState } from './model';
import { countText, deriveExcerpt, extractTags } from '@shared/markdown-utils';
import { duplicateNoteTitle } from '@shared/text-utils';
import { LIMITS } from '@shared/constants';
import type { NoteSummary } from '@shared/types';
import { api } from '../../lib/api';
import { localDb } from '../../lib/db';
import { adoptNote } from './adopt';
import { beginNoteMutation, finishNoteMutation, recoverNoteMutation, rollbackNoteMutation } from './note-mutations';
import { enqueueNoteWrite } from './persist';
import { discardNoteRuntimeState, markNotesOptimisticallyPurged, restoreOptimisticallyPurgedNotes, restoreVersionSnapshot, saveDirtyBeforeDestructiveMutation } from './runtime';
import { scheduleShellSave } from './shell-save';
import { commitPendingSummaryDerivation } from './summary';
import { hasOwnContent, newLocalEntityId } from './util';
import { captureWorkspaceState, restoreWorkspaceState, workspaceContainsNote } from './workspace';
import { dirty, pendingNoteCreates } from './model';
import { useUi, toastWithUndo } from '../ui';
import { t } from '../../lib/i18n';
import { toastError, DESTRUCTIVE_UNDO_TOAST_MS } from './undo';

export const destructive = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'deleteNote' | 'restoreNote' | 'restoreVersion' | 'purgeNote' | 'emptyTrash' | 'duplicateNote'> => ({

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
    }
});
