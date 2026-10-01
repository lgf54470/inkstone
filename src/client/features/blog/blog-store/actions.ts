import type { BlogPost } from '@shared/types'
import { api } from '../../../lib/api'
import { reportBlogMutationError, runBlogMutation } from './mutation'
import type { BlogStoreState, SetBlogStoreState } from './types'

export const blogActionsActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'batchToggleGroup' | 'batchMoveToFolder' | 'savePost' | 'updatePost' | 'deletePost' | 'restorePost' | 'purgePost' | 'emptyTrash' | 'syncPost' | 'batchPosts' | 'updateCommentStatus' | 'deleteComment' | 'batchComments' | 'createCategory' | 'updateCategory' | 'deleteCategory' | 'saveSettings'> => ({
  batchToggleGroup: (type, target, enabled) => batchToggleGroupImpl(type, target, enabled, set, get),
  batchMoveToFolder: (postIds, folderId) => batchMoveToFolderImpl(postIds, folderId, set, get),
  savePost: (data) => savePostImpl(data, get),
  updatePost: (id, patch) => updatePostImpl(id, patch, set, get),
  deletePost: (id) => deletePostImpl(id, get),
  restorePost: (id) => restorePostImpl(id, get),
  purgePost: (id) => purgePostImpl(id, get),
  emptyTrash: () => emptyTrashImpl(get),
  syncPost: (id) => syncPostImpl(id, get),
  batchPosts: (action, extraId, pinnedState) => batchPostsImpl(action, extraId, pinnedState, set, get),
  updateCommentStatus: (id, status) => updateCommentStatusImpl(id, status, get),
  deleteComment: (id) => deleteCommentImpl(id, get),
  batchComments: (action) => batchCommentsImpl(action, set, get),
  createCategory: (data) => createCategoryImpl(data, get),
  updateCategory: (id, patch) => updateCategoryImpl(id, patch, get),
  deleteCategory: (id) => deleteCategoryImpl(id, get),
  saveSettings: (settings) => saveSettingsImpl(settings, set),
})

async function batchToggleGroupImpl(
  type: Parameters<BlogStoreState['batchToggleGroup']>[0],
  target: Parameters<BlogStoreState['batchToggleGroup']>[1],
  enabled: Parameters<BlogStoreState['batchToggleGroup']>[2],
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<boolean> {
  set({ batchBusy: true })
  const previous = { posts: get().posts, stats: get().stats }
  set((state) => ({
    posts: toggledPostRows(type, target, enabled, state.posts),
    stats: toggledGroupStats(type, target, enabled, state.stats),
  }))
  try {
    await api.blog.batchToggleGroup(type, target, enabled)
    await Promise.all([get().loadPosts(), get().loadStats(), get().loadPostIndex()])
    return true
  } catch (error) {
    set(previous)
    reportBlogMutationError(error)
    return false
  } finally {
    set({ batchBusy: false })
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
        return { ...p, isPublished: enabled }
      }
    } else if (type === 'tag') {
      if (Array.isArray(p.tags) && p.tags.includes(target)) {
        return { ...p, isPublished: enabled }
      }
    }
    return p
  })
}

function toggledGroupStats(
  type: Parameters<BlogStoreState['batchToggleGroup']>[0],
  target: string,
  enabled: boolean,
  stats: BlogStoreState['stats'],
): BlogStoreState['stats'] {
  if (!stats) return stats
  if (type === 'folder' && stats.folderCounts?.[target]) {
    const prev = stats.folderCounts[target]
    return {
      ...stats,
      folderCounts: {
        ...stats.folderCounts,
        [target]: { total: prev.total, published: enabled ? prev.total : 0 },
      },
    }
  }
  if (type === 'tag' && stats.tagCounts?.[target]) {
    const prev = stats.tagCounts[target]
    return {
      ...stats,
      tagCounts: {
        ...stats.tagCounts,
        [target]: { total: prev.total, published: enabled ? prev.total : 0 },
      },
    }
  }
  return stats
}

