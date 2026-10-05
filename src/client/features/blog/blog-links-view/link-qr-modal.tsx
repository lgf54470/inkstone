import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { BlogLink } from '@shared/types'
import { safeExternalUrl } from '@shared/url-safety'
import { Modal } from '../../../components/overlay'
import { Button } from '../../../components/primitives'
import { copyText } from '../../../lib/clipboard'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { LinkDynamicIcon } from './link-dynamic-icon'

export interface LinkQrModalProps {
  open: boolean
  onClose: () => void
  link: BlogLink | null
}

const MODAL_WIDTH = 380

export function LinkQrModal({ open, onClose, link }: LinkQrModalProps) {
  const toast = useUi((s) => s.toast)
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The tick belongs to this panel's own state, so its timer has to go when the panel does — it
  // used to keep firing into an unmounted component.
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  if (!link) return null

  const handleCopy = async () => {
    // `copyText` reports a refusal on its own; the tick is only for the copy that happened.
    if (!(await copyText(link.url, toast))) return
    setCopied(true)
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className='flex items-center gap-[var(--sp-2)]'>
          <QrCode size={16} className='text-[var(--accent)]' />
          <span>{t('blog.link_menu_qrcode')}</span>
        </div>
      }
      width={MODAL_WIDTH}
    >
      <div className='flex flex-col items-center gap-[var(--sp-4)] py-[var(--sp-3)]'>
        <QrCardHeader link={link} />
        <div className='p-[var(--sp-4)] bg-[var(--swatch-white)] rounded-[var(--r-lg)] shadow-sm border border-[var(--border-subtle)]'>
          <QRCodeSVG value={link.url} size={190} level='M' />
        </div>
        <QrActions url={link.url} copied={copied} onCopy={handleCopy} />
      </div>
    </Modal>
  )
}

function QrCardHeader({ link }: { link: BlogLink }) {
  return (
    <div className='flex items-center gap-[var(--sp-2-5)] max-w-xs'>
      <div className='size-8 flex items-center justify-center rounded-[var(--r-md)] bg-[var(--bg-sunken)] border border-[var(--border-subtle)]'>
        <LinkDynamicIcon icon={link.avatar} name={link.name} size={18} />
      </div>
      <div className='min-w-0'>
        <h4 className='truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
          {link.name}
        </h4>
        <p className='truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {link.url}
        </p>
      </div>
    </div>
  )
}

function QrActions({ url, copied, onCopy }: { url: string; copied: boolean; onCopy: () => void }) {
  const safeOpenUrl = safeExternalUrl(url)
  return (
    <div className='flex items-center gap-[var(--sp-2)] w-full pt-[var(--sp-2)]'>
      <Button variant='secondary' size='sm' className='flex-1 justify-center' onClick={onCopy}>
        {copied ? <Check size={14} className='text-[var(--success)]' /> : <Copy size={14} />}
        <span>{copied ? t('common.copied') : t('blog.link_menu_copy')}</span>
      </Button>
      {/* The address arrived from a reader: it opens only when a link may carry it. */}
      {safeOpenUrl && (
        <Button
          variant='primary'
          size='sm'
          className='flex-1 justify-center'
          onClick={() => window.open(safeOpenUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={14} />
          <span>{t('blog.link_menu_open')}</span>
        </Button>
      )}
    </div>
  )
}

