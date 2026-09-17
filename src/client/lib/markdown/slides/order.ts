/**
 * Order is the one thing a deck and a slide both have: pages in the rail, elements in a
 * stack. Both are the same operation — take one out, put it back somewhere else — so it lives
 * in one pure place with one set of rules, rather than as two hand-rolled splices that drift
 * apart. Nothing here mutates its input: a deck is committed by replacing it, and an undo step
 * has to be able to hold the array it replaced.
 *
 * `moveItem` takes the TARGET'S SLOT: the moved item ends up where the item that was at
 * index `to` used to be, with everything between closing ranks. That is what a drop on a
 * thumbnail means ("put it here"), and it is the only reading that stays stable while the
 * array is being reordered under the pointer.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item === undefined) return items
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item)
  return next
}

export type SlideDirection = 'up' | 'down'

/** The deck with one page moved a step, or null when it is already at that end. */
export function moveSlide<T extends { id: string }>(
  slides: T[],
  id: string,
  direction: SlideDirection,
): { slides: T[]; index: number } | null {
  const from = slides.findIndex((slide) => slide.id === id)
  if (from === -1) return null
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= slides.length) return null
  return { slides: moveItem(slides, from, to), index: to }
}

/** The deck with one page dropped onto another's slot. */
export function reorderSlide<T extends { id: string }>(slides: T[], fromId: string, toId: string): T[] | null {
  const from = slides.findIndex((slide) => slide.id === fromId)
  const to = slides.findIndex((slide) => slide.id === toId)
  if (from === -1 || to === -1 || from === to) return null
  return moveItem(slides, from, to)
}

export type ElementDirection = 'up' | 'down' | 'front' | 'back'

/**
 * The stack with one element moved. The array IS the stack — the last element paints on top —
 * so "up" is toward the end and "front" is the end itself, which is why the layer list shows
 * the array reversed and both directions stay one rule.
 */
export function reorderElement<T extends { id: string }>(
  elements: T[],
  id: string,
  direction: ElementDirection,
): T[] | null {
  const from = elements.findIndex((element) => element.id === id)
  if (from === -1) return null
  const to =
    direction === 'front'
      ? elements.length - 1
      : direction === 'back'
        ? 0
        : direction === 'up'
          ? from + 1
          : from - 1
  if (to === from || to < 0 || to >= elements.length) return null
  return moveItem(elements, from, to)
}
