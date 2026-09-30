import type { BlogLink, BlogLinkCategory, BlogLinkStatus } from '@shared/types'
import { api } from '../../../lib/api'
import { reportBlogMutationError, runBlogMutation } from './mutation'
import { markDataLoaded, markLoadFailed, markLoadSucceeded } from './state'
import type { BlogStoreState, SetBlogStoreState } from './types'

export const blogLinksActions = (
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Pick<
  BlogStoreState,
  | 'setLinkStatusFilter'
  | 'setLinkCategoryId'
  | 'setLinkSearch'
  | 'toggleSelectLink'
  | 'selectAllLinks'
  | 'clearLinkSelection'
  | 'loadLinks'
  | 'createLink'
  | 'updateLink'
  | 'deleteLink'
  | 'updateLinkStatus'
  | 'togglePinLink'
  | 'toggleFavoriteLink'
  | 'reorderLinks'
  | 'batchLinks'
  | 'batchDeleteLinks'
  | 'createLinkCategory'
  | 'updateLinkCategory'
  | 'deleteLinkCategory'
  | 'importLinksData'
> => ({
  setLinkStatusFilter: (status) => {
    set({ linkStatusFilter: status })
    void get().loadLinks()
  },
  setLinkCategoryId: (id) => {
    set({ linkCategoryId: id })
    void get().loadLinks()
  },
  setLinkSearch: (search) => {
    set({ linkSearch: search })
    void get().loadLinks()
  },
  toggleSelectLink: (id) => set((s) => {
    const next = new Set(s.selectedLinkIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { selectedLinkIds: next }
  }),
  selectAllLinks: (ids) => set({ selectedLinkIds: new Set(ids) }),
  clearLinkSelection: () => set({ selectedLinkIds: new Set() }),

  loadLinks: () => loadLinksImpl(set, get),
  createLink: (data) => createLinkImpl(data, get),
  updateLink: (id, patch) => updateLinkImpl(id, patch, get),
  deleteLink: (id) => deleteLinkImpl(id, get),
  updateLinkStatus: (id, status) => updateLinkStatusImpl(id, status, get),
  togglePinLink: (id, isPinned) => togglePinLinkImpl(id, isPinned, get),
  toggleFavoriteLink: (id, isFavorite) => toggleFavoriteLinkImpl(id, isFavorite, get),
  reorderLinks: (orders) => reorderLinksImpl(orders, get),
  batchLinks: (action, categoryId) => batchLinksImpl(action, categoryId, set, get),
  batchDeleteLinks: (ids) => batchDeleteLinksImpl(ids, set, get),

  createLinkCategory: (data) => createLinkCategoryImpl(data, get),
  updateLinkCategory: (id, patch) => updateLinkCategoryImpl(id, patch, get),
  deleteLinkCategory: (id) => deleteLinkCategoryImpl(id, get),
  importLinksData: (payload) => importLinksDataImpl(payload, get),
})

/**
 * The link list is filtered by the server now, so its answer has to match the filter that is on
 * screen: the request a newer one replaces is cancelled, and an answer that arrives after a newer
 * request went out is dropped. Without this, typing in the search box could show the results of an
 * earlier keystroke — before the server answered the filters, the browser re-filtered whatever
 * arrived and the mismatch corrected itself.
 */
async function loadLinksImpl(set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const { linkStatusFilter, linkCategoryId, linkSearch, linksRequestSeq, linksAbort } = get()
  const seq = linksRequestSeq + 1
  linksAbort?.abort()
  const controller = new AbortController()
  set({ linksRequestSeq: seq, linksAbort: controller })

  try {
    const res = await api.blog.links.list({
      status: linkStatusFilter === 'all' ? undefined : linkStatusFilter,
      categoryId: linkCategoryId || undefined,
      search: linkSearch || undefined,
    }, controller.signal)
    if (get().linksRequestSeq !== seq) return
    set((s) => ({
      links: res.links || [],
      linkCategories: res.categories || [],
      linkStats: res.counts || null,
      loadErrors: markLoadSucceeded(s.loadErrors, 'links'),
      dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'links'),
    }))
  } catch (err) {
    if (controller.signal.aborted) return
    console.error('Failed to load blog links', err)
    set((s) => ({ loadErrors: markLoadFailed(s.loadErrors, 'links') }))
  }
}

async function createLinkImpl(data: Partial<BlogLink>, get: () => BlogStoreState): Promise<BlogLink | null> {
  try {
    const res = await api.blog.links.create(data)
    await get().loadLinks()
    return res.link
  } catch (error) {
    reportBlogMutationError(error)
    return null
  }
}

async function updateLinkImpl(id: string, patch: Partial<BlogLink>, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(() => api.blog.links.patch(id, patch), () => get().loadLinks())
}

async function deleteLinkImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(() => api.blog.links.remove(id), () => get().loadLinks())
}

