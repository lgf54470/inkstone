import { useCallback, useRef, type RefObject } from 'react'
import { SlideViewport } from './slide-canvas'
import { stageClickDirection, swipeDirection } from './presentation-state'
import type { StageMetrics } from './slide-stage'
import type { SlidePlan } from './slide-pagination'

export interface PresentationStageProps {
  stageRef: RefObject<HTMLDivElement | null>
  metrics: StageMetrics
  cacheKey: string
  source: string
  subPage: number
  onPlan: (plan: SlidePlan) => void
  onPrev: () => void
  onNext: () => void
}

export function PresentationStage({
  stageRef,
  metrics,
  cacheKey,
  source,
  subPage,
  onPlan,
  onPrev,
  onNext,
}: PresentationStageProps) {
  const touchStartX = useRef<number | null>(null)

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('a, button, input, select, textarea, [contenteditable="true"]')) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const dir = stageClickDirection(clickX, rect.width)
    if (dir === 'prev') onPrev()
    else onNext()
  }, [onPrev, onNext, stageRef])

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

  return (
    <div
      ref={stageRef}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className='relative flex min-h-0 min-w-0 flex-1 select-none items-center justify-center overflow-hidden'
    >
      <SlideViewport
        metrics={metrics}
        cacheKey={cacheKey}
        source={source}
        subPage={subPage}
        onPlan={onPlan}
      />
    </div>
  )
}
