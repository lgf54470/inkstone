import { create } from 'zustand'
import type { ShareCategory, ShareInfo, ShareListResponse } from '@shared/types'
import { api } from '../../lib/api'
import { useNotes } from '../../store/notes'

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

  loadShares: () => Promise<void>
  toggleShare: (noteId: string, enabled: boolean) => Promise<boolean>
  togglePin: (noteId: string) => Promise<boolean>
  toggleStar: (noteId: string) => Promise<boolean>
  batchToggle: (
    action: 'enable' | 'disable' | 'revoke' | 'expire',
    noteIds: string[],
    expiresIn?: number | null,
  ) => Promise<boolean>
  batchFolderToggle: (folderId: string, enabled: boolean) => Promise<boolean>
  batchTagToggle: (tag: string, enabled: boolean) => Promise<boolean>
  updateShare: (
    noteId: string,
    options: {
      password?: string | null
      expiresIn?: number | null
      customSlug?: string
      isEnabled?: boolean
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
    const raw = typeof window !== 'undefined' ? localStorage.getItem('inkstone_share_filters') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        excludeBots: parsed.excludeBots !== false,
        excludeSelfReferrers: parsed.excludeSelfReferrers !== false,
        excludeOwner: parsed.excludeOwner !== false,
      }
    }
  } catch {}
  return {
    excludeBots: true,
    excludeSelfReferrers: true,
    excludeOwner: true,
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
  globalStats: null,
  loading: false,
  batchBusy: false,
  excludeBots: initialFilters.excludeBots,
  excludeSelfReferrers: initialFilters.excludeSelfReferrers,
  excludeOwner: initialFilters.excludeOwner,
  logRetentionDays: initialRetention.logRetentionDays,
  maxLogRecords: initialRetention.maxLogRecords,

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
          localStorage.setItem('inkstone_share_filters', JSON.stringify(updated))
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
