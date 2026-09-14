/**
 * The content of a submenu — and of the panel a row inside it opens: one component renders
 * both, so a menu nests as deep as its items do.
 *
 * A nested panel is placed beside its row but stays inside this list's own DOM subtree.
 * `position: fixed` is what gets it clear of the list's scroll box; being a descendant is
 * what keeps the menu that owns this submenu from reading a press inside it as a press
 * outside — hooks.ts closes a menu on the first mousedown outside the refs it was given,
 * and that mousedown lands before the row's own click, so a portaled panel would dismiss
 * the menu with the row's action never run. Depth is otherwise the same contract as the
 * first level: the row states `aria-haspopup` and `aria-expanded`, the panel is a `menu`
 * named after its row, and Escape (the menu's own) or a press elsewhere closes it.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { Kbd } from '../primitives'
import { cn } from '../../lib/cn'
import { getVisibleViewport } from '../../lib/viewport'
import { useEscape } from './hooks'
import type { MenuItem } from './use-menu'

/** The gap a nested panel leaves beside the row that opened it. */
const NESTED_GAP = 2
/** What a panel keeps clear of the viewport's edges. */
const VIEWPORT_MARGIN = 8
/** How the panel was opened: a row hovered by the pointer, or the keyboard on it. */
interface OpenRow {
  id: string
  focus: boolean
}

export function submenuFor(items: MenuItem[], width?: number) {
  return ({ closeMenu }: { closeMenu: () => void }) => (
    <SubmenuList closeMenu={closeMenu} items={items} width={width} />
  )
}

/** The row's own look, before the tone it is given decides the colour of its text. */
const ROW_CLASS = cn(
  'flex h-10 w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[length:var(--text-12\\.5)] md:h-7.5',
  'transition-colors duration-[var(--dur-xs)] hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40',
)

/** A row that opens a panel steps into it on these keys, rather than only opening it. */
const STEP_IN_KEYS = ['Enter', ' ', 'ArrowRight']
/** The keys that move the focus along one list, and the ends they jump to. */
const STEP_KEYS: Record<string, 1 | -1 | 'first' | 'last'> = {
  ArrowDown: 1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
}

/**
 * The way out of the panel a list sits in. A row of a nested list is a row of its own
 * list first, so it has to be told which panel to close rather than walk the DOM for one.
 */
const ClosePanelContext = createContext<(() => void) | null>(null)

/** The rows of one list in DOM order — never those of a panel nested inside it. */
function rowsOf(list: HTMLElement | null): HTMLButtonElement[] {
  if (!list) return []
  const rows: HTMLButtonElement[] = []
  for (const child of list.children) {
    const row = child.querySelector<HTMLButtonElement>('[data-submenu-row]')
    // A panel's own rows are one level deeper: they belong to the panel, not to this list.
    if (row && row.parentElement === child) rows.push(row)
  }
  return rows
}

/**
 * Where a key takes the focus inside one list: the neighbouring enabled row, wrapping at
 * the ends, or the first or last of them.
 */
function stepFocus(list: HTMLElement | null, from: HTMLElement, step: 1 | -1 | 'first' | 'last'): void {
  const rows = rowsOf(list).filter((row) => !row.disabled)
  if (rows.length === 0) return
  const index = rows.indexOf(from as HTMLButtonElement)
  if (step === 'first' || (step === 1 && index < 0)) {
    rows[0]!.focus({ preventScroll: true })
    return
  }
  if (step === 'last' || (step === -1 && index < 0)) {
    rows[rows.length - 1]!.focus({ preventScroll: true })
    return
  }
  rows[(index + step + rows.length) % rows.length]!.focus({ preventScroll: true })
}

export function SubmenuList({
  items,
  closeMenu,
  width = 180,
}: {
  items: MenuItem[]
  closeMenu: () => void
  width?: number
}) {
  const [openRow, setOpenRow] = useState<OpenRow | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={listRef}
      style={{ width }}
      // The panel is placed from its row's box when it opens, so scrolling the list under
      // it would leave it pointing at nothing.
      onScroll={() => setOpenRow(null)}
      className='max-h-95 overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none'
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <SubmenuRow
          key={item.id}
          item={item}
          openRow={openRow}
          setOpenRow={setOpenRow}
          closeMenu={closeMenu}
          listRef={listRef}
        />
      ))}
    </div>
  )
}

