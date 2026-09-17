import { serializeSlides } from './body'
import type { SlidesBlockEntry } from './entry'
import {
  attachSlidesToOverlay,
  detachSlidesFromOverlay,
  rememberSlidesOpener,
  restoreSlidesOpener,
  slidesEntryForNode,
  updateSlidesData,
} from './registry'
import type { BentoDoc, SlidesMode, SlidesWriteResult } from './types'
import { flushSlidesEntry } from './write'

export interface SlidesSession {
  readonly key: string
  noteId(): string | null
  isReady(): boolean
  isEditable(): boolean
  /** An edit exists that the note has not taken yet. */
  isDirty(): boolean
  getData(): BentoDoc | null
  updateData(updater: (prev: BentoDoc) => BentoDoc): void
  getMode(): SlidesMode
  moveInto(target: HTMLElement): void
  moveBack(): void
  /** Hands the focus back to the control the editor was opened from. */
  focusOpener(): void
  title(): string
  serialize(): string | null
  flush(): SlidesWriteResult | null
}

export function openSlidesSession(node: HTMLElement): SlidesSession | null {
  const opened = slidesEntryForNode(node)
  if (!opened) return null
  // Read here, on the way in: the pressed control is what holds the focus, and by the time the
  // overlay closes the block has been re-rendered under it.
  rememberSlidesOpener(opened)
  return sessionFor(opened)
}

function sessionFor(entry: SlidesBlockEntry): SlidesSession {
  return {
    key: entry.key,
    noteId: () => entry.noteId,
    isReady: () => Boolean(entry.data),
    isEditable: () => Boolean(entry.editable),
    isDirty: () => entry.dirty || entry.timer !== null,
    getData: () => entry.data,
    updateData: (updater) => updateSlidesData(entry, updater),
    getMode: () => entry.mode,
    moveInto: (target) => attachSlidesToOverlay(entry, target),
    moveBack: () => detachSlidesFromOverlay(entry),
    focusOpener: () => restoreSlidesOpener(entry),
    title: () => entry.data?.title || 'Slides',
    serialize: () => {
      if (!entry.data) return null
      return serializeSlides(entry.data, entry.mode)
    },
    flush: () => flushSlidesEntry(entry),
  }
}
