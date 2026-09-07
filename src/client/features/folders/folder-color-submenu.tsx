import { Check, FolderClosed, Settings2 } from 'lucide-react'
import { ORGANIZER_COLORS } from '@shared/organizer-colors'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'

interface FolderColorLike {
  color?: string | null
}

function NoColorButton({ active, onSelect }: { active: boolean; onSelect: (color: string | null) => void }) {
  return (
    <button
      type='button'
      aria-label={t('folders.no_color')}
      title={t('folders.no_color')}
      aria-pressed={active}
      onClick={() => onSelect(null)}
      className={cn(
        'flex size-7 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
        active
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
          : 'border-[var(--border-default)] hover:text-[var(--text-secondary)]',
      )}
    >
      <FolderClosed size={13} />
    </button>
  )
}

function ColorSwatchButton({
  color,
  active,
  onSelect,
}: {
  color: string
  active: boolean
  onSelect: (color: string) => void
}) {
  return (
    <button
      type='button'
      aria-label={color}
      title={color}
      aria-pressed={active}
      onClick={() => onSelect(color)}
      className={cn(
        'flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110',
        active && 'ring-2 ring-[var(--accent-ring)] ring-offset-2 ring-offset-[var(--bg-surface)]',
      )}
      style={{ backgroundColor: color }}
    >
      {active && <Check size={13} className='text-white drop-shadow-[var(--drop-shadow-sm)]' />}
    </button>
  )
}

function ColorSwatchGrid({ folder, onSelectColor }: { folder: FolderColorLike; onSelectColor: (color: string | null) => void }) {
  return (
    <div className='grid grid-cols-6 gap-1.5 px-0.5'>
      <NoColorButton active={!folder.color} onSelect={onSelectColor} />
      {ORGANIZER_COLORS.map((color) => (
        <ColorSwatchButton key={color} color={color} active={folder.color === color} onSelect={onSelectColor} />
      ))}
    </div>
  )
}

function ManageFoldersRow({ onManageFolders }: { onManageFolders: () => void }) {
  return (
    <>
      <div role='separator' className='my-2 h-px bg-[var(--border-subtle)]' />
      <button
        type='button'
        onClick={onManageFolders}
        className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\\.5)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <Settings2 size={13} className='shrink-0 text-[var(--text-tertiary)]' />
        <span className='truncate'>{t('folders.manage_folders')}</span>
      </button>
    </>
  )
}

export function FolderColorSubmenu({
  folder,
  onSelectColor,
  onManageFolders,
}: {
  folder: FolderColorLike
  onSelectColor: (color: string | null) => void
  onManageFolders: () => void
}) {
  return (
    <div
      className='w-54.5 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)] outline-none'
      onClick={(e) => e.stopPropagation()}
    >
      <div className='px-1 pb-2 pt-0.5 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        {t('folders.color')}
      </div>
      <ColorSwatchGrid folder={folder} onSelectColor={onSelectColor} />
      <ManageFoldersRow onManageFolders={onManageFolders} />
    </div>
  )
}
