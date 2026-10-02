function maskStyleLiterals(line: string): { masked: string; placeholders: string[] } {
  const placeholders: string[] = []
  const masked = line.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\*[\s\S]*?\*\/|url\([^)]+\))/g, (match) => {
    placeholders.push(match)
    return `___STYLE_PH_${placeholders.length - 1}___`
  })
  return { masked, placeholders }
}

function restoreStyleLiterals(line: string, placeholders: string[]): string {
  let result = line
  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`___STYLE_PH_${i}___`, placeholders[i]!)
  }
  return result
}

function countStyleBraceDiff(line: string): number {
  let diff = 0
  for (let c = 0; c < line.length; c++) {
    if (line[c] === '{') diff++
    else if (line[c] === '}') diff--
  }
  return diff
}

export function formatStyles(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const rawLines = code.split(/\r?\n/)
  const result: string[] = []
  let depth = 0

  for (let i = 0; i < rawLines.length; i++) {
    const rawTrimmed = rawLines[i]!.trim()
    if (!rawTrimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const { masked, placeholders } = maskStyleLiterals(rawTrimmed)
    let processed = masked

    if (processed.includes(':') && !processed.startsWith('@') && !processed.includes('{')) {
      processed = processed.replace(/:\s*/, ': ')
    }
    processed = processed.replace(/\)\s*\{/, ') {').replace(/([^\s])\{/, '$1 {')

    const startsWithClose = processed.startsWith('}')
    const currentIndent = startsWithClose ? Math.max(0, depth - 1) : depth

    const restored = restoreStyleLiterals(processed, placeholders)
    result.push(`${indentStr.repeat(currentIndent)}${restored}`)
    depth = Math.max(0, depth + countStyleBraceDiff(processed))
  }

  return result.join('\n')
}
