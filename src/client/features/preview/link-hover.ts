import { useCallback, useEffect, useRef, useState } from 'react'
import type { WikiLinkHoverCardState } from '../../types/hover-card'

export const MAX_HOVER_CARD_DEPTH = 4

interface LinkHoverOptions {
  resolve: (link: HTMLElement) => WikiLinkHoverCardState | null
  delay: number
  enabled: boolean
  armOnNonLink?: boolean
  hideGraceMs?: number
}

export interface LinkHoverMachine {
  card: WikiLinkHoverCardState | null
  propose: (link: HTMLElement | null, options?: { immediate?: boolean }) => void
  handleMouseMove: (event: React.MouseEvent) => void
  handleMouseLeave: () => void
  clearPendingHide: () => void
  armHide: (grace?: number) => void
  hideNow: () => void
}

export function useLinkHover({
  resolve,
  delay,
  enabled,
  armOnNonLink = true,
  hideGraceMs = 280,
}: LinkHoverOptions): LinkHoverMachine {
  const [card, setCard] = useState<WikiLinkHoverCardState | null>(null)
  const candidateRef = useRef<HTMLElement | null>(null)
  const openedLinkRef = useRef<HTMLElement | null>(null)
  const showTimerRef = useRef(0)
  const hideTimerRef = useRef(0)
  const resolveRef = useRef(resolve)
  resolveRef.current = resolve
  const delayRef = useRef(delay)
  delayRef.current = delay
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const armOnNonLinkRef = useRef(armOnNonLink)
  armOnNonLinkRef.current = armOnNonLink
  const graceRef = useRef(hideGraceMs)
  graceRef.current = hideGraceMs

  const clearPendingHide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current)
  }, [])

  const hideNow = useCallback(() => {
    window.clearTimeout(showTimerRef.current)
    window.clearTimeout(hideTimerRef.current)
    candidateRef.current = null
    openedLinkRef.current = null
    setCard(null)
  }, [])

  const armHide = useCallback((grace = graceRef.current) => {
    window.clearTimeout(showTimerRef.current)
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      candidateRef.current = null
      openedLinkRef.current = null
      setCard(null)
    }, grace)
  }, [])

  const openFor = useCallback((link: HTMLElement) => {
    window.clearTimeout(showTimerRef.current)
    if (!enabledRef.current) return
    const next = resolveRef.current(link)
    candidateRef.current = null
    openedLinkRef.current = link
    if (next) setCard(next)
  }, [])

  const propose = useCallback((link: HTMLElement | null, options?: { immediate?: boolean }) => {
    if (!link) {
      window.clearTimeout(showTimerRef.current)
      candidateRef.current = null
      armHide()
      return
    }
    if (!enabledRef.current) return
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches)
      return
    window.clearTimeout(hideTimerRef.current)
    if (link === candidateRef.current || link === openedLinkRef.current) return
    candidateRef.current = link
    if (options?.immediate)
      openFor(link)
    else {
      window.clearTimeout(showTimerRef.current)
      showTimerRef.current = window.setTimeout(() => {
        if (candidateRef.current !== link || !enabledRef.current) return
        openFor(link)
      }, delayRef.current)
    }
  }, [armHide, openFor])

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!enabledRef.current) return
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches)
      return
    window.clearTimeout(hideTimerRef.current)
    const link = (event.target as HTMLElement).closest<HTMLElement>('[data-wikilink]')
    if (!link) {
      window.clearTimeout(showTimerRef.current)
      candidateRef.current = null
      if (armOnNonLinkRef.current) armHide()
      return
    }
    propose(link)
  }, [armHide, propose])

  const handleMouseLeave = useCallback(() => {
    armHide()
  }, [armHide])

  useEffect(() => {
    if (!enabled)
      hideNow()
  }, [enabled, hideNow])

  useEffect(() => () => {
    window.clearTimeout(showTimerRef.current)
    window.clearTimeout(hideTimerRef.current)
  }, [])

  return { card, propose, handleMouseMove, handleMouseLeave, clearPendingHide, armHide, hideNow }
}