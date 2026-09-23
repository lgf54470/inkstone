import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import {
  BarChart2,
  Calendar,
  ChartGantt,
  Kanban,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Table,
  Timeline,
} from 'lucide-react'
import { formatKanbanViewName, formatKanbanViewTypeLabel } from '../i18n-helpers'
import { KANBAN_VIEW_TYPES } from '../view-ops'
import { prompt, Menu, type MenuItem } from '../../../../components/overlay'
import type { KanbanView, KanbanViewType } from '../types'
import { t } from '../../../i18n'

/** Exported so a view looks the same wherever it is named, including the command palette. */
export function kanbanViewIcon(type: KanbanViewType) {
  switch (type) {
    case 'board':
      return <Kanban size={14} />
    case 'table':
      return <Table size={14} />
    case 'calendar':
      return <Calendar size={14} />
    case 'timeline':
      return <Timeline size={14} />
    case 'gantt':
      return <ChartGantt size={14} />
    case 'list':
      return <List size={14} />
    case 'gallery':
      return <LayoutGrid size={14} />
    case 'chart':
      return <BarChart2 size={14} />
    default:
      return <Kanban size={14} />
  }
}

// The whole list drives one panel, so a tab's own name has to be derivable from that panel's id —
// the panel labels itself back with `aria-labelledby` and cannot know the view id by itself.
export function kanbanViewTabId(panelId: string, viewId: string): string {
  return `${panelId}-tab-${viewId}`
}

