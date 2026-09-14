/**
 * Live mind map instances, one per block, plus the write-back that keeps the
 * note source in step with them.
 *
 * The preview re-renders by replacing the note's HTML wholesale, which destroys
 * every node inside it — including a map's DOM. So the registry owns the map's
 * own element (`container`) and re-parents it into the placeholder of each new
 * render: the instance, its camera, its selection and its undo stack all survive
 * a keystroke in the editor. That re-parenting is what makes two-way editing
 * feel native rather than a rebuild per keystroke.
 *
 * Blocks are matched to entries by their body first and by their number second,
 * so inserting a map above another one moves the instance with its text instead
 * of feeding it the neighbour's.
 */
import type { AppLocale } from '@shared/types'
import { errorMessage } from '../../errors'
import { t } from '../../i18n'
import { detectMindmapMode, normalizeEol, type MindmapMode } from './body'
import { loadMindmapVendor } from './loader'
import { watchMindmapContainer } from './resize'
import { renderStaticMindmapBlocks } from './static'
import type { MindmapFenceRef, MindmapHandle, MindmapVendor, MindmapVendorLoader, MindmapWriteResult, MindmapWriter } from './types'
import { MINDMAP_CANVAS_CLASS, MINDMAP_PLACEHOLDER_SELECTOR, decorateMindmapControls, disarmNativeFullscreen, isMindmapWritableHere, markMindmapLoading, markMindmapReady, mindmapBlocks, mindmapBody, mindmapIndex, showMindmapError } from './view'

/** Operations are coalesced: dragging a node fires many, the note gets one write. */
const WRITE_DEBOUNCE_MS = 400

export interface MindmapBlockEntry {
  key: string
  scope: string
  index: number
  host: HTMLElement
  mode: MindmapMode
  source: string
  extra: Record<string, unknown>
  editable: boolean
  owner: 'inline' | 'overlay'
  dark: boolean
  locale: AppLocale
  load: MindmapVendorLoader
  vendor: MindmapVendor | null
  handle: MindmapHandle | null
  container: HTMLElement | null
  /** Watches the inline container so a pane resize re-fits the drawing. */
  observer: ReturnType<typeof watchMindmapContainer>
  ref: MindmapFenceRef | null
  write: MindmapWriter | null
  dirty: boolean
  timer: number | null
  /** The instance currently being built for this block, shared by concurrent passes. */
  pending: Promise<void> | null
}

export interface MindmapMountOptions {
  /** Stable id of the surface that owns these blocks (one per preview instance). */
  scope: string
  noteId: string | null
  dark: boolean
  locale: AppLocale
  editable: boolean
  writeBack?: MindmapWriter
  loadVendor?: MindmapVendorLoader
}

interface Assignment {
  node: HTMLElement
  entry: MindmapBlockEntry
}

const entries = new Map<string, MindmapBlockEntry>()
const listeners = new Set<(scope: string) => void>()
/** Last mount options per surface, so a retry can rebuild a block on its own. */
const scopeOptions = new Map<string, MindmapMountOptions>()
/**
 * Mount passes per surface. A pass spans awaits (the vendor chunk, the instance
 * build), and a re-render can start a newer one while an older pass is still in
 * flight; the older pass must then keep its hands off — its `assignments`
 * describe the markup it was handed, and pruning against them would tear down
 * the entries the newer pass just installed (the live map included).
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

export function mindmapEntryKey(scope: string, index: number): string {
  return `${scope}#${index}`
}

/**
 * The library binds every shortcut to DOM focus on its inner container, which a
 * pointer interaction does not grant: after clicking a node the focus would stay
 * wherever it was (typically the editor in a split view), and Tab, typing,
 * Delete, Ctrl+Z and Alt+arrows would act on the note instead of the map.
 * Pointer-down inside a live canvas therefore hands the map the focus before its
 * own handler runs. Targeting the entry's element (not the clicked node) keeps
 * working across re-renders, and skipping its inline editor lets text input
 * reach it untouched.
 */
