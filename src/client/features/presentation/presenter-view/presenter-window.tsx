import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Pause, Play, Presentation, RotateCcw } from 'lucide-react'
import type { ProseFont } from '@shared/types'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { IconButton, Spinner } from '../../../components/primitives'
import { Tooltip } from '../../../components/overlay'
import { useSession } from '../../../store/session'
import { SlideProse } from '../slide-prose'
import { renderSlideSource, slicePageHtml, slideMarkup } from '../slide-html'
import type { SlidePlan } from '../slide-pagination'
import { measureStage, SLIDE_PAD_X, SLIDE_PAD_Y, type StageMetrics } from '../slide-stage'
import type { SlideLayout } from '../slides'
import {
  formatClock,
  formatElapsed,
  usePresenterReceiver,
  type PresenterInboundCommand,
  type PresenterSlideState,
} from './use-presenter-channel'

export interface PresenterWindowProps {
  initialState?: PresenterSlideState
  onCommand?: (command: PresenterInboundCommand) => void
}

export function PresenterWindow({ initialState, onCommand }: PresenterWindowProps) {
  const channel = usePresenterReceiver()
  const state = initialState ?? channel.state
  const connected = initialState ? true : channel.connected
  const sendCommand = onCommand ?? channel.sendCommand

  usePresenterKeyNav(sendCommand)

  if (!state) {
    return (
      <div className='flex h-screen flex-col items-center justify-center gap-[var(--sp-3)] bg-[var(--bg-base)] text-[var(--text-secondary)]'>
        <Spinner size={24} />
        <p className='text-[length:var(--text-14)]'>{t('workspace.presentation_disconnected')}</p>
      </div>
    )
  }

  return (
    <div className='flex h-screen flex-col overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)] select-none'>
      <PresenterHeader state={state} connected={connected} sendCommand={sendCommand} />
      <div className='flex min-h-0 flex-1 gap-[var(--sp-3)] p-[var(--sp-3)]'>
        <PresenterCurrentSlidePane state={state} />
        <div className='flex flex-[2] min-w-0 flex-col gap-[var(--sp-3)]'>
          <PresenterNextSlidePane
            nextSource={state.nextSlideSource}
            nextLayout={state.nextLayout}
            nextPlan={state.nextPlan}
            nextSubPage={state.nextSubPage}
            font={state.proseFont}
          />
          <PresenterSpeakerNotesPane notes={state.notes} />
        </div>
      </div>
    </div>
  )
}

function PresenterCurrentSlidePane({ state }: { state: PresenterSlideState }) {
  return (
    <div className='flex flex-[3] min-w-0 flex-col overflow-hidden rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]'>
      <div className='flex items-center justify-between border-b border-[var(--border-subtle)] px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        <span>{t('workspace.presentation_current_slide')}</span>
        <span className='tabular text-[var(--text-tertiary)]'>
          {state.slideIndex + 1} / {state.slideCount}
        </span>
      </div>
      <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--bg-editor)] p-[var(--sp-3)]'>
        <PresenterSlidePreview
          source={state.currentSlideSource}
          layout={state.currentLayout}
          plan={state.currentPlan}
          sub={state.subPage}
          font={state.proseFont}
        />
      </div>
    </div>
  )
}

function PresenterNextSlidePane({
  nextSource,
  nextLayout,
  nextPlan,
  nextSubPage,
  font,
}: {
  nextSource: string | null
  nextLayout?: SlideLayout
  nextPlan?: SlidePlan
  nextSubPage?: number
  font?: ProseFont
}) {
  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]'>
      <div className='border-b border-[var(--border-subtle)] px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        {t('workspace.presentation_next_slide')}
      </div>
      <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--bg-editor)] p-[var(--sp-2)]'>
        {nextSource ? (
          <PresenterSlidePreview
            source={nextSource}
            layout={nextLayout}
            plan={nextPlan}
            sub={nextSubPage}
            font={font}
          />
        ) : (
          <div className='text-[length:var(--text-14)] italic text-[var(--text-tertiary)]'>
            {t('workspace.presentation_end_of_deck')}
          </div>
        )}
      </div>
    </div>
  )
}

function PresenterSpeakerNotesPane({ notes }: { notes: string }) {
  return (
    <div className='flex min-h-0 flex-[1.2] flex-col overflow-hidden rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]'>
      <div className='flex items-center gap-[var(--sp-1)] border-b border-[var(--border-subtle)] px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        <FileText size={13} />
        <span>{t('workspace.presentation_speaker_notes')}</span>
      </div>
      <div
        data-speaker-notes
        tabIndex={0}
        className='flex-1 overflow-y-auto p-[var(--sp-4)] text-[length:var(--text-16)] leading-relaxed text-[var(--text-primary)] outline-none'
      >
        {notes ? (
          <div className='whitespace-pre-wrap font-sans'>{notes}</div>
        ) : (
          <p className='text-[length:var(--text-14)] italic text-[var(--text-tertiary)]'>
            {t('workspace.presentation_no_notes')}
          </p>
        )}
      </div>
    </div>
  )
}

