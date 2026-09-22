import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import type { ShareInfo } from '@shared/types'
import { normalizeChannelToken, withChannelParam } from '@shared/share-channel'
import { settleWithin } from '../../lib/async'
import { t } from '../../lib/i18n'
import { QR_BG_COLOR, QR_FG_COLOR } from '../../lib/qr-colors'
import { fullTime } from '../../lib/time'

/**
 * The selected links as paper: one code per share, each under the note it opens, laid out off-screen
 * for the browser's own print pipeline (SH-69) — so a batch of links can be handed to a room, or
 * saved as a PDF, without a screenshot in between. The codes are the same encoding the single-link
 * panel draws, and the URL under each one is the marked URL the batch's copy and export actions
 * hand out.
 *
 * Two pieces of this live outside the file, and both fail in the same quiet direction — a blank page
 * — so they are named here. `styles/share.css` holds the layout: white paper and near-black ink
 * rather than the themed tokens (a code needs black on white, and a dark page would spend its error
 * correction on the page around it), three cells to a row, cell kept whole across a page break
 * because a code split from the name under it is a code nobody can place, and a 12mm print margin on
 * whatever paper the reader has loaded — unlike a deck page, whose size is the design, a sheet of
 * codes is asked for on the printer that is there. `styles/presentation.css` holds the allowlist that
 * lets this sheet through the print pipeline alone: it hides every other child of the body, the app
 * root included, so a sheet the list forgot to name prints nothing at all.
 */

/** Everything on the sheet has to be drawn before the dialog blocks the thread; fonts are all it waits for. */
const SHEET_SETTLE_TIMEOUT_MS = 3000
/** A last beat on the main thread: a sheet the browser accepted but has not painted would reach the paper empty. */
const SHEET_PAINT_DELAY_MS = 250
/**
 * One code, in CSS pixels. The single-link panel draws 220px for a code read off a screen at arm's
 * length; a printed code is read from further away, and this one prints at roughly 42mm — three to a
 * row with about 20mm between them, and well above what a phone camera needs. The number is measured
 * rather than chosen for looking right: at 160px an A4 page with the 12mm margin holds four rows, a
 * dozen links, while the 180px the panel's proportions would suggest fits three and prints the
 * fourth row alone on a second sheet. Letter's shorter page holds three either way, which is why the
 * sheet is made to flow across pages rather than to fit a count.
 */
const SHEET_QR_SIZE = 160

/** One entry on the sheet: the code, and the two names a reader can match it against. */
export interface QrSheetEntry {
  noteId: string
  title: string
  url: string
}

/**
 * The rows as the sheet prints them, marker included. Kept out of the component because these two
 * facts — which code, and which URL that code encodes — are what a test can hold still; the layout
 * that follows is the browser's business. A relative share URL is resolved against the current
 * origin the way the single-link panel resolves it, because a QR code carries an absolute URL or it
 * carries nothing.
 */
export function buildQrSheetEntries(rows: ShareInfo[], channel: string): QrSheetEntry[] {
  return rows.map((row) => ({
    noteId: row.noteId,
    title: row.noteTitle || row.slug,
    url: absoluteShareUrl(withChannelParam(row.url, channel)),
  }))
}

function absoluteShareUrl(url: string): string {
  if (typeof window === 'undefined') return url
  try {
    return new URL(url, window.location.origin).href
  }
  catch (error: unknown) {
    // Best-effort: the marker is already on the string, and a URL the browser cannot parse is
    // printed as it stands — an odd line under a code is a better failure than a code that encodes
    // nothing, or an empty sheet with no explanation.
    console.warn('[share] a share URL could not be resolved for the QR sheet', error)
    return url
  }
}

/**
 * The marker line, when the bar's field holds a token that actually rides on these codes. A value
 * `withChannelParam` would refuse prints as nothing: the sheet states what its codes carry, and
 * claiming a marker that is not on them would make every scan of the sheet look attributed when
 * none of them is.
 */
