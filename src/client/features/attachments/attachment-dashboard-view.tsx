import { useMemo } from 'react'
import {
  Archive,
  Database,
  Download,
  Eye,
  FileCode,
  FileText,
  Film,
  FolderTree,
  HardDrive,
  Images,
  Link2Off,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { AttachmentStats, AttachmentWithUsage } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { IconButton } from '../../components/primitives'
import { DEFAULT_QUOTA_BYTES, formatFileSize, getFileBadgeColor, getFileCategory, type AttachmentCategory } from './attachment-helpers'


interface AttachmentDashboardViewProps {
  stats?: AttachmentStats
  onSelectCategory: (category: AttachmentCategory) => void
  onSelectExtension: (ext: string) => void
  onPreviewFile: (file: AttachmentWithUsage) => void
  onDownloadFile: (file: AttachmentWithUsage) => void
  onDeleteFile: (file: AttachmentWithUsage) => void
  onPrune: () => void
}

interface CategoryBreakdown {
  id: AttachmentCategory
  label: string
  bytes: number
  icon: ReactNode
  barColor: string
  textColor: string
  ratio: number
}

function categoryBreakdownOf(stats?: AttachmentStats): CategoryBreakdown[] {
  if (!stats) return []
  const total = stats.totalBytes || 1
  const items: CategoryBreakdown[] = [
    { id: 'image', label: t('attachments.photos'), bytes: stats.imageBytes, icon: <Images size={16} className="text-blue-500" />, barColor: 'bg-blue-500', textColor: 'text-blue-500', ratio: stats.imageBytes / total },
    { id: 'document', label: t('attachments.documents'), bytes: stats.documentBytes, icon: <FileText size={16} className="text-emerald-500" />, barColor: 'bg-emerald-500', textColor: 'text-emerald-500', ratio: stats.documentBytes / total },
    { id: 'media', label: t('attachments.media'), bytes: stats.mediaBytes, icon: <Film size={16} className="text-purple-500" />, barColor: 'bg-purple-500', textColor: 'text-purple-500', ratio: stats.mediaBytes / total },
    { id: 'archive', label: t('attachments.archives'), bytes: stats.archiveBytes + stats.codeBytes, icon: <Archive size={16} className="text-amber-500" />, barColor: 'bg-amber-500', textColor: 'text-amber-500', ratio: (stats.archiveBytes + stats.codeBytes) / total },
    { id: 'all', label: t('attachments.filter_other'), bytes: stats.otherBytes, icon: <FileCode size={16} className="text-zinc-500" />, barColor: 'bg-zinc-400 dark:bg-zinc-600', textColor: 'text-zinc-500', ratio: stats.otherBytes / total },
  ]
  return items.filter((c) => c.bytes > 0 || c.id === 'image' || c.id === 'document')
}

function topExtensionsOf(stats?: AttachmentStats): { ext: string; count: number; bytes: number }[] {
  if (!stats?.extensionBreakdown) return []
  return Object.entries(stats.extensionBreakdown)
    .map(([ext, data]) => ({ ext, count: data.count, bytes: data.bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)
}

export function AttachmentDashboardView(props: AttachmentDashboardViewProps) {
  const { stats, onSelectCategory, onSelectExtension, onPreviewFile, onDownloadFile, onDeleteFile, onPrune } = props
  const totalQuota = stats?.totalQuotaBytes || DEFAULT_QUOTA_BYTES
  const totalBytes = stats?.totalBytes || 0
  const usedRatio = Math.min(1, Math.max(0, totalBytes / totalQuota))
  const usedPercentage = (usedRatio * 100).toFixed(usedRatio < 0.001 && totalBytes > 0 ? 3 : 1)
  const freeBytes = Math.max(0, totalQuota - totalBytes)

  const categories = useMemo(() => categoryBreakdownOf(stats), [stats])
  const topExtensions = useMemo(() => topExtensionsOf(stats), [stats?.extensionBreakdown])

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 select-none">
      <StatCardsGrid stats={stats} totalBytes={totalBytes} totalQuota={totalQuota} onPrune={onPrune} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs flex flex-col justify-between">
          <CardHeader icon={<Database size={15} className="text-[var(--accent)]" />} title={t('attachments.storage_donut_title')} side={formatFileSize(totalQuota)} />
          <StorageDonut usedPercentage={usedPercentage} usedRatio={usedRatio} freeBytes={freeBytes} />
          <div className="rounded-[var(--r-md)] bg-[var(--bg-subtle)] p-3 text-[length:var(--text-12)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Sparkles size={14} className="text-amber-500 shrink-0" />
              <span>{t('attachments.quota_info')}</span>
            </div>
            <span className="font-semibold text-[var(--text-primary)]">{formatFileSize(totalQuota)}</span>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs flex flex-col justify-between">
          <CardHeader icon={<Images size={15} className="text-[var(--accent)]" />} title={t('attachments.category_breakdown')} side={`${stats?.totalCount ?? 0} ${t('attachments.all_files')}`} />
          <div className="space-y-3.5 py-3">
            {categories.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} onSelectCategory={onSelectCategory} />
            ))}
          </div>
          <TopExtensions items={topExtensions} onSelectExtension={onSelectExtension} />
        </div>
      </div>

      <LargestFilesCard stats={stats} onPreviewFile={onPreviewFile} onDownloadFile={onDownloadFile} onDeleteFile={onDeleteFile} />
    </div>
  )
}

