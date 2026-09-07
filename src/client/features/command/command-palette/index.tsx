import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Clock, FileText, FolderPlus, Hash, Plus, Search, X } from 'lucide-react';
import type { Folder, NoteSummary, SearchHit, ViewKind } from '@shared/types';
import { truncateText } from '@shared/text-utils';
import { api } from '../../../lib/api';
import { canFuzzyMatch, fuzzyFilter, type FuzzyMatch } from '../../../lib/fuzzy';
import { useDebounced, useNow } from '../../../lib/hooks';
import { shortTime } from '../../../lib/time';
import { IconButton, Kbd } from '../../../components/primitives';
import { Tooltip, useDialogFocus, useEscape, useLockScroll } from '../../../components/overlay';
import { TagFilterPopover } from '../../../components/tag-filter-popover';
import { useUi } from '../../../store/ui';
import { useNotes } from '../../../store/notes';
import { createContextualNote } from '../../../store/notes';
import { CALENDAR_TREE, calendarPeriodLabel, parseCalendarJumpQuery, type CalendarPeriod, virtualAncestorIds, virtualId, virtualPeriodKeyRange } from '../../../lib/calendar-tree';
import { folderPathLabel, openFolderView } from '../../../lib/folders';
import { t, useLocale } from '../../../lib/i18n';
import { usePaletteCommands } from './use-commands';
import type { Item } from './types';
import { PaletteRow } from './palette-row';

interface Tag {
  id: string;
  name: string;
  count: number;
  color?: string | null;
}

interface FolderIndex {
  counts: Map<string, number>;
  choices: { folder: Folder; path: string }[];
}

type ScoredNoteEntry = { item: { note: NoteSummary; lower: string }; match: FuzzyMatch };

function matchesTagFilter(note: { tags: string[] }, selectedTags: string[], selectedTagsMatch: 'any' | 'all'): boolean {
  return selectedTags.length === 0 || (selectedTagsMatch === 'all'
    ? selectedTags.every((name) => note.tags.includes(name))
    : selectedTags.some((name) => note.tags.includes(name)));
}

function noteSearchEntries(notes: Record<string, NoteSummary>): { note: NoteSummary; lower: string }[] {
  return Object.values(notes)
    .filter((note) => !note.deletedAt)
    .map((note) => ({ note, lower: note.title.toLowerCase() }));
}

// Counts each note once per ancestor folder (its own folder and every parent).
function buildFolderIndex(folders: Folder[], notes: Record<string, NoteSummary>): FolderIndex {
  const counts = new Map<string, number>();
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  for (const note of Object.values(notes)) {
    if (!note.folderId || note.deletedAt || note.isArchived)
      continue;
    let currentId: string | null = note.folderId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      counts.set(currentId, (counts.get(currentId) ?? 0) + 1);
      currentId = folderById.get(currentId)?.parentId ?? null;
    }
  }
  const choices = folders.map((folder) => ({ folder, path: folderPathLabel(folders, folder.id) }));
  return { counts, choices };
}

function useRemoteSearch(debounced: string) {
  const [remote, setRemote] = useState<{ query: string; results: SearchHit[] }>({ query: '', results: [] });
  useEffect(() => {
    const text = debounced.trim();
    if (text.length < 2) {
      setRemote({ query: text, results: [] });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await api.search(text, 20, controller.signal);
        setRemote({ query: text, results: res.results });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError')
          setRemote({ query: text, results: [] });
      }
    })();
    return () => controller.abort();
  }, [debounced]);
  return remote;
}

function paletteOpenCalendarPeriod(period: CalendarPeriod, openView: OpenView): void {
  const id = virtualId(period, CALENDAR_TREE);
  const ancestors = virtualAncestorIds(id, CALENDAR_TREE);
  if (ancestors.length) {
    useUi.setState((state) => ({
      expandedFolders: [...new Set([...state.expandedFolders, ...ancestors])],
    }));
  }
  openView('folder', { folderId: id });
}

