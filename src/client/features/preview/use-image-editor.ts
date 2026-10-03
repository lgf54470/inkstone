import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useUi } from '../../store/ui'
import {
  clearImageEditor,
  handleImageFocusIn,
  handleImageFocusOut,
  mountImageEditor,
  registerImageEditorApi,
} from './image-editor'

interface UseImageEditorOptions {
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
  noteId: string | null
}

/**
 * Keeps the image controls alive across the re-render that using them causes. The host element is
 * the prose root and survives every commit, so it is what the editor's API is registered against
 * and where focus is watched; the overlay itself is rebuilt from the committed markup.
 */
export function useImageEditor(options: UseImageEditorOptions): void {
  const { hostRef, committedHtml, noteId } = options
  const noteIdRef = useRef(noteId)
  noteIdRef.current = noteId

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    registerImageEditorApi(host, {
      noteId: () => noteIdRef.current,
      preview: (src, alt) => useUi.getState().setLightbox({ src, alt }),
      toast: (toast) => useUi.getState().toast(toast),
    })
    mountImageEditor(host)
  }, [hostRef, committedHtml])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.addEventListener('focusin', handleImageFocusIn)
    host.addEventListener('focusout', handleImageFocusOut)
    return () => {
      host.removeEventListener('focusin', handleImageFocusIn)
      host.removeEventListener('focusout', handleImageFocusOut)
      clearImageEditor()
    }
  }, [hostRef])
}
