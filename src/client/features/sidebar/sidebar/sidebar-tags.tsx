import { useMemo, useState } from 'react';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Hash,
  Plus,
  Search,
  SearchX,
  Settings2,
  Tag as TagIcon,
  Waypoints,
  X,
} from 'lucide-react';
import { LIMITS } from '@shared/constants';
import type { Tag } from '@shared/types';
import { cn } from '../../../lib/cn';
import { sortTagsForPicker } from '../../../lib/tag-sort';
import { clearTagSelection } from '../../../lib/tag-selection';
import { IconButton, SectionLabel } from '../../../components/primitives';
import { Tooltip } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { useNavigationCounts } from '../../../store/notes';
import { useNotes } from '../../../store/notes';
import { createTag, renameTag } from '../../tags';
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../../lib/tag-tree';
import { t } from '../../../lib/i18n';
import { TagDraftRow, TagRow } from './sidebar-tags-row';

export function TagSection() {
    const tags = useNotes((s) => s.tags);
    const [isExpanded, setIsExpanded] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [isCreating, setIsCreating] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [expandedTagPaths, setExpandedTagPaths] = useState<Set<string>>(() => new Set());
    const tagTree = useMemo(() => buildTagTree(tags), [tags]);
    const flattenedTree = useMemo(() => flattenTagTree(tagTree, expandedTagPaths), [tagTree, expandedTagPaths]);
    const parentTagPaths = useMemo(() => collectParentTagPaths(tagTree), [tagTree]);
    const sortedTags = useMemo(() => sortTagsForPicker(tags, ''), [tags]);
    const canToggleTags = parentTagPaths.length > 0 || flattenedTree.length > 10 || tags.length > 10;
    const allParentsExpanded = parentTagPaths.length === 0 || parentTagPaths.every((p) => expandedTagPaths.has(p));
    const isListExpanded = isExpanded || (flattenedTree.length <= 10 && tags.length <= 10);
    const allTagsExpanded = allParentsExpanded && isListExpanded;
    const searching = query.trim() !== '';
    const visibleTags = searching ? sortTagsForPicker(sortedTags, query) : [];
    const visibleNodes = searching ? [] : isExpanded ? flattenedTree : flattenedTree.slice(0, 10);
    const highlightedIndex = Math.min(activeIndex, Math.max(0, (searching ? visibleTags.length : visibleNodes.length) - 1));
    const toggleTagPath = (path: string) => setExpandedTagPaths((prev) => togglePathInSet(prev, path));
    const toggleAllTagsExpanded = () => {
        const next = nextTagExpansion(allTagsExpanded, parentTagPaths);
        setExpandedTagPaths(next.paths);
        setIsExpanded(next.isList);
    };
    return (<>
      <section className='mt-4'>
        <TagSectionHeader canToggleTags={canToggleTags} allTagsExpanded={allTagsExpanded} onToggleAll={toggleAllTagsExpanded} onCreate={() => setIsCreating(true)}/>
        {sortedTags.length > 0 && <TagSearchBox query={query} setQuery={setQuery} setActiveIndex={setActiveIndex} searching={searching} visibleTags={visibleTags} highlightedIndex={highlightedIndex}/>}
        <div className='mt-0.5 space-y-px'>
          {isCreating && <TagDraftRow onFinish={(value) => finishTagDraft(value, setIsCreating)} onCancel={() => setIsCreating(false)}/>}
          {!sortedTags.length && !isCreating && <CreateFirstTagButton onCreate={() => setIsCreating(true)}/>}
          {!searching && <UntaggedRow onOpen={() => useUi.getState().openView('untagged')}/>}
          <TagRowList searching={searching} visibleTags={visibleTags} visibleNodes={visibleNodes} query={query} highlightedIndex={highlightedIndex} renamingId={renamingId} setRenamingId={setRenamingId} expandedTagPaths={expandedTagPaths} onTogglePath={toggleTagPath}/>
          {searching && visibleTags.length === 0 && !isCreating && <TagSearchEmpty onClear={() => { setQuery(''); setActiveIndex(0); }}/>}
          {!searching && flattenedTree.length > 10 && <ShowMoreTagsButton isExpanded={isExpanded} count={flattenedTree.length} onToggle={() => setIsExpanded((v) => !v)}/>}
          <SelectedTagsBar/>
        </div>
      </section>
    </>);
}

