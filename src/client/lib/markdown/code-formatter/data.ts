import { parseDocument } from 'yaml'

function tryParseJson(text: string, tabSize: number): string | null {
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, null, tabSize)
  } catch {
    return null
  }
}

export function formatJson(code: string, tabSize: number): string {
  const trimmed = code.trim()
  const direct = tryParseJson(trimmed, tabSize)
  if (direct) return direct

  const sanitized = trimmed.replace(/\/\/[^\r\n]*/g, '').replace(/,(\s*[}\]])/g, '$1')
  return tryParseJson(sanitized, tabSize) ?? code
}

export function formatYaml(code: string, tabSize: number): string {
  const trimmed = code.trim()
  try {
    const doc = parseDocument(trimmed)
    if (doc.errors.length === 0) {
      return doc.toString({ indent: tabSize }).trim()
    }
    return code
  } catch {
    return code
  }
}

export function formatToml(code: string): string {
  const lines = code.split(/\r?\n/)
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    if (trimmed.startsWith('#')) {
      result.push(trimmed)
      continue
    }

    if (trimmed.startsWith('[')) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      result.push(trimmed)
      continue
    }

    const eqIndex = findFirstTopLevelEquals(trimmed)
    if (eqIndex !== -1) {
      const key = trimmed.slice(0, eqIndex).trim()
      const val = trimmed.slice(eqIndex + 1).trim()
      result.push(`${key} = ${val}`)
      continue
    }

    result.push(trimmed)
  }

  return result.join('\n')
}

function findFirstTopLevelEquals(line: string): number {
  let inString: string | null = null
  let isEscaped = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (isEscaped) {
      isEscaped = false
      continue
    }
    if (ch === '\\') {
      isEscaped = true
      continue
    }
    if (inString && ch === inString) {
      inString = null
      continue
    }
    if (!inString && (ch === '"' || ch === '\'')) {
      inString = ch
      continue
    }
    if (!inString && ch === '=') return i
  }

  return -1
}
