import { serializeSlides } from './body'
import type { SlidesBlockEntry } from './entry'
import {
  attachSlidesToOverlay,
  detachSlidesFromOverlay,
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
  title(): string
  serialize(): string | null
  flush(): SlidesWriteResult | null
}

export function openSlidesSession(node: HTMLElement): SlidesSession | null {
  const opened = slidesEntryForNode(node)
  return opened ? sessionFor(opened) : null
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
    title: () => entry.data?.title || 'Slides',
    serialize: () => {
      if (!entry.data) return null
      return serializeSlides(entry.data, entry.mode)
    },
    flush: () => flushSlidesEntry(entry),
  }
}
