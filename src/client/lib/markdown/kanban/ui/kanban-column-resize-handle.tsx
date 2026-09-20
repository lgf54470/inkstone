/**
 * The splitter on the edge of a table column. It is the only control that answers for a column's
 * width, and it is its own unit because that width has one owner: the drag and the keyboard have to
 * agree on the same range, the same draft, and the one moment the document gets written.
 */
import { useRef, useState } from 'react'
import { t } from '../../../i18n'
import {
  KANBAN_COLUMN_MAX_WIDTH,
  KANBAN_COLUMN_MIN_WIDTH,
  clampKanbanColumnWidth,
  kanbanColumnWidthPx,
  kanbanDragWidth,
  kanbanResizeCommand,
} from '../column-width'
import { formatKanbanPropertyName } from '../i18n-helpers'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { KanbanColumnDrag } from '../column-width'
import type { KanbanProperty } from '../types'

const LIVE_WIDTH_PROPERTIES = ['flex-grow', 'flex-shrink', 'flex-basis', 'min-width'] as const

// The width a drag or a key press is at right now, drawn without a render. Measured on a 200-card
// board with 8 columns (1809 cells), one commit of the table through the document costs ~500 ms of
// script against ~105 ms for writing the cells directly, so a drag that went through the document
// would not have painted a frame. The four properties go together: `flex-basis` is what a flex item
// takes its size from, and the titled column's `min-width` would stop the edge where its default is.
function drawLiveColumnWidth(table: ParentNode, propertyId: string, px: number | null): void {
  for (const cell of table.querySelectorAll<HTMLElement>('[data-kanban-column]')) {
    if (cell.dataset.kanbanColumn !== propertyId) continue
    if (px === null) {
      for (const property of LIVE_WIDTH_PROPERTIES) cell.style.removeProperty(property)
      continue
    }
    cell.style.flexGrow = '0'
    cell.style.flexShrink = '0'
    cell.style.flexBasis = `${px}px`
    cell.style.minWidth = '0px'
  }
}

/** The splitter's own state: the width being aimed at, drawn live, until it is written or given up. */
function useColumnWidthDraft(column: KanbanProperty, onResize: (width: number | undefined) => void) {
  const [draft, setDraft] = useState<number | undefined>(undefined)
  const handleRef = useRef<HTMLDivElement>(null)
  const stored = kanbanColumnWidthPx(column)

  // Reading the rendered edge is the only way to know an auto-sized column's width, and it happens on
  // an interaction rather than on every render. An element that cannot be measured reports no width
  // at all, so a drag that starts there begins at the narrowest width the table will draw.
  function currentWidth(): number {
    const drawn = handleRef.current?.parentElement?.getBoundingClientRect().width ?? 0
    return draft ?? stored ?? (drawn > 0 ? clampKanbanColumnWidth(drawn) : KANBAN_COLUMN_MIN_WIDTH)
  }

  function show(px: number | undefined) {
    const table = handleRef.current?.closest<HTMLElement>('[role="table"]')
    if (table) drawLiveColumnWidth(table, column.id, px ?? null)
  }

  function step(px: number) {
    setDraft(px)
    show(px)
  }

  // Whatever the draft was, the document or the classes underneath are what gets drawn next.
  function stopShowing() {
    setDraft(undefined)
    show(undefined)
  }

  function commit(px: number | undefined) {
    stopShowing()
    onResize(px)
  }

  function applyDraft() {
    if (draft !== undefined) commit(draft)
  }

  return { applyDraft, commit, handleRef, hasDraft: draft !== undefined, step, stopShowing, currentWidth, value: draft ?? stored }
}

/** The mechanics of a drag: widths reported as the pointer moves, one final width when it is let go. */
function useColumnWidthDrag(draft: {
  currentWidth: () => number
  handleRef: RefObject<HTMLDivElement | null>
  step: (px: number) => void
  commit: (px: number | undefined) => void
  stopShowing: () => void
}) {
  const dragRef = useRef<KanbanColumnDrag | null>(null)

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    // The handle is painted over the sort button, which spans the header: taking the pointer keeps a
    // click meant for sizing from also reordering the board, and stops text being dragged.
    e.preventDefault()
    e.stopPropagation()
    draft.handleRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = { fromX: e.clientX, startPx: draft.currentWidth() }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current) draft.step(kanbanDragWidth(dragRef.current, e.clientX))
  }

  // The release position is what gets written, not whatever the last move happened to report: a
  // pointer that leaves and comes back ends where the reader let go of it. A release on this element
  // does not blur it, so the drag commits here while `onBlur` stays the keyboard's way out.
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    draft.commit(kanbanDragWidth(drag, e.clientX))
  }

  function onPointerCancel() {
    dragRef.current = null
    draft.stopShowing()
  }

  return { onPointerCancel, onPointerDown, onPointerMove, onPointerUp }
}

export function ColumnResizeHandle({
  column,
  onResize,
}: {
  column: KanbanProperty
  onResize: (width: number | undefined) => void
}) {
  const sizing = useColumnWidthDraft(column, onResize)
  const drag = useColumnWidthDrag(sizing)

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const command = kanbanResizeCommand(e.key, e.shiftKey, sizing.currentWidth(), sizing.hasDraft)
    if (command.kind === 'ignore') return
    e.preventDefault()
    if (command.kind === 'step') return sizing.step(command.width)
    if (command.kind === 'reset') return sizing.commit(undefined)
    if (command.kind === 'commit') return sizing.applyDraft()
    // What is left is a discard, and canceling a step is the gesture that should not also close the
    // panel or fullscreen the board the table happens to sit in.
    e.stopPropagation()
    sizing.stopShowing()
  }

  return (
    <div
      ref={sizing.handleRef}
      role='separator'
      tabIndex={0}
      aria-orientation='horizontal'
      aria-label={t('preview.kanban_column_resize', { column: formatKanbanPropertyName(column) })}
      aria-valuemin={KANBAN_COLUMN_MIN_WIDTH}
      aria-valuemax={KANBAN_COLUMN_MAX_WIDTH}
      aria-valuenow={sizing.value}
      aria-valuetext={sizing.value === undefined ? undefined : t('preview.kanban_column_width_value', { value0: sizing.value })}
      title={t('preview.kanban_column_resize_hint')}
      className='absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] focus-visible:outline-none'
      data-kanban-column-resize={column.id}
      {...(sizing.hasDraft ? { 'data-owns-escape': 'true' } : {})}
      onDoubleClick={() => sizing.commit(undefined)}
      onBlur={() => {
        // Losing focus ends a keyboard step; a pointer release on this element does not blur it, so
        // the drag has already written by the time this could fire.
        sizing.applyDraft()
      }}
      onKeyDown={onKeyDown}
      {...drag}
    />
  )
}
