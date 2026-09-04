import { create } from 'zustand'
import type { ShareCategory, ShareFolder, ShareInfo, ShareListResponse, ShareTag } from '@shared/types'
import { api } from '../../lib/api'
import { useNotes } from '../../store/notes'

export interface ShareFolderNode {
  folder: ShareFolder
  children: ShareFolderNode[]
  depth: number
}

export function buildShareFolderTree(folders: ShareFolder[]): ShareFolderNode[] {
  const map = new Map<string, ShareFolderNode>()
  const roots: ShareFolderNode[] = []
  for (const f of folders) {
    map.set(f.id, { folder: f, children: [], depth: 0 })
  }
  for (const f of folders) {
    const node = map.get(f.id)!
    if (f.parentId && map.has(f.parentId)) {
      const parent = map.get(f.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

interface ShareStoreState {
  category: ShareCategory
  folderId: string | null
  tag: string | null
  statusFilter: string
  search: string
  sort: string
  viewMode: 'table' | 'grid'
  selectedNoteIds: Set<string>
  shares: ShareInfo[]
  folders: ShareFolder[]
  tags: ShareTag[]
  globalStats: ShareListResponse['globalStats'] | null
  loading: boolean
  batchBusy: boolean
  excludeBots: boolean
  excludeSelfReferrers: boolean
  excludeOwner: boolean
  logRetentionDays: number
  maxLogRecords: number

  setCategory: (category: ShareCategory) => void
  setFolderId: (folderId: string | null) => void
  setTag: (tag: string | null) => void
  setStatusFilter: (status: string) => void
  setSearch: (search: string) => void
  setSort: (sort: string) => void
  setViewMode: (mode: 'table' | 'grid') => void
  setFilters: (filters: Partial<{ excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }>) => void
  setRetentionSettings: (settings: { logRetentionDays?: number; maxLogRecords?: number }) => void
  toggleSelect: (noteId: string) => void
  toggleSelectAll: () => void
  clearSelection: () => void

  loadFolders: () => Promise<void>
  loadTags: () => Promise<void>
  createFolder: (name: string, parentId?: string | null, color?: string | null, icon?: string | null) => Promise<ShareFolder | null>
  patchFolder: (id: string, patch: { name?: string; parentId?: string | null; color?: string | null; icon?: string | null; position?: number }) => Promise<ShareFolder | null>
  deleteFolder: (id: string) => Promise<boolean>
  createTag: (name: string, color?: string | null) => Promise<ShareTag | null>
  patchTag: (id: string, patch: { name?: string; color?: string | null; isPinned?: boolean }) => Promise<ShareTag | null>
  deleteTag: (id: string) => Promise<boolean>

  loadShares: () => Promise<void>
  toggleShare: (noteId: string, enabled: boolean) => Promise<boolean>
  togglePin: (noteId: string) => Promise<boolean>
  toggleStar: (noteId: string) => Promise<boolean>
  batchToggle: (
    action: 'enable' | 'disable' | 'revoke' | 'expire',
    noteIds: string[],
    expiresIn?: number | null,
  ) => Promise<boolean>
  batchToggleGroup: (type: 'folder' | 'tag', target: string, enabled: boolean) => Promise<boolean>
  batchFolderToggle: (folderId: string, enabled: boolean) => Promise<boolean>
  batchTagToggle: (tag: string, enabled: boolean) => Promise<boolean>
  updateShare: (
    noteId: string,
    options: {
      password?: string | null
      expiresIn?: number | null
      customSlug?: string
      isEnabled?: boolean
      folderId?: string | null
      tags?: string[]
    },
  ) => Promise<ShareInfo | null>
  revokeShare: (noteId: string) => Promise<boolean>
}

let loadEpoch = 0

function loadInitialRetention(): { logRetentionDays: number; maxLogRecords: number } {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('inkstone_share_retention') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        logRetentionDays: typeof parsed.logRetentionDays === 'number' ? parsed.logRetentionDays : 30,
        maxLogRecords: typeof parsed.maxLogRecords === 'number' ? parsed.maxLogRecords : 10000,
      }
    }
  } catch {}
  return { logRetentionDays: 30, maxLogRecords: 10000 }
}

function loadInitialFilters(): { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean } {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('inkstone_share_filters_v2') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        excludeBots: parsed.excludeBots !== false,
        excludeSelfReferrers: Boolean(parsed.excludeSelfReferrers),
        excludeOwner: Boolean(parsed.excludeOwner),
      }
    }
  } catch {}
  return {
    excludeBots: true,
    excludeSelfReferrers: false,
    excludeOwner: false,
  }
}

