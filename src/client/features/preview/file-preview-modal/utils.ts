export function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function parseCsvToRows(text: string, delimiter = ','): string[][] {
  const lines = text.trim().split(/\r?\n/)
  return lines.slice(0, 100).map((line) => {
    const row: string[] = []
    let isInQuotes = false
    let current = ''
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        isInQuotes = !isInQuotes
      } else if (char === delimiter && !isInQuotes) {
        row.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    row.push(current.trim())
    return row
  })
}

