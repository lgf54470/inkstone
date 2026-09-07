import { lazy, Suspense, useEffect, useRef } from 'react';
import { Eye, FileText, ListTree, PencilLine } from 'lucide-react';
import type { Hotkey } from '../../lib/hotkeys';
import { cn } from '../../lib/cn';
import { registerAll } from '../../lib/hotkeys';
import { useBreakpoint } from '../../lib/hooks';
import { useSyncEngine } from '../../lib/sync';
import { Drawer } from '../../components/overlay';
import { InlineErrorBoundary } from '../../components/error-boundary';
import { EditorSkeleton } from '../../components/feedback';
import { PANEL_WIDTHS, useUi } from '../../store/ui';
import { createContextualNote } from '../../store/notes';
import { useNotes } from '../../store/notes';
import { getActiveEditorView, insertNoteTemplate } from '../../editor/commands';
import { useSession } from '../../store/session';
import { useUpdate } from '../../store/update';
import { NoteList, useGapIndicator, useRollingDateFilter } from '../list';
import { Sidebar } from '../sidebar';
import { FloatingSearch } from './floating-search';
import { Resizer, SplitResizer } from './resizer';
import { PinnedWindowsLayer } from '../preview';
import { t } from '../../lib/i18n';
const Workspace = lazy(() => import('../workspace').then((m) => ({ default: m.Workspace })));
const CommandPalette = lazy(() => import('../command').then((m) => ({ default: m.CommandPalette })));
const SettingsPanel = lazy(() => import('../settings').then((m) => ({ default: m.SettingsPanel })));
const ShortcutsPanel = lazy(() => import('../command').then((m) => ({ default: m.ShortcutsPanel })));
const GraphPanel = lazy(() => import('../graph').then((m) => ({ default: m.GraphPanel })));
const ShareHubModal = lazy(() => import('../share').then((m) => ({ default: m.ShareHubModal })));
const ShareEditModal = lazy(() => import('../share').then((m) => ({ default: m.ShareEditModal })));
const BlogHubModal = lazy(() => import('../blog').then((m) => ({ default: m.BlogHubModal })));
const BlogPublishModal = lazy(() => import('../blog').then((m) => ({ default: m.BlogPublishModal })));
const VersionsPanel = lazy(() => import('../workspace').then((m) => ({ default: m.VersionsPanel })));
const TemplateGallery = lazy(() => import('../templates').then((m) => ({ default: m.TemplateGallery })));
const ManageFoldersModal = lazy(() => import('../folders').then((m) => ({ default: m.ManageFoldersModal })));
const ManageTagsModal = lazy(() => import('../tags').then((m) => ({ default: m.ManageTagsModal })));
const Lightbox = lazy(() => import('../preview').then((m) => ({ default: m.Lightbox })));
const UpdateDialog = lazy(() => import('../update').then((m) => ({ default: m.UpdateDialog })));

const uiState = () => useUi.getState();
const notesState = () => useNotes.getState();

export function AppShell() {
    useGlobalHotkeys();
    useSyncEngine();
    useRollingDateFilter();
    useGapIndicator();
    useShellBootstrap();
    const isMobile = useBreakpoint() === 'mobile';
    if (isMobile)
        return <MobileShell />;
    return <DesktopShell />;
}

function useShellBootstrap(): void {
    const hydrated = useNotes((s) => s.hydrated);
    const openNote = useNotes((s) => s.openNote);
    const role = useSession((s) => s.user?.role);
    const checkForUpdates = useUpdate((s) => s.check);
    const deepLinkHandled = useRef(false);
    useEffect(() => {
        if (!hydrated || deepLinkHandled.current)
            return;
        deepLinkHandled.current = true;
        const match = /^\/n\/([0-9a-hjkmnp-tv-z]{26})\/?$/.exec(location.pathname);
        if (!match)
            return;
        useUi.getState().openView('all');
        void openNote(match[1]!);
    }, [hydrated, openNote]);
    useEffect(() => {
        if (role === 'owner')
            void checkForUpdates();
    }, [role, checkForUpdates]);
    useEffect(() => {
        const ui = useUi.getState();
        useUi.setState({
            outlineOpen: ui.workspaceSecondaryNoteId
                ? false
                : useSession.getState().settings.preview.showToc,
        });
    }, []);
}