export function captureMindmapFocus(root: ParentNode): () => void {
  const onPointerDown = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[contenteditable="true"], input, textarea')) return
    if (!target.closest('[data-mindmap-canvas]')) return
    const entry = [...entries.values()].find((candidate) => candidate.container === target.closest('[data-mindmap-canvas]'))
    entry?.handle?.focus()
  }
  root.addEventListener('pointerdown', onPointerDown, true)
  return () => root.removeEventListener('pointerdown', onPointerDown, true)
}

/** The entry a block element belongs to, whatever key it currently holds. */
export function mindmapEntryForNode(node: HTMLElement): MindmapBlockEntry | null {
  for (const entry of entries.values()) {
    if (entry.host === node) return entry
  }
  return null
}

/** The header button of a live block; a no-op while the block is still loading. */
export function fitMindmapBlock(node: HTMLElement): void {
  mindmapEntryForNode(node)?.handle?.scaleFit()
}

/** Notifies when a block becomes ready, changes owner or starts editing. */
export function subscribeMindmaps(listener: (scope: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Listeners are told on a microtask: a mount pass runs inside the preview's
 * commit phase, and a listener's state update must not land there (React
 * rejects updates for one component during another's render/commit).
 */
function notify(scope: string): void {
  queueMicrotask(() => {
    for (const listener of [...listeners]) listener(scope)
  })
}

function untitledTopic(): string {
  return t('preview.mindmap_untitled')
}

export async function mountMindmaps(root: HTMLElement, options: MindmapMountOptions): Promise<void> {
  const load = options.loadVendor ?? loadMindmapVendor
  scopeOptions.set(options.scope, options)
  const pass = beginPass(options.scope)
  const blocks = mindmapBlocks(root)
  // A block inside an embedded note or a markdown example mirrors another
  // document: it gets a still picture instead of a live, writable instance.
  const nested = blocks.filter((node) => !options.editable || !isMindmapWritableHere(node))
  const assignments = assignEntries(blocks.filter((node) => !nested.includes(node)), options, load)
  for (const { node, entry } of assignments) {
    if (!isCurrentPass(options.scope, pass)) return
    try {
      await mountBlock(node, entry, options)
    }
    catch (err) {
      showMindmapError(node, errorMessage(err))
    }
  }
  if (!isCurrentPass(options.scope, pass)) return
  pruneScope(options.scope, new Set(assignments.map(({ entry }) => entry)))
  if (nested.length > 0) {
    // Best-effort: the snapshot path reports its own failures on the block.
    void renderStaticMindmapBlocks(nested, { dark: options.dark, locale: options.locale, loadVendor: load }).catch((err: unknown) => {
      console.warn('[inkstone] nested mind map snapshot failed', errorMessage(err))
    })
  }
}

/** Entry per block: same body first (it moved), then the same number (it was edited). */
function assignEntries(nodes: HTMLElement[], options: MindmapMountOptions, load: MindmapVendorLoader): Assignment[] {
  const assignments: Assignment[] = []
  const taken = new Set<MindmapBlockEntry>()
  for (const node of nodes) {
    const body = normalizeEol(mindmapBody(node))
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
    const keyed = entries.get(mindmapEntryKey(options.scope, mindmapIndex(node)))
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
    const index = mindmapIndex(node)
    const key = mindmapEntryKey(options.scope, index)
    if (entry.key !== key) entries.delete(entry.key)
    entry.key = key
    entry.index = index
    entries.set(key, entry)
  }
  return assignments
}

function createEntry(node: HTMLElement, options: MindmapMountOptions, load: MindmapVendorLoader): MindmapBlockEntry {
  const body = normalizeEol(mindmapBody(node))
  const created: MindmapBlockEntry = {
    // Temporary key: assignEntries() rekeys every entry once it owns a block.
    key: `${options.scope}@new-${++pendingKey}`,
    scope: options.scope,
    index: mindmapIndex(node),
    host: node,
    mode: detectMindmapMode(body),
    source: body,
    extra: {},
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

async function mountBlock(node: HTMLElement, entry: MindmapBlockEntry, options: MindmapMountOptions): Promise<void> {
  const body = normalizeEol(mindmapBody(node))
  entry.host = node
  decorateMindmapControls(node)
  // The instance outlives the markup it was built for, so a theme switch has to be handed to it.
  const themeChanged = entry.dark !== options.dark
  entry.dark = options.dark
  entry.locale = options.locale
  entry.load = options.loadVendor ?? loadMindmapVendor
  entry.ref = isMindmapWritableHere(node) ? { line: Number(node.dataset.line), body } : null
  entry.write = options.writeBack ?? null
  entry.editable = options.editable && entry.ref !== null
  if (entry.handle) {
    if (themeChanged) entry.handle.applyTheme(entry.dark)
    syncEntry(entry, body)
    placeContainer(entry)
    return
  }
  await createInstance(entry)
}

/** The fence changed in the editor: keep the instance, load the new data into it. */
function syncEntry(entry: MindmapBlockEntry, body: string): void {
  if (entry.source === body) return
  entry.source = body
  entry.mode = detectMindmapMode(body)
  const { vendor, handle } = entry
  if (!vendor || !handle) return
  const parsed = vendor.parse(body, entry.mode, untitledTopic())
  if (!parsed.ok) {
    showMindmapError(entry.host, parsed.error)
    return
  }
  entry.extra = parsed.extra
  handle.refresh(parsed.data)
  handle.clearHistory()
  handle.toCenter()
  markMindmapReady(entry.host)
  notify(entry.scope)
}

function createCanvas(entry: MindmapBlockEntry): HTMLElement {
  const container = document.createElement('div')
  container.className = MINDMAP_CANVAS_CLASS
  container.dataset.mindmapCanvas = '1'
  container.tabIndex = 0
  // A canvas-like widget: the library owns arrow keys, Tab and Enter inside it,
  // which is what `application` tells assistive tech to expect.
  container.setAttribute('role', 'application')
  container.setAttribute('aria-label', t('preview.mindmap'))
  if (!entry.editable) container.classList.add('is-readonly')
  return container
}

/**
 * Builds the library instance for a block. Two passes can reach the same entry
 * when a re-render lands mid-mount, so they share one build: two `create` calls
 * would leave an orphan instance bound to an element nothing renders.
 */
function createInstance(entry: MindmapBlockEntry): Promise<void> {
  entry.pending ??= buildInstance(entry).finally(() => {
    entry.pending = null
  })
  return entry.pending
}

async function buildInstance(entry: MindmapBlockEntry): Promise<void> {
  markMindmapLoading(entry.host)
  const vendor = await entry.load()
  if (entries.get(entry.key) !== entry) return
  const mode = detectMindmapMode(entry.source)
  const parsed = vendor.parse(entry.source, mode, untitledTopic())
  if (!parsed.ok) {
    showMindmapError(entry.host, parsed.error)
    return
  }
  const container = createCanvas(entry)
  entry.vendor = vendor
  entry.mode = mode
  entry.extra = parsed.extra
  // The library measures node boxes as it draws, so the canvas has to be in the
  // document (inside the placeholder that gives it its height) before init runs;
  // a detached one lays out as zeros and draws NaN link paths.
  entry.container = container
  placeContainer(entry)
  entry.handle = vendor.create({
    el: container,
    data: parsed.data,
    editable: entry.editable,
    dark: entry.dark,
    locale: entry.locale,
    newTopicName: t('preview.mindmap_new_topic'),
    modifierWheelZoom: true,
    onOperation: () => scheduleWrite(entry),
    onEditingChange: () => notify(entry.scope),
  })
  // The library's own full screen button cannot survive the re-parenting below,
  // so it hands over to the overlay rather than dropping out of the browser's
  // full screen on the first write.
  disarmNativeFullscreen(container)
  entry.observer = watchMindmapContainer(entry)
  markMindmapReady(entry.host)
  notify(entry.scope)
}

/** Re-parents the map's element into the current placeholder (or leaves it in the overlay). */
function placeContainer(entry: MindmapBlockEntry): void {
  const container = entry.container
  if (!container || entry.owner === 'overlay') return
  const target = entry.host.querySelector<HTMLElement>(MINDMAP_PLACEHOLDER_SELECTOR) ?? entry.host
  if (container.parentElement !== target || target.childElementCount !== 1) target.replaceChildren(container)
}

function pruneScope(scope: string, keep: Set<MindmapBlockEntry>): void {
  for (const entry of [...entries.values()]) {
    // Entries whose block is gone have nothing left to write to, so the final
    // flush is skipped; the ones that merely changed owner stay.
    if (entry.scope === scope && !keep.has(entry)) destroyEntry(entry, false)
  }
}

function scheduleWrite(entry: MindmapBlockEntry): void {
  if (!entry.handle || !entry.write || !entry.ref) return
  entry.dirty = true
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    flushEntry(entry)
  }, WRITE_DEBOUNCE_MS)
}

/**
 * Serializes the live map into the note. The writer resolves the fence against
 * the note's *current* text and reports 'conflict'/'missing' when the fence no
 * longer holds the body this map was built from — in that case the note is left
 * alone, because writing would drop whatever the user typed since.
 */
export function flushEntry(entry: MindmapBlockEntry): MindmapWriteResult | null {
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }
  if (!entry.handle || !entry.vendor || !entry.write || !entry.ref || !entry.dirty) return null
  entry.dirty = false
  const nextBody = entry.vendor.serialize(entry.handle.getData(), entry.mode, entry.extra)
  if (nextBody === entry.source) return null
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written' || result === 'moved') {
    entry.source = nextBody
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}

export function flushMindmaps(scope: string): void {
  for (const entry of entries.values()) {
    if (entry.scope === scope) flushEntry(entry)
  }
}

export function destroyMindmaps(scope: string): void {
  for (const entry of [...entries.values()]) {
    if (entry.scope === scope) destroyEntry(entry)
  }
}

export function destroyAllMindmaps(): void {
  for (const entry of [...entries.values()]) destroyEntry(entry)
}

function destroyEntry(entry: MindmapBlockEntry, flush = true): void {
  // Flushing on teardown keeps the last edit of a closed pane.
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

/** The current body text for a block, in the given mode (used by copy/convert actions). */
export function serializeEntryAs(entry: MindmapBlockEntry, mode: MindmapMode): string | null {
  if (!entry.handle || !entry.vendor) return null
  return entry.vendor.serialize(entry.handle.getData(), mode, mode === 'json' ? entry.extra : {})
}

export function serializeEntry(entry: MindmapBlockEntry): string | null {
  return serializeEntryAs(entry, entry.mode)
}

/**
 * Builds a block again after a failed render: the retry button on the error
 * banner has no other way back, since the mount pass only runs when the note's
 * markup is committed.
 */
export async function retryMindmap(node: HTMLElement): Promise<void> {
  const entry = mindmapEntryForNode(node)
  const options = entry ? scopeOptions.get(entry.scope) : null
  if (entry) destroyEntry(entry, false)
  if (!options) return
  await mountMindmaps(node.parentElement ?? node, options)
}

/** Writes an explicit body (a format conversion), bypassing the operation debounce. */
export function applyEntryBody(entry: MindmapBlockEntry, nextBody: string): MindmapWriteResult {
  if (!entry.write || !entry.ref) return 'missing'
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written' || result === 'moved') {
    entry.source = nextBody
    entry.mode = detectMindmapMode(nextBody)
    entry.extra = {}
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}

/**
 * Hands the live map to the full screen overlay: the same instance, so its
 * camera, selection and undo stack carry over and there is never a second copy
 * of the same map writing to the same note.
 */
export function attachMindmapToOverlay(entry: MindmapBlockEntry, target: HTMLElement): void {
  if (!entry.container) return
  entry.owner = 'overlay'
  entry.container.classList.add('is-fullscreen')
  target.replaceChildren(entry.container)
  requestAnimationFrame(() => {
    entry.handle?.layout()
    entry.handle?.scaleFit()
  })
  notify(entry.scope)
}

export function detachMindmapFromOverlay(entry: MindmapBlockEntry): void {
  if (!entry.container) return
  entry.owner = 'inline'
  entry.container.classList.remove('is-fullscreen')
  placeContainer(entry)
  entry.handle?.toCenter()
  notify(entry.scope)
}
