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
import { Modal } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { countryFlag, countryNameLocalized } from './share-helpers'
import type { useShareVisitLogs } from './use-share-visit-logs-modal'
import { useShareVisitLogs as useVisitLogs } from './use-share-visit-logs-modal'

type LogsBundle = ReturnType<typeof useShareVisitLogs>

export function ShareVisitLogsModal({
  open,
  onClose,
  initialNoteId,
}: {
  open: boolean
  onClose: () => void
  initialNoteId?: string
}) {
  const bundle = useVisitLogs(open, initialNoteId)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className='flex items-center gap-2'>
          <Activity size={17} className='text-[var(--accent)]' />
          <span>{t('share.visit_logs_title')}</span>
          {bundle.data && (
            <span className='rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[length:var(--text-11)] font-normal text-[var(--text-tertiary)] border border-[var(--border-subtle)]'>
              {t('share.total_records', { count: bundle.data.total })}
            </span>
          )}
        </div>
      }
      description={t('share.visit_logs_desc')}
      width={1050}
    >
      <div className='flex flex-col gap-3'>
        <VisitLogsToolbar bundle={bundle} />
        <LogsTable bundle={bundle} />
        {bundle.data && bundle.data.totalPages > 1 && <PaginationFooter bundle={bundle} />}
      </div>
    </Modal>
  )
}

function VisitLogsToolbar({ bundle }: { bundle: LogsBundle }) {
  const { filter, handleFilterChange, isLoading, isCleaning, data, handleExport, handleClean, search, setSearch, handleSearchSubmit, fetchVisits, page } = bundle
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5'>
      <div className='flex items-center gap-1'>
        <FilterTab active={filter === 'all'} label={t('share.filter_all_traffic')} onClick={() => handleFilterChange('all')} />
        <FilterTab active={filter === 'real'} label={t('share.filter_real_only')} onClick={() => handleFilterChange('real')} />
        <FilterTab active={filter === 'bot'} label={t('share.filter_bot_only')} onClick={() => handleFilterChange('bot')} />
        <FilterTab active={filter === 'owner'} label={t('share.filter_owner_only')} onClick={() => handleFilterChange('owner')} />
      </div>

      <div className='flex items-center gap-2'>
        <SearchBox value={search} onChange={setSearch} onSubmit={handleSearchSubmit} />

        <Button
          size='sm'
          variant='secondary'
          icon={<Download size={12} />}
          onClick={handleExport}
          disabled={!data || data.visits.length === 0}
        >
          {t('share.export_csv')}
        </Button>

        <CleanLogsMenu isCleaning={isCleaning} onClean={handleClean} />

        <IconButton
          size='sm'
          label={t('common.refresh')}
          onClick={() => void fetchVisits(page, filter, search)}
          disabled={isLoading}
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}

