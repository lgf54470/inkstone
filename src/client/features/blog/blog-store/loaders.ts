import { extractCoverUrl } from '@shared/markdown-utils';
import { api } from '../../../lib/api';
import type { BlogStoreState, SetBlogStoreState } from './types';

export const blogLoadersActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'loadAll' | 'loadPosts' | 'loadFolders' | 'loadTags' | 'loadCategories' | 'loadComments' | 'loadStats' | 'loadSettings'> => ({
  loadAll: () => loadAllImpl(set, get),
  loadPosts: () => loadPostsImpl(set, get),
  loadFolders: () => loadFoldersImpl(set),
  loadTags: () => loadTagsImpl(set),
  loadCategories: () => loadCategoriesImpl(set),
  loadComments: () => loadCommentsImpl(set, get),
  loadStats: () => loadStatsImpl(set),
  loadSettings: () => loadSettingsImpl(set),
});

async function loadAllImpl(set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  set({ loading: true });
  try {
    await Promise.allSettled([
      get().loadStats(),
      get().loadPosts(),
      get().loadFolders(),
      get().loadTags(),
      get().loadCategories(),
      get().loadComments(),
      get().loadSettings(),
    ]);
  } finally {
    set({ loading: false });
  }
}

async function loadPostsImpl(set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const { statusFilter, categoryId, folderId, tag, search, sort } = get();
  try {
    const res = await api.blog.posts.list({
      status: statusFilter,
      categoryId: categoryId || undefined,
      folderId: folderId || undefined,
      tag: tag || undefined,
      search: search || undefined,
      sort,
    });
    const posts = (res.posts || []).map((p) => ({
      ...p,
      coverUrl: extractCoverUrl(p.coverUrl),
    }));
    set({ posts });
  } catch (err) {
    console.error('Failed to load blog posts', err);
  }
}

async function loadFoldersImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const folders = await api.blog.folders.list();
    set({ folders });
  } catch (err) {
    console.error('Failed to load blog folders', err);
  }
}

async function loadTagsImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const tags = await api.blog.tags.list();
    set({ tags });
  } catch (err) {
    console.error('Failed to load blog tags', err);
  }
}

async function loadCategoriesImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const res = await api.blog.categories.list();
    set({ categories: res.categories });
  } catch (err) {
    console.error('Failed to load blog categories', err);
  }
}

async function loadCommentsImpl(set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const { commentStatusFilter, commentSearch } = get();
  try {
    const res = await api.blog.comments.list({
      status: commentStatusFilter,
      search: commentSearch || undefined,
    });
    set({ comments: res.comments });
  } catch (err) {
    console.error('Failed to load blog comments', err);
  }
}

async function loadStatsImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const res = await api.blog.stats();
    set({ stats: res.stats });
  } catch (err) {
    console.error('Failed to load blog stats', err);
  }
}

async function loadSettingsImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const res = await api.blog.settings.get();
    set({ settings: res.settings });
  } catch (err) {
    console.error('Failed to load blog settings', err);
  }
}