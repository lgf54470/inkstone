import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import {
  buildPresentationMenuItems,
  extractLinkHref,
  PresentationContextMenu,
  type PresentationContextMenuProps,
  type PresentationMenuItemsOptions,
} from './presentation-context-menu'

const baseOptions = (): PresentationMenuItemsOptions => ({
  linkUrl: null,
  slideIndex: 1,
  slideCount: 5,
  subPage: 0,
  pageCount: 1,
  railOpen: false,
  overview: false,
  following: false,
  isFullscreen: false,
  laser: false,
  spotlight: false,
  screenCover: null,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onToggleRail: vi.fn(),
  onToggleOverview: vi.fn(),
  onToggleFollowing: vi.fn(),
  onToggleFullscreen: vi.fn(),
  onOpenPresenter: vi.fn(),
  onToggleLaser: vi.fn(),
  onToggleSpotlight: vi.fn(),
  onToggleBlackout: vi.fn(),
  onToggleWhiteout: vi.fn(),
  onExit: vi.fn(),
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('buildPresentationMenuItems — item composition', () => {
  it('builds standard presentation menu items when there is no link', () => {
    const opts = baseOptions()
    const items = buildPresentationMenuItems(opts)
    const ids = items.map((i) => i.id)
    expect(ids).toEqual([
      'prev',
      'next',
      'overview',
      'rail',
      'presenter',
      'laser',
      'spotlight',
      'blackout',
      'whiteout',
      'follow',
      'fullscreen',
      'exit',
    ])
    expect(items.find((i) => i.id === 'prev')?.separatorBefore).toBe(false)
  })

  it('prepends link open and copy items when linkUrl is present', () => {
    const opts = { ...baseOptions(), linkUrl: 'https://example.com/demo' }
    const items = buildPresentationMenuItems(opts)
    const ids = items.map((i) => i.id)
    expect(ids[0]).toBe('link-open')
    expect(ids[1]).toBe('link-copy')
    expect(items.find((i) => i.id === 'prev')?.separatorBefore).toBe(true)
  })
})

describe('buildPresentationMenuItems — link actions', () => {
  it('triggers window.open on selecting link-open', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const opts = { ...baseOptions(), linkUrl: 'https://example.com/demo' }
    const items = buildPresentationMenuItems(opts)
    const linkOpen = items.find((i) => i.id === 'link-open')
    linkOpen?.onSelect?.()
    expect(openSpy).toHaveBeenCalledWith('https://example.com/demo', '_blank', 'noopener,noreferrer')
    openSpy.mockRestore()
  })

  it('triggers clipboard writeText on selecting link-copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const opts = { ...baseOptions(), linkUrl: 'https://example.com/copy-me' }
    const items = buildPresentationMenuItems(opts)
    const linkCopy = items.find((i) => i.id === 'link-copy')
    linkCopy?.onSelect?.()
    expect(writeText).toHaveBeenCalledWith('https://example.com/copy-me')
  })

  it('extracts link href safely from DOM anchor, SVG anchor, or returns null', () => {
    expect(extractLinkHref(null)).toBeNull()

    const standardAnchor = document.createElement('a')
    standardAnchor.setAttribute('href', 'https://inkstone.app/docs')
    expect(extractLinkHref(standardAnchor)).toBe('https://inkstone.app/docs')

    const svgAnchor = {
      getAttribute: (attr: string) => (attr === 'href' ? 'https://svg.example.com' : null),
      href: { baseVal: 'https://svg.example.com', animVal: 'https://svg.example.com' },
    } as unknown as HTMLAnchorElement
    expect(extractLinkHref(svgAnchor)).toBe('https://svg.example.com')
  })
})

