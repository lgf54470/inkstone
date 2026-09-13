import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react'
import { t } from '../../lib/i18n'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { destroyChartInstances, enhancePreview, renderChartJs, renderPendingMermaid } from '../../lib/markdown/enhance'
import { IconButton } from '../../components/primitives'
import { Tooltip, useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { useSession } from '../../store/session'
import { splitIntoSlides } from './slides'

// Slide canvases are laid out at a fixed 16:9 design size and scaled to the stage,
// so proportions stay stable from phone to projector (same approach as reveal.js).
const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720

export interface PresentationOverlayProps {
  open: boolean
  onClose: () => void
  content: string
  noteTitle: string
}

export function PresentationOverlay({ open, onClose, content, noteTitle }: PresentationOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const deck = useMemo(() => splitIntoSlides(content), [content])
  const { index, goNext, goPrev, jumpTo } = useDeckIndex(deck.length)
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle(open, panelRef)
  const scale = useStageScale(stageRef)
  useEscape(open, onClose)
  useLockScroll(open)
  useDialogFocus(open, panelRef)
  usePresentationKeys(open, deck.length, goNext, goPrev, jumpTo, toggleFullscreen)

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      role='dialog'
      aria-modal='true'
      aria-label={t('workspace.presentation_mode')}
      className='app-viewport-fixed anim-fade fixed inset-0 z-[var(--z-modal)] flex flex-col bg-[var(--bg-base)] outline-none'
    >
      <div ref={stageRef} className='flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6'>
        <div
          className='shrink-0 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-editor)] shadow-[var(--shadow-modal)]'
          style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})` }}
        >
          <div key={index} className='anim-fade h-full overflow-y-auto px-14 py-10'>
            <SlideView source={deck[index] ?? ''} noteContent={content} noteTitle={noteTitle} />
          </div>
        </div>
      </div>
      <PresentationControls
        slideIndex={index}
        slideCount={deck.length}
        isFullscreen={isFullscreen}
        goNext={goNext}
        goPrev={goPrev}
        toggleFullscreen={toggleFullscreen}
        onClose={onClose}
      />
      <div className='pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[var(--border-subtle)]' aria-hidden='true'>
        <div className='h-full bg-[var(--accent)]' style={{ width: `${Math.round(((index + 1) / deck.length) * 100)}%` }} />
      </div>
    </div>,
    document.body,
  )
}

function useDeckIndex(deckLength: number) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    setIndex((current) => Math.min(current, deckLength - 1))
  }, [deckLength])
  const goNext = useCallback(() => {
    setIndex((current) => Math.min(current + 1, deckLength - 1))
  }, [deckLength])
  const goPrev = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0))
  }, [])
  const jumpTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(next, deckLength - 1)))
  }, [deckLength])
  return { index: Math.min(index, deckLength - 1), goNext, goPrev, jumpTo }
}

function useFullscreenToggle(open: boolean, panelRef: RefObject<HTMLDivElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = useCallback(() => {
    const request = document.fullscreenElement ? document.exitFullscreen() : panelRef.current?.requestFullscreen()
    if (request) request.catch((err) => console.debug('[inkstone] fullscreen request rejected', err))
  }, [panelRef])
  useEffect(() => {
    if (!open) return
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [open])
  return { isFullscreen, toggleFullscreen }
}

function usePresentationKeys(open: boolean, deckLength: number, goNext: () => void, goPrev: () => void, jumpTo: (next: number) => void, toggleFullscreen: () => void) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const onControl = Boolean(target?.closest('button, a, input, select, textarea, [contenteditable="true"]'))
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          if (onControl) return
          event.preventDefault()
          goNext()
          return
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          if (onControl) return
          event.preventDefault()
          goPrev()
          return
        case 'Home':
          event.preventDefault()
          jumpTo(0)
          return
        case 'End':
          event.preventDefault()
          jumpTo(deckLength - 1)
          return
        case 'f':
        case 'F':
          if (!onControl) {
            event.preventDefault()
            toggleFullscreen()
          }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, deckLength, goNext, goPrev, jumpTo, toggleFullscreen])
}

// Only the active slide stays mounted: Chart.js measures its canvas box, so
// display-none slides would render broken charts.
function SlideView({ source, noteContent, noteTitle }: { source: string; noteContent: string; noteTitle: string }) {
  const preview = useSession((s) => s.settings.preview)
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  const dark = useIsDarkTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const rendered = useMemo(
    () => renderMarkdown(source, { externalImages: preview.externalImages, hideFrontMatter: true }),
    [source, preview.externalImages],
  )
  const [html, setHtml] = useState(rendered.html)

  useEffect(() => {
    let cancelled = false
    const staging = document.createElement('div')
    staging.innerHTML = rendered.html
    const prepare = async () => {
      if (rendered.hasEmbeds) {
        await resolveNoteEmbeds(staging, { currentContent: noteContent, currentTitle: noteTitle, isCurrent: () => !cancelled })
      }
      await enhancePreview(staging, { math: preview.math, mermaid: preview.mermaid, dark, codeBlockCollapseLines: 0 })
      if (!cancelled) setHtml(staging.innerHTML)
    }
    void prepare()
    return () => {
      cancelled = true
    }
  }, [rendered, noteContent, noteTitle, preview.math, preview.mermaid, dark])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    void renderPendingMermaid(host, dark)
    void renderChartJs(host, dark)
    return () => destroyChartInstances(host)
  }, [html, dark])

  return (
    <div className='ink-preview-container' data-font={proseFont}>
      <div ref={hostRef} data-font={proseFont} className='ink-prose' dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function PresentationControls({ slideIndex, slideCount, isFullscreen, goNext, goPrev, toggleFullscreen, onClose }: {
  slideIndex: number
  slideCount: number
  isFullscreen: boolean
  goNext: () => void
  goPrev: () => void
  toggleFullscreen: () => void
  onClose: () => void
}) {
  const fullscreenLabel = isFullscreen ? t('workspace.presentation_exit_fullscreen') : t('workspace.presentation_fullscreen')
  return (
    <div className='absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'>
      <Tooltip label={t('workspace.presentation_prev')} side='top'>
        <IconButton label={t('workspace.presentation_prev')} size='sm' onClick={goPrev} disabled={slideIndex === 0}>
          <ChevronLeft size={15} />
        </IconButton>
      </Tooltip>
      <span aria-live='polite' className='tabular min-w-14 text-center text-[length:var(--text-12)] text-[var(--text-secondary)]'>
        {slideIndex + 1} / {slideCount}
      </span>
      <Tooltip label={t('workspace.presentation_next')} side='top'>
        <IconButton label={t('workspace.presentation_next')} size='sm' onClick={goNext} disabled={slideIndex === slideCount - 1}>
          <ChevronRight size={15} />
        </IconButton>
      </Tooltip>
      <span className='mx-1 h-4 w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <Tooltip label={fullscreenLabel} side='top'>
        <IconButton label={fullscreenLabel} size='sm' onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={t('workspace.presentation_exit')} side='top'>
        <IconButton label={t('workspace.presentation_exit')} size='sm' onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function useStageScale(stageRef: RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 }
      if (width < 1 || height < 1) return
      setScale(Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT))
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stageRef])
  return scale
}

function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(() => (document.documentElement.dataset.theme ?? 'dark') === 'dark')
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark((document.documentElement.dataset.theme ?? 'dark') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
}
