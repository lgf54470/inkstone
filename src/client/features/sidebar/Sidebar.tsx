import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, ChevronRight, ChevronsDownUp, ChevronsUpDown, Clock, CornerUpLeft, Download, FilePlus2, FileText, FolderClosed, FolderInput, FolderOpen, FolderPlus, Globe, Hash, Inbox, LogOut, Moon, MoreHorizontal, Palette, PanelLeft, PanelLeftClose, Pencil, Pin, Plus, Search, SearchX, Settings, Settings2, Share2, Smile, Star, Sun, Tag as TagIcon, Trash2, Waypoints, X, } from 'lucide-react';
import { LIMITS } from '@shared/constants';
import type { Tag, ViewKind } from '@shared/types';
import { cn } from '../../lib/cn';
import { sortTagsForPicker } from '../../lib/tag-sort';
import { clearTagSelection } from '../../lib/tag-selection';
import { TagNameHighlight } from '../../components/tag-name-highlight';
import { Avatar, IconButton, Logo, SectionLabel } from '../../components/primitives';
import { Menu, Tooltip, confirm, useContextMenu, type MenuItem } from '../../components/overlay';
import { switchThemeWithTransition, useUi } from '../../store/ui';
import { useSession } from '../../store/session';
import { useUpdate } from '../../store/update';
import { createContextualNote, selectNavigationProjection, useFolderTree, useNavigationCounts, type FolderNode } from '../../store/notes/selectors';
import { useNotes } from '../../store/notes';
import { folderDescendantIds, folderPath, folderPathLabel, openFolderView } from '../../lib/folders';
import { treeRowIndent } from '../../lib/calendar-tree';
import { setInboxFolderId, useFolderPreferences } from '../../lib/folder-prefs';
import { exportFolderAsZip } from '../../lib/export-folder';
import { FolderPicker } from '../folders/FolderPicker';
import { FolderColorSubmenu } from '../folders/FolderColorSubmenu';
import { FolderIconSubmenu } from '../folders/FolderIconSubmenu';
import { TagColorSubmenu } from '../tags/TagColorSubmenu';
import { createTag, deleteTag, renameTag, setTagColor, toggleTagPinned } from '../tags/tagMutations';
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../lib/tag-tree';
import { SidebarCalendar } from './SidebarCalendar';
import { CalendarTree, TodoTree } from './CalendarTree';
import { t } from "../../lib/i18n";
import { useShareStore } from '../share/share-store';
import { useBlogStore } from '../blog/blog-store';
export function Sidebar({ collapsed = false, onCollapse, }: {
    collapsed?: boolean;
    onCollapse?: () => void;
}) {
    const view = useUi((s) => s.view);
    const panel = useUi((s) => s.panel);
    const openView = useUi((s) => s.openView);
    const closePanel = useUi((s) => s.closePanel);
    const counts = useNavigationCounts();
    const patchNote = useNotes((s) => s.patchNote);
    const deleteNote = useNotes((s) => s.deleteNote);
    const globalStats = useShareStore((s) => s.globalStats);
    const shares = useShareStore((s) => s.shares);

    useEffect(() => {
      void useShareStore.getState().loadShares();
      void useBlogStore.getState().loadPosts();
    }, []);

    const shareCount = globalStats?.totalShares ?? (shares.length > 0 ? shares.length : undefined);

    return (<>
        {collapsed ? <SidebarRail onExpand={onCollapse}/> : (<aside className="flex h-full min-h-0 flex-col bg-[var(--bg-sunken)]">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div className="flex min-w-0 items-center gap-[9px] select-none">
          <Logo size={24}/>
          <span className="min-w-0 truncate font-serif text-[15.5px] font-semibold tracking-[0.02em] text-[var(--text-primary)]">
            {t("common.product_name")}
          </span>
        </div>
        {onCollapse && (<Tooltip label={t("sidebar.collapse_navigation")}>
            <IconButton label={t("sidebar.collapse_navigation")} size="sm" onClick={onCollapse}>
              <PanelLeftClose size={15}/>
            </IconButton>
          </Tooltip>)}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-4">
        <SidebarCalendar />
        <div className="space-y-px">
          <div className="pt-2 pb-1">
            <div className="grid grid-cols-3 gap-1">
              <BottomNavButton
                icon={<Pin size={13.5} className="shrink-0" />}
                label={t("navigation.pinned")}
                count={counts.pinned}
                active={view === 'pinned' && !panel}
                onClick={() => {
                  if (panel) closePanel();
                  openView('pinned');
                }}
                acceptsDrop
                onDropNotes={(ids) => ids.forEach((id) => void patchNote(id, { isPinned: true }))}
              />
              <BottomNavButton
                icon={<Star size={13.5} className="shrink-0" />}
                label={t("navigation.favorites")}
                count={counts.starred}
                active={view === 'starred' && !panel}
                onClick={() => {
                  if (panel) closePanel();
                  openView('starred');
                }}
                acceptsDrop
                onDropNotes={(ids) => ids.forEach((id) => void patchNote(id, { isStarred: true }))}
              />
              <BottomNavButton
                icon={<Share2 size={13.5} className="shrink-0 text-[var(--accent)]" />}
                label={t("navigation.share")}
                count={shareCount}
                active={view === 'shared' && !panel}
                onClick={() => {
                  if (panel) closePanel();
                  openView('shared');
                }}
              />
            </div>
          </div>

          <ViewItem icon={<FileText size={14}/>} label={t("navigation.all_notes")} view="all" count={counts.all} active={view === 'all' && !panel} onSelect={openView}/>
          <ViewItem icon={<Clock size={14}/>} label={t("navigation.recently_edited")} view="recent" active={view === 'recent' && !panel} onSelect={openView}/>
          <ViewItem icon={<Inbox size={14}/>} label={t("navigation.unfiled")} view="unfiled" count={counts.unfiled} active={view === 'unfiled' && !panel} onSelect={openView}/>
        </div>

        <FolderSection />
        <TagSection />
      </div>

      <div className="shrink-0 border-t border-[var(--border-subtle)] px-2 pt-2.5 pb-2">
        <div className="grid grid-cols-2 gap-1">
          <BottomNavButton
            icon={<Archive size={13.5} className="shrink-0" />}
            label={t("navigation.archive")}
            count={counts.archived}
            active={view === 'archived' && !panel}
            onClick={() => {
              if (panel) closePanel();
              openView('archived');
            }}
            acceptsDrop
            onDropNotes={(ids) => ids.forEach((id) => void patchNote(id, { isArchived: true }))}
          />
          <BottomNavButton
            icon={<Trash2 size={13.5} className="shrink-0" />}
            label={t("navigation.trash")}
            count={counts.trash}
            active={view === 'trash' && !panel}
            onClick={() => {
              if (panel) closePanel();
              openView('trash');
            }}
            acceptsDrop
            onDropNotes={(ids) => ids.forEach((id) => void deleteNote(id))}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border-subtle)] p-2">
        <SidebarAccount />
      </div>
        </aside>)}
    </>);
}
function SidebarRail({ onExpand }: {
    onExpand?: () => void;
}) {
    const view = useUi((s) => s.view);
    const panel = useUi((s) => s.panel);
    const openView = useUi((s) => s.openView);
    return (<aside className="flex h-full min-h-0 flex-col items-center bg-[var(--bg-sunken)]">
      <div className="flex h-11 w-full shrink-0 items-center justify-center border-b border-[var(--border-subtle)]">
        <Tooltip label={t("sidebar.expand_navigation")} side="right">
          <IconButton label={t("sidebar.expand_navigation")} onClick={onExpand}>
            <PanelLeft size={16}/>
          </IconButton>
        </Tooltip>
      </div>

      <div className="flex w-full flex-col items-center gap-1 py-2">
        <RailButton label={t("navigation.pinned")} active={view === 'pinned' && !panel} icon={<Pin size={16}/>} onClick={() => openView('pinned')}/>
        <RailButton label={t("navigation.favorites")} active={view === 'starred' && !panel} icon={<Star size={16}/>} onClick={() => openView('starred')}/>
        <RailButton label={t("navigation.share")} active={(view === 'shared' || panel === 'share-hub')} icon={<Share2 size={16}/>} onClick={() => openView('shared')}/>
        <div className="my-1 h-px w-6 bg-[var(--border-subtle)]"/>
        <RailButton label={t("navigation.all_notes")} active={view === 'all' && !panel} icon={<FileText size={16}/>} onClick={() => openView('all')}/>
        <RailButton label={t("navigation.trash")} active={view === 'trash' && !panel} icon={<Trash2 size={16}/>} onClick={() => openView('trash')}/>
        <div className="my-1 h-px w-6 bg-[var(--border-subtle)]"/>
        <RailButton label={t("common.new_note")} combo="mod+n" accent icon={<FilePlus2 size={16}/>} onClick={() => void createContextualNote()}/>
      </div>

      <span className="flex-1"/>

      <div className="flex w-full shrink-0 justify-center border-t border-[var(--border-subtle)] py-2">
        <SidebarAccount rail/>
      </div>
    </aside>);
}
function RailButton({ label, combo, icon, active, accent, onClick, }: {
    label: string;
    combo?: string;
    icon: React.ReactNode;
    active?: boolean;
    accent?: boolean;
    onClick: () => void;
}) {
    return (<Tooltip label={label} combo={combo} side="right">
      <IconButton label={label} active={active} onClick={onClick} className={accent ? 'text-[var(--accent)]' : undefined}>
        {icon}
      </IconButton>
    </Tooltip>);
}
function SidebarAccount({ rail = false }: {
    rail?: boolean;
}) {
    const user = useSession((s) => s.user);
    const theme = useSession((s) => s.settings.appearance.theme);
    const updateSettings = useSession((s) => s.updateSettings);
    const logout = useSession((s) => s.logout);
    const openPanel = useUi((s) => s.openPanel);
    const updateAvailable = useUpdate((s) => s.available);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    if (!user)
        return null;
    const isDark = theme === 'dark' ||
        (theme === 'system' && document.documentElement.dataset.theme === 'dark');
    const displayName = user.name || user.username;
    const items: MenuItem[] = [
        {
            id: 'settings',
            label: t("common.settings"),
            icon: <SettingsIcon size={13} showDot={user.role === 'owner' && updateAvailable}/>,
            combo: 'mod+,',
            onSelect: () => openPanel('settings'),
        },
        {
            id: 'blog-hub',
            label: t("blog.blog_hub"),
            icon: <Globe size={13}/>,
            onSelect: () => openPanel('blog-hub'),
        },
        {
            id: 'graph',
            label: t("common.graph"),
            icon: <Waypoints size={13}/>,
            combo: 'mod+shift+g',
            onSelect: () => openPanel('graph'),
        },
        {
            id: 'theme',
            label: isDark ? t("sidebar.switch_to_light") : t("sidebar.switch_to_dark"),
            icon: isDark ? <Sun size={13}/> : <Moon size={13}/>,
            separatorBefore: true,
            onSelect: () => {
                const rect = buttonRef.current?.getBoundingClientRect();
                const next = isDark ? 'light' : 'dark';
                switchThemeWithTransition(next, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined, () => updateSettings({ appearance: { theme: next } }));
            },
        },
        {
            id: 'logout',
            label: t("sidebar.log_out"),
            icon: <LogOut size={13}/>,
            tone: 'danger',
            separatorBefore: true,
            onSelect: () => void logout(),
        },
    ];
    return (<>
      {rail ? (<Tooltip label={`${t("sidebar.account_and_settings")} · ${displayName}`} side="right">
          <button ref={buttonRef} type="button" onClick={() => setMenuOpen(true)} aria-label={t("sidebar.account_and_settings")} className="rounded-full transition-transform duration-[var(--dur-fast)] hover:scale-105 active:scale-95">
            <Avatar src={user.avatarUrl} name={displayName} size={28}/>
          </button>
        </Tooltip>) : (<div className="group flex h-11 w-full items-center rounded-[var(--r-md)] transition-colors hover:bg-[var(--bg-hover)]">
          <button ref={buttonRef} type="button" onClick={() => setMenuOpen(true)} aria-label={t("sidebar.account_and_settings")} className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-l-[var(--r-md)] pl-2 text-left">
            <Avatar src={user.avatarUrl} name={displayName} size={28}/>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                {displayName}
              </span>
              <span className="block truncate text-[10.5px] text-[var(--text-quaternary)]">
                @{user.username}
              </span>
            </span>
          </button>
          <Tooltip label={t("common.settings")} side="top">
            <IconButton label={t("common.settings")} size="sm" onClick={() => openPanel('settings')} className="mr-1 shrink-0 text-[var(--text-quaternary)] group-hover:text-[var(--text-tertiary)]">
              <SettingsIcon size={14} showDot={user.role === 'owner' && updateAvailable}/>
            </IconButton>
          </Tooltip>
        </div>)}

      <Menu anchor={buttonRef} open={menuOpen} onClose={() => setMenuOpen(false)} items={items} width={252}/>
    </>);
}
function SettingsIcon({ size, showDot }: {
    size: number;
    showDot: boolean;
}) {
    return (<span className="relative inline-flex">
      <Settings size={size}/>
      {showDot && (<span data-update-dot aria-hidden="true" className="absolute -top-1 -right-1 size-2 rounded-full border border-[var(--bg-sunken)] bg-[var(--danger)]"/>)}
    </span>);
}

