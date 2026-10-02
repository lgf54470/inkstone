// The show's keymap as a pure function so it can be tested without a browser: which
// command a key press means, given whether a control or the slide list owns the event.
// Navigation keys always move slides so a stray focused control can never trap the
// keyboard; Space/Enter yield to the focused control to avoid double actions, each list
// keeps only the keys its own walk uses — the rail the vertical ones, the overview grid
// both directions — and the notes pane keeps every key a speaker reads by scrolling.

export type PresentationCommand = 'next' | 'prev' | 'first' | 'last' | 'fullscreen' | 'slideList' | 'follow' | 'blackout' | 'whiteout' | 'laser' | 'spotlight' | 'overview' | 'presenter'

export interface PresentationKeyContext {
  /** The event targets a button, link or editable control. */
  onControl: boolean
  /** The event targets the slide rail, which walks its column with the vertical keys. */
  onSlideList: boolean
  /** The event targets the overview grid, which roams its cards across rows as well as down them. */
  onOverviewGrid?: boolean
  /** The event targets the speaker notes pane, which is read by scrolling rather than by turning. */
  onNotesPane?: boolean
  /** The event targets an open menu which walks its own items. */
  onMenu?: boolean
}

export function presentationCommand(key: string, context: PresentationKeyContext): PresentationCommand | null {
  if (context.onMenu) return null
  const onNotes = Boolean(context.onNotesPane)
  const onGrid = Boolean(context.onOverviewGrid)
  // The rail walks its column and the grid roams its rows, both with Home/End; a notes pane pages as
  // it is read, so it keeps PageUp/PageDown too. Only the grid claims the sideways turn: the rail
  // has no use for it, and yielding it there left the turn handled by neither side.
  const ownsVertical = context.onSlideList || onNotes || onGrid
  const ownsSideways = onGrid
  switch (key) {
    case 'ArrowRight':
      return ownsSideways ? null : 'next'
    case 'PageDown':
      return onNotes ? null : 'next'
    case 'ArrowLeft':
      return ownsSideways ? null : 'prev'
    case 'PageUp':
      return onNotes ? null : 'prev'
    case 'ArrowDown':
      return ownsVertical ? null : 'next'
    case 'ArrowUp':
      return ownsVertical ? null : 'prev'
    case 'Home':
      return ownsVertical ? null : 'first'
    case 'End':
      return ownsVertical ? null : 'last'
    case ' ':
      return context.onControl || onNotes ? null : 'next'
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
