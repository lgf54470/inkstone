export interface Attachment {
  id: string
  noteId: string | null
  folderId?: string | null
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  url: string
  createdAt: number
  isStarred?: boolean
  isPinned?: boolean
  tags?: string[]
}

export interface AttachmentWithUsage extends Attachment {
  references: number
}

export interface AttachmentFolder {
  id: string
  userId?: string
  parentId: string | null
  name: string
  icon?: string | null
  color?: string | null
  position?: number
  createdAt: number
  updatedAt: number
}

export interface AttachmentTag {
  id: string
  userId?: string
  name: string
  color?: string | null
  isPinned?: boolean
  createdAt: number
}

export interface AttachmentStats {
  totalCount: number
  totalBytes: number
  totalQuotaBytes: number
  imageBytes: number
  documentBytes: number
  mediaBytes: number
  archiveBytes: number
  codeBytes: number
  otherBytes: number
  unreferencedCount: number
  folderCount?: number
  tagCount?: number
  extensionBreakdown?: Record<string, { count: number; bytes: number }>
  largestFiles?: AttachmentWithUsage[]
}
