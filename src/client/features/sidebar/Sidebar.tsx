import { useEffect, useMemo } from 'react';
import {
  Archive,
  Clock,
  FileText,
  Globe,
  Inbox,
  PanelLeftClose,
  Pin,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { IconButton, Logo } from '../../components/primitives';
import { Tooltip } from '../../components/overlay';
import { useUi } from '../../store/ui';
import { useNavigationCounts } from '../../store/notes/selectors';
import { useNotes } from '../../store/notes';
import { SidebarCalendar } from './SidebarCalendar';
import { t } from '../../lib/i18n';
import { useShareStore } from '../share/share-store';
import { useBlogStore } from '../blog/blog-store';
import { BottomNavButton } from './sidebar/SidebarNavButtons';
import { FolderSection } from './sidebar/SidebarFolders';
import { SidebarAccount } from './sidebar/SidebarAccount';
import { SidebarRail } from './sidebar/SidebarRail';
import { TagSection } from './sidebar/SidebarTags';
import { ViewItem } from './sidebar/SidebarNavButtons';

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
    const blogPosts = useBlogStore((s) => s.posts);
    const publishedCount = useMemo(() => {
      const count = blogPosts.filter((p) => p.isPublished).length;
      return count > 0 ? count : undefined;
    }, [blogPosts]);

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
            <div className="grid grid-cols-4 gap-1">
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
              <BottomNavButton
                icon={<Globe size={13.5} className="shrink-0 text-[var(--accent)]" />}
                label={t("navigation.published")}
                count={publishedCount}
                active={view === 'published' && !panel}
                onClick={() => {
                  if (panel) closePanel();
                  openView('published');
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



