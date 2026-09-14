import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ProseFont } from '@shared/types'
import { safeFileName } from '../../lib/export-folder'
import { t } from '../../lib/i18n'
import { destroyChartInstances, enhancePreview, renderPendingMermaid } from '../../lib/markdown/enhance'
import { useUi } from '../../store/ui'
import { collectDeckCss, deckImageGeometry, renderDeckPagePng, saveDeckImages, zipDeckImages } from './deck-image'
import { railEntries } from './presentation-state'
import { readSlideHtml, renderSlideSource, slicePageHtml } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import { SlideProse } from './slide-prose'
import { SLIDE_PAD_X, SLIDE_PAD_Y, type StageMetrics } from './slide-stage'

// Exporting waits for the sheet to draw what the show draws, but not forever: a diagram that never
// settles must cost the export the diagram, not the export itself.
const PRINT_PREPARE_TIMEOUT_MS = 8000

// The deck as printable pages, one per page the show walks — built from the same measured plans
// and the same prepared markup the projector renders, so a printed deck and a shown deck agree
// page for page. A slide whose markup was never prepared (the show was exported the instant it
// opened) still contributes its pages, rendered from the plain markdown.
export function buildDeckPages(
  deck: string[],
  cacheKeys: string[],
  plans: Record<number, SlidePlan>,
  metrics: StageMetrics,
  externalImages: boolean,
): string[] {
  return railEntries(deck.length, plans).map((entry) => {
    const html = readSlideHtml(cacheKeys[entry.slide] ?? '') ?? renderSlideSource(deck[entry.slide] ?? '', externalImages).html
    const plan = plans[entry.slide]
    if (!plan) return html
    return slicePageHtml(html, plan, entry.sub, metrics.contentWidth, metrics.contentHeight)
  })
}

interface DeckSheetProps {
  /** One entry per deck page, from buildDeckPages(). */
  pages: string[]
  metrics: StageMetrics
  font: ProseFont
  /** The theme the deck was measured in; a chart's axes follow it. */
  dark: boolean
}

// The exported pages themselves: one page box per deck page, each one the design canvas at 1:1,
// carrying the page's own markup. Nothing about the export surface is visible — it is laid out
// off-screen rather than hidden, because a `display: none` subtree has no size and a chart drawn
// into a zero-sized canvas exports empty — and `inert` keeps the buttons the prose markup carries
// out of the tab order, which hidden used to do for free.
function DeckSheet({ sheetRef, pages, metrics, font }: DeckSheetProps & { sheetRef: React.RefObject<HTMLDivElement | null> }) {
  const geometry = useMemo(() => deckPrintGeometry(metrics), [metrics])
  return createPortal(
    <div ref={sheetRef} data-deck-print aria-hidden='true' inert className='deck-print-sheet'>
      <style>{geometry}</style>
      {pages.map((html, index) => (
        // The slide context, not the reader's prose one: these pages were measured with the
        // slide's type scale and diagram sizes, and printing them in another scale would reflow
        // every page against the slice it was handed.
        <div key={index} className='deck-print-page'>
          <div className='deck-print-body ink-slide'>
            <SlideProse html={html} contentWidth={metrics.contentWidth} font={font} />
          </div>
        </div>
      ))}
    </div>,
    document.body,
  )
}