function DesktopShell() {
    const navDrawerOpen = useUi((s) => s.navDrawerOpen);
    const listCollapsed = useUi((s) => s.listCollapsed);
    const toggleNavDrawer = useUi((s) => s.toggleNavDrawer);
    const isTablet = useBreakpoint() === 'tablet';
    const showNav = !isTablet;
    const navAsDrawer = isTablet && navDrawerOpen;
    const showList = !listCollapsed;
    return (<div className="relative flex h-full min-h-0 overflow-hidden bg-[var(--bg-base)]">
      <div className="flex min-w-0 flex-1">
        {showNav && <NavRail />}
        {showList && <ListRail />}
        <WorkspaceArea desktop={!isTablet} />
      </div>

      <FloatingSearch />

      {navAsDrawer && (<Drawer open onClose={() => toggleNavDrawer(false)} side="left" width={272} title={t("common.navigation")}>
          <Sidebar onCollapse={() => toggleNavDrawer(false)}/>
        </Drawer>)}

      <OverlayHost />
      <PinnedWindowsLayer />
    </div>);
}

function NavRail() {
    const width = useUi((s) => s.navWidth);
    const collapsed = useUi((s) => s.navCollapsed);
    const toggle = useUi((s) => s.toggleNav);
    const setLayout = useUi((s) => s.setLayout);
    return (<>
      <div style={{ width: collapsed ? 48 : width }} className="shrink-0 overflow-hidden transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]">
        <Sidebar collapsed={collapsed} onCollapse={toggle}/>
      </div>
      {!collapsed && (<Resizer label={t("shell.resize_navigation_panel")} value={width} min={PANEL_WIDTHS.navigation.min} max={PANEL_WIDTHS.navigation.max} onChange={(navWidth) => setLayout({ navWidth })} onReset={() => setLayout({ navWidth: PANEL_WIDTHS.navigation.min })}/>)}
    </>);
}

function ListRail() {
    const width = useUi((s) => s.listWidth);
    const setLayout = useUi((s) => s.setLayout);
    return (<>
      <div style={{ width }} className="anim-view-content shrink-0 overflow-hidden">
        <NoteList />
      </div>
      <Resizer label={t("shell.resize_note_list")} value={width} min={PANEL_WIDTHS.noteList.min} max={PANEL_WIDTHS.noteList.max} onChange={(listWidth) => setLayout({ listWidth })} onReset={() => setLayout({ listWidth: PANEL_WIDTHS.noteList.min })}/>
    </>);
}

function WorkspaceArea({ desktop }: { desktop: boolean }) {
    const workspaceGroupsRef = useRef<HTMLElement | null>(null);
    const secondaryId = useUi((s) => s.workspaceSecondaryNoteId);
    const ratio = useUi((s) => s.workspaceSplitRatio) ?? 0.5;
    const setLayout = useUi((s) => s.setLayout);
    const split = desktop && Boolean(secondaryId);
    return (<main ref={workspaceGroupsRef} className="flex min-w-0 flex-1">
      <Suspense fallback={<WorkspaceFallback />}>
        {split ? (<SplitWorkspace containerRef={workspaceGroupsRef} ratio={ratio} onRatio={(workspaceSplitRatio) => setLayout({ workspaceSplitRatio })} onReset={() => setLayout({ workspaceSplitRatio: null })}/>)
          : (<div className="min-w-0 flex-1">
              <InlineErrorBoundary><Workspace /></InlineErrorBoundary>
            </div>)}
      </Suspense>
    </main>);
}

function SplitWorkspace({ containerRef, ratio, onRatio, onReset }: {
    containerRef: React.RefObject<HTMLElement | null>;
    ratio: number;
    onRatio: (ratio: number) => void;
    onReset: () => void;
}) {
    return (<>
      <div className="min-w-0" style={{ width: `${ratio * 100}%` }}>
        <InlineErrorBoundary><Workspace pane="primary" grouped/></InlineErrorBoundary>
      </div>
      <SplitResizer label={t("shell.resize_note_panes")} containerRef={containerRef} ratio={ratio} onChange={onRatio} onReset={onReset}/>
      <div className="anim-view-content min-w-0 flex-1">
        <InlineErrorBoundary><Workspace pane="secondary" grouped/></InlineErrorBoundary>
      </div>
    </>);
}

