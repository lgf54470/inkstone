import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDownToLine, Heart, HeartOff, ListPlus, Pin, PinOff, Tag, Trash2 } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Menu, confirm, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { flattenTags } from './music-utils'

const MENU_WIDTH = 200

// Multi-select toolbar: file-manager style batches; select all and invert use the visible list.
export function MusicSelectionBar({ visibleIds }: { visibleIds: string[] }) {
  const selectedIds = useMusic((state) => state.selectedIds)
  const tags = useMusic((state) => state.tags)
  const playlists = useMusic((state) => state.playlists)
  const moveSelectionToTag = useMusic((state) => state.moveSelectionToTag)
  const addSelectionToPlaylist = useMusic((state) => state.addSelectionToPlaylist)

  const tagItems = useMemo<MenuItem[]>(
    () => flattenTags(tags).map(({ tag, depth }) => ({
      id: tag.id,
      label: '\u3000'.repeat(depth) + tag.name,
      onSelect: () => void moveSelectionToTag(tag.id),
    })),
    [tags, moveSelectionToTag],
  )
  const playlistItems = useMemo<MenuItem[]>(
    () => playlists.map((playlist) => ({
      id: playlist.id,
      label: playlist.name,
      onSelect: () => void addSelectionToPlaylist(playlist.id),
    })),
    [playlists, addSelectionToPlaylist],
  )

  if (!selectedIds.length) return null
  return (
    <div
      role='toolbar'
      aria-label={t('music.selection')}
      className='flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--accent-softer)] px-3 py-2'
    >
      <SelectionScope count={selectedIds.length} visibleIds={visibleIds} />
      <span className='flex-1' />
      <SelectionBulkActions selectedIds={selectedIds} tagItems={tagItems} playlistItems={playlistItems} />
    </div>
  )
}

function SelectionScope({ count, visibleIds }: { count: number; visibleIds: string[] }) {
  const selectAll = useMusic((state) => state.selectAll)
  const invertSelection = useMusic((state) => state.invertSelection)
  const clearSelection = useMusic((state) => state.clearSelection)
  return (
    <>
      <span className='text-[length:var(--text-12)] font-medium text-[var(--accent)]'>{t('music.selected_count', { value0: count })}</span>
      <span className='hidden text-[length:var(--text-10)] text-[var(--text-quaternary)] md:inline'>{t('music.selection_hint')}</span>
      <span className='mx-1 h-4 w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <Button size='sm' onClick={() => selectAll(visibleIds)}>{t('music.select_all')}</Button>
      <Button size='sm' onClick={() => invertSelection(visibleIds)}>{t('music.invert_selection')}</Button>
      <Button size='sm' onClick={clearSelection}>{t('music.clear_selection')}</Button>
    </>
  )
}

function SelectionBulkActions({
  selectedIds,
  tagItems,
  playlistItems,
}: {
  selectedIds: string[]
  tagItems: MenuItem[]
  playlistItems: MenuItem[]
}) {
  const batchTracks = useMusic((state) => state.batchTracks)
  const downloadTracks = useMusic((state) => state.downloadTracks)

  const removeSelected = (): void => {
    void confirm({
      title: t('music.batch_delete'),
      description: t('music.batch_delete_confirm', { value0: selectedIds.length }),
      confirmLabel: t('music.batch_delete'),
      tone: 'danger',
    }).then((ok) => {
      if (ok) void batchTracks('delete')
    })
  }

  return (
    <>
      <Button size='sm' icon={<Heart size={12} />} onClick={() => void batchTracks('favorite')}>{t('music.batch_favorite')}</Button>
      <Button size='sm' icon={<HeartOff size={12} />} onClick={() => void batchTracks('unfavorite')}>{t('music.batch_unfavorite')}</Button>
      <Button size='sm' icon={<Pin size={12} />} onClick={() => void batchTracks('pin')}>{t('music.batch_pin')}</Button>
      <Button size='sm' icon={<PinOff size={12} />} onClick={() => void batchTracks('unpin')}>{t('music.batch_unpin')}</Button>
      <SelectionMenuButton label={t('music.move_to_tag')} icon={<Tag size={12} />} items={tagItems} empty={t('music.no_tags')} />
      <SelectionMenuButton label={t('music.add_to_playlist')} icon={<ListPlus size={12} />} items={playlistItems} empty={t('music.no_playlists')} />
      <Button size='sm' icon={<ArrowDownToLine size={12} />} onClick={() => void downloadTracks(selectedIds)}>
        {t('music.download_selected', { value0: selectedIds.length })}
      </Button>
      <Button size='sm' variant='danger' icon={<Trash2 size={12} />} onClick={removeSelected}>{t('music.batch_delete')}</Button>
    </>
  )
}

function SelectionMenuButton({
  label,
  icon,
  items,
  empty,
}: {
  label: string
  icon: ReactNode
  items: MenuItem[]
  empty: string
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const menuItems = items.length ? items : [{ id: 'empty', label: empty, disabled: true }]
  return (
    <>
      <span ref={anchorRef} className='inline-flex'>
        <Button size='sm' icon={icon} onClick={() => setOpen((value) => !value)}>{label}</Button>
      </span>
      <Menu open={open} onClose={() => setOpen(false)} items={menuItems} anchor={anchorRef} label={label} width={MENU_WIDTH} />
    </>
  )
}
