import { memo, useCallback, useState } from 'react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import type { SlidesSession } from '../session'
import type { BentoDoc } from '../types'
import { SlidesRoot } from './slides-root'

interface SlidesFullscreenProps {
  session: SlidesSession
  /** Every edit has reached the note. */
  isSaved: boolean
  onSave: () => void
  onClose: () => void
}

export const SlidesFullscreen = memo(function SlidesFullscreen({
  session,
  isSaved,
  onSave,
  onClose,
}: SlidesFullscreenProps) {
  const initialData = session.getData()
  const [data, setData] = useState<BentoDoc | null>(initialData)

  const handleUpdate = useCallback(
    (next: BentoDoc) => {
      setData(next)
      session.updateData(() => next)
    },
    [session],
  )

  const handleClose = useCallback(() => {
    session.flush()
    onClose()
    // The editor owes the keyboard back to the control it was opened from, and it cannot simply
    // remember it: the write that flushing schedules re-renders the card, so the control is looked up
    // again on the frames that follow the overlay's own focus trap letting go.
    session.focusOpener()
  }, [session, onClose])

  if (!data) return null

  return (
    <Modal
      open
      onClose={handleClose}
      variant='fullscreen'
      ariaLabel={data.title || t('preview.slides_fullscreen')}
      className='bento-slides-fullscreen'
      bodyClassName='bento-slides-fullscreen-body flex flex-1 flex-col overflow-hidden p-0'
    >
      <div className='flex flex-1 flex-col overflow-hidden'>
        <SlidesRoot
          initialData={data}
          isFullscreen
          isSaved={isSaved}
          noteId={session.noteId()}
          onSave={onSave}
          onUpdateData={handleUpdate}
          onToggleFullscreen={handleClose}
        />
      </div>
    </Modal>
  )
})
