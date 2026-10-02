import MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import { escapeHtml } from '@shared/escape'
import { t } from '../../i18n'
import { renderEnv } from './env'
import { parseTableOptions, TABLE_OPTION_DEFAULTS } from './table-options'
import { detailsTitle, parseDetailsOptions } from './details-options'
import type { TableOptions } from './table-options'
import { escapeAttr } from './util'
export 
function renderFrontMatterValue(value: unknown): string {
  if (value == null)
    return '<span class="frontmatter-empty">—</span>'
  if (Array.isArray(value)) {
    return value.map((item) => `<span class="frontmatter-chip">${escapeHtml(formatScalar(item))}</span>`).join('')
  }
  if (typeof value === 'object')
    return `<code>${escapeHtml(JSON.stringify(value))}</code>`
  return escapeHtml(formatScalar(value))
}

function formatScalar(value: unknown): string {
  if (value instanceof Date)
    return value.toISOString()
  return String(value)
}
export 
function blockLine(state: {
  src: string
  bMarks: number[]
  tShift: number[]
  eMarks: number[]
}, line: number): string {
  const from = state.bMarks[line]! + state.tShift[line]!
  return state.src.slice(from, state.eMarks[line]!)
}
type Fence = {
  char: string
  length: number
}

type BlockState = {
  src: string
  bMarks: number[]
  tShift: number[]
  eMarks: number[]
}

function advanceFence(fence: Fence | null, marker: string): Fence | null {
  if (!fence)
    return { char: marker[0]!, length: marker.length }
  if (marker[0] === fence.char && marker.length >= fence.length)
    return null
  return fence
}

