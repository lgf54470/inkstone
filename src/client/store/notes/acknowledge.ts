/** Cross-tab broadcast acknowledgements: apply outbox results and base advancements from other tabs. */
import { useNotes } from '../notes';
import { adoptNote } from './adopt';
import { pendingNoteCount, showOfflineRecoveryToast, type OutboxResult } from './outbox';
import { advanceDirtyRevision, advanceDependentOutboxWrites } from './runtime';
import { scheduleShellSave } from './shell-save';
import { workspacePaneForNote } from './workspace';
import { localDb, type BroadcastPayload } from '../../lib/db';
import { CLIENT_ID } from '../../lib/api';
import { useUi } from '../ui';
import { dirty, validatedRevisions } from './model';

function refreshPendingCount(): void {
    void localDb.getOutbox()
        .then((outbox) => useNotes.setState({ pendingCount: pendingNoteCount(outbox) }))
        .catch(() => { });
}
export function acknowledgeOutboxBaseAdvanced(
    result: Extract<BroadcastPayload, { type: 'outbox-base-advanced' }>,
): Promise<void> {
    return advanceDependentOutboxWrites(
        result.noteId,
        result.writeId,
        result.expectedRev,
        result.nextRev,
        () => useNotes.getState(),
        false,
    );
}
export function acknowledgeOutboxResult(result: OutboxResult): void {
    if (result.targetClientId !== CLIENT_ID)
        return;
    const pending = dirty.get(result.noteId);
    if (!pending)
        return;
    const state = useNotes.getState();
    if (result.outcome === 'saved') {
        if (pending.writeId !== result.writeId) {
            if (result.rev !== undefined && result.rev > pending.rev) {
                advanceDirtyRevision(result.noteId, pending.rev, result.rev, () => useNotes.getState());
                void useNotes.getState().flush({ immediate: true });
            }
            return;
        }
        dirty.delete(result.noteId);
        if (result.savedNote?.id === result.noteId) {
            adoptNote(result.savedNote, useNotes.setState, () => useNotes.getState());
            useNotes.setState({ lastSavedAt: Date.now() });
            refreshPendingCount();
            return;
        }
        useNotes.setState((current) => {
            const note = current.notes[result.noteId];
            const nextRev = note && result.rev !== undefined && result.rev > note.rev
                ? result.rev
                : note?.rev;
            const nextTitle = note && typeof result.savedTitle === 'string'
                ? result.savedTitle
                : note?.title;
            const notes = note && (nextRev !== note.rev || nextTitle !== note.title)
                ? {
                    ...current.notes,
                    [result.noteId]: {
                        ...note,
                        title: nextTitle!,
                        rev: nextRev!,
                        updatedAt: result.updatedAt ?? note.updatedAt,
                    },
                }
                : current.notes;
            return {
                notes,
                saveStatus: dirty.size ? current.saveStatus : 'synced',
                lastSavedAt: Date.now(),
            };
        });
        const content = state.contents[result.noteId];
        if (content !== undefined && result.rev !== undefined) {
            void localDb.setContent(result.noteId, {
                content,
                rev: result.rev,
                updatedAt: result.updatedAt ?? Date.now(),
            });
        }
        scheduleShellSave(() => useNotes.getState());
        refreshPendingCount();
        return;
    }
    if (pending.writeId !== result.writeId)
        return;
    dirty.delete(result.noteId);
    validatedRevisions.delete(result.noteId);
    const openPane = workspacePaneForNote(result.noteId);
    const wasActive = useUi.getState().activeNoteId === result.noteId;
    useNotes.setState((current) => {
        const contents = { ...current.contents };
        delete contents[result.noteId];
        return {
            contents,
            saveStatus: dirty.size ? current.saveStatus : 'synced',
        };
    });
    void localDb.dropContent(result.noteId);
    refreshPendingCount();
    void useNotes.getState().pull().then(() => {
        if (openPane && useNotes.getState().notes[result.noteId])
            return useNotes.getState().openNote(result.noteId, { pane: openPane, activate: wasActive });
    });
    if (result.copyId)
        showOfflineRecoveryToast(() => useNotes.getState(), result.copyId, result.recoveryReason !== 'deleted');
}
