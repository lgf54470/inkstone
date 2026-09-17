import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppLocale } from '@shared/types'
import { parseSlidesBody } from './body'
import type { SlidesBlockEntry } from './entry'
import type { BentoDoc, SlidesWriter } from './types'
import { SlidesRoot } from './ui'
import {
  createSlidesCanvas,
  decorateSlidesControls,
  isSlidesWritableHere,
  markSlidesLoading,
  markSlidesReady,
  showSlidesError,
  slidesBlocks,
  slidesBody,
  slidesIndex,
  slidesPlaceholder,
} from './view'
import { flushSlidesEntry, scheduleSlidesWrite } from './write'

export interface SlidesMountOptions {
  scope: string
  noteId: string | null
  dark: boolean
  locale: AppLocale
  editable: boolean
  writeBack?: SlidesWriter
  onOpenFullscreen?: (node: HTMLElement) => void
  /** Told when a body leaves the outline syntax, so the host can say so once. */
  onNotice?: () => void
  /** Told whether the block whose key this is has an edit still waiting for its write. */
  onPendingChange?: (key: string, pending: boolean) => void
}

interface Assignment {
  node: HTMLElement
  entry: SlidesBlockEntry
}

const entries = new Map<string, SlidesBlockEntry>()
const listeners = new Set<(scope: string) => void>()
const scopeOptions = new Map<string, SlidesMountOptions>()
let pendingKey = 0

export function slidesEntryKey(scope: string, index: number): string {
  return `${scope}#${index}`
}

export function slidesEntryForNode(node: HTMLElement): SlidesBlockEntry | null {
  for (const entry of entries.values()) {
    if (entry.host === node) return entry
  }
  return null
}

export function subscribeSlides(listener: (scope: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(scope: string): void {
  queueMicrotask(() => {
    for (const listener of [...listeners]) listener(scope)
  })
}

function assignEntries(nodes: HTMLElement[], options: SlidesMountOptions): Assignment[] {
  const taken = new Set<SlidesBlockEntry>()
  const assignments: Assignment[] = []

  for (const node of nodes) {
    const body = slidesBody(node)
    const match = [...entries.values()].find(
      (e) => e.scope === options.scope && e.source === body && !taken.has(e),
    )
    if (match) {
      taken.add(match)
      assignments.push({ node, entry: match })
    }
  }

  for (const node of nodes) {
    if (assignments.some((a) => a.node === node)) continue
    const keyed = entries.get(slidesEntryKey(options.scope, slidesIndex(node)))
    if (keyed && !taken.has(keyed)) {
      taken.add(keyed)
      assignments.push({ node, entry: keyed })
      continue
    }
    const created = createEntry(node, options)
    taken.add(created)
    assignments.push({ node, entry: created })
  }

  for (const { node, entry } of assignments) {
    const index = slidesIndex(node)
    const key = slidesEntryKey(options.scope, index)
    if (entry.key !== key) entries.delete(entry.key)
    entry.key = key
    entry.index = index
    entries.set(key, entry)
  }

  return assignments
}

function createEntry(node: HTMLElement, options: SlidesMountOptions): SlidesBlockEntry {
  const created: SlidesBlockEntry = {
    key: `${options.scope}@new-${++pendingKey}`,
    scope: options.scope,
    noteId: options.noteId,
    index: slidesIndex(node),
    host: node,
    source: slidesBody(node),
    data: null,
    mode: 'json',
    editable: options.editable,
    owner: 'inline',
    dark: options.dark,
    locale: options.locale,
    container: null,
    root: null,
    ref: null,
    write: options.writeBack ?? null,
    notice: options.onNotice ?? null,
    report: null,
    dirty: false,
    timer: null,
  }
  created.report = reportFor(created, options)
  entries.set(created.key, created)
  return created
}

/** The entry's key is reassigned as blocks are matched to nodes, so the callback reads it late. */
function reportFor(
  entry: SlidesBlockEntry,
  options: SlidesMountOptions,
): ((pending: boolean) => void) | null {
  const report = options.onPendingChange
  if (!report) return null
  return (pending) => report(entry.key, pending)
}

function renderSlidesEntry(entry: SlidesBlockEntry, options: SlidesMountOptions): void {
  if (!entry.root || !entry.data) return
  entry.root.render(
    createElement(SlidesRoot, {
      initialData: entry.data,
      onUpdateData: (next) => updateSlidesData(entry, () => next),
      onToggleFullscreen: () => options.onOpenFullscreen?.(entry.host),
    }),
  )
}

function mountBlock(node: HTMLElement, entry: SlidesBlockEntry, options: SlidesMountOptions): void {
  const body = slidesBody(node)
  entry.host = node
  entry.noteId = options.noteId
  decorateSlidesControls(node)
  entry.dark = options.dark
  entry.locale = options.locale
  entry.ref = isSlidesWritableHere(node) ? { line: Number(node.dataset.line), body } : null
  entry.write = options.writeBack ?? null
  entry.notice = options.onNotice ?? null
  entry.report = reportFor(entry, options)

  const parsed = parseSlidesBody(body)
  if (!parsed.ok) {
    showSlidesError(node, parsed.error)
    return
  }

  if (!entry.container) {
    entry.container = createSlidesCanvas(options.editable)
    const placeholder = slidesPlaceholder(node)
    if (placeholder) placeholder.replaceChildren(entry.container)
    else node.append(entry.container)
    entry.root = createRoot(entry.container)
  }

  if (entry.source !== body || !entry.data) {
    entry.source = body
    entry.data = parsed.data
    entry.mode = parsed.mode
  }

  renderSlidesEntry(entry, options)
  markSlidesReady(node)
  notify(entry.scope)
}

export async function mountBentoSlides(root: HTMLElement, options: SlidesMountOptions): Promise<void> {
  scopeOptions.set(options.scope, options)
  const blocks = slidesBlocks(root)
  const assignments = assignEntries(blocks, options)

  for (const { node, entry } of assignments) {
    markSlidesLoading(node)
    mountBlock(node, entry, options)
  }

  for (const [key, entry] of entries) {
    if (entry.scope === options.scope && !assignments.some((a) => a.entry === entry)) {
      if (entry.timer !== null) window.clearTimeout(entry.timer)
      entry.root?.unmount()
      entries.delete(key)
    }
  }
}

export function updateSlidesData(entry: SlidesBlockEntry, updater: (prev: BentoDoc) => BentoDoc): void {
  if (!entry.data) return
  entry.data = updater(entry.data)
  scheduleSlidesWrite(entry)
  const opts = scopeOptions.get(entry.scope)
  if (opts) renderSlidesEntry(entry, opts)
}

export function attachSlidesToOverlay(entry: SlidesBlockEntry, target: HTMLElement): void {
  entry.owner = 'overlay'
  if (entry.container) target.append(entry.container)
}

export function detachSlidesFromOverlay(entry: SlidesBlockEntry): void {
  entry.owner = 'inline'
  const placeholder = slidesPlaceholder(entry.host)
  if (placeholder && entry.container) {
    placeholder.replaceChildren(entry.container)
  }
}

export function flushBentoSlides(scope: string): void {
  for (const entry of entries.values()) {
    if (entry.scope === scope) flushSlidesEntry(entry)
  }
}

export function destroyBentoSlides(scope: string): void {
  for (const [key, entry] of entries) {
    if (entry.scope === scope) {
      if (entry.timer !== null) window.clearTimeout(entry.timer)
      entry.root?.unmount()
      entries.delete(key)
    }
  }
  scopeOptions.delete(scope)
}