async function batchMoveToFolderImpl(
  postIds: Parameters<BlogStoreState['batchMoveToFolder']>[0],
  folderId: Parameters<BlogStoreState['batchMoveToFolder']>[1],
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<boolean> {
  if (!postIds.length) return false
  set({ batchBusy: true })
  const previous = get().posts
  set((state) => ({
    posts: state.posts.map((p) => (postIds.includes(p.id) ? { ...p, folderId } : p)),
  }))
  try {
    await api.blog.posts.batch('setFolder', postIds, { folderId })
    get().clearPostSelection()
    await Promise.all([get().loadPosts(), get().loadStats(), get().loadPostIndex()])
    return true
  } catch (error) {
    set({ posts: previous })
    reportBlogMutationError(error)
    return false
  } finally {
    set({ batchBusy: false })
  }
}

async function savePostImpl(
  data: Parameters<BlogStoreState['savePost']>[0],
  get: () => BlogStoreState,
): Promise<{ ok: boolean; id: string; slug: string } | null> {
  try {
    const res = await api.blog.posts.create(data)
    // Publishing a note whose post is in the bin revives that post, so the bin is re-read too.
    await Promise.all([get().loadPosts(), get().loadStats(), get().loadTags(), get().loadPostIndex(), get().loadTrash()])
    return res
  } catch (error) {
    reportBlogMutationError(error)
    return null
  }
}

async function updatePostImpl(
  id: Parameters<BlogStoreState['updatePost']>[0],
  patch: Parameters<BlogStoreState['updatePost']>[1],
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<boolean> {
  const previous = get().posts.find((p) => p.id === id)
  set((state) => ({
    posts: state.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }))
  try {
    await api.blog.posts.patch(id, patch)
    await Promise.all(postChangeReloads(patchedPostScopes(patch), get))
    return true
  } catch (error) {
    set((state) => ({
      posts: state.posts.map((p) => (p.id === id && previous ? previous : p)),
    }))
    reportBlogMutationError(error)
    return false
  }
}

async function deletePostImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  // A delete is structural: it moves the summary counts and can strip a tag of its last post, which
  // is exactly the case the tag list draws its count for once the split counts stop mentioning it.
  return runBlogMutation(
    () => api.blog.posts.remove(id),
    () => Promise.all(postChangeReloads(['stats', 'tags', 'trash'], get)),
  )
}

/**
 * The recycle bin's three operations. A restore puts the post (and everything it owned) back on the
 * blog, so it asks for the live list and the aggregates as well; a purge only erases what the bin
 * already showed, so the bin and the badge are the whole answer.
 */
async function restorePostImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(
    () => api.blog.trash.restore(id),
    () => Promise.all(postChangeReloads(['stats', 'tags', 'trash'], get)),
  )
}

async function purgePostImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(
    () => api.blog.trash.purge(id),
    () => Promise.all(postChangeReloads(['stats', 'trash'], get)),
  )
}

async function emptyTrashImpl(get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(
    () => api.blog.trash.empty(),
    () => Promise.all(postChangeReloads(['stats', 'trash'], get)),
  )
}

async function syncPostImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(() => api.blog.posts.sync(id), () => Promise.all([get().loadPosts(), get().loadPostIndex()]))
}

