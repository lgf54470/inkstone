import { useMemo, type RefObject } from 'react'
import { ArrowDown, ArrowUp, CloudDownload, CloudOff, Download, Heart, ListEnd, ListPlus, ListStart, PencilLine, Pin, Server, Tag, TextSearch, Trash2, X } from 'lucide-react'
import type { MusicTag, MusicTrack } from '@shared/types'
import { Menu, confirm, submenuFor, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic, visibleTracks, type TrackMenuTarget } from './music-store'
import { flattenTags } from './music-utils'

export type { TrackMenuTarget }

const TRACK_MENU_WIDTH = 220

type MenuRunner = (run: () => void) => () => void

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

// One instance for the whole hub. Rows and cards post their request to the store,
// so the item builder below — with its store subscriptions — no longer runs per row.
export function MusicTrackMenuHost({ onEdit }: { onEdit: (track: MusicTrack) => void }) {
  const menu = useMusic((state) => state.trackMenu)
  const closeTrackMenu = useMusic((state) => state.closeTrackMenu)
  if (!menu) return null
  const anchor = menu.anchor instanceof HTMLElement ? { current: menu.anchor } : menu.anchor
  return <MusicTrackMenu target={menu.target} anchor={anchor} open onClose={closeTrackMenu} onEdit={onEdit} />
}

function useTrackMenuItems(
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
  const searchTrackLyric = useMusic((state) => state.searchTrackLyric)
  const removeFromPlaylist = useMusic((state) => state.removeFromPlaylist)
  const movePlaylistItem = useMusic((state) => state.movePlaylistItem)
  const deleteTrack = useMusic((state) => state.deleteTrack)
  const deleteWebdavFiles = useMusic((state) => state.deleteWebdavFiles)
  const downloadTracks = useMusic((state) => state.downloadTracks)
  const offlineTrackIds = useMusic((state) => state.offlineTrackIds)
  const toggleTrackOffline = useMusic((state) => state.toggleTrackOffline)

  return useMemo(() => {
    const track = target?.track
    if (!track) return []
    const wrap = closeThenRun(onClose)
    const actions = {
      wrap, playlists, tags, playCollection, addToQueue, addToPlaylist, patchTrack, searchTrackLyric,
      toggleFavorite, togglePin, onEdit, downloadTracks, offlineTrackIds, toggleTrackOffline,
    }
    const items = baseMenuItems(track, actions)
    items.push(...playlistMenuItems({ target, playlists, wrap, movePlaylistItem, removeFromPlaylist }))
    if (track.source === 'webdav') items.push(remoteDeleteItem(track, wrap, deleteWebdavFiles))
    items.push({
      id: 'delete',
      label: t('music.delete_track'),
      icon: <Trash2 size={14} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: wrap(() => confirmDeleteTrack(track, deleteTrack)),
    })
    return items
  }, [target, playlists, tags, playCollection, addToQueue, addToPlaylist, toggleFavorite, togglePin, patchTrack, searchTrackLyric, removeFromPlaylist, movePlaylistItem, deleteTrack, deleteWebdavFiles, downloadTracks, offlineTrackIds, toggleTrackOffline, onClose, onEdit])
}

