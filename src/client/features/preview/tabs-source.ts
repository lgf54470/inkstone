import { parseTabsOptions } from '../../lib/markdown/renderer'
import type { TabsOptions } from '../../lib/markdown/renderer'
import { t } from '../../lib/i18n'
import { COLON_CLOSE, COLON_OPEN, deindent, findColonClose, fenceAfter, lineIndent, type OpenFence } from './colon-lines'

// No word boundary after the active prefix: "+" and ":" are non-word chars, so a boundary never meets
// the following space.
const AT_TAB = /^@tab(?:(?::active|\+))?[ \t]+(.+?)[ \t]*$/
const DIRECTIVE_TAB = /^(:{3,})(?:\{tab-item\}|[ \t]+tab-item)(?:[ \t]+(.*?))?[ \t]*$/
// The `::` marker spelling. The lookahead keeps a `:::` fence out of it: this scanner tests the
// markers before it tracks nesting, where the renderer reads them in the other order.
const COLON_TAB = /^::(?!:)[ \t]*(.*)$/

const MANAGED_OPTION_KEYS = ['style', 'orientation', 'variant', 'align', 'position', 'placement', 'sync', 'group']
const MANAGED_FLAGS = [
  'vertical',
  'horizontal',
  'default',
  'pills',
  'cards',
  'minimal',
  'start',
  'center',
  'end',
  'stretch',
  'left',
  'right',
  'top',
  'bottom',
  'full',
]

