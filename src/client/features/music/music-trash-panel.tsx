import { ListMusic, Music2, Trash2 } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Modal, confirm } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { fullTime } from '../../lib/time'
import { useMusic } from './music-store'

const PANEL_WIDTH = 520

// FEA-B1: deleted tracks and playlists rest here for the retention window; a
// restore replays the snapshot into the library, a purge erases for good.
export function MusicTrashPanel() {
  const open = useMusic((state) => state.trashOpen)
  const entries = useMusic((state) => state.trashEntries)
  const loading = useMusic((state) => state.trashLoading)
  const closeTrash = useMusic((state) => state.closeTrash)
  const restoreFromTrash = useMusic((state) => state.restoreFromTrash)
  const purgeTrashEntry = useMusic((state) => state.purgeTrashEntry)

  const purge = (id: string, name: string): void => {
    void confirm({
      title: t('music.trash_purge'),
      description: t('music.trash_purge_confirm', { value0: name }),
      confirmLabel: t('music.trash_purge'),
      tone: 'danger',
    }).then((ok) => {
      if (ok) void purgeTrashEntry(id)
    })
  }

  return (
    <Modal open={open} onClose={closeTrash} title={t('music.trash')} width={PANEL_WIDTH}>
      <div className='flex flex-col gap-3'>
        <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('music.trash_hint')}</p>
        {loading && entries.length === 0
          ? <p role='status' className='py-8 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
          : entries.length === 0
            ? <p className='py-8 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.trash_empty')}</p>
            : (
                <ul className='flex max-h-80 flex-col gap-1 overflow-y-auto'>
                  {entries.map((entry) => (
                    <li key={entry.id} className='flex h-10 items-center gap-2 rounded-[var(--r-md)] px-2 hover:bg-[var(--bg-hover)]'>
                      {entry.kind === 'playlist'
                        ? <ListMusic size={14} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />
                        : <Music2 size={14} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />}
                      <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{entry.name}</span>
                      <span className={cn('shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]')}>
                        {fullTime(entry.deletedAt)}
                      </span>
                      <Button size='sm' onClick={() => void restoreFromTrash(entry.id)}>{t('music.trash_restore')}</Button>
                      <IconButton label={`${t('music.trash_purge')}: ${entry.name}`} size='sm' onClick={() => purge(entry.id, entry.name)}>
                        <Trash2 size={13} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
      </div>
    </Modal>
  )
}
