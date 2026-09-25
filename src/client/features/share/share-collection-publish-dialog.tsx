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
type PublishKind = 'folder' | 'tag' | 'manual'

/** The member orders a collection page can list with; null means the shipped one. */
const MEMBER_SORTS = ['default', 'newest', 'oldest', 'title'] as const
type MemberSort = (typeof MEMBER_SORTS)[number]

export type PublishBody = {
  targetType: 'folder' | 'tag' | 'manual'
  targetValue?: string
  title?: string
  noteIds?: string[]
  password?: string
  expiresAt?: number | null
  memberSort?: MemberSort | null
}

function memberSortOptions(): Array<{ value: MemberSort; label: string }> {
  return MEMBER_SORTS.map((sort) => ({ value: sort, label: t(`share.collection_member_sort_${sort}`) }))
}

/**
 * Publishing a collection (ADR-0005): pick a folder or a tag — or hand-pick notes — and optionally
 * put a password and an end date on it. It is also the *edit* path — re-publishing the same target
 * re-states the policy, so changing a password or an end date goes through the same call that
 * created the page. The hint says what publishing does not do (enable paused links) and what an
 * empty password means (the page goes back to public), because both are easy to assume the other
 * way round.
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
        canPublish={form.canPublish}
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
 * The hand-picked kind asks for a title and a note choice instead of a folder or tag.
 */
function usePublishForm(
  initialTarget: PublishTarget | undefined,
  onClose: () => void,
  onPublish: (body: PublishBody) => Promise<boolean>,
) {
  const folders = useShareStore((s) => s.folders)
  const tags = useShareStore((s) => s.tags)
  const shares = useShareStore((s) => s.shares)
  const [targetType, setTargetType] = useState<PublishKind>(initialTarget?.type ?? 'folder')
  const [targetValue, setTargetValue] = useState(initialTarget?.value ?? '')
  const [title, setTitle] = useState('')
  const [noteIds, setNoteIds] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState('0')
  const [memberSort, setMemberSort] = useState<MemberSort>('default')
  const [isSaving, setIsSaving] = useState(false)
  const targets = useMemo(
    () => (targetType === 'folder'
      ? folders.map((folder) => ({ value: folder.id, label: folder.name }))
      : tags.map((tag) => ({ value: tag.id, label: tag.name }))),
    [targetType, folders, tags],
  )
  const selected = targetType === 'manual' ? '' : targets.some((target) => target.value === targetValue) ? targetValue : ''
  const canPublish = targetType === 'manual' ? Boolean(title.trim()) && noteIds.length > 0 : Boolean(selected)
  const close = useCallback(() => {
    setPassword('')
    setExpiry('0')
    setTitle('')
    setNoteIds([])
    setIsSaving(false)
    onClose()
  }, [onClose])
  const submit = () => submitPublish(
    { targetType, selected, title, noteIds, password, expiry, memberSort },
    { canPublish, setIsSaving, close, onPublish },
  )
  return {
    targets, shares, targetType, targetValue, password, expiry, memberSort, title, noteIds,
    isSaving, selected, canPublish, close, submit,
    setPassword, setExpiry, setMemberSort, setTitle,
    toggleNote: (noteId: string) => {
      setNoteIds((current) => current.includes(noteId)
        ? current.filter((id) => id !== noteId)
        : [...current, noteId])
    },
    setTargetType: (next: PublishKind) => {
      setTargetType(next)
      setTargetValue('')
    },
    setTargetValue,
  }
}

type PublishForm = ReturnType<typeof usePublishForm>

/** Send the form's composed body, keeping the button in its saving state until the answer lands. */
async function submitPublish(
  form: {
    targetType: PublishKind; selected: string; title: string; noteIds: string[]
    password: string; expiry: string; memberSort: MemberSort
  },
  helpers: {
    canPublish: boolean
    setIsSaving: (value: boolean) => void
    close: () => void
    onPublish: (body: PublishBody) => Promise<boolean>
  },
): Promise<void> {
  if (!helpers.canPublish) return
  helpers.setIsSaving(true)
  const ok = await helpers.onPublish(publishBody(form))
  helpers.setIsSaving(false)
  if (ok) helpers.close()
}

