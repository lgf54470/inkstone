import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerUpLeft,
  Download,
  FilePlus2,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Inbox,
  MoreHorizontal,
  Palette,
  Pencil,
  Settings2,
  Smile,
  Trash2,
} from 'lucide-react';
import { LIMITS } from '@shared/constants';
import { cn } from '../../../lib/cn';
import { errorMessage } from '../../../lib/errors';
import { tryParseStringArray } from '../../../lib/json';
import { IconButton, SectionLabel } from '../../../components/primitives';
import { Menu, Tooltip, confirm, useContextMenu, type MenuItem } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { selectNavigationProjection, useFolderTree, type FolderNode } from '../../../store/notes/selectors';
import { useNotes } from '../../../store/notes';
import { folderDescendantIds, folderPath, folderPathLabel, openFolderView } from '../../../lib/folders';
import { treeRowIndent } from '../../../lib/calendar-tree';
import { setInboxFolderId, useFolderPreferences } from '../../../lib/folder-prefs';
import { exportFolderAsZip } from '../../../lib/export-folder';
import { FolderColorSubmenu, FolderIconSubmenu, FolderPicker } from '../../folders';
import { CalendarTree, TodoTree } from '.././CalendarTree';
import { t } from '../../../lib/i18n';
import { leftDropTarget } from './SidebarDrop';

