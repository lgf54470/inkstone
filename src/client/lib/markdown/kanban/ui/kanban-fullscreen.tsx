import { memo, useCallback, useState } from 'react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import type { KanbanSession } from '../session'
import type { KanbanData } from '../types'
import { KanbanRoot } from './kanban-root'

interface KanbanFullscreenProps {
  session: KanbanSession
  onClose: () => void
}

export const KanbanFullscreen = memo(function KanbanFullscreen({
  session,
  onClose,
}: KanbanFullscreenProps) {
  const initialData = session.getData()
  const [data, setData] = useState<KanbanData | null>(initialData)

  const handleUpdate = useCallback((next: KanbanData) => {
    setData(next)
    session.updateData(() => next)
  }, [session])

  const handleClose = useCallback(() => {
    session.flush()
    onClose()
  }, [session, onClose])

  if (!data) return null

  return (
    <Modal
      open
      onClose={handleClose}
      variant='fullscreen'
      ariaLabel={data.title || t('preview.kanban_fullscreen')}
      className='kanban-fullscreen'
      bodyClassName='kanban-fullscreen-body flex flex-1 flex-col overflow-hidden p-0'
    >
      <div className='flex flex-1 flex-col overflow-hidden'>
        <KanbanRoot
          initialData={data}
          isFullscreen
          onUpdateData={handleUpdate}
          onToggleFullscreen={handleClose}
        />
      </div>
    </Modal>
  )
})