// A tablist is one entry point: the arrows carry both focus and selection, wrapping at the ends.
function rovingTabIndex(current: number, key: string, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count
    case 'ArrowLeft':
      return (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

export interface KanbanViewOperations {
  createView: (type: KanbanViewType) => void
  renameView: (viewId: string, name: string) => void
  duplicateView: (viewId: string) => void
  deleteView: (viewId: string) => void
  moveView: (viewId: string, offset: -1 | 1) => void
}

// The two management controls stand in the header beside the tabs, so they take the header's own
// size step: a finger's target on a phone, the tighter one the row was designed around on a desktop.
const TRIGGER_CLASS =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:size-7'

/** One control per menu: it says whether its own list is open and names the panel it opened. */
function useMenuTrigger() {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  return { open, toggle: () => setOpen((o) => !o), close: () => setOpen(false), anchor, panelId }
}

interface MenuTriggerProps {
  anchor: RefObject<HTMLButtonElement | null>
  open: boolean
  toggle: () => void
  panelId: string
  label: string
  icon: ReactNode
}

function MenuTrigger({ anchor, open, toggle, panelId, label, icon }: MenuTriggerProps) {
  return (
    <button
      ref={anchor}
      type='button'
      onClick={toggle}
      className={TRIGGER_CLASS}
      aria-label={label}
      aria-haspopup='menu'
      aria-expanded={open}
      {...(open ? { 'aria-controls': panelId } : {})}
    >
      {icon}
    </button>
  )
}

function KanbanNewViewMenu({ onCreate }: { onCreate: (type: KanbanViewType) => void }) {
  const { open, toggle, close, anchor, panelId } = useMenuTrigger()
  const label = t('preview.kanban_new_view')
  const items: MenuItem[] = KANBAN_VIEW_TYPES.map((type) => ({
    id: type,
    label: formatKanbanViewTypeLabel(type),
    icon: kanbanViewIcon(type),
    onSelect: () => onCreate(type),
  }))

  return (
    <>
      <MenuTrigger anchor={anchor} open={open} toggle={toggle} panelId={panelId} label={label} icon={<Plus size={14} />} />
      <Menu anchor={anchor} open={open} onClose={close} items={items} panelId={panelId} label={label} align='end' />
    </>
  )
}

function KanbanActiveViewMenu({
  views,
  activeViewId,
  viewOps,
}: {
  views: KanbanView[]
  activeViewId: string
  viewOps: KanbanViewOperations
}) {
  const { open, toggle, close, anchor, panelId } = useMenuTrigger()
  const index = views.findIndex((v) => v.id === activeViewId)
  const view = views[index]
  if (!view) return null

  const label = t('preview.kanban_view_actions')
  async function handleRename() {
    const name = await prompt({
      title: t('preview.kanban_view_rename'),
      defaultValue: formatKanbanViewName(view!),
    })
    // A blank answer is not a rename: committing one would push an undo step that changes nothing.
    if (name?.trim()) viewOps.renameView(view!.id, name)
  }

  const items: MenuItem[] = [
    { id: 'rename', label: t('preview.kanban_view_rename'), onSelect: () => { void handleRename() } },
    { id: 'duplicate', label: t('preview.kanban_view_duplicate'), onSelect: () => viewOps.duplicateView(view.id) },
    {
      id: 'move-earlier',
      label: t('preview.kanban_view_move_earlier'),
      disabled: index <= 0,
      onSelect: () => viewOps.moveView(view.id, -1),
    },
    {
      id: 'move-later',
      label: t('preview.kanban_view_move_later'),
      disabled: index >= views.length - 1,
      onSelect: () => viewOps.moveView(view.id, 1),
    },
    {
      id: 'delete',
      label: t('preview.kanban_view_delete'),
      tone: 'danger',
      separatorBefore: true,
      // With its last view gone the board has nothing to render, so that one cannot be deleted.
      disabled: views.length < 1 + 1,
      onSelect: () => viewOps.deleteView(view.id),
    },
  ]

  return (
    <>
      <MenuTrigger anchor={anchor} open={open} toggle={toggle} panelId={panelId} label={label} icon={<MoreHorizontal size={14} />} />
      <Menu anchor={anchor} open={open} onClose={close} items={items} panelId={panelId} label={label} align='end' />
    </>
  )
}

interface TabListProps {
  views: KanbanView[]
  activeViewId: string
  panelId: string
  onSelectView: (viewId: string) => void
}

/**
 * A strip that scrolls hides its own ends, and the one tab that must never be the hidden one is the
 * selected one: with eight views the reader could switch to one from the header's menu and be shown
 * a row that does not contain it.
 *
 * Only the strip's own `scrollLeft` moves — `scrollIntoView` would drag every scroll container above
 * it along, and this row sits inside the note. It is read on every commit rather than on the
 * selection changing: the row is not laid out when the first effect runs, and its geometry moves for
 * reasons the props do not carry (the pane being resized, a view renamed wider, the header's
 * container query dropping to the compact layout).
 */
function useSelectedTabInView(
  stripRef: RefObject<HTMLDivElement | null>,
  tabsRef: RefObject<(HTMLButtonElement | null)[]>,
  activeIndex: number,
): void {
  useLayoutEffect(() => {
    const strip = stripRef.current
    const tab = tabsRef.current?.[activeIndex]
    if (!strip || !tab) return
    const left = tab.offsetLeft
    const right = left + tab.offsetWidth
    if (left < strip.scrollLeft) strip.scrollLeft = left
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth
  })
}

interface TabProps {
  view: KanbanView
  panelId: string
  isActive: boolean
  index: number
  register: (node: HTMLButtonElement | null) => void
  onSelectView: (viewId: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void
}

/**
 * One view tab. The selected one is the accent on its own tint — the app's own "this is the current
 * one" pair (the music hub's playlists and deck rail paint it the same way), and the one pairing the
 * token layer calibrates for all seven accents. `--bg-raised` is what it used to be, and on both
 * light themes that token is the header's own `--bg-surface`: the selection was invisible in exactly
 * the mode the reader reported it in.
 */
function KanbanTab({ view, panelId, isActive, index, register, onSelectView, onKeyDown }: TabProps) {
  return (
    <button
      ref={register}
      id={kanbanViewTabId(panelId, view.id)}
      role='tab'
      aria-selected={isActive}
      aria-controls={panelId}
      data-view-type={view.type}
      type='button'
      tabIndex={isActive ? 0 : -1}
      onClick={() => onSelectView(view.id)}
      onKeyDown={(event) => onKeyDown(event, index)}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--r-md)] px-2.5 text-[length:var(--text-12)] transition-colors md:h-7 md:py-1 ${
        isActive
          ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
          : 'font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {kanbanViewIcon(view.type)}
      <span>{formatKanbanViewName(view)}</span>
    </button>
  )
}

function KanbanTabList({ views, activeViewId, panelId, onSelectView }: TabListProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const stripRef = useRef<HTMLDivElement>(null)
  useSelectedTabInView(stripRef, tabsRef, views.findIndex((v) => v.id === activeViewId))

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingTabIndex(index, event.key, views.length)
    if (next === null) return
    event.preventDefault()
    onSelectView(views[next]!.id)
    tabsRef.current[next]?.focus()
  }

  return (
    <div
      ref={stripRef}
      className='flex min-w-0 items-center gap-1 overflow-x-auto'
      role='tablist'
      aria-label={t('preview.kanban_views')}
    >
      {views.map((view, index) => (
        <KanbanTab
          key={view.id}
          view={view}
          panelId={panelId}
          index={index}
          isActive={view.id === activeViewId}
          register={(node) => {
            tabsRef.current[index] = node
          }}
          onSelectView={onSelectView}
          onKeyDown={handleKeyDown}
        />
      ))}
    </div>
  )
}

export function KanbanViewTabs({
  views,
  activeViewId,
  panelId,
  onSelectView,
  viewOps,
}: {
  views: KanbanView[]
  activeViewId: string
  panelId: string
  onSelectView: (viewId: string) => void
  viewOps: KanbanViewOperations
}) {
  return (
    // The strip holds one row however many views a board has: it sits in the header's own flex row,
    // so wrapping would push the whole board down instead. `min-w-0` lets the list give way to the
    // header's other controls and scroll sideways instead, and `shrink-0` keeps a tab from being
    // squeezed below its own width by that scroll. The two management controls stay outside the
    // list — anything inside a tablist is announced as a tab.
    <div className='flex min-w-0 items-center gap-1'>
      <KanbanTabList views={views} activeViewId={activeViewId} panelId={panelId} onSelectView={onSelectView} />
      <KanbanNewViewMenu onCreate={viewOps.createView} />
      <KanbanActiveViewMenu views={views} activeViewId={activeViewId} viewOps={viewOps} />
    </div>
  )
}
