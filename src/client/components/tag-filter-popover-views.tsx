import type { JSX } from 'react';
import { CheckCheck, Hash, Lock, Search, TriangleAlert, X } from 'lucide-react';
import { LIMITS } from '@shared/constants';
import type { Tag } from '@shared/types';
import { cn } from '../lib/cn';
import { t } from '../lib/i18n';
import { clearTagSelection } from '../lib/tag-selection';
import { TagNameHighlight } from './tag-name-highlight';

export function TagSearchInput({ inputRef, value, onChange }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (<div className='relative'>
    <Search size={13} className='pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--text-quaternary)]'/>
    <input ref={inputRef} aria-label={t('command.filter_by_tags')} value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('notes.tag_filter_search')} className='h-8 w-full rounded-[var(--r-sm)] bg-[var(--bg-inset)] pr-2 pl-7 text-[length:var(--text-12)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none'/>
  </div>);
}

export function TagMatchToggle({ match, onChange }: {
  match: 'any' | 'all';
  onChange: (match: 'any' | 'all') => void;
}): JSX.Element {
  return (<div role='group' aria-label={t('notes.selected_tags_match')} className='mt-1.5 flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--bg-inset)] p-0.5'>
    <button type='button' aria-pressed={match === 'any'} onClick={() => onChange('any')} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[length:var(--text-11)] transition-colors', match === 'any' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-tertiary)]')}>{t('notes.tag_match_any')}</button>
    <button type='button' aria-pressed={match === 'all'} onClick={() => onChange('all')} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[length:var(--text-11)] transition-colors', match === 'all' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-tertiary)]')}>{t('notes.tag_match_all')}</button>
  </div>);
}

export function TagList({ tags, selectedTags, query, highlightedRef, onToggle }: {
  tags: Tag[];
  selectedTags: string[];
  query: string;
  highlightedRef: React.RefObject<HTMLButtonElement | null>;
  onToggle: (name: string) => void;
}): JSX.Element {
  if (tags.length === 0)
    return <div className="px-2 py-3 text-center text-[length:var(--text-11\\.5)] text-[var(--text-quaternary)]">{t('notes.no_matching_tags')}</div>;
  return (<div className='max-h-62 overflow-y-auto' role='listbox' aria-multiselectable='true'>
    {tags.map((tag) => {
      const selected = selectedTags.includes(tag.name);
      return (<button key={tag.id} type='button' role='option' aria-selected={selected} ref={selected || tags[0]?.id === tag.id ? highlightedRef : undefined} onClick={() => onToggle(tag.name)} className={cn('flex h-8 w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[length:var(--text-12)] transition-colors hover:bg-[var(--bg-hover)]', selected
        ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)]')}>
        <span aria-hidden='true' className={cn('size-1.75 shrink-0 rounded-full', !tag.color && 'bg-[var(--text-quaternary)] opacity-40', selected && 'ring-2 ring-[var(--accent)]')} style={tag.color ? { backgroundColor: tag.color } : undefined}/>
        <Hash size={12} className='shrink-0 text-[var(--text-quaternary)]'/>
        <span className='min-w-0 flex-1 truncate'>#<TagNameHighlight name={tag.name} query={query}/></span>
        <span className="shrink-0 tabular-nums text-[length:var(--text-10\\.5)] text-[var(--text-quaternary)]">{tag.count}</span>
        {selected && <span className='shrink-0 text-[var(--accent)]'>✓</span>}
      </button>);
    })}
  </div>);
}

export function TagPickerFooter({ visibleCount, searching, atCap, hasSelection, onSelectAll }: {
  visibleCount: number;
  searching: boolean;
  atCap: boolean;
  hasSelection: boolean;
  onSelectAll: () => void;
}): JSX.Element {
  return (<>
    <div className='mt-1 h-px bg-[var(--border-subtle)]'/>
    <div className='mt-1 flex items-center gap-1'>
      <button type='button' disabled={!hasSelection} onClick={() => clearTagSelection({ notify: true })} className='flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40'>
        <X size={12}/>
        {t('common.clear_selection')}
      </button>
      <button type='button' aria-disabled={atCap} title={atCap ? t('tags.selection_limit', { value0: LIMITS.tagSelectionMax }) : undefined} onClick={onSelectAll} className={cn('flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] font-medium transition-colors hover:bg-[var(--bg-hover)]', atCap ? 'text-[var(--text-quaternary)] opacity-40' : 'text-[var(--accent)]')}>
        {atCap ? <Lock size={11}/> : <CheckCheck size={12}/>}
        {searching ? t('command.select_all_matches', { value0: visibleCount }) : t('command.select_all_tags', { value0: visibleCount })}
      </button>
    </div>
    {atCap && <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[length:var(--text-10\\.5)] font-medium text-[var(--danger)]">
      <TriangleAlert size={11} className='shrink-0'/>
      {t('tags.selection_limit', { value0: LIMITS.tagSelectionMax })}
    </div>}
  </>);
}