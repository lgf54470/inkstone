import { isEscaped } from './code';
import { isPlainRecord, parseFrontMatter } from './front-matter';
import { parseDocument } from 'yaml'

const TAG_RE = /(^|[\s(\uff08[\u3010>\u300c\u300e\uff0c,\u3001;\uff1b])#([\p{L}\p{N}_\-/·]{1,60})(?![\p{L}\p{N}_\-/·])/gu

const TAG_COLLATOR = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

interface BodyTagOccurrence {
  name: string
  hashStart: number
  nameStart: number
  nameEnd: number
}

const PROTECT_COMMENT_PATTERNS = [
  /<!--(?:[\s\S]*?-->|[\s\S]*$)/g,
  /\$\$(?:[\s\S]*?\$\$|[\s\S]*$)/g,
  /\$(?!\s)(?:[^$\\]|\\.)+?(?<!\s)\$/g,
]

const PROTECT_URL_PATTERNS = [
  /(?:https?|ftp):\/\/[^\s<>]+|mailto:[^\s<>]+|\bwww\.[^\s<>]+/giu,
]

function markProtected(chars: Uint8Array, start: number, end: number): void {
  const boundedStart = Math.max(0, start)
  const boundedEnd = Math.min(chars.length, end)
  for (let i = boundedStart; i < boundedEnd; i++) chars[i] = 1
}

function protectFences(text: string, chars: Uint8Array): void {
  let isInFence = false
  let fenceChar = ''
  let fenceLen = 0
  let lineStart = 0
  while (lineStart < text.length) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? text.length : newline + 1
    const line = text.slice(lineStart, newline < 0 ? text.length : newline).replace(/\r$/, '')
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)
    if (!fence) {
      if (isInFence) markProtected(chars, lineStart, lineEnd)
      lineStart = lineEnd
      continue
    }
    const marker = fence[1]!
    if (isInFence && marker[0] === fenceChar && marker.length >= fenceLen) {
      isInFence = false
    } else if (!isInFence) {
      isInFence = true
      fenceChar = marker[0]!
      fenceLen = marker.length
    }
    markProtected(chars, lineStart, lineEnd)
    lineStart = lineEnd
  }
}

function inlineCodeEnd(text: string, start: number): number {
  let end = start
  while (text[end] === '`') end++
  return end
}

function protectInlineCode(text: string, chars: Uint8Array): void {
  for (let i = 0; i < text.length;) {
    if (chars[i] || text[i] !== '`' || isEscaped(text, i)) {
      i++
      continue
    }
    const markerEnd = inlineCodeEnd(text, i + 1)
    const markerLength = markerEnd - i
    let closing = markerEnd
    let hasMatched = false
    while (closing < text.length) {
      closing = text.indexOf('`', closing)
      if (closing < 0) break
      const closingEnd = inlineCodeEnd(text, closing)
      if (closingEnd - closing === markerLength) {
        markProtected(chars, i, closingEnd)
        i = closingEnd
        hasMatched = true
        break
      }
      closing = closingEnd
    }
    if (!hasMatched) i = markerEnd
  }
}

function hasOverlap(chars: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (chars[i]) return true
  }
  return false
}

function protectPatterns(text: string, chars: Uint8Array, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index
      if (start !== undefined && !hasOverlap(chars, start, start + match[0].length)) {
        markProtected(chars, start, start + match[0].length)
      }
    }
  }
}

function protectComments(text: string, chars: Uint8Array): void {
  let commentStart = -1
  for (let index = 0; index < text.length - 1; index++) {
    if (chars[index] || !text.startsWith('%%', index) || isEscaped(text, index)) continue
    if (commentStart < 0) commentStart = index
    else {
      markProtected(chars, commentStart, index + 2)
      commentStart = -1
    }
    index++
  }
  if (commentStart >= 0) markProtected(chars, commentStart, text.length)
}

function protectReferenceLinkDefinitions(text: string, chars: Uint8Array): void {
  let lineStart = 0
  while (lineStart < text.length) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? text.length : newline + 1
    const line = text.slice(lineStart, newline < 0 ? text.length : newline)
    if (/^[ \t]{0,3}\[(?!\^)[^\]\n]+\]:/.test(line)) markProtected(chars, lineStart, lineEnd)
    lineStart = lineEnd
  }
}

