import { useState } from 'react'
import {
  BarChart2,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Lock,
  Pin,
  QrCode,
  Settings2,
  Share2,
  Star,
  Timer,
  Users,
} from 'lucide-react'
import type { ShareInfo } from '@shared/types'
import { Switch } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'

export function ShareGridView({
  shares,
  onOpenQr,
  onOpenAnalytics,
  onOpenEdit,
}: {
  shares: ShareInfo[]
  onOpenQr: (share: ShareInfo) => void
  onOpenAnalytics: (share: ShareInfo) => void
  onOpenEdit: (share: ShareInfo) => void
}) {
  const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
  const toggleSelect = useShareStore((s) => s.toggleSelect)
  const toggleShare = useShareStore((s) => s.toggleShare)
  const togglePin = useShareStore((s) => s.togglePin)
  const toggleStar = useShareStore((s) => s.toggleStar)

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const handleCopy = async (url: string, slug: string) => {
    try {
      const full = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url
      await navigator.clipboard.writeText(full)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    } catch {}
  }

  if (shares.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <Share2 size={32} className="text-[var(--text-quaternary)]" />
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">
          {t('share.no_shares_found')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {shares.map((share) => {
        const isSelected = selectedNoteIds.has(share.noteId)
        const isExpired = share.expiresAt ? share.expiresAt < Date.now() : false
        const isCustom = share.slug && !/^[0-9a-hjkmnp-tv-z]{20}$/.test(share.slug)

        return (
          <div
            key={share.noteId}
            className={`group relative flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-soft)] transition-all hover:border-[var(--border-default)] hover:shadow-md ${
              isSelected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : ''
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 pb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(share.noteId)}
                    className="rounded border-[var(--border-default)] accent-[var(--accent)] shrink-0"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void togglePin(share.noteId)
                    }}
                    className={cn(
                      'p-0.5 rounded transition-colors shrink-0',
                      share.isPinned
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-[var(--accent)]',
                    )}
                    title={share.isPinned ? t('share.unpin_note') : t('share.pin_note')}
                  >
                    <Pin size={12} className={share.isPinned ? 'fill-current' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleStar(share.noteId)
                    }}
                    className={cn(
                      'p-0.5 rounded transition-colors shrink-0',
                      share.isStarred
                        ? 'text-amber-500'
                        : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-amber-500',
                    )}
                    title={share.isStarred ? t('share.unstar_note') : t('share.star_note')}
                  >
                    <Star size={12} className={share.isStarred ? 'fill-current' : ''} />
                  </button>
                  <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                    {share.noteTitle || t('common.untitled_note')}
                  </span>
                </div>
                <Switch
                  checked={share.isEnabled}
                  onChange={(checked) => void toggleShare(share.noteId, checked)}
                />
              </div>

              {share.noteExcerpt && (
                <p className="line-clamp-2 text-[11px] text-[var(--text-tertiary)] pb-2">
                  {share.noteExcerpt}
                </p>
              )}

              {share.slug ? (
                <div className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
                  <span className="truncate">{`/s/${share.slug}`}</span>
                  <div className="flex items-center gap-1">
                    {isCustom && (
                      <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.2 text-[9px] font-semibold text-[var(--accent)]">
                        {'CUSTOM'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCopy(share.url, share.slug)}
                      className="text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
                    >
                      {copiedSlug === share.slug ? (
                        <Check size={12} className="text-[var(--success)]" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border-subtle)] px-2 py-1 text-center text-[11px] text-[var(--text-quaternary)]">
                  {t('share.not_shared')}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 text-[10px] text-[var(--text-quaternary)]">
                {share.hasPassword && (
                  <span className="flex items-center gap-0.5 text-[var(--warning)]">
                    <Lock size={10} /> {t('share.password_protected')}
                  </span>
                )}
                {share.expiresAt && (
                  <span className={`flex items-center gap-0.5 ${isExpired ? 'text-[var(--danger)]' : ''}`}>
                    <Timer size={10} />
                    {isExpired ? t('share.status_expired') : relativeTime(share.expiresAt)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-tertiary)]">
                <span title={t('share.metric_pv')}>
                  <Eye size={11} className="inline mr-0.5" />
                  {share.views}
                </span>
                <span title={t('share.metric_uv')}>
                  <Users size={11} className="inline mr-0.5" />
                  {share.uniqueVisitors ?? 0}
                </span>
              </div>

              <div className="flex items-center gap-0.5">
                <IconButton
                  size="sm"
                  label={t('share.qr_code_title')}
                  onClick={() => onOpenQr(share)}
                >
                  <QrCode size={13} />
                </IconButton>

                <IconButton
                  size="sm"
                  label={t('share.note_analytics_title')}
                  onClick={() => onOpenAnalytics(share)}
                >
                  <BarChart2 size={13} />
                </IconButton>

                <IconButton
                  size="sm"
                  label={t('share.edit_share_settings')}
                  onClick={() => onOpenEdit(share)}
                >
                  <Settings2 size={13} />
                </IconButton>

                {share.slug && (
                  <a
                    href={share.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    title={t('preview.open_in_new_tab')}
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