function WeChatBadge({ count }: { count?: number }) {
  if (count == null || count <= 0) return null;
  const text = count > 99 ? '99+' : String(count);
  return (
    <span
      className={cn(
        'pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 z-10',
        'flex items-center justify-center',
        'rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold',
        'text-[10px] leading-none select-none shadow-xs',
        'ring-2 ring-[var(--bg-sunken)]',
        count > 99
          ? 'h-4 min-w-[22px] px-1'
          : count > 9
            ? 'h-4 min-w-[18px] px-1'
            : 'size-4'
      )}
    >
      {text}
    </span>
  );
}

function BottomNavButton({
  icon,
  label,
  count,
  active,
  onClick,
  onDropNotes,
  acceptsDrop = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  onDropNotes?: (ids: string[]) => void;
  acceptsDrop?: boolean;
}) {
  const [dropping, setDropping] = useState(false);

  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onDragOver={(e) => {
        if (!acceptsDrop || (!e.dataTransfer.types.includes('application/x-inkstone-note') && !e.dataTransfer.types.includes('application/x-inkstone-notes'))) {
          return;
        }
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (leftDropTarget(e)) {
          setDropping(false);
        }
      }}
      onDrop={(e) => {
        if (!acceptsDrop || !onDropNotes) return;
        setDropping(false);
        e.preventDefault();
        let ids: string[] = [];
        const multi = e.dataTransfer.getData('application/x-inkstone-notes');
        if (multi) {
          try {
            const parsed = JSON.parse(multi);
            if (Array.isArray(parsed) && parsed.length > 0) ids = parsed;
          } catch {}
        }
        if (ids.length === 0) {
          const single = e.dataTransfer.getData('application/x-inkstone-note');
          if (single) ids = [single];
        }
        if (ids.length === 0) return;
        onDropNotes(ids);
      }}
      className={cn(
        'group relative flex h-8 min-w-0 items-center justify-center gap-1 rounded-[var(--r-md)] px-1 text-center',
        'transition-colors duration-[var(--dur-fast)] select-none',
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        dropping && 'ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]'
      )}
      title={label}
    >
      <WeChatBadge count={count} />
      <span className={cn('shrink-0 transition-colors', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]')}>
        {icon}
      </span>
      <span className="truncate text-[11.5px] font-medium leading-none">
        {label}
      </span>
    </button>
  );
}

