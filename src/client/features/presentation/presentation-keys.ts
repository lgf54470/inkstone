// The show's keymap as a pure function so it can be tested without a browser: which
// command a key press means, given whether a control or the slide list owns the event.
// Navigation keys always move slides so a stray focused control can never trap the
// keyboard; Space/Enter yield to the focused control to avoid double actions, and the
// slide list keeps the arrows it needs to walk its own items.

export type PresentationCommand = 'next' | 'prev' | 'first' | 'last' | 'fullscreen' | 'slideList' | 'follow' | 'blackout' | 'whiteout' | 'laser' | 'spotlight' | 'overview' | 'presenter'

export interface PresentationKeyContext {
  /** The event targets a button, link or editable control. */
  onControl: boolean
  /** The event targets a list of slides — the rail or the overview grid — which walks its own arrows. */
  onSlideList: boolean
}

export function presentationCommand(key: string, context: PresentationKeyContext): PresentationCommand | null {
  switch (key) {
    case 'ArrowRight':
      return context.onSlideList ? null : 'next'
    case 'PageDown':
      return 'next'
    case 'ArrowLeft':
      return context.onSlideList ? null : 'prev'
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
    case '.':
      return context.onControl ? null : 'blackout'
    case ',':
      return context.onControl ? null : 'whiteout'
    default: {
      const tool = TOOL_KEYS[key.length === 1 ? key.toLowerCase() : '']
      return tool === undefined || context.onControl ? null : tool
    }
  }
}

// The tools a single letter drives, all of which yield to a focused control. Written as a table
// because the eight cases it replaces differed only in the letter: adding a tool is one row here.
// The pointer takes C because L already drives following, and moving a shipped key would cost more
// than the mnemonic it buys; O is the key a deck overview has carried since reveal.js and G names
// the grid it is laid out as, so a presenter who reaches for either gets the same screen.
const TOOL_KEYS: Record<string, PresentationCommand> = {
  f: 'fullscreen',
  l: 'follow',
  c: 'laser',
  t: 'spotlight',
  k: 'spotlight',
  s: 'slideList',
  o: 'overview',
  g: 'overview',
  b: 'blackout',
  w: 'whiteout',
  p: 'presenter',
}
