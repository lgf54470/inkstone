import type { Folder, NoteSummary, NoteTemplate, NoteTemplateCategory, Tag } from '@shared/types';
export interface ShellData {
  notes: NoteSummary[]
  folders: Folder[]
  tags: Tag[]
  cursor: number
}
export interface ShellBaseline {
  userId: string
  notes: Map<string, NoteSummary>
  folders: Folder[]
  tags: Tag[]
  cursor: number
}


export interface TemplateLibraryData {
  categories: NoteTemplateCategory[]
  templates: NoteTemplate[]
  seedVersion: number
}


export interface OutboxItem {
  id: string
  clientId: string
  writeId: string
  dependsOnWriteId?: string
  noteId: string
  payload: Record<string, unknown>
  attempts: number
  createdAt: number
  lastError?: string
}


export interface CachedNoteContent {
  content: string
  rev: number
  updatedAt: number
  writeId?: string
  pendingTitle?: string
  contentDirty?: boolean
}
