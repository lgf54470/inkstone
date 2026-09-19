import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Music, PanelLeft, SlidersHorizontal, X } from 'lucide-react'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { Button, IconButton } from '../../components/primitives'
import { Drawer, Modal } from '../../components/overlay'
import { Empty } from '../../components/feedback'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/hooks'
import { Z_INDEX } from '../../lib/z-index'
import { t } from '../../lib/i18n'
import { MusicEditTrackModal } from './music-edit-track-modal'
import { findDuplicateGroups, duplicateWastedBytes, redundantTrackCount } from './music-duplicates'
import { MusicGroupBrowse, MusicGroupDetailHeader } from './music-group-browse'
import { MusicHubSidebar } from './music-hub-sidebar'
import { MusicHubToolbar } from './music-hub-toolbar'
import { MusicNowPlaying, type MusicDetailTab } from './music-now-playing'
import { MusicPlaylistModal } from './music-playlist-modal'
import { MusicPlayerControls } from './music-player-controls'
import { MusicQueuePanel } from './music-queue-panel'
import { MusicTagManagerModal } from './music-tag-manager'
import { MusicTrackList } from './music-track-list'
import { MusicTransferDialog } from './music-transfer-dialog'
import { MusicWebdavModal } from './music-webdav-modal'
import { useMusic, useVisibleTracks } from './music-store'
import type { MusicScope } from './music-store'
import { MUSIC_NARROW_BREAKPOINT, formatBytes } from './music-utils'

const HUB_WIDTH = 1240
// The side columns are fixed-width (224 + 256px); below the shared narrow breakpoint they
// squeeze the track list toward zero, so they fold into drawers opened from the
// header instead (UI-14).
const HUB_NAVIGATION_DRAWER_WIDTH = 224
const HUB_NOW_PLAYING_DRAWER_WIDTH = 256

type NarrowPanel = 'navigation' | 'nowPlaying' | null

function useNarrowColumns() {
  const columnsWide = useMediaQuery(`(min-width: ${MUSIC_NARROW_BREAKPOINT}px)`)
  const [narrowPanel, setNarrowPanel] = useState<NarrowPanel>(null)
  useEffect(() => {
    if (columnsWide) setNarrowPanel(null)
  }, [columnsWide])
  return { columnsWide, narrowPanel, openPanel: setNarrowPanel, closePanels: () => setNarrowPanel(null) }
}

export function MusicHubModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const dialogs = useHubDialogs()
  const { columnsWide, narrowPanel, openPanel, closePanels } = useNarrowColumns()

  useEffect(() => {
    if (open) void loadLibrary()
  }, [open, loadLibrary])

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        ariaLabel={t('music.hub_title')}
        width={HUB_WIDTH}
        className={cn('flex h-[84vh] max-h-220 flex-col overflow-hidden p-0', columnsWide ? 'min-h-145' : 'min-h-0')}
        bodyClassName='p-0 flex-1 min-h-0 flex flex-col overflow-hidden'
      >
        <HubHeader
          onClose={onClose}
          narrow={!columnsWide}
          onOpenNavigation={() => openPanel('navigation')}
          onOpenNowPlaying={() => openPanel('nowPlaying')}
        />
        <div className='flex min-h-0 flex-1'>
          {columnsWide && <Sidebar onManageTags={dialogs.openTagManager} onCreatePlaylist={dialogs.openCreatePlaylist} />}
          <HubCentre
            onEditTrack={dialogs.openEditTrack}
            onUpload={dialogs.openUpload}
            onBrowseWebdav={dialogs.openWebdav}
            queueOpen={dialogs.queueOpen}
            onCloseQueue={dialogs.closeQueue}
          />
          {columnsWide && <NowPlaying tab={dialogs.detailTab} onTabChange={dialogs.setDetailTab} onEditTags={dialogs.openEditTrackForCurrent} />}
        </div>
        <Controls queueOpen={dialogs.queueOpen} onToggleQueue={dialogs.toggleQueue} />
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

