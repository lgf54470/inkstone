import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement, useState } from 'react'
import { initI18n } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  destroyMindmaps,
  flushMindmaps,
  mountMindmaps,
  openMindmapSession,
  type MindmapCreateOptions,
  type MindmapHandle,
  type MindmapSession,
  type MindmapVendor,
} from '../../lib/markdown/mindmap'
import { MindmapFullscreen } from './mindmap-fullscreen'

const SCOPE = 'mindmap-fullscreen-test'

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  destroyMindmaps(SCOPE)
  document.body.replaceChildren()
})

/** The block markup the preview would render for a note holding one fence. */
function previewHost(body = '- Root'): HTMLElement {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = renderMarkdown(['# Title', '', '```mindmap', body, '```', '', 'tail'].join('\n')).html
  document.body.append(host)
  return host
}

/**
 * A vendor that reproduces the library's keyboard contract and nothing else: the
 * shortcuts are bound to the element the library draws in, Tab adds a child and
 * Enter adds a sibling, and each one reports an operation — which is exactly what
 * the registry turns into a write. The real library runs in a browser in
 * scripts/e2e-visual.mjs; here the question is what the app does with the
 * callbacks it gets.
 */
function keyboardVendor(model: { body: string }): MindmapVendor {
  return {
    parse: (body) => ({ ok: true, data: { body }, extra: {} }),
    serialize: () => model.body,
    create: (options: MindmapCreateOptions): MindmapHandle => {
      const onKeyDown = (event: Event) => {
        const { key } = event as KeyboardEvent
        if (key === 'Tab') model.body = `${model.body}\n  - Child`
        else if (key === 'Enter') model.body = `${model.body}\n  - Sibling`
        else return
        event.preventDefault()
        options.onOperation()
      }
      options.el.addEventListener('keydown', onKeyDown)
      return {
        getData: () => ({ body: model.body }),
        refresh: () => {},
        toCenter: () => {},
        layout: () => {},
        scaleFit: () => {},
        focus: () => options.el.focus(),
        undo: () => {},
        redo: () => {},
        clearHistory: () => {},
        destroy: () => options.el.removeEventListener('keydown', onKeyDown),
        exportSvg: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }),
        exportPng: async () => null,
      }
    },
  }
}

interface Surface {
  host: HTMLElement
  block: HTMLElement
  canvas: HTMLElement
  session: MindmapSession
  writes: string[]
}

async function mountSurface(): Promise<Surface> {
  const host = previewHost()
  const model = { body: '- Root' }
  const writes: string[] = []
  await mountMindmaps(host, {
    scope: SCOPE,
    noteId: 'note-1',
    dark: false,
    locale: 'en-US',
    editable: true,
    loadVendor: async () => keyboardVendor(model),
    writeBack: (_ref, next) => {
      writes.push(next)
      return 'written'
    },
  })
  const block = host.querySelector<HTMLElement>('[data-mindmap]')!
  const canvas = block.querySelector<HTMLElement>('.mindmap-canvas')!
  const session = openMindmapSession(block)!
  return { host, block, canvas, session, writes }
}

/** The block as the preview renders it: a control that opens full screen, and the overlay while open. */
function Harness({ session }: { session: MindmapSession }) {
  const [open, setOpen] = useState(false)
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', 'data-mindmap-fullscreen': '', onClick: () => setOpen(true) }, 'full screen'),
    open ? createElement(MindmapFullscreen, { session, onClose: () => setOpen(false) }) : null,
  )
}

describe('mind map full screen — keyboard only', () => {
  it('adds nodes with the map’s keys, writes them to the note, and gives the focus back on Escape', async () => {
    const surface = await mountSurface()
    const rendered = renderElement(createElement(Harness, { session: surface.session }))
    const opener = rendered.container.querySelector<HTMLButtonElement>('[data-mindmap-fullscreen]')!

    await act(async () => {
      opener.focus()
      opener.click()
    })

    // Full screen hosts the live element rather than drawing a second copy of the map.
    const overlay = document.querySelector<HTMLElement>('.mindmap-fullscreen')
    expect(overlay).not.toBeNull()
    expect(overlay!.querySelector('.mindmap-canvas')).toBe(surface.canvas)
    expect(surface.block.querySelector('.mindmap-canvas')).toBeNull()

    await act(async () => {
      surface.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      flushMindmaps(SCOPE)
    })
    expect(surface.writes.at(-1)).toContain('- Child')
    // The write reaches the note without the overlay losing its map to the re-render.
    expect(document.querySelector('.mindmap-fullscreen')).not.toBeNull()
    expect(document.querySelector('.mindmap-fullscreen-canvas .mindmap-canvas')).toBe(surface.canvas)

    await act(async () => {
      surface.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      flushMindmaps(SCOPE)
    })
    expect(surface.writes.at(-1)).toContain('- Sibling')

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.mindmap-fullscreen')).toBeNull()
    // The map goes back into the block it came from, and the focus goes back to its control.
    expect(surface.block.querySelector('.mindmap-canvas')).toBe(surface.canvas)
    expect(document.activeElement).toBe(opener)

    rendered.unmount()
    surface.host.remove()
  })
})
