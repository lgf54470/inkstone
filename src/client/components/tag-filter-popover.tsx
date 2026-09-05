import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCheck, Hash, Lock, Search, TriangleAlert, X } from 'lucide-react';
import { LIMITS } from '@shared/constants';
import { cn } from '../lib/cn';
import { getVisibleViewport } from '../lib/viewport';
import { t } from '../lib/i18n';
import { sortTagsForPicker } from '../lib/tag-sort';
import { clearTagSelection } from '../lib/tag-selection';
import { useNotes } from '../store/notes';
import { useUi } from '../store/ui';
import { useClickOutside, useEscape } from './overlay';
import { TagNameHighlight } from './tag-name-highlight';

/** Shared multi-tag picker: searchable tag checklist with note counts and an any/all match-mode switch. */
export function TagFilterPopover({ anchor, open, onClose, align = 'end' }: {
    anchor: React.RefObject<HTMLButtonElement | null>;
    open: boolean;
    onClose: () => void;
    align?: 'start' | 'end';
}) {
    const tags = useNotes((s) => s.tags);
    const selectedTags = useUi((s) => s.selectedTags);
    const selectedTagsMatch = useUi((s) => s.selectedTagsMatch);
    const setSelectedTagsMatch = useUi((s) => s.setSelectedTagsMatch);
    const toggleTagSelection = useUi((s) => s.toggleTagSelection);
    const selectTags = useUi((s) => s.selectTags);
    const [query, setQuery] = useState('');
    const searching = query.trim() !== '';
    const atCap = selectedTags.length >= LIMITS.tagSelectionMax;
    const popoverRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0, origin: 'top right' });
    const highlightedRef = useRef<HTMLButtonElement>(null);

    useEscape(open, onClose);
    useClickOutside(anchor ? [popoverRef, anchor] : [popoverRef], open, onClose);

    const visibleTags = useMemo(() => sortTagsForPicker(tags, query), [tags, query]);

    useEffect(() => {
        if (!open)
            return;
        const margin = 8;
        const width = 236;
        const height = Math.min(392, Math.max(120, visibleTags.length * 30 + 96));
        const rect = anchor.current?.getBoundingClientRect();
        if (!rect)
            return;
        let top = rect.bottom + 5;
        let left = align === 'end' ? rect.right - width : rect.left;
        const viewport = getVisibleViewport();
        const flipUp = top + height > viewport.bottom - margin;
        if (flipUp)
            top = Math.max(viewport.top + margin, rect.top - height - 5);
        left = Math.min(Math.max(viewport.left + margin, left), viewport.right - width - margin);
        setPosition({ top, left, origin: `${flipUp ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}` });
    }, [open, align, visibleTags.length]);

    useEffect(() => {
        if (!open) {
            setQuery('');
            return;
        }
        window.requestAnimationFrame(() => inputRef.current?.focus());
    }, [open]);

    useEffect(() => {
        highlightedRef.current?.scrollIntoView({ block: 'nearest' });
    }, [query]);

    if (!open)
        return null;
    return createPortal(<div ref={popoverRef} role="dialog" aria-label={t('command.filter_by_tags')} className="anim-pop fixed z-[var(--z-hover-card)] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]" style={{ top: position.top, left: position.left, width: 236, transformOrigin: position.origin }}>
        <div className="relative">
            <Search size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--text-quaternary)]"/>
            <input ref={inputRef} aria-label={t('command.filter_by_tags')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('notes.tag_filter_search')} className="h-8 w-full rounded-[var(--r-sm)] bg-[var(--bg-inset)] pr-2 pl-7 text-[length:var(--text-12)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none"/>
        </div>
        <div role="group" aria-label={t('notes.selected_tags_match')} className="mt-1.5 flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--bg-inset)] p-0.5">
            <button type="button" aria-pressed={selectedTagsMatch === 'any'} onClick={() => setSelectedTagsMatch('any')} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[length:var(--text-11)] transition-colors', selectedTagsMatch === 'any' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-sm' : 'text-[var(--text-tertiary)]')}>{t('notes.tag_match_any')}</button>
            <button type="button" aria-pressed={selectedTagsMatch === 'all'} onClick={() => setSelectedTagsMatch('all')} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[length:var(--text-11)] transition-colors', selectedTagsMatch === 'all' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-sm' : 'text-[var(--text-tertiary)]')}>{t('notes.tag_match_all')}</button>
        </div>
        <div className="mt-1.5 mb-1 h-px bg-[var(--border-subtle)]"/>
        <div className="max-h-[248px] overflow-y-auto" role="listbox" aria-multiselectable="true">
            {visibleTags.length === 0 ? <div className="px-2 py-3 text-center text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">{t('notes.no_matching_tags')}</div> : visibleTags.map((tag) => {
                const selected = selectedTags.includes(tag.name);
                return (<button key={tag.id} type="button" role="option" aria-selected={selected} ref={selected || visibleTags[0]?.id === tag.id ? highlightedRef : undefined} onClick={() => toggleTagSelection(tag.name)} className={cn('flex h-8 w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[length:var(--text-12)] transition-colors hover:bg-[var(--bg-hover)]', selected
                    ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]')}>
                    <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', !tag.color && 'bg-[var(--text-quaternary)] opacity-40', selected && 'ring-2 ring-[var(--accent)]')} style={tag.color ? { backgroundColor: tag.color } : undefined}/>
                    <Hash size={12} className="shrink-0 text-[var(--text-quaternary)]"/>
                    <span className="min-w-0 flex-1 truncate">#<TagNameHighlight name={tag.name} query={query}/></span>
                    <span className="shrink-0 tabular-nums text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{tag.count}</span>
                    {selected && <span className="shrink-0 text-[var(--accent)]">✓</span>}
                </button>);
            })}
        </div>
        {visibleTags.length > 0 && (<>
            <div className="mt-1 h-px bg-[var(--border-subtle)]"/>
            <div className="mt-1 flex items-center gap-1">
                <button type="button" disabled={selectedTags.length === 0} onClick={() => clearTagSelection({ notify: true })} className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40">
                    <X size={12}/>
                    {t('common.clear_selection')}
                </button>
                <button type="button" aria-disabled={atCap} title={atCap ? t('tags.selection_limit', { value0: LIMITS.tagSelectionMax }) : undefined} onClick={() => {
                    if (atCap) {
                        useUi.getState().toast({ title: t('tags.selection_limit', { value0: LIMITS.tagSelectionMax }), tone: 'danger' });
                        return;
                    }
                    selectTags(visibleTags.map((tag) => tag.name));
                    useUi.getState().toast({ title: t('sidebar.tags_selected', { value0: visibleTags.length }) });
                }} className={cn('flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] font-medium transition-colors hover:bg-[var(--bg-hover)]', atCap ? 'text-[var(--text-quaternary)] opacity-40' : 'text-[var(--accent)]')}>
                    {atCap ? <Lock size={11}/> : <CheckCheck size={12}/>}
                    {searching ? t('command.select_all_matches', { value0: visibleTags.length }) : t('command.select_all_tags', { value0: visibleTags.length })}
                </button>
            </div>
            {selectedTags.length >= LIMITS.tagSelectionMax && <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[length:var(--text-10\.5)] font-medium text-[var(--danger)]">
                <TriangleAlert size={11} className="shrink-0"/>
                {t('tags.selection_limit', { value0: LIMITS.tagSelectionMax })}
            </div>}
        </>)}
    </div>, document.body);
}