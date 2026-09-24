import {
    Activity,
    ChevronLeft,
    ChevronRight,
    Download,
    RefreshCw,
    Search,
    Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { ShareTimelineRange } from '@shared/types'
import { Menu, Modal, type MenuItem } from '../../components/overlay'
import { Input, Segmented } from '../../components/form'
import { Button, IconButton } from '../../components/primitives'
import { LoadErrorState } from './share-load-error'
import { LogsTable } from './share-visit-logs-table'
import { formatNumber } from '../../lib/time'
import { t } from '../../lib/i18n'
import { useSession } from '../../store/session'
import { rangeOptions, visitorCountNote, type VisitFilter } from './share-helpers'
import { ShareSessionsPanel } from './share-sessions-panel'
import { useShareSessions } from './use-share-sessions'
import type { useShareVisitLogs } from './use-share-visit-logs-modal'
import { useShareVisitLogs as useVisitLogs } from './use-share-visit-logs-modal'

const MODAL_WIDTH = 1050

type LogsBundle = ReturnType<typeof useShareVisitLogs>
type SessionsBundle = ReturnType<typeof useShareSessionsView>

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
  const sessions = useShareSessionsView(open)
  const fingerprints = useSession((s) => s.site?.visitorFingerprints ?? true)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<VisitLogsTitle total={bundle.data?.total} />}
      description={t('share.visit_logs_desc')}
      width={MODAL_WIDTH}
    >
      <div className='flex flex-col gap-3'>
        <VisitLogsToolbar bundle={bundle} sessions={sessions} />
        {sessions.mode === 'rows' ? (
          bundle.error ? (
            <LoadErrorState
              label={t('share.logs_load_failed')}
              onRetry={() => void bundle.fetchVisits(bundle.page, bundle.filter, bundle.search)}
            />
          ) : (
            <>
              <ExportProgressRow progress={bundle.exportProgress} />
              <LogsTable bundle={bundle} />
              {/* The table lists fingerprints, not people: the same visitor counts once per UTC day,
                  and everyone behind one address shares one. Saying so is what keeps a UV number
                  readable — and an instance that keeps no fingerprint says that instead of this
                  caliber. */}
              <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
                {visitorCountNote(fingerprints)}
              </p>
              {bundle.data && bundle.data.totalPages > 1 && <PaginationFooter bundle={bundle} />}
            </>
          )
        ) : (
          <ShareSessionsPanel bundle={sessions} />
        )}
      </div>
    </Modal>
  )
}

/** The heading carries the record count of the page on screen, and nothing while there is no page. */
function VisitLogsTitle({ total }: { total: number | undefined }) {
  return (
    <div className='flex items-center gap-2'>
      <Activity size={17} className='text-[var(--accent)]' />
      <span>{t('share.visit_logs_title')}</span>
      {total !== undefined && (
        <span className='rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[length:var(--text-11)] font-normal text-[var(--text-tertiary)] border border-[var(--border-subtle)]'>
          {t('share.total_records', { count: total })}
        </span>
      )}
    </div>
  )
}

/**
 * The session view's own state: which mode the panel is in, the window it covers, and the traffic
 * filter it asks for (ADR-0003). It is deliberately separate from the log's filter, which speaks a
 * vocabulary sessions cannot express — "bots only" and "the author only" are not things a visitor's
 * sittings can be narrowed to, and quietly substituting another filter would misreport the range.
 */
function useShareSessionsView(open: boolean) {
  const [mode, setMode] = useState<'rows' | 'sessions'>('rows')
  const [range, setRange] = useState<ShareTimelineRange>('30d')
  const [excludeReal, setExcludeReal] = useState(true)
  const filters = {
    excludeBots: excludeReal,
    excludeSelf: excludeReal,
    excludeOwner: excludeReal,
  }
  const bundle = useShareSessions({ open: open && mode === 'sessions', range, filters })
  return { ...bundle, mode, setMode, range, setRange, excludeReal, setExcludeReal }
}

/**
 * A long export is a walk of many pages, so it reports where it is and renders nothing at
 * all once it is done: the line appears below the toolbar rather than inside it, so opening
 * and closing it can never move the buttons the person is aiming at.
 */
function ExportProgressRow({ progress }: { progress: LogsBundle['exportProgress'] }) {
  if (!progress) return null
  return (
    <p role='status' className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      {t('share.export_progress', { loaded: formatNumber(progress.loaded), total: formatNumber(progress.total) })}
    </p>
  )
}

