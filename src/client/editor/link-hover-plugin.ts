import { Facet } from '@codemirror/state'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { encodeDataValue } from '../lib/markdown/data-attr'

const WIKI_TEXT_RE = /^\[\[([\s\S]+)\]\]$/

export interface LinkHoverCallbacks {
  propose: (link: HTMLElement | null, options?: { immediate?: boolean }) => void
  hide: () => boolean
}

export const linkHoverFacet = Facet.define<LinkHoverCallbacks>()

export function linkHoverExtension() {
  return ViewPlugin.fromClass(
    class {
      hovered: HTMLElement | null = null
      caretMark: HTMLElement | null = null
      lastProposed: HTMLElement | null = null
      view: EditorView

      constructor(view: EditorView) {
        this.view = view
        view.contentDOM.addEventListener('mousemove', this.move)
        view.contentDOM.addEventListener('mouseleave', this.leave)
        view.contentDOM.addEventListener('keydown', this.keydown)
        view.contentDOM.addEventListener('focus', this.keyboardCheck)
      }

      destroy() {
        this.view.contentDOM.removeEventListener('mousemove', this.move)
        this.view.contentDOM.removeEventListener('mouseleave', this.leave)
        this.view.contentDOM.removeEventListener('keydown', this.keydown)
        this.view.contentDOM.removeEventListener('focus', this.keyboardCheck)
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged)
          this.keyboardCheck()
      }

      keydown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        const callback = this.view.state.facet(linkHoverFacet)[0]
        if (callback?.hide()) {
          event.preventDefault()
          event.stopPropagation()
        }
      }

      move = (event: MouseEvent) => {
        const mark = (event.target as Element).closest<HTMLElement>('.cm-md-wikilink')
        this.applyHover(mark)
      }

      leave = () => {
        this.applyHover(null)
      }

      keyboardCheck = () => {
        this.view.requestMeasure({
          read: () => {
            const head = this.view.state.selection.main.head
            const coords = this.view.coordsAtPos(head)
            if (!coords) return null
            const point = { x: coords.left, y: coords.top }
            const marks = [...this.view.contentDOM.querySelectorAll<HTMLElement>('.cm-md-wikilink')]
            return marks.find((candidate) => containsPoint(candidate, point)) ?? null
          },
          write: (mark) => {
            this.caretMark = mark
            this.emit()
          },
        })
      }

      applyHover = (mark: HTMLElement | null) => {
        this.hovered = mark
        this.emit()
      }

      emit = () => {
        const callback = this.view.state.facet(linkHoverFacet)[0]
        const mark = this.hovered ?? this.caretMark
        if (mark) {
          if (mark === this.lastProposed) return
          const raw = WIKI_TEXT_RE.exec(mark.textContent ?? '')?.[1]
          if (raw == null) return
          mark.dataset.wikilink = encodeDataValue(raw.trim())
          this.lastProposed = mark
          callback?.propose(mark, { immediate: this.hovered == null })
        }
        else if (this.lastProposed !== null) {
          this.lastProposed = null
          callback?.propose(null)
        }
      }
    },
  )
}

function containsPoint(element: HTMLElement, point: { x: number; y: number }): boolean {
  const rect = element.getBoundingClientRect()
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}