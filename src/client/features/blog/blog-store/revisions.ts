import { api } from '../../../lib/api'
import { reportBlogMutationError } from './mutation'
import type { BlogStoreState, SetBlogStoreState } from './types'

/** The empty history state, kept here so the store's initial object stays one screen long. */
export function blogRevisionsInitialState(): Pick<BlogStoreState, 'revisions' | 'revisionsPostId' | 'revisionsFailed' | 'revisionsRequestSeq'> {
  return { revisions: null, revisionsPostId: null, revisionsFailed: false, revisionsRequestSeq: 0 }
}

export const blogRevisionsActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'loadRevisions' | 'restoreRevision'> => ({
  loadRevisions: (postId) => loadRevisionsImpl(postId, set, get),
  restoreRevision: (postId, revisionId) => restoreRevisionImpl(postId, revisionId, get),
})

/**
 * The history list answers for one post at a time. Opening the panel for another post replaces the
 * question, so the same latest-wins rule the other lists use applies: a late answer for the post the
 * reader already left is dropped instead of drawn under the newer title.
 */
async function loadRevisionsImpl(postId: string, set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const seq = get().revisionsRequestSeq + 1
  set({ revisionsRequestSeq: seq, revisionsPostId: postId, revisions: null, revisionsFailed: false })
  try {
    const res = await api.blog.posts.revisions(postId)
    if (get().revisionsRequestSeq !== seq) return
    set({ revisions: res.revisions })
  } catch (err) {
    if (get().revisionsRequestSeq !== seq) return
    console.error('Failed to load blog post revisions', err)
    set({ revisionsFailed: true })
  }
}

/**
 * A restore rewrites the post's text, its tags and its address, and it snapshots what it replaced —
 * so the post lists, the index, the counts and the history itself are all asked again.
 */
async function restoreRevisionImpl(postId: string, revisionId: string, get: () => BlogStoreState): Promise<boolean> {
  try {
    await api.blog.posts.restoreRevision(postId, revisionId)
    await Promise.all([
      get().loadRevisions(postId),
      get().loadPosts(),
      get().loadPostIndex(),
      get().loadStats(),
      get().loadTags(),
    ])
    return true
  } catch (error) {
    reportBlogMutationError(error)
    return false
  }
}
