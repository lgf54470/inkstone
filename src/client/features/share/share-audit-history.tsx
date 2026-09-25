import { History } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ShareAuditFieldChange, ShareAuditLogEntry } from '@shared/types'
import { Skeleton } from '../../components/feedback'
import { fullTime, relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'

const AUDIT_READ_LIMIT = 50

/**
 * The link's change history (audit #6): the newest entries the audit log holds for this note, read
 * when the insight modal opens. The passcode is displayed as set/cleared — that is all the log
 * stores, by design.
 */
export function ShareAuditHistory({ noteId }: { noteId: string }) {
  const { entries, isLoading, error, reload } = useShareAuditLog(noteId)
  return (
    <section className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3' aria-label={t('share.audit_history_title')}>
      <p className='flex items-center gap-1.5 text-[length:var(--text-11)] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]'>
        <History size={12} aria-hidden />
        {t('share.audit_history_title')}
      </p>
      {error ? (
        <>
          <p role='alert' className='pt-2 text-[length:var(--text-11)] text-[var(--danger)]'>{t('share.audit_load_failed')}</p>
          <button
            type='button'
            onClick={reload}
            className='text-[length:var(--text-11)] text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline'
          >
            {t('common.retry')}
          </button>
        </>
      ) : isLoading ? (
        <div className='space-y-1.5 pt-2' aria-busy='true'>
          {[0, 1, 2].map((row) => <Skeleton key={row} className='h-4' />)}
        </div>
      ) : entries.length === 0 ? (
        <p className='pt-2 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('share.audit_empty')}</p>
      ) : (
        <AuditEntryList entries={entries} />
      )}
      {!error && !isLoading && entries.length >= AUDIT_READ_LIMIT && (
        <p className='pt-2 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{t('share.audit_truncated', { count: AUDIT_READ_LIMIT })}</p>
      )}
      {!error && !isLoading && <ReloadRow onReload={reload} />}
    </section>
  )
}

function AuditEntryList({ entries }: { entries: ShareAuditLogEntry[] }) {
  return (
    <ul className='space-y-2 pt-2'>
      {entries.map((entry) => (
        <li key={entry.id} className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <div className='flex items-baseline justify-between gap-2'>
            <span className='font-medium text-[var(--text-primary)]'>{auditActionLabel(entry.action)}</span>
            <time dateTime={new Date(entry.createdAt).toISOString()} title={fullTime(entry.createdAt)}>
              {relativeTime(entry.createdAt)}
            </time>
          </div>
          {entry.changed.length > 0 && (
            <ul className='mt-0.5 space-y-0.5'>
              {entry.changed.map((change) => (
                <li key={change.field} className='text-[var(--text-tertiary)]'>{auditChangeLine(change)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

function ReloadRow({ onReload }: { onReload: () => void }) {
  return (
    <button
      type='button'
      onClick={onReload}
      className='mt-2 text-[length:var(--text-11)] text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline'
    >
      {t('common.refresh')}
    </button>
  )
}

function useShareAuditLog(noteId: string): {
  entries: ShareAuditLogEntry[]
  isLoading: boolean
  error: boolean
  reload: () => void
} {
  const [entries, setEntries] = useState<ShareAuditLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(false)
      try {
        const res = await api.share.noteAudit(noteId)
        if (!cancelled) setEntries(res.entries)
      } catch (loadError) {
        // A failed history read is surfaced, not swallowed: the section says so and offers the retry.
        if (!cancelled) setError(true)
        console.warn('[share] failed to load the share audit log', loadError)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [noteId, attempt])

  return { entries, isLoading, error, reload: () => setAttempt((n) => n + 1) }
}

const AUDIT_FIELD_KEYS = {
  slug: 'share.audit_field_slug',
  password: 'share.audit_field_password',
  expires_at: 'share.audit_field_expires_at',
  is_enabled: 'share.audit_field_is_enabled',
  folder_id: 'share.audit_field_folder_id',
  tags: 'share.audit_field_tags',
} as const

const AUDIT_ACTION_KEYS = {
  create: 'share.audit_action_create',
  update: 'share.audit_action_update',
  revoke: 'share.audit_action_revoke',
  batch: 'share.audit_action_batch',
} as const

function auditActionLabel(action: ShareAuditLogEntry['action']): string {
  return t(AUDIT_ACTION_KEYS[action])
}

/** A field the reader has no label for shows its stored name rather than vanishing. */
function auditFieldLabel(field: string): string {
  const key = AUDIT_FIELD_KEYS[field as keyof typeof AUDIT_FIELD_KEYS]
  return key ? t(key) : field
}

function auditChangeLine(change: ShareAuditFieldChange): string {
  const field = auditFieldLabel(change.field)
  const from = auditValue(change.field, change.from)
  const to = auditValue(change.field, change.to)
  return t('share.audit_change_line', { field, from, to })
}

function auditValue(field: string, value: string | number | boolean | null | undefined): string {
  if (field === 'password') return value ? t('share.audit_value_password_set') : t('share.audit_value_password_cleared')
  if (field === 'is_enabled') return value ? t('share.audit_value_enabled') : t('share.audit_value_disabled')
  if (field === 'expires_at') return typeof value === 'number' ? fullTime(value) : t('share.audit_value_none')
  if (value === null || value === undefined || value === '') return t('share.audit_value_none')
  return String(value)
}
