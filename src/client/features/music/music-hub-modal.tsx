import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Music, X } from 'lucide-react'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { Modal } from '../../components/overlay'
import { Empty } from '../../components/feedback'
import { t } from '../../lib/i18n'
import { MusicEditTrackModal } from './music-edit-track-modal'
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

const HUB_WIDTH = 1240

export function MusicHubModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const transfersOpen = useMusic((state) => state.transfersOpen)
  const setTransfersOpen = useMusic((state) => state.setTransfersOpen)
  const dialogs = useHubDialogs()

  useEffect(() => {
    if (open) void loadLibrary()
  }, [open, loadLibrary])

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width={HUB_WIDTH}
        className='h-[84vh] min-h-145 max-h-220 p-0 overflow-hidden flex flex-col'
        bodyClassName='p-0 flex-1 min-h-0 flex flex-col overflow-hidden'
      >
        <HubHeader onClose={onClose} />
        <div className='flex min-h-0 flex-1'>
          <Sidebar onManageTags={dialogs.openTagManager} onCreatePlaylist={dialogs.openCreatePlaylist} />
          <HubCentre
            onEditTrack={dialogs.openEditTrack}
            onUpload={dialogs.openUpload}
            onBrowseWebdav={dialogs.openWebdav}
            queueOpen={dialogs.queueOpen}
            onCloseQueue={dialogs.closeQueue}
          />
          <NowPlaying tab={dialogs.detailTab} onTabChange={dialogs.setDetailTab} onEditTags={dialogs.openEditTrackForCurrent} />
        </div>
        <Controls queueOpen={dialogs.queueOpen} onToggleQueue={dialogs.toggleQueue} />
      </Modal>

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

function HubHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className='flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4'>
      <div className='flex items-center gap-2'>
        <Music size={16} className='text-[var(--accent)]' />
        <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>{t('music.hub_title')}</h2>
      </div>
      <IconButton label={t('common.close')} size='sm' onClick={onClose}><X size={15} /></IconButton>
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
  const scope = useMusic((state) => state.scope)
  const tracks = useVisibleTracks()
  return (
    <div className='relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]'>
      <MusicHubToolbar onUpload={onUpload} onBrowseWebdav={onBrowseWebdav} />
      <div className='min-h-0 flex-1'>
        {loadError && !tracks.length && !loading
          ? <Empty art='search' title={t('music.load_failed')} description={loadError} compact />
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
  return t('music.no_tracks')
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