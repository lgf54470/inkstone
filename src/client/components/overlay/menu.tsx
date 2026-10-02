import { useRef, useState, useMemo, useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Check, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { Z_INDEX } from '../../lib/z-index'
import { IconButton } from '../primitives'
import { useEscape, useClickOutside } from './hooks'
import { MenuRow } from './menu-row'
import { useCursorFocus, useFocusRestore, useMenuActionKeys, useMenuCursorKeys, useMenuPosition, useMenuReset, useSubmenuPosition, type MenuItem } from './use-menu'
import { filterMenuItems, usePinyin, preloadPinyin, type ToolbarSearchAction } from './menu-search'

const SUBMENU_STACK_DELTA = 10

interface MenuItemRowProps {
  item: MenuItem
  index: number
  cursor: number
  onHover: (index: number, item: MenuItem, element: HTMLElement) => void
  onClick: (item: MenuItem, element: HTMLElement) => void
}

function MenuItemRow({ item, index, cursor, onHover, onClick }: MenuItemRowProps) {
  return (<div key={item.id}>
    {index > 0 && item.separatorBefore && <div role='separator' className='my-1 h-px bg-[var(--border-subtle)]'/>}
    <MenuRow
      item={item}
      tabIndex={index === cursor ? 0 : -1}
      data-menu-index={index}
      onMouseEnter={(e) => {
        if (!item.disabled)
          onHover(index, item, e.currentTarget)
      }}
      onClick={(e) => onClick(item, e.currentTarget)}
      // The mark the menu draws on its checked row, and the arrow it pushes to the far edge. The mark
      // is an icon rather than a tick character: the row is already a `menuitemcheckbox`, so a literal
      // check would be read out a second time and would join the accessible name.
      check={<Check size={13} aria-hidden className='shrink-0 text-[var(--accent)]' />}
      arrowClassName='ml-auto'
      className={cn(index === cursor ? 'bg-[var(--bg-hover)]' : '', item.tone === 'danger'
        ? 'text-[var(--danger)]'
        : index === cursor
          ? 'text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)]')}
    />
  </div>)
}

export function Menu({ anchor, open, onClose, items, align = 'start', width = 208, label = t('overlay.menu'), zIndex, panelId, header, toolbarActions, searchable = false, searchPlaceholder }: {
  anchor: RefObject<HTMLElement | null> | {
    x: number
    y: number
  }
  open: boolean
  onClose: () => void
  items: MenuItem[]
  align?: 'start' | 'end'
  width?: number
  label?: string
  zIndex?: number
  // Optional: only callers that pair the menu with a trigger need the id, and the
  // rest must not be made to invent one.
  panelId?: string
  header?: React.ReactNode
  toolbarActions?: ToolbarSearchAction[]
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; origin: string }>({ top: 0, left: 0, origin: 'top left' })
  const [cursor, setCursor] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null)
  const [submenuAnchorRect, setSubmenuAnchorRect] = useState<DOMRect | null>(null)
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const anchorRef = 'current' in anchor ? anchor : null
  const menuWidth = Math.min(width, Math.max(0, innerWidth - 16))
  const pinyinFn = usePinyin()

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
    } else if (searchable) {
      void preloadPinyin()
    }
  }, [open, searchable])

  const filteredItems = useMemo(
    () => (searchable ? filterMenuItems(items, searchQuery, pinyinFn, toolbarActions) : items),
    [items, searchQuery, searchable, pinyinFn, toolbarActions],
  )

  useEffect(() => {
    if (searchable) {
      setCursor(filteredItems.findIndex((i) => !i.disabled))
    }
  }, [searchQuery, searchable, filteredItems])

  useMenuReset(open, setActiveSubmenuId, setSubmenuAnchorRect)
  useMenuPosition(open, anchor, align, menuWidth, filteredItems, setPosition, setCursor, Boolean(header), searchable)
  useSubmenuPosition(activeSubmenuId, submenuAnchorRect, menuRef, submenuRef, setSubmenuPos)
  useEscape(open, onClose)
  useClickOutside(anchorRef ? [menuRef, anchorRef, submenuRef] : [menuRef, submenuRef], open, onClose)
  useFocusRestore(open)
  useCursorFocus(open, cursor, menuRef)
  useMenuCursorKeys(open, filteredItems, setCursor, submenuRef, menuRef, (char) => setSearchQuery((q) => q + char))
  useMenuActionKeys(open, filteredItems, cursor, onClose, menuRef, submenuRef, setActiveSubmenuId, setSubmenuAnchorRect)

  const { handleHover, handleClick } = useMenuInteractions(setCursor, setActiveSubmenuId, setSubmenuAnchorRect, onClose)
  if (!open)
    return null
  const activeItem = filteredItems.find((i) => i.id === activeSubmenuId)
  return (<>
    {createPortal(<div
      ref={menuRef}
      id={panelId}
      role='menu'
      aria-label={label}
      tabIndex={-1}
      onWheel={(e) => {
        if (scrollContainerRef.current && !scrollContainerRef.current.contains(e.target as Node)) {
          scrollContainerRef.current.scrollTop += e.deltaY
        }
      }}
      className='anim-pop fixed z-[var(--z-pop)] flex flex-col max-h-105 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none'
      style={{ top: position.top, left: position.left, width: menuWidth, transformOrigin: position.origin, zIndex }}
    >
      {header && <div className='shrink-0'>{header}</div>}
      {searchable && (
        <div className='shrink-0 px-1 pt-0.5 pb-1 mb-1 border-b border-[var(--border-subtle)]'>
          <div className='relative flex items-center'>
            <Search size={13} className='absolute left-2 text-[var(--text-tertiary)] pointer-events-none' />
            <input
              ref={searchInputRef}
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.key === 'Process') return

                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const firstEnabledIdx = filteredItems.findIndex((i) => !i.disabled)
                  if (firstEnabledIdx >= 0) {
                    setCursor(firstEnabledIdx)
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const toolbar = menuRef.current?.querySelector<HTMLElement>('[role="toolbar"] button:not(:disabled)')
                  if (toolbar) {
                    toolbar.focus()
                    setCursor(-1)
                  } else {
                    const lastEnabledIdx = filteredItems.map((item, idx) => item.disabled ? -1 : idx).filter((i) => i >= 0).pop()
                    if (lastEnabledIdx !== undefined) {
                      setCursor(lastEnabledIdx)
                    }
                  }
                } else if (e.key === 'Tab') {
                  e.preventDefault()
                  if (e.shiftKey) {
                    const toolbar = menuRef.current?.querySelector<HTMLElement>('[role="toolbar"] button:not(:disabled)')
                    if (toolbar) {
                      toolbar.focus()
                      setCursor(-1)
                    }
                  } else {
                    const firstEnabledIdx = filteredItems.findIndex((i) => !i.disabled)
                    if (firstEnabledIdx >= 0) {
                      setCursor(firstEnabledIdx)
                    }
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const firstActionable = filteredItems.find((i) => !i.disabled && (i.onSelect || i.submenu))
                  if (firstActionable) {
                    if (firstActionable.onSelect) {
                      firstActionable.onSelect()
                      onClose()
                    } else if (firstActionable.submenu) {
                      setActiveSubmenuId(firstActionable.id)
                      const row = menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${filteredItems.indexOf(firstActionable)}"]`)
                      if (row) setSubmenuAnchorRect(row.getBoundingClientRect())
                    }
                  }
                } else if (e.key === 'Escape') {
                  if (searchQuery) {
                    e.preventDefault()
                    e.stopPropagation()
                    setSearchQuery('')
                  }
                }
              }}
              placeholder={searchPlaceholder ?? t('contextmenu.search_placeholder')}
              className='w-full h-7 pl-6.5 pr-6 text-xs bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] rounded-[var(--r-sm)] border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:outline-none transition-colors'
              autoFocus
            />
            {searchQuery && (
              <IconButton
                label={t('contextmenu.clear_search')}
                size='sm'
                variant='ghost'
                onClick={() => {
                  setSearchQuery('')
                  searchInputRef.current?.focus()
                }}
                className='absolute right-1 size-5 md:size-5 p-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              >
                <X size={12} />
              </IconButton>
            )}
          </div>
        </div>
      )}
      <div
        ref={scrollContainerRef}
        role='none'
        onScroll={() => setActiveSubmenuId(null)}
        className='flex-1 overflow-y-auto min-h-0'
      >
        {filteredItems.length === 0 ? (
          <div className='py-4 text-center text-xs text-[var(--text-tertiary)]'>
            {t('contextmenu.no_results')}
          </div>
        ) : (
          filteredItems.map((item, index) => (<MenuItemRow key={item.id} item={item} index={index} cursor={cursor} onHover={handleHover} onClick={handleClick}/>))
        )}
      </div>
    </div>, document.body)}
    {activeItem && activeItem.submenu && (<MenuSubmenu
      submenu={activeItem.submenu}
      submenuRef={submenuRef}
      submenuPos={submenuPos}
      zIndex={zIndex}
      onClose={onClose}
      onEsc={() => {
        setActiveSubmenuId(null)
        menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`)?.focus({ preventScroll: true })
      }}
    />)}
  </>)
}

function useMenuInteractions(setCursor: React.Dispatch<React.SetStateAction<number>>, setActiveSubmenuId: React.Dispatch<React.SetStateAction<string | null>>, setSubmenuAnchorRect: React.Dispatch<React.SetStateAction<DOMRect | null>>, onClose: () => void) {
  const handleHover = (index: number, item: MenuItem, element: HTMLElement) => {
    setCursor(index)
    if (item.submenu) {
      setActiveSubmenuId(item.id)
      setSubmenuAnchorRect(element.getBoundingClientRect())
    }
    else {
      setActiveSubmenuId(null)
      setSubmenuAnchorRect(null)
    }
  }
  const handleClick = (item: MenuItem, element: HTMLElement) => {
    if (item.submenu) {
      setActiveSubmenuId((curr) => curr === item.id ? null : item.id)
      setSubmenuAnchorRect(element.getBoundingClientRect())
      return
    }
    item.onSelect?.()
    onClose()
  }
  return { handleHover, handleClick }
}

function MenuSubmenu({ submenu, submenuRef, submenuPos, zIndex, onClose, onEsc }: {
  submenu: Exclude<MenuItem['submenu'], undefined>
  submenuRef: React.RefObject<HTMLDivElement | null>
  submenuPos: { top: number; left: number }
  zIndex?: number
  onClose: () => void
  onEsc: () => void
}) {
  // Escape closes one level at a time: useEscape runs the top of its stack and nothing
  // else, so the menu stays open behind the submenu, and a panel nested in the submenu
  // still closes before both of them.
  useEscape(true, onEsc)
  return createPortal(
    <div
      ref={submenuRef}
      tabIndex={-1}
      className='anim-pop fixed outline-none'
      style={{
        top: submenuPos.top,
        left: submenuPos.left,
        zIndex: (zIndex ?? Z_INDEX.menu) + SUBMENU_STACK_DELTA,
      }}
    >
      {typeof submenu === 'function'
        ? submenu({ closeMenu: onClose })
        : submenu}
    </div>,
    document.body
  )
}


export function useContextMenu() {
  const [point, setPoint] = useState<{
    x: number
    y: number
  } | null>(null)
  return {
    point,
    close: () => setPoint(null),
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setPoint({ x: event.clientX, y: event.clientY })
    },
  }
}