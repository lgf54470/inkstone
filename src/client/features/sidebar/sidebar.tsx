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
import type { ViewKind } from '@shared/types';
import { IconButton, Logo } from '../../components/primitives';
import { Tooltip } from '../../components/overlay';
import { useUi, type PanelName } from '../../store/ui';
import { type NavigationCounts, useNavigationCounts } from '../../store/notes';
import { useNotes } from '../../store/notes';
import { SidebarCalendar } from './sidebar-calendar';
import { t } from '../../lib/i18n';
import { useBlogStore } from '../blog';
import { useShareStore } from '../share';
import { BottomNavButton } from './sidebar/sidebar-nav-buttons';
import { FolderSection } from './sidebar/sidebar-folders';
import { SidebarAccount } from './sidebar/sidebar-account';
import { SidebarRail } from './sidebar/sidebar-rail';
import { TagSection } from './sidebar/sidebar-tags';
import { ViewItem } from './sidebar/sidebar-nav-buttons';

const TRACKING_APP_TITLE = 'tracking-[var(--tracking-app-title)]'

export function Sidebar({ collapsed = false, onCollapse, }: {
    collapsed?: boolean;
    onCollapse?: () => void;
}) {
    const view = useUi((s) => s.view);
    const panel = useUi((s) => s.panel);
    const openView = useUi((s) => s.openView);
    const closePanel = useUi((s) => s.closePanel);
    const counts = useNavigationCounts();

    useEffect(() => {
      void useShareStore.getState().loadShares();
      void useBlogStore.getState().loadPosts();
    }, []);

    const goTo = (next: ViewKind) => {
      if (panel) closePanel();
      openView(next);
    };

    return (<>
        {collapsed ? <SidebarRail onExpand={onCollapse}/> : (<aside className='flex h-full min-h-0 flex-col bg-[var(--bg-sunken)]'>
      <SidebarHeader onCollapse={onCollapse}/>

      <div className='min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-4'>
        <SidebarCalendar />
        <div className='space-y-px'>
          <div className='pt-2 pb-1'>
            <QuickNavGrid view={view} panel={panel} counts={counts} onGo={goTo}/>
          </div>
          <ViewItem icon={<FileText size={14}/>} label={t('navigation.all_notes')} view='all' count={counts.all} active={view === 'all' && !panel} onSelect={openView}/>
          <ViewItem icon={<Clock size={14}/>} label={t('navigation.recently_edited')} view='recent' active={view === 'recent' && !panel} onSelect={openView}/>
          <ViewItem icon={<Inbox size={14}/>} label={t('navigation.unfiled')} view='unfiled' count={counts.unfiled} active={view === 'unfiled' && !panel} onSelect={openView}/>
        </div>

        <FolderSection />
        <TagSection />
      </div>

      <div className='shrink-0 border-t border-[var(--border-subtle)] px-2 pt-2.5 pb-2'>
        <div className='grid grid-cols-2 gap-1'>
          <ArchiveNavGrid view={view} panel={panel} counts={counts} onGo={goTo}/>
        </div>
      </div>

      <div className='shrink-0 border-t border-[var(--border-subtle)] p-2'>
        <SidebarAccount />
      </div>
        </aside>)}
    </>);
}

function SidebarHeader({ onCollapse }: {
    onCollapse?: () => void;
}) {
    return (<header className='flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3'>
      <div className='flex min-w-0 items-center gap-2.25 select-none'>
        <Logo size={24}/>
        <span className={`min-w-0 truncate font-serif text-[length:var(--text-15\.5)] font-semibold ${TRACKING_APP_TITLE} text-[var(--text-primary)]`}>
          {t('common.product_name')}
        </span>
      </div>
      {onCollapse && (<Tooltip label={t('sidebar.collapse_navigation')}>
          <IconButton label={t('sidebar.collapse_navigation')} size='sm' onClick={onCollapse}>
            <PanelLeftClose size={15}/>
          </IconButton>
        </Tooltip>)}
    </header>);
}

function QuickNavGrid({ view, panel, counts, onGo }: {
    view: ViewKind;
    panel: PanelName | null;
    counts: NavigationCounts;
    onGo: (view: ViewKind) => void;
}) {
    const patchNote = useNotes((s) => s.patchNote);
    const globalStats = useShareStore((s) => s.globalStats);
    const shares = useShareStore((s) => s.shares);
    const shareCount = globalStats?.totalShares ?? (shares.length > 0 ? shares.length : undefined);
    const blogPosts = useBlogStore((s) => s.posts);
    const publishedCount = useMemo(() => {
      const count = blogPosts.filter((p) => p.isPublished).length;
      return count > 0 ? count : undefined;
    }, [blogPosts]);
    const pinDrop = (ids: string[]) => ids.forEach((id) => void patchNote(id, { isPinned: true }));
    const starDrop = (ids: string[]) => ids.forEach((id) => void patchNote(id, { isStarred: true }));
    return (<div className='grid grid-cols-4 gap-1'>
      <BottomNavButton icon={<Pin size={13.5} className='shrink-0'/>} label={t('navigation.pinned')} count={counts.pinned} active={view === 'pinned' && !panel} onClick={() => onGo('pinned')} acceptsDrop onDropNotes={pinDrop}/>
      <BottomNavButton icon={<Star size={13.5} className='shrink-0'/>} label={t('navigation.favorites')} count={counts.starred} active={view === 'starred' && !panel} onClick={() => onGo('starred')} acceptsDrop onDropNotes={starDrop}/>
      <BottomNavButton icon={<Share2 size={13.5} className='shrink-0 text-[var(--accent)]'/>} label={t('navigation.share')} count={shareCount} active={view === 'shared' && !panel} onClick={() => onGo('shared')}/>
      <BottomNavButton icon={<Globe size={13.5} className='shrink-0 text-[var(--accent)]'/>} label={t('navigation.published')} count={publishedCount} active={view === 'published' && !panel} onClick={() => onGo('published')}/>
    </div>);
}

function ArchiveNavGrid({ view, panel, counts, onGo }: {
    view: ViewKind;
    panel: PanelName | null;
    counts: NavigationCounts;
    onGo: (view: ViewKind) => void;
}) {
    const patchNote = useNotes((s) => s.patchNote);
    const deleteNote = useNotes((s) => s.deleteNote);
    const archiveDrop = (ids: string[]) => ids.forEach((id) => void patchNote(id, { isArchived: true }));
    const trashDrop = (ids: string[]) => ids.forEach((id) => void deleteNote(id));
    return (<>
      <BottomNavButton icon={<Archive size={13.5} className='shrink-0'/>} label={t('navigation.archive')} count={counts.archived} active={view === 'archived' && !panel} onClick={() => onGo('archived')} acceptsDrop onDropNotes={archiveDrop}/>
      <BottomNavButton icon={<Trash2 size={13.5} className='shrink-0'/>} label={t('navigation.trash')} count={counts.trash} active={view === 'trash' && !panel} onClick={() => onGo('trash')} acceptsDrop onDropNotes={trashDrop}/>
    </>);
}
