import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { ProseFont } from '@shared/types'
import { railEntries } from './presentation-state'
import { readSlideHtml, renderSlideSource, slicePageHtml } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import { SlideProse } from './slide-prose'
import { SLIDE_PAD_X, SLIDE_PAD_Y, type StageMetrics } from './slide-stage'

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

export interface DeckPrintSheetProps {
  /** One entry per deck page, from buildDeckPages(). */
  pages: string[]
  metrics: StageMetrics
  font: ProseFont
  /** Called once the print dialog is done with the sheet. */
  onDone: () => void
}

// Exporting the deck runs through the browser's own print pipeline, the way a note is exported as
// PDF: the print stylesheet lets only this sheet through, and every page box is the design canvas
// at 1:1, so "Print to PDF" produces exactly the pages the show has. The @page size has to carry
// the live geometry, which is what the generated style element is for.
export function DeckPrintSheet({ pages, metrics, font, onDone }: DeckPrintSheetProps) {
  const geometry = useMemo(() => deckPrintGeometry(metrics), [metrics])
  useEffect(() => {
    window.addEventListener('afterprint', onDone)
    // One beat for the sheet to lay out and the webfonts to settle before the dialog opens.
    const timer = window.setTimeout(() => window.print(), 150)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', onDone)
    }
  }, [onDone])

  return createPortal(
    <div data-deck-print aria-hidden='true' className='deck-print-sheet'>
      <style>{geometry}</style>
      {pages.map((html, index) => (
        <div key={index} className='deck-print-page'>
          <div className='deck-print-body'>
            <SlideProse html={html} contentWidth={metrics.contentWidth} font={font} />
          </div>
        </div>
      ))}
    </div>,
    document.body,
  )
}

// The stage reports fractional design sizes (it divides by the scale), which would print as
// fractional page boxes; a PDF page is a whole number of pixels.
function deckPrintGeometry(metrics: StageMetrics): string {
  const width = Math.round(metrics.designWidth)
  const height = Math.round(metrics.designHeight)
  return `@page { size: ${width}px ${height}px; margin: 0 }
[data-deck-print] { --deck-page-width: ${width}px; --deck-page-height: ${height}px; --deck-pad-x: ${SLIDE_PAD_X}px; --deck-pad-y: ${SLIDE_PAD_Y}px; }`
}
