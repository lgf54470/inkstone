import { useState } from 'react';
import type { ViewKind } from '@shared/types';
import { cn } from '../../../lib/cn';
import { tryParseStringArray } from '../../../lib/json';
import { useNotes } from '../../../store/notes';
import { leftDropTarget } from './sidebar-drop';

export function WeChatBadge({ count }: { count?: number }) {
  if (count == null || count <= 0) return null;
  const text = count > 99 ? '99+' : String(count);
  return (
    <span
      className={cn(
        'pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 z-[var(--z-sticky)]',
        'flex items-center justify-center',
        'rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold',
        'text-[10px] leading-none select-none shadow-xs',
        'ring-2 ring-[var(--bg-sunken)]',
        count > 99
          ? 'h-4 min-w-[22px] px-1'
          : count > 9
            ? 'h-4 min-w-[18px] px-1'
            : 'size-4'
      )}
    >
      {text}
    </span>
  );
}

export function BottomNavButton({
  icon,
  label,
  count,
  active,
  onClick,
  onDropNotes,
  acceptsDrop = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  onDropNotes?: (ids: string[]) => void;
  acceptsDrop?: boolean;
}) {
  const [isDropping, setIsDropping] = useState(false);

  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onDragOver={(e) => {
        if (!acceptsDrop || (!e.dataTransfer.types.includes('application/x-inkstone-note') && !e.dataTransfer.types.includes('application/x-inkstone-notes'))) {
          return;
        }
        e.preventDefault();
        setIsDropping(true);
      }}
      onDragLeave={(e) => {
        if (leftDropTarget(e)) {
          setIsDropping(false);
        }
      }}
      onDrop={(e) => {
        if (!acceptsDrop || !onDropNotes) return;
        setIsDropping(false);
        e.preventDefault();
        let ids: string[] = [];
        const multi = e.dataTransfer.getData('application/x-inkstone-notes');
        if (multi) ids = tryParseStringArray(multi);
        if (ids.length === 0) {
          const single = e.dataTransfer.getData('application/x-inkstone-note');
          if (single) ids = [single];
        }
        if (ids.length === 0) return;
        onDropNotes(ids);
      }}
      className={cn(
        'group relative flex h-8 min-w-0 items-center justify-center gap-1 rounded-[var(--r-md)] px-1 text-center',
        'transition-colors duration-[var(--dur-fast)] select-none',
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        isDropping && 'ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]'
      )}
      title={label}
    >
      <WeChatBadge count={count} />
      <span className={cn('shrink-0 transition-colors', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]')}>
        {icon}
      </span>
      <span className="truncate text-[11.5px] font-medium leading-none">
        {label}
      </span>
    </button>
  );
}

export function ViewItem({ icon, label, view, count, active, onSelect, }: {
    icon: React.ReactNode;
    label: string;
    view: ViewKind;
    count?: number;
    active: boolean;
    onSelect: (view: ViewKind) => void;
}) {
    const [isDropping, setIsDropping] = useState(false);
    const patchNote = useNotes((s) => s.patchNote);
    const acceptsDrop = view === 'unfiled' || view === 'starred' || view === 'archived' || view === 'trash';
    const deleteNote = useNotes((s) => s.deleteNote);
    return (<button type="button" aria-current={active ? 'page' : undefined} onClick={() => onSelect(view)} onDragOver={(e) => {
            if (!acceptsDrop || (!e.dataTransfer.types.includes('application/x-inkstone-note') && !e.dataTransfer.types.includes('application/x-inkstone-notes')))
                return;
            e.preventDefault();
            setIsDropping(true);
        }} onDragLeave={(e) => {
            if (leftDropTarget(e))
                setIsDropping(false);
        }} onDrop={(e) => {
            setIsDropping(false);
            e.preventDefault();
            let ids: string[] = [];
            const multi = e.dataTransfer.getData('application/x-inkstone-notes');
            if (multi) ids = tryParseStringArray(multi);
            if (ids.length === 0) {
                const single = e.dataTransfer.getData('application/x-inkstone-note');
                if (single) ids = [single];
            }
            if (ids.length === 0) return;
            if (view === 'unfiled')
                void useNotes.getState().moveNotes(ids, null);
            else if (view === 'starred')
                ids.forEach((id) => void patchNote(id, { isStarred: true }));
            else if (view === 'archived')
                ids.forEach((id) => void patchNote(id, { isArchived: true }));
            else if (view === 'trash')
                ids.forEach((id) => void deleteNote(id));
        }} className={cn('group relative flex h-10 w-full items-center gap-2.5 rounded-[var(--r-md)] px-2 text-left md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active
            ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]', isDropping && 'ring-1 ring-[var(--accent)]')}>
      <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{label}</span>
      {count != null && count > 0 && (<span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)]">{count}</span>)}
    </button>);
}

