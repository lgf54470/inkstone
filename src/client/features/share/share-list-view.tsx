import { useCallback } from 'react'
import type { ShareInfo } from '@shared/types'
import { t } from '../../lib/i18n'
import { formatNumber } from '../../lib/time'
import type { ShareHubViewProps } from './share-hub-views'
import { ShareHubToolbar } from './share-hub-toolbar'
import { ShareTableView } from './share-table-view'
import { ShareGridView } from './share-grid-view'
import { ShareBatchBar } from './share-batch-bar'
import { LoadErrorState } from './share-load-error'
import { useShareListView } from './use-share-list-view'

/**
 * Every status category's screen: the toolbar, the rows, and the batch bar that acts on the selection
 * those rows carry. It is the same view for all ten categories because they differ only in the filter
 * the store already holds — the category list is what picks the filter, not what the view does.
 */
export function ShareListView({ onOpenQr, onOpenNoteAnalytics, onOpenEdit, onOpenLogs, onOpenSettings }: ShareHubViewProps) {
  const list = useShareListView()
  // The rows are memoized, so the callback they receive has to keep its identity: the shell's intent
  // is addressed by note id and a row only has the share, so the adapter lives here and is stable.
  const openAnalytics = useCallback((share: ShareInfo) => onOpenNoteAnalytics(share.noteId), [onOpenNoteAnalytics])
  return (
    <div className='relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)] overflow-hidden'>
      <ShareHubToolbar onOpenLogs={() => onOpenLogs()} onOpenSettings={onOpenSettings} />
      <ListTruncatedNotice />
      <ListBody list={list} onOpenQr={onOpenQr} onOpenAnalytics={openAnalytics} onOpenEdit={onOpenEdit} />
      <ShareBatchBar selectedCount={list.selectedCount} onClearSelection={list.clearSelection} />
    </div>
  )
}

function ListTruncatedNotice() {
  const { truncated, shares } = useShareListView()
  // The row count, not a number copied into the sentence: the server's ceiling can be raised,
  // and a sentence that spelled "500" out would go on saying it whatever the list now holds.
  if (!truncated) return null
  return (
    <div
      role='status'
      className='shrink-0 border-b border-[var(--border-subtle)] bg-[var(--warning-soft)] px-4 py-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'
    >
      {t('share.list_truncated', { count: formatNumber(shares.length) })}
    </div>
  )
}

function ListBody({
  list,
  onOpenQr,
  onOpenAnalytics,
  onOpenEdit,
}: {
  list: ReturnType<typeof useShareListView>
  onOpenQr: ShareHubViewProps['onOpenQr']
  onOpenAnalytics: (share: ShareInfo) => void
  onOpenEdit: ShareHubViewProps['onOpenEdit']
}) {
  const { viewMode, shares, loading, error, loadShares } = list
  return (
    <div className='flex-1 overflow-y-auto'>
      {loading && shares.length === 0 ? (
        <div className='flex h-64 items-center justify-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
          {t('common.loading')}
        </div>
      ) : error && shares.length === 0 ? (
        <div className='p-5'>
          <LoadErrorState label={t('share.list_load_failed')} onRetry={() => void loadShares()} />
        </div>
      ) : viewMode === 'table' ? (
        <ShareTableView shares={shares} onOpenQr={onOpenQr} onOpenAnalytics={onOpenAnalytics} onOpenEdit={onOpenEdit} />
      ) : (
        <ShareGridView shares={shares} onOpenQr={onOpenQr} onOpenAnalytics={onOpenAnalytics} onOpenEdit={onOpenEdit} />
      )}
    </div>
  )
}
