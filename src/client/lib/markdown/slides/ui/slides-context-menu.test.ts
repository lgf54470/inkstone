import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import { t } from '../../../i18n'
import { parseSlidesOutline } from '../outline'
import type { BentoDoc, Slide, TextElement } from '../types'
import { SlidesRoot } from './slides-root'

const source = ['# First slide', '', 'Body text', '', '---', '', '# Second slide'].join('\n')

let mounted: ReturnType<typeof renderElement> | null = null

function mountDeck(initialData: BentoDoc = parseSlidesOutline(source)) {
  const committed: BentoDoc[] = []
  mounted = renderElement(
    createElement(SlidesRoot, {
      initialData,
      isFullscreen: true,
      onUpdateData: (next: BentoDoc) => committed.push(next),
    }),
  )
  return { committed }
}

/** The thumbnail rail draws the same element boxes as the page, so every query is scoped to the page. */

function contentOf(slide: Slide | undefined): string[] {
  return (slide?.elements ?? []).map((el) => (el.type === 'text' ? el.html : el.type))
}

function canvasElement(id?: string): Element | null {
  return document.querySelector(id ? `main [data-slide-element="${id}"]` : 'main [data-slide-element]')
}

/** Three boxes on the first page, so an order change is visible in the committed document. */
function slideWithBoxes(base: BentoDoc): BentoDoc {
  const text = base.slides[0]!.elements[0] as TextElement
  base.slides[0]!.elements = [text, { ...text, id: 'second-box', y: 200 }, { ...text, id: 'third-box', y: 320 }]
  return base
}

function thumbnailAt(index: number): Element {
  const thumb = document.querySelectorAll('[data-slide-thumbnail]')[index]
  expect(thumb, `thumbnail ${index} exists`).toBeDefined()
  return thumb!
}

function rightClick(target: Element | null): void {
  expect(target, 'the target to right click exists').not.toBeNull()
  act(() => {
    target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }))
  })
}

function menuRow(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === label,
  )
}

function clickRow(label: string): void {
  const row = menuRow(label)
  expect(row, `the menu has a "${label}" row`).toBeDefined()
  act(() => {
    row?.click()
  })
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('the element context menu', () => {
  it('offers the element rows when a box on the page is right clicked', () => {
    mountDeck()
    rightClick(canvasElement())
    expect(menuRow(t('slides.edit_text'))).toBeDefined()
    expect(menuRow(t('slides.bring_to_front'))).toBeDefined()
    expect(menuRow(t('slides.send_to_back'))).toBeDefined()
    expect(menuRow(t('common.delete'))).toBeDefined()
  })

  it('leaves out the text row for a box that holds no text', () => {
    const initial = parseSlidesOutline(source)
    const text = initial.slides[0]!.elements[0] as TextElement
    initial.slides[0]!.elements = [
      text,
      { id: 'box-1', type: 'shape', shape: 'rect', x: 40, y: 300, w: 200, h: 120, fill: '#ffffff' },
    ]
    mountDeck(initial)
    rightClick(canvasElement('box-1'))
    expect(menuRow(t('slides.edit_text'))).toBeUndefined()
    expect(menuRow(t('common.delete'))).toBeDefined()
  })

  it('deletes the box the menu was opened on', () => {
    const { committed } = mountDeck()
    const target = canvasElement()?.getAttribute('data-slide-element')
    rightClick(canvasElement())
    clickRow(t('common.delete'))
    const left = committed.at(-1)?.slides[0]?.elements ?? []
    expect(left.map((el) => el.id)).not.toContain(target)
    expect(left).toHaveLength(1)
  })

  it('sends a box to the back of its page', () => {
    const initial = slideWithBoxes(parseSlidesOutline(source))
    const firstId = initial.slides[0]!.elements[0]!.id
    const { committed } = mountDeck(initial)

    rightClick(canvasElement('third-box'))
    clickRow(t('slides.send_to_back'))
    expect(committed.at(-1)?.slides[0]?.elements.map((el) => el.id)).toEqual([
      'third-box',
      firstId,
      'second-box',
    ])
  })

})

describe('the page context menus', () => {
  it('offers the page rows, and duplicates that very page, on a thumbnail', () => {
    const { committed } = mountDeck()
    rightClick(thumbnailAt(1))
    expect(menuRow(t('slides.add_slide'))).toBeDefined()
    expect(menuRow(t('slides.move_slide_down'))).toBeDefined()
    expect(menuRow(t('slides.duplicate_slide'))).toBeDefined()
    expect(menuRow(t('slides.delete_slide'))).toBeDefined()

    clickRow(t('slides.duplicate_slide'))
    const slides = committed.at(-1)?.slides ?? []
    expect(slides).toHaveLength(3)
    expect(contentOf(slides[2])).toEqual(contentOf(slides[1]))
    expect(slides[2]?.id).not.toBe(slides[1]?.id)
    expect(slides[2]?.elements.map((el) => el.id)).not.toEqual(slides[1]?.elements.map((el) => el.id))
  })

  it('opens the built-in picker from a bare page right click', () => {
    mountDeck()
    const stage = document.querySelector('main')
    rightClick(stage)
    clickRow(t('slides.add_slide'))
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(t('slides.choose_layout'))
  })
})
