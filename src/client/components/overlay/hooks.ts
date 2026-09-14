import { useEffect, useRef, type RefObject } from 'react'





const escStack: (() => void)[] = []


export function useEscape(active: boolean, onEscape: () => void): void {
  const callbackRef = useRef(onEscape)
  callbackRef.current = onEscape
  useEffect(() => {
    if (!active)
      return
    const handler = () => callbackRef.current()
    escStack.push(handler)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape')
        return
      // A node editor inside a canvas widget (the mind map's inline topic edit)
      // owns Escape while it is open: the event has to reach it, or canceling the
      // edit would close the whole overlay instead.
      if (ownsEscape(event.target))
        return
      const top = escStack[escStack.length - 1]
      if (top !== handler)
        return
      event.preventDefault()
      event.stopPropagation()
      handler()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      const index = escStack.indexOf(handler)
      if (index >= 0)
        escStack.splice(index, 1)
    }
  }, [active])
}


export function useClickOutside(refs: RefObject<HTMLElement | null>[], active: boolean, onOutside: () => void): void {
  const refsRef = useRef(refs)
  const callbackRef = useRef(onOutside)
  refsRef.current = refs
  callbackRef.current = onOutside
  useEffect(() => {
    if (!active)
      return
    const handler = (event: MouseEvent) => {
      const target = event.target as Node
      if (refsRef.current.some((ref) => ref.current?.contains(target)))
        return
      callbackRef.current()
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [active])
}



let scrollLockCount = 0



let unlockedBodyOverflow = ''


export function useLockScroll(active: boolean): void {
  useEffect(() => {
    if (!active)
      return
    if (scrollLockCount === 0)
      unlockedBodyOverflow = document.body.style.overflow
    scrollLockCount++
    document.body.style.overflow = 'hidden'
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1)
      if (scrollLockCount === 0)
        document.body.style.overflow = unlockedBodyOverflow
    }
  }, [active])
}



const dialogStack: symbol[] = []



const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',')



export function useDialogFocus<T extends HTMLElement>(active: boolean, panelRef: RefObject<T | null>, initialFocusRef?: RefObject<HTMLElement | null>): void {
  // Last place inside the panel that held focus. The dialog can replace the
  // content the opener lived in while it is open (a mind map edit re-renders the
  // note under a full screen overlay), which disconnects the captured
  // `previousFocus` — this is what focus returns to instead.
  const lastInPanelRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!active)
      return
    const token = Symbol('dialog')
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lastInPanelRef.current = null
    dialogStack.push(token)
    const panel = panelRef.current
    const requestedInitial = initialFocusRef?.current ??
      panel?.querySelector<HTMLElement>('[data-autofocus]')
    const initial = requestedInitial && isAvailableFocusTarget(requestedInitial)
      ? requestedInitial
      : [...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])]
        .find(isAvailableFocusTarget);
    (initial ?? panel)?.focus({ preventScroll: true })
    const onFocusIn = (event: FocusEvent) => {
      const element = event.target
      if (element instanceof HTMLElement && panel?.contains(element))
        lastInPanelRef.current = element
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || dialogStack[dialogStack.length - 1] !== token)
        return
      // A canvas widget (mind map) owns Tab as a map shortcut, so the trap lets
      // it through; its toolbar's Shift+Tab still leaves the widget.
      if (ownsTab(event.target))
        return
      const currentPanel = panelRef.current
      if (currentPanel)
        cycleFocus(event, currentPanel)
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      const index = dialogStack.indexOf(token)
      if (index >= 0)
        dialogStack.splice(index, 1)
      restoreFocusAfterClose(previousFocus, lastInPanelRef.current)
    }
  }, [active, initialFocusRef, panelRef])
}

/**
 * Hands focus back when a dialog closes: the still-connected opener, else the
 * successor the opener was re-rendered into, else the last place inside the
 * panel (which a live map keeps alive by re-parenting its element).
 */
function restoreFocusAfterClose(previousFocus: HTMLElement | null, lastInPanel: HTMLElement | null): void {
  if (previousFocus?.isConnected) {
    previousFocus.focus({ preventScroll: true })
    return
  }
  if (previousFocus) {
    const successor = successorOf(previousFocus, lastInPanel)
    ;(successor ?? lastInPanel)?.focus({ preventScroll: true })
    return
  }
  lastInPanel?.focus({ preventScroll: true })
}




function isAvailableFocusTarget(element: HTMLElement): boolean {
  return !element.matches(':disabled') && !element.closest('[hidden], [aria-hidden="true"]')
}

/**
 * A re-render while the dialog is open can replace the element that opened it
 * with an equivalent one (a note edit under the full screen mind map rebuilds
 * the block and its buttons). The stale opener's data attributes describe its
 * successor; when several elements share the signature, the one sharing the
 * deepest ancestor with the dialog's last focused element is the replacement
 * in the same block of the document, not a lookalike elsewhere.
 */
function successorOf(stale: HTMLElement, hint: HTMLElement | null): HTMLElement | null {
  // Boolean-style data attributes ship with an empty value (`data-mindmap-fullscreen`),
  // and `[data-x=""]` matches them, so they are part of the signature too.
  const pairs = [...stale.attributes].filter((attr) => attr.name.startsWith('data-'))
  if (pairs.length === 0) return null
  const selector = pairs.map((attr) => `[${attr.name}="${CSS.escape(attr.value)}"]`).join('')
  const candidates = [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => el.isConnected && isAvailableFocusTarget(el))
  if (candidates.length === 0) return null
  if (candidates.length === 1 || !hint || !hint.isConnected) return candidates[0]!
  const ancestors = new Set<Node>()
  for (let node: Node | null = hint; node; node = node.parentNode) ancestors.add(node)
  let best: HTMLElement = candidates[0]!
  let bestDepth = -1
  for (const candidate of candidates) {
    let depth = 0
    for (let node: Node | null = candidate; node; node = node.parentNode) {
      if (ancestors.has(node)) break
      depth += 1
    }
    if (depth > bestDepth) {
      best = candidate
      bestDepth = depth
    }
  }
  return best
}

function cycleFocus(event: KeyboardEvent, panel: HTMLElement): void {
  const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isAvailableFocusTarget)
  if (focusable.length === 0) {
    event.preventDefault()
    panel.focus({ preventScroll: true })
    return
  }
  const index = focusable.indexOf(document.activeElement as HTMLElement)
  if (event.shiftKey && index <= 0) {
    event.preventDefault()
    focusable[focusable.length - 1]?.focus({ preventScroll: true })
  }
  else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) {
    event.preventDefault()
    focusable[0]?.focus({ preventScroll: true })
  }
}

/** Elements of a canvas widget (mind map) that give an event its own meaning. */
const CANVAS_SELECTOR = '[data-mindmap-canvas]'

function ownsEscape(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(`${CANVAS_SELECTOR} [contenteditable]`))
}

function ownsTab(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(CANVAS_SELECTOR))
}
