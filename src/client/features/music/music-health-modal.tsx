import { AlertTriangle, CloudOff, RefreshCw, Shuffle, Trash2 } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { deadReferenceIds, useMusic } from './music-store'
import { providerSourceLabel } from './providers'
import type { MusicReferenceHealthResult, MusicTrack } from '@shared/types'

const HEALTH_WIDTH = 620

// FB-F9: the panel the scan opens. It lists what the scan found — never the healthy rows, which are
// the majority and would drown the answer — and offers the two things worth doing with a dead one:
// re-point it at another catalogue, or clear it out. A row that was merely unreachable is named as
// such rather than presented as broken, because a later scan may well find it healthy.
export function MusicHealthModal() {
  const open = useMusic((state) => state.healthOpen)
  const scanning = useMusic((state) => state.healthScanning)
  const failed = useMusic((state) => state.healthFailed)
  const results = useMusic((state) => state.healthResults)
  const tracks = useMusic((state) => state.tracks)
  const close = useMusic((state) => state.closeHealthScan)
  const scan = useMusic((state) => state.scanReferences)
  const repair = useMusic((state) => state.repairDeadReference)
  const trash = useMusic((state) => state.trashDeadReferences)
  const openHealth = useMusic((state) => state.openHealthScan)

  if (!open) return null
  const dead = deadReferenceIds(results)
  return (
    <Modal
      open
      onClose={close}
      title={t('music.health_title')}
      description={t('music.health_desc')}
      width={HEALTH_WIDTH}
      footer={(
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button size='sm' variant='ghost' icon={<RefreshCw size={13} />} loading={scanning} onClick={() => void scan()}>
            {t('music.health_rescan')}
          </Button>
          <Button size='sm' variant='ghost' disabled={!dead.length} onClick={() => void trash(dead)}>
            {t('music.health_trash_all', { value0: dead.length })}
          </Button>
        </div>
      )}
    >
      <HealthBody
        results={results}
        scanning={scanning}
        failed={failed}
        tracks={tracks}
        onRepair={(id) => void repair(id)}
        onTrash={(id) => void trash([id])}
        onRetry={() => void openHealth()}
      />
    </Modal>
  )
}

function unreachableIds(results: MusicReferenceHealthResult[] | null): string[] {
  return (results ?? []).filter((result) => result.status === 'unreachable').map((result) => result.id)
}

function HealthBody({ results, scanning, failed, tracks, onRepair, onTrash, onRetry }: {
  results: MusicReferenceHealthResult[] | null
  scanning: boolean
  failed: boolean
  tracks: MusicTrack[]
  onRepair: (id: string) => void
  onTrash: (id: string) => void
  onRetry: () => void
}) {
  if (scanning) return <Notice text={t('common.loading')} />
  if (failed && !results) {
    return (
      <div role='status' className='flex flex-col items-center gap-2 py-3'>
        <span className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('music.health_failed')}</span>
        <Button size='sm' onClick={onRetry}>{t('music.retry')}</Button>
      </div>
    )
  }
  const dead = deadReferenceIds(results)
  const unreachable = unreachableIds(results)
  if (!dead.length && !unreachable.length) return <Notice text={t('music.health_ok')} />
  return (
    <div className='space-y-2'>
      {dead.length > 0 && <HealthGroup title={t('music.health_dead', { value0: dead.length })} ids={dead} tracks={tracks} onRepair={onRepair} onTrash={onTrash} dead />}
      {unreachable.length > 0 && <HealthGroup title={t('music.health_unreachable', { value0: unreachable.length })} ids={unreachable} tracks={tracks} onRepair={onRepair} onTrash={onTrash} />}
    </div>
  )
}

function HealthGroup({ title, ids, tracks, dead, onRepair, onTrash }: {
  title: string
  ids: string[]
  tracks: MusicTrack[]
  dead?: boolean
  onRepair: (id: string) => void
  onTrash: (id: string) => void
}) {
  return (
    <section>
      <h3 className='flex items-center gap-1.5 pb-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)]'>
        <AlertTriangle size={12} />{title}
      </h3>
      <ul className='space-y-0.5'>
        {ids.map((id) => {
          const track = tracks.find((entry) => entry.id === id)
          if (!track) return null
          return (
            <li key={id} className='flex min-h-11 items-center gap-2 rounded-[var(--r-md)] px-1 hover:bg-[var(--bg-hover)]'>
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{track.title}</span>
                <span className='block truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
                  {[track.artist, sourceName(track)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <IconButton label={t('music.health_repair')} size='sm' disabled={track.source !== 'provider'} onClick={() => onRepair(id)}>
                <Shuffle size={12} />
              </IconButton>
              <IconButton label={t('music.health_trash')} size='sm' onClick={() => onTrash(id)}>
                {dead ? <Trash2 size={12} /> : <CloudOff size={12} />}
              </IconButton>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Only an online row can be re-pointed, so a dead one names the catalogue it came from; every other
// source is named by its own kind.
function sourceName(track: MusicTrack): string {
  if (track.source === 'provider') return track.providerSource ? providerSourceLabel(track.providerSource) : t('music.source_online')
  if (track.source === 'external') return t('music.source_external')
  if (track.source === 'alist') return t('music.source_alist')
  return ''
}

function Notice({ text }: { text: string }) {
  return <p role='status' className='py-3 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{text}</p>
}
