/** Text-write staging: coalesced IndexedDB persistence, outbox enqueue, and per-note write serialization. */
import { CLIENT_ID } from '../../lib/api';
import { useSession } from '../session';
import { scheduleSummaryDerivation } from './summary';
import { scheduleShellSave } from './shell-save';
import { hasOwnContent, newLocalWriteId, outboxId } from './util';
import { dirty, folderWriteTails, inheritedOutboxWrites, notePersistCoalescer, noteState, noteWriteTails, type NotesState, type SetNotesState } from './model';

export function stageNoteTextWrite(id: string, content: string, title: string | undefined, set: SetNotesState, get: () => NotesState): void {
    const state = get();
    const summary = state.notes[id];
    if (!summary || !hasOwnContent(state.contents, id))
        return;
    const previousDirty = dirty.get(id);
    const writeId = newLocalWriteId();
    const queueId = previousDirty?.queueId ?? outboxId(id);
    const dependsOnWriteId = previousDirty?.dependsOnWriteId ?? inheritedOutboxWrites.get(id);
    const updatedAt = previousDirty?.updatedAt ?? Math.max(Date.now(), summary.updatedAt + 1);
    const contentChanged = state.contents[id] !== content;
    const contentDirty = previousDirty?.contentDirty === true || contentChanged;
    const payload = {
        content,
        contentDirty,
        rev: summary.rev,
        ...(title !== undefined ? { title } : {}),
    };
    const persisted = notePersistCoalescer.schedule(
        id,
        {
            id: queueId,
            clientId: CLIENT_ID,
            writeId,
            dependsOnWriteId,
            noteId: id,
            payload,
            attempts: 0,
            createdAt: Date.now(),
        },
        {
            content,
            contentDirty,
            ...(title !== undefined ? { pendingTitle: title } : {}),
            rev: summary.rev,
            updatedAt,
            writeId,
        },
    );
    dirty.set(id, { content, contentDirty, ...(title !== undefined ? { title } : {}), rev: summary.rev, writeId, queueId, dependsOnWriteId, updatedAt, persisted });
    const titleChanged = title !== undefined && summary.title !== title;
    set((current) => ({
        notes: titleChanged
            ? { ...current.notes, [id]: { ...current.notes[id]!, title, updatedAt } }
            : current.notes,
        contents: contentChanged ? { ...current.contents, [id]: content } : current.contents,
        saveStatus: 'dirty',
        pendingCount: Math.max(current.pendingCount, dirty.size),
    }));
    if (contentChanged)
        scheduleSummaryDerivation(id, content, updatedAt, set, get);
    if (titleChanged)
        scheduleShellSave(get);
    const delay = Math.max(100, useSession.getState().settings.editor.autoSaveDelay);
    window.clearTimeout(noteState.saveTimer);
    noteState.saveTimer = window.setTimeout(() => void get().flush(), delay);
}

export function enqueueNoteWrite<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = noteWriteTails.get(id) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(() => undefined, () => undefined);
    noteWriteTails.set(id, tail);
    void tail.then(() => {
        if (noteWriteTails.get(id) === tail)
            noteWriteTails.delete(id);
    });
    return result;
}

export function enqueueFolderWrite<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = folderWriteTails.get(id);
    const result = previous ? previous.then(operation) : operation();
    const tail = result.then(() => undefined, () => undefined);
    folderWriteTails.set(id, tail);
    void tail.then(() => {
        if (folderWriteTails.get(id) === tail)
            folderWriteTails.delete(id);
    });
    return result;
}
