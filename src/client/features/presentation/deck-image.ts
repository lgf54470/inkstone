import { downloadZip } from 'client-zip'
import { SLIDE_PAD_X, SLIDE_PAD_Y, type StageMetrics } from './slide-stage'

// A deck as a sequence of images. A page is markup the browser has already laid out, and the
// browser will draw markup for us if it arrives inside an SVG it can load as an image — so the page
// is serialized into one, turned into pixels by a canvas, and encoded as a PNG. That is the whole
// renderer: no screenshot library, and the pages are the same markup the projector and the printed
// deck use, sliced by the same measured plans.
const SVG_NS = 'http://www.w3.org/2000/svg'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/** Two pixels per design pixel: a deck page is a 1280px canvas, so this is a 2560px-wide image. */
export const DECK_IMAGE_SCALE = 2

/** The page box an exported image has, in design pixels. */
export interface DeckImageGeometry {
  width: number
  height: number
  padX: number
  padY: number
}

export function deckImageGeometry(metrics: StageMetrics): DeckImageGeometry {
  return {
    width: Math.round(metrics.designWidth),
    height: Math.round(metrics.designHeight),
    padX: SLIDE_PAD_X,
    padY: SLIDE_PAD_Y,
  }
}

// The stylesheets the document is wearing, as one block of text. An SVG image is a single data URL
// with no document and no base URL behind it, so anything a rule points at has to travel inside the
// text: without this, every page would render in a fallback face instead of the app's own type.
export async function collectDeckCss(): Promise<string> {
  const rules: string[] = []
  for (const sheet of [...document.styleSheets]) {
    let cssRules: CSSRuleList | null = null
    try {
      cssRules = sheet.cssRules
    }
    catch {
      // Best-effort: a cross-origin stylesheet cannot be read, and a deck page does not depend on
      // one — every rule the pages need is in the app's own bundle.
      continue
    }
    for (const rule of [...(cssRules ?? [])]) rules.push(rule.cssText)
  }
  return inlineStylesheetAssets(rules.join('\n'))
}

// One deck page as a PNG.
export async function renderDeckPagePng(page: HTMLElement, geometry: DeckImageGeometry, css: string): Promise<Blob> {
  const serialized = new XMLSerializer().serializeToString(deckPageSvg(page, geometry, css))
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`)
  const canvas = document.createElement('canvas')
  canvas.width = geometry.width * DECK_IMAGE_SCALE
  canvas.height = geometry.height * DECK_IMAGE_SCALE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('a 2d canvas is unavailable')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('the page could not be encoded as a PNG'))
    }, 'image/png')
  })
}

/** The pages as one archive: a download per page is a burst a browser may block, and a zip is one. */
export async function zipDeckImages(images: { path: string; blob: Blob }[]): Promise<Blob> {
  const entries = images.map((image) => ({ name: image.path, input: image.blob, lastModified: new Date() }))
  return await downloadZip(entries).blob()
}

export function saveDeckImages(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The page as an SVG the browser can draw. The page keeps its own classes and the stylesheet comes
// along, so what it draws is what it looked like; the geometry the printed deck sets on the sheet
// is set on the holder here, because the sheet itself is not part of what is serialized.
function deckPageSvg(page: HTMLElement, geometry: DeckImageGeometry, css: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('width', String(geometry.width))
  svg.setAttribute('height', String(geometry.height))
  // The image is a document of its own, and the design tokens hang off its root: without the theme
  // attributes the app's own skin is missing and every page draws as bare black text on nothing.
  for (const { name, value } of document.documentElement.attributes) svg.setAttribute(name, value)
  const foreign = document.createElementNS(SVG_NS, 'foreignObject')
  foreign.setAttribute('x', '0')
  foreign.setAttribute('y', '0')
  foreign.setAttribute('width', '100%')
  foreign.setAttribute('height', '100%')
  const holder = document.createElementNS(XHTML_NS, 'div')
  holder.setAttribute('xmlns', XHTML_NS)
  holder.setAttribute('style', holderGeometry(geometry))
  const style = document.createElementNS(XHTML_NS, 'style')
  style.textContent = css
  holder.append(style, cloneDeckPage(page))
  foreign.append(holder)
  svg.append(foreign)
  return svg
}

function holderGeometry(geometry: DeckImageGeometry): string {
  return `width:${geometry.width}px;height:${geometry.height}px;` +
    `--deck-page-width:${geometry.width}px;--deck-page-height:${geometry.height}px;` +
    `--deck-pad-x:${geometry.padX}px;--deck-pad-y:${geometry.padY}px;`
}

// A canvas cannot ride inside the SVG — its pixels are not in the markup — so every chart is swapped
// for a still of itself, which is the same rule the slide cache follows for the same reason.
function cloneDeckPage(page: HTMLElement): HTMLElement {
  const clone = page.cloneNode(true) as HTMLElement
  const sources = [...page.querySelectorAll('canvas')]
  clone.querySelectorAll('canvas').forEach((canvas, index) => {
    const source = sources[index]
    if (source) freezeCanvas(canvas, source)
  })
  return clone
}

function freezeCanvas(canvas: HTMLCanvasElement, source: HTMLCanvasElement): void {
  try {
    const still = document.createElement('img')
    still.setAttribute('src', source.toDataURL('image/png'))
    still.setAttribute('style', `width:${source.clientWidth || source.width}px;height:${source.clientHeight || source.height}px`)
    canvas.replaceWith(still)
  }
  catch (error: unknown) {
    // Best-effort: a canvas whose pixels cannot be read back (a cross-origin image went into it)
    // keeps its empty canvas in the page image, and the rest of the page is unaffected.
    console.warn('[inkstone] deck image could not freeze a canvas', error)
  }
}

async function inlineStylesheetAssets(css: string): Promise<string> {
  const urls = new Set(
    [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)]
      .map((match) => match[2] ?? '')
      .filter((url) => url && !url.startsWith('data:') && !url.startsWith('#')),
  )
  let output = css
  for (const url of urls) {
    const dataUrl = await readAssetAsDataUrl(url)
    if (!dataUrl) continue
    output = output
      .split(`url("${url}")`).join(`url("${dataUrl}")`)
      .split(`url('${url}')`).join(`url('${dataUrl}')`)
      .split(`url(${url})`).join(`url(${dataUrl})`)
  }
  return output
}

async function readAssetAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) return null
    return await blobToDataUrl(await response.blob())
  }
  catch (error: unknown) {
    // Best-effort: an asset that cannot be read keeps its original URL, which an SVG image cannot
    // resolve, so the page image simply renders without it.
    console.warn('[inkstone] deck image asset could not be inlined', url, error)
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('the asset could not be read'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('the page image could not be decoded'))
    image.src = src
  })
}
