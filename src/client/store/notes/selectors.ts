/** Read-side selectors and hooks: navigation counts, visible notes, folder tree, active-note lookups. */
import { useDeferredValue, useMemo } from 'react';
import { normalizeLinkKey } from '@shared/markdown-utils';
import { LIMITS } from '@shared/constants';
import { resolveTodoTag } from '../../lib/calendar-tree';
import { folderDescendantIds } from '../../lib/folders';
import { matchesView } from '../../lib/note-filter';
import { useLocale } from '../../lib/i18n';
import { useNotes } from '../notes';
import { useSession } from '../session';
import { useUi, type WorkspacePane } from '../ui';
import { noteState } from './model';
import type { NotesState } from './model';
import type { Folder, NoteSummary } from '@shared/types';
import { getFolderTemplateId, getInboxFolderId } from '../../lib/folder-prefs';
import { renderNewNoteTemplate } from '@shared/markdown-utils';
import { useNoteTemplates } from '../note-templates';
import { compare, compareTrash } from './workspace';

type TagCacheState = Pick<NotesState, 'notes' | 'tags'>;

export function setOptimisticTagCache(update: (state: NotesState) => Partial<TagCacheState>) {
    noteState.tagStateGeneration++;
    useNotes.setState((state) => update(state));
}

export function createContextualNote(input?: {
    title?: string;
    content?: string;
    open?: boolean;
}): Promise<string | null> {
    const ui = useUi.getState();
    // Tags gathered with cmd/ctrl+click in the sidebar are consumed by the
    // next new-note action, then cleared.
    const selectedTags = ui.selectedTags.length > 0 ? [...ui.selectedTags] : null;
    if (selectedTags)
        ui.clearTagSelection();

    const inboxId = getInboxFolderId();
    const folders = useNotes.getState().folders ?? [];
    const validInboxId = inboxId && folders.some((f) => f.id === inboxId) ? inboxId : undefined;
    const defaultFolderId = ui.view === 'folder' ? ui.folderId : validInboxId;

    let initialTitle = input?.title;
    let initialContent = input?.content;

    if (defaultFolderId && initialContent === undefined) {
        const templateId = getFolderTemplateId(defaultFolderId);
        if (templateId) {
            const template = useNoteTemplates.getState().templates.find((t) => t.id === templateId);
            if (template) {
                const rendered = renderNewNoteTemplate(template.content, template.name, new Date());
                if (!initialTitle) {
                    initialTitle = template.name;
                }
                initialContent = rendered.content;
            }
        }
    }

    const payload = {
        ...input,
        ...(initialTitle !== undefined ? { title: initialTitle } : {}),
        ...(initialContent !== undefined ? { content: initialContent } : {}),
    };

    if (ui.view === 'trash' || ui.view === 'archived') {
        ui.openView('all');
        return useNotes.getState().createNote({
            ...payload,
            ...(defaultFolderId ? { folderId: defaultFolderId } : {}),
            ...(selectedTags && input?.content === undefined ? { tags: selectedTags } : {}),
        });
    }
    return useNotes.getState().createNote({
        ...payload,
        ...(defaultFolderId ? { folderId: defaultFolderId } : {}),
        ...(ui.view === 'tag' && ui.tag && input?.content === undefined ? { tags: [ui.tag] } : {}),
        ...(selectedTags && input?.content === undefined ? { tags: selectedTags } : {}),
        ...(ui.view === 'starred' ? { isStarred: true } : {}),
    });
}

export interface NoteGroup {
    key: string;
    label: string;
    notes: NoteSummary[];
}
export interface NavigationCounts {
    all: number;
    starred: number;
    unfiled: number;
    archived: number;
    trash: number;
    untagged: number;
}
interface NavigationProjection {
    counts: NavigationCounts;
    folderCounts: ReadonlyMap<string, number>;
}
let navigationProjectionNotes: Record<string, NoteSummary> | null = null;
let navigationProjectionCache: NavigationProjection = {
    counts: { all: 0, starred: 0, unfiled: 0, archived: 0, trash: 0, untagged: 0 },
    folderCounts: new Map(),
};
export function selectNavigationProjection(notes: Record<string, NoteSummary>): NavigationProjection {
    if (notes === navigationProjectionNotes)
        return navigationProjectionCache;
    navigationProjectionNotes = notes;
    const counts: NavigationCounts = { all: 0, starred: 0, unfiled: 0, archived: 0, trash: 0, untagged: 0 };
    const folderCounts = new Map<string, number>();
    for (const note of Object.values(notes)) {
        if (note.deletedAt) {
            counts.trash++;
            continue;
        }
        if (note.isArchived) {
            counts.archived++;
            continue;
        }
        counts.all++;
        if (note.isStarred)
            counts.starred++;
        if (!note.tags || note.tags.length === 0)
            counts.untagged++;
        if (!note.folderId) {
            counts.unfiled++;
        }
        else {
            folderCounts.set(note.folderId, (folderCounts.get(note.folderId) ?? 0) + 1);
        }
    }
    const stableCounts = navigationCountsEqual(navigationProjectionCache.counts, counts)
        ? navigationProjectionCache.counts
        : counts;
    const stableFolderCounts = numberMapEqual(navigationProjectionCache.folderCounts, folderCounts)
        ? navigationProjectionCache.folderCounts
        : folderCounts;
    if (stableCounts === navigationProjectionCache.counts &&
        stableFolderCounts === navigationProjectionCache.folderCounts) {
        return navigationProjectionCache;
    }
    navigationProjectionCache = { counts: stableCounts, folderCounts: stableFolderCounts };
    return navigationProjectionCache;
}
function navigationCountsEqual(a: NavigationCounts, b: NavigationCounts): boolean {
    return a.all === b.all &&
        a.starred === b.starred &&
        a.unfiled === b.unfiled &&
        a.archived === b.archived &&
        a.trash === b.trash &&
        a.untagged === b.untagged;
}
function numberMapEqual(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
    if (a.size !== b.size)
        return false;
    for (const [key, value] of a) {
        if (b.get(key) !== value)
            return false;
    }
    return true;
}
export function useNavigationCounts(): NavigationCounts {
    return useNotes((state) => selectNavigationProjection(state.notes).counts);
}

