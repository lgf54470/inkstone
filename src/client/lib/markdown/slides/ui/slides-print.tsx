import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { settleWithin } from '../../../async'
import { useUi } from '../../../../store/ui'
import { t } from '../../../i18n'
import type { PageSize } from '../page'
import type { BentoDoc } from '../types'
import { audienceSlides } from '../flow'
import { SlidesCanvas } from './slides-canvas'

/** Pictures and webfonts are what a page needs before it can be printed, and both may be slow. */
const SHEET_SETTLE_TIMEOUT_MS = 3000
/** A last beat on the main thread: the print dialog blocks it, so a page the browser accepted but has not painted would reach the paper empty. */
const SHEET_PAINT_DELAY_MS = 250

/**
 * The paper a deck prints into: one page box per page, each the deck's own page at 1:1 — the
 * page is the design, so the @page size is the deck's size rather than a paper size the deck was
 * never drawn for, and the margin is zero for the same reason.
 */
export function printSheetCss(size: PageSize): string {
  const width = Math.round(size.width)
  const height = Math.round(size.height)
  return `@page { size: ${width}px ${height}px; margin: 0; }\n.bento-print-page { width: ${width}px; height: ${height}px; }`
}

interface SlidesPrintSheetProps {
  doc: BentoDoc
  /** The export is over, whether the deck was printed or the dialog was dismissed. */
  onDone: () => void
}

/**
 * The deck as paper: the pages the show walks, drawn at 1:1 into one page box each and laid out
 * off-screen for the browser's own print pipeline, so "Save as PDF" produces the deck rather than
 * a picture of the editor. Off-screen rather than hidden, because a `display: none` subtree has no
 * size — and `inert`, because the markup of a page carries controls that must not join the tab
 * order of the editor around it.
 *
 * The dialog blocks the thread, so the sheet waits for its pictures and fonts before calling it:
 * that wait is bounded (a picture that never settles costs the export the picture, not the
 * export), and the caller keeps the sheet mounted until `afterprint` says the reader is done.
 */
export const SlidesPrintSheet = memo(function SlidesPrintSheet({ doc, onDone }: SlidesPrintSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const pages = audienceSlides(doc)

  useEffect(() => {
    const root = sheetRef.current
    if (!root) return
    let cancelled = false
    const run = async (): Promise<void> => {
      await waitForSheet(root)
      if (cancelled) return
      window.print()
    }
    window.addEventListener('afterprint', onDone)
    void run()
    return () => {
      cancelled = true
      window.removeEventListener('afterprint', onDone)
    }
  }, [doc, onDone])

  return createPortal(
    <div ref={sheetRef} data-bento-print aria-hidden='true' inert className='bento-print-sheet'>
      <style>{printSheetCss(doc.size)}</style>
      {pages.map((slide) => (
        <div key={slide.id} className='bento-print-page'>
          <SlidesCanvas slide={slide} theme={doc.theme} page={doc.size} assets={doc.assets} />
        </div>
      ))}
    </div>,
    document.body,
  )
})

/**
 * The editor's side of the export: the request the print control makes, and the sheet to render
 * while it runs. A deck with nothing on the paper — every page hidden — is refused out loud
 * instead of opening a print dialog over an empty sheet.
 */
export function useSlidesPrint(doc: BentoDoc): { requestPrint: () => void; printSheet: ReactNode } {
  const [isPrinting, setIsPrinting] = useState(false)

  const requestPrint = useCallback(() => {
    if (audienceSlides(doc).length === 0) {
      useUi.getState().toast({ title: t('slides.print_empty'), tone: 'danger' })
      return
    }
    setIsPrinting(true)
  }, [doc])

  const finish = useCallback(() => {
    setIsPrinting(false)
  }, [])

  return { requestPrint, printSheet: isPrinting ? <SlidesPrintSheet doc={doc} onDone={finish} /> : null }
}

/** Waits for the sheet's own pictures and fonts, then a beat for the paint they triggered. */
async function waitForSheet(root: HTMLElement): Promise<void> {
  const decoded = [...root.querySelectorAll('img')].map((image) =>
    typeof image.decode === 'function' ? image.decode() : Promise.resolve(),
  )
  await settleWithin(
    Promise.allSettled([...decoded, document.fonts?.ready]),
    SHEET_SETTLE_TIMEOUT_MS,
  )
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, SHEET_PAINT_DELAY_MS)
  })
}
