import type { NotesState } from './model';
import type { NoteSummary } from '@shared/types';
import { ApiError } from '../../lib/api';
import { useUi, toastWithUndo } from '../ui';
import { t, type MessageKey } from '../../lib/i18n';



/** Patch shape accepted by `patchNote` (summary flags plus folder moves). */
export type NotePatch = Partial<Pick<NoteSummary, 'isPinned' | 'isStarred' | 'isArchived'>> & {
    folderId?: string | null;
};



/** Undo window for destructive actions (e.g. moving a note to the trash): longer than the default 3800ms. */
export const DESTRUCTIVE_UNDO_TOAST_MS = 8000;


/** Batch toast title for a count-aware mutation (e.g. "Moved 3 notes"). */
export function batchPatchTitle(key: MessageKey, count: number): string {
    return t("notes.value0_value1_notes", { value0: t(key), value1: count });
}



/**
 * The shared store-level undo contract for light mutations: apply `patch` to every id in
 * `undoPatches`, then offer one undo toast running each note's captured revert patch.
 * `notify: 'confirm'` turns the action into a silent revert that confirms with a plain
 * toast; `'none'` reverts without any toast (batch undos).
 */
export async function patchWithUndo(
    get: () => NotesState,
    undoPatches: ReadonlyMap<string, NotePatch>,
    patch: NotePatch,
    title: string,
    revertTitle: string,
    notify: 'undo' | 'confirm' | 'none' = 'undo',
): Promise<void> {
    if (!undoPatches.size)
        return;
    await Promise.all([...undoPatches.keys()].map((id) => get().patchNote(id, patch)));
    if (notify === 'undo') {
        toastWithUndo(title, () => {
            for (const [id, undoPatch] of undoPatches)
                void get().patchNote(id, undoPatch);
            // Single-note reverts confirm with a plain toast describing the reverted state; batch reverts stay silent.
            if (undoPatches.size === 1)
                useUi.getState().toast({ title: revertTitle, tone: 'success' });
        });
        return;
    }
    if (notify === 'confirm')
        useUi.getState().toast({ title: revertTitle, tone: 'success' });
}


export function toastError(err: unknown, fallback: string): void {
    useUi.getState().toast({
        title: fallback,
        description: err instanceof ApiError ? err.message : String(err),
        tone: 'danger',
    });
}