function protectWikiLink(text: string, chars: Uint8Array, i: number): number {
  if (!text.startsWith('[[', i)) return -1
  const closing = text.indexOf(']]', i + 2)
  if (closing < 0) return -1
  const pipe = text.indexOf('|', i + 2)
  const hasPipe = pipe >= 0 && pipe < closing
  markProtected(chars, i, hasPipe ? pipe + 1 : closing)
  markProtected(chars, closing, closing + 2)
  return (hasPipe ? pipe : closing) - 1
}

function protectHtmlTag(text: string, chars: Uint8Array, i: number): number {
  if (text[i] !== '<' || !/[A-Za-z/!?]/.test(text[i + 1] ?? '')) return -1
  let end = i + 1
  let quote = ''
  while (end < text.length) {
    const ch = text[end]!
    if (quote && ch === quote && !isEscaped(text, end)) {
      quote = ''
      end++
      continue
    }
    if (quote) {
      end++
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      end++
      continue
    }
    if (ch === '>') {
      end++
      break
    }
    end++
  }
  if (end <= text.length && end > i + 1 && text[end - 1] === '>') {
    markProtected(chars, i, end)
    return end - 1
  }
  return -1
}

function protectLinkDestination(
  text: string,
  chars: Uint8Array,
  opening: { start: number; image: boolean },
  closeIndex: number,
): number {
  const destinationStart = closeIndex + 1
  if (text[destinationStart] !== '(') {
    if (opening.image) markProtected(chars, opening.start - 1, closeIndex + 1)
    return -1
  }
  let depth = 1
  let quote = ''
  let end = destinationStart + 1
  for (; end < text.length; end++) {
    if (chars[end] || isEscaped(text, end)) continue
    const ch = text[end]!
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) {
      end++
      break
    }
  }
  if (depth === 0) {
    markProtected(chars, destinationStart, end)
    if (opening.image) markProtected(chars, opening.start - 1, end)
    return end - 1
  }
  if (opening.image) markProtected(chars, opening.start - 1, closeIndex + 1)
  return -1
}

function protectBracketStructures(text: string, chars: Uint8Array): void {
  const bracketStack: Array<{ start: number; image: boolean }> = []
  for (let i = 0; i < text.length; i++) {
    if (chars[i] || isEscaped(text, i)) continue

    const wikiNext = protectWikiLink(text, chars, i)
    if (wikiNext >= 0) {
      i = wikiNext
      continue
    }

    const tagNext = protectHtmlTag(text, chars, i)
    if (tagNext >= 0) {
      i = tagNext
      continue
    }

    if (text[i] === '[') {
      bracketStack.push({ start: i, image: i > 0 && text[i - 1] === '!' && !isEscaped(text, i - 1) })
      continue
    }
    if (text[i] !== ']' || bracketStack.length === 0) continue

    const opening = bracketStack.pop()!
    const destNext = protectLinkDestination(text, chars, opening, i)
    if (destNext >= 0) i = destNext
  }
}

function blankProtectedChars(text: string, chars: Uint8Array): string {
  const out = text.split('')
  for (let i = 0; i < out.length; i++) {
    if (chars[i] && out[i] !== '\n' && out[i] !== '\r') out[i] = ' '
  }
  return out.join('')
}

function tagSearchText(text: string): string {
  const chars = new Uint8Array(text.length)
  protectFences(text, chars)
  protectInlineCode(text, chars)
  protectPatterns(text, chars, PROTECT_COMMENT_PATTERNS)
  protectComments(text, chars)
  protectReferenceLinkDefinitions(text, chars)
  protectBracketStructures(text, chars)
  protectPatterns(text, chars, PROTECT_URL_PATTERNS)
  return blankProtectedChars(text, chars)
}

function bodyTagOccurrences(content: string): BodyTagOccurrence[] {
  const safe = tagSearchText(content)
  const occurrences: BodyTagOccurrence[] = []
  for (const match of safe.matchAll(TAG_RE)) {
    const raw = match[2]!
    const name = raw.replace(/[.,\uff0c\u3002;\uff1b:\uff1a!\uff01?\uff1f\u3001·/]+$/u, '')
    if (!name || /^\d+$/.test(name) || name.length > 60) continue
    const hashStart = match.index! + match[1]!.length
    const nameStart = hashStart + 1
    occurrences.push({ name, hashStart, nameStart, nameEnd: nameStart + name.length })
  }
  return occurrences
}

