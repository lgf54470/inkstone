import { useMemo, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Calendar,
  ChevronDown,
  FileType,
  Filter,
  Grid,
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

export function AttachmentDriveToolbar({
  search,
  onSearchChange,
  extension,
  onExtensionChange,
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
  extension: string
  onExtensionChange: (ext: string) => void
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
  const extButtonRef = useRef<HTMLButtonElement>(null)
  const sizeButtonRef = useRef<HTMLButtonElement>(null)
  const sortButtonRef = useRef<HTMLButtonElement>(null)
  const [isExtOpen, setIsExtOpen] = useState(false)
  const [isSizeOpen, setIsSizeOpen] = useState(false)
  const [isSortOpen, setIsSortOpen] = useState(false)

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
      onSelect: () => {
        onSortChange('date_desc')
        setIsSortOpen(false)
      },
    },
    {
      id: 'date_asc',
      label: t('attachments.sort_date_asc'),
      icon: <Calendar size={13} />,
      onSelect: () => {
        onSortChange('date_asc')
        setIsSortOpen(false)
      },
    },
    {
      id: 'name_asc',
      label: t('attachments.sort_name_asc'),
      icon: <ArrowDownAZ size={13} />,
      separatorBefore: true,
      onSelect: () => {
        onSortChange('name_asc')
        setIsSortOpen(false)
      },
    },
    {
      id: 'name_desc',
      label: t('attachments.sort_name_desc'),
      icon: <ArrowUpAZ size={13} />,
      onSelect: () => {
        onSortChange('name_desc')
        setIsSortOpen(false)
      },
    },
    {
      id: 'size_desc',
      label: t('attachments.sort_size_desc'),
      icon: <ArrowDownWideNarrow size={13} />,
      separatorBefore: true,
      onSelect: () => {
        onSortChange('size_desc')
        setIsSortOpen(false)
      },
    },
    {
      id: 'size_asc',
      label: t('attachments.sort_size_asc'),
      icon: <ArrowUpWideNarrow size={13} />,
      onSelect: () => {
        onSortChange('size_asc')
        setIsSortOpen(false)
      },
    },
  ]

  const sizeMenuItems: MenuItem[] = [
    {
      id: 'all',
      label: t('attachments.size_all'),
      onSelect: () => {
        onSizeRangeChange('all')
        setIsSizeOpen(false)
      },
    },
    {
      id: 'small',
      label: t('attachments.size_small'),
      onSelect: () => {
        onSizeRangeChange('small')
        setIsSizeOpen(false)
      },
    },
    {
      id: 'medium',
      label: t('attachments.size_medium'),
      onSelect: () => {
        onSizeRangeChange('medium')
        setIsSizeOpen(false)
      },
    },
    {
      id: 'large',
      label: t('attachments.size_large'),
      onSelect: () => {
        onSizeRangeChange('large')
        setIsSizeOpen(false)
      },
    },
  ]

  const extensionMenuItems = useMemo((): MenuItem[] => {
    const items: MenuItem[] = [
      {
        id: 'all',
        label: t('attachments.type_all'),
        onSelect: () => {
          onExtensionChange('all')
          setIsExtOpen(false)
        },
      },
      {
        id: 'png',
        label: 'PNG (.png)',
        onSelect: () => {
          onExtensionChange('png')
          setIsExtOpen(false)
        },
      },
      {
        id: 'jpg',
        label: 'JPG / JPEG (.jpg, .jpeg)',
        onSelect: () => {
          onExtensionChange('jpg,jpeg')
          setIsExtOpen(false)
        },
      },
      {
        id: 'webp',
        label: 'WEBP (.webp)',
        onSelect: () => {
          onExtensionChange('webp')
          setIsExtOpen(false)
        },
      },
      {
        id: 'gif',
        label: 'GIF (.gif)',
        onSelect: () => {
          onExtensionChange('gif')
          setIsExtOpen(false)
        },
      },
      {
        id: 'svg',
        label: 'SVG (.svg)',
        onSelect: () => {
          onExtensionChange('svg')
          setIsExtOpen(false)
        },
      },
      {
        id: 'pdf',
        label: 'PDF (.pdf)',
        separatorBefore: true,
        onSelect: () => {
          onExtensionChange('pdf')
          setIsExtOpen(false)
        },
      },
      {
        id: 'docx',
        label: 'Word (.doc, .docx)',
        onSelect: () => {
          onExtensionChange('doc,docx')
          setIsExtOpen(false)
        },
      },
      {
        id: 'xlsx',
        label: 'Excel (.xls, .xlsx)',
        onSelect: () => {
          onExtensionChange('xls,xlsx')
          setIsExtOpen(false)
        },
      },
      {
        id: 'txt',
        label: 'TXT / MD (.txt, .md)',
        onSelect: () => {
          onExtensionChange('txt,md')
          setIsExtOpen(false)
        },
      },
      {
        id: 'zip',
        label: 'ZIP / 7Z / TAR (.zip, .7z, .tar, .rar)',
        separatorBefore: true,
        onSelect: () => {
          onExtensionChange('zip,7z,tar,rar,gz')
          setIsExtOpen(false)
        },
      },
      {
        id: 'media',
        label: 'MP4 / MP3 / Media (.mp4, .mp3, .wav)',
        onSelect: () => {
          onExtensionChange('mp4,mp3,wav,mov,webm')
          setIsExtOpen(false)
        },
      },
    ]

    if (stats?.extensionBreakdown) {
      const topKeys = Object.keys(stats.extensionBreakdown)
        .filter((k) => !['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'md', 'zip', '7z', 'tar', 'rar', 'gz', 'mp4', 'mp3', 'wav', 'mov', 'webm'].includes(k))
        .slice(0, 5)

      if (topKeys.length > 0) {
        topKeys.forEach((key) => {
          items.push({
            id: key,
            label: `.${key.toUpperCase()}`,
            onSelect: () => {
              onExtensionChange(key)
              setIsExtOpen(false)
            },
          })
        })
      }
    }

    return items
  }, [stats?.extensionBreakdown, onExtensionChange])

  const currentExtLabel = useMemo(() => {
    if (!extension || extension === 'all') return t('attachments.type_all')
    const parts = extension.split(',')
    if (parts.length === 1 && parts[0]) return `.${parts[0].toUpperCase()}`
    return `.${parts[0]?.toUpperCase() ?? ''}+`
  }, [extension])

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 bg-[var(--bg-surface)] overflow-x-auto min-w-0">
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        <div className="relative w-36 sm:w-44 lg:w-52 shrink-0">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-quaternary)]"
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('attachments.search_placeholder')}
            className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pr-7 pl-8 text-[12.5px] outline-none transition-colors placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            ref={extButtonRef}
            type="button"
            onClick={() => setIsExtOpen((prev) => !prev)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-md)] border px-2.5 text-[12px] font-medium transition-colors cursor-pointer select-none',
              extension && extension !== 'all'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            <FileType size={12} className="shrink-0" />
            <span className="whitespace-nowrap">{currentExtLabel}</span>
            <ChevronDown size={11} className="opacity-60 shrink-0" />
          </button>
          <Menu
            open={isExtOpen}
            anchor={extButtonRef}
            items={extensionMenuItems}
            onClose={() => setIsExtOpen(false)}
          />
        </div>

        <div className="relative shrink-0">
          <button
            ref={sizeButtonRef}
            type="button"
            onClick={() => setIsSizeOpen((prev) => !prev)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-md)] border px-2.5 text-[12px] font-medium transition-colors cursor-pointer select-none',
              sizeRange !== 'all'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            <Filter size={12} className="shrink-0" />
            <span className="whitespace-nowrap">{sizeLabels[sizeRange] || t('attachments.size_all')}</span>
            <ChevronDown size={11} className="opacity-60 shrink-0" />
          </button>
          <Menu
            open={isSizeOpen}
            anchor={sizeButtonRef}
            items={sizeMenuItems}
            onClose={() => setIsSizeOpen(false)}
          />
        </div>

        <div className="relative shrink-0">
          <button
            ref={sortButtonRef}
            type="button"
            onClick={() => setIsSortOpen((prev) => !prev)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer select-none"
          >
            <SlidersHorizontal size={12} className="shrink-0" />
            <span className="whitespace-nowrap">{sortLabels[sort] || t('attachments.sort_date_desc')}</span>
            <ChevronDown size={11} className="opacity-60 shrink-0" />
          </button>
          <Menu
            open={isSortOpen}
            anchor={sortButtonRef}
            items={sortMenuItems}
            onClose={() => setIsSortOpen(false)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 shrink-0">
          <Tooltip label={t('attachments.view_grid')}>
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={cn(
                'rounded p-1 text-[var(--text-tertiary)] transition-colors cursor-pointer',
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
                'rounded p-1 text-[var(--text-tertiary)] transition-colors cursor-pointer',
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
          <div className="hidden lg:flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 text-[11px] font-medium shrink-0">
            <button
              type="button"
              onClick={() => onZoomChange('sm')}
              className={cn(
                'px-1.5 py-0.5 rounded cursor-pointer',
                zoom === 'sm' ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              )}
            >
              {t('attachments.zoom_sm')}
            </button>
            <button
              type="button"
              onClick={() => onZoomChange('md')}
              className={cn(
                'px-1.5 py-0.5 rounded cursor-pointer',
                zoom === 'md' ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              )}
            >
              {t('attachments.zoom_md')}
            </button>
            <button
              type="button"
              onClick={() => onZoomChange('lg')}
              className={cn(
                'px-1.5 py-0.5 rounded cursor-pointer',
                zoom === 'lg' ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              )}
            >
              {t('attachments.zoom_lg')}
            </button>
          </div>
        )}

        <Button
          size="sm"
          variant="secondary"
          onClick={onPruneClick}
          disabled={pruning}
          className="shrink-0 whitespace-nowrap text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
        >
          <Sparkles size={12} className={cn(pruning && 'animate-spin')} />
          <span className="whitespace-nowrap">{t('attachments.cleanup')}</span>
        </Button>

        <Button
          size="sm"
          onClick={onUploadClick}
          className="shrink-0 whitespace-nowrap bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90 cursor-pointer"
        >
          <Upload size={12} />
          <span className="whitespace-nowrap">{t('attachments.upload_file')}</span>
        </Button>
      </div>
    </div>
  )
}
