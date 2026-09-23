import { ImageOff } from 'lucide-react'
import { t, useLocaleRepaint } from '../../../i18n'
import { isCrossOriginUrl } from '../../external-images'
import { useSession } from '../../../../store/session'

/**
 * Whether a URL on another origin the board is about to *use* may be used. Reads the account's live
 * setting through the store rather than a snapshot, so switching `preview.externalImages` in the
 * settings dialog repaints the covers already on screen instead of waiting for a reload, and asks the
 * renderer's own predicate rather than a copy of it.
 *
 * `fetch`ing a text attachment is one of those uses, not a separate question: a cross-origin read is
 * a request to whoever wrote the fence, so it leaks the reader's IP and user agent exactly like a
 * pixel does — the same trade, so the same switch. Only a *user-initiated* hop (the new-tab link, the
 * download) is left alone, because that one is the reader's own click rather than the app's.
 */
export function useKanbanImageAllowed(url: string): boolean {
  const externalImages = useSession((state) => state.settings.preview.externalImages)
  return externalImages || !isCrossOriginUrl(url)
}

/**
 * What takes an image's place when the policy above says no. It names the same message the prose
 * placeholder names, so a reader meets one explanation of the block wherever the URL came from, and
 * it says so out loud rather than drawing a broken image or an empty box — unlike prose, a board has
 * no text around a cover to explain the gap.
 */
export function KanbanBlockedImage({ className }: { className?: string }) {
  useLocaleRepaint()
  return (
    <div
      data-kanban-image-blocked
      className={`flex items-center justify-center gap-1.5 bg-[var(--bg-inset)] text-[var(--text-tertiary)] ${className ?? ''}`}
    >
      <ImageOff size={13} aria-hidden='true' />
      <span className='truncate text-[length:var(--text-11)]'>{t('markdown.external_image_blocked')}</span>
    </div>
  )
}

/**
 * The same block for a file rather than a picture, and it needs its own words: reading a text
 * attachment is a *request* to that server, and the message above would name the wrong thing (there is
 * no image here). It says what the download and new-tab actions still let the reader do on purpose — the
 * block is on the app talking to a stranger on the reader's behalf, not on the reader choosing to go.
 */
export function KanbanBlockedFile({ className }: { className?: string }) {
  useLocaleRepaint()
  return (
    <div
      data-kanban-file-blocked
      className={`flex flex-col items-center justify-center gap-1.5 bg-[var(--bg-inset)] text-center text-[var(--text-tertiary)] ${className ?? ''}`}
    >
      <ImageOff size={20} aria-hidden='true' />
      <span className='text-[length:var(--text-12)]'>{t('preview.kanban_external_file_blocked')}</span>
    </div>
  )
}
