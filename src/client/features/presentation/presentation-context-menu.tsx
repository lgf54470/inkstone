import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  LayoutGrid,
  Maximize,
  Minimize,
  Moon,
  PanelLeft,
  Presentation,
  Radio,
  Sun,
  SunMedium,
  X,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import { Z_INDEX } from '../../lib/z-index'
import { Menu, type MenuItem } from '../../components/overlay'
import { isSafeSlideLinkHref } from './presentation-state'

export interface PresentationMenuItemsOptions {
  linkUrl: string | null
  slideIndex: number
  slideCount: number
  subPage: number
  pageCount: number
  railOpen: boolean
  overview: boolean
  following: boolean
  isFullscreen: boolean
  laser: boolean
  spotlight: boolean
  screenCover: 'black' | 'white' | null
  onPrev: () => void
  onNext: () => void
  onToggleRail: () => void
  onToggleOverview: () => void
  onToggleFollowing: () => void
  onToggleFullscreen: () => void
  onOpenPresenter: () => void
  onToggleLaser: () => void
  onToggleSpotlight: () => void
  onToggleBlackout: () => void
  onToggleWhiteout: () => void
  onExit: () => void
}

// The href comes out of the rendered note, so these two items exist only for a protocol the projector is
// willing to open. Left click and right click are one action on one href; they must not be two judgements.
function buildLinkItems(linkUrl: string | null): MenuItem[] {
  if (!isSafeSlideLinkHref(linkUrl)) return []
  return [
    {
      id: 'link-open',
      label: t('contextmenu.link_open'),
      icon: <ExternalLink size={14} />,
      onSelect: () => window.open(linkUrl, '_blank', 'noopener,noreferrer'),
    },
    {
      id: 'link-copy',
      label: t('contextmenu.link_copy'),
      icon: <Copy size={14} />,
      onSelect: () => {
        // Best-effort clipboard copy: environment or permission restrictions may reject writing.
        navigator.clipboard?.writeText(linkUrl).catch(() => {})
      },
    },
  ]
}

function buildNavigationItems(options: PresentationMenuItemsOptions): MenuItem[] {
  const isFirst = options.slideIndex === 0 && options.subPage === 0
  const isLast = options.slideIndex === options.slideCount - 1 && options.subPage === options.pageCount - 1
  return [
    {
      id: 'prev',
      label: t('workspace.presentation_prev'),
      combo: 'arrowleft',
      icon: <ChevronLeft size={14} />,
      disabled: isFirst,
      onSelect: options.onPrev,
      separatorBefore: isSafeSlideLinkHref(options.linkUrl),
    },
    {
      id: 'next',
      label: t('workspace.presentation_next'),
      combo: 'arrowright',
      icon: <ChevronRight size={14} />,
      disabled: isLast,
      onSelect: options.onNext,
    },
  ]
}

function buildViewItems(options: PresentationMenuItemsOptions): MenuItem[] {
  return [
    {
      id: 'overview',
      label: t('workspace.presentation_overview'),
      combo: 'g',
      icon: <LayoutGrid size={14} />,
      checked: options.overview,
      onSelect: options.onToggleOverview,
      separatorBefore: true,
    },
    {
      id: 'rail',
      label: t('workspace.presentation_slides'),
      combo: 's',
      icon: <PanelLeft size={14} />,
      checked: options.railOpen,
      onSelect: options.onToggleRail,
    },
    {
      id: 'presenter',
      label: t('workspace.presentation_presenter'),
      combo: 'p',
      icon: <Presentation size={14} />,
      onSelect: options.onOpenPresenter,
    },
  ]
}

function buildToolItems(options: PresentationMenuItemsOptions): MenuItem[] {
  return [
    {
      id: 'laser',
      label: t('workspace.presentation_laser'),
      combo: 'c',
      icon: <CircleDot size={14} />,
      checked: options.laser,
      onSelect: options.onToggleLaser,
      separatorBefore: true,
    },
    {
      id: 'spotlight',
      label: t('workspace.presentation_spotlight'),
      combo: 't',
      icon: <Sun size={14} />,
      checked: options.spotlight,
      onSelect: options.onToggleSpotlight,
    },
    {
      id: 'blackout',
      label: t('workspace.presentation_blackout'),
      combo: 'b',
      icon: <Moon size={14} />,
      checked: options.screenCover === 'black',
      onSelect: options.onToggleBlackout,
    },
    {
      id: 'whiteout',
      label: t('workspace.presentation_whiteout'),
      combo: 'w',
      icon: <SunMedium size={14} />,
      checked: options.screenCover === 'white',
      onSelect: options.onToggleWhiteout,
    },
  ]
}

