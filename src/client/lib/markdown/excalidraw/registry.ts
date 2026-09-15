/**
 * Live whiteboard instances, one per block; the write-back itself lives in ./write.
 *
 * The preview re-renders by replacing the note's HTML wholesale, which destroys every
 * node inside it — including a board's DOM. So the registry owns the board's own element
 * (`container`) and re-parents it into the placeholder of each new render: the React root
 * inside it, its camera, its selection and its undo stack all survive a keystroke in the
 * editor. That re-parenting is what makes two-way editing feel native.
 *
 * Blocks are matched to entries by their body first and by their number second, so
 * inserting a board above another one moves the instance with its text instead of
 * feeding it the neighbour's.
 */
import type { AppLocale } from '@shared/types'
import { errorMessage } from '../../errors'
import type { ExcalidrawBlockEntry } from './entry'
import { loadExcalidrawVendor } from './loader'
import type { ExcalidrawVendorLoader, ExcalidrawWriter } from './types'
import { flushEntry, scheduleWrite } from './write'
import {
  createExcalidrawCanvas,
  decorateExcalidrawControls,
  excalidrawBlocks,
  excalidrawBody,
  excalidrawIndex,
  EXCALIDRAW_CANVAS_SELECTOR,
  EXCALIDRAW_PLACEHOLDER_SELECTOR,
  isExcalidrawWritableHere,
  markExcalidrawLoading,
  markExcalidrawReady,
  showExcalidrawError,
  showExcalidrawSource,
} from './view'

export type { ExcalidrawBlockEntry } from './entry'

export interface ExcalidrawMountOptions {
  /** Stable id of the surface that owns these blocks (one per preview instance). */
  scope: string
  noteId: string | null
  dark: boolean
  locale: AppLocale
  editable: boolean
  writeBack?: ExcalidrawWriter
  loadVendor?: ExcalidrawVendorLoader
}

interface Assignment {
  node: HTMLElement
  entry: ExcalidrawBlockEntry
}

const entries = new Map<string, ExcalidrawBlockEntry>()
const listeners = new Set<(scope: string) => void>()
/** Last mount options per surface, so a retry can rebuild a block on its own. */
const scopeOptions = new Map<string, ExcalidrawMountOptions>()
/**
 * Mount passes per surface. A pass spans awaits (the vendor chunk, the board build), and
 * a re-render can start a newer one while an older pass is still in flight; the older
 * pass must then keep its hands off — its `assignments` describe the markup it was
 * handed, and pruning against them would tear down the entries the newer pass just
 * installed.
 */
const passTokens = new Map<string, number>()
let pendingKey = 0

function beginPass(scope: string): number {
  const token = (passTokens.get(scope) ?? 0) + 1
  passTokens.set(scope, token)
  return token
}

function isCurrentPass(scope: string, token: number): boolean {
  return passTokens.get(scope) === token
}

export function excalidrawEntryKey(scope: string, index: number): string {
  return `${scope}#${index}`
}

/**
 * The library binds its shortcuts to DOM focus on its own container, which a pointer
 * interaction does not grant: after clicking a shape, Tab, Delete, Ctrl+Z and the tool
 * keys would act on the note instead of the board. Pointer-down inside a live canvas
 * therefore hands the board the focus before its own handler runs.
 */
export function captureExcalidrawFocus(root: ParentNode): () => void {
  const onPointerDown = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[contenteditable="true"], input, textarea')) return
    const canvas = target.closest<HTMLElement>(EXCALIDRAW_CANVAS_SELECTOR)
    if (!canvas) return
    for (const entry of entries.values()) {
      if (entry.container === canvas) {
        entry.handle?.focus()
        return
      }
    }
  }
  root.addEventListener('pointerdown', onPointerDown, true)
  return () => root.removeEventListener('pointerdown', onPointerDown, true)
}

