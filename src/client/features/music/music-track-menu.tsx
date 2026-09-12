import { useMemo, type RefObject } from 'react'
import { Download, Heart, ListEnd, ListPlus, ListStart, PencilLine, Pin, Server, Trash2, X } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { Menu, confirm, submenuFor, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'

const TRACK_MENU_WIDTH = 220

export interface TrackMenuTarget {
  track: MusicTrack
  itemId?: string
  playlistId?: string
}

export function MusicTrackMenu({
  target,
  anchor,
  open,
  onClose,
  onEdit,
}: {
  target: TrackMenuTarget | null
  anchor: RefObject<HTMLElement | null> | { x: number; y: number }
  open: boolean
  onClose: () => void
  onEdit: (track: MusicTrack) => void
}) {
  const items = useTrackMenuItems(target, onClose, onEdit)
  if (!target) return null
  return <Menu open={open} anchor={anchor} items={items} onClose={onClose} label={t('music.track_menu')} width={TRACK_MENU_WIDTH} />
}

export function useTrackMenuItems(
  target: TrackMenuTarget | null,
  onClose: () => void,
  onEdit: (track: MusicTrack) => void,
): MenuItem[] {
  const playlists = useMusic((state) => state.playlists)
  const playCollection = useMusic((state) => state.playCollection)
  const addToQueue = useMusic((state) => state.addToQueue)
  const addToPlaylist = useMusic((state) => state.addToPlaylist)
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const togglePin = useMusic((state) => state.togglePin)
  const removeFromPlaylist = useMusic((state) => state.removeFromPlaylist)
  const deleteTrack = useMusic((state) => state.deleteTrack)
  const deleteWebdavFiles = useMusic((state) => state.deleteWebdavFiles)
  const downloadTracks = useMusic((state) => state.downloadTracks)

  return useMemo(() => {
    const track = target?.track
    if (!track) return []
    const wrap = closeThenRun(onClose)
    const items: MenuItem[] = [
      { id: 'play-next', label: t('music.play_next'), icon: <ListStart size={14} />, onSelect: wrap(() => addToQueue(track.id, true)) },
      { id: 'queue', label: t('music.add_to_queue'), icon: <ListEnd size={14} />, onSelect: wrap(() => addToQueue(track.id)) },
      { id: 'play-all', label: t('music.play_all'), onSelect: wrap(() => void playCollection([track.id])) },
      { id: 'to-playlist', label: t('music.add_to_playlist'), icon: <ListPlus size={14} />, separatorBefore: true, submenu: submenuFor(playlistSubmenu(playlists, track, wrap, addToPlaylist)) },
      { id: 'favorite', label: track.isFavorite ? t('music.unfavorite') : t('music.favorite'), icon: <Heart size={14} />, onSelect: wrap(() => void toggleFavorite(track.id)) },
      { id: 'pin', label: track.isPinned ? t('music.unpin') : t('music.pin'), icon: <Pin size={14} />, onSelect: wrap(() => void togglePin(track.id)) },
      { id: 'edit', label: t('music.edit_track'), icon: <PencilLine size={14} />, separatorBefore: true, onSelect: wrap(() => onEdit(track)) },
      { id: 'download', label: t('music.download'), icon: <Download size={14} />, onSelect: wrap(() => void downloadTracks([track.id])) },
    ]
    if (target.itemId && target.playlistId) {
      const playlistId = target.playlistId
      const itemId = target.itemId
      items.push({
        id: 'unlink',
        label: t('music.remove_from_playlist'),
        icon: <X size={14} />,
        onSelect: wrap(() => void removeFromPlaylist(playlistId, itemId)),
      })
    }
    if (track.source === 'webdav') items.push(remoteDeleteItem(track, wrap, deleteWebdavFiles))
    items.push({
      id: 'delete',
      label: t('music.delete_track'),
      icon: <Trash2 size={14} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: wrap(() => void deleteTrack(track.id)),
    })
    return items
  }, [target, playlists, playCollection, addToQueue, addToPlaylist, toggleFavorite, togglePin, removeFromPlaylist, deleteTrack, deleteWebdavFiles, downloadTracks, onClose, onEdit])
}

// Menu actions close the menu before they run, so focus returns to the list first.
function closeThenRun(onClose: () => void): (run: () => void) => () => void {
  return (run) => () => {
    onClose()
    run()
  }
}

function remoteDeleteItem(
  track: MusicTrack,
  wrap: (run: () => void) => () => void,
  deleteWebdavFiles: (paths: string[]) => Promise<void>,
): MenuItem {
  return {
    id: 'delete-remote',
    label: t('music.delete_remote_file'),
    icon: <Server size={14} />,
    tone: 'danger',
    separatorBefore: true,
    onSelect: wrap(() => {
      void confirm({
        title: t('music.delete_remote_file'),
        description: t('music.delete_remote_confirm', { value0: track.title }),
        confirmLabel: t('music.delete'),
        tone: 'danger',
      }).then((ok) => {
        if (ok) void deleteWebdavFiles([track.objectKey])
      })
    }),
  }
}

function playlistSubmenu(
  playlists: { id: string; name: string }[],
  track: MusicTrack,
  wrap: (run: () => void) => () => void,
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>,
): MenuItem[] {
  if (!playlists.length) return [{ id: 'pl-empty', label: t('music.no_playlists'), disabled: true }]
  return playlists.map((playlist) => ({
    id: `pl-${playlist.id}`,
    label: playlist.name,
    onSelect: wrap(() => void addToPlaylist(playlist.id, track.id)),
  }))
}
