import { useMemo } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RotateCw,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { Button } from '../../../components/primitives'
import { Checkbox } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { LinkDynamicIcon } from './link-dynamic-icon'
import { useLinkCheckerState, type HealthResult } from './use-link-checker'

export interface LinkCheckerModalProps {
  open: boolean
  onClose: () => void
  links: BlogLink[]
  categories: BlogLinkCategory[]
  onDeleteLink: (link: BlogLink) => Promise<void>
  onBatchDeleteLinks: (ids: string[]) => Promise<void>
  onEditLink: (link: BlogLink) => void
}

const CHECKER_MODAL_WIDTH = 780

export function LinkCheckerModal({
  open,
  onClose,
  links,
  categories,
  onDeleteLink,
  onBatchDeleteLinks,
  onEditLink,
}: LinkCheckerModalProps) {
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const state = useLinkCheckerState(links, open, onBatchDeleteLinks)

  return (
    <Modal open={open} onClose={onClose} title={t('blog.link_check_title')} width={CHECKER_MODAL_WIDTH}>
      <div className='space-y-4 py-1 text-[length:var(--text-12)]'>
        <CheckerStatsHeader
          stats={state.stats}
          total={links.length}
          running={state.running}
          progressIndex={state.progressIndex}
          filterLevel={state.filterLevel}
          onSelectFilter={state.setFilterLevel}
          onStart={state.handleStart}
          onPause={state.handlePause}
        />

        {state.selectedIds.size > 0 && (
          <div className='flex items-center justify-between rounded-[var(--r-md)] bg-[var(--accent-subtle)]/40 px-3 py-1.5'>
            <span className='font-semibold text-[var(--accent)] text-[length:var(--text-11)]'>
              {t('blog.selected_links_count', { value0: state.selectedIds.size })}
            </span>
            <Button variant='danger' size='sm' loading={state.batchDeleting} onClick={state.handleBatchDelete}>
              <Trash2 size={13} />
              {t('blog.link_check_batch_delete')}
            </Button>
          </div>
        )}

        <CheckerList
          links={state.filteredLinks}
          results={state.results}
          selectedIds={state.selectedIds}
          categoryMap={categoryMap}
          onToggleSelect={(id) => state.setSelectedIds((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })}
          onCheckSingle={state.handleCheckSingle}
          onEditLink={onEditLink}
          onDeleteLink={onDeleteLink}
        />
      </div>
    </Modal>
  )
}

