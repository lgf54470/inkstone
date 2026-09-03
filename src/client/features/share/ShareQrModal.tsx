import { useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink, Image as ImageIcon, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { copyQrImageToClipboard, downloadQrPng, downloadQrSvg } from './share-helpers'

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
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedImage, setCopiedImage] = useState(false)
  const svgRef = useRef<HTMLDivElement>(null)

  const fullUrl = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {}
  }

  const handleCopyImage = async () => {
    const svgEl = svgRef.current?.querySelector('svg')
    if (!svgEl) return
    const success = await copyQrImageToClipboard(svgEl)
    if (success) {
      setCopiedImage(true)
      setTimeout(() => setCopiedImage(false), 2000)
    }
  }

  const handleDownloadPng = async () => {
    const svgEl = svgRef.current?.querySelector('svg')
    if (!svgEl) return
    await downloadQrPng(svgEl, `${slug || 'note'}-qr.png`, 800)
  }

  const handleDownloadSvg = () => {
    const svgEl = svgRef.current?.querySelector('svg')
    if (!svgEl) return
    downloadQrSvg(svgEl, `${slug || 'note'}-qr.svg`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <QrCode size={16} className="text-[var(--accent)]" />
          <span>{t('share.qr_code_title')}</span>
        </div>
      }
      description={title}
      width={420}
    >
      <div className="flex flex-col items-center gap-4 py-2">
        <div
          ref={svgRef}
          className="rounded-[20px] border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-soft)] transition-transform hover:scale-[1.02]"
        >
          <QRCodeSVG
            value={fullUrl}
            size={220}
            level="H"
            marginSize={1}
            bgColor="#ffffff"
            fgColor="#0f172a"
          />
        </div>

        <div className="w-full max-w-sm rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-center">
          <p className="truncate text-[12px] font-mono text-[var(--text-secondary)]">{fullUrl}</p>
        </div>

        <p className="text-center text-[12px] text-[var(--text-tertiary)] max-w-xs">
          {t('share.qr_code_hint')}
        </p>

        <div className="grid w-full grid-cols-2 gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            icon={copiedLink ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
            onClick={() => void handleCopyLink()}
          >
            {copiedLink ? t('common.copied') : t('share.copy_link')}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={copiedImage ? <Check size={13} className="text-[var(--success)]" /> : <ImageIcon size={13} />}
            onClick={() => void handleCopyImage()}
          >
            {copiedImage ? t('share.qr_copied') : t('share.copy_qr_image')}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={13} />}
            onClick={() => void handleDownloadPng()}
          >
            {t('share.download_png')}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={13} />}
            onClick={handleDownloadSvg}
          >
            {t('share.download_svg')}
          </Button>
        </div>

        <div className="w-full pt-1">
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink size={13} />
            <span>{t('preview.open_in_new_tab')}</span>
          </a>
        </div>
      </div>
    </Modal>
  )
}
