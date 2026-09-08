import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react'
import { type BackupTarget, type BackupTargetConfig, type BackupTargetInput, type BackupTargetType, type TestConnectionResult } from '@shared/types'
import { cn } from '../../../lib/cn'
import { api, ApiError } from '../../../lib/api'
import { Button } from '../../../components/primitives'
import { Checkbox, Field, Input, Segmented } from '../../../components/form'
import { Modal } from '../../../components/overlay'
import { getBackupPresets, type BackupPreset } from '../backup-presets'
import { useUi, type UiState } from '../../../store/ui'
type ToastFn = UiState['toast']
import { t, translateServiceMessage } from '../../../lib/i18n'

const TRACKING_HINT = 'tracking-[var(--tracking-hint)]'
const MODAL_WIDTH = 520

interface TargetFormFields {
  endpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
  url: string
  username: string
}

export function TargetForm({ target, onClose, onSaved, }: {
  target: BackupTarget | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const f = useTargetForm(target)
  const close = () => {
    if (!f.actionRef.current) onClose()
  }
  const s3 = f.type === 's3'
  return (<Modal open onClose={close} title={target ? t('settings.edit_backup_target') : t('settings.add_backup_target')} description={f.canKeepSecret ? t('settings.leave_the_key_blank_to_leave_it_unchanged') : undefined} width={MODAL_WIDTH} footer={<>
      <Button variant='ghost' onClick={close} disabled={f.isSaving || f.isTesting}>{t('common.cancel')}</Button>
      <Button variant='secondary' loading={f.isTesting} disabled={f.isSaving} onClick={() => f.test()}>{t('settings.test_connection')}</Button>
      <Button variant='primary' loading={f.isSaving} disabled={f.isTesting} onClick={() => void f.save(onSaved)}>{t('common.save')}</Button>
    </>}>
    <fieldset disabled={f.isSaving || f.isTesting} aria-busy={f.isSaving || f.isTesting} className='min-w-0 space-y-3.5 border-0 p-0'>
    {target && f.type !== target.type && (<TypeChangeWarning/>)}
    <Field label={t('settings.type')}>
      <Segmented<BackupTargetType> value={f.type} onChange={f.selectType} options={[
      { value: 's3', label: t('settings.s3_compatible') },
      { value: 'webdav', label: 'WebDAV' },
    ]}/>
    </Field>

    {!target && <PresetPicker f={f}/>}

    <Field label={t('settings.name')} required>
      <Input value={f.name} onChange={(e) => f.setName(e.target.value)} placeholder={t('settings.for_example_primary_r2_backup')}/>
    </Field>

    {s3 ? <S3Fields f={f}/> : <WebdavFields f={f}/>}

    <Field label={t('settings.subdirectory')} hint={t('settings.store_backups_in_this_directory_or_leave_blank_to_use_the_root_directory')}>
      <Input value={f.form.prefix} onChange={(e) => f.patchField('prefix', e.target.value)} placeholder='inkstone'/>
    </Field>

    {f.result && <ResultNote result={f.result}/>}
    </fieldset>
  </Modal>)
}

type TargetFormState = ReturnType<typeof useTargetForm>

// Initial form fields from whichever config variant the target carries; the
// `in` guards narrow the S3/WebDAV union so every field reads type-safe.
function initialFormFields(config: BackupTargetConfig | null): TargetFormFields {
  const s3 = config && 'endpoint' in config ? config : null
  const webdav = config && 'url' in config ? config : null
  return {
    endpoint: s3?.endpoint ?? '',
    region: s3?.region ?? 'auto',
    bucket: s3?.bucket ?? '',
    prefix: config?.prefix ?? 'inkstone',
    pathStyle: s3 ? s3.pathStyle : true,
    url: webdav?.url ?? '',
    username: webdav?.username ?? '',
  }
}

function useTargetForm(target: BackupTarget | null) {
  const [type, setType] = useState<BackupTargetType>(target?.type ?? 's3')
  const [name, setName] = useState(target?.name ?? '')
  const [form, setForm] = useState<TargetFormFields>(initialFormFields(target?.config ?? null))
  const [secret, setSecret] = useState({ accessKeyId: '', secretAccessKey: '', password: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [result, setResult] = useState<TestConnectionResult | null>(null)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const actionRef = useRef(false)
  const toast = useUi((s) => s.toast)
  const canKeepSecret = Boolean(target?.hasSecret && type === target.type)
  useEffect(() => setResult(null), [type, form, secret])
  const patchField = (key: keyof TargetFormFields, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))
  const selectType = (nextType: BackupTargetType) => {
    if (nextType === type)
      return
    setType(nextType)
    if (activePreset)
      setName('')
    setActivePreset(null)
  }
  const applyBackupPreset = (preset: BackupPreset) => {
    setActivePreset(preset.id)
    setType(preset.type)
    setName(preset.name)
    setForm((current) => ({
      ...current,
      endpoint: preset.fields.endpoint !== undefined ? preset.fields.endpoint : current.endpoint,
      region: preset.fields.region !== undefined ? preset.fields.region : current.region,
      pathStyle: preset.fields.pathStyle ?? current.pathStyle,
      url: preset.fields.url !== undefined ? preset.fields.url : current.url,
    }))
  }
  const save = (onSaved: () => Promise<void>) => void saveTargetFlow({ target, type, name, form, secret, actionRef, setIsSaving, toast, onSaved })
  const test = () => void testTargetFlow({ target, type, name, form, secret, actionRef, setIsTesting, setResult })
  const guide = getBackupPresets().find((p) => p.id === activePreset) ?? null
  const recommendedPresets = getBackupPresets().filter((preset) => preset.type === type)
  return { type, name, setName, form, patchField, setForm, secret, setSecret, isSaving, isTesting, result, activePreset, actionRef, canKeepSecret, selectType, applyBackupPreset, save, test, guide, recommendedPresets }
}

function buildPayload(type: BackupTargetType, name: string, form: TargetFormFields, secret: { accessKeyId: string; secretAccessKey: string; password: string }): BackupTargetInput {
  return {
    type,
    name: name || (type === 's3' ? t('settings.s3_backup') : t('settings.webdav_backup')),
    config: type === 's3'
      ? {
        endpoint: form.endpoint,
        region: form.region,
        bucket: form.bucket,
        prefix: form.prefix,
        pathStyle: form.pathStyle,
        mode: 'archive',
      }
      : { url: form.url, username: form.username, prefix: form.prefix, mode: 'archive' },
    secret: type === 's3'
      ? { accessKeyId: secret.accessKeyId, secretAccessKey: secret.secretAccessKey }
      : { password: secret.password },
  }
}

async function saveTargetFlow({ target, type, name, form, secret, actionRef, setIsSaving, toast, onSaved }: {
  target: BackupTarget | null
  type: BackupTargetType
  name: string
  form: TargetFormFields
  secret: { accessKeyId: string; secretAccessKey: string; password: string }
  actionRef: React.MutableRefObject<boolean>
  setIsSaving: (saving: boolean) => void
  toast: ToastFn
  onSaved: () => Promise<void>
}) {
  if (actionRef.current)
    return
  actionRef.current = true
  setIsSaving(true)
  try {
    const payload = buildPayload(type, name, form, secret)
    if (target)
      await api.backup.patch(target.id, { ...payload, expectedUpdatedAt: target.updatedAt })
    else
      await api.backup.create(payload)
    toast({ title: target ? t('settings.backup_target_updated') : t('settings.backup_target_added'), tone: 'success' })
    await onSaved()
  }
  catch (err) {
    toast({
      title: t('common.save_failed'),
      description: err instanceof ApiError ? err.message : String(err),
      tone: 'danger',
    })
  }
  finally {
    actionRef.current = false
    setIsSaving(false)
  }
}

async function testTargetFlow({ target, type, name, form, secret, actionRef, setIsTesting, setResult }: {
  target: BackupTarget | null
  type: BackupTargetType
  name: string
  form: TargetFormFields
  secret: { accessKeyId: string; secretAccessKey: string; password: string }
  actionRef: React.MutableRefObject<boolean>
  setIsTesting: (testing: boolean) => void
  setResult: (result: TestConnectionResult) => void
}) {
  if (actionRef.current)
    return
  actionRef.current = true
  setIsTesting(true)
  try {
    const payload = buildPayload(type, name, form, secret)
    setResult(target
      ? await api.backup.test(target.id, payload)
      : await api.backup.testDraft(payload))
  }
  catch (err) {
    setResult({ ok: false, message: err instanceof ApiError ? err.message : String(err) })
  }
  finally {
    actionRef.current = false
    setIsTesting(false)
  }
}

function TypeChangeWarning() {
  return (
    <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--warning)_28%,var(--border-subtle))] bg-[var(--bg-inset)] px-3 py-2 text-[length:var(--text-11\.5)] text-[var(--warning)]">
      <AlertCircle size={13} className='mt-0.5 shrink-0'/>
      <span>{t('settings.enter_the_complete_credentials_for_the_new_backup_type_after_switching_t')}</span>
    </div>
  )
}

