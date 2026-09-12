import { useEffect, useMemo, useState } from 'react'
import { FolderClosed, HardDrive, Server } from 'lucide-react'
import type { BackupTarget } from '@shared/types'
import { api } from '../../../lib/api'
import { Button, SectionLabel } from '../../../components/primitives'
import { Field, Input, SettingRow, Select, Switch } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useSession } from '../../../store/session'

function useWebdavTargets(): BackupTarget[] | null {
  const [targets, setTargets] = useState<BackupTarget[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void api.backup.targets()
      .then((result) => {
        if (!cancelled) setTargets(result.targets.filter((target) => target.type === 'webdav'))
      })
      .catch(() => {
        if (!cancelled) setTargets([])
      })
    return () => {
      cancelled = true
    }
  }, [])
  return targets
}

export function MusicStorageSection() {
  const musicDir = useSession((state) => state.settings.backup.musicDir)
  const musicTargetId = useSession((state) => state.settings.backup.musicTargetId)
  const update = useSession((state) => state.updateSettings)
  const targets = useWebdavTargets()
  const [draft, setDraft] = useState(musicDir)

  useEffect(() => setDraft(musicDir), [musicDir])

  const options = useMemo(() => [
    { value: '', label: t('music.music_target_auto') },
    ...(targets ?? []).map((target) => ({ value: target.id, label: target.name })),
  ], [targets])

  const commitDir = (): void => {
    const next = draft.trim()
    if (next === musicDir) return
    void update({ backup: { musicDir: next || 'music' } })
  }

  return (
    <section className='space-y-3'>
      <SectionLabel className='flex items-center gap-1.5'>
        <HardDrive size={13} />{t('music.webdav_title')}
      </SectionLabel>
      <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-3'>
        <MusicTargetRow
          value={musicTargetId ?? ''}
          options={options}
          onChange={(next) => void update({ backup: { musicTargetId: next || null } })}
        />
        <MusicDirField draft={draft} onDraft={setDraft} onCommit={commitDir} />
        <PublicLibraryRow />
        {targets !== null && targets.length === 0 && (
          <p className='flex items-center gap-1.5 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            <Server size={12} />{t('music.webdav_not_configured')}
          </p>
        )}
      </div>
    </section>
  )
}

// Publishing only exposes a read-only view; uploads and edits stay inside the app.
function PublicLibraryRow() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api.music.publicSettings()
      .then((result) => {
        if (!cancelled) setEnabled(result.enabled)
      })
      .catch(() => {
        if (!cancelled) setEnabled(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (next: boolean): void => {
    setBusy(true)
    void api.music.savePublicSettings(next)
      .then((result) => setEnabled(result.enabled))
      .finally(() => setBusy(false))
  }

  return (
    <SettingRow title={t('music.public_music')} description={t('music.public_music_hint')}>
      <div className='flex items-center gap-2'>
        <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {enabled === null ? t('music.public_music_unknown') : enabled ? t('music.public_music_on') : t('music.public_music_off')}
        </span>
        <Switch
          aria-label={t('music.public_music')}
          checked={enabled === true}
          disabled={enabled === null || busy}
          onChange={toggle}
        />
      </div>
    </SettingRow>
  )
}

function MusicTargetRow({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <SettingRow title={t('music.music_target')} description={t('music.webdav_configure_hint')}>
      <Select
        aria-label={t('music.music_target')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className='w-56'
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </SettingRow>
  )
}

function MusicDirField({
  draft,
  onDraft,
  onCommit,
}: {
  draft: string
  onDraft: (value: string) => void
  onCommit: () => void
}) {
  return (
    <Field label={t('music.music_dir')} hint={t('music.music_dir_hint')}>
      <div className='flex items-center gap-2'>
        <Input
          value={draft}
          aria-label={t('music.music_dir')}
          placeholder='music'
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className='w-56'
        />
        <Button size='sm' icon={<FolderClosed size={13} />} onClick={onCommit}>{t('music.save')}</Button>
      </div>
    </Field>
  )
}