function walkNonFenceLines(state: BlockState, start: number, end: number, visit: (line: number, text: string) => boolean): number {
  let fence: Fence | null = null
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line)
    const fenceMatch = /^(`{3,}|~{3,})/.exec(text)
    if (fenceMatch) {
      fence = advanceFence(fence, fenceMatch[1]!)
      continue
    }
    if (fence)
      continue
    if (visit(line, text))
      return line
  }
  return -1
}


function findContainerEnd(state: BlockState, startLine: number, endLine: number, markerLength: number): number {
  let depth = 1
  let result = -1
  walkNonFenceLines(state, startLine + 1, endLine, (line, text) => {
    if (new RegExp(`^:{${markerLength},}(?:\\s+\\S|\\{\\S+\\})`).test(text)) {
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

function findTabSegments(state: BlockState, start: number, end: number): Array<{
  title: string
  start: number
  end: number
  selected: boolean
}> {
  const directiveTabs = findDirectiveTabSegments(state, start, end)
  if (directiveTabs.length)
    return directiveTabs
  const markers: Array<{
    line: number
    title: string
    selected: boolean
  }> = []
  let colonDepth = 0
  walkNonFenceLines(state, start, end, (line, text) => {
    if (/^:{3,}(?:\s+\S|\{\S+\})/.test(text)) {
      colonDepth++
      return false
    }
    if (/^:{3,}\s*$/.test(text)) {
      if (colonDepth > 0) colonDepth--
      return false
    }
    if (colonDepth > 0) return false
    const tab = /^@tab(?:(?::active|\+))?[ \t]+(.+?)[ \t]*$/.exec(text)
    if (tab) {
      const selected = /^@tab(?::active|\+)(?=[ \t])/.test(text)
      markers.push({ line, title: stripBracketTitle(tab[1]!) || t('common.tabs'), selected })
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

function findDirectiveTabSegments(state: {
  src: string
  bMarks: number[]
  tShift: number[]
  eMarks: number[]
}, start: number, end: number): Array<{
  title: string
  start: number
  end: number
  selected: boolean
}> {
  const tabs: Array<{ title: string; start: number; end: number; selected: boolean }> = []
  for (let line = start; line < end;) {
    const match = /^(:{3,})(?:\{tab-item\}|[ \t]+tab-item)(?:[ \t]+(.*?))?[ \t]*$/.exec(blockLine(state, line))
    if (!match) {
      line++
      continue
    }
    const close = findColonFenceEnd(state, line + 1, end, match[1]!.length)
    if (close < 0)
      return []
    let contentStart = line + 1
    let isSelected = false
    while (contentStart < close) {
      const option = /^:([a-z][a-z0-9_-]*):(?:[ \t]+.*)?$/i.exec(blockLine(state, contentStart))
      if (!option)
        break
      if (option[1]!.toLowerCase() === 'selected')
        isSelected = true
      contentStart++
    }
    if (contentStart < close && !blockLine(state, contentStart).trim())
      contentStart++
    tabs.push({
      title: stripBracketTitle(match[2] ?? '') || t('common.tabs'),
      start: contentStart,
      end: close,
      selected: isSelected,
    })
    line = close + 1
  }
  return tabs
}

function findColonFenceEnd(state: BlockState, start: number, end: number, markerLength: number): number {
  let depth = 1
  let result = -1
  walkNonFenceLines(state, start, end, (line, text) => {
    if (new RegExp(`^:{${markerLength},}(?:\\s+\\S|\\{\\S+\\})`).test(text)) {
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

export type TabsPosition = 'top' | 'bottom' | 'left' | 'right'

export interface TabsOptions {
  style: 'horizontal' | 'vertical'
  variant: 'default' | 'pills' | 'cards' | 'minimal'
  align: 'start' | 'center' | 'end' | 'stretch'
  /** Which edge the tab strip sits on; unset follows the style default (top / left). */
  position?: TabsPosition
  /** Coordination group: tab blocks sharing the same id switch together and remember the choice. */
  sync?: string
}

// Sync ids travel into a data attribute and into source text, so only an URL-safe token is accepted.
const TABS_SYNC_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/i

export function isValidTabsSync(value: string): boolean {
  return TABS_SYNC_PATTERN.test(value)
}

// Position is the single layout knob: an explicit edge implies the matching orientation, so an
// older `style=vertical` note (no position yet) keeps rendering on the left edge.
export function effectiveTabsPosition(options: { style: TabsOptions['style']; position?: TabsPosition }): TabsPosition {
  if (options.position) return options.position
  return options.style === 'vertical' ? 'left' : 'top'
}

export function isVerticalTabsPosition(position: TabsPosition): boolean {
  return position === 'left' || position === 'right'
}

function normalizeTabsPosition(val: string): TabsPosition | undefined {
  const positionMap: Record<string, TabsPosition> = {
    top: 'top',
    bottom: 'bottom',
    left: 'left',
    right: 'right',
  }
  return positionMap[val]
}

function applyTabsOption(options: TabsOptions, key: string, rawVal: string): void {
  if (key === 'style' || key === 'orientation') {
    const val = rawVal.toLowerCase()
    if (val === 'vertical' || val === 'horizontal') options.style = val
    return
  }
  if (key === 'variant') {
    const val = rawVal.toLowerCase()
    if (['default', 'pills', 'cards', 'minimal'].includes(val)) {
      options.variant = val as TabsOptions['variant']
    }
    return
  }
  if (key === 'align') {
    const alignMap: Record<string, TabsOptions['align']> = {
      start: 'start',
      left: 'start',
      center: 'center',
      end: 'end',
      right: 'end',
      stretch: 'stretch',
      full: 'stretch',
    }
    const resolved = alignMap[rawVal.toLowerCase()]
    if (resolved) options.align = resolved
    return
  }
  if (key === 'position' || key === 'placement') {
    const resolved = normalizeTabsPosition(rawVal.toLowerCase())
    if (resolved) options.position = resolved
    return
  }
  if (key === 'sync' || key === 'group') {
    const val = rawVal.replace(/^["']|["']$/g, '').trim()
    if (isValidTabsSync(val)) options.sync = val
  }
}

function applyTabsFlag(options: TabsOptions, flag: string): void {
  if (flag === 'vertical' || flag === 'horizontal') {
    options.style = flag
    return
  }
  if (['pills', 'cards', 'minimal'].includes(flag)) {
    options.variant = flag as TabsOptions['variant']
    return
  }
  if (flag === 'center' || flag === 'stretch') {
    options.align = flag as TabsOptions['align']
    return
  }
  const position = normalizeTabsPosition(flag)
  if (position) options.position = position
}

export function parseTabsOptions(info: string): TabsOptions {
  const options: TabsOptions = {
    style: 'horizontal',
    variant: 'default',
    align: 'start',
  }
  const trimmed = info.trim()
  if (!trimmed) return options
  const tokens = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  for (const token of tokens) {
    const clean = token.replace(/^["']|["']$/g, '').trim()
    const eqIdx = clean.indexOf('=')
    if (eqIdx !== -1) {
      const key = clean.slice(0, eqIdx).toLowerCase().trim()
      const rawVal = clean.slice(eqIdx + 1).trim()
      // Sync ids are case-sensitive identifiers; every other option is a lowercase enum keyword.
      const val = key === 'sync' || key === 'group'
        ? rawVal
        : rawVal.toLowerCase().replace(/^["']|["']$/g, '').trim()
      applyTabsOption(options, key, val)
    } else {
      applyTabsFlag(options, clean.toLowerCase())
    }
  }
  return options
}

function renderModernContainer(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const source = blockLine(state, startLine)
  const legacyMatch = /^(:{3,})[ \t]+(details|tabs|table)\b(?:[ \t]+(.*))?$/.exec(source)
  const directiveMatch = /^(:{3,})\{(tab-set)\}[ \t]*(.*)$/.exec(source)
  if (!legacyMatch && !directiveMatch)
    return false
  const markerLength = (legacyMatch?.[1] ?? directiveMatch![1]!).length
  const end = findContainerEnd(state, startLine, endLine, markerLength)
  if (end < 0)
    return false
  if (silent)
    return true
  const kind = legacyMatch?.[2] ?? directiveMatch![2]!
  const rawInfo = (legacyMatch?.[3] ?? directiveMatch?.[3] ?? '').trim()
  if (kind === 'details') {
    renderDetailsContainer(state, startLine, end, legacyMatch)
  }
  else if (kind === 'table') {
    renderTableContainer(state, startLine, end, rawInfo)
  }
  else {
    renderTabsContainer(state, startLine, end, rawInfo)
  }
  state.line = end + 1
  return true
}

/**
 * A style container for the table inside it: a markdown table carries no info string, so the
 * container's header is where its density, stripes and borders are stated. The body is tokenized
 * as usual, which is what lets a table sit in it unchanged.
 */
function renderTableContainer(state: StateBlock, startLine: number, end: number, rawInfo: string): void {
  const openToken = state.push('table_wrap_open', 'div', 1)
  openToken.block = true
  openToken.map = [startLine, end + 1]
  openToken.meta = { options: parseTableOptions(rawInfo) }
  state.md.block.tokenize(state, startLine + 1, end)
  state.push('table_wrap_close', 'div', -1).block = true
}

function renderDetailsContainer(state: StateBlock, startLine: number, end: number, legacyMatch: RegExpExecArray | null): void {
  const options = parseDetailsOptions((legacyMatch?.[3] ?? '').trim())
  const openToken = state.push('details_open', 'details', 1)
  openToken.block = true
  openToken.map = [startLine, end + 1]
  openToken.meta = { open: options.open, variant: options.variant }
  const summary = state.push('details_summary', 'summary', 0)
  summary.content = detailsTitle(options)
  state.md.block.tokenize(state, startLine + 1, end)
  state.push('details_close', 'details', -1).block = true
}

function renderTabsContainer(state: StateBlock, startLine: number, end: number, rawInfo: string): void {
  const tabs = findTabSegments(state, startLine + 1, end)
  if (!tabs.length) {
    state.line = end + 1
    return
  }
  const env = renderEnv(state.env)
  const id = `${env.docId}-tabs-${++env.tabSequence}`
  const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.selected))
  const options = parseTabsOptions(rawInfo)
  const openToken = state.push('tabs_open', 'div', 1)
  openToken.block = true
  openToken.map = [startLine, end + 1]
  openToken.meta = { id, titles: tabs.map((tab) => tab.title), selectedIndex, options }
  tabs.forEach((tab, tabIndex) => {
    const panelOpen = state.push('tab_panel_open', 'section', 1)
    panelOpen.block = true
    panelOpen.meta = { id, tabIndex, selected: tabIndex === selectedIndex }
    state.md.block.tokenize(state, tab.start, tab.end)
    const panelClose = state.push('tab_panel_close', 'section', -1)
    panelClose.block = true
    panelClose.meta = { id, tabIndex }
  })
  state.push('tabs_close', 'div', -1).block = true
}


function stripBracketTitle(value: string): string {
  const trimmed = value.trim()
  return /^\[[\s\S]*\]$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed
}

export function registerContainers(md: MarkdownIt): void {

  md.block.ruler.before(
    'fence',
    'modern_container',
    (state, startLine, endLine, silent) => renderModernContainer(state, startLine, endLine, silent),
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  )
  md.renderer.rules.details_open = (tokens, index) => {
    const sourceLine = tokens[index]!.map?.[0]
    const meta = tokens[index]!.meta as { open?: boolean; variant?: string } | undefined
    const variant = meta?.variant && meta.variant !== 'default' ? ` data-details-variant="${escapeAttr(meta.variant)}"` : ''
    return `<details class="markdown-details"${sourceLine === undefined ? '' : ` data-line="${sourceLine}"`}${meta?.open ? ' open' : ''}${variant}>`
  }
  md.renderer.rules.details_summary = (tokens, index) => `<summary>${md.renderInline(tokens[index]!.content)}</summary>`
  md.renderer.rules.details_close = () => '</details>'
  md.renderer.rules.tabs_open = (tokens, index) => {
    const sourceLine = tokens[index]!.map?.[0]
    const { id, titles, selectedIndex, options } = tokens[index]!.meta as {
      id: string
      titles: string[]
      selectedIndex: number
      options?: TabsOptions
    }
    const opt = options ?? { style: 'horizontal' as const, variant: 'default' as const, align: 'start' as const }
    const buttons = titles
      .map((title, tabIndex) => `<button type="button" role="tab" id="${id}-tab-${tabIndex}" aria-controls="${id}-panel-${tabIndex}" aria-selected="${tabIndex === selectedIndex ? 'true' : 'false'}" tabindex="${tabIndex === selectedIndex ? '0' : '-1'}" data-tab-button="${tabIndex}">${escapeHtml(title)}</button>`)
      .join('')
    const position = effectiveTabsPosition(opt)
    const styleAttr = isVerticalTabsPosition(position) ? ' data-tabs-style="vertical"' : ''
    const variantAttr = opt.variant !== 'default' ? ` data-tabs-variant="${opt.variant}"` : ''
    const alignAttr = opt.align !== 'start' ? ` data-tabs-align="${opt.align}"` : ''
    const positionAttr = opt.position ? ` data-tabs-position="${opt.position}"` : ''
    const syncAttr = opt.sync ? ` data-tabs-sync="${escapeAttr(opt.sync)}"` : ''
    // The outer element is the containment context: querying it lets the block itself (not only
    // its children) collapse vertical layout inside a narrow split pane — container queries on a
    // node that establishes its own containment measure the *ancestor* container, not itself.
    return `<div class="markdown-tabs-outer"><div class="markdown-tabs" data-tabs${styleAttr}${variantAttr}${alignAttr}${positionAttr}${syncAttr}${sourceLine === undefined ? '' : ` data-line="${sourceLine}"`}><div class="tab-list" role="tablist" aria-label="${escapeAttr(t('common.tabs'))}">${buttons}</div>`
  }
  md.renderer.rules.tabs_close = () => '</div></div>'
  md.renderer.rules.tab_panel_open = (tokens, index) => {
    const { id, tabIndex, selected } = tokens[index]!.meta as {
      id: string
      tabIndex: number
      selected: boolean
    }
    return `<section class="tab-panel" role="tabpanel" id="${id}-panel-${tabIndex}" aria-labelledby="${id}-tab-${tabIndex}" data-tab-panel="${tabIndex}"${selected ? '' : ' hidden'}>`
  }
  md.renderer.rules.tab_panel_close = () => '</section>'
  md.renderer.rules.table_wrap_open = (tokens, index) => {
    const sourceLine = tokens[index]!.map?.[0]
    const options = (tokens[index]!.meta as { options?: TableOptions } | undefined)?.options ?? TABLE_OPTION_DEFAULTS
    const state = [
      ` data-table-density="${escapeAttr(options.density)}"`,
      options.zebra ? ' data-table-zebra="true"' : '',
      ` data-table-frames="${escapeAttr(options.frames)}"`,
    ].join('')
    return `<div class="markdown-table"${sourceLine === undefined ? '' : ` data-line="${sourceLine}"`}${state}>`
  }
  md.renderer.rules.table_wrap_close = () => '</div>'
}
