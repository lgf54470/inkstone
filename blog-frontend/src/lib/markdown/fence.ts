import { infoFlag, infoOption, infoTokens } from './info-string.ts'
import type { CodeTheme, FenceInfo } from './types.ts'

const COLLAPSE_LIMIT = 100000

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function codeTheme(value: string): CodeTheme | null {
  const normalized = value.toLowerCase().replace(/^["']|["']$/g, '').trim()
  return normalized === 'light' || normalized === 'dark' || normalized === 'auto' ? normalized : null
}

/** The fold threshold a `collapse=` value asks for: null when it is not a number at all. */
function parseCollapseValue(value: string): number | null {
  return /^\d{1,6}$/.test(value.trim()) ? clamp(Number(value.trim()), 0, COLLAPSE_LIMIT) : null
}

function parseLineNumbers(spec: string): number[] {
  const result: number[] = []
  for (const part of spec.split(/[ ,]+/).filter(Boolean).slice(0, 200)) {
    if (/^\d+$/.test(part)) {
      result.push(clamp(Number(part), 1, 100000))
      continue
    }
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part)
    if (range) {
      const from = clamp(Number(range[1]), 1, 100000)
      const to = clamp(Number(range[2]), from, Math.min(100000, from + 1000))
      for (let line = from; line <= to; line++) result.push(line)
    }
  }
  return result
}

/** Reads wrap / collapse / theme tokens out of the trailing info string. */
function readCodeFlags(rest: string): Pick<FenceInfo, 'wrap' | 'collapse' | 'theme'> {
  let wrap = false
  let collapse: number | null = null
  let theme: CodeTheme = 'auto'
  for (const token of infoTokens(rest)) {
    const option = infoOption(token)
    const flag = infoFlag(token)
    if (flag === 'wrap') wrap = true
    else if (flag === 'nowrap') wrap = false
    else if (option?.key === 'collapse') {
      const value = parseCollapseValue(option.value)
      if (value !== null) collapse = value
    }
    else if (option?.key === 'theme') {
      const next = codeTheme(option.value)
      if (next) theme = next
    }
  }
  return { wrap, collapse, theme }
}

export function parseFenceInfo(source: string): FenceInfo {
  let rest = source.trim()
  let language = ''
  let title = ''
  let lineNumbers = false
  let startLine = 1
  const highlighted = new Set<number>()

  const leading = parseLeadingCodeOptions(rest)
  if (leading) {
    language = leading.language
    lineNumbers = leading.lineNumbers
    title = leading.title
    if (leading.startLine !== null) startLine = leading.startLine
    leading.highlighted.forEach((n) => highlighted.add(n))
    rest = leading.rest
  }

  if (!language) {
    const lang = parseLeadingLanguage(rest)
    language = lang.language
    rest = lang.rest
  }

  const { wrap, collapse, theme } = readCodeFlags(rest)
  const trailing = parseTrailingDisplayOptions(rest, highlighted)
  if (trailing.title) title = trailing.title
  if (trailing.lineNumbers === true) lineNumbers = true
  else if (trailing.lineNumbers === false) lineNumbers = false
  if (trailing.startLine !== null) startLine = trailing.startLine

  return {
    language,
    title,
    lineNumbers,
    startLine,
    highlightedLines: [...highlighted].sort((a, b) => a - b),
    wrap,
    collapse,
    theme,
  }
}

interface TrailingDisplayOptions {
  title: string
  lineNumbers: boolean | null
  startLine: number | null
}

/** Reads title, line-number flags, start line and highlighted lines from the trailing info string. */
function parseTrailingDisplayOptions(rest: string, highlighted: Set<number>): TrailingDisplayOptions {
  let title = ''
  const titleMatch = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest)
  if (titleMatch) title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? ''
  const bracketTitle = /(?:^|\s)\[([^\]\n]+)\]/.exec(rest)
  if (!title && bracketTitle) title = bracketTitle[1]!.trim()

  const disable = /(?:^|[\s{])\.?(?:line-?numbers|linenos|number-?lines|show-?line-?numbers)=(?:"?false"?|0)(?=[\s}]|$)/i.test(rest)
  const enable = /(?:^|[\s{])\.?(?:line-?numbers|linenos|number-?lines|show-?line-?numbers)(?:=(?:"?true"?|1))?(?=[\s}]|$)/i.test(rest)
  const lineNumbers = disable ? false : enable ? true : null
  const start = /(?:^|\s)(?:start|startFrom)=(?:"(\d+)"|'(\d+)'|(\d+))/.exec(rest)
  const startLine = start ? Math.max(1, Number(start[1] ?? start[2] ?? start[3])) : null

  for (const hlMatch of rest.matchAll(/(?:^|\s)\{(\d[\d,\s-]*)\}/g)) {
    parseLineNumbers(hlMatch[1]!).forEach((n) => highlighted.add(n))
  }
  // Named highlight specs (Pandoc-style hl_lines / highlight), same spellings the root app reads.
  const namedHl = /(?:^|\s)(?:hl_lines|highlight)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest)
  if (namedHl) {
    parseLineNumbers(namedHl[1] ?? namedHl[2] ?? namedHl[3] ?? '').forEach((n) => highlighted.add(n))
  }
  return { title, lineNumbers, startLine }
}

