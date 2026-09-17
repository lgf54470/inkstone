import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUi } from '../../../../store/ui'
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

let written: string[] = []
let writeFails = false

// The clipboard is the browser's, and jsdom does not carry one: the two calls the editor makes
// are stubbed so a menu row can be followed all the way to what it put on the clipboard.
beforeEach(() => {
  written = []
  writeFails = false
  useUi.setState({ toasts: [] })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        if (writeFails) throw new Error('refused')
        written.push(text)
      }),
      readText: vi.fn(async () => written.at(-1) ?? ''),
    },
  })
})

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

describe('the clipboard rows', () => {
  it('copies the box the menu was opened on, and cuts it out of the page', async () => {
    const { committed } = mountDeck()
    const target = canvasElement()?.getAttribute('data-slide-element')
    rightClick(canvasElement())
    expect(menuRow(t('common.copy'))).toBeDefined()
    expect(menuRow(t('slides.cut'))).toBeDefined()

    clickRow(t('common.copy'))
    await act(async () => {})
    const payload = JSON.parse(written.at(-1) ?? '{}')
    expect(payload.mark).toBe('inkstone/slides-clip')
    expect(payload.elements.map((element: { id: string }) => element.id)).toEqual([target])
    expect(committed).toHaveLength(0)

    // Picking a row closes the menu, so the cut is reached by opening it again.
    rightClick(canvasElement(target ?? undefined))
    clickRow(t('slides.cut'))
    await act(async () => {})
    expect(committed.at(-1)?.slides[0]?.elements.map((el) => el.id)).not.toContain(target)
  })

  it('keeps the box when the clipboard refuses the cut, and says so', async () => {
    mountDeck()
    writeFails = true
    rightClick(canvasElement())
    clickRow(t('slides.cut'))
    await act(async () => {})
    expect(document.querySelectorAll('main [data-slide-element]')).toHaveLength(2)
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([t('slides.copy_failed')])
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

  it('pastes what the clipboard holds from the bare page menu', async () => {
    const { committed } = mountDeck()
    rightClick(canvasElement())
    clickRow(t('common.copy'))
    await act(async () => {})

    rightClick(document.querySelector('main'))
    expect(menuRow(t('slides.paste'))).toBeDefined()
    clickRow(t('slides.paste'))
    await act(async () => {})
    expect(committed.at(-1)?.slides[0]?.elements).toHaveLength(3)
  })

  it('opens the built-in picker from a bare page right click', () => {
    mountDeck()
    const stage = document.querySelector('main')
    rightClick(stage)
    clickRow(t('slides.add_slide'))
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(t('slides.choose_layout'))
  })
})

describe('a page travelling through the clipboard', () => {
  it('copies the whole page from the rail, and pastes it back as a page after it', async () => {
    const { committed } = mountDeck()
    rightClick(thumbnailAt(0))
    expect(menuRow(t('slides.copy_page'))).toBeDefined()

    clickRow(t('slides.copy_page'))
    await act(async () => {})
    const payload = JSON.parse(written.at(-1) ?? '{}')
    expect(payload.kind).toBe('slides')
    expect(payload.slides).toHaveLength(1)

    rightClick(thumbnailAt(0))
    clickRow(t('slides.paste_page'))
    await act(async () => {})
    const slides = committed.at(-1)?.slides ?? []
    expect(slides).toHaveLength(3)
    expect(contentOf(slides[1])).toEqual(contentOf(slides[0]))
    expect(slides[1]?.id).not.toBe(slides[0]?.id)
  })
})
