import type { DateRangeFilter, NoteSummary, ViewKind } from '@shared/types'
import { CALENDAR_TREE, DEFAULT_TODO_TAG, isTodoFolderId, isVirtualFolderId, parseVirtualId, TODO_TREE, virtualPeriodMatchesNote } from './calendar-tree'
import { dateKey } from './time'

function noteHasTag(noteTags: readonly string[], target: string): boolean {
  return noteTags.some((t) => t === target || t.startsWith(`${target}/`))
}

function matchesSelectedTags(
  note: NoteSummary,
  selectedTags: readonly string[],
  selectedTagsMatch: 'any' | 'all',
): boolean {
  if (!selectedTags.length)
    return true
  return selectedTagsMatch === 'all'
    ? selectedTags.every((name) => noteHasTag(note.tags, name))
    : selectedTags.some((name) => noteHasTag(note.tags, name))
}

function matchesFolderView(
  note: NoteSummary,
  folderId: string | null,
  folderScope?: ReadonlySet<string>,
  todoTagText: string = DEFAULT_TODO_TAG,
): boolean {
  if (!isVirtualFolderId(folderId))
    return Boolean(note.folderId && (folderScope?.has(note.folderId) ?? note.folderId === folderId))
  const ns = isTodoFolderId(folderId) ? TODO_TREE : CALENDAR_TREE
  const period = parseVirtualId(folderId, ns)
  return period !== null && virtualPeriodMatchesNote(period, note, ns, todoTagText)
}

function matchesDateFilter(note: NoteSummary, dateFilter: DateRangeFilter | null): boolean {
  if (!dateFilter)
    return true
  const key = dateKey(new Date(note.updatedAt))
  return key >= dateFilter.start && key <= dateFilter.end
}

/** Decide whether a note belongs to the active list view, optionally stacked with a multi-tag selection (`any` or `all` must match). */
export function matchesView(
  note: NoteSummary,
  view: ViewKind,
  folderId: string | null,
  tag: string | null,
  folderScope?: ReadonlySet<string>,
  selectedTags: readonly string[] = [],
  selectedTagsMatch: 'any' | 'all' = 'any',
  dateFilter: DateRangeFilter | null = null,
  todoTagText: string = DEFAULT_TODO_TAG,
  sharedNoteIds?: ReadonlySet<string>,
  publishedNoteIds?: ReadonlySet<string>,
): boolean {
  if (view === 'trash')
    return Boolean(note.deletedAt)
  if (note.deletedAt)
    return false
  if (view === 'archived')
    return note.isArchived
  if (note.isArchived)
    return false
  if (!matchesDateFilter(note, dateFilter))
    return false
  if (!matchesSelectedTags(note, selectedTags, selectedTagsMatch))
    return false
  switch (view) {
    case 'pinned':
      return note.isPinned
    case 'starred':
      return note.isStarred
    case 'shared':
      return Boolean(sharedNoteIds?.has(note.id))
    case 'published':
      return Boolean(publishedNoteIds?.has(note.id))
    case 'unfiled':
      return !note.folderId
    case 'folder':
      return matchesFolderView(note, folderId, folderScope, todoTagText)
    case 'tag':
      return Boolean(tag && noteHasTag(note.tags, tag))
    case 'untagged':
      return note.tags.length === 0
    case 'recent':
    case 'all':
    default:
      return true
  }
}