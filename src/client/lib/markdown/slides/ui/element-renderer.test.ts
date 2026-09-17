import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import type { ShapeElement, SlidesTheme } from '../types'
import { ElementRenderer } from './element-renderer'

const THEME: SlidesTheme = { background: '#111111', color: '#FFFFFF', accent: '#FF9E8A' }

function draw(el: ShapeElement) {
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

  it('draws nothing for a path that is not geometry, rather than a curve that would lie', () => {
    const view = draw(path({ d: 'M 0 0" onload="alert(1)' }))
    expect(view.container.querySelector('svg')).toBeNull()
    view.unmount()
  })
})
