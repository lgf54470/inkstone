/**
 * Lazy static snapshots for ```mindmap fences, the same answer the notes app's
 * share/export surfaces give (mindmap/static.ts): a read-only mind-elixir instance
 * is drawn off the live document and exported as an SVG image. The vendor and its
 * stylesheet stay in an async chunk (exactly like mermaid on this page), so a post
 * without a map pays nothing. A body that cannot render shows its source.
 */
import { isDarkMode } from './diagram-reveal'

const REVEAL_MARGIN = '240px 0px'

interface MindElixirLike {
  init(data: unknown): unknown
  exportSvg(noDownload?: boolean): Blob | Promise<Blob> | null
  destroy(): void
}

type Palette = { kind: PaletteKind } | { kind: 'custom'; theme: unknown }
type ThemeChoice = { kind: 'app' } | Palette

interface MindElixirModule {
  default: {
    new (options: Record<string, unknown>): MindElixirLike
    SIDE: number
    THEME: Record<string, unknown>
    DARK_THEME: Record<string, unknown>
    /** Static MindElixir.new(topic) factory; quoted so it is not read as a construct signature. */
    new: (topic: string) => unknown
  }
  plaintextToMindElixir: (text: string, fallbackTitle: string) => unknown
}

let modulePromise: Promise<MindElixirModule> | null = null

function loadVendor(): Promise<MindElixirModule> {
  modulePromise ??= import('mind-elixir').then(async (mindElixir) => {
    await import('mind-elixir/style.css')
    const converter = await import('mind-elixir/plaintextConverter')
    return {
      default: mindElixir.default as unknown as MindElixirModule['default'],
      plaintextToMindElixir: converter.plaintextToMindElixir as MindElixirModule['plaintextToMindElixir'],
    }
  }).catch((err) => {
    modulePromise = null
    throw err
  })
  return modulePromise
}

type Mode = 'json' | 'outline'
type PaletteKind = 'light' | 'dark'

const FOLLOW_APP_NAMES = new Set(['auto', 'app'])

function readThemeField(value: unknown): ThemeChoice | null {
  if (value === undefined || value === null) return { kind: 'app' }
  if (typeof value === 'string') {
    const name = value.trim().toLowerCase()
    if (name === 'light') return { kind: 'light' }
    if (name === 'dark') return { kind: 'dark' }
    if (FOLLOW_APP_NAMES.has(name)) return { kind: 'app' }
    return null
  }
  if (typeof value === 'object' && !Array.isArray(value)) return { kind: 'custom', theme: value }
  return null
}

function annotationChoice(annotation: string | null): ThemeChoice | null {
  if (!annotation) return null
  if (annotation.toLowerCase() === 'light') return { kind: 'light' }
  if (annotation.toLowerCase() === 'dark') return { kind: 'dark' }
  if (FOLLOW_APP_NAMES.has(annotation.toLowerCase())) return { kind: 'app' }
  return null
}

function libraryTheme(MindElixir: MindElixirModule['default'], resolved: Palette): Record<string, unknown> {
  if (resolved.kind === 'custom') {
    const custom = resolved.theme as Partial<Record<string, unknown>> & { type?: string }
    const base = custom.type === 'dark' ? MindElixir.DARK_THEME : MindElixir.THEME
    return { ...base, ...custom }
  }
  return resolved.kind === 'dark' ? MindElixir.DARK_THEME : MindElixir.THEME
}

interface ParsedBody {
  data: unknown
  themeChoice: ThemeChoice
}

