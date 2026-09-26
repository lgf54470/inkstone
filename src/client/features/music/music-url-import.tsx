import { useRef, useState } from 'react'
import { Link } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Input } from '../../components/form'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { toastMusicNotice } from './music-feedback'
import { useMusic } from './music-store'

// FEA-B3: a direct link registers a reference row — the library keeps only the
// URL and playback proxies it, so nothing counts against the storage quota.
export function MusicUrlImportButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size='sm' icon={<Link size={12} />} onClick={() => setOpen(true)}>{t('music.import_url')}</Button>
      <UrlImportDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

const DIALOG_WIDTH = 520

export function UrlImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const url = useRef<HTMLInputElement>(null)
  const title = useRef<HTMLInputElement>(null)
  const artist = useRef<HTMLInputElement>(null)

  const add = async (): Promise<void> => {
    const address = url.current?.value.trim() ?? ''
    if (!address) {
      toastMusicNotice('music.import_url_address_required')
      return
    }
    const ok = await useMusic.getState().importTrackFromUrl({
      url: address,
      title: title.current?.value.trim() || undefined,
      artist: artist.current?.value.trim() || undefined,
    })
    if (ok) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('music.import_url_title')} width={DIALOG_WIDTH}>
      <div className='flex flex-col gap-3'>
        <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('music.import_url_hint')}</p>
        <label className='flex items-center gap-2 text-[length:var(--text-12)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.import_url_address')}</span>
          <Input ref={url} className='h-8 flex-1' aria-label={t('music.import_url_address')} />
        </label>
        <label className='flex items-center gap-2 text-[length:var(--text-12)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.import_url_name')}</span>
          <Input ref={title} className='h-8 flex-1' aria-label={t('music.import_url_name')} />
        </label>
        <label className='flex items-center gap-2 text-[length:var(--text-12)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.import_url_artist')}</span>
          <Input ref={artist} className='h-8 flex-1' aria-label={t('music.import_url_artist')} />
        </label>
        <div className='flex items-center justify-end gap-2'>
          <Button size='sm' variant='primary' onClick={() => void add()}>{t('music.import_url_add')}</Button>
        </div>
      </div>
    </Modal>
  )
}
