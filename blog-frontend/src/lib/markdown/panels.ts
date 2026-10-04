import MarkdownIt from 'markdown-it'
import type { StateBlock, Token } from 'markdown-it'
import { DEFAULT_LOCALE, t } from '../i18n'
import type { BlogLocale, MessageKey } from '../i18n'
import { escapeAttr, escapeHtml } from './escape.ts'
import { calloutDefaultTitle } from './callout.ts'
import { blockLine, walkNonFenceLines } from './block-lines.ts'
import { parseTimelineItem, stripBracketTitle } from './panel-options.ts'
import { renderInlineLabel } from './inline-label.ts'
import type {
  AlignValue,
  CalloutHeader,
  ColsOptions,
  PanelHeader,
  PanelHeaderMatch,
  TimelineItem,
  TimelineStatus,
} from './panel-options.ts'
import type { RenderEnv } from './types.ts'

/**
 * The `:::` panel family: a block whose header says what kind of block it is, and whose body is
 * ordinary markdown. Port of the root app's src/client/lib/markdown/renderer/panels.ts; the emitted
 * tags, classes and `data-*` hooks are the contract `tests/markdown-renderer-parity.test.ts` compares,
 * and `src/styles/prose/panels.css` is the blog half of the stylesheet that reads them.
 *
 * The blog diverges in two ways the parity skeleton cannot see: it carries no `data-line` (no editor in
 * a read-only site, and no other blog container rule emits one), and a stated column track reaches the
 * stylesheet through `interactive.ts` instead of an inline style, because the sanitizer only allows
 * `style` on the KaTeX elements.
 *
 * Three of the five kinds split their body on a `::` line — columns on a bare `::`, tabs and the
 * timeline on a `::` that carries the tab title or the node's first line on the same row. The fourth
 * splitting rule the family needs is already in `rules/block.ts`, so a tabs block written with `@tab`
 * keeps working untouched and this module only supplies the `::` spelling.
 */

/** The fallback label of an untitled tab panel, shared with the `@tab` and `{tab-item}` spellings. */
export const DEFAULT_TAB_TITLE = '标签页'

const MAX_PANEL_COLUMNS = 6

export interface PanelTabSegment {
  title: string
  start: number
  end: number
  selected: boolean
}

interface ColonMark {
  line: number
  head: string
  alone: boolean
}

/**
 * The `::` marks in a container body, ignoring the ones inside a nested `::: … :::` — a column block
 * that holds a callout must not read the callout's own separators as its own.
 */
function scanColonMarks(state: StateBlock, start: number, end: number): ColonMark[] {
  const marks: ColonMark[] = []
  let nested = 0
  walkNonFenceLines(state, start, end, (line, text) => {
    if (/^:{3,}(?:\s+\S|\{\S+\})/.test(text)) {
      nested++
      return false
    }
    if (/^:{3,}\s*$/.test(text)) {
      if (nested > 0) nested--
      return false
    }
    if (nested > 0) return false
    const mark = /^::[ \t]*(.*)$/.exec(text)
    if (mark) {
      const head = mark[1]!.trim()
      marks.push({ line, head, alone: head === '' })
    }
    return false
  })
  return marks
}

function isBlankRange(state: StateBlock, start: number, end: number): boolean {
  for (let line = start; line < end; line++) {
    if (blockLine(state, line).trim()) return false
  }
  return true
}

function mergeToColumnCount(ranges: Array<{ start: number; end: number }>, count: number, end: number) {
  return [...ranges.slice(0, count - 1), { start: ranges[count - 1]!.start, end }]
}

/**
 * The line ranges one column holds. A separator line is punctuation, so it belongs to no column: each
 * range stops at the mark and the next starts past it. A stated count then pads with empty columns and
 * folds the overflow into the last one, so `::: cols 2` keeps two tracks however many `::` the post
 * happens to carry.
 */
function columnRanges(state: StateBlock, start: number, end: number, fixedCount: number | null) {
  const separators = scanColonMarks(state, start, end).filter((mark) => mark.alone).map((mark) => mark.line)
  const starts = [start, ...separators.map((line) => line + 1)]
  const ranges = starts.map((from, index) => ({ start: from, end: separators[index] ?? end }))
  while (ranges.length > 1 && isBlankRange(state, ranges[ranges.length - 1]!.start, ranges[ranges.length - 1]!.end)) ranges.pop()
  const count = Math.min(fixedCount ?? ranges.length, MAX_PANEL_COLUMNS)
  if (!Number.isFinite(count) || count < 1) return ranges.slice(0, 1)
  if (ranges.length > count) return mergeToColumnCount(ranges, count, end)
  while (ranges.length < count) ranges.push({ start: end, end })
  return ranges
}

