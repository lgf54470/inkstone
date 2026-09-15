import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement, useState } from 'react'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  destroyExcalidraws,
  flushExcalidraws,
  mountExcalidraws,
  openExcalidrawSession,
  parseExcalidrawScene,
  type ExcalidrawCreateOptions,
  type ExcalidrawHandle,
  type ExcalidrawScene,
  type ExcalidrawSession,
  type ExcalidrawVendor,
} from '../../lib/markdown/excalidraw'
import { ExcalidrawFullscreen } from './excalidraw-fullscreen'

const SCOPE = 'excalidraw-fullscreen-test'

/** jsdom has no ResizeObserver, which the registry uses to re-measure a moved canvas. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(async () => {
  await initI18n()
  globalThis.ResizeObserver ??= StubResizeObserver
})

afterEach(() => {
  destroyExcalidraws(SCOPE)
  document.body.replaceChildren()
})

/** The block markup the preview renders for a note holding one fence. */
function previewHost(): HTMLElement {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = renderMarkdown(['# Title', '', '```excalidraw', '{}', '```', '', 'tail'].join('\n')).html
  document.body.append(host)
  return host
}

interface BoardModel {
  elements: number
  fit: number
  writes: number
}

/**
 * A vendor that reproduces the contract the registry relies on and nothing else: a
 * canvas that reports a change when a shape is drawn, and remembers how often it was
 * asked to fit. The real library runs in a browser in scripts/e2e-visual.mjs; here the
 * question is what the app does with the callbacks it gets.
 */
function stubVendor(model: BoardModel): ExcalidrawVendor {
  return {
    parse: parseExcalidrawScene,
    serialize: (scene) => JSON.stringify({ elements: scene.elements }),
    renderStaticSvg: async () => null,
    create: (options: ExcalidrawCreateOptions): ExcalidrawHandle => {
      const onDraw = (): void => {
        model.elements += 1
        options.onChange()
      }
      options.el.addEventListener('dblclick', onDraw)
      const scene = (): ExcalidrawScene => ({
        type: 'excalidraw',
        version: 2,
        source: 'inkstone',
        elements: Array.from({ length: model.elements }, () => ({ type: 'rectangle' })) as ExcalidrawScene['elements'],
        appState: {},
        files: {},
      })
      return {
        getScene: scene,
        updateScene: () => {},
        scrollToContent: () => {
          model.fit += 1
        },
        zoomToFit: () => {},
        refresh: () => {},
        focus: () => options.el.focus(),
        setTheme: () => {},
        setVariant: () => {},
        exportSvg: async () => null,
        exportPng: async () => null,
        destroy: () => options.el.removeEventListener('dblclick', onDraw),
      }
    },
  }
}

interface Surface {
  host: HTMLElement
  block: HTMLElement
  canvas: HTMLElement
  session: ExcalidrawSession
  model: BoardModel
  writes: string[]
}

async function mountSurface(): Promise<Surface> {
  const host = previewHost()
  const model: BoardModel = { elements: 0, fit: 0, writes: 0 }
  const writes: string[] = []
  await mountExcalidraws(host, {
    scope: SCOPE,
    noteId: 'note-1',
    dark: false,
    locale: 'en-US',
    editable: true,
    loadVendor: async () => stubVendor(model),
    writeBack: (_ref, next) => {
      writes.push(next)
      model.writes += 1
      return 'written'
    },
  })
  const block = host.querySelector<HTMLElement>('[data-excalidraw]')!
  const canvas = block.querySelector<HTMLElement>('.excalidraw-canvas')!
  const session = openExcalidrawSession(block)!
  return { host, block, canvas, session, model, writes }
}

/** The block as the preview renders it: a control that opens full screen. */
function Harness({ session }: { session: ExcalidrawSession }) {
  const [open, setOpen] = useState(false)
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', 'data-excalidraw-fullscreen': '', onClick: () => setOpen(true) }, 'full screen'),
    open ? createElement(ExcalidrawFullscreen, { session, onClose: () => setOpen(false) }) : null,
  )
}

describe('whiteboard full screen', () => {
  it('hosts the live board rather than a second copy, and hands it back on close', async () => {
    const surface = await mountSurface()
    const rendered = renderElement(createElement(Harness, { session: surface.session }))
    const opener = rendered.container.querySelector<HTMLButtonElement>('[data-excalidraw-fullscreen]')!

    await act(async () => {
      opener.click()
    })
    const overlay = document.querySelector<HTMLElement>('.excalidraw-fullscreen')
    expect(overlay).not.toBeNull()
    expect(overlay!.querySelector('.excalidraw-canvas')).toBe(surface.canvas)
    expect(surface.block.querySelector('.excalidraw-canvas')).toBeNull()

    // Drawing writes back into the note, and the overlay keeps the very same board.
    await act(async () => {
      surface.canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      flushExcalidraws(SCOPE)
    })
    expect(surface.writes.at(-1)).toContain('"elements"')
    expect(document.querySelector('.excalidraw-fullscreen .excalidraw-canvas')).toBe(surface.canvas)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.excalidraw-fullscreen')).toBeNull()
    expect(surface.block.querySelector('.excalidraw-canvas')).toBe(surface.canvas)

    rendered.unmount()
    surface.host.remove()
  })
})

describe('whiteboard full screen — header and keys', () => {
  it('fits the board from the header and leaves Escape to it while it owns the keyboard', async () => {
    const surface = await mountSurface()
    const rendered = renderElement(createElement(Harness, { session: surface.session }))
    const opener = rendered.container.querySelector<HTMLButtonElement>('[data-excalidraw-fullscreen]')!

    await act(async () => {
      opener.click()
    })
    const head = document.querySelector<HTMLElement>('.excalidraw-fullscreen-head')!
    await act(async () => {
      head.querySelector<HTMLButtonElement>(`button[aria-label="${t('preview.excalidraw_fit')}"]`)!.click()
    })
    expect(surface.model.fit).toBeGreaterThan(0)

    // The library's own text editor: cancelling it must not close the whole overlay.
    const editor = document.createElement('textarea')
    editor.className = 'excalidraw-wysiwyg'
    surface.canvas.append(editor)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.excalidraw-fullscreen')).not.toBeNull()

    editor.remove()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.excalidraw-fullscreen')).toBeNull()

    rendered.unmount()
    surface.host.remove()
  })
})
