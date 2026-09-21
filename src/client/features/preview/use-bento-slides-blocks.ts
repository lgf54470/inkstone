import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
  type SlidesWriter,
} from '../../lib/markdown/slides'
import { t, useLocale } from '../../lib/i18n'
import { registerFenceBodies, type FenceBodies } from '../../lib/markdown/fence-bodies'
import { useUi } from '../../store/ui'
import { createSlidesWriter } from './slides-sync'

export interface SlidesFullscreenState {
  session: SlidesSession
  /** Every edit has reached the note; false while one is still waiting for its write. */
  isSaved: boolean
}

interface UseBentoSlidesBlocksOptions {
  scope: string
  noteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
  /**
   * The fence bodies this markup was rendered from (P-01), registered on the host before mount. Also a
   * mount trigger: a body-only edit leaves the markup string identical.
   */
  fences: FenceBodies
  dark: boolean
}

export function useBentoSlidesBlocks(options: UseBentoSlidesBlocksOptions) {
  const { scope, noteId, hostRef, committedHtml, fences, dark } = options
  const locale = useLocale()
  const writer = useMemo(() => createSlidesWriter(noteId), [noteId])
  const fullscreen = useSlidesFullscreen()

  useSlidesMount({
    scope,
    noteId,
    hostRef,
    committedHtml,
    fences,
    dark,
    locale,
    writer,
    onOpenFullscreen: fullscreen.openFullscreen,
    onNotice: fullscreen.notifyBodyRewritten,
    onPendingChange: fullscreen.trackPendingChange,
  })
  useSlidesTeardown(scope, fullscreen.setOpen, fullscreen.openKeyRef)

  return fullscreen
}

/** Fullscreen session state: which block is open, whether its edits have reached the note, and the actions the topbar drives. */
function useSlidesFullscreen() {
  const [open, setOpen] = useState<SlidesSession | null>(null)
  const [isSaved, setIsSaved] = useState(true)
  // The mount effect wires the callbacks once, so they read the open block's key from a
  // ref rather than from a closure that would still name the block opened at mount time.
  const openKeyRef = useRef<string | null>(null)

  const openFullscreen = useCallback((node: HTMLElement) => {
    const session = openSlidesSession(node)
    if (!session) return
    openKeyRef.current = session.key
    setIsSaved(!session.isDirty())
    setOpen(session)
  }, [])

  const notifyBodyRewritten = useCallback(() => {
    useUi.getState().toast({ title: t('preview.slides_body_rewritten') })
  }, [])

  const trackPendingChange = useCallback((key: string, pending: boolean) => {
    if (key === openKeyRef.current) setIsSaved(!pending)
  }, [])

  const saveNow = useCallback(() => {
    if (!open) return
    const result = open.flush()
    if (result === 'written' || result === null) useUi.getState().toast({ title: t('slides.saved') })
  }, [open])

  const closeFullscreen = useCallback(() => {
    setOpen((current) => {
      openKeyRef.current = null
      current?.moveBack()
      current?.flush()
      return null
    })
  }, [])

  return {
    fullscreen: open ? { session: open, isSaved } : null,
    openFullscreen,
    saveNow,
    closeFullscreen,
    notifyBodyRewritten,
    trackPendingChange,
    openKeyRef,
    setOpen,
  }
}

interface SlidesMountParams {
  scope: string
  noteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  committedHtml: string
  fences: FenceBodies
  dark: boolean
  locale: ReturnType<typeof useLocale>
  writer: SlidesWriter
  onOpenFullscreen: (node: HTMLElement) => void
  onNotice: () => void
  onPendingChange: (key: string, pending: boolean) => void
}

function useSlidesMount(params: SlidesMountParams): void {
  const { scope, noteId, hostRef, committedHtml, fences, dark, locale, writer } = params
  const { onOpenFullscreen, onNotice, onPendingChange } = params

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    registerFenceBodies(host, fences)
    void mountBentoSlides(host, {
      scope,
      noteId,
      dark,
      locale,
      editable: true,
      writeBack: writer,
      onOpenFullscreen,
      onNotice,
      onPendingChange,
    }).catch((err: unknown) => {
      console.warn('[inkstone] bento slides mount failed', err)
    })
  }, [committedHtml, fences, dark, locale, noteId, scope, writer, hostRef, onOpenFullscreen, onNotice, onPendingChange])
}

function useSlidesTeardown(
  scope: string,
  setOpen: Dispatch<SetStateAction<SlidesSession | null>>,
  openKeyRef: RefObject<string | null>,
): void {
  useEffect(() => {
    return () => {
      flushBentoSlides(scope)
      destroyBentoSlides(scope)
      openKeyRef.current = null
      setOpen(null)
    }
  }, [scope, setOpen, openKeyRef])
}
