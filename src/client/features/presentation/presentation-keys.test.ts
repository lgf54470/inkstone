import { describe, expect, it } from 'vitest'
import { presentationCommand } from './presentation-keys'

const plain = { onControl: false, onSlideList: false }
const onControl = { onControl: true, onSlideList: false }
const onSlideList = { onControl: false, onSlideList: true }

describe('presentationCommand — navigation', () => {
  it('walks the deck with the arrow, page and space keys', () => {
    expect(presentationCommand('ArrowRight', plain)).toBe('next')
    expect(presentationCommand('ArrowDown', plain)).toBe('next')
    expect(presentationCommand('PageDown', plain)).toBe('next')
    expect(presentationCommand(' ', plain)).toBe('next')
    expect(presentationCommand('ArrowLeft', plain)).toBe('prev')
    expect(presentationCommand('ArrowUp', plain)).toBe('prev')
    expect(presentationCommand('PageUp', plain)).toBe('prev')
  })

  it('jumps to the deck edges with Home and End', () => {
    expect(presentationCommand('Home', plain)).toBe('first')
    expect(presentationCommand('End', plain)).toBe('last')
  })

  it('ignores keys that belong to the rest of the page', () => {
    expect(presentationCommand('a', plain)).toBeNull()
    expect(presentationCommand('Escape', plain)).toBeNull()
    expect(presentationCommand('Tab', plain)).toBeNull()
  })
})

describe('presentationCommand — toggles and focus ownership', () => {
  it('toggles fullscreen, the slide list and following on F, S and L', () => {
    expect(presentationCommand('f', plain)).toBe('fullscreen')
    expect(presentationCommand('F', plain)).toBe('fullscreen')
    expect(presentationCommand('s', plain)).toBe('slideList')
    expect(presentationCommand('S', plain)).toBe('slideList')
    expect(presentationCommand('l', plain)).toBe('follow')
    expect(presentationCommand('L', plain)).toBe('follow')
  })

  it('still navigates while a control has focus, so a stray button cannot trap the keyboard', () => {
    expect(presentationCommand('ArrowRight', onControl)).toBe('next')
    expect(presentationCommand('End', onControl)).toBe('last')
  })

  it('leaves Space and Enter to the focused control instead of clicking twice', () => {
    expect(presentationCommand(' ', onControl)).toBeNull()
    expect(presentationCommand('Enter', onControl)).toBeNull()
  })

  it('leaves single-letter toggle keys to the focused control so typing is not hijacked', () => {
    expect(presentationCommand('f', onControl)).toBeNull()
    expect(presentationCommand('F', onControl)).toBeNull()
    expect(presentationCommand('s', onControl)).toBeNull()
    expect(presentationCommand('S', onControl)).toBeNull()
    expect(presentationCommand('l', onControl)).toBeNull()
    expect(presentationCommand('L', onControl)).toBeNull()
  })

  it('lets the slide list keep the arrows it walks its own items with', () => {
    expect(presentationCommand('ArrowUp', onSlideList)).toBeNull()
    expect(presentationCommand('ArrowDown', onSlideList)).toBeNull()
    expect(presentationCommand('ArrowLeft', onSlideList)).toBeNull()
    expect(presentationCommand('ArrowRight', onSlideList)).toBeNull()
    expect(presentationCommand('Home', onSlideList)).toBeNull()
    expect(presentationCommand('End', onSlideList)).toBeNull()
  })

  it('still turns pages from the list when the key is not an arrow or home/end', () => {
    expect(presentationCommand('PageDown', onSlideList)).toBe('next')
    expect(presentationCommand('PageUp', onSlideList)).toBe('prev')
    expect(presentationCommand(' ', onSlideList)).toBe('next')
    expect(presentationCommand('Escape', onSlideList)).toBeNull()
  })
})

