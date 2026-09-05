import { api } from '../../../lib/api';
import { useNotes } from '../../../store/notes';
import type { ShareStoreState, SetShareStoreState } from './types';


export const shareSharesActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'batchToggleGroup' | 'toggleShare' | 'togglePin' | 'toggleStar' | 'batchToggle' | 'batchMoveToFolder' | 'batchFolderToggle' | 'batchTagToggle' | 'updateShare' | 'revokeShare'> => ({


  batchToggleGroup: async (type, target, enabled) => {
    set({ batchBusy: true })
    set((s) => {
      const updatedShares = s.shares.map((share) => {
        let hasMatch = false
        if (type === 'folder' && (share.folderId === target || share.shareFolderId === target)) {
          hasMatch = true
        }
        if (type === 'tag' && share.shareTags?.includes(target)) {
          hasMatch = true
        }
        if (hasMatch) {
          return { ...share, isEnabled: enabled }
        }
        return share
      })

      let updatedGlobalStats = s.globalStats
      if (updatedGlobalStats) {
        if (type === 'folder' && updatedGlobalStats.folderCounts[target]) {
          const prev = updatedGlobalStats.folderCounts[target]
          updatedGlobalStats = {
            ...updatedGlobalStats,
            folderCounts: {
              ...updatedGlobalStats.folderCounts,
              [target]: {
                total: prev.total,
                shared: enabled ? prev.total : 0,
              },
            },
          }
        }
        if (type === 'tag' && updatedGlobalStats.tagCounts[target]) {
          const prev = updatedGlobalStats.tagCounts[target]
          updatedGlobalStats = {
            ...updatedGlobalStats,
            tagCounts: {
              ...updatedGlobalStats.tagCounts,
              [target]: {
                total: prev.total,
                shared: enabled ? prev.total : 0,
              },
            },
          }
        }
      }

      return { shares: updatedShares, globalStats: updatedGlobalStats }
    })
    try {
      await api.share.batchToggleGroup(type, target, enabled)
      await get().loadShares()
      return true
    } catch {
      await get().loadShares()
      return false
    } finally {
      set({ batchBusy: false })
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


  batchToggle: async (action, noteIds, expiresIn, folderId) => {
    set({ batchBusy: true })
    try {
      await api.share.batch(action, noteIds, expiresIn, folderId)
      set({ selectedNoteIds: new Set() })
      await get().loadShares()
      return true
    } catch {
      return false
    } finally {
      set({ batchBusy: false })
    }
  },


  batchMoveToFolder: async (noteIds, folderId) => {
    set({ batchBusy: true })
    set((s) => {
      const idSet = new Set(noteIds)
      const updatedShares = s.shares.map((share) => {
        if (idSet.has(share.noteId)) {
          return { ...share, shareFolderId: folderId, folderId }
        }
        return share
      })
      return { shares: updatedShares, selectedNoteIds: new Set() }
    })
    try {
      await api.share.batch('move', noteIds, undefined, folderId)
      await get().loadShares()
      return true
    } catch {
      await get().loadShares()
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
  }
});
