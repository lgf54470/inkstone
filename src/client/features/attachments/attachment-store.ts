import { create } from 'zustand'
import type { AttachmentFolder, AttachmentTag, Folder, Tag } from '@shared/types'
import { api } from '../../lib/api'
import { buildFolderTree, type FolderNode } from '../..//store/notes/selectors'
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../lib/tag-tree'

interface AttachmentStoreState {
  folders: AttachmentFolder[]
  tags: AttachmentTag[]
  expandedFolders: string[]
  expandedTagPaths: Set<string>
  loading: boolean
  load: () => Promise<void>
  createFolder: (name?: string, parentId?: string | null) => Promise<AttachmentFolder | null>
  patchFolder: (id: string, patch: Partial<AttachmentFolder>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  setExpandedFolders: (updater: string[] | ((prev: string[]) => string[])) => void
  toggleFolderExpanded: (id: string) => void
  createTag: (name: string, color?: string | null) => Promise<AttachmentTag | null>
  patchTag: (id: string, patch: Partial<AttachmentTag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
  toggleTagExpanded: (fullPath: string) => void
  setExpandedTagPaths: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void
}

export const useAttachmentStore = create<AttachmentStoreState>((set) => ({
  folders: [],
  tags: [],
  expandedFolders: [],
  expandedTagPaths: new Set<string>(),
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const [folders, tags] = await Promise.all([
        api.files.folders.list(),
        api.files.tags.list(),
      ])
      set({ folders, tags, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createFolder: async (name, parentId = null) => {
    try {
      const created = await api.files.folders.create({
        name: name || 'New Folder',
        parentId,
      })
      set((s) => ({ folders: [...s.folders, created] }))
      if (parentId) {
        set((s) => ({
          expandedFolders: s.expandedFolders.includes(parentId)
            ? s.expandedFolders
            : [...s.expandedFolders, parentId],
        }))
      }
      return created
    } catch {
      return null
    }
  },

  patchFolder: async (id, patch) => {
    try {
      const updated = await api.files.folders.patch(id, patch)
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? updated : f)),
      }))
    } catch {}
  },

  deleteFolder: async (id) => {
    try {
      await api.files.folders.remove(id)
      set((s) => ({
        folders: s.folders.filter((f) => f.id !== id),
        expandedFolders: s.expandedFolders.filter((fId) => fId !== id),
      }))
    } catch {}
  },

  setExpandedFolders: (updater) => {
    set((s) => ({
      expandedFolders: typeof updater === 'function' ? updater(s.expandedFolders) : updater,
    }))
  },

  toggleFolderExpanded: (id) => {
    set((s) => {
      const exists = s.expandedFolders.includes(id)
      return {
        expandedFolders: exists
          ? s.expandedFolders.filter((fId) => fId !== id)
          : [...s.expandedFolders, id],
      }
    })
  },

  createTag: async (name, color) => {
    try {
      const created = await api.files.tags.create({ name, color })
      set((s) => {
        const exists = s.tags.some((t) => t.id === created.id || t.name === created.name)
        return {
          tags: exists
            ? s.tags.map((t) => (t.id === created.id || t.name === created.name ? created : t))
            : [...s.tags, created],
        }
      })
      return created
    } catch {
      return null
    }
  },

  patchTag: async (id, patch) => {
    try {
      const updated = await api.files.tags.patch(id, patch)
      set((s) => ({
        tags: s.tags.map((t) => (t.id === id ? updated : t)),
      }))
    } catch {}
  },

  deleteTag: async (id) => {
    try {
      await api.files.tags.remove(id)
      set((s) => ({
        tags: s.tags.filter((t) => t.id !== id),
      }))
    } catch {}
  },

  toggleTagExpanded: (fullPath) => {
    set((s) => {
      const next = new Set(s.expandedTagPaths)
      if (next.has(fullPath)) next.delete(fullPath)
      else next.add(fullPath)
      return { expandedTagPaths: next }
    })
  },

  setExpandedTagPaths: (updater) => {
    set((s) => ({
      expandedTagPaths: typeof updater === 'function' ? updater(s.expandedTagPaths) : updater,
    }))
  },
}))

export function useAttachmentFolderTree(): FolderNode[] {
  const folders = useAttachmentStore((s) => s.folders)
  const castFolders: Folder[] = folders.map((f) => ({
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    icon: f.icon ?? null,
    color: f.color ?? null,
    position: f.position ?? 0,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }))
  return buildFolderTree(castFolders, new Map())
}

export function useAttachmentTagTree(): {
  tree: TagTreeNode[]
  flatTree: TagTreeNode[]
} {
  const tags = useAttachmentStore((s) => s.tags)
  const expandedTagPaths = useAttachmentStore((s) => s.expandedTagPaths)
  const castTags: Tag[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color ?? null,
    isPinned: Boolean(t.isPinned),
    count: 0,
    createdAt: t.createdAt,
  }))
  const tree = buildTagTree(castTags)
  const flatTree = flattenTagTree(tree, expandedTagPaths)
  return { tree, flatTree }
}
