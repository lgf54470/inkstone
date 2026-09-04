import {
  FilePlus2,
  FileText,
  Globe,
  PanelLeft,
  Pin,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { IconButton } from '../../components/primitives';
import { Tooltip } from '../../components/overlay';
import { useUi } from '../../store/ui';
import { createContextualNote } from '../../store/notes/selectors';
import { t } from '../../lib/i18n';
import { SidebarAccount } from './SidebarAccount';

export function SidebarRail({ onExpand }: {
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
        <RailButton label={t("navigation.published")} active={(view === 'published' || panel === 'blog-hub')} icon={<Globe size={16}/>} onClick={() => openView('published')}/>
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

export function RailButton({ label, combo, icon, active, accent, onClick, }: {
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

