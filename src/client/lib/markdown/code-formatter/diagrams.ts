const MERMAID_DIAGRAM_HEADERS = new Set([
  'graph',
  'flowchart',
  'sequencediagram',
  'classdiagram',
  'statediagram',
  'erdiagram',
  'gantt',
  'pie',
  'gitgraph',
  'mindmap',
  'timeline',
  'quadrantchart',
  'xychart',
])

function isMermaidHeader(line: string): boolean {
  const firstWord = (line.split(/\s+/)[0] || '').toLowerCase()
  return MERMAID_DIAGRAM_HEADERS.has(firstWord)
}

export function formatMermaid(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const lines = code.split(/\r?\n/)
  const result: string[] = []
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('')
      }
      continue
    }

    if (isMermaidHeader(trimmed)) {
      result.push(trimmed)
      depth = 1
      continue
    }

    const isClose = /^(\}|end\b)/.test(trimmed)
    const currentIndent = isClose ? Math.max(0, depth - 1) : depth

    result.push(`${indentStr.repeat(currentIndent)}${trimmed}`)

    if (/\b(subgraph)\b/.test(trimmed) || /\{\s*$/.test(trimmed)) {
      depth++
    }
    if (/^(\}|end\b)/.test(trimmed)) {
      depth = Math.max(0, depth - 1)
    }
  }

  return result.join('\n')
}

export function formatDiff(code: string): string {
  const lines = code.split(/\r?\n/)
  return lines.map((l) => l.trimEnd()).join('\n')
}

export function formatMarkdown(code: string): string {
  const lines = code.split(/\r?\n/)
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const endsWithHardBreak = raw.endsWith('  ')
    const trimmed = raw.trim()

    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('')
      }
      continue
    }

    result.push(endsWithHardBreak ? `${raw.trimEnd()}  ` : raw.trimEnd())
  }

  return result.join('\n')
}

export function formatGeneric(code: string): string {
  const lines = code.split(/\r?\n/).map((l) => l.trimEnd())
  const output: string[] = []
  for (const line of lines) {
    if (!line.trim()) {
      if (output.length > 0 && output[output.length - 1] !== '') {
        output.push('')
      }
    } else {
      output.push(line)
    }
  }
  return output.join('\n')
}
