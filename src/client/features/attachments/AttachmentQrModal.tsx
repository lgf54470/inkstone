import { useState } from 'react'
import { Check, Copy, ExternalLink, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'

const QR_BG_COLOR = '#ffffff'
const QR_FG_COLOR = '#111827'

export function AttachmentQrModal({
  open,
  onClose,
  url,
  filename,
}: {
  open: boolean
  onClose: () => void
  url: string
  filename: string
}) {
  const [copied, setCopied] = useState(false)
  const fullUrl = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <QrCode size={16} className="text-[var(--accent)]" />
          <span>{t('attachments.qr_code_title')}</span>
        </div>
      }
      description={filename}
      width={400}
    >
      <div className="flex flex-col items-center gap-4 py-3">
        <div className="rounded-[16px] border border-[var(--border-default)] bg-white p-3 shadow-[var(--shadow-soft)]">
          <QRCodeSVG
            value={fullUrl}
            size={200}
            level="M"
            marginSize={1}
            bgColor={QR_BG_COLOR}
            fgColor={QR_FG_COLOR}
          />
        </div>
        <p className="text-center text-[12px] text-[var(--text-tertiary)] max-w-xs">
          {t('attachments.qr_code_hint')}
        </p>
        <div className="flex w-full items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            icon={copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
            onClick={() => void handleCopy()}
          >
            {copied ? t('common.copied') : t('attachments.copy_link')}
          </Button>
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink size={13} />
            <span>{t('preview.open_in_new_tab')}</span>
          </a>
        </div>
      </div>
    </Modal>
  )
}
