import { secureRandomId } from '../../id'
import type { BentoDoc, Slide, SlideElement } from './types'

/**
 * The document edits behind the keys and the clipboard, as functions over a document rather than
 * methods on a store. Every one of them returns the document it was given when the edit has no
 * effect (an unknown slide, an empty selection), so a caller can hand the result straight to the
 * history — the same object is how the history is told there was nothing to record.
 *
 * They are pure on purpose: what a cut, a nudge or a paste does to a deck is the part worth
 * testing without a browser, and the components above them are then only wiring.
 */

/** The elements of one slide, in the order they paint. */
export function slideElements(doc: BentoDoc, slideId: string | null): SlideElement[] {
  if (!slideId) return []
  return doc.slides.find((slide) => slide.id === slideId)?.elements ?? []
}

/** The elements named by `ids`, in the slide's own order rather than the order they were named. */
export function pickElements(doc: BentoDoc, slideId: string | null, ids: Iterable<string>): SlideElement[] {
  const wanted = new Set(ids)
  return slideElements(doc, slideId).filter((element) => wanted.has(element.id))
}

/** The same document with the elements on one slide replaced; assets may be merged in the same step. */
export function replaceElements(
  doc: BentoDoc,
  slideId: string,
  change: (elements: SlideElement[]) => SlideElement[],
  assets?: Record<string, string>,
): BentoDoc {
  if (!doc.slides.some((slide) => slide.id === slideId)) return doc
  return {
    ...doc,
    assets: assets ?? doc.assets,
    slides: doc.slides.map((slide) =>
      slide.id === slideId ? { ...slide, elements: change(slide.elements) } : slide,
    ),
  }
}

export function appendElements(
  doc: BentoDoc,
  slideId: string,
  elements: SlideElement[],
  assets?: Record<string, string>,
): BentoDoc {
  if (elements.length === 0) return doc
  return replaceElements(doc, slideId, (current) => [...current, ...elements], assets)
}

/** The deck with pages added at one spot; the pages themselves carry their own fresh ids. */
export function insertSlides(doc: BentoDoc, at: number, slides: Slide[]): BentoDoc {
  if (slides.length === 0) return doc
  const index = Math.min(Math.max(at, 0), doc.slides.length)
  return { ...doc, slides: [...doc.slides.slice(0, index), ...slides, ...doc.slides.slice(index)] }
}

/**
 * The deck with a copy of one page right after it, and where the copy landed. The copy is a new
 * page with new element ids — a duplicate that shared an id with what it copied would make two
 * boxes that cannot be selected apart. `copySuffix` is the caller's localized tail for the copied
 * title; a page that carried no title keeps carrying none, so no user-visible word is born here.
 */
export function duplicateSlide(
  doc: BentoDoc,
  slideId: string,
  copySuffix: string,
): { doc: BentoDoc; index: number } {
  const index = doc.slides.findIndex((slide) => slide.id === slideId)
  const source = doc.slides[index]
  if (index === -1 || !source) return { doc, index: -1 }
  const copy: Slide = {
    ...structuredClone(source),
    id: `slide-${secureRandomId()}`,
    ...(source.title ? { title: `${source.title}${copySuffix}` } : {}),
    elements: source.elements.map((element) => ({ ...element, id: `${element.type}-${secureRandomId()}` })),
  }
  return { doc: insertSlides(doc, index + 1, [copy]), index: index + 1 }
}

export function removeElements(doc: BentoDoc, slideId: string, ids: Iterable<string>): BentoDoc {
  const doomed = new Set(ids)
  if (doomed.size === 0) return doc
  return replaceElements(doc, slideId, (current) => current.filter((element) => !doomed.has(element.id)))
}

export function moveElements(
  doc: BentoDoc,
  slideId: string,
  ids: Iterable<string>,
  dx: number,
  dy: number,
): BentoDoc {
  const moved = new Set(ids)
  if (moved.size === 0) return doc
  return replaceElements(doc, slideId, (current) =>
    current.map((element) =>
      moved.has(element.id) ? { ...element, x: element.x + dx, y: element.y + dy } : element,
    ),
  )
}
