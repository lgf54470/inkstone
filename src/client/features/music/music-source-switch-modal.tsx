import { Music } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { formatTimecode } from '../../lib/time'
import { useMusic } from './music-store'
import { providerSourceLabel } from './providers'
import { musicProviderCoverUrl, type MusicProviderTrack } from '../../lib/api'

const SWITCH_WIDTH = 560

// FB-F8: the manual half of the source swap. The automatic repair (which is now a preference)
// silently re-serves a dead link; this panel asks the same catalogues and lets the reader choose,
// including when they turned the automatic path off.
//
// Three states, all of them spoken: loading, failed (with a retry) and the ranked list — plus the
// honest empty case where the catalogues have nothing under this name.
export function MusicSourceSwitchModal() {
  const trackId = useMusic((state) => state.sourceSwitchTrackId)
  const track = useMusic((state) => (state.sourceSwitchTrackId ? state.tracks.find((entry) => entry.id === state.sourceSwitchTrackId) ?? null : null))
  const candidates = useMusic((state) => state.sourceSwitchCandidates)
  const loading = useMusic((state) => state.sourceSwitchLoading)
  const failed = useMusic((state) => state.sourceSwitchFailed)
  const close = useMusic((state) => state.closeSourceSwitch)
  const openSourceSwitch = useMusic((state) => state.openSourceSwitch)
  const switchTrackSource = useMusic((state) => state.switchTrackSource)

  if (!trackId || !track) return null
  return (
    <Modal
      open
      onClose={close}
      title={t('music.source_switch_title')}
      description={t('music.source_switch_desc', { value0: track.title })}
      width={SWITCH_WIDTH}
    >
      <SourceSwitchBody
        candidates={candidates}
        loading={loading}
        failed={failed}
        onRetry={() => void openSourceSwitch(trackId)}
        onUse={(hit) => void switchTrackSource(hit)}
      />
    </Modal>
  )
}

function SourceSwitchBody({ candidates, loading, failed, onRetry, onUse }: {
  candidates: MusicProviderTrack[] | null
  loading: boolean
  failed: boolean
  onRetry: () => void
  onUse: (hit: MusicProviderTrack) => void
}) {
  if (loading) return <Notice text={t('common.loading')} />
  if (failed) {
    return (
      <div role='status' className='flex flex-col items-center gap-[var(--sp-2)] py-[var(--sp-3)]'>
        <span className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('music.source_switch_failed')}</span>
        <Button size='sm' onClick={onRetry}>{t('music.retry')}</Button>
      </div>
    )
  }
  if (!candidates?.length) return <Notice text={t('music.source_switch_none')} />
  return (
    <ul className='max-h-[min(60vh,360px)] space-y-0.5 overflow-y-auto'>
      {candidates.map((hit) => (
        <SourceCandidateRow key={`${hit.source}:${hit.sourceId}`} hit={hit} onUse={() => onUse(hit)} />
      ))}
    </ul>
  )
}

function Notice({ text }: { text: string }) {
  return <p role='status' className='py-[var(--sp-3)] text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{text}</p>
}

// The candidate is named the way the search rows name a hit — catalogue, song, artist and album —
// so the reader can tell two copies of the same song apart before choosing one.
function SourceCandidateRow({ hit, onUse }: { hit: MusicProviderTrack; onUse: () => void }) {
  const subtitle = [hit.artist, hit.album].filter(Boolean).join(' · ')
  return (
    <li className='flex min-h-[var(--touch-h)] items-center gap-[var(--sp-2)] rounded-[var(--r-md)] px-[var(--sp-1)] hover:bg-[var(--bg-hover)]'>
      <SourceCandidateArtwork hit={hit} />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{hit.title}</span>
        {subtitle && <span className='block truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{subtitle}</span>}
      </span>
      <span className='shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{providerSourceLabel(hit.source)}</span>
      <span className='tabular shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {hit.durationMs ? formatTimecode(hit.durationMs) : t('music.duration_unknown')}
      </span>
      <Button size='sm' onClick={onUse}>{t('music.source_switch_use')}</Button>
    </li>
  )
}

function SourceCandidateArtwork({ hit }: { hit: MusicProviderTrack }) {
  if (!hit.coverId) {
    return (
      <span aria-hidden='true' className='grid size-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--bg-inset)] text-[var(--text-quaternary)]'>
        <Music size={14} />
      </span>
    )
  }
  return (
    <img
      src={musicProviderCoverUrl(hit.source, hit.coverId)}
      alt=''
      loading='lazy'
      decoding='async'
      className='size-8 shrink-0 rounded-[var(--r-sm)] object-cover'
    />
  )
}
