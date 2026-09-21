import type { ShareStaleLink } from '@shared/types'
import { confirm } from '../../components/overlay'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import type { ShareStoreState } from './share-store'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long ago the listed link was last read, in whole days; null when nobody ever opened it.
 * The card and any test read the same number off the same function rather than each rounding the
 * difference its own way.
 */
export function daysSinceVisit(lastViewedAt: number | null, now = Date.now()): number | null {
  if (lastViewedAt === null) return null
  return Math.max(0, Math.floor((now - lastViewedAt) / DAY_MS))
}

/**
 * SH-70's one action: pause the quiet links. It pauses exactly the rows the card listed — not
 * "everything stale", which the card may only be showing five of — so the confirmation states that
 * count rather than offering a number nobody can check. Pausing is reversible, hence no danger tone.
 */
export async function pauseStaleLinksFlow(params: {
  items: ShareStaleLink[]
  batchToggle: ShareStoreState['batchToggle']
  toast: UiState['toast']
  reload: () => void | Promise<void>
}): Promise<void> {
  const { items, batchToggle, toast, reload } = params
  if (items.length === 0) return
  const ok = await confirm({
    title: t('share.stale_pause_confirm_title', { count: items.length }),
    description: t('share.stale_pause_confirm_desc'),
    confirmLabel: t('share.stale_pause_action'),
  })
  if (!ok) return
  // A failure already reaches the person through the store's own notification; returning here
  // keeps this from claiming a pause that did not happen.
  const paused = await batchToggle('disable', items.map((item) => item.noteId))
  if (!paused) return
  toast({ title: t('share.stale_pause_success', { count: items.length }), tone: 'success' })
  // The card's own rows are the paused links, so it has to be re-read rather than assumed empty.
  await reload()
}
