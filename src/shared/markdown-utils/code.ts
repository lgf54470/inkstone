export function stripCodeRegions(text: string): string {
  const lines = text.split('\n')
  let isInFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const m = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)
    if (m) {
      const marker = m[1]!
      const ch = marker[0]!
      if (!isInFence) {
        isInFence = true
        fenceChar = ch
        fenceLen = marker.length
        lines[i] = ''
        continue
      }
      if (ch === fenceChar && marker.length >= fenceLen) {
        isInFence = false
        lines[i] = ''
        continue
      }
    }
    if (isInFence) {
      lines[i] = ''
      continue
    }
    lines[i] = line.replace(/`+[^`\n]*`+/g, (s) => ' '.repeat(s.length))
  }
  return stripObsidianCommentRegions(lines.join('\n'))
}

function stripObsidianCommentRegions(text: string): string {
  const chars = text.split('')
  let start = -1
  for (let index = 0; index < text.length - 1; index++) {
    if (!text.startsWith('%%', index) || isEscaped(text, index)) continue
    if (start < 0) start = index
    else {
      for (let cursor = start; cursor <= index + 1; cursor++) {
        if (chars[cursor] !== '\n' && chars[cursor] !== '\r') chars[cursor] = ' '
      }
      start = -1
    }
    index++
  }
  if (start >= 0) {
    for (let cursor = start; cursor < chars.length; cursor++) {
      if (chars[cursor] !== '\n' && chars[cursor] !== '\r') chars[cursor] = ' '
    }
  }
  return chars.join('')
}

export function isEscaped(text: string, index: number): boolean {
  let slashes = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++
  return slashes % 2 === 1
}
