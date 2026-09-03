import { useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Globe,
  Hash,
  Infinity as InfinityIcon,
  KeyRound,
  LayoutDashboard,
  PauseCircle,
  Pin,
  PlayCircle,
  Star,
  Timer,
} from 'lucide-react'
import type { ShareCategory } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { Switch } from '../../components/form'
import { useNotes } from '../../store/notes'
import { useFolderTree, type FolderNode } from '../../store/notes/selectors'
import { useShareStore } from './share-store'

export function ShareHubSidebar() {
  const category = useShareStore((s) => s.category)
  const setCategory = useShareStore((s) => s.setCategory)
  const selectedFolderId = useShareStore((s) => s.folderId)
  const setFolderId = useShareStore((s) => s.setFolderId)
  const selectedTag = useShareStore((s) => s.tag)
  const setTag = useShareStore((s) => s.setTag)
  const globalStats = useShareStore((s) => s.globalStats)
  const batchFolderToggle = useShareStore((s) => s.batchFolderToggle)
  const batchTagToggle = useShareStore((s) => s.batchTagToggle)
  const batchBusy = useShareStore((s) => s.batchBusy)

  const folderTree = useFolderTree()
  const tags = useNotes((s) => s.tags)

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [foldersSectionOpen, setFoldersSectionOpen] = useState(true)
  const [tagsSectionOpen, setTagsSectionOpen] = useState(true)

  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const categories: Array<{
    id: ShareCategory
    label: string
    icon: React.ReactNode
    count?: number
  }> = [
    {
      id: 'dashboard',
      label: t('share.category_dashboard'),
      icon: <LayoutDashboard size={14} className="text-[var(--accent)]" />,
    },
    {
      id: 'all',
      label: t('share.category_all'),
      icon: <Globe size={14} />,
      count: globalStats?.totalShares,
    },
    {
      id: 'active',
      label: t('share.category_active'),
      icon: <PlayCircle size={14} className="text-[var(--success)]" />,
      count: globalStats?.activeShares,
    },
    {
      id: 'pinned',
      label: t('share.category_pinned'),
      icon: <Pin size={14} className="text-[var(--accent)]" />,
      count: globalStats?.pinnedShares,
    },
    {
      id: 'starred',
      label: t('share.category_starred'),
      icon: <Star size={14} className="text-amber-500 fill-amber-500" />,
      count: globalStats?.starredShares,
    },
    {
      id: 'paused',
      label: t('share.category_paused'),
      icon: <PauseCircle size={14} className="text-[var(--warning)]" />,
    },
    {
      id: 'password',
      label: t('share.category_password'),
      icon: <KeyRound size={14} />,
    },
    {
      id: 'expiring',
      label: t('share.category_expiring'),
      icon: <Timer size={14} />,
    },
    {
      id: 'permanent',
      label: t('share.category_permanent'),
      icon: <InfinityIcon size={14} />,
    },
    {
      id: 'expired',
      label: t('share.category_expired'),
      icon: <AlertTriangle size={14} className="text-[var(--danger)]" />,
    },
  ]

  const renderFolderNode = (node: FolderNode, level = 0) => {
    const isExpanded = expandedFolders.has(node.id)
    const isSelected = selectedFolderId === node.id && !selectedTag && category === 'all'
    const counts = globalStats?.folderCounts[node.id] || { total: 0, shared: 0 }
    const isChecked = counts.shared > 0

    return (
      <div key={node.id} className="flex flex-col">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFolderId(node.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setFolderId(node.id)
            }
          }}
          style={{ paddingLeft: `${8 + level * 14}px` }}
          className={cn(
            'group flex h-8 items-center gap-1.5 rounded-[var(--r-md)] pr-2 text-[12px] font-medium transition-colors cursor-pointer',
            isSelected
              ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          )}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={(e) => toggleFolderExpand(node.id, e)}
              className="p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-3" />
          )}

          {isExpanded ? (
            <FolderOpen size={13} className="shrink-0" style={{ color: node.color ?? undefined }} />
          ) : (
            <FolderClosed size={13} className="shrink-0" style={{ color: node.color ?? undefined }} />
          )}

          <span className="flex-1 truncate">{node.name}</span>

          <span className="tabular text-[10px] text-[var(--text-quaternary)]">
            {counts.shared > 0 ? (
              <span className="text-[var(--accent)] font-medium">{counts.shared}</span>
            ) : (
              '0'
            )}
            /{counts.total}
          </span>

          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center pl-1"
          >
            <Switch
              checked={isChecked}
              disabled={batchBusy || counts.total === 0}
              onChange={(nextChecked) => void batchFolderToggle(node.id, nextChecked)}
            />
          </div>
        </div>

        {isExpanded &&
          node.children.length > 0 &&
          node.children.map((child) => renderFolderNode(child, level + 1))}
      </div>
    )
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-0.5">
          {categories.map((cat) => {
            const isSelected = category === cat.id && !selectedFolderId && !selectedTag
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-[var(--r-md)] px-2.5 text-[12px] font-medium transition-colors',
                  isSelected
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                )}
              >
                {cat.icon}
                <span className="flex-1 text-left">{cat.label}</span>
                {cat.count !== undefined && cat.count > 0 && (
                  <span className="tabular rounded bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)] shadow-sm">
                    {cat.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="my-3 h-px bg-[var(--border-subtle)]" />

        <div className="mb-1 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setFoldersSectionOpen(!foldersSectionOpen)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
          >
            {foldersSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{t('share.folders_isolation')}</span>
          </button>
        </div>

        {foldersSectionOpen && (
          <div className="space-y-0.5 pt-0.5">
            {folderTree.length === 0 ? (
              <p className="px-2.5 py-1 text-[11px] text-[var(--text-quaternary)]">
                {t('share.no_folders')}
              </p>
            ) : (
              folderTree.map((f) => renderFolderNode(f))
            )}
          </div>
        )}

        <div className="my-3 h-px bg-[var(--border-subtle)]" />

        <div className="mb-1 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setTagsSectionOpen(!tagsSectionOpen)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
          >
            {tagsSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{t('share.tags_isolation')}</span>
          </button>
        </div>

        {tagsSectionOpen && (
          <div className="space-y-0.5 pt-0.5">
            {tags.length === 0 ? (
              <p className="px-2.5 py-1 text-[11px] text-[var(--text-quaternary)]">
                {t('share.no_tags')}
              </p>
            ) : (
              tags.map((tag) => {
                const isSelected = selectedTag === tag.name
                const counts = globalStats?.tagCounts[tag.name] || { total: 0, shared: 0 }
                const isChecked = counts.shared > 0

                return (
                  <div
                    key={tag.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setTag(tag.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setTag(tag.name)
                      }
                    }}
                    className={cn(
                      'group flex h-8 items-center gap-1.5 rounded-[var(--r-md)] px-2.5 text-[12px] font-medium transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Hash size={13} className="shrink-0" style={{ color: tag.color ?? undefined }} />
                    <span className="flex-1 truncate">{tag.name}</span>
                    <span className="tabular text-[10px] text-[var(--text-quaternary)]">
                      {counts.shared > 0 ? (
                        <span className="text-[var(--accent)] font-medium">{counts.shared}</span>
                      ) : (
                        '0'
                      )}
                      /{counts.total}
                    </span>
                    <div onClick={(e) => e.stopPropagation()} className="pl-1">
                      <Switch
                        checked={isChecked}
                        disabled={batchBusy || counts.total === 0}
                        onChange={(nextChecked) => void batchTagToggle(tag.name, nextChecked)}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
          <span>{t('share.total_shares_count')}</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {globalStats?.totalShares ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--text-tertiary)]">
          <span>{t('share.total_pv_views')}</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {globalStats?.totalViews ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--text-tertiary)]">
          <span>{t('share.total_uv_visitors')}</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {globalStats?.totalVisitors ?? 0}
          </span>
        </div>
      </div>
    </aside>
  )
}
