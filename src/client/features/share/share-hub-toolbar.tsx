import { FileText, LayoutGrid, List, RefreshCw, Search, Settings } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Input, Segmented, Select } from '../../components/form'
import { t } from '../../lib/i18n'
import { SHARE_STATUS_FILTERS, type ShareStatusFilter } from '@shared/share-selection'
import { useShareStore } from './share-store'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'

/**
 * The row sizes itself and wraps instead of holding a fixed height: at phone width the controls beside
 * the search field are wider than the screen, and a nowrap row squeezed them rather than moving them —
 * the search box came out 44px wide and the two selects 18px and 27px, names unreadable, and axe could
 * not read the search field's background at all (the phone pass of `scripts/check-contrast.mjs` found
 * it). Wrapping is the music hub's toolbar shape, the search on one line and the controls on the next,
 * and the selects keep the right padding their field reserves for the chevron rather than cutting it
 * to 8px, which painted their text under their own icon.
 */
export function ShareHubToolbar({ onOpenLogs, onOpenSettings }: { onOpenLogs?: () => void; onOpenSettings?: () => void }) {
  const search = useShareStore((s) => s.search)
  const setSearch = useShareStore((s) => s.setSearch)
  const statusFilter = useShareStore((s) => s.statusFilter)
  const setStatusFilter = useShareStore((s) => s.setStatusFilter)
  const sort = useShareStore((s) => s.sort)
  const setSort = useShareStore((s) => s.setSort)
  const viewMode = useShareStore((s) => s.viewMode)
  const setViewMode = useShareStore((s) => s.setViewMode)
  const loadShares = useShareStore((s) => s.loadShares)
  const loading = useShareStore((s) => s.loading)

  return (
    <div className='flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2'>
      <SearchField value={search} onChange={setSearch} />
      <div className='flex flex-wrap items-center gap-2'>
        <StatusSelect value={statusFilter} onChange={setStatusFilter} />
        <SortSelect value={sort} onChange={setSort} />
        <ShareTrafficFilterPopover />
        {onOpenLogs && (
          <IconButton size='sm' label={t('share.visit_logs_title')} onClick={onOpenLogs}>
            <FileText size={13} />
          </IconButton>
        )}
        {onOpenSettings && (
          <IconButton size='sm' label={t('share.settings_modal_title')} onClick={onOpenSettings}>
            <Settings size={13} />
          </IconButton>
        )}
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <IconButton size='sm' label={t('common.refresh')} disabled={loading} onClick={() => void loadShares()}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className='flex w-full items-center sm:w-auto sm:max-w-sm sm:flex-1'>
      <Input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('share.search_placeholder')}
        aria-label={t('share.search_placeholder')}
        leading={<Search size={13} />}
        className='h-7 w-full bg-[var(--bg-card)] text-[length:var(--text-12)]'
      />
    </div>
  )
}

/**
 * The options are the shared vocabulary, so the toolbar cannot offer a status the worker would refuse
 * or omit one it knows; only the labels are the client's business.
 */
const STATUS_LABEL_KEYS: Record<ShareStatusFilter, Parameters<typeof t>[0]> = {
  all: 'share.status_all',
  active: 'share.status_active',
  pinned: 'share.category_pinned',
  starred: 'share.category_starred',
  paused: 'share.status_paused',
  password: 'share.category_password',
  expiring_soon: 'share.category_expiring_soon',
  expiring: 'share.category_expiring',
  permanent: 'share.category_permanent',
  expired: 'share.category_expired',
}

function StatusSelect({ value, onChange }: { value: ShareStatusFilter; onChange: (value: ShareStatusFilter) => void }) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as ShareStatusFilter)}
      aria-label={t('share.status_filter_label')}
      className='h-7 py-0 pl-2 text-[length:var(--text-12)]'
    >
      {SHARE_STATUS_FILTERS.map((status) => (
        <option key={status} value={status}>{t(STATUS_LABEL_KEYS[status])}</option>
      ))}
    </Select>
  )
}

function SortSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('share.sort_label')} className='h-7 py-0 pl-2 text-[length:var(--text-12)]'>
      <option value='views_desc'>{t('share.sort_views_desc')}</option>
      <option value='views_asc'>{t('share.sort_views_asc')}</option>
      <option value='recent_visit'>{t('share.sort_recent_visit')}</option>
      <option value='created_desc'>{t('share.sort_created_desc')}</option>
      <option value='title_asc'>{t('share.sort_title_asc')}</option>
      <option value='pinned_first'>{t('share.sort_pinned_first')}</option>
      <option value='expires_asc'>{t('share.sort_expires_asc')}</option>
    </Select>
  )
}

function ViewToggle({ value, onChange }: { value: 'table' | 'grid'; onChange: (value: 'table' | 'grid') => void }) {
  return (
    <Segmented
      size='sm'
      value={value}
      label={t('share.view_mode')}
      onChange={onChange}
      options={[
        { value: 'table', label: <List size={13} />, title: t('share.view_table') },
        { value: 'grid', label: <LayoutGrid size={13} />, title: t('share.view_grid') },
      ]}
    />
  )
}