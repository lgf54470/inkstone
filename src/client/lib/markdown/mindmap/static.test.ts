import { describe, expect, it } from 'vitest'
import { encodeDataValue } from '../data-attr'
import { MINDMAP_IMAGE_CLASS, renderStaticMindmapBlocks, type MindmapBox } from './static'
import { APP_THEME_CHOICE } from './theme'
import type { MindmapHandle, MindmapVendor } from './types'

const LOCALE = 'en-US'
const BOX: MindmapBox = { width: 1168, height: 632 }

function block(body: string): HTMLElement {
  const node = document.createElement('div')
  node.dataset.mindmap = encodeDataValue(body)
  node.innerHTML = '<div data-mindmap-placeholder></div>'
  return node
}

function svgBlob(width: number, height: number): Blob {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}px" height="${height}px"><rect width="${width}" height="${height}"/></svg>`
  return new Blob([svg], { type: 'image/svg+xml' })
}

interface DrawnMap {
  el: HTMLElement
  /** Whether the element was in the document when the instance was built. */
  connectedWhenCreated: boolean
  /** Whether it was still in the document when it was fitted — the call that measures it. */
  fittedWhileConnected: boolean
  fitCalls: number
}

/**
 * A vendor that draws nothing but records what the snapshot path did to it. The
 * only thing that matters here is where the map was built: the real library
 * measures the boxes it draws, and a map built outside the document measures
 * zero and exports a picture with nothing in it.
 */
function stubHandle(record: DrawnMap, blob: Blob): MindmapHandle {
  const noop = (): void => {}
  return {
    getData: () => ({}),
    refresh: noop,
    applyTheme: () => {},
    toCenter: noop,
    layout: noop,
    scaleFit: () => {
      record.fitCalls += 1
      record.fittedWhileConnected = record.el.isConnected
    },
    focus: noop,
    undo: noop,
    redo: noop,
    clearHistory: noop,
    destroy: noop,
    exportSvg: () => Promise.resolve(blob),
    exportPng: () => Promise.resolve(null),
  }
}

function stubVendor(records: DrawnMap[], blob: Blob): MindmapVendor {
  return {
    parse: (body) => ({ ok: true, data: { body }, extra: {}, theme: APP_THEME_CHOICE }),
    serialize: () => '',
    create: (options) => {
      const record: DrawnMap = {
        el: options.el,
        connectedWhenCreated: options.el.isConnected,
        fittedWhileConnected: false,
        fitCalls: 0,
      }
      records.push(record)
      return stubHandle(record, blob)
    },
  }
}

/** Renders one block and hands back the block, the drawn map and the picture it produced. */
async function render(options: { body?: string; box?: MindmapBox } = {}): Promise<{ node: HTMLElement; drawn: DrawnMap; svg: string }> {
  const node = block(options.body ?? '- Root\n  - A')
  document.body.append(node)
  const records: DrawnMap[] = []
  const vendor = stubVendor(records, svgBlob(520, 300))
  await renderStaticMindmapBlocks([node], {
    dark: false,
    locale: LOCALE,
    loadVendor: () => Promise.resolve(vendor),
    box: options.box,
  })
  const image = node.querySelector<HTMLImageElement>(`.${MINDMAP_IMAGE_CLASS}`)
  return { node, drawn: records[0]!, svg: image ? svgOf(image) : '' }
}

/** The snapshot is carried as a base64 data URL, which is what travels in serialized markup. */
function svgOf(image: HTMLImageElement): string {
  return atob(image.src.replace(/^data:[^,]+,/, ''))
}

describe('renderStaticMindmapBlocks with a box', () => {
  it('draws in a laid-out box inside the document', async () => {
    const { node, drawn } = await render({ box: BOX })
    // Out of the document a map measures zero and exports a picture with nothing
    // in it, which is exactly what the box is for.
    expect(drawn.connectedWhenCreated).toBe(true)
    expect(drawn.fittedWhileConnected).toBe(true)
    expect(drawn.fitCalls).toBe(1)
    // The box is scaffolding: it must not survive the snapshot.
    expect([...document.body.children]).toEqual([node])
  })

  it('sizes the exported picture to the box with the tree kept in a viewBox', async () => {
    const { svg } = await render({ box: BOX })
    expect(svg).toContain('viewBox="0 0 520 300"')
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(svg).toContain('width="1168"')
    expect(svg).toContain('height="632"')
  })
})

describe('renderStaticMindmapBlocks without a box', () => {
  it('draws into the block itself and leaves the picture as it was exported', async () => {
    const { drawn, svg } = await render()
    expect(drawn.fitCalls).toBe(0)
    expect(svg).toContain('width="520px"')
    expect(svg).not.toContain('viewBox')
  })

  it('falls back to the source when the body cannot be parsed', async () => {
    const node = block('- Root')
    document.body.append(node)
    const vendor: MindmapVendor = {
      parse: () => ({ ok: false, error: 'bad body' }),
      serialize: () => '',
      create: () => {
        throw new Error('should not draw')
      },
    }
    await renderStaticMindmapBlocks([node], { dark: false, locale: LOCALE, loadVendor: () => Promise.resolve(vendor) })
    expect(node.querySelector('pre')).not.toBeNull()
    expect(node.classList.contains('mindmap-source')).toBe(true)
  })
})
