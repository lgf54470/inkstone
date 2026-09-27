import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { Button } from '../../components/primitives'
import { Drawer, Modal } from '../../components/overlay'
import { Empty } from '../../components/feedback'
import { cn } from '../../lib/cn'
import { useElementWidth, useMediaQuery } from '../../lib/hooks'
import { Z_INDEX } from '../../lib/z-index'
import { t } from '../../lib/i18n'
import { formatBytes } from '../../lib/time'
import { MusicEditTrackModal } from './music-edit-track-modal'
import { MusicSourceSwitchModal } from './music-source-switch-modal'
import { findDuplicateGroups, duplicateWastedBytes, redundantTrackCount } from './music-duplicates'
import { MusicGroupBrowse, MusicGroupDetailHeader } from './music-group-browse'
import { MusicHubSidebar } from './music-hub-sidebar'
import { MusicHubToolbar } from './music-hub-toolbar'
import { MusicNowPlaying, type MusicDetailTab } from './music-now-playing'
import { HUB_MAX_WIDTH, HubHeader, HubResizeZones, hubStyle, useHubViewportClamp } from './music-hub-window'
import { MusicPlaylistModal } from './music-playlist-modal'
import { MusicProviderResults } from './music-provider-results'
import { MusicPlayerControls } from './music-player-controls'
import { MusicQueuePanel, QUEUE_PANEL_DEFAULT_HEIGHT } from './music-queue-panel'
import { MusicTagManagerModal } from './music-tag-manager'
import { MusicTrackList } from './music-track-list'
import { MusicTransferDialog } from './music-transfer-dialog'
import { MusicAlistModal } from './music-alist-modal'
import { MusicPodcastModal } from './music-podcast-modal'
import { MusicWebdavModal } from './music-webdav-modal'
import { useUi } from '../../store/ui'
import { useMusic, useVisibleTracks } from './music-store'
import type { MusicScope } from './music-store'
import { MUSIC_CONTENT_MIN_HEIGHT, MUSIC_HUB_COLUMNS_MIN_WIDTH, hubColumnsWide } from './music-utils'

// REF-9: 84vh of a phone screen, or of a short laptop window, leaves the track list a
// couple of hundred pixels once the header, toolbar and transport have taken their fixed
// share. Below this height the hub fills the viewport instead of floating in the middle
// of it — the same answer it gives to a narrow width, where the columns already fold.
const HUB_SHORT_VIEWPORT = 700
// The side columns are fixed-width (224 + 256px); below the shared narrow breakpoint they
// squeeze the track list toward zero, so they fold into drawers opened from the
// header instead (UI-14).
const HUB_NAVIGATION_DRAWER_WIDTH = 224
const HUB_NOW_PLAYING_DRAWER_WIDTH = 256

type NarrowPanel = 'navigation' | 'nowPlaying' | null

// FB-R2: the fold answers the box the hub was given, not the screen behind it, and this is the ref
// of the row that spans that box whatever the columns do (a side column takes its width out of the
// centre, never out of this row). The viewport read survives for two jobs and only those two: the
// fallback for environments that cannot measure (see `hubColumnsWide`), and whether the hub floats
// at all — that one is genuinely a question about the screen, and it must never be asked of the
// measured box, or the answer would feed back into the box's own width and flip it between the two
// shapes forever.
function useHubColumns() {
  const columnsRef = useRef<HTMLDivElement>(null)
  const hubWidth = useElementWidth(columnsRef)
  const screenWide = useMediaQuery(`(min-width: ${MUSIC_HUB_COLUMNS_MIN_WIDTH}px)`)
  const columnsWide = hubColumnsWide({ containerWidth: hubWidth, viewportWide: screenWide })
  const [narrowPanel, setNarrowPanel] = useState<NarrowPanel>(null)
  useEffect(() => {
    if (columnsWide) setNarrowPanel(null)
  }, [columnsWide])
  return { columnsRef, columnsWide, screenWide, narrowPanel, openPanel: setNarrowPanel, closePanels: () => setNarrowPanel(null) }
}

