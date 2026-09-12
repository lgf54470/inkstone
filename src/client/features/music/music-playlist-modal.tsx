import { useEffect, useState } from 'react'
import type { MusicPlaylistDetail } from '@shared/types'
import { Button } from '../../components/primitives'
import { Field, Input, Textarea } from '../../components/form'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'

const PLAYLIST_WIDTH = 420

export function MusicPlaylistModal({
  playlist,
  open,
  onClose,
}: {
  playlist: MusicPlaylistDetail | null
  open: boolean
  onClose: () => void
}) {
  const createPlaylist = useMusic((state) => state.createPlaylist)
  const renamePlaylist = useMusic((state) => state.renamePlaylist)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    setName(playlist?.name ?? '')
    setDescription(playlist?.description ?? '')
  }, [playlist, open])

  const save = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (playlist) void renamePlaylist(playlist.id, trimmed)
    else void createPlaylist(trimmed)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={PLAYLIST_WIDTH}
      title={playlist ? t('music.edit_playlist') : t('music.new_playlist')}
      footer={
        <>
          <Button size='sm' onClick={onClose}>{t('common.cancel')}</Button>
          <Button size='sm' variant='primary' disabled={!name.trim()} onClick={save}>{t('music.save')}</Button>
        </>
      }
    >
      <div className='space-y-3'>
        <Field label={t('music.playlist_name')} required>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') save() }}
          />
        </Field>
        {!playlist && (
          <Field label={t('music.playlist_description')}>
            <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  )
}