function parseBody(vendor: MindElixirModule, body: string, mode: Mode, annotation: string | null): ParsedBody | null {
  const text = body.trim()
  if (!text) {
    return { data: vendor.default.new('思维导图'), themeChoice: { kind: 'app' } }
  }
  if (mode === 'outline') {
    try {
      return { data: vendor.plaintextToMindElixir(text, '思维导图'), themeChoice: { kind: 'app' } }
    }
    catch {
      return null
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (typeof record.nodeData !== 'object' || record.nodeData === null) return null
  const nodeData = record.nodeData as Record<string, unknown>
  if (typeof nodeData.topic !== 'string') return null
  const fieldChoice = readThemeField(record.theme)
  if (fieldChoice === null) return null
  // The body's own field wins; the fence annotation only speaks for outline/following bodies.
  const themeChoice = fieldChoice.kind !== 'app'
    ? fieldChoice
    : (annotationChoice(annotation) ?? { kind: 'app' })
  // init() iterates arrows/summaries and throws on undefined, and the body's own
  // `theme` statement is palette input, not instance data — hand the library only
  // the fields it draws, with the two collections always present.
  const data = {
    arrows: Array.isArray(record.arrows) ? record.arrows : [],
    summaries: Array.isArray(record.summaries) ? record.summaries : [],
    nodeData: record.nodeData,
  }
  return { data, themeChoice }
}

function showSource(block: HTMLElement, body: string): void {
  block.replaceChildren()
  block.classList.remove('loading')
  block.classList.add('mindmap-source')
  block.removeAttribute('aria-busy')
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = body
  pre.appendChild(code)
  block.appendChild(pre)
  renderedBlocks.add(block)
}

async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('could not read the exported SVG'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

function rootTopic(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '思维导图'
  const nodeData = (data as { nodeData?: unknown }).nodeData
  if (typeof nodeData !== 'object' || nodeData === null) return '思维导图'
  const topic = (nodeData as { topic?: unknown }).topic
  return typeof topic === 'string' && topic.trim() ? topic.trim() : '思维导图'
}

async function drawBlock(block: HTMLElement): Promise<void> {
  if (renderedBlocks.has(block)) return
  const body = decodeURIComponent(block.dataset.mindmap ?? '')
  const mode = (block.dataset.mindmapMode === 'json' ? 'json' : 'outline') as Mode
  const annotation = block.dataset.mindmapTheme ?? null
  let vendor: MindElixirModule
  try {
    vendor = await loadVendor()
  }
  catch (err) {
    console.warn('[blog] mind map renderer failed to load', err)
    showSource(block, body)
    return
  }
  const parsed = parseBody(vendor, body, mode, annotation)
  if (!parsed) {
    showSource(block, body)
    return
  }
  const resolved = resolvePalette(parsed.themeChoice)
  block.dataset.mindmapPinned = parsed.themeChoice.kind === 'app' ? 'false' : 'true'

  const host = document.createElement('div')
  host.className = 'mindmap-canvas is-static'
  const placeholder = block.querySelector<HTMLElement>('[data-mindmap-placeholder]')
  placeholder?.replaceWith(host)

  let instance: MindElixirLike | null = null
  try {
    instance = createInstance(vendor, host, resolved)
    const failure = instance.init(parsed.data)
    if (failure) throw failure instanceof Error ? failure : new Error('mind map failed to initialize')
    const exported = await instance.exportSvg(true)
    if (!exported) throw new Error('mind-elixir produced an empty SVG')
    const image = await snapshotImage(exported, rootTopic(parsed.data))
    host.replaceWith(image)
    block.classList.remove('loading')
    block.removeAttribute('aria-busy')
    renderedBlocks.add(block)
  }
  catch (err) {
    console.warn('[blog] mind map snapshot failed', err)
    host.remove()
    showSource(block, body)
  }
  finally {
    instance?.destroy()
  }
}

/** A following block paints with the page theme; a pinned block keeps its own palette. */
function resolvePalette(choice: ThemeChoice): Palette {
  return choice.kind === 'app' ? { kind: isDarkMode() ? 'dark' : 'light' } : choice
}

function createInstance(vendor: MindElixirModule, host: HTMLElement, resolved: Palette): MindElixirLike {
  return new vendor.default({
    el: host,
    direction: vendor.default.SIDE,
    editable: false,
    draggable: false,
    contextMenu: false,
    toolBar: false,
    keypress: false,
    allowUndo: false,
    mouseSelectionButton: 0,
    mobileMultiSelect: true,
    theme: libraryTheme(vendor.default, resolved),
  })
}

async function snapshotImage(blob: Blob, alt: string): Promise<HTMLImageElement> {
  const image = document.createElement('img')
  image.className = 'mindmap-image'
  image.src = await readBlobAsDataUrl(blob)
  image.alt = alt
  image.loading = 'lazy'
  image.decoding = 'async'
  return image
}

const renderedBlocks = new WeakSet<HTMLElement>()
const observerRef: { current: IntersectionObserver | null } = { current: null }

function isHiddenInTab(block: HTMLElement): boolean {
  const panel = block.closest<HTMLElement>('[data-tab-panel]')
  return Boolean(panel && panel.hidden)
}

function schedule(block: HTMLElement): void {
  if (renderedBlocks.has(block) || isHiddenInTab(block)) return
  if (typeof IntersectionObserver === 'undefined') {
    void drawBlock(block)
    return
  }
  observerRef.current ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        void drawBlock(entry.target as HTMLElement)
        observerRef.current?.unobserve(entry.target)
      }
    }
  }, { rootMargin: REVEAL_MARGIN })
  observerRef.current.observe(block)
}

export function initMindmapSnapshots(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.mindmap-block[data-mindmap]').forEach(schedule)
}

/** Tab panels reveal their diagrams when first activated (tabs module calls this). */
export function revealMindmapBlocks(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLElement>('.mindmap-block[data-mindmap]').forEach(schedule)
}

/**
 * Theme flip only repaints maps that follow the page theme; a body with its own
 * pinned palette is left alone. Re-rendering replaces the snapshot image.
 */
export function rerenderMindmapsForTheme(): void {
  for (const block of document.querySelectorAll<HTMLElement>('.mindmap-block[data-mindmap]')) {
    if (block.dataset.mindmapPinned === 'true') continue
    if (block.getClientRects().length === 0) continue
    renderedBlocks.delete(block)
    block.classList.add('loading')
    block.setAttribute('aria-busy', 'true')
    // Re-arm: drop the image/source so drawBlock rebuilds the snapshot.
    const image = block.querySelector<HTMLElement>('.mindmap-image, .mindmap-source')
    image?.remove()
    if (!block.querySelector('[data-mindmap-placeholder]')) {
      const placeholder = document.createElement('div')
      placeholder.className = 'mindmap-block-placeholder'
      placeholder.dataset.mindmapPlaceholder = ''
      placeholder.textContent = '思维导图加载中…'
      block.appendChild(placeholder)
    }
    void drawBlock(block)
  }
}
