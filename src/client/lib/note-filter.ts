import type { NoteSummary, ViewKind } from '@shared/types';

/** Decide whether a note belongs to the active list view, optionally stacked with a multi-tag selection (`any` or `all` must match). */
export function matchesView(
    note: NoteSummary,
    view: ViewKind,
    folderId: string | null,
    tag: string | null,
    folderScope?: ReadonlySet<string>,
    selectedTags: readonly string[] = [],
    selectedTagsMatch: 'any' | 'all' = 'any',
): boolean {
    if (view === 'trash')
        return Boolean(note.deletedAt);
    if (note.deletedAt)
        return false;
    if (view === 'archived')
        return note.isArchived;
    if (note.isArchived)
        return false;
    if (selectedTags.length) {
        const matches = selectedTagsMatch === 'all'
            ? selectedTags.every((name) => note.tags.includes(name))
            : selectedTags.some((name) => note.tags.includes(name));
        if (!matches)
            return false;
    }
    switch (view) {
        case 'starred':
            return note.isStarred;
        case 'unfiled':
            return !note.folderId;
        case 'folder':
            return Boolean(note.folderId && (folderScope?.has(note.folderId) ?? note.folderId === folderId));
        case 'tag':
            return Boolean(tag && note.tags.includes(tag));
        case 'recent':
        case 'all':
        default:
            return true;
    }
}