import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckSquare, ChevronRight, FolderClosed, FolderOpen } from 'lucide-react';
import type { NoteSummary } from '@shared/types';
import { cn } from '../../lib/cn';
import { t, useLocale } from '../../lib/i18n';
import { buildVirtualTreeCached, CALENDAR_TREE, filterTodoNotes, resolveTodoTag, splitTodoTags, TODO_TREE, type CalendarNode, type VirtualTreeNamespace, virtualAncestorIds, virtualPathSegments, virtualPeriodKeyRange, virtualTreeRowIndent } from '../../lib/calendar-tree';
import { useNotes } from '../../store/notes';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Tooltip } from '../../components/overlay';
import { useCalendarTreeShowEmpty, useCalendarTreeVisible } from '../../lib/calendar-prefs';

const NOTE_DRAG_TYPE = 'application/x-inkstone-note';
const FOLDER_DRAG_TYPE = 'application/x-inkstone-folder';

export function CalendarTree() {
    return (
        <VirtualTree
            ns={CALENDAR_TREE}
            rootLabel={t("sidebar.calendar_folder")}
            rootIcon={<CalendarDays size={13}/>}
        />
    );
}

export function TodoTree() {
    const todoTagPref = useSession((s) => s.settings.notes?.todoTag);
    const locale = useLocale();
    return (
        <VirtualTree
            ns={TODO_TREE}
            rootLabel={t("sidebar.todo_folder")}
            rootIcon={<CheckSquare size={14}/>}
            filter={filterTodoNotes}
            filterArg={resolveTodoTag(todoTagPref, locale)}
        />
    );
}

function VirtualTree({ ns, rootLabel, rootIcon, filter, filterArg }: {
    ns: VirtualTreeNamespace;
    rootLabel: string;
    rootIcon: React.ReactNode;
    filter?: (notes: NoteSummary[], arg?: string) => NoteSummary[];
    filterArg?: string;
}) {
    const allNotes = useNotes((s) => s.notes);
    const visible = useCalendarTreeVisible();
    const showEmpty = useCalendarTreeShowEmpty();
    const children = useMemo(() => {
        const todoTags = filter ? splitTodoTags(filterArg ?? '') : null;
        return buildVirtualTreeCached(allNotes ?? {}, ns, showEmpty, todoTags);
    }, [allNotes, ns, filter, filterArg, showEmpty]);
    const rootCount = useMemo(() => children.reduce((sum, child) => sum + child.count, 0), [children]);
    if (!visible)
        return null;
    const root: CalendarNode = { id: ns.rootId, name: '', depth: -1, count: rootCount, children };
    const blockDrop = (event: React.DragEvent) => {
        if (event.dataTransfer.types.includes(NOTE_DRAG_TYPE) || event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    return (
        <div role="tree" aria-label={rootLabel} className="mt-0.5 space-y-px" onDragOver={blockDrop} onDrop={blockDrop}>
            <VirtualRow ns={ns} rootLabel={rootLabel} rootIcon={rootIcon} node={root}/>
        </div>
    );
}

function VirtualRow({ ns, rootLabel, rootIcon, node }: {
    ns: VirtualTreeNamespace;
    rootLabel: string;
    rootIcon: React.ReactNode;
    node: CalendarNode;
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
        const ancestors = virtualAncestorIds(node.id, ns);
        if (ancestors.length) {
            useUi.setState((state) => ({
                expandedFolders: [...new Set([...state.expandedFolders, ...ancestors])],
            }));
        }
        openView('folder', { folderId: node.id });
    };
    const segments = virtualPathSegments(node.id, ns);
    const pathLabel = segments ? [rootLabel, ...segments].join(' / ') : rootLabel;
    const range = virtualPeriodKeyRange(node.id, ns);
    const tooltip = range ? `${pathLabel} · ${range.start} ~ ${range.end}` : pathLabel;
    const isRoot = node.depth < 0;
    const dim = node.count === 0 && !isRoot;
    return (
        <div role="treeitem" aria-level={node.depth + 2} aria-expanded={hasChildren ? expanded : undefined}>
            <div className={cn('group relative flex h-10 items-center gap-1 rounded-[var(--r-md)] pr-1 md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]', dim && 'opacity-60')} style={{ paddingLeft: virtualTreeRowIndent(node.depth) }}>
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
                        ? rootIcon
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
            </div>

            {childrenMounted && (<div role="group" aria-hidden={!childrenVisible} inert={!childrenVisible} className={cn('folder-children-grid', childrenVisible && 'is-expanded')}>
                <div className="min-h-0 space-y-px overflow-hidden">
                    {node.children.map((child) => (<VirtualRow key={child.id} ns={ns} rootLabel={rootLabel} rootIcon={rootIcon} node={child}/>))}
                </div>
            </div>)}
        </div>
    );
}