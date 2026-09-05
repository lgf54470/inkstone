import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import type { MenuItem } from '../../components/overlay'
import { usePinnedWindows, type PersistedPinnedWindow } from '../../store/pinned-windows'
import { WikiLinkHoverCard, type WikiLinkHoverCardState } from './WikiLinkHoverCard'

const anchorCache = new Map<number, HTMLElement>()

function anchorFor(id: number): HTMLElement {
  let anchor = anchorCache.get(id)
  if (!anchor) {
    anchor = document.createElement('span')
    anchorCache.set(id, anchor)
  }
  return anchor
}

function itemToCard(item: PersistedPinnedWindow): WikiLinkHoverCardState {
  return {
    anchor: anchorFor(item.id),
    title: item.title,
    noteId: item.noteId,
    missing: item.missing,
    headline: item.headline,
  }
}

export const PinnedWindowsLayer = memo(function PinnedWindowsLayer() {
  const items = usePinnedWindows((s) => s.items)
  const flashId = usePinnedWindows((s) => s.flashId)
  const pin = usePinnedWindows((s) => s.pin)
  const close = usePinnedWindows((s) => s.close)
  const bringToFront = usePinnedWindows((s) => s.bringToFront)
  const closeAll = usePinnedWindows((s) => s.closeAll)
  const closeFront = usePinnedWindows((s) => s.closeFront)
  const updateGeometry = usePinnedWindows((s) => s.updateGeometry)
  const [isDark, setIsDark] = useState(() => (document.documentElement.dataset.theme ?? 'dark') === 'dark')

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark((document.documentElement.dataset.theme ?? 'dark') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const cards = useMemo(() => items.map((item) => ({
    item,
    card: itemToCard(item),
  })), [items])

  const frontId = useMemo(() => {
    return items.reduce<PersistedPinnedWindow | null>((top, item) => !top || item.z > top.z ? item : top, null)?.id ?? null
  }, [items])

  const stackItems: MenuItem[] = useMemo(() => [
    ...items.map((item) => ({
      id: `pin-${item.id}`,
      label: item.title || t("preview.untitled"),
      checked: item.id === frontId,
      onSelect: () => bringToFront(item.id),
    })),
    {
      id: 'close-all',
      label: t("preview.close_all_pinned"),
      tone: 'danger' as const,
      separatorBefore: true,
      onSelect: () => closeAll(),
    },
  ], [bringToFront, closeAll, frontId, items])

  const handleEscapeRef = useRef(closeFront)
  handleEscapeRef.current = closeFront

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as Element | null
      if (target && typeof target.closest === 'function' && target.closest('[role="menu"]')) {
        handleEscapeRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  if (!items.length) return null

  return (
    <>
      {cards.map(({ item, card }) => (
        <WikiLinkHoverCard
          key={item.id}
          card={card}
          path={card.noteId ? [card.noteId] : []}
          depth={1}
          dark={isDark}
          pinned
          pinnedInit={item}
          stackCount={items.length}
          stackFront={item.id === frontId}
          stackItems={stackItems}
          onClose={() => close(item.id)}
          onEnter={() => {}}
          onLeave={() => {}}
          onPin={(cardState, rect) => pin(cardState, rect)}
          onGeometryChange={(geometry) => updateGeometry(item.id, geometry)}
          flash={flashId === item.id}
        />
      ))}
    </>
  )
})
