import { useState } from 'react';
import { FolderClosed, Smile } from 'lucide-react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';

const COMMON_FOLDER_ICONS = [
  '📁', '📚', '💼', '🧠', '💡', '🎯',
  '🗂️', '✨', '🚀', '📝', '📌', '🏷️',
  '⭐', '🔥', '☕', '🎨', '📦', '🛠️',
] as const;

export function FolderIconSubmenu({
  folder,
  onSelectIcon,
}: {
  folder: { icon?: string | null };
  onSelectIcon: (icon: string | null) => void;
}) {
  const [customEmoji, setCustomEmoji] = useState('');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customEmoji.trim();
    if (trimmed) {
      // Pick first grapheme/character
      const char = Array.from(trimmed)[0];
      if (char) {
        onSelectIcon(char);
      }
    }
  };

  return (
    <div
      className="w-[224px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)] outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-1 pb-2 pt-0.5 text-[12px] font-medium text-[var(--text-secondary)]">
        {t('folders.icon')}
      </div>

      <div className="grid grid-cols-6 gap-1.5 px-0.5">
        <button
          type="button"
          aria-label={t('folders.no_icon')}
          title={t('folders.no_icon')}
          aria-pressed={!folder.icon}
          onClick={() => onSelectIcon(null)}
          className={cn(
            'flex size-7 items-center justify-center rounded-[var(--r-sm)] border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
            !folder.icon
              ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
              : 'border-[var(--border-default)] hover:text-[var(--text-secondary)]'
          )}
        >
          <FolderClosed size={13} />
        </button>

        {COMMON_FOLDER_ICONS.map((icon) => {
          const isSelected = folder.icon === icon;
          return (
            <button
              key={icon}
              type="button"
              aria-label={icon}
              title={icon}
              aria-pressed={isSelected}
              onClick={() => onSelectIcon(icon)}
              className={cn(
                'flex size-7 items-center justify-center rounded-[var(--r-sm)] border text-[14px] leading-none transition-transform hover:scale-110',
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent-ring)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-default)]'
              )}
            >
              {icon}
            </button>
          );
        })}
      </div>

      <div role="separator" className="my-2 h-px bg-[var(--border-subtle)]" />

      <form onSubmit={handleCustomSubmit} className="relative flex items-center px-0.5">
        <Smile size={13} className="pointer-events-none absolute left-2 text-[var(--text-quaternary)]" />
        <input
          type="text"
          value={customEmoji}
          onChange={(e) => {
            setCustomEmoji(e.target.value);
            const trimmed = e.target.value.trim();
            if (trimmed) {
              const char = Array.from(trimmed)[0];
              if (char) onSelectIcon(char);
            }
          }}
          placeholder={t('folders.custom_icon_placeholder')}
          className="h-7 w-full rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-6 pr-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] outline-none focus:border-[var(--accent)]"
        />
      </form>
    </div>
  );
}
