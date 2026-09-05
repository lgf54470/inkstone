import { Check, FolderClosed, Smile } from 'lucide-react';
import { ORGANIZER_COLORS } from '@shared/organizer-colors';
import type { Folder } from '@shared/types';
import { Tooltip } from '../../../components/overlay';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import { COMMON_FOLDER_ICONS } from './constants';

export function FolderIconBadge({ folder, isOpen, onToggle }: {
  folder: Folder;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip label={t('folders.icon')}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] border bg-[var(--bg-surface)] transition-all hover:scale-105',
          isOpen
            ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)]'
            : 'border-[var(--border-subtle)]'
        )}
        style={{ color: folder.color ?? 'var(--text-tertiary)' }}
      >
        {folder.icon ? (
          <span className="text-[length:var(--text-14)] leading-none">{folder.icon}</span>
        ) : (
          <FolderClosed size={15} />
        )}
      </button>
    </Tooltip>
  );
}

export function FolderColorPicker({ folder, onPick }: {
  folder: Folder;
  onPick: (color: string | null) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
      <Tooltip label={t('folders.no_color')}>
        <button
          type="button"
          aria-label={t('folders.no_color')}
          onClick={() => onPick(null)}
          className={cn(
            'flex size-6 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
            !folder.color
              ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
              : 'border-[var(--border-default)]'
          )}
        >
          <FolderClosed size={12} />
        </button>
      </Tooltip>
      {ORGANIZER_COLORS.map((color) => {
        const isSelected = folder.color === color;
        return (
          <Tooltip key={color} label={color}>
            <button
              type="button"
              aria-label={color}
              onClick={() => onPick(color)}
              className={cn(
                'flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110',
                isSelected && 'ring-2 ring-[var(--accent-ring)] ring-offset-1 ring-offset-[var(--bg-surface)]'
              )}
              style={{ backgroundColor: color }}
            >
              {isSelected && <Check size={12} className="text-white drop-shadow-sm" />}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function FolderCustomIconInput({ onPick }: { onPick: (icon: string) => void }) {
  return (
    <div className="relative flex items-center">
      <Smile size={12} className="pointer-events-none absolute left-2 text-[var(--text-quaternary)]" />
      <input
        type="text"
        placeholder={t('folders.custom_icon_placeholder')}
        onChange={(e) => {
          const trimmed = e.target.value.trim();
          if (trimmed) {
            const char = Array.from(trimmed)[0];
            if (char) onPick(char);
          }
        }}
        className="h-6 w-48 rounded-[var(--r-xs)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-6 pr-2 text-[length:var(--text-11\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}

export function FolderIconPicker({ folder, onPick }: {
  folder: Folder;
  onPick: (icon: string | null) => void;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip label={t('folders.no_icon')}>
          <button
            type="button"
            aria-label={t('folders.no_icon')}
            onClick={() => onPick(null)}
            className={cn(
              'flex size-6 items-center justify-center rounded-[var(--r-xs)] border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
              !folder.icon
                ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
                : 'border-[var(--border-default)]'
            )}
          >
            <FolderClosed size={12} />
          </button>
        </Tooltip>
        {COMMON_FOLDER_ICONS.map((icon) => {
          const isSelected = folder.icon === icon;
          return (
            <Tooltip key={icon} label={icon}>
              <button
                type="button"
                aria-label={icon}
                onClick={() => onPick(icon)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-[var(--r-xs)] text-[length:var(--text-14)] leading-none transition-transform hover:scale-110',
                  isSelected
                    ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent-ring)]'
                    : 'hover:bg-[var(--bg-hover)]'
                )}
              >
                {icon}
              </button>
            </Tooltip>
          );
        })}
      </div>
      <FolderCustomIconInput onPick={onPick} />
    </div>
  );
}