export function useVisibleNotes(): NoteSummary[] {
    const locale = useLocale();
    const notes = useNotes((s) => s.notes);
    // Re-sorting the whole visible set after every autosave derivation is the
    // most expensive idle work while typing; defer it so input stays on the
    // urgent lane and the list reorders one frame later.
    const deferredNotes = useDeferredValue(notes);
    const folders = useNotes((s) => s.folders);
    const view = useUi((s) => s.view);
    const folderId = useUi((s) => s.folderId);
    const tag = useUi((s) => s.tag);
    const selectedTags = useUi((s) => s.selectedTags);
    const selectedTagsMatch = useUi((s) => s.selectedTagsMatch);
    const dateFilter = useUi((s) => s.dateFilter);
    const sort = useUi((s) => s.sort);
    const order = useUi((s) => s.order);
    const todoTagPref = useSession((s) => s.settings.notes.todoTag);
    return useMemo(() => {
        const folderScope = view === 'folder' && folderId ? folderDescendantIds(folders, folderId) : undefined;
        const list = Object.values(deferredNotes).filter((n) => matchesView(n, view, folderId, tag, folderScope, selectedTags, selectedTagsMatch, dateFilter, resolveTodoTag(todoTagPref, locale)));
        if (view === 'recent') {
            return list
                .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
                .slice(0, 60);
        }
        if (view === 'trash')
            return list.sort(compareTrash);
        return list.sort((a, b) => compare(a, b, sort, order, locale));
    }, [deferredNotes, folders, view, folderId, tag, selectedTags, selectedTagsMatch, dateFilter, sort, order, locale]);
}
export interface FolderNode extends Folder {
    children: FolderNode[];
    depth: number;
    directNotes: number;
    totalNotes: number;
}
export function useFolderTree(): FolderNode[] {
    const folders = useNotes((s) => s.folders);
    const direct = useNotes((state) => selectNavigationProjection(state.notes).folderCounts);
    return useMemo(() => buildFolderTree(folders, direct), [folders, direct]);
}
export function buildFolderTree(folders: Folder[], direct: ReadonlyMap<string, number>): FolderNode[] {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const byParent = new Map<string, Folder[]>();
    const compare = (a: Folder, b: Folder) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
    for (const folder of folders) {
        const key = folder.parentId ?? '';
        const list = byParent.get(key) ?? [];
        list.push(folder);
        byParent.set(key, list);
    }
    for (const list of byParent.values())
        list.sort(compare);
    const visited = new Set<string>();
    const build = (folder: Folder, depth: number, parentId: string | null): FolderNode | null => {
        if (visited.has(folder.id))
            return null;
        visited.add(folder.id);
        const children = depth + 1 < LIMITS.folderDepthMax
            ? (byParent.get(folder.id) ?? []).flatMap((child) => {
                const node = build(child, depth + 1, folder.id);
                return node ? [node] : [];
            })
            : [];
        const directNotes = direct.get(folder.id) ?? 0;
        const totalNotes = directNotes + children.reduce((sum, child) => sum + child.totalNotes, 0);
        return { ...folder, parentId, children, depth, directNotes, totalNotes };
    };
    const roots = folders
        .filter((folder) => folder.parentId === null || !byId.has(folder.parentId))
        .sort(compare)
        .flatMap((folder) => {
        const node = build(folder, 0, null);
        return node ? [node] : [];
    });
    for (const folder of [...folders].sort(compare)) {
        if (visited.has(folder.id))
            continue;
        const node = build(folder, 0, null);
        if (node)
            roots.push(node);
    }
    return roots.sort(compare);
}
export function useActiveNote(pane: WorkspacePane | 'active' = 'active'): {
    note: NoteSummary | null;
    content: string;
    loaded: boolean;
} {
    const activeId = useUi((state) => {
        if (pane === 'active')
            return state.activeNoteId;
        if (!state.workspaceSecondaryNoteId)
            return pane === 'primary' ? state.activeNoteId : null;
        return pane === 'primary' ? state.workspacePrimaryNoteId : state.workspaceSecondaryNoteId;
    });
    const note = useNotes((s) => (activeId ? (s.notes[activeId] ?? null) : null));
    const storedContent = useNotes((s) => (activeId ? s.contents[activeId] : undefined));
    return {
        note,
        content: storedContent ?? '',
        loaded: !activeId || storedContent !== undefined,
    };
}
export function noteById(id: string): NoteSummary | undefined {
    return useNotes.getState().notes[id];
}

export function findNoteByTitle(title: string): NoteSummary | undefined {
    const key = normalizeLinkKey(title);
    return Object.values(useNotes.getState().notes).find((n) => !n.deletedAt && normalizeLinkKey(n.title) === key);
}
