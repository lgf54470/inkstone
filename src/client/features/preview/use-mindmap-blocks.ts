import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  captureMindmapFocus,
  destroyMindmaps,
  flushMindmaps,
  mountMindmaps,
  openMindmapSession,
  type MindmapSession,
} from '../../lib/markdown/mindmap'
import { useLocale } from '../../lib/i18n'
import { createMindmapWriter } from './mindmap-sync'

export interface MindmapFullscreenState {
  session: MindmapSession
}

interface UseMindmapBlocksOptions {
  scope: string
  noteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
  dark: boolean
}

/**
 * Mounts a live mind map per block after each commit and keeps them out of the
 * preview's way: the map's element is re-parented into the fresh markup before
 * paint, so typing in the editor never restarts a map.
 */
export function useMindmapBlocks(options: UseMindmapBlocksOptions) {
  const { scope, noteId, hostRef, committedHtml, dark } = options
  const locale = useLocale()
  const writer = useMemo(() => createMindmapWriter(noteId), [noteId])
  const [fullscreen, setFullscreen] = useState<MindmapFullscreenState | null>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    void mountMindmaps(host, { scope, noteId, dark, locale, editable: true, writeBack: writer }).catch((err: unknown) => {
      // Per-block failures render their own error banner; this only catches a
      // wholesale failure such as a detached host.
      console.warn('[inkstone] mind map mount failed', err)
    })
  }, [committedHtml, dark, locale, noteId, scope, writer, hostRef])

  useMindmapTeardown(scope, setFullscreen)
  useMindmapPointerFocus(hostRef, committedHtml)

  const openFullscreen = useCallback((node: HTMLElement) => {
    const session = openMindmapSession(node)
    if (session) setFullscreen({ session })
  }, [])

  const closeFullscreen = useCallback(() => {
    setFullscreen((current) => {
      current?.session.moveBack()
      current?.session.flush()
      return null
    })
  }, [])

  return { fullscreen, openFullscreen, closeFullscreen }
}

/** Leaving the note (or the pane) writes the last edit and drops the instances. */
function useMindmapTeardown(scope: string, setFullscreen: Dispatch<SetStateAction<MindmapFullscreenState | null>>): void {
  useEffect(() => {
    return () => {
      flushMindmaps(scope)
      destroyMindmaps(scope)
      setFullscreen(null)
    }
  }, [scope, setFullscreen])
}

/**
 * Clicking a node hands the map the DOM focus its shortcuts need — in a split
 * view the editor would otherwise swallow Tab, Delete and undo. The full screen
 * overlay is portaled outside this host, so it installs its own listener on the
 * modal body; both resolve the same entry and focus twice is harmless.
 */
function useMindmapPointerFocus(hostRef: RefObject<HTMLDivElement | null>, committedHtml: string): void {
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    return captureMindmapFocus(host)
  }, [hostRef, committedHtml])
}
