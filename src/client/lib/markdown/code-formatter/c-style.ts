interface LineToken {
  type: 'code' | 'string' | 'comment'
  text: string
}

interface ScanState {
  inBlockComment: boolean
  inTemplateLiteral: boolean
}

function scanStringToken(line: string, start: number, quote: string): { token: LineToken; nextIndex: number; closed: boolean } {
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
        closed: true,
      }
    }
    i++
  }
  return {
    token: { type: 'string', text: line.slice(start) },
    nextIndex: line.length,
    closed: false,
  }
}

function scanCommentToken(line: string, start: number): { token: LineToken; nextIndex: number; closed: boolean } {
  if (line[start + 1] === '/') {
    return {
      token: { type: 'comment', text: line.slice(start) },
      nextIndex: line.length,
      closed: true,
    }
  }
  const endIdx = line.indexOf('*/', start + 2)
  if (endIdx !== -1) {
    return {
      token: { type: 'comment', text: line.slice(start, endIdx + 2) },
      nextIndex: endIdx + 2,
      closed: true,
    }
  }
  return {
    token: { type: 'comment', text: line.slice(start) },
    nextIndex: line.length,
    closed: false,
  }
}

function resumeMultiLineState(line: string, state: ScanState): { tokens: LineToken[]; startIndex: number; stillActive: boolean } {
  if (state.inBlockComment) {
    const endIdx = line.indexOf('*/')
    if (endIdx === -1) {
      return { tokens: [{ type: 'comment', text: line }], startIndex: line.length, stillActive: true }
    }
    state.inBlockComment = false
    return { tokens: [{ type: 'comment', text: line.slice(0, endIdx + 2) }], startIndex: endIdx + 2, stillActive: false }
  }

  if (state.inTemplateLiteral) {
    const endScan = scanStringToken(line, -1, '`')
    if (!endScan.closed) {
      return { tokens: [{ type: 'string', text: line }], startIndex: line.length, stillActive: true }
    }
    state.inTemplateLiteral = false
    return { tokens: [{ type: 'string', text: line.slice(0, endScan.nextIndex) }], startIndex: endScan.nextIndex, stillActive: false }
  }

  return { tokens: [], startIndex: 0, stillActive: false }
}

function scanSpecialToken(
  line: string,
  i: number,
  ch: string,
  next: string | undefined,
): { token: LineToken; nextIndex: number; blockComment: boolean; template: boolean } | null {
  if (ch === '/' && (next === '/' || next === '*')) {
    const scan = scanCommentToken(line, i)
    return { token: scan.token, nextIndex: scan.nextIndex, blockComment: !scan.closed, template: false }
  }
  if (ch === '\'' || ch === '"' || ch === '`') {
    const scan = scanStringToken(line, i, ch)
    return { token: scan.token, nextIndex: scan.nextIndex, blockComment: false, template: !scan.closed && ch === '`' }
  }
  return null
}

function tokenizeLineWithState(
  line: string,
  state: ScanState,
): { tokens: LineToken[]; nextBlockComment: boolean; nextTemplate: boolean } {
  const resumed = resumeMultiLineState(line, state)
  if (resumed.stillActive) {
    return { tokens: resumed.tokens, nextBlockComment: state.inBlockComment, nextTemplate: state.inTemplateLiteral }
  }

  const tokens = [...resumed.tokens]
  let i = resumed.startIndex
  let codeBuffer = ''
  let nextBlock = false
  let nextTpl = false

  while (i < line.length) {
    const special = scanSpecialToken(line, i, line[i]!, line[i + 1])
    if (special) {
      if (codeBuffer) tokens.push({ type: 'code', text: codeBuffer })
      codeBuffer = ''
      tokens.push(special.token)
      if (special.blockComment) nextBlock = true
      if (special.template) nextTpl = true
      i = special.nextIndex
      continue
    }

    codeBuffer += line[i]!
    i++
  }

  if (codeBuffer) tokens.push({ type: 'code', text: codeBuffer })
  return { tokens, nextBlockComment: nextBlock, nextTemplate: nextTpl }
}

