const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

function extractRawBlocks(html: string): { masked: string; placeholders: string[] } {
  const placeholders: string[] = []
  const regex = /(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>)/gi
  const masked = html.replace(regex, (match) => {
    placeholders.push(match)
    return `___RAW_HTML_PH_${placeholders.length - 1}___`
  })
  return { masked, placeholders }
}

function restoreRawBlocks(text: string, placeholders: string[]): string {
  let result = text
  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`___RAW_HTML_PH_${i}___`, placeholders[i]!)
  }
  return result
}

function hasMixedInlineContent(text: string): boolean {
  if (!text.includes('<') || !text.includes('>')) return false
  if (/<(div|section|article|header|footer|nav|main|aside|table|ul|ol)\b/i.test(text)) return false
  const rootMatch = /^<([a-zA-Z0-9:-]+)[^>]*>([\s\S]*)<\/([a-zA-Z0-9:-]+)>$/.exec(text.trim())
  if (!rootMatch || rootMatch[1]!.toLowerCase() !== rootMatch[3]!.toLowerCase()) return false
  const inner = rootMatch[2]!
  if (/^<[a-zA-Z0-9:-]+[^>]*>/.test(inner.trim())) return false
  return /\S+\s*<[a-zA-Z0-9:-]+[^>]*>/.test(inner)
}


function tokenizeTags(text: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < text.length) {
    if (text[i] === '<') {
      const close = text.indexOf('>', i)
      if (close !== -1) {
        tokens.push(text.slice(i, close + 1))
        i = close + 1
        continue
      }
    }
    const nextOpen = text.indexOf('<', i)
    if (nextOpen === -1) {
      const val = text.slice(i).trim()
      if (val) tokens.push(val)
      break
    }
    const val = text.slice(i, nextOpen).trim()
    if (val) tokens.push(val)
    i = nextOpen
  }
  return tokens
}

function formatTokenStream(tokens: string[], tabSize: number, isHtml: boolean): string {
  const indentStr = ' '.repeat(tabSize)
  const lines: string[] = []
  let depth = 0

  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('</')) {
      depth = Math.max(0, depth - 1)
      lines.push(`${indentStr.repeat(depth)}${trimmed}`)
      continue
    }

    if (trimmed.startsWith('<') && trimmed.endsWith('/>')) {
      lines.push(`${indentStr.repeat(depth)}${trimmed}`)
      continue
    }

    if (trimmed.startsWith('<') && !trimmed.startsWith('<!') && !trimmed.startsWith('<?')) {
      const tagMatch = /^<([a-zA-Z0-9:-]+)/.exec(trimmed)
      const tagName = tagMatch ? tagMatch[1]!.toLowerCase() : ''
      const isVoid = isHtml && VOID_TAGS.has(tagName)

      lines.push(`${indentStr.repeat(depth)}${trimmed}`)
      if (!isVoid) depth++
      continue
    }

    lines.push(`${indentStr.repeat(depth)}${trimmed}`)
  }

  return lines.join('\n')
}

export function formatMarkup(code: string, tabSize: number, isHtml = true): string {
  const trimmed = code.trim()
  if (!trimmed) return code

  const { masked, placeholders } = extractRawBlocks(trimmed)

  if (hasMixedInlineContent(masked) && !masked.includes('\n') && masked.startsWith('<') && masked.endsWith('>')) {
    const rootMatch = /^<([a-zA-Z0-9:-]+)[^>]*>([\s\S]*)<\/([a-zA-Z0-9:-]+)>$/.exec(masked)
    if (rootMatch && rootMatch[1]!.toLowerCase() === rootMatch[3]!.toLowerCase()) {
      return restoreRawBlocks(masked, placeholders)
    }
  }

  const tokens = tokenizeTags(masked)
  const formatted = formatTokenStream(tokens, tabSize, isHtml)
  return restoreRawBlocks(formatted, placeholders)
}
