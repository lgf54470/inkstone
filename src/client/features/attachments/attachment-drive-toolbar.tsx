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

const KNOWN_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'md', 'zip', '7z', 'tar', 'rar', 'gz', 'mp4', 'mp3', 'wav', 'mov', 'webm']

function sortLabelOf(sort: string): string {
  if (sort === 'date_asc') return t('attachments.sort_date_asc')
  if (sort === 'name_asc') return t('attachments.sort_name_asc')
  if (sort === 'name_desc') return t('attachments.sort_name_desc')
  if (sort === 'size_desc') return t('attachments.sort_size_desc')
  if (sort === 'size_asc') return t('attachments.sort_size_asc')
  return t('attachments.sort_date_desc')
}

function sizeLabelOf(range: string): string {
  if (range === 'small') return t('attachments.size_small')
  if (range === 'medium') return t('attachments.size_medium')
  if (range === 'large') return t('attachments.size_large')
  return t('attachments.size_all')
}


interface AttachmentDriveToolbarProps {
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
}

function buildSortMenuItems(onSortChange: (sort: string) => void, onClose: () => void): MenuItem[] {
  const pick = (sort: string) => () => {
    onSortChange(sort)
    onClose()
  }
  return [
    { id: 'date_desc', label: t('attachments.sort_date_desc'), icon: <Calendar size={13} />, onSelect: pick('date_desc') },
    { id: 'date_asc', label: t('attachments.sort_date_asc'), icon: <Calendar size={13} />, onSelect: pick('date_asc') },
    { id: 'name_asc', label: t('attachments.sort_name_asc'), icon: <ArrowDownAZ size={13} />, separatorBefore: true, onSelect: pick('name_asc') },
    { id: 'name_desc', label: t('attachments.sort_name_desc'), icon: <ArrowUpAZ size={13} />, onSelect: pick('name_desc') },
    { id: 'size_desc', label: t('attachments.sort_size_desc'), icon: <ArrowDownWideNarrow size={13} />, separatorBefore: true, onSelect: pick('size_desc') },
    { id: 'size_asc', label: t('attachments.sort_size_asc'), icon: <ArrowUpWideNarrow size={13} />, onSelect: pick('size_asc') },
  ]
}

function buildSizeMenuItems(onSizeRangeChange: (range: string) => void, onClose: () => void): MenuItem[] {
  const pick = (range: string) => () => {
    onSizeRangeChange(range)
    onClose()
  }
  return [
    { id: 'all', label: t('attachments.size_all'), onSelect: pick('all') },
    { id: 'small', label: t('attachments.size_small'), onSelect: pick('small') },
    { id: 'medium', label: t('attachments.size_medium'), onSelect: pick('medium') },
    { id: 'large', label: t('attachments.size_large'), onSelect: pick('large') },
  ]
}

function buildExtensionMenuItems(stats: AttachmentStats | undefined, onExtensionChange: (ext: string) => void, onClose: () => void): MenuItem[] {
  const pick = (ext: string) => () => {
    onExtensionChange(ext)
    onClose()
  }
  const items: MenuItem[] = [
    { id: 'all', label: t('attachments.type_all'), onSelect: pick('all') },
    { id: 'png', label: 'PNG (.png)', onSelect: pick('png') },
    { id: 'jpg', label: 'JPG / JPEG (.jpg, .jpeg)', onSelect: pick('jpg,jpeg') },
    { id: 'webp', label: 'WEBP (.webp)', onSelect: pick('webp') },
    { id: 'gif', label: 'GIF (.gif)', onSelect: pick('gif') },
    { id: 'svg', label: 'SVG (.svg)', onSelect: pick('svg') },
    { id: 'pdf', label: 'PDF (.pdf)', separatorBefore: true, onSelect: pick('pdf') },
    { id: 'docx', label: 'Word (.doc, .docx)', onSelect: pick('doc,docx') },
    { id: 'xlsx', label: 'Excel (.xls, .xlsx)', onSelect: pick('xls,xlsx') },
    { id: 'txt', label: 'TXT / MD (.txt, .md)', onSelect: pick('txt,md') },
    { id: 'zip', label: 'ZIP / 7Z / TAR (.zip, .7z, .tar, .rar)', separatorBefore: true, onSelect: pick('zip,7z,tar,rar,gz') },
    { id: 'media', label: 'MP4 / MP3 / Media (.mp4, .mp3, .wav)', onSelect: pick('mp4,mp3,wav,mov,webm') },
  ]

  if (stats?.extensionBreakdown) {
    const topKeys = Object.keys(stats.extensionBreakdown)
      .filter((k) => !KNOWN_EXTENSIONS.includes(k))
      .slice(0, 5)
    topKeys.forEach((key) => {
      items.push({ id: key, label: `.${key.toUpperCase()}`, onSelect: pick(key) })
    })
  }

  return items
}

function extLabelOf(extension: string): string {
  if (!extension || extension === 'all') return t('attachments.type_all')
  const parts = extension.split(',')
  if (parts.length === 1 && parts[0]) return `.${parts[0].toUpperCase()}`
  return `.${parts[0]?.toUpperCase() ?? ''}+`
}

