import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { withPinnedWindowSize } from '../../../lib/pinned-window-size'
import { usePinnedWindows } from '../../../store/pinned-windows'
import type { WikiLinkHoverCardState } from '../../preview'
import type { CanvasNode, CanvasState } from './types'

function computeAnchor(
  canvas: HTMLCanvasElement,
  state: CanvasState,
  node: CanvasNode,
): { x: number; y: number; size: number } {
  const rect = canvas.getBoundingClientRect()
  const screenX = rect.left + state.offsetX + node.x * state.scale
  const screenY = rect.top + state.offsetY + node.y * state.scale
  const size = Math.max(12, node.r * 2 * state.scale)
  return { x: screenX - size / 2, y: screenY - size / 2, size }
}

function usePreviewTimers(onHover: () => void, onHide: () => void) {
  const hoverTimerRef = useRef<number>(0)
  const hideTimerRef = useRef<number>(0)
  // The two callbacks are written inline by every caller, so the timers read them through a ref: arming a
  // timer must not depend on the render that armed it, or each render would re-create the arm itself.
  const onHoverRef = useRef(onHover)
  const onHideRef = useRef(onHide)
  onHoverRef.current = onHover
  onHideRef.current = onHide
  const clearTimers = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current)
    window.clearTimeout(hideTimerRef.current)
  }, [])
  const armHover = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current)
    window.clearTimeout(hideTimerRef.current)
    hoverTimerRef.current = window.setTimeout(() => onHoverRef.current(), 300)
  }, [])
  const armHide = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current)
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => onHideRef.current(), 200)
  }, [])
  return { clearTimers, armHover, armHide, pauseHide: () => window.clearTimeout(hideTimerRef.current) }
}

export function useGraphNodePreview(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  stateRef: RefObject<CanvasState>,
) {
  const [previewCard, setPreviewCard] = useState<WikiLinkHoverCardState | null>(null)
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number; size: number } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const pendingNodeRef = useRef<CanvasNode | null>(null)

  const showPreview = useCallback((node: CanvasNode) => {
    if (node.kind !== 'note' && node.kind !== 'unresolved') return
    const canvas = canvasRef.current, anchor = anchorRef.current
    if (!canvas || !anchor) return
    setAnchorPos(computeAnchor(canvas, stateRef.current, node))
    setPreviewCard({ anchor, title: node.title, noteId: node.kind === 'note' ? node.id : null, missing: node.kind === 'unresolved' })
  }, [canvasRef, stateRef])

  const { clearTimers, armHover, armHide, pauseHide } = usePreviewTimers(
    () => { if (pendingNodeRef.current) showPreview(pendingNodeRef.current) },
    () => setPreviewCard(null),
  )

  const onHoverNode = useCallback((node: CanvasNode | null) => {
    pendingNodeRef.current = node
    if (node) armHover()
    else armHide()
  }, [armHover, armHide])

  const onPinPreview = useCallback((card: WikiLinkHoverCardState, rect: DOMRect) => {
    usePinnedWindows.getState().pin(card, withPinnedWindowSize(rect))
    setPreviewCard(null)
  }, [])

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  return {
    previewCard, anchorPos, anchorRef, clearTimers, showPreview, onHoverNode, onPinPreview,
    closePreview: () => setPreviewCard(null), pauseHide, resumeHide: armHide,
  }
}
