import { useState } from 'react'
import { FolderClosed, Smile } from 'lucide-react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'

const COMMON_FOLDER_ICONS = [
  '📁', '📚', '💼', '🧠', '💡', '🎯',
  '🗂️', '✨', '🚀', '📝', '📌', '🏷️',
  '⭐', '🔥', '☕', '🎨', '📦', '🛠️',
] as const

interface FolderIconLike {
  icon?: string | null
}

function firstCharacter(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return Array.from(trimmed)[0] ?? null
}

function NoIconButton({ active, onSelect }: { active: boolean; onSelect: (icon: string | null) => void }) {
  return (
    <button
      type='button'
      aria-label={t('folders.no_icon')}
      title={t('folders.no_icon')}
      aria-pressed={active}
      onClick={() => onSelect(null)}
      className={cn(
        'flex size-7 items-center justify-center rounded-[var(--r-sm)] border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
        active
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
          : 'border-[var(--border-default)] hover:text-[var(--text-secondary)]',
      )}
    >
      <FolderClosed size={13} />
    </button>
  )
}

function IconChoiceButton({
  icon,
  active,
  onSelect,
}: {
  icon: string
  active: boolean
  onSelect: (icon: string) => void
}) {
  return (
    <button
      type='button'
      aria-label={icon}
      title={icon}
      aria-pressed={active}
      onClick={() => onSelect(icon)}
      className={cn(
        'flex size-7 items-center justify-center rounded-[var(--r-sm)] border text-[length:var(--text-14)] leading-none transition-transform hover:scale-110',
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent-ring)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-default)]',
      )}
    >
      {icon}
    </button>
  )
}

function IconChoiceGrid({ folder, onSelectIcon }: { folder: FolderIconLike; onSelectIcon: (icon: string | null) => void }) {
  return (
    <div className='grid grid-cols-6 gap-1.5 px-0.5'>
      <NoIconButton active={!folder.icon} onSelect={onSelectIcon} />
      {COMMON_FOLDER_ICONS.map((icon) => (
        <IconChoiceButton key={icon} icon={icon} active={folder.icon === icon} onSelect={onSelectIcon} />
      ))}
    </div>
  )
}

function CustomEmojiField({ onSelectIcon }: { onSelectIcon: (icon: string | null) => void }) {
  const [value, setValue] = useState('')

  const pickFirstCharacter = (raw: string) => {
    const char = firstCharacter(raw)
    if (char) onSelectIcon(char)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        pickFirstCharacter(value)
      }}
      className='relative flex items-center px-0.5'
    >
      <Smile size={13} className='pointer-events-none absolute left-2 text-[var(--text-quaternary)]' />
      <input
        type='text'
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          pickFirstCharacter(e.target.value)
        }}
        placeholder={t('folders.custom_icon_placeholder')}
        className='h-7 w-full rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-6 pr-2 text-[length:var(--text-12)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] outline-none focus:border-[var(--accent)]'
      />
    </form>
  )
}

export function FolderIconSubmenu({
  folder,
  onSelectIcon,
}: {
  folder: FolderIconLike
  onSelectIcon: (icon: string | null) => void
}) {
  return (
    <div
      className='w-[224px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)] outline-none'
      onClick={(e) => e.stopPropagation()}
    >
      <div className='px-1 pb-2 pt-0.5 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        {t('folders.icon')}
      </div>
      <IconChoiceGrid folder={folder} onSelectIcon={onSelectIcon} />
      <div role='separator' className='my-2 h-px bg-[var(--border-subtle)]' />
      <CustomEmojiField onSelectIcon={onSelectIcon} />
    </div>
  )
}
