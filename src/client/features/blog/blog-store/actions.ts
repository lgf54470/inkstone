import { api } from '../../../lib/api';
import type { BlogStoreState, SetBlogStoreState } from './types';

export const blogActionsActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'batchToggleGroup' | 'batchMoveToFolder' | 'savePost' | 'updatePost' | 'deletePost' | 'syncPost' | 'batchPosts' | 'updateCommentStatus' | 'deleteComment' | 'batchComments' | 'createCategory' | 'updateCategory' | 'deleteCategory' | 'saveSettings'> => ({
    batchToggleGroup: (type, target, enabled) => batchToggleGroupImpl(type, target, enabled, set, get),
    batchMoveToFolder: (postIds, folderId) => batchMoveToFolderImpl(postIds, folderId, set, get),
    savePost: (data) => savePostImpl(data, get),
    updatePost: (id, patch) => updatePostImpl(id, patch, set, get),
    deletePost: (id) => deletePostImpl(id, get),
    syncPost: (id) => syncPostImpl(id, get),
    batchPosts: (action, extraId, pinnedState) => batchPostsImpl(action, extraId, pinnedState, set, get),
    updateCommentStatus: (id, status) => updateCommentStatusImpl(id, status, get),
    deleteComment: (id) => deleteCommentImpl(id, get),
    batchComments: (action) => batchCommentsImpl(action, set, get),
    createCategory: (data) => createCategoryImpl(data, get),
    updateCategory: (id, patch) => updateCategoryImpl(id, patch, get),
    deleteCategory: (id) => deleteCategoryImpl(id, get),
    saveSettings: (settings) => saveSettingsImpl(settings, set),
});

async function batchToggleGroupImpl(
    type: Parameters<BlogStoreState['batchToggleGroup']>[0],
    target: Parameters<BlogStoreState['batchToggleGroup']>[1],
    enabled: Parameters<BlogStoreState['batchToggleGroup']>[2],
    set: SetBlogStoreState,
    get: () => BlogStoreState,
): Promise<boolean> {
    set({ batchBusy: true });
    set((state) => ({
        posts: toggledPostRows(type, target, enabled, state.posts),
        stats: toggledGroupStats(type, target, enabled, state.stats),
    }));
    try {
        await api.blog.batchToggleGroup(type, target, enabled);
        await Promise.all([get().loadPosts(), get().loadStats()]);
        return true;
    } catch {
        await Promise.all([get().loadPosts(), get().loadStats()]);
        return false;
    } finally {
        set({ batchBusy: false });
    }
}

function toggledPostRows(
    type: Parameters<BlogStoreState['batchToggleGroup']>[0],
    target: string,
    enabled: boolean,
    posts: BlogStoreState['posts'],
): BlogStoreState['posts'] {
    return posts.map((p) => {
        if (type === 'folder') {
            if (p.folderId === target) {
                return { ...p, isPublished: enabled };
            }
        } else if (type === 'tag') {
            if (Array.isArray(p.tags) && p.tags.includes(target)) {
                return { ...p, isPublished: enabled };
            }
        }
        return p;
    });
}

function toggledGroupStats(
    type: Parameters<BlogStoreState['batchToggleGroup']>[0],
    target: string,
    enabled: boolean,
    stats: BlogStoreState['stats'],
): BlogStoreState['stats'] {
    if (!stats) return stats;
    if (type === 'folder' && stats.folderCounts?.[target]) {
        const prev = stats.folderCounts[target];
        return {
            ...stats,
            folderCounts: {
                ...stats.folderCounts,
                [target]: { total: prev.total, published: enabled ? prev.total : 0 },
            },
        };
    }
    if (type === 'tag' && stats.tagCounts?.[target]) {
        const prev = stats.tagCounts[target];
        return {
            ...stats,
            tagCounts: {
                ...stats.tagCounts,
                [target]: { total: prev.total, published: enabled ? prev.total : 0 },
            },
        };
    }
    return stats;
}

