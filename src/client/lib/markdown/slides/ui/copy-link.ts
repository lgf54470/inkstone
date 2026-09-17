import { useUi } from '../../../../store/ui'
import { t } from '../../../i18n'

/**
 * Copies the address of the page the deck is open on, which is the link to the note
 * holding it — the app keeps no per-note route, so the address bar is the most
 * specific thing pointing at this note.
 *
 * Copying fails for reasons the reader cannot see: an insecure origin, a denied
 * clipboard permission, a browser without the API at all. Each of those ends in a
 * toast rather than silence, because a copy that quietly did nothing is worse than
 * one that says it did not work — and the failure is logged for whoever has to
 * explain it later.
 */
export async function copySlidesLink(): Promise<boolean> {
  const toast = useUi.getState().toast
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(window.location.href)
    toast({ title: t('slides.share_copied'), tone: 'success' })
    return true
  } catch (error) {
    console.warn('[slides] failed to copy the deck link', error)
    toast({ title: t('slides.share_failed'), tone: 'danger' })
    return false
  }
}