function renderAlignContainer(state: StateBlock, startLine: number, end: number, align: AlignValue): void {
  const open = state.push('panel_align_open', 'div', 1)
  open.block = true
  open.meta = { align }
  state.md.block.tokenize(state, startLine + 1, end)
  state.push('panel_align_close', 'div', -1).block = true
}

function renderColsContainer(state: StateBlock, startLine: number, end: number, options: ColsOptions): void {
  const ranges = columnRanges(state, startLine + 1, end, options.fixedCount)
  const open = state.push('panel_cols_open', 'div', 1)
  open.block = true
  open.meta = { options, count: ranges.length }
  ranges.forEach((range, index) => {
    const colOpen = state.push('panel_col_open', 'div', 1)
    colOpen.block = true
    colOpen.meta = { index }
    state.md.block.tokenize(state, range.start, range.end)
    state.push('panel_col_close', 'div', -1).block = true
  })
  state.push('panel_cols_close', 'div', -1).block = true
}

function timelineNodes(state: StateBlock, start: number, end: number) {
  const marks = scanColonMarks(state, start, end)
  return marks.map((mark, index) => ({
    item: parseTimelineItem(mark.head),
    start: mark.line + 1,
    end: marks[index + 1]?.line ?? end,
  }))
}

/**
 * Turns the soft breaks of the node's own paragraphs into hard breaks.
 *
 * A timeline node is written as a stack of short lines and they are meant to read as separate lines;
 * markdown-it would join them into one flowing paragraph. Only paragraphs sitting directly in the node
 * are touched, so a list, quote or table inside the node keeps the same line rules as everywhere else.
 */
function hardBreakOwnParagraphs(tokens: Token[], from: number, to: number): void {
  let depth = 0
  for (let index = from; index < to; index++) {
    const token = tokens[index]!
    if (token.nesting === 1) depth++
    if (depth === 1 && token.type === 'inline' && token.content.includes('\n'))
      token.content = token.content.replace(/\n/g, '\\\n')
    if (token.nesting === -1) depth--
  }
}

function renderTimelineContainer(state: StateBlock, startLine: number, end: number, title: string): void {
  const nodes = timelineNodes(state, startLine + 1, end)
  const open = state.push('panel_timeline_open', 'div', 1)
  open.block = true
  open.meta = { title }
  nodes.forEach((node) => {
    const item = state.push('timeline_item_open', 'li', 1)
    item.block = true
    item.meta = { item: node.item }
    const bodyFrom = state.tokens.length
    state.md.block.tokenize(state, node.start, node.end)
    hardBreakOwnParagraphs(state.tokens, bodyFrom, state.tokens.length)
    state.push('timeline_item_close', 'li', -1).block = true
  })
  state.push('panel_timeline_close', 'div', -1).block = true
}

/** A `::: tip` draws the same `<aside class="callout">` as `> [!tip]`, so the two spellings cannot drift. */
function renderCalloutContainer(state: StateBlock, startLine: number, end: number, callout: CalloutHeader): void {
  const tag = callout.fold ? 'details' : 'aside'
  const open = state.push('callout_open', tag, 1)
  open.block = true
  open.meta = { type: callout.type, title: callout.title || calloutDefaultTitle(callout.type), fold: callout.fold }
  state.md.block.tokenize(state, startLine + 1, end)
  const close = state.push('callout_close', tag, -1)
  close.block = true
  close.meta = { fold: callout.fold }
}

/** Draws one panel block. The `tabs` kind stays with `rules/block.ts`, which already owns its options. */
export function renderPanelContainer(state: StateBlock, startLine: number, end: number, panel: PanelHeaderMatch): void {
  const header: PanelHeader = panel.header
  switch (header.kind) {
    case 'align':
      renderAlignContainer(state, startLine, end, header.align)
      return
    case 'cols':
      renderColsContainer(state, startLine, end, header.cols)
      return
    case 'timeline':
      renderTimelineContainer(state, startLine, end, header.title)
      return
    case 'callout':
      renderCalloutContainer(state, startLine, end, header.callout)
      return
    default:
      // `tabs` reaches here only if the dispatch in `rules/block.ts` ever changes; a tabs block has
      // no container of its own, so there is nothing to draw and staying silent would lose the body.
      throw new Error(`panel container kind '${header.kind}' is dispatched elsewhere`)
  }
}

