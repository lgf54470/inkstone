/** Offline write-ahead replay: public entry (`replayOutbox`) plus re-exports; machinery lives in `outbox-replay.ts`. */
import { CLIENT_ID } from '../../lib/api';
import { localDb } from '../../lib/db';
import { noteState } from './model';
import { pendingNoteCount, replayOutboxNow } from './outbox-replay';
import type { NotesState, SetNotesState } from './model';

export function replayOutbox(get: () => NotesState, set: SetNotesState): Promise<void> {
    if (noteState.outboxReplayPromise)
        return noteState.outboxReplayPromise;
    noteState.outboxReplayPromise = (async () => {
        try {
            const acquired = await localDb.withOutboxReplayLock(CLIENT_ID, async () => {
                await replayOutboxNow(get, set);
            });
            if (acquired)
                return;
            const pending = await localDb.getOutbox();
            set({ pendingCount: pendingNoteCount(pending) });
        } finally {
            noteState.outboxReplayPromise = null;
        }
    })();
    return noteState.outboxReplayPromise;
}

export { pendingNoteCount, showOfflineRecoveryToast } from './outbox-replay';
export type { OutboxResult } from './outbox-replay';