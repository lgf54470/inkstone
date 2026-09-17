import { describe, expect, it } from 'vitest'
import type { BentoDoc, Slide } from './types'
import { audienceSlides } from './flow'

function doc(slides: Slide[]): BentoDoc {
  return {
    format: 'bento/slides',
    version: 1,
    title: 'Deck',
    size: { width: 1280, height: 720 },
    theme: { background: '#ffffff', color: '#111111', accent: '#FF9E8A' },
    slides,
  }
}

function slide(id: string, over: Partial<Slide> = {}): Slide {
  return { id, elements: [], ...over }
}

describe('the pages the audience is handed', () => {
  it('keeps deck order for the pages the author left on the screen', () => {
    const pages = audienceSlides(doc([slide('one'), slide('two'), slide('three')]))
    expect(pages.map((page) => page.id)).toEqual(['one', 'two', 'three'])
  })

  it('leaves out a hidden page, which is material the audience was never handed', () => {
    const pages = audienceSlides(doc([slide('one'), slide('two', { hidden: true }), slide('three')]))
    expect(pages.map((page) => page.id)).toEqual(['one', 'three'])
  })

  it('keeps a state page in the flow, because nothing can navigate to it otherwise', () => {
    const pages = audienceSlides(doc([slide('one'), slide('two', { stateOf: 'one' })]))
    expect(pages.map((page) => page.id)).toEqual(['one', 'two'])
  })
})
