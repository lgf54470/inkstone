import { downloadZip } from 'client-zip'
import { SLIDE_PAD_X, SLIDE_PAD_Y, type StageMetrics } from './slide-stage'
import { collectDocumentCss, renderElementPng, saveImage } from '../../lib/element-image'

// A deck as a sequence of images, over the shared element-to-PNG layer (`lib/element-image.ts`):
// the pages are the same markup the projector and the printed deck use, sliced by the same measured
// plans, and the sheet geometry below is what turns a page into that layer's fixed box.

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

// The stylesheets the document is wearing. Kept as the deck's name for the shared collector, since
// the deck was the first caller and its call sites read naturally this way.
export function collectDeckCss(): Promise<string> {
  return collectDocumentCss()
}

// One deck page as a PNG. The page is measured into the layer's box; the pads are deck design, not
// the layer's, so the holder inside the layer reads them off the CSS variables it already carries.
export async function renderDeckPagePng(page: HTMLElement, geometry: DeckImageGeometry, css: string): Promise<Blob> {
  return await renderElementPng(page, { width: geometry.width, height: geometry.height }, css + deckPadCss(geometry))
}

/** The deck's pad variables, re-asserted for the clone the layer draws (the layer knows no pads). */
function deckPadCss(geometry: DeckImageGeometry): string {
  return `\n:root { --deck-pad-x:${geometry.padX}px; --deck-pad-y:${geometry.padY}px; }`
}

/** The pages as one archive: a download per page is a burst a browser may block, and a zip is one. */
export async function zipDeckImages(images: { path: string; blob: Blob }[]): Promise<Blob> {
  const entries = images.map((image) => ({ name: image.path, input: image.blob, lastModified: new Date() }))
  return await downloadZip(entries).blob()
}

export function saveDeckImages(blob: Blob, filename: string): void {
  saveImage(blob, filename)
}
