import { Check, MoreHorizontal, Pin, Star } from 'lucide-react'
import type { AttachmentWithUsage } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { MenuItem } from '../../components/overlay'
import { formatFileSize } from './attachment-helpers'
import {
  AttachmentMenus,
  buildAttachmentMenuItems,
  cardDragStart,
  fileBadgeOf,
  type AttachmentMenuCtx,
  UploadEmptyState,
  useCardMenu,
  useFileFolder,
} from './attachment-item-common'


interface AttachmentListViewProps {
  files: AttachmentWithUsage[]
  selectedIds: Set<string>
  onToggleSelect: (id: string, e: React.MouseEvent) => void
  onToggleSelectAll: () => void
  allSelected: boolean
  activeFile: AttachmentWithUsage | null
  onSelectActive: (file: AttachmentWithUsage) => void
  onPreview: (file: AttachmentWithUsage) => void
  onRename: (file: AttachmentWithUsage) => void
  onShowQr: (file: AttachmentWithUsage) => void
  onInsertToNote?: (file: AttachmentWithUsage) => void
  onToggleStar: (file: AttachmentWithUsage) => void
  onTogglePin: (file: AttachmentWithUsage) => void
  onMoveToFolder: (file: AttachmentWithUsage) => void
  onDelete: (file: AttachmentWithUsage) => void
  onUploadClick?: () => void
}

export function AttachmentListView(props: AttachmentListViewProps) {
  const { files, selectedIds, onToggleSelect, onToggleSelectAll, allSelected, activeFile, onSelectActive, onPreview, onRename, onShowQr, onInsertToNote, onToggleStar, onTogglePin, onMoveToFolder, onDelete, onUploadClick } = props

  return (
    <div className='flex min-h-full flex-col w-full'>
      <div className='overflow-x-auto'>
        <table className='w-full text-left text-[length:var(--text-12)] border-collapse'>
          <TableHead onToggleSelectAll={onToggleSelectAll} allSelected={allSelected} />
          <tbody className='divide-y divide-[var(--border-subtle)]'>
            {files.map((file) => (
              <ListRow
                key={file.id}
                file={file}
                selected={selectedIds.has(file.id)}
                active={activeFile?.id === file.id}
                onToggleSelect={(e) => onToggleSelect(file.id, e)}
                onSelectActive={() => onSelectActive(file)}
                onPreview={() => onPreview(file)}
                onRename={() => onRename(file)}
                onShowQr={() => onShowQr(file)}
                onInsertToNote={onInsertToNote ? () => onInsertToNote(file) : undefined}
                onToggleStar={() => onToggleStar(file)}
                onTogglePin={() => onTogglePin(file)}
                onMoveToFolder={() => onMoveToFolder(file)}
                onDelete={() => onDelete(file)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {onUploadClick && files.length < 8 && (
        <div className='flex flex-1 p-4'>
          <UploadEmptyState onUploadClick={onUploadClick} />
        </div>
      )}
    </div>
  )
}

function TableHead({ onToggleSelectAll, allSelected }: { onToggleSelectAll: () => void; allSelected: boolean }) {
  return (
    <thead className='sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]/90 backdrop-blur-xs text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)] uppercase select-none'>
      <tr>
        <th className='w-10 px-3 py-2.5'>
          <button
            type='button'
            onClick={onToggleSelectAll}
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border transition-colors cursor-pointer',
              allSelected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-default)] bg-[var(--bg-base)]',
            )}
          >
            {allSelected && <Check size={11} strokeWidth={3} />}
          </button>
        </th>
        <th className='px-3 py-2.5'>{t('attachments.filename')}</th>
        <th className='px-3 py-2.5 w-32'>{t('navigation.folder')}</th>
        <th className='px-3 py-2.5 w-32'>{t('navigation.tag')}</th>
        <th className='px-3 py-2.5 w-24'>{t('attachments.size_all')}</th>
        <th className='px-3 py-2.5 w-24'>{t('attachments.unreferenced')}</th>
        <th className='px-3 py-2.5 w-28'>{t('common.created')}</th>
        <th className='px-3 py-2.5 w-20 text-right'>{t('common.more_actions')}</th>
      </tr>
    </thead>
  )
}


interface ListRowProps {
  file: AttachmentWithUsage
  selected: boolean
  active: boolean
  onToggleSelect: (e: React.MouseEvent) => void
  onSelectActive: () => void
  onPreview: () => void
  onRename: () => void
  onShowQr: () => void
  onInsertToNote?: () => void
  onToggleStar: () => void
  onTogglePin: () => void
  onMoveToFolder: () => void
  onDelete: () => void
}

