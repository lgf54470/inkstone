/** Deferred persistence of the note/folder/tag shell cache. */
import { localDb } from '../../lib/db';
import type { NotesState } from './model';

export function scheduleShellSave(get: () => NotesState): void {
    const state = get();
    localDb.scheduleShellSave({
        notes: Object.values(state.notes),
        folders: state.folders,
        tags: state.tags,
        cursor: state.cursor,
    });
}
