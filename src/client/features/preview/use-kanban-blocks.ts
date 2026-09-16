import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  destroyKanbans,
  flushKanbans,
  mountKanbans,
  openKanbanSession,
  type KanbanSession,
} from '../../lib/markdown/kanban'
import { useLocale } from '../../lib/i18n'
import { createKanbanWriter } from './kanban-sync'

export interface KanbanFullscreenState {
  session: KanbanSession
}

interface UseKanbanBlocksOptions {
  scope: string
  noteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
  dark: boolean
}

export function useKanbanBlocks(options: UseKanbanBlocksOptions) {
  const { scope, noteId, hostRef, committedHtml, dark } = options
  const locale = useLocale()
  const writer = useMemo(() => createKanbanWriter(noteId), [noteId])
  const [fullscreen, setFullscreen] = useState<KanbanFullscreenState | null>(null)

  const openFullscreen = useCallback((node: HTMLElement) => {
    const session = openKanbanSession(node)
    if (session) setFullscreen({ session })
  }, [])

  const closeFullscreen = useCallback(() => {
    setFullscreen((current) => {
      current?.session.moveBack()
      current?.session.flush()
      return null
    })
  }, [])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    void mountKanbans(host, {
      scope,
      noteId,
      dark,
      locale,
      editable: true,
      writeBack: writer,
      onOpenFullscreen: openFullscreen,
    }).catch((err: unknown) => {
      console.warn('[inkstone] kanban mount failed', err)
    })
  }, [committedHtml, dark, locale, noteId, scope, writer, hostRef, openFullscreen])

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
