import { FileText, LayoutGrid, List, RefreshCw, Search, Settings } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Input, Segmented, Select } from '../../components/form'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'

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
    <div className='flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4'>
      <SearchField value={search} onChange={setSearch} />
      <div className='flex items-center gap-2'>
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
    <div className='flex flex-1 items-center max-w-sm'>
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

function StatusSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('share.status_filter_label')} className='h-7 text-[length:var(--text-12)] py-0 px-2'>
      <option value='all'>{t('share.status_all')}</option>
      <option value='active'>{t('share.status_active')}</option>
      <option value='pinned'>{t('share.category_pinned')}</option>
      <option value='starred'>{t('share.category_starred')}</option>
      <option value='paused'>{t('share.status_paused')}</option>
      <option value='password'>{t('share.category_password')}</option>
      <option value='expiring_soon'>{t('share.category_expiring_soon')}</option>
      <option value='expiring'>{t('share.category_expiring')}</option>
      <option value='permanent'>{t('share.category_permanent')}</option>
      <option value='expired'>{t('share.category_expired')}</option>
    </Select>
  )
}

function SortSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('share.sort_label')} className='h-7 text-[length:var(--text-12)] py-0 px-2'>
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