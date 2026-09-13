// The rules that decide what a running show presents, kept pure so the session
// behavior is testable without a browser: which note content is on screen, what a
// freeze pins, and whether the slide list opens with the viewport.

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
