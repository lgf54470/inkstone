import { useEffect, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { isEditableTarget } from '../../../hotkeys'

/** The button a pan can start from without touching the keyboard: the wheel's own middle click. */
const PAN_BUTTON = 1

export interface SlidesPan {
  /** Space is down: the page is frozen under the pointer and the stage shows the grab cursor. */
  isPanReady: boolean
  /** A pan is running, so the cursor is closed and the listeners are already on the window. */
  isPanning: boolean
  /**
   * The press handler for the stage's *capture* phase. It has to be capture: a middle press on
   * a box would otherwise reach the box first and start a drag the reader never asked for.
   */
  onMouseDownCapture: (event: ReactMouseEvent<HTMLElement>) => void
}

/**
 * Moving the view rather than what is on it: Space (or the wheel's middle button) held over the
 * stage, then a drag. The stage is what scrolls — the page itself is laid out at absolute page
 * pixels and never moves — so a pan is a scroll of the stage's own box, which is also why the
 * gesture does nothing when the page already fits.
 *
 * Space is read on the window because the pointer may be anywhere over the stage and nothing
 * there is focusable; it is deliberately not read on the stage's chrome (the zoom cluster, the
 * slide rail), where Space means what it says — activate the focused control. The same rule
 * keeps a middle press on the chrome out of this hook: only the canvas pans.
 */
export function useSlidesPan(scrollRef: RefObject<HTMLElement | null>): SlidesPan {
  const [isPanReady, setPanReady] = useState(false)
  const [isPanning, setPanning] = useState(false)
  useSpaceHeld(setPanReady)
  useMiddleClickGuard(scrollRef)

  const onMouseDownCapture = (event: ReactMouseEvent<HTMLElement>) => {
    const container = scrollRef.current
    if (!container || !isPanPress(event, isPanReady)) return
    event.preventDefault()
    event.stopPropagation()
    dragView(container, event, setPanning)
  }

  return { isPanReady, isPanning, onMouseDownCapture }
}

/** Which press asks for the view rather than for the page: Space held, or the middle button. */
function isPanPress(event: ReactMouseEvent<HTMLElement>, isPanReady: boolean): boolean {
  if (!isPanReady && event.button !== PAN_BUTTON) return false
  return !isEditableTarget(event.target) && !isChrome(event.target)
}

/** The drag itself: the stage scrolls under the pointer until the button comes back up. */
function dragView(
  container: HTMLElement,
  event: ReactMouseEvent<HTMLElement>,
  setPanning: (panning: boolean) => void,
): void {
  let lastX = event.clientX
  let lastY = event.clientY
  setPanning(true)

  const move = (moveEvent: MouseEvent) => {
    // The pointer's own motion is inverted: pushing the page right shows what was off to
    // the left, which is the gesture a hand expects on a sheet of paper.
    container.scrollLeft -= moveEvent.clientX - lastX
    container.scrollTop -= moveEvent.clientY - lastY
    lastX = moveEvent.clientX
    lastY = moveEvent.clientY
  }
  const up = () => {
    setPanning(false)
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

/** Space, read on the window for as long as the stage is up. */
function useSpaceHeld(setPanReady: (held: boolean) => void): void {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat) return
      if (isEditableTarget(event.target) || isChrome(event.target)) return
      // Space is the stage's key while this surface is up: the browser must not scroll after it.
      event.preventDefault()
      setPanReady(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === ' ') setPanReady(false)
    }
    // A window that lost the keyup — a tab switch mid-drag — must not come back armed.
    const leave = () => setPanReady(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', leave)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', leave)
    }
  }, [setPanReady])
}

/**
 * Middle click pastes on X11, and the paste is an `auxclick` — which arrives after the mouseup
 * that already ended the pan, so it is caught on its own listener rather than by the drag.
 */
function useMiddleClickGuard(scrollRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const aux = (event: MouseEvent) => {
      const container = scrollRef.current
      if (event.button !== PAN_BUTTON || !container) return
      if (!(event.target instanceof Node) || !container.contains(event.target)) return
      event.preventDefault()
    }
    window.addEventListener('auxclick', aux)
    return () => window.removeEventListener('auxclick', aux)
  }, [scrollRef])
}

/**
 * The stage's own controls: a press or a Space that lands on one of them is that control's, not
 * the view's. Links and menus are in the list for the same reason — none of them sits on the
 * page, and all of them would lose their own meaning if a pan took the gesture.
 */
function isChrome(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('button, a, input, select, textarea, [role="menu"]') !== null
}
