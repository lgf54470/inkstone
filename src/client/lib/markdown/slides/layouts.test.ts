import { describe, expect, it } from 'vitest'
import { ACCENT_FILL, BUILTIN_LAYOUTS, LAYOUT_BASE, instantiateLayout, layoutById } from './layouts'
import type { SlideLayout } from './layouts'

const options = {
  accent: '#FF9E8A',
  message: (key: string) => `msg:${key}`,
  seed: 'seed-1',
}

describe('the built-in layouts', () => {
  it('offers the nine the format ships', () => {
    expect(BUILTIN_LAYOUTS.map((layout) => layout.id)).toEqual([
      'layout-title',
      'layout-title-content',
      'layout-two-col',
      'layout-section',
      'layout-three-cards',
      'layout-quote',
      'layout-image-left',
      'layout-image-right',
      'layout-blank',
    ])
  })

  it('draws every layout on the format authoring page', () => {
    for (const layout of BUILTIN_LAYOUTS) {
      for (const element of layout.elements) {
        expect(element.x).toBeGreaterThanOrEqual(0)
        expect(element.y).toBeGreaterThanOrEqual(0)
        expect(element.x + element.w).toBeLessThanOrEqual(LAYOUT_BASE.width)
        expect(element.y + element.h).toBeLessThanOrEqual(LAYOUT_BASE.height)
      }
    }
  })

  it('names every layout with a message id rather than a literal', () => {
    for (const layout of BUILTIN_LAYOUTS) {
      expect(layout.nameKey.startsWith('slides.')).toBe(true)
    }
  })
})

describe('instantiating a layout', () => {
  it('rescales geometry onto the deck own page', () => {
    const slide = instantiateLayout(layoutById('layout-title')!, { width: 1280, height: 720 }, options)
    const title = slide.elements.find((element) => element.id === 'lt-title')
    // 160 x (1280/1600) = 128, 404 x (720/900) = 323.
    expect(title).toMatchObject({ x: 128, y: 323 })
  })

  it('scales type with the smaller axis and never below the floor', () => {
    const wide = instantiateLayout(
      layoutById('layout-title-content')!,
      { width: 3200, height: 900 },
      options,
    )
    const heading = wide.elements.find((element) => element.type === 'text')!
    // Height is unscaled, so the 44pt heading keeps its size even though the page doubled.
    expect(heading.fontSize).toBe(44)

    const small = instantiateLayout(
      layoutById('layout-title')!,
      { width: 200, height: 100 },
      options,
    )
    for (const element of small.elements) {
      if (element.type === 'text') expect(element.fontSize).toBeGreaterThanOrEqual(8)
    }
  })

  it('resolves the text hints through the caller and gives marks the deck accent', () => {
    const slide = instantiateLayout(layoutById('layout-title')!, LAYOUT_BASE, options)
    const title = slide.elements.find((element) => element.type === 'text')!
    expect(title.type === 'text' && title.html).toBe('msg:slides.layout_hint_title')
    const bar = slide.elements.find((element) => element.type === 'shape')!
    expect(bar.type === 'shape' && bar.fill).toBe('#FF9E8A')
    const authored = (layoutById('layout-title') as SlideLayout).elements.find(
      (element) => element.type === 'shape',
    )
    expect(authored?.type === 'shape' && authored.fill).toBe(ACCENT_FILL)
  })

  it('keeps a section divider dark with light type', () => {
    const slide = instantiateLayout(layoutById('layout-section')!, LAYOUT_BASE, options)
    expect(slide.background).toBe('#1E2A3A')
    const title = slide.elements.find((element) => element.id.includes('lsec-title'))!
    expect(title.type === 'text' && title.color).toBe('#FFFFFF')
  })

  it('gives each slide a new id but keeps the layout element ids for morph', () => {
    const layout = layoutById('layout-three-cards')!
    const first = instantiateLayout(layout, LAYOUT_BASE, options)
    const second = instantiateLayout(layout, LAYOUT_BASE, { ...options, seed: 'seed-2' })
    expect(first.id).not.toBe(second.id)
    expect(first.elements.map((element) => element.id)).toEqual(
      second.elements.map((element) => element.id),
    )
    expect(new Set(first.elements.map((element) => element.id)).size).toBe(first.elements.length)
  })

  it('leaves the blank layout empty', () => {
    expect(instantiateLayout(layoutById('layout-blank')!, LAYOUT_BASE, options).elements).toEqual([])
  })
})