const initialFilters = loadInitialFilters()
const initialRetention = loadInitialRetention()

export const useShareStore = create<ShareStoreState>((set, get) => ({
  category: 'dashboard',
  folderId: null,
  tag: null,
  statusFilter: 'all',
  search: '',
  sort: 'views_desc',
  viewMode: 'table',
  selectedNoteIds: new Set<string>(),
  shares: [],
  folders: [],
  tags: [],
  globalStats: null,
  loading: false,
  batchBusy: false,
  excludeBots: initialFilters.excludeBots,
  excludeSelfReferrers: initialFilters.excludeSelfReferrers,
  excludeOwner: initialFilters.excludeOwner,
  logRetentionDays: initialRetention.logRetentionDays,
  maxLogRecords: initialRetention.maxLogRecords,

  loadFolders: async () => {
    try {
      const folders = await api.share.folders.list()
      set({ folders })
    } catch {}
  },

  loadTags: async () => {
    try {
      const tags = await api.share.tags.list()
      set({ tags })
    } catch {}
  },

  createFolder: async (name, parentId, color, icon) => {
    try {
      const folder = await api.share.folders.create({ name, parentId, color, icon })
      set((s) => ({ folders: [...s.folders, folder] }))
      return folder
    } catch {
      return null
    }
  },

  patchFolder: async (id, patch) => {
    try {
      const folder = await api.share.folders.patch(id, patch)
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? folder : f)),
      }))
      return folder
    } catch {
      return null
    }
  },

  deleteFolder: async (id) => {
    try {
      await api.share.folders.remove(id)
      set((s) => ({
        folders: s.folders.filter((f) => f.id !== id),
        folderId: s.folderId === id ? null : s.folderId,
      }))
      await get().loadShares()
      return true
    } catch {
      return false
    }
  },

  createTag: async (name, color) => {
    try {
      const tag = await api.share.tags.create({ name, color })
      set((s) => ({
        tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag],
      }))
      return tag
    } catch {
      return null
    }
  },

  patchTag: async (id, patch) => {
    try {
      const tag = await api.share.tags.patch(id, patch)
      set((s) => ({
        tags: s.tags.map((t) => (t.id === id ? tag : t)),
      }))
      return tag
    } catch {
      return null
    }
  },

  deleteTag: async (id) => {
    try {
      const tag = get().tags.find((t) => t.id === id)
      await api.share.tags.remove(id)
      set((s) => ({
        tags: s.tags.filter((t) => t.id !== id),
        tag: tag && s.tag === tag.name ? null : s.tag,
      }))
      await get().loadShares()
      return true
    } catch {
      return false
    }
  },

  batchToggleGroup: async (type, target, enabled) => {
    set({ batchBusy: true })
    try {
      await api.share.batchToggleGroup(type, target, enabled)
      await get().loadShares()
      return true
    } catch {
      return false
    } finally {
      set({ batchBusy: false })
    }
  },

  setRetentionSettings: (settings) => {
    set((state) => {
      const updated = {
        logRetentionDays: settings.logRetentionDays ?? state.logRetentionDays,
        maxLogRecords: settings.maxLogRecords ?? state.maxLogRecords,
      }
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('inkstone_share_retention', JSON.stringify(updated))
        }
      } catch {}
      return updated
    })
  },

  setFilters: (newFilters) => {
    set((state) => {
      const updated = {
        excludeBots: newFilters.excludeBots ?? state.excludeBots,
        excludeSelfReferrers: newFilters.excludeSelfReferrers ?? state.excludeSelfReferrers,
        excludeOwner: newFilters.excludeOwner ?? state.excludeOwner,
      }
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('inkstone_share_filters_v2', JSON.stringify(updated))
        }
      } catch {}
      return updated
    })
    void get().loadShares()
  },

  setCategory: (category) => {
    set({
      category,
      folderId: null,
      tag: null,
      selectedNoteIds: new Set(),
      statusFilter:
        category === 'active'
          ? 'active'
          : category === 'paused'
            ? 'paused'
            : category === 'pinned'
              ? 'pinned'
              : category === 'starred'
                ? 'starred'
                : category === 'password'
                  ? 'password'
                  : category === 'expiring'
                    ? 'expiring'
                    : category === 'permanent'
                      ? 'permanent'
                      : category === 'expired'
                        ? 'expired'
                        : 'all',
    })
    void get().loadShares()
  },

  setFolderId: (folderId) => {
    set({
      folderId,
      category: folderId ? 'all' : get().category,
      tag: null,
      selectedNoteIds: new Set(),
    })
    void get().loadShares()
  },

  setTag: (tag) => {
    set({
      tag,
      category: tag ? 'all' : get().category,
      folderId: null,
      selectedNoteIds: new Set(),
    })
    void get().loadShares()
  },

  setStatusFilter: (statusFilter) => {
    set({ statusFilter })
    void get().loadShares()
  },

  setSearch: (search) => {
    set({ search })
    void get().loadShares()
  },

  setSort: (sort) => {
    set({ sort })
    void get().loadShares()
  },

  setViewMode: (viewMode) => set({ viewMode }),

  toggleSelect: (noteId) => {
    set((state) => {
      const next = new Set(state.selectedNoteIds)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return { selectedNoteIds: next }
    })
  },

  toggleSelectAll: () => {
    const { shares, selectedNoteIds } = get()
    if (selectedNoteIds.size === shares.length) {
      set({ selectedNoteIds: new Set() })
    } else {
      set({ selectedNoteIds: new Set(shares.map((s) => s.noteId)) })
    }
  },

  clearSelection: () => set({ selectedNoteIds: new Set() }),

  loadShares: async () => {
    const epoch = ++loadEpoch
    set({ loading: true })
    try {
      const { folderId, tag, statusFilter, search, sort, excludeBots, excludeSelfReferrers, excludeOwner } = get()
      const res = await api.share.list({
        folderId,
        tag,
        status: statusFilter,
        search: search.trim() || undefined,
        sort,
        excludeBots,
        excludeSelf: excludeSelfReferrers,
        excludeOwner,
      })
      void get().loadFolders()
      void get().loadTags()
      if (epoch === loadEpoch) {
        set({
          shares: res.shares,
          globalStats: res.globalStats,
          loading: false,
        })
      }
    } catch {
      if (epoch === loadEpoch) {
        set({ loading: false })
      }
    }
  },

  toggleShare: async (noteId, enabled) => {
    set((state) => ({
      shares: state.shares.map((s) =>
        s.noteId === noteId ? { ...s, isEnabled: enabled } : s,
      ),
    }))
    try {
      await api.share.create(noteId, { isEnabled: enabled })
      await get().loadShares()
      return true
    } catch {
      await get().loadShares()
      return false
    }
  },

  togglePin: async (noteId) => {
    const current = get().shares.find((s) => s.noteId === noteId)?.isPinned
    const nextVal = !current
    set((state) => ({
      shares: state.shares.map((s) =>
        s.noteId === noteId ? { ...s, isPinned: nextVal } : s,
      ),
    }))
    try {
      await useNotes.getState().patchNote(noteId, { isPinned: nextVal })
      await get().loadShares()
      return true
    } catch {
      await get().loadShares()
      return false
    }
  },

  toggleStar: async (noteId) => {
    const current = get().shares.find((s) => s.noteId === noteId)?.isStarred
    const nextVal = !current
    set((state) => ({
      shares: state.shares.map((s) =>
        s.noteId === noteId ? { ...s, isStarred: nextVal } : s,
      ),
    }))
    try {
      await useNotes.getState().patchNote(noteId, { isStarred: nextVal })
      await get().loadShares()
      return true
    } catch {
      await get().loadShares()
      return false
    }
  },

  batchToggle: async (action, noteIds, expiresIn) => {
    set({ batchBusy: true })
    try {
      await api.share.batch(action, noteIds, expiresIn)
      set({ selectedNoteIds: new Set() })
      await get().loadShares()
      return true
    } catch {
      return false
    } finally {
      set({ batchBusy: false })
    }
  },

  batchFolderToggle: async (folderId, enabled) => {
    set({ batchBusy: true })
    try {
      await api.share.batchFolder(folderId, enabled)
      await get().loadShares()
      return true
    } catch {
      return false
    } finally {
      set({ batchBusy: false })
    }
  },

  batchTagToggle: async (tag, enabled) => {
    set({ batchBusy: true })
    try {
      await api.share.batchTag(tag, enabled)
      await get().loadShares()
      return true
    } catch {
      return false
    } finally {
      set({ batchBusy: false })
    }
  },

  updateShare: async (noteId, options) => {
    try {
      const res = await api.share.create(noteId, options)
      await get().loadShares()
      return res.share
    } catch {
      return null
    }
  },

  revokeShare: async (noteId) => {
    try {
      await api.share.remove(noteId)
      await get().loadShares()
      return true
    } catch {
      return false
    }
  },
}))
