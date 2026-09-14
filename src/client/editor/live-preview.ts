import { RangeSetBuilder, StateEffect, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { renderMarkdown } from '../lib/markdown/renderer'

export interface RenderedBlock {
  line: number
  html: string
}

const RENDER_DEBOUNCE_MS = 90
const refresh = StateEffect.define<void>()

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
  visibleFrom: number
  visibleTo: number
}): Range<Decoration>[] {
  const { blocks, doc, cursor, visibleFrom, visibleTo } = opts
  const ranges: Range<Decoration>[] = []
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!
    const startLine = block.line + 1
    if (startLine > doc.lines) continue
    const from = doc.line(startLine).from
    const nextLine = blocks[index + 1] ? blocks[index + 1]!.line + 1 : doc.lines + 1
    const to = nextLine > doc.lines ? doc.length : Math.max(from, doc.line(nextLine).from - 1)
    if (to <= from) continue
    if (to < visibleFrom || from > visibleTo) continue
    // The block holding the caret stays source: that is the one being edited.
    if (cursor >= from && cursor <= to) continue
    ranges.push(Decoration.replace({ widget: new RenderedBlockWidget(block.html, from), block: true }).range(from, to))
  }
  return ranges
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
    return host
  }

  ignoreEvent(): boolean {
    return false
  }
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none
    timer = 0
    source = ''
    blocks: readonly RenderedBlock[] = []

    constructor(readonly view: EditorView) {
      this.render()
      this.build()
    }

    update(update: ViewUpdate): void {
      if (!livePreviewEnabled(update.view)) {
        this.decorations = Decoration.none
        return
      }
      if (update.docChanged) {
        window.clearTimeout(this.timer)
        this.timer = window.setTimeout(() => {
          this.render()
          this.view.dispatch({ effects: refresh.of(undefined) })
        }, RENDER_DEBOUNCE_MS)
        return
      }
      const refreshed = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refresh)),
      )
      if (refreshed || update.selectionSet || update.viewportChanged) this.build()
    }

    destroy(): void {
      window.clearTimeout(this.timer)
    }

    render(): void {
      const source = this.view.state.doc.toString()
      if (source === this.source) return
      this.source = source
      this.blocks = collectRenderedBlocks(renderMarkdown(source).html)
    }

    build(): void {
      if (!livePreviewEnabled(this.view)) {
        this.decorations = Decoration.none
        return
      }
      const ranges = liveBlockRanges({
        blocks: this.blocks,
        doc: this.view.state.doc,
        cursor: this.view.state.selection.main.head,
        visibleFrom: this.view.viewport.from,
        visibleTo: this.view.viewport.to,
      })
      const builder = new RangeSetBuilder<Decoration>()
      for (const range of ranges) builder.add(range.from, range.to, range.value)
      this.decorations = builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

function livePreviewEnabled(view: EditorView): boolean {
  return Boolean(view.dom.closest('[data-live="true"]'))
}

export function livePreviewExtensions(): Extension[] {
  return [livePreviewPlugin]
}
