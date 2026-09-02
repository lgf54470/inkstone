/** Workspace/intent helpers: view scoping for initial note selection and workspace-state snapshots. */
import { resolveTodoTag } from '../../lib/calendar-tree';
import { folderDescendantIds } from '../../lib/folders';
import { matchesView } from '../../lib/note-filter';
import { getLocale } from '../../lib/i18n';
import { useSession } from '../session';
import { useUi, type WorkspacePane } from '../ui';
import type { AppLocale, Folder, NoteSummary, SortKey, SortOrder } from '@shared/types';

export function compare(a: NoteSummary, b: NoteSummary, sort: SortKey, order: SortOrder, locale: AppLocale): number {
    if (a.isPinned !== b.isPinned)
        return a.isPinned ? -1 : 1;
    const dir = order === 'asc' ? 1 : -1;
    let result: number;
    switch (sort) {
        case 'created':
            result = (a.createdAt - b.createdAt) * dir;
            break;
        case 'title':
            result = a.title.localeCompare(b.title, locale, { numeric: true, sensitivity: 'base' }) * dir;
            break;
        case 'updated':
        default:
            result = (a.updatedAt - b.updatedAt) * dir;
            break;
    }
    return result || a.id.localeCompare(b.id);
}
export function compareTrash(a: NoteSummary, b: NoteSummary): number {
    return (b.deletedAt ?? b.updatedAt) - (a.deletedAt ?? a.updatedAt) || a.id.localeCompare(b.id);
}
export function pickInitialNoteId(notes: Record<string, NoteSummary>, folders: Folder[]): string | null {
    const ui = useUi.getState();
    const folderScope = ui.view === 'folder' && ui.folderId ? folderDescendantIds(folders, ui.folderId) : undefined;
    const selectedTags = ui.selectedTags;
    const selectedTagsMatch = ui.selectedTagsMatch;
    const dateFilter = ui.dateFilter;
    const todoTagText = resolveTodoTag(useSession.getState().settings.notes.todoTag, getLocale());
    const active = ui.activeNoteId ? notes[ui.activeNoteId] : undefined;
    if (active && matchesView(active, ui.view, ui.folderId, ui.tag, folderScope, selectedTags, selectedTagsMatch, dateFilter, todoTagText))
        return active.id;
    const visible = Object.values(notes).filter((note) => matchesView(note, ui.view, ui.folderId, ui.tag, folderScope, selectedTags, selectedTagsMatch, dateFilter, todoTagText));
    if (ui.view === 'recent') {
        visible.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    }
    else if (ui.view === 'trash') {
        visible.sort(compareTrash);
    }
    else {
        visible.sort((a, b) => compare(a, b, ui.sort, ui.order, getLocale()));
    }
    return visible[0]?.id ?? null;
}

export function captureWorkspaceState() {
    const ui = useUi.getState();
    return {
        activeNoteId: ui.activeNoteId,
        workspacePrimaryNoteId: ui.workspacePrimaryNoteId,
        workspaceSecondaryNoteId: ui.workspaceSecondaryNoteId,
        activeWorkspacePane: ui.activeWorkspacePane,
        selectedIds: ui.selectedIds,
        recentNoteIds: ui.recentNoteIds,
        mobilePane: ui.mobilePane,
    };
}

export function workspaceContainsNote(id: string): boolean {
    const ui = useUi.getState();
    return ui.activeNoteId === id ||
        ui.workspacePrimaryNoteId === id ||
        ui.workspaceSecondaryNoteId === id;
}

export function workspacePaneForNote(id: string): WorkspacePane | null {
    const ui = useUi.getState();
    if (ui.workspaceSecondaryNoteId) {
        if (ui.workspacePrimaryNoteId === id && ui.workspaceSecondaryNoteId === id)
            return ui.activeWorkspacePane;
        if (ui.workspacePrimaryNoteId === id)
            return 'primary';
        if (ui.workspaceSecondaryNoteId === id)
            return 'secondary';
    }
    return ui.activeNoteId === id ? 'primary' : null;
}

export function restoreWorkspaceState(snapshot: ReturnType<typeof captureWorkspaceState>): void {
    useUi.setState(snapshot);
}
