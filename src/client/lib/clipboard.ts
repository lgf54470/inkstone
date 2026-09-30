import { t } from './i18n'
import type { UiState } from '../store/ui'

/**
 * The clipboard is the one browser API this app writes to that can refuse: an insecure origin, a
 * denied permission, or no API at all. Each copy point used to answer a refusal its own way — an
 * inline check mark that never appeared, or a `void` with no message — so the reader saw "nothing
 * happened". One helper now says what happened in both directions: the success title the caller
 * chooses, and the shared failure sentence.
 */
export async function copyText(
  text: string,
  toast: UiState['toast'],
  successTitle?: string,
): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    toast({ title: successTitle ?? t('common.copied'), tone: 'success' })
    return true
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
    return false
  }
}
