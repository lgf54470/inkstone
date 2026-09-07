import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CornerUpLeft, Download, FilePlus2, FolderInput, FolderPlus, Inbox, MoreHorizontal, Palette, Pencil, Settings2, Smile, Trash2 } from 'lucide-react';
import { LIMITS } from '@shared/constants';
import type { Folder } from '@shared/types';
import { cn } from '../../../../lib/cn';
import { errorMessage } from '../../../../lib/errors';
import { IconButton } from '../../../../components/primitives';
import { Menu, Tooltip, confirm, useContextMenu, type MenuItem } from '../../../../components/overlay';
import { useUi } from '../../../../store/ui';
import { selectNavigationProjection, type FolderNode } from '../../../../store/notes';
import { useNotes } from '../../../../store/notes';
import { folderPathLabel, openFolderView } from '../../../../lib/folders';
import { treeRowIndent } from '../../../../lib/calendar-tree';
import { setInboxFolderId, useFolderPreferences } from '../../../../lib/folder-prefs';
import { exportFolderAsZip } from '../../../../lib/export-folder';
import { FolderColorSubmenu, FolderIconSubmenu } from '../../../folders';
import { t } from '../../../../lib/i18n';
import { FOLDER_DRAG_TYPE, NOTE_DRAG_TYPE, NOTES_DRAG_TYPE, leftDropTarget, readDraggedNoteIds } from '../sidebar-drop';
import { FolderMotionIcon } from './motion-icon';
import { TreeExpandButton } from '../../tree-expand-button';
import { useTreeChildrenMount } from '../../use-tree-children';

type DropState = 'none' | 'before' | 'inside' | 'after';

export interface FolderRowProps {
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
}

