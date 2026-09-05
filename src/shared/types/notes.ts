export interface NoteSummary {
  id: string
  title: string
  excerpt: string
  folderId: string | null
  tags: string[]
  isPinned: boolean
  isStarred: boolean
  isArchived: boolean
  wordCount: number
  charCount: number
  rev: number
  position: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Note extends NoteSummary {
  content: string
}

export interface Folder {
  id: string
  parentId: string | null
  name: string
  icon: string | null
  color: string | null
  position: number
  createdAt: number
  updatedAt: number

  noteCount?: number
}

export interface Tag {
  id: string
  name: string
  color: string | null
  isPinned?: boolean
  count: number
  createdAt: number
}

export interface NoteTemplateCategory {
  id: string
  name: string
  /** True for categories shipped with the app; they cannot be renamed or deleted. */
  builtin: boolean
  position: number
  createdAt: number
}

export interface NoteTemplate {
  id: string
  categoryId: string | null
  name: string
  description: string
  content: string
  /** True for templates shipped with the app; they can be edited but not deleted. */
  builtin: boolean
  isPinned: boolean
  isStarred: boolean
  /** Free-form labels shown in the gallery and used as a filter. */
  tags: string[]
  /** Manual sort position within the category; falls back to `updatedAt` when absent. */
  position?: number
  createdAt: number
  updatedAt: number
}

export interface CommunityTemplate {
  id: string
  authorId: string
  authorName: string
  name: string
  description: string
  content: string
  tags: string[]
  category: string
  createdAt: number
}

export interface CommunityTemplateInput {
  id?: string
  name: string
  description: string
  content: string
  tags: string[]
  category: string
}

export interface NoteVersionMeta {
  id: string
  noteId: string
  title: string
  size: number
  createdAt: number
}

export interface NoteVersion extends NoteVersionMeta {
  content: string
}

export interface Backlink {
  id: string
  title: string
  context: string
}