function StatCardsGrid({ stats, totalBytes, totalQuota, onPrune }: {
  stats?: AttachmentStats
  totalBytes: number
  totalQuota: number
  onPrune: () => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={<HardDrive size={20} />} iconClass="bg-blue-500/10 text-blue-500" label={t('attachments.total_files')} value={stats?.totalCount ?? 0} />
      <StatCard icon={<Database size={20} />} iconClass="bg-purple-500/10 text-purple-500" label={t('attachments.stats_title')}>
        <div className="mt-0.5 text-xl font-bold text-[var(--text-primary)] truncate">
          {formatFileSize(totalBytes)}
          <span className="text-xs font-normal text-[var(--text-quaternary)] ml-1">/ {formatFileSize(totalQuota)}</span>
        </div>
      </StatCard>
      <UnreferencedCard count={stats?.unreferencedCount ?? 0} onPrune={onPrune} />
      <StatCard icon={<FolderTree size={20} />} iconClass="bg-emerald-500/10 text-emerald-500" label={t('attachments.structure')}>
        <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
          {stats?.folderCount ?? 0} {t('navigation.folder')} · {stats?.tagCount ?? 0} {t('navigation.tag')}
        </div>
      </StatCard>
    </div>
  )
}

function StatCard({ icon, iconClass, label, value, children }: {
  icon: ReactNode
  iconClass: string
  label: string
  value?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex items-center gap-3.5 shadow-xs">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)]', iconClass)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[length:var(--text-11\\.5)] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
          {label}
        </div>
        {value !== undefined ? <div className="mt-0.5 text-xl font-bold text-[var(--text-primary)]">{value}</div> : children}
      </div>
    </div>
  )
}