/**
 * The request the form's state composes into. The expiry shares the selection-to-milliseconds rule
 * the share editor uses, so a week is a week here too; the member order only applies to the derived
 * kinds, whose members have no stored arrangement of their own.
 */
function publishBody(form: {
  targetType: PublishKind
  selected: string
  title: string
  noteIds: string[]
  password: string
  expiry: string
  memberSort: MemberSort
}): PublishBody {
  const shared = {
    password: form.password || undefined,
    expiresAt: expiresInForSelection(form.expiry) ?? null,
    memberSort: form.targetType === 'manual' ? null : form.memberSort === 'default' ? null : form.memberSort,
  }
  return form.targetType === 'manual'
    ? { targetType: 'manual', title: form.title.trim(), noteIds: form.noteIds, ...shared }
    : { targetType: form.targetType, targetValue: form.selected, ...shared }
}

function PublishFields({ form }: { form: PublishForm }) {
  return (
    <>
      <Field label={t('share.collection_publish_kind')}>
        <Select value={form.targetType} aria-label={t('share.collection_publish_kind')} onChange={(event) => form.setTargetType(event.target.value as PublishKind)}>
          <option value='folder'>{t('share.collection_target_folder')}</option>
          <option value='tag'>{t('share.collection_target_tag')}</option>
          <option value='manual'>{t('share.collection_target_manual')}</option>
        </Select>
      </Field>
      {form.targetType === 'manual' ? <ManualPickFields form={form} /> : <DerivedPickField form={form} />}
      <PolicyFields form={form} />
    </>
  )
}

/** The target a derived collection lists from: a folder's id or a tag's id, picked by name. */
function DerivedPickField({ form }: { form: PublishForm }) {
  return (
    <Field label={t('share.collection_publish_target')}>
      <Select value={form.selected} aria-label={t('share.collection_publish_target')} onChange={(event) => form.setTargetValue(event.target.value)}>
        <option value=''>{t('share.collection_publish_pick')}</option>
        {form.targets.map((target) => (
          <option key={target.value} value={target.value}>{target.label}</option>
        ))}
      </Select>
    </Field>
  )
}

/** The policy every kind shares: who may open the page, until when, and in what order. */
function PolicyFields({ form }: { form: PublishForm }) {
  return (
    <>
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
      {form.targetType !== 'manual' && (
        <Field label={t('share.collection_member_sort_label')}>
          {/* The order a visitor walks the page in; the labels carry the caliber, not a jargon key. */}
          <Select value={form.memberSort} aria-label={t('share.collection_member_sort_label')} onChange={(event) => form.setMemberSort(event.target.value as MemberSort)}>
            {memberSortOptions().map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
      )}
    </>
  )
}

/** The hand-picked kind: a name of the owner's choosing, then the notes, checked one by one. */
function ManualPickFields({ form }: { form: PublishForm }) {
  return (
    <>
      <Field label={t('share.collection_publish_title_field')}>
        <Input
          value={form.title}
          maxLength={200}
          aria-label={t('share.collection_publish_title_field')}
          onChange={(event) => form.setTitle(event.target.value)}
        />
      </Field>
      <fieldset className='block'>
        <legend className='mb-1 block text-[length:var(--text-12)] text-[var(--text-secondary)]'>
          {t('share.collection_publish_notes_field')}
        </legend>
        {form.shares.length === 0 ? (
          <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('share.collection_publish_notes_empty')}</p>
        ) : (
          <div className='max-h-44 space-y-1 overflow-y-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] p-2'>
            {form.shares.map((share) => (
              <label key={share.slug} className='flex items-center gap-2 text-[length:var(--text-12)] text-[var(--text-primary)]'>
                <input
                  type='checkbox'
                  checked={form.noteIds.includes(share.noteId)}
                  onChange={() => form.toggleNote(share.noteId)}
                  aria-label={share.noteTitle || share.slug}
                />
                <span className='truncate'>{share.noteTitle || t('common.untitled_note')}</span>
                <span className='ml-auto font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{share.slug}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
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