function PresenterHeader({
  state,
  connected,
  sendCommand,
}: {
  state: PresenterSlideState
  connected: boolean
  sendCommand: (command: PresenterInboundCommand) => void
}) {
  const clock = usePresenterClock()
  const timer = usePresenterTimer(state.startedAt)

  return (
    <header className='flex h-[var(--sp-12)] shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-[var(--sp-4)]'>
      <div className='flex items-center gap-[var(--sp-3)] min-w-0'>
        <div className='flex items-center gap-[var(--sp-1\\.5)] min-w-0'>
          <Presentation size={18} className='shrink-0 text-[var(--accent)]' />
          <span className='truncate font-semibold text-[length:var(--text-14)]'>
            {state.noteTitle || t('workspace.presentation_mode')}
          </span>
        </div>
        <ConnectionBadge connected={connected} />
      </div>

      <PresenterHeaderTimer timer={timer} clock={clock} />
      <PresenterHeaderStepper state={state} sendCommand={sendCommand} />
    </header>
  )
}

function PresenterHeaderTimer({
  timer,
  clock,
}: {
  timer: ReturnType<typeof usePresenterTimer>
  clock: string
}) {
  return (
    <div className='flex items-center gap-[var(--sp-4)]'>
      <div className='flex items-center gap-[var(--sp-2)]'>
        <span className='tabular font-mono text-[length:var(--text-16)] font-semibold text-[var(--accent)]'>
          {formatElapsed(timer.elapsedSeconds)}
        </span>
        <Tooltip label={timer.isPaused ? t('workspace.presentation_timer_resume') : t('workspace.presentation_timer_pause')}>
          <IconButton
            size='sm'
            label={timer.isPaused ? t('workspace.presentation_timer_resume') : t('workspace.presentation_timer_pause')}
            onClick={timer.togglePause}
          >
            {timer.isPaused ? <Play size={13} /> : <Pause size={13} />}
          </IconButton>
        </Tooltip>
        <Tooltip label={t('workspace.presentation_timer_reset')}>
          <IconButton size='sm' label={t('workspace.presentation_timer_reset')} onClick={timer.resetTimer}>
            <RotateCcw size={13} />
          </IconButton>
        </Tooltip>
      </div>
      <span className='h-[var(--sp-4)] w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <span className='tabular font-mono text-[length:var(--text-14)] text-[var(--text-secondary)]'>
        {clock}
      </span>
    </div>
  )
}

function PresenterHeaderStepper({
  state,
  sendCommand,
}: {
  state: PresenterSlideState
  sendCommand: (command: PresenterInboundCommand) => void
}) {
  return (
    <div className='flex items-center gap-[var(--sp-2)]'>
      <div className='tabular text-[length:var(--text-12)] text-[var(--text-secondary)]'>
        {state.slideIndex + 1} / {state.slideCount}
        {state.pageCount > 1 && (
          <span className='ml-[var(--sp-1)] text-[var(--accent)]'>
            ({state.subPage + 1}/{state.pageCount})
          </span>
        )}
      </div>
      <Tooltip label={t('workspace.presentation_prev')}>
        <IconButton
          size='sm'
          label={t('workspace.presentation_prev')}
          disabled={state.slideIndex === 0 && state.subPage === 0}
          onClick={() => sendCommand('prev')}
        >
          <ChevronLeft size={16} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('workspace.presentation_next')}>
        <IconButton
          size='sm'
          label={t('workspace.presentation_next')}
          disabled={state.slideIndex === state.slideCount - 1 && state.subPage === state.pageCount - 1}
          onClick={() => sendCommand('next')}
        >
          <ChevronRight size={16} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[var(--sp-1)] text-[length:var(--text-11)] font-medium',
        connected ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          connected ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]',
        )}
      />
      {connected ? t('workspace.presentation_connected') : t('workspace.presentation_disconnected')}
    </span>
  )
}

function useStageAutoMetrics(containerRef: React.RefObject<HTMLDivElement | null>): StageMetrics {
  const [metrics, setMetrics] = useState(() => measureStage(640, 360))
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const apply = () => {
      const m = measureStage(el.clientWidth, el.clientHeight)
      setMetrics((prev) => (prev.scale === m.scale ? prev : m))
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => apply())
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])
  return metrics
}