function UnreferencedCard({ count, onPrune }: { count: number; onPrune: () => void }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex items-center gap-3.5 shadow-xs">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-amber-500/10 text-amber-500">
        <Link2Off size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[length:var(--text-11\\.5)] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
          {t('attachments.unreferenced')}
        </div>
        <div className="mt-0.5 text-xl font-bold text-[var(--text-primary)] flex items-baseline gap-2">
          <span>{count}</span>
          {count > 0 && (
            <button type="button" onClick={onPrune} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer">
              {t('attachments.cleanup')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CardHeader({ icon, title, side }: { icon: ReactNode; title: string; side: string }) {
  return (
    <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
      <h3 className="font-semibold text-[length:var(--text-13\\.5)] text-[var(--text-primary)] flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <span className="text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)]">
        {side}
      </span>
    </div>
  )
}

function StorageDonut({ usedPercentage, usedRatio, freeBytes }: { usedPercentage: string; usedRatio: number; freeBytes: number }) {
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - usedRatio * circumference
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative flex items-center justify-center">
        <svg width="180" height="180" className="-rotate-90 transform">
          <circle cx="90" cy="90" r={radius} stroke="currentColor" strokeWidth="14" fill="transparent" className="text-[var(--bg-hover)]" />
          <circle
            cx="90"
            cy="90"
            r={radius}
            stroke="currentColor"
            strokeWidth="14"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="text-[var(--accent)] transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center text-center px-4">
          <span className="text-2xl font-black tracking-tight text-[var(--text-primary)]">{usedPercentage}%</span>
          <span className="text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)] mt-0.5">{t('attachments.used')}</span>
        </div>
      </div>
      <div className="mt-4 text-center">
        <div className="text-xs text-[var(--text-secondary)]">
          {t('attachments.remaining_space', { value0: formatFileSize(freeBytes) })}
        </div>
      </div>
    </div>
  )
}

function CategoryRow({ cat, onSelectCategory }: { cat: CategoryBreakdown; onSelectCategory: (category: AttachmentCategory) => void }) {
  const pct = (cat.ratio * 100).toFixed(1)
  return (
    <div
      onClick={() => onSelectCategory(cat.id)}
      className="group cursor-pointer rounded-[var(--r-md)] p-2 hover:bg-[var(--bg-hover)] transition-colors"
    >
      <div className="flex items-center justify-between text-[length:var(--text-12\\.5)] mb-1.5">
        <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
          {cat.icon}
          <span>{cat.label}</span>
        </div>
        <div className="flex items-center gap-3 text-[var(--text-secondary)] font-mono text-[length:var(--text-11\\.5)]">
          <span>{formatFileSize(cat.bytes)}</span>
          <span className="w-12 text-right font-semibold text-[var(--text-primary)]">{pct}%</span>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
        <div className={cn('h-full rounded-full transition-all duration-500', cat.barColor)} style={{ width: `${Math.max(cat.bytes > 0 ? 2 : 0, Number(pct))}%` }} />
      </div>
    </div>
  )
}

function TopExtensions({ items, onSelectExtension }: { items: { ext: string; count: number }[]; onSelectExtension: (ext: string) => void }) {
  return (
    <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap gap-2 items-center">
      <span className="text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)] font-medium mr-1 flex items-center gap-1">
        <Tag size={12} />
        {t('attachments.top_extensions')}:
      </span>
      {items.map((item) => (
        <button
          key={item.ext}
          type="button"
          onClick={() => onSelectExtension(item.ext)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[length:var(--text-11)] font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
        >
          <span className="uppercase font-semibold">{item.ext}</span>
          <span className="text-[var(--text-quaternary)]">({item.count})</span>
        </button>
      ))}
    </div>
  )
}

function LargestFilesCard({ stats, onPreviewFile, onDownloadFile, onDeleteFile }: {
  stats?: AttachmentStats
  onPreviewFile: (file: AttachmentWithUsage) => void
  onDownloadFile: (file: AttachmentWithUsage) => void
  onDeleteFile: (file: AttachmentWithUsage) => void
}) {
  const files = stats?.largestFiles ?? []
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[length:var(--text-13\\.5)] text-[var(--text-primary)] flex items-center gap-2">
          <HardDrive size={15} className="text-[var(--accent)]" />
          {t('attachments.largest_files')}
        </h3>
        <span className="text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)]">{'Top 5'}</span>
      </div>

      {files.length > 0 ? (
        <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[var(--r-md)] overflow-hidden">
          {files.map((file) => (
            <LargestFileRow key={file.id} file={file} onPreviewFile={onPreviewFile} onDownloadFile={onDownloadFile} onDeleteFile={onDeleteFile} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">
          {t('attachments.empty')}
        </div>
      )}
    </div>
  )
}

function LargestFileRow({ file, onPreviewFile, onDownloadFile, onDeleteFile }: {
  file: AttachmentWithUsage
  onPreviewFile: (file: AttachmentWithUsage) => void
  onDownloadFile: (file: AttachmentWithUsage) => void
  onDeleteFile: (file: AttachmentWithUsage) => void
}) {
  const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
  const category = getFileCategory(file.mime, file.filename)
  const badge = getFileBadgeColor(category, ext)

  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 text-[length:var(--text-12\\.5)] hover:bg-[var(--bg-hover)] transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={cn('flex h-7 w-9 shrink-0 items-center justify-center rounded text-[length:var(--text-10)] font-bold tracking-wider', badge.bg, badge.text)}>
          {badge.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[var(--text-primary)]">{file.filename}</div>
          <div className="text-[length:var(--text-11)] text-[var(--text-tertiary)]">
            {new Date(file.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0 pl-3">
        <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">{formatFileSize(file.size)}</span>
        <div className="flex items-center gap-1">
          <IconButton label={t('common.preview')} size="sm" onClick={() => onPreviewFile(file)}>
            <Eye size={13} />
          </IconButton>
          <IconButton label={t('common.download')} size="sm" onClick={() => onDownloadFile(file)}>
            <Download size={13} />
          </IconButton>
          <IconButton label={t('common.delete')} size="sm" className="text-red-500 hover:text-red-600" onClick={() => onDeleteFile(file)}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
    </div>
  )
}