export function FolderSection() {
    const tree = useFolderTree();
    const folders = useNotes((s) => s.folders ?? []);
    const createFolder = useNotes((s) => s.createFolder);
    const patchFolder = useNotes((s) => s.patchFolder);
    const expandFolder = useUi((s) => s.expandFolder);
    const [isCreating, setIsCreating] = useState(false);
    const openPanel = useUi((s) => s.openPanel);
    const creatingRef = useRef(false);
    const createdTimerRef = useRef<number>(0);
    const [createdFolderId, setCreatedFolderId] = useState<string | null>(null);
    const movingIdsRef = useRef(new Set<string>());
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [isRootDropping, setIsRootDropping] = useState(false);
    useEffect(() => () => window.clearTimeout(createdTimerRef.current), []);
    const create = (parentId: string | null) => {
        if (creatingRef.current)
            return;
        creatingRef.current = true;
        setIsCreating(true);
        const startingUi = useUi.getState();
        const startingNavigation = {
            view: startingUi.view,
            folderId: startingUi.folderId,
            tag: startingUi.tag,
            activeNoteId: startingUi.activeNoteId,
        };
        try {
            const folderId = createFolder({ parentId });
            if (!folderId)
                return;
            window.clearTimeout(createdTimerRef.current);
            setCreatedFolderId(folderId);
            createdTimerRef.current = window.setTimeout(() => setCreatedFolderId(null), 1000);
            const currentUi = useUi.getState();
            if (currentUi.view === startingNavigation.view &&
                currentUi.folderId === startingNavigation.folderId &&
                currentUi.tag === startingNavigation.tag &&
                currentUi.activeNoteId === startingNavigation.activeNoteId) {
                if (parentId)
                    expandFolder(parentId);
                openFolderView(useNotes.getState().folders ?? [], folderId);
                setRenamingId(folderId);
            }
        }
        finally {
            queueMicrotask(() => {
                creatingRef.current = false;
                setIsCreating(false);
            });
        }
    };
    const move = (id: string, parentId: string | null, beforeId: string | null) => {
        if (movingIdsRef.current.has(id))
            return false;
        movingIdsRef.current.add(id);
        try {
            if (!patchFolder(id, { parentId, beforeId }))
                return false;
            if (parentId)
                expandFolder(parentId);
            return true;
        }
        catch {
            return false;
        }
        finally {
            movingIdsRef.current.delete(id);
        }
    };
    const movingFolder = movingId ? folders.find((folder) => folder.id === movingId) ?? null : null;
    const excludedMoveTargets = useMemo(() => {
        if (!movingId)
            return undefined;
        const excluded = folderDescendantIds(folders, movingId);
        const movingDepth = Math.max(0, folderPath(folders, movingId).length - 1);
        const relativeSubtreeDepth = Math.max(0, ...[...excluded].map((id) => Math.max(0, folderPath(folders, id).length - 1 - movingDepth)));
        for (const candidate of folders) {
            const movedRootDepth = folderPath(folders, candidate.id).length;
            if (movedRootDepth + relativeSubtreeDepth >= LIMITS.folderDepthMax)
                excluded.add(candidate.id);
        }
        return excluded;
    }, [folders, movingId]);
    const expandedFolders = useUi((s) => s.expandedFolders);
    const parentFolderIds = useMemo(() => {
        return folders.filter((f) => folders.some((child) => child.parentId === f.id)).map((f) => f.id);
    }, [folders]);
    const allExpanded = parentFolderIds.length > 0 && parentFolderIds.every((id) => expandedFolders.includes(id));

    const toggleAllExpanded = () => {
        if (allExpanded) {
            useUi.setState({
                expandedFolders: expandedFolders.filter((id) => !parentFolderIds.includes(id)),
            });
        } else {
            useUi.setState({
                expandedFolders: Array.from(new Set([...expandedFolders, ...parentFolderIds])),
            });
        }
    };
    return (<>
      <section id="sidebar-folders" className={cn('mt-4 rounded-[var(--r-md)]', isRootDropping && 'ring-1 ring-[var(--accent)]')} onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('application/x-inkstone-folder'))
                return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setIsRootDropping(true);
        }} onDragLeave={(event) => {
            if (leftDropTarget(event))
                setIsRootDropping(false);
        }} onDrop={(event) => {
            const folderId = event.dataTransfer.getData('application/x-inkstone-folder');
            if (!folderId)
                return;
            event.preventDefault();
            setIsRootDropping(false);
            void move(folderId, null, null);
        }}>
      <div className="group/head flex items-center justify-between pr-1">
        <SectionLabel>{t("navigation.folder")}</SectionLabel>
        <div className="flex items-center gap-0.5">
          {parentFolderIds.length > 0 && (
            <Tooltip label={allExpanded ? t("folders.collapse_all") : t("folders.expand_all")} side="left">
              <IconButton
                label={allExpanded ? t("folders.collapse_all") : t("folders.expand_all")}
                size="sm"
                onClick={toggleAllExpanded}
                className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100"
              >
                {allExpanded ? <ChevronsDownUp size={13}/> : <ChevronsUpDown size={13}/>}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip label={t("folders.manage_folders")} side="left">
            <IconButton label={t("folders.manage_folders")} size="sm" onClick={() => openPanel('folders')} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
              <Settings2 size={13}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t("common.new_folder")} side="right">
            <IconButton label={t("common.new_folder")} size="sm" disabled={isCreating} onClick={() => void create(null)} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
              <FolderPlus size={13}/>
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <CalendarTree />
      <TodoTree />

      {tree.length === 0 ? (<button type="button" disabled={isCreating} onClick={() => void create(null)} className="mt-0.5 flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-[12px] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-45 md:h-[30px]">
          <FolderPlus size={13}/>{t("sidebar.create_first_folder")}</button>) : (<div role="tree" aria-label={t("navigation.folder")} className="mt-0.5 space-y-px">
          {tree.map((node, index) => (<FolderRow key={node.id} node={node} siblings={tree} index={index} parentNode={null} parentSiblings={[]} onCreateChild={create} onMove={move} onChooseParent={setMovingId} createdFolderId={createdFolderId} renamingId={renamingId} onStartRename={setRenamingId} onFinishRename={() => setRenamingId(null)}/>))}
        </div>)}
      </section>
      <FolderPicker open={Boolean(movingFolder)} title={t("folders.choose_parent")} folders={folders} currentId={movingFolder?.parentId ?? null} excludedIds={excludedMoveTargets} onSelect={(parentId) => {
            if (movingId)
                void move(movingId, parentId, null);
        }} onClose={() => setMovingId(null)}/>
    </>);
}

