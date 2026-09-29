import type { Folder, NoteSummary, NoteTemplate, NoteTemplateCategory, Tag } from '@shared/types'
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
  lastAttemptAt?: number
}


// What kind of music record a pending write targets. Each kind has one endpoint and one shape of
// body, which is all the replay needs to know; the flags themselves stay in `payload` so the queue
// can carry a new flag without a new column.
export type MusicWriteKind = 'trackFlags' | 'playlistFlags'

// A music write the server never saw: one target's intent, kept until the network comes back.
// Deliberately thinner than `OutboxItem` (notes): music flags are booleans and the reader states
// the value it wants ("pin it"), never a delta, so replay is idempotent and last-write-wins per
// field. That is why there is no `writeId`, no `dependsOnWriteId` and no `rev` chain here — there is
// nothing to merge and therefore no ordering to protect, only the newest intent to keep.
export interface MusicPendingWrite {
  id: string
  kind: MusicWriteKind
  targetId: string
  payload: Record<string, unknown>
  attempts: number
  createdAt: number
  lastError?: string
  lastAttemptAt?: number
}


export interface CachedNoteContent {
  content: string
  rev: number
  updatedAt: number
  writeId?: string
  pendingTitle?: string
  contentDirty?: boolean
}
