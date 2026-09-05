import { useRef, useState } from 'react';
import { Globe, LogOut, Moon, Settings, Sun, Waypoints } from 'lucide-react';
import { Avatar, IconButton } from '../../../components/primitives';
import { Menu, Tooltip, type MenuItem } from '../../../components/overlay';
import { switchThemeWithTransition, useUi } from '../../../store/ui';
import { useSession } from '../../../store/session';
import { useUpdate } from '../../../store/update';
import { t } from '../../../lib/i18n';

export function SidebarAccount({ rail = false }: {
    rail?: boolean;
}) {
    const user = useSession((s) => s.user);
    const theme = useSession((s) => s.settings.appearance.theme);
    const updateSettings = useSession((s) => s.updateSettings);
    const logout = useSession((s) => s.logout);
    const openPanel = useUi((s) => s.openPanel);
    const updateAvailable = useUpdate((s) => s.available);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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
          <button ref={buttonRef} type="button" onClick={() => setIsMenuOpen(true)} aria-label={t("sidebar.account_and_settings")} className="rounded-full transition-transform duration-[var(--dur-fast)] hover:scale-105 active:scale-95">
            <Avatar src={user.avatarUrl} name={displayName} size={28}/>
          </button>
        </Tooltip>) : (<div className="group flex h-11 w-full items-center rounded-[var(--r-md)] transition-colors hover:bg-[var(--bg-hover)]">
          <button ref={buttonRef} type="button" onClick={() => setIsMenuOpen(true)} aria-label={t("sidebar.account_and_settings")} className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-l-[var(--r-md)] pl-2 text-left">
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
          <Tooltip label={t("blog.blog_hub")} side="top">
            <IconButton label={t("blog.blog_hub")} size="sm" onClick={() => openPanel('blog-hub')} className="mr-0.5 shrink-0 text-[var(--text-quaternary)] hover:text-[var(--accent)]">
              <Globe size={14}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t("common.settings")} side="top">
            <IconButton label={t("common.settings")} size="sm" onClick={() => openPanel('settings')} className="mr-1 shrink-0 text-[var(--text-quaternary)] group-hover:text-[var(--text-tertiary)]">
              <SettingsIcon size={14} showDot={user.role === 'owner' && updateAvailable}/>
            </IconButton>
          </Tooltip>
        </div>)}

      <Menu anchor={buttonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={items} width={252}/>
    </>);
}

export function SettingsIcon({ size, showDot }: {
    size: number;
    showDot: boolean;
}) {
    return (<span className="relative inline-flex">
      <Settings size={size}/>
      {showDot && (<span data-update-dot aria-hidden="true" className="absolute -top-1 -right-1 size-2 rounded-full border border-[var(--bg-sunken)] bg-[var(--danger)]"/>)}
    </span>);
}