/**
 * A right-click inside a live board that sits in the note belongs to the note, the way it
 * does on every other block: the note's own menu offers the actions this app has for a
 * fence (copy its source, jump to it), and the library's canvas menu would open on top of
 * it. The library's handler sits on the canvas and ours on the surface around it, so the
 * event is re-aimed at the block before the board can see it — which leaves exactly one
 * menu open.
 *
 * This covers the blocks in the note, not the full screen overlay: that one is portaled
 * outside this host, so the re-aim never runs there and the board keeps its own menu
 * (the overlay guard in features/preview keeps the note's out of it).
 */
export function captureExcalidrawContextMenu(root: ParentNode): () => void {
  const onContextMenu = (event: Event) => {
    const target = event.target
    if (!(event instanceof MouseEvent) || !(target instanceof Element)) return
    const canvas = target.closest<HTMLElement>(EXCALIDRAW_CANVAS_SELECTOR)
    const block = canvas?.closest<HTMLElement>('[data-excalidraw]')
    if (!canvas || !block) return
    event.preventDefault()
    event.stopPropagation()
    block.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
    }))
  }
  root.addEventListener('contextmenu', onContextMenu, true)
  return () => root.removeEventListener('contextmenu', onContextMenu, true)
}

/** The entry a block element belongs to, whatever key it currently holds. */
export function excalidrawEntryForNode(node: HTMLElement): ExcalidrawBlockEntry | null {
  for (const entry of entries.values()) {
    if (entry.host === node) return entry
  }
  return null
}

/** The header's fit control; a no-op while the block is still loading. */
export function fitExcalidrawBlock(node: HTMLElement): void {
  excalidrawEntryForNode(node)?.handle?.scrollToContent()
}

