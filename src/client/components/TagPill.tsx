import { memo } from 'react';
import { Hash, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { t } from '../lib/i18n';

export interface TagPillProps {
  tag: string;
  color?: string | null;
  size?: 'sm' | 'md';
  removable?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  onRemove?: (e?: React.MouseEvent) => void;
  className?: string;
}

export const TagPill = memo(function TagPill({
  tag,
  color,
  size = 'sm',
  removable = false,
  onClick,
  onRemove,
  className,
}: TagPillProps) {
  const isSm = size === 'sm';

  const pillStyle = color
    ? {
        backgroundColor: `${color}18`,
        color: color,
        borderColor: `${color}38`,
      }
    : {
        backgroundColor: 'var(--accent-softer)',
        color: 'var(--accent)',
        borderColor: 'var(--border-subtle)',
      };

  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      title={onClick ? t('tags.filter_by_tag', { value0: tag }) : `#${tag}`}
      style={pillStyle}
      className={cn(
        'group/tag inline-flex items-center rounded-full border transition-all select-none',
        isSm ? 'h-5 gap-0.5 px-2 text-[10.5px] font-medium' : 'h-6 gap-1 px-2.5 text-[12px] font-medium',
        onClick && 'cursor-pointer hover:brightness-95 dark:hover:brightness-110 active:scale-[0.98]',
        className
      )}
    >
      <Hash size={isSm ? 10 : 12} className="shrink-0 opacity-70" />
      <span className="truncate max-w-[150px]">{tag}</span>
      {removable && onRemove && (
        <button
          type="button"
          tabIndex={0}
          aria-label={t('tags.remove_from_note')}
          title={t('tags.remove_from_note')}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
          className={cn(
            'flex items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/15',
            isSm ? 'size-3.5 -mr-1 ml-0.5' : 'size-4 -mr-1 ml-0.5'
          )}
        >
          <X size={isSm ? 9 : 11} />
        </button>
      )}
    </span>
  );
});
