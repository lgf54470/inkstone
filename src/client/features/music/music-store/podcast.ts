import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicPodcastCreateInput, MusicPodcastEpisode, MusicPodcastFeedView, MusicPodcastPatchInput } from '../../../lib/api'
import type { MusicGet, MusicSet } from './types'

// FEA-A2-1: the podcast slice mirrors the Alist slice's shape — a list of the
// user's subscriptions plus the loading flag. FEA-A2-2 adds the episode view of
// one feed at a time; the modal switches between the feed list and the episodes.
export async function loadPodcastFeeds(set: MusicSet): Promise<void> {
  set({ podcastFeedsLoading: true, podcastFeedsError: null })
  try {
    const { feeds } = await api.music.listPodcastFeeds()
    set({ podcastFeeds: feeds, podcastFeedsLoading: false })
  } catch (error) {
    // FB-U6: kept as state so the panel can name the failure (and offer the retry) instead of
    // rendering the "no subscriptions yet" copy over a listing that never arrived.
    set({ podcastFeedsLoading: false, podcastFeedsError: error instanceof Error ? error.message : 'error' })
    toastMusicError(error, 'music.action_failed')
  }
}

export async function loadPodcastEpisodes(set: MusicSet, feedId: string): Promise<void> {
  set({ podcastEpisodesFeedId: feedId, podcastEpisodesLoading: true, podcastEpisodes: [], podcastEpisodesError: null })
  try {
    const { episodes } = await api.music.listPodcastEpisodes(feedId)
    set({ podcastEpisodes: episodes, podcastEpisodesLoading: false })
  } catch (error) {
    // FB-U6: the feed stays open so the failure has somewhere to be read and retried from; backing
    // out to the feed list would hide it behind the same list the reader just left.
    set({ podcastEpisodesLoading: false, podcastEpisodesError: error instanceof Error ? error.message : 'error' })
    toastMusicError(error, 'music.action_failed')
  }
}

export function closePodcastEpisodes(set: MusicSet): void {
  set({ podcastEpisodesFeedId: null, podcastEpisodes: [], podcastEpisodesLoading: false, podcastEpisodesError: null })
}

// FEA-A2-3: the OPML round trip. The server answers { created, skipped }, so a
// re-import of an exported file reports skips instead of duplicating feeds.
export async function importPodcastOpml(set: MusicSet, opml: string): Promise<void> {
  try {
    const { created, skipped } = await api.music.importPodcastOpml(opml)
    await loadPodcastFeeds(set)
    toastMusic('music.podcast_import_done', { value0: created, value1: skipped })
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

// FEA-A2-4: playing an episode registers the idempotent external reference row,
// appends it locally (the library load has not necessarily seen it) and hands
// the ordinary player the track id — queue, crossfade and progress follow.
export async function playPodcastEpisode(
  set: MusicSet,
  get: MusicGet,
  feed: MusicPodcastFeedView,
  episode: MusicPodcastEpisode,
): Promise<void> {
  try {
    const track = await api.music.importPodcastEpisode(feed.id, {
      audioUrl: episode.audioUrl,
      title: episode.title,
      durationMs: episode.durationSeconds > 0 ? episode.durationSeconds * 1000 : undefined,
    })
    set((state) => (state.tracks.some((entry) => entry.id === track.id) ? {} : { tracks: [...state.tracks, track] }))
    await get().playTrack(track.id)
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function createPodcastFeed(set: MusicSet, input: MusicPodcastCreateInput): Promise<boolean> {
  try {
    const created = await api.music.createPodcastFeed(input)
    set((state) => ({ podcastFeeds: [...state.podcastFeeds, created] }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
    return false
  }
}

export async function renamePodcastFeed(set: MusicSet, id: string, patch: MusicPodcastPatchInput): Promise<void> {
  try {
    const updated = await api.music.patchPodcastFeed(id, patch)
    set((state) => ({ podcastFeeds: state.podcastFeeds.map((feed) => (feed.id === id ? updated : feed)) }))
    toastMusic('music.saved')
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
  }
}

export async function deletePodcastFeed(set: MusicSet, id: string): Promise<void> {
  try {
    await api.music.deletePodcastFeed(id)
    set((state) => ({ podcastFeeds: state.podcastFeeds.filter((feed) => feed.id !== id) }))
    toastMusic('music.deleted')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}
