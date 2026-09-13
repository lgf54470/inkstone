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

  it('lets the slide list keep the arrows it walks its own items with', () => {
    expect(presentationCommand('ArrowUp', onSlideList)).toBeNull()
    expect(presentationCommand('ArrowDown', onSlideList)).toBeNull()
    expect(presentationCommand('Home', onSlideList)).toBeNull()
    expect(presentationCommand('End', onSlideList)).toBeNull()
  })

  it('still turns pages from the list when the key is not list navigation', () => {
    expect(presentationCommand('ArrowRight', onSlideList)).toBe('next')
    expect(presentationCommand(' ', onSlideList)).toBe('next')
    expect(presentationCommand('Escape', onSlideList)).toBeNull()
  })
})