// Rows inside a playlist carry an item identity; these are the order-scoped actions.
function playlistMenuItems(context: {
  target: TrackMenuTarget
  playlists: { id: string; items: { id: string; sortOrder: number }[] }[]
  wrap: MenuRunner
  movePlaylistItem: (playlistId: string, itemId: string, delta: number) => Promise<void>
  removeFromPlaylist: (playlistId: string, itemId: string) => Promise<void>
}): MenuItem[] {
  const { target, playlists, wrap, movePlaylistItem, removeFromPlaylist } = context
  const playlistId = target.playlistId
  const itemId = target.itemId
  if (!playlistId || !itemId) return []
  const ordered = [...(playlists.find((playlist) => playlist.id === playlistId)?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const position = ordered.findIndex((item) => item.id === itemId)
  return [
    { id: 'move-up', label: t('music.move_up'), icon: <ArrowUp size={14} />, separatorBefore: true, disabled: position <= 0, onSelect: wrap(() => void movePlaylistItem(playlistId, itemId, -1)) },
    { id: 'move-down', label: t('music.move_down'), icon: <ArrowDown size={14} />, disabled: position < 0 || position >= ordered.length - 1, onSelect: wrap(() => void movePlaylistItem(playlistId, itemId, 1)) },
    { id: 'unlink', label: t('music.remove_from_playlist'), icon: <X size={14} />, onSelect: wrap(() => void removeFromPlaylist(playlistId, itemId)) },
  ]
}

interface TrackMenuActions {
  wrap: MenuRunner
  playlists: { id: string; name: string }[]
  tags: MusicTag[]
  playCollection: (ids: string[], startIndex?: number) => Promise<void>
  addToQueue: (id: string, next?: boolean) => void
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>
  patchTrack: (id: string, patch: { tagIds: string[] }) => Promise<void>
  searchTrackLyric: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  onEdit: (track: MusicTrack) => void
  downloadTracks: (ids: string[]) => Promise<void>
  offlineTrackIds: string[]
  toggleTrackOffline: (id: string) => Promise<void>
}

function baseMenuItems(track: MusicTrack, actions: TrackMenuActions): MenuItem[] {
  const wrap = actions.wrap
  const isOffline = actions.offlineTrackIds.includes(track.id)
  return [
    { id: 'play-next', label: t('music.play_next'), icon: <ListStart size={14} />, onSelect: wrap(() => actions.addToQueue(track.id, true)) },
    { id: 'queue', label: t('music.add_to_queue'), icon: <ListEnd size={14} />, onSelect: wrap(() => actions.addToQueue(track.id)) },
    { id: 'play-all', label: t('music.play_all'), onSelect: wrap(() => playFromTrack(track, actions.playCollection)) },
    { id: 'to-playlist', label: t('music.add_to_playlist'), icon: <ListPlus size={14} />, separatorBefore: true, submenu: submenuFor(playlistSubmenu(actions.playlists, track, wrap, actions.addToPlaylist)) },
    { id: 'to-tag', label: t('music.add_tag'), icon: <Tag size={14} />, submenu: submenuFor(tagSubmenu(actions.tags, track, wrap, actions.patchTrack)) },
    { id: 'favorite', label: track.isFavorite ? t('music.unfavorite') : t('music.favorite'), icon: <Heart size={14} />, onSelect: wrap(() => void actions.toggleFavorite(track.id)) },
    { id: 'pin', label: track.isPinned ? t('music.unpin') : t('music.pin'), icon: <Pin size={14} />, onSelect: wrap(() => void actions.togglePin(track.id)) },
    { id: 'edit', label: t('music.edit_track'), icon: <PencilLine size={14} />, separatorBefore: true, onSelect: wrap(() => actions.onEdit(track)) },
    { id: 'lyric-search', label: t('music.search_lyrics'), icon: <TextSearch size={14} />, onSelect: wrap(() => searchLyric(track, actions.searchTrackLyric)) },
    { id: 'download', label: t('music.download'), icon: <Download size={14} />, onSelect: wrap(() => void actions.downloadTracks([track.id])) },
    {
      id: 'offline',
      label: isOffline ? t('music.remove_offline') : t('music.make_offline'),
      icon: isOffline ? <CloudOff size={14} /> : <CloudDownload size={14} />,
      onSelect: wrap(() => void actions.toggleTrackOffline(track.id)),
    },
  ]
}

// Plays the current list starting at the clicked track, like the toolbar's play-all
// button. The visible list is derived when the item runs, not on every row render.
function playFromTrack(track: MusicTrack, playCollection: (ids: string[], startIndex?: number) => Promise<void>): void {
  const visible = visibleTracks(useMusic.getState())
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

/**
 * An online match is a guess from a public catalogue, so a track that already
 * carries lyrics is replaced only behind a confirm — never silently.
 */
function searchLyric(track: MusicTrack, searchTrackLyric: (id: string) => Promise<void>): void {
  if (!track.hasLyric) {
    void searchTrackLyric(track.id)
    return
  }
  void confirm({
    title: t('music.search_lyrics'),
    description: t('music.search_lyrics_confirm', { value0: track.title }),
    confirmLabel: t('music.replace'),
  }).then((ok) => {
    if (ok) void searchTrackLyric(track.id)
  })
}

function confirmDeleteTrack(track: MusicTrack, deleteTrack: (id: string) => Promise<void>): void {
  void confirm({
    title: t('music.delete_track'),
    description: t('music.delete_track_confirm', { value0: track.title }),
    confirmLabel: t('music.delete'),
    tone: 'danger',
  }).then((ok) => {
    if (ok) void deleteTrack(track.id)
  })
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
        if (ok && track.webdavPath) void deleteWebdavFiles([track.webdavPath])
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
