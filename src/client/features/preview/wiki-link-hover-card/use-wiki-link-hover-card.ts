import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { Z_INDEX } from '../../../lib/z-index'
import { decodeDataValue } from '../../../lib/markdown/data-attr'
import { parseWikiTarget } from '../../../lib/markdown/renderer'
import { destroyChartInstances, renderChartJs, renderPendingMermaid, showMermaidSource } from '../../../lib/markdown/enhance'
import { renderStaticMindmaps } from '../../../lib/markdown/mindmap'
import { registerFenceBodies, type FenceBodies } from '../../../lib/markdown/fence-bodies'
import { findNoteByTitle } from '../../../store/notes'
import { useNotes } from '../../../store/notes'
import { useSession } from '../../../store/session'
import { getVisibleViewport } from '../../../lib/viewport'
import { getLocale } from '../../../lib/i18n'
import { MAX_HOVER_CARD_DEPTH, useLinkHover } from '../link-hover'
import { useNoteBacklinks, useNoteCardContent } from '../card-content'
import { pushLinkHoverTarget } from '../link-signal'
import { placeHoverCard } from './position'
import type { PreviewSettings } from '@shared/types/settings'
import type { PinnedWindowGeometry } from '../../../store/pinned-windows'
import type { WikiLinkHoverCardState, PinnedNoteCardState } from '../../../types/hover-card'
import type { MenuItem } from '../../../components/overlay'

const MIN_PINNED_WIDTH = 260
const MIN_PINNED_HEIGHT = 140
const CARD_WIDTH = 340
const CARD_MARGIN = 8
const HIDE_GRACE_MS = 200
const PINNED_PREVIEW_LENGTH = Number.MAX_SAFE_INTEGER

type Rect = { x: number; y: number; width: number; height: number }

export function hoverCardStyle(pinned: boolean, pinnedRect: Rect, position: { top: number; left: number } | null, pinnedInit: PinnedNoteCardState | undefined): CSSProperties {
  if (pinned) {
    return {
      left: pinnedRect.x,
      top: pinnedRect.y,
      width: pinnedRect.width,
      height: pinnedRect.height || undefined,
      zIndex: Z_INDEX.hoverPinned + (pinnedInit?.z ?? 0),
    }
  }
  if (position) return { top: position.top, left: position.left }
  return { top: 0, left: 0, visibility: 'hidden' }
}

export interface WikiLinkHoverCardProps {
  card: WikiLinkHoverCardState
  path: string[]
  depth: number
  dark: boolean
  pinned?: boolean
  pinnedInit?: PinnedNoteCardState
  stackCount?: number
  stackFront?: boolean
  stackItems?: MenuItem[]
  onClose: () => void
  onEnter: () => void
  onLeave: () => void
  onPin: (card: WikiLinkHoverCardState, rect: DOMRect) => void
  onGeometryChange?: (geometry: PinnedWindowGeometry) => void
  flash?: boolean
}

function resolveNestedCandidate(link: HTMLElement, card: WikiLinkHoverCardState, depth: number, path: string[]): WikiLinkHoverCardState | null {
  if (depth >= MAX_HOVER_CARD_DEPTH) return null
  const parsed = parseWikiTarget(decodeDataValue(link.dataset.wikilink))
  const notes = useNotes.getState().notes
  if (parsed.noteTitle) {
    const note = findNoteByTitle(parsed.noteTitle)
    if (!note) {
      return { anchor: link, title: parsed.alias ?? parsed.noteTitle, noteId: null, missing: true, headline: parsed.heading ?? parsed.noteTitle }
    }
    if (path.includes(note.id)) return null
    return { anchor: link, title: parsed.alias ?? note.title, noteId: note.id, missing: false, headline: parsed.heading ?? note.title }
  }
  if (!card.noteId) return null
  const summary = notes[card.noteId]
  if (!summary) return null
  return { anchor: link, title: parsed.alias ?? summary.title, noteId: card.noteId, missing: false, headline: parsed.heading ?? summary.title }
}

function computeHoverCardPosition(cardEl: HTMLDivElement, card: WikiLinkHoverCardState, onClose: () => void, setPosition: Dispatch<SetStateAction<{ top: number; left: number } | null>>) {
  if (!card.anchor.isConnected) {
    onClose()
    return
  }
  const anchorRect = card.anchor.getBoundingClientRect()
  const cardRect = cardEl.getBoundingClientRect()
  if (!anchorRect.width && !anchorRect.height) return
  setPosition(placeHoverCard(anchorRect, cardRect))
}

