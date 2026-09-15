import { useCallback, useEffect, useRef } from 'react'
import { Expand, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Modal, Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { EXCALIDRAW_FULLSCREEN_CLASS, captureExcalidrawFocus, type ExcalidrawSession } from '../../lib/markdown/excalidraw'

/**
 * Full screen view of one block. Excalidraw brings its own toolbar, properties panel,
 * library, export dialog and key bindings; this overlay adds only what the library
 * cannot know — the way out, and a fit for the board it was handed — and it acts on the
 * same instance the preview mounts, so edits keep writing back to the note exactly as
 * they do inline.
 *
 * This overlay fades in rather than scaling (styles/excalidraw.css): the board measures
 * its canvas from the box it sits in, and a scale animation makes that box read smaller
 * than it is, which it would then keep until something resized the pane.
 *
 * It also insists on covering the window (`min-height: 100dvh` on the panel and on the
 * dialog root that hosts it). The app sizes its overlays from the visible viewport it
 * measured, and a board whose bottom edge stops short of the window shows the note's own
 * furniture — a status bar under a canvas that is meant to be the whole surface.
 */
export function ExcalidrawFullscreen({ session, onClose }: { session: ExcalidrawSession; onClose: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  useOverlaySession(session, bodyRef, onClose)

  // Escape belongs to the board while it owns the keyboard: cancelling a text edit or
  // closing the library's own dialog must not also close the overlay.
  const handleClose = useCallback(() => {
    if (session.isInteracting()) return
    onClose()
  }, [onClose, session])

  return (
    <Modal open onClose={handleClose} variant='fullscreen' ariaLabel={t('preview.excalidraw')} className={EXCALIDRAW_FULLSCREEN_CLASS} bodyClassName='excalidraw-fullscreen-body'>
      <header className='excalidraw-fullscreen-head'>
        <div className='min-w-0'>
          <h2 className='truncate text-[length:var(--text-15)] font-semibold tracking-[var(--tracking-title)] text-[var(--text-primary)]'>{t('preview.excalidraw')}</h2>
          <p className='text-[length:var(--text-12)] text-[var(--text-secondary)]'>
            {session.isEditable() ? t('preview.excalidraw_hint') : t('preview.excalidraw_readonly')}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <Tooltip label={t('preview.excalidraw_fit')}>
            <IconButton label={t('preview.excalidraw_fit')} size='sm' onClick={() => session.fit()}><Expand size={15} /></IconButton>
          </Tooltip>
          <Tooltip label={t('preview.excalidraw_exit_fullscreen')} combo='escape'>
            <IconButton label={t('preview.excalidraw_exit_fullscreen')} size='sm' onClick={onClose}><X size={15} /></IconButton>
          </Tooltip>
        </div>
      </header>
      <div ref={bodyRef} className='excalidraw-fullscreen-stage' />
    </Modal>
  )
}

/**
 * Moves the live board into the overlay and back — the element, never a copy — so the
 * camera, the selection and the undo stack carry over. The modal is portaled outside
 * the preview host, so the canvas needs its own pointer listener here.
 */
function useOverlaySession(session: ExcalidrawSession, bodyRef: React.RefObject<HTMLDivElement | null>, onClose: () => void): void {
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    session.moveInto(body)
    session.focus()
    const releaseFocusCapture = captureExcalidrawFocus(body)
    return () => {
      releaseFocusCapture()
      session.moveBack()
    }
  }, [session, bodyRef, onClose])
}
