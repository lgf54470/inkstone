import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Heart, ListMusic, MoreHorizontal, PencilLine, Pin, Play, Plus, Trash2 } from 'lucide-react'
import type { MusicPlaylistDetail } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { Menu, Tooltip, useContextMenu, type MenuItem } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'

const PLAYLIST_MENU_WIDTH = 180

export function MusicHubPlaylists({ onCreate }: { onCreate: () => void }) {
  const playlists = useMusic((state) => state.playlists)
  const scope = useMusic((state) => state.scope)
  const setScope = useMusic((state) => state.setScope)
  const playCollection = useMusic((state) => state.playCollection)
  const renamePlaylist = useMusic((state) => state.renamePlaylist)
  const deletePlaylist = useMusic((state) => state.deletePlaylist)
  const [open, setOpen] = useState(true)

  return (
    <section aria-label={t('music.section_playlists')} className='pt-1'>
      <div className='group/head flex items-center justify-between px-2 pb-1'>
        <button
          type='button'
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className='flex items-center gap-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{t('music.section_playlists')}</span>
        </button>
        <Tooltip label={t('music.new_playlist')} side='left'>
          <IconButton label={t('music.new_playlist')} size='sm' onClick={onCreate} className='opacity-0 group-hover/head:opacity-100 group-focus-within/head:opacity-100'>
            <Plus size={13} />
          </IconButton>
        </Tooltip>
      </div>

      {open && (
        <div className='space-y-0.5 pt-0.5'>
          {playlists.length === 0
            ? <p className='px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.no_playlists')}</p>
            : playlists.map((playlist) => (
              <PlaylistRow
                key={playlist.id}
                playlist={playlist}
                active={scope.kind === 'playlist' && scope.playlistId === playlist.id}
                onSelect={() => setScope({ kind: 'playlist', playlistId: playlist.id })}
                onPlay={() => void playCollection(playlist.items.map((item) => item.trackId))}
                onRename={(name) => void renamePlaylist(playlist.id, name)}
                onDelete={() => void deletePlaylist(playlist.id)}
              />
            ))}
        </div>
      )}
    </section>
  )
}

function PlaylistRow({
  playlist,
  active,
  onSelect,
  onPlay,
  onRename,
  onDelete,
}: {
  playlist: MusicPlaylistDetail
  active: boolean
  onSelect: () => void
  onPlay: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const menu = useContextMenu()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  const items: MenuItem[] = [
    { id: 'play', label: t('music.play_all'), icon: <Play size={14} />, onSelect: onPlay },
    { id: 'rename', label: t('music.rename'), icon: <PencilLine size={14} />, separatorBefore: true, onSelect: () => setDraft(playlist.name) },
    { id: 'delete', label: t('music.delete_playlist'), icon: <Trash2 size={14} />, tone: 'danger', separatorBefore: true, onSelect: onDelete },
  ]

  return (
    <>
      <div
        onContextMenu={menu.onContextMenu}
        className={cn(
          'group/row flex h-8 items-center gap-1 rounded-[var(--r-md)] px-2 text-[length:var(--text-12)] transition-colors',
          active
            ? 'bg-[var(--accent-subtle)] font-semibold text-[var(--accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        )}
      >
        {draft === null
          ? <PlaylistSelectButton playlist={playlist} onSelect={onSelect} />
          : <PlaylistRenameInput draft={draft} onChange={setDraft} onCommit={onRename} originalName={playlist.name} />}
        <PlaylistBadges playlist={playlist} />
        <IconButton
          ref={anchorRef}
          label={t('music.open_menu')}
          size='sm'
          onClick={() => setIsMenuOpen(true)}
          className='opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'
        >
          <MoreHorizontal size={13} />
        </IconButton>
      </div>
      <Menu open={isMenuOpen} anchor={anchorRef} items={items} onClose={() => setIsMenuOpen(false)} label={t('music.playlist_menu')} width={PLAYLIST_MENU_WIDTH} />
      {menu.point && <Menu open anchor={menu.point} items={items} onClose={menu.close} label={t('music.playlist_menu')} width={PLAYLIST_MENU_WIDTH} />}
    </>
  )
}

function PlaylistRenameInput({
  draft,
  onChange,
  onCommit,
  originalName,
}: {
  draft: string
  onChange: (value: string | null) => void
  onCommit: (name: string) => void
  originalName: string
}) {
  return (
    <input
      autoFocus
      value={draft}
      aria-label={t('music.rename')}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        const next = draft.trim()
        onChange(null)
        if (next && next !== originalName) onCommit(next)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') onChange(null)
      }}
      className='h-6 min-w-0 flex-1 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] px-1 text-[length:var(--text-11)] outline-none'
    />
  )
}

function PlaylistSelectButton({ playlist, onSelect }: { playlist: MusicPlaylistDetail; onSelect: () => void }) {
  return (
    <button type='button' onClick={onSelect} className='flex min-w-0 flex-1 items-center gap-1.5 truncate text-left'>
      <ListMusic size={12} className='shrink-0 opacity-70' />
      <span className='truncate'>{playlist.name}</span>
    </button>
  )
}

function PlaylistBadges({ playlist }: { playlist: MusicPlaylistDetail }) {
  return (
    <>
      {playlist.isFavorite && <Heart size={10} className='shrink-0 fill-current text-[var(--accent)]' aria-hidden='true' />}
      {playlist.isPinned && <Pin size={10} className='shrink-0 text-[var(--warning)]' aria-hidden='true' />}
      <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{playlist.items.length}</span>
    </>
  )
}