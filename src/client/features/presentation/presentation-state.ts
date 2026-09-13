// The rules that decide what a running show presents, kept pure so the session
// behavior is testable without a browser: which note content is on screen, what a
// freeze pins, whether the slide list opens with the viewport, and how the deck
// flattens into the page list the sidebar shows.

import type { SlidePlan } from './slide-pagination'

export interface PresentedContentOptions {
  following: boolean
  /** Content captured at start, or pinned by an explicit freeze. */
  snapshot: string
  /** Live note content; undefined until the note's body is loaded. */
  live: string | undefined
  /** False once the note is deleted, closed, or otherwise gone from memory. */
  noteExists: boolean
}

// Following reads the live note, but a note that disappeared must never blank the
// projector mid-talk: the last snapshot stays up until the presenter exits.
export function presentedNoteContent(options: PresentedContentOptions): string {
  if (!options.following) return options.snapshot
  if (!options.noteExists) return options.snapshot
  return options.live ?? options.snapshot
}

// The slide list opens by default where the viewport has room for it, and an
// explicit toggle during the show wins over that default.
export function railOpenFor(choice: boolean | null, fitsViewport: boolean): boolean {
  return choice ?? fitsViewport
}

/** One navigable page: a `---` slide plus the overflow page inside it. */
export interface RailEntry {
  slide: number
  sub: number
  pageCount: number
}

// The sidebar lists pages, not `---` slides: a note that never uses `---` is one
// slide but many pages, and a one-entry list would hide everything the arrow keys
// can reach. A slide whose layout has not been measured yet contributes a single
// entry — that is its floor, and it expands to its real pages once the canvas
// measures it. Order is the order the show walks, so numbering and clicking agree.
export function railEntries(deckLength: number, plans: Record<number, SlidePlan>): RailEntry[] {
  const entries: RailEntry[] = []
  for (let slide = 0; slide < deckLength; slide++) {
    const pages = plans[slide]?.pages.length ?? 1
    for (let sub = 0; sub < Math.max(pages, 1); sub++) entries.push({ slide, sub, pageCount: Math.max(pages, 1) })
  }
  return entries
}

// Which slide an idle preflight pass should measure next: deck order so the slide list
// fills top-down, skipping the slides that already have a plan and the ones a stalled
// measure gave up on (the canvas still measures those when the show reaches them).
export function nextUnmeasuredSlide(deckLength: number, measured: Iterable<number>, from: number): number | null {
  const done = new Set(measured)
  for (let slide = Math.max(from, 0); slide < deckLength; slide++) {
    if (!done.has(slide)) return slide
  }
  return null
}

// How long the idle pass waits before its next slice. One slice is a single unpausable
// commit — a markdown render, a diagram and a pagination measure — worth tens of
// milliseconds, so the wait is derived from what the last slice actually cost rather than
// from a fixed delay: the pass then uses at most a fixed share of the main thread on any
// machine, and a slower one takes longer to fill the list instead of stuttering through a
// talk. The floor keeps back-to-back slices from clustering into a busy stretch.
export function nextSliceGap(lastSliceMs: number, duty: number, floorMs: number): number {
  return Math.max(floorMs, Math.round(lastSliceMs * (duty - 1)))
}

// The entry the show is on, so the list can mark and scroll to it. A slide whose
// pages shrank under a re-measure still resolves to its nearest page.
export function entryIndexOf(entries: RailEntry[], slide: number, sub: number): number {
  const exact = entries.findIndex((entry) => entry.slide === slide && entry.sub === sub)
  if (exact >= 0) return exact
  const nearest = entries.findIndex((entry) => entry.slide === slide)
  return nearest
}
