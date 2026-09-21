import { useCallback, useMemo, useState } from 'react'
import { LIMITS } from '@shared/constants'
import { Badge, Button } from '../../components/primitives'
import { Input, Select } from '../../components/form'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { expiresInForSelection, shareExpiryOptions } from './share-form'
import { useShareStore } from './share-store'

/** Wide enough for the four labels at their longest, narrow enough to stay a form. */
const PUBLISH_DIALOG_WIDTH = 420

type PublishTarget = { type: 'folder' | 'tag'; value: string }

export type PublishBody = {
  targetType: 'folder' | 'tag'
  targetValue: string
  password?: string
  expiresAt?: number | null
}

/**
 * Publishing a collection (ADR-0005): pick a folder or a tag, optionally put a password and an end
 * date on it. It is also the *edit* path — re-publishing the same target re-states the policy, so
 * changing a password or an end date goes through the same call that created the page. The hint says
 * what publishing does not do (enable paused links) and what an empty password means (the page goes
 * back to public), because both are easy to assume the other way round.
 */
export function ShareCollectionPublishDialog({
  open,
  onClose,
  onPublish,
  initialTarget,
}: {
  open: boolean
  onClose: () => void
  onPublish: (body: PublishBody) => Promise<boolean>
  initialTarget?: PublishTarget
}) {
  const form = usePublishForm(initialTarget, onClose, onPublish)
  return (
    <Modal open={open} onClose={form.close} ariaLabel={t('share.collection_publish_title')} width={PUBLISH_DIALOG_WIDTH}>
      <h2 className='text-[length:var(--text-15)] font-semibold text-[var(--text-primary)]'>
        {t('share.collection_publish_title')}
      </h2>
      <p className='mt-1.5 text-[length:var(--text-12)] leading-relaxed text-[var(--text-tertiary)]'>
        {t('share.collection_publish_hint')}
      </p>
      <div className='mt-4 space-y-3'>
        <PublishFields form={form} />
        <p className='flex items-center gap-1.5 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          <Badge tone='neutral'>{t('share.collection_view_not_snapshot')}</Badge>
        </p>
      </div>
      <PublishActions
        canPublish={Boolean(form.selected)}
        isSaving={form.isSaving}
        onCancel={form.close}
        onSubmit={() => void form.submit()}
      />
    </Modal>
  )
}

/**
 * The form's state and its one rule: the select's value is the target that will be sent, so an empty
 * selection is the honest state of a form nobody has finished — not a silently defaulted first folder.
 */
function usePublishForm(
  initialTarget: PublishTarget | undefined,
  onClose: () => void,
  onPublish: (body: PublishBody) => Promise<boolean>,
) {
  const folders = useShareStore((s) => s.folders)
  const tags = useShareStore((s) => s.tags)
  const [targetType, setTargetType] = useState<'folder' | 'tag'>(initialTarget?.type ?? 'folder')
  const [targetValue, setTargetValue] = useState(initialTarget?.value ?? '')
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState('0')
  const [isSaving, setIsSaving] = useState(false)
  const targets = useMemo(
    () => (targetType === 'folder'
      ? folders.map((folder) => ({ value: folder.id, label: folder.name }))
      : tags.map((tag) => ({ value: tag.id, label: tag.name }))),
    [targetType, folders, tags],
  )
  const selected = targets.some((target) => target.value === targetValue) ? targetValue : ''
  const close = useCallback(() => {
    setPassword('')
    setExpiry('0')
    setIsSaving(false)
    onClose()
  }, [onClose])
  const submit = async () => {
    if (!selected) return
    setIsSaving(true)
    const ok = await onPublish({
      targetType,
      targetValue: selected,
      password: password || undefined,
      // The same selection-to-milliseconds rule the share editor uses, so a week is a week here too.
      expiresAt: expiresInForSelection(expiry) ?? null,
    })
    setIsSaving(false)
    if (ok) close()
  }
  return {
    targets, targetType, targetValue, password, expiry, isSaving, selected, close, submit,
    setPassword, setExpiry,
    setTargetType: (next: 'folder' | 'tag') => {
      setTargetType(next)
      setTargetValue('')
    },
    setTargetValue,
  }
}

type PublishForm = ReturnType<typeof usePublishForm>

function PublishFields({ form }: { form: PublishForm }) {
  return (
    <>
      <Field label={t('share.collection_publish_kind')}>
        <Select value={form.targetType} aria-label={t('share.collection_publish_kind')} onChange={(event) => form.setTargetType(event.target.value as 'folder' | 'tag')}>
          <option value='folder'>{t('share.collection_target_folder')}</option>
          <option value='tag'>{t('share.collection_target_tag')}</option>
        </Select>
      </Field>
      <Field label={t('share.collection_publish_target')}>
        <Select value={form.selected} aria-label={t('share.collection_publish_target')} onChange={(event) => form.setTargetValue(event.target.value)}>
          <option value=''>{t('share.collection_publish_pick')}</option>
          {form.targets.map((target) => (
            <option key={target.value} value={target.value}>{target.label}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('share.collection_publish_password')}>
        <Input
          type='password'
          value={form.password}
          maxLength={LIMITS.passwordMaxLength}
          autoComplete='new-password'
          aria-label={t('share.collection_publish_password')}
          onChange={(event) => form.setPassword(event.target.value)}
        />
      </Field>
      <Field label={t('share.collection_publish_expiry')}>
        <Select value={form.expiry} aria-label={t('share.collection_publish_expiry')} onChange={(event) => form.setExpiry(event.target.value)}>
          {shareExpiryOptions().map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </Field>
    </>
  )
}

function PublishActions({ canPublish, isSaving, onCancel, onSubmit }: {
  canPublish: boolean
  isSaving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className='mt-5 flex justify-end gap-2'>
      <Button variant='ghost' onClick={onCancel}>{t('common.cancel')}</Button>
      <Button variant='primary' loading={isSaving} disabled={!canPublish} onClick={onSubmit}>
        {t('share.collection_publish_action')}
      </Button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='block'>
      <span className='mb-1 block text-[length:var(--text-12)] text-[var(--text-secondary)]'>{label}</span>
      {children}
    </label>
  )
}
