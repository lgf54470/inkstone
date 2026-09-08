import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, X } from 'lucide-react'
import { t, useCurrentLocale, type BlogLocale } from '../../lib/i18n'
import type { BlogPublicLink } from '../../lib/types'
import type { QRModalState } from './types'

export interface LinkQRModalProps {
  state: QRModalState
  onClose: () => void
}

export function LinkQRModal(props: LinkQRModalProps) {
  const [copied, setCopied] = useState(false)
  const locale = useCurrentLocale()
  useModalEscape(props.state.isOpen, props.onClose)

  if (!props.state.isOpen || !props.state.link) return null

  const { link } = props.state
  const handleCopy = () => {
    if (typeof window !== 'undefined' && window.navigator?.clipboard) {
      void window.navigator.clipboard.writeText(link.url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200'
      onClick={props.onClose}
    >
      <div
        className='relative w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-4'
        onClick={(e) => e.stopPropagation()}
      >
        <QRModalHeader locale={locale} onClose={props.onClose} />
        <QRModalBody link={link} />
        <QRModalFooter link={link} copied={copied} locale={locale} onCopy={handleCopy} />
      </div>
    </div>
  )
}

function useModalEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])
}

function QRModalHeader({ locale, onClose }: { locale: BlogLocale; onClose: () => void }) {
  return (
    <div className='flex items-center justify-between'>
      <div>
        <h3 className='font-bold text-sm text-[var(--text-primary)]'>
          {t('links.qr_modal_title', {}, locale)}
        </h3>
        <p className='text-xs text-[var(--text-tertiary)]'>
          {t('links.qr_modal_desc', {}, locale)}
        </p>
      </div>
      <button
        type='button'
        onClick={onClose}
        className='p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
      >
        <X className='size-4' />
      </button>
    </div>
  )
}

function QRModalBody({ link }: { link: BlogPublicLink }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(link.url)}`
  return (
    <div className='flex flex-col items-center justify-center p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]'>
      <img
        src={qrUrl}
        alt={link.name}
        className='size-48 rounded-lg bg-white p-2 shadow-xs'
        loading='lazy'
      />
      <div className='mt-3 text-center space-y-0.5 max-w-full'>
        <h4 className='font-semibold text-xs text-[var(--text-primary)] truncate max-w-64'>
          {link.name}
        </h4>
        <p className='text-xs text-[var(--text-tertiary)] truncate max-w-64 font-mono'>
          {link.url}
        </p>
      </div>
    </div>
  )
}

function QRModalFooter({
  link,
  copied,
  locale,
  onCopy,
}: {
  link: BlogPublicLink
  copied: boolean
  locale: BlogLocale
  onCopy: () => void
}) {
  return (
    <div className='flex items-center gap-2'>
      <button
        type='button'
        onClick={onCopy}
        className='flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] hover:bg-[var(--bg-sunken)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer'
      >
        {copied ? <Check className='size-3.5 text-emerald-500' /> : <Copy className='size-3.5' />}
        <span>{copied ? t('interactive.copied', {}, locale) : t('interactive.copy', {}, locale)}</span>
      </button>
      <a
        href={link.url}
        target='_blank'
        rel='noopener noreferrer'
        className='flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white text-xs font-medium transition-opacity'
      >
        <ExternalLink className='size-3.5' />
      </a>
    </div>
  )
}