function ListRow(props: ListRowProps) {
  const { file, selected, active, onToggleSelect, onSelectActive, onPreview, onRename, onShowQr, onInsertToNote, onToggleStar, onTogglePin, onMoveToFolder, onDelete } = props
  const folder = useFileFolder(file)
  const menu = useCardMenu()
  const { isImage, badge } = fileBadgeOf(file)
  const actions: AttachmentMenuCtx = { file, onPreview, onRename, onShowQr, onInsertToNote, onToggleStar, onTogglePin, onMoveToFolder, onDelete }
  const menuItems: MenuItem[] = buildAttachmentMenuItems(actions)

  return (
    <tr
      draggable
      onDragStart={(e) => cardDragStart(e, file.id)}
      onClick={onSelectActive}
      onDoubleClick={onPreview}
      onContextMenu={menu.handleContextMenu}
      className={cn(
        'group transition-colors cursor-pointer select-none',
        selected ? 'bg-[var(--accent-soft)]' : active ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]',
      )}
    >
      <SelectCell selected={selected} onToggleSelect={onToggleSelect} />
      <NameCell file={file} isImage={isImage} badgeLabel={badge.label} badgeText={badge.text} />
      <RowDataCells file={file} folderName={folder?.name} />
      <td className='px-3 py-2 text-right'>
        <button
          ref={menu.buttonRef}
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            menu.toggle()
          }}
          className='rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-colors'
        >
          <MoreHorizontal size={14} />
        </button>
        <AttachmentMenus menu={menu} items={menuItems} />
      </td>
    </tr>
  )
}

function SelectCell({ selected, onToggleSelect }: { selected: boolean; onToggleSelect: (e: React.MouseEvent) => void }) {
  return (
    <td className='w-10 px-3 py-2'>
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(e)
        }}
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border transition-colors',
          selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-default)] bg-[var(--bg-base)] opacity-0 group-hover:opacity-100',
        )}
      >
        {selected && <Check size={11} strokeWidth={3} />}
      </button>
    </td>
  )
}

function NameCell({ file, isImage, badgeLabel, badgeText }: {
  file: AttachmentWithUsage
  isImage: boolean
  badgeLabel: string
  badgeText: string
}) {
  return (
    <td className='px-3 py-2'>
      <div className='flex items-center gap-2.5'>
        <div className='flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]'>
          {isImage ? (
            <img src={file.url} alt='' className='h-full w-full object-cover' />
          ) : (
            <span className={cn('text-[length:var(--text-9)] font-bold', badgeText)}>{badgeLabel}</span>
          )}
        </div>
        <span className='truncate font-medium text-[var(--text-primary)] max-w-xs md:max-w-md' title={file.filename}>
          {file.filename}
        </span>
        {file.isPinned && <Pin size={11} className='text-[var(--accent)] shrink-0' />}
        {file.isStarred && <Star size={11} className='text-amber-500 fill-current shrink-0' />}
      </div>
    </td>
  )
}

function RowDataCells({ file, folderName }: { file: AttachmentWithUsage; folderName?: string }) {
  const tags = file.tags ?? []
  return (
    <>
      <td className='px-3 py-2 text-[var(--text-tertiary)]'>
        {folderName ? <span className='truncate block max-w-[120px]'>{folderName}</span> : <span>-</span>}
      </td>
      <td className='px-3 py-2 text-[var(--text-tertiary)]'>
        {tags.length > 0 ? (
          <div className='flex flex-wrap gap-1'>
            {tags.slice(0, 2).map((tName) => (
              <span key={tName} className='rounded bg-[var(--bg-sunken)] px-1 text-[length:var(--text-10)]'>
                #{tName}
              </span>
            ))}
          </div>
        ) : (
          <span>-</span>
        )}
      </td>
      <td className='px-3 py-2 text-[var(--text-tertiary)] tabular-nums'>{formatFileSize(file.size)}</td>
      <RefsCell file={file} />
      <td className='px-3 py-2 text-[var(--text-tertiary)]'>{new Date(file.createdAt).toLocaleDateString()}</td>
    </>
  )
}

function RefsCell({ file }: { file: AttachmentWithUsage }) {
  return (
    <td className='px-3 py-2'>
      {file.references === 0 ? (
        <span className='rounded bg-amber-500/15 px-1.5 py-0.5 text-[length:var(--text-10)] font-medium text-amber-600 dark:text-amber-400'>
          {t('attachments.unreferenced')}
        </span>
      ) : (
        <span className='text-[var(--text-tertiary)] tabular-nums'>
          {t('attachments.referenced_value0', { value0: file.references })}
        </span>
      )}
    </td>
  )
}