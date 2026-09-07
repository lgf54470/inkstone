import { startTransition, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DateRangeFilter, NoteSummary, SortKey, SortOrder, UiDensity, ViewKind } from '@shared/types';
import { NoteRow } from './note-row';
import { NoteListSkeleton } from '../../../components/feedback';
import { ListEmpty } from './list-empty';
import { groupNotes } from './grouping';

const EMPTY_HIGHLIGHT: [number, number][] = [];
const INITIAL_RENDERED_NOTES = 60;
const RENDERED_NOTES_STEP = 80;

export interface FilteredMatch {
  note: NoteSummary;
  ranges: [number, number][];
}

interface RenderWindowInput {
  filteredMatches: FilteredMatch[] | null;
  notes: NoteSummary[];
  filteredCount: number;
  activeNoteId: string | null;
  filteredIds: string[];
  view: ViewKind;
  folderId: string | null;
  tag: string | null;
  sort: SortKey;
  order: SortOrder;
  density: UiDensity;
  deferredFilter: string;
  listRef: RefObject<HTMLDivElement | null>;
  loadMoreRef: RefObject<HTMLDivElement | null>;
}

function useActiveNoteReveal(activeNoteId: string | null, filteredIds: string[], filteredCount: number, setRenderLimit: (value: number | ((current: number) => number)) => void): void {
  useEffect(() => {
    if (!activeNoteId)
      return;
    const activeIndex = filteredIds.indexOf(activeNoteId);
    if (activeIndex < 0)
      return;
    startTransition(() => {
      setRenderLimit((current) => {
        if (activeIndex < current)
          return current;
        return Math.min(filteredCount, Math.ceil((activeIndex + 1) / RENDERED_NOTES_STEP) * RENDERED_NOTES_STEP);
      });
    });
  }, [activeNoteId, filteredIds, filteredCount]);
}

function useInfiniteLoad(filteredCount: number, renderLimit: number, listRef: RefObject<HTMLDivElement | null>, loadMoreRef: RefObject<HTMLDivElement | null>, setRenderLimit: (value: number | ((current: number) => number)) => void): void {
  useEffect(() => {
    const root = listRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || renderLimit >= filteredCount)
      return;
    if (typeof IntersectionObserver === 'undefined') {
      setRenderLimit(filteredCount);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting))
        return;
      setRenderLimit((current) => Math.min(filteredCount, current + RENDERED_NOTES_STEP));
    }, { root, rootMargin: '600px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredCount, renderLimit]);
}

export function useRenderWindow(input: RenderWindowInput) {
  const { filteredMatches, notes, filteredCount, activeNoteId, filteredIds, view, folderId, tag, sort, order, density, deferredFilter, listRef, loadMoreRef } = input;
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDERED_NOTES);
  const rendered = useMemo(() => {
    if (filteredMatches)
      return filteredMatches.slice(0, renderLimit).map((item, index) => ({ ...item, position: index + 1 }));
    return notes.slice(0, renderLimit).map((note, index) => ({ note, ranges: EMPTY_HIGHLIGHT, position: index + 1 }));
  }, [filteredMatches, notes, renderLimit]);
  const renderedIds = useMemo(() => new Set(rendered.map((item) => item.note.id)), [rendered]);
  const pendingScrollNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    setRenderLimit(INITIAL_RENDERED_NOTES);
    listRef.current?.scrollTo?.({ top: 0 });
  }, [view, folderId, tag, deferredFilter, sort, order, density]);
  useEffect(() => {
    pendingScrollNoteIdRef.current = activeNoteId;
  }, [activeNoteId, view, folderId, tag]);
  useActiveNoteReveal(activeNoteId, filteredIds, filteredCount, setRenderLimit);
  useInfiniteLoad(filteredCount, renderLimit, listRef, loadMoreRef, setRenderLimit);
  useEffect(() => {
    const targetId = pendingScrollNoteIdRef.current;
    if (!targetId || !listRef.current)
      return;
    const element = listRef.current.querySelector<HTMLElement>(`[data-note-id="${targetId}"]`);
    if (element) {
      element.scrollIntoView({ block: 'nearest' });
      pendingScrollNoteIdRef.current = null;
    }
  }, [activeNoteId, renderLimit, view, folderId, tag]);
  return { renderLimit, rendered, renderedIds };
}

export function NoteListBody({ scope, groups, title, activeNoteId, renderedIds, onKeyDown, listRef, hydrated, loading, filteredCount, filter, dateFilter, selectedTags, latestEdit, weekFiltered, latestWeekRange, applyFixedRange, sharedNoteIds, density, tagColors, selectRange, renderLimit, loadMoreRef }: {
  scope: { view: ViewKind; folderId: string | null; tag: string | null };
  groups: ReturnType<typeof groupNotes>;
  title: string;
  activeNoteId: string | null;
  renderedIds: Set<string>;
  onKeyDown: (event: React.KeyboardEvent) => void;
  listRef: RefObject<HTMLDivElement | null>;
  hydrated: boolean;
  loading: boolean;
  filteredCount: number;
  filter: string;
  dateFilter: DateRangeFilter | null;
  selectedTags: string[];
  latestEdit: { key: string; label: string } | null;
  weekFiltered: boolean;
  latestWeekRange: DateRangeFilter | null;
  applyFixedRange: (range: DateRangeFilter | null) => void;
  sharedNoteIds: Set<string>;
  density: UiDensity;
  tagColors: Map<string, string | null | undefined>;
  selectRange: (targetId: string) => void;
  renderLimit: number;
  loadMoreRef: RefObject<HTMLDivElement | null>;
}) {
  const { view, folderId, tag } = scope;
  return (
    <div key={`${view}:${folderId ?? ''}:${tag ?? ''}`} ref={listRef} role='listbox' aria-label={title} aria-multiselectable='true' aria-activedescendant={activeNoteId && renderedIds.has(activeNoteId) ? `note-option-${activeNoteId}` : undefined} tabIndex={0} onKeyDown={onKeyDown} className='anim-view-content min-h-0 flex-1 overflow-y-auto px-2 pb-4 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]'>
      {!hydrated && loading ? (<NoteListSkeleton />        ) : filteredCount === 0 ? (<ListEmpty view={view} folderId={folderId} filtering={Boolean(filter)} dayFiltering={Boolean(dateFilter)} tagFiltering={selectedTags.length > 0} latestEdit={latestEdit} onJumpToLatest={() => { if (latestEdit) applyFixedRange({ start: latestEdit.key, end: latestEdit.key }); }} weekFiltered={weekFiltered} onJumpToLatestWeek={() => { if (latestWeekRange) applyFixedRange(latestWeekRange); }}/>) : (groups.map((group) => (<div key={group.key} role='group' aria-label={group.label ?? title}>
        {group.label && (<div className="px-2 pt-3 pb-1 text-[length:var(--text-10\.5)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-quaternary)]">
          {group.label}
        </div>)}
        <div role='presentation' className='space-y-px'>
          {group.items.map(({ note, ranges, position }) => (<NoteRow key={note.id} note={note} isShared={sharedNoteIds.has(note.id)} highlight={ranges} density={density} tagColors={tagColors} position={position} total={filteredCount} onRangeSelect={selectRange}/>))}
        </div>
      </div>)))}
      {renderLimit < filteredCount && <div ref={loadMoreRef} aria-hidden='true' className='h-px'/>}
    </div>
  );
}