export function qrSheetChannelLabel(channel: string): string | null {
  const token = normalizeChannelToken(channel)
  return token ? t('share.qr_sheet_channel', { value: token }) : null
}

interface ShareQrSheetProps {
  rows: ShareInfo[]
  /** The batch bar's `?ref=` field; a value the links would refuse is reported as absent. */
  channel: string
  /**
   * Selected shares the list no longer holds. Printed on the sheet rather than reported in a toast,
   * because the toast would be covered by the print dialog this sheet opens — and a sheet that
   * silently lost rows would look complete.
   */
  missing: number
  onDone: () => void
}

/**
 * The sheet itself: off-screen and out of the tab order, handed to the browser once it is drawn.
 * Nothing inside it has to be decoded — the renderer draws the codes as SVG it already has — so the
 * wait is the app's webfonts and a beat for the paint they trigger.
 */
export function ShareQrSheet({ rows, channel, missing, onDone }: ShareQrSheetProps) {
  const entries = buildQrSheetEntries(rows, channel)
  const channelLabel = qrSheetChannelLabel(channel)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      // Same wait as the other print sheets, in the same shape: the fonts the codes' labels are set
      // in, bounded so a font that never settles costs the type, not the sheet.
      await settleWithin(Promise.allSettled([document.fonts?.ready]), SHEET_SETTLE_TIMEOUT_MS)
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, SHEET_PAINT_DELAY_MS)
      })
      if (!cancelled) window.print()
    }
    window.addEventListener('afterprint', onDone)
    void run()
    return () => {
      cancelled = true
      window.removeEventListener('afterprint', onDone)
    }
  }, [onDone])

  return createPortal(
    <div data-share-qr-sheet aria-hidden='true' inert className='share-qr-sheet'>
      <header>
        <h1 className='share-qr-sheet-title'>{t('share.qr_sheet_title')}</h1>
        <p className='share-qr-sheet-meta'>{t('share.qr_sheet_count', { count: entries.length })}</p>
        {channelLabel ? <p className='share-qr-sheet-meta'>{channelLabel}</p> : null}
        {missing > 0 ? <p className='share-qr-sheet-meta'>{t('share.batch_links_missing', { count: missing })}</p> : null}
        <p className='share-qr-sheet-meta'>{t('share.qr_sheet_printed_at', { time: fullTime(Date.now()) })}</p>
      </header>
      <ul className='share-qr-sheet-grid'>
        {entries.map((entry) => (
          <li key={entry.noteId} className='share-qr-sheet-cell'>
            <QRCodeSVG value={entry.url} size={SHEET_QR_SIZE} level='H' marginSize={1} bgColor={QR_BG_COLOR} fgColor={QR_FG_COLOR} />
            <p className='share-qr-sheet-label'>{entry.title}</p>
            <p className='share-qr-sheet-url'>{entry.url}</p>
          </li>
        ))}
      </ul>
      <p className='share-qr-sheet-hint'>{t('share.qr_sheet_hint')}</p>
    </div>,
    document.body,
  )
}

/** What the bar asks for: the same three things the copy and export actions are handed. */
export interface ShareQrSheetRequest {
  rows: ShareInfo[]
  channel: string
  missing: number
}

/**
 * The bar's side of the sheet: the request, and the sheet to render while it prints. Mounted only
 * while a print is in flight — the deck's print sheet is mounted the same way — so nothing about the
 * sheet exists in the document until the owner asks for one, and it goes away when the dialog closes.
 */
export function useShareQrSheet(): {
  requestPrint: (request: ShareQrSheetRequest) => void
  sheet: ReactNode
} {
  const [request, setRequest] = useState<ShareQrSheetRequest | null>(null)
  const requestPrint = useCallback((next: ShareQrSheetRequest) => setRequest(next), [])
  const finish = useCallback(() => setRequest(null), [])
  return { requestPrint, sheet: request ? <ShareQrSheet {...request} onDone={finish} /> : null }
}
