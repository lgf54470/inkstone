/**
 * Non-interactive surfaces (share pages, presentation slides, HTML/PDF export)
 * get a picture instead of a live map: an offscreen instance is drawn, exported
 * as a text-based SVG and swapped in as an `<img>`, which travels inside
 * serialized markup and prints like any other image. A block that cannot be
 * rendered falls back to its source, never to a placeholder.
 */
import type { AppLocale } from '@shared/types'
import { errorMessage } from '../../errors'
import { t } from '../../i18n'
import { detectMindmapMode } from './body'
import { loadMindmapVendor } from './loader'
import { fenceThemeChoice } from './theme'
import type { MindmapParsedBody, MindmapVendor, MindmapVendorLoader } from './types'
import { MINDMAP_CANVAS_CLASS, MINDMAP_PLACEHOLDER_SELECTOR, markMindmapReady, mindmapBlocks, mindmapBody, mindmapThemeAnnotation, showMindmapSource } from './view'

export interface StaticMindmapOptions {
  dark: boolean
  locale: AppLocale
  loadVendor?: MindmapVendorLoader
  /**
   * The box the picture is meant to fill — a slide's content area. With it the
   * map is drawn in a laid-out box of that size, fitted into it, and the
   * exported SVG is sized to it. Left out, the map is drawn where the block
   * sits, which is what a note-sized surface wants.
   */
  box?: MindmapBox
}

/** A box in CSS pixels, as a surface measures its own content area. */
export interface MindmapBox {
  width: number
  height: number
}

export const MINDMAP_IMAGE_CLASS = 'mindmap-image'

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('could not read the exported SVG'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

function rootTopic(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const nodeData = (data as { nodeData?: unknown }).nodeData
  if (typeof nodeData !== 'object' || nodeData === null) return null
  const topic = (nodeData as { topic?: unknown }).topic
  return typeof topic === 'string' && topic.trim() ? topic.trim() : null
}

function drawInto(container: HTMLElement, vendor: MindmapVendor, body: MindmapParsedBody, options: StaticMindmapOptions) {
  return vendor.create({
    el: container,
    body,
    editable: false,
    dark: options.dark,
    locale: options.locale,
    newTopicName: '',
    modifierWheelZoom: false,
    onOperation: () => {},
    onEditingChange: () => {},
  })
}

/**
 * A laid-out box in the document that nobody sees. The library measures the
 * nodes it draws, and an element outside the document has no layout box at all:
 * built there, a map measures zero and exports a picture with nothing in it.
 * `visibility: hidden` keeps the layout that `display: none` would drop, and the
 * offset puts it off screen.
 */
function mountOffscreenBox(box: MindmapBox): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.top = '0'
  host.style.left = '-99999px'
  host.style.width = `${box.width}px`
  host.style.height = `${box.height}px`
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)
  return host
}

/**
 * Makes the exported SVG the box it is shown in: the tree it drew becomes the
 * viewBox, so the picture is the slide's content area with the map scaled to fit
 * inside it — nothing is cropped, whatever the tree's own proportions are.
 */
function fitSvgToBox(svg: string, box: MindmapBox): string {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = parsed.documentElement
  if (!root || root.localName !== 'svg') return svg
  // The library writes these in CSS pixels ("520px").
  const width = Number.parseFloat(root.getAttribute('width') ?? '')
  const height = Number.parseFloat(root.getAttribute('height') ?? '')
  // A map that measured nothing has no tree to fit; the picture is left as it
  // was rather than given a box that would scale nothing up.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return svg
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  root.setAttribute('width', String(Math.round(box.width)))
  root.setAttribute('height', String(Math.round(box.height)))
  return new XMLSerializer().serializeToString(parsed)
}

async function renderStaticBlock(node: HTMLElement, options: StaticMindmapOptions): Promise<void> {
  // Cached slide markup already carries the snapshot; drawing it again would
  // replace a self-contained image with a fresh offscreen render.
  if (node.querySelector(`.${MINDMAP_IMAGE_CLASS}`)) return
  const vendor = await (options.loadVendor ?? loadMindmapVendor)()
  const body = mindmapBody(node)
  const parsed = vendor.parse(body, detectMindmapMode(body), t('preview.mindmap_untitled'))
  if (!parsed.ok) {
    showMindmapSource(node)
    return
  }
  // The snapshot draws what the fence asks for, exactly like the live map: the
  // annotation is the outline format's only home for it (./theme).
  const declared = fenceThemeChoice(parsed.theme, mindmapThemeAnnotation(node))
  if ('error' in declared) {
    showMindmapSource(node)
    return
  }
  const image = await drawSnapshot(node, vendor, { ...parsed, theme: declared.choice }, options)
  if (image) node.replaceChildren(image)
  markMindmapReady(node)
}

/** Draws the map once and hands back the still it exported, or null when it could not. */
async function drawSnapshot(
  node: HTMLElement,
  vendor: MindmapVendor,
  body: MindmapParsedBody,
  options: StaticMindmapOptions,
): Promise<HTMLImageElement | null> {
  const box = options.box
  const host = box ? mountOffscreenBox(box) : null
  const container = document.createElement('div')
  container.className = `${MINDMAP_CANVAS_CLASS} is-static`
  try {
    if (host && box) {
      // The box is what the map is fitted to, so the drawing surface is the box
      // rather than the block's placeholder, which a slide never lays out.
      container.style.width = `${box.width}px`
      container.style.height = `${box.height}px`
      host.append(container)
    }
    else {
      const placeholder = node.querySelector<HTMLElement>(MINDMAP_PLACEHOLDER_SELECTOR) ?? node
      placeholder.replaceChildren(container)
    }
    const handle = drawInto(container, vendor, body, options)
    try {
      if (box) handle.scaleFit()
      const blob = await handle.exportSvg()
      const svg = await blob.text()
      const image = document.createElement('img')
      image.className = MINDMAP_IMAGE_CLASS
      image.src = await readBlobAsDataUrl(new Blob([box ? fitSvgToBox(svg, box) : svg], { type: blob.type }))
      image.alt = rootTopic(body.data) ?? t('preview.mindmap')
      image.loading = 'lazy'
      image.decoding = 'async'
      return image
    }
    finally {
      handle.destroy()
    }
  }
  finally {
    host?.remove()
  }
}

export async function renderStaticMindmapBlocks(nodes: HTMLElement[], options: StaticMindmapOptions): Promise<void> {
  for (const node of nodes) {
    try {
      await renderStaticBlock(node, options)
    }
    catch (err) {
      // Best-effort artifact: the block shows its source rather than an empty box.
      console.warn('[inkstone] mind map snapshot failed', errorMessage(err))
      showMindmapSource(node)
    }
  }
}

export function renderStaticMindmaps(root: HTMLElement, options: StaticMindmapOptions): Promise<void> {
  return renderStaticMindmapBlocks(mindmapBlocks(root), options)
}