function buildSessionAndExitItems(options: PresentationMenuItemsOptions): MenuItem[] {
  return [
    {
      id: 'follow',
      label: t('workspace.presentation_follow'),
      combo: 'l',
      icon: <Radio size={14} />,
      checked: options.following,
      onSelect: options.onToggleFollowing,
      separatorBefore: true,
    },
    {
      id: 'fullscreen',
      label: options.isFullscreen ? t('workspace.presentation_exit_fullscreen') : t('workspace.presentation_fullscreen'),
      combo: 'f',
      icon: options.isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />,
      checked: options.isFullscreen,
      onSelect: options.onToggleFullscreen,
    },
    {
      id: 'exit',
      label: t('workspace.presentation_exit'),
      combo: 'esc',
      icon: <X size={14} />,
      tone: 'danger',
      onSelect: options.onExit,
      separatorBefore: true,
    },
  ]
}

export function buildPresentationMenuItems(options: PresentationMenuItemsOptions): MenuItem[] {
  return [
    ...buildLinkItems(options.linkUrl),
    ...buildNavigationItems(options),
    ...buildViewItems(options),
    ...buildToolItems(options),
    ...buildSessionAndExitItems(options),
  ]
}

export function extractLinkHref(anchor: Element | null | undefined): string | null {
  if (!anchor) return null
  const attr = anchor.getAttribute('href')
  if (attr) return attr
  const rawHref: unknown = Reflect.get(anchor, 'href')
  if (typeof rawHref === 'string') return rawHref
  if (rawHref && typeof rawHref === 'object' && 'baseVal' in rawHref) {
    const baseVal = Reflect.get(rawHref, 'baseVal')
    return typeof baseVal === 'string' && baseVal ? baseVal : null
  }
  return null
}

export function extractAnchorHrefFromPoint(x: number, y: number, fallbackTarget: Element | null): string | null {
  if (typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function') {
    const elements = document.elementsFromPoint(x, y)
    for (const el of elements) {
      if (el.hasAttribute('data-presentation-menu-backdrop') || el.closest('[role="menu"]')) {
        continue
      }
      const anchor = el.closest<HTMLAnchorElement>('a[href]')
      if (anchor) return extractLinkHref(anchor)
    }
  }
  const fallbackAnchor = fallbackTarget?.closest<HTMLAnchorElement>('a[href]')
  return extractLinkHref(fallbackAnchor)
}

export interface PresentationContextMenuProps extends PresentationMenuItemsOptions {
  point: { x: number; y: number } | null
  onClose: () => void
  onReopen: (point: { x: number; y: number }, linkUrl: string | null) => void
  container?: HTMLElement | null
}

export function PresentationContextMenu(props: PresentationContextMenuProps) {
  const { point, linkUrl, onClose, onReopen, container, ...options } = props
  if (!point) return null

  const items = buildPresentationMenuItems({ ...options, linkUrl })
  const targetContainer = container ?? (typeof document !== 'undefined' ? document.body : null)
  if (!targetContainer) return null

  return (
    <>
      {createPortal(
        <div
          data-presentation-menu-backdrop
          tabIndex={-1}
          style={{ zIndex: Z_INDEX.menu }}
          className='fixed top-0 left-0 w-full h-full z-[var(--z-pop)] cursor-default select-none'
          onMouseDown={(e) => {
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const resolvedLink = extractAnchorHrefFromPoint(e.clientX, e.clientY, e.target as Element | null)
            onReopen({ x: e.clientX, y: e.clientY }, resolvedLink)
          }}
        />,
        targetContainer
      )}
      <Menu
        open={Boolean(point)}
        anchor={point}
        items={items}
        onClose={onClose}
        container={targetContainer}
        zIndex={Z_INDEX.menu + 1}
        label={t('workspace.presentation_context_menu')}
      />
    </>
  )
}
