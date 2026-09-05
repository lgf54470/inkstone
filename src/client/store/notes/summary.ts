/** Deferred summary derivation (excerpt/word count/tags) for notes being edited. */
import { countText, deriveExcerpt, extractTags, sortTagNames } from '@shared/markdown-utils';
import { scheduleShellSave } from './shell-save';
import { equalStringArrays } from './util';
import { pendingSummaryDerivations, SUMMARY_DERIVE_DELAY_MS, type NotesState, type PendingSummaryDerivation, type SetNotesState } from './model';
import type { NoteSummary } from '@shared/types';

export function scheduleSummaryDerivation(id: string, content: string, updatedAt: number, set: SetNotesState, get: () => NotesState): void {
    const existing = pendingSummaryDerivations.get(id);
    if (existing)
        window.clearTimeout(existing.timer);
    const pending: PendingSummaryDerivation = {
        content,
        updatedAt,
        set,
        get,
        timer: 0,
    };
    pending.timer = window.setTimeout(() => commitPendingSummaryDerivation(id), SUMMARY_DERIVE_DELAY_MS);
    pendingSummaryDerivations.set(id, pending);
}
export function commitAllPendingSummaryDerivations(): void {
    for (const id of [...pendingSummaryDerivations.keys()])
        commitPendingSummaryDerivation(id);
}
export function commitPendingSummaryDerivation(id: string): void {
    const pending = pendingSummaryDerivations.get(id);
    if (!pending)
        return;
    window.clearTimeout(pending.timer);
    pendingSummaryDerivations.delete(id);
    let hasShellChanged = false;
    pending.set((state) => {
        const summary = state.notes[id];
        if (!summary || state.contents[id] !== pending.content)
            return state;
        const excerpt = deriveExcerpt(pending.content);
        const { words, chars } = countText(pending.content);
        const extractedTags = extractTags(pending.content);
        const tags = equalStringArrays(summary.tags, extractedTags) ? summary.tags : extractedTags;
        if (summary.excerpt === excerpt &&
            summary.wordCount === words &&
            summary.charCount === chars &&
            summary.tags === tags &&
            summary.updatedAt === pending.updatedAt) {
            return state;
        }
        hasShellChanged = true;
        return {
            notes: {
                ...state.notes,
                [id]: {
                    ...summary,
                    excerpt,
                    wordCount: words,
                    charCount: chars,
                    tags,
                    updatedAt: pending.updatedAt,
                },
            },
        };
    });
    if (hasShellChanged)
        scheduleShellSave(pending.get);
}

export function normalizeNoteSummaryTags(note: NoteSummary): NoteSummary {
    const tags = sortTagNames(note.tags);
    return equalStringArrays(note.tags, tags) ? note : { ...note, tags };
}