function spaceOperatorsInCode(code: string): string {
  let s = code
  s = s.replace(/([a-zA-Z0-9_$\])])\s*(===|!==|==|!=|<=|>=|=>|\+=|-=|\*=|\/=|%=|&&|\|\|)\s*([a-zA-Z0-9_$'"`([{])/g, '$1 $2 $3')
  s = s.replace(/([a-zA-Z0-9_$\])])\s*=\s*([a-zA-Z0-9_$'"`([{])/g, (match, p1, p2, offset) => {
    const before = s.slice(Math.max(0, offset - 1), offset)
    const after = s.slice(offset + match.length, offset + match.length + 1)
    if (/[<>=!+\-*/%]/.test(before) || after === '=') return match
    return `${p1} = ${p2}`
  })
  s = s.replace(/,\s*/g, ', ')
  s = s.replace(/;\s*([^\s;])/g, '; $1')
  s = s.replace(/([a-zA-Z0-9_$])\s*:\s*([a-zA-Z0-9_$'"`([{])/g, (match, p1, p2, offset) => {
    const prevChar = s[offset - 1]
    const nextChar = s[offset + match.length]
    if (prevChar === ':' || nextChar === ':') return match
    const linePrefix = s.slice(0, offset)
    if (linePrefix.includes('?')) return `${p1} : ${p2}`
    return `${p1}: ${p2}`
  })
  s = s.replace(/\s+/g, ' ')
  return s
}

function canSplitAtBoundary(line: string, i: number, current: string): boolean {
  const rest = line.slice(i).trimStart()
  const boundary = /^(return\b|throw\b|[a-zA-Z_$][a-zA-Z0-9_$]*\s*(?:\+=|-=|\*=|\/=|=)\s*)/.exec(rest)
  if (!boundary || !current.trim()) return false

  const curTrim = current.trim()
  const last = curTrim.slice(-1)
  const isEnded = /^[0-9'"`\])]/.test(last) || curTrim.endsWith('true') || curTrim.endsWith('false')
  return isEnded && !/^(if|while|for|switch)\b/.test(curTrim)
}

function isDeclarationLine(trimmed: string): boolean {
  if (!/^(const|let|var|export|import)\b/.test(trimmed)) return false
  if (trimmed.includes(';')) return false
  return !/^(const|let|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=.*?(?:\s+(?:return|throw)\s+.*)$/.test(trimmed)
}

function scanCharInStatementSplit(
  ch: string,
  nextCh: string | undefined,
  inStr: string | null,
): { inStr: string | null; append: string; advance: number } {
  if (inStr) {
    if (ch === '\\') return { inStr, append: ch + (nextCh ?? ''), advance: 1 }
    return { inStr: ch === inStr ? null : inStr, append: ch, advance: 0 }
  }
  if (ch === '\'' || ch === '"' || ch === '`') return { inStr: ch, append: ch, advance: 0 }
  return { inStr: null, append: ch, advance: 0 }
}

function splitCorruptedStatementsInLine(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed || /^(if|while|for|switch|catch)\b/.test(trimmed) || isDeclarationLine(trimmed)) {
    return [trimmed || '']
  }

  const parts: string[] = []
  let current = ''
  let depth = 0
  let inStr: string | null = null

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    const scanned = scanCharInStatementSplit(ch, line[i + 1], inStr)
    inStr = scanned.inStr
    current += scanned.append
    i += scanned.advance
    if (inStr || scanned.advance > 0) continue

    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1)

    if (ch === ';' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }

    if (depth === 0 && /\s/.test(ch) && canSplitAtBoundary(line, i, current)) {
      parts.push(current.trim())
      current = ''
      i += line.slice(i).length - line.slice(i).trimStart().length - 1
    }
  }

  if (current.trim()) parts.push(current)
  return parts.length > 0 ? parts : [line]
}

function countBracesInText(text: string): { open: number; close: number } {
  let open = 0
  let close = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '{' || ch === '[' || ch === '(') open++
    else if (ch === '}' || ch === ']' || ch === ')') close++
  }
  return { open, close }
}

function countStructuralBraces(tokens: LineToken[]): { open: number; close: number } {
  let open = 0
  let close = 0
  for (const token of tokens) {
    if (token.type !== 'code') continue
    const counts = countBracesInText(token.text)
    open += counts.open
    close += counts.close
  }
  return { open, close }
}

function formatSingleLine(tokens: LineToken[]): string {
  const parts: string[] = []
  for (const token of tokens) {
    if (token.type === 'code') parts.push(spaceOperatorsInCode(token.text))
    else parts.push(token.text)
  }
  return parts.join('').trim()
}

export function formatCStyle(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const rawLines = code.split(/\r?\n/)
  const linesToFormat: string[] = []

  for (const raw of rawLines) {
    for (const s of splitCorruptedStatementsInLine(raw)) linesToFormat.push(s)
  }

  const result: string[] = []
  let depth = 0
  const state: ScanState = { inBlockComment: false, inTemplateLiteral: false }

  for (const line of linesToFormat) {
    const isMultiLineContent = state.inBlockComment || state.inTemplateLiteral
    const { tokens, nextBlockComment, nextTemplate } = tokenizeLineWithState(line, state)
    state.inBlockComment = nextBlockComment
    state.inTemplateLiteral = nextTemplate

    if (isMultiLineContent && state.inTemplateLiteral) {
      result.push(line)
      continue
    }

    const formatted = formatSingleLine(tokens)
    if (!formatted) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const counts = countStructuralBraces(tokens)
    const startsClose = /^[}\])]|^(else\b|catch\b|finally\b)/.test(formatted)
    const lineIndent = startsClose ? Math.max(0, depth - 1) : depth

    result.push(`${indentStr.repeat(lineIndent)}${formatted}`)
    depth = Math.max(0, depth + counts.open - counts.close)
  }

  return result.join('\n')
}
