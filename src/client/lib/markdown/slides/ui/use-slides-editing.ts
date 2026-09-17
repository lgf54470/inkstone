import { useCallback, useEffect, useRef } from 'react'
import { t } from '../../../i18n'
import { useUi } from '../../../../store/ui'
import type { BentoDoc, SlideElement } from '../types'
import { PASTE_OFFSET, clipElements, pasteClip, readClip } from '../clipboard'
import { appendElements, moveElements, pickElements, removeElements } from '../edits'
import { createTextFromClipboard } from './element-factories'
import { useSlidesKeys, type SlidesClipboardData, type SlidesKeyIntents } from './use-slides-keys'

export interface SlidesEditingHost {
  /** Only the full screen editor listens; a card in a note has to leave the keys to the note. */
  enabled: boolean
  doc: BentoDoc
  /** The slide an edit lands on, read when the edit happens rather than when the key was pressed. */
  targetSlideId: () => string | null
  selectedIds: () => string[]
  /** The history's own commit, so a paste is one undo step like any other edit. */
  commit: (update: (previous: BentoDoc) => BentoDoc) => void
  select: (elementIds: string[]) => void
  zoom: (command: 'in' | 'out' | 'reset') => void
  /** A pasted picture goes through the same upload the insert dialog uses. */
  pasteImage: (file: File) => void
}

export interface SlidesEditing {
  /** Copy the named elements to the system clipboard (the menu's row, and the keyboard's path). */
  copy: (elementIds: string[]) => void
  cut: (elementIds: string[]) => void
  /** Paste text the menu read from the clipboard; false when it was not deck material. */
  pasteText: (text: string) => boolean
  /** The menu's Paste: the clipboard is read on demand, and a pasted nothing says so. */
  pasteFromClipboard: () => void
}

/**
 * Editing by clipboard and by key: what the reader means when they press ⌘C, ⌘V, ⌘D, delete or an
 * arrow, and what a paste off the system clipboard means for this document.
 *
 * Three things arrive on a clipboard and all three land somewhere: this deck's own payload
 * (elements, with the bytes they point at), somebody else's text (a text box, escaped — a
 * fragment pasted from a web page is text, never markup), and a picture (the same upload path
 * the insert dialog takes). Nothing is pasted on a guess: a payload this build cannot read is
 * not a copy of an element, so it falls through to the text it plainly is.
 *
 * The host is read through a ref, so the listeners registered once still apply to the document
 * as it is now — the slide a paste lands on may have been reordered or deleted between the copy
 * and the paste, which is exactly why the target is looked up rather than remembered.
 */
export function useSlidesEditing(host: SlidesEditingHost): SlidesEditing {
  const latest = useRef(host)
  useEffect(() => {
    latest.current = host
  })
  const current = useCallback((): SlidesEditingHost => latest.current, [])

  const copy = useCallback((elementIds: string[]) => copySelection(current(), elementIds), [current])
  const cut = useCallback((elementIds: string[]) => {
    void cutSelection(current(), elementIds)
  }, [current])
  const pasteText = useCallback((text: string) => pasteClipboardText(current(), text), [current])
  const pasteFromClipboard = useCallback(() => {
    void readSystemClipboardText().then((text) => {
      if (!text || !pasteClipboardText(current(), text)) {
        useUi.getState().toast({ title: t('slides.paste_nothing'), tone: 'danger' })
      }
    })
  }, [current])

  const intents: SlidesKeyIntents = {
    onCopy: () => payloadOf(current()),
    onCut: () => cutPayload(current()),
    onPaste: (data: SlidesClipboardData) => pasteClipboard(current(), data),
    onDelete: () => deleteSelection(current()),
    onDuplicate: () => duplicateSelection(current()),
    onNudge: (dx: number, dy: number) => nudgeSelection(current(), dx, dy),
    onZoom: (command) => {
      current().zoom(command)
      return true
    },
  }
  useSlidesKeys(host.enabled, intents)

  return { copy, cut, pasteText, pasteFromClipboard }
}

/** The elements named by ids, in the slide's own order rather than the order they were named. */
function namedElements(host: SlidesEditingHost, ids: Iterable<string>): SlideElement[] {
  const wanted = new Set(ids)
  return pickElements(host.doc, host.targetSlideId(), wanted).filter((element) => wanted.has(element.id))
}

