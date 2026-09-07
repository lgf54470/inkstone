import { useRef, useState } from 'react';
import { Globe, LogOut, Moon, Settings, Sun, Waypoints } from 'lucide-react';
import type { PublicUser } from '@shared/types';
import { Avatar, IconButton } from '../../../components/primitives';
import { Menu, Tooltip, type MenuItem } from '../../../components/overlay';
import { switchThemeWithTransition, useUi, type PanelName } from '../../../store/ui';
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
  const showUpdateDot = user.role === 'owner' && updateAvailable;
  const toggleTheme = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    toggleThemePref(isDark, updateSettings, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
  };
  const items = buildAccountMenuItems({ isDark, showUpdateDot, openPanel, toggleTheme, logout });
  return (<>
    <AccountButton rail={rail} buttonRef={buttonRef} user={user} displayName={displayName} showUpdateDot={user.role === 'owner' && updateAvailable} onOpenMenu={() => setIsMenuOpen(true)} openPanel={openPanel}/>
    <Menu anchor={buttonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={items} width={252}/>
  </>);
}

function toggleThemePref(isDark: boolean, updateSettings: (patch: { appearance: { theme: 'light' | 'dark' } }) => void, origin?: { x: number; y: number }) {
  const next = isDark ? 'light' : 'dark';
  switchThemeWithTransition(next, origin, () => updateSettings({ appearance: { theme: next } }));
}

function buildAccountMenuItems(opts: {
  isDark: boolean;
  showUpdateDot: boolean;
  openPanel: (panel: PanelName) => void;
  toggleTheme: () => void;
  logout: () => void;
}): MenuItem[] {
  const showUpdateDot = opts.showUpdateDot;
  return [
    {
      id: 'settings',
      label: t('common.settings'),
      icon: <SettingsIcon size={13} showDot={showUpdateDot}/>,
      combo: 'mod+,',
      onSelect: () => opts.openPanel('settings'),
    },
    {
      id: 'blog-hub',
      label: t('blog.blog_hub'),
      icon: <Globe size={13}/>,
      onSelect: () => opts.openPanel('blog-hub'),
    },
    {
      id: 'graph',
      label: t('common.graph'),
      icon: <Waypoints size={13}/>,
      combo: 'mod+shift+g',
      onSelect: () => opts.openPanel('graph'),
    },
    {
      id: 'theme',
      label: opts.isDark ? t('sidebar.switch_to_light') : t('sidebar.switch_to_dark'),
      icon: opts.isDark ? <Sun size={13}/> : <Moon size={13}/>,
      separatorBefore: true,
      onSelect: opts.toggleTheme,
    },
    {
      id: 'logout',
      label: t('sidebar.log_out'),
      icon: <LogOut size={13}/>,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => void opts.logout(),
    },
  ];
}

function AccountButton({ rail, buttonRef, user, displayName, showUpdateDot, onOpenMenu, openPanel }: {
  rail: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  user: PublicUser;
  displayName: string;
  showUpdateDot: boolean;
  onOpenMenu: () => void;
  openPanel: (panel: PanelName) => void;
}) {
  const avatar = <Avatar src={user.avatarUrl} name={displayName} size={28}/>;
  if (rail) return (<Tooltip label={`${t('sidebar.account_and_settings')} · ${displayName}`} side='right'>
    <button ref={buttonRef} type='button' onClick={onOpenMenu} aria-label={t('sidebar.account_and_settings')} className='rounded-full transition-transform duration-[var(--dur-fast)] hover:scale-105 active:scale-95'>
      {avatar}
    </button>
  </Tooltip>);
  return (<div className='group flex h-11 w-full items-center rounded-[var(--r-md)] transition-colors hover:bg-[var(--bg-hover)]'>
    <button ref={buttonRef} type='button' onClick={onOpenMenu} aria-label={t('sidebar.account_and_settings')} className='flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-l-[var(--r-md)] pl-2 text-left'>
      {avatar}
      <span className='min-w-0 flex-1'>
        <span className="block truncate text-[length:var(--text-12\.5)] font-semibold text-[var(--text-primary)]">{displayName}</span>
        <span className="block truncate text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">@{user.username}</span>
      </span>
    </button>
    <Tooltip label={t("blog.blog_hub")} side='top'>
      <IconButton label={t('blog.blog_hub')} size='sm' onClick={() => openPanel('blog-hub')} className='mr-0.5 shrink-0 text-[var(--text-quaternary)] hover:text-[var(--accent)]'>
        <Globe size={14}/>
      </IconButton>
    </Tooltip>
    <Tooltip label={t("common.settings")} side='top'>
      <IconButton label={t('common.settings')} size='sm' onClick={() => openPanel('settings')} className='mr-1 shrink-0 text-[var(--text-quaternary)] group-hover:text-[var(--text-tertiary)]'>
        <SettingsIcon size={14} showDot={showUpdateDot}/>
      </IconButton>
    </Tooltip>
  </div>);
}


function SettingsIcon({ size, showDot }: {
  size: number;
  showDot: boolean;
}) {
  return (<span className='relative inline-flex'>
    <Settings size={size}/>
    {showDot && (<span data-update-dot aria-hidden='true' className='absolute -top-1 -right-1 size-2 rounded-full border border-[var(--bg-sunken)] bg-[var(--danger)]'/>)}
  </span>);
}