export function MusicHubModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const hubMaximized = useMusic((state) => state.hubMaximized)
  const setHubMaximized = useMusic((state) => state.setHubMaximized)
  const geometry = useMusic((state) => state.hubGeometry)
  const setHubGeometry = useMusic((state) => state.setHubGeometry)
  const dialogs = useHubDialogs()
  const { columnsRef, columnsWide, screenWide, narrowPanel, openPanel, closePanels } = useHubColumns()
  const tallEnough = useMediaQuery(`(min-height: ${HUB_SHORT_VIEWPORT}px)`)
  // REF-9/UI-14: a hub that fills the screen is the answer to a small screen or a short one — not to
  // a narrow window the reader dragged that way on purpose (FB-R2), which now simply folds its
  // columns inside the shape it was given.
  const fillViewport = hubMaximized || !screenWide || !tallEnough
  // REF-1b: a window that fills the viewport has nothing to drag or resize, so the
  // chrome only exists while the hub is its own centred box.
  const windowed = !fillViewport
  // FB-U1: a window that no longer fits this screen is brought back inside it by the same clamp
  // the drag answers to, on the event that reports the change.
  useHubViewportClamp(windowed, geometry, setHubGeometry)

  useEffect(() => {
    if (open) void loadLibrary()
  }, [open, loadLibrary])

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        ariaLabel={t('music.hub_title')}
        width={HUB_MAX_WIDTH}
        variant={hubMaximized ? 'fullscreen' : 'dialog'}
        className={cn(
          'flex flex-col overflow-hidden p-0',
          fillViewport ? 'h-full' : 'h-[84vh] max-h-220 min-h-145',
        )}
        style={windowed ? hubStyle(geometry) : undefined}
        // FB-R3: the centre column now floors the list (MUSIC_CONTENT_MIN_HEIGHT), and this is the
        // scroll that keeps that floor from becoming a clip: when the chrome plus the floor are taller
        // than the viewport — a window a few hundred pixels high, or the queue panel's own height — the
        // hub scrolls instead of crushing the list to nothing.
        bodyClassName='p-0 flex-1 min-h-0 flex flex-col overflow-y-auto'
      >
        <HubHeader
          onClose={onClose}
          narrow={!columnsWide}
          activePanel={narrowPanel}
          maximized={hubMaximized}
          windowed={windowed}
          geometry={geometry}
          onGeometryChange={setHubGeometry}
          onToggleMaximized={() => setHubMaximized(!hubMaximized)}
          onOpenNavigation={() => openPanel('navigation')}
          onOpenNowPlaying={() => openPanel('nowPlaying')}
          onOpenSettings={() => useUi.getState().openSettings('music')}
        />
        <div ref={columnsRef} className='flex min-h-0 flex-1'>
          {columnsWide && <Sidebar onManageTags={dialogs.openTagManager} onCreatePlaylist={dialogs.openCreatePlaylist} />}
          <HubCentre
            shortViewport={!tallEnough}
            // FB-R1: the narrow default asks the hub's own box (the same read the columns use), so a
            // windowed hub on a 1440 screen keeps rows — its centre column is narrow, but the
            // reader's screen is not, and the centre column is not a phone.
            narrow={!columnsWide}
            onEditTrack={dialogs.openEditTrack}
            onUpload={dialogs.openUpload}
            onBrowseWebdav={dialogs.openWebdav}
            onBrowseAlist={dialogs.openAlist}
            onPodcasts={dialogs.openPodcast}
            queueOpen={dialogs.queueOpen}
            onCloseQueue={dialogs.closeQueue}
          />
          {columnsWide && <NowPlaying tab={dialogs.detailTab} onTabChange={dialogs.setDetailTab} onEditTags={dialogs.openEditTrackForCurrent} />}
        </div>
        <Controls queueOpen={dialogs.queueOpen} onToggleQueue={dialogs.toggleQueue} />
        {windowed && (
          <HubResizeZones geometry={geometry} widthFallback={HUB_MAX_WIDTH} onResize={setHubGeometry} />
        )}
        <FoldedColumns
          wide={columnsWide}
          panel={narrowPanel}
          onClose={closePanels}
          navigation={<Sidebar onManageTags={dialogs.openTagManager} onCreatePlaylist={dialogs.openCreatePlaylist} />}
          nowPlaying={<NowPlaying tab={dialogs.detailTab} onTabChange={dialogs.setDetailTab} onEditTags={dialogs.openEditTrackForCurrent} />}
        />
      </Modal>
      <HubPeers dialogs={dialogs} />
    </>
  )
}