/**
 * Copying from a menu row rather than from a key. A keystroke comes with a clipboard event in
 * hand, so the payload goes straight into it; a click has no such event, which is why this half
 * writes through the async clipboard and says so when a browser refuses the write.
 */
function copySelection(host: SlidesEditingHost, elementIds: string[]): void {
  const payload = payloadOf(host, namedElements(host, elementIds))
  if (payload) void writeSystemClipboard(payload)
}

/** A cut removes what it copied, so it waits for the copy to land: a refused write keeps the elements. */
async function cutSelection(host: SlidesEditingHost, elementIds: string[]): Promise<void> {
  const elements = namedElements(host, elementIds)
  const payload = payloadOf(host, elements)
  if (!payload) return
  if (!(await writeSystemClipboard(payload))) return
  deleteSelection(host, elements.map((element) => element.id))
}

function payloadOf(host: SlidesEditingHost, elements?: SlideElement[]): string | null {
  const chosen = elements ?? pickElements(host.doc, host.targetSlideId(), host.selectedIds())
  return chosen.length > 0 ? clipElements(chosen, host.doc.assets) : null
}

/** The cut's own payload: copy first, and only remove once there is something on the clipboard. */
function cutPayload(host: SlidesEditingHost): string | null {
  const payload = payloadOf(host)
  if (payload) deleteSelection(host)
  return payload
}

function pasteClipboard(host: SlidesEditingHost, data: SlidesClipboardData): boolean {
  if (data.image) {
    host.pasteImage(data.image)
    return true
  }
  return pasteClipboardText(host, data.text)
}

function pasteClipboardText(host: SlidesEditingHost, text: string): boolean {
  return pastePayload(host, text) || (text.trim() ? insertText(host, text) : false)
}

function pastePayload(host: SlidesEditingHost, payload: string): boolean {
  const clip = readClip(payload)
  const slideId = host.targetSlideId()
  if (!clip || !slideId) return false
  const { elements, assets } = pasteClip(clip, host.doc.assets, PASTE_OFFSET)
  host.commit((previous) => appendElements(previous, slideId, elements, assets))
  host.select(elements.map((element) => element.id))
  return true
}

function insertText(host: SlidesEditingHost, text: string): boolean {
  const slideId = host.targetSlideId()
  if (!slideId) return false
  const element = createTextFromClipboard(text)
  host.commit((previous) => appendElements(previous, slideId, [element]))
  host.select([element.id])
  return true
}

function deleteSelection(host: SlidesEditingHost, ids?: Iterable<string>): boolean {
  const slideId = host.targetSlideId()
  if (!slideId) return false
  const doomed = ids ?? host.selectedIds()
  const elements = pickElements(host.doc, slideId, doomed)
  if (elements.length === 0) return false
  const removed = elements.map((element) => element.id)
  host.commit((previous) => removeElements(previous, slideId, removed))
  host.select([])
  return true
}

function duplicateSelection(host: SlidesEditingHost): boolean {
  const elements = pickElements(host.doc, host.targetSlideId(), host.selectedIds())
  const slideId = host.targetSlideId()
  if (elements.length === 0 || !slideId) return false
  const { elements: copies } = pasteClip({ elements, assets: {} }, host.doc.assets, PASTE_OFFSET)
  host.commit((previous) => appendElements(previous, slideId, copies))
  host.select(copies.map((element) => element.id))
  return true
}

function nudgeSelection(host: SlidesEditingHost, dx: number, dy: number): boolean {
  const slideId = host.targetSlideId()
  const ids = host.selectedIds()
  if (!slideId || ids.length === 0) return false
  host.commit((previous) => moveElements(previous, slideId, ids, dx, dy))
  return true
}

/**
 * The clipboard, read on demand. A browser may refuse the read (an unfocused document, a denied
 * permission), and the answer to a refused read is the same as the answer to an empty one: the
 * menu row says there was nothing to paste rather than appearing to do nothing.
 */
async function readSystemClipboardText(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText()
  } catch (error) {
    console.warn('[slides] the clipboard could not be read', error)
    return null
  }
}

/** The write side of the same door: false means the reader was told, and nothing was copied. */
async function writeSystemClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.warn('[slides] the clipboard could not be written', error)
    useUi.getState().toast({ title: t('slides.copy_failed'), tone: 'danger' })
    return false
  }
}
