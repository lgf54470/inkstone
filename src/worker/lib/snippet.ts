import { toPlainText } from '@shared/markdown-utils'
import { sliceText, truncateText } from '@shared/text-utils'

/**
 * The window a row has to fetch so a snippet can be cut around the match without shipping the whole
 * body: `instr` finds the first occurrence of the term and `substr` takes the characters around it.
 * Shared by the note and blog searches, which is why the column is the caller's to name.
 */
export function contentWindowSql(column: string, termBindIndex: number): string {
  const found = `instr(lower(${column}), lower(?${termBindIndex}))`
  return `substr(${column}, CASE WHEN ${found} > 180 THEN ${found} - 180 ELSE 1 END, 520)`
}

/**
 * A plain-text teaser around the first matched term. The displayed text is derived from the stored
 * body (markdown flattened, whitespace collapsed), and a body that holds none of the terms — a hit
 * whose match lives in the title, or a fallback read — still gets a readable opening instead of an
 * empty line.
 */
export function makeSnippet(content: string, terms: string[], radius = 70): string {
  const plain = toPlainText(content).replace(/\s+/g, ' ')
  if (!plain) return ''
  const lower = plain.toLowerCase()

  let at = -1
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase())
    if (idx >= 0 && (at < 0 || idx < at)) at = idx
  }
  if (at < 0) return truncateText(plain, radius * 2) + (plain.length > radius * 2 ? '…' : '')

  const start = Math.max(0, at - radius)
  const end = Math.min(plain.length, at + radius * 1.6)
  return (start > 0 ? '…' : '') + sliceText(plain, start, end).trim() + (end < plain.length ? '…' : '')
}
