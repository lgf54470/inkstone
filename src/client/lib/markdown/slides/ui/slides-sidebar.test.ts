import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
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
