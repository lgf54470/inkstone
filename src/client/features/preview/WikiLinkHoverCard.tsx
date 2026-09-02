import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Layers, Link2, Loader2, PanelLeftOpen, PanelRightOpen, Pin, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { decodeDataValue } from '../../lib/markdown/data-attr'
import { parseWikiTarget } from '../../lib/markdown/renderer'
import { findNoteByTitle } from '../../store/notes/selectors'
import { useNotes } from '../../store/notes'
import { useSession } from '../../store/session'
import { t } from '../../lib/i18n'
import { getVisibleViewport } from '../../lib/viewport'
import { Menu, type MenuItem } from '../../components/overlay'
import { MAX_HOVER_CARD_DEPTH, useLinkHover } from './link-hover'
import { useNoteBacklinks, useNoteCardContent } from './card-content'
import { pushLinkHoverTarget } from './link-signal'
import type { PinnedWindowGeometry } from '../../store/pinned-windows'
import type { WikiLinkHoverCardState, PinnedNoteCardState } from '../../types/hover-card'

export type { WikiLinkHoverCardState, PinnedNoteCardState }

const MIN_PINNED_WIDTH = 260
const MIN_PINNED_HEIGHT = 140

export const WikiLinkHoverCard = memo(function WikiLinkHoverCard({
  card,
  path,
  depth,
  dark,
  pinned = false,
  pinnedInit,
  stackCount = 1,
  stackFront = false,
  stackItems = [],
  onClose,
  onEnter,
  onLeave,
  onPin,
  onGeometryChange,
  flash = false,
}: {
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
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const describedBy = useId()
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const preview = useSession((s) => s.settings.preview)
  const hoverEnabled = preview.linkHover
  const hoverDelay = preview.linkHoverDelayMs
  const content = useNoteCardContent(
    { noteId: card.noteId, missing: card.missing, headline: card.headline },
    dark,
    preview.math,
    preview.linkPreviewLength,
  )
  const { status, html, truncated } = content
  const [stackMenuOpen, setStackMenuOpen] = useState(false)
  const stackButtonRef = useRef<HTMLButtonElement>(null)

  const [pinnedRect, setPinnedRect] = useState(() => ({
    x: pinnedInit?.x ?? 0,
    y: pinnedInit?.y ?? 0,
    width: pinnedInit?.width ?? 340,
    height: pinnedInit?.height ?? 0,
  }))
  const pinnedRectRef = useRef(pinnedRect)

  const resolveNested = useCallback(
    (link: HTMLElement): WikiLinkHoverCardState | null => {
      if (depth >= MAX_HOVER_CARD_DEPTH) return null
      const parsed = parseWikiTarget(decodeDataValue(link.dataset.wikilink))
      const notes = useNotes.getState().notes
      if (parsed.noteTitle) {
        const note = findNoteByTitle(parsed.noteTitle)
        if (!note)
          return {
            anchor: link,
            title: parsed.alias ?? parsed.noteTitle,
            noteId: null,
            missing: true,
            headline: parsed.heading ?? parsed.noteTitle,
          }
        if (path.includes(note.id)) return null
        return {
          anchor: link,
          title: parsed.alias ?? note.title,
          noteId: note.id,
          missing: false,
          headline: parsed.heading ?? note.title,
        }
      }
      if (!card.noteId) return null
      const summary = notes[card.noteId]
      if (!summary) return null
      return {
        anchor: link,
        title: parsed.alias ?? summary.title,
        noteId: card.noteId,
        missing: false,
        headline: parsed.heading ?? summary.title,
      }
    },
    [card.noteId, depth, path],
  )

  const machine = useLinkHover({
    resolve: resolveNested,
    delay: hoverDelay,
    enabled: hoverEnabled,
    armOnNonLink: false,
    hideGraceMs: 200,
  })

  useLayoutEffect(() => {
    if (pinned) return
    const cardEl = cardRef.current
    if (!cardEl) return
    const compute = () => {
      if (!card.anchor.isConnected) {
        onClose()
        return
      }
      const anchorRect = card.anchor.getBoundingClientRect()
      const cardRect = cardEl.getBoundingClientRect()
      if (!anchorRect.width && !anchorRect.height) return
      setPosition(placeHoverCard(anchorRect, cardRect))
    }
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

  useEffect(() => {
    if (pinned || !card.noteId) return
    return pushLinkHoverTarget(card.noteId)
  }, [card.noteId, pinned])

  useEffect(() => {
    const anchor = card.anchor
    const previous = anchor.getAttribute('aria-describedby')
    anchor.setAttribute('aria-describedby', describedBy)
    return () => {
      if (anchor.getAttribute('aria-describedby') === describedBy)
        anchor.setAttribute('aria-describedby', previous ?? '')
    }
  }, [card.anchor, describedBy])

  const stop = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }, [])

  const clampWindow = useCallback((next: { x: number; y: number; width: number; height: number }) => {
    const viewport = getVisibleViewport()
    const margin = 8
    const width = Math.max(MIN_PINNED_WIDTH, Math.min(next.width, viewport.right - next.x - margin))
    const height = Math.max(MIN_PINNED_HEIGHT, Math.min(next.height, viewport.bottom - next.y - margin))
    const x = Math.min(Math.max(next.x, viewport.left), Math.max(viewport.left, viewport.right - width - margin))
    const y = Math.min(Math.max(next.y, viewport.top), Math.max(viewport.top, viewport.bottom - height - margin))
    return { x, y, width, height }
  }, [])

  const beginDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if ((event.target as Element).closest('button')) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const origin = { ...pinnedRectRef.current }
    const move = (moveEvent: PointerEvent) => {
      pinnedRectRef.current = clampWindow({
        ...origin,
        x: origin.x + moveEvent.clientX - startX,
        y: origin.y + moveEvent.clientY - startY,
      })
      setPinnedRect(pinnedRectRef.current)
      onGeometryChange?.(pinnedRectRef.current)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [clampWindow])

  const beginResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const origin = { ...pinnedRectRef.current }
    const move = (moveEvent: PointerEvent) => {
      pinnedRectRef.current = clampWindow({
        ...origin,
        width: origin.width + moveEvent.clientX - startX,
        height: origin.height + moveEvent.clientY - startY,
      })
      setPinnedRect(pinnedRectRef.current)
      onGeometryChange?.(pinnedRectRef.current)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [clampWindow, onGeometryChange])

  const moveCardFocus = useCallback((direction: 1 | -1) => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-hover-card]')]
    const index = cards.indexOf(cardRef.current as HTMLElement)
    cards[index + direction]?.focus({ preventScroll: true })
  }, [])

  const onCardKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (pinned && event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveCardFocus(1)
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveCardFocus(-1)
    }
  }, [moveCardFocus, onClose, pinned])

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

  const nested = machine.card
  const htmlObj = useMemo(() => ({ __html: html }), [html])
  const { links: backlinks } = useNoteBacklinks(card.noteId && !card.missing ? card.noteId : null)

  return createPortal(
    <div
      ref={cardRef}
      id={describedBy}
      role={pinned ? 'dialog' : 'tooltip'}
      aria-label={pinned ? card.title : undefined}
      tabIndex={-1}
      data-hover-card
      onMouseEnter={() => {
        machine.clearPendingHide()
        if (!pinned) onEnter()
      }}
      onMouseLeave={() => {
        machine.armHide()
        if (!pinned) onLeave()
      }}
      onMouseMove={machine.handleMouseMove}
      onClick={pinned ? undefined : stop}
      onKeyDown={onCardKeyDown}
      className={cn(
        'anim-pop fixed flex min-w-0 flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-pop)]',
        pinned ? '' : 'z-[270] w-[340px] max-w-[calc(100vw-24px)]',
        pinned && flash && 'pinned-window-flash',
      )}
      style={pinned
        ? {
            left: pinnedRect.x,
            top: pinnedRect.y,
            width: pinnedRect.width,
            height: pinnedRect.height || undefined,
            zIndex: 280 + (pinnedInit?.z ?? 0),
          }
        : position
          ? { top: position.top, left: position.left }
          : { top: 0, left: 0, visibility: 'hidden' }}
    >
      <div
        className={cn(
          'flex items-start gap-1 border-b border-[var(--border-subtle)] px-3 py-2',
          pinned && 'cursor-move select-none touch-none',
        )}
        onPointerDown={pinned ? beginDrag : undefined}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[12.5px] leading-snug font-semibold text-[var(--text-primary)]',
            card.missing && 'text-[var(--text-tertiary)]',
          )}
          title={card.title}
        >
          {card.title || t("preview.untitled")}
        </span>
        {pinned && stackCount > 1 && stackFront && (
          <button
            ref={stackButtonRef}
            type="button"
            aria-label={t("preview.pinned_windows")}
            title={t("preview.pinned_windows")}
            onClick={() => setStackMenuOpen((value) => !value)}
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Layers size={13} />
            <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--accent)] px-0.5 text-[9px] font-semibold text-[var(--bg-overlay)]">
              {stackCount}
            </span>
          </button>
        )}
        {pinned && card.noteId && (
          <>
            <button
              type="button"
              aria-label={t("preview.open_in_current_pane")}
              title={t("preview.open_in_current_pane")}
              onClick={openInCurrentPane}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PanelLeftOpen size={13} />
            </button>
            <button
              type="button"
              aria-label={t("preview.open_in_side_pane")}
              title={t("preview.open_in_side_pane")}
              onClick={openInSidePane}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PanelRightOpen size={13} />
            </button>
          </>
        )}
        {pinned
          ? (
            <button
              type="button"
              aria-label={t("common.close")}
              title={t("common.close")}
              onClick={onClose}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X size={13} />
            </button>
          )
          : (
            <button
              type="button"
              aria-label={t("preview.pin_card")}
              title={t("preview.pin_card")}
              onClick={handlePin}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Pin size={13} />
            </button>
          )}
      </div>
      {status === 'loading' && (
        <div className="flex h-24 items-center justify-center text-[var(--text-quaternary)]">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}
      {status === 'missing' && (
        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)]">
          {t("preview.note_does_not_exist")}
        </div>
      )}
      {status === 'error' && (
        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)]">
          {t("preview.could_not_load_note")}
        </div>
      )}
      {status === 'ready' && (<>
        <div className={cn(
          'wiki-hover-body min-h-0 overflow-y-auto overscroll-contain px-3 py-2.5',
          pinned && pinnedRect.height ? 'flex-1' : 'max-h-[300px]',
        )}>
          <div className="ink-prose" dangerouslySetInnerHTML={htmlObj} />
        </div>
        {truncated && (
          <div className="border-t border-[var(--border-subtle)] px-3 py-1.5 text-center text-[11px] tracking-widest text-[var(--text-quaternary)]">
            ···
          </div>
        )}
      </>)}
      {backlinks && backlinks.length > 0 && (
        <CardBacklinks links={backlinks} onOpen={openBacklink} />
      )}
      {pinned && (
        <div
          aria-label={t("preview.resize_card")}
          title={t("preview.resize_card")}
          onPointerDown={beginResize}
          className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize touch-none"
        >
          <div className="absolute right-1 bottom-1 h-2 w-2 rounded-sm border-r-2 border-b-2 border-[var(--border-strong)]" />
        </div>
      )}
      {nested && (
        <WikiLinkHoverCard
          card={nested}
          path={nested.noteId ? [...path, nested.noteId] : path}
          depth={depth + 1}
          dark={dark}
          onClose={machine.hideNow}
          onEnter={machine.clearPendingHide}
          onLeave={machine.armHide}
          onPin={onPin}
        />
      )}
      {pinned && (
        <Menu
          anchor={stackButtonRef}
          open={stackMenuOpen}
          onClose={() => setStackMenuOpen(false)}
          items={stackItems}
          align="end"
          width={220}
          zIndex={300}
          label={t("preview.pinned_windows")}
        />
      )}
    </div>,
    document.body,
  )
})

