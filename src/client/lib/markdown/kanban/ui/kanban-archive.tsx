import { useCallback, useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Archive, Trash2, Undo2 } from 'lucide-react'
import { Button } from '../../../../components/primitives'
import { useClickOutside, useEscape } from '../../../../components/overlay'
import { useUi } from '../../../../store/ui'
import { t, useLocaleRepaint } from '../../../i18n'
import { kanbanArchivedItems, kanbanSetArchived } from '../archive'
import type { KanbanData, KanbanItem } from '../types'
import type { CommitKanbanData } from './kanban-history'

export interface KanbanArchiveEntry {
  items: KanbanItem[]
  onRestore: (ids: Iterable<string>) => void
  onDelete: (id: string) => void
}

/**
 * The one writer of the archive flag. A batch that changes nothing hands the history back the very
 * same document, so filing away a card that was already filed away costs no step of undo.
 */
function useKanbanArchiveWriter(commitData: CommitKanbanData) {
  return useCallback(
    (ids: Iterable<string>, archived: boolean) => {
      const wanted = new Set(ids)
      if (wanted.size === 0) return
      commitData((prev) => {
        const items = kanbanSetArchived(prev.items, wanted, archived)
        return items === prev.items ? prev : { ...prev, items }
      })
    },
    [commitData],
  )
}

export function useKanbanArchive(
  data: KanbanData,
  commitData: CommitKanbanData,
  detailItem: KanbanItem | null,
  setDetailItem: (item: KanbanItem | null) => void,
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>,
  onDelete: (id: string) => void,
) {
  const write = useKanbanArchiveWriter(commitData)
  const items = useMemo(() => kanbanArchivedItems(data.items), [data.items])
  const onRestore = useCallback((ids: Iterable<string>) => write(ids, false), [write])

  const handleArchiveItems = useCallback(
    (ids: Iterable<string>) => {
      const wanted = [...new Set(ids)]
      if (wanted.length === 0) return
      write(wanted, true)
      if (detailItem && wanted.includes(detailItem.id)) setDetailItem(null)
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => !wanted.includes(id)))
        return next.size === prev.size ? prev : next
      })
      useUi.getState().toast({ title: t('preview.kanban_archive_toast', { count: wanted.length }) })
    },
    [write, detailItem, setDetailItem, setSelectedIds],
  )

  const archive = useMemo<KanbanArchiveEntry>(
    () => ({ items, onRestore, onDelete }),
    [items, onRestore, onDelete],
  )

  return { archive, handleArchiveItems, handleRestoreItems: onRestore }
}

function ArchiveRow({
  item,
  onRestore,
  onDelete,
}: {
  item: KanbanItem
  onRestore: () => void
  onDelete: () => void
}) {
  return (
    <li className='flex items-center gap-1'>
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>
        {item.title}
      </span>
      <button
        type='button'
        data-kanban-archive-restore
        onClick={onRestore}
        aria-label={t('preview.kanban_archive_restore_named', { title: item.title })}
        className='inline-flex items-center gap-1 rounded-[var(--r-xs)] px-1.5 py-1 text-[length:var(--text-11)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      >
        <Undo2 size={12} aria-hidden />
        <span>{t('preview.kanban_archive_restore')}</span>
      </button>
      <button
        type='button'
        data-kanban-archive-delete
        onClick={onDelete}
        aria-label={t('preview.kanban_archive_delete_named', { title: item.title })}
        className='rounded-[var(--r-xs)] p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]'
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </li>
  )
}

interface KanbanArchivePanelProps extends KanbanArchiveEntry {
  panelId: string
  panelRef: React.RefObject<HTMLDivElement | null>
}

function KanbanArchivePanel({ items, panelId, panelRef, onRestore, onDelete }: KanbanArchivePanelProps) {
  return (
    <div
      id={panelId}
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_archive_panel')}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className='absolute right-0 top-full z-[var(--z-popover)] mt-1 flex w-64 flex-col gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)]'
    >
      <div className='flex items-center justify-between'>
        <span className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
          {t('preview.kanban_archive_panel')}
        </span>
        <button
          type='button'
          data-kanban-archive-restore-all
          onClick={() => onRestore(items.map((item) => item.id))}
          className='rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--accent)] hover:bg-[var(--bg-hover)]'
        >
          {t('preview.kanban_archive_restore_all')}
        </button>
      </div>
      <ul className='flex max-h-64 flex-col gap-0.5 overflow-y-auto' data-kanban-archive-list>
        {items.map((item) => (
          <ArchiveRow
            key={item.id}
            item={item}
            onRestore={() => onRestore([item.id])}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </ul>
    </div>
  )
}

/**
 * The only way back to an archived card. With nothing filed away the control is absent rather than
 * a button that opens an empty list — and because it is absent, bringing the last card back closes
 * the shelf by itself: no second path has to remember to shut the panel.
 */
export function KanbanArchiveAction(entry: KanbanArchiveEntry) {
  useLocaleRepaint()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useClickOutside([panelRef, btnRef], open, () => setOpen(false))
  useEscape(open, () => setOpen(false))

  if (entry.items.length === 0) return null

  return (
    <div className='relative'>
      <Button
        ref={btnRef}
        size='sm'
        variant='ghost'
        data-kanban-archive
        icon={<Archive size={13} aria-hidden />}
        onClick={() => setOpen((o) => !o)}
        className={open ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : undefined}
        aria-label={t('preview.kanban_archived_count', { count: entry.items.length })}
        aria-haspopup='dialog'
        aria-expanded={open}
        {...(open ? { 'aria-controls': panelId } : {})}
      >
        {entry.items.length}
      </Button>
      {open && <KanbanArchivePanel {...entry} panelId={panelId} panelRef={panelRef} />}
    </div>
  )
}
