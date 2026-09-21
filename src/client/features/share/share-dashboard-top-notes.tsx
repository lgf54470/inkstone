import { BarChart3, ChevronRight } from 'lucide-react'
import type { ShareGlobalAnalytics } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { CardHeader, EmptyRow } from './share-dashboard-card-shell'

/** The notes the range's traffic landed on, with a way into each note's own analytics. */
export function TopNotesCard({ analytics, onSelectNoteAnalytics }: {
  analytics: ShareGlobalAnalytics | null
  onSelectNoteAnalytics?: (noteId: string) => void
}) {
  const topNotes = analytics?.topNotes ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<BarChart3 size={15} className='text-[var(--accent)]' />} title={t('share.top_notes_title')} badge={t('share.top_notes_badge')} />
      <div className='divide-y divide-[var(--border-subtle)] pt-1'>
        {topNotes.length === 0 ? (
          <EmptyRow label={t('share.no_data_yet')} />
        ) : (
          topNotes.map((note, index) => (
            <TopNoteRow key={note.noteId} note={note} index={index} maxVal={topNotes[0]?.views || 1} onSelect={onSelectNoteAnalytics} />
          ))
        )}
      </div>
    </div>
  )
}

function TopNoteRow({ note, index, maxVal, onSelect }: {
  note: ShareGlobalAnalytics['topNotes'][number]
  index: number
  maxVal: number
  onSelect?: (noteId: string) => void
}) {
  const pct = Math.round((note.views / maxVal) * 100)
  return (
    <div
      className='-mx-2 flex items-center gap-3 rounded-[var(--r-md)] px-2 py-2.5 transition-colors hover:bg-[var(--bg-hover)]'
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[length:var(--text-10)] font-bold ${
          index < 3
            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
            : 'bg-[var(--bg-base)] text-[var(--text-tertiary)]'
        }`}
      >
        {index + 1}
      </span>

      <div className='min-w-0 flex-1'>
        <div className='flex items-center justify-between text-[length:var(--text-12)]'>
          <span className='truncate font-medium text-[var(--text-primary)]'>
            {note.noteTitle || t('common.untitled_note')}
          </span>
          <span className='ml-2 font-mono font-semibold text-[var(--text-primary)]'>
            {note.views} <span className='text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]'>{t('share.unit_pv')}</span>
          </span>
        </div>
        <div className='mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-base)]'>
          <div
            className='h-full rounded-full bg-[var(--accent)] transition-all'
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {onSelect && (
        <IconButton size='sm' label={t('share.view_note_analytics')} onClick={() => onSelect(note.noteId)}>
          <ChevronRight size={14} />
        </IconButton>
      )}
    </div>
  )
}
