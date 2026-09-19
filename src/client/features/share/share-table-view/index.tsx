import { useMemo } from 'react'
import { Share2 } from 'lucide-react'
import type { ShareInfo } from '@shared/types'
import { Checkbox } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useShareList } from '../use-share-list'
import { ShareTableRow } from './row'

export function ShareTableView({
  shares,
  onOpenQr: onOpenQrModal,
  onOpenAnalytics,
  onOpenEdit,
}: {
  shares: ShareInfo[]
  onOpenQr: (share: ShareInfo) => void
  onOpenAnalytics: (share: ShareInfo) => void
  onOpenEdit: (share: ShareInfo) => void
}) {
  const list = useShareList()
  const allSelected = shares.length > 0 && list.selectedNoteIds.size === shares.length
  const folderById = useMemo(() => new Map(list.folders.map((f) => [f.id, f])), [list.folders])

  if (shares.length === 0) {
    return (
      <div className='flex h-64 flex-col items-center justify-center gap-2 text-center'>
        <Share2 size={32} className='text-[var(--text-quaternary)]' />
        <p className='text-[length:var(--text-13)] font-medium text-[var(--text-secondary)]'>
          {t('share.no_shares_found')}
        </p>
        <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {t('share.no_shares_hint')}
        </p>
      </div>
    )
  }

  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full border-collapse text-left'>
        <ShareTableHeader allSelected={allSelected} onToggleAll={list.toggleSelectAll} />
        <tbody className='divide-y divide-[var(--border-subtle)]'>
          {shares.map((share) => (
            <ShareTableRow
              key={share.noteId}
              share={share}
              isSelected={list.selectedNoteIds.has(share.noteId)}
              folders={list.folders}
              folderById={folderById}
              copiedSlug={list.copiedSlug}
              onToggleSelect={list.toggleSelect}
              onTogglePin={list.togglePin}
              onToggleStar={list.toggleStar}
              onToggleShare={list.toggleShare}
              onCopyLink={list.handleCopy}
              onOpenQr={onOpenQrModal}
              onOpenAnalytics={onOpenAnalytics}
              onOpenEdit={onOpenEdit}
              onMoveToFolder={list.handleMoveToFolder}
              onRevoke={list.handleRevoke}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ShareTableHeader({ allSelected, onToggleAll }: { allSelected: boolean; onToggleAll: () => void }) {
  return (
    <thead className='sticky top-0 z-[var(--z-sticky)] bg-[var(--bg-card)] shadow-[var(--shadow-xs)]'>
      <tr className='border-b border-[var(--border-subtle)] text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
        <th className='w-10 px-3 py-2 text-center'>
          <Checkbox
            checked={allSelected}
            onChange={onToggleAll}
            aria-label={t('contextmenu.select_all')}
            className='min-h-0'
          />
        </th>
        <th className='px-3 py-2'>{t('share.table_note_title')}</th>
        <th className='w-20 px-3 py-2 text-center'>{t('share.table_status')}</th>
        <th className='w-48 px-3 py-2'>{t('share.table_link')}</th>
        <th className='w-28 px-3 py-2'>{t('share.table_security_expiry')}</th>
        <th className='w-24 px-3 py-2 text-right'>{t('share.table_pv_uv')}</th>
        <th className='w-28 px-3 py-2 text-right'>{t('share.table_last_visit')}</th>
        <th className='w-40 px-3 py-2 text-right'>{t('share.table_actions')}</th>
      </tr>
    </thead>
  )
}