/** The `:: 标题` spelling of a tabs block, which reads the same panels as `@tab` does. */
export function findColonTabSegments(state: StateBlock, start: number, end: number): PanelTabSegment[] {
  const marks = scanColonMarks(state, start, end)
  return marks.map((mark, index) => ({
    title: stripBracketTitle(mark.head) || DEFAULT_TAB_TITLE,
    start: mark.line + 1,
    end: marks[index + 1]?.line ?? end,
    selected: false,
  }))
}

const TIMELINE_STATUS_KEYS: Record<TimelineStatus, MessageKey> = {
  todo: 'markdown.timeline_todo',
  doing: 'markdown.timeline_doing',
  done: 'markdown.timeline_done',
  milestone: 'markdown.timeline_milestone',
  error: 'markdown.timeline_error',
}

/**
 * The node's date, machine-readable in `data-datetime` when the word really is one. A `<time>` element
 * would be the semantic choice, but it is not on the prose whitelist, so the span is what survives.
 */
function timeMarkup(time: string): string {
  if (!time) return ''
  const datetime = /^\d{4}-\d{2}(?:-\d{2})?$/.test(time) ? ` data-datetime="${escapeAttr(time)}"` : ''
  return `<span class="markdown-timeline-time"${datetime}>${escapeHtml(time)}</span>`
}

function timelineHead(item: TimelineItem, env: RenderEnv | undefined, md: InstanceType<typeof MarkdownIt>): string {
  const locale: BlogLocale = env?.locale ?? DEFAULT_LOCALE
  const status = `<span class="markdown-timeline-status">${escapeHtml(t(TIMELINE_STATUS_KEYS[item.status], {}, locale))}</span>`
  const title = renderInlineLabel(md, item.title, (env ?? {}) as Record<string, unknown>)
  return `<div class="markdown-timeline-head">${timeMarkup(item.time)}<span class="markdown-timeline-title">${title}</span>${status}</div>`
}

export function registerPanels(md: InstanceType<typeof MarkdownIt>): void {
  md.renderer.rules.panel_align_open = (tokens, index) => {
    const { align } = tokens[index]!.meta as { align: AlignValue }
    return `<div class="markdown-align" data-align="${escapeAttr(align)}">`
  }
  md.renderer.rules.panel_align_close = () => '</div>'
  md.renderer.rules.panel_cols_open = (tokens, index) => {
    const { options, count } = tokens[index]!.meta as { options: ColsOptions; count: number }
    const attrs = [
      ` data-cols="${count}"`,
      options.gap === 'normal' ? '' : ` data-cols-gap="${escapeAttr(options.gap)}"`,
      options.divider ? ' data-cols-divider="true"' : '',
      options.align ? ` data-cols-align="${escapeAttr(options.align)}"` : '',
      options.tracks ? ` data-cols-tracks="${escapeAttr(options.tracks)}"` : '',
    ].join('')
    return `<div class="markdown-cols"${attrs}>`
  }
  md.renderer.rules.panel_cols_close = () => '</div>'
  md.renderer.rules.panel_col_open = (tokens, index) => `<div class="markdown-col" data-col="${(tokens[index]!.meta as { index: number }).index}">`
  md.renderer.rules.panel_col_close = () => '</div>'
  md.renderer.rules.panel_timeline_open = (tokens, index, _options, env) => {
    const { title } = tokens[index]!.meta as { title: string }
    const rendered = title ? renderInlineLabel(md, title, (env ?? {}) as Record<string, unknown>) : ''
    const caption = title ? `<div class="markdown-timeline-caption">${rendered}</div>` : ''
    return `<div class="markdown-timeline-block">${caption}<ol class="markdown-timeline">`
  }
  md.renderer.rules.panel_timeline_close = () => '</ol></div>'
  md.renderer.rules.timeline_item_open = (tokens, index, _options, env) => {
    const { item } = tokens[index]!.meta as { item: TimelineItem }
    const head = timelineHead(item, env as RenderEnv | undefined, md)
    return `<li class="markdown-timeline-item" data-status="${escapeAttr(item.status)}"><span class="markdown-timeline-node" aria-hidden="true"></span><div class="markdown-timeline-body">${head}`
  }
  md.renderer.rules.timeline_item_close = () => '</div></li>'
}