function CardBacklinks({ links, onOpen }: {
  links: Array<{ id: string; title: string; context: string }>
  onOpen: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={t("common.backlinks")}
        onClick={() => setExpanded((value) => !value)}
        className="flex h-7 w-full items-center gap-1.5 px-3 text-[11px] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Link2 size={11} className="shrink-0" />
        <span className="truncate">{t("common.backlinks")}</span>
        <span className="tabular-nums text-[var(--text-quaternary)]">{links.length}</span>
        <ChevronDown size={12} className={cn('ml-auto shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <ul className="max-h-[132px] overflow-y-auto overscroll-contain px-1.5 pb-1.5">
          {links.map((link) => (
            <li key={link.id}>
              <button
                type="button"
                onClick={() => onOpen(link.id)}
                className="group w-full rounded-[var(--r-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className="block truncate text-[11.5px] font-medium text-[var(--text-primary)]">{link.title}</span>
                <span className="mt-0.5 block truncate-2 text-[10.5px] leading-relaxed text-[var(--text-tertiary)]">{link.context}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function placeHoverCard(anchor: DOMRect, card: DOMRect): { top: number; left: number } {
  const gap = 8
  const padding = 10
  const viewport = getVisibleViewport()
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max))
  const left = clamp(anchor.left, viewport.left + padding, viewport.right - card.width - padding)
  const fitsBelow = anchor.bottom + gap + card.height <= viewport.bottom - padding
  const fitsAbove = anchor.top - gap - card.height >= viewport.top + padding
  const top = fitsBelow || !fitsAbove ? anchor.bottom + gap : anchor.top - gap - card.height
  return { top, left }
}