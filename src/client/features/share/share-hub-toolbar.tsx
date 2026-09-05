import { FileText, LayoutGrid, List, RefreshCw, Search, Settings } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Select } from '../../components/form'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'

export function ShareHubToolbar({
  onOpenLogs,
  onOpenSettings,
}: {
  onOpenLogs?: () => void
  onOpenSettings?: () => void
}) {
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
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4">
      <div className="flex flex-1 items-center gap-2 max-w-sm">
        <div className="flex h-7 w-full items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 focus-within:border-[var(--accent)]">
          <Search size={13} className="text-[var(--text-quaternary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('share.search_placeholder')}
            className="w-full bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)]"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-7 text-[12px] py-0 px-2"
        >
          <option value="all">{t('share.status_all')}</option>
          <option value="active">{t('share.status_active')}</option>
          <option value="pinned">{t('share.category_pinned')}</option>
          <option value="starred">{t('share.category_starred')}</option>
          <option value="paused">{t('share.status_paused')}</option>
          <option value="password">{t('share.category_password')}</option>
          <option value="expiring">{t('share.category_expiring')}</option>
          <option value="permanent">{t('share.category_permanent')}</option>
          <option value="expired">{t('share.category_expired')}</option>
        </Select>

        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-7 text-[12px] py-0 px-2"
        >
          <option value="views_desc">{t('share.sort_views_desc')}</option>
          <option value="views_asc">{t('share.sort_views_asc')}</option>
          <option value="recent_visit">{t('share.sort_recent_visit')}</option>
          <option value="created_desc">{t('share.sort_created_desc')}</option>
          <option value="title_asc">{t('share.sort_title_asc')}</option>
          <option value="pinned_first">{t('share.sort_pinned_first')}</option>
          <option value="expires_asc">{t('share.sort_expires_asc')}</option>
        </Select>

        <ShareTrafficFilterPopover />

        {onOpenLogs && (
          <IconButton
            size="sm"
            label={t('share.visit_logs_title')}
            onClick={onOpenLogs}
          >
            <FileText size={13} />
          </IconButton>
        )}

        {onOpenSettings && (
          <IconButton
            size="sm"
            label={t('share.settings_modal_title')}
            onClick={onOpenSettings}
          >
            <Settings size={13} />
          </IconButton>
        )}

        <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5">
          <IconButton
            size="sm"
            label={t('share.view_table')}
            active={viewMode === 'table'}
            onClick={() => setViewMode('table')}
          >
            <List size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label={t('share.view_grid')}
            active={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid size={13} />
          </IconButton>
        </div>

        <IconButton
          size="sm"
          label={t('common.refresh')}
          disabled={loading}
          onClick={() => void loadShares()}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}
