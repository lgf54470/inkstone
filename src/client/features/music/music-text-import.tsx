import { useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Input } from '../../components/form'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'
import type { MusicTrack } from '@shared/types'
import { matchM3uTracks, parseM3u } from './music-m3u'
import { toastMusicNotice } from './music-feedback'
import { useMusic } from './music-store'

// A pasted list is an M3U without the file: every non-empty line is one entry,
// and the same "artist - title" and bare-title keys the file importer uses do
// the resolving, so the two imports cannot drift apart.
export function MusicTextImportButton({ tracks }: { tracks: MusicTrack[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size='sm' icon={<ClipboardList size={12} />} onClick={() => setOpen(true)}>{t('music.import_text')}</Button>
      <TextImportDialog open={open} tracks={tracks} onClose={() => setOpen(false)} />
    </>
  )
}

const DIALOG_WIDTH = 520

export function TextImportDialog({ open, tracks, onClose }: { open: boolean; tracks: MusicTrack[]; onClose: () => void }) {
  const text = useRef<HTMLTextAreaElement>(null)
  const name = useRef<HTMLInputElement>(null)

  const resolve = (): MusicTrack[] | null => {
    const entries = parseM3u(text.current?.value ?? '')
    if (!entries.length) {
      toastMusicNotice('music.m3u_imported_none')
      return null
    }
    const matched = matchM3uTracks(entries, tracks)
    const unmatched = entries.length - matched.length
    if (unmatched > 0) toastMusicNotice('music.m3u_imported_partial', { value0: entries.length, value1: unmatched })
    return matched
  }

  const queue = (): void => {
    const matched = resolve()
    if (!matched?.length) return
    useMusic.getState().addManyToQueue(matched.map((track) => track.id))
    onClose()
  }

  const saveAsPlaylist = async (): Promise<void> => {
    const matched = resolve()
    if (!matched?.length) return
    const playlistName = name.current?.value ?? ''
    if (!playlistName.trim()) {
      toastMusicNotice('music.import_text_name_required')
      return
    }
    const ok = await useMusic.getState().createPlaylistWithTracks(playlistName, matched.map((track) => track.id))
    if (ok) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('music.import_text_title')} width={DIALOG_WIDTH}>
      <div className='flex flex-col gap-[var(--sp-3)]'>
        <ImportFields textRef={text} nameRef={name} />
        <div className='flex items-center justify-end gap-[var(--sp-2)]'>
          <Button size='sm' onClick={queue}>{t('music.import_text_queue')}</Button>
          <Button size='sm' variant='primary' onClick={() => void saveAsPlaylist()}>{t('music.import_text_playlist')}</Button>
        </div>
      </div>
    </Modal>
  )
}

function ImportFields({ textRef, nameRef }: {
  textRef: React.RefObject<HTMLTextAreaElement | null>
  nameRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <>
      <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('music.import_text_hint')}</p>
      <textarea
        ref={textRef}
        rows={8}
        className='w-full resize-y rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-[var(--sp-2)] font-mono text-[length:var(--text-12)] text-[var(--text-primary)]'
        aria-label={t('music.import_text_list')}
      />
      <label className='flex items-center gap-[var(--sp-2)] text-[length:var(--text-12)] text-[var(--text-secondary)]'>
        <span className='shrink-0'>{t('music.import_text_name')}</span>
        <Input ref={nameRef} className='h-[var(--sp-8)] flex-1' />
      </label>
    </>
  )
}
