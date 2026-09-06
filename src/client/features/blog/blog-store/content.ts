import { api } from '../../../lib/api';
import type { BlogStoreState, SetBlogStoreState } from './types';

export const blogContentActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'createFolder' | 'patchFolder' | 'deleteFolder' | 'createTag' | 'patchTag' | 'deleteTag'> => ({
    createFolder: (name, parentId, color, icon) => createFolderImpl(name, parentId, color, icon, set),
    patchFolder: (id, patch) => patchFolderImpl(id, patch, set),
    deleteFolder: (id) => deleteFolderImpl(id, set, get),
    createTag: (name, color) => createTagImpl(name, color, set),
    patchTag: (id, patch) => patchTagImpl(id, patch, set),
    deleteTag: (id) => deleteTagImpl(id, set, get),
});

async function createFolderImpl(
    name: Parameters<BlogStoreState['createFolder']>[0],
    parentId: Parameters<BlogStoreState['createFolder']>[1],
    color: Parameters<BlogStoreState['createFolder']>[2],
    icon: Parameters<BlogStoreState['createFolder']>[3],
    set: SetBlogStoreState,
): Promise<BlogStoreState['folders'][number] | null> {
    try {
        const folder = await api.blog.folders.create({ name, parentId, color, icon });
        set((s) => ({
            folders: [...s.folders, folder],
            stats: s.stats
                ? {
                    ...s.stats,
                    folderCounts: {
                        ...s.stats.folderCounts,
                        [folder.id]: { total: 0, published: 0 },
                    },
                }
                : null,
        }));
        return folder;
    } catch {
        return null;
    }
}

async function patchFolderImpl(
    id: Parameters<BlogStoreState['patchFolder']>[0],
    patch: Parameters<BlogStoreState['patchFolder']>[1],
    set: SetBlogStoreState,
): Promise<BlogStoreState['folders'][number] | null> {
    try {
        const folder = await api.blog.folders.patch(id, patch);
        set((s) => ({
            folders: s.folders.map((f) => (f.id === id ? folder : f)),
        }));
        return folder;
    } catch {
        return null;
    }
}

async function deleteFolderImpl(id: string, set: SetBlogStoreState, get: () => BlogStoreState): Promise<boolean> {
    try {
        await api.blog.folders.remove(id);
        set((s) => ({
            folders: s.folders.filter((f) => f.id !== id),
            folderId: s.folderId === id ? null : s.folderId,
        }));
        await Promise.all([get().loadPosts(), get().loadStats()]);
        return true;
    } catch {
        return false;
    }
}

async function createTagImpl(
    name: Parameters<BlogStoreState['createTag']>[0],
    color: Parameters<BlogStoreState['createTag']>[1],
    set: SetBlogStoreState,
): Promise<BlogStoreState['tags'][number] | null> {
    try {
        const tag = await api.blog.tags.create({ name, color });
        set((s) => ({
            tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag],
            stats: s.stats
                ? {
                    ...s.stats,
                    tagCounts: {
                        ...s.stats.tagCounts,
                        [tag.name]: { total: 0, published: 0 },
                    },
                }
                : null,
        }));
        return tag;
    } catch {
        return null;
    }
}

async function patchTagImpl(
    id: Parameters<BlogStoreState['patchTag']>[0],
    patch: Parameters<BlogStoreState['patchTag']>[1],
    set: SetBlogStoreState,
): Promise<BlogStoreState['tags'][number] | null> {
    try {
        const tag = await api.blog.tags.patch(id, patch);
        set((s) => ({
            tags: s.tags.map((t) => (t.id === id ? tag : t)),
        }));
        return tag;
    } catch {
        return null;
    }
}

async function deleteTagImpl(id: string, set: SetBlogStoreState, get: () => BlogStoreState): Promise<boolean> {
    try {
        await api.blog.tags.remove(id);
        const removed = get().tags.find((t) => t.id === id);
        set((s) => ({
            tags: s.tags.filter((t) => t.id !== id),
            tag: removed && s.tag === removed.name ? null : s.tag,
        }));
        await Promise.all([get().loadPosts(), get().loadStats()]);
        return true;
    } catch {
        return false;
    }
}