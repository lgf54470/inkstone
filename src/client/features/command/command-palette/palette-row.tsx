import { memo } from 'react';
import { splitByRanges } from '../../../lib/fuzzy';
import { cn } from '../../../lib/cn';
import { Kbd } from '../../../components/primitives';
import type { Item } from './types';

export const PaletteRow = memo(function PaletteRow({ item, active, index, listId, isKeyboardNav, onActivate, onPointerNav, onSelect, }: {
    item: Item;
    active: boolean;
    index: number;
    listId: string;
    isKeyboardNav: boolean;
    onActivate: (index: number) => void;
    onPointerNav: () => void;
    onSelect: (item: Item) => void;
}) {
    const parts = item.match
        ? splitByRanges(item.label, item.match.ranges)
        : [{ text: item.label, hit: false }];
    return (<button id={`${listId}-option-${index}`} type="button" role="option" aria-selected={active} tabIndex={-1} data-index={index} onMouseEnter={() => {
        onPointerNav();
        onActivate(index);
    }} onClick={() => onSelect(item)} className={cn('flex w-full items-center gap-2.5 rounded-[var(--r-md)] px-2.5 py-2 text-left', isKeyboardNav && 'transition-colors duration-[80ms]', active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]')}>
      <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')}>
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--text-13)] text-[var(--text-primary)]">
          {parts.map((part, i) => part.hit ? (<mark key={i} className="ink-hit">
                {part.text}
              </mark>) : (<span key={i}>{part.text}</span>))}
        </span>
        {item.detail && (<span className="mt-0.5 block truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]">
            {item.detail}
          </span>)}
      </span>
      {item.combo && <Kbd combo={item.combo}/>}
    </button>);
})