function PresetPicker({ f }: { f: TargetFormState }) {
  return (
    <div className='space-y-2.5'>
      <p className={`text-[length:var(--text-11)] font-medium ${TRACKING_HINT} text-[var(--text-quaternary)]`}>
      {f.type === 'webdav' ? 'WebDAV' : 'S3'} · {t('settings.common_provider_presets_optional_click_to_autofill')}</p>
      <div className='grid grid-cols-3 gap-1.5'>
      {f.recommendedPresets.map((preset) => (<button key={preset.id} type='button' onClick={() => f.applyBackupPreset(preset)} className={cn('flex flex-col gap-0.5 rounded-[var(--r-md)] border px-2.5 py-2 text-left', 'transition-colors duration-[var(--dur-fast)]', f.activePreset === preset.id
          ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
          : 'border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]')}>
        <span className='flex w-full items-center justify-between gap-1'>
          <span className={cn('truncate text-[length:var(--text-12)] font-medium', f.activePreset === preset.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
          {preset.name}
          </span>
          <span className="shrink-0 text-[length:var(--text-9\.5)] uppercase tracking-wide text-[var(--text-quaternary)]">
          {preset.type === 'webdav' ? 'DAV' : 'S3'}
          </span>
        </span>
        <span className="text-[length:var(--text-10\.5)] text-[var(--success)]">{preset.quota}</span>
        </button>))}
      </div>
      {f.guide && <PresetGuide guide={f.guide}/>}
    </div>
  )
}

function PresetGuide({ guide }: { guide: BackupPreset }) {
  return (
    <div className='anim-rise rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--accent)_28%,transparent)] bg-[var(--accent-softer)] px-3 py-2.5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
      <span className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
        {guide.name} · {guide.tagline}
      </span>
      <a href={guide.signupUrl} target='_blank' rel='noopener noreferrer' className='inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-0.5 text-[length:var(--text-11)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]'>
        {guide.signupLabel ?? t('settings.sign_up')}
        <ExternalLink size={10}/>
      </a>
      </div>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-secondary)] marker:text-[var(--accent)]">
      {guide.steps.map((step, index) => (<li key={index}>
        {step.map((part, partIndex) => part.href ? (<a key={partIndex} href={part.href} target='_blank' rel='noopener noreferrer' className='font-medium text-[var(--accent)] underline decoration-[color-mix(in_oklab,var(--accent)_35%,transparent)] underline-offset-2 hover:decoration-[var(--accent)]'>
          {part.text}
          </a>) : (<span key={partIndex}>{part.text}</span>))}
        </li>))}
      </ol>
      {guide.addressIntro && guide.addresses && (<div className='mt-2 border-t border-[color-mix(in_oklab,var(--accent)_18%,transparent)] pt-2'>
        <p className='text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]'>{guide.addressIntro}</p>
        <dl className='mt-1.5 grid gap-1 sm:grid-cols-2'>
        {guide.addresses.map((address) => (<div key={address.label} className='min-w-0 rounded-[var(--r-sm)] bg-[var(--bg-surface)] px-2 py-1.5'>
          <dt className="text-[length:var(--text-10\.5)] font-medium text-[var(--text-secondary)]">{address.label}</dt>
          <dd className='mt-0.5 overflow-x-auto whitespace-nowrap font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{address.url}</dd>
          </div>))}
        </dl>
      </div>)}
    </div>
  )
}

