import { useState } from 'react'
import { KeyRound, Link2, PauseCircle, PlayCircle, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { ShareCollection } from '@shared/types'
import { Badge, Button, IconButton } from '../../components/primitives'
import { confirm, Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { fullTime } from '../../lib/time'
import { useUi } from '../../store/ui'
import { api } from '../../lib/api'
import { collectionShareUrl, collectionTargetKey } from './share-collections'
import type { ShareCollectionsBundle } from './use-share-collections'
import { useShareCollections } from './use-share-collections'
import { ShareCollectionPublishDialog } from './share-collection-publish-dialog'
import { LoadErrorState } from './share-load-error'

/**
 * The owner's view of what has been published as a collection (ADR-0005). A real table, because the
 * question this panel answers is a comparison across rows: which folders are public, under what
 * access, and how much is in each one. The three actions are named after what they do to the *page*
 * — pause, republish, revoke — and the revoke confirmation states outright that the shares it lists
 * are untouched, which is the one thing people assume the other way round.
 */
export function ShareCollectionsPanel() {
  const bundle = useShareCollections()
  const [publishTarget, setPublishTarget] = useState<{ type: 'folder' | 'tag'; value: string } | null>(null)
  const [isPublishOpen, setIsPublishOpen] = useState(false)
  const openPublish = (target: { type: 'folder' | 'tag'; value: string } | null) => {
    setPublishTarget(target)
    setIsPublishOpen(true)
  }
  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
      <CollectionsHeader
        isLoading={bundle.isLoading}
        onReload={() => void bundle.reload()}
        onPublish={() => openPublish(null)}
      />
      <div className='flex-1 overflow-y-auto px-4 py-3'>
        <CollectionsBody bundle={bundle} onEdit={(collection) => openPublish(collection.targetType === 'manual' ? null : { type: collection.targetType, value: collection.targetValue })} />
      </div>
      {isPublishOpen && (
        <ShareCollectionPublishDialog
          open
          initialTarget={publishTarget ?? undefined}
          onClose={() => {
            setIsPublishOpen(false)
            setPublishTarget(null)
          }}
          onPublish={publishFlow(bundle)}
        />
      )}
    </div>
  )
}

function CollectionsHeader({ isLoading, onReload, onPublish }: {
  isLoading: boolean
  onReload: () => void
  onPublish: () => void
}) {
  return (
    <div className='flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3'>
      <div className='min-w-0'>
        <h3 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
          {t('share.collection_panel_title')}
        </h3>
        <p className='mt-1 max-w-[60ch] text-[length:var(--text-11\\.5)] leading-relaxed text-[var(--text-tertiary)]'>
          {t('share.collection_panel_hint')}
        </p>
      </div>
      <div className='flex items-center gap-1.5'>
        <Tooltip label={t('common.refresh')}>
          <IconButton label={t('common.refresh')} size='sm' onClick={onReload} disabled={isLoading}>
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </IconButton>
        </Tooltip>
        <Button size='sm' variant='primary' icon={<Plus size={12} />} onClick={onPublish}>
          {t('share.collection_publish_action')}
        </Button>
      </div>
    </div>
  )
}

function CollectionsBody({ bundle, onEdit }: {
  bundle: ShareCollectionsBundle
  onEdit: (collection: ShareCollection) => void
}) {
  const toast = useUi((s) => s.toast)
  if (bundle.isLoading && bundle.collections.length === 0) {
    return <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
  }
  if (bundle.hasError && bundle.collections.length === 0) {
    return <LoadErrorState label={t('share.collection_load_failed')} onRetry={() => void bundle.reload()} />
  }
  if (bundle.isEmpty) return <CollectionsEmpty />
  return (
    <table className='w-full border-collapse text-left text-[length:var(--text-12)]'>
      <thead className='text-[length:var(--text-11)] font-medium text-[var(--text-quaternary)]'>
        <tr className='border-b border-[var(--border-subtle)]'>
          <th scope='col' className='py-1.5 pr-3'>{t('share.collection_col_title')}</th>
          <th scope='col' className='py-1.5 pr-3'>{t('share.collection_col_members')}</th>
          <th scope='col' className='py-1.5 pr-3'>{t('share.collection_col_access')}</th>
          <th scope='col' className='py-1.5 pr-3'>{t('share.collection_col_expiry')}</th>
          <th scope='col' className='py-1.5 pr-3'>{t('share.collection_col_status')}</th>
          <th scope='col' className='py-1.5 text-right'>{t('common.more_actions')}</th>
        </tr>
      </thead>
      <tbody>
        {bundle.collections.map((collection) => (
          <CollectionRow
            key={collection.id}
            collection={collection}
            isBusy={bundle.busyId === collection.id}
            onCopy={() => void copyCollectionAddress(collection, toast)}
            onToggle={() => void bundle.setEnabled(collection, !collection.isEnabled)}
            onEdit={() => onEdit(collection)}
            onRevoke={() => void revokeFlow(collection, bundle)}
          />
        ))}
      </tbody>
    </table>
  )
}

function CollectionsEmpty() {
  return (
    <div className='py-8 text-center'>
      <p className='text-[length:var(--text-13)] font-medium text-[var(--text-secondary)]'>
        {t('share.collection_empty')}
      </p>
      <p className='mx-auto mt-1.5 max-w-[48ch] text-[length:var(--text-11\\.5)] leading-relaxed text-[var(--text-quaternary)]'>
        {t('share.collection_empty_hint')}
      </p>
    </div>
  )
}

type CollectionsToast = ReturnType<typeof useUi.getState>['toast']

async function copyCollectionAddress(collection: ShareCollection, toast: CollectionsToast): Promise<void> {
  try {
    await navigator.clipboard.writeText(collectionShareUrl(collection.slug))
    toast({ title: t('share.collection_copied'), tone: 'success' })
  } catch {
    toast({ title: t('share.collection_copy_failed'), tone: 'danger' })
  }
}

/**
 * Revoking is the one action here that cannot be undone, so it asks first — and the description says
 * what stays behind, because "revoke" reads like it takes the links with it.
 */
async function revokeFlow(collection: ShareCollection, bundle: ShareCollectionsBundle): Promise<void> {
  const ok = await confirm({
    title: t('share.collection_revoke_confirm_title', { title: collection.title }),
    description: t('share.collection_revoke_confirm_desc'),
    confirmLabel: t('share.collection_revoke'),
    tone: 'danger',
  })
  if (ok) await bundle.revoke(collection)
}

/** Publishing, and republishing: the route re-states the policy, so both paths are this one call. */
function publishFlow(bundle: ShareCollectionsBundle) {
  const toast = useUi((s) => s.toast)
  return async (body: Parameters<typeof api.share.collections.publish>[0]) => {
    try {
      await api.share.collections.publish(body)
      toast({ title: t('share.collection_publish_action'), tone: 'success' })
      await bundle.reload()
      return true
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : t('share.collection_action_failed'), tone: 'danger' })
      return false
    }
  }
}

