import { useCallback } from 'react'
import type { BentoDoc, ShapeType, Slide, SlideElement } from '../types'
import { reorderElement as reorderWithin } from '../order'
import {
  createDefaultChart,
  createDefaultCode,
  createDefaultShape,
  createDefaultTable,
  createDefaultText,
} from './element-factories'

/**
 * Which page an edit lands on, and the two doors every edit leaves through: the history's
 * commit (which is also the write into the note) and the selection the shell shows.
 */
export interface SlidesPageEditsHost {
  doc: BentoDoc
  /** The page being authored. An edit for a page that is gone does nothing at all. */
  slideIndex: number
  commit: (update: (previous: BentoDoc) => BentoDoc) => void
  /** The element the shell has selected right now, read when the edit happens. */
  selectedId: () => string | null
  select: (elementId: string | null) => void
}

/** Everything the toolbar, the inspector and the menus change about the page they are showing. */
export interface SlidesPageEdits {
  updateSlide: (patch: Partial<Slide>) => void
  updateElement: (elementId: string, patch: Partial<SlideElement>) => void
  deleteElement: (elementId: string) => void
  duplicateElement: (elementId: string) => void
  reorderElement: (elementId: string, direction: 'up' | 'down' | 'front' | 'back') => void
  addText: () => void
  addShape: (shape: ShapeType) => void
  addTable: () => void
  addChart: (preset: 'bar' | 'line' | 'pie' | 'scatter') => void
  addCode: () => void
}

/** What every one of these edits writes through, once it has decided the page still exists. */
interface SlideWriter {
  /** The page as it is in this render; undefined means there is nothing to edit. */
  slide: Slide | undefined
  accent: string
  /** The element the shell has selected, read when the edit happens. */
  selectedId: () => string | null
  select: (elementId: string | null) => void
  /** The page's elements, replaced wholesale — the one place an element edit is written. */
  setElements: (change: (elements: SlideElement[]) => SlideElement[]) => void
}

/**
 * The edits a shell makes to the page in front of the reader: the page's own fields, the boxes on
 * it, and the new boxes the toolbar adds.
 *
 * They are gathered here because they are one responsibility — what an edit means for the active
 * page — and because each of them has the same three-part shape: a guard that the page still
 * exists, a change written through the history, and the selection the change leaves behind. The
 * document is read inside the commit's updater rather than from the render that produced the
 * handler, so a change that lands late resolves against the deck as it is now.
 */
export function useSlidesPageEdits(host: SlidesPageEditsHost): SlidesPageEdits {
  const { updateSlide, writer } = useSlideWriter(host)
  const elements = useElementCommands(writer)
  const copies = useElementCopies(writer)
  const inserts = useElementInserts(writer)
  return {
    updateSlide,
    updateElement: elements.updateElement,
    deleteElement: elements.deleteElement,
    duplicateElement: copies.duplicateElement,
    reorderElement: copies.reorderElement,
    addText: inserts.addText,
    addShape: inserts.addShape,
    addTable: inserts.addTable,
    addChart: inserts.addChart,
    addCode: inserts.addCode,
  }
}

/**
 * The writer the other two halves share, plus the edit that replaces the page's own fields: a
 * background, a transition, the speaker's notes.
 */
function useSlideWriter(
  host: SlidesPageEditsHost,
): { writer: SlideWriter; updateSlide: (patch: Partial<Slide>) => void } {
  const { commit, doc, select, selectedId, slideIndex } = host
  const slide = doc.slides[slideIndex]

  const setElements = useCallback(
    (change: (elements: SlideElement[]) => SlideElement[]) => {
      commit((previous) => {
        const target = previous.slides[slideIndex]
        if (!target) return previous
        return {
          ...previous,
          slides: previous.slides.map((candidate, index) =>
            index === slideIndex ? { ...candidate, elements: change(candidate.elements) } : candidate,
          ),
        }
      })
    },
    [commit, slideIndex],
  )

  const updateSlide = useCallback(
    (patch: Partial<Slide>) => {
      if (!slide) return
      commit((previous) => {
        const target = previous.slides[slideIndex]
        if (!target) return previous
        return {
          ...previous,
          slides: previous.slides.map((candidate, index) =>
            index === slideIndex ? { ...candidate, ...patch } : candidate,
          ),
        }
      })
    },
    [commit, slide, slideIndex],
  )

  return {
    updateSlide,
    writer: { slide, accent: doc.theme.accent || 'var(--accent)', selectedId, select, setElements },
  }
}

/** The edits that act on a box already on the page: change it, or take it off the page. */
function useElementCommands(writer: SlideWriter) {
  const { select, selectedId, setElements, slide } = writer

  const updateElement = useCallback(
    (elementId: string, patch: Partial<SlideElement>) => {
      if (!slide) return
      setElements((elements) =>
        elements.map((element) => (element.id === elementId ? ({ ...element, ...patch } as SlideElement) : element)),
      )
    },
    [setElements, slide],
  )

  const deleteElement = useCallback(
    (elementId: string) => {
      if (!slide) return
      setElements((elements) => elements.filter((element) => element.id !== elementId))
      if (selectedId() === elementId) select(null)
    },
    [select, selectedId, setElements, slide],
  )

  return { updateElement, deleteElement }
}

/** Adding another box of what is already there, and moving one through the stack. */
function useElementCopies(writer: SlideWriter) {
  const { select, setElements, slide } = writer

  /**
   * A copy lands slightly off its original so the two are not perfectly hidden one under the
   * other, and it becomes the selection — the box the reader just made is the one they are about
   * to move.
   */
  const duplicateElement = useCallback(
    (elementId: string) => {
      const target = slide?.elements.find((element) => element.id === elementId)
      if (!target) return
      const copy: SlideElement = {
        ...target,
        id: `${target.type}-${Date.now()}`,
        x: target.x + 20,
        y: target.y + 20,
      }
      setElements((elements) => [...elements, copy])
      select(copy.id)
    },
    [select, setElements, slide],
  )

  const reorderElement = useCallback(
    (elementId: string, direction: 'up' | 'down' | 'front' | 'back') => {
      if (!slide) return
      setElements((elements) => reorderWithin(elements, elementId, direction) ?? elements)
    },
    [setElements, slide],
  )

  return { duplicateElement, reorderElement }
}

/** The toolbar's inserts: one new box of a kind, selected, on the page being authored. */
function useElementInserts(writer: SlideWriter) {
  const { accent, select, setElements, slide } = writer

  const insert = useCallback(
    (created: SlideElement) => {
      if (!slide) return
      setElements((elements) => [...elements, created])
      select(created.id)
    },
    [select, setElements, slide],
  )

  const addText = useCallback(() => insert(createDefaultText()), [insert])
  const addTable = useCallback(() => insert(createDefaultTable()), [insert])
  const addCode = useCallback(() => insert(createDefaultCode()), [insert])
  const addShape = useCallback((shape: ShapeType) => insert(createDefaultShape(shape, accent)), [accent, insert])
  const addChart = useCallback(
    (preset: 'bar' | 'line' | 'pie' | 'scatter') => insert(createDefaultChart(preset)),
    [insert],
  )

  return { addText, addShape, addTable, addChart, addCode }
}