async function batchPostsImpl(
  action: Parameters<BlogStoreState['batchPosts']>[0],
  extraId: Parameters<BlogStoreState['batchPosts']>[1],
  pinnedState: Parameters<BlogStoreState['batchPosts']>[2],
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<boolean> {
  const ids = Array.from(get().selectedPostIds)
  if (!ids.length) return false
  set({ batchBusy: true })
  try {
    await api.blog.posts.batch(action, ids, {
      categoryId: extraId,
      folderId: extraId,
      isPinned: pinnedState,
    })
    get().clearPostSelection()
    await Promise.all(postChangeReloads(batchPostScopes(action), get))
    return true
  } catch (error) {
    reportBlogMutationError(error)
    return false
  } finally {
    set({ batchBusy: false })
  }
}

/** The aggregates a post change can move; the list and the body-free index are always re-read. */
type PostChangeScope = 'stats' | 'tags' | 'categories' | 'trash'

/**
 * What a patch invalidates. The rows and the note index carry every field, so both are always
 * re-read; the counts answer narrower questions and are asked for only when the patch moved what
 * they count — the pinned count with `isPinned`, the published split with `isPublished`, the folder
 * split with `folderId`, the tag split and the tag list with `tags`, and a category's post count with
 * `categoryId`. Toggling one pin used to re-ask for the dashboard's counts and the whole tag list.
 */
function patchedPostScopes(patch: Partial<BlogPost>): PostChangeScope[] {
  const keys = new Set(Object.keys(patch))
  const scopes: PostChangeScope[] = []
  if (keys.has('isPublished') || keys.has('isPinned') || keys.has('folderId') || keys.has('tags')) scopes.push('stats')
  if (keys.has('tags')) scopes.push('tags')
  if (keys.has('categoryId')) scopes.push('categories')
  return scopes
}

/**
 * What each batch action moves, beyond the list and the index. Only deleting removes posts, so only
 * it can change what the tag list counts; a category move changes the categories' post counts and no
 * summary count. The fixed reload asked for the tag list on every action and for the categories on
 * none of them.
 */
function batchPostScopes(action: Parameters<BlogStoreState['batchPosts']>[0]): PostChangeScope[] {
  switch (action) {
    case 'setCategory':
      return ['categories']
    case 'delete':
      return ['stats', 'tags', 'trash']
    case 'publish':
    case 'unpublish':
    case 'setPinned':
    case 'setFolder':
      return ['stats']
  }
}

/** The reloads one post change asks for; see `patchedPostScopes` and `batchPostScopes`. */
function postChangeReloads(scopes: PostChangeScope[], get: () => BlogStoreState): Array<Promise<void>> {
  return [
    get().loadPosts(),
    get().loadPostIndex(),
    ...(scopes.includes('stats') ? [get().loadStats()] : []),
    ...(scopes.includes('tags') ? [get().loadTags()] : []),
    ...(scopes.includes('categories') ? [get().loadCategories()] : []),
    ...(scopes.includes('trash') ? [get().loadTrash()] : []),
  ]
}

async function updateCommentStatusImpl(
  id: string,
  status: Parameters<BlogStoreState['updateCommentStatus']>[1],
  get: () => BlogStoreState,
): Promise<boolean> {
  return runBlogMutation(
    () => api.blog.comments.updateStatus(id, status),
    () => Promise.all([get().loadComments(), get().loadStats()]),
  )
}

async function deleteCommentImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(
    () => api.blog.comments.remove(id),
    () => Promise.all([get().loadComments(), get().loadStats()]),
  )
}

async function batchCommentsImpl(
  action: Parameters<BlogStoreState['batchComments']>[0],
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<boolean> {
  const ids = Array.from(get().selectedCommentIds)
  if (!ids.length) return false
  set({ batchBusy: true })
  try {
    await api.blog.comments.batch(action, ids)
    get().clearCommentSelection()
    await Promise.all([get().loadComments(), get().loadStats()])
    return true
  } catch (error) {
    reportBlogMutationError(error)
    return false
  } finally {
    set({ batchBusy: false })
  }
}

async function createCategoryImpl(
  data: Parameters<BlogStoreState['createCategory']>[0],
  get: () => BlogStoreState,
): Promise<boolean> {
  return runBlogMutation(() => api.blog.categories.create(data), () => get().loadCategories())
}

async function updateCategoryImpl(
  id: string,
  patch: Parameters<BlogStoreState['updateCategory']>[1],
  get: () => BlogStoreState,
): Promise<boolean> {
  return runBlogMutation(() => api.blog.categories.patch(id, patch), () => get().loadCategories())
}

async function deleteCategoryImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(
    () => api.blog.categories.remove(id),
    () => Promise.all([get().loadCategories(), get().loadPosts()]),
  )
}

async function saveSettingsImpl(
  settings: Parameters<BlogStoreState['saveSettings']>[0],
  set: SetBlogStoreState,
): Promise<boolean> {
  try {
    const res = await api.blog.settings.patch(settings)
    set({ settings: res.settings })
    return true
  } catch (error) {
    reportBlogMutationError(error)
    return false
  }
}
