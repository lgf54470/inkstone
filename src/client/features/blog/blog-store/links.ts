import type { BlogLink, BlogLinkCategory, BlogLinkStatus } from '@shared/types'
import { api } from '../../../lib/api'
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

  createLinkCategory: (data) => createLinkCategoryImpl(data, get),
  updateLinkCategory: (id, patch) => updateLinkCategoryImpl(id, patch, get),
  deleteLinkCategory: (id) => deleteLinkCategoryImpl(id, get),
  importLinksData: (payload) => importLinksDataImpl(payload, get),
})

async function loadLinksImpl(set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const { linkStatusFilter, linkCategoryId, linkSearch } = get()
  try {
    const res = await api.blog.links.list({
      status: linkStatusFilter === 'all' ? undefined : linkStatusFilter,
      categoryId: linkCategoryId || undefined,
      search: linkSearch || undefined,
    })
    set({
      links: res.links || [],
      linkCategories: res.categories || [],
      linkStats: res.counts || null,
    })
  } catch (err) {
    console.error('Failed to load blog links', err)
  }
}

async function createLinkImpl(data: Partial<BlogLink>, get: () => BlogStoreState): Promise<BlogLink | null> {
  try {
    const res = await api.blog.links.create(data)
    await get().loadLinks()
    return res.link
  } catch (err) {
    console.error('Failed to create link', err)
    return null
  }
}

async function updateLinkImpl(id: string, patch: Partial<BlogLink>, get: () => BlogStoreState): Promise<void> {
  await api.blog.links.patch(id, patch)
  await get().loadLinks()
}

async function deleteLinkImpl(id: string, get: () => BlogStoreState): Promise<void> {
  await api.blog.links.remove(id)
  await get().loadLinks()
}

async function updateLinkStatusImpl(id: string, status: BlogLinkStatus, get: () => BlogStoreState): Promise<void> {
  await api.blog.links.updateStatus(id, status)
  await get().loadLinks()
}

async function togglePinLinkImpl(id: string, isPinned: boolean, get: () => BlogStoreState): Promise<void> {
  await api.blog.links.togglePin(id, isPinned)
  await get().loadLinks()
}

async function toggleFavoriteLinkImpl(id: string, isFavorite: boolean, get: () => BlogStoreState): Promise<void> {
  await api.blog.links.toggleFavorite(id, isFavorite)
  await get().loadLinks()
}

async function reorderLinksImpl(
  orders: Array<{ id: string; sortOrder?: number; pinnedOrder?: number }>,
  get: () => BlogStoreState,
): Promise<void> {
  await api.blog.links.reorder(orders)
  await get().loadLinks()
}

async function batchLinksImpl(
  action: 'approve' | 'reject' | 'delete' | 'setCategory' | 'pin' | 'unpin' | 'favorite' | 'unfavorite',
  categoryId: string | null | undefined,
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): Promise<void> {
  const { selectedLinkIds } = get()
  if (selectedLinkIds.size === 0) return
  set({ batchBusy: true })
  try {
    await api.blog.links.batch(action, Array.from(selectedLinkIds), categoryId)
    set({ selectedLinkIds: new Set() })
    await get().loadLinks()
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
  } catch (err) {
    console.error('Failed to create link category', err)
    return null
  }
}

async function updateLinkCategoryImpl(
  id: string,
  patch: { name?: string; icon?: string | null; parentId?: string | null; sortOrder?: number },
  get: () => BlogStoreState,
): Promise<void> {
  await api.blog.linkCategories.patch(id, patch)
  await get().loadLinks()
}

async function deleteLinkCategoryImpl(id: string, get: () => BlogStoreState): Promise<void> {
  await api.blog.linkCategories.remove(id)
  await get().loadLinks()
}

async function importLinksDataImpl(
  payload: {
    categories: Array<{ id?: string; name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }>
    links: Array<Partial<BlogLink>>
  },
  get: () => BlogStoreState,
): Promise<{ importedCategories: number; importedLinks: number }> {
  const res = await api.blog.links.import(payload)
  await get().loadLinks()
  return {
    importedCategories: res.importedCategories,
    importedLinks: res.importedLinks,
  }
}