function PresenterScaledSlide({
  metrics,
  html,
  font,
  layout,
}: {
  metrics: StageMetrics
  html: string
  font: ProseFont
  layout?: SlideLayout
}) {
  return (
    <div
      className='relative shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-editor)]'
      style={{
        width: metrics.designWidth * metrics.scale,
        height: metrics.designHeight * metrics.scale,
      }}
    >
      <div
        className='ink-slide absolute top-0 left-0'
        style={{
          width: metrics.designWidth,
          height: metrics.designHeight,
          transform: `scale(${metrics.scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div
          className='absolute inset-x-0'
          style={{ top: SLIDE_PAD_Y, left: SLIDE_PAD_X, right: SLIDE_PAD_X }}
        >
          <SlideProse html={html} contentWidth={metrics.contentWidth} contentHeight={metrics.contentHeight} font={font} layout={layout} />
        </div>
      </div>
    </div>
  )
}

export function PresenterSlidePreview({
  source,
  layout,
  plan,
  sub = 0,
  font,
}: {
  source: string
  layout?: SlideLayout
  plan?: SlidePlan
  sub?: number
  font?: ProseFont
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const metrics = useStageAutoMetrics(containerRef)
  const defaultFont = useSession((s) => s.settings.appearance.proseFont) ?? 'sans'
  const proseFont = font ?? defaultFont

  const html = useMemo(() => {
    if (!source) return ''
    const markup = slideMarkup(renderSlideSource(source, true))
    if (plan && plan.pages.length > 0) {
      return slicePageHtml(markup.html, plan, sub, metrics.contentWidth, metrics.contentHeight)
    }
    return markup.html
  }, [source, plan, sub, metrics.contentWidth, metrics.contentHeight])

  const effectiveLayout = plan?.layout ?? layout

  return (
    <div ref={containerRef} className='relative flex h-full w-full items-center justify-center overflow-hidden'>
      <PresenterScaledSlide metrics={metrics} html={html} font={proseFont} layout={effectiveLayout} />
    </div>
  )
}

function usePresenterClock() {
  const [clock, setClock] = useState(() => formatClock(new Date()))
  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])
  return clock
}

function useTimerInterval(isPaused: boolean, setNow: React.Dispatch<React.SetStateAction<number>>) {
  useEffect(() => {
    if (isPaused) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [isPaused, setNow])
}

export function usePresenterTimer(startedAt: number) {
  const [isPaused, setIsPaused] = useState(false)
  const [accumulatedMs, setAccumulatedMs] = useState(0)
  const [lastResumeAt, setLastResumeAt] = useState(() => startedAt)
  const [now, setNow] = useState(() => Date.now())

  const prevStartedAtRef = useRef(startedAt)
  useEffect(() => {
    if (prevStartedAtRef.current !== startedAt) {
      prevStartedAtRef.current = startedAt
      setAccumulatedMs(0)
      setLastResumeAt(startedAt)
      setIsPaused(false)
      setNow(Date.now())
    }
  }, [startedAt])

  useTimerInterval(isPaused, setNow)

  const togglePause = useCallback(() => {
    setIsPaused((currentlyPaused) => {
      const currentTime = Date.now()
      if (currentlyPaused) {
        setLastResumeAt(currentTime)
        setNow(currentTime)
        return false
      }
      if (lastResumeAt !== null) {
        setAccumulatedMs((prev) => prev + Math.max(0, currentTime - lastResumeAt))
      }
      return true
    })
  }, [lastResumeAt])

  const resetTimer = useCallback(() => {
    const currentTime = Date.now()
    setIsPaused(false)
    setAccumulatedMs(0)
    setLastResumeAt(currentTime)
    setNow(currentTime)
  }, [])

  const runningElapsedMs = !isPaused && lastResumeAt !== null ? Math.max(0, now - lastResumeAt) : 0
  const elapsedSeconds = Math.max(0, Math.floor((accumulatedMs + runningElapsedMs) / 1000))

  return { elapsedSeconds, isPaused, togglePause, resetTimer }
}

function dispatchPresenterKey(key: string, sendCommand: (cmd: PresenterInboundCommand) => void): boolean {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
    case 'ArrowDown':
      sendCommand('next')
      return true
    case 'ArrowLeft':
    case 'PageUp':
    case 'ArrowUp':
      sendCommand('prev')
      return true
    case 'Home':
      sendCommand('first')
      return true
    case 'End':
      sendCommand('last')
      return true
    case 'Escape':
      window.close()
      return true
    default:
      return false
  }
}

function usePresenterKeyNav(sendCommand: (command: PresenterInboundCommand) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const el = event.target instanceof Element ? event.target : null
      const isInput = Boolean(el?.closest('input, textarea, select, [contenteditable="true"]'))
      if (isInput) return

      const isControl = Boolean(el?.closest('button, a'))
      if (isControl && (event.key === ' ' || event.key === 'Enter')) return

      const inSpeakerNotes = Boolean(el?.closest('[data-speaker-notes]'))
      if (inSpeakerNotes && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
        return
      }

      if (dispatchPresenterKey(event.key, sendCommand)) {
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sendCommand])
}
