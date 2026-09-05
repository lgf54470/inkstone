import type { Folder, Note, NoteSummary, NoteVersionMeta, Tag } from '@shared/types'
import { sortTagNames } from '@shared/markdown-utils'


export interface NoteRow {
  id: string
  user_id: string
  folder_id: string | null
  title: string
  content: string
  excerpt: string
  rev: number
  word_count: number
  char_count: number
  is_pinned: number
  is_starred: number
  is_archived: number
  position: number
  content_hash: string
  created_at: number
  updated_at: number
  deleted_at: number | null

  tag_names?: string | null
}

export interface FolderRow {
  id: string
  parent_id: string | null
  name: string
  icon: string | null
  color: string | null
  position: number
  created_at: number
  updated_at: number
  note_count?: number
}

export interface TagRow {
  id: string
  name: string
  color: string | null
  is_pinned?: number
  created_at: number
  note_count?: number
}

export function toNoteSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    folderId: row.folder_id,
    tags: splitTags(row.tag_names),
    isPinned: row.is_pinned === 1,
    isStarred: row.is_starred === 1,
    isArchived: row.is_archived === 1,
    wordCount: row.word_count,
    charCount: row.char_count,
    rev: row.rev,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function toNote(row: NoteRow): Note {
  return { ...toNoteSummary(row), content: row.content }
}

export function toFolder(row: FolderRow): Folder {
  const folder: Folder = {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (row.note_count !== undefined) folder.noteCount = row.note_count
  return folder
}

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isPinned: row.is_pinned === 1,
    count: row.note_count ?? 0,
    createdAt: row.created_at,
  }
}

export function toVersionMeta(row: {
  id: string
  note_id: string
  title: string
  size: number
  created_at: number
}): NoteVersionMeta {
  return {
    id: row.id,
    noteId: row.note_id,
    title: row.title,
    size: row.size,
    createdAt: row.created_at,
  }
}


export const TAG_SEP_CODE = 1

export function splitTags(joined: string | null | undefined): string[] {
  if (!joined) return []
  return sortTagNames(joined.split(String.fromCharCode(TAG_SEP_CODE)).filter(Boolean))
}


export const NOTE_COLUMNS = `n.id, n.user_id, n.folder_id, n.title, n.excerpt, n.rev,
  n.word_count, n.char_count, n.is_pinned, n.is_starred, n.is_archived, n.position,
  n.content_hash, n.created_at, n.updated_at, n.deleted_at,
  (SELECT GROUP_CONCAT(t.name, char(1)) FROM note_tags nt
     JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = n.id AND t.user_id = n.user_id) AS tag_names`

export const NOTE_COLUMNS_FULL = `${NOTE_COLUMNS}, n.content`


export interface BlogPostRow {
  id: string
  slug: string
  note_id: string
  user_id: string
  title: string
  excerpt: string
  content: string
  cover_url: string
  category_id: string | null
  folder_id: string | null
  tags: string
  is_published: number
  allow_comments: number
  is_pinned: number
  views: number
  published_at: number
  created_at: number
  updated_at: number
}

export interface BlogPostCountsRow extends BlogPostRow {
  comments_count: number
}

export interface BlogPostPublicRow extends BlogPostCountsRow {
  category_name: string | null
  category_slug: string | null
}

export interface BlogTagRow {
  id: string
  user_id: string
  name: string
  color: string | null
  is_pinned: number
  created_at: number
}

export interface BlogCategoryRow {
  id: string
  user_id: string
  name: string
  slug: string
  description: string
  color: string | null
  icon: string | null
  position: number
  created_at: number
  updated_at: number
}

export interface BlogCategoryCountsRow extends BlogCategoryRow {
  posts_count: number
}

export interface BlogPublicCategoryRow {
  id: string
  name: string
  slug: string
  description: string
  color: string | null
  icon: string | null
  posts_count: number
}

export interface BlogCommentRow {
  id: string
  post_id: string
  parent_id: string | null
  author_name: string
  author_email: string
  author_url: string | null
  author_avatar: string | null
  content: string
  status: string
  ip: string | null
  user_agent: string | null
  created_at: number
}

export interface BlogCommentModerationRow extends BlogCommentRow {
  post_title: string
  post_slug: string
}

export interface BlogPublicCommentRow {
  id: string
  post_id: string
  parent_id: string | null
  author_name: string
  author_url: string | null
  author_avatar: string | null
  content: string
  created_at: number
}

export interface BlogTimelineRow {
  id: string
  slug: string
  title: string
  published_at: number
  cover_url: string
  tags: string
}

export interface BlogCalendarRow {
  slug: string
  title: string
  published_at: number
}