function recentItems(recentNoteIds: string[], notes: Record<string, NoteSummary>, now: number, openNote: (id: string) => unknown): Item[] {
  return recentNoteIds
    .map((id) => notes[id])
    .filter((n): n is NoteSummary => Boolean(n && !n.deletedAt))
    .slice(0, 6)
    .map<Item>((note) => ({
      id: `note-${note.id}`,
      kind: 'note',
      label: note.title || t('common.untitled_note'),
      detail: shortTime(note.updatedAt, now),
      icon: <Clock size={14}/>,
      group: t('command.recently_opened'),
      score: 0,
      run: () => void openNote(note.id),
    }));
}

function matchedNoteItems(scored: ScoredNoteEntry[], openNote: (id: string) => unknown): Item[] {
  return scored.map<Item>(({ item: entry, match }) => ({
    id: `note-${entry.note.id}`,
    kind: 'note',
    label: entry.note.title || t('common.untitled_note'),
    detail: truncateText(entry.note.excerpt, 60),
    icon: <FileText size={14}/>,
    group: t('common.note'),
    score: match.score + 20,
    match,
    run: () => void openNote(entry.note.id),
  }));
}

function remoteHitItems(remoteResults: SearchHit[], seen: Set<string>, matchesSelectedTags: (note: { tags: string[] }) => boolean, openNote: (id: string) => unknown): Item[] {
  return remoteResults
    .filter((hit) => matchesSelectedTags(hit.note))
    .filter((hit) => !seen.has(`note-${hit.note.id}`))
    .slice(0, 8)
    .map<Item>((hit) => ({
      id: `note-${hit.note.id}`,
      kind: 'note',
      label: hit.note.title || t('common.untitled_note'),
      detail: hit.snippet,
      icon: <Search size={14}/>,
      group: t('command.content_match'),
      score: 10,
      run: () => void openNote(hit.note.id),
    }));
}

function tagItems(tags: Tag[], text: string, openView: OpenView): Item[] {
  return fuzzyFilter(tags, text, (tag) => tag.name, 5).map<Item>(({ item, match }) => ({
    id: `tag-${item.id}`,
    kind: 'tag',
    label: `#${item.name}`,
    detail: t('common.value0_notes', { value0: item.count }),
    icon: <Hash size={14} style={{ color: item.color ?? undefined }}/>,
    group: t('navigation.tag'),
    score: match.score,
    run: () => openView('tag', { tag: item.name }),
  }));
}

function folderItems(folderIndex: FolderIndex, text: string, folders: Folder[]): Item[] {
  return fuzzyFilter(folderIndex.choices, text, (choice) => choice.path, 5).map<Item>(({ item: choice, match }) => ({
    id: `folder-${choice.folder.id}`,
    kind: 'folder',
    label: choice.path,
    detail: t('common.value0_notes', { value0: folderIndex.counts.get(choice.folder.id) ?? 0 }),
    icon: <FolderPlus size={14}/>,
    group: t('navigation.folder'),
    score: match.score,
    run: () => openFolderView(folders, choice.folder.id),
  }));
}

function calendarJumpItem(text: string, now: number, openCalendarPeriod: (period: CalendarPeriod) => void): Item[] {
  const jumpPeriod = parseCalendarJumpQuery(text, new Date(now));
  if (!jumpPeriod)
    return [];
  const id = virtualId(jumpPeriod, CALENDAR_TREE);
  const range = virtualPeriodKeyRange(id, CALENDAR_TREE);
  const display = calendarPeriodLabel(jumpPeriod) ?? '';
  return [{
    id: `calendar-jump-${id}`,
    kind: 'command',
    label: t('command.calendar_jump_value0', { value0: display }),
    detail: range ? `${range.start} ~ ${range.end}` : undefined,
    icon: <CalendarDays size={14}/>,
    group: t('common.navigation'),
    score: 95,
    run: () => openCalendarPeriod(jumpPeriod),
  }];
}

function createFallbackItem(text: string): Item {
  return {
    id: 'create-with-title',
    kind: 'command',
    label: t('command.create_note_value0', { value0: text }),
    icon: <Plus size={14}/>,
    group: t('command.commands'),
    score: 0,
    run: () => void createContextualNote({ title: text }),
  };
}

interface PaletteItemsInput {
  text: string;
  remoteResults: SearchHit[];
  recentNoteIds: string[];
  notes: Record<string, NoteSummary>;
  commands: Omit<Item, 'score' | 'match'>[];
  noteList: { note: NoteSummary; lower: string }[];
  matchesSelectedTags: (note: { tags: string[] }) => boolean;
  tags: Tag[];
  folders: Folder[];
  folderIndex: FolderIndex;
  now: number;
  openNote: (id: string) => unknown;
  openView: OpenView;
  openCalendarPeriod: (period: CalendarPeriod) => void;
}