function CollectionRow({ collection, isBusy, onCopy, onToggle, onEdit, onRevoke }: {
  collection: ShareCollection
  isBusy: boolean
  onCopy: () => void
  onToggle: () => void
  onEdit: () => void
  onRevoke: () => void
}) {
  return (
    <tr className='border-b border-[var(--border-subtle)] align-top'>
      <td className='py-2 pr-3'>
        <span className='block font-medium text-[var(--text-primary)]'>{collection.title}</span>
        <span className='mt-0.5 block text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t(collectionTargetKey(collection))}
        </span>
      </td>
      <td className='py-2 pr-3 text-[var(--text-secondary)]'>
        {t('share.collection_members', { count: collection.count })}
      </td>
      <td className='py-2 pr-3'>
        {collection.hasPassword
          ? <Badge tone='warning'>{t('share.collection_protected')}</Badge>
          : <Badge tone='neutral'>{t('share.collection_public')}</Badge>}
      </td>
      <td className='py-2 pr-3 text-[var(--text-secondary)]'>
        {collection.expiresAt ? fullTime(collection.expiresAt) : t('share.collection_never_expires')}
      </td>
      <td className='py-2 pr-3'>
        {collection.isEnabled
          ? <Badge tone='success'>{t('share.collection_enabled')}</Badge>
          : <Badge tone='neutral'>{t('share.collection_disabled')}</Badge>}
      </td>
      <td className='py-2'>
        <RowActions collection={collection} isBusy={isBusy} onCopy={onCopy} onToggle={onToggle} onEdit={onEdit} onRevoke={onRevoke} />
      </td>
    </tr>
  )
}

function RowActions({ collection, isBusy, onCopy, onToggle, onEdit, onRevoke }: {
  collection: ShareCollection
  isBusy: boolean
  onCopy: () => void
  onToggle: () => void
  onEdit: () => void
  onRevoke: () => void
}) {
  const toggleLabel = collection.isEnabled ? t('share.collection_pause') : t('share.collection_resume')
  return (
    <div className='flex items-center justify-end gap-1'>
      <Tooltip label={t('share.collection_copy_link')}>
        <IconButton label={t('share.collection_copy_link')} size='sm' onClick={onCopy}>
          <Link2 size={13} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('share.collection_change_access')}>
        <IconButton label={t('share.collection_change_access')} size='sm' onClick={onEdit}>
          <KeyRound size={13} />
        </IconButton>
      </Tooltip>
      <Tooltip label={toggleLabel}>
        <IconButton label={toggleLabel} size='sm' disabled={isBusy} onClick={onToggle}>
          {collection.isEnabled ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={t('share.collection_revoke')}>
        <IconButton label={t('share.collection_revoke')} size='sm' disabled={isBusy} onClick={onRevoke}>
          <Trash2 size={13} />
        </IconButton>
      </Tooltip>
    </div>
  )
}
