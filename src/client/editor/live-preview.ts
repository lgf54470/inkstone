import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { destroyChartInstances, enhancePreview, renderPendingMermaid } from '../lib/markdown/enhance'
import { loadMindmapVendor, MINDMAP_IMAGE_CLASS } from '../lib/markdown/mindmap'
import { renderMarkdown } from '../lib/markdown/renderer'
import { useSession } from '../store/session'

export interface RenderedBlock {
  line: number
  html: string
}

const RENDER_DEBOUNCE_MS = 90

/** Carries one render of the note into the state, where the live decorations are built from it. */
export const publishLiveBlocks = StateEffect.define<readonly RenderedBlock[]>()

/**
 * Splits rendered Markdown into top-level blocks by the source line each one
 * started on. The renderer stamps `data-line` on every level-0 token, so blocks
 * map back onto document positions without a second parse of the source.
 */
export function collectRenderedBlocks(html: string): RenderedBlock[] {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = parsed.body.firstElementChild
  if (!root) return []
  const blocks: RenderedBlock[] = []
  for (const child of Array.from(root.children)) {
    // A missing attribute must not read as line 0: Number('') is 0, and that
    // would move an unpositioned block over the very first line of the note.
    const raw = child.getAttribute('data-line')
    if (raw === null) continue
    const line = Number(raw)
    if (!Number.isInteger(line) || line < 0) continue
    const markup = child.outerHTML.trim()
    if (markup) blocks.push({ line, html: markup })
  }
  return blocks
}

export function liveBlockRanges(opts: {
  blocks: readonly RenderedBlock[]
  doc: Text
  cursor: number
}): Range<Decoration>[] {
  const { blocks, doc, cursor } = opts
  const ranges: Range<Decoration>[] = []
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!
    const startLine = block.line + 1
    if (startLine > doc.lines) continue
    const from = doc.line(startLine).from
    const nextLine = blocks[index + 1] ? blocks[index + 1]!.line + 1 : doc.lines + 1
    const to = nextLine > doc.lines ? doc.length : Math.max(from, doc.line(nextLine).from - 1)
    if (to <= from) continue
    // The block holding the caret stays source: that is the one being edited.
    if (cursor >= from && cursor <= to) continue
    ranges.push(Decoration.replace({ widget: new RenderedBlockWidget(block.html, from), block: true }).range(from, to))
  }
  return ranges
}

/** Blocks CodeMirror has thrown away: a paint still in flight must not write into one. */
const discardedBlocks = new WeakSet<HTMLElement>()

function isDarkTheme(): boolean {
  return (document.documentElement.dataset.theme ?? 'dark') === 'dark'
}

/**
 * Whether the block is on screen with a layout to measure. Every renderer here
 * measures what it draws into, and a map drawn while its pane is hidden measures
 * nothing: the still comes out as NaN, which the browser reports as one attribute
 * error per shape. CodeMirror also drops block widgets as they scroll, so a paint
 * that landed in a discarded node would leave that block stuck on its
 * placeholder. jsdom has no layout at all, so the check is skipped where the API
 * does not exist.
 */
function isLaidOut(host: HTMLElement): boolean {
  return host.isConnected && !discardedBlocks.has(host) && (host.checkVisibility?.() ?? true)
}

/**
 * A live block carries markup, not a picture: the diagrams, the formulas and the
 * highlighted code inside it only appear once the same enhancers the preview pane
 * runs have passed over it.
 */
async function paintLiveBlock(host: HTMLElement): Promise<void> {
  // Loading the mind map vendor is the long stretch of this paint, and the pane
  // can go hidden while it runs (switching the layout away from live hides the
  // editor). Awaiting it first makes the check below read the pane as it is when
  // the drawing starts; a load failure stays the renderer's own to report.
  if (host.querySelector('.mindmap-block')) await loadMindmapVendor().catch(() => undefined)
  if (!isLaidOut(host)) return
  const preview = useSession.getState().settings.preview
  const dark = isDarkTheme()
  await enhancePreview(host, {
    math: preview.math,
    mermaid: preview.mermaid,
    // A block shows the source it was rendered from, and the caret block is where
    // the map itself is edited, so this surface draws the still image the share
    // page draws rather than mounting a second editable map inside the editor.
    mindmap: 'snapshot',
    // The same reason holds for a whiteboard: the block in the pane is a picture.
    excalidraw: 'snapshot',
    // A board is no different: the pane shows its cards as a list while the fence stays the source of truth.
    kanban: 'snapshot',
    dark,
    // Collapsing is a control, and a click anywhere in the block drops the caret
    // into the source instead, so the block keeps its code unfolded.
    codeBlockCollapseLines: 0,
  })
  if (!isLaidOut(host)) {
    // The chart renderer only checks that the node is inside its root, so a chart
    // can outlive the block that started it; the instance has to go with it.
    destroyChartInstances(host)
    return
  }
  await renderPendingMermaid(host, dark, { isCurrent: () => isLaidOut(host) })
}