type OpenView = (view: ViewKind, options?: { folderId?: string | null; tag?: string | null }) => void;

function buildPaletteItems(input: PaletteItemsInput): Item[] {
  const { text, remoteResults, recentNoteIds, notes, commands, noteList, matchesSelectedTags, tags, folders, folderIndex, now, openNote, openView, openCalendarPeriod } = input;
  if (!text) {
    const recent = recentItems(recentNoteIds, notes, now, openNote);
    const quick = commands
      .filter((c) => ['cmd-new', 'cmd-settings', 'cmd-graph', 'cmd-shortcuts'].includes(c.id))
      .map<Item>((c) => ({ ...c, score: 0 }));
    return [...recent, ...quick];
  }
  const matchedCommands = fuzzyFilter(commands, text, (c) => c.label, 8).map<Item>(({ item, match }) => ({ ...item, score: match.score + 60, match }));
  const lowerQuery = text.toLowerCase();
  const scoredNotes = noteList
    .filter((entry) => matchesSelectedTags(entry.note))
    .filter((entry) => canFuzzyMatch(entry.lower, lowerQuery))
    .slice(0, 300);
  const matchedNotes = matchedNoteItems(fuzzyFilter(scoredNotes, text, (entry) => entry.note.title, 14), openNote);
  const seen = new Set(matchedNotes.map((n) => n.id));
  const fullText = remoteHitItems(remoteResults, seen, matchesSelectedTags, openNote);
  const matchedTags = tagItems(tags, text, openView);
  const matchedFolders = folderItems(folderIndex, text, folders);
  const jumpItems = calendarJumpItem(text, now, openCalendarPeriod);
  const all = [...jumpItems, ...matchedCommands, ...matchedNotes, ...fullText, ...matchedTags, ...matchedFolders];
  if (!all.length)
    all.push(createFallbackItem(text));
  return all.sort((a, b) => b.score - a.score).slice(0, 40);
}

function groupItems(items: Item[]): [string, Item[]][] {
  const map = new Map<string, Item[]>();
  for (const item of items) {
    const list = map.get(item.group) ?? [];
    list.push(item);
    map.set(item.group, list);
  }
  return [...map.entries()];
}

function paletteKeyDown(event: React.KeyboardEvent, state: { items: Item[]; cursor: number }, actions: { setCursor: React.Dispatch<React.SetStateAction<number>>; setIsKeyboardNav: (v: boolean) => void; executeItem: (item: Item) => void }): void {
  if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
    event.preventDefault();
    actions.setIsKeyboardNav(true);
    actions.setCursor((c) => state.items.length ? Math.min(state.items.length - 1, c + 1) : 0);
    return;
  }
  if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
    event.preventDefault();
    actions.setIsKeyboardNav(true);
    actions.setCursor((c) => Math.max(0, c - 1));
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const item = state.items[state.cursor];
    if (item)
      actions.executeItem(item);
  }
}

function PaletteSearchHeader({ inputRef, query, onQueryChange, onKeyDown, listId, cursor, items, tagFilterRef, hasSelectedTags, onOpenTagFilter, onClose }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  listId: string;
  cursor: number;
  items: Item[];
  tagFilterRef: React.RefObject<HTMLButtonElement | null>;
  hasSelectedTags: boolean;
  onOpenTagFilter: () => void;
  onClose: () => void;
}) {
  return (
    <div className='flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4'>
      <Search size={16} className='shrink-0 text-[var(--text-quaternary)]'/>
      <input ref={inputRef} role='combobox' aria-label={t('common.search_notes_or_run_a_command')} aria-expanded='true' aria-controls={listId} aria-activedescendant={items[cursor] ? `${listId}-option-${cursor}` : undefined} aria-autocomplete='list' autoComplete='off' value={query} onChange={(e) => onQueryChange(e.target.value)} onKeyDown={onKeyDown} placeholder={t('command.search_notes_or_type_a_command')} className='h-13 flex-1 bg-transparent text-[length:var(--text-15)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none'/>
      <Tooltip label={t('command.filter_by_tags')}>
        <IconButton label={t('command.filter_by_tags')} size='sm' ref={tagFilterRef} active={hasSelectedTags} className='text-[var(--text-tertiary)]' onClick={onOpenTagFilter}>
          <Hash size={15}/>
        </IconButton>
      </Tooltip>
      <span className='hidden md:inline-flex'><Kbd keys={['Esc']}/></span>
      <span className='md:hidden'>
        <Tooltip label={t('common.close')} side='left'>
          <IconButton label={t('common.close')} size='sm' onClick={onClose}>
            <X size={16}/>
          </IconButton>
        </Tooltip>
      </span>
    </div>
  );
}