function TagSectionHeader({ canToggleTags, allTagsExpanded, onToggleAll, onCreate }: {
    canToggleTags: boolean;
    allTagsExpanded: boolean;
    onToggleAll: () => void;
    onCreate: () => void;
}) {
    const openPanel = useUi((s) => s.openPanel);
    return (<div className='group/head flex items-center justify-between pr-1'>
        <SectionLabel>{t('navigation.tag')}</SectionLabel>
        <div className='flex items-center gap-0.5'>
          {canToggleTags && (
            <Tooltip label={allTagsExpanded ? t('tags.collapse_all') : t('tags.expand_all')} side='left'>
              <IconButton label={allTagsExpanded ? t('tags.collapse_all') : t('tags.expand_all')} size='sm' onClick={onToggleAll} className='opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100'>
                {allTagsExpanded ? <ChevronsDownUp size={13}/> : <ChevronsUpDown size={13}/>}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip label={t('tags.manage_tags')} side='left'>
            <IconButton label={t('tags.manage_tags')} size='sm' onClick={() => openPanel('tags')} className='opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100'>
              <Settings2 size={13}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t('tags.new')} side='right'>
            <IconButton label={t('tags.new')} size='sm' onClick={onCreate} className='opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100'>
              <Plus size={13}/>
            </IconButton>
          </Tooltip>
        </div>
      </div>);
}

function TagSearchBox({ query, setQuery, setActiveIndex, searching, visibleTags, highlightedIndex }: {
    query: string;
    setQuery: React.Dispatch<React.SetStateAction<string>>;
    setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
    searching: boolean;
    visibleTags: Tag[];
    highlightedIndex: number;
}) {
    return (<div className='relative mt-1.5'>
        <Search size={12} className='pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--text-quaternary)]'/>
        <input aria-label={t('notes.tag_filter_search')} title={t('sidebar.tag_search_select_all')} value={query} onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
        }} onKeyDown={(e) => handleTagSearchKeyDown(e, { searching, visibleTags, highlightedIndex, setQuery, setActiveIndex })} placeholder={t('notes.tag_filter_search')} className='h-7 w-full rounded-[var(--r-sm)] bg-[var(--bg-inset)] pr-7 pl-6 text-[length:var(--text-12)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none'/>
        {searching && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 tabular-nums text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{visibleTags.length}</span>}
    </div>);
}

function handleTagSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>, args: {
    searching: boolean;
    visibleTags: Tag[];
    highlightedIndex: number;
    setQuery: React.Dispatch<React.SetStateAction<string>>;
    setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
    if (event.key === 'Escape') {
        args.setQuery('');
        args.setActiveIndex(0);
        return;
    }
    if (!args.searching || !args.visibleTags.length)
        return;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        args.setActiveIndex((i) => (i + 1) % args.visibleTags.length);
        return;
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        args.setActiveIndex((i) => (i - 1 + args.visibleTags.length) % args.visibleTags.length);
        return;
    }
    if (event.key !== 'Enter')
        return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
        if (useUi.getState().selectedTags.length >= LIMITS.tagSelectionMax) {
            useUi.getState().toast({ title: t('tags.selection_limit', { value0: LIMITS.tagSelectionMax }), tone: 'danger' });
            return;
        }
        useUi.getState().selectTags(args.visibleTags.map((tag) => tag.name));
        args.setQuery('');
        args.setActiveIndex(0);
        useUi.getState().toast({ title: t('sidebar.tags_selected', { value0: args.visibleTags.length }) });
        return;
    }
    const target = args.visibleTags[args.highlightedIndex];
    args.setQuery('');
    args.setActiveIndex(0);
    if (target)
        useUi.getState().openView('tag', { tag: target.name });
}