// The dialogs the hub opens sit beside the modal, not inside it.
function HubPeers({ dialogs }: { dialogs: ReturnType<typeof useHubDialogs> }) {
  const transfersOpen = useMusic((state) => state.transfersOpen)
  const setTransfersOpen = useMusic((state) => state.setTransfersOpen)
  return (
    <>
      <MusicEditTrackModal track={dialogs.editingTrack} open={dialogs.editingTrack !== null} onClose={dialogs.closeEditTrack} />
      <MusicPlaylistModal playlist={dialogs.editingPlaylist} open={dialogs.playlistModalOpen} onClose={dialogs.closePlaylistModal} />
      <MusicTagManagerModal open={dialogs.tagManagerOpen} onClose={dialogs.closeTagManager} />
      <MusicTransferDialog open={transfersOpen} onClose={() => setTransfersOpen(false)} />
      <MusicWebdavModal open={dialogs.webdavOpen} onClose={dialogs.closeWebdav} />
      <MusicAlistModal open={dialogs.alistOpen} onClose={dialogs.closeAlist} />
      <MusicPodcastModal open={dialogs.podcastOpen} onClose={dialogs.closePodcast} />
      <MusicSourceSwitchModal />
    </>
  )
}

// Dialog state lives here, so the panels below are memoised: opening a dialog must
// not re-render the whole library (hundreds of rows).
const Sidebar = memo(MusicHubSidebar)
const NowPlaying = memo(MusicNowPlaying)
const Controls = memo(MusicPlayerControls)

// The drawers portal over the hub modal itself, so they take the next tier above --z-modal.
function FoldedColumns({
  wide,
  panel,
  onClose,
  navigation,
  nowPlaying,
}: {
  wide: boolean
  panel: 'navigation' | 'nowPlaying' | null
  onClose: () => void
  navigation: ReactNode
  nowPlaying: ReactNode
}) {
  if (wide) return null
  return (
    <>
      <Drawer open={panel === 'navigation'} onClose={onClose} side='left' width={HUB_NAVIGATION_DRAWER_WIDTH} zIndex={Z_INDEX.menu} title={t('music.hub_sidebar')}>
        {navigation}
      </Drawer>
      <Drawer open={panel === 'nowPlaying'} onClose={onClose} side='right' width={HUB_NOW_PLAYING_DRAWER_WIDTH} zIndex={Z_INDEX.menu} title={t('music.now_playing')}>
        {nowPlaying}
      </Drawer>
    </>
  )
}


