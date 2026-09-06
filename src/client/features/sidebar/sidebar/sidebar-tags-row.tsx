import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Hash, MoreHorizontal, Pin, Palette, Pencil, Settings2, Trash2 } from 'lucide-react';
import type { Tag } from '@shared/types';
import { cn } from '../../../lib/cn';
import { TagNameHighlight } from '../../../components/tag-name-highlight';
import { IconButton } from '../../../components/primitives';
import { Menu, Tooltip, useContextMenu, type MenuItem } from '../../../components/overlay';
import { useUi, type PanelName } from '../../../store/ui';
import { deleteTag, setTagColor, TagColorSubmenu, toggleTagPinned } from '../../tags';
import { t } from '../../../lib/i18n';

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

export interface TagRowProps {
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
}

export function TagRow({ tag, displayName, depth = 0, hasChildren = false, isExpanded = false, onToggleExpand, count, active, selected, highlighted, searchQuery, renaming, onOpen, onStartRename, onFinishRename, onCancelRename }: TagRowProps) {
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
    const commitRename = (value: string) => {
        if (finishedRef.current)
            return;
        finishedRef.current = true;
        onFinishRename(value);
    };
    const menuItems = buildTagMenuItems(tag, onStartRename, openPanel);
    return (<div ref={rowRef} onContextMenu={(event) => { setIsMenuOpen(false); menu.onContextMenu(event); }} style={depth > 0 ? { paddingLeft: `${depth * 14 + 8}px` } : undefined} className={cn('group relative flex h-10 items-center gap-1.5 rounded-[var(--r-md)] px-2 md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active || selected ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]', highlighted && 'ring-1 ring-[var(--accent)]')}>
        <TagRowChevron hasChildren={hasChildren} depth={depth} isExpanded={isExpanded} onToggleExpand={onToggleExpand}/>
        <Hash size={13} className="shrink-0" style={{ color: tag.color ?? (active || selected ? 'var(--accent)' : 'var(--text-quaternary)') }}/>
        <TagRowLabel tag={tag} displayLabel={displayLabel} searchQuery={searchQuery} active={active} selected={selected} renaming={renaming} finishedRef={finishedRef} onOpen={onOpen} onStartRename={onStartRename} onCancelRename={onCancelRename} onCommitRename={commitRename}/>
        {!renaming && <TagRowMeta noteCount={noteCount} onOpenMenu={(event) => { event.stopPropagation(); menu.close(); setIsMenuOpen(true); }}/>}
        <Menu anchor={rowRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={menuItems}/>
        {menu.point && (<Menu anchor={menu.point} open onClose={menu.close} items={menuItems}/>)}
    </div>);
}

function TagRowChevron({ hasChildren, depth, isExpanded, onToggleExpand }: {
    hasChildren: boolean;
    depth: number;
    isExpanded: boolean;
    onToggleExpand?: () => void;
}) {
    if (hasChildren) return (<button type="button" aria-label={isExpanded ? t("sidebar.collapse") : t("sidebar.expand")} onClick={(e) => {
        e.stopPropagation();
        onToggleExpand?.();
    }} className="flex size-4 shrink-0 items-center justify-center rounded text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]">
        <ChevronRight size={11} className={cn('transition-transform duration-150', isExpanded && 'rotate-90')}/>
    </button>);
    return depth > 0 ? <span className="w-4 shrink-0"/> : null;
}

function TagRowLabel({ tag, displayLabel, searchQuery, active, selected, renaming, finishedRef, onOpen, onStartRename, onCancelRename, onCommitRename }: {
    tag: Tag;
    displayLabel: string;
    searchQuery: string;
    active: boolean;
    selected: boolean;
    renaming: boolean;
    finishedRef: React.MutableRefObject<boolean>;
    onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onStartRename: () => void;
    onCancelRename: () => void;
    onCommitRename: (value: string) => void;
}) {
    if (renaming) return (<input aria-label={t("tags.rename")} autoFocus defaultValue={tag.name} onFocus={() => { finishedRef.current = false; }} onBlur={(event) => onCommitRename(event.currentTarget.value)} onKeyDown={(event) => {
        if (event.key === 'Enter')
            onCommitRename(event.currentTarget.value);
        if (event.key === 'Escape') {
            finishedRef.current = true;
            onCancelRename();
        }
        event.stopPropagation();
    }} className="min-w-0 flex-1 rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 py-px text-[length:var(--text-12\.5)] outline-none"/>);
    return (<Tooltip label={t("sidebar.cmd_click_selects_multiple")} side="right">
        <button type="button" aria-current={active ? 'page' : undefined} aria-pressed={selected || undefined} onClick={onOpen} onDoubleClick={onStartRename} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[length:var(--text-12\.5)] font-medium truncate">
            <span className="truncate"><TagNameHighlight name={displayLabel} query={searchQuery}/></span>
            {tag.isPinned && <Pin size={10} className="shrink-0 fill-current text-[var(--accent)] opacity-80"/>}
        </button>
    </Tooltip>);
}

function TagRowMeta({ noteCount, onOpenMenu }: {
    noteCount: number;
    onOpenMenu: (event: React.MouseEvent) => void;
}) {
    return (<>
        <span className="shrink-0 text-[length:var(--text-11)] tabular text-[var(--text-quaternary)] transition-opacity group-hover:opacity-0">
            {noteCount > 0 ? noteCount : ''}
        </span>
        <Tooltip label={t("common.more_actions")} side="left">
            <IconButton label={t("common.more_actions")} size="sm" onClick={onOpenMenu} className="absolute right-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
                <MoreHorizontal size={13}/>
            </IconButton>
        </Tooltip>
    </>);
}

function buildTagMenuItems(tag: Tag, onStartRename: () => void, openPanel: (panel: PanelName) => void): MenuItem[] {
    return [
        {
            id: 'pin',
            label: tag.isPinned ? t("tags.unpin") : t("tags.pin"),
            icon: <Pin size={13} className={tag.isPinned ? 'fill-current' : undefined}/>,
            onSelect: () => void toggleTagPinned(tag),
        },
        { id: 'rename', label: t("tags.rename"), icon: <Pencil size={13}/>, onSelect: onStartRename },
        { id: 'color', label: t("tags.color"), icon: <Palette size={13}/>, submenu: tagColorSubmenu(tag) },
        { id: 'manage-tags', label: t("tags.manage_tags"), icon: <Settings2 size={13}/>, onSelect: () => openPanel('tags') },
        { id: 'delete', label: t("tags.delete"), icon: <Trash2 size={13}/>, tone: 'danger', separatorBefore: true, onSelect: () => void deleteTag(tag) },
    ];
}

function tagColorSubmenu(tag: Tag): MenuItem['submenu'] {
    return ({ closeMenu }) => (
        <TagColorSubmenu
            tag={tag}
            onSelectColor={(color) => {
                void setTagColor(tag, color);
                closeMenu();
            }}
            onManageTags={() => {
                closeMenu();
                useUi.getState().openPanel('tags');
            }}
        />
    );
}
