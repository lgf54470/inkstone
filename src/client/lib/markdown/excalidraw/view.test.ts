import { beforeEach, describe, expect, it } from 'vitest'
import { EXCALIDRAW_FULLSCREEN_CLASS, isExcalidrawSurface } from './view'

function mount(markup: string): HTMLElement {
  document.body.innerHTML = markup
  return document.body
}

const at = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!

describe('whiteboard surfaces', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('claims a right-click on the board canvas', () => {
    mount('<div data-excalidraw><div data-excalidraw-placeholder></div><div data-excalidraw-canvas><canvas></canvas></div></div>')
    expect(isExcalidrawSurface(at('canvas'))).toBe(true)
    expect(isExcalidrawSurface(at('[data-excalidraw-canvas]'))).toBe(true)
  })

  it('leaves the block header to the note', () => {
    mount('<div data-excalidraw><div class="excalidraw-block-head"><span>board</span></div><div data-excalidraw-canvas></div></div>')
    expect(isExcalidrawSurface(at('.excalidraw-block-head span'))).toBe(false)
  })

  it('claims the whole full screen overlay, canvas or not', () => {
    mount(`<div class="${EXCALIDRAW_FULLSCREEN_CLASS}"><header class="excalidraw-fullscreen-head"><h2>board</h2></header><div class="excalidraw-fullscreen-stage"><div data-excalidraw-canvas><canvas></canvas></div></div></div>`)
    expect(isExcalidrawSurface(at('h2'))).toBe(true)
    expect(isExcalidrawSurface(at('canvas'))).toBe(true)
  })

  it('ignores the rest of the preview', () => {
    mount('<div class="ink-prose"><p>text</p></div>')
    expect(isExcalidrawSurface(at('p'))).toBe(false)
    expect(isExcalidrawSurface(null)).toBe(false)
  })
})
