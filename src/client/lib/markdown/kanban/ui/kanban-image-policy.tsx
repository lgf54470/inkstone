import { ImageOff } from 'lucide-react'
import { t, useLocaleRepaint } from '../../../i18n'
import { isExternalImageUrl } from '../../external-images'
import { useSession } from '../../../../store/session'

/**
 * Whether an image the board is about to paint may load. Reads the account's live setting through the
 * store rather than a snapshot, so switching `preview.externalImages` in the settings dialog repaints
 * the covers already on screen instead of waiting for a reload, and asks the renderer's own predicate
 * rather than a copy of it.
 */
export function useKanbanImageAllowed(url: string): boolean {
  const externalImages = useSession((state) => state.settings.preview.externalImages)
  return externalImages || !isExternalImageUrl(url)
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
