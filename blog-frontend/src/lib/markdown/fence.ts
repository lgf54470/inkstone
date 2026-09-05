import type { FenceInfo } from './types.ts'

export function parseFenceInfo(source: string): FenceInfo {
  let rest = source.trim()
  let language = ''
  let title = ''
  let lineNumbers = false
  let startLine = 1
  const highlighted = new Set<number>()

  const leadingCodeOptions = /^\{([^\{}]+)\}/.exec(rest)
  if (leadingCodeOptions && !/^\d[\d,\s-]*$/.test(leadingCodeOptions[1]!.trim())) {
    const classes = [...leadingCodeOptions[1]!.matchAll(/(?:^|\s)\.([A-Za-z][\w-]{0,63})/g)].map((m) => m[1]!)
    language = classes.find((c) => !isReservedCodeClass(c))?.toLowerCase() ?? ''
    lineNumbers = classes.some(isReservedCodeClass)
    const titleMatch = /title=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(leadingCodeOptions[1]!)
    if (titleMatch) title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? ''
    rest = rest.slice(leadingCodeOptions[0].length).trim()
  }

  if (!language) {
    const langMatch = /^([^\s{]+)/.exec(rest)
    if (langMatch) {
      language = langMatch[1]!.toLowerCase()
      rest = rest.slice(langMatch[0].length).trim()
    }
  }

  const titleMatch = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest)
  if (titleMatch) title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? ''
  const bracketTitle = /(?:^|\s)\[([^\]\n]+)\]/.exec(rest)
  if (!title && bracketTitle) title = bracketTitle[1]!.trim()

  const hasLineNumbersDisable = /(?:^|[\s{])\\.?(?:line-?numbers|linenos|number-?lines|show-?line-?numbers)=(?:"?false"?|0)(?=[\s}]|$)/i.test(rest)
  const hasLineNumbersEnable = /(?:^|[\s{])\\.?(?:line-?numbers|linenos|number-?lines|show-?line-?numbers)(?:=(?:"?true"?|1))?(?=[\s}]|$)/i.test(rest)
  if (hasLineNumbersDisable) {
    lineNumbers = false
  } else if (hasLineNumbersEnable) {
    lineNumbers = true
  }
  const start = /(?:^|\s)(?:start|startFrom)=(?:"(\d+)"|'(\d+)'|(\d+))/.exec(rest)
  if (start) startLine = Math.max(1, Number(start[1] ?? start[2] ?? start[3]))

  for (const hlMatch of rest.matchAll(/(?:^|\s)\{(\d[\d,\s-]*)\}/g)) {
    parseLineNumbers(hlMatch[1]!).forEach((n) => highlighted.add(n))
  }

  return {
    language,
    title,
    lineNumbers,
    startLine,
    highlightedLines: [...highlighted].sort((a, b) => a - b),
  }
}

function isReservedCodeClass(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[-_]/g, '')
  return ['numberlines', 'linenumbers', 'linenos', 'showlinenumbers'].includes(normalized)
}

function parseLineNumbers(spec: string): number[] {
  const result: number[] = []
  const parts = spec.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (/^\d+$/.test(trimmed)) {
      result.push(Number(trimmed))
    } else if (/^(\d+)\s*-\s*(\d+)$/.test(trimmed)) {
      const match = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed)!
      const start = Number(match[1])
      const end = Number(match[2])
      for (let i = start; i <= end; i++) result.push(i)
    }
  }
  return result
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