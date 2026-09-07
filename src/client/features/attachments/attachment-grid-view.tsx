import { Check, MoreVertical, Pin, Plus, Star } from 'lucide-react'
import type { AttachmentWithUsage } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { MenuItem } from '../../components/overlay'
import { formatFileSize, groupAttachmentsByDate } from './attachment-helpers'
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

type Badge = ReturnType<typeof fileBadgeOf>


interface AttachmentGridViewProps {
  files: AttachmentWithUsage[]
  selectedIds: Set<string>
  onToggleSelect: (id: string, e: React.MouseEvent) => void
  activeFile: AttachmentWithUsage | null
  onSelectActive: (file: AttachmentWithUsage) => void
  zoom: 'sm' | 'md' | 'lg'
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

function zoomCols(zoom: 'sm' | 'md' | 'lg'): string {
  if (zoom === 'sm') return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
  if (zoom === 'lg') return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
}

export function AttachmentGridView(props: AttachmentGridViewProps) {
  const { files, selectedIds, onToggleSelect, activeFile, onSelectActive, zoom, onPreview, onRename, onShowQr, onInsertToNote, onToggleStar, onTogglePin, onMoveToFolder, onDelete, onUploadClick } = props
  const groups = groupAttachmentsByDate(files)
  const gridColsClass = zoomCols(zoom)

  return (
    <div className='flex min-h-full flex-col p-4 gap-6'>
      {groups.map((group, groupIdx) => (
        <div key={group.label} className='space-y-2.5'>
          <div className='sticky top-0 z-[var(--z-sticky)] bg-[var(--bg-surface)]/90 py-1 backdrop-blur-xs'>
            <h3 className='text-[length:var(--text-12)] font-semibold tracking-wider text-[var(--text-tertiary)] uppercase'>
              {group.label}
            </h3>
          </div>

          <div className={cn('grid gap-3', gridColsClass)}>
            {group.files.map((file) => (
              <GridCard
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
            {groupIdx === 0 && onUploadClick && <UploadTile onClick={onUploadClick} />}
          </div>
        </div>
      ))}

      {onUploadClick && files.length < 8 && <UploadEmptyState onUploadClick={onUploadClick} />}
    </div>
  )
}

function UploadTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='group relative flex aspect-square flex-col items-center justify-center rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-sunken)]/20 p-3 text-center transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/20 cursor-pointer'
    >
      <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-tertiary)] shadow-[var(--shadow-xs)] transition-transform group-hover:scale-110 group-hover:text-[var(--accent)]'>
        <Plus size={20} />
      </div>
      <span className='mt-2 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent)]'>
        {t('attachments.upload_file')}
      </span>
    </button>
  )
}


interface GridCardProps {
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

function GridCard(props: GridCardProps) {
  const { file, selected, active, onToggleSelect, onSelectActive, onPreview, onRename, onShowQr, onInsertToNote, onToggleStar, onTogglePin, onMoveToFolder, onDelete } = props
  const folder = useFileFolder(file)
  const menu = useCardMenu()
  const { isImage, badge } = fileBadgeOf(file)
  const actions: AttachmentMenuCtx = { file, onPreview, onRename, onShowQr, onInsertToNote, onToggleStar, onTogglePin, onMoveToFolder, onDelete }
  const menuItems: MenuItem[] = buildAttachmentMenuItems(actions)

  return (
    <div
      draggable
      onDragStart={(e) => cardDragStart(e, file.id)}
      onClick={onSelectActive}
      onDoubleClick={onPreview}
      onContextMenu={menu.handleContextMenu}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[var(--r-lg)] border bg-[var(--bg-base)] text-left transition-all duration-[var(--dur-fast)] cursor-pointer select-none',
        selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)]' : active ? 'border-[var(--accent)] shadow-[var(--shadow-sm)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-xs)]',
      )}
    >
      <CardThumb file={file} isImage={isImage} badge={badge} selected={selected} onToggleSelect={onToggleSelect} menu={menu} onToggleStar={onToggleStar} />
      <CardMeta file={file} folderName={folder?.name} />
      <AttachmentMenus menu={menu} items={menuItems} />
    </div>
  )
}

