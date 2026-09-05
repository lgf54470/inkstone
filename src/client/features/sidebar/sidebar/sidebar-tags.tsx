import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Hash,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  Plus,
  Search,
  SearchX,
  Settings2,
  Tag as TagIcon,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import { LIMITS } from '@shared/constants';
import type { Tag } from '@shared/types';
import { cn } from '../../../lib/cn';
import { sortTagsForPicker } from '../../../lib/tag-sort';
import { clearTagSelection } from '../../../lib/tag-selection';
import { TagNameHighlight } from '../../../components/tag-name-highlight';
import { IconButton, SectionLabel } from '../../../components/primitives';
import { Menu, Tooltip, useContextMenu, type MenuItem } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { useNavigationCounts } from '../../../store/notes/selectors';
import { useNotes } from '../../../store/notes';
import { createTag, deleteTag, renameTag, setTagColor, TagColorSubmenu, toggleTagPinned } from '../../tags';
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../../lib/tag-tree';
import { t } from '../../../lib/i18n';

export function TagSection() {
    const tags = useNotes((s) => s.tags);
    const view = useUi((s) => s.view);
    const activeTag = useUi((s) => s.tag);
    const openView = useUi((s) => s.openView);
    const selectedTags = useUi((s) => s.selectedTags);
    const toggleTagSelection = useUi((s) => s.toggleTagSelection);
    const selectTags = useUi((s) => s.selectTags);
    const openPanel = useUi((s) => s.openPanel);
    const counts = useNavigationCounts();
    const [isExpanded, setIsExpanded] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [isCreating, setIsCreating] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [expandedTagPaths, setExpandedTagPaths] = useState<Set<string>>(() => new Set());
    const toggleTagPath = (path: string) => {
        setExpandedTagPaths((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };
    const tagTree = useMemo(() => buildTagTree(tags), [tags]);
    const flattenedTree = useMemo(() => flattenTagTree(tagTree, expandedTagPaths), [tagTree, expandedTagPaths]);
    const parentTagPaths = useMemo(() => {
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
    }, [tagTree]);
    const canToggleTags = parentTagPaths.length > 0 || flattenedTree.length > 10 || tags.length > 10;
    const allParentsExpanded = parentTagPaths.length === 0 || parentTagPaths.every((p) => expandedTagPaths.has(p));
    const isListExpanded = isExpanded || (flattenedTree.length <= 10 && tags.length <= 10);
    const allTagsExpanded = allParentsExpanded && isListExpanded;

    const toggleAllTagsExpanded = () => {
        if (allTagsExpanded) {
            setExpandedTagPaths(new Set());
            setIsExpanded(false);
        } else {
            setExpandedTagPaths(new Set(parentTagPaths));
            setIsExpanded(true);
        }
    };
    const sortedTags = useMemo(() => sortTagsForPicker(tags, ''), [tags]);
    const searching = query.trim() !== '';
    const visibleTags = searching ? sortTagsForPicker(sortedTags, query) : [];
    const visibleNodes = searching ? [] : isExpanded ? flattenedTree : flattenedTree.slice(0, 10);
    const highlightedIndex = Math.min(activeIndex, Math.max(0, (searching ? visibleTags.length : visibleNodes.length) - 1));
    const finishCreate = (value: string) => {
        setIsCreating(false);
        const id = createTag(value);
        if (!id)
            return;
        const tag = useNotes.getState().tags.find((candidate) => candidate.id === id);
        if (tag)
            openView('tag', { tag: tag.name });
    };
    return (<>
      <section className="mt-4">
      <div className="group/head flex items-center justify-between pr-1">
        <SectionLabel>{t("navigation.tag")}</SectionLabel>
        <div className="flex items-center gap-0.5">
          {canToggleTags && (
            <Tooltip label={allTagsExpanded ? t("tags.collapse_all") : t("tags.expand_all")} side="left">
              <IconButton
                label={allTagsExpanded ? t("tags.collapse_all") : t("tags.expand_all")}
                size="sm"
                onClick={toggleAllTagsExpanded}
                className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100"
              >
                {allTagsExpanded ? <ChevronsDownUp size={13}/> : <ChevronsUpDown size={13}/>}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip label={t("tags.manage_tags")} side="left">
            <IconButton label={t("tags.manage_tags")} size="sm" onClick={() => openPanel('tags')} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
              <Settings2 size={13}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t("tags.new")} side="right">
            <IconButton label={t("tags.new")} size="sm" onClick={() => setIsCreating(true)} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
              <Plus size={13}/>
            </IconButton>
          </Tooltip>
        </div>
      </div>
      {sortedTags.length > 0 && (<div className="relative mt-1.5">
          <Search size={12} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--text-quaternary)]"/>
          <input aria-label={t("notes.tag_filter_search")} title={t("sidebar.tag_search_select_all")} value={query} onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
            }} onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    setQuery('');
                    setActiveIndex(0);
                    return;
                }
                if (!searching || !visibleTags.length)
                    return;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveIndex((i) => (i + 1) % visibleTags.length);
                }
                else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveIndex((i) => (i - 1 + visibleTags.length) % visibleTags.length);
                }
                else if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedTags.length >= LIMITS.tagSelectionMax) {
                        useUi.getState().toast({ title: t("tags.selection_limit", { value0: LIMITS.tagSelectionMax }), tone: 'danger' });
                        return;
                    }
                    selectTags(visibleTags.map((tag) => tag.name));
                    setQuery('');
                    setActiveIndex(0);
                    useUi.getState().toast({ title: t("sidebar.tags_selected", { value0: visibleTags.length }) });
                }
                else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const target = visibleTags[highlightedIndex];
                    setQuery('');
                    setActiveIndex(0);
                    if (target) openView('tag', { tag: target.name });
                }
            }} placeholder={t("notes.tag_filter_search")} className="h-7 w-full rounded-[var(--r-sm)] bg-[var(--bg-inset)] pr-7 pl-6 text-[length:var(--text-12)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none"/>
          {searching && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 tabular-nums text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{visibleTags.length}</span>}
        </div>)}
      <div className="mt-0.5 space-y-px">
        {isCreating && <TagDraftRow onFinish={finishCreate} onCancel={() => setIsCreating(false)}/>}
        {!sortedTags.length && !isCreating && (<button type="button" onClick={() => setIsCreating(true)} className="flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-left text-[length:var(--text-11\.5)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] md:h-[30px]">
            <Plus size={13}/>{t("tags.create_first")}
          </button>)}
        {!searching && (
          <button
            type="button"
            aria-current={view === 'untagged' ? 'page' : undefined}
            onClick={() => openView('untagged')}
            className={cn(
              'group flex h-10 w-full items-center justify-between rounded-[var(--r-md)] px-2 text-left text-[length:var(--text-12)] font-medium transition-colors md:h-[var(--sp-7)]',
              view === 'untagged'
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <TagIcon size={12} className={cn('shrink-0', view === 'untagged' ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')} />
              <span className="truncate">{t('tags.untagged')}</span>
            </div>
            {counts.untagged > 0 && (
              <span className="shrink-0 text-[length:var(--text-11)] tabular text-[var(--text-quaternary)]">
                {counts.untagged}
              </span>
            )}
          </button>
        )}
        {searching
          ? visibleTags.map((tag, index) => (
              <TagRow
                key={tag.id}
                tag={tag}
                active={view === 'tag' && activeTag === tag.name}
                selected={selectedTags.includes(tag.name)}
                highlighted={index === highlightedIndex}
                searchQuery={query}
                renaming={renamingId === tag.id}
                onOpen={(event) => {
                  if (event.metaKey || event.ctrlKey) {
                    event.preventDefault();
                    toggleTagSelection(tag.name);
                  } else {
                    openView('tag', { tag: tag.name });
                  }
                }}
                onStartRename={() => setRenamingId(tag.id)}
                onFinishRename={(value) => {
                  setRenamingId(null);
                  void renameTag(tag, value);
                }}
                onCancelRename={() => setRenamingId(null)}
              />
            ))
          : visibleNodes.map((node) => {
              const isRenaming = renamingId === node.tag.id;
              const isSelected = selectedTags.includes(node.fullPath);
              const isActive = view === 'tag' && activeTag === node.fullPath;
              return (
                <TagRow
                  key={node.fullPath}
                  tag={node.tag}
                  displayName={node.name}
                  depth={node.depth}
                  hasChildren={node.children.length > 0}
                  isExpanded={expandedTagPaths.has(node.fullPath)}
                  onToggleExpand={() => toggleTagPath(node.fullPath)}
                  count={node.children.length > 0 ? node.totalCount : node.count}
                  active={isActive}
                  selected={isSelected}
                  highlighted={false}
                  searchQuery=""
                  renaming={isRenaming}
                  onOpen={(event) => {
                    if (event.metaKey || event.ctrlKey) {
                      event.preventDefault();
                      toggleTagSelection(node.fullPath);
                    } else {
                      openView('tag', { tag: node.fullPath });
                    }
                  }}
                  onStartRename={() => setRenamingId(node.tag.id)}
                  onFinishRename={(value) => {
                    setRenamingId(null);
                    void renameTag(node.tag, value);
                  }}
                  onCancelRename={() => setRenamingId(null)}
                />
              );
            })}

        {searching && visibleTags.length === 0 && !isCreating && (<div className="mt-1 flex flex-col items-center gap-1 rounded-[var(--r-md)] bg-[var(--bg-inset)] px-2 py-3 text-center">
            <SearchX size={14} className="text-[var(--text-quaternary)]"/>
            <span className="text-[length:var(--text-11\.5)] font-medium text-[var(--text-secondary)]">{t("notes.no_matching_tags")}</span>
            <button type="button" onClick={() => {
                setQuery('');
                setActiveIndex(0);
            }} className="text-[length:var(--text-10\.5)] font-medium text-[var(--accent)] transition-colors hover:underline">{t("notes.clear_tag_search")}</button>
          </div>)}

        {!searching && flattenedTree.length > 10 && (<button type="button" onClick={() => setIsExpanded((v) => !v)} className="h-10 w-full rounded-[var(--r-md)] px-2 text-left text-[length:var(--text-11\.5)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] md:h-[26px]">
            {isExpanded ? t("common.collapse") : t("sidebar.show_all_value0_tags", { value0: flattenedTree.length })}
          </button>)}

        {selectedTags.length > 0 && (<div className="rounded-[var(--r-md)] bg-[var(--accent-soft)] px-2 py-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]">
            <div className="flex h-5 items-center justify-between gap-2">
              <span className="truncate">{t("sidebar.tags_selected", { value0: selectedTags.length })}</span>
              <div className="flex shrink-0 items-center gap-2">
                <Tooltip label={t("sidebar.jump_to_graph")}>
                  <button type="button" onClick={() => openPanel('graph')} className="inline-flex items-center gap-1 font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] hover:underline">
                    <Waypoints size={9}/>
                    {t("common.graph")}
                  </button>
                </Tooltip>
                <button type="button" onClick={() => clearTagSelection({ notify: true })} className="font-medium text-[var(--accent)] transition-colors hover:underline">{t("common.clear_selection")}</button>
              </div>
            </div>
            <div className="mt-0.5 text-[length:var(--text-10\.5)] text-[var(--text-tertiary)]">{t("sidebar.tags_selected_hint")}</div>
            {selectedTags.length >= LIMITS.tagSelectionMax && <div className="mt-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--danger)]">{t("tags.selection_limit", { value0: LIMITS.tagSelectionMax })}</div>}
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedTags.map((name) => (<button key={name} type="button" aria-label={t("sidebar.remove_selected_tag", { value0: name })} onClick={() => toggleTagSelection(name)} className="inline-flex h-5 max-w-full items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-2 text-[length:var(--text-11)] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]">
                  <Hash size={9} className="shrink-0 text-[var(--text-quaternary)]"/>
                  <span className="truncate">{name}</span>
                  <X size={9} className="shrink-0 text-[var(--text-quaternary)]"/>
                </button>))}
            </div>
          </div>)}
      </div>
      </section>
    </>);
}

export function TagDraftRow({ onFinish, onCancel }: {
    onFinish: (value: string) => void;
    onCancel: () => void;
}) {
    const finishedRef = useRef(false);
    const finish = (value: string) => {
        if (finishedRef.current)
            return;
        finishedRef.current = true;
        onFinish(value);
    };
    return (<div className="flex h-10 items-center gap-2 rounded-[var(--r-md)] px-2 md:h-[30px]">
      <Hash size={13} className="shrink-0 text-[var(--text-quaternary)]"/>
      <input aria-label={t("tags.new")} autoFocus placeholder={t("tags.new_placeholder")} onBlur={(event) => {
            if (event.currentTarget.value.trim())
                finish(event.currentTarget.value);
            else
                onCancel();
        }} onKeyDown={(event) => {
            if (event.key === 'Enter')
                finish(event.currentTarget.value);
            if (event.key === 'Escape') {
                finishedRef.current = true;
                onCancel();
            }
            event.stopPropagation();
        }} className="min-w-0 flex-1 rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 py-px text-[length:var(--text-12\.5)] outline-none"/>
    </div>);
}

export function TagRow({
    tag,
    displayName,
    depth = 0,
    hasChildren = false,
    isExpanded = false,
    onToggleExpand,
    count,
    active,
    selected,
    highlighted,
    searchQuery,
    renaming,
    onOpen,
    onStartRename,
    onFinishRename,
    onCancelRename,
}: {
    tag: Tag;
    displayName?: string;
    depth?: number;
    hasChildren?: boolean;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    count?: number;
    active: boolean;
    selected: boolean;
    highlighted: boolean;
    searchQuery: string;
    renaming: boolean;
    onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onStartRename: () => void;
    onFinishRename: (value: string) => void;
    onCancelRename: () => void;
}) {
    const menu = useContextMenu();
    const rowRef = useRef<HTMLDivElement>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const openPanel = useUi((s) => s.openPanel);
    const displayLabel = displayName ?? tag.name;
    const noteCount = count !== undefined ? count : tag.count;
    useEffect(() => {
        if (highlighted)
            rowRef.current?.scrollIntoView({ block: 'nearest' });
    }, [highlighted]);
    const finishedRef = useRef(false);
    const finishRename = (value: string) => {
        if (finishedRef.current)
            return;
        finishedRef.current = true;
        onFinishRename(value);
    };
    const menuItems: MenuItem[] = [
        {
            id: 'pin',
            label: tag.isPinned ? t("tags.unpin") : t("tags.pin"),
            icon: <Pin size={13} className={tag.isPinned ? 'fill-current' : undefined}/>,
            onSelect: () => void toggleTagPinned(tag),
        },
        { id: 'rename', label: t("tags.rename"), icon: <Pencil size={13}/>, onSelect: onStartRename },
        {
            id: 'color',
            label: t("tags.color"),
            icon: <Palette size={13}/>,
            submenu: ({ closeMenu }) => (
                <TagColorSubmenu
                    tag={tag}
                    onSelectColor={(color) => {
                        void setTagColor(tag, color);
                        closeMenu();
                    }}
                    onManageTags={() => {
                        closeMenu();
                        openPanel('tags');
                    }}
                />
            ),
        },
        {
            id: 'manage-tags',
            label: t("tags.manage_tags"),
            icon: <Settings2 size={13}/>,
            onSelect: () => openPanel('tags'),
        },
        { id: 'delete', label: t("tags.delete"), icon: <Trash2 size={13}/>, tone: 'danger', separatorBefore: true, onSelect: () => void deleteTag(tag) },
    ];
    return (<div ref={rowRef} onContextMenu={(event) => {
            setIsMenuOpen(false);
            menu.onContextMenu(event);
        }} style={depth > 0 ? { paddingLeft: `${depth * 14 + 8}px` } : undefined} className={cn('group relative flex h-10 items-center gap-1.5 rounded-[var(--r-md)] px-2 md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active || selected
            ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]', highlighted && 'ring-1 ring-[var(--accent)]')}>
      {hasChildren ? (
        <button
          type="button"
          aria-label={isExpanded ? t("sidebar.collapse") : t("sidebar.expand")}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
          className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
        >
          <ChevronRight size={11} className={cn('transition-transform duration-150', isExpanded && 'rotate-90')} />
        </button>
      ) : (
        depth > 0 && <span className="w-4 shrink-0" />
      )}
      <Hash size={13} className="shrink-0" style={{ color: tag.color ?? (active || selected ? 'var(--accent)' : 'var(--text-quaternary)') }}/>
      {renaming ? (<input aria-label={t("tags.rename")} autoFocus defaultValue={tag.name} onFocus={() => {
            finishedRef.current = false;
        }} onBlur={(event) => finishRename(event.currentTarget.value)} onKeyDown={(event) => {
            if (event.key === 'Enter')
                finishRename(event.currentTarget.value);
            if (event.key === 'Escape') {
                finishedRef.current = true;
                onCancelRename();
            }
            event.stopPropagation();
        }} className="min-w-0 flex-1 rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 py-px text-[length:var(--text-12\.5)] outline-none"/>) : (<Tooltip label={t("sidebar.cmd_click_selects_multiple")} side="right">
              <button type="button" aria-current={active ? 'page' : undefined} aria-pressed={selected || undefined} onClick={onOpen} onDoubleClick={onStartRename} className="min-w-0 flex-1 truncate py-1 text-left text-[length:var(--text-12\.5)] font-medium flex items-center gap-1.5">
                <span className="truncate"><TagNameHighlight name={displayLabel} query={searchQuery}/></span>
                {tag.isPinned && <Pin size={10} className="shrink-0 fill-current text-[var(--accent)] opacity-80" />}
              </button>
            </Tooltip>)}
      {!renaming && (<>
          <span className="shrink-0 text-[length:var(--text-11)] tabular text-[var(--text-quaternary)] transition-opacity group-hover:opacity-0">
            {noteCount > 0 ? noteCount : ''}
          </span>
          <Tooltip label={t("common.more_actions")} side="left">
            <IconButton label={t("common.more_actions")} size="sm" onClick={(event) => {
                event.stopPropagation();
                menu.close();
                setIsMenuOpen(true);
            }} className="absolute right-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
              <MoreHorizontal size={13}/>
            </IconButton>
          </Tooltip>
        </>)}
      <Menu anchor={rowRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={menuItems}/>
      {menu.point && (<Menu anchor={menu.point} open onClose={menu.close} items={menuItems}/>)}
    </div>);
}