export function FolderRow({ node, siblings, index, parentNode, parentSiblings, onCreateChild, onMove, onChooseParent, createdFolderId, renamingId, onStartRename, onFinishRename }: FolderRowProps) {
  const view = useUi((s) => s.view);
  const activeFolderId = useUi((s) => s.folderId);
  const expanded = useUi((s) => s.expandedFolders.includes(node.id));
  const toggleFolder = useUi((s) => s.toggleFolder);
  const folders = useNotes((s) => s.folders ?? []);
  const patchFolder = useNotes((s) => s.patchFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);
  const { inboxFolderId } = useFolderPreferences();
  // The count feeds the delete-confirmation only; the visible row badge is the tree's totalNotes.
  const directNoteCount = useNotes((state) => selectNavigationProjection(state.notes).folderCounts.get(node.id) ?? 0);
  const isInbox = inboxFolderId === node.id;
  const [dropState, setDropState] = useState<DropState>('none');
  const menu = useContextMenu();
  const buttonRef = useRef<HTMLDivElement>(null);
  const removingRef = useRef(false);
  const renamingRef = useRef(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const renaming = renamingId === node.id;
  const justCreated = createdFolderId === node.id;
  const active = view === 'folder' && activeFolderId === node.id;
  const canCreateChild = node.depth + 1 < LIMITS.folderDepthMax;
  const { childrenMounted, childrenVisible } = useTreeChildrenMount(expanded, hasChildren);
  const menuItems = buildFolderMenuItems({
    node, siblings, index, parentNode, parentSiblings, isInbox, canCreateChild, onMove, onCreateChild, onChooseParent, onStartRename,
    onRemove: () => void removeFolder(node, directNoteCount, hasChildren, deleteFolder, removingRef),
  });
  return (
    <div role='treeitem' aria-level={node.depth + 1} aria-expanded={hasChildren ? expanded : undefined} className={cn(justCreated && 'anim-tree-item-enter')} data-new-folder={justCreated || undefined}>
      <div ref={buttonRef} onContextMenu={(event) => { setIsMenuOpen(false); menu.onContextMenu(event); }} onDragOver={(event) => handleFolderDragOver(event, setDropState)} onDragLeave={(event) => { if (leftDropTarget(event)) setDropState('none'); }} onDrop={(event) => handleFolderDrop(event, { node, siblings, index, dropState, setDropState, onMove })} draggable={!renaming} onDragStart={(event) => { event.dataTransfer.setData(FOLDER_DRAG_TYPE, node.id); event.dataTransfer.effectAllowed = 'move'; }} className={cn('group relative flex h-10 items-center gap-1 rounded-[var(--r-md)] pr-1 md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]', dropState === 'inside' && 'ring-1 ring-[var(--accent)]')} style={{ paddingLeft: treeRowIndent(node.depth) }}>
        {dropState === 'before' && <span aria-hidden='true' className='pointer-events-none absolute top-0 right-1 left-1 h-px bg-[var(--accent)]'/>}
        {dropState === 'after' && <span aria-hidden='true' className='pointer-events-none absolute right-1 bottom-0 left-1 h-px bg-[var(--accent)]'/>}
        <TreeExpandButton expanded={expanded} hasChildren={hasChildren} onToggle={() => toggleFolder(node.id)}/>
        <FolderRowIcon node={node} active={active} open={expanded && hasChildren} justCreated={justCreated}/>
        <FolderRowLabel node={node} folders={folders} active={active} isInbox={isInbox} renaming={renaming} onCommitRename={(value) => commitRename(value, node, patchFolder, renamingRef, onFinishRename)} onCancelRename={onFinishRename} onStartRename={() => onStartRename(node.id)}/>
        {!renaming && <FolderRowMeta count={node.totalNotes} onOpenMenu={(event) => { event.stopPropagation(); menu.close(); setIsMenuOpen(true); }}/>}
      </div>
      {childrenMounted && <FolderTreeChildren node={node} siblings={siblings} childrenVisible={childrenVisible} createdFolderId={createdFolderId} renamingId={renamingId} onCreateChild={onCreateChild} onMove={onMove} onChooseParent={onChooseParent} onStartRename={onStartRename} onFinishRename={onFinishRename}/>}
      <Menu anchor={buttonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={menuItems}/>
      {menu.point && <Menu anchor={menu.point} open onClose={menu.close} items={menuItems}/>}
    </div>
  );
}

interface FolderMenuSource {
  node: FolderNode;
  siblings: FolderNode[];
  index: number;
  parentNode: FolderNode | null;
  parentSiblings: FolderNode[];
  isInbox: boolean;
  canCreateChild: boolean;
  onRemove: () => void;
  onMove: (id: string, parentId: string | null, beforeId: string | null) => boolean;
  onCreateChild: (parentId: string | null) => void;
  onChooseParent: (id: string) => void;
  onStartRename: (id: string) => void;
}

function FolderTreeChildren({ node, siblings, childrenVisible, createdFolderId, renamingId, onCreateChild, onMove, onChooseParent, onStartRename, onFinishRename }: {
  node: FolderNode;
  siblings: FolderNode[];
  childrenVisible: boolean;
  createdFolderId: FolderRowProps['createdFolderId'];
  renamingId: FolderRowProps['renamingId'];
  onCreateChild: FolderRowProps['onCreateChild'];
  onMove: FolderRowProps['onMove'];
  onChooseParent: FolderRowProps['onChooseParent'];
  onStartRename: FolderRowProps['onStartRename'];
  onFinishRename: FolderRowProps['onFinishRename'];
}) {
  return (
    <div role='group' aria-hidden={!childrenVisible} inert={!childrenVisible} className={cn('folder-children-grid', childrenVisible && 'is-expanded')}>
      <div className='min-h-0 space-y-px overflow-hidden'>
        {node.children.map((child, childIndex) => (
          <FolderRow key={child.id} node={child} siblings={node.children} index={childIndex} parentNode={node} parentSiblings={siblings} onCreateChild={onCreateChild} onMove={onMove} onChooseParent={onChooseParent} createdFolderId={createdFolderId} renamingId={renamingId} onStartRename={onStartRename} onFinishRename={onFinishRename}/>
        ))}
      </div>
    </div>
  );
}

function FolderRowLabel({ node, folders, active, isInbox, renaming, onCommitRename, onCancelRename, onStartRename }: {
  node: FolderNode;
  folders: Folder[];
  active: boolean;
  isInbox: boolean;
  renaming: boolean;
  onCommitRename: (value: string) => void;
  onCancelRename: () => void;
  onStartRename: () => void;
}) {
  if (renaming) return (<input aria-label={t('sidebar.rename')} autoFocus defaultValue={node.name} onBlur={(e) => void onCommitRename(e.target.value)} onKeyDown={(e) => {
    if (e.key === 'Enter') void onCommitRename(e.currentTarget.value);
    if (e.key === 'Escape') {
      e.currentTarget.value = node.name;
      onCancelRename();
    }
    e.stopPropagation();
  }} className="min-w-0 flex-1 rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 py-px text-[length:var(--text-12\.5)] outline-none"/>);
  return (<Tooltip label={folderPathLabel(folders, node.id)} side='right'>
    <button type='button' aria-current={active ? 'page' : undefined} onClick={() => openFolderView(folders, node.id)} onDoubleClick={onStartRename} className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-[length:var(--text-12\.5)] font-medium">
      <span className='truncate'>{node.name}</span>
      {isInbox && (<span title={t('folders.inbox')} className='shrink-0 text-[var(--accent)]'><Inbox size={11}/></span>)}
    </button>
  </Tooltip>);
}

function FolderRowIcon({ node, active, open, justCreated }: {
  node: FolderNode;
  active: boolean;
  open: boolean;
  justCreated: boolean;
}) {
  return (<span className={cn('shrink-0', active && !node.color ? 'text-[var(--accent)]' : !node.color && 'text-[var(--text-tertiary)]')} style={{ color: node.color ?? undefined }}>
    {node.icon ? (<span className={cn('text-[length:var(--text-13)] leading-none', justCreated && 'anim-mark-enter')}>{node.icon}</span>) : (<FolderMotionIcon open={open} drawing={justCreated}/>)}
  </span>);
}

function FolderRowMeta({ count, onOpenMenu }: {
  count: number;
  onOpenMenu: (event: React.MouseEvent) => void;
}) {
  return (<>
    <span className='shrink-0 text-[length:var(--text-11)] tabular text-[var(--text-quaternary)] transition-opacity group-hover:opacity-0'>
      {count > 0 ? count : ''}
    </span>
    <Tooltip label={t('common.more_actions')} side='left'>
      <IconButton label={t('common.more_actions')} size='sm' onClick={onOpenMenu} className='absolute right-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'>
        <MoreHorizontal size={13}/>
      </IconButton>
    </Tooltip>
  </>);
}

function buildFolderMenuItems(ctx: FolderMenuSource): MenuItem[] {
  return [
    { id: 'rename', label: t('sidebar.rename'), icon: <Pencil size={13}/>, onSelect: () => ctx.onStartRename(ctx.node.id) },
    { id: 'new-note', label: t('sidebar.create_new_note_here'), icon: <FilePlus2 size={13}/>, onSelect: () => void useNotes.getState().createNote({ folderId: ctx.node.id }) },
    { id: 'new-child', label: t('sidebar.new_subfolder'), icon: <FolderPlus size={13}/>, disabled: !ctx.canCreateChild, onSelect: () => ctx.onCreateChild(ctx.node.id) },
    { id: 'color', label: t('folders.color'), icon: <Palette size={13}/>, submenu: folderColorSubmenu(ctx.node) },
    { id: 'icon', label: t('folders.icon'), icon: <Smile size={13}/>, submenu: folderIconSubmenu(ctx.node) },
    {
      id: 'inbox',
      label: ctx.isInbox ? t('folders.unset_inbox') : t('folders.set_as_inbox'),
      icon: <Inbox size={13}/>,
      onSelect: toggleInboxFor(ctx.node, ctx.isInbox),
    },
    { id: 'move-to', label: t('folders.move_to'), icon: <FolderInput size={13}/>, separatorBefore: true, onSelect: () => ctx.onChooseParent(ctx.node.id) },
    { id: 'move-earlier', label: t('sidebar.move_earlier'), icon: <ArrowUp size={13}/>, disabled: ctx.index === 0, onSelect: () => moveFolderEarlier(ctx.node, ctx.siblings, ctx.index, ctx.onMove) },
    { id: 'move-later', label: t('sidebar.move_later'), icon: <ArrowDown size={13}/>, disabled: ctx.index === ctx.siblings.length - 1, onSelect: () => moveFolderLater(ctx.node, ctx.siblings, ctx.index, ctx.onMove) },
    { id: 'move-out', label: t('sidebar.move_out_one_level'), icon: <CornerUpLeft size={13}/>, disabled: !ctx.parentNode, onSelect: () => moveFolderOut(ctx.node, ctx.parentNode, ctx.parentSiblings, ctx.onMove) },
    { id: 'export-zip', label: t('folders.export_zip'), icon: <Download size={13}/>, separatorBefore: true, onSelect: () => void exportFolderZip(ctx.node.id) },
    { id: 'manage', label: t('folders.manage_folders'), icon: <Settings2 size={13}/>, separatorBefore: true, onSelect: () => useUi.getState().openPanel('folders') },
    { id: 'delete', label: t('sidebar.delete_folder'), icon: <Trash2 size={13}/>, tone: 'danger', separatorBefore: true, onSelect: ctx.onRemove },
  ];
}

function folderColorSubmenu(node: FolderNode): MenuItem['submenu'] {
  return ({ closeMenu }) => (
    <FolderColorSubmenu
      folder={node}
      onSelectColor={(color) => {
        void useNotes.getState().patchFolder(node.id, { color });
        closeMenu();
      }}
      onManageFolders={() => {
        closeMenu();
        useUi.getState().openPanel('folders');
      }}
    />
  );
}

function folderIconSubmenu(node: FolderNode): MenuItem['submenu'] {
  return ({ closeMenu }) => (
    <FolderIconSubmenu
      folder={node}
      onSelectIcon={(icon) => {
        void useNotes.getState().patchFolder(node.id, { icon });
        closeMenu();
      }}
    />
  );
}

function toggleInboxFor(node: FolderNode, isInbox: boolean) {
  return () => {
    if (isInbox) {
      setInboxFolderId(null);
      useUi.getState().toast({ title: t('folders.inbox_cleared_toast'), tone: 'default' });
    }
    else {
      setInboxFolderId(node.id);
      useUi.getState().toast({ title: t('folders.inbox_set_toast', { value0: node.name }), tone: 'success' });
    }
  };
}

function moveFolderEarlier(node: FolderNode, siblings: FolderNode[], index: number, onMove: FolderMenuSource['onMove']) {
  const previous = siblings[index - 1];
  if (previous)
    void onMove(node.id, node.parentId, previous.id);
}

function moveFolderLater(node: FolderNode, siblings: FolderNode[], index: number, onMove: FolderMenuSource['onMove']) {
  if (index >= siblings.length - 1)
    return;
  void onMove(node.id, node.parentId, siblings[index + 2]?.id ?? null);
}

function moveFolderOut(node: FolderNode, parentNode: FolderNode | null, parentSiblings: FolderNode[], onMove: FolderMenuSource['onMove']) {
  if (!parentNode)
    return;
  const parentIndex = parentSiblings.findIndex((folder) => folder.id === parentNode.id);
  if (parentIndex < 0)
    return;
  void onMove(node.id, parentNode.parentId, parentSiblings[parentIndex + 1]?.id ?? null);
}

async function exportFolderZip(folderId: string) {
  try {
    const res = await exportFolderAsZip(folderId);
    if (res.count === 0) {
      useUi.getState().toast({ title: t('folders.export_zip_empty'), tone: 'default' });
    }
    else {
      useUi.getState().toast({ title: t('folders.export_zip_success', { value0: res.count }), tone: 'success' });
    }
  }
  catch (err) {
    useUi.getState().toast({ title: t('common.export_failed'), description: errorMessage(err), tone: 'danger' });
  }
}

function commitRename(value: string, node: FolderNode, patchFolder: (id: string, patch: { name: string }) => boolean, renamingRef: { current: boolean }, onFinishRename: () => void) {
  const trimmed = value.trim();
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
}

async function removeFolder(node: FolderNode, directNoteCount: number, hasChildren: boolean, deleteFolder: (id: string) => boolean, removingRef: { current: boolean }) {
  if (removingRef.current)
    return;
  removingRef.current = true;
  try {
    const hasContent = directNoteCount > 0 || hasChildren;
    const ok = await confirm({
      title: t('sidebar.delete_folder_value0', { value0: node.name }),
      description: hasContent ? t('folders.delete_contents_move_up', { value0: directNoteCount, value1: node.children.length }) : t('sidebar.this_folder_is_empty'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok)
      return;
    deleteFolder(node.id);
  }
  finally {
    removingRef.current = false;
  }
}

function handleFolderDragOver(event: React.DragEvent<HTMLDivElement>, setDropState: (state: DropState) => void) {
  const types = event.dataTransfer.types;
  if (!types.includes(NOTE_DRAG_TYPE) && !types.includes(NOTES_DRAG_TYPE) && !types.includes(FOLDER_DRAG_TYPE))
    return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'move';
  if (types.includes(NOTE_DRAG_TYPE) || types.includes(NOTES_DRAG_TYPE)) {
    setDropState('inside');
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
  setDropState(dropPlacement(ratio));
}

function handleFolderDrop(event: React.DragEvent<HTMLDivElement>, deps: {
  node: FolderNode;
  siblings: FolderNode[];
  index: number;
  dropState: DropState;
  setDropState: (state: DropState) => void;
  onMove: FolderMenuSource['onMove'];
}) {
  event.preventDefault();
  event.stopPropagation();
  deps.setDropState('none');
  const noteIds = readDraggedNoteIds(event);
  if (noteIds.length > 0) {
    void useNotes.getState().moveNotes(noteIds, deps.node.id);
    useUi.getState().toast({ title: t('notes.move_to_value0', { value0: deps.node.name }), tone: 'success' });
    return;
  }
  const folderId = event.dataTransfer.getData(FOLDER_DRAG_TYPE);
  if (!folderId || folderId === deps.node.id)
    return;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
  const placement = deps.dropState === 'none' ? dropPlacement(ratio) : deps.dropState;
  if (placement === 'before') {
    void deps.onMove(folderId, deps.node.parentId, deps.node.id);
    return;
  }
  if (placement === 'after') {
    void deps.onMove(folderId, deps.node.parentId, deps.siblings[deps.index + 1]?.id ?? null);
    return;
  }
  void deps.onMove(folderId, deps.node.id, null);
}

function dropPlacement(ratio: number): DropState {
  return ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside';
}
