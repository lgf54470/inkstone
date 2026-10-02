import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProseFont } from '@shared/types'
import { settleWithin } from '../../lib/async'
import { safeFileName } from '../../lib/export-folder'
import { t } from '../../lib/i18n'
import { registerFenceBodies } from '../../lib/markdown/fence-bodies'
import { destroyChartInstances, enhancePreview, renderPendingMermaid } from '../../lib/markdown/enhance'
import { useUi } from '../../store/ui'
import { collectDeckCss, deckImageGeometry, renderDeckPagePng, saveDeckImages, zipDeckImages } from './deck-image'
import { railEntries } from './presentation-state'
import { readSlideHtml, renderSlideSource, slicePageHtml, slideMarkup, type SlideMarkup } from './slide-html'
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
): SlideMarkup[] {
  return railEntries(deck.length, plans).map((entry) => {
    const markup = readSlideHtml(cacheKeys[entry.slide] ?? '') ?? slideMarkup(renderSlideSource(deck[entry.slide] ?? '', externalImages))
    const plan = plans[entry.slide]
    if (!plan) return markup
    // The plan carries the layout: a slide the projector laid out as flow prints as flow, and one it
    // kept as columns prints in its columns, because the page numbers both surfaces walk are the
    // ones that plan measured.
    return { html: slicePageHtml(markup.html, plan, entry.sub, metrics.contentWidth, metrics.contentHeight), fences: markup.fences, layout: plan.layout }
  })
}

interface DeckSheetProps {
  /** One entry per deck page, from buildDeckPages(). */
  pages: SlideMarkup[]
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
      {pages.map((page, index) => (
        // The slide context, not the reader's prose one: these pages were measured with the
        // slide's type scale and diagram sizes, and printing them in another scale would reflow
        // every page against the slice it was handed. Each one also carries the fence bodies its
        // own blocks were rendered from, which the snapshot draw below looks up by walking up.
        <div key={index} className='deck-print-page' ref={(node) => { if (node) registerFenceBodies(node, page.fences) }}>
          <div className='deck-print-body ink-slide'>
            <SlideProse html={page.html} contentWidth={metrics.contentWidth} contentHeight={metrics.contentHeight} font={font} layout={page.layout} />
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
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  useDeckSheetReady(sheetRef, dark, metrics, async (root) => {
    try {
      const count = await saveDeckPages(root, metrics, title, (current, total) => setProgress({ current, total }))
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
    // The archive is out, so the sheet has nothing left to draw: it goes back to the show the same
    // way the printed sheet does when the print dialog closes. Held any longer it stays laid out
    // off-screen for the rest of the talk, and the show keeps announcing itself as busy.
    onDone()
  }, onDone)
  return (
    <>
      <DeckSheet sheetRef={sheetRef} pages={pages} metrics={metrics} font={font} dark={dark} />
      {progress && (
        <div
          role='status'
          aria-live='polite'
          className='fixed bottom-[var(--sp-4)] left-1/2 -translate-x-1/2 z-[var(--z-popover)] rounded-[var(--r-md)] bg-[var(--bg-overlay)] px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-13)] shadow-lg backdrop-blur-md border border-[var(--border-subtle)] text-[var(--text-primary)]'
        >
          {t('workspace.presentation_exporting_images', { value0: progress.current, value1: progress.total })}
        </div>
      )}
    </>
  )
}

// Both exports share one lifecycle: mount the sheet, let it finish drawing what it has to draw, hand
// the finished sheet over, and tear everything down when the export is over for either reason —
// the caller saying so (`onDone`) or the overlay closing under it.
//
// The two callbacks are held in refs rather than taken as effect dependencies: the sheet writes them
// inline, so their identity changes on every render, and an export that reports its own progress
// renders on every page it draws. Depending on them therefore restarted the whole export — and the
// print dialog, and the archive, and the download — once per page, forever. What genuinely asks for
// a re-prepare is the theme and the geometry the pages were built for, and those are the deps.
function useDeckSheetReady(
  sheetRef: React.RefObject<HTMLDivElement | null>,
  dark: boolean,
  metrics: StageMetrics,
  handOver: (root: HTMLDivElement) => void | Promise<void>,
  onDone: () => void,
): void {
  const handOverRef = useRef(handOver)
  const doneRef = useRef(onDone)
  useEffect(() => {
    handOverRef.current = handOver
    doneRef.current = onDone
  })
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const root = sheetRef.current
      if (!root) return
      await prepareDeckSheet(root, dark, metrics)
      if (!cancelled) await handOverRef.current(root)
    }
    const finished = () => doneRef.current()
    window.addEventListener('afterprint', finished)
    void run()
    return () => {
      cancelled = true
      window.removeEventListener('afterprint', finished)
      destroyChartInstances(sheetRef.current)
    }
  }, [dark, metrics, sheetRef])
}

export async function saveDeckPages(root: HTMLElement, metrics: StageMetrics, title: string, onProgress?: (current: number, total: number) => void): Promise<number> {
  const pages = [...root.querySelectorAll<HTMLElement>('.deck-print-page')]
  const geometry = deckImageGeometry(metrics)
  const css = await collectDeckCss()
  const images: { path: string; blob: Blob }[] = []
  const total = pages.length
  onProgress?.(0, total)
  for (const [index, page] of pages.entries()) {
    const blob = await renderDeckPagePng(page, geometry, css)
    images.push({ path: `${safeFileName(title) || 'deck'}-${String(index + 1).padStart(2, '0')}.png`, blob })
    onProgress?.(index + 1, total)
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
      excalidraw: 'snapshot',
      // A board cannot run on the sheet either; its cards print as a list.
      kanban: 'snapshot',
      // A chart on a printed page has no entrance to animate: the sheet is handed over — and printed —
      // as soon as the fonts land, and the reflow that lands them resizes the chart's box, which clears
      // its canvas and animates again from nothing. Drawn instantly, the chart is on the canvas before
      // the sheet says it is ready and stays there through that resize.
      instantCharts: true,
      // No `fences` for the root: every page registers the bodies it was built from on its own box,
      // and a block reads the nearest set above it (P-01). The sheet holds pages from different
      // slides, which no single document's numbering could answer for.
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


// The stage reports fractional design sizes (it divides by the scale), which would print as
// fractional page boxes; a PDF page is a whole number of pixels.
function deckPrintGeometry(metrics: StageMetrics): string {
  const width = Math.round(metrics.designWidth)
  const height = Math.round(metrics.designHeight)
  return `@page { size: ${width}px ${height}px; margin: 0 }
[data-deck-print] { --deck-page-width: ${width}px; --deck-page-height: ${height}px; --deck-pad-x: ${SLIDE_PAD_X}px; --deck-pad-y: ${SLIDE_PAD_Y}px; }`
}