export function FolderRow({ node, siblings, index, parentNode, parentSiblings, onCreateChild, onMove, onChooseParent, createdFolderId, renamingId, onStartRename, onFinishRename, }: {
    node: FolderNode;
    siblings: FolderNode[];
    index: number;
    parentNode: FolderNode | null;
    parentSiblings: FolderNode[];
    onCreateChild: (parentId: string | null) => void;
    onMove: (id: string, parentId: string | null, beforeId: string | null) => boolean;
    onChooseParent: (id: string) => void;
    createdFolderId: string | null;
    renamingId: string | null;
    onStartRename: (id: string) => void;
    onFinishRename: () => void;
}) {
    const view = useUi((s) => s.view);
    const activeFolderId = useUi((s) => s.folderId);
    const expanded = useUi((s) => s.expandedFolders.includes(node.id));
    const toggleFolder = useUi((s) => s.toggleFolder);
    const openPanel = useUi((s) => s.openPanel);
    const folders = useNotes((s) => s.folders ?? []);
    const patchFolder = useNotes((s) => s.patchFolder);
    const deleteFolder = useNotes((s) => s.deleteFolder);
    const { inboxFolderId } = useFolderPreferences();
    const isInbox = inboxFolderId === node.id;
    // The count feeds the delete-confirmation only; the visible row badge is the
    // tree's totalNotes. Look it up from the shared memoized navigation projection
    // instead of scanning the whole notes map per folder row per render.
    const directNoteCount = useNotes((state) => selectNavigationProjection(state.notes).folderCounts.get(node.id) ?? 0);
    const [dropState, setDropState] = useState<'none' | 'before' | 'inside' | 'after'>('none');
    const menu = useContextMenu();
    const buttonRef = useRef<HTMLDivElement>(null);
    const removingRef = useRef(false);
    const renamingRef = useRef(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const active = view === 'folder' && activeFolderId === node.id;
    const hasChildren = node.children.length > 0;
    const justCreated = createdFolderId === node.id;
    const [childrenMounted, setChildrenMounted] = useState(expanded && hasChildren);
    const [childrenVisible, setChildrenVisible] = useState(expanded && hasChildren);
    const renaming = renamingId === node.id;
    const canCreateChild = node.depth + 1 < LIMITS.folderDepthMax;
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
    const rename = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === node.name) {
            onFinishRename();
            return;
        }
        if (renamingRef.current)
            return;
        renamingRef.current = true;
        onFinishRename();
        patchFolder(node.id, { name: trimmed });
        queueMicrotask(() => {
            renamingRef.current = false;
        });
    };
    const remove = async () => {
        if (removingRef.current)
            return;
        removingRef.current = true;
        try {
            const hasContent = directNoteCount > 0 || hasChildren;
            const ok = await confirm({
                title: t("sidebar.delete_folder_value0", { value0: node.name }),
                description: hasContent
                    ? t("folders.delete_contents_move_up", { value0: directNoteCount, value1: node.children.length }) : t("sidebar.this_folder_is_empty"),
                confirmLabel: t("common.delete"),
                tone: 'danger',
            });
            if (!ok)
                return;
            deleteFolder(node.id);
        }
        finally {
            removingRef.current = false;
        }
    };
    const moveEarlier = () => {
        const previous = siblings[index - 1];
        if (previous)
            void onMove(node.id, node.parentId, previous.id);
    };
    const moveLater = () => {
        if (index >= siblings.length - 1)
            return;
        void onMove(node.id, node.parentId, siblings[index + 2]?.id ?? null);
    };
    const moveOut = () => {
        if (!parentNode)
            return;
        const parentIndex = parentSiblings.findIndex((folder) => folder.id === parentNode.id);
        if (parentIndex < 0)
            return;
        void onMove(node.id, parentNode.parentId, parentSiblings[parentIndex + 1]?.id ?? null);
    };
    const menuItems: MenuItem[] = [
        { id: 'rename', label: t("sidebar.rename"), icon: <Pencil size={13}/>, onSelect: () => onStartRename(node.id) },
        { id: 'new-note', label: t("sidebar.create_new_note_here"), icon: <FilePlus2 size={13}/>, onSelect: () => void useNotes.getState().createNote({ folderId: node.id }) },
        { id: 'new-child', label: t("sidebar.new_subfolder"), icon: <FolderPlus size={13}/>, disabled: !canCreateChild, onSelect: () => onCreateChild(node.id) },
        {
            id: 'color',
            label: t("folders.color"),
            icon: <Palette size={13}/>,
            submenu: ({ closeMenu }) => (
                <FolderColorSubmenu
                    folder={node}
                    onSelectColor={(color) => {
                        void patchFolder(node.id, { color });
                        closeMenu();
                    }}
                    onManageFolders={() => {
                        closeMenu();
                        openPanel('folders');
                    }}
                />
            ),
        },
        {
            id: 'icon',
            label: t("folders.icon"),
            icon: <Smile size={13}/>,
            submenu: ({ closeMenu }) => (
                <FolderIconSubmenu
                    folder={node}
                    onSelectIcon={(icon) => {
                        void patchFolder(node.id, { icon });
                        closeMenu();
                    }}
                />
            ),
        },
        {
            id: 'inbox',
            label: isInbox ? t("folders.unset_inbox") : t("folders.set_as_inbox"),
            icon: <Inbox size={13}/>,
            onSelect: () => {
                if (isInbox) {
                    setInboxFolderId(null);
                    useUi.getState().toast({ title: t("folders.inbox_cleared_toast"), tone: 'default' });
                } else {
                    setInboxFolderId(node.id);
                    useUi.getState().toast({ title: t("folders.inbox_set_toast", { value0: node.name }), tone: 'success' });
                }
            },
        },
        { id: 'move-to', label: t("folders.move_to"), icon: <FolderInput size={13}/>, separatorBefore: true, onSelect: () => onChooseParent(node.id) },
        { id: 'move-earlier', label: t("sidebar.move_earlier"), icon: <ArrowUp size={13}/>, disabled: index === 0, onSelect: moveEarlier },
        { id: 'move-later', label: t("sidebar.move_later"), icon: <ArrowDown size={13}/>, disabled: index === siblings.length - 1, onSelect: moveLater },
        { id: 'move-out', label: t("sidebar.move_out_one_level"), icon: <CornerUpLeft size={13}/>, disabled: !parentNode, onSelect: moveOut },
        {
            id: 'export-zip',
            label: t("folders.export_zip"),
            icon: <Download size={13}/>,
            separatorBefore: true,
            onSelect: async () => {
                try {
                    const res = await exportFolderAsZip(node.id);
                    if (res.count === 0) {
                        useUi.getState().toast({ title: t("folders.export_zip_empty"), tone: 'default' });
                    } else {
                        useUi.getState().toast({
                            title: t("folders.export_zip_success", { value0: res.count }),
                            tone: 'success',
                        });
                    }
                } catch (err) {
                    useUi.getState().toast({
                        title: t("common.export_failed"),
                        description: errorMessage(err),
                        tone: 'danger',
                    });
                }
            },
        },
        { id: 'manage', label: t("folders.manage_folders"), icon: <Settings2 size={13}/>, separatorBefore: true, onSelect: () => openPanel('folders') },
        { id: 'delete', label: t("sidebar.delete_folder"), icon: <Trash2 size={13}/>, tone: 'danger', separatorBefore: true, onSelect: () => void remove() },
    ];
    return (<div role="treeitem" aria-level={node.depth + 1} aria-expanded={hasChildren ? expanded : undefined} className={cn(justCreated && 'anim-tree-item-enter')} data-new-folder={justCreated || undefined}>
      <div ref={buttonRef} onContextMenu={(event) => {
            setIsMenuOpen(false);
            menu.onContextMenu(event);
        }} onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('application/x-inkstone-note') &&
                !e.dataTransfer.types.includes('application/x-inkstone-notes') &&
                !e.dataTransfer.types.includes('application/x-inkstone-folder'))
                return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            if (e.dataTransfer.types.includes('application/x-inkstone-note') || e.dataTransfer.types.includes('application/x-inkstone-notes')) {
                setDropState('inside');
                return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
            setDropState(ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside');
        }} onDragLeave={(e) => {
            if (leftDropTarget(e))
                setDropState('none');
        }} onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropState('none');
            let noteIds: string[] = [];
            const multiNotesRaw = e.dataTransfer.getData('application/x-inkstone-notes');
            if (multiNotesRaw) noteIds = tryParseStringArray(multiNotesRaw);
            if (noteIds.length === 0) {
                const singleId = e.dataTransfer.getData('application/x-inkstone-note');
                if (singleId) noteIds = [singleId];
            }
            if (noteIds.length > 0) {
                void useNotes.getState().moveNotes(noteIds, node.id);
                useUi.getState().toast({
                    title: t("notes.move_to_value0", { value0: node.name }),
                    tone: 'success',
                });
                return;
            }
            const folderId = e.dataTransfer.getData('application/x-inkstone-folder');
            if (folderId && folderId !== node.id) {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
                const placement = dropState === 'none'
                    ? ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside'
                    : dropState;
                if (placement === 'before')
                    void onMove(folderId, node.parentId, node.id);
                else if (placement === 'after')
                    void onMove(folderId, node.parentId, siblings[index + 1]?.id ?? null);
                else
                    void onMove(folderId, node.id, null);
            }
        }} draggable={!renaming} onDragStart={(e) => {
            e.dataTransfer.setData('application/x-inkstone-folder', node.id);
            e.dataTransfer.effectAllowed = 'move';
        }} className={cn('group relative flex h-10 items-center gap-1 rounded-[var(--r-md)] pr-1 md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active
            ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]', dropState === 'inside' && 'ring-1 ring-[var(--accent)]')} style={{ paddingLeft: treeRowIndent(node.depth) }}>
        {dropState === 'before' && <span aria-hidden="true" className="pointer-events-none absolute top-0 right-1 left-1 h-px bg-[var(--accent)]"/>}
        {dropState === 'after' && <span aria-hidden="true" className="pointer-events-none absolute right-1 bottom-0 left-1 h-px bg-[var(--accent)]"/>}
        <Tooltip label={expanded ? t("sidebar.collapse") : t("sidebar.expand")} side="right">
          <button type="button" disabled={!hasChildren} aria-hidden={!hasChildren || undefined} tabIndex={hasChildren ? undefined : -1} onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node.id);
            }} aria-label={expanded ? t("sidebar.collapse") : t("sidebar.expand")} className={cn('flex size-8 shrink-0 items-center justify-center rounded text-[var(--text-quaternary)] md:size-4', 'transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]', expanded && 'rotate-90', !hasChildren && 'invisible')}>
            <ChevronRight size={12}/>
          </button>
        </Tooltip>

        <span className={cn('shrink-0', active && !node.color ? 'text-[var(--accent)]' : !node.color && 'text-[var(--text-tertiary)]')} style={{ color: node.color ?? undefined }}>
          {node.icon ? (<span className={cn('text-[13px] leading-none', justCreated && 'anim-mark-enter')}>{node.icon}</span>) : (<FolderMotionIcon open={expanded && hasChildren} drawing={justCreated}/>)}
        </span>

        {renaming ? (<input aria-label={t("sidebar.rename")} autoFocus defaultValue={node.name} onBlur={(e) => void rename(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'Enter')
                    void rename(e.currentTarget.value);
                if (e.key === 'Escape') {
                    e.currentTarget.value = node.name;
                    onFinishRename();
                }
                e.stopPropagation();
            }} className="min-w-0 flex-1 rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 py-px text-[12.5px] outline-none"/>) : (<Tooltip label={folderPathLabel(folders, node.id)} side="right">
            <button type="button" aria-current={active ? 'page' : undefined} onClick={() => openFolderView(folders, node.id)} onDoubleClick={() => onStartRename(node.id)} className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-[12.5px] font-medium">
              <span className="truncate">{node.name}</span>
              {isInbox && (
                <span title={t("folders.inbox")} className="shrink-0 text-[var(--accent)]">
                  <Inbox size={11} />
                </span>
              )}
            </button>
          </Tooltip>)}

        {!renaming && (<>
            <span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)] transition-opacity group-hover:opacity-0">
              {node.totalNotes > 0 ? node.totalNotes : ''}
            </span>
            <Tooltip label={t("common.more_actions")} side="left">
              <IconButton label={t("common.more_actions")} size="sm" onClick={(e) => {
                    e.stopPropagation();
                    menu.close();
                    setIsMenuOpen(true);
                }} className="absolute right-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
                <MoreHorizontal size={13}/>
              </IconButton>
            </Tooltip>
          </>)}
      </div>

      {childrenMounted && (<div role="group" aria-hidden={!childrenVisible} inert={!childrenVisible} className={cn('folder-children-grid', childrenVisible && 'is-expanded')}>
          <div className="min-h-0 space-y-px overflow-hidden">
            {node.children.map((child, childIndex) => (<FolderRow key={child.id} node={child} siblings={node.children} index={childIndex} parentNode={node} parentSiblings={siblings} onCreateChild={onCreateChild} onMove={onMove} onChooseParent={onChooseParent} createdFolderId={createdFolderId} renamingId={renamingId} onStartRename={onStartRename} onFinishRename={onFinishRename}/>))}
          </div>
        </div>)}

      <Menu anchor={buttonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={menuItems}/>
      {menu.point && (<Menu anchor={menu.point} open onClose={menu.close} items={menuItems}/>)}
    </div>);
}

export function FolderMotionIcon({ open, drawing }: {
    open: boolean;
    drawing: boolean;
}) {
    return (<span aria-hidden="true" data-open={open || undefined} data-drawing={drawing || undefined} className="folder-motion-icon">
      <FolderClosed size={14} className="folder-motion-icon__closed"/>
      <FolderOpen size={14} className="folder-motion-icon__open"/>
    </span>);
}

