import type { Note, NoteSummary } from './notes';

export type ViewKind =
  | 'all'
  | 'recent'
  | 'starred'
  | 'pinned'
  | 'shared'
  | 'published'
  | 'unfiled'
  | 'archived'
  | 'trash'
  | 'folder'
  | 'tag'
  | 'untagged'

export type SortKey = 'updated' | 'created' | 'title'

export type SortOrder = 'asc' | 'desc'

export interface ListNotesQuery {
  view?: ViewKind
  folderId?: string
  tag?: string
  sort?: SortKey
  order?: SortOrder
  limit?: number
  cursor?: string
}

export interface ListNotesResponse {
  notes: NoteSummary[]
  nextCursor: string | null
  /** Exact row count of the current view; only present on the first page to keep deep-paging cheap. */
  total: number | null
}

export interface CreateNoteBody {
  id?: string
  title?: string
  content?: string
  folderId?: string | null
  isStarred?: boolean
}

export interface PatchNoteBody {
  rev: number
  title?: string
  content?: string
  folderId?: string | null
  isPinned?: boolean
  isStarred?: boolean
  isArchived?: boolean

  quiet?: boolean
  preserveVersion?: boolean
}

export interface ConflictPayload {
  code: 'conflict'
  message: string
  server: Note
}
