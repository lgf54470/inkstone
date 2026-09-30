import { escapeLike } from '../../lib/like'

// A blog tag lives inside a JSON array column, so the LIKE needle must be the JSON-escaped tag text,
// LIKE-escaped on top (ESCAPE '\'); the second pattern keeps the parent-tag-matches-descendants
// hierarchy semantics both the public listing and the management list promise.
export function blogTagNeedles(tag: string): [string, string] {
  const inner = escapeLike(JSON.stringify(tag).slice(1, -1))
  return [`%"${inner}"%`, `%"${inner}/%`]
}

/**
 * The WHERE fragment for one tag including its descendants. Both callers build their clause list the
 * same way, so the placeholders are numbered by the caller and the two needles stay in step.
 */
export function blogTagFilterSql(column: string, tag: string, startIdx: number): { clause: string; params: [string, string] } {
  const [exact, descendant] = blogTagNeedles(tag)
  return {
    clause: `(${column} LIKE ?${startIdx} ESCAPE '\\' OR ${column} LIKE ?${startIdx + 1} ESCAPE '\\')`,
    params: [exact, descendant],
  }
}