async function updateLinkStatusImpl(id: string, status: BlogLinkStatus, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(() => api.blog.links.updateStatus(id, status), () => get().loadLinks())
}

async function togglePinLinkImpl(id: string, isPinned: boolean, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(() => api.blog.links.togglePin(id, isPinned), () => get().loadLinks())
}

async function toggleFavoriteLinkImpl(id: string, isFavorite: boolean, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(() => api.blog.links.toggleFavorite(id, isFavorite), () => get().loadLinks())
}

async function reorderLinksImpl(
  orders: Array<{ id: string; sortOrder?: number; pinnedOrder?: number }>,
  get: () => BlogStoreState,
): Promise<boolean> {
  return runBlogMutation(() => api.blog.links.reorder(orders), () => get().loadLinks())
}

async function batchLinksImpl(
  action: 'approve' | 'reject' | 'delete' | 'setCategory' | 'pin' | 'unpin' | 'favorite' | 'unfavorite',
  categoryId: string | null | undefined,
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<boolean> {
  const { selectedLinkIds } = get()
  if (selectedLinkIds.size === 0) return false
  set({ batchBusy: true })
  try {
    await api.blog.links.batch(action, Array.from(selectedLinkIds), categoryId)
    set({ selectedLinkIds: new Set() })
    await get().loadLinks()
    return true
  } catch (error) {
    reportBlogMutationError(error)
    return false
  } finally {
    set({ batchBusy: false })
  }
}

/**
 * One batch call for a set of links, whichever view selected them. The link checker used to call
 * `deleteLink` per row: deleting twenty broken links was twenty DELETEs and twenty full list
 * reloads. The selection is left alone here — the caller clears it only once the answer says the
 * rows are gone.
 */
async function batchDeleteLinksImpl(
  ids: string[],
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<boolean> {
  if (ids.length === 0) return false
  set({ batchBusy: true })
  try {
    await api.blog.links.batch('delete', ids)
    await get().loadLinks()
    return true
  } catch (error) {
    reportBlogMutationError(error)
    return false
  } finally {
    set({ batchBusy: false })
  }
}

async function createLinkCategoryImpl(
  data: { name: string; icon?: string | null; parentId?: string | null; sortOrder?: number },
  get: () => BlogStoreState,
): Promise<BlogLinkCategory | null> {
  try {
    const res = await api.blog.linkCategories.create(data)
    await get().loadLinks()
    return res.category
  } catch (error) {
    reportBlogMutationError(error)
    return null
  }
}

async function updateLinkCategoryImpl(
  id: string,
  patch: { name?: string; icon?: string | null; parentId?: string | null; sortOrder?: number },
  get: () => BlogStoreState,
): Promise<boolean> {
  return runBlogMutation(() => api.blog.linkCategories.patch(id, patch), () => get().loadLinks())
}

async function deleteLinkCategoryImpl(id: string, get: () => BlogStoreState): Promise<boolean> {
  return runBlogMutation(() => api.blog.linkCategories.remove(id), () => get().loadLinks())
}

async function importLinksDataImpl(
  payload: {
    categories: Array<{ id?: string; name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }>
    links: Array<Partial<BlogLink>>
  },
  get: () => BlogStoreState,
): Promise<{ importedCategories: number; importedLinks: number } | null> {
  try {
    const res = await api.blog.links.import(payload)
    await get().loadLinks()
    return {
      importedCategories: res.importedCategories,
      importedLinks: res.importedLinks,
    }
  } catch (error) {
    reportBlogMutationError(error)
    return null
  }
}
