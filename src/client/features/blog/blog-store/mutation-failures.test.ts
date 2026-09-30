import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogStats } from '@shared/types'
import { api } from '../../../lib/api'
import { useUi } from '../../../store/ui'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      posts: { list: vi.fn(), patch: vi.fn(), remove: vi.fn(), create: vi.fn(), sync: vi.fn(), batch: vi.fn() },
      comments: { list: vi.fn(), updateStatus: vi.fn(), remove: vi.fn(), batch: vi.fn() },
      tags: { list: vi.fn() },
      folders: { create: vi.fn(), patch: vi.fn(), remove: vi.fn() },
      links: { list: vi.fn(), updateStatus: vi.fn() },
      stats: vi.fn(),
      batchToggleGroup: vi.fn(),
    },
  },
}))

const postsPatch = api.blog.posts.patch as unknown as ReturnType<typeof vi.fn>
const postsRemove = api.blog.posts.remove as unknown as ReturnType<typeof vi.fn>
const postsList = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>
const tagsList = api.blog.tags.list as unknown as ReturnType<typeof vi.fn>
const statsGet = api.blog.stats as unknown as ReturnType<typeof vi.fn>
const batchToggleGroup = api.blog.batchToggleGroup as unknown as ReturnType<typeof vi.fn>
const foldersCreate = api.blog.folders.create as unknown as ReturnType<typeof vi.fn>
const linksUpdateStatus = api.blog.links.updateStatus as unknown as ReturnType<typeof vi.fn>

function postBuilder(id: string, overrides: Partial<{ isPinned: boolean; isPublished: boolean; folderId: string | null }> = {}) {
  return {
    id, slug: id, noteId: `n-${id}`, userId: 'u', title: id, excerpt: '', content: '',
    coverUrl: '', categoryId: null, folderId: null, tags: [], isPublished: true,
    allowComments: true, isPinned: false, views: 0, commentsCount: 0,
    publishedAt: 0, createdAt: 0, updatedAt: 0,
    ...overrides,
  }
}

function post(id: string, overrides: Partial<ReturnType<typeof postBuilder>> = {}) {
  return postBuilder(id, overrides)
}

function stats(): BlogStats {
  return {
    totalPosts: 1, publishedPosts: 1, draftPosts: 0, totalViews: 0, totalComments: 0,
    pendingComments: 0, categoriesCount: 0, tagsCount: 0,
    folderCounts: { f1: { total: 1, published: 1 } },
  }
}

function lastToast() {
  return useUi.getState().toasts.at(-1)
}

beforeEach(() => {
  postsPatch.mockReset()
  postsRemove.mockReset()
  postsList.mockReset()
  tagsList.mockReset()
  statsGet.mockReset()
  batchToggleGroup.mockReset()
  foldersCreate.mockReset()
  linksUpdateStatus.mockReset()
  useUi.setState({ toasts: [] })
  useBlogStore.setState({
    posts: [], stats: null, folders: [], selectedPostIds: new Set(), batchBusy: false,
  })
})

/**
 * Every mutation resolves to whether it went through, reports a failure itself (danger toast) and
 * rolls back the optimistic change. The callers that wrote `void updatePost(...)` had no other way
 * to learn it failed — the rejection was unhandled and the optimistic row stayed painted.
 */
describe('blog post mutations report failure and roll back', () => {
  it('puts the row back when an optimistic patch is refused', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    useBlogStore.setState({ posts: [post('p1', { isPinned: false })] })
    postsPatch.mockRejectedValueOnce(new Error('offline'))

    const ok = await useBlogStore.getState().updatePost('p1', { isPinned: true })

    expect(ok).toBe(false)
    expect(useBlogStore.getState().posts[0].isPinned).toBe(false)
    expect(lastToast()?.tone).toBe('danger')
    logged.mockRestore()
  })

  it('keeps the patch and stays quiet when it works', async () => {
    useBlogStore.setState({ posts: [post('p1', { isPinned: false })] })
    postsPatch.mockResolvedValueOnce({})
    postsList.mockResolvedValueOnce({ posts: [post('p1', { isPinned: true })] })
    tagsList.mockResolvedValueOnce([])
    statsGet.mockResolvedValueOnce({ stats: null })

    const ok = await useBlogStore.getState().updatePost('p1', { isPinned: true })

    expect(ok).toBe(true)
    expect(useBlogStore.getState().posts[0].isPinned).toBe(true)
    expect(useUi.getState().toasts).toHaveLength(0)
  })

  it('answers false for a refused delete so the caller does not announce it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    postsRemove.mockRejectedValueOnce(new Error('gone'))

    const ok = await useBlogStore.getState().deletePost('p1')

    expect(ok).toBe(false)
    expect(lastToast()?.tone).toBe('danger')
    logged.mockRestore()
  })
})

describe('blog batch and organizer mutations report failure', () => {
  it('rolls back the optimistic publish of a batch and says why', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    useBlogStore.setState({
      posts: [post('p1', { folderId: 'f1', isPublished: false })],
      stats: stats(),
    })
    batchToggleGroup.mockRejectedValueOnce(new Error('offline'))

    const ok = await useBlogStore.getState().batchToggleGroup('folder', 'f1', true)

    expect(ok).toBe(false)
    expect(useBlogStore.getState().posts[0].isPublished).toBe(false)
    expect(useBlogStore.getState().stats?.folderCounts?.f1.published).toBe(1)
    expect(lastToast()?.title).toBe('offline')
    expect(lastToast()?.tone).toBe('danger')
    logged.mockRestore()
  })

  it('reports a folder creation that used to fail silently', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    foldersCreate.mockRejectedValueOnce(new Error('taken'))

    const created = await useBlogStore.getState().createFolder('Ideas')

    expect(created).toBeNull()
    expect(useBlogStore.getState().folders).toEqual([])
    expect(lastToast()?.tone).toBe('danger')
    logged.mockRestore()
  })

  it('reports a refused link status change', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    linksUpdateStatus.mockRejectedValueOnce(new Error('nope'))

    const ok = await useBlogStore.getState().updateLinkStatus('l1', 'approved')

    expect(ok).toBe(false)
    expect(lastToast()?.tone).toBe('danger')
    logged.mockRestore()
  })
})
