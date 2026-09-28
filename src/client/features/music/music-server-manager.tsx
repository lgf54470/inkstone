import { useEffect, useRef, useState } from 'react'
import { AudioLines, Check, Plus, Trash2 } from 'lucide-react'
import { MUSIC_SERVER_KINDS, type MusicServerKind } from '@shared/constants'
import { Button, IconButton } from '../../components/primitives'
import { Input, Select } from '../../components/form'
import { confirm } from '../../components/overlay'
import { t, type MessageKey } from '../../lib/i18n'
import { useMusic } from './music-store'
import { PanelFailure } from './music-panel-failure'
import type { MusicServerSourceView } from '../../lib/api'

const KIND_LABELS: Record<MusicServerKind, MessageKey> = {
  subsonic: 'music.server_kind_subsonic',
  jellyfin: 'music.server_kind_jellyfin',
}

// The list has one owner per mount: the manager draws whatever the store holds and never asks for it
// itself, because both of its hosts decide what to do with an empty list and neither may be handed a
// second, racing fetch. This is that one ask, written once and called by each host on open.
export function useLoadServerSources(enabled = true): void {
  const loadServers = useMusic((state) => state.loadServerSources)
  useEffect(() => {
    if (enabled) void loadServers()
  }, [enabled, loadServers])
}

// FB-M16: registering a server the reader owns. The same component serves both surfaces it has —
// the settings page's group and the search modal's management view — so the add form, the test
// verdict and the delete confirmation are written once. The password only ever travels out: the
// worker stores it in the credential vault and hands back name, type, URL and username.
export function MusicServerManager() {
  const servers = useMusic((state) => state.serverSources)
  const loading = useMusic((state) => state.serverSourcesLoading)
  const error = useMusic((state) => state.serverSourcesError)
  const loadServers = useMusic((state) => state.loadServerSources)
  return (
    <div className='space-y-2'>
      {loading && servers.length === 0
        ? <p role='status' className='py-4 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
        : error && servers.length === 0
          ? <PanelFailure message={error} onRetry={() => void loadServers()} />
          : servers.length === 0
            ? <p className='py-4 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.server_none')}</p>
            : (
                <ul className='space-y-1'>
                  {servers.map((server) => <ServerRow key={server.id} server={server} />)}
                </ul>
              )}
      <AddServerForm />
    </div>
  )
}