function MobileShell() {
    const pane = useUi((s) => s.mobilePane);
    const setPane = useUi((s) => s.setMobilePane);
    const activeNoteId = useUi((s) => s.activeNoteId);
    const notePane = pane === 'editor' || pane === 'preview';
    useEffect(() => {
        if (!activeNoteId && notePane)
            setPane('list');
    }, [activeNoteId, notePane, setPane]);
    const tabs = [
        { id: 'nav' as const, icon: <ListTree size={19}/>, label: t("common.navigation") },
        { id: 'list' as const, icon: <FileText size={19}/>, label: t("common.note") },
        ...(activeNoteId ? [
            { id: 'editor' as const, icon: <PencilLine size={19}/>, label: t("common.edit") },
            { id: 'preview' as const, icon: <Eye size={19}/>, label: t("common.preview") },
        ] : []),
    ];
    return (<div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--bg-base)] pt-[env(safe-area-inset-top)]">
      <div className="relative min-h-0 flex-1">
        <div aria-hidden={pane !== 'nav'} inert={pane !== 'nav'} data-active={pane === 'nav' || undefined} className="mobile-pane-layer absolute inset-0">
          <Sidebar onCollapse={() => setPane('list')}/>
        </div>
        <div aria-hidden={pane !== 'list'} inert={pane !== 'list'} data-active={pane === 'list' || undefined} className="mobile-pane-layer absolute inset-0">
          <NoteList />
        </div>
        <div aria-hidden={!notePane} inert={!notePane} data-active={notePane || undefined} data-from="right" className="mobile-pane-layer absolute inset-0">
          {notePane && activeNoteId && (<Suspense fallback={<WorkspaceFallback />}><Workspace mobileLayout={pane === 'preview' ? 'preview' : 'edit'} onMobileBack={() => setPane('list')}/></Suspense>) }
        </div>
      </div>

      <FloatingSearch compact/>

      <PinnedWindowsLayer />
      <nav aria-label={t("shell.mobile_navigation")} className="flex h-[calc(56px+env(safe-area-inset-bottom))] shrink-0 items-stretch justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)] pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => (<button key={tab.id} type="button" aria-current={pane === tab.id ? 'page' : undefined} onClick={() => setPane(tab.id)} className={cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[length:var(--text-10)] transition-colors active:bg-[var(--bg-active)]', pane === tab.id ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')}>
            <span className={cn('mobile-tab-icon', pane === tab.id && 'is-active')}>{tab.icon}</span>
            {tab.label}
          </button>))}
      </nav>

      <OverlayHost />
    </div>);
}

function WorkspaceFallback() {
    return (
        <div
            className="h-full min-w-0 flex-1 overflow-hidden bg-[var(--bg-editor)]"
            aria-busy="true"
            aria-label={t("workspace.loading_note_content")}
        >
            <EditorSkeleton />
        </div>
    );
}

function OverlayHost() {
    const panel = useUi((s) => s.panel);
    const closePanel = useUi((s) => s.closePanel);
    const lightbox = useUi((s) => s.lightbox);
    const role = useSession((s) => s.user?.role);
    const updateDialogOpen = useUpdate((s) => s.dialogOpen);
    const activeNoteId = useUi((s) => s.activeWorkspacePane === 'secondary' ? s.workspaceSecondaryNoteId : s.workspacePrimaryNoteId);
    const activeNote = useNotes((s) => (activeNoteId ? s.notes[activeNoteId] : null));
    return (<>
      <Suspense fallback={null}>
        {panel === 'command' && <CommandPalette onClose={closePanel}/>}
        {panel === 'settings' && <SettingsPanel onClose={closePanel}/>}
        {panel === 'shortcuts' && <ShortcutsPanel onClose={closePanel}/>}
        {panel === 'graph' && <GraphPanel onClose={closePanel}/>}
        {panel === 'share' && activeNoteId && (
          <ShareEditModal
            open={true}
            onClose={closePanel}
            noteId={activeNoteId}
            noteTitle={activeNote?.title || t('common.untitled_note')}
          />
        )}
        {(panel === 'share-hub' || (panel === 'share' && !activeNoteId)) && (
          <ShareHubModal open={true} onClose={closePanel} initialNoteId={activeNoteId ?? undefined} />
        )}
        {panel === 'blog-hub' && (
          <BlogHubModal open={true} onClose={closePanel} initialNoteId={activeNoteId ?? undefined} />
        )}
        {panel === 'blog-publish' && activeNoteId && (
          <BlogPublishModal
            open={true}
            onClose={closePanel}
            noteId={activeNoteId}
          />
        )}
        {panel === 'versions' && <VersionsPanel onClose={closePanel}/>}
        {panel === 'templates' && <TemplateGallery onClose={closePanel}/>}
        {panel === 'folders' && <ManageFoldersModal onClose={closePanel}/>}
        {panel === 'tags' && <ManageTagsModal onClose={closePanel}/>}
        {lightbox && <Lightbox />}
      </Suspense>
      {role === 'owner' && updateDialogOpen && (<Suspense fallback={null}>
        <UpdateDialog />
      </Suspense>)}
    </>);
}