/**
 * What the keys do on one row: a row with a panel of its own is stepped into rather than
 * only opened, the arrow and boundary keys move the focus along the row's own list, and
 * ArrowLeft is the way back out of the panel that list sits in.
 */
function rowKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, row: {
  item: MenuItem
  list: HTMLElement | null
  openPanel: (focus: boolean) => void
  leavePanel: (() => void) | null
}): void {
  const { item, list, openPanel, leavePanel } = row
  if (item.submenu && STEP_IN_KEYS.includes(event.key)) {
    event.preventDefault()
    openPanel(true)
    return
  }
  const step = STEP_KEYS[event.key]
  if (step) {
    event.preventDefault()
    stepFocus(list, event.currentTarget, step)
    return
  }
  if (event.key === 'ArrowLeft' && leavePanel) {
    event.preventDefault()
    leavePanel()
  }
}

/** Closes a row's panel and hands the focus back to the row that opened it. */
function closeRowPanel(list: HTMLElement | null, id: string, setOpenRow: React.Dispatch<React.SetStateAction<OpenRow | null>>): void {
  setOpenRow(null)
  list?.querySelector<HTMLElement>(`[data-submenu-row="${CSS.escape(id)}"]`)?.focus({ preventScroll: true })
}

function RowButton({ item, open, listRef, leavePanel, onOpen, onSelect }: {
  item: MenuItem
  open: boolean
  listRef: RefObject<HTMLDivElement | null>
  leavePanel: (() => void) | null
  onOpen: (focus: boolean) => void
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={item.checked}
      {...(item.submenu ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': open } : {})}
      data-submenu-row={item.id}
      disabled={item.disabled}
      onMouseEnter={() => onOpen(false)}
      onKeyDown={(event) => rowKeyDown(event, {
        item,
        list: listRef.current,
        openPanel: onOpen,
        leavePanel,
      })}
      onClick={() => {
        if (item.submenu) {
          onOpen(false)
          return
        }
        onSelect()
      }}
      className={cn(ROW_CLASS, item.tone === 'danger'
        ? 'text-[var(--danger)]'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}
    >
      {item.icon && <span className='flex size-4 shrink-0 items-center justify-center opacity-85'>{item.icon}</span>}
      <span className='min-w-0 flex-1 truncate'>{item.label}</span>
      {item.checked && <Check size={13} className='shrink-0 text-[var(--accent)]' />}
      {item.submenu
        ? <ChevronRight size={13} className='shrink-0 opacity-70' />
        : item.combo && <Kbd combo={item.combo} />}
    </button>
  )
}

function SubmenuRow({ item, openRow, setOpenRow, closeMenu, listRef }: {
  item: MenuItem
  openRow: OpenRow | null
  setOpenRow: React.Dispatch<React.SetStateAction<OpenRow | null>>
  closeMenu: () => void
  listRef: RefObject<HTMLDivElement | null>
}) {
  const open = openRow?.id === item.id
  const closePanel = useContext(ClosePanelContext)
  return (
    <div>
      {item.separatorBefore && <div role='separator' className='my-1 h-px bg-[var(--border-subtle)]' />}
      <RowButton
        item={item}
        open={open}
        listRef={listRef}
        leavePanel={closePanel}
        onOpen={(focus) => setOpenRow(item.submenu ? { id: item.id, focus } : null)}
        onSelect={() => {
          item.onSelect?.()
          closeMenu()
        }}
      />
      {open && item.submenu && (
        <NestedPanel
          listRef={listRef}
          row={openRow!}
          label={item.label}
          onClose={() => closeRowPanel(listRef.current, item.id, setOpenRow)}
        >
          {typeof item.submenu === 'function' ? item.submenu({ closeMenu }) : item.submenu}
        </NestedPanel>
      )}
    </div>
  )
}

/**
 * Where a `fixed` box inside `element` is placed from: the viewport, unless an ancestor
 * establishes a containing block of its own — and the menu's own pop-in animation does.
 * `anim-pop` fills forwards, so the transform it settles on is the identity matrix rather
 * than `none`, which still counts; a panel that read the row's box as viewport
 * coordinates was then drawn a whole submenu down and to the right of it, off screen.
 */
function containingBlockOrigin(element: HTMLElement): { x: number; y: number } {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    const isContainingBlock =
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.backdropFilter !== 'none' ||
      style.willChange.includes('transform')
    if (!isContainingBlock) continue
    const rect = node.getBoundingClientRect()
    // The block such a box is placed in is the ancestor's padding box, which starts
    // inside its border.
    return { x: rect.left + node.clientLeft, y: rect.top + node.clientTop }
  }
  return { x: 0, y: 0 }
}

/** The row a panel hangs off, found by the id its rows are marked with. */
function rowElementOf(list: HTMLElement | null, id: string): HTMLElement | null {
  return list?.querySelector<HTMLElement>(`[data-submenu-row="${CSS.escape(id)}"]`) ?? null
}

/**
 * Where a panel goes: beside the row that opened it, flipped to the other side and
 * clamped when the near edge of the viewport is closer than the panel is wide.
 */
function panelPosition(rowElement: HTMLElement, panel: HTMLElement): { top: number; left: number } {
  const rect = rowElement.getBoundingClientRect()
  const viewport = getVisibleViewport()
  let left = rect.right - NESTED_GAP
  if (left + panel.offsetWidth > viewport.right - VIEWPORT_MARGIN)
    left = Math.max(viewport.left + VIEWPORT_MARGIN, rect.left - panel.offsetWidth + NESTED_GAP)
  let top = rect.top - NESTED_GAP * 2
  if (top + panel.offsetHeight > viewport.bottom - VIEWPORT_MARGIN)
    top = Math.max(viewport.top + VIEWPORT_MARGIN, viewport.bottom - panel.offsetHeight - VIEWPORT_MARGIN)
  const origin = containingBlockOrigin(panel)
  return { top: top - origin.y, left: left - origin.x }
}

/**
 * One level further in. It is a DOM child of the list it belongs to (see the file header),
 * so its box is read from `fixed` coordinates taken off the row's own — shifted back into
 * whatever block `fixed` really resolves against — and its content is whatever the row's
 * `submenu` renders, a `SubmenuList` of its own when the items nest again.
 */
function NestedPanel({ listRef, row, label, children, onClose }: {
  listRef: RefObject<HTMLDivElement | null>
  row: OpenRow
  label: string
  children: ReactNode
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  // useEscape runs the top of its stack and nothing else, so the panel takes Escape
  // before the menu that owns it does and the levels close one at a time.
  useEscape(true, onClose)

  useLayoutEffect(() => {
    const rowElement = rowElementOf(listRef.current, row.id)
    const panel = panelRef.current
    if (!rowElement || !panel) return
    setPosition(panelPosition(rowElement, panel))
  }, [listRef, row.id])

  // Only a keyboard opening steps in: the pointer is already where it wants to be, and
  // taking the focus out of the list under it would be a surprise.
  useEffect(() => {
    if (!row.focus) return
    panelRef.current
      ?.querySelector<HTMLElement>('button:not([disabled]), input, [href]')
      ?.focus({ preventScroll: true })
  }, [row.focus, row.id])

  return (
    <div
      ref={panelRef}
      role='menu'
      aria-label={label}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
      // Measured and placed before the first paint; until then it has no position, and a
      // panel sitting at the origin for a frame is the flash this avoids.
      className={cn('anim-pop fixed outline-none', !position && 'invisible')}
      onClick={(event) => event.stopPropagation()}
    >
      <ClosePanelContext.Provider value={onClose}>{children}</ClosePanelContext.Provider>
    </div>
  )
}