function CardThumb({ file, isImage, badge, selected, onToggleSelect, menu, onToggleStar }: {
  file: AttachmentWithUsage
  isImage: boolean
  badge: Badge['badge']
  selected: boolean
  onToggleSelect: (e: React.MouseEvent) => void
  menu: ReturnType<typeof useCardMenu>
  onToggleStar: () => void
}) {
  return (
    <div className='relative aspect-4/3 w-full overflow-hidden bg-[var(--bg-sunken)]'>
      {isImage ? (
        <img src={file.url} alt={file.filename} loading='lazy' className='h-full w-full object-cover transition-transform duration-[var(--dur-base)] group-hover:scale-105' />
      ) : (
        <div className='flex h-full w-full items-center justify-center p-4'>
          <div className={cn('flex flex-col items-center gap-1 rounded-xl p-3', badge.bg)}>
            <span className={cn('text-sm font-bold tracking-wider', badge.text)}>{badge.label}</span>
          </div>
        </div>
      )}

      <CardSelect selected={selected} onToggleSelect={onToggleSelect} />
      <ThumbActions file={file} menu={menu} onToggleStar={onToggleStar} />

      {file.references === 0 && (
        <div className='absolute bottom-1.5 left-1.5 rounded px-1 py-0.5 text-[length:var(--text-9)] font-medium bg-amber-500/85 text-white backdrop-blur-xs'>
          {t('attachments.unreferenced')}
        </div>
      )}
    </div>
  )
}

function CardSelect({ selected, onToggleSelect }: { selected: boolean; onToggleSelect: (e: React.MouseEvent) => void }) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onToggleSelect(e)
      }}
      className={cn(
        'absolute top-2 left-2 z-[var(--z-sticky)] flex h-5 w-5 items-center justify-center rounded transition-opacity',
        selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
    >
      <div
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border shadow-[var(--shadow-xs)] transition-colors',
          selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-white/80 bg-black/40 hover:bg-black/60',
        )}
      >
        {selected && <Check size={11} strokeWidth={3} />}
      </div>
    </div>
  )
}

function ThumbActions({ file, menu, onToggleStar }: {
  file: AttachmentWithUsage
  menu: ReturnType<typeof useCardMenu>
  onToggleStar: () => void
}) {
  return (
    <div className='absolute top-2 right-2 z-[var(--z-sticky)] flex items-center gap-1'>
      {file.isPinned && (
        <div className='flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-xs'>
          <Pin size={10} />
        </div>
      )}
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar()
        }}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full transition-opacity',
          file.isStarred ? 'bg-amber-500 text-white' : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white',
        )}
      >
        <Star size={10} className={file.isStarred ? 'fill-current' : undefined} />
      </button>
      <button
        ref={menu.buttonRef}
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          menu.toggle()
        }}
        className='flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity'
      >
        <MoreVertical size={11} />
      </button>
    </div>
  )
}

function CardMeta({ file, folderName }: { file: AttachmentWithUsage; folderName?: string }) {
  return (
    <div className='p-2 space-y-1'>
      <p className='truncate text-[length:var(--text-12)] font-medium text-[var(--text-primary)]' title={file.filename}>
        {file.filename}
      </p>

      <div className='flex items-center justify-between text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        <span>{formatFileSize(file.size)}</span>
        {folderName && (
          <span className='truncate max-w-20' title={folderName}>
            {folderName}
          </span>
        )}
      </div>

      {file.tags && file.tags.length > 0 && (
        <div className='flex flex-wrap gap-1 pt-0.5'>
          {file.tags.slice(0, 2).map((tag) => (
            <span key={tag} className='rounded bg-[var(--bg-sunken)] px-1 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
              #{tag}
            </span>
          ))}
          {file.tags.length > 2 && (
            <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
              +{file.tags.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  )
}