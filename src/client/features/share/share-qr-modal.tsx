import { useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink, Image as ImageIcon, QrCode, Tag } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import { normalizeChannelToken, withChannelParam } from '@shared/share-channel'
import { Modal } from '../../components/overlay'
import { Field, Input } from '../../components/form'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { QR_BG_COLOR, QR_FG_COLOR } from '../../lib/qr-colors'
import { copyQrImageToClipboard, downloadQrPng, downloadQrSvg } from './qr-export'

const MODAL_WIDTH = 420

export function ShareQrModal({
  open,
  onClose,
  url,
  title,
  slug,
}: {
  open: boolean
  onClose: () => void
  url: string
  title: string
  slug: string
}) {
  const [isCopiedLink, setIsCopiedLink] = useState(false)
  const [isCopiedImage, setIsCopiedImage] = useState(false)
  const [channel, setChannel] = useState('')
  const svgRef = useRef<HTMLDivElement>(null)

  // The marker rides on every way out of this panel — the code, the copied link and the open-in-new
  // -tab link — through one helper, so the code and the text can never disagree about the URL.
  const baseUrl = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url
  const fullUrl = withChannelParam(baseUrl, channel)

  const handleCopyLink = () => copyQrLinkFlow(fullUrl, setIsCopiedLink)
  const handleCopyImage = () => copyQrImageFlow(svgRef, setIsCopiedImage)
  const handleDownloadPng = () => downloadQrPngFlow(svgRef, slug)
  const handleDownloadSvg = () => downloadQrSvgFlow(svgRef, slug)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className='flex items-center gap-2'>
          <QrCode size={16} className='text-[var(--accent)]' />
          <span>{t('share.qr_code_title')}</span>
        </div>
      }
      description={title}
      width={MODAL_WIDTH}
    >
      <div className='flex flex-col items-center gap-4 py-2'>
        <QrCodeCard svgRef={svgRef} fullUrl={fullUrl} />
        <div className='w-full max-w-sm rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-center'>
          <p className='truncate text-[length:var(--text-12)] font-mono text-[var(--text-secondary)]'>{fullUrl}</p>
        </div>
        <p className='text-center text-[length:var(--text-12)] text-[var(--text-tertiary)] max-w-xs'>
          {t('share.qr_code_hint')}
        </p>
        <ChannelMarkerField value={channel} onChange={setChannel} />
        <QrActionsGrid isCopiedLink={isCopiedLink} isCopiedImage={isCopiedImage} onCopyLink={() => void handleCopyLink()} onCopyImage={() => void handleCopyImage()} onDownloadPng={() => void handleDownloadPng()} onDownloadSvg={handleDownloadSvg} />
        <QrOpenLink fullUrl={fullUrl} />
      </div>
    </Modal>
  )
}

/**
 * The optional `?ref=` marker for the link about to be handed out (ADR-0004). An empty field means
 * an unmarked link, which is what every account got before this existed. A value that is not a
 * valid token is shown as invalid rather than trimmed into one: the visitor's page would drop the
 * marker, and "your marker silently does nothing" is worse than a red border.
 */
function ChannelMarkerField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const isRejected = value !== '' && !normalizeChannelToken(value)
  return (
    <div className='w-full max-w-sm'>
      <Field
        label={t('share.channel_input_label')}
        hint={isRejected ? t('share.channel_input_invalid') : t('share.channel_input_hint')}
      >
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          invalid={isRejected}
          placeholder={t('share.channel_placeholder')}
          leading={<Tag size={12} />}
          autoComplete='off'
          spellCheck={false}
        />
      </Field>
    </div>
  )
}

async function copyQrLinkFlow(fullUrl: string, setIsCopiedLink: (value: boolean) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(fullUrl)
    setIsCopiedLink(true)
    setTimeout(() => setIsCopiedLink(false), COPY_FEEDBACK_MS)
  } catch (error) {
    console.warn('[share] failed to copy QR link', error)
  }
}

async function copyQrImageFlow(svgRef: React.RefObject<HTMLDivElement | null>, setIsCopiedImage: (value: boolean) => void): Promise<void> {
  const svgEl = svgRef.current?.querySelector('svg')
  if (!svgEl) return
  const success = await copyQrImageToClipboard(svgEl)
  if (success) {
    setIsCopiedImage(true)
    setTimeout(() => setIsCopiedImage(false), COPY_FEEDBACK_MS)
  }
}

async function downloadQrPngFlow(svgRef: React.RefObject<HTMLDivElement | null>, slug: string): Promise<void> {
  const svgEl = svgRef.current?.querySelector('svg')
  if (!svgEl) return
  await downloadQrPng(svgEl, `${slug || 'note'}-qr.png`, 800)
}

function downloadQrSvgFlow(svgRef: React.RefObject<HTMLDivElement | null>, slug: string): void {
  const svgEl = svgRef.current?.querySelector('svg')
  if (!svgEl) return
  downloadQrSvg(svgEl, `${slug || 'note'}-qr.svg`)
}

function QrCodeCard({ svgRef, fullUrl }: {
  svgRef: React.RefObject<HTMLDivElement | null>
  fullUrl: string
}) {
  return (
    <div
      ref={svgRef}
      // The plate stays white in both themes: the QR itself renders on fixed
      // white (QR_BG_COLOR), and a dark frame would cut into its quiet zone.
      className='rounded-[var(--r-2xl)] border border-[var(--border-default)] bg-[var(--swatch-white)] p-4 shadow-[var(--shadow-soft)] transition-transform hover:scale-[1.02]'
    >
      <QRCodeSVG
        value={fullUrl}
        size={220}
        level='H'
        marginSize={1}
        bgColor={QR_BG_COLOR}
        fgColor={QR_FG_COLOR}
      />
    </div>
  )
}

function QrActionsGrid({ isCopiedLink, isCopiedImage, onCopyLink, onCopyImage, onDownloadPng, onDownloadSvg }: {
  isCopiedLink: boolean
  isCopiedImage: boolean
  onCopyLink: () => void
  onCopyImage: () => void
  onDownloadPng: () => void
  onDownloadSvg: () => void
}) {
  return (
    <div className='grid w-full grid-cols-2 gap-2 pt-1'>
      <Button
        size='sm'
        variant='secondary'
        icon={isCopiedLink ? <Check size={13} className='text-[var(--success)]' /> : <Copy size={13} />}
        onClick={onCopyLink}
      >
        {isCopiedLink ? t('common.copied') : t('share.copy_link')}
      </Button>

      <Button
        size='sm'
        variant='secondary'
        icon={isCopiedImage ? <Check size={13} className='text-[var(--success)]' /> : <ImageIcon size={13} />}
        onClick={onCopyImage}
      >
        {isCopiedImage ? t('share.qr_copied') : t('share.copy_qr_image')}
      </Button>

      <Button
        size='sm'
        variant='secondary'
        icon={<Download size={13} />}
        onClick={onDownloadPng}
      >
        {t('share.download_png')}
      </Button>

      <Button
        size='sm'
        variant='secondary'
        icon={<Download size={13} />}
        onClick={onDownloadSvg}
      >
        {t('share.download_svg')}
      </Button>
    </div>
  )
}

function QrOpenLink({ fullUrl }: {
  fullUrl: string
}) {
  return (
    <div className='w-full pt-1'>
      <a
        href={fullUrl}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      >
        <ExternalLink size={13} />
        <span>{t('preview.open_in_new_tab')}</span>
      </a>
    </div>
  )
}