function VisitLogsToolbar({ bundle, sessions }: { bundle: LogsBundle; sessions: SessionsBundle }) {
  const isRows = sessions.mode === 'rows'
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5'>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Segmented
          size='sm'
          label={t('share.view_mode_label')}
          value={sessions.mode}
          onChange={(value) => sessions.setMode(value as 'rows' | 'sessions')}
          options={[
            { value: 'rows', label: t('share.view_logs') },
            { value: 'sessions', label: t('share.view_sessions') },
          ]}
        />
        {isRows ? <RowFilterSwitch bundle={bundle} /> : <SessionFilterSwitch sessions={sessions} />}
      </div>
      <div className='flex items-center gap-2'>
        {isRows ? <RowActions bundle={bundle} /> : <SessionActions sessions={sessions} />}
      </div>
    </div>
  )
}

/**
 * The row vocabulary is four classes (all, real, bots, the author), and search and CSV export only
 * mean anything for rows — which is exactly why the two modes each render their own controls
 * instead of one set that would be dead half the time. Sessions cannot be searched or exported, and
 * "bots only" is not something a visitor's sittings can be narrowed to.
 */
function RowFilterSwitch({ bundle }: { bundle: LogsBundle }) {
  return (
    <Segmented
      size='sm'
      label={t('share.filter_traffic_title')}
      value={bundle.filter}
      onChange={(value) => bundle.handleFilterChange(value as VisitFilter)}
      options={[
        { value: 'all', label: t('share.filter_all_traffic') },
        { value: 'real', label: t('share.filter_real_only') },
        { value: 'bot', label: t('share.filter_bot_only') },
        { value: 'owner', label: t('share.filter_owner_only') },
      ]}
    />
  )
}

function RowActions({ bundle }: { bundle: LogsBundle }) {
  const { isLoading, isExporting, isCleaning, data, handleExport, handleClean, search, setSearch, handleSearchSubmit, fetchVisits, page, filter } = bundle
  return (
    <>
      <SearchBox value={search} onChange={setSearch} onSubmit={handleSearchSubmit} />
      <Button
        size='sm'
        variant='secondary'
        icon={<Download size={12} />}
        onClick={() => void handleExport()}
        disabled={!data || data.visits.length === 0 || isExporting}
      >
        {t('share.export_csv')}
      </Button>
      <CleanLogsMenu isCleaning={isCleaning} onClean={handleClean} />
      <RefreshButton isLoading={isLoading} onClick={() => void fetchVisits(page, filter, search)} />
    </>
  )
}

function SessionFilterSwitch({ sessions }: { sessions: SessionsBundle }) {
  return (
    <>
      <Segmented
        size='sm'
        label={t('share.sessions_filter_label')}
        value={sessions.excludeReal ? 'real' : 'all'}
        onChange={(value) => sessions.setExcludeReal(value === 'real')}
        options={[
          { value: 'real', label: t('share.filter_real_only') },
          { value: 'all', label: t('share.filter_all_traffic') },
        ]}
      />
      <Segmented
        size='sm'
        label={t('share.sessions_range_label')}
        value={sessions.range}
        onChange={(value) => sessions.setRange(value as ShareTimelineRange)}
        options={rangeOptions().map((option) => ({ value: option.value, label: option.label }))}
      />
    </>
  )
}

function SessionActions({ sessions }: { sessions: SessionsBundle }) {
  return <RefreshButton isLoading={sessions.isLoading} onClick={sessions.reload} />
}

function RefreshButton({ isLoading, onClick }: { isLoading: boolean; onClick: () => void }) {
  return (
    <IconButton size='sm' label={t('common.refresh')} onClick={onClick} disabled={isLoading}>
      <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
    </IconButton>
  )
}

function SearchBox({ value, onChange, onSubmit }: {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit}>
      <Input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('share.search_logs_placeholder')}
        aria-label={t('share.search_logs_placeholder')}
        leading={<Search size={12} />}
        className='h-7 w-44 text-[length:var(--text-11)] bg-[var(--bg-base)]'
      />
    </form>
  )
}

function CleanLogsMenu({ isCleaning, onClean }: {
  isCleaning: boolean
  onClean: (type: 'bots' | 'older_than' | 'all', days?: number) => Promise<void>
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const items: MenuItem[] = [
    { id: 'bots', label: t('share.clean_bots_only'), onSelect: () => void onClean('bots') },
    { id: 'older', label: t('share.clean_older_30d'), onSelect: () => void onClean('older_than', 30) },
    { id: 'all', label: t('share.clean_all_logs'), tone: 'danger', onSelect: () => void onClean('all') },
  ]
  return (
    <>
      <Button
        ref={buttonRef}
        size='sm'
        variant='secondary'
        className='text-[var(--danger)] hover:bg-[var(--danger-soft)]'
        icon={<Trash2 size={12} />}
        disabled={isCleaning}
        aria-haspopup='menu'
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t('share.clean_logs_btn')}
      </Button>
      {open && <Menu open={open} anchor={buttonRef} items={items} align='end' onClose={() => setOpen(false)} />}
    </>
  )
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