function S3Fields({ f }: { f: TargetFormState }) {
  const { canKeepSecret } = f
  return (
    <>
      <Field label={t('settings.endpoint')} hint={t('settings.leave_blank_unless_the_provider_requires_it_for_r2_use_url')}>
      <Input value={f.form.endpoint} onChange={(e) => f.patchField('endpoint', e.target.value)} placeholder='https://…'/>
      </Field>
      <div className='grid grid-cols-2 gap-3'>
      <Field label={t('settings.bucket')} required>
        <Input value={f.form.bucket} onChange={(e) => f.patchField('bucket', e.target.value)} placeholder='my-notes-backup'/>
      </Field>
      <Field label={t('settings.region')}>
        <Input value={f.form.region} onChange={(e) => f.patchField('region', e.target.value)} placeholder='auto'/>
      </Field>
      </div>
      <div className='grid grid-cols-2 gap-3'>
      <Field label={t('settings.access_key_id')} required={!canKeepSecret}>
        <Input value={f.secret.accessKeyId} onChange={(e) => f.setSecret({ ...f.secret, accessKeyId: e.target.value })} placeholder={canKeepSecret ? t('settings.unchanged') : ''} autoComplete='off'/>
      </Field>
      <Field label={t('settings.secret_access_key')} required={!canKeepSecret}>
        <Input type='password' value={f.secret.secretAccessKey} onChange={(e) => f.setSecret({ ...f.secret, secretAccessKey: e.target.value })} placeholder={canKeepSecret ? t('settings.unchanged') : ''} autoComplete='new-password'/>
      </Field>
      </div>
      <Checkbox checked={f.form.pathStyle} onChange={(pathStyle) => f.patchField('pathStyle', pathStyle)} label={t('settings.use_path_style_access_recommended_for_most_compatible_services')}/>
    </>
  )
}