function CheckerStatsHeader({
  stats,
  total,
  running,
  progressIndex,
  filterLevel,
  onSelectFilter,
  onStart,
  onPause,
}: {
  stats: { ok: number; warning: number; broken: number; unchecked: number }
  total: number
  running: boolean
  progressIndex: number
  filterLevel: 'all' | 'broken' | 'warning' | 'ok'
  onSelectFilter: (f: 'all' | 'broken' | 'warning' | 'ok') => void
  onStart: () => void
  onPause: () => void
}) {
  const percent = total > 0 ? Math.min(100, Math.round((progressIndex / total) * 100)) : 0

  return (
    <div className='space-y-2.5 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          {running ? (
            <Button variant='danger' size='sm' onClick={onPause}>
              <Square size={13} />
              {t('blog.link_check_pause')}
            </Button>
          ) : (
            <Button variant='primary' size='sm' onClick={onStart}>
              <Play size={13} />
              {stats.unchecked === total ? t('blog.link_check_start') : t('blog.link_check_resume')}
            </Button>
          )}
          <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {running ? t('blog.link_check_status_checking') : t('blog.link_check_status_idle')} ({progressIndex}/{total})
          </span>
        </div>

        <div className='flex items-center gap-1.5 text-[length:var(--text-11)]'>
          <FilterBadge label={t('blog.link_check_filter_all')} count={total} active={filterLevel === 'all'} onClick={() => onSelectFilter('all')} />
          <FilterBadge label={t('blog.link_check_broken')} count={stats.broken} tone='danger' active={filterLevel === 'broken'} onClick={() => onSelectFilter('broken')} />
          <FilterBadge label={t('blog.link_check_warning')} count={stats.warning} tone='warning' active={filterLevel === 'warning'} onClick={() => onSelectFilter('warning')} />
          <FilterBadge label={t('blog.link_check_ok')} count={stats.ok} tone='success' active={filterLevel === 'ok'} onClick={() => onSelectFilter('ok')} />
        </div>
      </div>

      {running && (
        <div className='h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface)]'>
          <div className='h-full bg-[var(--accent)] transition-all duration-300' style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

function FilterBadge({ label, count, tone = 'default', active, onClick }: { label: string; count: number; tone?: 'default' | 'success' | 'warning' | 'danger'; active: boolean; onClick: () => void }) {
  const colorMap = {
    default: 'text-[var(--text-secondary)]',
    success: 'text-[var(--success)]',
    warning: 'text-amber-500',
    danger: 'text-[var(--danger)]',
  }
  return (
    <button
      type='button'
      onClick={onClick}
      className={`px-2 py-0.5 rounded-[var(--r-sm)] font-medium transition-colors ${
        active ? 'bg-[var(--bg-surface)] shadow-xs border border-[var(--border-subtle)]' : 'hover:bg-[var(--bg-hover)]'
      } ${colorMap[tone]}`}
    >
      <span>{label}</span> <span className='font-bold ml-0.5'>{count}</span>
    </button>
  )
}

function CheckerList({
  links,
  results,
  selectedIds,
  categoryMap,
  onToggleSelect,
  onCheckSingle,
  onEditLink,
  onDeleteLink,
}: {
  links: BlogLink[]
  results: Record<string, HealthResult>
  selectedIds: Set<string>
  categoryMap: Map<string, string>
  onToggleSelect: (id: string) => void
  onCheckSingle: (url: string) => void
  onEditLink: (link: BlogLink) => void
  onDeleteLink: (link: BlogLink) => void
}) {
  if (links.length === 0) {
    return (
      <div className='flex h-48 flex-col items-center justify-center text-[var(--text-tertiary)]'>
        <p>{t('blog.link_check_empty')}</p>
      </div>
    )
  }

  return (
    <div className='max-h-96 overflow-y-auto space-y-1.5 pr-1'>
      {links.map((link) => (
        <CheckerRow
          key={link.id}
          link={link}
          res={results[link.url]}
          isSelected={selectedIds.has(link.id)}
          categoryName={link.categoryId ? categoryMap.get(link.categoryId) : undefined}
          onToggleSelect={onToggleSelect}
          onCheckSingle={onCheckSingle}
          onEditLink={onEditLink}
          onDeleteLink={onDeleteLink}
        />
      ))}
    </div>
  )
}

function CheckerRow({
  link,
  res,
  isSelected,
  categoryName,
  onToggleSelect,
  onCheckSingle,
  onEditLink,
  onDeleteLink,
}: {
  link: BlogLink
  res?: HealthResult
  isSelected: boolean
  categoryName?: string
  onToggleSelect: (id: string) => void
  onCheckSingle: (url: string) => void
  onEditLink: (link: BlogLink) => void
  onDeleteLink: (link: BlogLink) => void
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 p-2 rounded-[var(--r-md)] border transition-colors ${
        isSelected ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/20' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <div className='flex items-center gap-2.5 min-w-0 flex-1'>
        <Checkbox checked={isSelected} onChange={() => onToggleSelect(link.id)} aria-label={link.name} className='min-h-0 shrink-0' />
        <div className='size-6 flex items-center justify-center rounded bg-[var(--bg-sunken)] shrink-0'>
          <LinkDynamicIcon icon={link.avatar} name={link.name} size={14} />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='font-semibold truncate max-w-40 text-[var(--text-primary)]'>{link.name}</span>
            {categoryName && (
              <span className='rounded px-1 text-[length:var(--text-10)] bg-[var(--bg-sunken)] text-[var(--text-tertiary)]'>
                {categoryName}
              </span>
            )}
            <HealthBadge result={res} />
          </div>
          <div className='flex items-center gap-2 text-[length:var(--text-10)] text-[var(--text-tertiary)] truncate'>
            <span className='truncate max-w-72'>{link.url}</span>
            {res?.durationMs ? <span>{`${res.durationMs}ms`}</span> : null}
            {res?.error && <span className='text-[var(--danger)] truncate'>({res.error})</span>}
          </div>
        </div>
      </div>

      <CheckerRowActions
        url={link.url}
        isChecking={res?.level === 'checking'}
        onCheck={() => onCheckSingle(link.url)}
        onEdit={() => onEditLink(link)}
        onDelete={() => void onDeleteLink(link)}
      />
    </div>
  )
}

function CheckerRowActions({
  url,
  isChecking,
  onCheck,
  onEdit,
  onDelete,
}: {
  url: string
  isChecking: boolean
  onCheck: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className='flex items-center gap-1 shrink-0'>
      <button
        type='button'
        onClick={onCheck}
        className='p-1 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        title={t('blog.link_check_recheck_single')}
      >
        <RotateCw size={12} className={isChecking ? 'animate-spin' : ''} />
      </button>
      <button
        type='button'
        onClick={() => window.open(url, '_blank')}
        className='p-1 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      >
        <ExternalLink size={12} />
      </button>
      <button
        type='button'
        onClick={onEdit}
        className='p-1 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      >
        {t('common.edit')}
      </button>
      <button
        type='button'
        onClick={onDelete}
        className='p-1 rounded text-[var(--text-quaternary)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)]'
      >
        {t('common.delete')}
      </button>
    </div>
  )
}

function HealthBadge({ result }: { result?: HealthResult }) {
  if (!result) {
    return <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{t('blog.link_check_untested')}</span>
  }
  if (result.level === 'checking') {
    return (
      <span className='inline-flex items-center gap-1 text-[length:var(--text-10)] text-[var(--accent)] font-medium'>
        <Loader2 size={10} className='animate-spin' />
        <span>{t('blog.link_check_checking')}</span>
      </span>
    )
  }
  if (result.level === 'ok') {
    return (
      <span className='inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[length:var(--text-10)] font-semibold bg-[var(--success-subtle)] text-[var(--success)]'>
        <CheckCircle2 size={10} />
        <span>{result.status || 200}</span>
      </span>
    )
  }
  if (result.level === 'warning') {
    return (
      <span className='inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[length:var(--text-10)] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400'>
        <AlertCircle size={10} />
        <span>{result.status || 400}</span>
      </span>
    )
  }
  return (
    <span className='inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[length:var(--text-10)] font-semibold bg-[var(--danger-subtle)] text-[var(--danger)]'>
      <XCircle size={10} />
      <span>{result.status ? `${result.status} ${t('blog.link_check_error')}` : t('blog.link_check_broken')}</span>
    </span>
  )
}

