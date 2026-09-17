/**
 * A board is a React root of its own inside a note the app renders, so tearing one down happens
 * from inside the host tree's own commit — the pane closes, the block leaves the note — and React
 * refuses to take one root down from inside another root's render: it warns and lets the teardown
 * race the commit it interrupted. The unmount waits for a microtask, which is what this case
 * holds in place. The library is stubbed because the drawing is not what is under test here;
 * scripts/e2e-visual.mjs is where the real one runs in a browser.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { installTestGlobals } from '../../test-render'
import { emptyScene } from './body'
import type { ExcalidrawCreateOptions, ExcalidrawHandle } from './types'

vi.mock('@excalidraw/excalidraw', async () => {
  const { createElement } = await import('react')
  return {
    Excalidraw: () => createElement('div', { 'data-board': 'stub' }),
    exportToBlob: async () => new Blob(),
    exportToSvg: async () => null,
    getSceneVersion: () => 0,
    loadLibraryFromBlob: async () => ({ libraryItems: [] }),
    restoreElements: (elements: unknown) => elements,
    serializeLibraryAsJSON: () => '',
  }
})

beforeAll(() => {
  installTestGlobals()
})

async function board(el: HTMLElement): Promise<ExcalidrawHandle> {
  const { createExcalidrawVendor } = await import('./vendor')
  const vendor = createExcalidrawVendor()
  const options: ExcalidrawCreateOptions = {
    el,
    scene: emptyScene(),
    dark: false,
    locale: 'en-US',
    editable: true,
    variant: 'inline',
    onChange: () => {},
  }
  let handle: ExcalidrawHandle | null = null
  await act(async () => {
    handle = vendor.create(options)
  })
  if (!handle) throw new Error('the vendor created no board')
  return handle
}

describe('the excalidraw vendor teardown', () => {
  it('leaves the board drawn until the microtask after the call', async () => {
    const el = document.createElement('div')
    document.body.append(el)
    const handle = await board(el)
    expect(el.children.length).toBeGreaterThan(0)

    handle.destroy()
    expect(el.children.length).toBeGreaterThan(0)
    await act(async () => {})
    expect(el.children.length).toBe(0)
  })
})
