// The show's keymap as a pure function so it can be tested without a browser: which
// command a key press means, given whether a control or the slide list owns the event.
// Navigation keys always move slides so a stray focused control can never trap the
// keyboard; Space/Enter yield to the focused control to avoid double actions, and the
// slide list keeps the arrows it needs to walk its own items.

export type PresentationCommand = 'next' | 'prev' | 'first' | 'last' | 'fullscreen' | 'slideList' | 'follow'

export interface PresentationKeyContext {
  /** The event targets a button, link or editable control. */
  onControl: boolean
  /** The event targets the slide list, which handles its own arrows. */
  onSlideList: boolean
}

export function presentationCommand(key: string, context: PresentationKeyContext): PresentationCommand | null {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
      return 'next'
    case 'ArrowLeft':
    case 'PageUp':
      return 'prev'
    case 'ArrowDown':
      return context.onSlideList ? null : 'next'
    case 'ArrowUp':
      return context.onSlideList ? null : 'prev'
    case 'Home':
      return context.onSlideList ? null : 'first'
    case 'End':
      return context.onSlideList ? null : 'last'
    case ' ':
    case 'Enter':
      return context.onControl ? null : 'next'
    case 'f':
    case 'F':
      return 'fullscreen'
    case 'l':
    case 'L':
      return 'follow'
    case 's':
    case 'S':
      return 'slideList'
    default:
      return null
  }
}
