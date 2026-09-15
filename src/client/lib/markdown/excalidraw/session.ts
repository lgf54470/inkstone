/**
 * The full screen view's handle on one block. Every method resolves the entry again, so
 * the facade keeps working when the preview re-renders underneath the overlay (which
 * re-parents the block but keeps the board alive).
 */
import { countExcalidrawElements } from './body'
import type { ExcalidrawBlockEntry } from './entry'
import {
  attachExcalidrawToOverlay,
  detachExcalidrawFromOverlay,
  excalidrawEntryForNode,
} from './registry'
import type { ExcalidrawScene } from './types'
import { flushEntry } from './write'

export interface ExcalidrawSession {
  readonly key: string
  /** The note this block writes to. */
  noteId(): string | null
  isReady(): boolean
  isEditable(): boolean
  /** True while the library owns the keyboard: a text edit, a dialog or a context menu. */
  isInteracting(): boolean
  focus(): void
  moveInto(target: HTMLElement): void
  moveBack(): void
  fit(): void
  scene(): ExcalidrawScene | null
  /** How many shapes the board holds, for the header. */
  elementCount(): number
  serialize(): string | null
  exportSvg(): Promise<Blob | null>
  exportPng(): Promise<Blob | null>
  flush(): void
}

export function openExcalidrawSession(node: HTMLElement): ExcalidrawSession | null {
  const opened = excalidrawEntryForNode(node)
  return opened ? sessionFor(opened) : null
}

/**
 * Whether Escape belongs to the board right now: while a text edit, a context menu or
 * one of its own dialogs is open, closing the overlay underneath them would take the
 * board with it.
 *
 * The names are the library's own, and they are read rather than guessed: the board
 * paints its whole properties panel up front, and two of its swatch rows carry
 * `role="dialog"` while on screen, so "is there a dialog" is not a question its own
 * markup answers truthfully. A text editor and a context menu only exist while they are
 * open, and a dialog is portaled out of the board, so it is looked for on the page.
 */
function isInteractingIn(container: HTMLElement | null): boolean {
  if (container?.querySelector('textarea.excalidraw-wysiwyg, .context-menu')) return true
  return document.querySelector('.Modal[role="dialog"]') !== null
}

async function toBlob(work: () => Promise<Blob | null>): Promise<Blob | null> {
  try {
    return await work()
  }
  catch (err) {
    console.warn('[inkstone] whiteboard export failed', err)
    return null
  }
}

/**
 * The entry object is the identity: re-renders re-parent it and renumber its key, but
 * only deleting the block (or its note) tears it down, and then every method below
 * turns into a no-op instead of touching a destroyed instance.
 */
function sessionFor(entry: ExcalidrawBlockEntry): ExcalidrawSession {
  return {
    key: entry.key,
    noteId: () => entry.noteId,
    isReady: () => Boolean(entry.handle),
    isEditable: () => Boolean(entry.editable),
    isInteracting: () => isInteractingIn(entry.container),
    focus: () => entry.handle?.focus(),
    moveInto: (target) => attachExcalidrawToOverlay(entry, target),
    moveBack: () => detachExcalidrawFromOverlay(entry),
    fit: () => entry.handle?.scrollToContent(),
    scene: () => entry.handle?.getScene() ?? entry.scene,
    elementCount: () => (entry.scene ? countExcalidrawElements(entry.scene) : 0),
    serialize: () => {
      const handle = entry.handle
      if (!handle || !entry.vendor) return null
      return entry.vendor.serialize(handle.getScene())
    },
    exportSvg: () => (entry.handle ? toBlob(() => entry.handle!.exportSvg()) : Promise.resolve(null)),
    exportPng: () => (entry.handle ? toBlob(() => entry.handle!.exportPng()) : Promise.resolve(null)),
    flush: () => flushEntry(entry),
  }
}