function ViewItem({ icon, label, view, count, active, onSelect, }: {
    icon: React.ReactNode;
    label: string;
    view: ViewKind;
    count?: number;
    active: boolean;
    onSelect: (view: ViewKind) => void;
}) {
    const [dropping, setDropping] = useState(false);
    const patchNote = useNotes((s) => s.patchNote);
    const acceptsDrop = view === 'unfiled' || view === 'starred' || view === 'archived' || view === 'trash';
    const deleteNote = useNotes((s) => s.deleteNote);
    return (<button type="button" aria-current={active ? 'page' : undefined} onClick={() => onSelect(view)} onDragOver={(e) => {
            if (!acceptsDrop || (!e.dataTransfer.types.includes('application/x-inkstone-note') && !e.dataTransfer.types.includes('application/x-inkstone-notes')))
                return;
            e.preventDefault();
            setDropping(true);
        }} onDragLeave={(e) => {
            if (leftDropTarget(e))
                setDropping(false);
        }} onDrop={(e) => {
            setDropping(false);
            e.preventDefault();
            let ids: string[] = [];
            const multi = e.dataTransfer.getData('application/x-inkstone-notes');
            if (multi) {
                try {
                    const parsed = JSON.parse(multi);
                    if (Array.isArray(parsed) && parsed.length > 0) ids = parsed;
                } catch {}
            }
            if (ids.length === 0) {
                const single = e.dataTransfer.getData('application/x-inkstone-note');
                if (single) ids = [single];
            }
            if (ids.length === 0) return;
            if (view === 'unfiled')
                void useNotes.getState().moveNotes(ids, null);
            else if (view === 'starred')
                ids.forEach((id) => void patchNote(id, { isStarred: true }));
            else if (view === 'archived')
                ids.forEach((id) => void patchNote(id, { isArchived: true }));
            else if (view === 'trash')
                ids.forEach((id) => void deleteNote(id));
        }} className={cn('group relative flex h-10 w-full items-center gap-2.5 rounded-[var(--r-md)] px-2 text-left md:h-[30px]', 'transition-colors duration-[var(--dur-fast)]', active
            ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]', dropping && 'ring-1 ring-[var(--accent)]')}>
      <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{label}</span>
      {count != null && count > 0 && (<span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)]">{count}</span>)}
    </button>);
}
function FolderSection() {
    const tree = useFolderTree();
    const folders = useNotes((s) => s.folders ?? []);
    const createFolder = useNotes((s) => s.createFolder);
    const patchFolder = useNotes((s) => s.patchFolder);
    const expandFolder = useUi((s) => s.expandFolder);
    const [creating, setCreating] = useState(false);
    const openPanel = useUi((s) => s.openPanel);
    const creatingRef = useRef(false);
    const createdTimerRef = useRef<number>(0);
    const [createdFolderId, setCreatedFolderId] = useState<string | null>(null);
    const movingIdsRef = useRef(new Set<string>());
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [rootDropping, setRootDropping] = useState(false);
    useEffect(() => () => window.clearTimeout(createdTimerRef.current), []);
    const create = (parentId: string | null) => {
        if (creatingRef.current)
            return;
        creatingRef.current = true;
        setCreating(true);
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
                setCreating(false);
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
      <section id="sidebar-folders" className={cn('mt-4 rounded-[var(--r-md)]', rootDropping && 'ring-1 ring-[var(--accent)]')} onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('application/x-inkstone-folder'))
                return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setRootDropping(true);
        }} onDragLeave={(event) => {
            if (leftDropTarget(event))
                setRootDropping(false);
        }} onDrop={(event) => {
            const folderId = event.dataTransfer.getData('application/x-inkstone-folder');
            if (!folderId)
                return;
            event.preventDefault();
            setRootDropping(false);
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
            <IconButton label={t("common.new_folder")} size="sm" disabled={creating} onClick={() => void create(null)} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
              <FolderPlus size={13}/>
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <CalendarTree />
      <TodoTree />

      {tree.length === 0 ? (<button type="button" disabled={creating} onClick={() => void create(null)} className="mt-0.5 flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-[12px] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-45 md:h-[30px]">
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
function FolderRow({ node, siblings, index, parentNode, parentSiblings, onCreateChild, onMove, onChooseParent, createdFolderId, renamingId, onStartRename, onFinishRename, }: {
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
    const [menuOpen, setMenuOpen] = useState(false);
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
                        description: err instanceof Error ? err.message : String(err),
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
            setMenuOpen(false);
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
            if (multiNotesRaw) {
                try {
                    const parsed = JSON.parse(multiNotesRaw);
                    if (Array.isArray(parsed) && parsed.length > 0) noteIds = parsed;
                } catch {}
            }
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
                    setMenuOpen(true);
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

      <Menu anchor={buttonRef} open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems}/>
      {menu.point && (<Menu anchor={menu.point} open onClose={menu.close} items={menuItems}/>)}
    </div>);
}
function FolderMotionIcon({ open, drawing }: {
    open: boolean;
    drawing: boolean;
}) {
    return (<span aria-hidden="true" data-open={open || undefined} data-drawing={drawing || undefined} className="folder-motion-icon">
      <FolderClosed size={14} className="folder-motion-icon__closed"/>
      <FolderOpen size={14} className="folder-motion-icon__open"/>
    </span>);
}
function TagSection() {
    const tags = useNotes((s) => s.tags);
    const view = useUi((s) => s.view);
    const activeTag = useUi((s) => s.tag);
    const openView = useUi((s) => s.openView);
    const selectedTags = useUi((s) => s.selectedTags);
    const toggleTagSelection = useUi((s) => s.toggleTagSelection);
    const selectTags = useUi((s) => s.selectTags);
    const openPanel = useUi((s) => s.openPanel);
    const counts = useNavigationCounts();
    const [expanded, setExpanded] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [creating, setCreating] = useState(false);
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
    const isListExpanded = expanded || (flattenedTree.length <= 10 && tags.length <= 10);
    const allTagsExpanded = allParentsExpanded && isListExpanded;

    const toggleAllTagsExpanded = () => {
        if (allTagsExpanded) {
            setExpandedTagPaths(new Set());
            setExpanded(false);
        } else {
            setExpandedTagPaths(new Set(parentTagPaths));
            setExpanded(true);
        }
    };
    const sortedTags = useMemo(() => sortTagsForPicker(tags, ''), [tags]);
    const searching = query.trim() !== '';
    const visibleTags = searching ? sortTagsForPicker(sortedTags, query) : [];
    const visibleNodes = searching ? [] : expanded ? flattenedTree : flattenedTree.slice(0, 10);
    const highlightedIndex = Math.min(activeIndex, Math.max(0, (searching ? visibleTags.length : visibleNodes.length) - 1));
    const finishCreate = (value: string) => {
        setCreating(false);
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
            <IconButton label={t("tags.new")} size="sm" onClick={() => setCreating(true)} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
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
            }} placeholder={t("notes.tag_filter_search")} className="h-7 w-full rounded-[var(--r-sm)] bg-[var(--bg-inset)] pr-7 pl-6 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none"/>
          {searching && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 tabular-nums text-[10.5px] text-[var(--text-quaternary)]">{visibleTags.length}</span>}
        </div>)}
      <div className="mt-0.5 space-y-px">
        {creating && <TagDraftRow onFinish={finishCreate} onCancel={() => setCreating(false)}/>}
        {!sortedTags.length && !creating && (<button type="button" onClick={() => setCreating(true)} className="flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-left text-[11.5px] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] md:h-[30px]">
            <Plus size={13}/>{t("tags.create_first")}
          </button>)}
        {!searching && (
          <button
            type="button"
            aria-current={view === 'untagged' ? 'page' : undefined}
            onClick={() => openView('untagged')}
            className={cn(
              'group flex h-10 w-full items-center justify-between rounded-[var(--r-md)] px-2 text-left text-[12px] font-medium transition-colors md:h-[28px]',
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
              <span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)]">
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

        {searching && visibleTags.length === 0 && !creating && (<div className="mt-1 flex flex-col items-center gap-1 rounded-[var(--r-md)] bg-[var(--bg-inset)] px-2 py-3 text-center">
            <SearchX size={14} className="text-[var(--text-quaternary)]"/>
            <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">{t("notes.no_matching_tags")}</span>
            <button type="button" onClick={() => {
                setQuery('');
                setActiveIndex(0);
            }} className="text-[10.5px] font-medium text-[var(--accent)] transition-colors hover:underline">{t("notes.clear_tag_search")}</button>
          </div>)}

        {!searching && flattenedTree.length > 10 && (<button type="button" onClick={() => setExpanded((v) => !v)} className="h-10 w-full rounded-[var(--r-md)] px-2 text-left text-[11.5px] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] md:h-[26px]">
            {expanded ? t("common.collapse") : t("sidebar.show_all_value0_tags", { value0: flattenedTree.length })}
          </button>)}

        {selectedTags.length > 0 && (<div className="rounded-[var(--r-md)] bg-[var(--accent-soft)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
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
            <div className="mt-0.5 text-[10.5px] text-[var(--text-tertiary)]">{t("sidebar.tags_selected_hint")}</div>
            {selectedTags.length >= LIMITS.tagSelectionMax && <div className="mt-0.5 text-[10.5px] font-medium text-[var(--danger)]">{t("tags.selection_limit", { value0: LIMITS.tagSelectionMax })}</div>}
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedTags.map((name) => (<button key={name} type="button" aria-label={t("sidebar.remove_selected_tag", { value0: name })} onClick={() => toggleTagSelection(name)} className="inline-flex h-5 max-w-full items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]">
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
function TagDraftRow({ onFinish, onCancel }: {
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
        }} className="min-w-0 flex-1 rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 py-px text-[12.5px] outline-none"/>
    </div>);
}
function TagRow({
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
    const [menuOpen, setMenuOpen] = useState(false);
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
            setMenuOpen(false);
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
        }} className="min-w-0 flex-1 rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 py-px text-[12.5px] outline-none"/>) : (<Tooltip label={t("sidebar.cmd_click_selects_multiple")} side="right">
              <button type="button" aria-current={active ? 'page' : undefined} aria-pressed={selected || undefined} onClick={onOpen} onDoubleClick={onStartRename} className="min-w-0 flex-1 truncate py-1 text-left text-[12.5px] font-medium flex items-center gap-1.5">
                <span className="truncate"><TagNameHighlight name={displayLabel} query={searchQuery}/></span>
                {tag.isPinned && <Pin size={10} className="shrink-0 fill-current text-[var(--accent)] opacity-80" />}
              </button>
            </Tooltip>)}
      {!renaming && (<>
          <span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)] transition-opacity group-hover:opacity-0">
            {noteCount > 0 ? noteCount : ''}
          </span>
          <Tooltip label={t("common.more_actions")} side="left">
            <IconButton label={t("common.more_actions")} size="sm" onClick={(event) => {
                event.stopPropagation();
                menu.close();
                setMenuOpen(true);
            }} className="absolute right-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
              <MoreHorizontal size={13}/>
            </IconButton>
          </Tooltip>
        </>)}
      <Menu anchor={rowRef} open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems}/>
      {menu.point && (<Menu anchor={menu.point} open onClose={menu.close} items={menuItems}/>)}
    </div>);
}
function leftDropTarget(event: React.DragEvent<HTMLElement>): boolean {
    const next = event.relatedTarget;
    return !(next instanceof Node) || !event.currentTarget.contains(next);
}
