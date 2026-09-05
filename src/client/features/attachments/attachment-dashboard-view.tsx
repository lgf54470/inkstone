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
import type { AttachmentStats, AttachmentWithUsage } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { IconButton } from '../../components/primitives'
import { formatFileSize, getFileBadgeColor, getFileCategory, type AttachmentCategory } from './attachment-helpers'

export function AttachmentDashboardView({
  stats,
  onSelectCategory,
  onSelectExtension,
  onPreviewFile,
  onDownloadFile,
  onDeleteFile,
  onPrune,
}: {
  stats?: AttachmentStats
  onSelectCategory: (category: AttachmentCategory) => void
  onSelectExtension: (ext: string) => void
  onPreviewFile: (file: AttachmentWithUsage) => void
  onDownloadFile: (file: AttachmentWithUsage) => void
  onDeleteFile: (file: AttachmentWithUsage) => void
  onPrune: () => void
}) {
  const totalQuota = stats?.totalQuotaBytes || 10 * 1024 * 1024 * 1024
  const totalBytes = stats?.totalBytes || 0
  const usedRatio = Math.min(1, Math.max(0, totalBytes / totalQuota))
  const usedPercentage = (usedRatio * 100).toFixed(usedRatio < 0.001 && totalBytes > 0 ? 3 : 1)
  const freeBytes = Math.max(0, totalQuota - totalBytes)

  const radius = 70
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - usedRatio * circumference

  const categories = useMemo(() => {
    if (!stats) return []
    const total = stats.totalBytes || 1
    return [
      {
        id: 'image' as AttachmentCategory,
        label: t('attachments.photos'),
        bytes: stats.imageBytes,
        icon: <Images size={16} className="text-blue-500" />,
        barColor: 'bg-blue-500',
        textColor: 'text-blue-500',
        ratio: stats.imageBytes / total,
      },
      {
        id: 'document' as AttachmentCategory,
        label: t('attachments.documents'),
        bytes: stats.documentBytes,
        icon: <FileText size={16} className="text-emerald-500" />,
        barColor: 'bg-emerald-500',
        textColor: 'text-emerald-500',
        ratio: stats.documentBytes / total,
      },
      {
        id: 'media' as AttachmentCategory,
        label: t('attachments.media'),
        bytes: stats.mediaBytes,
        icon: <Film size={16} className="text-purple-500" />,
        barColor: 'bg-purple-500',
        textColor: 'text-purple-500',
        ratio: stats.mediaBytes / total,
      },
      {
        id: 'archive' as AttachmentCategory,
        label: t('attachments.archives'),
        bytes: stats.archiveBytes + stats.codeBytes,
        icon: <Archive size={16} className="text-amber-500" />,
        barColor: 'bg-amber-500',
        textColor: 'text-amber-500',
        ratio: (stats.archiveBytes + stats.codeBytes) / total,
      },
      {
        id: 'all' as AttachmentCategory,
        label: t('attachments.filter_other'),
        bytes: stats.otherBytes,
        icon: <FileCode size={16} className="text-zinc-500" />,
        barColor: 'bg-zinc-400 dark:bg-zinc-600',
        textColor: 'text-zinc-500',
        ratio: stats.otherBytes / total,
      },
    ].filter((c) => c.bytes > 0 || c.id === 'image' || c.id === 'document')
  }, [stats])

  const topExtensions = useMemo(() => {
    if (!stats?.extensionBreakdown) return []
    return Object.entries(stats.extensionBreakdown)
      .map(([ext, data]) => ({ ext, count: data.count, bytes: data.bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10)
  }, [stats?.extensionBreakdown])

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 select-none">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex items-center gap-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-blue-500/10 text-blue-500">
            <HardDrive size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('attachments.total_files')}
            </div>
            <div className="mt-0.5 text-xl font-bold text-[var(--text-primary)]">
              {stats?.totalCount ?? 0}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex items-center gap-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-purple-500/10 text-purple-500">
            <Database size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('attachments.stats_title')}
            </div>
            <div className="mt-0.5 text-xl font-bold text-[var(--text-primary)] truncate">
              {formatFileSize(totalBytes)}
              <span className="text-xs font-normal text-[var(--text-quaternary)] ml-1">
                / {formatFileSize(totalQuota)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex items-center gap-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-amber-500/10 text-amber-500">
            <Link2Off size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('attachments.unreferenced')}
            </div>
            <div className="mt-0.5 text-xl font-bold text-[var(--text-primary)] flex items-baseline gap-2">
              <span>{stats?.unreferencedCount ?? 0}</span>
              {(stats?.unreferencedCount ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={onPrune}
                  className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  {t('attachments.cleanup')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex items-center gap-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-emerald-500/10 text-emerald-500">
            <FolderTree size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('attachments.structure')}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
              {stats?.folderCount ?? 0} {t('navigation.folder')} · {stats?.tagCount ?? 0} {t('navigation.tag')}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="font-semibold text-[13.5px] text-[var(--text-primary)] flex items-center gap-2">
              <Database size={15} className="text-[var(--accent)]" />
              {t('attachments.storage_donut_title')}
            </h3>
            <span className="text-[11.5px] text-[var(--text-tertiary)]">
              {formatFileSize(totalQuota)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-6">
            <div className="relative flex items-center justify-center">
              <svg width="180" height="180" className="-rotate-90 transform">
                <circle
                  cx="90"
                  cy="90"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="14"
                  fill="transparent"
                  className="text-[var(--bg-hover)]"
                />
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
                <span className="text-2xl font-black tracking-tight text-[var(--text-primary)]">
                  {usedPercentage}%
                </span>
                <span className="text-[11px] font-medium text-[var(--text-tertiary)] mt-0.5">
                  {t('attachments.used')}
                </span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <div className="text-xs text-[var(--text-secondary)]">
                {t('attachments.remaining_space', { value0: formatFileSize(freeBytes) })}
              </div>
            </div>
          </div>

          <div className="rounded-[var(--r-md)] bg-[var(--bg-subtle)] p-3 text-[12px] flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Sparkles size={14} className="text-amber-500 shrink-0" />
              <span>{t('attachments.quota_info')}</span>
            </div>
            <span className="font-semibold text-[var(--text-primary)]">
              {formatFileSize(totalQuota)}
            </span>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="font-semibold text-[13.5px] text-[var(--text-primary)] flex items-center gap-2">
              <Images size={15} className="text-[var(--accent)]" />
              {t('attachments.category_breakdown')}
            </h3>
            <span className="text-[11.5px] text-[var(--text-tertiary)]">
              {stats?.totalCount ?? 0} {t('attachments.all_files')}
            </span>
          </div>

          <div className="space-y-3.5 py-3">
            {categories.map((cat) => {
              const pct = (cat.ratio * 100).toFixed(1)
              return (
                <div
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className="group cursor-pointer rounded-[var(--r-md)] p-2 hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                    <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                      {cat.icon}
                      <span>{cat.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[var(--text-secondary)] font-mono text-[11.5px]">
                      <span>{formatFileSize(cat.bytes)}</span>
                      <span className="w-12 text-right font-semibold text-[var(--text-primary)]">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', cat.barColor)}
                      style={{ width: `${Math.max(cat.bytes > 0 ? 2 : 0, Number(pct))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap gap-2 items-center">
            <span className="text-[11.5px] text-[var(--text-tertiary)] font-medium mr-1 flex items-center gap-1">
              <Tag size={12} />
              {t('attachments.top_extensions')}:
            </span>
            {topExtensions.map((item) => (
              <button
                key={item.ext}
                type="button"
                onClick={() => onSelectExtension(item.ext)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <span className="uppercase font-semibold">{item.ext}</span>
                <span className="text-[var(--text-quaternary)]">({item.count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[13.5px] text-[var(--text-primary)] flex items-center gap-2">
            <HardDrive size={15} className="text-[var(--accent)]" />
            {t('attachments.largest_files')}
          </h3>
          <span className="text-[11.5px] text-[var(--text-tertiary)]">
            {'Top 5'}
          </span>
        </div>

        {stats?.largestFiles && stats.largestFiles.length > 0 ? (
          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[var(--r-md)] overflow-hidden">
            {stats.largestFiles.map((file) => {
              const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
              const category = getFileCategory(file.mime, file.filename)
              const badge = getFileBadgeColor(category, ext)

              return (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={cn(
                        'flex h-7 w-9 shrink-0 items-center justify-center rounded text-[10px] font-bold tracking-wider',
                        badge.bg,
                        badge.text,
                      )}
                    >
                      {badge.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--text-primary)]">
                        {file.filename}
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">
                        {new Date(file.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 pl-3">
                    <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">
                      {formatFileSize(file.size)}
                    </span>
                    <div className="flex items-center gap-1">
                      <IconButton
                        label={t('common.preview')}
                        size="sm"
                        onClick={() => onPreviewFile(file)}
                      >
                        <Eye size={13} />
                      </IconButton>
                      <IconButton
                        label={t('common.download')}
                        size="sm"
                        onClick={() => onDownloadFile(file)}
                      >
                        <Download size={13} />
                      </IconButton>
                      <IconButton
                        label={t('common.delete')}
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => onDeleteFile(file)}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">
            {t('attachments.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
