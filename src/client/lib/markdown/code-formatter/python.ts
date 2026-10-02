interface PyLineToken {
  type: 'code' | 'string' | 'comment'
  text: string
}

function hasAnyIndent(lines: string[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.search(/\S/) > 0) return true
  }
  return false
}

function detectBaseIndent(lines: string[]): number {
  let min = 0
  for (const line of lines) {
    const indent = line.search(/\S/)
    if (indent > 0) {
      if (min === 0 || indent < min) min = indent
    }
  }
  return min > 0 ? min : 4
}

function scanPyString(line: string, start: number, quote: string): { token: PyLineToken; nextIndex: number } {
  let i = start + 1
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2
      continue
    }
    if (line[i] === quote) {
      return {
        token: { type: 'string', text: line.slice(start, i + 1) },
        nextIndex: i + 1,
      }
    }
    i++
  }
  return {
    token: { type: 'string', text: line.slice(start) },
    nextIndex: line.length,
  }
}

function tokenizePyLine(line: string): PyLineToken[] {
  const tokens: PyLineToken[] = []
  let i = 0
  let codeBuffer = ''

  while (i < line.length) {
    const ch = line[i]!
    if (ch === '#') {
      if (codeBuffer) {
        tokens.push({ type: 'code', text: codeBuffer })
        codeBuffer = ''
      }
      tokens.push({ type: 'comment', text: line.slice(i) })
      break
    }

    if (ch === '\'' || ch === '"') {
      if (codeBuffer) {
        tokens.push({ type: 'code', text: codeBuffer })
        codeBuffer = ''
      }
      const scan = scanPyString(line, i, ch)
      tokens.push(scan.token)
      i = scan.nextIndex
      continue
    }

    codeBuffer += ch
    i++
  }

  if (codeBuffer) tokens.push({ type: 'code', text: codeBuffer })
  return tokens
}

function spacePyCode(code: string): string {
  let s = code
  s = s.replace(/([a-zA-Z0-9_$\])])\s*(==|!=|<=|>=|\+=|-=|\*=|\/\/=|\*\*=|%=|\/\/|\*\*)\s*([a-zA-Z0-9_$'"`([{])/g, '$1 $2 $3')
  s = s.replace(/([a-zA-Z0-9_$\])])\s*([<>])\s*([a-zA-Z0-9_$'"`([{])/g, '$1 $2 $3')
  s = s.replace(/([a-zA-Z0-9_$\])])\s*=\s*([a-zA-Z0-9_$'"`([{])/g, (match, p1, p2, offset) => {
    const before = s.slice(Math.max(0, offset - 1), offset)
    const after = s.slice(offset + match.length, offset + match.length + 1)
    if (/[<>=!+\-*/%]/.test(before) || after === '=') return match
    return `${p1} = ${p2}`
  })
  s = s.replace(/,\s*/g, ', ')
  s = s.replace(/([a-zA-Z0-9_$'"`])\s*:\s*([a-zA-Z0-9_$'"`([{])/g, '$1: $2')
  s = s.replace(/\s+/g, ' ')
  return s
}

function formatPyLineContent(line: string): string {
  const tokens = tokenizePyLine(line)
  const parts: string[] = []
  for (const token of tokens) {
    if (token.type === 'code') parts.push(spacePyCode(token.text))
    else parts.push(token.text)
  }
  return parts.join('').trim()
}

function handleDocstringLine(
  rawLine: string,
  inDoc: string | null,
): { isDoc: boolean; nextDoc: string | null; formatted: string } {
  const trimmed = rawLine.trim()
  if (inDoc) {
    const ends = trimmed.includes(inDoc)
    return { isDoc: true, nextDoc: ends ? null : inDoc, formatted: rawLine }
  }
  if (trimmed.startsWith('"""') || trimmed.startsWith('\'\'\'')) {
    const mark = trimmed.slice(0, 3)
    const closed = trimmed.length > 3 && trimmed.slice(3).includes(mark)
    return { isDoc: true, nextDoc: closed ? null : mark, formatted: rawLine }
  }
  return { isDoc: false, nextDoc: null, formatted: rawLine }
}

function formatWithExistingIndent(rawLines: string[], baseIndent: number, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const result: string[] = []
  let inDoc: string | null = null

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const docCheck = handleDocstringLine(rawLine, inDoc)
    inDoc = docCheck.nextDoc
    if (docCheck.isDoc) {
      result.push(docCheck.formatted)
      continue
    }

    const origSpaces = rawLine.search(/\S/)
    const level = origSpaces > 0 ? Math.max(1, Math.round(origSpaces / baseIndent)) : 0
    const formattedContent = formatPyLineContent(trimmed)
    result.push(`${indentStr.repeat(level)}${formattedContent}`)
  }
  return result.join('\n')
}

function formatFlatPython(rawLines: string[], tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const result: string[] = []
  let depth = 0
  const blockStack: number[] = []

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const isElse = /^(elif\b|else:|except\b|finally:)/.test(trimmed)
    const lineIndent = isElse && blockStack.length > 0 ? blockStack[blockStack.length - 1]! : depth
    const formattedContent = formatPyLineContent(trimmed)
    result.push(`${indentStr.repeat(lineIndent)}${formattedContent}`)

    const cleanCode = trimmed.replace(/#[^\r\n]*/, '').trim()
    if (cleanCode.endsWith(':')) {
      blockStack.push(lineIndent)
      depth = lineIndent + 1
      continue
    }

    if (/^(return\b|pass\b|break\b|raise\b)/.test(cleanCode) && blockStack.length > 0) {
      depth = blockStack[blockStack.length - 1]!
    }
  }
  return result.join('\n')
}

export function formatPython(code: string, tabSize: number): string {
  const rawLines = code.split(/\r?\n/)
  if (hasAnyIndent(rawLines)) {
    const base = detectBaseIndent(rawLines)
    return formatWithExistingIndent(rawLines, base, tabSize)
  }
  return formatFlatPython(rawLines, tabSize)
}
