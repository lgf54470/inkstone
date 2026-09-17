import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../test-render'
import type { ImageElement, SlideElement, ShapeElement, SlidesTheme, TextElement } from '../types'
import { ElementRenderer } from './element-renderer'

const THEME: SlidesTheme = { background: '#111111', color: '#FFFFFF', accent: '#FF9E8A' }

function draw(el: SlideElement) {
  return renderElement(
    createElement(ElementRenderer, {
      el,
      theme: THEME,
      editable: false,
      isSelected: false,
      editing: false,
    }),
  )
}

function path(over: Partial<ShapeElement> = {}): ShapeElement {
  return { id: 's1', type: 'shape', shape: 'path', fill: 'none', x: 0, y: 0, w: 200, h: 100, ...over }
}

describe('an image with a crop', () => {
  function image(over: Partial<ImageElement> = {}): ImageElement {
    return { id: 'i1', type: 'image', src: 'asset:photo', fit: 'cover', x: 0, y: 0, w: 300, h: 200, ...over }
  }

  it('draws the whole picture when the crop is the identity one', () => {
    const view = draw(image({ crop: { x: 0.5, y: 0.5, scale: 1 } }))
    expect(view.container.querySelector('img')?.style.position).not.toBe('absolute')
    view.unmount()
  })

  it('clips the enlarged picture inside a frame, which carries the radius', () => {
    const view = draw(image({ crop: { x: 0.5, y: 0, scale: 2 }, radius: 10 }))
    const frame = view.container.querySelector('div') as HTMLDivElement | null
    const img = view.container.querySelector('img') as HTMLImageElement | null
    expect(img?.style.position).toBe('absolute')
    expect(img?.style.width).toBe('200%')
    expect(img?.style.objectPosition).toBe('50% 0%')
    expect(frame?.style.borderRadius).toBe('10px')
    view.unmount()
  })
})

describe('a text box', () => {
  function text(over: Partial<TextElement> = {}): TextElement {
    return { id: 't1', type: 'text', html: 'Hello', fontSize: 24, x: 0, y: 0, w: 300, h: 100, ...over }
  }

  it('paints a gradient through the glyphs instead of a flat colour', () => {
    const view = draw(text({ colorGradient: { angle: 90, stops: [{ at: 0, color: '#111111' }, { at: 1, color: '#222222' }] } }))
    const box = view.container.querySelector('div') as HTMLDivElement | null
    expect(box?.style.backgroundImage).toContain('linear-gradient(90deg')
    expect(box?.style.webkitTextFillColor).toBe('transparent')
    view.unmount()
  })

  it('shows the document placeholder only while editing an empty box', () => {
    const editing = renderElement(
      createElement(ElementRenderer, {
        el: text({ html: '', placeholder: 'Title' }),
        theme: THEME,
        editable: true,
        isSelected: true,
        editing: false,
      }),
    )
    expect(editing.container.querySelector('[data-slide-placeholder]')?.textContent).toBe('Title')
    editing.unmount()

    const showing = draw(text({ html: '', placeholder: 'Title' }))
    expect(showing.container.querySelector('[data-slide-placeholder]')).toBeNull()
    showing.unmount()
  })
})

describe('a path shape', () => {
  it('draws the geometry the document carries, in the box it was authored in', () => {
    const view = draw(path({ d: 'M 0 40 C 20 0, 60 0, 80 40', pathBox: { x: 0, y: 0, w: 80, h: 40 } }))
    const svg = view.container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 80 40')
    expect(view.container.querySelector('path')?.getAttribute('d')).toBe('M 0 40 C 20 0, 60 0, 80 40')
    view.unmount()
  })

  it('carries the stroke, its width and the dash pattern', () => {
    const view = draw(path({ d: 'M 0 0 L 10 10', stroke: '#FF9E8A', strokeWidth: 5, strokeDash: [4, 2] }))
    const node = view.container.querySelector('path')
    expect(node?.getAttribute('stroke')).toBe('#FF9E8A')
    expect(node?.getAttribute('stroke-width')).toBe('5')
    expect(node?.getAttribute('stroke-dasharray')).toBe('4 2')
    view.unmount()
  })

  it('announces a path that is not geometry instead of drawing a curve that would lie', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = draw(path({ d: 'M 0 0" onload="alert(1)' }))
    expect(view.container.querySelector('svg')).toBeNull()
    expect(view.container.querySelector('[data-slide-unsupported]')).not.toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    view.unmount()
  })
})

describe('an element this build cannot draw', () => {
  it('shows what it is instead of leaving the slide looking finished', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unknown = { id: 'x1', type: 'timeline', x: 0, y: 0, w: 100, h: 60 } as unknown as SlideElement
    const view = draw(unknown)
    const frame = view.container.querySelector('[data-slide-unsupported="timeline"]')
    expect(frame).not.toBeNull()
    expect(frame?.textContent).toContain('timeline')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsupported element type'))
    warn.mockRestore()
    view.unmount()
  })
})
