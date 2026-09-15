import { describe, expect, it } from 'vitest'
import { initI18n } from '../../i18n'
import { renderMarkdown } from '../renderer'
import { parseExcalidrawScene, serializeExcalidrawScene, type ExcalidrawCreateOptions, type ExcalidrawHandle, type ExcalidrawVendor } from './index'
import { renderStaticExcalidraws } from './static'

const STILL = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'

/** A vendor that draws the only thing this surface asks of it: one still picture. */
function stillVendor(svg: string | null = STILL): ExcalidrawVendor {
  return {
    parse: parseExcalidrawScene,
    serialize: serializeExcalidrawScene,
    renderStaticSvg: async () => svg,
    create: (options: ExcalidrawCreateOptions): ExcalidrawHandle => {
      const handle = {
        getScene: () => ({ type: 'excalidraw' as const, version: 2, source: 'inkstone', elements: [], appState: {}, files: {} }),
        updateScene: () => {},
        scrollToContent: () => {},
        zoomToFit: () => {},
        refresh: () => {},
        focus: () => {},
        setTheme: () => {},
        setVariant: () => {},
        exportSvg: async () => null,
        exportPng: async () => null,
        destroy: () => {},
      }
      void options
      return handle
    },
  }
}

function host(body: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(['```excalidraw', body, '```'].join('\n')).html
  document.body.append(root)
  return root
}

describe('whiteboard stills', () => {
  it('draws a scene as an SVG for surfaces that print their markup', async () => {
    await initI18n()
    const root = host(JSON.stringify({ elements: [{ type: 'rectangle' }] }))
    await renderStaticExcalidraws(root, { dark: false, loadVendor: async () => stillVendor() })

    const image = root.querySelector('.excalidraw-image')
    expect(image).not.toBeNull()
    expect(root.querySelector('.excalidraw-block')!.classList.contains('is-ready')).toBe(true)
    root.remove()
  })

  it('says what a board nobody has drawn on is, instead of an empty picture', async () => {
    const root = host('{}')
    await renderStaticExcalidraws(root, { dark: false, loadVendor: async () => stillVendor() })

    expect(root.querySelector('.excalidraw-image')).toBeNull()
    expect(root.querySelector('.excalidraw-empty')).not.toBeNull()
    root.remove()
  })

  it('falls back to the scene when the library cannot draw it', async () => {
    const root = host(JSON.stringify({ elements: [{ type: 'rectangle' }] }))
    await renderStaticExcalidraws(root, { dark: false, loadVendor: async () => stillVendor(null) })

    expect(root.querySelector('.excalidraw-image')).toBeNull()
    expect(root.querySelector('.excalidraw-block')!.classList.contains('excalidraw-source')).toBe(true)
    root.remove()
  })
})
