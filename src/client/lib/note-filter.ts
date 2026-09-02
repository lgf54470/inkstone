import type { DateRangeFilter, NoteSummary, ViewKind } from '@shared/types';
import { CALENDAR_TREE, DEFAULT_TODO_TAG, isTodoFolderId, isVirtualFolderId, parseVirtualId, TODO_TREE, virtualPeriodMatchesNote } from './calendar-tree';
import { dateKey } from './time';

/** Decide whether a note belongs to the active list view, optionally stacked with a multi-tag selection (`any` or `all` must match). */
export function matchesView(
    note: NoteSummary,
    view: ViewKind,
    folderId: string | null,
    tag: string | null,
    folderScope?: ReadonlySet<string>,
    selectedTags: readonly string[] = [],
    selectedTagsMatch: 'any' | 'all' = 'any',
    dateFilter: DateRangeFilter | null = null,
    todoTagText: string = DEFAULT_TODO_TAG,
): boolean {
    if (view === 'trash')
        return Boolean(note.deletedAt);
    if (note.deletedAt)
        return false;
    if (view === 'archived')
        return note.isArchived;
    if (note.isArchived)
        return false;
    if (dateFilter) {
        const key = dateKey(new Date(note.updatedAt));
        if (key < dateFilter.start || key > dateFilter.end)
            return false;
    }
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
        case 'folder': {
            if (isVirtualFolderId(folderId)) {
                const ns = isTodoFolderId(folderId) ? TODO_TREE : CALENDAR_TREE;
                const period = parseVirtualId(folderId, ns);
                return period !== null && virtualPeriodMatchesNote(period, note, ns, todoTagText);
            }
            return Boolean(note.folderId && (folderScope?.has(note.folderId) ?? note.folderId === folderId));
        }
        case 'tag':
            return Boolean(tag && note.tags.includes(tag));
        case 'untagged':
            return note.tags.length === 0;
        case 'recent':
        case 'all':
        default:
            return true;
    }
}