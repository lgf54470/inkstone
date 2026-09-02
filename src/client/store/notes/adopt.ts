/** Adopting fetched/created/saved notes into the store (summary plus content caches). */
import { api } from '../../lib/api';
import { localDb } from '../../lib/db';
import { applyPendingNoteMutations, mergeDirtySummary, noteSummaryEqual } from './reconcile';
import { scheduleShellSave } from './shell-save';
import { dirty, noteRequests, noteRequestEpochs, purgedNoteIds, validatedRevisions, STALE_NOTE_REQUEST, type NotesState, type SetNotesState } from './model';
import type { Note, NoteSummary } from '@shared/types';

export function adoptNote(note: Note | NoteSummary, set: SetNotesState, get: () => NotesState): void {
    if (purgedNoteIds.has(note.id))
        return;
    const hasContent = 'content' in note;
    const incomingSummary = stripContent(note);
    const acceptContent = hasContent && !dirty.has(note.id);
    let shellChanged = false;
    set((state) => {
        const currentSummary = state.notes[note.id];
        const reconciled = applyPendingNoteMutations(note.id, mergeDirtySummary(currentSummary, incomingSummary));
        const nextSummary = currentSummary && noteSummaryEqual(currentSummary, reconciled)
            ? currentSummary
            : reconciled;
        const nextContent = acceptContent ? (note as Note).content : state.contents[note.id];
        const summaryChanged = currentSummary !== nextSummary;
        const contentChanged = acceptContent && state.contents[note.id] !== nextContent;
        const nextSaveStatus = dirty.size ? state.saveStatus : 'synced';
        const statusChanged = state.saveStatus !== nextSaveStatus;
        shellChanged = summaryChanged;
        if (!summaryChanged && !contentChanged && !statusChanged)
            return state;
        return {
            notes: summaryChanged ? { ...state.notes, [note.id]: nextSummary } : state.notes,
            contents: contentChanged ? { ...state.contents, [note.id]: nextContent! } : state.contents,
            saveStatus: nextSaveStatus,
        };
    });
    if (acceptContent) {
        void localDb.setContent(note.id, {
            content: (note as Note).content,
            rev: note.rev,
            updatedAt: note.updatedAt,
        });
    }
    if (shellChanged)
        scheduleShellSave(get);
}
export function stripContent(note: Note | NoteSummary): NoteSummary {
    const { content: _content, ...summary } = note as Note;
    return summary;
}

export function requestNote(id: string): Promise<Note> {
    const pending = noteRequests.get(id);
    if (pending)
        return pending;
    const epoch = noteRequestEpochs.get(id) ?? 0;
    const request = api.notes.get(id).then((note) => {
        if ((noteRequestEpochs.get(id) ?? 0) !== epoch)
            throw STALE_NOTE_REQUEST;
        return note;
    }).finally(() => {
        if (noteRequests.get(id) === request)
            noteRequests.delete(id);
    });
    noteRequests.set(id, request);
    return request;
}
export function revalidateNote(id: string, rev: number, set: SetNotesState, get: () => NotesState): void {
    if (dirty.has(id) || validatedRevisions.get(id) === rev)
        return;
    validatedRevisions.set(id, rev);
    void requestNote(id)
        .then((note) => {
        validatedRevisions.set(id, note.rev);
        adoptNote(note, set, get);
    })
        .catch(() => {
        if (validatedRevisions.get(id) === rev)
            validatedRevisions.delete(id);
    });
}
