import { confirm } from '../../components/overlay'
import { t } from '../../lib/i18n'

// Clearing the queue drops every queued track and stops playback, so both places
// that offer it (the transport popover and the immersive queue panel) ask the
// same question from here rather than each rolling its own.
export async function confirmClearQueue(count: number, clear: () => void): Promise<void> {
  if (count === 0) return
  const accepted = await confirm({
    title: t('music.clear_queue'),
    description: t('music.clear_queue_confirm', { value0: count }),
    confirmLabel: t('music.clear_queue'),
    tone: 'danger',
  })
  if (accepted) clear()
}