function TagRowList({ searching, visibleTags, visibleNodes, query, highlightedIndex, renamingId, setRenamingId, expandedTagPaths, onTogglePath }: {
    searching: boolean;
    visibleTags: Tag[];
    visibleNodes: TagTreeNode[];
    query: string;
    highlightedIndex: number;
    renamingId: string | null;
    setRenamingId: (id: string | null) => void;
    expandedTagPaths: ReadonlySet<string>;
    onTogglePath: (path: string) => void;
}) {
    const view = useUi((s) => s.view);
    const activeTag = useUi((s) => s.tag);
    const selectedTags = useUi((s) => s.selectedTags);
    if (searching) return (<>{visibleTags.map((tag, index) => (
        <TagRow key={tag.id} tag={tag} active={view === 'tag' && activeTag === tag.name} selected={selectedTags.includes(tag.name)} highlighted={index === highlightedIndex} searchQuery={query} renaming={renamingId === tag.id} onOpen={(event) => openTagRow(event, tag.name)} onStartRename={() => setRenamingId(tag.id)} onFinishRename={(value) => finishRowRename(value, tag, setRenamingId)} onCancelRename={() => setRenamingId(null)}/>
    ))}</>);
    return (<>{visibleNodes.map((node) => (
        <TagRow key={node.fullPath} tag={node.tag} displayName={node.name} depth={node.depth} hasChildren={node.children.length > 0} isExpanded={expandedTagPaths.has(node.fullPath)} onToggleExpand={() => onTogglePath(node.fullPath)} count={node.children.length > 0 ? node.totalCount : node.count} active={view === 'tag' && activeTag === node.fullPath} selected={selectedTags.includes(node.fullPath)} highlighted={false} searchQuery='' renaming={renamingId === node.tag.id} onOpen={(event) => openTagRow(event, node.fullPath)} onStartRename={() => setRenamingId(node.tag.id)} onFinishRename={(value) => finishRowRename(value, node.tag, setRenamingId)} onCancelRename={() => setRenamingId(null)}/>
    ))}</>);
}