function HubHeader({
  onClose,
  narrow,
  onOpenNavigation,
  onOpenNowPlaying,
}: {
  onClose: () => void
  narrow: boolean
  onOpenNavigation: () => void
  onOpenNowPlaying: () => void
}) {
  return (
    <header className='flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4'>
      <div className='flex items-center gap-2'>
        <Music size={16} className='text-[var(--accent)]' />
        <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>{t('music.hub_title')}</h2>
      </div>
      <div className='flex items-center gap-1'>
        {narrow && (
          <>
            <IconButton label={t('music.hub_open_navigation')} size='sm' onClick={onOpenNavigation}><PanelLeft size={15} /></IconButton>
            <IconButton label={t('music.hub_open_now_playing')} size='sm' onClick={onOpenNowPlaying}><SlidersHorizontal size={15} /></IconButton>
          </>
        )}
        <IconButton label={t('common.close')} size='sm' onClick={onClose}><X size={15} /></IconButton>
      </div>
    </header>
  )
}

const HubCentre = memo(function HubCentre({
  onEditTrack,
  onUpload,
  onBrowseWebdav,
  queueOpen,
  onCloseQueue,
}: {
  onEditTrack: (track: MusicTrack) => void
  onUpload: () => void
  onBrowseWebdav: () => void
  queueOpen: boolean
  onCloseQueue: () => void
}) {
  const loading = useMusic((state) => state.loading)
  const loadError = useMusic((state) => state.loadError)
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const scope = useMusic((state) => state.scope)
  const tracks = useVisibleTracks()
  const browseKind = scope.kind === 'albums' || scope.kind === 'artists' ? scope.kind : null
  const detail = scope.kind === 'album' || scope.kind === 'artist' ? scope : null
  return (
    <div className='relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]'>
      <MusicHubToolbar onUpload={onUpload} onBrowseWebdav={onBrowseWebdav} />
      {detail && <MusicGroupDetailHeader scope={detail} />}
      {scope.kind === 'duplicates' && tracks.length > 0 && <MusicDuplicatesSummary />}
      <div className='min-h-0 flex-1'>
        {loadError && !tracks.length && !loading
          ? <Empty
              art='search'
              title={t('music.load_failed')}
              action={<Button size='sm' onClick={() => void loadLibrary()}>{t('music.retry')}</Button>}
              compact
            />
          : browseKind
            ? <MusicGroupBrowse kind={browseKind} />
            : <MusicTrackList tracks={tracks} loading={loading} emptyTitle={emptyTitle(scope)} onEdit={onEditTrack} />}
      </div>
      <MusicQueuePanel open={queueOpen} onClose={onCloseQueue} />
    </div>
  )
})

function emptyTitle(scope: MusicScope): string {
  if (scope.kind === 'favorites') return t('music.no_favorites')
  if (scope.kind === 'pinned') return t('music.no_pinned')
  if (scope.kind === 'playlist') return t('music.playlist_empty')
  if (scope.kind === 'duplicates') return t('music.no_duplicates')
  return t('music.no_tracks')
}

// The list only shows copies side by side; the strip states what the view is
// worth so cleaning up does not require doing the arithmetic by hand.
function MusicDuplicatesSummary() {
  const tracks = useMusic((state) => state.tracks)
  const groups = useMemo(() => findDuplicateGroups(tracks), [tracks])
  const redundant = useMemo(() => redundantTrackCount(tracks), [tracks])
  const wastedBytes = useMemo(() => duplicateWastedBytes(tracks), [tracks])
  return (
    <div role='status' className='flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      {t('music.duplicates_summary', { value0: groups.length, value1: redundant, value2: formatBytes(wastedBytes) })}
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
  }
}

function useHubDialogs() {
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null)
  const [editingPlaylist, setEditingPlaylist] = useState<MusicPlaylistDetail | null>(null)
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [webdavOpen, setWebdavOpen] = useState(false)
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
  }), [setTransfersOpen])
  const actions = useDialogActions(setters, tracks, currentId)

  return {
    editingTrack,
    editingPlaylist,
    playlistModalOpen,
    tagManagerOpen,
    queueOpen,
    webdavOpen,
    detailTab,
    setDetailTab,
    openEditTrack: setEditingTrack,
    ...actions,
  }
}