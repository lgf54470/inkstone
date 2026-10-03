import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import { escapeHtml } from '@shared/escape'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n'
import { blockLine, walkNonFenceLines } from './block-lines'
import type { BlockLineState } from './block-lines'
import { calloutDefaultTitle } from './obsidian'
import { MAX_PANEL_COLUMNS, parseTimelineItem } from './panel-options'
import type { AlignValue, CalloutHeader, ColsOptions, PanelHeaderMatch, TimelineItem, TimelineStatus } from './panel-options'
import { escapeAttr, stripBracketTitle } from './util'

/**
 * The `:::` panel family: a block whose header says what kind of block it is, and whose body is
 * ordinary markdown.
 *
 * Three of the five kinds split their body on a `::` line — columns on a bare `::`, tabs and the
 * timeline on a `::` that carries the tab title or the node's first line on the same row. The fourth
 * splitting rule the family needs is already in `containers.ts`, so a tabs block written with `@tab`
 * keeps working untouched and this module only supplies the `::` spelling.
 */


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
function scanColonMarks(state: BlockLineState, start: number, end: number): ColonMark[] {
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

function isBlankRange(state: BlockLineState, start: number, end: number): boolean {
  for (let line = start; line < end; line++) {
    if (blockLine(state, line).trim()) return false
  }
  return true
}

function mergeToColumnCount(ranges: Array<{ start: number; end: number }>, count: number, end: number): Array<{ start: number; end: number }> {
  return [...ranges.slice(0, count - 1), { start: ranges[count - 1]!.start, end }]
}

/**
 * The line ranges one column holds. A separator line is punctuation, so it belongs to no column: each
 * range stops at the mark and the next starts past it. A stated count then pads with empty columns and
 * folds the overflow into the last one, so `::: cols 2` keeps two tracks however many `::` the note
 * happens to carry.
 */
function columnRanges(state: BlockLineState, start: number, end: number, fixedCount: number | null): Array<{ start: number; end: number }> {
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
  open.map = [startLine, end + 1]
  open.meta = { align }
  state.md.block.tokenize(state, startLine + 1, end)
  state.push('panel_align_close', 'div', -1).block = true
}

function renderColsContainer(state: StateBlock, startLine: number, end: number, options: ColsOptions): void {
  const ranges = columnRanges(state, startLine + 1, end, options.fixedCount)
  const open = state.push('panel_cols_open', 'div', 1)
  open.block = true
  open.map = [startLine, end + 1]
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

function timelineNodes(state: BlockLineState, start: number, end: number): Array<{ item: TimelineItem; line: number; start: number; end: number }> {
  const marks = scanColonMarks(state, start, end)
  return marks.map((mark, index) => ({
    item: parseTimelineItem(mark.head),
    line: mark.line,
    start: mark.line + 1,
    end: marks[index + 1]?.line ?? end,
  }))
}

function renderTimelineContainer(state: StateBlock, startLine: number, end: number): void {
  const nodes = timelineNodes(state, startLine + 1, end)
  const open = state.push('panel_timeline_open', 'ol', 1)
  open.block = true
  open.map = [startLine, end + 1]
  nodes.forEach((node) => {
    const item = state.push('timeline_item_open', 'li', 1)
    item.block = true
    item.meta = { item: node.item, sourceLine: node.line }
    state.md.block.tokenize(state, node.start, node.end)
    state.push('timeline_item_close', 'li', -1).block = true
  })
  state.push('panel_timeline_close', 'ol', -1).block = true
}

/** A `::: tip` draws the same `<aside class="callout">` as `> [!tip]`, so the two spellings cannot drift. */
function renderCalloutContainer(state: StateBlock, startLine: number, end: number, callout: CalloutHeader): void {
  const tag = callout.fold ? 'details' : 'aside'
  const open = state.push('callout_open', tag, 1)
  open.block = true
  open.map = [startLine, end + 1]
  open.meta = { type: callout.type, title: callout.title || calloutDefaultTitle(callout.type), fold: callout.fold }
  state.md.block.tokenize(state, startLine + 1, end)
  const close = state.push('callout_close', tag, -1)
  close.block = true
  close.meta = { fold: callout.fold }
}

/**
 * Draws one panel block. The caller routes the `tabs` kind to `containers.ts`, which already owns its
 * options and its segment spellings, so no branch here reads it.
 */
export function renderPanelContainer(state: StateBlock, startLine: number, end: number, panel: PanelHeaderMatch): void {
  const header = panel.header
  if (header.kind === 'align') renderAlignContainer(state, startLine, end, header.align)
  if (header.kind === 'cols') renderColsContainer(state, startLine, end, header.cols)
  if (header.kind === 'timeline') renderTimelineContainer(state, startLine, end)
  if (header.kind === 'callout') renderCalloutContainer(state, startLine, end, header.callout)
}

/** The `:: Title` spelling of a tabs block, which reads the same panels as `@tab` does. */
export function findColonTabSegments(state: BlockLineState, start: number, end: number): PanelTabSegment[] {
  const marks = scanColonMarks(state, start, end)
  return marks.map((mark, index) => ({
    title: stripBracketTitle(mark.head) || t('common.tabs'),
    start: mark.line + 1,
    end: marks[index + 1]?.line ?? end,
    selected: false,
  }))
}

const TIMELINE_STATUS_KEYS: Record<TimelineStatus, MessageKey> = {
  todo: 'markdown.todo',
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

function sourceLineAttr(sourceLine: number | undefined): string {
  return sourceLine === undefined ? '' : ` data-line="${sourceLine}"`
}

export function registerPanels(md: MarkdownIt): void {
  md.renderer.rules.panel_align_open = (tokens, index) => {
    const { align } = tokens[index]!.meta as { align: AlignValue }
    return `<div class="markdown-align" data-align="${escapeAttr(align)}"${sourceLineAttr(tokens[index]!.map?.[0])}>`
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
    return `<div class="markdown-cols"${attrs}${sourceLineAttr(tokens[index]!.map?.[0])}>`
  }
  md.renderer.rules.panel_cols_close = () => '</div>'
  md.renderer.rules.panel_col_open = (tokens, index) => `<div class="markdown-col" data-col="${(tokens[index]!.meta as { index: number }).index}">`
  md.renderer.rules.panel_col_close = () => '</div>'
  md.renderer.rules.panel_timeline_open = (tokens, index) => `<ol class="markdown-timeline"${sourceLineAttr(tokens[index]!.map?.[0])}>`
  md.renderer.rules.panel_timeline_close = () => '</ol>'
  md.renderer.rules.timeline_item_open = (tokens, index) => {
    const { item, sourceLine } = tokens[index]!.meta as { item: TimelineItem; sourceLine: number }
    const status = `<span class="markdown-timeline-status">${escapeHtml(t(TIMELINE_STATUS_KEYS[item.status]))}</span>`
    const head = `<div class="markdown-timeline-head">${timeMarkup(item.time)}<span class="markdown-timeline-title">${md.renderInline(item.title)}</span>${status}</div>`
    return `<li class="markdown-timeline-item" data-status="${escapeAttr(item.status)}"${sourceLineAttr(sourceLine)}><span class="markdown-timeline-node" aria-hidden="true"></span><div class="markdown-timeline-body">${head}`
  }
  md.renderer.rules.timeline_item_close = () => '</div></li>'
}
