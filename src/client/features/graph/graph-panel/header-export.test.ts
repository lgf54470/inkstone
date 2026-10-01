import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { useUi } from '../../../store/ui'
import { GraphPanel } from './index'

/**
 * The export buttons are the one part of the graph whose result leaves the app, so they are read here
 * the way a reader uses them: the real panel is mounted, the header control is pressed with a real
 * pointer, and either a named file has been handed to the browser or the button was never reachable.
 * What those buttons draw is the subject of `graph-export.test.ts`; this file holds the wiring.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const graph: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Quarterly review', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: 'Work', folderColor: null, tags: [] },
    { id: 'note-2', title: 'Reading list', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: 'Life', folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 100 },
}

const saved: Array<{ name: string; blob: Blob }> = []
const mounted: RenderedElement[] = []
let restoreStubs: (() => void) | null = null
let restoreContext: (() => void) | null = null

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  vi.clearAllMocks()
  useUi.setState({ toasts: [] })
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  restoreContext?.()
  restoreContext = null
  restoreStubs?.()
  restoreStubs = null
  saved.length = 0
})

function headerButton(name: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find((candidate) => candidate.getAttribute('aria-label') === name)
  if (!button) throw new Error(`the graph header has no button named ${name}`)
  return button
}

function watchSavedFiles(): void {
  let last: Blob | null = null
  const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => { last = blob; return 'blob:graph' },
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => {} })
  const append = vi.spyOn(document.body, 'append').mockImplementation((...children: (Node | string)[]) => {
    for (const child of children) {
      if (child instanceof HTMLAnchorElement) {
        child.click = () => {}
        saved.push({ name: child.download, blob: last! })
      }
    }
  })
  restoreStubs = () => {
    if (createObjectURL) Object.defineProperty(URL, 'createObjectURL', createObjectURL)
    if (revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURL)
    append.mockRestore()
  }
}

/** jsdom hands back no 2d context, so the panel would never build a layout: the drawing is stubbed, the state it fills is real. */
function stubDrawingContext(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => ({
      setTransform: () => {}, clearRect: () => {}, fillRect: () => {}, save: () => {}, restore: () => {},
      translate: () => {}, scale: () => {}, beginPath: () => {}, closePath: () => {}, arc: () => {},
      fill: () => {}, stroke: () => {}, moveTo: () => {}, lineTo: () => {}, fillText: () => {}, strokeText: () => {},
      measureText: () => ({ width: 0 }),
    }),
  })
  return () => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
}

async function openPanel(): Promise<void> {
  restoreContext = stubDrawingContext()
  mounted.push(renderElement(createElement(GraphPanel, { onClose: vi.fn() })))
  await act(async () => {
    for (let tick = 0; tick < 6; tick++) await Promise.resolve()
  })
}

describe('graph export from the header (FEAT-05)', () => {
  it('hands the graph on screen to the browser as a vector file named for its scope', async () => {
    vi.mocked(api.graph).mockResolvedValue(graph)
    await openPanel()
    watchSavedFiles()

    await act(async () => { headerButton(t('graph.export_svg')).click() })
    await act(async () => { await Promise.resolve() })

    expect(saved).toHaveLength(1)
    expect(saved[0]!.name).toBe('graph-global.svg')
    expect(saved[0]!.blob.type).toBe('image/svg+xml;charset=utf-8')
    expect(await saved[0]!.blob.text()).toContain('<circle')
    expect(useUi.getState().toasts.at(-1)?.title).toBe(t('graph.export_done'))
  })

  it('keeps the export buttons out of reach until a graph is on screen', () => {
    vi.mocked(api.graph).mockReturnValue(new Promise<GraphResponse>(() => {}))
    mounted.push(renderElement(createElement(GraphPanel, { onClose: vi.fn() })))

    expect(headerButton(t('graph.export_png')).disabled).toBe(true)
    expect(headerButton(t('graph.export_svg')).disabled).toBe(true)
  })
})
