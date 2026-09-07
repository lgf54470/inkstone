import { Check, Hash, Settings2 } from 'lucide-react'
import { ORGANIZER_COLORS } from '@shared/organizer-colors'
import type { Tag } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'

function ClearColorButton({ active, onClear }: { active: boolean; onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label={t('tags.clear_color')}
      title={t('tags.clear_color')}
      aria-pressed={active}
      onClick={onClear}
      className={cn(
        'flex size-7 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
        active
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
          : 'border-[var(--border-default)] hover:text-[var(--text-secondary)]',
      )}
    >
      <Hash size={13} />
    </button>
  )
}

function ColorSwatchButton({ color, active, onSelect }: { color: string; active: boolean; onSelect: (color: string) => void }) {
  return (
    <button
      type="button"
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
      {active && <Check size={13} className="text-white drop-shadow-[var(--drop-shadow-sm)]" />}
    </button>
  )
}

function ColorSwatchGrid({ tag, onSelectColor }: { tag: Tag; onSelectColor: (color: string | null) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5 px-0.5">
      <ClearColorButton active={!tag.color} onClear={() => onSelectColor(null)} />
      {ORGANIZER_COLORS.map((color) => (
        <ColorSwatchButton key={color} color={color} active={tag.color === color} onSelect={onSelectColor} />
      ))}
    </div>
  )
}

function ManageTagsRow({ onManageTags }: { onManageTags: () => void }) {
  return (
    <button
      type="button"
      onClick={onManageTags}
      className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\\.5)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
    >
      <Settings2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
      <span className="truncate">{t('tags.manage_tags')}</span>
    </button>
  )
}

export function TagColorSubmenu({
  tag,
  onSelectColor,
  onManageTags,
}: {
  tag: Tag
  onSelectColor: (color: string | null) => void
  onManageTags: () => void
}) {
  return (
    <div
      className="w-[218px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)] outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-1 pb-2 pt-0.5 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]">
        {t('tags.color')}
      </div>
      <ColorSwatchGrid tag={tag} onSelectColor={onSelectColor} />
      <div role="separator" className="my-2 h-px bg-[var(--border-subtle)]" />
      <ManageTagsRow onManageTags={onManageTags} />
    </div>
  )
}
