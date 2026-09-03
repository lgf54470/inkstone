import { useState } from 'react'
import {
  BarChart2,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Pin,
  QrCode,
  Settings2,
  Share2,
  Star,
} from 'lucide-react'
import type { ShareInfo } from '@shared/types'
import { Switch } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'

export function ShareTableView({
  shares,
  onOpenQr: onOpenQrModal,
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
  const toggleSelectAll = useShareStore((s) => s.toggleSelectAll)
  const toggleShare = useShareStore((s) => s.toggleShare)
  const togglePin = useShareStore((s) => s.togglePin)
  const toggleStar = useShareStore((s) => s.toggleStar)

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const allSelected = shares.length > 0 && selectedNoteIds.size === shares.length

  const handleCopyLink = async (url: string, slug: string) => {
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
        <p className="text-[11px] text-[var(--text-tertiary)]">
          {t('share.no_shares_hint')}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] text-[11px] font-semibold text-[var(--text-tertiary)]">
            <th className="w-10 px-3 py-2 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded border-[var(--border-default)] accent-[var(--accent)]"
              />
            </th>
            <th className="px-3 py-2">{t('share.table_note_title')}</th>
            <th className="w-20 px-3 py-2 text-center">{t('share.table_status')}</th>
            <th className="w-48 px-3 py-2">{t('share.table_link')}</th>
            <th className="w-28 px-3 py-2">{t('share.table_security_expiry')}</th>
            <th className="w-24 px-3 py-2 text-right">{t('share.table_pv_uv')}</th>
            <th className="w-28 px-3 py-2 text-right">{t('share.table_last_visit')}</th>
            <th className="w-32 px-3 py-2 text-right">{t('share.table_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {shares.map((share) => {
            const isSelected = selectedNoteIds.has(share.noteId)
            const isExpired = share.expiresAt ? share.expiresAt < Date.now() : false
            const isCustom = share.slug && !/^[0-9a-hjkmnp-tv-z]{20}$/.test(share.slug)

            return (
              <tr
                key={share.noteId}
                className={`group transition-colors hover:bg-[var(--bg-hover)] ${
                  isSelected ? 'bg-[var(--accent-subtle)]/30' : ''
                }`}
              >
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(share.noteId)}
                    className="rounded border-[var(--border-default)] accent-[var(--accent)]"
                  />
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void togglePin(share.noteId)
                        }}
                        className={cn(
                          'p-1 rounded transition-colors',
                          share.isPinned
                            ? 'text-[var(--accent)] bg-[var(--accent-subtle)]'
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
                          'p-1 rounded transition-colors',
                          share.isStarred
                            ? 'text-amber-500 bg-amber-500/10'
                            : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-amber-500',
                        )}
                        title={share.isStarred ? t('share.unstar_note') : t('share.star_note')}
                      >
                        <Star size={12} className={share.isStarred ? 'fill-current' : ''} />
                      </button>
                      <span className="font-medium text-[13px] text-[var(--text-primary)] hover:text-[var(--accent)]">
                        {share.noteTitle || t('common.untitled_note')}
                      </span>
                    </div>
                    {share.tags && share.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 pl-12">
                        {share.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-[var(--bg-card)] px-1.5 py-0.2 text-[10px] text-[var(--text-tertiary)] border border-[var(--border-subtle)]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </td>

                <td className="px-3 py-2.5 text-center">
                  <Switch
                    checked={share.isEnabled}
                    onChange={(checked) => void toggleShare(share.noteId, checked)}
                  />
                </td>

                <td className="px-3 py-2.5">
                  {share.slug ? (
                    <div className="inline-flex items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
                      <span className="truncate max-w-[120px]">{`/s/${share.slug}`}</span>
                      {isCustom && (
                        <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.2 text-[9px] font-semibold text-[var(--accent)]">
                          {'CUSTOM'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(share.url, share.slug)}
                        className="ml-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
                        title={t('common.copy')}
                      >
                        {copiedSlug === share.slug ? (
                          <Check size={12} className="text-[var(--success)]" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[var(--text-quaternary)]">
                      {t('share.not_shared')}
                    </span>
                  )}
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex flex-col gap-1 text-[11px]">
                    <div className="flex items-center gap-1">
                      {share.hasPassword ? (
                        <span className="inline-flex items-center gap-0.5 text-[var(--warning)]">
                          <Lock size={11} /> {t('share.password_protected')}
                        </span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">{t('share.public_access')}</span>
                      )}
                    </div>
                    <div>
                      {isExpired ? (
                        <span className="text-[var(--danger)]">{t('share.status_expired')}</span>
                      ) : share.expiresAt ? (
                        <span className="text-[var(--text-tertiary)]">
                          {relativeTime(share.expiresAt)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-quaternary)]">{t('share.never_expires')}</span>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-3 py-2.5 text-right font-mono text-[12px]">
                  <div className="text-[var(--text-primary)] font-semibold">
                    {share.views} <span className="text-[10px] font-normal text-[var(--text-tertiary)]">{'PV'}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">
                    {share.uniqueVisitors ?? 0}{' '}
                    <span className="text-[10px] text-[var(--text-quaternary)]">{'UV'}</span>
                  </div>
                </td>

                <td className="px-3 py-2.5 text-right text-[11px] text-[var(--text-tertiary)]">
                  {share.lastViewedAt ? relativeTime(share.lastViewedAt) : t('share.never_visited')}
                </td>

                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton
                      size="sm"
                      label={t('share.qr_code_title')}
                      onClick={() => onOpenQrModal(share)}
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
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                        title={t('preview.open_in_new_tab')}
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
