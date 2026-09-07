import { useState } from 'react';
import type { ViewKind } from '@shared/types';
import { cn } from '../../../lib/cn';
import { useNotes } from '../../../store/notes';
import { isNoteDragEvent, leftDropTarget, readDraggedNoteIds } from './sidebar-drop';


function WeChatBadge({ count }: { count?: number }) {
  if (count == null || count <= 0) return null;
  const text = count > 99 ? '99+' : String(count);
  return (
    <span
      className={cn(
        'pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 z-[var(--z-sticky)]',
        'flex items-center justify-center',
        'rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold',
        'text-[length:var(--text-10)] leading-none select-none shadow-[var(--shadow-xs)]',
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
        if (!acceptsDrop || !isNoteDragEvent(e)) return;
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
        const ids = readDraggedNoteIds(e);
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
      <span className="truncate text-[length:var(--text-11\.5)] font-medium leading-none">
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
    const deleteNote = useNotes((s) => s.deleteNote);
    const acceptsDrop = view === 'unfiled' || view === 'starred' || view === 'archived' || view === 'trash';
    return (<button type="button" aria-current={active ? 'page' : undefined} onClick={() => onSelect(view)} onDragOver={(e) => {
            if (!acceptsDrop || !isNoteDragEvent(e))
                return;
            e.preventDefault();
            setIsDropping(true);
        }} onDragLeave={(e) => {
            if (leftDropTarget(e))
                setIsDropping(false);
        }} onDrop={(e) => {
            setIsDropping(false);
            e.preventDefault();
            const ids = readDraggedNoteIds(e);
            if (ids.length === 0) return;
            applyViewDrop(view, ids, patchNote, deleteNote);
        }} className={cn('group relative flex h-10 w-full items-center gap-2.5 rounded-[var(--r-md)] px-2 text-left md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active
            ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]', isDropping && 'ring-1 ring-[var(--accent)]')}>
      <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[length:var(--text-12\.5)] font-medium">{label}</span>
      {count != null && count > 0 && (<span className="shrink-0 text-[length:var(--text-11)] tabular text-[var(--text-quaternary)]">{count}</span>)}
    </button>);
}

function applyViewDrop(view: ViewKind, ids: string[], patchNote: ReturnType<typeof useNotes.getState>['patchNote'], deleteNote: ReturnType<typeof useNotes.getState>['deleteNote']): void {
    if (view === 'unfiled') {
        void useNotes.getState().moveNotes(ids, null);
        return;
    }
    if (view === 'starred') {
        ids.forEach((id) => void patchNote(id, { isStarred: true }));
        return;
    }
    if (view === 'archived') {
        ids.forEach((id) => void patchNote(id, { isArchived: true }));
        return;
    }
    if (view === 'trash')
        ids.forEach((id) => void deleteNote(id));
}
