import { useEffect, useRef, useState } from 'react'
import type { MusicTag, MusicTrack } from '@shared/types'
import { Button } from '../../components/primitives'
import { Field, Input, Textarea } from '../../components/form'
import { Modal } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { tagColorValue } from './music-utils'

const EDIT_WIDTH = 520

interface TrackDraft {
  title: string
  artist: string
  album: string
  lyric: string
}

export function MusicEditTrackModal({
  track,
  open,
  onClose,
}: {
  track: MusicTrack | null
  open: boolean
  onClose: () => void
}) {
  const patchTrack = useMusic((state) => state.patchTrack)
  const { form, setForm, tagIds, setTagIds, lyricPending } = useTrackDraft(track)

  if (!track) return null
  const save = (): void => {
    void patchTrack(track.id, {
      title: form.title.trim() || track.title,
      artist: form.artist.trim(),
      album: form.album.trim(),
      lyric: form.lyric.trim() ? form.lyric : null,
      tagIds,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={EDIT_WIDTH}
      title={t('music.edit_track')}
      footer={
        <>
          <Button size='sm' onClick={onClose}>{t('common.cancel')}</Button>
          <Button size='sm' variant='primary' disabled={lyricPending} onClick={save}>{t('music.save')}</Button>
        </>
      }
    >
      <TrackForm form={form} onChange={setForm} tagIds={tagIds} onTagsChange={setTagIds} />
    </Modal>
  )
}

function useTrackDraft(track: MusicTrack | null) {
  const ensureTrackLyric = useMusic((state) => state.ensureTrackLyric)
  const [form, setForm] = useState<TrackDraft>(() => draftFrom(track))
  const [tagIds, setTagIds] = useState<string[]>(() => track?.tagIds ?? [])
  const formTrackId = useRef<string | null>(null)

  useEffect(() => {
    if (track?.hasLyric && track.lyric === null) void ensureTrackLyric(track.id)
  }, [track, ensureTrackLyric])

  useEffect(() => {
    setTagIds(track?.tagIds ?? [])
    const nextId = track?.id ?? null
    if (formTrackId.current !== nextId) {
      formTrackId.current = nextId
      setForm(draftFrom(track))
      return
    }
    // The lazy lyric fetch must backfill the draft without discarding edits in flight.
    setForm((current) => (current.lyric ? current : { ...current, lyric: draftFrom(track).lyric }))
  }, [track])

  // The lyric text may still be on its way; saving an empty draft would blank it server-side.
  return { form, setForm, tagIds, setTagIds, lyricPending: Boolean(track && track.hasLyric && track.lyric === null) }
}

function TrackForm({
  form,
  onChange,
  tagIds,
  onTagsChange,
}: {
  form: TrackDraft
  onChange: (draft: TrackDraft) => void
  tagIds: string[]
  onTagsChange: (ids: string[]) => void
}) {
  const tags = useMusic((state) => state.tags)
  return (
    <div className='space-y-3'>
      <Field label={t('music.field_title')} required>
        <Input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} />
      </Field>
      <div className='grid grid-cols-2 gap-3'>
        <Field label={t('music.field_artist')}>
          <Input value={form.artist} onChange={(event) => onChange({ ...form, artist: event.target.value })} />
        </Field>
        <Field label={t('music.field_album')}>
          <Input value={form.album} onChange={(event) => onChange({ ...form, album: event.target.value })} />
        </Field>
      </div>
      <Field label={t('music.track_tags')}>
        <TagPicker tags={tags} selected={tagIds} onChange={onTagsChange} />
      </Field>
      <Field label={t('music.field_lyric')}>
        <Textarea
          rows={8}
          value={form.lyric}
          onChange={(event) => onChange({ ...form, lyric: event.target.value })}
          className='font-[family-name:var(--font-mono)] text-[length:var(--text-11)]'
        />
      </Field>
    </div>
  )
}

function draftFrom(track: MusicTrack | null): TrackDraft {
  return {
    title: track?.title ?? '',
    artist: track?.artist ?? '',
    album: track?.album ?? '',
    lyric: track?.lyric ?? '',
  }
}

function TagPicker({
  tags,
  selected,
  onChange,
}: {
  tags: MusicTag[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  if (!tags.length) {
    return <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.no_tags')}</p>
  }
  return (
    <div className='flex flex-wrap gap-1.5'>
      {tags.map((tag) => {
        const active = selected.includes(tag.id)
        return (
          <button
            key={tag.id}
            type='button'
            aria-pressed={active}
            onClick={() => onChange(active ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}
            className={cn(
              'inline-flex items-center gap-1 rounded-[var(--r-full)] border px-2 py-1 text-[length:var(--text-11)] transition-colors',
              active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            <span className='size-2 rounded-full' style={{ background: tagColorValue(tag.color) }} aria-hidden='true' />
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
