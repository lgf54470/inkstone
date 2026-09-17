import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppLocale } from '@shared/types'
import { parseKanbanBody } from './body'
import type { KanbanBlockEntry } from './entry'
import type { KanbanData, KanbanWriter } from './types'
import { KanbanRoot } from './ui'
import {
  createKanbanCanvas,
  decorateKanbanControls,
  isKanbanWritableHere,
  kanbanBlocks,
  kanbanBody,
  kanbanIndex,
  kanbanPlaceholder,
  markKanbanLoading,
  markKanbanReady,
  showKanbanError,
} from './view'
import { flushKanbanEntry, scheduleKanbanWrite } from './write'

export interface KanbanMountOptions {
  scope: string
  noteId: string | null
  dark: boolean
  locale: AppLocale
  editable: boolean
  writeBack?: KanbanWriter
  onOpenFullscreen?: (node: HTMLElement) => void
}

interface Assignment {
  node: HTMLElement
  entry: KanbanBlockEntry
}

const entries = new Map<string, KanbanBlockEntry>()
const listeners = new Set<(scope: string) => void>()
const scopeOptions = new Map<string, KanbanMountOptions>()
let pendingKey = 0

export function kanbanEntryKey(scope: string, index: number): string {
  return `${scope}#${index}`
}

export function kanbanEntryForNode(node: HTMLElement): KanbanBlockEntry | null {
  for (const entry of entries.values()) {
    if (entry.host === node) return entry
  }
  return null
}

export function subscribeKanbans(listener: (scope: string) => void): () => void {
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

function assignEntries(nodes: HTMLElement[], options: KanbanMountOptions): Assignment[] {
  const taken = new Set<KanbanBlockEntry>()
  const assignments: Assignment[] = []

  for (const node of nodes) {
    const body = kanbanBody(node)
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
    const keyed = entries.get(kanbanEntryKey(options.scope, kanbanIndex(node)))
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
    const index = kanbanIndex(node)
    const key = kanbanEntryKey(options.scope, index)
    if (entry.key !== key) entries.delete(entry.key)
    entry.key = key
    entry.index = index
    entries.set(key, entry)
  }

  return assignments
}

function createEntry(node: HTMLElement, options: KanbanMountOptions): KanbanBlockEntry {
  const created: KanbanBlockEntry = {
    key: `${options.scope}@new-${++pendingKey}`,
    scope: options.scope,
    noteId: options.noteId,
    index: kanbanIndex(node),
    host: node,
    source: kanbanBody(node),
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
    dirty: false,
    timer: null,
  }
  entries.set(created.key, created)
  return created
}

/**
 * Tears one block's React root down. The unmount is deferred by a microtask because both callers run
 * inside the host tree's own commit — the preview re-renders, a block leaves the note, and React
 * refuses to take one root down from inside another root's render: it warns and leaves the teardown to
 * race the commit it interrupted.
 */
function disposeEntry(entry: KanbanBlockEntry): void {
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  const root = entry.root
  if (root) queueMicrotask(() => root.unmount())
}

function renderKanbanEntry(entry: KanbanBlockEntry, options: KanbanMountOptions): void {
  if (!entry.root || !entry.data) return
  entry.root.render(
    createElement(KanbanRoot, {
      initialData: entry.data,
      onUpdateData: (next) => updateKanbanData(entry, () => next),
      onToggleFullscreen: () => options.onOpenFullscreen?.(entry.host),
    }),
  )
}

function mountBlock(node: HTMLElement, entry: KanbanBlockEntry, options: KanbanMountOptions): void {
  const body = kanbanBody(node)
  entry.host = node
  entry.noteId = options.noteId
  decorateKanbanControls(node)
  entry.dark = options.dark
  entry.locale = options.locale
  entry.ref = isKanbanWritableHere(node) ? { line: Number(node.dataset.line), body } : null
  entry.write = options.writeBack ?? null
  entry.editable = options.editable && entry.ref !== null

  if (!entry.container) {
    entry.container = createKanbanCanvas(entry.editable)
    entry.root = createRoot(entry.container)
  }

  const placeholder = kanbanPlaceholder(node)
  if (placeholder && entry.owner === 'inline' && entry.container.parentNode !== placeholder) {
    placeholder.replaceChildren(entry.container)
  }

  if (entry.source !== body || !entry.data) {
    entry.source = body
    const parsed = parseKanbanBody(body)
    if (!parsed.ok) {
      showKanbanError(node, parsed.error)
      return
    }
    entry.data = parsed.data
    entry.mode = parsed.mode
  }

  renderKanbanEntry(entry, options)
  markKanbanReady(node)
  notify(entry.scope)
}

export async function mountKanbans(root: HTMLElement, options: KanbanMountOptions): Promise<void> {
  scopeOptions.set(options.scope, options)
  const blocks = kanbanBlocks(root)
  const assignments = assignEntries(blocks, options)

  for (const { node, entry } of assignments) {
    markKanbanLoading(node)
    mountBlock(node, entry, options)
  }

  for (const [key, entry] of entries) {
    if (entry.scope === options.scope && !assignments.some((a) => a.entry === entry)) {
      disposeEntry(entry)
      entries.delete(key)
    }
  }
}

export function updateKanbanData(entry: KanbanBlockEntry, updater: (prev: KanbanData) => KanbanData): void {
  if (!entry.data) return
  entry.data = updater(entry.data)
  scheduleKanbanWrite(entry)
  const opts = scopeOptions.get(entry.scope)
  if (opts) renderKanbanEntry(entry, opts)
}

export function attachKanbanToOverlay(entry: KanbanBlockEntry, target: HTMLElement): void {
  entry.owner = 'overlay'
  if (entry.container) target.append(entry.container)
}

export function detachKanbanFromOverlay(entry: KanbanBlockEntry): void {
  entry.owner = 'inline'
  const placeholder = kanbanPlaceholder(entry.host)
  if (placeholder && entry.container) {
    placeholder.replaceChildren(entry.container)
  }
}

export async function retryKanban(node: HTMLElement): Promise<void> {
  const entry = kanbanEntryForNode(node)
  if (!entry) return
  const options = scopeOptions.get(entry.scope)
  if (!options) return
  mountBlock(node, entry, options)
}

export function flushKanbans(scope: string): void {
  for (const entry of entries.values()) {
    if (entry.scope === scope) flushKanbanEntry(entry)
  }
}

export function destroyKanbans(scope: string): void {
  for (const [key, entry] of entries) {
    if (entry.scope === scope) {
      disposeEntry(entry)
      entries.delete(key)
    }
  }
  scopeOptions.delete(scope)
}
