import type { ShareCategory, ShareFolder, ShareInfo, ShareListResponse, ShareTag } from '@shared/types';
import type { StoreApi } from 'zustand';

export type SetShareStoreState = StoreApi<ShareStoreState>['setState'];



export interface ShareFolderNode {
  folder: ShareFolder
  children: ShareFolderNode[]
  depth: number
}



export interface ShareStoreState {
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
    action: 'enable' | 'disable' | 'revoke' | 'expire' | 'move',
    noteIds: string[],
    expiresIn?: number | null,
    folderId?: string | null,
  ) => Promise<boolean>
  batchMoveToFolder: (noteIds: string[], folderId: string | null) => Promise<boolean>
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