function FilterTab({ active, label, onClick }: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`rounded-[var(--r-md)] px-2.5 py-1 text-[length:var(--text-11)] font-medium transition-colors ${
        active
          ? 'bg-[var(--accent)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      {label}
    </button>
  )
}

function SearchBox({ value, onChange, onSubmit }: {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className='relative'>
      <input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('share.search_logs_placeholder')}
        className='h-7 w-44 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-7 pr-2 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
      />
      <Search
        size={12}
        className='absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]'
      />
    </form>
  )
}

function CleanLogsMenu({ isCleaning, onClean }: {
  isCleaning: boolean
  onClean: (type: 'bots' | 'older_than' | 'all', days?: number) => Promise<void>
}) {
  return (
    <div className='relative group'>
      <Button
        size='sm'
        variant='secondary'
        className='text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
        icon={<Trash2 size={12} />}
        disabled={isCleaning}
      >
        {t('share.clean_logs_btn')}
      </Button>
      <div className='absolute right-0 top-full z-[var(--z-menu)] mt-1 hidden min-w-[150px] rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow-pop)] group-hover:block'>
        <button
          type='button'
          onClick={() => void onClean('bots')}
          className='w-full rounded px-2 py-1 text-left text-[length:var(--text-11)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        >
          {t('share.clean_bots_only')}
        </button>
        <button
          type='button'
          onClick={() => void onClean('older_than', 30)}
          className='w-full rounded px-2 py-1 text-left text-[length:var(--text-11)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        >
          {t('share.clean_older_30d')}
        </button>
        <button
          type='button'
          onClick={() => void onClean('all')}
          className='w-full rounded px-2 py-1 text-left text-[length:var(--text-11)] text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
        >
          {t('share.clean_all_logs')}
        </button>
      </div>
    </div>
  )
}

function LogsTable({ bundle }: { bundle: LogsBundle }) {
  const { data, isLoading } = bundle
  return (
    <div className='max-h-[460px] overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)]'>
      <table className='w-full border-collapse text-left text-[length:var(--text-12)]'>
        <LogsTableHeader />
        <tbody className='divide-y divide-[var(--border-subtle)]'>
          {data && data.visits.length > 0 ? (
            data.visits.map((log) => (
              <LogRow key={log.id} log={log} />
            ))
          ) : (
            <tr>
              <td colSpan={7} className='py-12 text-center text-[var(--text-quaternary)]'>
                {isLoading ? t('common.loading') : t('share.no_logs_found')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function LogsTableHeader() {
  return (
    <thead className='sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[length:var(--text-11)] text-[var(--text-tertiary)] uppercase tracking-wider'>
      <tr>
        <th className='px-3 py-2 font-medium'>{t('share.col_time')}</th>
        <th className='px-3 py-2 font-medium'>{t('share.col_note')}</th>
        <th className='px-3 py-2 font-medium'>{t('share.col_location')}</th>
        <th className='px-3 py-2 font-medium'>{t('share.col_referrer')}</th>
        <th className='px-3 py-2 font-medium'>{t('share.col_client')}</th>
        <th className='px-3 py-2 font-medium'>{t('share.col_type')}</th>
        <th className='px-3 py-2 font-medium'>{t('share.col_fp')}</th>
      </tr>
    </thead>
  )
}

type VisitLog = ShareVisitsResponse['visits'][number]

function LogRow({ log }: {
  log: VisitLog
}) {
  const flag = countryFlag(log.country)
  const countryName = countryNameLocalized(log.country)
  return (
    <tr className='transition-colors hover:bg-[var(--bg-hover)]'>
      <VisitTimeCell log={log} />
      <VisitNoteCell log={log} />
      <VisitLocationCell log={log} flag={flag} countryName={countryName} />
      <VisitReferrerCell log={log} />
      <VisitClientCell log={log} />
      <td className='whitespace-nowrap px-3 py-2'>
        <VisitTypeBadge log={log} />
      </td>
      <td className='whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        {log.visitorFp ? log.visitorFp.slice(0, 8) : '-'}
      </td>
    </tr>
  )
}

function VisitTimeCell({ log }: { log: VisitLog }) {
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex flex-col'>
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-primary)]'>
          {relativeTime(log.visitedAt)}
        </span>
        <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {new Date(log.visitedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>
    </td>
  )
}

function VisitNoteCell({ log }: { log: VisitLog }) {
  return (
    <td className='px-3 py-2'>
      <div className='flex flex-col max-w-[160px]'>
        <span className='truncate font-medium text-[length:var(--text-12)] text-[var(--text-primary)]'>
          {log.noteTitle}
        </span>
        <span className='truncate font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {`/s/${log.slug}`}
        </span>
      </div>
    </td>
  )
}

function VisitLocationCell({ log, flag, countryName }: {
  log: VisitLog
  flag: string
  countryName: string
}) {
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex items-center gap-1.5'>
        <span className='text-[length:var(--text-14)]'>{flag}</span>
        <span className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          {log.city ? `${countryName}, ${log.city}` : countryName}
        </span>
      </div>
    </td>
  )
}

function VisitReferrerCell({ log }: { log: VisitLog }) {
  return (
    <td className='px-3 py-2'>
      <span className='max-w-[140px] truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {log.referrerHost || (
          <span className='italic text-[var(--text-quaternary)]'>
            {t('share.direct_access')}
          </span>
        )}
      </span>
    </td>
  )
}

function VisitClientCell({ log }: { log: VisitLog }) {
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex items-center gap-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
        {deviceIcon(log.deviceType)}
        <span>
          {log.browser || 'Unknown'} / {log.os || 'Unknown'}
        </span>
      </div>
    </td>
  )
}

function VisitTypeBadge({ log }: {
  log: ShareVisitsResponse['visits'][number]
}) {
  if (log.isBot) {
    return (
      <span className='inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-amber-500 border border-amber-500/20'>
        <Bot size={11} /> {log.botName || 'Bot'}
      </span>
    )
  }
  if (log.isOwner) {
    return (
      <span className='inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-blue-500 border border-blue-500/20'>
        <User size={11} /> {t('share.badge_owner')}
      </span>
    )
  }
  if (log.isSelfReferrer) {
    return (
      <span className='inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-purple-500 border border-purple-500/20'>
        {t('share.badge_self_referrer')}
      </span>
    )
  }
  return (
    <span className='inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-emerald-500 border border-emerald-500/20'>
      {t('share.badge_human')}
    </span>
  )
}

function deviceIcon(type?: string | null) {
  if (type === 'mobile') return <Smartphone size={12} className='text-[var(--text-tertiary)]' />
  if (type === 'tablet') return <Tablet size={12} className='text-[var(--text-tertiary)]' />
  return <Monitor size={12} className='text-[var(--text-tertiary)]' />
}

function PaginationFooter({ bundle }: { bundle: LogsBundle }) {
  const { data, setPage, isLoading, fetchVisits, filter, search } = bundle
  if (!data)
    return null
  return (
    <div className='flex items-center justify-between px-1 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      <span>
        {t('share.page_info', { page: data.page, totalPages: data.totalPages })}
      </span>
      <div className='flex items-center gap-1'>
        <Button
          size='sm'
          variant='secondary'
          disabled={data.page <= 1 || isLoading}
          onClick={() => {
            const p = Math.max(1, data.page - 1)
            setPage(p)
            void fetchVisits(p, filter, search)
          }}
          icon={<ChevronLeft size={13} />}
        >
          {t('share.prev_page')}
        </Button>
        <Button
          size='sm'
          variant='secondary'
          disabled={data.page >= data.totalPages || isLoading}
          onClick={() => {
            const p = Math.min(data.totalPages, data.page + 1)
            setPage(p)
            void fetchVisits(p, filter, search)
          }}
          trailing={<ChevronRight size={13} />}
        >
          {t('share.next_page')}
        </Button>
      </div>
    </div>
  )
}