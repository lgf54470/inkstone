import type { MusicTag, Tag } from '@shared/types'
import { tagColorValue } from './music-utils'

const MAX_TAG_DEPTH = 16
const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map()

// Built once for a whole list and shared: resolving the tree per row is O(rows × tags)
// for a value that only changes when the tags themselves change.
export function tagRowsById(tags: readonly MusicTag[]): Map<string, Tag> {
  return new Map(toTagRows(tags, EMPTY_COUNTS).map((row) => [row.id, row]))
}

export function toTagRows(tags: readonly MusicTag[], counts: ReadonlyMap<string, number>): Tag[] {
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  return tags.map((tag) => ({
    id: tag.id,
    name: tagPath(tag, byId),
    color: nameColor(tag.color),
    count: counts.get(tag.id) ?? 0,
    isPinned: tag.isPinned,
    createdAt: tag.createdAt,
  }))
}

export function leafTagName(value: string): string {
  const segments = value.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? value.trim()
}

function tagPath(tag: MusicTag, byId: ReadonlyMap<string, MusicTag>): string {
  const parts: string[] = [tag.name]
  let parentId = tag.parentId
  let guard = 0
  while (parentId && guard < MAX_TAG_DEPTH) {
    const parent = byId.get(parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
    guard += 1
  }
  return parts.join('/')
}

// Older music tags stored a palette name instead of hex; display keeps working either way.
function nameColor(color: string | null | undefined): string | null {
  if (!color) return null
  return tagColorValue(color, color)
}
