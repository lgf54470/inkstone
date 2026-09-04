import { Check } from 'lucide-react';
import type { MenuItem } from '../../../components/overlay';
import { Kbd } from '../../../components/primitives';
import { cn } from '../../../lib/cn';

export function SubmenuList({
  items,
  closeMenu,
  width = 180,
}: {
  items: MenuItem[];
  closeMenu: () => void;
  width?: number;
}) {
  return (
    <div
      style={{ width }}
      className="max-h-[380px] overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore && <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />}
          <button
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              closeMenu();
            }}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[12.5px] md:h-[30px]',
              'transition-colors duration-[80ms] hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40',
              item.tone === 'danger'
                ? 'text-[var(--danger)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {item.icon && (
              <span className="flex size-4 shrink-0 items-center justify-center opacity-85">{item.icon}</span>
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.checked && <Check size={13} className="shrink-0 text-[var(--accent)]" />}
            {item.combo && <Kbd combo={item.combo} />}
          </button>
        </div>
      ))}
    </div>
  );
}
