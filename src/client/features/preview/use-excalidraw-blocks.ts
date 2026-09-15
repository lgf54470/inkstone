import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  captureExcalidrawContextMenu,
  captureExcalidrawFocus,
  destroyExcalidraws,
  flushExcalidraws,
  mountExcalidraws,
  openExcalidrawSession,
  type ExcalidrawSession,
} from '../../lib/markdown/excalidraw'
import { useLocale } from '../../lib/i18n'
import { createExcalidrawWriter } from './excalidraw-sync'

export interface ExcalidrawFullscreenState {
  session: ExcalidrawSession
}

export interface ExcalidrawLibraryMenuState {
  /** The block whose header button opened the picker; it anchors the menu. */
  node: HTMLElement
}

interface UseExcalidrawBlocksOptions {
  scope: string
  noteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
  dark: boolean
}

/**
 * Mounts a live whiteboard per block after each commit and keeps them out of the
 * preview's way: the board's element is re-parented into the fresh markup before paint,
 * so typing in the editor never restarts a board.
 */
export function useExcalidrawBlocks(options: UseExcalidrawBlocksOptions) {
  const { scope, noteId, hostRef, committedHtml, dark } = options
  const locale = useLocale()
  const writer = useMemo(() => createExcalidrawWriter(noteId), [noteId])
  const [fullscreen, setFullscreen] = useState<ExcalidrawFullscreenState | null>(null)
  const [libraryMenu, setLibraryMenu] = useState<ExcalidrawLibraryMenuState | null>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    void mountExcalidraws(host, { scope, noteId, dark, locale, editable: true, writeBack: writer }).catch((err: unknown) => {
      // Per-block failures render their own error banner; this only catches a
      // wholesale failure such as a detached host.
      console.warn('[inkstone] whiteboard mount failed', err)
    })
  }, [committedHtml, dark, locale, noteId, scope, writer, hostRef])

  useExcalidrawTeardown(scope, setFullscreen, setLibraryMenu)
  useExcalidrawPointerFocus(hostRef, committedHtml)

  const openFullscreen = useCallback((node: HTMLElement) => {
    const session = openExcalidrawSession(node)
    if (session) setFullscreen({ session })
  }, [])

  const closeFullscreen = useCallback(() => {
    setFullscreen((current) => {
      current?.session.moveBack()
      current?.session.flush()
      return null
    })
  }, [])

  const openLibraryMenu = useCallback((node: HTMLElement) => setLibraryMenu({ node }), [])
  const closeLibraryMenu = useCallback(() => setLibraryMenu(null), [])

  return { fullscreen, openFullscreen, closeFullscreen, libraryMenu, openLibraryMenu, closeLibraryMenu }
}

/** Leaving the note (or the pane) writes the last drawing and drops the instances. */
function useExcalidrawTeardown(
  scope: string,
  setFullscreen: Dispatch<SetStateAction<ExcalidrawFullscreenState | null>>,
  setLibraryMenu: Dispatch<SetStateAction<ExcalidrawLibraryMenuState | null>>,
): void {
  useEffect(() => {
    return () => {
      flushExcalidraws(scope)
      destroyExcalidraws(scope)
      setFullscreen(null)
      setLibraryMenu(null)
    }
  }, [scope, setFullscreen, setLibraryMenu])
}

/**
 * Clicking a shape hands the board the DOM focus its shortcuts need — in a split view
 * the editor would otherwise swallow Tab, Delete and undo. The full screen overlay is
 * portaled outside this host, so it installs its own listener on its body; both resolve
 * the same entry and focusing twice is harmless.
 */
function useExcalidrawPointerFocus(hostRef: RefObject<HTMLDivElement | null>, committedHtml: string): void {
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const releaseFocusCapture = captureExcalidrawFocus(host)
    // The note's menu is the one a right-click opens, here as on every other block.
    const releaseContextMenu = captureExcalidrawContextMenu(host)
    return () => {
      releaseFocusCapture()
      releaseContextMenu()
    }
  }, [hostRef, committedHtml])
}