function ServerRow({ server }: { server: MusicServerSourceView }) {
  const deleteServerSource = useMusic((state) => state.deleteServerSource)
  const probeServerSource = useMusic((state) => state.probeServerSource)
  const probingId = useMusic((state) => state.serverProbingId)
  const probe = useMusic((state) => state.serverProbe)
  const probing = probingId === server.id
  const verdict = probe?.id === server.id ? probe : null
  const remove = (): void => {
    void confirm({
      title: t('music.server_delete'),
      description: t('music.server_delete_confirm', { value0: server.name }),
      confirmLabel: t('music.server_delete'),
      tone: 'danger',
    }).then((ok) => {
      if (ok) void deleteServerSource(server.id)
    })
  }
  return (
    <li className='rounded-[var(--r-md)] px-2 py-1.5 hover:bg-[var(--bg-hover)]'>
      <div className='flex items-center gap-2'>
        <AudioLines size={14} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />
        <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{server.name}</span>
        <span className='shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{t(KIND_LABELS[server.kind])}</span>
        <Button size='sm' loading={probing} onClick={() => void probeServerSource(server.id)}>
          {t('music.server_test')}
        </Button>
        <IconButton label={`${t('music.server_delete')}: ${server.name}`} size='sm' onClick={remove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      <p className='truncate pl-6 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{server.url}</p>
      {verdict && (
        <p
          role='status'
          className='flex items-center gap-1 pl-6 pt-0.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'
        >
          {verdict.state === 'ok' ? <Check size={11} aria-hidden='true' /> : null}
          {verdict.state === 'ok'
            ? t('music.server_test_ok')
            : t('music.server_test_failed', { value0: verdict.error ?? '' })}
        </p>
      )}
    </li>
  )
}

// The draft the form holds, and the one call it makes: kept apart from the markup so the fields and
// the submit stay readable side by side with the other panels' forms.
function useServerDraft() {
  const createServerSource = useMusic((state) => state.createServerSource)
  const [kind, setKind] = useState<MusicServerKind>('subsonic')
  const [creating, setCreating] = useState(false)
  const name = useRef<HTMLInputElement>(null)
  const url = useRef<HTMLInputElement>(null)
  const username = useRef<HTMLInputElement>(null)
  const password = useRef<HTMLInputElement>(null)
  const fields = [name, url, username, password]

  const add = async (): Promise<void> => {
    const input = {
      name: name.current?.value.trim() ?? '',
      kind,
      url: url.current?.value.trim() ?? '',
      username: username.current?.value.trim() ?? '',
      password: password.current?.value ?? '',
    }
    // A half-filled form must not reach the worker: it would register a server nobody described.
    if (!input.name || !input.url || !input.username || !input.password) return
    setCreating(true)
    const ok = await createServerSource(input)
    setCreating(false)
    // A refused registration keeps every field as typed, so a mistyped password is one edit away.
    if (ok) {
      for (const field of fields) {
        if (field.current) field.current.value = ''
      }
    }
  }
  return { kind, setKind, creating, name, url, username, password, add }
}

function AddServerForm() {
  const draft = useServerDraft()
  return (
    <form
      className='space-y-2 border-t border-[var(--border-subtle)] pt-3'
      onSubmit={(event) => {
        event.preventDefault()
        void draft.add()
      }}
    >
      {/* FB3-U3 + FB3-C2: the group above already says what a music server is, so the form says what to do
          with it instead of repeating the sentence — and the button below is the one place its name needs to
          appear, because a heading with the same words as the button it sits over reads as two controls. */}
      <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.server_form_hint')}</p>
      <ServerFields draft={draft} />
      <div className='flex items-center justify-end'>
        <Button size='sm' variant='primary' icon={<Plus size={12} />} loading={draft.creating} onClick={() => void draft.add()}>
          {t('music.server_add')}
        </Button>
      </div>
    </form>
  )
}

// FB3-U3: the fields sat in two independent columns, and each label sized itself to its own text — so
// "Server URL" pushed its input right while "Username" did not, and the four inputs landed on four left
// edges. The grid declares the two label/control pairs once and every field adopts them, so the labels
// line up whatever the two languages' own lengths are.
function ServerFields({ draft }: { draft: ReturnType<typeof useServerDraft> }) {
  return (
    <div className='grid grid-cols-[auto_1fr_auto_1fr] gap-2'>
      <ServerField label={t('music.server_name')}>
        <Input ref={draft.name} className='h-8 flex-1' aria-label={t('music.server_name')} />
      </ServerField>
      <ServerField label={t('music.server_kind')}>
        <Select
          className='h-8 flex-1'
          aria-label={t('music.server_kind')}
          value={draft.kind}
          onChange={(event) => draft.setKind(event.target.value as MusicServerKind)}
        >
          {MUSIC_SERVER_KINDS.map((option) => (
            <option key={option} value={option}>{t(KIND_LABELS[option])}</option>
          ))}
        </Select>
      </ServerField>
      <ServerField label={t('music.server_url')}>
        <Input ref={draft.url} className='h-8 flex-1' aria-label={t('music.server_url')} />
      </ServerField>
      <ServerField label={t('music.server_username')}>
        <Input ref={draft.username} className='h-8 flex-1' aria-label={t('music.server_username')} />
      </ServerField>
      <ServerField label={t('music.server_password')}>
        <Input ref={draft.password} type='password' className='h-8 flex-1' aria-label={t('music.server_password')} />
      </ServerField>
    </div>
  )
}

function ServerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      data-server-field=''
      className='col-span-2 grid grid-cols-subgrid items-center gap-2 text-[length:var(--text-11)] text-[var(--text-secondary)]'
    >
      <span className='shrink-0'>{label}</span>
      {children}
    </label>
  )
}
