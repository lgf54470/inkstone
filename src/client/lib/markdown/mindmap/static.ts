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
import { MINDMAP_CANVAS_CLASS, markMindmapReady, mindmapBlocks, mindmapBody, mindmapThemeAnnotation, showMindmapSource } from './view'

export interface StaticMindmapOptions {
  dark: boolean
  locale: AppLocale
  loadVendor?: MindmapVendorLoader
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

async function renderStaticBlock(node: HTMLElement, options: StaticMindmapOptions): Promise<void> {
  // Cached slide markup already carries the snapshot; drawing it again would
  // replace a self-contained image with a fresh offscreen render.
  if (node.querySelector(`.${MINDMAP_IMAGE_CLASS}`)) return
  const container = document.createElement('div')
  container.className = `${MINDMAP_CANVAS_CLASS} is-static`
  const placeholder = node.querySelector<HTMLElement>('[data-mindmap-placeholder]') ?? node
  placeholder.replaceChildren(container)
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
  const handle = drawInto(container, vendor, { ...parsed, theme: declared.choice }, options)
  try {
    const blob = await handle.exportSvg()
    const image = document.createElement('img')
    image.className = MINDMAP_IMAGE_CLASS
    image.src = await readBlobAsDataUrl(blob)
    image.alt = rootTopic(parsed.data) ?? t('preview.mindmap')
    image.loading = 'lazy'
    image.decoding = 'async'
    node.replaceChildren(image)
    markMindmapReady(node)
  }
  finally {
    handle.destroy()
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