const HubCentre = memo(function HubCentre({
  shortViewport,
  narrow,
  onEditTrack,
  onUpload,
  onBrowseWebdav,
  onBrowseAlist,
  onPodcasts,
  queueOpen,
  onCloseQueue,
}: {
  /** FB-R3: the toolbar answers the height squeeze with its compact shape. */
  shortViewport: boolean
  /** FB-R1: the hub is at its narrow shape, where an unchosen view opens as covers. */
  narrow: boolean
  onEditTrack: (track: MusicTrack) => void
  onUpload: () => void
  onBrowseWebdav: () => void
  onBrowseAlist: () => void
  onPodcasts: () => void
  queueOpen: boolean
  onCloseQueue: () => void
}) {
  const loading = useMusic((state) => state.loading)
  const loadError = useMusic((state) => state.loadError)
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const scope = useMusic((state) => state.scope)
  // FB-F3: the source filter's options come from the whole library, never from the view
  // it is filtering — the filtered list would hide every other way back.
  const libraryTracks = useMusic((state) => state.tracks)
  const tracks = useVisibleTracks()
  const browseKind = scope.kind === 'albums' || scope.kind === 'artists' ? scope.kind : null
  const detail = scope.kind === 'album' || scope.kind === 'artist' ? scope : null
  // REF-11: the queue used to float over the last rows of the list; the list now keeps
  // the height the reader gave the panel free, so both stay readable at once.
  const [queueHeight, setQueueHeight] = useState(QUEUE_PANEL_DEFAULT_HEIGHT)
  return (
    <div className='relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]'>
      {/* Ranking the library happens once, here; the toolbar and the group header take
          the result as a prop so they never run the same sort a second time. */}
      <MusicHubToolbar tracks={tracks} libraryTracks={libraryTracks} shortViewport={shortViewport} onUpload={onUpload} onBrowseWebdav={onBrowseWebdav} onBrowseAlist={onBrowseAlist} onPodcasts={onPodcasts} />
      {detail && <MusicGroupDetailHeader scope={detail} tracks={tracks} />}
      <MusicProviderResults />
      {scope.kind === 'duplicates' && tracks.length > 0 && <MusicDuplicatesSummary />}
      {/* FB-R3: the floor the chrome is not allowed to eat into. The value is passed as the variable
          `MUSIC_CONTENT_MIN_HEIGHT` rather than as a class, so the budget has one source: the browser
          gate reads the rendered floor off this element and checks the list really got it. */}
      <div
        data-music-content=''
        className='min-h-[var(--music-content-min-height)] flex-1'
        style={contentStyle(queueOpen, queueHeight)}
      >
        {loadError && !tracks.length && !loading
          ? <Empty
              art='search'
              title={t('music.load_failed')}
              action={<Button size='sm' onClick={() => void loadLibrary()}>{t('music.retry')}</Button>}
              compact
            />
          : browseKind
            ? <MusicGroupBrowse kind={browseKind} />
            : <MusicTrackList tracks={tracks} loading={loading} emptyTitle={emptyTitle(scope)} onEdit={onEditTrack} narrow={narrow} />}
      </div>
      <MusicQueuePanel open={queueOpen} onClose={onCloseQueue} height={queueHeight} onResize={setQueueHeight} />
    </div>
  )
})

// The floor and the queue panel's padding are one style object: the panel takes its height back out of
// the list by design, while the floor stays the floor the chrome may not eat into.
function contentStyle(queueOpen: boolean, queueHeight: number): CSSProperties {
  return {
    '--music-content-min-height': `${MUSIC_CONTENT_MIN_HEIGHT}px`,
    ...(queueOpen ? { paddingBottom: queueHeight } : null),
  } as CSSProperties
}

function emptyTitle(scope: MusicScope): string {
  if (scope.kind === 'favorites') return t('music.no_favorites')
  if (scope.kind === 'pinned') return t('music.no_pinned')
  if (scope.kind === 'playlist') return t('music.playlist_empty')
  if (scope.kind === 'duplicates') return t('music.no_duplicates')
  if (scope.kind === 'offline') return t('music.no_offline')
  return t('music.no_tracks')
}

// The list only shows copies side by side; the strip states what the view is
// worth so cleaning up does not require doing the arithmetic by hand.
export function MusicDuplicatesSummary() {
  const tracks = useMusic((state) => state.tracks)
  const groups = useMemo(() => findDuplicateGroups(tracks), [tracks])
  const redundant = useMemo(() => redundantTrackCount(tracks), [tracks])
  const wastedBytes = useMemo(() => duplicateWastedBytes(tracks), [tracks])
  // Approximate groups are guesses, so the strip names them as such instead of
  // letting them read as proven copies.
  const approximate = useMemo(() => groups.filter((group) => group.kind === 'approximate').length, [groups])
  const values = { value0: groups.length, value1: redundant, value2: formatBytes(wastedBytes), value3: approximate }
  return (
    <div role='status' className='flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      {t(approximate > 0 ? 'music.duplicates_summary_approximate' : 'music.duplicates_summary', values)}
    </div>
  )
}