export function compareTagNames(a: string, b: string): number {
  return TAG_COLLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
}

export function sortTagNames(tags: Iterable<string>): string[] {
  return [...tags].sort(compareTagNames)
}

export function extractTags(content: string): string[] {
  const frontMatter = parseFrontMatter(content)
  const out = new Map<string, string>()
  const add = (value: string) => {
    const key = value.normalize('NFKC').toLocaleLowerCase()
    if (!out.has(key)) out.set(key, value)
  }
  for (const tag of frontMatterTags(frontMatter.data)) {
    const normalized = tag.replace(/^#/, '').trim()
    if (normalized && normalized.length <= 60 && !/^\d+$/.test(normalized)) add(normalized)
    if (out.size >= 64) return sortTagNames(out.values())
  }
  for (const occurrence of bodyTagOccurrences(frontMatter.body)) {
    add(occurrence.name)
    if (out.size >= 64) break
  }
  return sortTagNames(out.values())
}

export function frontMatterTags(data: Record<string, unknown>): string[] {
  const value = data.tags ?? data.tag
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value !== 'string') return []
  return value
    .replace(/^\[|\]$/g, '')
    .split(/[,\s]+/)
    .filter(Boolean)
}

export function replaceTagInContent(content: string, from: string, to: string | null): string {
  const frontMatter = parseFrontMatter(content)
  const hasFrontMatter = frontMatter.lineOffset > 0
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const header = hasFrontMatter ? lines.slice(0, frontMatter.lineOffset) : []
  const body = hasFrontMatter ? lines.slice(frontMatter.lineOffset).join('\n') : normalized
  const rewrittenFrontMatter = hasFrontMatter && frontMatter.errors.length === 0
    ? replaceTagInFrontMatter(header, frontMatter.raw, from, to)
    : header
  const rewrittenBody = replaceInlineTag(body, from, to)
  return [...rewrittenFrontMatter, rewrittenBody].join('\n')
}

function replaceInlineTag(content: string, from: string, to: string | null): string {
  const matches = bodyTagOccurrences(content).filter((occurrence) => occurrence.name === from)
  let rewritten = content
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!
    if (to) {
      rewritten = rewritten.slice(0, match.nameStart) + to + rewritten.slice(match.nameEnd)
    } else {
      rewritten = rewritten.slice(0, match.hashStart) + rewritten.slice(match.nameEnd)
    }
  }
  return rewritten
}

function replaceTagInFrontMatter(
  header: string[],
  raw: string,
  from: string,
  to: string | null,
): string[] {
  const document = parseDocument(raw, { prettyErrors: false, uniqueKeys: true })
  if (document.errors.length) return header
  const data = document.toJS({ maxAliasCount: 20 }) as unknown
  if (!isPlainRecord(data)) return header
  const key = Object.prototype.hasOwnProperty.call(data, 'tags')
    ? 'tags'
    : Object.prototype.hasOwnProperty.call(data, 'tag') ? 'tag' : null
  if (!key) return header
  const value = data[key]
  const rewrite = (tag: string) => {
    const hash = tag.trim().startsWith('#') ? '#' : ''
    const name = tag.trim().replace(/^#/, '')
    if (name !== from) return tag
    return to ? `${hash}${to}` : null
  }
  let next: string[] | string | null = null
  if (Array.isArray(value)) {
    const values = value
      .filter((item): item is string => typeof item === 'string')
      .map(rewrite)
      .filter((item): item is string => item !== null)
    if (values.length === value.length && values.every((item, index) => item === value[index])) return header
    next = values.length ? values : null
  } else if (typeof value === 'string') {
    const separator = value.includes(',') ? ', ' : ' '
    const values = frontMatterTags({ [key]: value })
      .map(rewrite)
      .filter((item): item is string => item !== null)
    const joined = values.join(separator)
    if (joined === value) return header
    next = joined || null
  } else {
    return header
  }
  if (next === null) document.delete(key)
  else document.set(key, next)
  const closing = header.at(-1) ?? '---'
  const serialized = document.toString().replace(/\n$/, '')
  return [header[0] ?? '---', ...(serialized ? serialized.split('\n') : []), closing]
}
