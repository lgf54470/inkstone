/** Merge/reconcile helpers: fold remote summaries/lists together with pending optimistic state. */
import type { Folder, NoteSummary, Tag } from '@shared/types';
import { isVirtualFolderId } from '../../lib/calendar-tree';
import { useUi } from '../ui';
import { dirty, pendingNoteCreates, pendingNoteMutations, purgedNoteIds } from './model';

export function applyPendingNoteMutations(id: string, summary: NoteSummary): NoteSummary {
    const pending = pendingNoteMutations.get(id);
    if (!pending?.length)
        return summary;
    return pending.reduce<NoteSummary>((current, mutation) => ({ ...current, ...mutation.patch }), summary);
}

export function noteSummaryEqual(a: NoteSummary, b: NoteSummary): boolean {
    return (a.id === b.id &&
        a.title === b.title &&
        a.excerpt === b.excerpt &&
        a.folderId === b.folderId &&
        a.isPinned === b.isPinned &&
        a.isStarred === b.isStarred &&
        a.isArchived === b.isArchived &&
        a.wordCount === b.wordCount &&
        a.charCount === b.charCount &&
        a.rev === b.rev &&
        a.position === b.position &&
        a.createdAt === b.createdAt &&
        a.updatedAt === b.updatedAt &&
        a.deletedAt === b.deletedAt &&
        a.tags.length === b.tags.length &&
        a.tags.every((tag, index) => tag === b.tags[index]));
}

export function reconcileNotes(current: Record<string, NoteSummary>, incoming: NoteSummary[], deletions: {
    entity: string;
    id: string;
}[], full: boolean): Record<string, NoteSummary> {
    if (full) {
        const next: Record<string, NoteSummary> = {};
        let unchanged = Object.keys(current).length === incoming.length;
        for (const remote of incoming) {
            if (purgedNoteIds.has(remote.id)) {
                unchanged = false;
                continue;
            }
            const candidate = reconcileRemoteSummary(current[remote.id], remote);
            const existing = current[remote.id];
            const note = existing && noteSummaryEqual(existing, candidate) ? existing : candidate;
            next[note.id] = note;
            if (existing !== note)
                unchanged = false;
        }
        for (const [id, note] of Object.entries(current)) {
            if ((dirty.has(id) || pendingNoteMutations.has(id) || pendingNoteCreates.has(id)) && !next[id])
                next[id] = note;
        }
        return unchanged ? current : next;
    }
    let next = current;
    const ensureCopy = () => {
        if (next === current)
            next = { ...current };
    };
    for (const remote of incoming) {
        if (purgedNoteIds.has(remote.id))
            continue;
        const candidate = reconcileRemoteSummary(current[remote.id], remote);
        const existing = current[remote.id];
        if (existing && noteSummaryEqual(existing, candidate))
            continue;
        ensureCopy();
        next[remote.id] = candidate;
    }
    for (const deletion of deletions) {
        if (deletion.entity !== 'note' || !next[deletion.id] || dirty.has(deletion.id) || pendingNoteMutations.has(deletion.id) || pendingNoteCreates.has(deletion.id))
            continue;
        ensureCopy();
        delete next[deletion.id];
    }
    return next;
}
export function reconcileRemoteSummary(current: NoteSummary | undefined, incoming: NoteSummary): NoteSummary {
    const base = current && current.rev > incoming.rev
        ? current
        : mergeDirtySummary(current, incoming);
    return applyPendingNoteMutations(incoming.id, base);
}
export function mergeDirtySummary(current: NoteSummary | undefined, incoming: NoteSummary): NoteSummary {
    const pending = dirty.get(incoming.id);
    if (!current || !pending)
        return incoming;
    return {
        ...incoming,
        title: current.title,
        excerpt: current.excerpt,
        tags: current.tags,
        wordCount: current.wordCount,
        charCount: current.charCount,
        rev: pending.rev,
        updatedAt: current.updatedAt,
    };
}
export function reconcileList<T extends {
    id: string;
}>(current: T[], incoming: T[], equal: (a: T, b: T) => boolean): T[] {
    const byId = new Map(current.map((item) => [item.id, item]));
    const next = incoming.map((item) => {
        const existing = byId.get(item.id);
        return existing && equal(existing, item) ? existing : item;
    });
    return next.length === current.length && next.every((item, index) => item === current[index])
        ? current
        : next;
}
export function mergeById<T extends {
    id: string;
}>(current: T[], incoming: T[], deletions: {
    entity: string;
    id: string;
}[], entity: string, equal: (a: T, b: T) => boolean): T[] {
    const currentMap = new Map(current.map((item) => [item.id, item]));
    let map: Map<string, T> | null = null;
    for (const item of incoming) {
        const existing = currentMap.get(item.id);
        if (existing && equal(existing, item))
            continue;
        if (!map)
            map = new Map(currentMap);
        map.set(item.id, item);
    }
    for (const deletion of deletions) {
        if (deletion.entity !== entity || !currentMap.has(deletion.id))
            continue;
        if (!map)
            map = new Map(currentMap);
        map.delete(deletion.id);
    }
    return map ? [...map.values()] : current;
}
export function folderEqual(a: Folder, b: Folder): boolean {
    return (a.id === b.id &&
        a.parentId === b.parentId &&
        a.name === b.name &&
        a.icon === b.icon &&
        a.color === b.color &&
        a.position === b.position &&
        a.createdAt === b.createdAt &&
        a.updatedAt === b.updatedAt &&
        a.noteCount === b.noteCount);
}
export function normalizeFolder(folder: Folder): Folder {
    return folder.color === undefined ? { ...folder, color: null } : folder;
}
export function reconcileFolderUi(folders: Folder[]): void {
    const validIds = new Set(folders.map((folder) => folder.id));
    const ui = useUi.getState();
    const expandedFolders = ui.expandedFolders.filter((id) => validIds.has(id) || isVirtualFolderId(id));
    if (expandedFolders.length !== ui.expandedFolders.length)
        useUi.setState({ expandedFolders });
    if (ui.view === 'folder' && (!ui.folderId || (!isVirtualFolderId(ui.folderId) && !validIds.has(ui.folderId))))
        ui.openView('all');
}
export function tagEqual(a: Tag, b: Tag): boolean {
    return (a.id === b.id &&
        a.name === b.name &&
        a.color === b.color &&
        a.count === b.count &&
        a.createdAt === b.createdAt);
}
