import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  destroyKanbans,
  flushKanbans,
  mountKanbans,
  openKanbanSession,
  type KanbanSession,
} from '../../lib/markdown/kanban'
import { createKanbanWriter } from './kanban-sync'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { useSession } from '../../store/session'

export interface KanbanFullscreenState {
  session: KanbanSession
}

interface UseKanbanBlocksOptions {
  scope: string
  noteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
}

/**
 * Runs a card description through the very renderer the note body uses, so the preview is the note's
 * own surface rather than a second markdown implementation. Module-level and therefore stable: the
 * board root is memoized, and a fresh closure per render would repaint every mounted board.
 */
function renderKanbanDescription(source: string): string {
  const externalImages = useSession.getState().settings.preview.externalImages
  return renderMarkdown(source, { externalImages, hideFrontMatter: true }).html
}

export function useKanbanBlocks(options: UseKanbanBlocksOptions) {
  const { scope, noteId, hostRef, committedHtml } = options
  const writer = useMemo(() => createKanbanWriter(noteId), [noteId])
  const [fullscreen, setFullscreen] = useState<KanbanFullscreenState | null>(null)

  const openFullscreen = useCallback((node: HTMLElement) => {
    const session = openKanbanSession(node)
    if (session) setFullscreen({ session })
  }, [])

  const closeFullscreen = useCallback(() => {
    // The overlay's own cleanup moves the canvas back and flushes the session;
    // this only takes the modal out of the tree.
    setFullscreen(null)
  }, [])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    void mountKanbans(host, {
      scope,
      noteId,
      editable: true,
      writeBack: writer,
      onOpenFullscreen: openFullscreen,
      onCloseFullscreen: closeFullscreen,
      renderDescription: renderKanbanDescription,
    }).catch((err: unknown) => {
      console.warn('[inkstone] kanban mount failed', err)
    })
  }, [committedHtml, noteId, scope, writer, hostRef, openFullscreen, closeFullscreen])

  useKanbanTeardown(scope, setFullscreen)

  return { fullscreen, openFullscreen, closeFullscreen }
}

function useKanbanTeardown(
  scope: string,
  setFullscreen: Dispatch<SetStateAction<KanbanFullscreenState | null>>,
): void {
  useEffect(() => {
    return () => {
      flushKanbans(scope)
      destroyKanbans(scope)
      setFullscreen(null)
    }
  }, [scope, setFullscreen])
}