interface HubSetters {
  setEditingTrack: (track: MusicTrack | null) => void
  setEditingPlaylist: (playlist: MusicPlaylistDetail | null) => void
  setPlaylistModalOpen: (open: boolean) => void
  setTagManagerOpen: (open: boolean) => void
  setUploadOpen: (open: boolean) => void
  setQueueOpen: (open: boolean | ((value: boolean) => boolean)) => void
  setWebdavOpen: (open: boolean) => void
  setAlistOpen: (open: boolean) => void
  setPodcastOpen: (open: boolean) => void
}

// Stable callbacks: the memoised panels below must not re-render when a dialog opens.
function useDialogActions(set: HubSetters, tracks: MusicTrack[], currentId: string | null) {
  const closeEditTrack = useCallback(() => set.setEditingTrack(null), [set])
  const openEditTrackForCurrent = useCallback(
    () => set.setEditingTrack(tracks.find((track) => track.id === currentId) ?? null),
    [set, tracks, currentId],
  )
  const openCreatePlaylist = useCallback(() => {
    set.setEditingPlaylist(null)
    set.setPlaylistModalOpen(true)
  }, [set])
  return {
    closeEditTrack,
    openEditTrackForCurrent,
    openCreatePlaylist,
    closePlaylistModal: useCallback(() => set.setPlaylistModalOpen(false), [set]),
    openTagManager: useCallback(() => set.setTagManagerOpen(true), [set]),
    closeTagManager: useCallback(() => set.setTagManagerOpen(false), [set]),
    openUpload: useCallback(() => set.setUploadOpen(true), [set]),
    closeUpload: useCallback(() => set.setUploadOpen(false), [set]),
    toggleQueue: useCallback(() => set.setQueueOpen((value) => !value), [set]),
    closeQueue: useCallback(() => set.setQueueOpen(false), [set]),
    openWebdav: useCallback(() => set.setWebdavOpen(true), [set]),
    closeWebdav: useCallback(() => set.setWebdavOpen(false), [set]),
    openAlist: useCallback(() => set.setAlistOpen(true), [set]),
    closeAlist: useCallback(() => set.setAlistOpen(false), [set]),
    openPodcast: useCallback(() => set.setPodcastOpen(true), [set]),
    closePodcast: useCallback(() => set.setPodcastOpen(false), [set]),
  }
}

function useHubDialogs() {
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null)
  const [editingPlaylist, setEditingPlaylist] = useState<MusicPlaylistDetail | null>(null)
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [webdavOpen, setWebdavOpen] = useState(false)
  const [alistOpen, setAlistOpen] = useState(false)
  const [podcastOpen, setPodcastOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<MusicDetailTab>('lyrics')
  const currentId = useMusic((state) => state.queue[state.currentIndex] ?? null)
  const tracks = useMusic((state) => state.tracks)
  const setTransfersOpen = useMusic((state) => state.setTransfersOpen)
  const setters = useMemo<HubSetters>(() => ({
    setEditingTrack,
    setEditingPlaylist,
    setPlaylistModalOpen,
    setTagManagerOpen,
    setUploadOpen: setTransfersOpen,
    setQueueOpen,
    setWebdavOpen,
    setAlistOpen,
    setPodcastOpen,
  }), [setTransfersOpen])
  const actions = useDialogActions(setters, tracks, currentId)

  return {
    editingTrack,
    editingPlaylist,
    playlistModalOpen,
    tagManagerOpen,
    queueOpen,
    webdavOpen,
    alistOpen,
    podcastOpen,
    detailTab,
    setDetailTab,
    openEditTrack: setEditingTrack,
    ...actions,
  }
}