/** Notifies when a block becomes ready or changes owner. */
export function subscribeExcalidraws(listener: (scope: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Listeners are told on a microtask: a mount pass runs inside the preview's commit
 * phase, and a listener's state update must not land there.
 */
function notify(scope: string): void {
  queueMicrotask(() => {
    for (const listener of [...listeners]) listener(scope)
  })
}

export async function mountExcalidraws(root: HTMLElement, options: ExcalidrawMountOptions): Promise<void> {
  const load = options.loadVendor ?? loadExcalidrawVendor
  scopeOptions.set(options.scope, options)
  const pass = beginPass(options.scope)
  const blocks = excalidrawBlocks(root)
  // A block inside an embedded note or a markdown example mirrors another document:
  // it shows its scene instead of running a writable board of its own.
  const nested = blocks.filter((node) => !options.editable || !isExcalidrawWritableHere(node))
  const assignments = assignEntries(blocks.filter((node) => !nested.includes(node)), options, load)
  for (const { node, entry } of assignments) {
    if (!isCurrentPass(options.scope, pass)) return
    try {
      await mountBlock(node, entry, options)
    }
    catch (err) {
      showExcalidrawError(node, errorMessage(err))
    }
  }
  if (!isCurrentPass(options.scope, pass)) return
  pruneScope(options.scope, new Set(assignments.map(({ entry }) => entry)))
  for (const node of nested) showExcalidrawSource(node)
}

/** Entry per block: same body first (it moved), then the same number (it was edited). */
function assignEntries(nodes: HTMLElement[], options: ExcalidrawMountOptions, load: ExcalidrawVendorLoader): Assignment[] {
  const assignments: Assignment[] = []
  const taken = new Set<ExcalidrawBlockEntry>()
  for (const node of nodes) {
    const body = excalidrawBody(node)
    const match = [...entries.values()].find(
      (entry) => entry.scope === options.scope && entry.source === body && !taken.has(entry),
    )
    if (match) {
      taken.add(match)
      assignments.push({ node, entry: match })
    }
  }
  for (const node of nodes) {
    if (assignments.some((assignment) => assignment.node === node)) continue
    const keyed = entries.get(excalidrawEntryKey(options.scope, excalidrawIndex(node)))
    if (keyed && !taken.has(keyed)) {
      taken.add(keyed)
      assignments.push({ node, entry: keyed })
      continue
    }
    const created = createEntry(node, options, load)
    taken.add(created)
    assignments.push({ node, entry: created })
  }
  for (const { node, entry } of assignments) {
    const index = excalidrawIndex(node)
    const key = excalidrawEntryKey(options.scope, index)
    if (entry.key !== key) entries.delete(entry.key)
    entry.key = key
    entry.index = index
    entries.set(key, entry)
  }
  return assignments
}

function createEntry(node: HTMLElement, options: ExcalidrawMountOptions, load: ExcalidrawVendorLoader): ExcalidrawBlockEntry {
  const created: ExcalidrawBlockEntry = {
    // Temporary key: assignEntries() rekeys every entry once it owns a block.
    key: `${options.scope}@new-${++pendingKey}`,
    scope: options.scope,
    noteId: options.noteId,
    index: excalidrawIndex(node),
    host: node,
    source: excalidrawBody(node),
    scene: null,
    editable: options.editable,
    owner: 'inline',
    dark: options.dark,
    locale: options.locale,
    load,
    vendor: null,
    handle: null,
    container: null,
    observer: null,
    ref: null,
    write: options.writeBack ?? null,
    dirty: false,
    timer: null,
    pending: null,
  }
  entries.set(created.key, created)
  return created
}

async function mountBlock(node: HTMLElement, entry: ExcalidrawBlockEntry, options: ExcalidrawMountOptions): Promise<void> {
  const body = excalidrawBody(node)
  entry.host = node
  entry.noteId = options.noteId
  decorateExcalidrawControls(node)
  const themeChanged = entry.dark !== options.dark
  entry.dark = options.dark
  entry.locale = options.locale
  entry.load = options.loadVendor ?? loadExcalidrawVendor
  entry.ref = isExcalidrawWritableHere(node) ? { line: Number(node.dataset.line), body } : null
  entry.write = options.writeBack ?? null
  entry.editable = options.editable && entry.ref !== null
  if (entry.handle) {
    placeContainer(entry)
    if (themeChanged) entry.handle.setTheme(options.dark)
    syncEntry(entry, body)
    return
  }
  await createInstance(entry)
}

/** The fence changed in the editor: keep the board, load the new scene into it. */
function syncEntry(entry: ExcalidrawBlockEntry, body: string): void {
  if (entry.source === body) return
  entry.source = body
  const { vendor, handle } = entry
  if (!vendor || !handle) return
  const parsed = vendor.parse(body)
  if (!parsed.ok) {
    showExcalidrawError(entry.host, parsed.error)
    return
  }
  entry.scene = parsed.scene
  handle.updateScene(parsed.scene)
  markExcalidrawReady(entry.host)
  notify(entry.scope)
}

/** Two passes can reach the same entry when a re-render lands mid-mount, so they share one build. */
function createInstance(entry: ExcalidrawBlockEntry): Promise<void> {
  entry.pending ??= buildInstance(entry).finally(() => {
    entry.pending = null
  })
  return entry.pending
}

async function buildInstance(entry: ExcalidrawBlockEntry): Promise<void> {
  markExcalidrawLoading(entry.host)
  const vendor = await entry.load()
  if (entries.get(entry.key) !== entry) return
  const parsed = vendor.parse(entry.source)
  if (!parsed.ok) {
    showExcalidrawError(entry.host, parsed.error)
    return
  }
  const container = createExcalidrawCanvas(entry.editable)
  entry.vendor = vendor
  entry.scene = parsed.scene
  entry.container = container
  // The library measures its container as it starts, so the canvas has to be in the
  // document (inside the placeholder that gives it its height) before it mounts.
  placeContainer(entry)
  entry.handle = vendor.create({
    el: container,
    scene: parsed.scene,
    dark: entry.dark,
    locale: entry.locale,
    editable: entry.editable,
    variant: 'inline',
    onChange: () => scheduleWrite(entry),
  })
  entry.observer = watchContainer(entry)
  markExcalidrawReady(entry.host)
  notify(entry.scope)
}

/** A pane resize changes the canvas box without a window resize, so the board is told. */
function watchContainer(entry: ExcalidrawBlockEntry): ResizeObserver {
  const observer = new ResizeObserver(() => {
    if (entry.container?.isConnected === true) entry.handle?.refresh()
  })
  if (entry.container) observer.observe(entry.container)
  return observer
}

/** Re-parents the board's element into the current placeholder (or leaves it in the overlay). */
function placeContainer(entry: ExcalidrawBlockEntry): void {
  const container = entry.container
  if (!container || entry.owner === 'overlay') return
  const target = entry.host.querySelector<HTMLElement>(EXCALIDRAW_PLACEHOLDER_SELECTOR) ?? entry.host
  if (container.parentElement !== target || target.childElementCount !== 1) target.replaceChildren(container)
}

function pruneScope(scope: string, keep: Set<ExcalidrawBlockEntry>): void {
  for (const entry of [...entries.values()]) {
    // Entries whose block is gone have nothing left to write to, so the final flush is
    // skipped; the ones that merely changed owner stay.
    if (entry.scope === scope && !keep.has(entry)) destroyEntry(entry, false)
  }
}

export function flushExcalidraws(scope: string): void {
  for (const entry of entries.values()) {
    if (entry.scope === scope) flushEntry(entry)
  }
}

export function destroyExcalidraws(scope: string): void {
  for (const entry of [...entries.values()]) {
    if (entry.scope === scope) destroyEntry(entry)
  }
}

export function destroyAllExcalidraws(): void {
  for (const entry of [...entries.values()]) destroyEntry(entry)
}

function destroyEntry(entry: ExcalidrawBlockEntry, flush = true): void {
  // Flushing on teardown keeps the last drawing of a closed pane.
  if (flush) flushEntry(entry)
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.observer?.disconnect()
  entry.observer = null
  entry.handle?.destroy()
  entry.container?.remove()
  entry.handle = null
  entry.vendor = null
  entry.container = null
  if (entries.get(entry.key) === entry) entries.delete(entry.key)
  notify(entry.scope)
}

/**
 * Builds a block again after a failed render: the retry button on the error banner has
 * no other way back, since the mount pass only runs when the note's markup is committed.
 */
export async function retryExcalidraw(node: HTMLElement): Promise<void> {
  const entry = excalidrawEntryForNode(node)
  const options = entry ? scopeOptions.get(entry.scope) : null
  if (entry) destroyEntry(entry, false)
  if (!options) return
  await mountExcalidraws(node.parentElement ?? node, options)
}

/**
 * Hands the live board to the full screen overlay: the same instance, so its camera,
 * selection and undo stack carry over and there is never a second copy of the same
 * board writing to the same note.
 */
export function attachExcalidrawToOverlay(entry: ExcalidrawBlockEntry, target: HTMLElement): void {
  if (!entry.container) return
  entry.owner = 'overlay'
  entry.container.classList.add('is-fullscreen')
  target.replaceChildren(entry.container)
  entry.handle?.setVariant('fullscreen')
  requestAnimationFrame(() => {
    entry.handle?.refresh()
    // The overlay is much larger than the block was: what the board drew is brought
    // to the middle, the way the map overlay fits its drawing on arrival.
    entry.handle?.scrollToContent()
  })
  notify(entry.scope)
}

export function detachExcalidrawFromOverlay(entry: ExcalidrawBlockEntry): void {
  if (!entry.container) return
  entry.owner = 'inline'
  entry.container.classList.remove('is-fullscreen')
  placeContainer(entry)
  entry.handle?.setVariant('inline')
  entry.handle?.refresh()
  notify(entry.scope)
}
