import { useMemo } from 'react'
import { Modal } from '../../components/overlay'
import { formatNumber, formatTotalDuration } from '../../lib/time'
import { localeTag, t } from '../../lib/i18n'
import { buildInsights, hasListening, type MusicInsightBucket } from './music-insights'
import { useMusic } from './music-store'

const INSIGHTS_WIDTH = 640

// The panel answers "what is actually in here, and what do I actually listen to" from data the
// library already carries — no request, no new table. It reads the last-play stamp and the lifetime
// play count, which is what the store has; the weekly section says so in words rather than implying
// a per-play log that does not exist.
export function MusicInsightsModal() {
  const open = useMusic((state) => state.insightsOpen)
  const close = useMusic((state) => state.closeInsights)
  if (!open) return null
  return (
    <Modal
      open
      onClose={close}
      title={t('music.insights_title')}
      description={t('music.insights_desc')}
      width={INSIGHTS_WIDTH}
    >
      <InsightsBody />
    </Modal>
  )
}

// Mounted only while the panel is open, so the whole-library walk happens when someone asked for it
// rather than on every library change behind a closed dialog.
function InsightsBody() {
  const tracks = useMusic((state) => state.tracks)
  const tags = useMusic((state) => state.tags)
  const insights = useMemo(() => buildInsights(tracks, tags), [tracks, tags])
  const totals = insights.totals
  return (
    <div className='space-y-4'>
      <dl className='grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3'>
        <Stat label={t('music.insights_stat_tracks')} value={formatNumber(totals.tracks)} />
        <Stat label={t('music.insights_stat_played')} value={formatNumber(totals.played)} />
        <Stat label={t('music.insights_stat_never_played')} value={formatNumber(totals.neverPlayed)} />
        <Stat label={t('music.insights_stat_plays')} value={formatNumber(totals.plays)} />
        <Stat label={t('music.insights_stat_listened')} value={formatTotalDuration(totals.listenedMs)} />
        <Stat label={t('music.insights_stat_library')} value={formatTotalDuration(totals.libraryMs)} />
      </dl>
      {hasListening(insights) ? (
        <>
          <Ranking title={t('music.insights_by_week')} rows={insights.weeks.map(withWeekLabel)} showTracks note={t('music.insights_week_note')} />
          <Ranking title={t('music.insights_by_artist')} rows={insights.artists} showTracks />
          <Ranking title={t('music.insights_by_tag')} rows={insights.tags} showTracks />
          <Ranking title={t('music.insights_top_tracks')} rows={insights.tracks} />
        </>
      ) : (
        <p role='status' className='py-3 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
          {t('music.insights_empty')}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{label}</dt>
      <dd className='tabular text-[length:var(--text-13)] text-[var(--text-primary)]'>{value}</dd>
    </div>
  )
}

// A weekly bucket is named by the Monday it starts on, in the reader's locale: the bucket edge is a
// calendar fact, and printing the raw timestamp would make them translate it in their head.
function withWeekLabel(bucket: MusicInsightBucket): MusicInsightBucket {
  if (bucket.at === undefined) return bucket
  const label = new Intl.DateTimeFormat(localeTag(), { year: 'numeric', month: 'short', day: 'numeric' }).format(bucket.at)
  return { ...bucket, label }
}

function Ranking({ title, rows, note, showTracks = false }: {
  title: string
  rows: MusicInsightBucket[]
  note?: string
  showTracks?: boolean
}) {
  if (!rows.length) return null
  return (
    <section>
      <h3 className='pb-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)]'>{title}</h3>
      {note && <p className='pb-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{note}</p>}
      <ul className='divide-y divide-[var(--border-subtle)]'>
        {rows.map((row) => (
          <li key={row.key} className='flex min-h-9 items-center gap-3 py-1'>
            <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{row.label}</span>
            {showTracks && (
              <span className='tabular shrink-0 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
                {t('music.insights_tracks_value', { value0: formatNumber(row.trackCount) })}
              </span>
            )}
            <span className='tabular w-20 shrink-0 text-right text-[length:var(--text-11)] text-[var(--text-secondary)]'>
              {t('music.insights_plays_value', { value0: formatNumber(row.playCount) })}
            </span>
            <span className='tabular w-24 shrink-0 text-right text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
              {formatTotalDuration(row.listenedMs)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
