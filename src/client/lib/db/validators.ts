import type { Folder, NoteSummary, NoteTemplate, NoteTemplateCategory, PublicUser, SiteInfo, Tag } from '@shared/types';
export function summariesEqual(a: NoteSummary, b: NoteSummary): boolean {
  if (a === b) return true
  return a.id === b.id &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.folderId === b.folderId &&
    a.isPinned === b.isPinned &&
    a.isStarred === b.isStarred &&
    a.isArchived === b.isArchived &&
    a.wordCount === b.wordCount &&
    a.charCount === b.charCount &&
    a.rev === b.rev &&
    a.position === b.position &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a.deletedAt === b.deletedAt &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
}
export function foldersEqual(a: Folder[], b: Folder[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) {
    const x = a[index]!
    const y = b[index]!
    if (x.id !== y.id || x.parentId !== y.parentId || x.name !== y.name || x.icon !== y.icon ||
      (x.color ?? null) !== (y.color ?? null) || x.position !== y.position ||
      x.createdAt !== y.createdAt || x.updatedAt !== y.updatedAt ||
      (x.noteCount ?? null) !== (y.noteCount ?? null)) {
      return false
    }
  }
  return true
}
export function tagsEqual(a: Tag[], b: Tag[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) {
    const x = a[index]!
    const y = b[index]!
    if (x.id !== y.id || x.name !== y.name || (x.color ?? null) !== (y.color ?? null) ||
      Boolean(x.isPinned) !== Boolean(y.isPinned) ||
      x.count !== y.count || x.createdAt !== y.createdAt) {
      return false
    }
  }
  return true
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
export function isPublicUser(value: unknown): value is PublicUser {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.login === 'string' &&
    typeof value.name === 'string' &&
    typeof value.avatarUrl === 'string' &&
    (value.role === 'owner' || value.role === 'member') &&
    isFiniteNumber(value.createdAt) &&
    typeof value.username === 'string'
}
export function isSiteInfo(value: unknown): value is SiteInfo {
  if (!isRecord(value)) return false
  return typeof value.name === 'string' &&
    typeof value.initialized === 'boolean' &&
    typeof value.registrationOpen === 'boolean' &&
    typeof value.r2Enabled === 'boolean' &&
    typeof value.kvEnabled === 'boolean' &&
    (value.attachmentStorage === 'r2' || value.attachmentStorage === 'kv' || value.attachmentStorage === null) &&
    typeof value.realtimeEnabled === 'boolean' &&
    typeof value.version === 'string'
}
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
export function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}
export function isNoteSummary(value: unknown): value is NoteSummary {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.excerpt === 'string' &&
    isNullableString(value.folderId) &&
    Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string') &&
    typeof value.isPinned === 'boolean' &&
    typeof value.isStarred === 'boolean' &&
    typeof value.isArchived === 'boolean' &&
    isFiniteNumber(value.wordCount) &&
    isFiniteNumber(value.charCount) &&
    Number.isSafeInteger(value.rev) && (value.rev as number) >= 1 &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    isNullableNumber(value.deletedAt)
}
export function isFolder(value: unknown): value is Folder {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    isNullableString(value.parentId) &&
    typeof value.name === 'string' &&
    isNullableString(value.icon) &&
    (value.color === undefined || isNullableString(value.color)) &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    (value.noteCount === undefined || isFiniteNumber(value.noteCount))
}
export function isTag(value: unknown): value is Tag {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.color) &&
    (value.isPinned === undefined || typeof value.isPinned === 'boolean') &&
    isFiniteNumber(value.count) &&
    isFiniteNumber(value.createdAt)
}
export function isNoteTemplateCategory(value: unknown): value is NoteTemplateCategory {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.builtin === 'boolean' &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.createdAt)
}
export function isNoteTemplate(value: unknown): value is NoteTemplate {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    isNullableString(value.categoryId) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.content === 'string' &&
    typeof value.builtin === 'boolean' &&
    typeof value.isPinned === 'boolean' &&
    typeof value.isStarred === 'boolean' &&
    (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string'))) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt)
}