function clampWindowRect(next: Rect) {
  const viewport = getVisibleViewport()
  const width = Math.max(MIN_PINNED_WIDTH, Math.min(next.width, viewport.right - next.x - CARD_MARGIN))
  const height = next.height > 0
    ? Math.max(MIN_PINNED_HEIGHT, Math.min(next.height, viewport.bottom - next.y - CARD_MARGIN))
    : 0
  const x = Math.min(Math.max(next.x, viewport.left), Math.max(viewport.left, viewport.right - width - CARD_MARGIN))
  const y = Math.min(Math.max(next.y, viewport.top), Math.max(viewport.top, viewport.bottom - Math.max(height, MIN_PINNED_HEIGHT) - CARD_MARGIN))
  return { x, y, width, height }
}

function stopEvent(event: React.MouseEvent) {
  event.stopPropagation()
  event.preventDefault()
}

function moveCardFocus(direction: 1 | -1, cardRef: RefObject<HTMLDivElement | null>) {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-hover-card]')]
  const index = cards.indexOf(cardRef.current as HTMLElement)
  cards[index + direction]?.focus({ preventScroll: true })
}

function trackPointerDrag(startEvent: React.PointerEvent, update: (dx: number, dy: number) => Rect, commit: (rect: Rect) => void) {
  const move = (moveEvent: PointerEvent) => {
    commit(clampWindowRect(update(moveEvent.clientX - startEvent.clientX, moveEvent.clientY - startEvent.clientY)))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function useCardPositioning(card: WikiLinkHoverCardState, pinned: boolean, onClose: () => void) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (pinned) return
    const cardEl = cardRef.current
    if (!cardEl) return
    const compute = () => computeHoverCardPosition(cardEl, card, onClose, setPosition)
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(cardEl)
    window.addEventListener('resize', compute)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [card.anchor, onClose, pinned])

  useEffect(() => {
    if (!pinned) return
    cardRef.current?.focus({ preventScroll: true })
  }, [pinned])

  return { cardRef, position }
}

function useCardPinnedGeometry(pinnedInit: PinnedNoteCardState | undefined, onGeometryChange: ((geometry: PinnedWindowGeometry) => void) | undefined, cardRef: RefObject<HTMLDivElement | null>) {
  const [pinnedRect, setPinnedRect] = useState<Rect>(() => ({
    x: pinnedInit?.x ?? 0,
    y: pinnedInit?.y ?? 0,
    width: pinnedInit?.width ?? CARD_WIDTH,
    height: pinnedInit?.height ?? 0,
  }))
  const pinnedRectRef = useRef(pinnedRect)

  const commitRect = useCallback((rect: Rect) => {
    pinnedRectRef.current = rect
    setPinnedRect(rect)
    onGeometryChange?.(rect)
  }, [onGeometryChange])

  const beginDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return
    event.preventDefault()
    const origin = { ...pinnedRectRef.current }
    trackPointerDrag(event, (dx, dy) => ({ ...origin, x: origin.x + dx, y: origin.y + dy }), commitRect)
  }, [commitRect])

  const beginResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const origin = { ...pinnedRectRef.current }
    if (origin.height <= 0) {
      const rendered = cardRef.current?.getBoundingClientRect()
      if (rendered) origin.height = rendered.height
    }
    trackPointerDrag(event, (dx, dy) => ({ ...origin, width: origin.width + dx, height: origin.height + dy }), commitRect)
  }, [cardRef, commitRect])

  return { pinnedRect, beginDrag, beginResize }
}

function useCardAccessibility(card: WikiLinkHoverCardState, pinned: boolean) {
  const describedBy = useId()

  useEffect(() => {
    if (pinned || !card.noteId) return
    return pushLinkHoverTarget(card.noteId)
  }, [card.noteId, pinned])

  useEffect(() => {
    const anchor = card.anchor
    const previous = anchor.getAttribute('aria-describedby')
    anchor.setAttribute('aria-describedby', describedBy)
    return () => {
      if (anchor.getAttribute('aria-describedby') === describedBy) anchor.setAttribute('aria-describedby', previous ?? '')
    }
  }, [card.anchor, describedBy])

  return describedBy
}