function useGlobalHotkeys(): void {
    useEffect(() => registerAll(GLOBAL_HOTKEYS), []);
}

const GLOBAL_HOTKEYS: Hotkey[] = [
    {
        id: 'command',
        combo: 'mod+k',
        description: () => t("common.command_palette"),
        group: () => t("shell.global"),
        allowInInput: true,
        handler: () => uiState().togglePanel('command'),
    },
    {
        id: 'quick-open',
        combo: 'mod+p',
        description: () => t("shell.quick_open"),
        group: () => t("shell.global"),
        allowInInput: true,
        handler: () => uiState().openPanel('command'),
    },
    {
        id: 'new-note',
        combo: 'mod+n',
        description: () => t("common.new_note"),
        group: () => t("shell.global"),
        allowInInput: true,
        handler: () => void createContextualNote(),
    },
    {
        id: 'new-note-from-template',
        combo: 'mod+shift+n',
        description: () => t("templates.new_note_from_template"),
        group: () => t("shell.global"),
        allowInInput: true,
        handler: () => uiState().togglePanel('templates'),
    },
    {
        id: 'search',
        combo: 'mod+shift+f',
        description: () => t("shell.search_all_notes"),
        group: () => t("shell.global"),
        allowInInput: true,
        handler: () => uiState().openPanel('command'),
    },
    {
        id: 'settings',
        combo: 'mod+,',
        description: () => t("common.open_settings"),
        group: () => t("shell.global"),
        allowInInput: true,
        handler: () => uiState().openPanel('settings'),
    },
    {
        id: 'toggle-list',
        combo: 'mod+shift+b',
        description: () => t("shell.collapse_expand_list"),
        group: () => t("common.interface"),
        allowInInput: true,
        handler: () => uiState().toggleList(),
    },
    {
        id: 'cycle-layout',
        combo: 'mod+\\',
        description: () => t("shell.cycle_editor_split_preview"),
        group: () => t("common.interface"),
        allowInInput: true,
        handler: () => {
            const order = ['edit', 'split', 'preview'] as const;
            const ui = uiState();
            if (ui.workspaceSecondaryNoteId) {
                const pane = ui.activeWorkspacePane;
                const current = order.indexOf(ui.workspacePaneLayouts[pane]);
                ui.setWorkspacePaneLayout(pane, order[(current + 1) % order.length]);
                return;
            }
            const session = useSession.getState();
            const current = order.indexOf(session.settings.preview.layout);
            void session.updateSettings({
                preview: { layout: order[(current + 1) % order.length] },
            });
        },
    },
    {
        id: 'shortcuts',
        combo: 'shift+?',
        description: () => t("shell.keyboard_shortcuts"),
        group: () => t("shell.global"),
        handler: () => uiState().togglePanel('shortcuts'),
    },
    {
        id: 'save',
        combo: 'mod+s',
        description: () => t("shell.save_now"),
        group: () => t("common.edit"),
        allowInInput: true,
        handler: () => void notesState().flush({ immediate: true }),
    },
    {
        id: 'star',
        combo: 'mod+d',
        description: () => t("shell.add_to_remove_from_favorites"),
        group: () => t("common.note"),
        handler: () => {
            const id = uiState().activeNoteId;
            const note = id ? notesState().notes[id] : null;
            if (id && note)
                void notesState().patchNote(id, { isStarred: !note.isStarred });
        },
    },
    {
        id: 'delete',
        combo: 'mod+backspace',
        description: () => t("common.move_to_trash"),
        group: () => t("common.note"),
        handler: () => {
            const id = uiState().activeNoteId;
            if (id)
                void notesState().deleteNote(id);
        },
    },
    {
        id: 'insert-template',
        combo: 'mod+shift+t',
        description: () => t("shell.insert_note_template"),
        group: () => t("common.note"),
        allowInInput: true,
        handler: () => {
            const view = getActiveEditorView();
            if (view)
                insertNoteTemplate(view);
        },
    },
    {
        id: 'outline',
        combo: 'mod+shift+o',
        description: () => t("shell.show_hide_outline"),
        group: () => t("common.interface"),
        allowInInput: true,
        handler: () => uiState().toggleOutline(),
    },
    {
        id: 'graph',
        combo: 'mod+shift+g',
        description: () => t("common.graph"),
        group: () => t("shell.global"),
        handler: () => uiState().togglePanel('graph'),
    },
];