// Exporting the deck as a PDF runs through the browser's own print pipeline, the way a note is
// exported as PDF: the print stylesheet lets only this sheet through, and every page box is the
// design canvas at 1:1, so "Print to PDF" produces exactly the pages the show has.
export function DeckPrintSheet({ pages, metrics, font, dark, onDone }: DeckSheetProps & { onDone: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  useDeckSheetReady(sheetRef, dark, metrics, (root) => {
    // Written straight to the node: the print dialog blocks right after this line, so a re-render
    // would never land in time for observers of the sheet.
    root.dataset.deckPrintReady = 'true'
    window.print()
  }, onDone)
  return <DeckSheet sheetRef={sheetRef} pages={pages} metrics={metrics} font={font} dark={dark} />
}

// Exporting the deck as images uses the same pages: each is rendered to a PNG and the set is
// archived, because a download per page is a burst a browser may block.
export function DeckImageSheet({ pages, metrics, font, dark, title, onDone }: DeckSheetProps & { title: string; onDone: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  useDeckSheetReady(sheetRef, dark, metrics, async (root) => {
    try {
      const count = await saveDeckPages(root, metrics, title)
      root.dataset.deckImageReady = 'true'
      useUi.getState().toast({ title: t('workspace.presentation_images_saved', { value0: count }), tone: 'success' })
    }
    catch (error: unknown) {
      // A failed export is the one thing here the presenter has to be told about: nothing was
      // downloaded, so the toast is the only signal there is.
      console.warn('[inkstone] deck image export failed', error)
      root.dataset.deckImageReady = 'failed'
      useUi.getState().toast({ title: t('workspace.presentation_images_failed'), tone: 'danger' })
    }
  }, onDone)
  return <DeckSheet sheetRef={sheetRef} pages={pages} metrics={metrics} font={font} dark={dark} />
}

// Both exports share one lifecycle: mount the sheet, let it finish drawing what it has to draw, hand
// the finished sheet over, and tear everything down when the export is over for either reason —
// the caller saying so (`onDone`) or the overlay closing under it.
function useDeckSheetReady(
  sheetRef: React.RefObject<HTMLDivElement | null>,
  dark: boolean,
  metrics: StageMetrics,
  handOver: (root: HTMLDivElement) => void | Promise<void>,
  onDone: () => void,
): void {
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const root = sheetRef.current
      if (!root) return
      await prepareDeckSheet(root, dark, metrics)
      if (!cancelled) await handOver(root)
    }
    window.addEventListener('afterprint', onDone)
    void run()
    return () => {
      cancelled = true
      window.removeEventListener('afterprint', onDone)
      destroyChartInstances(sheetRef.current)
    }
  }, [dark, metrics, handOver, onDone, sheetRef])
}

async function saveDeckPages(root: HTMLElement, metrics: StageMetrics, title: string): Promise<number> {
  const pages = [...root.querySelectorAll<HTMLElement>('.deck-print-page')]
  const geometry = deckImageGeometry(metrics)
  const css = await collectDeckCss()
  const images: { path: string; blob: Blob }[] = []
  for (const [index, page] of pages.entries()) {
    images.push({ path: `${safeFileName(title) || 'deck'}-${String(index + 1).padStart(2, '0')}.png`, blob: await renderDeckPagePng(page, geometry, css) })
  }
  saveDeckImages(await zipDeckImages(images), `${safeFileName(title) || 'deck'}-images.zip`)
  return images.length
}

// What the page is made of has to be on it before the export reads it. The captured markup carries a
// chart as a still — a picture of a canvas at whatever size that canvas had — so the sheet draws
// live charts on its own canvases first, through the same enhancement the editor preview runs. The
// webfonts have to be laid out too, or every page reflows while it is being drawn.
async function prepareDeckSheet(root: HTMLElement, dark: boolean, metrics: StageMetrics): Promise<void> {
  try {
    await enhancePreview(root, {
      math: true,
      mermaid: true,
      mindmap: 'snapshot',
      dark,
      codeBlockCollapseLines: 0,
      // The printed page is the design canvas, so a mind map on it is drawn for
      // the same content box the show measured it in.
      mindmapBox: { width: metrics.contentWidth, height: metrics.contentHeight },
    })
    await renderPendingMermaid(root, dark)
    await settleWithin(Promise.all([document.fonts.ready, decodeImages(root)]), PRINT_PREPARE_TIMEOUT_MS)
  }
  catch (error: unknown) {
    // Best-effort: a page whose charts or fonts did not settle still exports with the still picture
    // its markup already carries, which is what the export showed before live charts.
    console.warn('[inkstone] deck sheet preparation failed', error)
  }
}

async function decodeImages(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>('img')]
  await Promise.allSettled(images.map((image) => image.decode()))
}

// Resolves when the work does or when it has had long enough, so a slow artifact delays the export
// instead of hanging it.
function settleWithin(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs)
    const done = (): void => {
      window.clearTimeout(timer)
      resolve()
    }
    void work.then(done, done)
  })
}

// The stage reports fractional design sizes (it divides by the scale), which would print as
// fractional page boxes; a PDF page is a whole number of pixels.
function deckPrintGeometry(metrics: StageMetrics): string {
  const width = Math.round(metrics.designWidth)
  const height = Math.round(metrics.designHeight)
  return `@page { size: ${width}px ${height}px; margin: 0 }
[data-deck-print] { --deck-page-width: ${width}px; --deck-page-height: ${height}px; --deck-pad-x: ${SLIDE_PAD_X}px; --deck-pad-y: ${SLIDE_PAD_Y}px; }`
}