export function AttachmentDriveToolbar(props: AttachmentDriveToolbarProps) {
  const { search, onSearchChange, extension, onExtensionChange, sizeRange, onSizeRangeChange, sort, onSortChange, viewMode, onViewModeChange, zoom, onZoomChange, stats, onUploadClick, onPruneClick, pruning } = props
  const extButtonRef = useRef<HTMLButtonElement>(null)
  const sizeButtonRef = useRef<HTMLButtonElement>(null)
  const sortButtonRef = useRef<HTMLButtonElement>(null)
  const [isExtOpen, setIsExtOpen] = useState(false)
  const [isSizeOpen, setIsSizeOpen] = useState(false)
  const [isSortOpen, setIsSortOpen] = useState(false)

  const extensionMenuItems = useMemo(
    () => buildExtensionMenuItems(stats, onExtensionChange, () => setIsExtOpen(false)),
    [stats?.extensionBreakdown, onExtensionChange],
  )

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 bg-[var(--bg-surface)] overflow-x-auto min-w-0">
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        <SearchBox search={search} onSearchChange={onSearchChange} />
        <FilterDropdown buttonRef={extButtonRef} isOpen={isExtOpen} onToggle={() => setIsExtOpen((p) => !p)} onClose={() => setIsExtOpen(false)} isActive={Boolean(extension && extension !== 'all')} icon={<FileType size={12} className="shrink-0" />} label={extLabelOf(extension)} items={extensionMenuItems} />
        <FilterDropdown buttonRef={sizeButtonRef} isOpen={isSizeOpen} onToggle={() => setIsSizeOpen((p) => !p)} onClose={() => setIsSizeOpen(false)} isActive={sizeRange !== 'all'} icon={<Filter size={12} className="shrink-0" />} label={sizeLabelOf(sizeRange)} items={buildSizeMenuItems(onSizeRangeChange, () => setIsSizeOpen(false))} />
        <FilterDropdown buttonRef={sortButtonRef} isOpen={isSortOpen} onToggle={() => setIsSortOpen((p) => !p)} onClose={() => setIsSortOpen(false)} isActive={false} icon={<SlidersHorizontal size={12} className="shrink-0" />} label={sortLabelOf(sort)} items={buildSortMenuItems(onSortChange, () => setIsSortOpen(false))} />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
        {viewMode === 'grid' && <ZoomControl zoom={zoom} onZoomChange={onZoomChange} />}
        <Button size="sm" variant="secondary" onClick={onPruneClick} disabled={pruning} className="shrink-0 whitespace-nowrap text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer">
          <Sparkles size={12} className={cn(pruning && 'animate-spin')} />
          <span className="whitespace-nowrap">{t('attachments.cleanup')}</span>
        </Button>
        <Button size="sm" onClick={onUploadClick} className="shrink-0 whitespace-nowrap bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90 cursor-pointer">
          <Upload size={12} />
          <span className="whitespace-nowrap">{t('attachments.upload_file')}</span>
        </Button>
      </div>
    </div>
  )
}

function SearchBox({ search, onSearchChange }: { search: string; onSearchChange: (query: string) => void }) {
  return (
    <div className="relative w-36 sm:w-44 lg:w-52 shrink-0">
      <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-quaternary)]" />
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t('attachments.search_placeholder')}
        className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pr-7 pl-8 text-[length:var(--text-12\\.5)] outline-none transition-colors placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
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
  )
}

function FilterDropdown({ buttonRef, isOpen, onToggle, onClose, isActive, icon, label, items }: {
  buttonRef: React.RefObject<HTMLButtonElement | null>
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  isActive: boolean
  icon: React.ReactNode
  label: string
  items: MenuItem[]
}) {
  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-md)] border px-2.5 text-[length:var(--text-12)] font-medium transition-colors cursor-pointer select-none',
          isActive ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
        )}
      >
        {icon}
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown size={11} className="opacity-60 shrink-0" />
      </button>
      <Menu open={isOpen} anchor={buttonRef} items={items} onClose={onClose} />
    </div>
  )
}

function ViewModeToggle({ viewMode, onViewModeChange }: { viewMode: 'grid' | 'list'; onViewModeChange: (mode: 'grid' | 'list') => void }) {
  return (
    <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 shrink-0">
      <Tooltip label={t('attachments.view_grid')}>
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          className={cn('rounded p-1 text-[var(--text-tertiary)] transition-colors cursor-pointer', viewMode === 'grid' ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs' : 'hover:text-[var(--text-primary)]')}
        >
          <Grid size={14} />
        </button>
      </Tooltip>
      <Tooltip label={t('attachments.view_list')}>
        <button
          type="button"
          onClick={() => onViewModeChange('list')}
          className={cn('rounded p-1 text-[var(--text-tertiary)] transition-colors cursor-pointer', viewMode === 'list' ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs' : 'hover:text-[var(--text-primary)]')}
        >
          <List size={14} />
        </button>
      </Tooltip>
    </div>
  )
}

function ZoomControl({ zoom, onZoomChange }: { zoom: 'sm' | 'md' | 'lg'; onZoomChange: (zoom: 'sm' | 'md' | 'lg') => void }) {
  const zoomOptions = [
    { id: 'sm' as const, label: t('attachments.zoom_sm') },
    { id: 'md' as const, label: t('attachments.zoom_md') },
    { id: 'lg' as const, label: t('attachments.zoom_lg') },
  ]
  return (
    <div className="hidden lg:flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 text-[length:var(--text-11)] font-medium shrink-0">
      {zoomOptions.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onZoomChange(opt.id)}
          className={cn('px-1.5 py-0.5 rounded cursor-pointer', zoom === opt.id ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}