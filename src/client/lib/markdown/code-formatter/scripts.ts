const DOCKER_INSTRUCTIONS = new Set([
  'FROM',
  'RUN',
  'CMD',
  'LABEL',
  'EXPOSE',
  'ENV',
  'ADD',
  'COPY',
  'ENTRYPOINT',
  'VOLUME',
  'USER',
  'WORKDIR',
  'ARG',
  'ONBUILD',
  'STOPSIGNAL',
  'HEALTHCHECK',
  'SHELL',
])

export function formatDockerfile(code: string): string {
  const lines = code.split(/\r?\n/)
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      result.push(trimmed)
      continue
    }

    const match = /^([a-zA-Z]+)(\s+.*)?$/.exec(trimmed)
    if (match) {
      const instr = match[1]!.toUpperCase()
      if (DOCKER_INSTRUCTIONS.has(instr)) {
        result.push(instr + (match[2] ? ' ' + match[2].trim() : ''))
        continue
      }
    }
    result.push(trimmed)
  }

  return result.join('\n')
}

function stripShellStringsAndComments(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\r\n]*/g, '')
}

export function formatShell(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const lines = code.split(/\r?\n/)
  const result: string[] = []
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const clean = stripShellStringsAndComments(trimmed).trim()
    const isDedent = /^(elif\b|else\b|fi\b|done\b|esac\b|\})/.test(clean)
    const currentIndent = isDedent ? Math.max(0, depth - 1) : depth

    result.push(`${indentStr.repeat(currentIndent)}${trimmed}`)

    const opensBlock = /(?:^|[;&)]\s*)(then|do)$/.test(clean) || /\{\s*$/.test(clean) || /\bcase\b.+\bin\s*$/.test(clean)
    const closesBlock = /^(fi\b|done\b|esac\b|\})/.test(clean)

    if (opensBlock && !closesBlock) depth++
    else if (!opensBlock && closesBlock) depth = Math.max(0, depth - 1)
  }

  return result.join('\n')
}

export function formatLua(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const lines = code.split(/\r?\n/)
  const result: string[] = []
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const clean = trimmed.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|--[^\r\n]*/g, '').trim()
    const isDedent = /^(end\b|until\b|else\b|elseif\b|\})/.test(clean)
    const currentIndent = isDedent ? Math.max(0, depth - 1) : depth

    result.push(`${indentStr.repeat(currentIndent)}${trimmed}`)

    const opens = /^(function\b|if\b|while\b|for\b|repeat\b)/.test(clean) || /\{\s*$/.test(clean)
    const closes = /^(end\b|until\b|\})/.test(clean)

    if (opens && !closes) depth++
    else if (!opens && closes) depth = Math.max(0, depth - 1)
  }

  return result.join('\n')
}

export function formatRuby(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const lines = code.split(/\r?\n/)
  const result: string[] = []
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const clean = trimmed.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\r\n]*/g, '').trim()
    const isDedent = /^(end\b|else\b|elsif\b|when\b|rescue\b|ensure\b|\})/.test(clean)
    const currentIndent = isDedent ? Math.max(0, depth - 1) : depth

    result.push(`${indentStr.repeat(currentIndent)}${trimmed}`)

    const opens = /^(def\b|class\b|module\b|if\b|unless\b|while\b|until\b|for\b|begin\b|case\b)/.test(clean) || /\bdo\s*(\|\w+\|)?$/.test(clean)
    const closes = /^end\b/.test(clean)

    if (opens && !closes) depth++
    else if (!opens && closes) depth = Math.max(0, depth - 1)
  }

  return result.join('\n')
}

export function formatNginx(code: string, tabSize: number): string {
  const indentStr = ' '.repeat(tabSize)
  const lines = code.split(/\r?\n/)
  const result: string[] = []
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }

    const startsWithClose = trimmed.startsWith('}')
    const currentIndent = startsWithClose ? Math.max(0, depth - 1) : depth

    result.push(`${indentStr.repeat(currentIndent)}${trimmed}`)

    if (trimmed.includes('{')) depth++
    if (trimmed.includes('}')) depth = Math.max(0, depth - 1)
  }

  return result.join('\n')
}
