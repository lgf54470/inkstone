/**
 * A whiteboard as a still picture, for every surface that serializes or prints its
 * markup: an exported document, a shared note, a slide, the editor's live preview.
 * Those surfaces cannot host a second live board (their markup outlives the page), so
 * the scene is drawn once into an SVG and the block carries the picture instead.
 */
import { t } from '../../i18n'
import { parseExcalidrawScene } from './body'
import { loadExcalidrawVendor } from './loader'
import type { ExcalidrawVendorLoader } from './types'
import { excalidrawBlocks, excalidrawBody, markExcalidrawReady, showExcalidrawError, showExcalidrawSource } from './view'

const SVG_NAMESPACE = 'image/svg+xml'

export interface StaticExcalidrawOptions {
  dark: boolean
  loadVendor?: ExcalidrawVendorLoader
}

/** Turns the library's SVG text into a node: no markup is ever parsed as HTML. */
function svgNode(markup: string): SVGElement | null {
  const parsed = new DOMParser().parseFromString(markup, SVG_NAMESPACE)
  const root = parsed.documentElement
  if (root.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) return null
  const imported = document.importNode(root, true)
  if (!(imported instanceof SVGElement)) return null
  const node = imported
  node.setAttribute('class', 'excalidraw-image')
  node.setAttribute('role', 'img')
  node.setAttribute('aria-label', t('preview.excalidraw'))
  return node
}

/** A board nobody has drawn on yet: a frame saying what it is, not an empty picture. */
function emptyBoard(node: HTMLElement): void {
  const placeholder = node.querySelector<HTMLElement>('[data-excalidraw-placeholder]') ?? node
  const frame = document.createElement('div')
  frame.className = 'excalidraw-empty'
  frame.textContent = t('preview.excalidraw')
  placeholder.replaceChildren(frame)
  markExcalidrawReady(node)
}

async function drawBlock(node: HTMLElement, dark: boolean, load: ExcalidrawVendorLoader): Promise<void> {
  const parsed = parseExcalidrawScene(excalidrawBody(node))
  if (!parsed.ok) {
    showExcalidrawError(node, parsed.error)
    return
  }
  if (parsed.scene.elements.length === 0) {
    emptyBoard(node)
    return
  }
  const vendor = await load()
  const markup = await vendor.renderStaticSvg(parsed.scene, dark)
  const image = markup === null ? null : svgNode(markup)
  if (!image) {
    // A scene that cannot be drawn still has to say something: the source is the
    // honest fallback, exactly as it is for a body that would not parse.
    showExcalidrawSource(node)
    return
  }
  const placeholder = node.querySelector<HTMLElement>('[data-excalidraw-placeholder]') ?? node
  placeholder.replaceChildren(image)
  markExcalidrawReady(node)
}

/** Draws every whiteboard block in `root` as a still picture. */
export async function renderStaticExcalidraws(root: ParentNode, options: StaticExcalidrawOptions): Promise<void> {
  const blocks = excalidrawBlocks(root)
  if (blocks.length === 0) return
  const load = options.loadVendor ?? loadExcalidrawVendor
  for (const node of blocks) {
    await drawBlock(node, options.dark, load)
  }
}
