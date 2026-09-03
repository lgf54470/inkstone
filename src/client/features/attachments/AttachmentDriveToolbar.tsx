import { useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Calendar,
  ChevronDown,
  Filter,
  Grid,
  HardDrive,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import type { AttachmentStats } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { Button } from '../../components/primitives'
import { Menu, Tooltip, type MenuItem } from '../../components/overlay'
import { formatFileSize } from './attachment-helpers'

export function AttachmentDriveToolbar({
  search,
  onSearchChange,
  sizeRange,
  onSizeRangeChange,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
  stats,
  onUploadClick,
  onPruneClick,
  pruning,
}: {
  search: string
  onSearchChange: (query: string) => void
  sizeRange: string
  onSizeRangeChange: (range: string) => void
  sort: string
  onSortChange: (sort: string) => void
  viewMode: 'grid' | 'list'
  onViewModeChange: (mode: 'grid' | 'list') => void
  zoom: 'sm' | 'md' | 'lg'
  onZoomChange: (zoom: 'sm' | 'md' | 'lg') => void
  stats?: AttachmentStats
  onUploadClick: () => void
  onPruneClick: () => void
  pruning?: boolean
}) {
  const sortButtonRef = useRef<HTMLButtonElement>(null)
  const sizeButtonRef = useRef<HTMLButtonElement>(null)
  const [sortOpen, setSortOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)

  const sortLabels: Record<string, string> = {
    date_desc: t('attachments.sort_date_desc'),
    date_asc: t('attachments.sort_date_asc'),
    name_asc: t('attachments.sort_name_asc'),
    name_desc: t('attachments.sort_name_desc'),
    size_desc: t('attachments.sort_size_desc'),
    size_asc: t('attachments.sort_size_asc'),
  }

  const sizeLabels: Record<string, string> = {
    all: t('attachments.size_all'),
    small: t('attachments.size_small'),
    medium: t('attachments.size_medium'),
    large: t('attachments.size_large'),
  }

  const sortMenuItems: MenuItem[] = [
    {
      id: 'date_desc',
      label: t('attachments.sort_date_desc'),
      icon: <Calendar size={13} />,
      onSelect: () => setSortChange('date_desc'),
    },
    {
      id: 'date_asc',
      label: t('attachments.sort_date_asc'),
      icon: <Calendar size={13} />,
      onSelect: () => setSortChange('date_asc'),
    },
    {
      id: 'name_asc',
      label: t('attachments.sort_name_asc'),
      icon: <ArrowDownAZ size={13} />,
      separatorBefore: true,
      onSelect: () => setSortChange('name_asc'),
    },
    {
      id: 'name_desc',
      label: t('attachments.sort_name_desc'),
      icon: <ArrowUpAZ size={13} />,
      onSelect: () => setSortChange('name_desc'),
    },
    {
      id: 'size_desc',
      label: t('attachments.sort_size_desc'),
      icon: <ArrowDownWideNarrow size={13} />,
      separatorBefore: true,
      onSelect: () => setSortChange('size_desc'),
    },
    {
      id: 'size_asc',
      label: t('attachments.sort_size_asc'),
      icon: <ArrowUpWideNarrow size={13} />,
      onSelect: () => setSortChange('size_asc'),
    },
  ]

  const sizeMenuItems: MenuItem[] = [
    {
      id: 'all',
      label: t('attachments.size_all'),
      onSelect: () => setSizeChange('all'),
    },
    {
      id: 'small',
      label: t('attachments.size_small'),
      onSelect: () => setSizeChange('small'),
    },
    {
      id: 'medium',
      label: t('attachments.size_medium'),
      onSelect: () => setSizeChange('medium'),
    },
    {
      id: 'large',
      label: t('attachments.size_large'),
      onSelect: () => setSizeChange('large'),
    },
  ]

  const setSortChange = (newSort: string) => {
    onSortChange(newSort)
    setSortOpen(false)
  }

  const setSizeChange = (newSize: string) => {
    onSizeRangeChange(newSize)
    setSizeOpen(false)
  }

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 bg-[var(--bg-surface)]">
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-quaternary)]"
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('common.search_notes_or_run_a_command')}
            className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pr-7 pl-8 text-[12.5px] outline-none transition-colors placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="relative">
          <button
            ref={sizeButtonRef}
            type="button"
            onClick={() => setSizeOpen((prev) => !prev)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border px-2.5 text-[12px] font-medium transition-colors',
              sizeRange !== 'all'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            <Filter size={12} />
            <span>{sizeLabels[sizeRange] || t('attachments.size_all')}</span>
            <ChevronDown size={11} className="opacity-60" />
          </button>
          <Menu
            open={sizeOpen}
            anchor={sizeButtonRef}
            items={sizeMenuItems}
            onClose={() => setSizeOpen(false)}
          />
        </div>

        <div className="relative">
          <button
            ref={sortButtonRef}
            type="button"
            onClick={() => setSortOpen((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <SlidersHorizontal size={12} />
            <span>{sortLabels[sort] || t('attachments.sort_date_desc')}</span>
            <ChevronDown size={11} className="opacity-60" />
          </button>
          <Menu
            open={sortOpen}
            anchor={sortButtonRef}
            items={sortMenuItems}
            onClose={() => setSortOpen(false)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {stats && (
          <div className="hidden xl:flex items-center gap-2 text-[11.5px] text-[var(--text-tertiary)] bg-[var(--bg-sunken)] px-2.5 py-1 rounded-[var(--r-md)]">
            <HardDrive size={12} className="text-[var(--accent)]" />
            <span>
              {t('attachments.storage_summary', {
                value0: stats.totalCount,
                value1: formatFileSize(stats.totalBytes),
              })}
            </span>
          </div>
        )}

        <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5">
          <Tooltip label={t('attachments.view_grid')}>
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={cn(
                'rounded p-1 text-[var(--text-tertiary)] transition-colors',
                viewMode === 'grid'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs'
                  : 'hover:text-[var(--text-primary)]',
              )}
            >
              <Grid size={14} />
            </button>
          </Tooltip>
          <Tooltip label={t('attachments.view_list')}>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className={cn(
                'rounded p-1 text-[var(--text-tertiary)] transition-colors',
                viewMode === 'list'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs'
                  : 'hover:text-[var(--text-primary)]',
              )}
            >
              <List size={14} />
            </button>
          </Tooltip>
        </div>

        {viewMode === 'grid' && (
          <div className="hidden sm:flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">
            <button
              type="button"
              onClick={() => onZoomChange('sm')}
              className={cn(
                'rounded px-1.5 py-0.5 transition-colors',
                zoom === 'sm' ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs' : 'hover:text-[var(--text-primary)]',
              )}
            >
              {t('attachments.zoom_sm')}
            </button>
            <button
              type="button"
              onClick={() => onZoomChange('md')}
              className={cn(
                'rounded px-1.5 py-0.5 transition-colors',
                zoom === 'md' ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs' : 'hover:text-[var(--text-primary)]',
              )}
            >
              {t('attachments.zoom_md')}
            </button>
            <button
              type="button"
              onClick={() => onZoomChange('lg')}
              className={cn(
                'rounded px-1.5 py-0.5 transition-colors',
                zoom === 'lg' ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs' : 'hover:text-[var(--text-primary)]',
              )}
            >
              {t('attachments.zoom_lg')}
            </button>
          </div>
        )}

        <Tooltip label={t('attachments.cleanup')}>
          <Button
            size="sm"
            variant="secondary"
            disabled={pruning}
            icon={<Sparkles size={13} className="text-[var(--warning)]" />}
            onClick={onPruneClick}
          >
            {pruning ? t('common.loading') : t('attachments.cleanup')}
          </Button>
        </Tooltip>

        <Button
          size="sm"
          icon={<Upload size={13} />}
          onClick={onUploadClick}
        >
          {t('attachments.upload_file')}
        </Button>
      </div>
    </div>
  )
}