function useCardActions(opts: { card: WikiLinkHoverCardState; pinned: boolean; onClose: () => void; onPin: (card: WikiLinkHoverCardState, rect: DOMRect) => void; cardRef: RefObject<HTMLDivElement | null> }) {
  const { card, pinned, onClose, onPin, cardRef } = opts

  const onCardKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (pinned && event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveCardFocus(1, cardRef)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveCardFocus(-1, cardRef)
    }
  }, [onClose, pinned])

  const handlePin = useCallback(() => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    onPin(card, rect)
  }, [card, onPin])

  const openInCurrentPane = useCallback(() => {
    if (!card.noteId) return
    void useNotes.getState().openNote(card.noteId)
    onClose()
  }, [card.noteId, onClose])

  const openInSidePane = useCallback(() => {
    if (!card.noteId) return
    void useNotes.getState().openNote(card.noteId, { pane: 'secondary' })
    onClose()
  }, [card.noteId, onClose])

  const openBacklink = useCallback((id: string) => {
    void useNotes.getState().openNote(id, { pane: 'secondary' })
    onClose()
  }, [onClose])

  return { stop: stopEvent, onCardKeyDown, handlePin, openInCurrentPane, openInSidePane, openBacklink }
}

function usePinnedRichBlocks(opts: {
  pinned: boolean
  status: 'loading' | 'ready' | 'missing' | 'error'
  html: string
  fences: FenceBodies
  dark: boolean
  preview: PreviewSettings
  cardRef: RefObject<HTMLDivElement | null>
}): void {
  const { pinned, status, html, fences, dark, preview, cardRef } = opts
  useEffect(() => {
    if (!pinned || status !== 'ready' || !html) return
    const body = cardRef.current?.querySelector<HTMLElement>('.wiki-hover-body')
    if (!body) return
    // The card body holds markup a card render produced elsewhere, so the set it was rendered from
    // has to be put on this element before anything draws out of a block (P-01).
    registerFenceBodies(body, fences)
    let cancelled = false
    const isCurrent = () => !cancelled && body.isConnected
    void (async () => {
      if (preview.mermaid)
        await renderPendingMermaid(body, dark, { isCurrent })
      else
        showMermaidSource(body)
      if (!isCurrent()) return
      await Promise.allSettled([
        renderChartJs(body, dark),
        renderStaticMindmaps(body, { dark, locale: getLocale() }),
      ])
    })()
    return () => {
      cancelled = true
      destroyChartInstances(body)
    }
  }, [pinned, status, html, fences, dark, preview.mermaid, cardRef])
}

export function useWikiLinkHoverCard(props: WikiLinkHoverCardProps) {
  const { card, path, depth, dark, pinned = false, pinnedInit, onClose, onPin, onGeometryChange } = props
  const preview = useSession((s) => s.settings.preview)
  const content = useNoteCardContent({ noteId: card.noteId, missing: card.missing, headline: card.headline }, dark, preview.math, pinned ? PINNED_PREVIEW_LENGTH : preview.linkPreviewLength)
  const { status, html, fences, isTruncated } = content
  const { cardRef, position } = useCardPositioning(card, pinned, onClose)
  const describedBy = useCardAccessibility(card, pinned)
  const { pinnedRect, beginDrag, beginResize } = useCardPinnedGeometry(pinnedInit, onGeometryChange, cardRef)
  usePinnedRichBlocks({ pinned, status, html, fences, dark, preview, cardRef })
  const resolve = useCallback((link: HTMLElement) => resolveNestedCandidate(link, card, depth, path), [card, depth, path])
  const machine = useLinkHover({
    resolve,
    delay: preview.linkHoverDelayMs,
    enabled: preview.linkHover,
    armOnNonLink: false,
    hideGraceMs: HIDE_GRACE_MS,
  })
  const actions = useCardActions({ card, pinned, onClose, onPin, cardRef })
  const [isStackMenuOpen, setIsStackMenuOpen] = useState(false)
  const stackButtonRef = useRef<HTMLButtonElement>(null)
  const backlinks = useNoteBacklinks(card.noteId && !card.missing ? card.noteId : null)
  const htmlObj = useMemo(() => ({ __html: html }), [html])

  return {
    ...props,
    pinned,
    status,
    html,
    isTruncated,
    htmlObj,
    cardRef,
    position,
    describedBy,
    pinnedRect,
    beginDrag,
    beginResize,
    machine,
    nested: machine.card,
    backlinks: backlinks.links,
    isStackMenuOpen,
    setIsStackMenuOpen,
    stackButtonRef,
    ...actions,
  }
}

export type WikiLinkHoverCardBundle = ReturnType<typeof useWikiLinkHoverCard>