import { describe, expect, it } from 'vitest'
import type { BentoDoc, Slide, TextElement } from './types'
import { appendElements, moveElements, pickElements, removeElements, replaceElements, slideElements } from './edits'

function text(id: string, x = 0, y = 0): TextElement {
  return { id, type: 'text', html: `<p>${id}</p>`, fontSize: 24, x, y, w: 200, h: 60 }
}

function slide(id: string, elements: TextElement[]): Slide {
  return { id, elements }
}

function doc(): BentoDoc {
  return {
    format: 'bento/slides',
    version: 1,
    title: 'Deck',
    size: { width: 1280, height: 720 },
    theme: { background: '#ffffff', color: '#111111', accent: '#FF9E8A' },
    slides: [slide('one', [text('a'), text('b')]), slide('two', [text('c')])],
  }
}

describe('editing a slide by its elements', () => {
  it('appends in the order given, and leaves the document alone when there is nothing to add', () => {
    const next = appendElements(doc(), 'one', [text('c')])
    expect(slideElements(next, 'one').map((element) => element.id)).toEqual(['a', 'b', 'c'])
    expect(slideElements(next, 'two').map((element) => element.id)).toEqual(['c'])
    const current = doc()
    expect(appendElements(current, 'one', [])).toBe(current)
  })

  it('removes only what was named', () => {
    const next = removeElements(doc(), 'one', ['a'])
    expect(slideElements(next, 'one').map((element) => element.id)).toEqual(['b'])
  })

  it('moves only what was named, by the amount given', () => {
    const next = moveElements(doc(), 'one', ['a'], 3, -4)
    const [first, second] = slideElements(next, 'one')
    expect([first?.x, first?.y]).toEqual([3, -4])
    expect([second?.x, second?.y]).toEqual([0, 0])
  })

  it('returns the very document it was given when the slide is not there', () => {
    const current = doc()
    expect(replaceElements(current, 'gone', (elements) => [...elements, text('x')])).toBe(current)
    expect(removeElements(current, 'gone', ['a'])).toBe(current)
    expect(moveElements(current, 'gone', ['a'], 1, 1)).toBe(current)
  })

  it('picks the named elements in the slide own order, not the order they were named', () => {
    expect(pickElements(doc(), 'one', ['b', 'a']).map((element) => element.id)).toEqual(['a', 'b'])
    expect(pickElements(doc(), null, ['a'])).toEqual([])
  })

  it('merges an asset table in the same step as the elements that need it', () => {
    const next = appendElements(doc(), 'one', [text('c')], { photo: 'data:image/png;base64,AAA' })
    expect(next.assets).toEqual({ photo: 'data:image/png;base64,AAA' })
    expect(doc().assets).toBeUndefined()
  })
})