/** Paints a block again because its palette went stale, dropping the still drawn for the old one. */
function repaintLiveBlock(host: HTMLElement): void {
  if (!isLaidOut(host)) return
  host.querySelector(`.${MINDMAP_IMAGE_CLASS}`)?.remove()
  void paintLiveBlock(host)
}

class RenderedBlockWidget extends WidgetType {
  constructor(readonly html: string, readonly from: number) {
    super()
  }

  eq(other: RenderedBlockWidget): boolean {
    return other.html === this.html && other.from === this.from
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement('div')
    host.className = 'ink-prose cm-live-block'
    host.innerHTML = this.html
    // Clicking a rendered block drops the caret into its source, which then
    // shows through because the caret block is never replaced.
    host.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.from } })
      view.focus()
    })
    // The node is still detached here and the renderers measure what they draw
    // into, so the paint waits for the insertion that follows this call.
    queueMicrotask(() => void paintLiveBlock(host))
    return host
  }

  destroy(dom: HTMLElement): void {
    discardedBlocks.add(dom)
    destroyChartInstances(dom)
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Index of the rendered block a caret falls into, or -1 when it sits above the
 * first one: the lines the renderer stamped are the block edges, so a line belongs
 * to the last block that starts at or above it.
 */
function caretBlock(blocks: readonly RenderedBlock[], state: EditorState): number {
  const line = state.doc.lineAt(state.selection.main.head).number - 1
  let index = -1
  for (let position = 0; position < blocks.length; position++) {
    if (blocks[position]!.line > line) break
    index = position
  }
  return index
}

function buildDecorations(state: EditorState, blocks: readonly RenderedBlock[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const ranges = liveBlockRanges({ blocks, doc: state.doc, cursor: state.selection.main.head })
  for (const range of ranges) builder.add(range.from, range.to, range.value)
  return builder.finish()
}

interface LivePreviewState {
  blocks: readonly RenderedBlock[]
  caret: number
  decorations: DecorationSet
}

const emptyLivePreview: LivePreviewState = { blocks: [], caret: -1, decorations: Decoration.none }

/**
 * The block decorations have to be built by a state field: CodeMirror refuses
 * block (and line-break-spanning) decorations supplied through a view plugin, and
 * the refusal is thrown from inside the document update, so a plugin that tries it
 * leaves live mode rendering as plain source and then throws again on every
 * scroll. `livePreviewPlugin` renders and publishes; this field turns the
 * published blocks into decorations and keeps them tracking the document.
 */
export const livePreviewField = StateField.define<LivePreviewState>({
  create: () => emptyLivePreview,
  update(value, transaction) {
    let blocks = value.blocks
    let published = false
    for (const effect of transaction.effects) {
      if (effect.is(publishLiveBlocks)) {
        blocks = effect.value
        published = true
      }
    }
    const caret = caretBlock(blocks, transaction.state)
    if (published || caret !== value.caret) {
      return { blocks, caret, decorations: buildDecorations(transaction.state, blocks) }
    }
    // An edit rewrites the block around the caret, which is the one block that is
    // never replaced, so the rest of the set can follow the change as it is and
    // wait for the next render instead of being rebuilt on every keystroke.
    if (transaction.docChanged) return { blocks, caret, decorations: value.decorations.map(transaction.changes) }
    return value
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

/**
 * Renders the note and publishes the blocks to the field above. Rendering the whole
 * document costs far more than a keystroke, so the first pass runs on a microtask
 * (before the mount paints) and later passes wait out the debounce. Both dispatch
 * from a callback rather than from `update`, because a view plugin may not dispatch
 * while an update is in progress.
 */
export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    timer = 0
    source = ''
    inert = false
    dark = isDarkTheme()
    theme: MutationObserver | null = null

    constructor(readonly view: EditorView) {
      queueMicrotask(() => this.publish())
      this.theme = new MutationObserver(() => this.repaintStaleBlocks())
      this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    }

    update(update: ViewUpdate): void {
      if (!update.docChanged) return
      window.clearTimeout(this.timer)
      this.timer = window.setTimeout(() => this.publish(), RENDER_DEBOUNCE_MS)
    }

    destroy(): void {
      this.inert = true
      this.theme?.disconnect()
      window.clearTimeout(this.timer)
    }

    publish(): void {
      if (this.inert) return
      const source = this.view.state.doc.toString()
      if (source === this.source) return
      this.source = source
      this.view.dispatch({ effects: publishLiveBlocks.of(collectRenderedBlocks(renderMarkdown(source).html)) })
    }

    /**
     * Mermaid and Chart.js compile the palette they are handed into their output,
     * so a block painted before the theme flipped keeps the old one until it is
     * painted again (ADR-0002). Blocks that are out of view are not in the DOM at
     * all and get the new palette when CodeMirror builds them.
     */
    repaintStaleBlocks(): void {
      const dark = isDarkTheme()
      if (dark === this.dark) return
      this.dark = dark
      for (const host of this.view.contentDOM.querySelectorAll<HTMLElement>('.cm-live-block')) repaintLiveBlock(host)
    }
  },
)

export function livePreviewExtensions(): Extension[] {
  return [livePreviewField, livePreviewPlugin]
}