describe('buildPresentationMenuItems — pagination bounds', () => {
  it('disables prev item when on the first slide and subpage', () => {
    const opts = { ...baseOptions(), slideIndex: 0, subPage: 0 }
    const items = buildPresentationMenuItems(opts)
    expect(items.find((i) => i.id === 'prev')?.disabled).toBe(true)
    expect(items.find((i) => i.id === 'next')?.disabled).toBe(false)
  })

  it('disables next item when on the final slide and subpage', () => {
    const opts = { ...baseOptions(), slideIndex: 4, slideCount: 5, subPage: 1, pageCount: 2 }
    const items = buildPresentationMenuItems(opts)
    expect(items.find((i) => i.id === 'prev')?.disabled).toBe(false)
    expect(items.find((i) => i.id === 'next')?.disabled).toBe(true)
  })

  it('enables both prev and next when in the middle of a deck', () => {
    const opts = { ...baseOptions(), slideIndex: 2, slideCount: 5, subPage: 0, pageCount: 1 }
    const items = buildPresentationMenuItems(opts)
    expect(items.find((i) => i.id === 'prev')?.disabled).toBe(false)
    expect(items.find((i) => i.id === 'next')?.disabled).toBe(false)
  })
})

describe('buildPresentationMenuItems — checked states', () => {
  it('reflects active checked state for toggles and covers', () => {
    const opts = {
      ...baseOptions(),
      railOpen: true,
      overview: true,
      following: true,
      isFullscreen: true,
      laser: true,
      spotlight: true,
      screenCover: 'black' as const,
    }
    const items = buildPresentationMenuItems(opts)
    expect(items.find((i) => i.id === 'rail')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'overview')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'follow')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'fullscreen')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'laser')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'spotlight')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'blackout')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'whiteout')?.checked).toBe(false)
  })
})

describe('buildPresentationMenuItems — item selection callbacks', () => {
  it('invokes corresponding action callbacks when items are selected', () => {
    const opts = baseOptions()
    const items = buildPresentationMenuItems(opts)
    items.find((i) => i.id === 'prev')?.onSelect?.()
    items.find((i) => i.id === 'next')?.onSelect?.()
    items.find((i) => i.id === 'overview')?.onSelect?.()
    items.find((i) => i.id === 'rail')?.onSelect?.()
    items.find((i) => i.id === 'presenter')?.onSelect?.()
    items.find((i) => i.id === 'laser')?.onSelect?.()
    items.find((i) => i.id === 'spotlight')?.onSelect?.()
    items.find((i) => i.id === 'blackout')?.onSelect?.()
    items.find((i) => i.id === 'whiteout')?.onSelect?.()
    items.find((i) => i.id === 'follow')?.onSelect?.()
    items.find((i) => i.id === 'fullscreen')?.onSelect?.()
    items.find((i) => i.id === 'exit')?.onSelect?.()

    expect(opts.onPrev).toHaveBeenCalledTimes(1)
    expect(opts.onNext).toHaveBeenCalledTimes(1)
    expect(opts.onToggleOverview).toHaveBeenCalledTimes(1)
    expect(opts.onToggleRail).toHaveBeenCalledTimes(1)
    expect(opts.onOpenPresenter).toHaveBeenCalledTimes(1)
    expect(opts.onToggleLaser).toHaveBeenCalledTimes(1)
    expect(opts.onToggleSpotlight).toHaveBeenCalledTimes(1)
    expect(opts.onToggleBlackout).toHaveBeenCalledTimes(1)
    expect(opts.onToggleWhiteout).toHaveBeenCalledTimes(1)
    expect(opts.onToggleFollowing).toHaveBeenCalledTimes(1)
    expect(opts.onToggleFullscreen).toHaveBeenCalledTimes(1)
    expect(opts.onExit).toHaveBeenCalledTimes(1)
  })
})