function isManagedTabsOption(token: string): boolean {
  const clean = token.replace(/^["']|["']$/g, '').trim().toLowerCase()
  const eqIdx = clean.indexOf('=')
  if (eqIdx !== -1) {
    return MANAGED_OPTION_KEYS.includes(clean.slice(0, eqIdx).trim())
  }
  return MANAGED_FLAGS.includes(clean)
}

export function updateTabsSourceHeader(
  source: string,
  sourceLine: number,
  updater: (opts: TabsOptions) => Partial<TabsOptions>,
): string | null {
  if (!Number.isInteger(sourceLine) || sourceLine < 0) return null
  const lines = source.split('\n')
  if (sourceLine >= lines.length) return null
  const rawLine = lines[sourceLine]!
  const indent = lineIndent(rawLine)
  const line = rawLine.slice(indent.length)
  const legacyMatch = /^(:{3,})[ \t]+(tabs|t)\b(.*)$/i.exec(line)
  const directiveMatch = /^(:{3,})[ \t]*\{(tab-set)\}[ \t]*(.*)$/i.exec(line)
  if (!legacyMatch && !directiveMatch) return null

  const marker = legacyMatch?.[1] ?? directiveMatch![1]!
  const kind = legacyMatch?.[2] ?? directiveMatch![2]!
  const rawInfo = (legacyMatch?.[3] ?? directiveMatch?.[3] ?? '').trim()
  const currentOpts = parseTabsOptions(rawInfo)
  const nextOpts: TabsOptions = { ...currentOpts, ...updater(currentOpts) }

  // Preserve any unmanaged user tokens (e.g. custom classes, directive arguments)
  const tokens = rawInfo.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  const unmanagedTokens = tokens.filter((token) => !isManagedTabsOption(token))

  const managedParts: string[] = []
  // Position is the single layout knob: once an edge is set it fully determines the orientation,
  // so a legacy style token is dropped rather than carried along as a redundant, possibly
  // contradictory setting.
  if (nextOpts.position) {
    managedParts.push(`position=${nextOpts.position}`)
  } else if (nextOpts.style === 'vertical') {
    managedParts.push('style=vertical')
  } else if (
    (currentOpts.style === 'vertical' && nextOpts.style === 'horizontal') ||
    /\b(?:style\s*=\s*["']?horizontal["']?|horizontal\b)/i.test(rawInfo)
  ) {
    managedParts.push('style=horizontal')
  }

  if (nextOpts.variant !== 'default') {
    managedParts.push(`variant=${nextOpts.variant}`)
  }

  if (nextOpts.align !== 'start') {
    managedParts.push(`align=${nextOpts.align}`)
  }

  if (nextOpts.sync) {
    managedParts.push(`sync=${nextOpts.sync}`)
  }

  const allParts = [...unmanagedTokens, ...managedParts]
  // The `t` abbreviation is the author's own spelling; only the option tokens get rewritten.
  const prefix = legacyMatch ? `${marker} ${kind}` : `${marker} {${kind}}`
  lines[sourceLine] = `${indent}${allParts.length ? `${prefix} ${allParts.join(' ')}` : prefix}`
  return lines.join('\n')
}

interface LocatedTab {
  kind: 'at' | 'directive' | 'colon'
  markerLine: number
  /** Exclusive end of the segment inside the container (@tab form). */
  endLine: number
  title: string
}

interface TabsStructure {
  markerLength: number
  closeLine: number
  tabs: LocatedTab[]
}




// Walks the container body honoring code fences (colon markers inside them are text) and colon
// nesting, so @tab markers inside nested containers are never read as segment starts.
function locateTabsStructure(source: string, sourceLine: number): TabsStructure | null {
  const lines = source.split('\n')
  const header = lines[sourceLine]
  const headerMatch = /^(:{3,})/.exec(header ? deindent(header) : '')
  if (!headerMatch) return null
  const markerLength = headerMatch[1]!.length
  const closeLine = findColonClose(lines, sourceLine + 1, lines.length, markerLength)
  if (closeLine < 0) return null

  const tabs: LocatedTab[] = []
  const colonTabs: LocatedTab[] = []
  let colonDepth = 0
  let fence: OpenFence = null
  let directiveCount = 0
  for (let line = sourceLine + 1; line < closeLine; line++) {
    const text = deindent(lines[line]!)
    const fenced = fenceAfter(text, fence)
    fence = fenced.fence
    if (fenced.skipped) continue
    if (colonDepth === 0) {
      const directive = DIRECTIVE_TAB.exec(text)
      if (directive) {
        const innerClose = findColonClose(lines, line + 1, closeLine, directive[1]!.length)
        if (innerClose < 0) return null
        tabs.push({
          kind: 'directive',
          markerLine: line,
          endLine: innerClose + 1,
          title: directive[2]?.trim() || t('common.tabs'),
        })
        directiveCount++
        line = innerClose
        continue
      }
      const atTab = AT_TAB.exec(text)
      if (atTab && directiveCount === 0) {
        tabs.push({ kind: 'at', markerLine: line, endLine: closeLine, title: atTab[1]! })
      }
      const colonTab = COLON_TAB.exec(text)
      if (colonTab && directiveCount === 0) {
        colonTabs.push({
          kind: 'colon',
          markerLine: line,
          endLine: closeLine,
          title: colonTab[1]!.trim() || t('common.tabs'),
        })
      }
    }
    if (COLON_OPEN.test(text)) {
      colonDepth++
      continue
    }
    if (COLON_CLOSE.test(text) && colonDepth > 0) {
      colonDepth--
    }
  }

  if (directiveCount > 0) {
    return { markerLength, closeLine, tabs }
  }
  // The renderer reads `@tab` before it reads `::`, so a note that uses both keeps its @tab segments
  // and the stray `::` lines stay content. Each segment ends where the next one starts.
  const markers = tabs.length ? tabs : colonTabs
  return {
    markerLength,
    closeLine,
    tabs: markers.map((tab, index) => ({ ...tab, endLine: markers[index + 1]?.markerLine ?? closeLine })),
  }
}

export function getTabsTabCount(source: string, sourceLine: number): number | null {
  return locateTabsStructure(source, sourceLine)?.tabs.length ?? null
}

export function renameTabInSource(
  source: string,
  sourceLine: number,
  tabIndex: number,
  newTitle: string,
): string | null {
  const structure = locateTabsStructure(source, sourceLine)
  if (!structure) return null
  const target = structure.tabs[tabIndex]
  if (!target) return null
  const title = newTitle.trim()
  if (!title) return null
  const lines = source.split('\n')
  const markerRaw = lines[target.markerLine]!
  const indent = lineIndent(markerRaw)
  if (target.kind === 'directive') {
    const colons = /^(:{3,})/.exec(deindent(markerRaw))![1]
    lines[target.markerLine] = `${indent}${colons} tab-item ${title}`
  } else if (target.kind === 'colon') {
    const marker = /^:{3,}/.exec(deindent(markerRaw)) ? ':::' : '::'
    lines[target.markerLine] = `${indent}${marker} ${title}`
  } else {
    lines[target.markerLine] = `${indent}${deindent(markerRaw).replace(
      /^(@tab(?:(?::active|\+))?)([ \t]+).*$/,
      (_match, prefix: string, gap: string) => `${prefix}${gap}${title}`,
    )}`
  }
  return lines.join('\n')
}

export function deleteTabInSource(
  source: string,
  sourceLine: number,
  tabIndex: number,
): string | null {
  const structure = locateTabsStructure(source, sourceLine)
  if (!structure || structure.tabs.length <= 1) return null
  const target = structure.tabs[tabIndex]
  if (!target) return null
  const lines = source.split('\n')
  lines.splice(target.markerLine, target.endLine - target.markerLine)
  // Swallow one blank line left at the join so the edit never piles up empty lines.
  const joinLine = target.markerLine
  if (joinLine < lines.length && !lines[joinLine]!.trim() && joinLine > 0 && !lines[joinLine - 1]!.trim()) {
    lines.splice(joinLine, 1)
  }
  return lines.join('\n')
}

export function addTabToSource(
  source: string,
  sourceLine: number,
  tabTitle?: string,
): string | null {
  if (!Number.isInteger(sourceLine) || sourceLine < 0) return null
  const lines = source.split('\n')
  if (sourceLine >= lines.length) return null
  const header = lines[sourceLine]!
  const indent = lineIndent(header)
  const match = /^(:{3,})/.exec(deindent(header))
  if (!match) return null
  const markerLength = match[1]!.length

  const closeLine = findColonClose(lines, sourceLine + 1, lines.length, markerLength)
  if (closeLine < 0) return null

  const innerSlice = lines.slice(sourceLine, closeLine).map(deindent).join('\n')
  const isDirective = /:::+\s*tab-item|\{tab-item\}/.test(innerSlice)
  const isColonMarked = !isDirective && /^::(?!:)[ \t]/m.test(innerSlice)

  let resolvedTitle = tabTitle
  if (!resolvedTitle) {
    const count = (innerSlice.match(/^@tab(?:(?::active|\+))?(?=[ \t])/gm) || innerSlice.match(/:::+\s*\{?tab-item\}?/gm) || []).length
    resolvedTitle = count > 0 ? `${t('common.tabs')} ${count + 1}` : t('common.tabs')
  }

  const insertContent = isDirective
    ? [`${indent}::: tab-item ${resolvedTitle}`, `${indent}`, `${indent}:::`]
    : isColonMarked
      ? [`${indent}:: ${resolvedTitle}`, indent]
      : [`${indent}@tab ${resolvedTitle}`, indent]

  lines.splice(closeLine, 0, ...insertContent)
  return lines.join('\n')
}
