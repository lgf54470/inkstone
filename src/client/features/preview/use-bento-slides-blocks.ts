import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  destroyBentoSlides,
  flushBentoSlides,
  mountBentoSlides,
  openSlidesSession,
  type SlidesSession,
} from '../../lib/markdown/slides'
import { t, useLocale } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { createSlidesWriter } from './slides-sync'

export interface SlidesFullscreenState {
  session: SlidesSession
}

interface UseBentoSlidesBlocksOptions {
  scope: string
  noteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
  dark: boolean
}

export function useBentoSlidesBlocks(options: UseBentoSlidesBlocksOptions) {
  const { scope, noteId, hostRef, committedHtml, dark } = options
  const locale = useLocale()
  const writer = useMemo(() => createSlidesWriter(noteId), [noteId])
  const [fullscreen, setFullscreen] = useState<SlidesFullscreenState | null>(null)

  const openFullscreen = useCallback((node: HTMLElement) => {
    const session = openSlidesSession(node)
    if (session) setFullscreen({ session })
  }, [])

  const notifyBodyRewritten = useCallback(() => {
    useUi.getState().toast({ title: t('preview.slides_body_rewritten') })
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
    void mountBentoSlides(host, {
      scope,
      noteId,
      dark,
      locale,
      editable: true,
      writeBack: writer,
      onOpenFullscreen: openFullscreen,
      onNotice: notifyBodyRewritten,
    }).catch((err: unknown) => {
      console.warn('[inkstone] bento slides mount failed', err)
    })
  }, [committedHtml, dark, locale, noteId, scope, writer, hostRef, openFullscreen, notifyBodyRewritten])

  useSlidesTeardown(scope, setFullscreen)

  return { fullscreen, openFullscreen, closeFullscreen }
}

function useSlidesTeardown(
  scope: string,
  setFullscreen: Dispatch<SetStateAction<SlidesFullscreenState | null>>,
): void {
  useEffect(() => {
    return () => {
      flushBentoSlides(scope)
      destroyBentoSlides(scope)
      setFullscreen(null)
    }
  }, [scope, setFullscreen])
}