function parseLeadingCodeOptions(rest: string): {
  language: string
  lineNumbers: boolean
  title: string
  startLine: number | null
  highlighted: number[]
  rest: string
} | null {
  const leadingCodeOptions = /^\{([^\{}]+)\}/.exec(rest)
  if (!leadingCodeOptions || /^\d[\d,\s-]*$/.test(leadingCodeOptions[1]!.trim())) return null
  const inner = leadingCodeOptions[1]!
  const classes = [...inner.matchAll(/(?:^|\s)\.([A-Za-z][\w-]{0,63})/g)].map((m) => m[1]!)
  const readNamed = (...names: string[]): string | null => {
    const wanted = new Set(names.map((name) => name.toLowerCase()))
    const pattern = /(?:^|\s)([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g
    for (const match of inner.matchAll(pattern)) {
      if (wanted.has(match[1]!.toLowerCase())) return match[2] ?? match[3] ?? match[4] ?? ''
    }
    return null
  }
  const title = readNamed('title') ?? ''
  const startRaw = readNamed('start', 'startfrom')
  const hlRaw = readNamed('hl_lines', 'highlight')
  return {
    language: classes.find((c) => !isReservedCodeClass(c))?.toLowerCase() ?? '',
    lineNumbers: classes.some(isReservedCodeClass),
    title,
    startLine: startRaw !== null && /^\d+$/.test(startRaw) ? clamp(Number(startRaw), 1, 100000) : null,
    highlighted: hlRaw !== null ? parseLineNumbers(hlRaw) : [],
    rest: rest.slice(leadingCodeOptions[0].length).trim(),
  }
}

function parseLeadingLanguage(rest: string): { language: string; rest: string } {
  const langMatch = /^([^\s{]+)/.exec(rest)
  if (!langMatch) return { language: '', rest }
  return {
    language: langMatch[1]!.toLowerCase(),
    rest: rest.slice(langMatch[0].length).trim(),
  }
}

function isReservedCodeClass(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[-_]/g, '')
  return ['numberlines', 'linenumbers', 'linenos', 'showlinenumbers'].includes(normalized)
}

export function splitHtmlIntoLines(html: string, startLine: number, highlightedLines: number[]): string {
  const lines = html.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const highlightSet = new Set(highlightedLines)
  const openTags: string[] = []

  return lines
    .map((rawLine, idx) => {
      const lineNum = startLine + idx
      const isHl = highlightSet.has(idx + 1)
      let lineContent = openTags.join('') + rawLine
      const tagRegex = /<\/?([a-zA-Z0-9-]+)(?:\s+[^>]*?)?>/g
      let match: RegExpExecArray | null
      while ((match = tagRegex.exec(rawLine)) !== null) {
        const fullTag = match[0]
        if (fullTag.startsWith('</')) {
          openTags.pop()
        } else if (!fullTag.endsWith('/>')) {
          openTags.push(fullTag)
        }
      }
      for (let i = openTags.length - 1; i >= 0; i--) {
        const tagNameMatch = /^<([a-zA-Z0-9-]+)/.exec(openTags[i]!)
        if (tagNameMatch) lineContent += `</${tagNameMatch[1]}>`
      }
      const display = lineContent || ' '
      return `<span class="line${isHl ? ' highlighted' : ''}" data-line-number="${lineNum}">${display}</span>`
    })
    .join('\n')
}
