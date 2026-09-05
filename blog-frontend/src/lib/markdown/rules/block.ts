import MarkdownIt from 'markdown-it'

function blockLine(state: any, line: number): string {
  const pos = state.bMarks[line] + state.tShift[line]
  const max = state.eMarks[line]
  return state.src.slice(pos, max)
}

function findColonFenceEnd(state: any, start: number, end: number, markerLength: number): number {
  let fence: { char: string; length: number } | null = null
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line)
    const codeFence = /^(`{3,}|~{3,})/.exec(text)
    if (codeFence) {
      const marker = codeFence[1]!
      if (!fence) fence = { char: marker[0]!, length: marker.length }
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null
      continue
    }
    if (!fence && new RegExp(`^:{${markerLength},}\\s*$`).test(text)) return line
  }
  return -1
}

function findTabSegments(state: any, start: number, end: number) {
  const markers: Array<{ line: number; title: string; selected: boolean }> = []
  let fence: { char: string; length: number } | null = null
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line)
    const fenceMatch = /^(`{3,}|~{3,})/.exec(text)
    if (fenceMatch) {
      const marker = fenceMatch[1]!
      if (!fence) fence = { char: marker[0]!, length: marker.length }
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null
      continue
    }
    if (fence) continue
    const tab = /^@tab(?::active|\+)?\b[ \t]+(.+?)[ \t]*$/.exec(text)
    if (tab) {
      const selected = /^@tab(?::active|\+)\b/.test(text)
      markers.push({ line, title: tab[1]!.trim(), selected })
    }
  }
  return markers.map((marker, index) => ({
    title: marker.title,
    start: marker.line + 1,
    end: markers[index + 1]?.line ?? end,
    selected: marker.selected,
  }))
}

export function registerBlockRules(md: InstanceType<typeof MarkdownIt>): void {
  // Math block: $$...$$
  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const line = blockLine(state, startLine)
    if (!/^\$\$/.test(line)) return false
    const firstLine = line.slice(2)
    let mathContent = ''
    let next = startLine
    let found = false
    if (firstLine.trim().endsWith('$$')) {
      mathContent = firstLine.trim().slice(0, -2)
      found = true
    } else {
      while (!found && ++next < endLine) {
        const text = blockLine(state, next)
        if (text.trim().endsWith('$$')) {
          mathContent += text.slice(0, text.lastIndexOf('$$'))
          found = true
        } else {
          mathContent += `${text}\n`
        }
      }
      if (firstLine.trim()) mathContent = `${firstLine}\n${mathContent}`
    }
    if (!found) return false
    if (silent) return true
    const token = state.push('math_block', 'div', 0)
    token.content = mathContent.trim()
    token.map = [startLine, next + 1]
    token.markup = '$$'
    state.line = next + 1
    return true
  })

  // TOC block: [TOC] or [[TOC]]
  md.block.ruler.before('paragraph', 'toc', (state, startLine, _endLine, silent) => {
    const line = blockLine(state, startLine).trim()
    if (!/^\[(?:\[\s*(?:toc|TOC)\s*\]\]|(?:toc|TOC))\]$/.test(line)) return false
    if (silent) return true
    state.line = startLine + 1
    state.push('toc', 'nav', 0)
    return true
  })

  // Containers: ::: details and ::: tabs
  md.block.ruler.before('fence', 'modern_container', (state, startLine, endLine, silent) => {
    const source = blockLine(state, startLine)
    const match = /^(:{3,})[ \t]+(details|tabs)\b(?:[ \t]+(.*))?$/.exec(source)
    if (!match) return false
    const markerLength = match[1]!.length
    const kind = match[2]!
    const rawInfo = (match[3] ?? '').trim()
    const end = findColonFenceEnd(state, startLine + 1, endLine, markerLength)
    if (end < 0) return false
    if (silent) return true

    if (kind === 'details') {
      const open = /^(?:open|\+)\b/.test(rawInfo)
      const title = rawInfo.replace(/^(?:open|\+)\b[ \t]*/, '').replace(/^\[|\]$/g, '').trim() || '详细内容'
      const openToken = state.push('details_open', 'details', 1)
      openToken.block = true
      openToken.meta = { open, title }
      state.md.block.tokenize(state, startLine + 1, end)
      state.push('details_close', 'details', -1).block = true
    } else {
      const tabs = findTabSegments(state, startLine + 1, end)
      if (!tabs.length) {
        state.line = end + 1
        return true
      }
      const selectedIndex = Math.max(0, tabs.findIndex((t) => t.selected))
      const openToken = state.push('tabs_open', 'div', 1)
      openToken.block = true
      openToken.meta = { titles: tabs.map((t) => t.title), selectedIndex }
      tabs.forEach((tab, tabIndex) => {
        const panelOpen = state.push('tab_panel_open', 'section', 1)
        panelOpen.block = true
        panelOpen.meta = { tabIndex, selected: tabIndex === selectedIndex }
        state.md.block.tokenize(state, tab.start, tab.end)
        state.push('tab_panel_close', 'section', -1).block = true
      })
      state.push('tabs_close', 'div', -1).block = true
    }
    state.line = end + 1
    return true
  })
}