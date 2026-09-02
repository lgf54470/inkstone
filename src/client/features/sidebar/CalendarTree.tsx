import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, FolderClosed, FolderOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { buildCalendarTree, CALENDAR_ROOT_ID, calendarAncestorIds, calendarPathSegments, calendarPeriodKeyRange, type CalendarNode } from '../../lib/calendar-tree';
import { useNotes } from '../../store/notes';
import { useUi } from '../../store/ui';
import { Tooltip } from '../../components/overlay';
import { useCalendarTreeShowEmpty, useCalendarTreeVisible } from '../../lib/calendar-prefs';

const NOTE_DRAG_TYPE = 'application/x-inkstone-note';
const FOLDER_DRAG_TYPE = 'application/x-inkstone-folder';

export function CalendarTree() {
    const visible = useCalendarTreeVisible();
    const showEmpty = useCalendarTreeShowEmpty();
    const notes = useNotes((s) => s.notes);
    const rootLabel = t('sidebar.calendar_folder');
    const children = useMemo(() => buildCalendarTree(Object.values(notes ?? {}), showEmpty), [notes, showEmpty]);
    const rootCount = useMemo(() => children.reduce((sum, child) => sum + child.count, 0), [children]);
    if (!visible)
        return null;
    const root: CalendarNode = { id: CALENDAR_ROOT_ID, name: '', depth: -1, count: rootCount, children };
    const blockDrop = (event: React.DragEvent) => {
        if (event.dataTransfer.types.includes(NOTE_DRAG_TYPE) || event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    return (
        <div role="tree" aria-label={rootLabel} className="mt-0.5 space-y-px" onDragOver={blockDrop} onDrop={blockDrop}>
            <CalendarRow node={root} rootLabel={rootLabel}/>
        </div>
    );
}

function CalendarRow({ node, rootLabel }: {
    node: CalendarNode;
    rootLabel: string;
}) {
    const view = useUi((s) => s.view);
    const activeFolderId = useUi((s) => s.folderId);
    const expanded = useUi((s) => s.expandedFolders.includes(node.id));
    const toggleFolder = useUi((s) => s.toggleFolder);
    const openView = useUi((s) => s.openView);
    const hasChildren = node.children.length > 0;
    const active = view === 'folder' && activeFolderId === node.id;
    const [childrenMounted, setChildrenMounted] = useState(expanded && hasChildren);
    const [childrenVisible, setChildrenVisible] = useState(expanded && hasChildren);
    useEffect(() => {
        if (!hasChildren) {
            setChildrenVisible(false);
            setChildrenMounted(false);
            return;
        }
        if (expanded) {
            setChildrenMounted(true);
            const openTimer = window.setTimeout(() => setChildrenVisible(true), 0);
            return () => window.clearTimeout(openTimer);
        }
        setChildrenVisible(false);
        const closeTimer = window.setTimeout(() => setChildrenMounted(false), 340);
        return () => window.clearTimeout(closeTimer);
    }, [expanded, hasChildren]);
    const open = () => {
        const ancestors = calendarAncestorIds(node.id);
        if (ancestors.length) {
            useUi.setState((state) => ({
                expandedFolders: [...new Set([...state.expandedFolders, ...ancestors])],
            }));
        }
        openView('folder', { folderId: node.id });
    };
    const segments = calendarPathSegments(node.id);
    const pathLabel = segments ? [rootLabel, ...segments].join(' / ') : rootLabel;
    const range = calendarPeriodKeyRange(node.id);
    const tooltip = range ? `${pathLabel} · ${range.start} ~ ${range.end}` : pathLabel;
    const isRoot = node.depth < 0;
    const dim = node.count === 0 && !isRoot;
    return (
        <div role="treeitem" aria-level={node.depth + 2} aria-expanded={hasChildren ? expanded : undefined} className={cn('group relative flex h-10 items-center gap-1 rounded-[var(--r-md)] pr-1 md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active
            ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]', dim && 'opacity-60')} style={{ paddingLeft: Math.max(6, 6 + node.depth * 13) }}>
            <Tooltip label={expanded ? t("sidebar.collapse") : t("sidebar.expand")} side="right">
                <button type="button" disabled={!hasChildren} aria-hidden={!hasChildren || undefined} tabIndex={hasChildren ? undefined : -1} onClick={(e) => {
                    e.stopPropagation();
                    toggleFolder(node.id);
                }} aria-label={expanded ? t("sidebar.collapse") : t("sidebar.expand")} className={cn('flex size-8 shrink-0 items-center justify-center rounded text-[var(--text-quaternary)] md:size-4', 'transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]', expanded && 'rotate-90', !hasChildren && 'invisible')}>
                    <ChevronRight size={12}/>
                </button>
            </Tooltip>

            <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')}>
                {isRoot
                    ? <CalendarDays size={13}/>
                    : <span aria-hidden="true" data-open={expanded && hasChildren || undefined} className="folder-motion-icon">
                        <FolderClosed size={14} className="folder-motion-icon__closed"/>
                        <FolderOpen size={14} className="folder-motion-icon__open"/>
                    </span>}
            </span>

            <Tooltip label={tooltip} side="right">
                <button type="button" aria-current={active ? 'page' : undefined} onClick={open} className="min-w-0 flex-1 truncate py-1 text-left text-[12.5px] font-medium">
                    {isRoot ? rootLabel : node.name}
                </button>
            </Tooltip>

            {node.count > 0 && (<span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)] transition-opacity group-hover:opacity-70">{node.count}</span>)}

        {childrenMounted && (<div role="group" aria-hidden={!childrenVisible} inert={!childrenVisible} className={cn('folder-children-grid', childrenVisible && 'is-expanded')}>
          <div className="min-h-0 space-y-px overflow-hidden">
            {node.children.map((child) => (<CalendarRow key={child.id} node={child} rootLabel={rootLabel}/>))}
          </div>
        </div>)}
        </div>
    );
}