function WebdavFields({ f }: { f: TargetFormState }) {
  const { canKeepSecret } = f
  return (
    <>
      <Field label={t('settings.webdav_address')} required hint={t('settings.https_only_redirects_within_the_same_site_are_handled_automatically')}>
      <Input value={f.form.url} onChange={(e) => f.patchField('url', e.target.value)} placeholder='https://dav.example.com/dav/'/>
      </Field>
      <div className='grid grid-cols-2 gap-3'>
      <Field label={t('common.username')} required>
        <Input value={f.form.username} onChange={(e) => f.patchField('username', e.target.value)} autoComplete='off'/>
      </Field>
      <Field label={t('common.password')} required={!canKeepSecret} hint={t('settings.use_an_app_specific_password_when_possible')}>
        <Input type='password' value={f.secret.password} onChange={(e) => f.setSecret({ ...f.secret, password: e.target.value })} placeholder={canKeepSecret ? t('settings.unchanged') : ''} autoComplete='new-password'/>
      </Field>
      </div>
    </>
  )
}

function ResultNote({ result }: { result: TestConnectionResult }) {
  return (
    <div role={result.ok ? 'status' : 'alert'} className={cn('flex items-start gap-2 rounded-[var(--r-md)] px-3 py-2.5 text-[length:var(--text-12)] leading-relaxed', result.ok
        ? 'bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success)]'
        : 'bg-[color-mix(in_oklab,var(--danger)_11%,transparent)] text-[var(--danger)]')}>
      {result.ok ? (<CheckCircle2 size={13} className='mt-px shrink-0'/>) : (<AlertCircle size={13} className='mt-px shrink-0'/>)}
      <span>{translateServiceMessage(result.message)}</span>
    </div>
  )
}