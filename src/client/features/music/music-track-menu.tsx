import { useMemo, type RefObject } from 'react'
import { Download, Heart, ListEnd, ListPlus, ListStart, PencilLine, Pin, Server, Tag, Trash2, X } from 'lucide-react'
import type { MusicTag, MusicTrack } from '@shared/types'
import { Menu, confirm, submenuFor, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic, useVisibleTracks } from './music-store'
import { flattenTags } from './music-utils'

const TRACK_MENU_WIDTH = 220

type MenuRunner = (run: () => void) => () => void

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
  const tags = useMusic((state) => state.tags)
  const playCollection = useMusic((state) => state.playCollection)
  const addToQueue = useMusic((state) => state.addToQueue)
  const addToPlaylist = useMusic((state) => state.addToPlaylist)
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const togglePin = useMusic((state) => state.togglePin)
  const patchTrack = useMusic((state) => state.patchTrack)
  const removeFromPlaylist = useMusic((state) => state.removeFromPlaylist)
  const deleteTrack = useMusic((state) => state.deleteTrack)
  const deleteWebdavFiles = useMusic((state) => state.deleteWebdavFiles)
  const downloadTracks = useMusic((state) => state.downloadTracks)
  const visibleTracks = useVisibleTracks()

  return useMemo(() => {
    const track = target?.track
    if (!track) return []
    const wrap = closeThenRun(onClose)
    const actions = {
      wrap, visibleTracks, playlists, tags, playCollection, addToQueue, addToPlaylist, patchTrack,
      toggleFavorite, togglePin, onEdit, downloadTracks,
    }
    const items = baseMenuItems(track, actions)
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
  }, [target, playlists, tags, playCollection, addToQueue, addToPlaylist, toggleFavorite, togglePin, patchTrack, removeFromPlaylist, deleteTrack, deleteWebdavFiles, downloadTracks, visibleTracks, onClose, onEdit])
}

interface TrackMenuActions {
  wrap: MenuRunner
  visibleTracks: MusicTrack[]
  playlists: { id: string; name: string }[]
  tags: MusicTag[]
  playCollection: (ids: string[], startIndex?: number) => Promise<void>
  addToQueue: (id: string, next?: boolean) => void
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>
  patchTrack: (id: string, patch: { tagIds: string[] }) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  onEdit: (track: MusicTrack) => void
  downloadTracks: (ids: string[]) => Promise<void>
}

function baseMenuItems(track: MusicTrack, actions: TrackMenuActions): MenuItem[] {
  const wrap = actions.wrap
  return [
    { id: 'play-next', label: t('music.play_next'), icon: <ListStart size={14} />, onSelect: wrap(() => actions.addToQueue(track.id, true)) },
    { id: 'queue', label: t('music.add_to_queue'), icon: <ListEnd size={14} />, onSelect: wrap(() => actions.addToQueue(track.id)) },
    { id: 'play-all', label: t('music.play_all'), onSelect: wrap(() => playFromTrack(actions.visibleTracks, track, actions.playCollection)) },
    { id: 'to-playlist', label: t('music.add_to_playlist'), icon: <ListPlus size={14} />, separatorBefore: true, submenu: submenuFor(playlistSubmenu(actions.playlists, track, wrap, actions.addToPlaylist)) },
    { id: 'to-tag', label: t('music.add_tag'), icon: <Tag size={14} />, submenu: submenuFor(tagSubmenu(actions.tags, track, wrap, actions.patchTrack)) },
    { id: 'favorite', label: track.isFavorite ? t('music.unfavorite') : t('music.favorite'), icon: <Heart size={14} />, onSelect: wrap(() => void actions.toggleFavorite(track.id)) },
    { id: 'pin', label: track.isPinned ? t('music.unpin') : t('music.pin'), icon: <Pin size={14} />, onSelect: wrap(() => void actions.togglePin(track.id)) },
    { id: 'edit', label: t('music.edit_track'), icon: <PencilLine size={14} />, separatorBefore: true, onSelect: wrap(() => actions.onEdit(track)) },
    { id: 'download', label: t('music.download'), icon: <Download size={14} />, onSelect: wrap(() => void actions.downloadTracks([track.id])) },
  ]
}

// Plays the current list starting at the clicked track, like the toolbar's play-all button.
function playFromTrack(
  visible: MusicTrack[],
  track: MusicTrack,
  playCollection: (ids: string[], startIndex?: number) => Promise<void>,
): void {
  const index = visible.findIndex((entry) => entry.id === track.id)
  void playCollection(visible.map((entry) => entry.id), index < 0 ? 0 : index)
}

// Checkmarks show the track's current tags; picking one toggles it.
function tagSubmenu(
  tags: MusicTag[],
  track: MusicTrack,
  wrap: MenuRunner,
  patchTrack: (id: string, patch: { tagIds: string[] }) => Promise<void>,
): MenuItem[] {
  const selected = new Set(track.tagIds)
  if (!tags.length) return [{ id: 'tag-empty', label: t('music.no_tags'), disabled: true }]
  return flattenTags(tags).map(({ tag, depth }) => ({
    id: `tag-${tag.id}`,
    label: '\u3000'.repeat(depth) + tag.name,
    checked: selected.has(tag.id),
    onSelect: wrap(() => {
      const next = selected.has(tag.id)
        ? track.tagIds.filter((id) => id !== tag.id)
        : [...track.tagIds, tag.id]
      void patchTrack(track.id, { tagIds: next })
    }),
  }))
}

// Menu actions close the menu before they run, so focus returns to the list first.
function closeThenRun(onClose: () => void): MenuRunner {
  return (run) => () => {
    onClose()
    run()
  }
}

function remoteDeleteItem(
  track: MusicTrack,
  wrap: MenuRunner,
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
  wrap: MenuRunner,
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>,
): MenuItem[] {
  if (!playlists.length) return [{ id: 'pl-empty', label: t('music.no_playlists'), disabled: true }]
  return playlists.map((playlist) => ({
    id: `pl-${playlist.id}`,
    label: playlist.name,
    onSelect: wrap(() => void addToPlaylist(playlist.id, track.id)),
  }))
}
