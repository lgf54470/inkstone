import { useEffect, useState } from 'react'
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  Monitor,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  Trash2,
  User,
} from 'lucide-react'
import type { ShareVisitsResponse } from '@shared/types'
import { Modal, confirm } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useUi } from '../../store/ui'
import { countryFlag, countryNameLocalized, exportVisitsToCsv } from './share-helpers'

export function ShareVisitLogsModal({
  open,
  onClose,
  initialNoteId,
}: {
  open: boolean
  onClose: () => void
  initialNoteId?: string
}) {
  const toast = useUi((s) => s.toast)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ShareVisitsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'real' | 'bot' | 'owner' | 'self'>('all')
  const [search, setSearch] = useState('')
  const [noteId, setNoteId] = useState<string | undefined>(initialNoteId)
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    if (open) {
      setPage(1)
      setNoteId(initialNoteId)
      void fetchVisits(1, filter, search, initialNoteId)
    }
  }, [open, initialNoteId])

  const fetchVisits = async (
    targetPage = page,
    targetFilter = filter,
    targetSearch = search,
    targetNoteId = noteId,
  ) => {
    setLoading(true)
    try {
      const res = await api.share.visits({
        page: targetPage,
        limit: 25,
        filter: targetFilter,
        search: targetSearch || undefined,
        noteId: targetNoteId || undefined,
      })
      setData(res)
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (newFilter: 'all' | 'real' | 'bot' | 'owner' | 'self') => {
    setFilter(newFilter)
    setPage(1)
    void fetchVisits(1, newFilter, search, noteId)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    void fetchVisits(1, filter, search, noteId)
  }

  const handleClean = async (type: 'bots' | 'older_than' | 'all', days = 30) => {
    const confirmMessage =
      type === 'all'
        ? t('share.confirm_clear_all_logs')
        : type === 'bots'
          ? t('share.confirm_clear_bot_logs')
          : t('share.confirm_clear_older_logs', { days })

    const ok = await confirm({
      title: t('share.clean_logs_title'),
      description: confirmMessage,
      confirmLabel: t('share.clean_now'),
      tone: 'danger',
    })
    if (!ok) return

    setCleaning(true)
    try {
      const res = await api.share.cleanVisits(type, days)
      toast({
        title: t('share.clean_success', { count: res.deleted }),
        tone: 'default',
      })
      void fetchVisits(1, filter, search, noteId)
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setCleaning(false)
    }
  }

  const handleExport = () => {
    if (!data || data.visits.length === 0) {
      toast({ title: t('share.no_logs_to_export'), tone: 'warning' })
      return
    }
    exportVisitsToCsv(data.visits, `inkstone-visits-${new Date().toISOString().slice(0, 10)}.csv`)
    toast({ title: t('share.export_success'), tone: 'default' })
  }

  const deviceIcon = (type?: string | null) => {
    if (type === 'mobile') return <Smartphone size={12} className="text-[var(--text-tertiary)]" />
    if (type === 'tablet') return <Tablet size={12} className="text-[var(--text-tertiary)]" />
    return <Monitor size={12} className="text-[var(--text-tertiary)]" />
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Activity size={17} className="text-[var(--accent)]" />
          <span>{t('share.visit_logs_title')}</span>
          {data && (
            <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[11px] font-normal text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
              {t('share.total_records', { count: data.total })}
            </span>
          )}
        </div>
      }
      description={t('share.visit_logs_desc')}
      width={1050}
    >
      <div className="flex flex-col gap-3">
        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
          {/* Traffic Filter Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleFilterChange('all')}
              className={`rounded-[var(--r-md)] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t('share.filter_all_traffic')}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('real')}
              className={`rounded-[var(--r-md)] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === 'real'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t('share.filter_real_only')}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('bot')}
              className={`rounded-[var(--r-md)] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === 'bot'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t('share.filter_bot_only')}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('owner')}
              className={`rounded-[var(--r-md)] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === 'owner'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t('share.filter_owner_only')}
            </button>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('share.search_logs_placeholder')}
                className="h-7 w-44 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-7 pr-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]"
              />
            </form>

            <Button
              size="sm"
              variant="secondary"
              icon={<Download size={12} />}
              onClick={handleExport}
              disabled={!data || data.visits.length === 0}
            >
              {t('share.export_csv')}
            </Button>

            {/* Quick Clean Dropdown */}
            <div className="relative group">
              <Button
                size="sm"
                variant="secondary"
                className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
                icon={<Trash2 size={12} />}
                disabled={cleaning}
              >
                {t('share.clean_logs_btn')}
              </Button>
              <div className="absolute right-0 top-full z-[var(--z-menu)] mt-1 hidden min-w-[150px] rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 shadow-lg group-hover:block">
                <button
                  type="button"
                  onClick={() => void handleClean('bots')}
                  className="w-full rounded px-2 py-1 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  {t('share.clean_bots_only')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleClean('older_than', 30)}
                  className="w-full rounded px-2 py-1 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  {t('share.clean_older_30d')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleClean('all')}
                  className="w-full rounded px-2 py-1 text-left text-[11px] text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
                >
                  {t('share.clean_all_logs')}
                </button>
              </div>
            </div>

            <IconButton
              size="sm"
              label={t('common.refresh')}
              onClick={() => void fetchVisits(page, filter, search, noteId)}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </IconButton>
          </div>
        </div>

        {/* Logs Table */}
        <div className="max-h-[460px] overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 font-medium">{t('share.col_time')}</th>
                <th className="px-3 py-2 font-medium">{t('share.col_note')}</th>
                <th className="px-3 py-2 font-medium">{t('share.col_location')}</th>
                <th className="px-3 py-2 font-medium">{t('share.col_referrer')}</th>
                <th className="px-3 py-2 font-medium">{t('share.col_client')}</th>
                <th className="px-3 py-2 font-medium">{t('share.col_type')}</th>
                <th className="px-3 py-2 font-medium">{t('share.col_fp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data && data.visits.length > 0 ? (
                data.visits.map((log) => {
                  const flag = countryFlag(log.country)
                  const countryName = countryNameLocalized(log.country)

                  return (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      {/* Time */}
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-medium text-[var(--text-primary)]">
                            {relativeTime(log.visitedAt)}
                          </span>
                          <span className="text-[10px] text-[var(--text-quaternary)]">
                            {new Date(log.visitedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Note & Slug */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col max-w-[160px]">
                          <span className="truncate font-medium text-[12px] text-[var(--text-primary)]">
                            {log.noteTitle}
                          </span>
                          <span className="truncate font-mono text-[10px] text-[var(--text-quaternary)]">
                            {`/s/${log.slug}`}
                          </span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px]">{flag}</span>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {log.city ? `${countryName}, ${log.city}` : countryName}
                          </span>
                        </div>
                      </td>

                      {/* Referrer */}
                      <td className="px-3 py-2">
                        <span className="max-w-[140px] truncate text-[11px] text-[var(--text-tertiary)]">
                          {log.referrerHost || (
                            <span className="italic text-[var(--text-quaternary)]">
                              {t('share.direct_access')}
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Client (Device / OS / Browser) */}
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                          {deviceIcon(log.deviceType)}
                          <span>
                            {log.browser || 'Unknown'} / {log.os || 'Unknown'}
                          </span>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="whitespace-nowrap px-3 py-2">
                        {log.isBot ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 border border-amber-500/20">
                            <Bot size={11} /> {log.botName || 'Bot'}
                          </span>
                        ) : log.isOwner ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500 border border-blue-500/20">
                            <User size={11} /> {t('share.badge_owner')}
                          </span>
                        ) : log.isSelfReferrer ? (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-500 border border-purple-500/20">
                            {t('share.badge_self_referrer')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/20">
                            {t('share.badge_human')}
                          </span>
                        )}
                      </td>

                      {/* Fingerprint */}
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-[var(--text-quaternary)]">
                        {log.visitorFp ? log.visitorFp.slice(0, 8) : '-'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--text-quaternary)]">
                    {loading ? t('common.loading') : t('share.no_logs_found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-1 text-[11px] text-[var(--text-tertiary)]">
            <span>
              {t('share.page_info', { page: data.page, totalPages: data.totalPages })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page <= 1 || loading}
                onClick={() => {
                  const p = Math.max(1, data.page - 1)
                  setPage(p)
                  void fetchVisits(p, filter, search, noteId)
                }}
                icon={<ChevronLeft size={13} />}
              >
                {t('share.prev_page')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page >= data.totalPages || loading}
                onClick={() => {
                  const p = Math.min(data.totalPages, data.page + 1)
                  setPage(p)
                  void fetchVisits(p, filter, search, noteId)
                }}
                trailing={<ChevronRight size={13} />}
              >
                {t('share.next_page')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
