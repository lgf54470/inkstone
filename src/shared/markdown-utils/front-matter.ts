import { Document, parseDocument } from 'yaml'

export interface FrontMatterResult {
  body: string
  data: Record<string, unknown>
  raw: string

  lineOffset: number
  errors: string[]
}

const FRONT_MATTER_LIMIT = 64 * 1024

const UTF8_ENCODER = new TextEncoder()

export function parseFrontMatter(text: string): FrontMatterResult {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text
  if (!/^---[ \t]*(?:\r?\n|$)/.test(source)) {
    return { body: source, data: {}, raw: '', lineOffset: 0, errors: [] }
  }

  const lines = source.split(/\r?\n/)
  const separators = source.match(/\r?\n/g) ?? []
  let closing = -1
  let bytes = UTF8_ENCODER.encode(lines[0]!).byteLength
  for (let index = 1; index < lines.length; index++) {
    bytes += UTF8_ENCODER.encode(separators[index - 1] ?? '').byteLength
    bytes += UTF8_ENCODER.encode(lines[index]!).byteLength
    if (bytes > FRONT_MATTER_LIMIT) {
      return {
        body: source,
        data: {},
        raw: '',
        lineOffset: 0,
        errors: ['Front Matter exceeds the 64 KiB safety limit'],
      }
    }
    if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[index]!)) {
      closing = index
      break
    }
  }
  if (closing < 0) return { body: source, data: {}, raw: '', lineOffset: 0, errors: [] }

  const raw = lines.slice(1, closing).join('\n')
  try {
    const document = parseDocument(raw, {
      prettyErrors: false,
      uniqueKeys: true,
    })
    const errors = document.errors.map((error) => error.message)
    if (errors.length) {
      return {
        body: lines.slice(closing + 1).join('\n'),
        data: {},
        raw,
        lineOffset: closing + 1,
        errors,
      }
    }
    const value = document.toJS({ maxAliasCount: 20 }) as unknown
    const data = isPlainRecord(value) ? value : {}
    if (value != null && !isPlainRecord(value)) {
      errors.push('Front Matter root must be a YAML mapping')
    }
    return {
      body: lines.slice(closing + 1).join('\n'),
      data,
      raw,
      lineOffset: closing + 1,
      errors,
    }
  } catch (error) {
    return {
      body: lines.slice(closing + 1).join('\n'),
      data: {},
      raw,
      lineOffset: closing + 1,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

export function splitFrontMatter(text: string): { body: string; meta: Record<string, string> } {
  const parsed = parseFrontMatter(text)
  const meta: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value == null) continue
    if (typeof value === 'string') meta[key] = value
    else if (typeof value === 'number' || typeof value === 'boolean') meta[key] = String(value)
    else meta[key] = JSON.stringify(value)
  }
  return { body: parsed.body, meta }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Update an existing front matter property in-place, keeping the body and all
 * other properties untouched. Returns the rewritten content, or `null` when
 * the content has no parseable front matter, the property does not exist, or
 * nothing changes. Passing `null` as `value` deletes the property.
 */
export function setFrontMatterProperty(content: string, key: string, value: string | null): string | null {
  const frontMatter = parseFrontMatter(content)
  if (frontMatter.lineOffset === 0 || frontMatter.errors.length) return null
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const header = lines.slice(0, frontMatter.lineOffset)
  const body = lines.slice(frontMatter.lineOffset).join('\n')
  const document = parseDocument(frontMatter.raw, { prettyErrors: false, uniqueKeys: true })
  if (document.errors.length) return null
  const data = document.toJS({ maxAliasCount: 20 }) as unknown
  if (!isPlainRecord(data) || !Object.prototype.hasOwnProperty.call(data, key)) return null
  if (value == null) document.delete(key)
  else document.set(key, value)
  const closing = header.at(-1) ?? '---'
  const serialized = document.toString().replace(/\n$/, '')
  const rewrittenFrontMatter = [
    header[0] ?? '---',
    ...(serialized ? serialized.split('\n') : []),
    closing,
  ]
  const rewritten = [...rewrittenFrontMatter, body].join('\n')
  return rewritten === normalized ? null : rewritten
}

export function upsertFrontMatterProperty(content: string, key: string, value: unknown): string {
  const frontMatter = parseFrontMatter(content)
  const normalized = content.replace(/\r\n/g, '\n')
  if (frontMatter.lineOffset === 0 || frontMatter.errors.length > 0) {
    const doc = new Document({ [key]: value })
    const serialized = doc.toString().trim()
    return `---\n${serialized}\n---\n\n${normalized}`
  }
  const lines = normalized.split('\n')
  const header = lines.slice(0, frontMatter.lineOffset)
  const body = lines.slice(frontMatter.lineOffset).join('\n')
  const document = parseDocument(frontMatter.raw, { prettyErrors: false, uniqueKeys: true })
  if (document.errors.length) return content
  document.set(key, value)
  const closing = header.at(-1) ?? '---'
  const serialized = document.toString().replace(/\n$/, '')
  return [
    header[0] ?? '---',
    ...(serialized ? serialized.split('\n') : []),
    closing,
    body,
  ].join('\n')
}

export function deleteFrontMatterProperty(content: string, key: string): string {
  const frontMatter = parseFrontMatter(content)
  if (frontMatter.lineOffset === 0 || frontMatter.errors.length > 0) return content
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const header = lines.slice(0, frontMatter.lineOffset)
  const body = lines.slice(frontMatter.lineOffset).join('\n')
  const document = parseDocument(frontMatter.raw, { prettyErrors: false, uniqueKeys: true })
  if (document.errors.length) return content
  document.delete(key)
  const remaining = document.toJS({ maxAliasCount: 20 }) as unknown
  if (isPlainRecord(remaining) && Object.keys(remaining).length === 0) {
    return body.replace(/^\n+/, '')
  }
  const closing = header.at(-1) ?? '---'
  const serialized = document.toString().replace(/\n$/, '')
  return [
    header[0] ?? '---',
    ...(serialized ? serialized.split('\n') : []),
    closing,
    body,
  ].join('\n')
}

export function renameFrontMatterProperty(content: string, oldKey: string, newKey: string): string {
  if (!oldKey || !newKey || oldKey === newKey) return content
  const frontMatter = parseFrontMatter(content)
  if (frontMatter.lineOffset === 0 || frontMatter.errors.length > 0) return content
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const header = lines.slice(0, frontMatter.lineOffset)
  const body = lines.slice(frontMatter.lineOffset).join('\n')
  const document = parseDocument(frontMatter.raw, { prettyErrors: false, uniqueKeys: true })
  if (document.errors.length) return content
  const val = document.get(oldKey)
  if (val === undefined) return content
  document.delete(oldKey)
  document.set(newKey, val)
  const closing = header.at(-1) ?? '---'
  const serialized = document.toString().replace(/\n$/, '')
  return [
    header[0] ?? '---',
    ...(serialized ? serialized.split('\n') : []),
    closing,
    body,
  ].join('\n')
}