function PaletteTagBar({ count, match, onMatchChange }: {
  count: number;
  match: 'any' | 'all';
  onMatchChange: (value: 'any' | 'all') => void;
}) {
  return (
    <div className='flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
      <Hash size={12} className='shrink-0 text-[var(--text-quaternary)]'/>
      <span className='min-w-0 flex-1 truncate'>{t('command.selected_tags_filtering', { value0: count })}</span>
      <div role='group' aria-label={t('notes.selected_tags_match')} className='flex shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-default)]'>
        <button type='button' aria-pressed={match === 'any'} onClick={() => onMatchChange('any')} className='px-1.5 py-0.5 transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]'>{t('notes.tag_match_any')}</button>
        <button type='button' aria-pressed={match === 'all'} onClick={() => onMatchChange('all')} className='border-l border-[var(--border-default)] px-1.5 py-0.5 transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]'>{t('notes.tag_match_all')}</button>
      </div>
    </div>
  );
}

function PaletteResultsList({ listRef, listId, labelId, groups, cursor, isKeyboardNav, onActivate, onPointerNav, onSelect }: {
  listRef: React.RefObject<HTMLDivElement | null>;
  listId: string;
  labelId: string;
  groups: [string, Item[]][];
  cursor: number;
  isKeyboardNav: boolean;
  onActivate: (index: number) => void;
  onPointerNav: () => void;
  onSelect: (item: Item) => void;
}) {
  let flatIndex = -1;
  return (
    <div ref={listRef} id={listId} role='listbox' aria-labelledby={labelId} className='min-h-0 flex-1 overflow-y-auto p-1.5 md:max-h-[54vh] md:flex-none'>
      {groups.length === 0 ? (<div className="px-3 py-10 text-center text-[length:var(--text-12\.5)] text-[var(--text-quaternary)]">{t('command.no_matching_results')}</div>) : (groups.map(([group, groupItems]) => (<div key={group} role='group' aria-label={group} className='mb-1'>
        <div className="px-2.5 pt-2 pb-1 text-[length:var(--text-10\.5)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-quaternary)]">
          {group}
        </div>
        {groupItems.map((item) => {
          flatIndex++;
          const index = flatIndex;
          const active = index === cursor;
          return (<PaletteRow key={item.id} item={item} active={active} index={index} listId={listId} isKeyboardNav={isKeyboardNav} onActivate={onActivate} onPointerNav={onPointerNav} onSelect={onSelect}/>);
        })}
      </div>)))}
    </div>
  );
}

function PaletteFooterHints() {
  return (
    <div className="hidden items-center gap-4 border-t border-[var(--border-subtle)] px-4 py-2 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)] md:flex">
      <span className='flex items-center gap-1.5'>
        <Kbd keys={['↑', '↓']}/>{t('command.select')}</span>
      <span className='flex items-center gap-1.5'>
        <Kbd keys={['↵']}/>{t('common.open')}</span>
      <span className='flex items-center gap-1.5'>
        <Kbd keys={['Esc']}/>{t('common.close')}</span>
    </div>
  );
}

function usePaletteStore() {
  const notes = useNotes((s) => s.notes);
  const tags = useNotes((s) => s.tags);
  const folders = useNotes((s) => s.folders);
  const openNote = useNotes((s) => s.openNote);
  const recentNoteIds = useUi((s) => s.recentNoteIds);
  const openView = useUi((s) => s.openView);
  const selectedTags = useUi((s) => s.selectedTags);
  const selectedTagsMatch = useUi((s) => s.selectedTagsMatch);
  const setSelectedTagsMatch = useUi((s) => s.setSelectedTagsMatch);
  return { notes, tags, folders, openNote, recentNoteIds, openView, selectedTags, selectedTagsMatch, setSelectedTagsMatch };
}

