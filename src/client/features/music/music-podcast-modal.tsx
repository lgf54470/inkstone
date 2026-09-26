import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, PencilLine, Podcast, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { Modal, confirm } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { formatBytes } from '../../lib/time'
import { useMusic } from './music-store'
import type { MusicPodcastFeedView } from '../../lib/api'

const PODCAST_WIDTH = 560

// FEA-A2-1: the podcast panel. This entry ships the subscription manager
// (add/rename/unsubscribe keyed by the RSS URL); A2-2 turns a row into the
// episode list of that feed; playback lands with A2-4.
export function MusicPodcastModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const feeds = useMusic((state) => state.podcastFeeds)
  const loading = useMusic((state) => state.podcastFeedsLoading)
  const episodesFeedId = useMusic((state) => state.podcastEpisodesFeedId)
  const loadPodcastFeeds = useMusic((state) => state.loadPodcastFeeds)

  useEffect(() => {
    if (open) void loadPodcastFeeds()
  }, [open, loadPodcastFeeds])

  const selectedFeed = feeds.find((feed) => feed.id === episodesFeedId) ?? null
  return (
    <Modal open={open} onClose={onClose} width={PODCAST_WIDTH} title={t('music.podcast_title')}>
      <div className='space-y-3'>
        {selectedFeed
          ? <EpisodeList feed={selectedFeed} />
          : (
              <>
                {loading && feeds.length === 0
                  ? <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
                  : feeds.length === 0
                    ? <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.podcast_no_feeds')}</p>
                    : (
                        <ul className='space-y-1'>
                          {feeds.map((feed) => <FeedRow key={feed.id} feed={feed} />)}
                        </ul>
                      )}
                <AddFeedForm />
              </>
            )}
      </div>
    </Modal>
  )
}

// FEA-A2-2: one feed's episodes, fetched through the worker's cached proxy. A
// row carries the episode title, the playback length and the release date; the
// audio itself stays at the source until A2-4 wires the player up.
function EpisodeList({ feed }: { feed: MusicPodcastFeedView }) {
  const episodes = useMusic((state) => state.podcastEpisodes)
  const loading = useMusic((state) => state.podcastEpisodesLoading)
  const loadPodcastEpisodes = useMusic((state) => state.loadPodcastEpisodes)
  const closePodcastEpisodes = useMusic((state) => state.closePodcastEpisodes)
  useEffect(() => {
    void loadPodcastEpisodes(feed.id)
  }, [feed.id, loadPodcastEpisodes])

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <Button size='sm' icon={<ArrowLeft size={12} />} onClick={closePodcastEpisodes}>
          {t('music.podcast_back')}
        </Button>
        <span className='min-w-0 truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{feed.title}</span>
      </div>
      {loading
        ? <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
        : episodes.length === 0
          ? <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.podcast_episodes_empty')}</p>
          : (
              <ul className='max-h-80 space-y-0.5 overflow-y-auto'>
                {episodes.map((episode) => (
                  <li key={episode.audioUrl} className='flex items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 hover:bg-[var(--bg-hover)]'>
                    <Podcast size={13} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]' title={episode.title}>{episode.title}</span>
                      <span className='block truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{episode.description}</span>
                    </span>
                    <span className='shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
                      {episode.durationSeconds > 0 ? formatDuration(episode.durationSeconds) : ''}
                      {episode.sizeBytes > 0 ? ` · ${formatBytes(episode.sizeBytes)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}

function FeedRow({ feed }: { feed: MusicPodcastFeedView }) {
  const deletePodcastFeed = useMusic((state) => state.deletePodcastFeed)
  const renamePodcastFeed = useMusic((state) => state.renamePodcastFeed)
  const loadPodcastEpisodes = useMusic((state) => state.loadPodcastEpisodes)
  const [draft, setDraft] = useState<string | null>(null)

  const unsubscribe = (): void => {
    void confirm({
      title: t('music.podcast_unsubscribe'),
      description: t('music.podcast_unsubscribe_confirm', { value0: feed.title }),
      confirmLabel: t('music.podcast_unsubscribe'),
      tone: 'danger',
    }).then((ok) => {
      if (ok) void deletePodcastFeed(feed.id)
    })
  }

  return (
    <li className='flex h-10 items-center gap-2 rounded-[var(--r-md)] px-2 hover:bg-[var(--bg-hover)]'>
      <Podcast size={14} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />
      {draft === null
        ? (
            <button type='button' className='min-w-0 flex-1 text-left' onClick={() => void loadPodcastEpisodes(feed.id)}>
              <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{feed.title}</span>
              <span className='block truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{feed.url}</span>
            </button>
          )
        : (
            <Input
              autoFocus
              value={draft}
              aria-label={t('music.rename')}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                const next = draft.trim()
                setDraft(null)
                if (next && next !== feed.title) void renamePodcastFeed(feed.id, { title: next })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setDraft(null)
              }}
              className='h-7 min-w-0 flex-1 border-[var(--accent)] bg-[var(--bg-surface)] px-1 text-[length:var(--text-12)]'
            />
          )}
      <IconButton label={`${t('music.rename')}: ${feed.title}`} size='sm' onClick={() => setDraft(feed.title)}>
        <PencilLine size={13} />
      </IconButton>
      <IconButton label={`${t('music.podcast_unsubscribe')}: ${feed.title}`} size='sm' onClick={unsubscribe}>
        <Trash2 size={13} />
      </IconButton>
    </li>
  )
}

function AddFeedForm() {
  const [creating, setCreating] = useState(false)
  const url = useRef<HTMLInputElement>(null)
  const title = useRef<HTMLInputElement>(null)

  const add = async (): Promise<void> => {
    const feedUrl = url.current?.value.trim() ?? ''
    if (!feedUrl) return
    setCreating(true)
    const ok = await useMusic.getState().createPodcastFeed({
      url: feedUrl,
      title: title.current?.value.trim() || undefined,
    })
    setCreating(false)
    if (ok) {
      for (const field of [url, title]) {
        if (field.current) field.current.value = ''
      }
    }
  }

  return (
    <form
      className='space-y-2 border-t border-[var(--border-subtle)] pt-3'
      onSubmit={(event) => {
        event.preventDefault()
        void add()
      }}
    >
      <p className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>{t('music.podcast_add')}</p>
      <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.podcast_hint')}</p>
      <div className='grid grid-cols-2 gap-2'>
        <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.podcast_url')}</span>
          <Input ref={url} type='url' className='h-8 min-w-0 flex-1' aria-label={t('music.podcast_url')} />
        </label>
        <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.podcast_name')}</span>
          <Input ref={title} className='h-8 min-w-0 flex-1' aria-label={t('music.podcast_name')} />
        </label>
      </div>
      <div className='flex items-center justify-end'>
        <Button size='sm' variant='primary' icon={<Plus size={12} />} loading={creating} onClick={() => void add()}>
          {t('music.podcast_add')}
        </Button>
      </div>
    </form>
  )
}