describe('PresentationContextMenu — component rendering', () => {
  it('renders nothing when point is null', () => {
    const props: PresentationContextMenuProps = {
      ...baseOptions(),
      point: null,
      onClose: vi.fn(),
      onReopen: vi.fn(),
    }
    const view = renderElement(createElement(PresentationContextMenu, props))
    expect(document.querySelector('[data-presentation-menu-backdrop]')).toBeNull()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    view.unmount()
  })

  it('renders backdrop and menu into custom container when point is provided', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const props: PresentationContextMenuProps = {
      ...baseOptions(),
      point: { x: 150, y: 220 },
      container,
      onClose: vi.fn(),
      onReopen: vi.fn(),
    }
    const view = renderElement(createElement(PresentationContextMenu, props))
    const backdrop = container.querySelector('[data-presentation-menu-backdrop]')
    const menu = container.querySelector('[role="menu"]')
    expect(backdrop).toBeTruthy()
    expect(menu).toBeTruthy()
    expect(backdrop?.className).toContain('cursor-default')
    view.unmount()
  })
})

describe('PresentationContextMenu — backdrop interaction', () => {
  it('intercepts click on backdrop and closes without penetrating to underlying elements', () => {
    const onClose = vi.fn()
    const props: PresentationContextMenuProps = {
      ...baseOptions(),
      point: { x: 100, y: 100 },
      onClose,
      onReopen: vi.fn(),
    }
    const view = renderElement(createElement(PresentationContextMenu, props))
    const backdrop = document.querySelector('[data-presentation-menu-backdrop]')
    expect(backdrop).toBeTruthy()

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    backdrop?.dispatchEvent(clickEvent)
    expect(clickEvent.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('reopens menu at new coordinate when right clicking on backdrop', () => {
    const onReopen = vi.fn()
    const props: PresentationContextMenuProps = {
      ...baseOptions(),
      point: { x: 100, y: 100 },
      onClose: vi.fn(),
      onReopen,
    }
    const view = renderElement(createElement(PresentationContextMenu, props))
    const backdrop = document.querySelector('[data-presentation-menu-backdrop]')
    expect(backdrop).toBeTruthy()

    const contextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 250,
      clientY: 320,
    })
    backdrop?.dispatchEvent(contextEvent)
    expect(contextEvent.defaultPrevented).toBe(true)
    expect(onReopen).toHaveBeenCalledWith({ x: 250, y: 320 }, null)
    view.unmount()
  })
})

describe('PresentationContextMenu — backdrop link and stacking', () => {
  it('reopens menu with extracted link when right clicking over an underlying anchor via elementsFromPoint', () => {
    const onReopen = vi.fn()
    const props: PresentationContextMenuProps = {
      ...baseOptions(),
      point: { x: 100, y: 100 },
      onClose: vi.fn(),
      onReopen,
    }
    const view = renderElement(createElement(PresentationContextMenu, props))
    const backdrop = document.querySelector('[data-presentation-menu-backdrop]')
    expect(backdrop).toBeTruthy()

    const anchor = document.createElement('a')
    anchor.setAttribute('href', 'https://example.com/slide-link')
    document.body.append(anchor)

    const originalElementsFromPoint = document.elementsFromPoint
    document.elementsFromPoint = vi.fn().mockReturnValue([backdrop, anchor])

    const contextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      clientY: 400,
    })
    backdrop?.dispatchEvent(contextEvent)
    expect(contextEvent.defaultPrevented).toBe(true)
    expect(onReopen).toHaveBeenCalledWith({ x: 300, y: 400 }, 'https://example.com/slide-link')

    document.elementsFromPoint = originalElementsFromPoint
    anchor.remove()
    view.unmount()
  })

  it('sets backdrop z-index to Z_INDEX.menu to ensure it stacks above slide overlays and overview grid', () => {
    const props: PresentationContextMenuProps = {
      ...baseOptions(),
      point: { x: 50, y: 50 },
      onClose: vi.fn(),
      onReopen: vi.fn(),
    }
    const view = renderElement(createElement(PresentationContextMenu, props))
    const backdrop = document.querySelector<HTMLElement>('[data-presentation-menu-backdrop]')
    expect(backdrop?.style.zIndex).toBe('260')
    view.unmount()
  })
})
