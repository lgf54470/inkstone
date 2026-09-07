import MarkdownIt from 'markdown-it'
import type { StateBlock } from 'markdown-it'

function blockLine(state: StateBlock, line: number): string {
  const pos = state.bMarks[line] + state.tShift[line]
  const max = state.eMarks[line]
  return state.src.slice(pos, max)
}

type Fence = {
  char: string
  length: number
}

function advanceFence(fence: Fence | null, marker: string): Fence | null {
  if (!fence) return { char: marker[0]!, length: marker.length }
  if (marker[0] === fence.char && marker.length >= fence.length) return null
  return fence
}

function walkNonFenceLines(
  state: StateBlock,
  start: number,
  end: number,
  visit: (line: number, text: string) => boolean
): number {
  let fence: Fence | null = null
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line)
    const fenceMatch = /^(`{3,}|~{3,})/.exec(text)
    if (fenceMatch) {
      fence = advanceFence(fence, fenceMatch[1]!)
      continue
    }
    if (fence) continue
    if (visit(line, text)) return line
  }
  return -1
}

function findContainerEnd(state: StateBlock, startLine: number, endLine: number, markerLength: number): number {
  let depth = 1
  let result = -1
  walkNonFenceLines(state, startLine + 1, endLine, (line, text) => {
    if (new RegExp(`^:{${markerLength},}(?:\\s+(?:details|tabs)\\b|\\{tab-set\\})`).test(text)) {
      depth++
      return false
    }
    if (new RegExp(`^:{${markerLength},}\\s*$`).test(text) && --depth === 0) {
      result = line
      return true
    }
    return false
  })
  return result
}

function findColonFenceEnd(state: StateBlock, start: number, end: number, markerLength: number): number {
  let result = -1
  walkNonFenceLines(state, start, end, (line, text) => {
    if (new RegExp(`^:{${markerLength},}\\s*$`).test(text)) {
      result = line
      return true
    }
    return false
  })
  return result
}

function stripBracketTitle(value: string): string {
  const trimmed = value.trim()
  return /^\[[\s\S]*\]$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed
}

function parseDirectiveOptions(
  state: StateBlock,
  start: number,
  close: number
): { contentStart: number; isSelected: boolean } {
  let contentStart = start
  let isSelected = false
  while (contentStart < close) {
    const option = /^:([a-z][a-z0-9_-]*):(?:[ \t]+.*)?$/i.exec(blockLine(state, contentStart))
    if (!option) break
    if (option[1]!.toLowerCase() === 'selected') isSelected = true
    contentStart++
  }
  if (contentStart < close && !blockLine(state, contentStart).trim()) contentStart++
  return { contentStart, isSelected }
}

function findDirectiveTabSegments(state: StateBlock, start: number, end: number) {
  const tabs: Array<{ title: string; start: number; end: number; selected: boolean }> = []
  for (let line = start; line < end; ) {
    const match = /^(:{3,})(?:\{tab-item\}|[ \t]+tab-item)(?:[ \t]+(.*?))?[ \t]*$/.exec(blockLine(state, line))
    if (!match) {
      line++
      continue
    }
    const close = findColonFenceEnd(state, line + 1, end, match[1]!.length)
    if (close < 0) return []
    const { contentStart, isSelected } = parseDirectiveOptions(state, line + 1, close)
    tabs.push({
      title: stripBracketTitle(match[2] ?? '') || '标签页',
      start: contentStart,
      end: close,
      selected: isSelected,
    })
    line = close + 1
  }
  return tabs
}

function findTabSegments(state: StateBlock, start: number, end: number) {
  const directiveTabs = findDirectiveTabSegments(state, start, end)
  if (directiveTabs.length) return directiveTabs

  const markers: Array<{ line: number; title: string; selected: boolean }> = []
  walkNonFenceLines(state, start, end, (line, text) => {
    const tab = /^@tab(?::active|\+)?\b[ \t]+(.+?)[ \t]*$/.exec(text)
    if (tab) {
      const selected = /^@tab(?::active|\+)\b/.test(text)
      markers.push({ line, title: stripBracketTitle(tab[1]!) || '标签页', selected })
    }
    return false
  })
  return markers.map((marker, index) => ({
    title: marker.title,
    start: marker.line + 1,
    end: markers[index + 1]?.line ?? end,
    selected: marker.selected,
  }))
}

function registerMathBlockRule(md: InstanceType<typeof MarkdownIt>): void {
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
}

function registerTocRule(md: InstanceType<typeof MarkdownIt>): void {
  // TOC block: [TOC] or [[TOC]]
  md.block.ruler.before('paragraph', 'toc', (state, startLine, _endLine, silent) => {
    const line = blockLine(state, startLine).trim()
    if (!/^\[(?:\[\s*(?:toc|TOC)\s*\]\]|(?:toc|TOC))\]$/.test(line)) return false
    if (silent) return true
    state.line = startLine + 1
    state.push('toc', 'nav', 0)
    return true
  })
}

function renderModernContainer(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const source = blockLine(state, startLine)
  const legacyMatch = /^(:{3,})[ \t]+(details|tabs)\b(?:[ \t]+(.*))?$/.exec(source)
  const directiveMatch = /^(:{3,})\{(tab-set)\}[ \t]*(.*)$/.exec(source)
  if (!legacyMatch && !directiveMatch) return false
  const markerLength = (legacyMatch?.[1] ?? directiveMatch![1]!).length
  const end = findContainerEnd(state, startLine, endLine, markerLength)
  if (end < 0) return false
  if (silent) return true

  const kind = legacyMatch?.[2] ?? directiveMatch![2]!
  if (kind === 'details') {
    const rawInfo = (legacyMatch?.[3] ?? '').trim()
    const open = /^(?:open|\+)\b/.test(rawInfo)
    const title = stripBracketTitle(rawInfo.replace(/^(?:open|\+)\b[ \t]*/, '')) || '详细内容'
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
}

function registerModernContainerRule(md: InstanceType<typeof MarkdownIt>): void {
  // Containers: ::: details and ::: tabs
  md.block.ruler.before('fence', 'modern_container', (state, startLine, endLine, silent) =>
    renderModernContainer(state, startLine, endLine, silent)
  )
}

export function registerBlockRules(md: InstanceType<typeof MarkdownIt>): void {
  registerMathBlockRule(md)
  registerTocRule(md)
  registerModernContainerRule(md)
}