function UntaggedRow({ onOpen }: {
    onOpen: () => void;
}) {
    const view = useUi((s) => s.view);
    const counts = useNavigationCounts();
    return (<button type='button' aria-current={view === 'untagged' ? 'page' : undefined} onClick={onOpen} className={cn('group flex h-10 w-full items-center justify-between rounded-[var(--r-md)] px-2 text-left text-[length:var(--text-12)] font-medium transition-colors md:h-[var(--sp-7)]', view === 'untagged' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]')}>
        <div className='flex min-w-0 items-center gap-2'>
            <TagIcon size={12} className={cn('shrink-0', view === 'untagged' ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')}/>
            <span className='truncate'>{t('tags.untagged')}</span>
        </div>
        {counts.untagged > 0 && (<span className='shrink-0 text-[length:var(--text-11)] tabular text-[var(--text-quaternary)]'>{counts.untagged}</span>)}
    </button>);
}

function CreateFirstTagButton({ onCreate }: {
    onCreate: () => void;
}) {
    return (<button type='button' onClick={onCreate} className="flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-left text-[length:var(--text-11\.5)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] md:h-7.5">
        <Plus size={13}/>{t('tags.create_first')}
    </button>);
}

function TagSearchEmpty({ onClear }: {
    onClear: () => void;
}) {
    return (<div className='mt-1 flex flex-col items-center gap-1 rounded-[var(--r-md)] bg-[var(--bg-inset)] px-2 py-3 text-center'>
        <SearchX size={14} className='text-[var(--text-quaternary)]'/>
        <span className="text-[length:var(--text-11\.5)] font-medium text-[var(--text-secondary)]">{t('notes.no_matching_tags')}</span>
        <button type='button' onClick={onClear} className="text-[length:var(--text-10\.5)] font-medium text-[var(--accent)] transition-colors hover:underline">{t('notes.clear_tag_search')}</button>
    </div>);
}

function ShowMoreTagsButton({ isExpanded, count, onToggle }: {
    isExpanded: boolean;
    count: number;
    onToggle: () => void;
}) {
    return (<button type='button' onClick={onToggle} className="h-10 w-full rounded-[var(--r-md)] px-2 text-left text-[length:var(--text-11\.5)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] md:h-6.5">
        {isExpanded ? t('common.collapse') : t('sidebar.show_all_value0_tags', { value0: count })}
    </button>);
}

function SelectedTagsBar() {
    const selectedTags = useUi((s) => s.selectedTags);
    const toggleTagSelection = useUi((s) => s.toggleTagSelection);
    const openPanel = useUi((s) => s.openPanel);
    if (selectedTags.length === 0)
        return null;
    return (<div className='rounded-[var(--r-md)] bg-[var(--accent-soft)] px-2 py-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
        <div className='flex h-5 items-center justify-between gap-2'>
            <span className='truncate'>{t('sidebar.tags_selected', { value0: selectedTags.length })}</span>
            <div className='flex shrink-0 items-center gap-2'>
                <Tooltip label={t('sidebar.jump_to_graph')}>
                    <button type='button' onClick={() => openPanel('graph')} className='inline-flex items-center gap-1 font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] hover:underline'>
                        <Waypoints size={9}/>
                        {t('common.graph')}
                    </button>
                </Tooltip>
                <button type='button' onClick={() => clearTagSelection({ notify: true })} className='font-medium text-[var(--accent)] transition-colors hover:underline'>{t('common.clear_selection')}</button>
            </div>
        </div>
        <div className="mt-0.5 text-[length:var(--text-10\.5)] text-[var(--text-tertiary)]">{t('sidebar.tags_selected_hint')}</div>
        {selectedTags.length >= LIMITS.tagSelectionMax && <div className="mt-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--danger)]">{t('tags.selection_limit', { value0: LIMITS.tagSelectionMax })}</div>}
        <div className='mt-1 flex flex-wrap gap-1'>
            {selectedTags.map((name) => (<button key={name} type='button' aria-label={t('sidebar.remove_selected_tag', { value0: name })} onClick={() => toggleTagSelection(name)} className='inline-flex h-5 max-w-full items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-2 text-[length:var(--text-11)] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]'>
                <Hash size={9} className='shrink-0 text-[var(--text-quaternary)]'/>
                <span className='truncate'>{name}</span>
                <X size={9} className='shrink-0 text-[var(--text-quaternary)]'/>
            </button>))}
        </div>
    </div>);
}

function collectParentTagPaths(tagTree: readonly TagTreeNode[]): string[] {
    const result: string[] = [];
    const visit = (nodes: readonly TagTreeNode[]) => {
        for (const node of nodes) {
            if (node.children.length > 0) {
                result.push(node.fullPath);
                visit(node.children);
            }
        }
    };
    visit(tagTree);
    return result;
}

function togglePathInSet(prev: Set<string>, path: string): Set<string> {
    const next = new Set(prev);
    if (next.has(path))
        next.delete(path);
    else
        next.add(path);
    return next;
}

function nextTagExpansion(allTagsExpanded: boolean, parentTagPaths: string[]) {
    if (allTagsExpanded)
        return { paths: new Set<string>(), isList: false };
    return { paths: new Set(parentTagPaths), isList: true };
}

function finishTagDraft(value: string, setIsCreating: (value: boolean) => void) {
    setIsCreating(false);
    const id = createTag(value);
    if (!id)
        return;
    const tag = useNotes.getState().tags.find((candidate) => candidate.id === id);
    if (tag)
        useUi.getState().openView('tag', { tag: tag.name });
}

function finishRowRename(value: string, tag: Tag, setRenamingId: (id: string | null) => void) {
    setRenamingId(null);
    void renameTag(tag, value);
}

function openTagRow(event: React.MouseEvent, name: string) {
    const ui = useUi.getState();
    if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        ui.toggleTagSelection(name);
    }
    else {
        ui.openView('tag', { tag: name });
    }
}