async function batchMoveToFolderImpl(
    postIds: Parameters<BlogStoreState['batchMoveToFolder']>[0],
    folderId: Parameters<BlogStoreState['batchMoveToFolder']>[1],
    set: SetBlogStoreState,
    get: () => BlogStoreState,
): Promise<boolean> {
    if (!postIds.length) return false;
    set({ batchBusy: true });
    set((state) => ({
        posts: state.posts.map((p) => (postIds.includes(p.id) ? { ...p, folderId } : p)),
    }));
    try {
        await api.blog.posts.batch('setFolder', postIds, { folderId });
        get().clearPostSelection();
        await Promise.all([get().loadPosts(), get().loadStats()]);
        return true;
    } catch {
        await get().loadPosts();
        return false;
    } finally {
        set({ batchBusy: false });
    }
}

async function savePostImpl(
    data: Parameters<BlogStoreState['savePost']>[0],
    get: () => BlogStoreState,
): Promise<{ ok: boolean; id: string; slug: string }> {
    const res = await api.blog.posts.create(data);
    await Promise.all([get().loadPosts(), get().loadStats(), get().loadTags()]);
    return res;
}

async function updatePostImpl(
    id: Parameters<BlogStoreState['updatePost']>[0],
    patch: Parameters<BlogStoreState['updatePost']>[1],
    set: SetBlogStoreState,
    get: () => BlogStoreState,
): Promise<void> {
    set((state) => ({
        posts: state.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    await api.blog.posts.patch(id, patch);
    await Promise.all([get().loadPosts(), get().loadStats(), get().loadTags()]);
}

async function deletePostImpl(id: string, get: () => BlogStoreState): Promise<void> {
    await api.blog.posts.remove(id);
    await Promise.all([get().loadPosts(), get().loadStats()]);
}

async function syncPostImpl(id: string, get: () => BlogStoreState): Promise<void> {
    await api.blog.posts.sync(id);
    await get().loadPosts();
}

async function batchPostsImpl(
    action: Parameters<BlogStoreState['batchPosts']>[0],
    extraId: Parameters<BlogStoreState['batchPosts']>[1],
    pinnedState: Parameters<BlogStoreState['batchPosts']>[2],
    set: SetBlogStoreState,
    get: () => BlogStoreState,
): Promise<void> {
    const ids = Array.from(get().selectedPostIds);
    if (!ids.length) return;
    set({ batchBusy: true });
    try {
        await api.blog.posts.batch(action, ids, {
            categoryId: extraId,
            folderId: extraId,
            isPinned: pinnedState,
        });
        get().clearPostSelection();
        await Promise.all([get().loadPosts(), get().loadStats(), get().loadTags()]);
    } finally {
        set({ batchBusy: false });
    }
}

async function updateCommentStatusImpl(
    id: string,
    status: Parameters<BlogStoreState['updateCommentStatus']>[1],
    get: () => BlogStoreState,
): Promise<void> {
    await api.blog.comments.updateStatus(id, status);
    await Promise.all([get().loadComments(), get().loadStats()]);
}

async function deleteCommentImpl(id: string, get: () => BlogStoreState): Promise<void> {
    await api.blog.comments.remove(id);
    await Promise.all([get().loadComments(), get().loadStats()]);
}

async function batchCommentsImpl(
    action: Parameters<BlogStoreState['batchComments']>[0],
    set: SetBlogStoreState,
    get: () => BlogStoreState,
): Promise<void> {
    const ids = Array.from(get().selectedCommentIds);
    if (!ids.length) return;
    set({ batchBusy: true });
    try {
        await api.blog.comments.batch(action, ids);
        get().clearCommentSelection();
        await Promise.all([get().loadComments(), get().loadStats()]);
    } finally {
        set({ batchBusy: false });
    }
}

async function createCategoryImpl(
    data: Parameters<BlogStoreState['createCategory']>[0],
    get: () => BlogStoreState,
): Promise<void> {
    await api.blog.categories.create(data);
    await get().loadCategories();
}

async function updateCategoryImpl(
    id: string,
    patch: Parameters<BlogStoreState['updateCategory']>[1],
    get: () => BlogStoreState,
): Promise<void> {
    await api.blog.categories.patch(id, patch);
    await get().loadCategories();
}

async function deleteCategoryImpl(id: string, get: () => BlogStoreState): Promise<void> {
    await api.blog.categories.remove(id);
    await Promise.all([get().loadCategories(), get().loadPosts()]);
}

async function saveSettingsImpl(
    settings: Parameters<BlogStoreState['saveSettings']>[0],
    set: SetBlogStoreState,
): Promise<void> {
    const res = await api.blog.settings.patch(settings);
    set({ settings: res.settings });
}