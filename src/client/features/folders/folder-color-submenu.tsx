import { Check, FolderClosed, Settings2 } from 'lucide-react';
import { ORGANIZER_COLORS } from '@shared/organizer-colors';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';

export function FolderColorSubmenu({
  folder,
  onSelectColor,
  onManageFolders,
}: {
  folder: { color?: string | null };
  onSelectColor: (color: string | null) => void;
  onManageFolders: () => void;
}) {
  return (
    <div
      className="w-[218px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)] outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-1 pb-2 pt-0.5 text-[12px] font-medium text-[var(--text-secondary)]">
        {t('folders.color')}
      </div>

      <div className="grid grid-cols-6 gap-1.5 px-0.5">
        <button
          type="button"
          aria-label={t('folders.no_color')}
          title={t('folders.no_color')}
          aria-pressed={!folder.color}
          onClick={() => onSelectColor(null)}
          className={cn(
            'flex size-7 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
            !folder.color
              ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
              : 'border-[var(--border-default)] hover:text-[var(--text-secondary)]'
          )}
        >
          <FolderClosed size={13} />
        </button>

        {ORGANIZER_COLORS.map((color) => {
          const isSelected = folder.color === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={color}
              title={color}
              aria-pressed={isSelected}
              onClick={() => onSelectColor(color)}
              className={cn(
                'flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110',
                isSelected && 'ring-2 ring-[var(--accent-ring)] ring-offset-2 ring-offset-[var(--bg-surface)]'
              )}
              style={{ backgroundColor: color }}
            >
              {isSelected && <Check size={13} className="text-white drop-shadow-sm" />}
            </button>
          );
        })}
      </div>

      <div role="separator" className="my-2 h-px bg-[var(--border-subtle)]" />

      <button
        type="button"
        onClick={onManageFolders}
        className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[12.5px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <Settings2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="truncate">{t('folders.manage_folders')}</span>
      </button>
    </div>
  );
}
