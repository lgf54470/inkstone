import { useLayoutEffect, useState, type RefObject } from 'react'

// Slides are laid out on a fixed-width design canvas and scaled to the stage, so
// type and diagrams keep their proportions from phone to projector. The design
// *height* adapts instead of staying at 16:9: the canvas grows to consume the
// stage (no letterbox bands on ordinary laptop/projector windows) and only falls
// back to fit-to-stage when the panel is outside the aspect envelope below.
export const SLIDE_DESIGN_WIDTH = 1280
export const SLIDE_DESIGN_HEIGHT = 720
export const SLIDE_PAD_X = 56
export const SLIDE_PAD_Y = 44
// Growth caps: 1280×1440 (8:9) at the tall end and 1920×720 (~8:3) at the wide
// end. Outside that envelope the canvas is centered with the remaining bands,
// because a narrower canvas would push body text toward unreadable and a wider
// one would stretch every line across the screen. The tall cap is generous so a
// narrow window (rail open, or a tablet held upright) still fills the stage.
const MAX_DESIGN_HEIGHT = 1440
const MAX_DESIGN_WIDTH = 1920

export interface StageMetrics {
  scale: number
  designWidth: number
  designHeight: number
  contentWidth: number
  contentHeight: number
}

const FALLBACK_METRICS: StageMetrics = {
  scale: 1,
  designWidth: SLIDE_DESIGN_WIDTH,
  designHeight: SLIDE_DESIGN_HEIGHT,
  contentWidth: SLIDE_DESIGN_WIDTH - SLIDE_PAD_X * 2,
  contentHeight: SLIDE_DESIGN_HEIGHT - SLIDE_PAD_Y * 2,
}

export function measureStage(stageWidth: number, stageHeight: number): StageMetrics {
  if (stageWidth < 1 || stageHeight < 1) return FALLBACK_METRICS
  const scale = Math.min(stageWidth / SLIDE_DESIGN_WIDTH, stageHeight / SLIDE_DESIGN_HEIGHT)
  const designWidth = clamp(stageWidth / scale, SLIDE_DESIGN_WIDTH, MAX_DESIGN_WIDTH)
  const designHeight = clamp(stageHeight / scale, SLIDE_DESIGN_HEIGHT, MAX_DESIGN_HEIGHT)
  return {
    scale,
    designWidth,
    designHeight,
    contentWidth: designWidth - SLIDE_PAD_X * 2,
    contentHeight: designHeight - SLIDE_PAD_Y * 2,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// `active` matters: the overlay keeps its hooks mounted while closed, so an
// effect that only ran on mount would attach its observer while the stage is
// still absent and never see the real stage afterwards.
export function useStageMetrics(active: boolean, stageRef: RefObject<HTMLDivElement | null>): StageMetrics {
  const [metrics, setMetrics] = useState<StageMetrics>(FALLBACK_METRICS)
  useLayoutEffect(() => {
    if (!active) return
    const stage = stageRef.current
    if (!stage) return
    const apply = (width: number, height: number) => {
      const next = measureStage(width, height)
      setMetrics((current) => (sameMetrics(current, next) ? current : next))
    }
    apply(stage.clientWidth, stage.clientHeight)
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 }
      apply(width, height)
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [active, stageRef])
  return metrics
}

function sameMetrics(a: StageMetrics, b: StageMetrics): boolean {
  return a.scale === b.scale && a.designWidth === b.designWidth && a.designHeight === b.designHeight
}