export function CommandPalette({ onClose }: {
  onClose: () => void;
}) {
  const locale = useLocale();
  const store = usePaletteStore();
  const { notes, tags, folders, openNote, recentNoteIds, openView, selectedTags, selectedTagsMatch, setSelectedTagsMatch } = store;
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const tagFilterRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const listId = useId();
  const matchesSelectedTags = useCallback((note: { tags: string[] }) => matchesTagFilter(note, selectedTags, selectedTagsMatch), [selectedTags, selectedTagsMatch]);
  const debounced = useDebounced(query, 180);
  const now = useNow();
  useEscape(true, onClose);
  useLockScroll(true);
  useDialogFocus(true, panelRef, inputRef);
  const executeItem = useCallback((item: Item) => { onClose(); item.run(); }, [onClose]);
  const pointerNav = useCallback(() => setIsKeyboardNav(false), []);
  const openCalendarPeriod = useCallback((period: CalendarPeriod) => paletteOpenCalendarPeriod(period, openView), [openView]);
  const noteList = useMemo(() => noteSearchEntries(notes), [notes]);
  const folderIndex = useMemo(() => buildFolderIndex(folders, notes), [folders, notes]);
  const remote = useRemoteSearch(debounced);
  const commands = usePaletteCommands({ openCalendarPeriod });
  const items = useMemo<Item[]>(() => buildPaletteItems({ text: query.trim(), remoteResults: remote.query === query.trim() ? remote.results : [], recentNoteIds, notes, commands, noteList, matchesSelectedTags, tags, folders, folderIndex, now, openNote, openView, openCalendarPeriod }), [query, locale, noteList, matchesSelectedTags, tags, folders, folderIndex, commands, remote, openCalendarPeriod, recentNoteIds, openNote, openView, now]);
  const groups = useMemo(() => groupItems(items), [items]);
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    setCursor((current) => items.length ? Math.min(current, items.length - 1) : 0);
  }, [items.length]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);
  const onKeyDown = (event: React.KeyboardEvent) => paletteKeyDown(event, { items, cursor }, { setCursor, setIsKeyboardNav, executeItem });
  return createPortal(<div className='app-viewport-fixed fixed z-[var(--z-palette)] flex items-end justify-center md:items-start md:px-4 md:pt-[13vh]'>
    <div className='anim-fade absolute inset-0 bg-[var(--scrim)]' onClick={onClose} aria-hidden='true'/>
    <div ref={panelRef} className='anim-pop relative flex h-[min(82dvh,var(--app-viewport-height,100dvh))] w-full max-w-165 flex-col overflow-hidden rounded-t-[var(--r-2xl)] border border-b-0 border-[var(--border-default)] bg-[var(--bg-overlay)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-modal)] outline-none md:h-auto md:rounded-[var(--r-2xl)] md:border-b md:pb-0' role='dialog' aria-modal='true' aria-labelledby={labelId} tabIndex={-1}>
    <h2 id={labelId} className='sr-only'>{t('common.search_notes_or_run_a_command')}</h2>
    <PaletteSearchHeader inputRef={inputRef} query={query} onQueryChange={setQuery} onKeyDown={onKeyDown} listId={listId} cursor={cursor} items={items} tagFilterRef={tagFilterRef} hasSelectedTags={selectedTags.length > 0} onOpenTagFilter={() => setIsTagFilterOpen(true)} onClose={onClose}/>
    {selectedTags.length > 0 && <PaletteTagBar count={selectedTags.length} match={selectedTagsMatch} onMatchChange={setSelectedTagsMatch}/>}
    <PaletteResultsList listRef={listRef} listId={listId} labelId={labelId} groups={groups} cursor={cursor} isKeyboardNav={isKeyboardNav} onActivate={setCursor} onPointerNav={pointerNav} onSelect={executeItem}/>
    <PaletteFooterHints/>
    </div>
    <TagFilterPopover anchor={tagFilterRef} open={isTagFilterOpen} onClose={() => setIsTagFilterOpen(false)}/>
  </div>, document.body);
}