import { useCallback, useState } from 'react'
import { buildDeckPages, type DeckExportProgress, type DeckPrintPage } from './deck-print'
import type { SlidePlan } from './slide-pagination'
import type { StageMetrics } from './slide-stage'

// Exporting a deck is the same pages read out two ways: printed, and rasterized to images. Both
// exports slice the whole deck against the measured plans, which is not work the show should do on
// the chance that someone exports it — so the pages are only built when they are asked for, and
// holding them is also what tells the overlay to mount the export sheet.

/** One export sheet's pages, and what tears it down when it is done with them. */
export interface DeckSheetPayload {
  pages: DeckPrintPage[]
  metrics: StageMetrics
  dark: boolean
  done: () => void
}

export interface DeckExportOptions {
  deck: string[]
  cacheKeys: string[]
  plans: Record<number, SlidePlan>
  metrics: StageMetrics
  externalImages: boolean
  /** The theme the deck was measured in: a chart's axes are drawn for it. */
  dark: boolean
  title: string
}

export interface DeckExports {
  exportDeck: () => void
  print: DeckSheetPayload | null
  exportImages: () => void
  images: (DeckSheetPayload & { title: string; onProgress: (progress: DeckExportProgress) => void }) | null
  /** Which page of the deck the image export is writing, or null while nothing is being written. The
   * show paints this itself: the sheet it counts is laid out off-screen, so a status layer held beside
   * that sheet sits under the projector — see `DeckExportProgress`. */
  imageProgress: DeckExportProgress | null
}

export function useDeckExport(options: DeckExportOptions): DeckExports {
  const { deck, cacheKeys, plans, metrics, externalImages, dark, title } = options
  // The kind of export is part of what is held: both sheets read the same pages, so holding the
  // pages alone would mount the printed deck and the image deck at the same time and export both.
  const [request, setRequest] = useState<{ kind: 'print' | 'images'; pages: DeckPrintPage[] } | null>(null)
  const [imageProgress, setImageProgress] = useState<DeckExportProgress | null>(null)
  // The count starts at zero pages rather than staying absent until the first PNG lands: a deck that
  // takes a beat to begin drawing would otherwise give no sign that the press was heard at all.
  const build = useCallback(
    (kind: 'print' | 'images') => {
      const pages = buildDeckPages(deck, cacheKeys, plans, metrics, externalImages)
      setImageProgress(kind === 'images' ? { current: 0, total: pages.length } : null)
      setRequest({ kind, pages })
    },
    [deck, cacheKeys, plans, metrics, externalImages],
  )
  const done = useCallback(() => {
    setImageProgress(null)
    setRequest(null)
  }, [])
  const onProgress = useCallback((progress: DeckExportProgress) => setImageProgress(progress), [])
  const print = request?.kind === 'print' ? { pages: request.pages, metrics, dark, done } : null
  const images = request?.kind === 'images' ? { pages: request.pages, metrics, dark, title, done, onProgress } : null
  return { exportDeck: () => build('print'), exportImages: () => build('images'), print, images, imageProgress }
}
