import { act, createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import { t } from '../../../i18n'
import type { Slide } from '../types'
import { SlidesSidebar } from './slides-sidebar'

const THUMB_WIDTH = 156

const slide: Slide = {
  id: 'slide-1',
  title: 'One',
  elements: [
    {
      id: 'title-1',
      type: 'text',
      html: 'One',
      fontSize: 44,
      x: 0,
      y: 0,
      w: 400,
      h: 80,
    },
  ],
}

function thumbnailSize(size: { width: number; height: number }) {
  const view = renderElement(
    createElement(SlidesSidebar, {
      slides: [slide, { ...slide, id: 'slide-2' }],
      size,
      activeSlideId: slide.id,
      theme: { background: '#0B1220', color: '#F8FAFC', accent: '#FF9E8A' },
      onSelectSlide: () => {},
      onAddSlide: () => {},
      onDuplicateSlide: () => {},
      onDeleteSlide: () => {},
      onMoveSlide: () => {},
    }),
  )
  const thumb = view.container.querySelector<HTMLElement>('[data-slide-thumbnail]')
  view.unmount()
  return { width: thumb?.style.width, height: thumb?.style.height }
}

function drag(node: HTMLElement, type: string) {
  act(() => {
    node.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  })
}

function rail(
  size: { width: number; height: number },
  onMove: (id: string, direction: 'up' | 'down') => void = () => {},
) {
  return renderElement(
    createElement(SlidesSidebar, {
      slides: [slide, { ...slide, id: 'slide-2' }],
      size,
      activeSlideId: slide.id,
      theme: { background: '#0B1220', color: '#F8FAFC', accent: '#FF9E8A' },
      onSelectSlide: () => {},
      onAddSlide: () => {},
      onDuplicateSlide: () => {},
      onDeleteSlide: () => {},
      onMoveSlide: onMove,
    }),
  )
}

describe('the slide rail', () => {
  it('names itself and marks the page being edited', () => {
    const view = rail({ width: 1280, height: 720 })
    expect(view.container.querySelector('aside')?.getAttribute('aria-label')).toBe(
      t('slides.slide_list'),
    )
    const current = view.container.querySelector('[data-slide-select][aria-current="true"]')
    expect(current?.getAttribute('aria-label')).toContain('1')
    view.unmount()
  })

  it('moves a page from the rail, and cannot move the first one earlier', () => {
    const moved: [string, string][] = []
    const view = rail({ width: 1280, height: 720 }, (id, direction) => moved.push([id, direction]))
    const up = view.container.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('slides.move_slide_up')}"]`,
    )
    const down = view.container.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('slides.move_slide_down')}"]`,
    )
    expect(up?.disabled).toBe(true)
    expect(down?.disabled).toBe(false)
    down?.click()
    expect(moved).toEqual([[slide.id, 'down']])
    view.unmount()
  })
})

describe('drag reordering the rail', () => {
  function railWithDrop(onReorder: (fromId: string, toId: string) => void) {
    return renderElement(
      createElement(SlidesSidebar, {
        slides: [slide, { ...slide, id: 'slide-2' }, { ...slide, id: 'slide-3' }],
        size: { width: 1280, height: 720 },
        activeSlideId: slide.id,
        theme: { background: '#0B1220', color: '#F8FAFC', accent: '#FF9E8A' },
        onSelectSlide: () => {},
        onAddSlide: () => {},
        onDuplicateSlide: () => {},
        onDeleteSlide: () => {},
        onMoveSlide: () => {},
        onReorderSlide: onReorder,
      }),
    )
  }

  it('drops a page onto the slot of the one it lands on', () => {
    const dropped: [string, string][] = []
    const view = railWithDrop((from, to) => dropped.push([from, to]))
    const [first, , third] = [...view.container.querySelectorAll<HTMLElement>('[data-slide-thumbnail]')]

    // Drag events are continuous in React's priority model, so the state they set is only
    // flushed inside act() — a bare dispatch would be read before the re-render.
    drag(first!, 'dragstart')
    drag(third!, 'dragover')
    drag(third!, 'drop')

    expect(dropped).toEqual([[slide.id, 'slide-3']])
    view.unmount()
  })

  it('marks the page being dragged and refuses a drop on itself', () => {
    const dropped: [string, string][] = []
    const view = railWithDrop((from, to) => dropped.push([from, to]))
    const [first] = [...view.container.querySelectorAll<HTMLElement>('[data-slide-thumbnail]')]

    drag(first!, 'dragstart')
    expect(first!.getAttribute('data-slide-dragging')).toBe('true')
    drag(first!, 'drop')
    expect(dropped).toEqual([])

    drag(first!, 'dragend')
    expect(first!.hasAttribute('data-slide-dragging')).toBe(false)
    view.unmount()
  })
})

describe('slide thumbnails', () => {
  it('draws a 16:9 deck at the default shape', () => {
    expect(thumbnailSize({ width: 1280, height: 720 })).toEqual({
      width: `${THUMB_WIDTH}px`,
      height: `${Math.round(THUMB_WIDTH * (720 / 1280))}px`,
    })
  })

  it('keeps a 4:3 deck 4:3 instead of cropping it into a 16:9 frame', () => {
    expect(thumbnailSize({ width: 1024, height: 768 })).toEqual({
      width: `${THUMB_WIDTH}px`,
      height: `${Math.round(THUMB_WIDTH * (768 / 1024))}px`,
    })
  })
})