describe('presentationCommand — laser pointer', () => {
  it('toggles the laser pointer on C', () => {
    expect(presentationCommand('c', plain)).toBe('laser')
    expect(presentationCommand('C', plain)).toBe('laser')
  })

  it('leaves C to the focused control so typing is not hijacked', () => {
    expect(presentationCommand('c', onControl)).toBeNull()
    expect(presentationCommand('C', onControl)).toBeNull()
  })

  it('keeps the pointer key off L, which has driven following since the first batch', () => {
    expect(presentationCommand('l', plain)).toBe('follow')
    expect(presentationCommand('L', plain)).toBe('follow')
  })
})

describe('presentationCommand — slide overview', () => {
  it('opens the overview on O, and on G for the grid it is laid out as', () => {
    expect(presentationCommand('o', plain)).toBe('overview')
    expect(presentationCommand('O', plain)).toBe('overview')
    expect(presentationCommand('g', plain)).toBe('overview')
    expect(presentationCommand('G', plain)).toBe('overview')
  })

  it('leaves O and G to the focused control so typing is not hijacked', () => {
    expect(presentationCommand('o', onControl)).toBeNull()
    expect(presentationCommand('G', onControl)).toBeNull()
  })

  it('keeps the overview keys off the letters the show has already shipped', () => {
    expect(presentationCommand('f', plain)).toBe('fullscreen')
    expect(presentationCommand('s', plain)).toBe('slideList')
    expect(presentationCommand('l', plain)).toBe('follow')
    expect(presentationCommand('c', plain)).toBe('laser')
    expect(presentationCommand('b', plain)).toBe('blackout')
    expect(presentationCommand('w', plain)).toBe('whiteout')
  })

  it('lets the grid keep the arrows it roams its cards with, as the slide list does', () => {
    expect(presentationCommand('ArrowRight', onSlideList)).toBeNull()
    expect(presentationCommand('ArrowDown', onSlideList)).toBeNull()
    expect(presentationCommand('Home', onSlideList)).toBeNull()
  })

  it('still turns pages with PageDown while the grid holds the arrows', () => {
    expect(presentationCommand('PageDown', onSlideList)).toBe('next')
  })
})

describe('presentationCommand — blackout and whiteout', () => {
  it('toggles blackout and whiteout on B/W and period/comma', () => {
    expect(presentationCommand('b', plain)).toBe('blackout')
    expect(presentationCommand('B', plain)).toBe('blackout')
    expect(presentationCommand('.', plain)).toBe('blackout')
    expect(presentationCommand('w', plain)).toBe('whiteout')
    expect(presentationCommand('W', plain)).toBe('whiteout')
    expect(presentationCommand(',', plain)).toBe('whiteout')
  })

  it('leaves B and W to the focused control so form fields are not hijacked', () => {
    expect(presentationCommand('b', onControl)).toBeNull()
    expect(presentationCommand('B', onControl)).toBeNull()
    expect(presentationCommand('w', onControl)).toBeNull()
    expect(presentationCommand('W', onControl)).toBeNull()
    expect(presentationCommand('.', onControl)).toBeNull()
    expect(presentationCommand(',', onControl)).toBeNull()
  })
})

describe('presentationCommand — presenter view', () => {
  it('opens presenter console on P', () => {
    expect(presentationCommand('p', plain)).toBe('presenter')
    expect(presentationCommand('P', plain)).toBe('presenter')
  })

  it('leaves P to the focused control so typing is not hijacked', () => {
    expect(presentationCommand('p', onControl)).toBeNull()
    expect(presentationCommand('P', onControl)).toBeNull()
  })
})

describe('presentationCommand — spotlight', () => {
  it('toggles spotlight on T and K', () => {
    expect(presentationCommand('t', plain)).toBe('spotlight')
    expect(presentationCommand('T', plain)).toBe('spotlight')
    expect(presentationCommand('k', plain)).toBe('spotlight')
    expect(presentationCommand('K', plain)).toBe('spotlight')
  })

  it('leaves T and K to the focused control so typing is not hijacked', () => {
    expect(presentationCommand('t', onControl)).toBeNull()
    expect(presentationCommand('T', onControl)).toBeNull()
    expect(presentationCommand('k', onControl)).toBeNull()
    expect(presentationCommand('K', onControl)).toBeNull()
  })
})

