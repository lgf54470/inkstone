import { isPlainRecord, parseFrontMatter } from './front-matter';
import { frontMatterTags } from './tags';
import { parseDocument } from 'yaml'

/**
 * Fills the placeholders of a new-note template (`{{title}}`, `{{createdAt}}`,
 * `{{date}}`, `{{time}}`, `{{today}}`, `{{tomorrow}}`, `{{yesterday}}`, plus
 * contextual `{{folder}}` and `{{tags}}` values passed via `extra`). Shared by
 * the client (note creation, settings preview) and the worker (MCP
 * create_note). Values are quoted when needed so the rendered front matter
 * stays valid YAML; callers pass the resolved title (with any localized
 * fallback applied). Contextual placeholders without a value render as empty.
 */
export function interpolateNewNoteTemplate(
  template: string,
  title: string,
  now = new Date(),
  extra: Record<string, string> = {},
): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const isoDate = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  const date = isoDate(now)
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yamlSafe = (value: string) => /[:#\[\]{},&*!|>'"%@`]/.test(value) || value !== value.trim()
    ? JSON.stringify(value)
    : value
  let result = template
    .replaceAll('{{title}}', yamlSafe(title))
    .replaceAll('{{createdAt}}', `${date} ${time}`)
    .replaceAll('{{date}}', date)
    .replaceAll('{{time}}', time)
    .replaceAll('{{today}}', date)
    .replaceAll('{{tomorrow}}', isoDate(tomorrow))
    .replaceAll('{{yesterday}}', isoDate(yesterday))
  // Contextual values are inserted verbatim: `{{tags}}` commonly expands into
  // a flow list like `tags: [daily, reading]`, which quoting would corrupt.
  for (const [key, value] of Object.entries({ folder: '', tags: '', ...extra })) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

/**
 * Adds a tag to a note's front matter `tags`/`tag` list (creating the property
 * when missing), without touching the body. Returns the rewritten content, or
 * `null` when there is no parseable front matter or the tag is already
 * present. Used when creating a note from a tag view so the tag lands in the
 * properties.
 */
export function addTagToFrontMatter(content: string, tag: string): string | null {
  const frontMatter = parseFrontMatter(content)
  if (frontMatter.lineOffset === 0 || frontMatter.errors.length) return null
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const header = lines.slice(0, frontMatter.lineOffset)
  const body = lines.slice(frontMatter.lineOffset).join('\n')
  const document = parseDocument(frontMatter.raw, { prettyErrors: false, uniqueKeys: true })
  if (document.errors.length) return null
  const data = document.toJS({ maxAliasCount: 20 }) as unknown
  if (!isPlainRecord(data)) return null
  const clean = tag.trim().replace(/^#/, '')
  if (!clean) return null
  const key = Object.prototype.hasOwnProperty.call(data, 'tags')
    ? 'tags'
    : Object.prototype.hasOwnProperty.call(data, 'tag') ? 'tag' : null
  const existing = key === null ? undefined : data[key]
  const asNames = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().replace(/^#/, '')).filter(Boolean)
    : typeof value === 'string' ? frontMatterTags({ [key as string]: value })
        .map((item) => item.trim().replace(/^#/, '')).filter(Boolean)
      : []
  const known = existing == null ? [] : asNames(existing)
  if (known.some((item) => item.toLowerCase() === clean.toLowerCase())) return null
  document.set(key ?? 'tags', [...known, clean])
  const closing = header.at(-1) ?? '---'
  const serialized = document.toString().replace(/\n$/, '')
  const rewrittenFrontMatter = [
    header[0] ?? '---',
    ...(serialized ? serialized.split('\n') : []),
    closing,
  ]
  return [...rewrittenFrontMatter, body].join('\n')
}

export interface FrontMatterMergeResult {
  content: string
  cursor: number | null
}

/**
 * Merges tags into a rendered template's front matter `tags` list, shifting a
 * pending caret position by the bytes inserted before it. Must run after
 * placeholder interpolation: the YAML round-trip would mangle raw `{{...}}`
 * tokens (they parse as flow mappings) and leave them unreplaced.
 */
export function mergeTagsIntoFrontMatter(
  content: string,
  tags: readonly string[],
  cursor: number | null = null,
): FrontMatterMergeResult {
  let body = content
  let next = cursor
  for (const tag of tags) {
    const merged = addTagToFrontMatter(body, tag)
    if (merged) {
      if (next !== null)
        next += merged.length - body.length
      body = merged
    }
  }
  return { content: body, cursor: next }
}

export interface RenderedNewNoteTemplate {
  content: string
  cursor: number | null
}

/**
 * Renders a new-note template into final content, removing the `{{cursor}}`
 * marker (if any) and reporting its position so callers can place the caret.
 * Shared by note creation, the settings preview, and the editor command that
 * inserts the template at the caret. The sentinel character cannot occur in
 * real template output, so the reported position is always in final content.
 */
export function renderNewNoteTemplate(
  template: string,
  title: string,
  now = new Date(),
  extra: Record<string, string> = {},
): RenderedNewNoteTemplate {
  const content = interpolateNewNoteTemplate(template.replaceAll('{{cursor}}', '\uFFFF'), title, now, extra)
  const cursor = content.includes('\uFFFF') ? content.indexOf('\uFFFF') : null
  return {
    content: cursor === null ? content : content.replaceAll('\uFFFF', ''),
    cursor,
  }
}
