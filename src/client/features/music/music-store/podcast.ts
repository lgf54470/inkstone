import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicPodcastCreateInput, MusicPodcastPatchInput } from '../../../lib/api'
import type { MusicSet } from './types'

// FEA-A2-1: the podcast slice mirrors the Alist slice's shape — a list of the
// user's subscriptions plus the loading flag. FEA-A2-2 adds the episode view of
// one feed at a time; the modal switches between the feed list and the episodes.
export async function loadPodcastFeeds(set: MusicSet): Promise<void> {
  set({ podcastFeedsLoading: true })
  try {
    const { feeds } = await api.music.listPodcastFeeds()
    set({ podcastFeeds: feeds, podcastFeedsLoading: false })
  } catch (error) {
    set({ podcastFeedsLoading: false })
    toastMusicError(error, 'music.action_failed')
  }
}

export async function loadPodcastEpisodes(set: MusicSet, feedId: string): Promise<void> {
  set({ podcastEpisodesFeedId: feedId, podcastEpisodesLoading: true, podcastEpisodes: [] })
  try {
    const { episodes } = await api.music.listPodcastEpisodes(feedId)
    set({ podcastEpisodes: episodes, podcastEpisodesLoading: false })
  } catch (error) {
    set((state) => ({ podcastEpisodesFeedId: state.podcastEpisodesFeedId === feedId ? null : state.podcastEpisodesFeedId, podcastEpisodesLoading: false }))
    toastMusicError(error, 'music.action_failed')
  }
}

export function closePodcastEpisodes(set: MusicSet): void {
  set({ podcastEpisodesFeedId: null, podcastEpisodes: [], podcastEpisodesLoading: false })
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
