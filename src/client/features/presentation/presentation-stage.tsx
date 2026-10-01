import { useCallback, useRef, type RefObject } from 'react'
import { SlideViewport } from './slide-canvas'
import { formatMicroPage, stageClickDirection, swipeDirection } from './presentation-state'
import type { StageMetrics } from './slide-stage'
import type { SlidePlan } from './slide-pagination'

export interface PresentationStageProps {
  stageRef: RefObject<HTMLDivElement | null>
  metrics: StageMetrics
  cacheKey: string
  source: string
  subPage: number
  pageCount?: number
  index: number
  count: number
  onPlan: (plan: SlidePlan) => void
  onPrev: () => void
  onNext: () => void
  /** The overview grid is drawn over the slide, so nothing in the slide can be reached. */
  occluded: boolean
}

export interface StageSessionSource {
  metrics: StageMetrics
  cacheKeys: Record<number, string>
  deck: string[]
  index: number
  sub: number
  pageCount: number
  handlePlan: (plan: SlidePlan) => void
  goPrev: () => void
  goNext: () => void
  occluded: boolean
}

export function stageProps(stageRef: RefObject<HTMLDivElement | null>, session: StageSessionSource): PresentationStageProps {
  return {
    stageRef,
    metrics: session.metrics,
    cacheKey: session.cacheKeys[session.index] ?? '',
    source: session.deck[session.index] ?? '',
    subPage: session.sub,
    pageCount: session.pageCount,
    index: session.index,
    count: session.deck.length,
    onPlan: session.handlePlan,
    onPrev: session.goPrev,
    onNext: session.goNext,
    occluded: session.occluded,
  }
}

function useStageGestures({
  stageRef,
  onPrev,
  onNext,
  occluded,
}: {
  stageRef: RefObject<HTMLDivElement | null>
  onPrev: () => void
  onNext: () => void
  occluded: boolean
}) {
  const touchStartX = useRef<number | null>(null)

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (occluded) return
    const target = event.target as HTMLElement | null
    if (target?.closest('a, button, input, select, textarea, [contenteditable="true"]')) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const dir = stageClickDirection(clickX, rect.width)
    if (dir === 'prev') onPrev()
    else onNext()
  }, [onPrev, onNext, stageRef, occluded])

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }, [])

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return
    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX.current
    const deltaX = touchEndX - touchStartX.current
    touchStartX.current = null
    const dir = swipeDirection(deltaX)
    if (dir === 'prev') onPrev()
    else if (dir === 'next') onNext()
  }, [onPrev, onNext])

  return { handleClick, handleTouchStart, handleTouchEnd }
}

export function PresentationStage(props: PresentationStageProps) {
  const { stageRef, metrics, cacheKey, source, subPage, pageCount = 1, index, count, onPlan, onPrev, onNext, occluded } = props
  const { handleClick, handleTouchStart, handleTouchEnd } = useStageGestures({ stageRef, onPrev, onNext, occluded })

  return (
    <div
      ref={stageRef}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      inert={occluded ? true : undefined}
      className='relative flex min-h-0 min-w-0 flex-1 select-none items-center justify-center overflow-hidden'
    >
      <SlideViewport metrics={metrics} cacheKey={cacheKey} source={source} subPage={subPage} onPlan={onPlan} />
      {count > 0 && (
        <div
          className='pointer-events-none absolute bottom-4 right-4 z-10 select-none rounded-[var(--r-full)] bg-[var(--bg-overlay)] px-[var(--sp-2)] py-0.5 text-[length:var(--text-11)] font-mono text-[var(--text-tertiary)] opacity-35 shadow-xs'
          aria-hidden='true'
        >
          {formatMicroPage(index, count, subPage, pageCount)}
        </div>
      )}
    </div>
  )
}

export function ScreenCover({ cover, onClear }: { cover: 'black' | 'white'; onClear: () => void }) {
  return (
    <div
      onClick={onClear}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      data-screen-cover={cover}
      className={cover === 'black' ? 'absolute inset-0 z-[var(--z-modal)] cursor-pointer select-none bg-[rgb(0_0_0)]' : 'absolute inset-0 z-[var(--z-modal)] cursor-pointer select-none bg-[rgb(255_255_255)]'}
      aria-label={cover === 'black' ? 'Blackout' : 'Whiteout'}
    />
  )
}

