import { useEffect, useRef, type RefObject } from 'react'
import { isEditableTarget } from '../../../hotkeys'

/** What the clipboard carried: the deck's own payload, somebody else's text, or a picture. */
export interface SlidesClipboardData {
  text: string
  image: File | null
}

/**
 * What the editor does with a key or a clipboard event. Every intent answers whether it acted:
 * a false lets the event through to the browser's own behaviour, which is what makes copying a
 * passage of someone's text still work while nothing on the canvas is selected.
 */
export interface SlidesKeyIntents {
  /** The payload to put on the clipboard, or null to leave the copy to the browser. */
  onCopy: () => string | null
  /** The payload to put on the clipboard, having also removed what it copied. */
  onCut: () => string | null
  onPaste: (data: SlidesClipboardData) => boolean
  onDelete: () => boolean
  onDuplicate: () => boolean
  onNudge: (dx: number, dy: number) => boolean
  onZoom: (command: 'in' | 'out' | 'reset') => boolean
}

const NUDGE_STEP = 1
const NUDGE_STEP_FAR = 10

const NUDGE_KEYS: Record<string, readonly [number, number] | undefined> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

/**
 * The editor's keyboard and its side of the system clipboard, as one listener set.
 *
 * Both live here because both are the same question — "is the document listening right now?" —
 * and both have the same answer for the same reason: a text box, a code editor or an input owns
 * them while the reader is typing in it. The intents are read through a ref, so the listeners
 * are registered once and still see the handlers of the newest render.
 */
export function useSlidesKeys(active: boolean, intents: SlidesKeyIntents): void {
  const latest = useRef(intents)
  useEffect(() => {
    latest.current = intents
  })

  useEffect(() => {
    if (!active) return
    return listen(latest)
  }, [active])
}

/** Registers the four listeners and returns the unmount that takes them off again. */
function listen(latest: RefObject<SlidesKeyIntents>): () => void {
  const keyDown = (event: KeyboardEvent): void => keyIntent(event, latest.current)
  const copy = (event: ClipboardEvent): void => writeIntent(event, latest.current.onCopy)
  const cut = (event: ClipboardEvent): void => writeIntent(event, latest.current.onCut)
  const paste = (event: ClipboardEvent): void => pasteIntent(event, latest.current)

  window.addEventListener('keydown', keyDown)
  window.addEventListener('copy', copy)
  window.addEventListener('cut', cut)
  window.addEventListener('paste', paste)
  return () => {
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('copy', copy)
    window.removeEventListener('cut', cut)
    window.removeEventListener('paste', paste)
  }
}

function keyIntent(event: KeyboardEvent, intents: SlidesKeyIntents): void {
  if (isTextEntry(event.target) || event.altKey) return
  if (event.metaKey || event.ctrlKey) {
    apply(event, modifierIntent(event, intents))
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    apply(event, intents.onDelete())
    return
  }
  const direction = NUDGE_KEYS[event.key]
  if (!direction) return
  const step = event.shiftKey ? NUDGE_STEP_FAR : NUDGE_STEP
  apply(event, intents.onNudge(direction[0] * step, direction[1] * step))
}

/** The path a held modifier takes: history-free commands only, because ⌘Z belongs to the browser. */
function modifierIntent(event: KeyboardEvent, intents: SlidesKeyIntents): boolean {
  if (event.key === 'd' || event.key === 'D') return intents.onDuplicate()
  if (event.key === '=' || event.key === '+') return intents.onZoom('in')
  if (event.key === '-') return intents.onZoom('out')
  if (event.key === '0') return intents.onZoom('reset')
  return false
}

function writeIntent(event: ClipboardEvent, take: () => string | null): void {
  if (isTextEntry(event.target)) return
  const payload = take()
  if (!payload) return
  event.preventDefault()
  event.clipboardData?.setData('text/plain', payload)
}

function pasteIntent(event: ClipboardEvent, intents: SlidesKeyIntents): void {
  if (isTextEntry(event.target)) return
  const text = event.clipboardData?.getData('text/plain') ?? ''
  const image = firstImage(event.clipboardData)
  if (!text && !image) return
  if (intents.onPaste({ text, image })) event.preventDefault()
}

function apply(event: Event, handled: boolean): void {
  if (handled) event.preventDefault()
}

/**
 * Typing owns the keyboard and the clipboard: a text box, a form control, or the code editor.
 * The attribute is checked alongside the app's own editable-target rule because it is what the
 * browser reads, and because `isContentEditable` is not implemented everywhere. An ancestor
 * saying `contenteditable="false"` is not editable, which is how a deck's own toolbar sits
 * inside one.
 */
function isTextEntry(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) return true
  if (!(target instanceof Element)) return false
  const editable = target.closest('[contenteditable]')
  return editable !== null && editable.getAttribute('contenteditable') !== 'false'
}

function firstImage(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const file of [...data.files]) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}
